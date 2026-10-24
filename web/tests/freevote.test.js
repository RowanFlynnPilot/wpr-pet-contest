import { afterEach, describe, expect, it, vi } from 'vitest'
import { freeVoteOpen, getDevice, readLinkToken, setDevice } from '../src/lib/freeVote.js'

const TOKEN = 'abcDEF123_-'.repeat(4)
const HOUR = 3600e3
const now = Date.parse('2026-10-28T15:00:00Z')
const round = { status: 'open', opens_at: new Date(now - HOUR).toISOString(), closes_at: new Date(now + HOUR).toISOString() }
const contest = { id: 'c1', free_vote_enabled: true, free_vote_paused_at: null }

describe('readLinkToken', () => {
  it('reads the three kinds of emailed link', () => {
    expect(readLinkToken({ fv: `l.${TOKEN}` })).toEqual({ kind: 'link', token: TOKEN })
    expect(readLinkToken({ fv: `r.${TOKEN}` })).toEqual({ kind: 'reminder', token: TOKEN })
    expect(readLinkToken({ fv: `u.${TOKEN}` })).toEqual({ kind: 'unsubscribe', token: TOKEN })
  })

  it('ignores anything else', () => {
    expect(readLinkToken({})).toBeNull()
    expect(readLinkToken(undefined)).toBeNull()
    expect(readLinkToken({ fv: 'l.short' })).toBeNull()
    expect(readLinkToken({ fv: `x.${TOKEN}` })).toBeNull()
    expect(readLinkToken({ fv: `l.${TOKEN}<script>` })).toBeNull()
  })
})

describe('freeVoteOpen', () => {
  it('is open while the contest has it, unpaused, during a live round', () => {
    expect(freeVoteOpen(contest, round, now)).toBe(true)
  })

  it('is closed when the contest is off or paused', () => {
    expect(freeVoteOpen({ ...contest, free_vote_enabled: false }, round, now)).toBe(false)
    expect(freeVoteOpen({ ...contest, free_vote_paused_at: new Date(now).toISOString() }, round, now)).toBe(false)
  })

  it('is closed outside the round, at the deadline as the paid side is', () => {
    expect(freeVoteOpen(contest, { ...round, status: 'pending' }, now)).toBe(false)
    expect(freeVoteOpen(contest, round, now + 2 * HOUR)).toBe(false)
    expect(freeVoteOpen(contest, round, now - 2 * HOUR)).toBe(false)
    expect(freeVoteOpen(contest, null, now)).toBe(false)
  })
})

describe('the remembered browser', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('keeps one token per contest', () => {
    const m = new Map()
    vi.stubGlobal('localStorage', { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) })
    setDevice('c1', 'token-one')
    setDevice('c2', 'token-two')
    expect(getDevice('c1')).toBe('token-one')
    expect(getDevice('c2')).toBe('token-two')
    setDevice('c1', null)
    expect(getDevice('c1')).toBeNull()
    expect(getDevice(null)).toBeNull()
  })

  it('still works for the visit when storage throws, as it can in the WordPress frame', () => {
    const boom = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom })
    setDevice('c3', 'token-three')
    expect(getDevice('c3')).toBe('token-three')
  })
})
