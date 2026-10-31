import { describe, expect, it } from 'vitest'
import { deadlineIcs, icsHref } from '../src/lib/calendar.js'
import { goalProgress } from '../src/lib/goal.js'

describe('deadlineIcs', () => {
  const ics = deadlineIcs({
    uid: 'r2-pet1',
    title: 'Voting closes: Sweet 16, Cutest Pet in Marathon County',
    closesAt: '2026-11-30T02:00:00Z',
    url: 'https://wausaupilotandreview.com/pets/#/pet/x',
    description: 'Vote for Biscuit, before 8 p.m.; totals reset every round.',
    now: Date.parse('2026-11-28T15:00:00Z'),
  })

  it('is a valid calendar with one event ending at the deadline and a two-hour reminder', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toMatch(/DTEND:20261130T020000Z/)
    expect(ics).toMatch(/DTSTART:20261130T014500Z/)
    expect(ics).toMatch(/TRIGGER:-PT2H/)
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true)
  })

  it('escapes commas and semicolons, and keeps every line within 75 octets', () => {
    expect(ics).toMatch(/SUMMARY:Voting closes: Sweet 16\\, Cutest Pet/)
    expect(ics).toMatch(/8 p\.m\.\\; totals reset/)
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75)
  })

  it('makes a link a phone opens as an "add event" sheet', () => {
    expect(icsHref(ics)).toMatch(/^data:text\/calendar;charset=utf-8,BEGIN%3AVCALENDAR/)
  })
})

describe('goalProgress', () => {
  it('measures progress honestly', () => {
    expect(goalProgress(152900, 500000)).toEqual({ goal: 500000, raised: 152900, reached: false, pct: 30, remaining: 347100 })
    expect(goalProgress(499999, 500000).reached).toBe(false)
    expect(goalProgress(499999, 500000).pct).toBe(99)
    expect(goalProgress(520000, 500000)).toMatchObject({ reached: true, pct: 100, remaining: 0 })
  })

  it('shows nothing without a goal', () => {
    expect(goalProgress(1000, null)).toBeNull()
    expect(goalProgress(1000, 0)).toBeNull()
  })
})
