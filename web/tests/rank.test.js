import { describe, expect, it } from 'vitest'
import { cutline, matchupStanding, rankOpenRound, votesToPass } from '../src/lib/rank.js'
import { entryStates } from '../src/lib/bracketState.js'

const e = (id, minute, extra = {}) => ({ id, pet_name: id, created_at: new Date(Date.UTC(2026, 8, 20, 12, minute)).toISOString(), ...extra })
const totals = (obj) => new Map(Object.entries(obj).map(([k, v]) => [k, { votes: v }]))

describe('rankOpenRound', () => {
  it('ranks by votes, then earliest entry (matches seed_bracket)', () => {
    const entries = [e('late', 30), e('early', 10), e('top', 20), e('none', 5)]
    const ranked = rankOpenRound(entries, totals({ late: 50, early: 50, top: 90 }))
    expect(ranked.map((r) => [r.entry.id, r.rank, r.votes])).toEqual([
      ['top', 1, 90],
      ['early', 2, 50],
      ['late', 3, 50],
      ['none', 4, 0],
    ])
  })
})

describe('votesToPass', () => {
  it('needs one more when the target entered earlier', () => {
    const [a, b] = rankOpenRound([e('a', 1), e('b', 2)], totals({ a: 10, b: 4 }))
    expect(votesToPass(b, a)).toBe(7)
  })
  it('only needs to tie when entered earlier', () => {
    const [a, b] = rankOpenRound([e('a', 2), e('b', 1)], totals({ a: 10, b: 4 }))
    expect(votesToPass(b, a)).toBe(6)
  })
  it('is zero when already ahead', () => {
    const [a, b] = rankOpenRound([e('a', 1), e('b', 2)], totals({ a: 10, b: 4 }))
    expect(votesToPass(a, b)).toBe(0)
  })
})

describe('cutline', () => {
  const entries = Array.from({ length: 6 }, (_, i) => e(`p${i + 1}`, i))
  const ranked = rankOpenRound(entries, totals({ p1: 60, p2: 50, p3: 40, p4: 30, p5: 20, p6: 10 }))
  it('reports what the first pet out needs to pass', () => {
    expect(cutline(ranked, 'p3', 4)).toEqual({ rank: 3, qualifying: true, margin: 21, total: 6 })
    expect(cutline(ranked, 'p4', 4)).toEqual({ rank: 4, qualifying: true, margin: 11, total: 6 })
  })
  it('reports what a pet outside needs to get in', () => {
    // p5 (entered after p4) needs to beat p4's 30 outright.
    expect(cutline(ranked, 'p5', 4)).toEqual({ rank: 5, qualifying: false, needed: 11, total: 6 })
  })
  it('handles a field smaller than the bracket', () => {
    expect(cutline(ranked, 'p6', 16).qualifying).toBe(true)
    expect(cutline(ranked, 'nope', 4)).toBeNull()
  })
})

describe('matchupStanding', () => {
  const byId = new Map([
    ['a', { id: 'a', pet_name: 'A', seed: 3 }],
    ['b', { id: 'b', pet_name: 'B', seed: 14 }],
  ])
  const m = { entry_a_id: 'a', entry_b_id: 'b', winner_entry_id: null }
  it('leads on votes', () => {
    const s = matchupStanding(m, totals({ a: 5, b: 9 }), byId)
    expect(s.leader).toBe('b')
    expect(s.toTake).toBe(4) // a is the better seed, so a tie is enough
  })
  it('breaks ties on the better seed (matches advance_bracket)', () => {
    const s = matchupStanding(m, totals({ a: 7, b: 7 }), byId)
    expect(s.leader).toBe('a')
    expect(s.tied).toBe(true)
    expect(s.toTake).toBe(1)
  })
  it('treats missing totals as zero', () => {
    const s = matchupStanding(m, new Map(), byId)
    expect(s.a.votes).toBe(0)
    expect(s.leader).toBe('a')
  })
})

describe('entryStates', () => {
  const rounds = [
    { id: 'r2', seq: 2 },
    { id: 'r3', seq: 3 },
    { id: 'r4', seq: 4 },
  ]
  const entries = [e('w', 1, { seed: 1 }), e('l1', 2, { seed: 8 }), e('l2', 3, { seed: 4 }), e('x', 4, { seed: 5 }), e('nq', 5, { seed: null })]
  it('tracks alive, out, champion and unseeded', () => {
    const matchups = [
      { round_id: 'r2', entry_a_id: 'w', entry_b_id: 'l1', winner_entry_id: 'w' },
      { round_id: 'r2', entry_a_id: 'l2', entry_b_id: 'x', winner_entry_id: 'l2' },
      { round_id: 'r3', entry_a_id: 'w', entry_b_id: 'l2', winner_entry_id: 'w' },
    ]
    const s = entryStates(entries, rounds, matchups, 8)
    expect(s.get('w').status).toBe('alive')
    expect(s.get('l1')).toMatchObject({ status: 'out', label: 'Elite Eight' })
    expect(s.get('l2')).toMatchObject({ status: 'out', label: 'Final Four' })
    expect(s.get('nq').status).toBe('unseeded')
    const final = [...matchups, { round_id: 'r4', entry_a_id: 'w', entry_b_id: 'zz', winner_entry_id: 'w' }]
    expect(entryStates(entries, rounds, final, 8).get('w').status).toBe('champion')
  })
})
