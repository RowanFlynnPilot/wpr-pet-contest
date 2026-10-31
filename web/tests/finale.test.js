import { describe, expect, it } from 'vitest'
import { finaleState } from '../src/lib/finale.js'

const H = 3600e3
const at = '2026-11-30T01:00:00Z'
const t = Date.parse(at)
const contest = { finale_at: at, finale_url: 'https://example.org/live' }

describe('finaleState', () => {
  it('counts down from four days out, not before', () => {
    expect(finaleState(contest, 'voting', t - 97 * H)).toBe(null)
    expect(finaleState(contest, 'voting', t - 90 * H)).toMatchObject({ state: 'soon' })
  })
  it('shows nothing before voting starts', () => {
    expect(finaleState(contest, 'submissions', t - H)).toBe(null)
  })
  it('is live for two hours, and only with a link', () => {
    expect(finaleState(contest, 'counting', t + H)).toMatchObject({ state: 'live', url: contest.finale_url })
    expect(finaleState({ finale_at: at }, 'counting', t + H)).toBe(null)
  })
  it('links the replay for two weeks once the contest is complete', () => {
    expect(finaleState(contest, 'complete', t + 3 * H)).toMatchObject({ state: 'replay' })
    expect(finaleState(contest, 'counting', t + 3 * H)).toBe(null)
    expect(finaleState(contest, 'complete', t + 15 * 24 * H)).toBe(null)
  })
  it('does nothing without a time', () => {
    expect(finaleState({}, 'voting', t)).toBe(null)
    expect(finaleState(null, 'voting', t)).toBe(null)
  })
})
