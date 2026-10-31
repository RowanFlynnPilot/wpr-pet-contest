import { matchupStanding, rankOpenRound, votesToPass } from './rank.js'
import { rankPool } from './lastChance.js'
import { apNumber } from './format.js'

// What a vote pack would do for a pet on the standings right now: the
// checkout's answer to "is this enough?", so the buyer does not do the math.
// Uses the same tiebreaks as the boards (lib/rank.js). Returns the end of a
// sentence that starts "Right now, 50 votes would ...", or null when there is
// nothing true and useful to say (totals not loaded, pet not in the round).
//   round:      the round being bought for (kind 'open' or 'bracket')
//   totals:     Map<entry_id, { votes }> for that round
//   entries:    approved entries (Open Round ranking)
//   matchups:   bracket matchups (head to head)
//   lastChance: lastChanceState() during Last Chance, else null
export function packImpact({ entry, votes, round, totals, entries = [], matchups = [], byId = new Map(), lastChance = null, bracketSize = 16 }) {
  if (!entry || !round || !totals || !(votes > 0)) return null
  const name = entry.pet_name
  const plus = (id) => new Map([...totals, [id, { votes: (totals.get(id)?.votes || 0) + votes }]])

  if (round.kind === 'bracket') {
    const m = matchups.find((x) => x.round_id === round.id && (x.entry_a_id === entry.id || x.entry_b_id === entry.id))
    if (!m || !m.entry_a_id || !m.entry_b_id) return null
    const st = matchupStanding(m, plus(entry.id), byId)
    const mine = st.a.id === entry.id ? 'a' : 'b'
    const me = st[mine]
    const them = st[mine === 'a' ? 'b' : 'a']
    if (!them.entry) return null
    if (st.leader === mine) {
      if (st.tied) return `tie ${name} with ${them.entry.pet_name}, and a tie goes to ${name} as the better seed`
      return `put ${name} ahead of ${them.entry.pet_name} by ${plural(me.votes - them.votes)}`
    }
    return `bring ${name} within ${plural(st.toTake)} of passing ${them.entry.pet_name}`
  }

  // Last Chance: only the race for the last seed counts.
  if (lastChance?.active && lastChance.pool.has(entry.id)) {
    const before = rankPool(lastChance, totals, byId).find((r) => r.id === entry.id)
    const pool = rankPool(lastChance, plus(entry.id), byId)
    const after = pool.find((r) => r.id === entry.id)
    if (!after || !before) return null
    if (after.rank === 1) return before.rank === 1 ? `keep ${name} first in Last Chance, ${plural(after.votes - (pool[1]?.votes || 0))} ahead` : `put ${name} first in Last Chance`
    if (after.rank < before.rank) return `move ${name} up to No. ${after.rank} in Last Chance`
    // Ties go to the better starting place.
    const ahead = pool[after.rank - 2]
    const gap = plural(ahead.votes - after.votes + (after.start < ahead.start ? 0 : 1))
    return after.rank === 2 ? `bring ${name} within ${gap} of taking the Last Chance lead` : `bring ${name} within ${gap} of passing No. ${after.rank - 1} in Last Chance`
  }

  // Above the Last Chance line a pet is in, and its count no longer matters.
  if (lastChance?.active || round.kind !== 'open' || !entries.some((e) => e.id === entry.id)) return null
  const before = rankOpenRound(entries, totals).find((r) => r.entry.id === entry.id)
  const ranked = rankOpenRound(entries, plus(entry.id))
  const after = ranked.find((r) => r.entry.id === entry.id)
  if (after.rank === 1) {
    if (before.rank !== 1) return `put ${name} in first place`
    return ranked[1] ? `keep ${name} in first place, ${plural(after.votes - ranked[1].votes)} ahead` : null
  }
  if (after.rank < before.rank) {
    if (before.rank > bracketSize && after.rank <= bracketSize) return `move ${name} into the top ${bracketSize}, at No. ${after.rank}`
    return `move ${name} up to No. ${after.rank}`
  }
  return `bring ${name} within ${plural(votesToPass(after, ranked[after.rank - 2]))} of passing No. ${after.rank - 1}`
}

const plural = (n) => `${apNumber(n)} ${n === 1 ? 'vote' : 'votes'}`
