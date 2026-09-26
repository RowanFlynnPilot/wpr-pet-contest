import { PostgrestClient } from '@supabase/postgrest-js'
import { BACKEND_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from './env.js'

// Public reads use PostgREST directly: no auth, no realtime, a third of the
// weight of supabase-js on a phone that arrived from a Facebook share. It also
// means the public client can never carry a session, so a staff member signed
// in to #/admin in the same browser still browses the gallery as a reader and
// never sees entries waiting in the moderation queue. The admin desk builds
// its own full client (src/admin/adminClient.js).
function headers(key) {
  const h = { apikey: key }
  // Legacy anon keys are JWTs and go in Authorization too; publishable keys
  // (sb_publishable_...) must not.
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`
  return h
}

export const supabase = BACKEND_CONFIGURED
  ? new PostgrestClient(`${SUPABASE_URL}/rest/v1`, { headers: headers(SUPABASE_ANON_KEY) })
  : null
