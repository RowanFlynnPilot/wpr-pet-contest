import { describe, expect, it } from 'vitest'
import { CLUB_TIERS, clubLabel, milestone } from '../src/lib/milestones.js'
import { climbers } from '../src/lib/rank.js'
import { EMPTY_ENTRY, LIMITS, validateEntry } from '../src/lib/entryForm.js'

describe('milestone clubs', () => {
  it('starts with no club and the first one ahead', () => {
    expect(milestone(0)).toMatchObject({ earned: null, next: 50, toNext: 50, all: [] })
    expect(milestone(12).progress).toBeCloseTo(12 / 50)
  })
  it('counts a tier as earned the moment the total reaches it', () => {
    expect(milestone(50)).toMatchObject({ earned: 50, next: 100, toNext: 50 })
    expect(milestone(262)).toMatchObject({ earned: 250, next: 500, toNext: 238, all: [50, 100, 250] })
  })
  it('stops at the last club', () => {
    expect(milestone(12000)).toMatchObject({ earned: 10000, next: null, toNext: 0, progress: 1 })
    expect(milestone(12000).all).toEqual(CLUB_TIERS)
  })
  it('treats junk as zero', () => {
    expect(milestone(undefined).earned).toBeNull()
    expect(milestone(-5).toNext).toBe(50)
  })
  it('labels a club the way AP writes numbers', () => {
    expect(clubLabel(1000)).toBe('1,000 Club')
  })
})

describe('climbers', () => {
  const at = (m) => new Date(Date.UTC(2026, 10, 14, 12, m)).toISOString()
  const entries = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, created_at: at(i) }))
  const totals = new Map([['a', { votes: 100 }], ['b', { votes: 90 }], ['c', { votes: 80 }], ['d', { votes: 70 }], ['e', { votes: 95 }]])

  it('marks a pet that rose three places or more since yesterday', () => {
    // e had 5 votes yesterday (last place); with 90 since, it is second now.
    const up = climbers(entries, totals, new Map([['e', 90]]))
    expect([...up]).toEqual([['e', 3]])
  })
  it('ignores small moves and an empty day', () => {
    expect(climbers(entries, totals, new Map([['d', 15]])).size).toBe(0)
    expect(climbers(entries, totals, new Map()).size).toBe(0)
  })
  it('uses the open round tiebreak, earliest entry first', () => {
    const tied = new Map([['a', { votes: 10 }], ['b', { votes: 10 }], ['c', { votes: 10 }], ['d', { votes: 10 }], ['e', { votes: 10 }]])
    // Yesterday e trailed everyone at 0; today the five are level, and the tie goes to the earliest entry, so e is still last.
    expect(climbers(entries, tied, new Map([['e', 10]])).size).toBe(0)
  })
})

describe('profile answers on the entry form', () => {
  const ok = { ...EMPTY_ENTRY, pet_name: 'Biscuit', species: 'dog', town: 'Wausau', owner_name: 'Jo', owner_email: 'jo@example.com', rights: true }
  it('are optional', () => {
    expect(validateEntry(ok, {})).toEqual({})
  })
  it('are held to their lengths', () => {
    const errors = validateEntry({ ...ok, profile_nickname: 'x'.repeat(LIMITS.profile_nickname + 1), profile_trick: 'y'.repeat(LIMITS.profile_trick) }, {})
    expect(errors.profile_nickname).toMatch(/40 characters/)
    expect(errors.profile_trick).toBeUndefined()
  })
})
