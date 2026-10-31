// Cheers (0033): a buyer may add one of these to a vote pack, with an
// optional first name. Codes only, never free text, so there is nothing to
// moderate but the name. The site renders the words (web/src/lib/cheers.js);
// the database accepts exactly these codes (0033's check constraint).
export const CHEER_CODES = ["go", "paws", "cutest", "shelters", "champion", "love"] as const;
export type CheerCode = (typeof CHEER_CODES)[number];

// A code the site offers, or null. Anything else is dropped, never refused:
// a cheer must not stand between a buyer and a checkout.
export function cheerCode(value: unknown): CheerCode | null {
  return typeof value === "string" && (CHEER_CODES as readonly string[]).includes(value) ? (value as CheerCode) : null;
}

// A first name to show beside a cheer, or null: letters (any alphabet),
// spaces, hyphens, apostrophes and periods, up to 20 characters, starting
// with a letter. No digits, no @, no links: it is a name, not a message.
const NAME = /^\p{L}[\p{L}\p{M} .'’-]{0,19}$/u;
export function cheerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  return NAME.test(name) ? name : null;
}
