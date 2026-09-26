// create-checkout's idempotency key. One per checkout attempt: a double tap or
// a retry after a network blip reuses it, so the buyer is never charged twice.
// Changing what is being bought (pack, pet, email) is a new attempt.

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function attemptKey({ pack_slug, round_id, entry_id, buyer_email, newsletter_opt_in }) {
  return [pack_slug, round_id, entry_id, (buyer_email || '').trim().toLowerCase(), Boolean(newsletter_opt_in)].join('|')
}

export function nextRequestId(prev, key, make = uuid) {
  if (prev && prev.key === key) return prev
  return { key, id: make() }
}
