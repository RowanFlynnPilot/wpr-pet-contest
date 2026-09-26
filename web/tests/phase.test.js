import { describe, expect, it } from 'vitest'
import { contestPhase, pickActiveContest } from '../src/lib/phase.js'

const NOW = Date.parse('2026-10-05T12:00:00Z')
const iso = (h) => new Date(NOW + h * 3600 * 1000).toISOString()
const contest = (status, extra = {}) => ({ id: 'c', year: 2026, status, submissions_open_at: iso(-100), submissions_close_at: iso(100), ...extra })
const round = (seq, status, extra = {}) => ({ id: `r${seq}`, seq, kind: seq === 1 ? 'open' : 'bracket', status, opens_at: iso(-10), closes_at: iso(10), ...extra })

describe('pickActiveContest', () => {
  it('prefers the contest that is not complete', () => {
    const list = [contest('complete', { id: 'old', year: 2025 }), contest('voting', { id: 'now', year: 2026 })]
    expect(pickActiveContest(list).id).toBe('now')
  })
  it('falls back to the most recent year', () => {
    const list = [contest('complete', { id: 'a', year: 2024 }), contest('complete', { id: 'b', year: 2025 })]
    expect(pickActiveContest(list).id).toBe('b')
  })
  it('never picks a draft for readers', () => {
    expect(pickActiveContest([contest('draft', { year: 2027 }), contest('complete', { id: 'x', year: 2026 })]).id).toBe('x')
    expect(pickActiveContest([])).toBeNull()
    expect(pickActiveContest(null)).toBeNull()
  })
})

describe('contestPhase', () => {
  it('handles no contest', () => {
    expect(contestPhase(null, [], NOW).phase).toBe('none')
  })
  it('splits the submission window', () => {
    expect(contestPhase(contest('submissions_open', { submissions_open_at: iso(5) }), [], NOW).phase).toBe('coming')
    expect(contestPhase(contest('submissions_open'), [round(1, 'pending')], NOW).phase).toBe('submissions')
    expect(contestPhase(contest('submissions_open', { submissions_close_at: iso(-1) }), [], NOW).phase).toBe('submissions_closed')
  })
  it('finds the open round while voting', () => {
    const p = contestPhase(contest('voting'), [round(1, 'open')], NOW)
    expect(p.phase).toBe('voting')
    expect(p.round.id).toBe('r1')
  })
  it('reports counting once the clock runs out but staff have not closed', () => {
    expect(contestPhase(contest('voting'), [round(1, 'open', { closes_at: iso(-1) })], NOW).phase).toBe('counting')
  })
  it('reports intermission between rounds, with the next round', () => {
    const p = contestPhase(contest('voting'), [round(1, 'resolved'), round(2, 'pending')], NOW)
    expect(p.phase).toBe('intermission')
    expect(p.round.id).toBe('r1')
    expect(p.nextRound.id).toBe('r2')
  })
  it('reports complete with the final round', () => {
    const rounds = [1, 2, 3, 4, 5].map((s) => round(s, 'resolved'))
    const p = contestPhase(contest('complete'), rounds, NOW)
    expect(p.phase).toBe('complete')
    expect(p.round.seq).toBe(5)
  })
})
