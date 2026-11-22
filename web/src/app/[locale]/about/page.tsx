import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import LocaleSwitcher from '@/components/LocaleSwitcher'

export default function About() {
  const t = useTranslations('about')
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-8 space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-blue-600 hover:underline">{t('back')}</Link>
          <LocaleSwitcher />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-3xl">🚛</span>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        </div>

        <section className="space-y-2 text-gray-700">
          <h2 className="font-semibold text-gray-900">{t('what')}</h2>
          <p>
            {t('whatText1')}
          </p>
          <p>
            {t('whatText2')}
          </p>
        </section>

        <section className="space-y-2 text-gray-700">
          <h2 className="font-semibold text-gray-900">{t('source')}</h2>
          <p>
            {t('sourceLead')}{' '}
            <a
              href="https://mobilithek.info"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {t('sourceLink')}
            </a>{' '}
            {t('sourceTail')}
          </p>
          <p className="text-sm text-gray-500">
            {t('formatLicense')}
          </p>
        </section>

        <section className="space-y-2 text-gray-700">
          <h2 className="font-semibold text-gray-900">{t('scale')}</h2>
          <div className="grid grid-cols-2 gap-1 text-sm">
            {[
              ['#22c55e', t('good')],
              ['#eab308', t('moderate')],
              ['#f97316', t('busy')],
              ['#ef4444', t('almostFull')],
              ['#7f1d1d', t('overcrowded')],
              ['#9ca3af', t('noData')],
            ].map(([color, label]) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2 text-gray-700">
          <h2 className="font-semibold text-gray-900">{t('technology')}</h2>
          <p className="text-sm">
            {t('technologyText')}
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a
              href="https://github.com/riccardoklinger/rastmonitor"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-700 transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
              </svg>
              GitHub
            </a>
            <a
              href="https://github.com/riccardoklinger/rastmonitor/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition"
            >
              {t('reportBug')}
            </a>
            <a
              href="https://github.com/sponsors/riccardoklinger"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pink-500 text-white text-sm hover:bg-pink-600 transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
              </svg>
              {t('sponsor')}
            </a>
          </div>
        </section>

        <footer className="pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-400">
          <span>RastMonitor · Riccardo Schuster</span>
          <Link href="/impressum" className="hover:underline">{t('imprint')}</Link>
        </footer>
      </div>
    </main>
  )
}
