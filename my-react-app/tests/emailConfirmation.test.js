import test from 'node:test'
import assert from 'node:assert/strict'
import { readEmailConfirmation, verifyEmailConfirmation } from '../src/lib/emailConfirmation.js'

const appUrl = 'https://inventoscan.example.test'
const onPage = suffix => readEmailConfirmation(new URL(suffix, appUrl))

test('the confirmation page recognizes Supabase signup callbacks and rejects unrelated links', () => {
  const callback = { status: 'checking', accessToken: 'signup-token' }
  assert.deepEqual(onPage('/?confirm-email=1#access_token=signup-token&type=signup'), callback)
  assert.deepEqual(onPage('/#access_token=signup-token&type=signup'), callback)
  assert.deepEqual(onPage('/?confirm-email=1#access_token=signup-token&type=email'), callback)
  assert.deepEqual(onPage('/?confirm-email=1#error_code=otp_expired'), { status: 'expired' })
  assert.deepEqual(onPage('/?confirm-email=1&error=access_denied'), { status: 'invalid' })
  assert.deepEqual(onPage('/?confirm-email=1'), { status: 'request' })
  assert.deepEqual(onPage('/?confirm-email=1&code=unexpected'), { status: 'invalid' })
  assert.deepEqual(onPage('/?confirm-email=1#access_token=reset-token&type=recovery'), { status: 'invalid' })
  assert.equal(onPage('/#access_token=reset-token&type=recovery'), null)
  assert.equal(onPage('/'), null)
})

test('only a verified and confirmed Supabase user produces the success state', async () => {
  const callback = onPage('/?confirm-email=1#access_token=signup-token&type=signup')
  const supabase = result => ({
    auth: {
      getUser: async token => {
        assert.equal(token, 'signup-token')
        return result
      },
    },
  })
  assert.equal(await verifyEmailConfirmation(supabase({ data: { user: { email_confirmed_at: '2026-11-26T00:00:00Z' } } }), callback), 'confirmed')
  assert.equal(await verifyEmailConfirmation(supabase({ data: { user: {} } }), callback), 'invalid')
  assert.equal(await verifyEmailConfirmation(supabase({ error: { status: 401 } }), callback), 'invalid')
  assert.equal(await verifyEmailConfirmation(supabase({ error: { name: 'AuthRetryableFetchError' } }), callback), 'unavailable')
  assert.equal(await verifyEmailConfirmation(null, callback), 'unavailable')
  assert.equal(await verifyEmailConfirmation(null, { status: 'expired' }), 'expired')
})
