#!/usr/bin/env node
// Launch preflight: docs/LAUNCH.md, verified by a machine instead of memory.
//
//   node scripts/preflight.mjs                     # linked project, repo from the git remote
//   node scripts/preflight.mjs --ref <project-ref> --repo owner/name
//   node scripts/preflight.mjs --strict            # warnings block too
//   node scripts/preflight.mjs --json              # for scripts
//
// Each of these, when set, unlocks more checks:
//   SUPABASE_DB_PASSWORD   migrations applied in production vs supabase/migrations
//   SUPABASE_ACCESS_TOKEN  Auth: email provider on, self-signup off, site URL
//   STRIPE_SECRET_KEY      mode match, webhook endpoint, Apple Pay domains, descriptor
//                          (a restricted key with read access is enough)
//
// This file only gathers facts (the supabase and gh CLIs, HTTP, Stripe) and
// prints. Every judgement is in preflight-checks.mjs, tested on its own.
//
// Read-only. It never writes to the database, changes a setting or deploys,
// and never runs `supabase link` or `db push`. The one side effect: the two
// anonymous functions count each probe against this connection's rate limit,
// the same as any reader's request. Secrets and API keys stay in memory; the
// output carries names and verdicts, never a value, not even a prefix.
//
// Exit 1 when anything blocks launch (or warns, with --strict), 2 on bad usage.

import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  describeKey, embedScript, FUNCTIONS, parseConfig, parseIframes, parseMigrationList, pickContest, redact, runChecks, summarize,
} from "./preflight-checks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NET_TIMEOUT = 10_000;
const CLI_TIMEOUT = 60_000;
const UA = "wpr-pet-contest-preflight (+https://github.com/RowanFlynnPilot/wpr-pet-contest)";

// ------------------------------------------------------------------ secrets --

// Every sensitive value seen this run, so redact() can strip it from anything
// printed even if it turns up somewhere unexpected (an error message, say).
const known = new Set();
const remember = (v) => {
  if (typeof v === "string" && v.length >= 8) known.add(v);
  return v;
};
for (const [name, value] of Object.entries(process.env)) {
  if (/(KEY|SECRET|TOKEN|PASSWORD)$/i.test(name)) remember(value);
}
const clean = (text) => redact(text, [...known]);

// --------------------------------------------------------------------- args --

function usage(message) {
  if (message) console.error(`preflight: ${message}\n`);
  console.error("usage: node scripts/preflight.mjs [--ref <project-ref>] [--repo owner/name] [--json] [--strict]");
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { ref: null, repo: null, json: false, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    if (flag === "--json") opts.json = true;
    else if (flag === "--strict") opts.strict = true;
    else if (flag === "--help" || flag === "-h") usage();
    else if (flag === "--ref" || flag === "--repo") {
      const value = inline ?? argv[++i];
      if (!value || value.startsWith("--")) usage(`${flag} needs a value`);
      opts[flag.slice(2)] = value;
    } else usage(`unknown argument ${argv[i]}`);
  }
  // Both end up inside shell command strings; refuse anything that is not
  // plainly a ref or an owner/name.
  if (opts.ref && !/^[a-z0-9]{20}$/.test(opts.ref)) usage(`--ref ${opts.ref} is not a Supabase project ref`);
  if (opts.repo && !/^[\w.-]+\/[\w.-]+$/.test(opts.repo)) usage(`--repo ${opts.repo} is not owner/name`);
  return opts;
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function linkedRef() {
  const ref = readText(join(ROOT, "supabase", ".temp", "project-ref"))?.trim();
  return ref && /^[a-z0-9]{20}$/.test(ref) ? ref : null;
}

// From .git/config rather than `git`, which may not be on PATH. A worktree's
// .git is a file pointing at the real directory; its config lives two up.
function repoFromGit() {
  let dir = join(ROOT, ".git");
  try {
    if (statSync(dir).isFile()) dir = resolve(ROOT, readFileSync(dir, "utf8").replace(/^gitdir:\s*/, "").trim());
  } catch {
    return null;
  }
  const config = readText(join(dir, "config")) ?? readText(join(dir, "..", "..", "config"));
  const url = config?.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/)?.[1];
  const m = url?.match(/github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

// ---------------------------------------------------------------- plumbing --

// A string command, not an args array with shell:true (Node deprecates that).
// Inputs are validated above, so nothing user-typed reaches the shell raw.
function sh(cmd, { timeout = CLI_TIMEOUT } = {}) {
  try {
    const stdout = execSync(cmd, { cwd: ROOT, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    return { ok: true, stdout, stderr: "" };
  } catch (err) {
    return { ok: false, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? ""), timedOut: err.code === "ETIMEDOUT" || err.signal === "SIGTERM" };
  }
}

function cliError(r) {
  if (r.timedOut) return `no answer in ${CLI_TIMEOUT / 1000}s`;
  // The CLIs color their errors even into a pipe.
  const text = `${r.stderr}\n${r.stdout}`.replace(/\x1b\[[0-9;]*m/g, "");
  const line = text.split(/\r?\n/).map((s) => s.trim()).find((s) => s && !/new version|upgrade|^using /i.test(s));
  return clean(line ?? "failed").slice(0, 160);
}

function json(text) {
  const s = String(text ?? "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const at = s.search(/[[{]/);
    if (at < 0) return undefined;
    try {
      return JSON.parse(s.slice(at));
    } catch {
      return undefined;
    }
  }
}

async function http(url, { method = "GET", headers = {}, body } = {}) {
  try {
    const res = await fetch(url, { method, body, redirect: "follow", headers: { "user-agent": UA, ...headers }, signal: AbortSignal.timeout(NET_TIMEOUT) });
    return { status: res.status, headers: res.headers, text: await res.text() };
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return { error: `no answer in ${NET_TIMEOUT / 1000}s` };
    return { error: clean(err.cause?.code ?? err.cause?.message ?? err.message) };
  }
}

const installed = (cmd) => sh(`${cmd} --version`, { timeout: 20_000 }).ok;
const skipAll = (target, keys, slot) => keys.forEach((k) => (target[k] = slot));

// ------------------------------------------------------------------- GitHub --

function collectGithub(f) {
  const g = (f.github = {});
  const keys = ["repo", "pages", "variables", "secrets", "run"];
  if (!f.repo) return skipAll(g, keys, { skip: "not checked, no repository", fix: "pass --repo owner/name" });
  if (!installed("gh")) return skipAll(g, keys, { skip: "not checked, gh is not installed", fix: "install the GitHub CLI and run gh auth login" });
  if (!sh("gh auth status", { timeout: 20_000 }).ok) return skipAll(g, keys, { skip: "not checked, gh is not signed in", fix: "run gh auth login" });

  const repo = sh(`gh repo view ${f.repo} --json visibility`);
  const info = repo.ok ? json(repo.stdout) : null;
  if (!info) return skipAll(g, keys, { skip: `not checked: ${cliError(repo)}`, fix: "check --repo and your access to it" });
  g.repo = { visibility: info.visibility };

  const pages = sh(`gh api repos/${f.repo}/pages`);
  if (pages.ok) {
    const p = json(pages.stdout) ?? {};
    g.pages = { enabled: true, buildType: p.build_type ?? null, htmlUrl: p.html_url ?? null };
  } else if (/HTTP 404|Not Found/.test(pages.stderr + pages.stdout)) {
    g.pages = { enabled: false };
  } else {
    g.pages = { skip: `not checked: ${cliError(pages)}` };
  }

  // Variable values are public by design (Vite bakes them into the bundle),
  // but the *_KEY ones are still kept only as a description.
  const vars = sh(`gh variable list -R ${f.repo} --json name,value`);
  const rows = vars.ok ? json(vars.stdout) : null;
  if (Array.isArray(rows)) {
    const values = {};
    const described = {};
    for (const { name, value } of rows) {
      if (/(KEY|SECRET|TOKEN|PASSWORD)$/i.test(name)) {
        remember(value);
        described[name] = describeKey(value);
        f.private.vars[name] = value;
      } else values[name] = value;
    }
    g.variables = { values, keys: described };
  } else g.variables = { skip: `not checked: ${cliError(vars)}` };

  const secrets = sh(`gh secret list -R ${f.repo} --json name`);
  const names = secrets.ok ? json(secrets.stdout) : null;
  g.secrets = Array.isArray(names) ? { names: names.map((s) => s.name) } : { skip: `not checked: ${cliError(secrets)}` };

  const run = sh(`gh run list -R ${f.repo} --branch main --workflow "test and deploy" --limit 1 --json conclusion,status,url,createdAt`);
  const runs = run.ok ? json(run.stdout) : null;
  g.run = Array.isArray(runs) ? { run: runs[0] ?? null } : { skip: `not checked: ${cliError(run)}` };
}

// ----------------------------------------------------------------- Supabase --

// The service key reads contest rows; the public keys check the front end's
// anon key. Neither leaves this function except as a value in memory.
function apiKeys(ref) {
  const fetchKeys = (reveal) => {
    const r = sh(`supabase projects api-keys --project-ref ${ref}${reveal ? " --reveal" : ""} -o json`);
    const rows = r.ok ? json(r.stdout) : null;
    if (!Array.isArray(rows)) return { error: cliError(r) };
    for (const k of rows) remember(k.api_key);
    return { rows };
  };
  // Masked keys come back with bullets or asterisks in them.
  const usable = (k) => typeof k?.api_key === "string" && /^[\x21-\x7e]+$/.test(k.api_key) && !k.api_key.includes("*");
  const first = fetchKeys(false);
  if (first.error) return first;
  let service = first.rows.find((k) => k.name === "service_role" && usable(k) && k.api_key.startsWith("eyJ"))?.api_key;
  if (!service && first.rows.length) {
    // Legacy keys switched off: only sb_secret_ keys, masked unless revealed.
    const second = fetchKeys(true);
    service = second.rows?.find((k) => k.type === "secret" && usable(k) && k.api_key.startsWith("sb_secret_"))?.api_key;
  }
  const publicKeys = first.rows.filter((k) => (k.name === "anon" || k.type === "publishable") && usable(k)).map((k) => k.api_key);
  return { service: service ?? null, publicKeys };
}

async function probe(slug, base, origin) {
  const url = `${base}/functions/v1/${slug}`;
  const out = {};
  // The webhook has no CORS handling; browsers never call it.
  if (slug !== "stripe-webhook") {
    const r = await http(url, {
      method: "OPTIONS",
      headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "authorization, x-client-info, apikey, content-type" },
    });
    out.options = r.error ? { error: r.error } : { status: r.status, allowOrigin: r.headers.get("access-control-allow-origin") };
  }
  // No session, no signature, no fields: every function must refuse this
  // before doing any work.
  const r = await http(url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "" });
  out.post = r.error ? { error: r.error } : { status: r.status };
  return [slug, out];
}

async function contestRows(base, key) {
  const headers = { apikey: key, accept: "application/json" };
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;
  const get = async (path) => {
    const r = await http(`${base}/rest/v1/${path}`, { headers });
    if (r.error) throw new Error(r.error);
    if (r.status !== 200) throw new Error(`REST answered ${r.status} for ${path.split("?")[0]}`);
    return json(r.text) ?? [];
  };
  try {
    const base = "contests?select=id,year,name,status,beneficiary_split_pct,bracket_size";
    const [contests, admins] = await Promise.all([
      // A project a migration behind has no free_vote_enabled column yet.
      get(`${base},free_vote_enabled&order=year.desc`).catch(() => get(`${base}&order=year.desc`)),
      get("admins?select=user_id"),
    ]);
    const contest = pickContest(contests);
    const data = { contests, admins: admins.length, packs: [], shelters: [], bonusWindows: 0 };
    if (contest) {
      const [packs, shelters, windows] = await Promise.all([
        get(`vote_packs?select=slug,active&contest_id=eq.${contest.id}`),
        get(`shelters?select=name,logo_path&contest_id=eq.${contest.id}`),
        get(`bonus_windows?select=id&contest_id=eq.${contest.id}`),
      ]);
      data.packs = packs.map((p) => ({ slug: p.slug, active: p.active }));
      data.shelters = shelters.map((s) => ({ name: s.name, hasLogo: Boolean(s.logo_path) }));
      data.bonusWindows = windows.length;
    }
    return data;
  } catch (err) {
    return { error: clean(err.message) };
  }
}

async function collectSupabase(f, env) {
  const s = (f.supabase = {});
  const all = ["project", "secrets", "functions", "http", "migrations", "auth", "data"];
  if (!f.ref) return skipAll(s, all, { skip: "not checked, no project ref", fix: "pass --ref <project-ref>" });

  // Auth goes straight to the Management API and needs no CLI.
  const token = env.SUPABASE_ACCESS_TOKEN;
  const auth = token
    ? http(`https://api.supabase.com/v1/projects/${f.ref}/config/auth`, { headers: { authorization: `Bearer ${token}` } }).then((r) => {
      if (r.error) return { error: r.error };
      if (r.status === 401 || r.status === 403) return { skip: `not checked, the Management API refused the token (${r.status})`, fix: "check SUPABASE_ACCESS_TOKEN" };
      if (r.status !== 200) return { error: `Management API answered ${r.status}` };
      const a = json(r.text) ?? {};
      return { externalEmailEnabled: a.external_email_enabled, disableSignup: a.disable_signup, siteUrl: a.site_url ?? "" };
    })
    : Promise.resolve({ skip: "not checked", fix: "set SUPABASE_ACCESS_TOKEN (a personal access token) to check" });

  if (!installed("supabase")) {
    skipAll(s, ["project", "secrets", "functions", "http", "migrations", "data"], { skip: "not checked, the supabase CLI is not installed", fix: "install it and run supabase login" });
    s.auth = await auth;
    return;
  }

  const projects = sh("supabase projects list -o json");
  const rows = projects.ok ? json(projects.stdout) : null;
  if (!Array.isArray(rows)) {
    // An exported SUPABASE_ACCESS_TOKEN replaces the CLI's own login.
    const fix = token ? "check SUPABASE_ACCESS_TOKEN; the supabase CLI uses it in place of supabase login" : "run supabase login";
    skipAll(s, ["project", "secrets", "functions", "http", "migrations", "data"], { skip: `not checked: ${cliError(projects)}`, fix });
    s.auth = await auth;
    return;
  }
  const project = rows.find((p) => p.ref === f.ref || p.id === f.ref);
  s.project = project ? { name: project.name, status: project.status } : { missing: true };
  const running = project?.status === "ACTIVE_HEALTHY";
  const notRunning = { skip: "not checked, the project is not running" };

  // Names only. The CLI also returns a digest of each value; it is dropped here.
  const secrets = sh(`supabase secrets list --project-ref ${f.ref} -o json`);
  const secretRows = secrets.ok ? json(secrets.stdout) : null;
  s.secrets = Array.isArray(secretRows) ? { names: secretRows.map((x) => x.name) } : { skip: `not checked: ${cliError(secrets)}` };

  const functions = sh(`supabase functions list --project-ref ${f.ref} -o json`);
  const fnRows = functions.ok ? json(functions.stdout) : null;
  s.functions = Array.isArray(fnRows)
    ? { list: fnRows.map((x) => ({ slug: x.slug ?? x.name, status: x.status ?? null, verifyJwt: x.verify_jwt ?? null })) }
    : { skip: `not checked: ${cliError(functions)}` };

  const deployed = (s.functions.list ?? []).map((x) => x.slug).filter((x) => FUNCTIONS.includes(x));
  const http$ = !running
    ? Promise.resolve(notRunning)
    : !s.functions.list
      ? Promise.resolve({ skip: "not checked, the function list is unavailable" })
      : !deployed.length
        ? Promise.resolve({ skip: "not checked, no functions deployed" })
        : Promise.all(deployed.map((slug) => probe(slug, f.supabaseUrl, f.pagesOrigin))).then((pairs) => ({ origin: f.pagesOrigin, probes: Object.fromEntries(pairs) }));

  // migration list reads only the linked project, and needs the database
  // password, which the CLI takes from SUPABASE_DB_PASSWORD itself.
  const linked = linkedRef();
  if (!env.SUPABASE_DB_PASSWORD) s.migrations = { skip: "not checked", fix: "set SUPABASE_DB_PASSWORD to check" };
  else if (linked !== f.ref) s.migrations = { skip: `not checked, the repo is linked to ${linked ?? "no project"}, not ${f.ref}`, fix: "run from a checkout linked to this project" };
  else if (!running) s.migrations = notRunning;
  else {
    const r = sh("supabase migration list --linked", { timeout: 90_000 });
    const parsed = r.ok ? parseMigrationList(r.stdout) : null;
    s.migrations = parsed && (parsed.local.length || parsed.remote.length) ? { remote: parsed.remote } : r.ok ? { error: "could not read the migration list" } : { skip: `not checked: ${cliError(r)}` };
  }

  let keys = { publicKeys: [] };
  if (project) {
    const k = apiKeys(f.ref);
    if (!k.error) keys = k;
    f.private.publicKeys = keys.publicKeys;
  }
  if (!running) s.data = notRunning;
  else if (!keys.service) s.data = { skip: "not checked, no service key from supabase projects api-keys", fix: "use an account that can read the project's API keys" };
  else s.data = await contestRows(f.supabaseUrl, keys.service);

  [s.http, s.auth] = await Promise.all([http$, auth]);
}

// ------------------------------------------------------------------- Stripe --

async function collectStripe(f, env) {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    f.stripe = { skip: "not checked", fix: "set STRIPE_SECRET_KEY (the contest account's; a read-only restricted key is enough) to check" };
    return;
  }
  const get = async (path, what) => {
    const r = await http(`https://api.stripe.com/v1/${path}`, { headers: { authorization: `Bearer ${key}` } });
    if (r.error) return { error: r.error };
    if (r.status === 401) return { skip: "not checked, Stripe refused the key", fix: "check STRIPE_SECRET_KEY" };
    if (r.status === 403) return { skip: `not checked, the key cannot read ${what}`, fix: `give the restricted key read access to ${what}` };
    if (r.status !== 200) return { error: `Stripe answered ${r.status}` };
    const body = json(r.text);
    return body ? { body } : { error: "unreadable answer from Stripe" };
  };
  const [wh, dom, acct] = await Promise.all([
    get("webhook_endpoints?limit=100", "webhook endpoints"),
    get("payment_method_domains?limit=100", "payment method domains"),
    get("account", "account settings"),
  ]);
  const k = describeKey(key);
  f.stripe = {
    key: { kind: k.kind, mode: k.mode },
    webhooks: wh.body ? { list: (wh.body.data ?? []).map((e) => ({ url: e.url, status: e.status, events: e.enabled_events ?? [] })) } : wh,
    domains: dom.body ? { list: (dom.body.data ?? []).map((d) => ({ name: d.domain_name, enabled: d.enabled, applePay: d.apple_pay?.status ?? null })) } : dom,
    account: acct.body ? { descriptor: acct.body.settings?.payments?.statement_descriptor ?? "" } : acct,
  };
}

// ---------------------------------------------------------------- Front end --

async function collectWeb(f) {
  const w = (f.web = {});
  const pages = f.pagesUrl ? http(f.pagesUrl) : Promise.resolve(null);

  const wpUrl = f.github?.variables?.values?.VITE_PUBLIC_URL;
  const wordpress = wpUrl && /^https?:\/\//.test(wpUrl) ? http(wpUrl) : Promise.resolve(null);

  const text = readText(join(ROOT, "web", "src", "config.js"));
  w.config = text == null ? { error: "file not found" } : parseConfig(text, readText(join(ROOT, "web", "src", "newsrooms.js")));

  const [p, wp] = await Promise.all([pages, wordpress]);
  w.pages = !f.pagesUrl ? { skip: "not checked, no repository", fix: "pass --repo owner/name" } : p.error ? { error: p.error } : { status: p.status };

  if (!wpUrl) w.wordpress = { skip: "not checked", fix: "set the VITE_PUBLIC_URL Actions variable to the contest page" };
  else if (!wp) w.wordpress = { error: `VITE_PUBLIC_URL is not a URL: ${wpUrl}` };
  else if (wp.error) w.wordpress = { error: `${wp.error} (${wpUrl})` };
  else {
    const challenged = wp.headers.get("cf-mitigated") === "challenge" || ([403, 429, 503].includes(wp.status) && /captcha|challenge|cloudflare|access denied/i.test(wp.text.slice(0, 4000)));
    w.wordpress = { url: wpUrl, status: wp.status, challenged, iframes: parseIframes(wp.text), script: embedScript(wp.text) };
  }
}

// -------------------------------------------------------------------- print --

function print(results, summary, meta, strict) {
  const color = process.stdout.isTTY && !process.env.NO_COLOR;
  const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const mark = { pass: paint("32", "✔"), fail: paint("31", "✖"), warn: paint("33", "!"), skip: paint("2", "–") };
  const lines = [paint("1", `Launch preflight · ${meta.ref ?? "no project ref"} · ${meta.repo ?? "no repository"}`)];
  let group = null;
  for (const r of results) {
    if (r.group !== group) {
      group = r.group;
      lines.push("", paint("1", group));
    }
    let line = `  ${mark[r.status] ?? "?"} ${r.message}`;
    if (r.status === "skip" && r.fix) line += paint("2", ` — ${r.fix}`);
    lines.push(line);
    if ((r.status === "fail" || r.status === "warn") && r.fix) lines.push(paint("2", `      → ${r.fix}`));
  }
  const c = summary.counts;
  lines.push("", `${c.pass} passed · ${c.fail} failed · ${c.warn} ${c.warn === 1 ? "warning" : "warnings"} · ${c.skip} skipped`);
  // A skip is not a pass: "ready" only when everything was actually looked at.
  if (!summary.ok) {
    lines.push(paint("31", c.fail ? "✖ Not ready to launch: clear every ✖, then run this again." : "✖ Not ready to launch (--strict: warnings count)."));
  } else if (c.skip) {
    lines.push(paint("33", `! Nothing failed, but ${c.skip} ${c.skip === 1 ? "check was" : "checks were"} skipped: set what they name and run again before calling it ready.`));
  } else if (c.warn) {
    lines.push(paint("33", `✔ Nothing blocks launch, but fix the ${c.warn === 1 ? "warning" : `${c.warn} warnings`} (docs/LAUNCH.md).`));
  } else {
    lines.push(paint("32", strict ? "✔ Ready to launch, strictly." : "✔ Ready to launch."));
  }
  console.log(lines.join("\n"));
}

// --------------------------------------------------------------------- main --

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ref = opts.ref ?? linkedRef();
  const repo = opts.repo ?? repoFromGit();
  const [owner, name] = repo ? repo.split("/") : [];

  const facts = {
    ref,
    repo,
    supabaseUrl: ref ? `https://${ref}.supabase.co` : null,
    pagesUrl: repo ? `https://${owner.toLowerCase()}.github.io/${name}/` : null,
    migrationFiles: existsSync(join(ROOT, "supabase", "migrations"))
      ? readdirSync(join(ROOT, "supabase", "migrations")).filter((n) => n.endsWith(".sql")).map((n) => n.match(/^(\d+)/)?.[1]).filter(Boolean).sort()
      : [],
    // Raw values some comparisons need. Never printed, never in --json.
    private: { vars: {}, publicKeys: [] },
  };

  // GitHub first: it knows the Pages URL (a custom domain changes it) and the
  // front end's variables, which the Supabase and Stripe checks compare against.
  collectGithub(facts);
  if (facts.github.pages?.htmlUrl) facts.pagesUrl = facts.github.pages.htmlUrl.replace(/\/?$/, "/");
  facts.pagesOrigin = facts.pagesUrl ? new URL(facts.pagesUrl).origin : null;

  await collectSupabase(facts, process.env);

  // Does the front end's anon key belong to this project? Compared here, kept
  // as a yes/no.
  const anon = facts.github.variables?.keys?.VITE_SUPABASE_ANON_KEY;
  if (anon?.present && facts.private.publicKeys.length) {
    anon.matchesProject = facts.private.publicKeys.includes(facts.private.vars.VITE_SUPABASE_ANON_KEY);
  }

  await Promise.all([collectStripe(facts, process.env), collectWeb(facts)]);
  delete facts.private;

  const results = runChecks(facts).map((r) => ({ ...r, message: clean(r.message), fix: r.fix && clean(r.fix) }));
  const summary = summarize(results, { strict: opts.strict });

  if (opts.json) {
    console.log(JSON.stringify({ ref, repo, checkedAt: new Date().toISOString(), strict: opts.strict, ok: summary.ok, counts: summary.counts, results }, null, 2));
  } else {
    print(results, summary, { ref, repo }, opts.strict);
  }
  process.exitCode = summary.exitCode;
}

main().catch((err) => {
  console.error(`preflight crashed: ${clean(err?.stack ?? err)}`);
  process.exit(2);
});
