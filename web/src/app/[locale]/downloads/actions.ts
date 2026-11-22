'use server'

import { cookies } from 'next/headers'
import { hasLocale } from 'next-intl'
import { redirect } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import {
  createDownloadSession,
  downloadCredentials,
  DOWNLOAD_COOKIE,
  DOWNLOAD_SESSION_SECONDS,
  validDownloadCredentials,
} from '@/lib/download-auth'

export async function login(formData: FormData) {
  const requestedLocale = formData.get('locale')
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale
  if (!downloadCredentials()) {
    console.error('Download authentication is not configured correctly')
    redirect({ href: '/downloads?error=unavailable', locale })
  }
  const username = formData.get('username')
  const password = formData.get('password')
  if (typeof username !== 'string' || typeof password !== 'string' ||
      username.length > 1024 || password.length > 1024 ||
      !validDownloadCredentials(username, password)) {
    redirect({ href: '/downloads?error=credentials', locale })
  }
  const jar = await cookies()
  jar.set(DOWNLOAD_COOKIE, createDownloadSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: DOWNLOAD_SESSION_SECONDS,
  })
  redirect({ href: '/downloads', locale })
}

export async function logout(formData: FormData) {
  const requestedLocale = formData.get('locale')
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale
  const jar = await cookies()
  jar.set(DOWNLOAD_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
  redirect({ href: '/downloads', locale })
}
