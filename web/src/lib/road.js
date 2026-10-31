// A pet's road to the crown: one stop per round (the open round, then each
// bracket round) and the crown at the end. Pure, so every state the pet page
// can be in is testable without a browser.
//
// Stop states:
//   done   won this round (or made the cut in the open round)
//   live   playing it now, or its votes are being counted
//   next   the matchup is set; voting has not opened
//   ahead  still to come
//   out    knocked out here (or missed the cut)
//   gone   never reached, because it went out earlier
// Crown: won | ahead | gone

import { finalSeq, roundLabel, roundShortLabel } from './rounds.js'

const BEFORE_BRACKET = { voting: 'live', counting: 'live', intermission: 'done', complete: 'done' }

// `state` is the pet's entry from entryStates() once the bracket exists, and
// null before it does. `details` maps a round's seq to the line its stop
// carries (a score, a seed, a date).
export function roadStops({ bracketSize = 16, rounds = [], phase, state = null, details = {} }) {
  const last = finalSeq(bracketSize)
  const bySeq = new Map(rounds.map((r) => [r.seq, r]))
  // Seeded but no matchup loaded yet: it is in the bracket's first round.
  const at = state?.seq ?? 2

  function stopState(seq) {
    if (!state) return seq === 1 ? BEFORE_BRACKET[phase] || 'next' : 'ahead'
    if (state.status === 'unseeded') return seq === 1 ? 'out' : 'gone'
    if (state.status === 'champion' || seq === 1 || seq < at) return 'done'
    if (seq > at) return state.status === 'out' ? 'gone' : 'ahead'
    if (state.status === 'out') return 'out'
    if (state.matchup?.winner_entry_id) return 'done'
    return bySeq.get(seq)?.status === 'pending' ? 'next' : 'live'
  }

  const stops = []
  for (let seq = 1; seq <= last; seq++) {
    stops.push({ seq, label: roundShortLabel(seq, bracketSize), name: roundLabel(seq, bracketSize), state: stopState(seq), detail: details[seq] || null })
  }
  let crown = 'ahead'
  if (state?.status === 'champion') crown = 'won'
  else if (state?.status === 'out' || state?.status === 'unseeded') crown = 'gone'
  return { stops, crown }
}
