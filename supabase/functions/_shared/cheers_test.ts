// deno test --allow-env --allow-read supabase/functions/_shared
import { assertEquals } from "jsr:@std/assert@1";
import { CHEER_CODES, cheerCode, cheerName } from "./cheers.ts";

Deno.test("cheer codes: the six the site offers, nothing else", () => {
  for (const code of CHEER_CODES) assertEquals(cheerCode(code), code);
  assertEquals(cheerCode("boo"), null);
  assertEquals(cheerCode(""), null);
  assertEquals(cheerCode(undefined), null);
  assertEquals(cheerCode(["go"]), null);
});

Deno.test("cheer names: first names in any alphabet, trimmed", () => {
  assertEquals(cheerName(" Jo "), "Jo");
  assertEquals(cheerName("Mary Ann"), "Mary Ann");
  assertEquals(cheerName("José"), "José");
  assertEquals(cheerName("Zoë"), "Zoë");
  assertEquals(cheerName("O’Brien"), "O’Brien");
  assertEquals(cheerName("Anne-Marie"), "Anne-Marie");
  assertEquals(cheerName("Nguyễn"), "Nguyễn");
  assertEquals(cheerName("Jo   Ann"), "Jo Ann");
});

Deno.test("cheer names: never an address, a link, digits or a speech", () => {
  assertEquals(cheerName("jo@example.com"), null);
  assertEquals(cheerName("https://x.co"), null);
  assertEquals(cheerName("Jo2"), null);
  assertEquals(cheerName("-Jo"), null);
  assertEquals(cheerName("A very long name indeed"), null);
  assertEquals(cheerName("<b>Jo</b>"), null);
  assertEquals(cheerName(""), null);
  assertEquals(cheerName(42), null);
});
