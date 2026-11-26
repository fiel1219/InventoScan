import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import BrandLogo from './BrandLogo'
import { emailConfirmationUrl, verifyEmailConfirmation } from './lib/emailConfirmation'
import './EmailConfirmation.css'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const confirmationClient = url && key ? createClient(url, key, {
  auth: {
    storageKey: 'inventoscan-email-confirmation',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
}) : null

const messages = {
  request: ['Resend confirmation email', 'Enter the email address you used to register for InventoScan.'],
  checking: ['Confirming your email', 'Please wait while InventoScan checks your confirmation link.'],
  confirmed: ['Email confirmed', 'Your email address is verified. A System Admin must approve your account before you can sign in.'],
  expired: ['Confirmation link expired', 'This link may have expired or already been used. If you still need to confirm your email, request a fresh link below.'],
  invalid: ['Confirmation link unavailable', 'This link may be incomplete or already used. If you’re already approved, try signing in.'],
  unavailable: ['Confirmation could not be checked', 'If you still need to confirm your email, request a fresh link or try again later.'],
}

export default function EmailConfirmation({ callback }) {
  const [status, setStatus] = useState(callback.status)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [resendError, setResendError] = useState('')
  const check = useRef(null)

  useEffect(() => {
    let active = true
    check.current ??= verifyEmailConfirmation(confirmationClient, callback)
    check.current.then(result => { if (active) setStatus(result) })
    return () => { active = false }
  }, [callback])

  async function resend(event) {
    event.preventDefault()
    if (!confirmationClient || sending) return
    const email = new FormData(event.currentTarget).get('email').trim().toLowerCase()
    if (!email) return

    setSending(true)
    setResendError('')
    setNotice('')
    try {
      const { error } = await confirmationClient.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: emailConfirmationUrl(window.location.origin) },
      })
      if (error) throw error
      setNotice('If that email is awaiting confirmation, you’ll receive a new link shortly.')
    } catch {
      setResendError('Couldn’t send a confirmation link right now. Please wait and try again.')
    } finally {
      setSending(false)
    }
  }

  const [title, message] = messages[status]
  const canResend = confirmationClient && !['checking', 'confirmed'].includes(status)

  return (
    <main className="login-screen">
      <section className="login-card email-confirmation" aria-labelledby="confirmation-title">
        <div className="login-brand">
          <BrandLogo className="login-logo" />
          <strong className="login-brand-name">VSU InventoScan</strong>
        </div>
        <div role="status">
          <h1 id="confirmation-title">{title}</h1>
          <p>{message}</p>
        </div>
        {canResend && (
          <form className="confirmation-resend" onSubmit={resend}>
            <label>
              Email address
              <input name="email" type="email" autoComplete="username" required disabled={sending} />
            </label>
            <button type="submit" className="confirmation-button" disabled={sending}>
              {sending ? 'Sending…' : 'Send a new link'}
            </button>
            {notice && <p className="confirmation-notice" role="status">{notice}</p>}
            {resendError && <div className="login-error" role="alert">{resendError}</div>}
          </form>
        )}
        {status !== 'checking' && (
          <a className={canResend ? 'confirmation-back' : 'confirmation-button'} href="/">
            Back to sign in
          </a>
        )}
      </section>
    </main>
  )
}
