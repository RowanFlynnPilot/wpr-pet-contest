// deno test --allow-env --allow-read supabase/functions/_shared
import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import {
  bytea,
  centralDay,
  cleanCode,
  cleanToken,
  codeHash,
  connectionHash,
  hex,
  isDisposable,
  newCode,
  newToken,
  normalizeEmail,
  sha256,
} from "./freevote.ts";

Deno.test("codes are six digits, and vary", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const c = newCode();
    assertMatch(c, /^\d{6}$/);
    seen.add(c);
  }
  assert(seen.size > 190, "codes should almost never repeat in 200 draws");
});

Deno.test("tokens are url-safe and pass our own token check", () => {
  const t = newToken();
  assertMatch(t, /^[A-Za-z0-9_-]{43}$/);
  assertEquals(cleanToken(t), t);
  assertNotEquals(newToken(), t);
  assertEquals(cleanToken("short"), null);
  assertEquals(cleanToken("x".repeat(43) + "/"), null);
});

Deno.test("readers may paste codes with spaces or dashes", () => {
  assertEquals(cleanCode(" 123 456 "), "123456");
  assertEquals(cleanCode("123-456"), "123456");
  assertEquals(cleanCode("12345"), null);
  assertEquals(cleanCode("12345a"), null);
  assertEquals(cleanCode(123456), null);
});

Deno.test("a code's hash depends on the key and its challenge, so a database dump reveals nothing", async () => {
  const a = hex(await codeHash("key-one", "c1", "123456"));
  assertEquals(a, hex(await codeHash("key-one", "c1", "123456")));
  assertNotEquals(a, hex(await codeHash("key-two", "c1", "123456")));
  assertNotEquals(a, hex(await codeHash("key-one", "c1", "123457")));
  assertNotEquals(a, hex(await codeHash("key-one", "c2", "123456")));
});

Deno.test("only plain addresses qualify, normalized the way the database does", () => {
  assertEquals(normalizeEmail(" A.B@Gmail.COM. "), "a.b@gmail.com");
  for (const bad of ["<ab@gmail.com>", "x<ab@gmail.com>", '"x" <ab@gmail.com>', "ab@gmail.com,", "a b@gmail.com", "ab@", "@gmail.com", 7]) {
    assertEquals(normalizeEmail(bad), null, String(bad));
  }
});

Deno.test("connection hashes are keyed and never the address", async () => {
  const h = await connectionHash("k", "203.0.113.7");
  assertMatch(h!, /^[0-9a-f]{32}$/);
  assert(!h!.includes("203"));
  assertEquals(await connectionHash("k", ""), null);
});

Deno.test("bytea arguments are hex, the way PostgREST takes them", async () => {
  assertEquals(bytea(new Uint8Array([0, 15, 255])), String.raw`\x000fff`);
  assertEquals((await sha256("abc")).length, 32);
});

Deno.test("throwaway inboxes are refused, subdomains included; real ones are not", () => {
  assert(isDisposable("x@mailinator.com"));
  assert(isDisposable("x@MAILINATOR.com"));
  assert(isDisposable("x@inbox.guerrillamail.com"));
  assert(!isDisposable("x@gmail.com"));
  assert(!isDisposable("x@wausaupilotandreview.com"));
});

Deno.test("the Central day matches the database's, across the end of daylight time", () => {
  assertEquals(centralDay(new Date("2026-11-01T05:30:00Z")), "2026-11-01");
  assertEquals(centralDay(new Date("2026-11-02T05:30:00Z")), "2026-11-01");
  assertEquals(centralDay(new Date("2026-11-02T06:30:00Z")), "2026-11-02");
});
