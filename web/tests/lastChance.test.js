import { describe, expect, it } from 'vitest'
import { canVoteNow, lastChanceRanked, lastChanceState, rankPool } from '../src/lib/lastChance.js'
import { contestPhase } from '../src/lib/phase.js'

const H = 3600e3
const now = Date.parse('2026-11-21T20:00:00Z')
const round1 = { id: 'r1', seq: 1, kind: 'open', status: 'open', opens_at: '2026-11-14T14:00:00Z', closes_at: new Date(now - 2 * H).toISOString(), overtime_closes_at: new Date(now + 20 * H).toISOString() }
// A 4-pet bracket: A, B, C in; D to H race.
const field = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => ({ entry_id: id, place: i + 1, pool: i + 1 >= 4 }))
const entry = (id) => ({ id, pet_name: id.toUpperCase() })
const byId = new Map(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => [id, entry(id)]))

describe('lastChanceState', () => {
  it('is active between the Open Round clock and Last Chance clock', () => {
    const s = lastChanceState(round1, field, now)
    expect(s.active).toBe(true)
    expect(s.size).toBe(5)
    expect(lastChanceState(round1, field, now + 21 * H).active).toBe(false)
  })
  it('is nothing without overtime', () => {
    expect(lastChanceState({ ...round1, overtime_closes_at: null }, field, now)).toBe(null)
  })
})

describe('canVoteNow', () => {
  it('lets only the pool be voted for during Last Chance', () => {
    const s = lastChanceState(round1, field, now)
    expect(canVoteNow(s, 'd')).toBe(true)
    expect(canVoteNow(s, 'a')).toBe(false)
    expect(canVoteNow(s, 'i')).toBe(false)
    expect(canVoteNow(null, 'a')).toBe(true)
  })
})

describe('rankPool and lastChanceRanked', () => {
  const s = lastChanceState(round1, field, now)
  const totals = new Map([['a', { votes: 100 }], ['b', { votes: 90 }], ['c', { votes: 80 }], ['d', { votes: 70 }], ['e', { votes: 70 }], ['f', { votes: 50 }], ['g', { votes: 40 }], ['h', { votes: 130 }], ['i', { votes: 20 }]])
  it('ranks the pool by votes, ties to the better start', () => {
    expect(rankPool(s, totals, byId).map((r) => r.id)).toEqual(['h', 'd', 'e', 'f', 'g'])
  })
  it('keeps the pets above the line in their order, then the pool, then the rest', () => {
    const ranked = [...totals].map(([id, t]) => ({ entry: entry(id), votes: t.votes })).sort((x, y) => y.votes - x.votes).map((r, i) => ({ ...r, rank: i + 1 }))
    const out = lastChanceRanked(ranked, s)
    expect(out.map((r) => r.entry.id)).toEqual(['a', 'b', 'c', 'h', 'd', 'e', 'f', 'g', 'i'])
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
})

describe('contestPhase with Last Chance', () => {
  const contest = { status: 'voting' }
  it('keeps voting on through Last Chance, on its clock', () => {
    const p = contestPhase(contest, [round1], now)
    expect(p.phase).toBe('voting')
    expect(p.overtime).toBe(true)
    expect(p.round.closes_at).toBe(round1.overtime_closes_at)
    expect(p.round.mainClosesAt).toBe(round1.closes_at)
  })
  it('counts once Last Chance ends', () => {
    expect(contestPhase(contest, [round1], now + 21 * H).phase).toBe('counting')
  })
  it('is the usual counting phase between the clock and the start', () => {
    const p = contestPhase(contest, [{ ...round1, overtime_closes_at: null }], now)
    expect(p.phase).toBe('counting')
    expect(p.overtime).toBeUndefined()
  })
})
