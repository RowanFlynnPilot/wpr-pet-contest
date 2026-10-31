// Codes, tokens and keyed hashes for the free daily vote. Pure: Web Crypto
// only, no env and no network, so the unit tests import it directly.
//
// Nothing secret is stored in the clear. A code is stored as an HMAC keyed by
// FREE_VOTE_HASH_KEY, which never reaches the database, so a dump of it does
// not reveal live codes. Link and device tokens are 32 random bytes, stored as
// SHA-256. Connection addresses are kept only as keyed hashes.

import { DISPOSABLE_DOMAINS } from "./disposable.ts";

const enc = new TextEncoder();

// Six digits, uniformly: rejection sampling, so no digit is likelier than another.
export function newCode(): string {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

// 32 random bytes, base64url: goes in a link or the browser's storage.
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function hmac(key: string, text: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(text)));
}

// How PostgREST takes a bytea argument.
export function bytea(bytes: Uint8Array): string {
  return "\\x" + hex(bytes);
}

export function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Bound to its challenge, so equal codes in two challenges store differently.
export const codeHash = (key: string, challengeId: string, code: string) => hmac(key, `code:${challengeId}:${code}`);

// The address as the free vote stores and mails it, matching the database's
// free_vote_email(): lowercased, trimmed, one trailing dot dropped, and only a
// plain addr-spec. A display name, brackets, quotes or a comma could still be
// delivered to an inbox the daily limit would not recognize, so they are
// refused outright. Null when it does not qualify.
const ADDR = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const e = value.trim().toLowerCase().replace(/\.$/, "");
  return ADDR.test(e) && e.length <= 254 ? e : null;
}

// A keyed hash of the connection, never the address. Enough to see one
// connection casting for many addresses; useless to anyone without the key.
export async function connectionHash(key: string, ip: string): Promise<string | null> {
  return ip ? hex(await hmac(key, `ip:${ip}`)).slice(0, 32) : null;
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
}

// A code is six digits; readers paste them with spaces or dashes.
export function cleanCode(value: unknown): string | null {
  const digits = typeof value === "string" ? value.replace(/[\s-]/g, "") : "";
  return /^\d{6}$/.test(digits) ? digits : null;
}

// A link or device token as we issue them.
export function cleanToken(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(value) ? value : null;
}

export function isDisposable(email: string): boolean {
  const domain = email.split("@").pop()?.toLowerCase().trim() ?? "";
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // Subdomains of a throwaway service are throwaway too.
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

// The Central calendar day, as the database counts it (free_vote_day).
export function centralDay(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(at);
}
