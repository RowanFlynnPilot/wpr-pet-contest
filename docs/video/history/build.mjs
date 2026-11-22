// "How the race unfolded": a bar-chart race of the Open Round so far, built
// from the public hour-by-hour counts (entry_round_hourly, 0040).
//
//   SUPABASE_ANON_KEY=... node docs/video/history/build.mjs [--sample] [--round <seq>]
//   node ~/.claude/skills/html-video/scripts/render.mjs docs/video/history/history.html \
//     --out docs/video/out/history.mp4 --small
//   node docs/video/score.mjs docs/video/out/history.mp4
//
// Counts are as of the build and the end card says so. --sample makes up a
// history and stamps every frame SAMPLE, never to be posted.
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SAMPLE = process.argv.includes('--sample')
const SEQ = Number(process.argv[process.argv.indexOf('--round') + 1]) || 1
const URL_BASE = process.env.SUPABASE_URL || 'https://btgkoaybngtmdanpjndp.supabase.co'
const KEY = process.env.SUPABASE_ANON_KEY
if (!KEY) throw new Error('Set SUPABASE_ANON_KEY (the public anon key the site ships).')
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }
async function rest(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

// AP style, Central time.
const TZ = 'America/Chicago'
const AP_MONTH = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']
const AP_DAY = { Sunday: 'Sun.', Monday: 'Mon.', Tuesday: 'Tue.', Wednesday: 'Wed.', Thursday: 'Thu.', Friday: 'Fri.', Saturday: 'Sat.' }
function parts(iso) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  const o = Object.fromEntries(f.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return { weekday: o.weekday, month: AP_MONTH[Number(o.month) - 1], day: o.day, hour: Number(o.hour), minute: o.minute, pm: o.dayPeriod === 'PM' }
}
const apTime = (p) => (p.hour === 12 && p.minute === '00' ? (p.pm ? 'noon' : 'midnight') : `${p.hour}${p.minute === '00' ? '' : `:${p.minute}`} ${p.pm ? 'p.m.' : 'a.m.'}`)
const apWhen = (iso) => { const p = parts(iso); return `${p.weekday}, ${p.month} ${p.day}, at ${apTime(p)}` }
const apAsOf = (iso) => { const p = parts(iso); return `${apTime(p)} ${p.month} ${p.day}` }
const apStart = (iso) => { const p = parts(iso); return `${p.weekday}, ${apTime(p)}` }

const [contest] = await rest('contests?select=id,name,bracket_size&status=neq.draft&order=year.desc&limit=1')
const [round] = await rest(`rounds?select=id,seq,status,opens_at,closes_at&contest_id=eq.${contest.id}&seq=eq.${SEQ}`)
const entries = await rest(`entries?select=id,pet_name,town,photo_path,created_at&contest_id=eq.${contest.id}&status=eq.approved&order=created_at`)
const now = new Date().toISOString()

// Hour -> votes per pet. Real: the public view. Sample: a made-up race with
// a few lead changes, deterministic from the pet's index.
let rows
if (SAMPLE) {
  rows = []
  const start = Date.parse(round.opens_at)
  const hours = Math.max(6, Math.floor((Date.now() - start) / 3600e3))
  entries.slice(0, 24).forEach((e, i) => {
    for (let h = 0; h < hours; h++) {
      const surge = (h + i * 3) % 11 === 0 ? 40 + (i % 5) * 15 : 0
      const n = Math.round(((i * 7) % 13) * 0.6 + surge + (((h * 31 + i * 17) % 9) > 6 ? 5 : 0))
      if (n) rows.push({ entry_id: e.id, hour: new Date(start + h * 3600e3).toISOString(), votes: n })
    }
  })
} else {
  rows = await rest(`entry_round_hourly?select=entry_id,hour,votes&round_id=eq.${round.id}&order=hour`)
}
if (!rows.length) throw new Error('No votes in that round yet.')

// Cumulative series per pet on one shared hourly clock.
const t0 = Date.parse(round.opens_at)
const hourList = [...new Set(rows.map((r) => Date.parse(r.hour)))].sort((a, b) => a - b)
const first = Math.min(t0, hourList[0])
const last = Math.max(hourList[hourList.length - 1] + 3600e3, Math.min(Date.now(), Date.parse(round.closes_at)))
const steps = Math.max(2, Math.ceil((last - first) / 3600e3))
const byPet = new Map()
for (const r of rows) {
  const i = Math.min(steps - 1, Math.floor((Date.parse(r.hour) - first) / 3600e3))
  if (!byPet.has(r.entry_id)) byPet.set(r.entry_id, new Array(steps).fill(0))
  byPet.get(r.entry_id)[i] += r.votes
}
// cum[i] is the total at the START of hour i, so the race opens at zero and
// cum[steps] is the total now.
const series = [...byPet.entries()].map(([id, inc]) => {
  const cum = [0]
  inc.reduce((s, n, i) => (cum[i + 1] = s + n), 0)
  return { id, cum }
})
// Keep the pets that ever reached the top 12, so the race stays readable.
const everTop = new Set()
for (let i = 0; i <= steps; i++) {
  series.map((s) => [s.id, s.cum[i]]).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([id]) => everTop.add(id))
}

// Photos, shared with the other Reels.
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
const entryById = new Map(entries.map((e) => [e.id, e]))
const pets = await Promise.all(
  series
    .filter((s) => everTop.has(s.id) && entryById.has(s.id))
    .map(async (s) => {
      const e = entryById.get(s.id)
      return { name: e.pet_name, town: e.town, src: await photo(e, 200), cum: s.cum }
    }),
)
const total = series.reduce((sum, s) => sum + s.cum[steps], 0)
console.log(`${entries.length} pets; ${series.length} with votes; ${total} votes over ${steps} hours; ${pets.length} in the race${SAMPLE ? '; SAMPLE' : ''}`)

const data = {
  sample: SAMPLE,
  contest: contest.name,
  url: 'wausaupilotandreview.com/pet-contest',
  start: first,
  nowMs: Date.now(),
  stepMs: 3600e3,
  steps,
  startLabel: apStart(round.opens_at),
  closes: apWhen(round.closes_at),
  asOf: apAsOf(now),
  total,
  pets,
}
const src = await readFile(join(HERE, 'history.src.html'), 'utf8')
for (const [format, suffix] of [['portrait', ''], ['square', '-square']]) {
  const page = src.replace('__FORMAT__', () => format).replace('__DATA__', () => JSON.stringify(data))
  await writeFile(join(HERE, `history${suffix}.html`), page)
  console.log(`wrote history${suffix}.html`)
}
