import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import LocaleSwitcher from '@/components/LocaleSwitcher'

export default function Impressum() {
  const t = useTranslations('impressum')
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-8 space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-blue-600 hover:underline">{t('back')}</Link>
          <LocaleSwitcher />
        </div>

        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>

        <section className="space-y-1 text-gray-700">
          <h2 className="font-semibold text-gray-900">{t('legalHeading')}</h2>
          <p>Riccardo Schuster</p>
          <p>Gnomenplatz 14</p>
          <p>13088 Berlin</p>
        </section>

        <section className="space-y-1 text-gray-700">
          <h2 className="font-semibold text-gray-900">{t('contact')}</h2>
          <p>
            E-Mail:{' '}
            <a href="mailto:riccardo.schuster@gmail.com" className="text-blue-600 hover:underline">
              riccardo.schuster@gmail.com
            </a>
          </p>
        </section>

        <section className="space-y-2 text-gray-700 text-sm">
          <h2 className="font-semibold text-gray-900">{t('disclaimer')}</h2>
          <p>{t('disclaimerText1')}</p>
          <p>{t('disclaimerText2')}</p>
        </section>

        <section className="space-y-2 text-gray-700 text-sm">
          <h2 className="font-semibold text-gray-900">{t('privacy')}</h2>
          <p>{t('privacyText1')}</p>
          <p>{t('privacyText2')}</p>
          <p>{t('privacyText3')}</p>
        </section>
      </div>
    </main>
  )
}
