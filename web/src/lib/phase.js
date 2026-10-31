// Which contest is "this year's", and what a reader can do right now.

// The non-complete contest if there is one, otherwise the most recent year.
// Drafts never reach anon (RLS), but the admin desk passes them through too.
export function pickActiveContest(contests) {
  if (!contests?.length) return null
  const sorted = [...contests].sort((a, b) => b.year - a.year)
  return sorted.find((c) => c.status !== 'complete' && c.status !== 'draft') || sorted.find((c) => c.status !== 'draft') || null
}

const t = (v) => (v ? new Date(v).getTime() : NaN)

// Phases:
//   none                no contest to show
//   coming              accepting entries soon (window not yet open)
//   submissions         accepting entries
//   submissions_closed  window passed, voting not yet opened by staff
//   voting              a round is open and its clock is running (or, in the
//                       Open Round, Last Chance's: overtime is then true)
//   counting            the clock ran out; staff have not closed the round yet
//   intermission        between rounds (last one resolved, next not opened)
//   complete            champion crowned
export function contestPhase(contest, rounds = [], now = Date.now()) {
  if (!contest) return { phase: 'none', round: null, nextRound: null }
  const sorted = [...rounds].sort((a, b) => a.seq - b.seq)
  const open = sorted.find((r) => r.status === 'open') || null
  const pending = sorted.find((r) => r.status === 'pending') || null
  const resolved = sorted.filter((r) => r.status === 'resolved' || r.status === 'closed')
  const lastResolved = resolved[resolved.length - 1] || null

  if (contest.status === 'complete') {
    return { phase: 'complete', round: lastResolved, nextRound: null }
  }

  if (contest.status === 'submissions_open') {
    if (now < t(contest.submissions_open_at)) return { phase: 'coming', round: null, nextRound: pending }
    if (now > t(contest.submissions_close_at)) return { phase: 'submissions_closed', round: null, nextRound: pending }
    return { phase: 'submissions', round: null, nextRound: pending }
  }

  if (contest.status === 'voting') {
    if (open) {
      // Last Chance (lib/lastChance.js): the Open Round's clock is out but its
      // overtime runs, so voting goes on (for the pool) until Last Chance ends.
      // The round carries Last Chance's close as its own; mainClosesAt keeps
      // the Open Round's.
      const overtime = t(open.overtime_closes_at)
      if (open.seq === 1 && Number.isFinite(overtime) && now >= t(open.closes_at)) {
        const round = { ...open, closes_at: open.overtime_closes_at, mainClosesAt: open.closes_at }
        if (now >= overtime) return { phase: 'counting', round, nextRound: pending, overtime: true }
        return { phase: 'voting', round, nextRound: pending, overtime: true }
      }
      if (now >= t(open.closes_at)) return { phase: 'counting', round: open, nextRound: pending }
      return { phase: 'voting', round: open, nextRound: pending }
    }
    return { phase: 'intermission', round: lastResolved, nextRound: pending }
  }

  return { phase: 'none', round: null, nextRound: null }
}
