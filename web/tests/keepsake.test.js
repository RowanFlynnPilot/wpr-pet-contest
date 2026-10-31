import { describe, expect, it } from 'vitest'
import { keepsakeCopy } from '../src/lib/graphics/content.js'

const base = { name: 'Biscuit', year: 2026, contestName: 'Cutest Pet in Marathon County' }
const plain = (s) => s.replace(/\u00a0/g, ' ')

describe('keepsakeCopy', () => {
  it('crowns the champion', () => {
    const k = keepsakeCopy({ ...base, state: { status: 'champion' }, total: 4210, club: 2500, raised: '$12,400', shelters: ['Moments Foster Care'], endedAt: '2026-12-01T02:00:00Z' })
    expect(k.title).toBe('Certificate of Champion Cuteness')
    expect(plain(k.achievement)).toBe('is the 2026 champion of Cutest Pet in Marathon County, with 4,210 votes in all. A member of the 2,500 Club.')
    expect(plain(k.raised)).toBe('Together, voters raised $12,400 for Moments Foster Care.')
    expect(plain(k.date)).toBe('Nov. 30, 2026')
  })
  it('names the round a pet reached', () => {
    const k = keepsakeCopy({ ...base, state: { status: 'out', label: 'Elite Eight' }, total: 820 })
    expect(plain(k.achievement)).toBe('made the Elite Eight of Cutest Pet in Marathon County 2026, with 820 votes in all.')
  })
  it('honors a pet that ran in the Open Round, counting the field', () => {
    const k = keepsakeCopy({ ...base, state: { status: 'unseeded' }, total: 1, entries: 124 })
    expect(plain(k.achievement)).toBe('ran in Cutest Pet in Marathon County 2026, one of 124 pets, with one vote in all.')
  })
  it('leaves out a zero, and says nothing about money it does not know', () => {
    const k = keepsakeCopy({ ...base, state: { status: 'unseeded' }, total: 0 })
    expect(k.achievement).not.toMatch(/vote/)
    expect(k.raised).toBe('Every vote pack helped local animal shelters.')
    expect(k.date).toBe(null)
  })
  it('never says donation', () => {
    const k = keepsakeCopy({ ...base, state: { status: 'champion' }, total: 10, raised: '$5' })
    expect(Object.values(k).join(' ')).not.toMatch(/donat/i)
  })
})
