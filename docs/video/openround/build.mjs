// The Open Round Reels, built from live data like docs/video/entrants:
//   open        "Voting is open": the whole field, every pet at zero, how to vote
//   race        the standings as of the build, with the bracket line under No. 16
//   lastchance  Last Chance: the pool racing for the last seed
//
//   SUPABASE_ANON_KEY=... node docs/video/openround/build.mjs [--sample]
//   node ~/.claude/skills/html-video/scripts/render.mjs docs/video/openround/openround-race.html \
//     --out docs/video/out/openround-race.mp4 --small
//
// Counts are the public entry_round_totals for round 1 at the moment of the
// build, and the race and Last Chance cuts print "as of" that moment. Rebuild
// right before posting. Before voting there is nothing to count: --sample
// makes up numbers and stamps every frame SAMPLE, never to be posted.
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SAMPLE = process.argv.includes('--sample')
const URL_BASE = process.env.SUPABASE_URL || 'https://btgkoaybngtmdanpjndp.supabase.co'
const KEY = process.env.SUPABASE_ANON_KEY
if (!KEY) throw new Error('Set SUPABASE_ANON_KEY (the public anon key the site ships).')
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }
async function rest(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

// ---- AP style, Central time: "Friday, Dec. 4, at 8 p.m.", "9:30 a.m. Nov. 28" ----
const TZ = 'America/Chicago'
const AP_MONTH = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']
function parts(iso) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  const o = Object.fromEntries(f.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return { weekday: o.weekday, month: AP_MONTH[Number(o.month) - 1], day: o.day, hour: Number(o.hour), minute: o.minute, pm: o.dayPeriod === 'PM' }
}
function apTime(p) {
  if (p.hour === 12 && p.minute === '00') return p.pm ? 'noon' : 'midnight'
  return `${p.hour}${p.minute === '00' ? '' : `:${p.minute}`} ${p.pm ? 'p.m.' : 'a.m.'}`
}
const apWhen = (iso) => { const p = parts(iso); return `${p.weekday}, ${p.month} ${p.day}, at ${apTime(p)}` }
const apAsOf = (iso) => { const p = parts(iso); return `${apTime(p)} ${p.month} ${p.day}` }

// ---- The contest, round 1, the field ----
const [contest] = await rest('contests?select=id,name,status,bracket_size,free_vote_enabled,last_chance_enabled&status=neq.draft&order=year.desc&limit=1')
const [round] = await rest(`rounds?select=id,status,opens_at,closes_at,overtime_closes_at&contest_id=eq.${contest.id}&seq=eq.1`)
const entries = await rest(`entries?select=id,pet_name,species,town,photo_path,created_at&contest_id=eq.${contest.id}&status=eq.approved&order=created_at`)
const packs = await rest(`vote_packs?select=cents&contest_id=eq.${contest.id}&active=eq.true&order=cents&limit=1`)
const bracket = contest.bracket_size || 16
console.log(`${entries.length} approved pets; round 1 ${round.status}${SAMPLE ? '; SAMPLE numbers' : ''}`)

// Votes: the public totals (free votes are already inside `votes`), or made-up ones.
let votes = new Map()
if (SAMPLE) {
  entries.forEach((e, i) => votes.set(e.id, Math.round(1400 / (1 + i * 0.35) + ((i * 37) % 23))))
} else {
  for (const r of await rest(`entry_round_totals?select=entry_id,votes&round_id=eq.${round.id}`)) votes.set(r.entry_id, r.votes)
}
// Open Round order: most votes, then earliest entry (the published tiebreak).
const standings = entries
  .map((e) => ({ ...e, votes: votes.get(e.id) || 0 }))
  .sort((a, b) => b.votes - a.votes || new Date(a.created_at) - new Date(b.created_at))
  .map((e, i) => ({ ...e, place: i + 1 }))

// Last Chance pool: the snapshot when staff started it, else (sample) places
// bracket..bracket+4.
let pool = []
if (!SAMPLE && round.overtime_closes_at) {
  const field = await rest(`last_chance_field?select=entry_id,place,pool&round_id=eq.${round.id}&pool=eq.true&order=place`)
  pool = field.map((f) => ({ ...standings.find((s) => s.id === f.entry_id), place: f.place })).filter((p) => p.id)
} else {
  pool = standings.slice(bracket - 1, bracket + 4)
}

// ---- Photos, shared with the entrants Reel ----
const PHOTOS = join(HERE, '..', 'entrants', 'photos')
await mkdir(PHOTOS, { recursive: true })
async function photo(entry, width) {
  const file = `${entry.id}-w${width}.jpg`
  if (!existsSync(join(PHOTOS, file))) {
    const clean = entry.photo_path.split('/').map(encodeURIComponent).join('/')
    const res = await fetch(`${URL_BASE}/storage/v1/render/image/public/pets/${clean}?width=${width}&resize=contain&quality=82`)
    if (!res.ok) throw new Error(`${entry.pet_name}: photo ${res.status}`)
    await writeFile(join(PHOTOS, file), Buffer.from(await res.arrayBuffer()))
  }
  return `../entrants/photos/${file}`
}
const pet = async (e, width) => ({ name: e.pet_name, town: e.town, votes: e.votes, place: e.place, src: await photo(e, width) })

const config = JSON.parse(await readFile(join(HERE, 'openround.config.json'), 'utf8'))
const byName = (n) => standings.find((s) => s.pet_name.trim().toLowerCase() === String(n).trim().toLowerCase())
const now = new Date().toISOString()
const closes = round.closes_at
const data = {
  sample: SAMPLE,
  url: config.contestUrl,
  count: entries.length,
  bracket,
  freeVote: Boolean(contest.free_vote_enabled),
  lastChance: Boolean(contest.last_chance_enabled),
  fromDollars: packs[0] ? `$${(packs[0].cents / 100).toFixed(packs[0].cents % 100 ? 2 : 0)}` : null,
  closes: apWhen(closes),
  lastChanceCloses: round.overtime_closes_at ? apWhen(round.overtime_closes_at) : config.lastChanceCloses,
  asOf: apAsOf(now),
  hook: await pet(byName(config.openHook) || standings[0], 1400),
  field: await Promise.all(standings.map((e) => pet(e, 400))),
  zeroes: await Promise.all(config.zeroes.map(byName).filter(Boolean).slice(0, 9).map((e) => pet(e, 600))),
  leader: await pet(standings[0], 1400),
  rows: await Promise.all(standings.slice(0, bracket + (contest.last_chance_enabled ? 6 : 3)).map((e) => pet(e, 200))),
  pool: await Promise.all(pool.map((e) => pet(e, 800))),
}

const src = await readFile(join(HERE, 'openround.src.html'), 'utf8')
for (const cut of ['open', 'race', 'lastchance']) {
  for (const [format, suffix] of [['portrait', ''], ['square', '-square']]) {
    const file = `openround-${cut}${suffix}.html`
    const page = src.replace('__CUT__', () => cut).replace('__FORMAT__', () => format).replace('__DATA__', () => JSON.stringify(data))
    await writeFile(join(HERE, file), page)
    console.log('wrote', file)
  }
}
