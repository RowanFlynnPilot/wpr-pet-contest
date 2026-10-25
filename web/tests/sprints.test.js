import { describe, expect, it } from 'vitest'
import { pickSprint, sprintTitle, sprintWhen } from '../src/lib/sprints.js'

const H = 3600e3
// Tuesday, Nov. 17, 2026, 6 to 9 p.m. Central.
const S = { id: 's1', starts_at: '2026-11-18T00:00:00Z', ends_at: '2026-11-18T03:00:00Z', settled_at: null, cancelled_at: null }
const t0 = Date.parse(S.starts_at)

describe('pickSprint', () => {
  it('shows a sprint coming within two days, and not one further off', () => {
    expect(pickSprint([S], t0 - 47 * H)).toEqual({ state: 'soon', sprint: S })
    expect(pickSprint([S], t0 - 49 * H)).toBe(null)
  })
  it('shows it running', () => {
    expect(pickSprint([S], t0 + H).state).toBe('live')
  })
  it('says it is being counted until it is settled, then shows the winner for half a day', () => {
    expect(pickSprint([S], t0 + 3.1 * H).state).toBe('counting')
    expect(pickSprint([{ ...S, settled_at: '2026-11-18T03:12:00Z' }], t0 + 4 * H).state).toBe('won')
    expect(pickSprint([{ ...S, settled_at: '2026-11-18T03:12:00Z' }], t0 + 16 * H)).toBe(null)
  })
  it('never shows a cancelled sprint', () => {
    expect(pickSprint([{ ...S, cancelled_at: '2026-11-16T00:00:00Z', cancel_reason: 'x' }], t0 + H)).toBe(null)
  })
  it('prefers the running sprint, then a fresh result, then the next one', () => {
    const next = { ...S, id: 's2', starts_at: '2026-11-18T18:00:00Z', ends_at: '2026-11-18T19:00:00Z' }
    expect(pickSprint([S, next], t0 + H).sprint.id).toBe('s1')
    expect(pickSprint([S, next], t0 + 4 * H).sprint.id).toBe('s1')
    expect(pickSprint([S, next], t0 + 15.5 * H).sprint.id).toBe('s2')
  })
})

describe('sprintWhen', () => {
  it('writes a same-day window the AP way', () => {
    expect(sprintWhen(S)).toBe('6 to 9 p.m. Tuesday, Nov. 17')
  })
  it('keeps both meridiems when they differ', () => {
    expect(sprintWhen({ starts_at: '2026-11-17T17:00:00Z', ends_at: '2026-11-17T19:30:00Z' })).toBe('11 a.m. to 1:30 p.m. Tuesday, Nov. 17')
  })
  it('spells out both days across midnight', () => {
    expect(sprintWhen({ starts_at: '2026-11-18T04:00:00Z', ends_at: '2026-11-18T07:00:00Z' })).toBe('Tuesday, Nov. 17 at 10 p.m. to Wednesday, Nov. 18 at 1 a.m.')
  })
})

describe('sprintTitle', () => {
  it('uses a sprint\'s own name, or "Sprint"', () => {
    expect(sprintTitle({ label: 'Tuesday night sprint' })).toBe('Tuesday night sprint')
    expect(sprintTitle({ label: 'Sprint' })).toBe('Sprint')
    expect(sprintTitle({})).toBe('Sprint')
  })
})
