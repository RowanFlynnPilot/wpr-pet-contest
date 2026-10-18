import { describe, expect, it } from 'vitest'
import { apDate, apDateTime, apTime, countdownParts, describeCountdown, fmtInt, fmtMoney, formatCountdown, plural, timeAgo } from '../src/lib/format.js'

const S = 1000
const M = 60 * S
const H = 60 * M
const D = 24 * H

describe('countdown', () => {
  it('splits into parts', () => {
    expect(countdownParts(2 * D + 4 * H + 5 * M + 9 * S)).toEqual({ days: 2, hours: 4, minutes: 5, seconds: 9 })
  })
  it('never goes negative', () => {
    expect(countdownParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 })
    expect(formatCountdown(-1)).toBe('0s')
  })
  it('shows the two largest units', () => {
    expect(formatCountdown(2 * D + 4 * H + 30 * M)).toBe('2d 4h')
    expect(formatCountdown(4 * H + 7 * M)).toBe('4h 07m')
    expect(formatCountdown(12 * M + 5 * S)).toBe('12m 05s')
    expect(formatCountdown(9 * S + 400)).toBe('9s')
  })
  it('reads naturally for screen readers', () => {
    expect(describeCountdown(2 * D + 4 * H)).toBe('2 days, 4 hours')
    expect(describeCountdown(1 * H + 1 * M)).toBe('1 hour, 1 minute')
    expect(describeCountdown(20 * S)).toBe('less than a minute')
  })
})

describe('money and numbers', () => {
  it('formats cents', () => {
    expect(fmtMoney(2000)).toBe('$20')
    expect(fmtMoney(2050)).toBe('$20.50')
    expect(fmtMoney(2000, { exact: true })).toBe('$20.00')
    expect(fmtMoney(123456, { exact: true })).toBe('$1,234.56')
    expect(fmtMoney(123456789)).toBe('$1,234,567.89')
    expect(fmtMoney(123456789, { whole: true })).toBe('$1,234,568')
    expect(fmtMoney(0)).toBe('$0')
  })
  it('formats counts', () => {
    expect(fmtInt(12345)).toBe('12,345')
    expect(plural(1, 'vote')).toBe('1 vote')
    expect(plural(1200, 'vote')).toBe('1,200 votes')
  })
})

describe('AP-style dates in Central time', () => {
  // 2026-10-11 01:00 UTC is Saturday, Oct. 10, 8 p.m. CDT.
  const t = '2026-10-11T01:00:00Z'
  it('uses Central time and AP month abbreviations', () => {
    expect(apDate(t)).toBe('Saturday, Oct. 10')
    expect(apDate('2026-09-19T17:00:00Z', { weekday: false })).toBe('Sept. 19')
    expect(apDate('2026-06-03T17:00:00Z', { weekday: false, year: true })).toBe('June 3, 2026')
  })
  it('writes times the AP way', () => {
    expect(apTime(t)).toBe('8 p.m.')
    expect(apTime('2026-10-10T14:30:00Z')).toBe('9:30 a.m.')
    expect(apTime('2026-10-10T17:00:00Z')).toBe('noon')
    expect(apTime('2026-10-10T05:00:00Z')).toBe('midnight')
    expect(apDateTime(t)).toBe('Saturday, Oct. 10 at 8 p.m.')
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-10-10T12:00:00Z')
  it('rounds to friendly units', () => {
    expect(timeAgo(now - 10 * S, now)).toBe('just now')
    expect(timeAgo(now - 2 * M, now)).toBe('2 min ago')
    expect(timeAgo(now - 3 * H, now)).toBe('3 hr ago')
    expect(timeAgo(now - 2 * D, now)).toBe('2 days ago')
  })
})
