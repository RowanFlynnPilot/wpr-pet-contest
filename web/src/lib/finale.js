// The finale (0031): a live reveal of the champion, set by staff. The site
// counts down to it, links to the stream while it runs, then to the replay.
// It never holds a result back: the final count is public as voting closes.

const HOUR = 3600e3
export const FINALE_LIVE = 2 * HOUR // how long "live now" shows
const SOON = 4 * 24 * HOUR // how far ahead the countdown appears
const REPLAY = 14 * 24 * HOUR // how long the replay link stays up

// { state: 'soon' | 'live' | 'replay', at, url } or null.
export function finaleState(contest, phase, now = Date.now()) {
  const at = contest?.finale_at ? Date.parse(contest.finale_at) : NaN
  if (!Number.isFinite(at)) return null
  if (!['voting', 'counting', 'intermission', 'complete'].includes(phase)) return null
  const url = contest.finale_url || null
  const t = Number(now)
  if (t < at) return at - t <= SOON ? { state: 'soon', at: contest.finale_at, url } : null
  if (t < at + FINALE_LIVE) return url ? { state: 'live', at: contest.finale_at, url } : null
  if (phase === 'complete' && url && t < at + REPLAY) return { state: 'replay', at: contest.finale_at, url }
  return null
}
