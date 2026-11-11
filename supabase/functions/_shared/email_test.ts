import { assertEquals } from "jsr:@std/assert@1";
import { classifyFailure } from "./email.ts";

Deno.test("a key or domain problem stops the sweep and is retried, never recorded as failed", () => {
  assertEquals(classifyFailure(401), { permanent: false, halt: true });
  assertEquals(classifyFailure(403), { permanent: false, halt: true });
});

Deno.test("an idempotency clash, rate limiting and server errors are retried", () => {
  for (const status of [409, 429, 500, 502, 503]) assertEquals(classifyFailure(status), { permanent: false, halt: false });
});

Deno.test("a refused or malformed message is final", () => {
  for (const status of [400, 404, 422]) assertEquals(classifyFailure(status), { permanent: true, halt: false });
});
