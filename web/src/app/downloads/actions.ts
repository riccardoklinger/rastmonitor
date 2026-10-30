'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  createDownloadSession,
  downloadCredentials,
  DOWNLOAD_COOKIE,
  DOWNLOAD_SESSION_SECONDS,
  validDownloadCredentials,
} from '@/lib/download-auth'

export async function login(formData: FormData) {
  if (!downloadCredentials()) {
    console.error('Download authentication is not configured correctly')
    redirect('/downloads?error=unavailable')
  }
  const username = formData.get('username')
  const password = formData.get('password')
  if (typeof username !== 'string' || typeof password !== 'string' ||
      username.length > 1024 || password.length > 1024 ||
      !validDownloadCredentials(username, password)) {
    redirect('/downloads?error=credentials')
  }
  const jar = await cookies()
  jar.set(DOWNLOAD_COOKIE, createDownloadSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/downloads',
    maxAge: DOWNLOAD_SESSION_SECONDS,
  })
  redirect('/downloads')
}

export async function logout() {
  const jar = await cookies()
  jar.set(DOWNLOAD_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/downloads',
    maxAge: 0,
  })
  redirect('/downloads')
}
