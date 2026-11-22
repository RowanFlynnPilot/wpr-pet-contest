#!/usr/bin/env node
// Sets up one newsroom's copy of the contest: its Supabase project and its
// GitHub repository, from the newsroom's entry in web/src/newsrooms.js.
// The writing counterpart of preflight.mjs, which only reads.
//
//   node scripts/setup.mjs --newsroom <key> --ref <project-ref> --repo owner/name \
//        [--admin a@paper.com --admin b@paper.com] [--public-url https://paper.com/pets/] \
//        [--email-from "Paper <pets@vote.paper.com>"] [--staff-domains paper.com] [--apply]
//
// Without --apply it prints what it would do and changes nothing. With it:
//   1. function secrets derived from the newsroom entry, plus a new
//      CRON_SECRET and FREE_VOTE_HASH_KEY where none exists
//   2. the repository's Actions variables and secrets (the deploy's too)
//   3. Auth: site URL, self-signup off, email sign-in on
//   4. staff invited and added to admins (once the migrations are in)
// and then lists what is left for people: Stripe, Resend, the embed, counsel.
//
// Safe to run again: it is how step 4 happens after the first deploy.
//
// Needs the supabase and gh CLIs, signed in, and in the shell:
//   SUPABASE_ACCESS_TOKEN  a personal access token for the project's account
//   SUPABASE_DB_PASSWORD   the new project's database password
// Both go to the repository as secrets for its deploy job, straight from the
// environment. Migrations and functions are deployed by that job, on the next
// push to the repository's main: this script never links a project or pushes
// a schema, so it cannot point your checkout at somebody else's database.
//
// It prints names, never a value.

import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { adminSql, buildPlan, envLine } from "./setup-plan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.supabase.com/v1";

function usage(message) {
  if (message) console.error(`setup: ${message}\n`);
  console.error("usage: node scripts/setup.mjs --newsroom <key> --ref <project-ref> --repo owner/name [--admin email]... [--public-url url] [--email-from from] [--staff-domains list] [--apply]");
  process.exit(2);
}

const args = { admins: [], apply: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const value = () => argv[++i] ?? usage(`${a} needs a value`);
  if (a === "--apply") args.apply = true;
  else if (a === "--newsroom") args.key = value();
  else if (a === "--ref") args.ref = value();
  else if (a === "--repo") args.repo = value();
  else if (a === "--admin") args.admins.push(value());
  else if (a === "--public-url") args.publicUrl = value();
  else if (a === "--email-from") args.emailFrom = value();
  else if (a === "--staff-domains") args.staffDomains = value();
  else usage(`unknown argument ${a}`);
}
if (!args.key || !args.ref || !args.repo) usage("--newsroom, --ref and --repo are required");

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const secretsSeen = [TOKEN, process.env.SUPABASE_DB_PASSWORD].filter((v) => v && v.length >= 8);
const clean = (text) => secretsSeen.reduce((t, s) => t.split(s).join("[redacted]"), String(text));

// A string command with validated inputs only (ref and repo are checked by
// the plan before anything runs); values travel by stdin or a file.
function sh(cmd, input) {
  try {
    const stdout = execSync(cmd, { cwd: ROOT, encoding: "utf8", timeout: 120_000, input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], windowsHide: true });
    return { ok: true, stdout };
  } catch (err) {
    const text = `${err.stderr ?? ""}\n${err.stdout ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
    return { ok: false, stdout: "", error: clean(text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? "failed").slice(0, 200) };
  }
}
const parse = (text) => {
  try {
    const s = String(text).trim();
    return JSON.parse(s.slice(s.search(/[[{]/)));
  } catch {
    return null;
  }
};
async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...init.headers }, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: parse(text), text: clean(text).slice(0, 200) };
}

// ------------------------------------------------------------------- gather --

const { NEWSROOMS } = await import(pathToFileURL(join(ROOT, "web/src/newsrooms.js")).href);
const tokensCss = readFileSync(join(ROOT, "web/src/styles/tokens.css"), "utf8");

// Validate before any command carries --ref or --repo.
const empty = { functionSecrets: new Set(), ghVariables: new Map(), ghSecrets: new Set() };
const input = { newsroom: NEWSROOMS[args.key], tokensCss, ...args };
const first = buildPlan(input, empty);
if (first.problems.length) usage(first.problems.join("\n       "));

const existing = { functionSecrets: new Set(), ghVariables: new Map(), ghSecrets: new Set() };
const unknown = [];
{
  const s = sh(`supabase secrets list --project-ref ${args.ref} -o json`);
  const rows = s.ok ? parse(s.stdout) : null;
  if (Array.isArray(rows)) for (const r of rows) existing.functionSecrets.add(r.name);
  else unknown.push(`the project's secrets (${s.error ?? "unreadable"})`);
  const v = sh(`gh variable list -R ${args.repo} --json name,value`);
  const vars = v.ok ? parse(v.stdout) : null;
  if (Array.isArray(vars)) for (const r of vars) existing.ghVariables.set(r.name, r.value);
  else unknown.push(`the repository's variables (${v.error ?? "unreadable"})`);
  const g = sh(`gh secret list -R ${args.repo} --json name`);
  const names = g.ok ? parse(g.stdout) : null;
  if (Array.isArray(names)) for (const r of names) existing.ghSecrets.add(r.name);
  else unknown.push(`the repository's secrets (${g.error ?? "unreadable"})`);
}

const plan = buildPlan(input, existing);

// -------------------------------------------------------------------- print --

const n = input.newsroom;
console.log(`\n${n.name}: project ${args.ref}, repository ${args.repo}`);
console.log(`Site ${plan.site}${args.apply ? "" : "   (dry run: nothing changes without --apply)"}\n`);
console.log("Function secrets, from the newsroom entry:");
for (const s of plan.functionSecrets) console.log(`  ${s.name} = ${s.value}`);
for (const name of plan.kept) console.log(`  ${name}: already set, left as it is`);
for (const g of plan.generated) console.log(`  ${g.name} = (new, random, not shown) → ${g.to.join(" and ")}`);
console.log("\nRepository variables:");
for (const v of plan.ghVariables) console.log(`  ${v.name} = ${typeof v.value === "string" ? v.value : "(the project's public anon key)"}`);
if (!plan.ghVariables.length) console.log("  already as they should be");
console.log("\nRepository secrets:");
for (const s of plan.ghSecrets) console.log(`  ${s.name}${s.env ? ` (from your shell's ${s.env}${process.env[s.env] ? "" : ": NOT SET, skipped"})` : ` = ${s.value}`}`);
console.log(`\nAuth: site URL ${plan.auth.site_url}, self-signup off, email sign-in on`);
console.log(`Staff: ${plan.admins.length ? plan.admins.join(", ") : "none named (--admin)"}`);
for (const w of plan.warnings) console.log(`\n! ${w}`);

if (unknown.length) {
  console.error(`\nCould not read ${unknown.join("; ")}. Sign in (supabase login, gh auth login) and run again.`);
  process.exit(1);
}
if (!args.apply) {
  console.log("\nStill for people, after --apply:");
  for (const m of plan.manual) console.log(`  - ${m}`);
  process.exit(0);
}
if (!TOKEN) {
  console.error("\nSet SUPABASE_ACCESS_TOKEN: Auth settings and the staff list need it.");
  process.exit(1);
}

// -------------------------------------------------------------------- apply --

const results = [];
const done = (ok, what, why) => {
  results.push(ok);
  console.log(`${ok ? "✔" : "✖"} ${what}${why ? `: ${why}` : ""}`);
};
console.log("");

const made = Object.fromEntries(plan.generated.map((g) => [g.name, randomBytes(32).toString("hex")]));
secretsSeen.push(...Object.values(made));

// 1. Function secrets, through a file so no value meets a shell.
{
  const dir = mkdtempSync(join(tmpdir(), "contest-setup-"));
  const file = join(dir, "secrets.env");
  try {
    const lines = [...plan.functionSecrets.map((s) => envLine(s.name, s.value)), ...plan.generated.filter((g) => g.to.includes("functions")).map((g) => envLine(g.name, made[g.name]))];
    writeFileSync(file, `${lines.join("\n")}\n`, { mode: 0o600 });
    const r = sh(`supabase secrets set --project-ref ${args.ref} --env-file "${file}"`);
    done(r.ok, `${lines.length} function secrets`, r.error);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 2. The repository. Every value by stdin.
let anonKey = null;
{
  const r = sh(`supabase projects api-keys --project-ref ${args.ref} -o json`);
  const rows = r.ok ? parse(r.stdout) : null;
  anonKey = Array.isArray(rows) ? (rows.find((k) => k.name === "anon" && /^eyJ[\x21-\x7e]+$/.test(k.api_key ?? ""))?.api_key ?? rows.find((k) => k.type === "publishable" && /^sb_publishable_[\x21-\x7e]+$/.test(k.api_key ?? ""))?.api_key ?? null) : null;
}
for (const v of plan.ghVariables) {
  const value = typeof v.value === "string" ? v.value : anonKey;
  if (!value) {
    done(false, `variable ${v.name}`, "the project's public key could not be read (supabase projects api-keys)");
    continue;
  }
  const r = sh(`gh variable set ${v.name} -R ${args.repo}`, value);
  done(r.ok, `variable ${v.name}`, r.error);
}
const secretValues = [...plan.ghSecrets.map((s) => [s.name, s.env ? process.env[s.env] : s.value, s.env]), ...plan.generated.filter((g) => g.to.includes("github")).map((g) => [g.name, made[g.name]])];
for (const [name, value, env] of secretValues) {
  if (!value) {
    done(false, `secret ${name}`, `${env} is not set in this shell; the deploy job needs it`);
    continue;
  }
  const r = sh(`gh secret set ${name} -R ${args.repo}`, value);
  done(r.ok, `secret ${name}`, r.error);
}

// 3. Auth.
{
  const r = await api(`/projects/${args.ref}/config/auth`, { method: "PATCH", body: JSON.stringify(plan.auth) });
  done(r.ok, "Auth: site URL, self-signup off, email sign-in on", r.ok ? "" : `${r.status} ${r.text}`);
}

// 4. Staff. Needs the admins table, which the first deploy creates.
let deployFirst = false;
if (plan.admins.length) {
  const query = (sql) => api(`/projects/${args.ref}/database/query`, { method: "POST", body: JSON.stringify({ query: sql }) });
  const table = await query("select to_regclass('public.admins') is not null as ready");
  if (!table.ok) done(false, "staff", `could not ask the database: ${table.status} ${table.text}`);
  else if (!table.body?.[0]?.ready) {
    deployFirst = true;
    console.log("– staff: the migrations are not in yet. After the first deploy, run this again.");
  } else {
    const keys = sh(`supabase projects api-keys --project-ref ${args.ref} --reveal -o json`);
    const rows = keys.ok ? parse(keys.stdout) : null;
    const service = Array.isArray(rows) ? (rows.find((k) => k.name === "service_role" && String(k.api_key).startsWith("eyJ")) ?? rows.find((k) => k.type === "secret" && String(k.api_key).startsWith("sb_secret_")))?.api_key : null;
    if (service) secretsSeen.push(service);
    for (const email of plan.admins) {
      if (!service) break;
      // Invites a new address; an address that already has an account answers 422, which is fine.
      const res = await fetch(`${plan.base}/auth/v1/invite`, { method: "POST", headers: { apikey: service, authorization: `Bearer ${service}`, "content-type": "application/json" }, body: JSON.stringify({ email }), signal: AbortSignal.timeout(30_000) }).catch((e) => ({ ok: false, status: 0, statusText: e.message }));
      done(res.ok || res.status === 422, `invite ${email}`, res.ok ? "sent" : res.status === 422 ? "already has an account" : `${res.status}`);
    }
    if (!service) done(false, "invites", "no service key from supabase projects api-keys");
    const r = await query(adminSql(plan.admins));
    const count = await query("select count(*)::int as n from admins");
    done(r.ok, "staff added to admins", r.ok ? `${count.body?.[0]?.n ?? "?"} on the desk` : `${r.status} ${r.text}`);
  }
}

console.log("\nNext:");
console.log(`  - Push to ${args.repo}'s main (the newsroom entry is a fine first commit): its deploy job applies the migrations and ships the functions.`);
if (deployFirst) console.log("  - Then run this command again, to invite the staff.");
for (const m of plan.manual) console.log(`  - ${m}`);
process.exit(results.every(Boolean) ? 0 : 1);
