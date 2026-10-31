import { describe, expect, it } from 'vitest'
import { apCount, apNumber } from '../src/lib/format.js'

describe('AP numbers', () => {
  it('spells out one through nine and uses figures from 10', () => {
    expect(apNumber(5)).toBe('five')
    expect(apNumber(0)).toBe('zero')
    expect(apNumber(10)).toBe('10')
    expect(apNumber(1200)).toBe('1,200')
    expect(apCount(4, 'other pet')).toBe('four other pets')
    expect(apCount(1, 'pet')).toBe('one pet')
  })
})
