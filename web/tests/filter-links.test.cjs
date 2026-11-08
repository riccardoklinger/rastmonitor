const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')

function loadTypescript(path, imports = {}, globals = {}) {
  const source = readFileSync(resolve(__dirname, '../src', path), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  runInNewContext(outputText, {
    exports, URLSearchParams, Response, console, ...globals,
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
  '@turf/boolean-point-in-polygon': require('@turf/boolean-point-in-polygon'),
  '@turf/distance': require('@turf/distance'),
})

test('parking star fallback uses real kilometre distances and preserves capacity and occupancy', () => {
  const data = { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [10, 50.05] }, properties: { total_spaces: 100, occupancy_pct: 125 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [10, 50.5] }, properties: {} },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [10, 51.5] }, properties: {} },
  ] }
  assert.equal(parkingStar.STAR_RADIUS_KM, 100)
  assert.equal(parkingStar.buildParkingStar([10, 50], data, 10).features.length, 1)
  const normal = parkingStar.buildParkingStar([10, 50], data, 100)
  assert.equal(normal.features.length, 2)
  assert.equal(normal.features[0].properties.spike_width, 4)
  assert.equal(normal.features[0].properties.occupancy_pct, 125)
  assert.equal(parkingStar.buildParkingStar([10, 50], data, 200).features.length, 3)
})

const isochrone = { type: 'FeatureCollection', features: [{
  type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
    [[9, 49], [12, 49], [12, 52], [9, 52], [9, 49]],
    [[10.5, 50.5], [10.5, 51.5], [11.5, 51.5], [11.5, 50.5], [10.5, 50.5]],
  ] },
}] }

test('self-hosted map style uses supported basemaps with local tile and asset URLs', async () => {
  const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec')
  const route = loadTypescript('app/api/map-style/route.ts', {
    '@protomaps/basemaps': require('@protomaps/basemaps'),
    'next/server': { NextResponse: { json: (body, options) => ({ body, options }) } },
  })
  const { body, options } = await route.GET()
  assert.equal(body.version, 8)
  assert.ok(body.layers.length > 0)
  assert.equal(body.glyphs, '/fonts/{fontstack}/{range}.pbf')
  assert.equal(body.sprite, '/sprites/v4/light')
  assert.deepEqual(Array.from(body.sources.protomaps.tiles), ['/tiles/germany/{z}/{x}/{y}'])
  assert.equal(options.headers['Cache-Control'], 'public, max-age=3600')
  assert.deepEqual(validateStyleMin(body).map(error => error.message), [])
})

const routingQueue = () => loadTypescript('lib/routing-queue.ts', {}, { setTimeout, clearTimeout })
const unrestrictedRouting = {
  '@/lib/routing-usage': { recordRoutingUsage: async () => {} },
  '@/lib/routing-queue': routingQueue(),
}

test('routing readiness is uncached, fails closed, and does not dispatch or count calculations', async () => {
  const probe = fetch => loadTypescript('app/api/isochrone/route.ts', {
    '@/lib/routing-usage': { recordRoutingUsage: () => assert.fail('Readiness must not count usage') },
    '@/lib/routing-queue': { runRoutingTask: () => assert.fail('Readiness must not enter the calculation queue') },
  }, { process: { env: { ORS_URL: 'http://private-ors:8082/ors/' } }, AbortSignal, fetch })
  const request = () => new Request('http://localhost/api/isochrone')
  const healthy = probe(async (url, options) => {
    assert.equal(url, 'http://private-ors:8082/ors/v2/health')
    assert.equal(options.cache, 'no-store')
    return Response.json({ status: 'ready' })
  })
  const response = await healthy.GET(request())
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await response.json(), { available: true })
  for (const fetch of [
    async () => Response.json({ status: 'not ready' }),
    async () => new Response('', { status: 503 }),
    async () => { throw new Error('Tunnel unreachable') },
    async () => new Response('invalid JSON'),
  ]) assert.deepEqual(await (await probe(fetch).GET(request())).json(), { available: false })
  const unconfigured = loadTypescript('app/api/isochrone/route.ts', unrestrictedRouting, { process: { env: {} }, AbortSignal })
  assert.deepEqual(await (await unconfigured.GET(request())).json(), { available: false })
})

test('routing queue bounds active work and waiting requests, and recovers after completion', async () => {
  const queue = loadTypescript('lib/routing-queue.ts', {}, { setTimeout, clearTimeout })
  const pending = []
  let active = 0
  let peak = 0
  const task = () => { active++; peak = Math.max(peak, active); return new Promise(resolve => pending.push(() => { active--; resolve('done') })) }
  const calls = Array.from({ length: 6 }, () => queue.runRoutingTask(new AbortController().signal, task))
  await new Promise(setImmediate)
  assert.equal(pending.length, 2)
  await assert.rejects(queue.runRoutingTask(new AbortController().signal, task), queue.RoutingBusyError)
  for (let index = 0; index < 6; index++) {
    pending[index]()
    await calls[index]
    await new Promise(setImmediate)
  }
  assert.equal(peak, 2)
  assert.equal(await queue.runRoutingTask(new AbortController().signal, async () => 'recovered'), 'recovered')
})

test('routing queue drops cancelled waiters but retains slots for disconnected active work', async () => {
  const queue = loadTypescript('lib/routing-queue.ts', {}, { setTimeout, clearTimeout })
  const pending = []
  const task = () => new Promise(resolve => pending.push(resolve))
  const disconnected = new AbortController()
  const first = queue.runRoutingTask(disconnected.signal, task)
  const firstRejected = assert.rejects(first, /cancelled/)
  const second = queue.runRoutingTask(new AbortController().signal, task)
  await new Promise(setImmediate)
  assert.equal(pending.length, 2)
  disconnected.abort(new Error('cancelled'))
  await firstRejected
  const cancelled = new AbortController()
  const waiting = queue.runRoutingTask(cancelled.signal, () => assert.fail('Cancelled waiter must not run'))
  const waitingRejected = assert.rejects(waiting, /cancelled/)
  cancelled.abort(new Error('cancelled'))
  await waitingRejected
  let thirdStarted = false
  const third = queue.runRoutingTask(new AbortController().signal, async () => { thirdStarted = true; return 'third' })
  await Promise.resolve()
  assert.equal(thirdStarted, false)
  pending[0]('first finished')
  assert.equal(await third, 'third')
  pending[1]('second finished')
  await second
})

test('routing queue expires waiters without dispatching and releases failed work', async () => {
  const timers = new Map()
  const queue = loadTypescript('lib/routing-queue.ts', {}, {
    setTimeout(callback, delay) { assert.equal(delay, 10000); const token = {}; timers.set(token, callback); return token },
    clearTimeout(token) { timers.delete(token) },
  })
  const pending = []
  const calls = Array.from({ length: 2 }, () => queue.runRoutingTask(new AbortController().signal, () => new Promise(resolve => pending.push(resolve))))
  await Promise.resolve()
  const waiting = queue.runRoutingTask(new AbortController().signal, () => assert.fail('Expired request must not run'))
  const expired = assert.rejects(waiting, queue.RoutingBusyError)
  Array.from(timers.values())[0]()
  await expired
  assert.equal(timers.size, 0)
  pending.forEach(resolve => resolve())
  await Promise.all(calls)
  await assert.rejects(queue.runRoutingTask(new AbortController().signal, async () => { throw new Error('upstream failure') }), /upstream failure/)
  assert.equal(await queue.runRoutingTask(new AbortController().signal, async () => 'ok'), 'ok')
})

test('routing slider commits on release and preserves separate fallback and travel-time settings', async () => {
  const hooks = []
  let hookIndex = 0
  let effects = []
  let effectCallbacks = []
  let available = false
  let checkRouting
  const React = {
    useState(initial) {
      const index = hookIndex++
      if (!(index in hooks)) hooks[index] = initial
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value }]
    },
    useRef(initial) {
      const index = hookIndex++
      if (!(index in hooks)) hooks[index] = { current: initial }
      return hooks[index]
    },
    useEffect(callback, dependencies) { effects.push(dependencies); effectCallbacks.push(callback) },
    useCallback: callback => callback,
    useImperativeHandle() {},
    forwardRef: component => component,
  }
  const Map = loadTypescript('components/Map.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'maplibre-gl': {}, 'lucide-react': { Layers: 'span', Radar: 'span' },
    '@/lib/map-filters': mapFilters, '@/lib/parking-star': parkingStar,
  }, {
    process: { env: {} }, AbortController, AbortSignal,
    fetch: async () => Response.json({ available }),
    setInterval(callback, delay) { assert.equal(delay, 30000); checkRouting = callback; return 1 },
    clearInterval() {},
  }).default
  const render = () => { hookIndex = 0; effects = []; effectCallbacks = []; return Map({ onSiteSelect() {} }, null) }
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return undefined
    if (predicate(node)) return node
    for (const child of [node.props?.children].flat(Infinity)) {
      const match = find(child, predicate)
      if (match) return match
    }
  }
  find(render(), node => node.props?.['aria-label'] === 'Sternanalyse').props.onClick()
  const slider = () => find(render(), node => node.props?.id === 'star-minutes')
  const event = value => ({ target: { value }, currentTarget: { value, setPointerCapture() {} }, pointerId: 1 })
  assert.equal(slider().props.value, 30)
  assert.equal(effects[0][2], 30)
  slider().props.onPointerDown(event('30'))
  slider().props.onChange(event('40'))
  assert.equal(slider().props.value, 40)
  assert.equal(effects[0][2], 30)
  assert.equal(effects[0][3], true)
  slider().props.onPointerUp(event('40'))
  slider()
  assert.equal(effects[0][2], 40)
  assert.equal(effects[0][3], false)
  slider().props.onKeyDown({ key: 'ArrowDown' })
  slider().props.onChange(event('25'))
  assert.equal(slider().props.value, 25)
  assert.equal(effects[0][2], 40)
  assert.equal(effects[0][3], true)
  slider().props.onKeyUp({ ...event('25'), key: 'ArrowDown' })
  slider()
  assert.equal(effects[0][2], 25)
  assert.equal(effects[0][3], false)
  slider().props.onPointerDown(event('25'))
  slider().props.onChange(event('10'))
  slider().props.onPointerCancel()
  assert.equal(slider().props.value, 25)
  assert.equal(effects[0][2], 25)
  slider().props.onChange(event('20'))
  slider().props.onBlur(event('20'))
  slider()
  assert.equal(effects[0][2], 20)
  const stopChecking = effectCallbacks[1]()
  await new Promise(setImmediate)
  assert.equal(slider().props['aria-label'], 'Luftlinienradius')
  assert.equal(slider().props.value, 100)
  assert.equal(slider().props.max, 200)
  assert.ok(find(render(), node => typeof node.props?.children === 'string' && node.props.children.includes('Isochronen derzeit nicht verfügbar')))
  slider().props.onPointerDown(event('100'))
  slider().props.onChange(event('150'))
  assert.equal(slider().props.value, 150)
  assert.equal(effects[0][2], 20)
  slider().props.onPointerUp(event('150'))
  available = true
  await checkRouting()
  await new Promise(setImmediate)
  assert.equal(slider().props['aria-label'], 'Lkw-Fahrzeit')
  assert.equal(slider().props.value, 20)
  assert.equal(slider().props.max, 60)
  available = false
  await checkRouting()
  await new Promise(setImmediate)
  assert.equal(slider().props.value, 150)
  stopChecking()
})

test('routing usage records daily totals without IPs or coordinates and tolerates a counter outage', async () => {
  const queries = []
  const errors = []
  const usage = loadTypescript('lib/routing-usage.ts', {
    '@/lib/db': { default: { query: async (...args) => { queries.push(args) } } },
  })
  await usage.recordRoutingUsage(true)
  await usage.recordRoutingUsage(false)
  assert.match(queries[0][0], /INSERT INTO routing\.isochrone_usage_daily/)
  assert.match(queries[0][0], /ON CONFLICT \(day\) DO UPDATE/)
  assert.deepEqual(Array.from(queries[0][1]), [1])
  assert.deepEqual(Array.from(queries[1][1]), [0])
  const unavailable = loadTypescript('lib/routing-usage.ts', {
    '@/lib/db': { default: { query: async () => { throw new Error('offline') } } },
  }, { console: { error: (...args) => errors.push(args) } })
  await unavailable.recordRoutingUsage(true)
  assert.equal(errors.length, 1)
})

test('HGV isochrone queues concurrent requests without per-IP throttling and counts each result', async () => {
  let calls = 0
  const recorded = []
  const route = loadTypescript('app/api/isochrone/route.ts', {
    '@/lib/routing-usage': { recordRoutingUsage: async success => { recorded.push(success) } },
    '@/lib/routing-queue': routingQueue(),
  }, {
    process: { env: { ORS_URL: 'http://ors:8082/ors' } }, AbortSignal,
    fetch: async () => { calls++; return Response.json(isochrone) },
  })
  const responses = await Promise.all(Array.from({ length: 4 }, () => route.POST(new Request('http://localhost/api/isochrone', {
    method: 'POST', body: JSON.stringify({ origin: [10, 50], minutes: 30 }),
  }))))
  assert.equal(calls, 4)
  assert.deepEqual(recorded, [true, true, true, true])
  for (const response of responses) {
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Retry-After'), null)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
  }
})

test('HGV isochrone rejects excess queue requests without upstream calls or usage counts', async () => {
  const pending = []
  const recorded = []
  const route = loadTypescript('app/api/isochrone/route.ts', {
    '@/lib/routing-usage': { recordRoutingUsage: async success => { recorded.push(success) } },
    '@/lib/routing-queue': routingQueue(),
  }, {
    process: { env: { ORS_URL: 'http://ors:8082/ors' } }, AbortSignal,
    fetch: () => new Promise(resolve => pending.push(() => resolve(Response.json(isochrone)))),
  })
  const request = () => new Request('http://localhost/api/isochrone', { method: 'POST', body: JSON.stringify({ origin: [10, 50], minutes: 30 }) })
  const calls = Array.from({ length: 6 }, () => route.POST(request()))
  await new Promise(setImmediate)
  assert.equal(pending.length, 2)
  const rejected = await route.POST(request())
  assert.equal(rejected.status, 503)
  assert.equal(rejected.headers.get('Retry-After'), '2')
  assert.equal((await rejected.json()).code, 'ROUTING_BUSY')
  assert.equal(pending.length, 2)
  assert.equal(recorded.length, 0)
  for (let index = 0; index < 6; index++) {
    pending[index]()
    assert.equal((await calls[index]).status, 200)
    await new Promise(setImmediate)
  }
  assert.deepEqual(recorded, [true, true, true, true, true, true])
})

test('HGV isochrone proxy uses minutes, driving-hgv, and no caching', async () => {
  const calls = []
  const recorded = []
  const route = loadTypescript('app/api/isochrone/route.ts', {
    '@/lib/routing-usage': { recordRoutingUsage: async success => { recorded.push(success) } },
    '@/lib/routing-queue': routingQueue(),
  }, {
    process: { env: { ORS_URL: 'http://ors:8082/ors/' } }, AbortSignal,
    fetch: async (url, options) => { calls.push({ url, options }); return Response.json(isochrone) },
  })
  const request = minutes => new Request('http://localhost/api/isochrone', { method: 'POST', body: JSON.stringify({ origin: [10, 50], minutes }) })
  for (const minutes of [10, 30, 60]) {
    const response = await route.POST(request(minutes))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    const call = calls.at(-1)
    assert.equal(call.url, 'http://ors:8082/ors/v2/isochrones/driving-hgv')
    assert.equal(call.options.cache, 'no-store')
    assert.deepEqual(JSON.parse(call.options.body), { locations: [[10, 50]], range: [minutes * 60], range_type: 'time', location_type: 'start' })
  }
  for (const minutes of [9, 61, 200, 201, 60.5, '60', null]) assert.equal((await route.POST(request(minutes))).status, 400)
  assert.equal(calls.length, 3)
  assert.deepEqual(recorded, [true, true, true])
})

test('HGV isochrone proxy rejects invalid coordinates and reports unavailable or invalid upstream results', async () => {
  const request = body => new Request('http://localhost/api/isochrone', { method: 'POST', body: JSON.stringify(body) })
  const recorded = []
  const route = fetch => loadTypescript('app/api/isochrone/route.ts', {
    '@/lib/routing-usage': { recordRoutingUsage: async success => { recorded.push(success) } },
    '@/lib/routing-queue': routingQueue(),
  }, { process: { env: { ORS_URL: 'http://ors:8082/ors' } }, AbortSignal, fetch })
  const unavailable = route(async () => { throw new Error('offline') })
  for (const origin of [[181, 50], [10, 91], [null, 50], [10], ['10', 50]]) {
    assert.equal((await unavailable.POST(request({ origin, minutes: 60 }))).status, 400)
  }
  const body = { origin: [10, 50], minutes: 60 }
  assert.equal((await unavailable.POST(request(body))).status, 503)
  assert.equal((await route(async () => new Response('', { status: 400 })).POST(request(body))).status, 422)
  assert.equal((await route(async () => Response.json({ type: 'FeatureCollection', features: [] })).POST(request(body))).status, 502)
  assert.deepEqual(recorded, [false, false, false])
  const unconfigured = loadTypescript('app/api/isochrone/route.ts', unrestrictedRouting, { process: { env: {} }, AbortSignal })
  assert.equal((await unconfigured.POST(request(body))).status, 503)
})

test('parking star selects by isochrone geometry, excluding holes and invalid points', () => {
  const data = { type: 'FeatureCollection', features: [
    site(10, 51.9), site(11, 51), site(13, 50), site(9, 50), site(10, 49.5),
    site(NaN, 50), { type: 'Feature', geometry: null, properties: {} },
  ] }
  const result = parkingStar.buildParkingStar([10, 50], data, isochrone)
  assert.equal(result.features.length, 3)
  for (const spike of result.features) {
    assert.deepEqual(Array.from(spike.geometry.coordinates[0]), [10, 50])
  }
  assert.equal(parkingStar.buildParkingStar([10, 50], data, { type: 'FeatureCollection', features: [] }).features.length, 0)
})

test('parking star supports disconnected multipolygon isochrones', () => {
  const area = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: {
    type: 'MultiPolygon', coordinates: [isochrone.features[0].geometry.coordinates, [[[13, 50], [14, 50], [14, 51], [13, 51], [13, 50]]]],
  } }] }
  assert.equal(parkingStar.buildParkingStar([10, 50], { type: 'FeatureCollection', features: [site(10, 50), site(13.5, 50.5)] }, area).features.length, 2)
})

test('parking star preserves live occupancy and scales width by total official plus tolerated capacity', () => {
  const features = [25, 100, 250, null, -1].map(total => ({
    ...site(10.2, 50),
    properties: { total_spaces: total, official_spaces: 10, occupancy_pct: 125, name: '<Test>' },
  }))
  const result = parkingStar.buildParkingStar([10, 50], { type: 'FeatureCollection', features }, isochrone)
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
