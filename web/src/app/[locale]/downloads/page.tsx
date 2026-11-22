import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { DOWNLOAD_COOKIE, DOWNLOAD_PATH, validDownloadSession } from '@/lib/download-auth'
import { login, logout } from './actions'
import { Link } from '@/i18n/navigation'
import LocaleSwitcher from '@/components/LocaleSwitcher'

export const dynamic = 'force-dynamic'

export default async function Downloads({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const t = await getTranslations('downloads')
  const { locale } = await params
  const { error } = await searchParams
  const authenticated = validDownloadSession((await cookies()).get(DOWNLOAD_COOKIE)?.value)

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-xl space-y-6 rounded-xl bg-white p-8 shadow">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-blue-600 hover:underline">{t('back')}</Link>
          <LocaleSwitcher />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-700">{t('description')}</p>
        <section className="space-y-2 rounded border border-blue-100 bg-blue-50 p-4">
          <h2 className="font-semibold text-gray-900">{t('noCredentials')}</h2>
          <p className="text-sm text-gray-700">
            {t('accessInfo')}{' '}
            <a href="mailto:webmaster@gis-monitor.com?subject=Zugang%20zum%20Rastmonitor-GeoPackage"
              className="text-blue-700 underline break-words">webmaster@gis-monitor.com</a>.
          </p>
        </section>
        {authenticated ? (
          <div className="space-y-4">
            <a href={DOWNLOAD_PATH} className="inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              {t('download')}
            </a>
            <form action={logout}>
              <input type="hidden" name="locale" value={locale} />
              <button className="text-sm text-gray-600 underline">{t('logout')}</button>
            </form>
          </div>
        ) : (
          <form action={login} className="space-y-4">
            <input type="hidden" name="locale" value={locale} />
            <h2 className="font-semibold text-gray-900">{t('loginTitle')}</h2>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error === 'credentials'
                  ? t('invalidCredentials')
                  : t('unavailable')}
              </p>
            )}
            <label className="block text-sm text-gray-700">
              {t('username')}
              <input name="username" autoComplete="username" required maxLength={1024}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <label className="block text-sm text-gray-700">
              {t('password')}
              <input name="password" type="password" autoComplete="current-password" required maxLength={1024}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2" />
            </label>
            <button className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              {t('login')}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
