import { describe, expect, it } from 'vitest'
import { packImpact } from '../src/lib/impact.js'

const pet = (n, name = `Pet ${n}`, extra = {}) => ({ id: `e${n}`, pet_name: name, created_at: new Date(Date.UTC(2026, 10, 1, n)).toISOString(), ...extra })
const totalsOf = (obj) => new Map(Object.entries(obj).map(([id, votes]) => [id, { votes }]))
const open = { id: 'r1', kind: 'open' }

describe('packImpact: the Open Round', () => {
  const entries = [pet(1, 'Ziggy'), pet(2, 'Olive'), pet(3, 'Juniper'), pet(4, 'Mo')]
  const totals = totalsOf({ e1: 300, e2: 200, e3: 150, e4: 10 })
  const at = (entry, votes, more = {}) => packImpact({ entry, votes, round: open, totals, entries, bracketSize: 2, ...more })

  it('says how far the pack moves the pet up', () => {
    expect(at(entries[2], 60)).toBe('move Juniper into the top 2, at No. 2')
    expect(at(entries[2], 400)).toBe('put Juniper in first place')
    expect(at(entries[3], 150)).toBe('move Mo up to No. 3')
  })
  it('says how close it gets when it does not pass anyone', () => {
    // 150 + 40 = 190; Olive has 200 and entered earlier, so 201 passes her.
    expect(at(entries[2], 40)).toBe('bring Juniper within 11 votes of passing No. 2')
    // A tie is not a pass for the later entry: it needs one more.
    expect(at(entries[2], 50)).toBe('bring Juniper within one vote of passing No. 2')
  })
  it('tells the leader its margin', () => {
    expect(at(entries[0], 50)).toBe('keep Ziggy in first place, 150 votes ahead')
  })
  it('says nothing it cannot back up', () => {
    expect(at(entries[2], 0)).toBeNull()
    expect(at(pet(9), 50)).toBeNull()
    expect(packImpact({ entry: entries[0], votes: 5, round: open, totals: null, entries })).toBeNull()
  })
})

describe('packImpact: the bracket', () => {
  const a = pet(1, 'Ziggy', { seed: 1 })
  const b = pet(2, 'Gus', { seed: 16 })
  const byId = new Map([a, b].map((e) => [e.id, e]))
  const round = { id: 'r2', kind: 'bracket' }
  const matchups = [{ id: 'm1', round_id: 'r2', entry_a_id: 'e1', entry_b_id: 'e2' }]
  const at = (entry, votes, t) => packImpact({ entry, votes, round, totals: totalsOf(t), matchups, byId })

  it('puts the pet ahead, or closer', () => {
    expect(at(b, 50, { e1: 100, e2: 80 })).toBe('put Gus ahead of Ziggy by 30 votes')
    expect(at(b, 10, { e1: 100, e2: 80 })).toBe('bring Gus within 11 votes of passing Ziggy')
  })
  it('knows a tie goes to the better seed', () => {
    expect(at(a, 20, { e1: 60, e2: 80 })).toBe('tie Ziggy with Gus, and a tie goes to Ziggy as the better seed')
    expect(at(b, 20, { e1: 100, e2: 80 })).toBe('bring Gus within one vote of passing Ziggy')
  })
  it('stays quiet without an opponent', () => {
    expect(packImpact({ entry: a, votes: 5, round, totals: totalsOf({}), matchups: [{ ...matchups[0], entry_b_id: null }], byId })).toBeNull()
  })
})

describe('packImpact: Last Chance', () => {
  const pool = [pet(16, 'Olive'), pet(17, 'Butterbean'), pet(18, 'Noodle')]
  const above = pet(3, 'Ziggy')
  const byId = new Map([...pool, above].map((e) => [e.id, e]))
  const lastChance = { active: true, pool: new Set(pool.map((e) => e.id)), place: new Map([['e16', 16], ['e17', 17], ['e18', 18], ['e3', 3]]) }
  const totals = totalsOf({ e16: 140, e17: 131, e18: 126, e3: 400 })
  const at = (entry, votes) => packImpact({ entry, votes, round: open, totals, entries: [...pool, above], byId, lastChance })

  it('counts only the race for the last seed', () => {
    expect(at(pool[2], 10)).toBe('move Noodle up to No. 2 in Last Chance')
    expect(at(pool[2], 20)).toBe('put Noodle first in Last Chance')
    // Butterbean at 136 trails Olive's 140, and Olive started higher.
    expect(at(pool[1], 5)).toBe('bring Butterbean within five votes of taking the Last Chance lead')
    expect(at(pool[0], 10)).toBe('keep Olive first in Last Chance, 19 votes ahead')
  })
  it('has nothing to say for a pet already in', () => {
    expect(at(above, 50)).toBeNull()
  })
})
