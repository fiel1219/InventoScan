export const emailConfirmationPath = '/?confirm-email=1'

export function emailConfirmationUrl(origin) {
  return new URL(emailConfirmationPath, origin).href
}

export function readEmailConfirmation(url) {
  const fragment = new URLSearchParams(url.hash.slice(1))
  const type = fragment.get('type')
  const accessToken = fragment.get('access_token')
  const isSignup = type === 'signup' || type === 'email'
  const isLegacySignup = url.pathname === '/' && type === 'signup' && Boolean(accessToken)
  if (!url.searchParams.has('confirm-email') && !isLegacySignup) return null

  const errorCode = fragment.get('error_code') || url.searchParams.get('error_code')
  if (errorCode === 'otp_expired') return { status: 'expired' }
  if (errorCode || fragment.has('error') || url.searchParams.has('error')) {
    return { status: 'invalid' }
  }
  if (!url.hash && !url.searchParams.has('code')) return { status: 'request' }
  if (!isSignup || !accessToken) return { status: 'invalid' }
  return { status: 'checking', accessToken }
}

export async function verifyEmailConfirmation(client, callback) {
  if (callback.status !== 'checking') return callback.status
  const accessToken = callback.accessToken
  if (!client) return 'unavailable'

  try {
    const { data, error } = await client.auth.getUser(accessToken)
    if (error?.name === 'AuthRetryableFetchError') return 'unavailable'
    return !error && data?.user?.email_confirmed_at ? 'confirmed' : 'invalid'
  } catch {
    return 'unavailable'
  }
}
