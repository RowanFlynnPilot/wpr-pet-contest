// Round naming and bracket geometry. Mirrors round_label() and
// bracket_seed_order() in the database so the page and the SQL never disagree
// about what a round is called or who plays whom.

const NAMED = { 16: 'Sweet 16', 8: 'Elite Eight', 4: 'Final Four', 2: 'Championship' }

// Pets still in the running when bracket round `seq` starts.
export function petsInRound(seq, bracketSize = 16) {
  if (seq <= 1) return null
  return bracketSize / 2 ** (seq - 2)
}

const SHORT = { 16: 'Sweet 16', 8: 'Elite 8', 4: 'Final 4', 2: 'Final' }

// For badges on narrow cards.
export function roundShortLabel(seq, bracketSize = 16) {
  if (seq === 1) return 'Open'
  const remaining = petsInRound(seq, bracketSize)
  return SHORT[remaining] || `Top ${remaining}`
}

export function roundLabel(seq, bracketSize = 16) {
  if (seq === 1) return 'Open Round'
  const remaining = petsInRound(seq, bracketSize)
  return NAMED[remaining] || `Round of ${remaining}`
}

// Number of head-to-head rounds after the open round: 16 -> 4.
export function bracketRoundCount(bracketSize = 16) {
  return Math.round(Math.log2(bracketSize))
}

export function finalSeq(bracketSize = 16) {
  return 1 + bracketRoundCount(bracketSize)
}

// Standard bracket order, so seeds 1 and 2 can only meet in the final.
//   4 -> [1,4,2,3]   8 -> [1,8,4,5,2,7,3,6]
export function bracketSeedOrder(fieldSize) {
  if (fieldSize < 2 || (fieldSize & (fieldSize - 1)) !== 0) {
    throw new Error(`field size must be a power of two >= 2, got ${fieldSize}`)
  }
  let cur = [1, 2]
  let n = 2
  while (n < fieldSize) {
    n *= 2
    cur = cur.flatMap((s) => [s, n + 1 - s])
  }
  return cur
}

// "If voting ended now": first-round pairings from the current open-round
// order. `ranked` is entry ids, best first.
export function projectedPairings(ranked, bracketSize = 16) {
  if (ranked.length < bracketSize) return []
  const order = bracketSeedOrder(bracketSize)
  const pairs = []
  for (let i = 0; i < order.length; i += 2) {
    pairs.push({
      slot: i / 2,
      a: { seed: order[i], id: ranked[order[i] - 1] },
      b: { seed: order[i + 1], id: ranked[order[i + 1] - 1] },
    })
  }
  return pairs
}

// Every bracket round, whether or not the database has built it yet, so the
// page can draw empty slots for rounds still to come.
export function bracketSkeleton(bracketSize, rounds, matchups) {
  const bySeq = new Map(rounds.map((r) => [r.seq, r]))
  const byRound = new Map()
  for (const m of matchups) {
    if (!byRound.has(m.round_id)) byRound.set(m.round_id, [])
    byRound.get(m.round_id).push(m)
  }
  const out = []
  for (let seq = 2; seq <= finalSeq(bracketSize); seq++) {
    const round = bySeq.get(seq) || null
    const count = petsInRound(seq, bracketSize) / 2
    const built = round ? byRound.get(round.id) || [] : []
    const slots = Array.from({ length: count }, (_, slot) => built.find((m) => m.slot === slot) || null)
    out.push({ seq, label: roundLabel(seq, bracketSize), round, slots })
  }
  return out
}
