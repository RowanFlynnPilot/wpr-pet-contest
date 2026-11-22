// node --test scripts/setup.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { adminSql, buildPlan, envLine, pagesUrl, token } from "./setup-plan.mjs";
import { NEWSROOMS } from "../web/src/newsrooms.js";

const css = readFileSync(new URL("../web/src/styles/tokens.css", import.meta.url), "utf8");
const REF = "abcdefghij0123456789";
const none = () => ({ functionSecrets: new Set(), ghVariables: new Map(), ghSecrets: new Set() });
const input = (over = {}) => ({ newsroom: NEWSROOMS.gazette, tokensCss: css, ref: REF, repo: "Example-Co/gazette-pets", admins: ["Ed@Example.org"], ...over });
const secret = (plan, name) => plan.functionSecrets.find((s) => s.name === name)?.value;

test("tokens: a theme's color over the root's, as hex", () => {
  assert.equal(token(css, "--brand-ink", null), "#2b655d");
  assert.equal(token(css, "--brand-ink", "gazette"), "#16304f");
  assert.equal(token(css, "--cream-light", "gazette"), "#f7f4ee");
  assert.equal(token(css, "--no-such", null), null);
});

test("the plan speaks in the newsroom's name and addresses", () => {
  const p = buildPlan(input(), none());
  assert.deepEqual(p.problems, []);
  assert.equal(p.site, "https://example-co.github.io/gazette-pets/");
  assert.equal(secret(p, "ALLOWED_ORIGIN"), "https://example-co.github.io");
  assert.equal(secret(p, "PUBLIC_URL"), p.site);
  assert.equal(secret(p, "NEWSROOM_NAME"), "The Example Gazette");
  assert.equal(secret(p, "NEWSROOM_BRAND_COLOR"), "#16304f");
  assert.equal(secret(p, "STAFF_EMAIL_DOMAINS"), "example.org");
  assert.equal(secret(p, "EMAIL_FROM"), "The Example Gazette <pets@example.org>");
  assert.equal(secret(p, "MODERATOR_EMAILS"), "ed@example.org");
  assert.equal(p.ghVariables.find((v) => v.name === "VITE_NEWSROOM").value, "gazette");
  assert.equal(p.ghVariables.find((v) => v.name === "VITE_SUPABASE_URL").value, `https://${REF}.supabase.co`);
  assert.equal(p.ghVariables.some((v) => v.name === "VITE_PUBLIC_URL"), false);
  assert.deepEqual(p.auth, { site_url: p.site, disable_signup: true, external_email_enabled: true });
});

test("a public URL moves the links and the variable", () => {
  const p = buildPlan(input({ publicUrl: "https://example.org/pets/" }), none());
  assert.equal(secret(p, "PUBLIC_URL"), "https://example.org/pets/");
  assert.equal(p.ghVariables.find((v) => v.name === "VITE_PUBLIC_URL").value, "https://example.org/pets/");
  assert.ok(buildPlan(input({ publicUrl: "http://example.org/pets" }), none()).problems.length);
});

test("the free-vote key is made once and never again", () => {
  const fresh = buildPlan(input(), none());
  assert.deepEqual(fresh.generated.map((g) => g.name), ["CRON_SECRET", "FREE_VOTE_HASH_KEY"]);
  const again = none();
  again.functionSecrets = new Set(["CRON_SECRET", "FREE_VOTE_HASH_KEY"]);
  again.ghSecrets = new Set(["CRON_SECRET"]);
  assert.deepEqual(buildPlan(input(), again).generated, []);
  // Half a CRON_SECRET cannot be read back to copy: both halves are remade.
  again.ghSecrets = new Set();
  assert.deepEqual(buildPlan(input(), again).generated.map((g) => g.name), ["CRON_SECRET"]);
});

test("a hand-set sender or alert address is kept unless this run names one", () => {
  const e = none();
  e.functionSecrets = new Set(["EMAIL_FROM", "STAFF_ALERT_EMAILS", "PUBLIC_URL", "NEWSROOM_NAME"]);
  const p = buildPlan(input(), e);
  assert.deepEqual(p.kept, ["PUBLIC_URL", "EMAIL_FROM", "STAFF_ALERT_EMAILS"]);
  assert.equal(secret(p, "EMAIL_FROM"), undefined);
  assert.equal(secret(p, "NEWSROOM_NAME"), "The Example Gazette");
  const told = buildPlan(input({ emailFrom: "Gazette <pets@vote.example.org>" }), e);
  assert.equal(secret(told, "EMAIL_FROM"), "Gazette <pets@vote.example.org>");
});

test("variables already right are left alone; a chosen photo setting is kept", () => {
  const e = none();
  e.ghVariables = new Map([["PAGES_ENABLED", "true"], ["VITE_NEWSROOM", "gazette"], ["VITE_IMAGE_TRANSFORMS", "true"]]);
  const names = buildPlan(input(), e).ghVariables.map((v) => v.name);
  assert.deepEqual(names, ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);
});

test("the manual list drops what is already set", () => {
  const e = none();
  e.functionSecrets = new Set(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY"]);
  const manual = buildPlan(input(), e).manual.join("\n");
  assert.doesNotMatch(manual, /STRIPE_SECRET_KEY|RESEND_API_KEY/);
  assert.match(manual, /payment method domains/);
  assert.match(buildPlan(input(), none()).manual.join("\n"), /STRIPE_WEBHOOK_SECRET/);
});

test("bad input stops before anything runs", () => {
  assert.ok(buildPlan(input({ newsroom: undefined }), none()).problems.length);
  assert.ok(buildPlan(input({ ref: "abc; rm -rf" }), none()).problems.length);
  assert.ok(buildPlan(input({ repo: "owner/name; echo" }), none()).problems.length);
  assert.ok(buildPlan(input({ admins: ["x'); drop table admins;--@example.org"] }), none()).problems.length);
  assert.throws(() => adminSql(["a'b@example.org"]));
  assert.match(adminSql(["ed@example.org", "jo@example.org"]), /in \('ed@example\.org', 'jo@example\.org'\) on conflict do nothing/);
});

test("env lines survive names with ampersands, apostrophes and dollars", () => {
  assert.equal(envLine("NEWSROOM_NAME", "Wausau Pilot & Review"), "NEWSROOM_NAME='Wausau Pilot & Review'");
  assert.equal(envLine("NEWSROOM_NAME", `The Farmer's "$5" Weekly`), `NEWSROOM_NAME="The Farmer's \\"\\$5\\" Weekly"`);
  assert.throws(() => envLine("X", "a\nb"));
});

test("pages address lowercases the owner only", () => {
  assert.equal(pagesUrl("RowanFlynnPilot/wpr-pet-contest"), "https://rowanflynnpilot.github.io/wpr-pet-contest/");
});
