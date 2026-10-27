// Writes the cuts of the walkthrough from walkthrough.src.html, with the
// capture's rects (shots/shots.json) inlined: walkthrough.html (WPR's teaser,
// ending on Nov. 14) and walkthrough-newsrooms.html (ending on the demo, for
// the page for other newsrooms), each in portrait (9:16, no suffix), -wide
// (16:9) and -square.
//
//   node docs/video/capture.mjs && node docs/video/build.mjs
//   node ~/.claude/skills/html-video/scripts/render.mjs docs/video/walkthrough.html --out docs/video/out/walkthrough.mp4 --small
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const src = await readFile(join(HERE, 'walkthrough.src.html'), 'utf8')
const shots = await readFile(join(HERE, 'shots', 'shots.json'), 'utf8')
for (const [cut, base] of [['contest', 'walkthrough'], ['newsroom', 'walkthrough-newsrooms']]) {
  for (const [format, suffix] of [['portrait', ''], ['wide', '-wide'], ['square', '-square']]) {
    const file = `${base}${suffix}.html`
    await writeFile(join(HERE, file), src.replace('__CUT__', cut).replace('__FORMAT__', format).replace('__LENGTH__', 'full').replace('__SHOTS__', shots.trim()))
    console.log('wrote', file)
  }
}
// The 15-second reader cut, for Stories and boosted posts.
for (const [format, suffix] of [['portrait', ''], ['square', '-square']]) {
  const file = `walkthrough-15s${suffix}.html`
  await writeFile(join(HERE, file), src.replace('__CUT__', 'contest').replace('__FORMAT__', format).replace('__LENGTH__', 'short').replace('__SHOTS__', shots.trim()))
  console.log('wrote', file)
}
