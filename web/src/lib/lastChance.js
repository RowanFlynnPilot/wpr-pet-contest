// Last Chance (0032): in a contest that switches it on, the pets that finish
// just below the bracket line get more time once the Open Round's clock runs
// out. The pets above the line are in; places bracket_size to bracket_size + 4
// keep voting, and the one with the most Open Round votes when Last Chance
// ends takes the last seed. Their Open Round votes carry over: it is
// overtime inside the Open Round, not a round of its own.

const t = (v) => (v ? new Date(v).getTime() : NaN)

// round1: the Open Round row (with overtime_closes_at); field: the
// last_chance_field rows ({ entry_id, place, pool }).
export function lastChanceState(round1, field = [], now = Date.now()) {
  const ends = t(round1?.overtime_closes_at)
  if (!round1 || !Number.isFinite(ends)) return null
  const pool = new Set(field.filter((f) => f.pool).map((f) => f.entry_id))
  const place = new Map(field.map((f) => [f.entry_id, f.place]))
  return {
    // Running: the Open Round is still open, its own clock is out, Last Chance's is not.
    active: round1.status === 'open' && now >= t(round1.closes_at) && now < ends,
    closesAt: round1.overtime_closes_at,
    mainClosesAt: round1.closes_at,
    pool,
    place,
    size: pool.size,
  }
}

// May this pet be voted for right now? Everyone, except during Last Chance,
// when only its pool can be.
export function canVoteNow(lastChance, entryId) {
  return !lastChance?.active || lastChance.pool.has(entryId)
}

// The pool, best first: Open Round votes, then the better place at the start
// (the tiebreak close_round uses). totals: Map<entry_id, { votes }>.
export function rankPool(lastChance, totals, byId) {
  if (!lastChance) return []
  return [...lastChance.pool]
    .map((id) => ({ entry: byId.get(id), id, votes: totals.get(id)?.votes || 0, start: lastChance.place.get(id) || 999 }))
    .filter((r) => r.entry)
    .sort((a, b) => b.votes - a.votes || a.start - b.start)
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

// The Open Round board during Last Chance. The pets above the line are in, in
// their order at the start (their totals no longer move); then the pool,
// best first; then everyone else. ranked: rankOpenRound() rows.
export function lastChanceRanked(ranked, lastChance) {
  if (!lastChance) return ranked
  const inAbove = (r) => !lastChance.pool.has(r.entry.id) && lastChance.place.has(r.entry.id)
  const above = ranked.filter(inAbove).sort((a, b) => lastChance.place.get(a.entry.id) - lastChance.place.get(b.entry.id))
  const pool = ranked
    .filter((r) => lastChance.pool.has(r.entry.id))
    .sort((a, b) => b.votes - a.votes || (lastChance.place.get(a.entry.id) || 999) - (lastChance.place.get(b.entry.id) || 999))
  const rest = ranked.filter((r) => !lastChance.place.has(r.entry.id))
  return [...above, ...pool, ...rest].map((r, i) => ({ ...r, rank: i + 1 }))
}
