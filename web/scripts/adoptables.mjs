// adoptables.json: the newsroom's adoptable pets, slimmed for the "Meet a
// pet" button (src/components/AdoptButton.jsx). Built at deploy from the
// newsroom's feed (WPR: the adopt widget's pet-data.json, about 480 KB) into
// what a phone can afford: name, species, breed, age and a square thumbnail.
//
//   node scripts/adoptables.mjs <outDir>      (npm run build runs it into dist/)
//
// A failed fetch writes nothing and exits 0: the button falls back to the
// featured pet, then to a plain invitation. Never breaks a deploy.
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DEFAULT_NEWSROOM, NEWSROOMS } from '../src/newsrooms.js'

// "Argus *Barn Cat*" and "Rowdy (fka Buddy)" are shelter notes, not names.
export function cleanName(name) {
  return String(name || '')
    .replace(/\*[^*]*\*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Adopt-a-Pet's image CDN takes the crop in the path: a 120px square at 2x
// (about 8 KB) instead of the 400px 4:3 original (about 26 KB).
export function thumb(url) {
  return /media\.adoptapet\.com\/image\/upload\//.test(url)
    ? url.replace(/\/image\/upload\/[^/]+\//, '/image/upload/c_auto,g_auto,w_120,ar_1:1,dpr_2/')
    : url
}

export function slim(data) {
  const pets = []
  let total = 0
  for (const list of Object.values(data?.shelters || {})) {
    for (const p of Array.isArray(list) ? list : Object.values(list || {})) {
      if (!p || p.placeholder) continue
      total++
      // Only real photos: some shelters list a directory logo instead.
      if (!p.photo || !/media\.adoptapet\.com/.test(p.photo)) continue
      const name = cleanName(p.name)
      if (!name || name.length > 24) continue
      pets.push({ name, species: p.species || null, breed: p.breed || null, age: p.age || null, photo: thumb(p.photo) })
    }
  }
  return { updated: data?.lastUpdated || null, total, pets }
}

export async function writeAdoptables(outDir, key = process.env.VITE_NEWSROOM || DEFAULT_NEWSROOM) {
  const feed = NEWSROOMS[key]?.adoptablesFeed
  if (!feed) {
    console.log(`[adoptables] ${key} has no adoptables feed; skipping`)
    return null
  }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    const res = await fetch(feed, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const out = slim(await res.json())
    if (!out.pets.length) throw new Error('no pets with photos in the feed')
    await mkdir(outDir, { recursive: true })
    const file = join(outDir, 'adoptables.json')
    await writeFile(file, JSON.stringify(out))
    console.log(`[adoptables] ${out.pets.length} of ${out.total} pets with photos -> ${file}`)
    return out
  } catch (err) {
    console.warn(`[adoptables] skipped (${err.message}); the button falls back`)
    return null
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeAdoptables(resolve(process.argv[2] || 'dist'))
}
