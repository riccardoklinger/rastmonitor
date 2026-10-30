import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const DOWNLOAD_COOKIE = 'rastmonitor_download'
export const DOWNLOAD_SESSION_SECONDS = 30 * 60
export const DOWNLOAD_PATH = '/downloads/rastmonitor_daily.gpkg'

export function downloadCredentials() {
  const username = process.env.DOWNLOAD_USERNAME
  const password = process.env.DOWNLOAD_PASSWORD
  return username && password && !username.includes(':') ? { username, password } : null
}

function equal(left: string, right: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(left), digest(right))
}

export function validDownloadCredentials(username: string, password: string) {
  const credentials = downloadCredentials()
  if (!credentials) return false
  const usernameMatches = equal(username, credentials.username)
  const passwordMatches = equal(password, credentials.password)
  return usernameMatches && passwordMatches
}

function signature(expires: string) {
  const credentials = downloadCredentials()
  if (!credentials) throw new Error('Download authentication is not configured correctly')
  const key = createHash('sha256')
    .update(JSON.stringify([credentials.username, credentials.password]))
    .digest()
  return createHmac('sha256', key).update(`download-session:${expires}`).digest('hex')
}

export function createDownloadSession() {
  const expires = String(Math.floor(Date.now() / 1000) + DOWNLOAD_SESSION_SECONDS)
  return `${expires}.${signature(expires)}`
}

export function validDownloadSession(token: string | undefined) {
  if (!token || !downloadCredentials()) return false
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(token)
  if (!match) return false
  const remaining = Number(match[1]) - Math.floor(Date.now() / 1000)
  return remaining > 0 && remaining <= DOWNLOAD_SESSION_SECONDS &&
    equal(match[2], signature(match[1]))
}
