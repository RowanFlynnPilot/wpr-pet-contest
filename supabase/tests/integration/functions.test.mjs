// End-to-end checks of the edge functions against a running local stack:
// real uploads through submit-entry, moderation with a real staff session,
// checkout validation, and the Stripe webhook with properly signed events.
//
//   supabase start
//   supabase db reset
//   supabase functions serve --env-file supabase/tests/integration/functions.env
//   node --test supabase/tests/integration/functions.test.mjs
//
// Mutates the local database (it moderates the seed queue and opens round 1).
// Run `supabase db reset` before running it again. CI does all of the above.
//
// pgTAP proves the SQL; this proves the HTTP layer around it: status codes,
// readable errors, what lands in storage, and that nothing is credited without
// a valid Stripe signature.

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const here = (name) => new URL(name, import.meta.url);
const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url));

// --------------------------------------------------------------- config --
function stackEnv() {
  if (process.env.API_URL && process.env.SECRET_KEY) return process.env;
  const out = execSync("supabase status -o env", { encoding: "utf8" });
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function functionsEnv() {
  const env = {};
  for (const line of readFileSync(here("functions.env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const stack = stackEnv();
const fnEnv = functionsEnv();
const API = stack.API_URL;
const FN = `${API}/functions/v1`;
const ANON = stack.PUBLISHABLE_KEY || stack.ANON_KEY;
const SECRET = stack.SECRET_KEY;
// GoTrue's admin API still wants the legacy service_role JWT.
const SERVICE_JWT = stack.SERVICE_ROLE_KEY;
const ORIGIN = fnEnv.ALLOWED_ORIGIN.split(",")[0];
const WHSEC = fnEnv.STRIPE_WEBHOOK_SECRET;
const ROUND1 = "00000000-0000-0000-0000-00000000d001";
const PASSWORD = `it-${crypto.randomUUID()}`;

// ---------------------------------------------------------------- http --
const service = { apikey: SECRET, Authorization: `Bearer ${SECRET}` };

async function rest(path, init = {}, headers = service) {
  const r = await fetch(`${API}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

const one = async (path) => (await rest(path)).body[0];

async function submit(fields, photo, { thumb } = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (photo) fd.append("photo", new Blob([photo.bytes], { type: photo.type }), photo.name);
  if (thumb) fd.append("thumb", new Blob([thumb.bytes], { type: thumb.type }), thumb.name);
  const r = await fetch(`${FN}/submit-entry`, { method: "POST", body: fd, headers: { Origin: ORIGIN } });
  return { status: r.status, headers: r.headers, body: await r.json() };
}

async function call(fn, body, token, extraHeaders = {}) {
  const r = await fetch(`${FN}/${fn}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function object(path) {
  const r = await fetch(`${API}/storage/v1/object/public/pets/${path}`);
  return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()) };
}

async function makeUser(email, admin) {
  const r = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_JWT, Authorization: `Bearer ${SERVICE_JWT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  const user = await r.json();
  assert.ok(user.id, `could not create ${email}: ${JSON.stringify(user)}`);
  if (admin) await rest("admins", { method: "POST", body: JSON.stringify({ user_id: user.id }) });
  const t = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const session = await t.json();
  assert.ok(session.access_token, `could not sign in ${email}: ${JSON.stringify(session)}`);
  return session.access_token;
}

function signed(event) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", WHSEC).update(`${t}.${payload}`).digest("hex");
  return { payload, signature: `t=${t},v1=${v1}` };
}

async function hook(event, signature) {
  const s = signed(event);
  const headers = { "Content-Type": "application/json" };
  if (signature !== null) headers["stripe-signature"] = signature ?? s.signature;
  const r = await fetch(`${FN}/stripe-webhook`, { method: "POST", body: s.payload, headers });
  return r.status;
}

const event = (type, obj) => ({
  id: `evt_${crypto.randomUUID().replaceAll("-", "")}`,
  object: "event",
  type,
  data: { object: obj },
  api_version: "2024-06-20",
  created: Math.floor(Date.now() / 1000),
});

const has = (bytes, text) => bytes.includes(Buffer.from(text));
const ORIENTATION_6 = Buffer.from([0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06]);

const jpeg = { bytes: fixture("gps.jpg"), type: "image/jpeg", name: "IMG_4410.jpg" };
const thumbJpeg = { bytes: fixture("thumb.jpg"), type: "image/jpeg", name: "IMG_4410.thumb.jpg" };
const base = {
  pet_name: "IntegrationPup", species: "dog", owner_name: "Integration Tester",
  owner_email: "integration@example.com", town: "Wausau", caption: "Test caption",
  rights_accepted: "true", newsletter_opt_in: "true",
};

let adminToken;
let staffToken;
let pup;


// ---------------------------------------------------------------- setup --
test("setup: clear rate limits and create staff sessions", async () => {
  // Earlier runs against the same database leave counters behind.
  await rest("rate_limits?hits=gte.0", { method: "DELETE" });
  adminToken = await makeUser(`moderator-${Date.now()}@example.test`, true);
  staffToken = await makeUser(`not-admin-${Date.now()}@example.test`, false);
});


// --------------------------------------------------------- submit-entry --
test("submit-entry: bad requests get a readable 400 with CORS headers", async () => {
  let r = await submit({ ...base }, null);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /attach a photo/);
  // Local Kong rewrites allow-origin to "*"; the origin echo is unit-tested in
  // cors_test.ts. What matters here is that the error is not a bare 500.
  assert.ok(r.headers.get("access-control-allow-origin"));

  r = await submit({ ...base }, { bytes: fixture("fake.heic"), type: "image/jpeg", name: "IMG_0001.jpg" });
  assert.equal(r.status, 400, "a HEIC renamed to .jpg is refused by its bytes");
  assert.match(r.body.error, /JPEG, PNG or WebP/);

  r = await submit({ ...base, rights_accepted: "false" }, jpeg);
  assert.match(r.body.error, /photo release/);

  r = await submit({ ...base, owner_email: "not-an-email" }, jpeg);
  assert.match(r.body.error, /valid email/);

  r = await submit({ ...base, species: "ferret" }, jpeg);
  assert.match(r.body.error, /Species/);
});

test("submit-entry: the honeypot answers success and stores nothing", async () => {
  const r = await submit({ ...base, pet_name: "HoneypotBot", website: "http://spam" }, jpeg);
  assert.equal(r.status, 200);
  assert.equal((await rest("entries?select=id&pet_name=eq.HoneypotBot")).body.length, 0);
});

test("submit-entry: a valid entry lands pending, stripped, with its thumbnail", async () => {
  const r = await submit({ ...base }, jpeg, { thumb: thumbJpeg });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { received: true }, "no entry id is returned");

  pup = await one("entries?select=id,status,photo_path,thumb_path,caption,newsletter_opt_in&pet_name=eq.IntegrationPup");
  assert.equal(pup.status, "pending");
  assert.equal(pup.caption, "Test caption");
  assert.equal(pup.newsletter_opt_in, true);
  assert.match(pup.photo_path, /\.jpg$/);
  assert.match(pup.thumb_path, /\.thumb\.jpg$/);

  for (const path of [pup.photo_path, pup.thumb_path]) {
    const o = await object(path);
    assert.equal(o.status, 200, `${path} is stored`);
    assert.ok(!has(o.bytes, "SECRET-LOCATION-MARKER") && !has(o.bytes, "IntegrationCam"), `${path} has no EXIF text`);
    assert.ok(o.bytes.includes(ORIENTATION_6), `${path} keeps its orientation`);
  }
});

test("submit-entry: a bogus thumbnail is dropped, not fatal", async () => {
  const r = await submit(
    { ...base, pet_name: "NoThumbPup", owner_email: "nothumb@example.com" },
    jpeg,
    { thumb: { bytes: fixture("fake.heic"), type: "image/jpeg", name: "x.jpg" } },
  );
  assert.equal(r.status, 200);
  const row = await one("entries?select=thumb_path,photo_path&pet_name=eq.NoThumbPup");
  assert.equal(row.thumb_path, null);
  assert.ok(row.photo_path);
});

test("submit-entry: PNG text metadata is stripped", async () => {
  const r = await submit({ ...base, pet_name: "PngPup", owner_email: "png@example.com" },
    { bytes: fixture("meta.png"), type: "image/png", name: "a.png" });
  assert.equal(r.status, 200);
  const row = await one("entries?select=photo_path&pet_name=eq.PngPup");
  assert.ok(!has((await object(row.photo_path)).bytes, "SECRET-LOCATION-MARKER"));
});

test("storage: anon cannot list the bucket to find unmoderated uploads", async () => {
  const r = await fetch(`${API}/storage/v1/object/list/pets`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: pup.photo_path.split("/")[0], limit: 100 }),
  });
  const listed = await r.json().catch(() => null);
  assert.ok(!Array.isArray(listed) || listed.length === 0, JSON.stringify(listed).slice(0, 200));
});


// ---------------------------------------------------------------- notify --
test("notify: staff only; with email off it reports what is waiting", async () => {
  assert.equal((await call("notify", {})).status, 401);
  assert.equal((await call("notify", {}, staffToken)).status, 403);
  const r = await call("notify", {}, adminToken);
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, false);
  assert.ok(r.body.queued > 0);
});


// -------------------------------------------------------------- moderate --
test("moderate: refuses non-admins and reasonless rejections", async () => {
  assert.equal((await call("moderate", { entry_id: pup.id, decision: "approve" }, staffToken)).status, 403);
  const r = await call("moderate", { entry_id: pup.id, decision: "reject" }, adminToken);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /reason is required/);
});

test("moderate: rejection deletes the photo and its thumbnail, and is audited", async () => {
  const r = await call("moderate", { entry_id: pup.id, decision: "reject", reason: "Integration test" }, adminToken);
  assert.equal(r.status, 200);
  assert.equal(r.body.photo_deleted, true);
  assert.ok((await object(pup.photo_path)).status >= 400, "photo gone");
  assert.ok((await object(pup.thumb_path)).status >= 400, "thumbnail gone");

  const audit = await one(`entries?select=status,moderated_by,moderated_at,rejection_reason&id=eq.${pup.id}`);
  assert.equal(audit.status, "rejected");
  assert.ok(audit.moderated_by && audit.moderated_at);
  assert.equal(audit.rejection_reason, "Integration test");

  assert.equal((await call("moderate", { entry_id: pup.id, decision: "purge" }, adminToken)).status, 200,
    "purge is safe to repeat");
  const live = await rest("rejected_photos_live?select=entry_id", {}, { apikey: ANON, Authorization: `Bearer ${adminToken}` });
  assert.equal(live.status, 200);
  assert.deepEqual(live.body, []);
});

test("moderate: the queue can be cleared, and purge refuses approved entries", async () => {
  const pending = (await rest("entries?select=id&status=eq.pending")).body;
  for (const p of pending) {
    assert.equal((await call("moderate", { entry_id: p.id, decision: "approve" }, adminToken)).status, 200);
  }
  assert.equal((await rest("entries?select=id&status=eq.pending")).body.length, 0);
  assert.equal((await call("moderate", { entry_id: pending[0].id, decision: "purge" }, adminToken)).status, 400);
});


// ------------------------------------------------------- create-checkout --
test("create-checkout: validates before Stripe is ever called", async () => {
  const biscuit = (await one("entries?select=id&pet_name=eq.Biscuit")).id;
  let r = await call("create-checkout", { round_id: ROUND1, entry_id: biscuit, pack_slug: "fan", buyer_email: "b@example.com" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "Voting is closed for this round.");

  r = await call("create-checkout", { round_id: ROUND1, entry_id: biscuit, pack_slug: "fan", buyer_email: "nope" });
  assert.equal(r.status, 400);

  const open = await rest("rpc/open_round", { method: "POST", body: JSON.stringify({ p_round_id: ROUND1 }) },
    { apikey: ANON, Authorization: `Bearer ${adminToken}` });
  assert.ok([200, 204].includes(open.status), JSON.stringify(open));

  r = await call("create-checkout", { round_id: ROUND1, entry_id: biscuit, pack_slug: "platinum", buyer_email: "b@example.com" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /not available/);

  // A valid request reaches Stripe, which refuses the placeholder key: the
  // reader gets the generic message and no vote is parked.
  const before = (await rest("votes?select=id")).body.length;
  r = await call("create-checkout", { round_id: ROUND1, entry_id: biscuit, pack_slug: "fan", buyer_email: "b@example.com" });
  assert.equal(r.status, 500);
  assert.match(r.body.error, /on our end/);
  assert.equal((await rest("votes?select=id")).body.length, before);
});

test("create-checkout: one connection is rate-limited", async () => {
  await rest("rate_limits?hits=gte.0", { method: "DELETE" });
  const statuses = [];
  for (let i = 0; i < 31; i++) statuses.push((await call("create-checkout", {})).status);
  assert.ok(statuses.slice(0, 30).every((s) => s === 400), "the first 30 get as far as validation");
  assert.equal(statuses[30], 429);
  await rest("rate_limits?hits=gte.0", { method: "DELETE" });
});


// ------------------------------------------------------------------ links --
test("links: the owner's token sets a goal and stops the tips; any other token does nothing", async () => {
  const biscuit = await one("entries?select=id,owner_token&pet_name=eq.Biscuit");
  let r = await call("links", { action: "goal", entry_id: biscuit.id, token: biscuit.owner_token, goal: 300 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.goal, 300);
  assert.equal((await one(`entries?select=goal_votes&id=eq.${biscuit.id}`)).goal_votes, 300);

  r = await call("links", { action: "goal", entry_id: biscuit.id, token: crypto.randomUUID(), goal: 10 });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "That link is not valid.");
  assert.equal((await one(`entries?select=goal_votes&id=eq.${biscuit.id}`)).goal_votes, 300);

  r = await call("links", { action: "goal", entry_id: biscuit.id, token: biscuit.owner_token, goal: null });
  assert.equal(r.status, 200);
  assert.equal((await one(`entries?select=goal_votes&id=eq.${biscuit.id}`)).goal_votes, null);

  r = await call("links", { action: "opt-out", entry_id: biscuit.id, token: crypto.randomUUID() });
  assert.equal(r.status, 400);
  assert.equal((await one(`entries?select=nurture_opt_out_at&id=eq.${biscuit.id}`)).nurture_opt_out_at, null);
  r = await call("links", { action: "opt-out", entry_id: biscuit.id, token: biscuit.owner_token });
  assert.equal(r.status, 200);
  assert.ok((await one(`entries?select=nurture_opt_out_at&id=eq.${biscuit.id}`)).nurture_opt_out_at);
});

test("links: a buyer's token stops the notes for every pack that address bought", async () => {
  const biscuit = (await one("entries?select=id&pet_name=eq.Biscuit")).id;
  const vote = await rest("votes", {
    method: "POST",
    body: JSON.stringify({
      round_id: ROUND1, entry_id: biscuit, quantity: 25, amount_cents: 2000, buyer_email: "fan@example.com",
      stripe_payment_intent_id: "pi_links_1", pack_slug: "fan", plays_again_opt_in: true,
    }),
  });
  assert.equal(vote.status, 201, JSON.stringify(vote.body));
  // The note's token, stored as its SHA-256, the way the sweep stores it.
  const token = "links-test-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const notice = await rest("buyer_notices", {
    method: "POST",
    body: JSON.stringify({ email: "fan@example.com", round_id: ROUND1, kind: "round", status: "sent", unsub_hash: "\\x" + createHash("sha256").update(token).digest("hex") }),
  });
  assert.equal(notice.status, 201, JSON.stringify(notice.body));

  let r = await call("links", { action: "unsubscribe", token: `nope-${token}` });
  assert.equal(r.status, 400);
  assert.equal((await one("votes?select=plays_again_opt_in&stripe_payment_intent_id=eq.pi_links_1")).plays_again_opt_in, true);
  r = await call("links", { action: "unsubscribe", token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await one("votes?select=plays_again_opt_in&stripe_payment_intent_id=eq.pi_links_1")).plays_again_opt_in, false);

  // One-click unsubscribe from a mail client: a form POST with the token in the query.
  const oneClick = await fetch(`${FN}/links?unsubscribe=${token}`, {
    method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click",
  });
  assert.equal(oneClick.status, 200);
});


// --------------------------------------------------------- stripe-webhook --
test("stripe-webhook: signatures are required and checked", async () => {
  const pi = { id: "pi_int_sig", object: "payment_intent", metadata: { kind: "vote_pack", round_id: ROUND1 } };
  assert.equal(await hook(event("payment_intent.succeeded", pi), null), 400);
  assert.equal(await hook(event("payment_intent.succeeded", pi), "t=1,v1=deadbeef"), 400);
});

test("stripe-webhook: a signed success credits the vote, once", async () => {
  const luna = (await one("entries?select=id&pet_name=eq.Luna")).id;
  await rest("votes", {
    method: "POST",
    body: JSON.stringify({ round_id: ROUND1, entry_id: luna, quantity: 25, amount_cents: 2000, buyer_email: "hook@example.com", stripe_payment_intent_id: "pi_int_1" }),
  });
  const pi = { id: "pi_int_1", object: "payment_intent", metadata: { kind: "vote_pack", round_id: ROUND1 } };

  assert.equal(await hook(event("payment_intent.succeeded", pi)), 200);
  let v = await one("votes?select=status,confirmed_at&stripe_payment_intent_id=eq.pi_int_1");
  assert.equal(v.status, "succeeded");
  assert.ok(v.confirmed_at);
  assert.equal(await hook(event("payment_intent.succeeded", pi)), 200, "redelivery is harmless");

  const board = await rest(`entry_round_totals?select=votes&entry_id=eq.${luna}`, {}, { apikey: ANON });
  assert.equal(board.body[0]?.votes, 25, "the public leaderboard shows it");

  // A partial refund keeps the votes and records the money.
  assert.equal(await hook(event("charge.refunded", { id: "ch_1", object: "charge", refunded: false, amount_refunded: 500, payment_intent: "pi_int_1" })), 200);
  v = await one("votes?select=status,refunded_cents&stripe_payment_intent_id=eq.pi_int_1");
  assert.deepEqual(v, { status: "succeeded", refunded_cents: 500 });

  // A chargeback takes the votes out.
  assert.equal(await hook(event("charge.dispute.created", { id: "dp_1", object: "dispute", payment_intent: "pi_int_1" })), 200);
  assert.equal((await one("votes?select=status&stripe_payment_intent_id=eq.pi_int_1")).status, "disputed");
});

test("stripe-webhook: foreign payments are ignored; missing vote rows are retried", async () => {
  assert.equal(await hook(event("payment_intent.succeeded", { id: "pi_dashboard", object: "payment_intent", metadata: {} })), 200);
  assert.equal(await hook(event("charge.refunded", { id: "ch_x", object: "charge", refunded: true, payment_intent: "pi_other" })), 200);
  assert.equal(
    await hook(event("payment_intent.succeeded", { id: "pi_missing", object: "payment_intent", metadata: { kind: "vote_pack" } })),
    500,
    "a vote-pack payment with no vote row answers 500 so Stripe retries",
  );
});


// ---------------------------------------------------------------- health --
test("health: staff or the schedule only", async () => {
  assert.equal((await call("health", {})).status, 401);
  assert.equal((await call("health", {}, staffToken)).status, 403);
  assert.equal((await call("health", {}, null, { "x-cron-secret": "wrong" })).status, 401);
});

test("health: the admin view shows problems and tells nobody", async () => {
  const r = await call("health", {}, adminToken);
  assert.equal(r.status, 200);
  // The placeholder Stripe key cannot list payments; that must degrade to a
  // warning, not an error, or one Stripe outage would hide every other check.
  const stripe = r.body.problems.find((p) => p.check_name === "stripe_unreachable");
  assert.equal(stripe?.severity, "warn");
  assert.deepEqual(r.body.channels, { email: false, webhook: false });
  assert.equal(r.body.notified, 0);
});

test("health: the schedule reports a new problem once, and fails loudly with no channel", async () => {
  const first = await call("health", {}, null, { "x-cron-secret": fnEnv.CRON_SECRET });
  assert.equal(first.status, 200);
  assert.ok(first.body.notified > 0, "the new problem is news");
  assert.equal(first.body.delivered, false, "nothing configured to deliver it, so the workflow fails");

  const second = await call("health", {}, null, { "x-cron-secret": fnEnv.CRON_SECRET });
  assert.equal(second.body.notified, 0, "ten minutes later it is not news");
  assert.equal(second.body.delivered, true);
});


// ------------------------------------------------------------ disqualify --
test("disqualify: staff only, reason required", async () => {
  const moose = (await one("entries?select=id&pet_name=eq.Moose")).id;
  assert.equal((await call("disqualify", { entry_id: moose, reason: "x" })).status, 401);
  assert.equal((await call("disqualify", { entry_id: moose, reason: "x" }, staffToken)).status, 403);
  const r = await call("disqualify", { entry_id: moose }, adminToken);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /reason is required/);
});

test("disqualify: the pet leaves the site and every refund is attempted, failures reported for retry", async () => {
  const moose = (await one("entries?select=id&pet_name=eq.Moose")).id;
  await rest("votes", {
    method: "POST",
    body: JSON.stringify({ round_id: ROUND1, entry_id: moose, quantity: 25, amount_cents: 2000, buyer_email: "dq@example.com", stripe_payment_intent_id: "pi_int_dq", status: "succeeded", confirmed_at: new Date().toISOString() }),
  });

  const r = await call("disqualify", { entry_id: moose, reason: "Integration: stolen photo" }, adminToken);
  assert.equal(r.status, 200);
  assert.equal(r.body.photo_deleted, true);
  // The placeholder Stripe key refuses every refund: it must come back as a
  // failure to retry, never be dropped.
  assert.equal(r.body.ok, false);
  assert.deepEqual(r.body.refunds_failed.map((f) => f.payment_intent), ["pi_int_dq"]);

  const visible = await rest(`entries?select=id&id=eq.${moose}`, {}, { apikey: ANON });
  assert.deepEqual(visible.body, [], "gone from the public site");

  const again = await call("disqualify", { entry_id: moose }, adminToken);
  assert.equal(again.status, 200, "running it again needs no new reason");
  assert.deepEqual(again.body.refunds_failed.map((f) => f.payment_intent), ["pi_int_dq"], "and retries what is still owed");
});
