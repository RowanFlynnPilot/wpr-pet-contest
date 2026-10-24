// The demo build: the public site with its backend inside the browser
// (src/demo/shim.js), as static files that run anywhere, a phone included,
// with no Supabase, no Stripe and no server. For showing the newsroom.
//
//   npm --prefix web run demo          -> web/dist-demo/
//
// Everything in it is placeholder data except the partner, the packs, the
// rules and the copy. Entries and sign-in are switched off; the checkout
// pretends.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { photo, PHOTO_COUNT } from '../src/demo/contest.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'dist-demo')

async function main() {
  await build({ root: ROOT, mode: 'demo', configFile: join(ROOT, 'vite.config.js'), build: { outDir: OUT, emptyOutDir: true }, logLevel: 'warn' })

  // The photos, where VITE_STORAGE_URL=. makes the app look for them.
  const pets = join(OUT, 'storage', 'v1', 'object', 'public', 'pets')
  await mkdir(join(pets, 'mock'), { recursive: true })
  await mkdir(join(pets, 'shelters'), { recursive: true })
  for (let n = 1; n <= PHOTO_COUNT; n++) await writeFile(join(pets, 'mock', `${n}.svg`), photo(n))
  await writeFile(join(pets, 'shelters', 'moments-foster-care.png'), await readFile(join(ROOT, 'public', 'moments-foster-care.png')))

  // Every file, relative, for whoever publishes the folder.
  const files = []
  async function walk(dir) {
    for (const d of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, d.name)
      if (d.isDirectory()) await walk(p)
      else files.push(relative(OUT, p).split('\\').join('/'))
    }
  }
  await walk(OUT)
  await writeFile(join(OUT, 'files.json'), JSON.stringify(files.filter((f) => f !== 'files.json').sort(), null, 2))
  console.log(`[demo] ${files.length} files in ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
