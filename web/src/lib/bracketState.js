import { roundLabel, roundShortLabel } from './rounds.js'

// Where every pet stands once the bracket exists:
//   unseeded  did not make the bracket
//   alive     still in (possibly in a matchup that has not been decided)
//   out       lost a decided matchup
//   champion  won the final
export function entryStates(entries, rounds, matchups, bracketSize = 16) {
  const seqOf = new Map(rounds.map((r) => [r.id, r.seq]))
  const latest = new Map()
  for (const m of matchups) {
    const seq = seqOf.get(m.round_id) ?? 0
    for (const id of [m.entry_a_id, m.entry_b_id]) {
      const prev = latest.get(id)
      if (!prev || seq > prev.seq) latest.set(id, { seq, m })
    }
  }
  const lastSeq = 1 + Math.log2(bracketSize)
  const out = new Map()
  for (const e of entries) {
    const hit = latest.get(e.id)
    // A pet in a matchup is in the bracket, even if this copy of the field
    // was loaded before close_round wrote its seed.
    if (!hit) {
      out.set(e.id, { status: e.seed == null ? 'unseeded' : 'alive', seq: null })
      continue
    }
    const { seq, m } = hit
    const label = roundLabel(seq, bracketSize)
    const short = roundShortLabel(seq, bracketSize)
    if (!m.winner_entry_id) out.set(e.id, { status: 'alive', seq, label, short, matchup: m })
    else if (m.winner_entry_id === e.id) out.set(e.id, { status: seq === lastSeq ? 'champion' : 'alive', seq, label, short, matchup: m })
    else out.set(e.id, { status: 'out', seq, label, short, matchup: m })
  }
  return out
}
