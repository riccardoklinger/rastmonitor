import { cookies } from 'next/headers'
import { DOWNLOAD_COOKIE, DOWNLOAD_PATH, validDownloadSession } from '@/lib/download-auth'
import { login, logout } from './actions'

export const dynamic = 'force-dynamic'

export default async function Downloads({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const authenticated = validDownloadSession((await cookies()).get(DOWNLOAD_COOKIE)?.value)

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-xl space-y-6 rounded-xl bg-white p-8 shadow">
        <a href="/" className="text-sm text-blue-600 hover:underline">Zurück zur Karte</a>
        <h1 className="text-2xl font-bold text-gray-900">Tagesdaten herunterladen</h1>
        <p className="text-gray-700">
          Der GeoPackage-Download und CSV enthält die verfügbaren Tagesstatistiken zur
          Lkw-Parkplatzauslastung mit Minimum, Maximum, Mittelwert und Median
          sowie Standortgeometrien. Die Datei wird jede Nacht aktualisiert.
        </p>
        <section className="space-y-2 rounded border border-blue-100 bg-blue-50 p-4">
          <h2 className="font-semibold text-gray-900">Noch keine Zugangsdaten?</h2>
          <p className="text-sm text-gray-700">
            Für Zugang und Informationen zu Nutzungsmöglichkeiten kontaktieren Sie mich unter{' '}
            <a href="mailto:webmaster@gis-monitor.com?subject=Zugang%20zum%20Rastmonitor-GeoPackage"
              className="text-blue-700 underline break-words">webmaster@gis-monitor.com</a>.
          </p>
        </section>
        {authenticated ? (
          <div className="space-y-4">
            <a href={DOWNLOAD_PATH} className="inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              GeoPackage herunterladen
            </a>
            <form action={logout}>
              <button className="text-sm text-gray-600 underline">Abmelden</button>
            </form>
          </div>
        ) : (
          <form action={login} className="space-y-4">
            <h2 className="font-semibold text-gray-900">Mit Zugangsdaten anmelden</h2>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error === 'credentials'
                  ? 'Benutzername oder Passwort ist nicht korrekt.'
                  : 'Der Download-Zugang ist derzeit nicht verfügbar. Bitte kontaktieren Sie mich.'}
              </p>
            )}
            <label className="block text-sm text-gray-700">
              Benutzername
              <input name="username" autoComplete="username" required maxLength={1024}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="block text-sm text-gray-700">
              Passwort
              <input name="password" type="password" autoComplete="current-password" required maxLength={1024}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              Anmelden
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
