// Standings, computed with the same tiebreaks the database uses so the page
// never shows a pet "ahead" that close_round would rank behind.
//   Open round: most votes, then earliest submission.
//   Bracket:    most votes, then better (lower) seed.

const ts = (e) => new Date(e.created_at).getTime()

export function rankOpenRound(entries, totals) {
  return entries
    .map((entry) => ({ entry, votes: totals.get(entry.id)?.votes || 0 }))
    .sort((a, b) => b.votes - a.votes || ts(a.entry) - ts(b.entry))
    .map((row, i) => ({ ...row, rank: i + 1 }))
}

// Pets that rose `min` places or more over the last day: today's standings
// against yesterday's (today's totals minus each pet's last-24-hour votes),
// both ranked with the open round's tiebreak. Map<entry_id, places up>.
export function climbers(entries, totals, recent, { min = 3 } = {}) {
  if (!recent?.size) return new Map()
  const now = rankOpenRound(entries, totals)
  const before = rankOpenRound(
    entries,
    new Map(entries.map((e) => [e.id, { votes: Math.max(0, (totals.get(e.id)?.votes || 0) - (recent.get(e.id) || 0)) }])),
  )
  const then = new Map(before.map((r) => [r.entry.id, r.rank]))
  const out = new Map()
  for (const r of now) {
    const up = then.get(r.entry.id) - r.rank
    if (up >= min) out.set(r.entry.id, up)
  }
  return out
}

// Votes `me` needs to move ahead of `target` in the open round.
export function votesToPass(me, target) {
  const earlier = ts(me.entry) < ts(target.entry)
  return Math.max(0, target.votes - me.votes + (earlier ? 0 : 1))
}

// Where a pet stands against the qualifying line (the top `size` advance).
export function cutline(ranked, entryId, size) {
  const i = ranked.findIndex((r) => r.entry.id === entryId)
  if (i < 0) return null
  const me = ranked[i]
  if (ranked.length <= size) return { rank: me.rank, qualifying: true, margin: null, total: ranked.length }
  if (me.rank <= size) {
    const chaser = ranked[size]
    return { rank: me.rank, qualifying: true, margin: votesToPass(chaser, me), total: ranked.length }
  }
  return { rank: me.rank, qualifying: false, needed: votesToPass(me, ranked[size - 1]), total: ranked.length }
}

// Head-to-head: who leads, and by how much the trailer needs to take it.
export function matchupStanding(matchup, totals, entriesById) {
  const side = (id) => {
    const entry = entriesById.get(id) || null
    return { id, entry, votes: totals.get(id)?.votes || 0, seed: entry?.seed ?? null }
  }
  const a = side(matchup.entry_a_id)
  const b = side(matchup.entry_b_id)
  const seedOf = (s) => s.seed ?? Number.POSITIVE_INFINITY
  const aLeads = a.votes > b.votes || (a.votes === b.votes && seedOf(a) < seedOf(b))
  const leader = aLeads ? 'a' : 'b'
  const lead = aLeads ? a : b
  const trail = aLeads ? b : a
  const toTake = lead.votes - trail.votes + (seedOf(trail) < seedOf(lead) ? 0 : 1)
  return { a, b, leader, tied: a.votes === b.votes, toTake: Math.max(0, toTake), winner: matchup.winner_entry_id || null }
}

// The worse seed is ahead on votes. A tie goes to the better seed, so it is
// never an upset.
export function isUpset(st) {
  const lead = st.leader === 'a' ? st.a : st.b
  const trail = st.leader === 'a' ? st.b : st.a
  return !st.tied && lead.seed != null && trail.seed != null && lead.seed > trail.seed
}
