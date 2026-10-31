// The article widget's decisions, kept pure so they can be tested: where a tap
// may land, which card a phase shows, and which numbers go on it.

// Taps leave the article and land on the contest. Only WPR's own pages are
// acceptable destinations: anyone can put this widget in an iframe with any
// ?to=, and it must never become a branded link to somewhere else.
import { NEWSROOM } from '../config.js'

// The widget's ?to= allowlist: the newsroom's own site, with and without www.
const site = (() => {
  try {
    return new URL(NEWSROOM.url).hostname.replace(/^www\./, '')
  } catch {
    return 'wausaupilotandreview.com'
  }
})()
export const WIDGET_HOSTS = [site, `www.${site}`]

export const VIEWS = ['auto', 'enter', 'leaderboard', 'matchup', 'champion']

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCAL = new Set(['localhost', '127.0.0.1'])

export function safeTarget(raw, { fallback, allowHosts = WIDGET_HOSTS } = {}) {
  if (!raw) return fallback
  try {
    const u = new URL(raw)
    const ok = (u.protocol === 'https:' && allowHosts.includes(u.hostname)) || (u.protocol === 'http:' && LOCAL.has(u.hostname))
    if (!ok) return fallback
    u.hash = ''
    return u.toString()
  } catch {
    return fallback
  }
}

export function parseWidgetParams(search, { fallback, allowHosts } = {}) {
  const p = new URLSearchParams(search)
  const view = VIEWS.includes(p.get('view')) ? p.get('view') : 'auto'
  const pet = p.get('pet') || ''
  return {
    view,
    petId: UUID.test(pet) ? pet.toLowerCase() : null,
    to: safeTarget(p.get('to'), { fallback, allowHosts }),
  }
}

// `#/route` on the contest page the widget links to.
export const linkTo = (base, route = '') => `${base.replace(/#.*$/, '')}#/${route}`

const isBracket = (round) => Boolean(round && (round.kind === 'bracket' || round.seq > 1))

// Which card to draw. A requested view is honored only when the phase has
// something to put in it; otherwise the phase decides.
export function chooseView({ phase, round, requested = 'auto', petId = null }) {
  if (petId) return 'pet'
  const live = phase === 'voting' || phase === 'counting'
  const can = {
    enter: phase === 'submissions' || phase === 'coming',
    leaderboard: live && !isBracket(round),
    matchup: live && isBracket(round),
    champion: phase === 'complete',
  }
  if (requested !== 'auto' && can[requested]) return requested
  for (const view of ['enter', 'leaderboard', 'matchup', 'champion']) if (can[view]) return view
  if (phase === 'submissions_closed' || phase === 'intermission') return 'soon'
  return 'none'
}

// Top `n` of the Open Round with the database's tiebreak (most votes, then
// earliest entry). `candidates` are the entries for the highest totals, plus
// the earliest entries to fill in when few pets have votes yet.
export function topOpenRound(totals, candidates, n = 5) {
  const seen = new Set()
  return candidates
    .filter((e) => !seen.has(e.id) && seen.add(e.id))
    .map((entry) => ({ entry, votes: totals.get(entry.id)?.votes || 0 }))
    .sort((a, b) => b.votes - a.votes || Date.parse(a.entry.created_at) - Date.parse(b.entry.created_at))
    .slice(0, n)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}

// The ids worth fetching for the top `n`: the highest totals, with headroom
// for ties at the cut.
export function leaderIds(totals, n = 5) {
  return [...totals.entries()]
    .sort((a, b) => b[1].votes - a[1].votes)
    .slice(0, n * 2)
    .map(([id]) => id)
}

// The tightest race in the round, which is the one worth showing: the
// smallest gap between the two sides, earliest slot on a tie. Matchups with a
// removed (disqualified) side are skipped.
export function closestMatchup(matchups, totals, byId) {
  let best = null
  for (const m of matchups) {
    if (!byId.has(m.entry_a_id) || !byId.has(m.entry_b_id)) continue
    const gap = Math.abs((totals.get(m.entry_a_id)?.votes || 0) - (totals.get(m.entry_b_id)?.votes || 0))
    if (!best || gap < best.gap || (gap === best.gap && m.slot < best.matchup.slot)) best = { matchup: m, gap }
  }
  return best?.matchup || null
}

// Short countdown for a tight space: "2 days left", "5 hours left", "40 min left".
export function timeLeft(until, now = Date.now()) {
  const ms = Date.parse(until) - now
  if (!(ms > 0)) return null
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${Math.max(1, min)} min left`
  const hours = Math.floor(min / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} left`
  const days = Math.floor(hours / 24)
  return `${days} days left`
}
