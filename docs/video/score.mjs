// Scores the made-from-data Reels (entrants, openround): the bed trimmed so
// its closing chord lands on the end card, a swish on each page turn, a card
// landing on each photo in the pile, a pop on the tiles. Premixes that into
// one track, then the html-video mixer normalizes it (-16 LUFS) and muxes it
// onto the silent render and its texting copy.
//
//   node docs/video/score.mjs docs/video/out/entrants-entries.mp4 [more.mp4 ...]
//
// Writes <name>-scored.mp4 (and -scored-small.mp4 when <name>-small.mp4 exists)
// beside each input. The beds and effects live in docs/video/audio (generated
// with ElevenLabs, Nov. 10, 2026; not in git). Cue times follow the
// compositions' own timelines; change both together.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const A = (f) => join(HERE, 'audio', f)
const MIX = join(homedir(), '.claude', 'skills', 'html-video', 'scripts', 'mix.mjs')

// bed: file, seconds skipped at the start, tempo factor to land on 15.0 s.
// turns/cards/pops: cue times in seconds.
const CUES = {
  entrants: {
    bed: ['bed-entrants.mp3', 1.5, 1],
    turns: [2.0, 6.9, 11.2],
    cards: [2.57, 3.29, 4.01, 4.73, 5.45, 6.17],
    pops: [7.35, 7.75, 8.15, 8.55, 9.05],
  },
  'openround-open': {
    bed: ['bed-openround.mp3', 1.5, 1],
    turns: [2.2, 6.4, 10.6],
    cards: [],
    pops: [2.7, 3.0, 3.3, 3.75, 4.1, 4.4, 7.0, 8.0, 9.0],
  },
  'openround-race': {
    bed: ['bed-openround.mp3', 1.5, 1],
    turns: [2.0, 11.0],
    cards: [],
    pops: [5.8, 6.4],
  },
  'openround-lastchance': {
    bed: ['bed-openround.mp3', 1.5, 1],
    turns: [2.2, 10.4],
    cards: [3.0, 3.32, 3.64, 3.96, 4.28],
    cardGain: 0.6, // five landings close together
    pops: [],
  },
}

for (const video of process.argv.slice(2)) {
  const name = basename(video, '.mp4')
  const key = Object.keys(CUES).sort((a, b) => b.length - a.length).find((k) => name.startsWith(k))
  if (!key) throw new Error(`no cue sheet for ${name}`)
  const c = CUES[key]
  const [bed, skip, tempo] = c.bed
  // Inputs: the bed, then one input per effect, delayed to its cue. Levels
  // are relative to the bed, which mix.mjs then plays at 1.0.
  const inputs = ['-i', A(bed)]
  const chains = [`[0:a]atrim=start=${skip},asetpts=PTS-STARTPTS,atempo=${tempo.toFixed(4)},afade=t=in:d=0.12,volume=0.55[b]`]
  const fx = [
    ...c.turns.map((t, i) => [t, i % 2 ? 'turn2.mp3' : 'turn1.mp3', 1.1]),
    ...c.cards.map((t, i) => [t, i % 2 ? 'card2.mp3' : 'card1.mp3', c.cardGain ?? 0.9]),
    ...c.pops.map((t, i) => [t, i % 2 ? 'pop2.mp3' : 'pop1.mp3', 0.6]),
  ]
  fx.forEach(([t, file, gain], i) => {
    inputs.push('-i', A(file))
    // The effect files open with about 0.12 s of silence: cue them that early.
    const ms = Math.max(0, Math.round((t - 0.12) * 1000))
    chains.push(`[${i + 1}:a]adelay=${ms}|${ms},volume=${gain}[f${i}]`)
  })
  const labels = ['[b]', ...fx.map((_, i) => `[f${i}]`)].join('')
  const graph = `${chains.join(';')};${labels}amix=inputs=${fx.length + 1}:normalize=0:duration=first,atrim=end=15,apad=whole_dur=15[out]`
  const premix = join(dirname(video), `${name}-score.wav`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', graph, '-map', '[out]', '-ar', '48000', '-ac', '2', premix], { stdio: 'inherit' })

  const small = join(dirname(video), `${name}-small.mp4`)
  const args = [MIX, video, '--music', premix, '--bed', '1.0', '--stretch', '1', '--out', join(dirname(video), `${name}-scored.mp4`)]
  if (existsSync(small)) args.push('--small', small, '--small-out', join(dirname(video), `${name}-scored-small.mp4`))
  execFileSync(process.execPath, args, { stdio: 'inherit' })
}
