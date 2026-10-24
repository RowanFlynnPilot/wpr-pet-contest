#!/usr/bin/env node
// A stand-in for the Supabase API, for looking at the public site without a
// database: screenshots, accessibility and speed audits, sales demos. Serves
// the public reads the front end makes (PostgREST-style filters on a fixed,
// deterministic contest) and generated placeholder photos. Reads only; the
// edge functions answer 503.
//
//   node scripts/mock-api.mjs                     # http://127.0.0.1:8787, phase "open"
//   VITE_SUPABASE_URL=http://127.0.0.1:8787 VITE_SUPABASE_ANON_KEY=mock npm run dev
//
// Switch the contest's phase while it runs:
//   curl http://127.0.0.1:8787/__phase?set=submissions   (submissions | open | bracket | complete)

import { createServer } from 'node:http'

// Not in the 49152+ range: Windows reserves chunks of it for Hyper-V and WSL.
const PORT = Number(process.env.PORT || 8787)
let phase = process.env.PHASE || 'open'

const NAMES = ['Biscuit', 'Luna', 'Moose', 'Pickles', 'Juniper', 'Otis', 'Waffles', 'Maple', 'Tater Tot', 'Clementine',
  'Rocco', 'Pepper', 'Gus', 'Noodle', 'Hazel', 'Brisket', 'Olive', 'Ziggy', 'Butterbean', 'Mabel',
  'Sir Reginald Fluffington III', 'Pretzel', 'Dot', 'Ranger']
const TOWNS = ['Wausau', 'Weston', 'Schofield', 'Rothschild', 'Mosinee', 'Kronenwetter', 'Rib Mountain', 'Merrill']
const SPECIES = ['dog', 'cat', 'dog', 'other']
const HOUR = 3600e3
const DAY = 24 * HOUR
const id = (prefix, n) => `${prefix}000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const iso = (ms) => new Date(ms).toISOString()

// Deterministic "random" so every run draws the same contest.
const rand = (seed) => {
  let x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

function contestState() {
  const now = Date.now()
  const entries = NAMES.map((name, i) => ({
    id: id('e1', i + 1),
    contest_id: id('c1', 1),
    pet_name: name,
    species: SPECIES[i % SPECIES.length],
    town: TOWNS[i % TOWNS.length],
    caption: i % 3 === 0 ? 'Sleeps 20 hours a day and guards the couch for the other four.' : null,
    photo_path: `mock/${i + 1}.svg`,
    thumb_path: `mock/${i + 1}.svg`,
    shelter_id: i === 7 ? id('5e', 1) : null,
    seed: null,
    status: 'approved',
    created_at: iso(now - 9 * DAY + i * HOUR),
  }))

  const submissions = phase === 'submissions'
  const contest = {
    id: id('c1', 1), year: 2026, name: 'Cutest Pet in Marathon County',
    status: submissions ? 'submissions_open' : phase === 'complete' ? 'complete' : 'voting',
    beneficiary_split_pct: 30, bracket_size: 16, bracket_round_hours: 48,
    submissions_open_at: iso(submissions ? now - 3 * DAY : now - 14 * DAY),
    submissions_close_at: iso(submissions ? now + 4 * DAY : now - 7 * DAY),
  }

  const totalsFor = (roundSeq, ids) => ids.map((eid, i) => ({
    entry_id: eid,
    votes: Math.round(rand(roundSeq * 100 + i) * (roundSeq === 1 ? 400 : 150)) + 5,
  }))

  const rounds = []
  const matchups = []
  const totals = []
  const r1 = {
    id: id('r1', 1), contest_id: contest.id, seq: 1, kind: 'open',
    status: submissions ? 'pending' : phase === 'open' ? 'open' : 'resolved',
    opens_at: iso(submissions ? now + 4 * DAY : now - 5 * DAY),
    closes_at: iso(submissions ? now + 11 * DAY : phase === 'open' ? now + 2 * DAY + 5 * HOUR : now - 3 * DAY),
    resolved_at: phase === 'open' || submissions ? null : iso(now - 3 * DAY + 600e3),
  }
  rounds.push(r1)
  if (!submissions) {
    for (const t of totalsFor(1, entries.map((e) => e.id))) totals.push({ round_id: r1.id, ...t })
  }

  if (phase === 'bracket' || phase === 'complete') {
    const ranked = [...entries].sort((a, b) =>
      (totals.find((t) => t.entry_id === b.id)?.votes || 0) - (totals.find((t) => t.entry_id === a.id)?.votes || 0))
    ranked.slice(0, 16).forEach((e, i) => { e.seed = i + 1 })
    const order = [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]
    let field = order.map((s) => ranked[s - 1])
    const lastSeq = phase === 'complete' ? 5 : 2
    for (let seq = 2; seq <= lastSeq; seq++) {
      const open = phase === 'bracket' && seq === lastSeq
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

  const live = totals.filter((t) => rounds.find((r) => r.id === t.round_id)?.status === 'open')
  const gross = totals.reduce((n, t) => n + t.votes * 80, 0)
  return {
    contests: [contest],
    rounds,
    entries,
    matchups,
    entry_round_totals: totals.map((t) => ({ ...t, amount_cents: t.votes * 80 })),
    vote_packs: [
      ['starter', 'Starter', 5, 500, false], ['fan', 'Fan', 25, 2000, true], ['superfan', 'Superfan', 75, 5000, false],
      ['champion', 'Champion', 200, 10000, false], ['legend', 'Legend', 600, 25000, false],
    ].map(([slug, label, votes, cents, featured], i) => ({ id: id('a1', i + 1), contest_id: contest.id, slug, label, votes, cents, sort: i + 1, featured, active: true })),
    bonus_windows: phase === 'open'
      ? [{ id: id('b1', 1), contest_id: contest.id, starts_at: iso(now - HOUR), ends_at: iso(now + HOUR), multiplier: 2, label: 'Double Vote Hour', sponsor_name: 'Example Pet Supply', sponsor_url: 'https://example.org' }]
      : [],
    shelters: [
      { id: id('5e', 1), contest_id: contest.id, name: 'Humane Society of Marathon County', url: 'https://example.org', logo_path: null, payout_weight: 1 },
      { id: id('5e', 2), contest_id: contest.id, name: 'Northwoods Rescue', url: 'https://example.org', logo_path: null, payout_weight: 1 },
    ],
    contest_stats: submissions
      ? [{ contest_id: contest.id, year: 2026, beneficiary_split_pct: 30, entries: entries.length, votes: 0, gross_cents: 0, shelter_cents: 0 }]
      : [{ contest_id: contest.id, year: 2026, beneficiary_split_pct: 30, entries: entries.length, votes: totals.reduce((n, t) => n + t.votes, 0), gross_cents: gross, shelter_cents: Math.round(gross * 0.3) }],
    recent_activity: live.slice(0, 10).map((t, i) => ({ round_id: t.round_id, entry_id: t.entry_id, votes: 25, bonus_multiplier: 1, confirmed_at: iso(now - (i + 1) * 7 * 60e3) })),
    side_awards: phase === 'bracket' || phase === 'complete'
      ? ['dog', 'cat', 'other'].map((sp) => {
        const best = entries.filter((e) => e.species === sp)
          .map((e) => ({ e, v: totals.find((t) => t.round_id === r1.id && t.entry_id === e.id)?.votes || 0 }))
          .sort((a, b) => b.v - a.v)[0]
        return { contest_id: contest.id, species: sp, entry_id: best.e.id, pet_name: best.e.pet_name, votes: best.v }
      })
      : [],
  }
}

// PostgREST filters the front end uses: eq, neq, in, order, limit, offset.
function query(rows, params) {
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

function photo(n) {
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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Range',
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end()

  if (url.pathname === '/__phase') {
    const set = url.searchParams.get('set')
    if (['submissions', 'open', 'bracket', 'complete'].includes(set)) phase = set
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ phase }))
  }

  const pic = url.pathname.match(/\/storage\/v1\/(?:object|render\/image)\/public\/pets\/mock\/(\d+)\.svg$/)
  if (pic) {
    res.writeHead(200, { ...CORS, 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' })
    return res.end(photo(Number(pic[1])))
  }

  const table = url.pathname.match(/\/rest\/v1\/([a-z_]+)$/)?.[1]
  const data = table && contestState()[table]
  if (data) {
    const rows = query(data, url.searchParams)
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json', 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` })
    return res.end(JSON.stringify(rows))
  }

  if (url.pathname.startsWith('/functions/v1/')) {
    res.writeHead(503, { ...CORS, 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'This is a mock backend: checkout and entries are switched off.' }))
  }

  res.writeHead(404, { ...CORS, 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ code: 'PGRST205', message: `mock has no ${url.pathname}` }))
}).listen(PORT, '127.0.0.1', () => console.log(`mock API on http://127.0.0.1:${PORT} (phase: ${phase})`))
