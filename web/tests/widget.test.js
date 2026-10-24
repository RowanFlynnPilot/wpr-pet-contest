import { describe, expect, it } from 'vitest'
import { chooseView, closestMatchup, leaderIds, linkTo, parseWidgetParams, safeTarget, timeLeft, topOpenRound } from '../src/lib/widget.js'

const FALLBACK = 'https://wausaupilotandreview.com/cutest-pet/'

describe('where a tap may land', () => {
  it('accepts WPR pages and drops any hash', () => {
    expect(safeTarget('https://wausaupilotandreview.com/pets/#/old', { fallback: FALLBACK })).toBe('https://wausaupilotandreview.com/pets/')
    expect(safeTarget('https://www.wausaupilotandreview.com/x/', { fallback: FALLBACK })).toBe('https://www.wausaupilotandreview.com/x/')
  })

  it('refuses anywhere else, and anything that is not https', () => {
    for (const bad of ['https://evil.example/', 'http://wausaupilotandreview.com/', 'javascript:alert(1)', 'https://wausaupilotandreview.com.evil.example/', 'not a url']) {
      expect(safeTarget(bad, { fallback: FALLBACK })).toBe(FALLBACK)
    }
  })

  it('allows a local dev server', () => {
    expect(safeTarget('http://localhost:5173/', { fallback: FALLBACK })).toBe('http://localhost:5173/')
  })

  it('parses the embed parameters, ignoring junk', () => {
    const id = '7A000000-0000-0000-0000-00000000000A'
    expect(parseWidgetParams(`?view=matchup&pet=${id}&to=https://evil.example/`, { fallback: FALLBACK })).toEqual({
      view: 'matchup',
      petId: id.toLowerCase(),
      to: FALLBACK,
    })
    expect(parseWidgetParams('?view=nope&pet=123', { fallback: FALLBACK })).toEqual({ view: 'auto', petId: null, to: FALLBACK })
  })

  it('builds contest links', () => {
    expect(linkTo('https://wausaupilotandreview.com/pets/', 'pet/abc')).toBe('https://wausaupilotandreview.com/pets/#/pet/abc')
  })
})

describe('which card a phase shows', () => {
  const open = { seq: 1, kind: 'open' }
  const sweet16 = { seq: 2, kind: 'bracket' }
  it('follows the contest', () => {
    expect(chooseView({ phase: 'submissions' })).toBe('enter')
    expect(chooseView({ phase: 'coming' })).toBe('enter')
    expect(chooseView({ phase: 'submissions_closed' })).toBe('soon')
    expect(chooseView({ phase: 'voting', round: open })).toBe('leaderboard')
    expect(chooseView({ phase: 'counting', round: open })).toBe('leaderboard')
    expect(chooseView({ phase: 'voting', round: sweet16 })).toBe('matchup')
    expect(chooseView({ phase: 'intermission', round: open })).toBe('soon')
    expect(chooseView({ phase: 'complete' })).toBe('champion')
    expect(chooseView({ phase: 'none' })).toBe('none')
  })

  it('honors a requested view only when the phase can fill it', () => {
    expect(chooseView({ phase: 'voting', round: sweet16, requested: 'leaderboard' })).toBe('matchup')
    expect(chooseView({ phase: 'submissions', requested: 'champion' })).toBe('enter')
  })

  it('a pet card wins when a pet is named', () => {
    expect(chooseView({ phase: 'voting', round: open, petId: 'x' })).toBe('pet')
  })
})

describe('the numbers on the card', () => {
  const e = (id, minute) => ({ id, created_at: `2026-10-01T00:${String(minute).padStart(2, '0')}:00Z` })

  it('ranks the top five with the database tiebreak, filling from the earliest entries', () => {
    const totals = new Map([['c', { votes: 30 }], ['a', { votes: 30 }], ['d', { votes: 5 }]])
    const rows = topOpenRound(totals, [e('c', 3), e('a', 1), e('d', 4), e('a', 1), e('b', 2), e('f', 6), e('g', 7)])
    expect(rows.map((r) => [r.rank, r.entry.id, r.votes])).toEqual([
      [1, 'a', 30],
      [2, 'c', 30],
      [3, 'd', 5],
      [4, 'b', 0],
      [5, 'f', 0],
    ])
  })

  it('fetches only the leaders, with room for ties', () => {
    const totals = new Map(Array.from({ length: 20 }, (_, i) => [`p${i}`, { votes: i }]))
    expect(leaderIds(totals, 5)).toEqual(['p19', 'p18', 'p17', 'p16', 'p15', 'p14', 'p13', 'p12', 'p11', 'p10'])
  })

  it('shows the closest race, skipping a matchup with a removed side', () => {
    const byId = new Map(['a', 'b', 'c', 'd', 'e'].map((id) => [id, { id }]))
    const totals = new Map([['a', { votes: 50 }], ['b', { votes: 10 }], ['c', { votes: 22 }], ['d', { votes: 20 }], ['x', { votes: 21 }]])
    const matchups = [
      { slot: 0, entry_a_id: 'a', entry_b_id: 'b' },
      { slot: 1, entry_a_id: 'c', entry_b_id: 'd' },
      { slot: 2, entry_a_id: 'e', entry_b_id: 'x' },
    ]
    expect(closestMatchup(matchups, totals, byId).slot).toBe(1)
  })

  it('says how long is left, briefly', () => {
    const now = Date.parse('2026-10-01T00:00:00Z')
    expect(timeLeft('2026-10-01T00:20:00Z', now)).toBe('20 min left')
    expect(timeLeft('2026-10-01T05:00:00Z', now)).toBe('5 hours left')
    expect(timeLeft('2026-10-04T00:00:00Z', now)).toBe('3 days left')
    expect(timeLeft('2026-09-30T00:00:00Z', now)).toBeNull()
  })
})
