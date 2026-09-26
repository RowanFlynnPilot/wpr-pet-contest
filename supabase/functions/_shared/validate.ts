// Input checks shared by the functions. Pure: no env, no network, so the unit
// tests import it directly.
//
// Messages are shown to readers as-is. Length limits match what the front end
// enforces; a request that exceeds them did not come from the form.

import { badRequest } from "./http_error.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,32}$/;

export function requiredText(value: unknown, label: string, max: number): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) throw badRequest(`${label} is required.`);
  if (text.length > max) throw badRequest(`${label} must be ${max} characters or fewer.`);
  return text;
}

export function optionalText(value: unknown, label: string, max: number): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (text.length > max) throw badRequest(`${label} must be ${max} characters or fewer.`);
  return text;
}

export function email(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!EMAIL.test(text) || text.length > 254) {
    throw badRequest("Please enter a valid email address.");
  }
  return text;
}

export function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw badRequest(`${label} is invalid.`);
  return value.toLowerCase();
}

export function slug(value: unknown, label: string): string {
  if (typeof value !== "string" || !SLUG.test(value)) throw badRequest(`${label} is invalid.`);
  return value;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw badRequest(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

// Constant-time string comparison for shared secrets.
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
}
