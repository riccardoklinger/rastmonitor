import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale
  const localeMessages = (await import(`../messages/${locale}.json`)).default
  const messages = locale === routing.defaultLocale
    ? localeMessages
    : {
        ...(await import('../messages/en.json')).default,
        ...localeMessages,
      }

  return {
    locale,
    messages,
  }
})
