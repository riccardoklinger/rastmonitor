import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { finished } from 'node:stream/promises'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Provide input and output GeoJSON paths')
const destination = createWriteStream(output, { flags: 'wx' })
const completion = finished(destination)
const lines = createInterface({ input: createReadStream(input), crlfDelay: Infinity })
let count = 0
async function write(text) {
  if (!destination.write(text)) await once(destination, 'drain')
}
await write('{"type":"FeatureCollection","features":[')
for await (const line of lines) {
  const text = line.trim()
  if (!text.startsWith('{"type":"Feature",')) continue
  const feature = JSON.parse(text.endsWith(',') ? text.slice(0, -1) : text)
  if (!['LineString', 'MultiLineString'].includes(feature.geometry?.type)) continue
  const { highway, ref } = feature.properties ?? {}
  if (!['motorway', 'motorway_link', 'trunk', 'trunk_link'].includes(highway)) continue
  feature.properties = { highway, ...(ref ? { ref } : {}) }
  await write(`${count ? ',' : ''}${JSON.stringify(feature)}`)
  count++
}
if (!count) throw new Error('No road features found in the line-oriented osmium export')
destination.end(']}\n')
await completion
console.log(`Exported ${count} main-road features`)