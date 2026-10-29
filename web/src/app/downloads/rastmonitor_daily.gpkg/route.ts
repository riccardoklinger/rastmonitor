import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import { createHash, timingSafeEqual } from 'node:crypto'

export const dynamic = 'force-dynamic'

const FILE = path.join(process.env.EXPORT_DIR ?? '/exports', 'rastmonitor_daily.gpkg')

export async function GET(request: Request) {
  const username = process.env.DOWNLOAD_USERNAME
  const password = process.env.DOWNLOAD_PASSWORD
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' }

  if (!username || !password || username.includes(':')) {
    console.error('Download authentication is not configured correctly')
    return new Response('Download temporarily unavailable', { status: 503, headers })
  }

  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i)
  const supplied = match ? Buffer.from(match[1], 'base64') : Buffer.alloc(0)
  const digest = (value: string | Buffer) => createHash('sha256').update(value).digest()

  if (!match || !timingSafeEqual(digest(supplied), digest(`${username}:${password}`))) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        ...headers,
        'WWW-Authenticate': 'Basic realm="Rastmonitor downloads", charset="UTF-8"',
      },
    })
  }

  try {
    const info = await stat(FILE)
    const stream = Readable.toWeb(createReadStream(FILE)) as ReadableStream
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/geopackage+sqlite3',
        'Content-Length': String(info.size),
        'Content-Disposition': 'attachment; filename="rastmonitor_daily.gpkg"',
        'Last-Modified': info.mtime.toUTCString(),
        ...headers,
      },
    })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return new Response('Export not available yet', { status: 404, headers })
    }
    console.error('Unable to serve GeoPackage export', error)
    return new Response('Download temporarily unavailable', { status: 500, headers })
  }
}
