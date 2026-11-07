const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')

function loadTypescript(path, imports = {}) {
  const source = readFileSync(resolve(__dirname, '../src', path), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  runInNewContext(outputText, {
    exports, URLSearchParams, Response, console,
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
      return imports[name]
    },
  })
  return exports
}

const filters = loadTypescript('lib/filter-url.ts')
const mapFilters = loadTypescript('lib/map-filters.ts')

const parkingStar = loadTypescript('lib/parking-star.ts', {
  '@turf/distance': require('@turf/distance'),
})

test('parking star uses a 100 km great-circle cutoff, including off-screen sites in all directions', () => {
  const data = { type: 'FeatureCollection', features: [
    site(10, 50.899), site(10, 50.9), site(11, 50), site(9, 50), site(10, 49.5), site(10, 52),
    site(NaN, 50), { type: 'Feature', geometry: null, properties: {} },
  ] }
  const result = parkingStar.buildParkingStar([10, 50], data)
  assert.equal(result.features.length, 4)
  for (const spike of result.features) {
    assert.deepEqual(Array.from(spike.geometry.coordinates[0]), [10, 50])
    assert.ok(spike.properties.distance_km <= 100)
  }
  assert.equal(parkingStar.buildParkingStar([10, 50], { type: 'FeatureCollection', features: [] }).features.length, 0)
})

test('parking star supports adjustable radii from 10 to 200 km', () => {
  const data = { type: 'FeatureCollection', features: [
    site(10, 50.05), site(10, 50.2), site(10, 51.5), site(10, 52),
  ] }
  assert.equal(parkingStar.buildParkingStar([10, 50], data, 10).features.length, 1)
  assert.equal(parkingStar.buildParkingStar([10, 50], data).features.length, 2)
  const expanded = parkingStar.buildParkingStar([10, 50], data, 200)
  assert.equal(expanded.features.length, 3)
  assert.ok(expanded.features.every(feature => feature.properties.distance_km <= 200))
})

test('parking star preserves live occupancy and scales width by total official plus tolerated capacity', () => {
  const features = [25, 100, 250, null, -1].map(total => ({
    ...site(10.2, 50),
    properties: { total_spaces: total, official_spaces: 10, occupancy_pct: 125, name: '<Test>' },
  }))
  const result = parkingStar.buildParkingStar([10, 50], { type: 'FeatureCollection', features })
  assert.deepEqual(Array.from(result.features, feature => feature.properties.spike_width), [1, 4, 10, 1, 1])
  assert.equal(result.features[0].properties.occupancy_pct, 125)
  assert.equal(result.features[0].properties.name, '<Test>')
})

test('Standortdetails is collapsible and renders addresses safely with missing-field labels', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const Panel = loadTypescript('components/SitePanel.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    recharts: {},
  }).default
  const render = site => renderToStaticMarkup(React.createElement(Panel, { site, onClose() {} }))
  const html = render({
    datex_id: 'test', name: 'Test',
    street: 'An der BAB A 93', house_number: '2', postcode: '01067',
    city: '<script>not executable</script>', country: 'de',
    state_code: 'DE-BY', state_name: 'Bayern',
    address_id: 'DE-BY-000424-parkingSiteAddress',
  })
  assert.match(html, /<details[^>]*><summary[^>]*>Standortdetails<\/summary>/)
  assert.match(html, /An der BAB A 93 2/)
  assert.match(html, /01067/)
  assert.match(html, /<dd[^>]*>Bayern<\/dd>/)
  assert.doesNotMatch(html, /DE-BY/)
  assert.doesNotMatch(html, /Adress-ID|DE-BY-000424-parkingSiteAddress/)
  assert.doesNotMatch(html, /<dt[^>]*>Land<\/dt>/)
  assert.match(html, /&lt;script&gt;not executable&lt;\/script&gt;/)
  assert.match(render({ datex_id: 'empty', name: 'Empty' }), /Keine Angabe/)
})

test('live, snapshot, daily and search responses include all address fields', async () => {
  const address = {
    address_id: 'DE-BY-000424-parkingSiteAddress',
    street: 'An der BAB A 93', house_number: '2', postcode: '01067',
    city: 'Windischeschenbach', country: 'de', state_code: 'DE-BY', state_name: 'Bayern',
  }
  for (const route of ['app/api/sites/route.ts', 'app/api/sites/snapshot/route.ts', 'app/api/sites/daily-max/route.ts', 'app/api/search/route.ts']) {
    const handler = loadTypescript(route, {
      'next/server': { NextResponse: Response },
      '@/lib/db': { default: {
        async query(sql) {
          for (const field of Object.keys(address)) assert.ok(sql.includes(`ps.${field}`), `${route}: ${field} not selected`)
          return { rows: [{ datex_id: 'test', name: 'Test', longitude: 9, latitude: 50, ...address }] }
        },
      } },
    }).GET
    const response = await handler({
      nextUrl: new URL('https://example.test/?q=test&date=2026-10-31&at=2026-10-31T12:00:00Z'),
    })
    assert.equal(response.status, 200)
    const data = await response.json()
    const properties = Array.isArray(data) ? data[0] : data.features[0].properties
    for (const [field, value] of Object.entries(address)) assert.equal(properties[field], value, `${route}: ${field}`)
  }
})

function site(lng, lat, road = 'A2', operator = 'Die Autobahn GmbH') {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: { road_identifier: road, operator_name: operator },
  }
}

function zoom(features, road, operator) {
  const calls = []
  mapFilters.zoomToFilteredSites({
    flyTo: options => calls.push({ method: 'flyTo', options }),
    fitBounds: (bounds, options) => calls.push({ method: 'fitBounds', bounds, options }),
  }, { type: 'FeatureCollection', features }, road, operator)
  return JSON.parse(JSON.stringify(calls))
}

test('a single filter result returns the full feature for automatic popup and details selection', () => {
  const match = site(10, 52)
  match.properties = { ...match.properties, datex_id: 'DE-HE-1', name: 'Test', city: 'Kassel', occupancy_pct: 75 }
  const map = { flyTo() {}, fitBounds() {} }
  const result = mapFilters.zoomToFilteredSites(map, {
    type: 'FeatureCollection', features: [match, site(14, 54, 'A4')],
  }, 'A2', '')
  assert.equal(result.properties, match.properties)
  assert.equal(result.geometry, match.geometry)
})

test('multiple, coincident, missing and unfiltered results do not request automatic details', () => {
  const map = { flyTo() {}, fitBounds() {} }
  for (const [features, road, operator] of [
    [[site(10, 52), site(11, 53)], 'A2', ''],
    [[site(10, 52), site(10, 52)], 'A2', ''],
    [[site(10, 52)], 'A4', ''],
    [[], 'A2', ''],
    [[site(10, 52)], '', ''],
  ]) {
    assert.equal(mapFilters.zoomToFilteredSites(map, { type: 'FeatureCollection', features }, road, operator), undefined)
  }
})

test('one matching site centers the map at exactly zoom 8', () => {
  assert.deepEqual(zoom([site(10, 52), site(14, 54, 'A4')], 'a2', ''), [
    { method: 'flyTo', options: { center: [10, 52], zoom: 8 } },
  ])
})

test('multiple matches fit the complete bounding box, excluding dimmed sites', () => {
  assert.deepEqual(zoom([
    site(6, 53), site(13, 49), site(9, 55),
    site(15, 47, 'A4'), site(5, 48, 'A2', 'Other'),
  ], ' A2 ', ' autoBAHN '), [
    { method: 'fitBounds', bounds: [[6, 49], [13, 55]], options: { padding: 60 } },
  ])
})

test('operator-only filtering is case-insensitive and uses substring matching', () => {
  assert.deepEqual(zoom([site(10, 52, 'A4'), site(11, 51, 'A2', 'Other')], '', 'AUTOBAHN'), [
    { method: 'flyTo', options: { center: [10, 52], zoom: 8 } },
  ])
})

test('no active filters, no matches and empty data leave the camera unchanged', () => {
  assert.deepEqual(zoom([site(10, 52)], '', ''), [])
  assert.deepEqual(zoom([site(10, 52)], 'A4', ''), [])
  assert.deepEqual(zoom([], 'A2', ''), [])
  assert.deepEqual(zoom([site(10, 52, null, null)], 'A2', 'Autobahn'), [])
})

test('coincident sites also use zoom 8 instead of a degenerate bounding box', () => {
  assert.deepEqual(zoom([site(10, 52), site(10, 52)], 'A2', ''), [
    { method: 'flyTo', options: { center: [10, 52], zoom: 8 } },
  ])
})

test('combined map layer filters dim precisely the complement of active sites', () => {
  const calls = []
  const map = {
    getLayer: () => true,
    setFilter: (layer, filter) => calls.push([layer, filter]),
    setLayoutProperty: () => {},
  }
  mapFilters.applyFilters(map, 'a2', 'AUTOBAHN')
  const dim = calls.find(([layer]) => layer === 'parking-circles-dim')[1]
  const main = calls.find(([layer]) => layer === 'parking-circles')[1]
  assert.equal(main[0], 'all')
  assert.equal(main[1][2], 'A2')
  assert.equal(main[2][1][1], 'autobahn')
  assert.equal(dim[0], '!')
  assert.equal(dim[1], main)
  mapFilters.applyFilters(map, '', '')
  assert.equal(calls.at(-1)[1], null)
})

test('reads and normalizes combined, encoded and empty URL filters', () => {
  const result = filters.readUrlFilters(new URLSearchParams('operator=Die+Autobahn+GmbH&road=+a+2+'))
  assert.equal(result.operator, 'Die Autobahn GmbH')
  assert.equal(result.road, 'A2')
  const empty = filters.readUrlFilters(new URLSearchParams('operator=%20&road='))
  assert.equal(empty.operator, '')
  assert.equal(empty.road, '')
})

test('switching filters removes the previous parameter and preserves unrelated query and fragment', () => {
  const url = new URL('https://example.test/?operator=Autobahn&other=keep#map')
  filters.updateFilterUrl(url, 'road', 'A2')
  assert.equal(url.searchParams.has('operator'), false)
  assert.equal(url.searchParams.get('road'), 'A2')
  filters.updateFilterUrl(url, 'operator', '')
  assert.equal(url.searchParams.has('operator'), false)
  assert.equal(url.searchParams.get('road'), 'A2')
  assert.equal(url.searchParams.get('other'), 'keep')
  assert.equal(url.hash, '#map')
  filters.updateFilterUrl(url, 'operator', 'Müller & Söhne')
  assert.equal(new URL(url.href).searchParams.get('operator'), 'Müller & Söhne')
  assert.equal(url.searchParams.has('road'), false)
  filters.updateFilterUrl(url, 'road', '')
  assert.equal(url.searchParams.has('road'), false)
})

test('legacy combined links activate only the operator, while road-only and empty links still work', () => {
  for (const [query, operator, road] of [
    ['operator=Autobahn&road=A2', 'Autobahn', ''],
    ['road=A2', '', 'A2'],
    ['operator=Autobahn', 'Autobahn', ''],
    ['', '', ''],
  ]) {
    const active = filters.activeMapFilter(filters.readUrlFilters(new URLSearchParams(query)))
    assert.equal(active.operator, operator)
    assert.equal(active.road, road)
  }
})

test('Bundesland links are exclusive, decoded, and take priority over other filters', () => {
  const parsed = filters.readUrlFilters(new URLSearchParams('state=Th%C3%BCringen&road=A2&operator=Autobahn'))
  assert.equal(parsed.state, 'Thüringen')
  const active = filters.activeMapFilter(parsed)
  assert.equal(active.state, 'Thüringen')
  assert.equal(active.road, '')
  assert.equal(active.operator, '')
  const url = new URL('https://example.test/?operator=Autobahn&road=A2&other=keep#map')
  filters.updateFilterUrl(url, 'state', 'Hessen')
  assert.equal(url.searchParams.get('state'), 'Hessen')
  assert.equal(url.searchParams.has('operator'), false)
  assert.equal(url.searchParams.has('road'), false)
  filters.updateFilterUrl(url, 'road', 'A5')
  assert.equal(url.searchParams.has('state'), false)
  filters.updateFilterUrl(url, 'state', 'Bayern')
  filters.updateFilterUrl(url, 'operator', 'Autobahn')
  assert.equal(url.searchParams.has('state'), false)
  assert.equal(url.searchParams.get('other'), 'keep')
  assert.equal(url.hash, '#map')
})

test('Bundesland matching and camera use exact state names, excluding unknown states', () => {
  const calls = []
  const map = {
    getLayer: () => true,
    setFilter: (layer, value) => calls.push([layer, value]),
    setLayoutProperty() {},
    flyTo() {},
    fitBounds() {},
  }
  mapFilters.applyFilters(map, '', '', ' HESSEN ')
  const expression = calls.find(([layer]) => layer === 'parking-circles')[1]
  assert.equal(expression[0], '==')
  assert.equal(expression[1][1][1][1], 'state_name')
  assert.equal(expression[2], 'hessen')
  const hessen = site(9, 50)
  hessen.properties.state_name = 'Hessen'
  const lowerSaxony = site(10, 52)
  lowerSaxony.properties.state_name = 'Niedersachsen'
  const data = { type: 'FeatureCollection', features: [hessen, lowerSaxony, site(11, 51)] }
  assert.equal(mapFilters.zoomToFilteredSites(map, data, '', '', 'hessen').properties, hessen.properties)
  assert.equal(mapFilters.zoomToFilteredSites(map, data, '', '', 'Hess'), undefined)
})

test('Bundesland filter opens are recorded in daily counters', async () => {
  const calls = []
  const post = counter(async (...args) => calls.push(args))
  assert.equal((await post(request({ state: ' Hessen ' }))).status, 204)
  assert.equal(JSON.stringify(calls[0][1]), JSON.stringify([['state'], ['Hessen']]))
})

test('Bundesland list is loaded from stored state names and sorted for the tool', async () => {
  const handler = loadTypescript('app/api/states/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/db': { default: {
      async query(sql) {
        assert.match(sql, /state_name IS NOT NULL/)
        return { rows: [{ state: 'Niedersachsen' }, { state: 'Hessen' }, { state: 'Bayern' }] }
      },
    } },
  }).GET
  const response = await handler()
  assert.deepEqual(await response.json(), ['Bayern', 'Hessen', 'Niedersachsen'])
})

function counter(query) {
  return loadTypescript('app/api/filter-visits/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/db': { default: { query } },
    '@/lib/filter-url': filters,
  }).POST
}

const request = body => new Request('https://example.test/api/filter-visits', {
  method: 'POST',
  body: JSON.stringify(body),
})

test('counts each supplied parameter once with a single atomic upsert', async () => {
  const calls = []
  const post = counter(async (...args) => calls.push(args))
  assert.equal((await post(request({ operator: ' Autobahn ', road: 'a 2' }))).status, 204)
  assert.equal(calls.length, 1)
  assert.match(calls[0][0], /ON CONFLICT/)
  assert.equal(JSON.stringify(calls[0][1]), JSON.stringify([['operator', 'road'], ['autobahn', 'A2']]))
})

test('operator-only and road-only links each produce one counter entry', async () => {
  const calls = []
  const post = counter(async (...args) => calls.push(args))
  await post(request({ operator: 'Autobahn' }))
  await post(request({ road: 'A2' }))
  assert.equal(JSON.stringify(calls.map(call => call[1])), JSON.stringify([
    [['operator'], ['autobahn']], [['road'], ['A2']],
  ]))
})

test('rejects invalid and empty payloads without writing to the database', async () => {
  let queries = 0
  const post = counter(async () => { queries++ })
  for (const body of [null, [], {}, { operator: 1 }, { road: null }, { road: ' ' }, { operator: 'x'.repeat(201) }, { operator: '\0' }]) {
    assert.equal((await post(request(body))).status, 400)
  }
  assert.equal((await post(new Request('https://example.test', { method: 'POST', body: '{' }))).status, 400)
  assert.equal(queries, 0)
})

test('database failures are logged and return an error rather than a successful count', async context => {
  const log = context.mock.method(console, 'error', () => {})
  const post = counter(async () => { throw new Error('Database unavailable (test)') })
  assert.equal((await post(request({ road: 'A2' }))).status, 500)
  assert.equal(log.mock.callCount(), 1)
})

test('migration and repeated upserts persist exact daily totals', {
  skip: process.env.FILTER_VISITS_DB_TEST !== '1',
}, async () => {
  const { Client } = require('pg')
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('CREATE SCHEMA filter_visits_verification')
    await client.query('SET LOCAL search_path TO filter_visits_verification')
    const migration = readFileSync(resolve(__dirname, '../../db/migrate_add_filter_link_views.sql'), 'utf8')
    await client.query(migration)
    await client.query(migration)
    const post = counter((...args) => client.query(...args))
    for (const body of [
      { operator: 'Autobahn', road: 'a 2' },
      { operator: ' autobahn ' },
      { road: 'A2' },
    ]) {
      assert.equal((await post(request(body))).status, 204)
    }
    const { rows } = await client.query(
      'SELECT parameter_name, parameter_value, count::int, day = CURRENT_DATE AS today FROM filter_link_views ORDER BY parameter_name'
    )
    assert.deepEqual(rows, [
      { parameter_name: 'operator', parameter_value: 'autobahn', count: 2, today: true },
      { parameter_name: 'road', parameter_value: 'A2', count: 2, today: true },
    ])
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})
