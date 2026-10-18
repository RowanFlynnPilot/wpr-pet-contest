// The launch preflight's decisions, on synthetic facts. No network, no CLI:
//   node --test scripts/preflight.test.mjs
//
// goodFacts() is a project ready to launch, where every check passes. Each test
// breaks one thing and asserts the line that should change, and nothing else
// needs a live project to prove it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CHECKS, checkAuth, checkCi, checkConfig, checkContestData, checkFunctionsDeployed, checkFunctionsHttp, checkGithubSecrets, checkMigrations,
  checkPages, checkPagesSite, checkProject, checkSecrets, checkStripe, checkVariables, checkWordPress, describeKey, embedScript, FUNCTIONS,
  parseConfig, parseIframes, parseMigrationList, pickContest, pointsAt, RECOMMENDED_SECRETS, redact, REQUIRED_SECRETS, runChecks, summarize,
  WEBHOOK_EVENTS,
} from "./preflight-checks.mjs";

const REF = "abcdefghijklmnopqrst";
const BASE = `https://${REF}.supabase.co`;
const PAGES = "https://rowanflynnpilot.github.io/wpr-pet-contest/";
const ORIGIN = "https://rowanflynnpilot.github.io";
const WP = "https://wausaupilotandreview.com/pet-contest/";
// Built at runtime so no key-shaped literal sits in the repo for a scanner.
const fakeKey = (prefix) => `${prefix}${"FAKE0000".repeat(3)}`;
const jwt = (claims) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.c2ln`;

function goodProbe(slug) {
  const post = { status: ["moderate", "notify", "health", "disqualify"].includes(slug) ? 401 : 400 };
  return slug === "stripe-webhook" ? { post } : { options: { status: 200, allowOrigin: ORIGIN }, post };
}

function goodFacts() {
  return {
    ref: REF,
    repo: "RowanFlynnPilot/wpr-pet-contest",
    supabaseUrl: BASE,
    pagesUrl: PAGES,
    pagesOrigin: ORIGIN,
    migrationFiles: ["0001", "0002", "0003"],
    supabase: {
      project: { name: "wpr-pet-contest", status: "ACTIVE_HEALTHY" },
      secrets: { names: [...REQUIRED_SECRETS, ...RECOMMENDED_SECRETS, "ALERT_WEBHOOK_URL", "SUPABASE_URL"] },
      functions: { list: FUNCTIONS.map((slug) => ({ slug, status: "ACTIVE", verifyJwt: false })) },
      http: { origin: ORIGIN, probes: Object.fromEntries(FUNCTIONS.map((s) => [s, goodProbe(s)])) },
      migrations: { remote: ["0001", "0002", "0003"] },
      auth: { externalEmailEnabled: true, disableSignup: true, siteUrl: PAGES },
      data: {
        contests: [
          { id: "c26", year: 2026, name: "Cutest Pet 2026", status: "complete" },
          { id: "c27", year: 2027, name: "Cutest Pet 2027", status: "draft", beneficiary_split_pct: 50, bracket_size: 16 },
        ],
        admins: 2,
        packs: [{ slug: "single", active: true }, { slug: "old", active: false }],
        shelters: [{ name: "Humane Society of Marathon County", hasLogo: true }],
        bonusWindows: 1,
      },
    },
    github: {
      repo: { visibility: "PUBLIC" },
      pages: { enabled: true, buildType: "workflow" },
      variables: {
        values: { PAGES_ENABLED: "true", VITE_SUPABASE_URL: BASE, VITE_PUBLIC_URL: WP, VITE_IMAGE_TRANSFORMS: "false", HEALTH_CHECKS: "true", EMAIL_SWEEP: "true" },
        keys: {
          VITE_SUPABASE_ANON_KEY: { ...describeKey(jwt({ role: "anon", ref: REF })), matchesProject: true },
          VITE_STRIPE_PUBLISHABLE_KEY: describeKey(fakeKey("pk_live_")),
        },
      },
      secrets: { names: ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_ID", "HEALTH_URL", "CRON_SECRET", "NOTIFY_URL"] },
      run: { run: { conclusion: "success", status: "completed", url: "https://github.com/x/y/actions/runs/1", createdAt: "2026-10-01T12:00:00Z" } },
    },
    stripe: {
      key: { kind: "rk", mode: "live" },
      webhooks: { list: [{ url: `${BASE}/functions/v1/stripe-webhook`, status: "enabled", events: [...WEBHOOK_EVENTS] }] },
      domains: {
        list: [
          { name: "rowanflynnpilot.github.io", enabled: true, applePay: "active" },
          { name: "wausaupilotandreview.com", enabled: true, applePay: "active" },
        ],
      },
      account: { descriptor: "WPR PET CONTEST" },
    },
    web: {
      pages: { status: 200 },
      wordpress: {
        url: WP, status: 200, challenged: false,
        iframes: [{ src: PAGES, allow: "payment; web-share; clipboard-write" }],
        script: { forwardsHash: true, listensForHeight: true },
      },
      config: {
        found: true, rulesApproved: true, contact: "pets@wausaupilotandreview.com", eligibility: "Entrants must be 18 or older.",
        placeholderNote: false, markers: [], analyticsDomain: "wausaupilotandreview.com", presenting: "Acme Pet Supply",
      },
    },
  };
}

// Apply a change to a fresh copy of the good facts and run one check.
function run(check, mutate = () => {}) {
  const f = goodFacts();
  mutate(f);
  return [check(f)].flat();
}
const byId = (results, id) => {
  const r = results.find((x) => x.id === id);
  assert.ok(r, `no result ${id} in ${results.map((x) => x.id).join(", ")}`);
  return r;
};
const status = (results, id) => byId(results, id).status;

// ---------------------------------------------------------------- whole run --

test("a ready project passes every check", () => {
  const results = runChecks(goodFacts());
  const notPass = results.filter((r) => r.status !== "pass");
  assert.deepEqual(notPass, []);
  assert.equal(summarize(results).exitCode, 0);
});

test("every result is well formed, and every fail and warn names a LAUNCH.md section", () => {
  // A project where almost nothing is set up, so most checks fail or warn.
  const f = goodFacts();
  f.supabase.project.status = "INACTIVE";
  f.supabase.secrets.names = [];
  f.supabase.functions.list = [];
  f.supabase.migrations.remote = [];
  f.supabase.auth = { externalEmailEnabled: false, disableSignup: false, siteUrl: "http://localhost:3000" };
  f.supabase.data = { contests: [], admins: 0, packs: [], shelters: [], bonusWindows: 0 };
  f.github.repo.visibility = "PRIVATE";
  f.github.pages = { enabled: false };
  f.github.variables = { values: {}, keys: {} };
  f.github.secrets.names = [];
  f.github.run.run.conclusion = "failure";
  f.stripe.key.mode = "test";
  f.stripe.webhooks.list = [];
  f.stripe.domains.list = [];
  f.stripe.account.descriptor = "";
  f.web.pages.status = 404;
  f.web.wordpress.status = 404;
  f.web.config = { ...f.web.config, rulesApproved: false, placeholderNote: true, analyticsDomain: "" };
  const results = runChecks(f);
  for (const r of results) {
    assert.ok(r.id && r.group && r.message, JSON.stringify(r));
    assert.ok(["pass", "fail", "warn", "skip"].includes(r.status), r.status);
    if (r.status === "fail" || r.status === "warn") assert.match(r.fix ?? "", /LAUNCH\.md/, `${r.id} fix: ${r.fix}`);
  }
  assert.ok(results.filter((r) => r.status === "fail").length >= 15);
  assert.equal(new Set(results.map((r) => r.id)).size, results.length, "ids are unique");
});

test("an empty facts object skips everything rather than crashing", () => {
  const results = runChecks({});
  assert.ok(results.length >= CHECKS.length);
  assert.deepEqual(results.filter((r) => r.status !== "skip"), []);
});

test("a check that throws becomes one failed line; the others still run", () => {
  const f = goodFacts();
  f.supabase.secrets = { names: null };
  const results = runChecks(f);
  assert.equal(status(results, "internal.checkSecrets"), "fail");
  assert.equal(status(results, "supabase.project"), "pass");
  assert.equal(status(results, "web.sponsors"), "pass");
});

test("summarize: fails block, warnings block only with --strict", () => {
  const w = [{ status: "pass" }, { status: "warn" }, { status: "skip" }];
  assert.deepEqual(summarize(w), { counts: { pass: 1, fail: 0, warn: 1, skip: 1 }, ok: true, exitCode: 0 });
  assert.equal(summarize(w, { strict: true }).exitCode, 1);
  assert.equal(summarize([...w, { status: "fail" }]).exitCode, 1);
});

// ------------------------------------------------------------------ helpers --

test("describeKey keeps the kind, never the value", () => {
  const live = describeKey(fakeKey("sk_live_"));
  assert.deepEqual([live.kind, live.mode, live.secret], ["sk", "live", true]);
  assert.equal(JSON.stringify(live).includes("FAKE"), false);
  assert.deepEqual([describeKey(fakeKey("pk_test_")).mode, describeKey(fakeKey("pk_test_")).secret], ["test", false]);
  assert.equal(describeKey(fakeKey("rk_live_")).secret, true);
  assert.equal(describeKey(fakeKey("sb_secret_")).secret, true);
  assert.equal(describeKey(fakeKey("sb_publishable_")).secret, false);
  const service = describeKey(jwt({ role: "service_role", ref: REF }));
  assert.deepEqual([service.kind, service.role, service.ref, service.secret], ["jwt", "service_role", REF, true]);
  assert.deepEqual(describeKey(""), { present: false });
  assert.equal(describeKey(undefined).present, false);
});

test("redact strips known values and anything shaped like a key", () => {
  const key = fakeKey("sk_live_");
  assert.equal(redact(`Invalid API Key provided: ${key}`), "Invalid API Key provided: [redacted]");
  assert.equal(redact("Invalid API Key provided: sk_live_****************1234"), "Invalid API Key provided: [redacted]");
  assert.equal(redact(`token ${jwt({ role: "anon" })} here`), "token [redacted] here");
  assert.equal(redact("secret hunter2hunter2 leaked", ["hunter2hunter2"]), "secret [redacted] leaked");
  assert.equal(redact(`${fakeKey("whsec_")} ${fakeKey("sb_secret_")}`), "[redacted] [redacted]");
  assert.equal(redact("plain text, https://abc.supabase.co"), "plain text, https://abc.supabase.co");
});

test("pickContest prefers the live contest, then a draft, never a finished one", () => {
  assert.equal(pickContest([{ year: 2027, status: "draft", id: "d" }, { year: 2026, status: "voting", id: "v" }]).id, "v");
  assert.equal(pickContest([{ year: 2026, status: "complete", id: "c" }, { year: 2027, status: "draft", id: "d" }]).id, "d");
  assert.equal(pickContest([{ year: 2026, status: "complete" }]), null);
  assert.equal(pickContest([]), null);
});

test("parseMigrationList reads the CLI's table", () => {
  const out = `
  \n   Local | Remote | Time (UTC)\n  -------|--------|------------\n   0001  | 0001   | 0001\n   0002  | 0002   | 0002\n   0003  |        | 0003\n`;
  assert.deepEqual(parseMigrationList(out), { local: ["0001", "0002", "0003"], remote: ["0001", "0002"] });
  assert.deepEqual(parseMigrationList("│ Local │ Remote │\n│ 0001 │ 0001 │"), { local: ["0001"], remote: ["0001"] });
  assert.deepEqual(parseMigrationList(""), { local: [], remote: [] });
});

test("parseIframes and embedScript read a WordPress page", () => {
  const html = `<p>Vote!</p><iframe id="wpr-pets" src="${PAGES}?a=1&#038;b=2" allow='payment; web-share' height=1400></iframe>
    <iframe src="about:blank" data-lazy-src="https://www.youtube.com/embed/x"></iframe>
    <script>if (location.hash.indexOf('#/') === 0) {} if (event.data.type === 'wpr-pets-height') {}</script>`;
  const frames = parseIframes(html);
  assert.deepEqual(frames[0], { src: `${PAGES}?a=1&b=2`, allow: "payment; web-share" });
  assert.equal(frames[1].src, "https://www.youtube.com/embed/x");
  assert.deepEqual(embedScript(html), { forwardsHash: true, listensForHeight: true });
  assert.deepEqual(embedScript("<p>nothing</p>"), { forwardsHash: false, listensForHeight: false });
});

test("pointsAt matches the Pages site and nothing else", () => {
  assert.ok(pointsAt(PAGES, PAGES));
  assert.ok(pointsAt("https://RowanFlynnPilot.github.io/wpr-pet-contest/#/pet/1", PAGES));
  assert.ok(pointsAt("https://rowanflynnpilot.github.io/wpr-pet-contest", PAGES));
  assert.ok(!pointsAt("https://rowanflynnpilot.github.io/other/", PAGES));
  assert.ok(!pointsAt("https://evil.example/wpr-pet-contest/", PAGES));
  assert.ok(!pointsAt("not a url at all", "nope"));
});

test("parseConfig reads RULES, ANALYTICS and SPONSORS as text", () => {
  const draft = `
// PLACEHOLDERS until WPR and counsel sign off.
export const RULES = {
  rulesApproved: false,
  contact: 'pets@wausaupilotandreview.com',
  eligibility:
    'Entrants must live in <state>. TODO: confirm age. Odd {brace} inside',
}
export const SPONSORS = {
  presenting: null,
  gallery: { name: 'Gallery Co' },
}
export const ANALYTICS = {
  domain: '',
  src: 'https://plausible.io/js/script.js',
}`;
  const c = parseConfig(draft);
  assert.equal(c.found, true);
  assert.equal(c.rulesApproved, false);
  assert.equal(c.contact, "pets@wausaupilotandreview.com");
  assert.match(c.eligibility, /^Entrants must live/);
  assert.equal(c.placeholderNote, true);
  assert.deepEqual(c.markers.sort(), ["<state>", "TODO"].sort());
  assert.equal(c.analyticsDomain, "");
  assert.equal(c.presenting, null);

  const final = draft
    .replace("// PLACEHOLDERS until WPR and counsel sign off.", "// Approved by counsel, Oct. 2026.")
    .replace("rulesApproved: false", "rulesApproved: true")
    .replace("<state>. TODO: confirm age.", "Wisconsin.")
    .replace("presenting: null", "presenting: { name: 'Acme Pet Supply', logo: 'acme.png' }")
    .replace("domain: ''", "domain: 'wausaupilotandreview.com'");
  const done = parseConfig(final);
  assert.deepEqual([done.rulesApproved, done.placeholderNote, done.markers, done.presenting, done.analyticsDomain],
    [true, false, [], "Acme Pet Supply", "wausaupilotandreview.com"]);
  assert.equal(parseConfig("export const X = 1").found, false);
});

test("parseConfig understands the real web/src/config.js", () => {
  const c = parseConfig(readFileSync(new URL("../web/src/config.js", import.meta.url), "utf8"));
  assert.equal(c.found, true);
  assert.equal(typeof c.rulesApproved, "boolean");
  assert.match(c.contact, /@/);
  assert.ok(c.eligibility.length > 20);
  assert.equal(typeof c.analyticsDomain, "string");
});

// ----------------------------------------------------------------- Supabase --

test("project: healthy passes, paused fails with the restore fix, missing and odd states fail", () => {
  assert.equal(status(run(checkProject), "supabase.project"), "pass");
  const paused = byId(run(checkProject, (f) => (f.supabase.project.status = "INACTIVE")), "supabase.project");
  assert.equal(paused.status, "fail");
  assert.match(paused.fix, /Restore it in the dashboard/);
  assert.equal(status(run(checkProject, (f) => (f.supabase.project = { missing: true })), "supabase.project"), "fail");
  assert.equal(status(run(checkProject, (f) => (f.supabase.project.status = "COMING_UP")), "supabase.project"), "warn");
  assert.equal(status(run(checkProject, (f) => (f.supabase.project.status = "ACTIVE_UNHEALTHY")), "supabase.project"), "fail");
  assert.equal(status(run(checkProject, (f) => (f.supabase.project = { skip: "not checked", fix: "run supabase login" })), "supabase.project"), "skip");
  assert.equal(status(run(checkProject, (f) => (f.supabase.project = { error: "boom" })), "supabase.project"), "fail");
});

test("secrets: required, recommended and alert channels", () => {
  const missing = run(checkSecrets, (f) => (f.supabase.secrets.names = ["ALLOWED_ORIGIN"]));
  const req = byId(missing, "supabase.secrets.required");
  assert.equal(req.status, "fail");
  assert.match(req.message, /STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET/);
  assert.doesNotMatch(req.message, /ALLOWED_ORIGIN/);
  assert.equal(status(missing, "supabase.secrets.recommended"), "warn");
  assert.match(byId(missing, "supabase.secrets.recommended").fix, /§2, §6/);
  assert.equal(status(missing, "supabase.secrets.alerts"), "warn");

  const email = run(checkSecrets, (f) => (f.supabase.secrets.names = [...REQUIRED_SECRETS, "RESEND_API_KEY", "STAFF_ALERT_EMAILS"]));
  assert.equal(status(email, "supabase.secrets.alerts"), "pass");
  const noResend = run(checkSecrets, (f) => (f.supabase.secrets.names = [...REQUIRED_SECRETS, "STAFF_ALERT_EMAILS"]));
  assert.match(byId(noResend, "supabase.secrets.alerts").message, /RESEND_API_KEY is not/);

  const paused = run(checkSecrets, (f) => {
    f.supabase.project.status = "INACTIVE";
    f.supabase.secrets.names = [];
  });
  assert.match(byId(paused, "supabase.secrets.required").message, /paused project/);
  assert.equal(status(run(checkSecrets, (f) => (f.supabase.secrets = { skip: "not checked" })), "supabase.secrets"), "skip");
});

test("functions deployed: all seven, active, JWT verification off", () => {
  assert.equal(status(run(checkFunctionsDeployed), "supabase.functions"), "pass");
  const none = byId(run(checkFunctionsDeployed, (f) => (f.supabase.functions.list = [])), "supabase.functions");
  assert.equal(none.status, "fail");
  assert.match(none.message, /0 of 7/);
  const some = byId(run(checkFunctionsDeployed, (f) => (f.supabase.functions.list = f.supabase.functions.list.filter((x) => x.slug !== "disqualify"))), "supabase.functions");
  assert.match(some.message, /not deployed: disqualify/);
  const jwtOn = byId(run(checkFunctionsDeployed, (f) => (f.supabase.functions.list[2].verifyJwt = true)), "supabase.functions");
  assert.equal(jwtOn.status, "fail");
  assert.match(jwtOn.message, /JWT verification on for stripe-webhook/);
  assert.match(jwtOn.fix, /verify_jwt/);
  assert.equal(status(run(checkFunctionsDeployed, (f) => (f.supabase.functions.list[0].status = "THROTTLED")), "supabase.functions"), "fail");
  assert.equal(status(run(checkFunctionsDeployed, (f) => (f.supabase.functions = { skip: "x" })), "supabase.functions"), "skip");
});

test("functions over HTTP: boot, CORS and refusals", () => {
  const ok = run(checkFunctionsHttp);
  assert.equal(ok.length, FUNCTIONS.length);
  assert.ok(ok.every((r) => r.status === "pass"));
  assert.match(byId(ok, "supabase.http.moderate").message, /CORS allows https:\/\/rowanflynnpilot\.github\.io, no session → 401/);
  assert.doesNotMatch(byId(ok, "supabase.http.stripe-webhook").message, /CORS/);

  const crash = byId(run(checkFunctionsHttp, (f) => (f.supabase.http.probes.health = { options: { status: 503 }, post: { status: 503 } })), "supabase.http.health");
  assert.equal(crash.status, "fail");
  assert.match(crash.message, /crashes at start/);
  assert.match(crash.fix, /missing secret/);

  const cors = byId(run(checkFunctionsHttp, (f) => (f.supabase.http.probes.moderate.options.allowOrigin = "http://localhost:5173")), "supabase.http.moderate");
  assert.equal(cors.status, "fail");
  assert.match(cors.message, /CORS answers http:\/\/localhost:5173/);
  assert.match(cors.fix, /ALLOWED_ORIGIN=https:\/\/rowanflynnpilot\.github\.io/);

  const jwtOn = byId(run(checkFunctionsHttp, (f) => (f.supabase.http.probes["stripe-webhook"].post.status = 401)), "supabase.http.stripe-webhook");
  assert.equal(jwtOn.status, "fail");
  assert.match(jwtOn.fix, /JWT verification/);

  assert.equal(status(run(checkFunctionsHttp, (f) => (f.supabase.http.probes["create-checkout"].post.status = 429)), "supabase.http.create-checkout"), "pass");
  assert.equal(status(run(checkFunctionsHttp, (f) => (f.supabase.http.probes.notify.post.status = 200)), "supabase.http.notify"), "fail");
  assert.equal(status(run(checkFunctionsHttp, (f) => (f.supabase.http.probes.notify.options.status = 404)), "supabase.http.notify"), "fail");
  assert.equal(status(run(checkFunctionsHttp, (f) => (f.supabase.http.probes.notify.post = { error: "no answer in 10s" })), "supabase.http.notify"), "fail");

  const partial = run(checkFunctionsHttp, (f) => delete f.supabase.http.probes.disqualify);
  assert.equal(partial.length, FUNCTIONS.length - 1);
  assert.equal(status(run(checkFunctionsHttp, (f) => (f.supabase.http.probes = {})), "supabase.http"), "skip");
  assert.equal(status(run(checkFunctionsHttp, (f) => (f.supabase.http = { skip: "not checked, the project is not running" })), "supabase.http"), "skip");
});

test("migrations: applied, pending, drift, skipped", () => {
  assert.match(byId(run(checkMigrations), "supabase.migrations").message, /All 3 migrations applied \(latest 0003\)/);
  const pending = byId(run(checkMigrations, (f) => (f.supabase.migrations.remote = ["0001"])), "supabase.migrations");
  assert.equal(pending.status, "fail");
  assert.match(pending.message, /2 migrations not applied: 0002, 0003/);
  const drift = byId(run(checkMigrations, (f) => f.supabase.migrations.remote.push("0004")), "supabase.migrations");
  assert.match(drift.message, /repo does not: 0004/);
  const skipped = byId(run(checkMigrations, (f) => (f.supabase.migrations = { skip: "not checked", fix: "set SUPABASE_DB_PASSWORD to check" })), "supabase.migrations");
  assert.equal(skipped.status, "skip");
  assert.equal(skipped.fix, "set SUPABASE_DB_PASSWORD to check");
  assert.equal(status(run(checkMigrations, (f) => (f.supabase.migrations = { error: "could not read the migration list" })), "supabase.migrations"), "fail");
});

test("auth: email on, sign-up off, site URL on the Pages site", () => {
  const ok = run(checkAuth);
  assert.deepEqual(ok.map((r) => r.status), ["pass", "pass", "pass"]);
  const bad = run(checkAuth, (f) => (f.supabase.auth = { externalEmailEnabled: false, disableSignup: false, siteUrl: "http://localhost:3000" }));
  assert.deepEqual(bad.map((r) => r.status), ["fail", "fail", "fail"]);
  assert.match(byId(bad, "supabase.auth.site_url").fix, /Site URL: https:\/\/rowanflynnpilot\.github\.io\/wpr-pet-contest\//);
  assert.equal(status(run(checkAuth, (f) => (f.supabase.auth.siteUrl = `${PAGES}#/admin`)), "supabase.auth.site_url"), "pass");
  assert.equal(status(run(checkAuth, (f) => (f.pagesUrl = null)), "supabase.auth.site_url"), "skip");
  const skipped = run(checkAuth, (f) => (f.supabase.auth = { skip: "not checked", fix: "set SUPABASE_ACCESS_TOKEN (a personal access token) to check" }));
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].status, "skip");
});

test("contest data: a contest, admins, packs, shelters, Double Vote windows", () => {
  const ok = run(checkContestData);
  assert.ok(ok.every((r) => r.status === "pass"));
  assert.match(byId(ok, "supabase.contest").message, /2027 "Cutest Pet 2027" is draft \(50% to shelters, bracket of 16\)/);

  const none = run(checkContestData, (f) => (f.supabase.data = { contests: [], admins: 0, packs: [], shelters: [], bonusWindows: 0 }));
  const contest = byId(none, "supabase.contest");
  assert.equal(contest.status, "fail");
  assert.equal(contest.message, "No contest created yet");
  assert.match(contest.fix, /Admin desk → Setup/);
  assert.equal(status(none, "supabase.admins"), "fail");
  assert.equal(status(none, "supabase.contest_rows"), "skip");

  const finished = run(checkContestData, (f) => (f.supabase.data.contests = [{ year: 2026, status: "complete" }]));
  assert.match(byId(finished, "supabase.contest").message, /latest \(2026\) is complete/);

  assert.equal(status(run(checkContestData, (f) => (f.supabase.data.packs = [{ slug: "x", active: false }])), "supabase.packs"), "fail");
  assert.equal(status(run(checkContestData, (f) => (f.supabase.data.shelters = [])), "supabase.shelters"), "fail");
  const noLogo = byId(run(checkContestData, (f) => f.supabase.data.shelters.push({ name: "Cat Rescue", hasLogo: false })), "supabase.shelters");
  assert.equal(noLogo.status, "warn");
  assert.match(noLogo.message, /1 of 2 shelters without a logo: Cat Rescue/);
  assert.match(byId(run(checkContestData, (f) => (f.supabase.data.bonusWindows = 0)), "supabase.bonus_windows").message, /No Double Vote windows yet/);
  assert.equal(status(run(checkContestData, (f) => (f.supabase.data = { skip: "not checked, the project is not running" })), "supabase.data"), "skip");
  assert.equal(status(run(checkContestData, (f) => (f.supabase.data = { error: "REST answered 401 for contests" })), "supabase.data"), "fail");
});

// ------------------------------------------------------------------- GitHub --

test("pages: enabled from Actions, enabled from a branch, off on a private or public repo", () => {
  assert.equal(status(run(checkPages), "github.pages"), "pass");
  const priv = byId(run(checkPages, (f) => {
    f.github.repo.visibility = "PRIVATE";
    f.github.pages = { enabled: false };
  }), "github.pages");
  assert.equal(priv.status, "fail");
  assert.match(priv.message, /Pages not enabled; the repo must be public on the free plan/);
  assert.equal(byId(run(checkPages, (f) => (f.github.pages = { enabled: false })), "github.pages").message, "Pages not enabled");
  assert.equal(status(run(checkPages, (f) => (f.github.pages.buildType = "legacy")), "github.pages"), "warn");
  assert.match(byId(run(checkPages, (f) => (f.github.repo.visibility = "PRIVATE")), "github.pages").message, /paid plan/);
  assert.equal(status(run(checkPages, (f) => (f.github.pages = { skip: "not checked, gh is not signed in", fix: "run gh auth login" })), "github.pages"), "skip");
});

test("variables: each one, set, missing or wrong", () => {
  const empty = run(checkVariables, (f) => (f.github.variables = { values: {}, keys: {} }));
  for (const name of ["PAGES_ENABLED", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_STRIPE_PUBLISHABLE_KEY", "VITE_PUBLIC_URL"]) {
    assert.equal(status(empty, `github.var.${name}`), "fail", name);
  }
  assert.equal(status(empty, "github.var.VITE_IMAGE_TRANSFORMS"), "warn");
  assert.equal(status(empty, "github.var.HEALTH_CHECKS"), "warn");
  assert.match(byId(empty, "github.var.HEALTH_CHECKS").fix, /Turn on before voting opens/);
  assert.equal(status(empty, "github.var.EMAIL_SWEEP"), "pass");

  const v = (mutate, id) => byId(run(checkVariables, mutate), `github.var.${id}`);
  assert.equal(v((f) => (f.github.variables.values.VITE_SUPABASE_URL = "https://otherotherotherother.supabase.co"), "VITE_SUPABASE_URL").status, "fail");
  assert.equal(v((f) => (f.github.variables.values.VITE_SUPABASE_URL = `${BASE}/`), "VITE_SUPABASE_URL").status, "pass");

  const anon = (desc) => v((f) => (f.github.variables.keys.VITE_SUPABASE_ANON_KEY = desc), "VITE_SUPABASE_ANON_KEY");
  assert.match(anon(describeKey(jwt({ role: "service_role", ref: REF }))).message, /SERVICE key/);
  assert.match(anon(describeKey(fakeKey("sb_secret_"))).message, /SERVICE key/);
  assert.match(anon(describeKey(jwt({ role: "anon", ref: "zzzzzzzzzzzzzzzzzzzz" }))).message, /another project/);
  assert.equal(anon({ ...describeKey(fakeKey("sb_publishable_")), matchesProject: false }).status, "fail");
  assert.equal(anon(describeKey(fakeKey("sb_publishable_"))).status, "pass");

  const pk = (value) => v((f) => (f.github.variables.keys.VITE_STRIPE_PUBLISHABLE_KEY = describeKey(value)), "VITE_STRIPE_PUBLISHABLE_KEY");
  assert.equal(pk(fakeKey("pk_test_")).status, "warn");
  assert.match(pk(fakeKey("sk_live_")).message, /SECRET Stripe key/);
  assert.equal(pk("pub_whatever").status, "fail");
  assert.match(pk(fakeKey("pk_live_")).message, /live/);

  assert.equal(v((f) => (f.github.variables.values.VITE_PUBLIC_URL = "wausaupilotandreview.com/pets"), "VITE_PUBLIC_URL").status, "fail");
  assert.equal(v((f) => (f.github.variables.values.VITE_PUBLIC_URL = PAGES), "VITE_PUBLIC_URL").status, "warn");
  assert.equal(v((f) => (f.github.variables.values.PAGES_ENABLED = "yes"), "PAGES_ENABLED").status, "fail");
  assert.match(v((f) => (f.github.variables.values.VITE_IMAGE_TRANSFORMS = "true"), "VITE_IMAGE_TRANSFORMS").message, /Pro plan/);
  assert.match(v((f) => (f.github.variables.values.EMAIL_SWEEP = ""), "EMAIL_SWEEP").message, /off/);
  assert.equal(status(run(checkVariables, (f) => (f.github.variables = { skip: "not checked: HTTP 403" })), "github.variables"), "skip");
});

test("actions secrets: deploy always; health and email only when switched on", () => {
  assert.ok(run(checkGithubSecrets).every((r) => r.status === "pass"));
  const none = run(checkGithubSecrets, (f) => (f.github.secrets.names = []));
  assert.equal(status(none, "github.secrets.deploy"), "fail");
  assert.match(byId(none, "github.secrets.health").message, /HEALTH_CHECKS=true but secrets missing: HEALTH_URL, CRON_SECRET/);
  assert.match(byId(none, "github.secrets.notify").message, /NOTIFY_URL, CRON_SECRET/);
  const off = run(checkGithubSecrets, (f) => (f.github.variables.values = { }));
  assert.equal(status(off, "github.secrets.health"), "skip");
  assert.equal(status(off, "github.secrets.notify"), "skip");
  assert.match(byId(run(checkGithubSecrets, (f) => (f.github.variables = { skip: "x" })), "github.secrets.health").message, /variables unavailable/);
  assert.equal(status(run(checkGithubSecrets, (f) => (f.github.secrets = { skip: "x" })), "github.secrets"), "skip");
});

test("CI: latest test-and-deploy run on main", () => {
  assert.match(byId(run(checkCi), "github.ci").message, /passed \(2026-10-01\)/);
  const failed = byId(run(checkCi, (f) => (f.github.run.run.conclusion = "failure")), "github.ci");
  assert.equal(failed.status, "fail");
  assert.match(failed.fix, /actions\/runs\/1/);
  assert.equal(status(run(checkCi, (f) => (f.github.run.run = { status: "in_progress", conclusion: "" })), "github.ci"), "warn");
  assert.equal(status(run(checkCi, (f) => (f.github.run.run = null)), "github.ci"), "warn");
  assert.equal(status(run(checkCi, (f) => (f.github.run = { skip: "x" })), "github.ci"), "skip");
});

// ------------------------------------------------------------------- Stripe --

test("stripe: skipped as one line without a key", () => {
  const r = run(checkStripe, (f) => (f.stripe = { skip: "not checked", fix: "set STRIPE_SECRET_KEY to check" }));
  assert.equal(r.length, 1);
  assert.equal(r[0].status, "skip");
  assert.equal(r[0].fix, "set STRIPE_SECRET_KEY to check");
});

test("stripe mode: secret and publishable keys must agree", () => {
  assert.equal(status(run(checkStripe), "stripe.mode"), "pass");
  const mismatch = byId(run(checkStripe, (f) => (f.stripe.key.mode = "test")), "stripe.mode");
  assert.equal(mismatch.status, "fail");
  assert.match(mismatch.message, /secret key is test, the publishable key is live/);
  assert.equal(status(run(checkStripe, (f) => (f.stripe.key = { kind: "pk", mode: "live" })), "stripe.mode"), "fail");
  assert.equal(status(run(checkStripe, (f) => delete f.github.variables.keys.VITE_STRIPE_PUBLISHABLE_KEY), "stripe.mode"), "skip");
});

test("stripe webhook: one enabled endpoint at our function with the three events", () => {
  const ep = (f) => f.stripe.webhooks.list[0];
  assert.equal(status(run(checkStripe, (f) => (ep(f).events = ["*"])), "stripe.webhook"), "pass");
  assert.equal(status(run(checkStripe, (f) => (ep(f).url = "https://other.supabase.co/functions/v1/stripe-webhook")), "stripe.webhook"), "fail");
  assert.equal(status(run(checkStripe, (f) => (ep(f).status = "disabled")), "stripe.webhook"), "fail");
  const lacking = byId(run(checkStripe, (f) => (ep(f).events = ["payment_intent.succeeded"])), "stripe.webhook");
  assert.match(lacking.message, /missing events: charge\.refunded, charge\.dispute\.created/);
  assert.equal(status(run(checkStripe, (f) => f.stripe.webhooks.list.push({ ...ep(f) })), "stripe.webhook"), "warn");
  assert.equal(status(run(checkStripe, (f) => (f.stripe.webhooks = { skip: "not checked, the key cannot read webhook endpoints" })), "stripe.webhook"), "skip");
  assert.equal(status(run(checkStripe, (f) => (f.supabaseUrl = null)), "stripe.webhook"), "skip");
});

test("stripe Apple Pay domains: the Pages host and the WordPress host", () => {
  const d = (mutate) => byId(run(checkStripe, mutate), "stripe.domains");
  assert.equal(d(() => {}).status, "pass");
  assert.match(d((f) => f.stripe.domains.list.pop()).message, /wausaupilotandreview\.com not registered/);
  assert.match(d((f) => (f.stripe.domains.list[0].enabled = false)).message, /rowanflynnpilot\.github\.io disabled/);
  assert.match(d((f) => (f.stripe.domains.list[1].applePay = "inactive")).message, /Apple Pay inactive/);
  assert.equal(d((f) => delete f.github.variables.values.VITE_PUBLIC_URL).status, "warn");
  assert.equal(d((f) => {
    delete f.github.variables.values.VITE_PUBLIC_URL;
    f.pagesUrl = null;
  }).status, "skip");
  assert.equal(d((f) => (f.stripe.domains = { error: "Stripe answered 500" })).status, "fail");
});

test("stripe statement descriptor", () => {
  assert.match(byId(run(checkStripe), "stripe.descriptor").message, /WPR PET CONTEST/);
  assert.equal(status(run(checkStripe, (f) => (f.stripe.account.descriptor = "")), "stripe.descriptor"), "warn");
  assert.equal(status(run(checkStripe, (f) => (f.stripe.account = { skip: "not checked, the key cannot read account settings" })), "stripe.descriptor"), "skip");
});

// ---------------------------------------------------------------- Front end --

test("pages site answers 200", () => {
  assert.equal(status(run(checkPagesSite), "web.pages"), "pass");
  assert.equal(status(run(checkPagesSite, (f) => (f.web.pages.status = 404)), "web.pages"), "fail");
  assert.equal(status(run(checkPagesSite, (f) => (f.web.pages = { error: "no answer in 10s" })), "web.pages"), "fail");
  assert.equal(status(run(checkPagesSite, (f) => (f.web.pages = { skip: "not checked, no repository" })), "web.pages"), "skip");
});

test("WordPress page: reachable, the iframe, allow=payment, the script", () => {
  const ok = run(checkWordPress);
  assert.deepEqual(ok.map((r) => r.status), ["pass", "pass", "pass"]);
  const w = (mutate) => run(checkWordPress, mutate);

  const down = w((f) => (f.web.wordpress.status = 404));
  assert.equal(down.length, 1);
  assert.equal(down[0].status, "fail");
  assert.equal(w((f) => Object.assign(f.web.wordpress, { status: 403, challenged: true }))[0].status, "warn");

  assert.equal(status(w((f) => (f.web.wordpress.iframes = [])), "web.embed"), "fail");
  assert.equal(status(w((f) => (f.web.wordpress.iframes = [{ src: "https://www.youtube.com/embed/x", allow: "payment" }])), "web.embed"), "fail");
  const noPay = byId(w((f) => (f.web.wordpress.iframes[0].allow = "web-share")), "web.embed");
  assert.equal(noPay.status, "fail");
  assert.match(noPay.message, /allow="payment"/);

  const noScript = byId(w((f) => (f.web.wordpress.script = { forwardsHash: false, listensForHeight: true })), "web.embed.script");
  assert.equal(noScript.status, "warn");
  assert.match(noScript.message, /hash forwarding/);
  assert.doesNotMatch(noScript.message, /height/);

  assert.equal(status(w((f) => (f.web.wordpress = { skip: "not checked", fix: "set the VITE_PUBLIC_URL Actions variable to the contest page" })), "web.wordpress"), "skip");
  assert.equal(status(w((f) => (f.web.wordpress = { error: "no answer in 10s (https://x/)" })), "web.wordpress"), "fail");
});

test("config.js: rules approved, placeholders gone, analytics, presenting sponsor", () => {
  const c = (mutate) => run(checkConfig, (f) => mutate(f.web.config));
  assert.ok(c(() => {}).every((r) => r.status === "pass"));

  const draft = byId(c((x) => (x.rulesApproved = false)), "web.rules.approved");
  assert.equal(draft.status, "fail");
  assert.match(draft.message, /rules still show the DRAFT ribbon/);

  assert.equal(status(c((x) => (x.markers = ["TODO"])), "web.rules.placeholders"), "fail");
  assert.equal(status(c((x) => (x.contact = "")), "web.rules.placeholders"), "fail");
  assert.equal(status(c((x) => (x.contact = "call the newsroom")), "web.rules.placeholders"), "fail");
  assert.equal(status(c((x) => (x.placeholderNote = true)), "web.rules.placeholders"), "warn");
  assert.equal(status(c((x) => (x.analyticsDomain = "")), "web.analytics"), "warn");
  assert.match(byId(c((x) => (x.presenting = null)), "web.sponsors").message, /unsold/);

  assert.equal(status(run(checkConfig, (f) => (f.web.config = { error: "file not found" })), "web.config"), "fail");
  assert.equal(status(run(checkConfig, (f) => (f.web.config = { found: false })), "web.config"), "fail");
});
