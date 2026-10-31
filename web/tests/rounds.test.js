import { describe, expect, it } from 'vitest'
import { bracketRoundCount, bracketSeedOrder, bracketSkeleton, finalSeq, petsInRound, projectedPairings, roundLabel } from '../src/lib/rounds.js'

describe('roundLabel (mirrors SQL round_label)', () => {
  it('names the open round', () => {
    expect(roundLabel(1, 16)).toBe('Open Round')
  })
  it('names a 16 bracket', () => {
    expect([2, 3, 4, 5].map((s) => roundLabel(s, 16))).toEqual(['Sweet 16', 'Elite Eight', 'Final Four', 'Championship'])
  })
  it('names an 8 bracket', () => {
    expect([2, 3, 4].map((s) => roundLabel(s, 8))).toEqual(['Elite Eight', 'Final Four', 'Championship'])
  })
  it('falls back to Round of N', () => {
    expect(roundLabel(2, 32)).toBe('Round of 32')
    expect(roundLabel(3, 32)).toBe('Sweet 16')
    expect(roundLabel(2, 64)).toBe('Round of 64')
  })
  it('counts pets and rounds', () => {
    expect(petsInRound(2, 16)).toBe(16)
    expect(petsInRound(5, 16)).toBe(2)
    expect(bracketRoundCount(16)).toBe(4)
    expect(finalSeq(16)).toBe(5)
    expect(finalSeq(8)).toBe(4)
  })
})

describe('bracketSeedOrder (mirrors SQL)', () => {
  it('matches the documented orders', () => {
    expect(bracketSeedOrder(4)).toEqual([1, 4, 2, 3])
    expect(bracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    expect(bracketSeedOrder(16)).toEqual([1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11])
  })
  it('keeps 1 and 2 apart until the final', () => {
    const o = bracketSeedOrder(16)
    expect(o.indexOf(1) < 8).toBe(true)
    expect(o.indexOf(2) >= 8).toBe(true)
  })
  it('rejects fields that are not powers of two', () => {
    expect(() => bracketSeedOrder(12)).toThrow()
    expect(() => bracketSeedOrder(1)).toThrow()
  })
})

describe('projectedPairings', () => {
  it('pairs ranked ids by seed', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `p${i + 1}`)
    const pairs = projectedPairings(ids, 16)
    expect(pairs).toHaveLength(8)
    expect(pairs[0]).toEqual({ slot: 0, a: { seed: 1, id: 'p1' }, b: { seed: 16, id: 'p16' } })
    expect(pairs[1].a).toEqual({ seed: 8, id: 'p8' })
  })
  it('returns nothing without a full field', () => {
    expect(projectedPairings(['a', 'b'], 16)).toEqual([])
  })
})

describe('bracketSkeleton', () => {
  it('draws every round with empty slots for rounds not built yet', () => {
    const rounds = [
      { id: 'r1', seq: 1 },
      { id: 'r2', seq: 2 },
    ]
    const matchups = [{ id: 'm0', round_id: 'r2', slot: 0 }, { id: 'm3', round_id: 'r2', slot: 3 }]
    const cols = bracketSkeleton(8, rounds, matchups)
    expect(cols.map((c) => c.label)).toEqual(['Elite Eight', 'Final Four', 'Championship'])
    expect(cols[0].slots.map((m) => m?.id ?? null)).toEqual(['m0', null, null, 'm3'])
    expect(cols[1].round).toBeNull()
    expect(cols[2].slots).toHaveLength(1)
  })
})
