// The staff side of the mock API (scripts/mock-api.mjs), so the admin desk
// can be looked at, screenshotted and audited without a database: a pretend
// sign-in, the moderation queue with owners' details, an email log, the
// health checks. Any password signs in. Reads only: every write answers
// "nothing is saved". Answers only requests that carry the pretend staff
// token, so the public site against the same mock is untouched (and never
// sees a pending entry or an owner's address).
//
//   http://127.0.0.1:5173/#/admin   then sign in with any email and password

const STAFF_ID = '57aff000-0000-4000-8000-000000000001'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

function session(email) {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 365 * 86400
  const user = { id: STAFF_ID, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() }
  // A JWT in shape only; nothing checks the signature.
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: STAFF_ID, email, role: 'authenticated', aud: 'authenticated', iat: now, exp })}.mock`
  return { access_token: token, token_type: 'bearer', expires_in: exp - now, expires_at: exp, refresh_token: 'mock-refresh', user }
}

const isStaff = (req) => {
  const m = (req.headers.authorization || '').match(/^Bearer [^.]+\.([^.]+)\.mock$/)
  if (!m) return false
  try {
    return JSON.parse(Buffer.from(m[1], 'base64url').toString()).sub === STAFF_ID
  } catch {
    return false
  }
}

const iso = (t) => new Date(t).toISOString()
const HOUR = 3600e3

// Owners' details for the approved pets, and a queue: pets waiting for an
// editor, two turned down, one taken out by its owner.
const OWNERS = ['Jo Anderson', 'Maria Vang', 'Dev Patel', 'Kim Schultz', 'Sam Lor', 'Pat Okafor', 'Chris Nguyen', 'Lee Brandt']
const QUEUE = [
  { pet_name: 'Pickles', species: 'dog', town: 'Wausau', caption: 'Will sit for cheese. Will not sit for anything else.', photo: 3, owner_name: 'Alex Marquardt', newsletter_opt_in: true },
  { pet_name: 'Princess Buttercup Snickerdoodle McFluff', species: 'cat', town: 'Town of Wausau, by Rib Mountain State Park', caption: null, photo: 7, owner_name: 'Mary-Catherine Ann Wiśniewska-Kowalczyk', newsletter_opt_in: false },
  { pet_name: 'Hank', species: 'other', town: 'Mosinee', caption: 'A bearded dragon who has seen things.', photo: 11, owner_name: 'Ray Lor', newsletter_opt_in: false },
  { pet_name: 'Mabel', species: 'dog', town: 'Merrill', caption: 'Rescued in 2019, spoiled since.', photo: 15, owner_name: 'Dana Heil', newsletter_opt_in: true },
]

function staffEntries(state) {
  const now = Date.now()
  const email = (name) => `${name.toLowerCase().split(' ')[0].normalize('NFD').replace(/[^a-z]/g, '')}@example.com`
  const approved = state.entries.map((e, i) => {
    const owner = OWNERS[i % OWNERS.length]
    return { ...e, owner_name: owner, owner_email: email(owner), newsletter_opt_in: i % 3 === 0, rights_accepted_at: e.created_at, moderated_at: iso(new Date(e.created_at).getTime() + 2 * HOUR) }
  })
  const contest_id = state.contests[0]?.id
  const queued = QUEUE.map((q, i) => ({
    id: `9e000000-0000-4000-8000-00000000000${i + 1}`,
    contest_id,
    pet_name: q.pet_name,
    species: q.species,
    town: q.town,
    caption: q.caption,
    profile_nickname: i === 0 ? 'Pickle Rick' : null,
    profile_favorite: i === 0 ? 'the squeaky hedgehog' : null,
    profile_trick: null,
    photo_path: `mock/${q.photo}.jpg`,
    thumb_path: `mock/${q.photo}.jpg`,
    shelter_id: null,
    status: 'pending',
    owner_name: q.owner_name,
    owner_email: email(q.owner_name),
    newsletter_opt_in: q.newsletter_opt_in,
    created_at: iso(now - (QUEUE.length - i) * 40 * 60e3),
    rights_accepted_at: iso(now - (QUEUE.length - i) * 40 * 60e3),
  }))
  const gone = [
    { id: '9e000000-0000-4000-8000-0000000000a1', contest_id, pet_name: 'Rex', owner_email: 'kara@example.com', status: 'rejected', rejection_reason: 'The photo shows a person more than the pet. Please send one of Rex alone.', moderated_at: iso(now - 26 * HOUR) },
    { id: '9e000000-0000-4000-8000-0000000000a2', contest_id, pet_name: 'Daisy', owner_email: 'tom@example.com', status: 'rejected', rejection_reason: 'The same photo is on a stock photo site.', moderated_at: iso(now - 50 * HOUR) },
    { id: '9e000000-0000-4000-8000-0000000000a3', contest_id, pet_name: 'Gizmo', owner_email: 'ann@example.com', status: 'withdrawn', withdrawal_reason: 'Rehomed with family in Minnesota; the owner asked to take him out.', withdrawn_at: iso(now - 30 * HOUR) },
  ]
  return [...queued, ...approved, ...gone]
}

const KINDS = ['entry_approved', 'entry_received', 'nurture_open', 'entry_approved', 'club_100', 'entry_rejected', 'eliminated', 'advanced']
function notifications() {
  const now = Date.now()
  return Array.from({ length: 14 }, (_, i) => ({
    id: `0e000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    kind: KINDS[i % KINDS.length],
    to_email: `${OWNERS[i % OWNERS.length].toLowerCase().split(' ')[0]}@example.com`,
    status: i === 3 ? 'failed' : i < 2 ? 'pending' : 'sent',
    error: i === 3 ? 'Resend: 422 the address bounced earlier' : null,
    created_at: iso(now - i * 3 * HOUR),
  }))
}

function cheers(state) {
  const names = ['Jo', 'Maria', 'Dev', 'Kim', 'Sam', 'Aleksandra']
  const codes = ['go', 'paws', 'cutest', 'love', 'champion', 'shelters']
  return state.entries.slice(0, 6).map((e, i) => ({
    id: `0c000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    cheer: codes[i],
    cheer_name: names[i],
    cheer_hidden_at: null,
    confirmed_at: iso(Date.now() - (i + 1) * 47 * 60e3),
    entries: { pet_name: e.pet_name },
  }))
}

// Staff views with nothing in them on a healthy contest.
const EMPTY = new Set(['late_confirmations', 'rejected_photos_live', 'free_voters', 'free_votes', 'free_vote_staff_log', 'free_vote_pet_watch', 'free_vote_connection_watch', 'free_vote_daily', 'newsletter_signups', 'sponsor_matches', 'side_awards', 'round_results', 'payout_statement', 'shelter_payouts', 'round_revenue', 'entry_revenue', 'pack_revenue'])

const NOTHING_SAVED = { code: 'MOCK', message: 'This is a mock: nothing is saved.' }

// Handles the request and returns true, or returns false to let the public
// mock answer. `send(status, body, headers?)` writes JSON with CORS.
export function staff(mock, { query }) {
  return function handle(req, url, send, readBody) {
    if (url.pathname === '/auth/v1/token') {
      readBody((b) => send(200, session(b.email || 'editor@example.com')))
      return true
    }
    if (url.pathname === '/auth/v1/user') {
      if (!isStaff(req)) return send(401, { message: 'Not signed in' }), true
      send(200, session('editor@example.com').user)
      return true
    }
    if (url.pathname === '/auth/v1/logout') return send(204, {}), true
    if (!isStaff(req)) return false

    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1]
    if (rpc) return send(rpc === 'is_admin' ? 200 : 400, rpc === 'is_admin' ? true : NOTHING_SAVED), true

    const table = url.pathname.match(/\/rest\/v1\/([a-z_]+)$/)?.[1]
    if (table) {
      if (!['GET', 'HEAD'].includes(req.method)) return send(400, NOTHING_SAVED), true
      const state = mock.state()
      let rows = null
      if (table === 'entries') rows = query(staffEntries(state), url.searchParams)
      else if (table === 'notifications') rows = query(notifications(), url.searchParams)
      else if (table === 'votes') rows = cheers(state)
      else if (EMPTY.has(table)) rows = []
      if (!rows) return false
      send(200, rows, { 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` })
      return true
    }

    const fn = url.pathname.match(/\/functions\/v1\/([a-z-]+)$/)?.[1]
    if (fn === 'health') return send(200, { problems: [], channels: { email: true, webhook: false } }), true
    if (fn === 'notify') return send(200, { enabled: true, sent: 0, failed: 0, queued: 0 }), true
    if (fn) return send(400, { error: 'This is a mock: nothing is saved.' }), true
    return false
  }
}
