'use client'

import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

export default function LocaleSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('language')

  const languageNames = new Intl.DisplayNames([locale], { type: 'language' })

  return (
    <label className="inline-flex items-center gap-1 text-xs text-gray-600">
      <span className="sr-only">{t('label')}</span>
      <select
        aria-label={t('label')}
        value={locale}
        onChange={event => {
          const query = window.location.search
          router.replace(`${pathname}${query}`, { locale: event.target.value })
        }}
        className="rounded border border-gray-200 bg-white px-2 py-1.5"
      >
        {routing.locales.map(language => (
          <option key={language} value={language}>
            {languageNames.of(language) ?? language}
          </option>
        ))}
      </select>
    </label>
  )
}
