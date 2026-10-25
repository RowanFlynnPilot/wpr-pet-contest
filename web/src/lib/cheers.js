// Cheers (0033): a buyer may add one of these to a vote pack, with an
// optional first name. Codes travel and are stored; the words are drawn
// here, so they can be reworded, or a newsroom can say them its own way,
// without touching a row. The database and the checkout function accept
// exactly these codes (supabase/functions/_shared/cheers.ts).
import { NEWSROOM } from '../config.js'

const PLACE = NEWSROOM.region.replace(/^the /i, '')

export const CHEERS = [
  { code: 'go', text: (pet) => `Go ${pet}!` },
  { code: 'paws', text: (pet) => `Paws up for ${pet}! 🐾` },
  { code: 'cutest', text: () => `Cutest in ${PLACE}!` },
  { code: 'love', text: (pet) => `We love you, ${pet}!` },
  { code: 'champion', text: (pet) => `${pet} for champion! 👑` },
  { code: 'shelters', text: () => 'For the shelters ❤️' },
]

export const CHEER_CODES = CHEERS.map((c) => c.code)

export function cheerText(code, pet) {
  const c = CHEERS.find((x) => x.code === code)
  return c ? c.text(pet) : null
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
