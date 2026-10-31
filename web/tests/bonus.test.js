import { describe, expect, it } from 'vitest'
import { activeWindow, multiplierWord, upcomingWindow, windowTitle } from '../src/lib/bonus.js'

const H = 3600 * 1000
const T0 = Date.parse('2026-10-05T00:00:00Z')
const w = (id, startH, endH, extra = {}) => ({
  id,
  starts_at: new Date(T0 + startH * H).toISOString(),
  ends_at: new Date(T0 + endH * H).toISOString(),
  multiplier: 2,
  label: 'Double Votes',
  ...extra,
})

describe('activeWindow', () => {
  const windows = [w('a', 1, 3), w('b', 10, 12)]
  it('finds the live window', () => {
    expect(activeWindow(windows, T0 + 2 * H).id).toBe('a')
  })
  it('includes the start instant and excludes the end (matches vote_quote)', () => {
    expect(activeWindow(windows, T0 + 1 * H).id).toBe('a')
    expect(activeWindow(windows, T0 + 3 * H)).toBeNull()
  })
  it('is null between windows and with none', () => {
    expect(activeWindow(windows, T0 + 5 * H)).toBeNull()
    expect(activeWindow([], T0)).toBeNull()
    expect(activeWindow(undefined, T0)).toBeNull()
  })
})

describe('upcomingWindow', () => {
  it('teases the next window within 24 hours', () => {
    const windows = [w('late', 30, 32), w('soon', 20, 22), w('sooner', 5, 6)]
    expect(upcomingWindow(windows, T0).id).toBe('sooner')
  })
  it('ignores windows beyond the horizon and ones already started', () => {
    expect(upcomingWindow([w('far', 25, 26)], T0)).toBeNull()
    expect(upcomingWindow([w('live', -1, 1)], T0)).toBeNull()
  })
  it('accepts a custom horizon', () => {
    expect(upcomingWindow([w('far', 25, 26)], T0, 48 * H).id).toBe('far')
  })
})

describe('labels', () => {
  it('words multipliers', () => {
    expect(multiplierWord(2)).toBe('Double')
    expect(multiplierWord(3)).toBe('Triple')
    expect(multiplierWord(7)).toBe('7×')
  })
  it('prefers the configured label', () => {
    expect(windowTitle({ label: 'Double Vote Night', multiplier: 2 })).toBe('Double Vote Night')
    expect(windowTitle({ label: '', multiplier: 3 })).toBe('Triple Votes')
  })
})
