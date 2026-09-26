import { createClient } from '@supabase/supabase-js'
import { BACKEND_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/env.js'
import { callFunction } from '../lib/api.js'

// The only client that carries a session. Staff are invited; signups are off.
export const admin = BACKEND_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'wpr-pets-admin' },
    })
  : null

export class SessionError extends Error {}

async function token() {
  const { data } = await admin.auth.getSession()
  const t = data.session?.access_token
  if (!t) throw new SessionError('Your session has expired. Sign in again.')
  return t
}

// Staff edge functions (moderate, notify). 401/403 means the session is gone
// or the account is not staff: back to the sign-in screen.
export async function callAdmin(name, json = {}) {
  try {
    return await callFunction(name, { json, token: await token() })
  } catch (err) {
    if (err instanceof SessionError || err.status === 401 || err.status === 403) {
      await admin.auth.signOut().catch(() => {})
      throw new SessionError(err.message)
    }
    throw err
  }
}

export async function q(query) {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}

// Pages through PostgREST's 1000-row cap.
export async function all(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const data = await q(build().range(from, from + 999))
    out.push(...data)
    if (data.length < 1000) return out
  }
}

// Optional admin views: a missing one reads as "not available", not a crash.
export async function view(query) {
  const { data, error } = await query
  if (error) return { rows: [], error: error.message }
  return { rows: data || [], error: null }
}
