import { describe, expect, it } from 'vitest'
import { bestValue, cheapestPerVote, defaultPack, formatPerVote, orderPacksForDisplay, perVoteCents, savingsPct, votesWithBonus } from '../src/lib/packs.js'

const PACKS = [
  { slug: 'starter', votes: 5, cents: 500, sort: 1, featured: false },
  { slug: 'fan', votes: 25, cents: 2000, sort: 2, featured: true },
  { slug: 'superfan', votes: 75, cents: 5000, sort: 3, featured: false },
  { slug: 'champion', votes: 200, cents: 10000, sort: 4, featured: false },
  { slug: 'legend', votes: 600, cents: 25000, sort: 5, featured: false },
]
const by = (slug) => PACKS.find((p) => p.slug === slug)

describe('per-vote math', () => {
  it('computes cents per vote', () => {
    expect(perVoteCents(by('starter'))).toBe(100)
    expect(perVoteCents(by('fan'))).toBe(80)
  })
  it('formats dollars at $1 and cents below', () => {
    expect(formatPerVote(by('starter'))).toBe('$1.00 a vote')
    expect(formatPerVote(by('fan'))).toBe('80¢ a vote')
    expect(formatPerVote(by('superfan'))).toBe('67¢ a vote')
    expect(formatPerVote(by('legend'))).toBe('42¢ a vote')
    expect(formatPerVote({ votes: 1, cents: 250 })).toBe('$2.50 a vote')
  })
  it('rounds savings down so a discount is never overstated', () => {
    expect(savingsPct(by('starter'), PACKS)).toBe(0)
    expect(savingsPct(by('fan'), PACKS)).toBe(20)
    expect(savingsPct(by('superfan'), PACKS)).toBe(33)
    expect(savingsPct(by('legend'), PACKS)).toBe(58)
  })
  it('finds the best value', () => {
    expect(bestValue(PACKS).slug).toBe('legend')
    expect(bestValue([])).toBeNull()
    expect(cheapestPerVote(PACKS)).toBe('42¢')
  })
})

describe('display order and default', () => {
  it('lists the biggest pack first', () => {
    expect(orderPacksForDisplay(PACKS).map((p) => p.slug)).toEqual(['legend', 'champion', 'superfan', 'fan', 'starter'])
  })
  it('does not mutate the input', () => {
    const copy = [...PACKS]
    orderPacksForDisplay(PACKS)
    expect(PACKS).toEqual(copy)
  })
  it('defaults to the featured pack, else the middle one', () => {
    expect(defaultPack(PACKS).slug).toBe('fan')
    expect(defaultPack(PACKS.map((p) => ({ ...p, featured: false }))).slug).toBe('superfan')
    expect(defaultPack([])).toBeNull()
  })
})

describe('bonus votes', () => {
  it('multiplies, never below 1x', () => {
    expect(votesWithBonus(by('fan'), 2)).toBe(50)
    expect(votesWithBonus(by('fan'), 1)).toBe(25)
    expect(votesWithBonus(by('fan'), 0)).toBe(25)
    expect(votesWithBonus(by('fan'))).toBe(25)
  })
})
