import importlib.util
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, Mock, patch

from lxml import etree


spec = importlib.util.spec_from_file_location(
    "fetch_static_test_target", Path(__file__).with_name("fetch_static.py")
)
fetch_static = importlib.util.module_from_spec(spec)
with patch.dict(os.environ, {"STATIC_ENDPOINT": "https://example.test", "CERT_FILE": "/unused"}):
    with patch.dict(sys.modules, {"db": Mock()}):
        spec.loader.exec_module(fetch_static)


def record(address="", record_id="DE-HE-000001"):
    return etree.fromstring(f"""
      <parkingRecord xmlns="{fetch_static.NS}" id="{record_id}" version="1">
        <parkingName><values><value lang="de">Test</value></values></parkingName>
        <parkingNumberOfSpaces>20</parkingNumberOfSpaces>
        <parkingLocation><pointCoordinates><latitude>50</latitude><longitude>9</longitude></pointCoordinates></parkingLocation>
        {address}
      </parkingRecord>
    """)


class StaticAddressTest(unittest.TestCase):
    def test_address_and_state_from_example(self):
        result = fetch_static.parse_address(record("""
          <parkingSiteAddress id="DE-BY-000424-parkingSiteAddress">
            <contactDetailsStreet>An der BAB A 93</contactDetailsStreet>
            <contactDetailsPostcode>92670</contactDetailsPostcode>
            <contactDetailsCity><values><value lang="de">Windischeschenbach</value></values></contactDetailsCity>
            <country>de</country>
          </parkingSiteAddress>
        """))
        self.assertEqual(result, {
            "address_id": "DE-BY-000424-parkingSiteAddress",
            "street": "An der BAB A 93", "house_number": None,
            "postcode": "92670", "city": "Windischeschenbach", "country": "de",
            "state_code": "DE-BY", "state_name": "Bayern",
        })

    def test_house_number_range_and_leading_zero_postcode(self):
        result = fetch_static.parse_address(record("""
          <parkingSiteAddress id="DE-SN-000001-parkingSiteAddress">
            <contactDetailsHouseNumber> 2 </contactDetailsHouseNumber>
            <contactDetailsHouseNumber>4</contactDetailsHouseNumber>
            <contactDetailsPostcode>01067</contactDetailsPostcode>
          </parkingSiteAddress>
        """))
        self.assertEqual(result["house_number"], "2-4")
        self.assertEqual(result["postcode"], "01067")
        self.assertEqual(result["state_name"], "Sachsen")

    def test_missing_and_empty_address_fields(self):
        for xml in ["", "<parkingSiteAddress/>"]:
            self.assertTrue(all(value is None for value in fetch_static.parse_address(record(xml)).values()))

    def test_unknown_prefix_does_not_invent_state_or_use_parent_id(self):
        with self.assertLogs(fetch_static.log, level="WARNING"):
            result = fetch_static.parse_address(record('<parkingSiteAddress id="DE-PR-123-parkingSiteAddress"/>'))
        self.assertEqual(result["address_id"], "DE-PR-123-parkingSiteAddress")
        self.assertIsNone(result["state_code"])
        self.assertIsNone(result["state_name"])

    def test_all_sixteen_state_codes(self):
        self.assertEqual(len(fetch_static.STATE_NAMES), 16)
        for code, name in fetch_static.STATE_NAMES.items():
            result = fetch_static.parse_address(record(f'<parkingSiteAddress id="DE-{code}-001-parkingSiteAddress"/>'))
            self.assertEqual(result["state_code"], f"DE-{code}")
            self.assertEqual(result["state_name"], name)

    def test_parsing_and_upsert_keep_existing_and_new_fields(self):
        rows = fetch_static.parse_records(record("""
          <parkingSiteAddress id="DE-HE-000001-parkingSiteAddress">
            <contactDetailsStreet>Teststrasse</contactDetailsStreet>
            <contactDetailsPostcode>01234</contactDetailsPostcode>
          </parkingSiteAddress>
        """))
        self.assertEqual(rows[0]["name"], "Test")
        self.assertEqual(rows[0]["official_spaces"], 20)
        self.assertEqual(rows[0]["total_spaces"], 20)
        connection = MagicMock()
        with patch.object(fetch_static, "get_connection", return_value=connection):
            with patch("psycopg2.extras.execute_values") as execute:
                fetch_static.upsert(rows)
        sql, values = execute.call_args.args[1:]
        columns = [column.strip() for column in sql.split("(", 1)[1].split(")", 1)[0].split(",")]
        inserted = dict(zip(columns, values[0], strict=True))
        for field in fetch_static.parse_address(record()).keys():
            self.assertEqual(inserted[field], rows[0][field])
            self.assertIn(f"EXCLUDED.{field}", sql)
        self.assertEqual(inserted["location"], "SRID=4326;POINT(9.0 50.0)")
        connection.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
