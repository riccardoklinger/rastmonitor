import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, Mock, patch


class ReportVisitsTest(unittest.TestCase):
    def render_report(self, page_rows, filter_rows):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchall.side_effect = [page_rows, filter_rows]
        db = Mock()
        db.get_connection.return_value = connection
        spec = importlib.util.spec_from_file_location(
            "report_visits_test_target", Path(__file__).with_name("report_visits.py")
        )
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"db": db}):
            spec.loader.exec_module(module)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            module.report(7)
        connection.close.assert_called_once()
        self.assertEqual(cursor.execute.call_count, 2)
        self.assertEqual(cursor.execute.call_args.args[1], (7,))
        return output.getvalue()

    def test_existing_totals_and_filter_counts(self):
        output = self.render_report(
            [("2026-10-31", 12)],
            [("2026-10-31", "operator", "autobahn", 4),
             ("2026-10-31", "road", "A2", 3)],
        )
        for expected in ["Gesamt", "12", "operator", "autobahn", "A2", "je Parameter"]:
            self.assertIn(expected, output)

    def test_filter_counts_without_page_views(self):
        self.assertIn("A2", self.render_report([], [("2026-10-31", "road", "A2", 1)]))

    def test_no_filter_counts(self):
        self.assertIn("Keine Filter-Link-Aufrufe", self.render_report([("2026-10-31", 1)], []))

    def test_no_counts(self):
        self.assertIn("Keine Daten", self.render_report([], []))


if __name__ == "__main__":
    unittest.main()
