// "Meet the entrants": a 15-second Reel made from the pets approved so far.
// Reads the public API (the same anon key the site ships), downloads each
// photo once, and writes one page per cut and format from entrants.src.html.
// Pets, names and towns only, which the rules' photo release covers; never
// an owner.
//
//   SUPABASE_ANON_KEY=... node docs/video/entrants/build.mjs
//   node ~/.claude/skills/html-video/scripts/render.mjs docs/video/entrants/entrants-entries.html \
//     --out docs/video/out/entrants-entries.mp4 --small
//
// The hook pet, the six featured pets and each cut's words are in
// entrants.config.json. A name there that is not approved is skipped.
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const URL_BASE = process.env.SUPABASE_URL || 'https://btgkoaybngtmdanpjndp.supabase.co'
const KEY = process.env.SUPABASE_ANON_KEY
if (!KEY) throw new Error('Set SUPABASE_ANON_KEY (the public anon key the site ships).')
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function rest(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

const config = JSON.parse(await readFile(join(HERE, 'entrants.config.json'), 'utf8'))
const [contest] = await rest('contests?select=id,name,status,submissions_close_at&status=neq.draft&order=year.desc&limit=1')
const entries = await rest(
  `entries?select=id,pet_name,species,town,photo_path,thumb_path,created_at&contest_id=eq.${contest.id}&status=eq.approved&order=created_at`,
)
console.log(`${entries.length} approved pets in ${contest.name}`)

// Width-only renders keep the whole photo (resize=contain; see web/src/lib/photos.js).
const PHOTOS = join(HERE, 'photos')
await mkdir(PHOTOS, { recursive: true })
async function photo(entry, width) {
  const file = `${entry.id}-w${width}.jpg`
  if (!existsSync(join(PHOTOS, file))) {
    const clean = entry.photo_path.split('/').map(encodeURIComponent).join('/')
    const res = await fetch(`${URL_BASE}/storage/v1/render/image/public/pets/${clean}?width=${width}&resize=contain&quality=82`)
    if (!res.ok) throw new Error(`${entry.pet_name}: photo ${res.status}`)
    await writeFile(join(PHOTOS, file), Buffer.from(await res.arrayBuffer()))
  }
  return `photos/${file}`
}

const byName = new Map(entries.map((e) => [e.pet_name.trim().toLowerCase(), e]))
const pick = (name) => byName.get(String(name).trim().toLowerCase())
const hook = pick(config.hook) || entries[0]
const featured = config.featured.map(pick).filter((e) => e && e !== hook).slice(0, 6)
for (const name of [config.hook, ...config.featured]) if (!pick(name)) console.warn(`not approved, skipped: ${name}`)

const SPECIES = { dog: 'Dog', cat: 'Cat', other: 'Pet' }
const data = {
  count: entries.length,
  url: config.contestUrl,
  hook: { name: hook.pet_name, src: await photo(hook, 1400) },
  featured: await Promise.all(
    featured.map(async (e) => ({ name: e.pet_name, town: e.town, species: SPECIES[e.species] || 'Pet', src: await photo(e, 1000) })),
  ),
  wall: await Promise.all(entries.map(async (e) => ({ name: e.pet_name, src: await photo(e, 400) }))),
}

const src = await readFile(join(HERE, 'entrants.src.html'), 'utf8')
for (const [cut, words] of Object.entries(config.cuts)) {
  for (const [format, suffix] of [['portrait', ''], ['square', '-square']]) {
    const file = `entrants-${cut}${suffix}.html`
    const page = src.replace('__FORMAT__', () => format).replace('__DATA__', () => JSON.stringify({ ...data, ...words }))
    await writeFile(join(HERE, file), page)
    console.log('wrote', file)
  }
}
