// deno test --allow-env --allow-read supabase/functions/_shared
//
// Tested here rather than through `supabase functions serve`: the local Kong
// gateway runs its own CORS plugin on /functions/v1 and rewrites the header to
// "*", which hides what the function itself sends. Hosted Supabase passes the
// function's headers through.
import { assertEquals, assertRejects } from "jsr:@std/assert@1";

const req = (origin?: string) =>
  new Request("https://x.supabase.co/functions/v1/f", { headers: origin ? { origin } : {} });

Deno.test("allowed origins are echoed; others are not", async () => {
  Deno.env.set("ALLOWED_ORIGIN", "https://rowanflynnpilot.github.io, http://localhost:5173");
  const { corsHeaders } = await import(`./cors.ts?list=${Date.now()}`);

  assertEquals(corsHeaders(req("http://localhost:5173"))["Access-Control-Allow-Origin"], "http://localhost:5173");
  assertEquals(corsHeaders(req("https://rowanflynnpilot.github.io"))["Access-Control-Allow-Origin"], "https://rowanflynnpilot.github.io");
  assertEquals(corsHeaders(req("https://evil.example"))["Access-Control-Allow-Origin"], "https://rowanflynnpilot.github.io");
  assertEquals(corsHeaders(req())["Vary"], "Origin");
});

Deno.test("a wildcard origin refuses to load", async () => {
  Deno.env.set("ALLOWED_ORIGIN", "*");
  await assertRejects(() => import(`./cors.ts?wild=${Date.now()}`), Error, "wildcards are refused");
});
