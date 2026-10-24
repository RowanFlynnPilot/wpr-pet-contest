// A stand-in for the contest's API, pure and in memory: a fixed, deterministic
// contest in any of its four phases, the PostgREST filters the front end uses,
// placeholder photos, and toy versions of the writes (a checkout with no
// Stripe behind it, a free vote with code 123456, an owner's goal).
//
// Two things run it: scripts/mock-api.mjs serves it over HTTP for local work,
// the audit and the screenshot deck; src/demo/shim.js answers the app's own
// fetch calls with it inside the browser, so a build with no backend at all
// can be opened on a phone. Reads only, plus the toys; nothing persists.

const NAMES = ['Biscuit', 'Luna', 'Moose', 'Pickles', 'Juniper', 'Otis', 'Waffles', 'Maple', 'Tater Tot', 'Clementine',
  'Rocco', 'Pepper', 'Gus', 'Noodle', 'Hazel', 'Brisket', 'Olive', 'Ziggy', 'Butterbean', 'Mabel',
  'Sir Reginald Fluffington III', 'Pretzel', 'Dot', 'Ranger']
const TOWNS = ['Wausau', 'Weston', 'Schofield', 'Rothschild', 'Mosinee', 'Kronenwetter', 'Rib Mountain', 'Merrill']
const SPECIES = ['dog', 'cat', 'dog', 'other']
const HOUR = 3600e3
const DAY = 24 * HOUR
export const PHASES = ['submissions', 'open', 'bracket', 'complete']
export const PHOTO_COUNT = NAMES.length
const id = (prefix, n) => `${prefix}000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const iso = (ms) => new Date(ms).toISOString()

// Deterministic "random" so every run draws the same contest.
const rand = (seed) => {
  let x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// A placeholder pet: a face on a tinted square, a different tint per pet.
export function photo(n) {
  const hue = (n * 47) % 360
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 62%)"/><stop offset="1" stop-color="hsl(${hue} 40% 42%)"/></linearGradient></defs>
<rect width="800" height="800" fill="url(#g)"/>
<circle cx="400" cy="430" r="190" fill="#f8f3ea"/>
<circle cx="335" cy="390" r="26" fill="#2a2a2a"/><circle cx="465" cy="390" r="26" fill="#2a2a2a"/>
<ellipse cx="400" cy="480" rx="38" ry="28" fill="#3b2c26"/>
<path d="M250 300 L230 160 L340 250 Z M550 300 L570 160 L460 250 Z" fill="#f8f3ea"/>
</svg>`
}

// PostgREST filters the front end uses: eq, neq, in, order, limit, offset.
export function query(rows, params) {
  let out = rows
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue
    const m = raw.match(/^(eq|neq|in)\.(.*)$/)
    if (!m) continue
    const [, op, value] = m
    if (op === 'eq') out = out.filter((r) => String(r[key]) === value)
    if (op === 'neq') out = out.filter((r) => String(r[key]) !== value)
    if (op === 'in') {
      const set = new Set(value.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, '')))
      out = out.filter((r) => set.has(String(r[key])))
    }
  }
  const order = params.get('order')
  if (order) {
    const [col, dir] = order.split(',')[0].split('.')
    out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === 'desc' ? -1 : 1))
  }
  const offset = Number(params.get('offset') || 0)
  const limit = params.has('limit') ? Number(params.get('limit')) : out.length
  return out.slice(offset, offset + limit)
}

// One mock: a phase, a vote scale (VOTE_SCALE: how do five-figure counts
// fit?), and the toys' memory for as long as it lives.
export function createMock({ phase = 'open', scale = 1, region = 'Marathon County', towns = TOWNS, photos = 'svg' } = {}) {
  let current = PHASES.includes(phase) ? phase : 'open'
  const townList = towns && towns.length ? towns : TOWNS
  // 'jpg': the sample photos in public/sample-pets; 'svg': the drawn faces.
  const ext = photos === 'jpg' ? 'jpg' : 'svg'
  const voteScale = Math.max(1, Number(scale) || 1)
  const intents = new Map() // id -> { id, round_id, entry_id, votes, cents, multiplier }
  const paid = [] // settled intents, in order
  const devices = new Map() // token -> { email, voted }
  const challenges = new Map() // id -> email

  function state() {
    const now = Date.now()
    const entries = NAMES.map((name, i) => ({
      id: id('e1', i + 1),
      contest_id: id('c1', 1),
      pet_name: name,
      species: SPECIES[i % SPECIES.length],
      town: townList[i % townList.length],
      caption: i % 3 === 0 ? 'Sleeps 20 hours a day and guards the couch for the other four.' : null,
      photo_path: `mock/${i + 1}.${ext}`,
      thumb_path: `mock/${i + 1}.${ext}`,
      shelter_id: i === 7 ? id('5e', 1) : null,
      seed: null,
      goal_votes: i === 0 ? 300 : null,
      status: 'approved',
      created_at: iso(now - 9 * DAY + i * HOUR),
    }))

    const submissions = current === 'submissions'
    const contest = {
      id: id('c1', 1), year: 2026, name: `Cutest Pet in ${region}`,
      status: submissions ? 'submissions_open' : current === 'complete' ? 'complete' : 'voting',
      beneficiary_split_pct: 30, bracket_size: 16, bracket_round_hours: 48,
      submissions_open_at: iso(submissions ? now - 3 * DAY : now - 14 * DAY),
      submissions_close_at: iso(submissions ? now + 4 * DAY : now - 7 * DAY),
      free_vote_enabled: true,
      free_vote_paused_at: null,
      shelter_goal_cents: 500000,
    }

    const totalsFor = (roundSeq, ids) => ids.map((eid, i) => ({
      entry_id: eid,
      votes: (Math.round(rand(roundSeq * 100 + i) * (roundSeq === 1 ? 400 : 150)) + 5) * voteScale,
    }))

    const rounds = []
    const matchups = []
    const totals = []
    const r1 = {
      id: id('r1', 1), contest_id: contest.id, seq: 1, kind: 'open',
      status: submissions ? 'pending' : current === 'open' ? 'open' : 'resolved',
      opens_at: iso(submissions ? now + 4 * DAY : now - 5 * DAY),
      closes_at: iso(submissions ? now + 11 * DAY : current === 'open' ? now + 2 * DAY + 5 * HOUR : now - 3 * DAY),
      resolved_at: current === 'open' || submissions ? null : iso(now - 3 * DAY + 600e3),
    }
    rounds.push(r1)
    if (!submissions) {
      for (const t of totalsFor(1, entries.map((e) => e.id))) totals.push({ round_id: r1.id, ...t })
    }

    if (current === 'bracket' || current === 'complete') {
      const ranked = [...entries].sort((a, b) =>
        (totals.find((t) => t.entry_id === b.id)?.votes || 0) - (totals.find((t) => t.entry_id === a.id)?.votes || 0))
      ranked.slice(0, 16).forEach((e, i) => { e.seed = i + 1 })
      const order = [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
      let field = order.map((s) => ranked[s - 1])
      const lastSeq = current === 'complete' ? 5 : 2
      for (let seq = 2; seq <= lastSeq; seq++) {
        const open = current === 'bracket' && seq === lastSeq
        const r = {
          id: id('r1', seq), contest_id: contest.id, seq, kind: 'bracket', status: open ? 'open' : 'resolved',
          opens_at: iso(now - (lastSeq - seq + 1) * 2 * DAY), closes_at: iso(open ? now + 20 * HOUR : now - (lastSeq - seq) * 2 * DAY),
          resolved_at: open ? null : iso(now - (lastSeq - seq) * 2 * DAY + 600e3),
        }
        rounds.push(r)
        const next = []
        for (let s = 0; s < field.length / 2; s++) {
          const a = field[s * 2]
          const b = field[s * 2 + 1]
          const [ta, tb] = totalsFor(seq * 10 + s, [a.id, b.id])
          totals.push({ round_id: r.id, ...ta }, { round_id: r.id, ...tb })
          const winner = open ? null : ta.votes >= tb.votes ? a : b
          matchups.push({ id: id('m1', seq * 100 + s), round_id: r.id, slot: s, entry_a_id: a.id, entry_b_id: b.id, winner_entry_id: winner?.id || null })
          if (winner) next.push(winner)
        }
        field = next
      }
    }

    // Toy purchases (mockPay) land on the live totals and the feed.
    for (const p of paid) {
      const t = totals.find((t) => t.round_id === p.round_id && t.entry_id === p.entry_id)
      if (t) t.votes += p.votes
      else totals.push({ round_id: p.round_id, entry_id: p.entry_id, votes: p.votes })
    }

    const live = totals.filter((t) => rounds.find((r) => r.id === t.round_id)?.status === 'open')
    const gross = totals.reduce((n, t) => n + t.votes * 80, 0)
    return {
      contests: [contest],
      rounds,
      entries,
      matchups,
      entry_round_totals: totals.map((t) => ({ ...t, amount_cents: t.votes * 80, free_votes: Math.round(t.votes * 0.08) })),
      vote_packs: [
        ['starter', 'Starter', 5, 500, false], ['fan', 'Fan', 25, 2000, true], ['superfan', 'Superfan', 75, 5000, false],
        ['champion', 'Champion', 200, 10000, false], ['legend', 'Legend', 600, 25000, false],
      ].map(([slug, label, votes, cents, featured], i) => ({ id: id('a1', i + 1), contest_id: contest.id, slug, label, votes, cents, sort: i + 1, featured, active: true })),
      sponsor_matches: current === 'bracket'
        ? [{ id: id('b2', 1), contest_id: contest.id, starts_at: iso(now - HOUR), ends_at: iso(now + 2 * HOUR), ratio: 1, cap_cents: 50000, sponsor_name: 'Example Pet Supply', sponsor_url: 'https://example.org' }]
        : [],
      bonus_windows: current === 'open'
        ? [{ id: id('b1', 1), contest_id: contest.id, starts_at: iso(now - HOUR), ends_at: iso(now + HOUR), multiplier: 2, label: 'Double Vote Hour', sponsor_name: 'Example Pet Supply', sponsor_url: 'https://example.org' }]
        : [],
      shelters: [
        // The real partner, its page and its logo (web/public/moments-foster-care.jpg).
        { id: id('5e', 1), contest_id: contest.id, name: 'Moments Foster Care', url: 'https://www.facebook.com/p/Moments-Foster-Care-Inc-100064839574671/', logo_path: 'shelters/moments-foster-care.jpg', payout_weight: 1 },
      ],
      contest_stats: submissions
        ? [{ contest_id: contest.id, year: 2026, beneficiary_split_pct: 30, entries: entries.length, votes: 0, gross_cents: 0, shelter_cents: 0 }]
        : [{ contest_id: contest.id, year: 2026, beneficiary_split_pct: 30, entries: entries.length, votes: totals.reduce((n, t) => n + t.votes, 0), gross_cents: gross, shelter_cents: Math.round(gross * 0.3), match_cents: current === 'bracket' ? 12500 : 0 }],
      recent_activity: [
        ...paid.slice().reverse().map((p) => ({ round_id: p.round_id, entry_id: p.entry_id, votes: p.votes, bonus_multiplier: p.multiplier, confirmed_at: p.confirmed_at })),
        ...live.slice(0, 10).map((t, i) => ({ round_id: t.round_id, entry_id: t.entry_id, votes: 25, bonus_multiplier: 1, confirmed_at: iso(now - (i + 1) * 7 * 60e3) })),
      ],
      side_awards: current === 'bracket' || current === 'complete'
        ? ['dog', 'cat', 'other'].map((sp) => {
          const best = entries.filter((e) => e.species === sp)
            .map((e) => ({ e, v: totals.find((t) => t.round_id === r1.id && t.entry_id === e.id)?.votes || 0 }))
            .sort((a, b) => b.v - a.v)[0]
          return { contest_id: contest.id, species: sp, entry_id: best.e.id, pet_name: best.e.pet_name, votes: best.v }
        })
        : [],
    }
  }

  // The toy checkout: an intent with no Stripe behind it, "paid" by mockPay,
  // so the whole flow through the thank-you screen can be walked. The front
  // end only takes this path with VITE_MOCK_CHECKOUT=true.
  function createCheckout(b) {
    const s = state()
    const pack = s.vote_packs.find((p) => p.slug === b.pack_slug)
    const entry = s.entries.find((e) => e.id === b.entry_id)
    const round = s.rounds.find((r) => r.id === b.round_id)
    if (!pack || !entry || !round) return { status: 400, body: { error: 'Choose a pack and a pet.' } }
    if (round.status !== 'open') return { status: 409, body: { error: 'Voting is closed for this round.' } }
    const t = Date.now()
    const bonus = s.bonus_windows.find((w) => new Date(w.starts_at).getTime() <= t && t < new Date(w.ends_at).getTime())
    const multiplier = bonus ? bonus.multiplier : 1
    const pid = `pi_mock_${intents.size + 1}`
    intents.set(pid, { id: pid, round_id: round.id, entry_id: entry.id, votes: pack.votes * multiplier, cents: pack.cents, multiplier })
    return { body: { mock: true, id: pid, votes: pack.votes * multiplier, cents: pack.cents, multiplier, pet_name: entry.pet_name, client_secret: null } }
  }
  function mockPay(b) {
    const i = intents.get(b.id)
    if (!i) return { status: 404, body: { error: 'No such checkout.' } }
    if (!paid.some((p) => p.id === i.id)) paid.push({ ...i, confirmed_at: iso(Date.now()) })
    return { body: { ok: true, paid_at: iso(Date.now()) } }
  }

  // The toy free vote: enough to walk the sheet's steps by hand or in a test.
  function freeVote(b) {
    const masked = (e) => `${e[0]}•••@${e.split('@')[1]}`
    const token = () => `mock${Math.random().toString(36).slice(2)}${'x'.repeat(40)}`.slice(0, 44)
    if (b.action === 'request') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '')) return { status: 400, body: { error: 'Please enter a valid email address.' } }
      const cid = id('fc', challenges.size + 1)
      challenges.set(cid, b.email)
      return { body: { challenge_id: cid, masked_email: masked(b.email), expires_at: iso(Date.now() + 15 * 60e3) } }
    }
    if (b.action === 'verify') {
      const email = challenges.get(b.challenge_id) || 'link@example.com'
      if (b.kind === 'code' && b.code !== '123456') return { body: { outcome: 'wrong', message: "That code doesn't match. 4 tries left." } }
      const t = token()
      devices.set(t, { email, voted: b.kind !== 'reminder' })
      return { body: { outcome: b.kind === 'reminder' ? 'verified' : 'cast', masked_email: masked(email), device_token: t, votes: 412 } }
    }
    const d = devices.get(b.device_token)
    if (b.action === 'status') return { body: d ? { known: true, masked_email: masked(d.email), voted_today: d.voted, next_vote_at: iso(Date.now() + 6 * HOUR) } : { known: false } }
    if (b.action === 'cast') {
      if (!d) return { body: { outcome: 'unknown_device', message: 'Confirm your email address to vote free.' } }
      if (d.voted) return { body: { outcome: 'already_voted', masked_email: masked(d.email) } }
      d.voted = true
      return { body: { outcome: 'cast', masked_email: masked(d.email), votes: 413 } }
    }
    return { body: { ok: true } }
  }

  // The owner's link: a goal, an opt-out. Nothing to check here; it says yes.
  const links = (b) => ({ body: b.action === 'goal' ? { ok: true, goal: b.goal } : { ok: true } })

  const functions = { 'create-checkout': createCheckout, 'mock-pay': mockPay, 'free-vote': freeVote, links }

  return {
    get phase() {
      return current
    },
    setPhase(next) {
      if (PHASES.includes(next)) current = next
      return current
    },
    state,
    // A table's rows, filtered the way PostgREST would; null for an unknown table.
    table(name, params) {
      const data = state()[name]
      return data ? query(data, params) : null
    },
    // An edge function's answer: { status?, body }, or null for one the mock lacks.
    call(name, body) {
      const fn = functions[name]
      return fn ? fn(body || {}) : null
    },
  }
}
