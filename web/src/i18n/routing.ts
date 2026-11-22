import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['de', 'en', 'es', 'fr', 'it', 'no', 'pl', 'pt', 'ro', 'ru', 'da', 'sv'],
  defaultLocale: 'de',
  localePrefix: 'always',
})
