// deno test --allow-env --allow-read supabase/functions/_shared
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { HttpError } from "./http_error.ts";
import { email, oneOf, optionalText, requiredText, safeEqual, slug, uuid } from "./validate.ts";

Deno.test("required text is trimmed, collapsed and bounded", () => {
  assertEquals(requiredText("  Tater   Tot ", "Pet name", 40), "Tater Tot");
  assertThrows(() => requiredText("   ", "Pet name", 40), HttpError, "Pet name is required.");
  assertThrows(() => requiredText(null, "Pet name", 40), HttpError);
  assertThrows(() => requiredText("x".repeat(41), "Pet name", 40), HttpError, "40 characters");
});

Deno.test("optional text is null when blank", () => {
  assertEquals(optionalText("", "Caption", 280), null);
  assertEquals(optionalText(undefined, "Caption", 280), null);
  assertThrows(() => optionalText("x".repeat(281), "Caption", 280), HttpError);
});

Deno.test("email", () => {
  assertEquals(email(" jo@example.com "), "jo@example.com");
  for (const bad of ["", "jo", "jo@", "jo@example", "jo @example.com", 42]) {
    assertThrows(() => email(bad), HttpError, "valid email");
  }
});

Deno.test("identifiers", () => {
  assertEquals(uuid("7A000000-0000-0000-0000-00000000000A", "Pet"), "7a000000-0000-0000-0000-00000000000a");
  assertThrows(() => uuid("'; drop table votes; --", "Pet"), HttpError);
  assertEquals(slug("superfan", "Vote pack"), "superfan");
  assertThrows(() => slug("Super Fan", "Vote pack"), HttpError);
  assertEquals(oneOf("cat", ["dog", "cat"] as const, "Species"), "cat");
  assertThrows(() => oneOf("ferret", ["dog", "cat"] as const, "Species"), HttpError);
});

Deno.test("safeEqual", () => {
  assertEquals(safeEqual("s3cret", "s3cret"), true);
  assertEquals(safeEqual("s3cret", "s3cret!"), false);
  assertEquals(safeEqual("", "x"), false);
});
