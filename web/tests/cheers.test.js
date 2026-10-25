import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CHEER_CODES, CHEERS, cheerLabel, cheerQuote, cheerText, cleanCheerName } from '../src/lib/cheers.js'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

describe('cheers', () => {
  it('offers the same six codes the checkout function and the database accept', () => {
    const fn = read('supabase/functions/_shared/cheers.ts').match(/CHEER_CODES = \[([^\]]+)\]/)[1]
    const db = read('supabase/migrations/0033_cheers_and_reminders.sql').match(/cheer\s+text check \(cheer in \(([^)]+)\)\)/)[1]
    const codes = (s) => [...s.matchAll(/["']([a-z]+)["']/g)].map((m) => m[1]).sort()
    expect(codes(fn)).toEqual([...CHEER_CODES].sort())
    expect(codes(db)).toEqual([...CHEER_CODES].sort())
  })
  it('writes each cheer with the pet in it, and never a donation', () => {
    for (const c of CHEERS) {
      const t = c.words('Biscuit')
      expect(t.length).toBeGreaterThan(5)
      expect(t).not.toMatch(/donat/i)
    }
    expect(cheerText('go', 'Biscuit')).toBe('Go Biscuit!')
    expect(cheerText('nope', 'Biscuit')).toBe(null)
    // The emoji sits outside the quote, where its wide glyph opens no gap.
    expect(cheerLabel('paws', 'Biscuit')).toBe('Paws up for Biscuit! 🐾')
    expect(cheerQuote('paws', 'Biscuit')).toBe('“Paws up for Biscuit!” 🐾')
    expect(cheerQuote('go', 'Biscuit')).toBe('“Go Biscuit!”')
  })
  it('takes a first name in any alphabet, empty for anonymous, and refuses anything else', () => {
    expect(cleanCheerName('  Jo ')).toBe('Jo')
    expect(cleanCheerName('Zoë')).toBe('Zoë')
    expect(cleanCheerName('')).toBe('')
    expect(cleanCheerName('jo@example.com')).toBe(null)
    expect(cleanCheerName('Jo2')).toBe(null)
    expect(cleanCheerName('a'.repeat(21))).toBe(null)
  })
})
