import { describe, expect, it } from 'vitest'
import { countdownWords, daysUntil, launchStage } from '../src/lib/graphics/content.js'
import { captionsFor } from '../src/lib/graphics/captions.js'

const contest = { status: 'draft', submissions_open_at: '2026-11-14T14:00:00Z', submissions_close_at: '2026-11-21T02:00:00Z' }

describe('launchStage', () => {
  it('offers the launch from a draft with dates, through entries, to the field', () => {
    expect(launchStage(contest, 'none')).toBe('soon')
    expect(launchStage({ ...contest, submissions_open_at: null }, 'none')).toBeNull()
    expect(launchStage({ ...contest, status: 'submissions_open' }, 'coming')).toBe('soon')
    expect(launchStage({ ...contest, status: 'submissions_open' }, 'submissions')).toBe('open')
    expect(launchStage({ ...contest, status: 'submissions_open' }, 'submissions_closed')).toBe('closed')
    expect(launchStage({ ...contest, status: 'voting' }, 'voting')).toBeNull()
    expect(launchStage(null, 'none')).toBeNull()
  })
})

describe('the countdown', () => {
  // 8 a.m. Central, Saturday, Nov. 14.
  const opens = '2026-11-14T14:00:00Z'
  it('counts calendar days on the newsroom clock', () => {
    expect(daysUntil(opens, Date.parse('2026-10-31T15:00:00Z'))).toBe(14)
    // 10 p.m. Friday Central is still the day before.
    expect(daysUntil(opens, Date.parse('2026-11-14T04:00:00Z'))).toBe(1)
    // 7 a.m. Saturday Central is the same day.
    expect(daysUntil(opens, Date.parse('2026-11-14T13:00:00Z'))).toBe(0)
  })
  it('says days, then tomorrow, then today', () => {
    expect(countdownWords(opens, Date.parse('2026-11-08T15:00:00Z'))).toEqual({ big: '6', line: 'days until entries open', days: 6 })
    expect(countdownWords(opens, Date.parse('2026-11-13T15:00:00Z')).line).toBe('Entries open tomorrow')
    expect(countdownWords(opens, Date.parse('2026-11-14T13:00:00Z')).line).toBe('Entries open today')
  })
})

describe('launch captions', () => {
  const o = { contestName: 'Cutest Pet in Marathon County', splitPct: 50, bracketSize: 16, year: 2026 }
  const card = (meta) => ({ meta })
  const url = 'https://example.org/pets/'
  it('announces with the date and the share, never a donation', () => {
    const c = captionsFor(card({ kind: 'announce', o, opensAt: contest.submissions_open_at, who: 'Moments Foster Care' }), { publicUrl: url })
    expect(c.hook).toBe('Is your pet the cutest in Marathon County? Entries for Cutest Pet in Marathon County open Saturday, Nov. 14.')
    expect(c.facebook).toContain('and half of every vote pack goes to Moments Foster Care.')
    expect(c.facebook).toContain('Vote packs are not donations.')
    expect(c.facebook).toContain(`${url}#/rules`)
  })
  it('counts down, then says tomorrow', () => {
    const six = captionsFor(card({ kind: 'countdown', o, opensAt: contest.submissions_open_at, cd: { days: 6 } }), { publicUrl: url })
    expect(six.hook).toBe('Entries for Cutest Pet in Marathon County open in six days.')
    const one = captionsFor(card({ kind: 'countdown', o, opensAt: contest.submissions_open_at, cd: { days: 1 } }), { publicUrl: url })
    expect(one.hook).toMatch(/^Entries open tomorrow for Cutest Pet in Marathon County: Saturday, Nov\. 14 at 8 a\.m\.$/)
  })
  it('sends entrants to the form, and counts the field in words', () => {
    const open = captionsFor(card({ kind: 'entriesOpen', o, closesAt: contest.submissions_close_at }), { publicUrl: url })
    expect(open.facebook).toContain(`${url}#/enter`)
    const so = captionsFor(card({ kind: 'entriesSoFar', o, count: 1, closesAt: contest.submissions_close_at }), { publicUrl: url })
    expect(so.hook).toBe('So far, one pet is in.')
    const field = captionsFor(card({ kind: 'fieldSet', o, count: 212, votingAt: '2026-11-21T14:00:00Z' }), { publicUrl: url })
    expect(field.hook).toBe('The field is set: 212 pets.')
    expect(field.facebook).toContain('The Open Round opens Saturday, Nov. 21 at 8 a.m.')
  })
})
