import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const [baseUrl, container, output] = process.argv.slice(2)
if (!baseUrl || !container || !output) {
  console.error('Usage: node routing/benchmark.mjs http://localhost:8088/ors CONTAINER OUTPUT.json')
  process.exit(1)
}

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim()
const details = JSON.parse(docker('inspect', container))[0]
const health = await fetch(`${baseUrl}/v2/health`, { signal: AbortSignal.timeout(10_000) })
assert.equal(health.status, 200, 'ORS must be ready before benchmarking')

function resources() {
  return {
    memoryBytes: Number(docker('exec', container, 'cat', '/sys/fs/cgroup/memory.current')),
    graphKiB: Number(docker('exec', container, 'du', '-sk', '/home/ors/graphs/driving-hgv').split(/\s/)[0]),
  }
}

const cases = [
  { name: 'Frankfurt', origin: [8.6821, 50.1109] },
  { name: 'Kassel', origin: [9.4797, 51.3127] },
]
const baseline = {
  capturedAt: new Date().toISOString(),
  baseUrl,
  container,
  image: details.Config.Image,
  imageId: details.Image,
  memoryLimitBytes: details.HostConfig.Memory,
  heap: details.Config.Env.find(value => value.startsWith('XMX=')),
  input: details.Mounts.find(mount => mount.Destination.includes('/files/') && mount.Destination.endsWith('.pbf'))?.Source,
  config: docker('exec', container, 'cat', '/home/ors/config/rastmonitor.yml'),
  graphProperties: docker('exec', container, 'cat', '/home/ors/graphs/driving-hgv/properties'),
  before: resources(),
  results: [],
}

for (const location of cases) {
  for (const minutes of [15, 30, 60]) {
    const trials = []
    for (let trial = 0; trial < 4; trial++) {
      const start = performance.now()
      const response = await fetch(`${baseUrl}/v2/isochrones/driving-hgv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({ locations: [location.origin], range: [minutes * 60], range_type: 'time', location_type: 'start' }),
      })
      const data = await response.json()
      assert.equal(response.status, 200, JSON.stringify(data.error))
      assert.ok(data.features?.length, 'Expected a nonempty isochrone')
      const geometries = data.features.map(feature => feature.geometry)
      trials.push({
        milliseconds: Math.round(performance.now() - start),
        geometrySha256: createHash('sha256').update(JSON.stringify(geometries)).digest('hex'),
        geometryBytes: Buffer.byteLength(JSON.stringify(geometries)),
      })
    }
    const measured = trials.slice(1).map(trial => trial.milliseconds).sort((left, right) => left - right)
    const result = { ...location, minutes, warmup: trials[0], trials: trials.slice(1), medianMs: measured[1] }
    baseline.results.push(result)
    console.log(JSON.stringify({ location: location.name, minutes, medianMs: result.medianMs, geometrySha256: result.trials[0].geometrySha256 }))
  }
}

baseline.after = resources()
await writeFile(output, `${JSON.stringify(baseline, null, 2)}\n`, { flag: 'wx' })
console.log(`Saved ${output}`)
console.log(JSON.stringify({ before: baseline.before, after: baseline.after }))