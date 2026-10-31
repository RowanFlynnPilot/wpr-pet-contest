#!/usr/bin/env node
// Simulates a crowd of readers on the gallery: the launch-day spike after one
// popular Facebook post. Each virtual reader loads the page's data the way the
// front end does, then polls vote totals, the activity ticker and the raised
// counter on the gallery's interval.
//
// Reads only. Never run checkout or entry traffic through this: those are
// rate-limited per connection and create real Stripe objects.
//
//   node scripts/load-test.mjs                    # local stack, 50 readers, 60s
//   node scripts/load-test.mjs --readers 400 --seconds 300 --poll 20 \
//     --url https://<staging>.supabase.co --key <anon key>
//
// Point it at staging, never production during a contest. Local Docker numbers
// say whether something is broken, not how hosted Supabase will scale.
//
// Exits non-zero when p95 latency or the error rate crosses the budget, so it
// can gate a release.

import { execSync } from "node:child_process";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith("--") ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []),
);
const READERS = Number(args.readers ?? 50);
const SECONDS = Number(args.seconds ?? 60);
const POLL = Number(args.poll ?? 20);
const P95_BUDGET_MS = Number(args.p95 ?? 800);
const ERROR_BUDGET = Number(args.errors ?? 0.01);

function localStack() {
  const out = execSync("supabase status -o env", { encoding: "utf8" });
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return { url: env.API_URL, key: env.PUBLISHABLE_KEY || env.ANON_KEY };
}

const target = args.url ? { url: args.url, key: args.key } : localStack();
if (!target.url || !target.key) {
  console.error("Need --url and --key (or a running local stack).");
  process.exit(2);
}

const headers = { apikey: target.key };
if (target.key.startsWith("eyJ")) headers.Authorization = `Bearer ${target.key}`;
const REST = `${target.url}/rest/v1`;

const stats = new Map(); // name -> { ms: number[], errors: number }
async function timed(name, path) {
  const s = stats.get(name) ?? stats.set(name, { ms: [], errors: 0 }).get(name);
  const t0 = performance.now();
  try {
    const r = await fetch(`${REST}/${path}`, { headers });
    await r.arrayBuffer();
    if (!r.ok) s.errors++;
    return r;
  } catch {
    s.errors++;
    return null;
  } finally {
    s.ms.push(performance.now() - t0);
  }
}

async function json(name, path) {
  const r = await timed(name, path);
  return r?.ok ? r : null;
}

// Find the live contest and round once, the way the app does on load.
const contestRes = await fetch(`${REST}/contests?select=id,status&order=year.desc&limit=5`, { headers });
const contests = await contestRes.json();
const contest = contests.find((c) => c.status !== "complete") ?? contests[0];
if (!contest) {
  console.error("No visible contest at the target. Is it seeded?");
  process.exit(2);
}
const rounds = await (await fetch(`${REST}/rounds?select=id,seq,status&contest_id=eq.${contest.id}&order=seq`, { headers })).json();
const round = rounds.find((r) => r.status === "open") ?? rounds.at(-1);

const ENTRY_COLS = "id,contest_id,pet_name,species,town,caption,photo_path,thumb_path,shelter_id,seed,created_at";
const deadline = Date.now() + SECONDS * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reader(i) {
  // Stagger arrivals over the first poll interval, like a share spreading.
  await sleep(Math.random() * POLL * 1000);
  await Promise.all([
    json("contests", "contests?select=id,year,name,status&order=year.desc"),
    json("rounds", `rounds?select=*&contest_id=eq.${contest.id}&order=seq`),
    json("entries (gallery)", `entries?select=${ENTRY_COLS}&contest_id=eq.${contest.id}&status=eq.approved&order=created_at&limit=1000`),
    json("vote_packs", `vote_packs?select=slug,votes,cents&contest_id=eq.${contest.id}&order=sort`),
  ]);
  while (Date.now() < deadline) {
    await Promise.all([
      round && json("totals (poll)", `entry_round_totals?select=entry_id,votes&round_id=eq.${round.id}&limit=1000`),
      round && json("activity (poll)", `recent_activity?select=entry_id,votes,confirmed_at&round_id=eq.${round.id}&order=confirmed_at.desc&limit=10`),
      json("contest_stats (poll)", `contest_stats?select=gross_cents,shelter_cents,votes&contest_id=eq.${contest.id}`),
    ]);
    await sleep(POLL * 1000 * (0.8 + Math.random() * 0.4));
  }
  return i;
}

const t0 = Date.now();
console.log(`${READERS} readers for ${SECONDS}s, polling every ~${POLL}s, against ${target.url}`);
await Promise.all(Array.from({ length: READERS }, (_, i) => reader(i)));
const elapsed = (Date.now() - t0) / 1000;

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
let total = 0;
let failed = 0;
let worstP95 = 0;
console.log("\nquery                    requests   p50 ms   p95 ms   p99 ms   errors");
for (const [name, s] of stats) {
  const sorted = [...s.ms].sort((a, b) => a - b);
  const p95 = pct(sorted, 0.95);
  worstP95 = Math.max(worstP95, p95);
  total += sorted.length;
  failed += s.errors;
  console.log(
    `${name.padEnd(24)} ${String(sorted.length).padStart(8)} ${pct(sorted, 0.5).toFixed(0).padStart(8)} ${p95.toFixed(0).padStart(8)} ${pct(sorted, 0.99).toFixed(0).padStart(8)} ${String(s.errors).padStart(8)}`,
  );
}
const rate = total ? failed / total : 0;
console.log(`\n${total} requests in ${elapsed.toFixed(0)}s (${(total / elapsed).toFixed(1)}/s); error rate ${(rate * 100).toFixed(2)}%; worst p95 ${worstP95.toFixed(0)} ms`);

const ok = worstP95 <= P95_BUDGET_MS && rate <= ERROR_BUDGET;
console.log(ok ? "Within budget." : `Over budget (p95 ${P95_BUDGET_MS} ms, errors ${(ERROR_BUDGET * 100).toFixed(1)}%).`);
process.exit(ok ? 0 : 1);
