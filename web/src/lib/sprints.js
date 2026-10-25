// Sprints (0030): a sponsor's prize for the pet with the most votes in a set
// window. The prize is the sponsor's; sprint votes are ordinary votes.
import { apDate, apDateTime, apTime } from './format.js'

const HOUR = 3600e3
const ms = (v) => new Date(v).getTime()

// The one sprint worth showing now: the one running; else one that ended in
// the last 12 hours (its winner, or "being counted"); else the next one
// starting within two days. Cancelled sprints never show.
export function pickSprint(sprints = [], now = Date.now()) {
  const t = Number(now)
  const on = sprints.filter((s) => !s.cancelled_at)
  const live = on.find((s) => ms(s.starts_at) <= t && t < ms(s.ends_at))
  if (live) return { state: 'live', sprint: live }
  const ended = on.filter((s) => ms(s.ends_at) <= t && t - ms(s.ends_at) < 12 * HOUR).sort((a, b) => ms(b.ends_at) - ms(a.ends_at))[0]
  if (ended) return { state: ended.settled_at ? 'won' : 'counting', sprint: ended }
  const next = on.filter((s) => ms(s.starts_at) > t && ms(s.starts_at) - t <= 48 * HOUR).sort((a, b) => ms(a.starts_at) - ms(b.starts_at))[0]
  if (next) return { state: 'soon', sprint: next }
  return null
}

// "6 to 9 p.m. Tuesday, Nov. 17", or across midnight "Tuesday, Nov. 17 at
// 10 p.m. to Wednesday, Nov. 18 at 2 a.m."
export function sprintWhen(s) {
  const a = apTime(s.starts_at)
  const b = apTime(s.ends_at)
  if (apDate(s.starts_at) !== apDate(s.ends_at)) return `${apDateTime(s.starts_at)} to ${apDateTime(s.ends_at)}`
  const same = ['a.m.', 'p.m.'].find((m) => a.endsWith(` ${m}`) && b.endsWith(` ${m}`))
  const from = same ? a.slice(0, -(same.length + 1)) : a
  return `${from} to ${b} ${apDate(s.starts_at)}`
}

// Every sprint's own name, for the rules page and the admin list.
export const sprintTitle = (s) => (s.label && s.label !== 'Sprint' ? s.label : 'Sprint')
