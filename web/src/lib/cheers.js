// Cheers (0033): a buyer may add one of these to a vote pack, with an
// optional first name. Codes travel and are stored; the words are drawn
// here, so they can be reworded, or a newsroom can say them its own way,
// without touching a row. The database and the checkout function accept
// exactly these codes (supabase/functions/_shared/cheers.ts).
//
// The emoji is kept apart from the words: quoted, it sits outside the
// closing quote, where an emoji's wide glyph cannot open a gap before it.
import { NEWSROOM } from '../config.js'

const PLACE = NEWSROOM.region.replace(/^the /i, '')

export const CHEERS = [
  { code: 'go', words: (pet) => `Go ${pet}!`, emoji: '' },
  { code: 'paws', words: (pet) => `Paws up for ${pet}!`, emoji: '🐾' },
  { code: 'cutest', words: () => `Cutest in ${PLACE}!`, emoji: '' },
  { code: 'love', words: (pet) => `We love you, ${pet}!`, emoji: '' },
  { code: 'champion', words: (pet) => `${pet} for champion!`, emoji: '👑' },
  { code: 'shelters', words: () => 'For the shelters!', emoji: '❤️' },
]

export const CHEER_CODES = CHEERS.map((c) => c.code)

const find = (code) => CHEERS.find((x) => x.code === code)

// The words alone: "Go Biscuit!"
export function cheerText(code, pet) {
  const c = find(code)
  return c ? c.words(pet) : null
}

// As a chip: "Paws up for Biscuit! 🐾"
export function cheerLabel(code, pet) {
  const c = find(code)
  return c ? `${c.words(pet)}${c.emoji ? ` ${c.emoji}` : ''}` : null
}

// As speech: “Paws up for Biscuit!” 🐾
export function cheerQuote(code, pet) {
  const c = find(code)
  return c ? `“${c.words(pet)}”${c.emoji ? ` ${c.emoji}` : ''}` : null
}

// The same first-name rule the checkout function applies, so the form can
// say so before sending. Letters in any alphabet, spaces, hyphens,
// apostrophes and periods; up to 20; starts with a letter.
const NAME = /^\p{L}[\p{L}\p{M} .'’-]{0,19}$/u
export function cleanCheerName(value) {
  const name = String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ')
  if (!name) return ''
  return NAME.test(name) ? name : null
}
