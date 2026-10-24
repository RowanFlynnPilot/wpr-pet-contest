// The launch preflight's decisions, kept apart from the collecting so every
// one of them can be tested with plain objects. Nothing in this file touches
// the network, the disk or a CLI: preflight.mjs gathers facts, these judge.
//
// A fact slot is one of four shapes:
//   missing              not collected at all
//   { skip, fix }        could not be collected here; fix says what would let it
//   { error }            collected, and the target answered wrong
//   anything else        the data itself
//
// Every result is { id, group, status, message, fix }. Every fail and warn
// carries a fix that names the docs/LAUNCH.md section to work from, because a
// red line nobody knows how to clear gets ignored.

export const FUNCTIONS = ["submit-entry", "create-checkout", "stripe-webhook", "moderate", "notify", "health", "disqualify", "free-vote"];
// Staff functions refuse a request with no session before touching anything.
export const STAFF_FUNCTIONS = ["moderate", "notify", "health", "disqualify"];
// Anonymous write paths: an empty body fails validation (or the rate limit).
export const PUBLIC_FUNCTIONS = ["submit-entry", "create-checkout"];

export const REQUIRED_SECRETS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ALLOWED_ORIGIN"];
export const RECOMMENDED_SECRETS = ["PUBLIC_URL", "SHARE_BASE_URL", "CRON_SECRET"];
export const DEPLOY_SECRETS = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_ID"];
export const WEBHOOK_EVENTS = ["payment_intent.succeeded", "charge.refunded", "charge.dispute.created"];
// What the free daily vote needs once a contest turns it on (docs/FREE-DAILY-VOTE.md).
export const FREE_VOTE_SECRETS = ["FREE_VOTE_HASH_KEY", "TURNSTILE_SECRET_KEY", "RESEND_API_KEY"];

const SB = "Supabase";
const GH = "GitHub";
const ST = "Stripe";
const FE = "Front end";

const see = (...sections) => `(LAUNCH.md §${sections.join(", §")})`;
const PRE = "(LAUNCH.md, Launch preflight)";

const result = (status) => (id, group, message, fix = null) => ({ id, group, status, message, fix });
export const pass = result("pass");
export const fail = result("fail");
export const warn = result("warn");
export const skip = result("skip");

// The common front of every check: a slot that is not data becomes a skip (or
// a fail, when the target itself answered wrong). Returns null for data.
function gate(slot, id, group, label, errorFix) {
  if (slot == null) return skip(id, group, `${label}: not checked`);
  if (slot.skip) return skip(id, group, `${label}: ${slot.skip}`, slot.fix ?? null);
  if (slot.error) return fail(id, group, `${label}: ${slot.error}`, errorFix);
  return null;
}

const trimSlash = (u) => String(u ?? "").trim().replace(/\/+$/, "");
const list = (xs) => xs.join(", ");
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

// True when `src` lands on the site at `base` (same origin, same path prefix).
export function pointsAt(src, base) {
  try {
    const a = new URL(src, "https://invalid.example");
    const b = new URL(base);
    const dir = (p) => p.replace(/\/?$/, "/");
    return a.origin === b.origin && dir(a.pathname).startsWith(dir(b.pathname));
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ helpers --

// What a key is, without keeping the key. The collector stores this, never the
// value, so a facts object can be logged without leaking anything.
export function describeKey(value) {
  const v = String(value ?? "").trim();
  if (!v) return { present: false };
  const d = { present: true, kind: "unknown", mode: null, role: null, ref: null };
  const stripe = v.match(/^(pk|sk|rk)_(live|test)_/);
  if (stripe) {
    d.kind = stripe[1];
    d.mode = stripe[2];
  } else if (v.startsWith("sb_publishable_")) {
    d.kind = "sb_publishable";
  } else if (v.startsWith("sb_secret_")) {
    d.kind = "sb_secret";
  } else if (/^eyJ[\w-]+\.[\w-]+\.[\w-]*$/.test(v)) {
    d.kind = "jwt";
    try {
      const claims = JSON.parse(Buffer.from(v.split(".")[1], "base64url").toString("utf8"));
      d.role = claims.role ?? null;
      d.ref = claims.ref ?? null;
    } catch {
      // A malformed token is still "a token"; the role stays unknown.
    }
  }
  d.secret = d.kind === "sk" || d.kind === "rk" || d.kind === "sb_secret" || d.role === "service_role";
  return d;
}

const SECRET_PATTERNS = [
  /\b(?:sk|rk|pk)_(?:live|test)_[^\s"',)]+/g,
  /\bsb_(?:secret|publishable)_[^\s"',)]+/g,
  /\bwhsec_[^\s"',)]+/g,
  /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g,
  /\b(?:gh[pousr]_|github_pat_)[\w]{16,}/g,
  /\bsbp_[\w]{16,}/g,
  /\bre_[A-Za-z0-9_]{16,}/g,
];

// Belt and braces for anything printed: known secret values first (exact),
// then anything shaped like a key. Stripe's own error text echoes the tail of
// a bad key, which is exactly the "even truncated" this must never print.
export function redact(text, known = []) {
  let out = String(text ?? "");
  for (const value of known) if (value && value.length >= 8) out = out.split(value).join("[redacted]");
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

// Mirrors the admin desk's choice (pickAdminContest), minus finished contests:
// the live one, else a draft being set up, newest first.
export function pickContest(contests = []) {
  const open = [...contests].filter((c) => c.status !== "complete").sort((a, b) => b.year - a.year);
  return open.find((c) => c.status === "voting" || c.status === "submissions_open") ?? open.find((c) => c.status === "draft") ?? open[0] ?? null;
}

// `supabase migration list` prints a table; there is no JSON form to rely on.
export function parseMigrationList(text) {
  const local = [];
  const remote = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    if (!/[|│]/.test(raw)) continue;
    const cells = raw.trim().replace(/^[|│]|[|│]$/g, "").split(/[|│]/).map((s) => s.trim());
    if (cells.length < 2 || /^local$/i.test(cells[0]) || /^[-─┼+\s]*$/.test(cells.join(""))) continue;
    if (cells[0]) local.push(cells[0]);
    if (cells[1]) remote.push(cells[1]);
  }
  return { local, remote };
}

const decodeEntities = (s) =>
  s.replace(/&#0*38;|&amp;/g, "&").replace(/&quot;|&#0*34;/g, '"').replace(/&#0*39;|&apos;/g, "'");

// Every <iframe> on a page with the attributes the embed depends on. Lazy-load
// plugins move src to data-src (or data-lazy-src), so those count too.
export function parseIframes(html) {
  const frames = [];
  for (const tag of String(html ?? "").matchAll(/<iframe\b([^>]*)>/gi)) {
    const attrs = {};
    for (const a of tag[1].matchAll(/([^\s=/"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
    }
    const real = attrs.src && attrs.src !== "about:blank" ? attrs.src : null;
    frames.push({ src: real || attrs["data-src"] || attrs["data-lazy-src"] || attrs.src || "", allow: attrs.allow || "" });
  }
  return frames;
}

// The two halves of web/EMBED.md's script, by the strings they cannot do without.
export function embedScript(html) {
  const s = String(html ?? "");
  return { forwardsHash: /location\.hash/.test(s), listensForHeight: /wpr-pets-height/.test(s) };
}

// The body of `export const NAME = { ... }`, skipping strings and comments so a
// brace inside a sentence does not end it early.
function objectLiteral(text, name) {
  const at = text.search(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\{`));
  if (at < 0) return null;
  const start = text.indexOf("{", at);
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "/" && text[i + 1] === "/") {
      i = text.indexOf("\n", i);
      if (i < 0) break;
    } else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function stringField(block, key) {
  const m = block?.match(new RegExp(`\\b${key}\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1`));
  return m ? m[2] : null;
}

const PLACEHOLDER = /\b(?:TODO|TBD|FIXME|XXX+|PLACEHOLDER|lorem ipsum)\b|\bexample\.(?:com|org|net)\b|<[a-z][a-z _-]*>|\[[A-Z][A-Z _-]+\]/gi;

// web/src/config.js, read as text. Importing it would pull in import.meta.env
// and window, which only exist under Vite.
export function parseConfig(text) {
  const src = String(text ?? "");
  const rules = objectLiteral(src, "RULES");
  const approved = rules?.match(/\brulesApproved\s*:\s*(true|false)\b/);

  // The comment block directly above RULES. While it still says PLACEHOLDERS,
  // nobody has confirmed the text is counsel's.
  let note = "";
  const at = src.search(/export\s+const\s+RULES\b/);
  if (at >= 0) {
    const above = src.slice(0, at).split(/\r?\n/);
    above.pop();
    for (let i = above.length - 1; i >= 0 && /^\s*\/\//.test(above[i]); i--) note = `${above[i]}\n${note}`;
  }

  const values = rules ? [...rules.matchAll(/:\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g)].map((m) => m[2]).join("\n") : "";
  const markers = [...new Set([...values.matchAll(PLACEHOLDER)].map((m) => m[0]))];

  const sponsors = objectLiteral(src, "SPONSORS");
  let presenting = null;
  const slot = sponsors?.match(/\bpresenting\s*:\s*(null\b|\{)/);
  if (slot && slot[1] === "{") presenting = stringField(sponsors.slice(slot.index), "name") ?? "a sponsor";
  else if (!slot && sponsors && /\bpresenting\s*:/.test(sponsors)) presenting = "a sponsor";

  return {
    found: Boolean(rules),
    rulesApproved: approved ? approved[1] === "true" : null,
    contact: stringField(rules, "contact"),
    eligibility: stringField(rules, "eligibility"),
    placeholderNote: /placeholder/i.test(note),
    markers,
    analyticsDomain: stringField(objectLiteral(src, "ANALYTICS"), "domain"),
    presenting,
  };
}

// ----------------------------------------------------------------- Supabase --

export function checkProject(f) {
  const id = "supabase.project";
  const p = f.supabase?.project;
  const g = gate(p, id, SB, "Project", `Check --ref, or run supabase login ${PRE}`);
  if (g) return g;
  if (p.missing) {
    return fail(id, SB, `Project ${f.ref} is not in this Supabase account`, `Check --ref, or supabase login as a member of the project's organization ${PRE}`);
  }
  const name = p.name ?? f.ref;
  if (p.status === "ACTIVE_HEALTHY") return pass(id, SB, `Project ${name} is up (ACTIVE_HEALTHY)`);
  if (p.status === "INACTIVE" || p.status === "PAUSED") {
    return fail(id, SB, `Project ${name} is paused (${p.status})`, `Restore it in the dashboard: https://supabase.com/dashboard/project/${f.ref} ${PRE}`);
  }
  if (/COMING_UP|RESTORING|UPGRADING|RESIZING|PAUSING/.test(p.status ?? "")) {
    return warn(id, SB, `Project ${name} is ${p.status}`, `Wait for it to settle, then run the preflight again ${PRE}`);
  }
  return fail(id, SB, `Project ${name} is ${p.status ?? "in an unknown state"}`, `Check the dashboard: https://supabase.com/dashboard/project/${f.ref} ${PRE}`);
}

// A paused project's Management API may list no secrets or functions at all,
// so an empty list there is not yet proof of a missing one.
const paused = (f) => Boolean(f.supabase?.project?.status && f.supabase.project.status !== "ACTIVE_HEALTHY");
const PAUSED_NOTE = "a paused project may list none until restored";

export function checkSecrets(f) {
  const s = f.supabase?.secrets;
  const g = gate(s, "supabase.secrets", SB, "Function secrets", `Check supabase login and the ref ${PRE}`);
  if (g) return g;
  const has = (n) => s.names.includes(n);
  const out = [];

  const required = REQUIRED_SECRETS.filter((n) => !has(n));
  out.push(
    required.length
      ? fail("supabase.secrets.required", SB, `Function secrets missing: ${list(required)}${paused(f) ? ` (${PAUSED_NOTE})` : ""}`, `supabase secrets set ${required.map((n) => `${n}=…`).join(" ")} ${see(2)}`)
      : pass("supabase.secrets.required", SB, `Required function secrets set: ${list(REQUIRED_SECRETS)}`),
  );

  const recommended = RECOMMENDED_SECRETS.filter((n) => !has(n));
  const sections = [...new Set(recommended.map((n) => (n === "CRON_SECRET" ? 6 : 2)))].sort();
  out.push(
    recommended.length
      ? warn("supabase.secrets.recommended", SB, `Recommended function secrets missing: ${list(recommended)}`, `supabase secrets set ${recommended.map((n) => `${n}=…`).join(" ")} ${see(...sections)}`)
      : pass("supabase.secrets.recommended", SB, `Recommended function secrets set: ${list(RECOMMENDED_SECRETS)}`),
  );

  const webhook = has("ALERT_WEBHOOK_URL");
  const email = has("RESEND_API_KEY") && has("STAFF_ALERT_EMAILS");
  if (webhook || email) {
    out.push(pass("supabase.secrets.alerts", SB, `Alerts go to ${[webhook && "a chat webhook", email && "staff email"].filter(Boolean).join(" and ")}`));
  } else if (has("STAFF_ALERT_EMAILS")) {
    out.push(warn("supabase.secrets.alerts", SB, "STAFF_ALERT_EMAILS is set but RESEND_API_KEY is not: alert emails cannot send", `Set up email ${see(5)}, or set ALERT_WEBHOOK_URL ${see(6)}`));
  } else {
    out.push(warn("supabase.secrets.alerts", SB, "No alert channel: a broken webhook would go unnoticed until readers complain", `supabase secrets set ALERT_WEBHOOK_URL=… (or STAFF_ALERT_EMAILS with email set up) ${see(6)}`));
  }
  return out;
}

export function checkFunctionsDeployed(f) {
  const id = "supabase.functions";
  const fn = f.supabase?.functions;
  const g = gate(fn, id, SB, "Edge functions", `Check supabase login and the ref ${PRE}`);
  if (g) return g;
  const bySlug = new Map(fn.list.map((x) => [x.slug, x]));
  const missing = FUNCTIONS.filter((s) => !bySlug.has(s));
  const inactive = FUNCTIONS.filter((s) => bySlug.has(s) && bySlug.get(s).status && bySlug.get(s).status !== "ACTIVE");
  const jwt = FUNCTIONS.filter((s) => bySlug.get(s)?.verifyJwt === true);

  if (missing.length === FUNCTIONS.length) {
    return fail(id, SB, `No edge functions deployed (0 of ${FUNCTIONS.length}${paused(f) ? `; ${PAUSED_NOTE}` : ""})`, `Merge to main with the deploy secrets set; the deploy job ships every one ${see(3)}`);
  }
  const problems = [];
  if (missing.length) problems.push(`not deployed: ${list(missing)}`);
  if (inactive.length) problems.push(`not active: ${list(inactive)}`);
  if (jwt.length) problems.push(`JWT verification on for ${list(jwt)}, so Stripe and anonymous readers get 401`);
  if (problems.length) {
    const fix = jwt.length && !missing.length
      ? `Redeploy from the repo: config.toml turns verify_jwt off for all of them ${see(3)}`
      : `Merge to main (the deploy job ships every function), or supabase functions deploy <name> ${see(3)}`;
    return fail(id, SB, `Edge functions ${problems.join("; ")}`, fix);
  }
  return pass(id, SB, `All ${FUNCTIONS.length} edge functions deployed, JWT verification off`);
}

// One line per deployed function: does it boot, answer CORS for the Pages
// origin, and refuse a request it should refuse?
export function checkFunctionsHttp(f) {
  const h = f.supabase?.http;
  const g = gate(h, "supabase.http", SB, "Function HTTP checks", `Check the network, then run again ${PRE}`);
  if (g) return g;
  const origin = h.origin;
  const out = [];
  for (const slug of FUNCTIONS) {
    const probe = h.probes?.[slug];
    if (!probe) continue;
    const id = `supabase.http.${slug}`;
    const codes = [probe.options?.status, probe.post?.status].filter((c) => typeof c === "number");
    const crashed = codes.find((c) => c >= 500);
    if (crashed) {
      out.push(fail(id, SB, `${slug} crashes at start (HTTP ${crashed})`, `Usually a missing secret; check the function's logs in the dashboard (Edge Functions → ${slug} → Logs) ${see(2)}`));
      continue;
    }
    const problems = [];
    let fix = null;
    const reach = probe.post?.error ?? probe.options?.error;
    if (reach) {
      out.push(fail(id, SB, `${slug} did not answer: ${reach}`, `Check the network and the project's status ${PRE}`));
      continue;
    }

    if (slug !== "stripe-webhook" && probe.options) {
      const { status, allowOrigin } = probe.options;
      if (status !== 200) problems.push(`preflight answered ${status}`);
      else if (allowOrigin !== origin) problems.push(`CORS answers ${allowOrigin ? allowOrigin : "no origin"} for ${origin}`);
      if (problems.length) fix = `supabase secrets set ALLOWED_ORIGIN=${origin} (comma-separate any others) ${see(2)}`;
    }

    const expected = STAFF_FUNCTIONS.includes(slug) ? [401] : PUBLIC_FUNCTIONS.includes(slug) ? [400, 429] : [400];
    const got = probe.post?.status;
    if (!expected.includes(got)) {
      problems.push(`unauthenticated POST answered ${got}, expected ${expected.join(" or ")}`);
      if (got === 401 && !STAFF_FUNCTIONS.includes(slug)) {
        fix ??= `JWT verification is on; redeploy from the repo (config.toml turns it off) ${see(3)}`;
      } else {
        fix ??= `Redeploy from main and check the function's logs ${see(3)}`;
      }
    }

    if (problems.length) {
      out.push(fail(id, SB, `${slug}: ${problems.join("; ")}`, fix));
    } else {
      const cors = slug === "stripe-webhook" ? "" : `CORS allows ${origin}, `;
      const what = STAFF_FUNCTIONS.includes(slug) ? "no session" : slug === "stripe-webhook" ? "no signature" : "empty body";
      out.push(pass(id, SB, `${slug}: ${cors}${what} → ${got}`));
    }
  }
  if (!out.length) return skip("supabase.http", SB, "Function HTTP checks: no deployed functions to call");
  return out;
}

export function checkMigrations(f) {
  const id = "supabase.migrations";
  const m = f.supabase?.migrations;
  const g = gate(m, id, SB, "Migrations", `Check SUPABASE_DB_PASSWORD and the project's status ${see(3)}`);
  if (g) return g;
  const local = f.migrationFiles ?? [];
  const pending = local.filter((v) => !m.remote.includes(v));
  const unknown = m.remote.filter((v) => !local.includes(v));
  if (unknown.length) {
    return fail(id, SB, `Production has migrations the repo does not: ${list(unknown)}`, `Someone changed the schema outside the repo; reconcile before the next deploy ${see(3)}`);
  }
  if (pending.length) {
    return fail(id, SB, `${plural(pending.length, "migration")} not applied: ${list(pending)}`, `Merge to main; the deploy job runs supabase db push ${see(3)}`);
  }
  return pass(id, SB, `All ${local.length} migrations applied (latest ${local.at(-1) ?? "none"})`);
}

export function checkAuth(f) {
  const a = f.supabase?.auth;
  const g = gate(a, "supabase.auth", SB, "Auth settings", `Check SUPABASE_ACCESS_TOKEN ${see(2)}`);
  if (g) return g;
  const out = [];
  out.push(
    a.externalEmailEnabled === true
      ? pass("supabase.auth.email", SB, "Auth: email provider on (staff can sign in)")
      : fail("supabase.auth.email", SB, "Auth: email provider is off, so staff cannot sign in", `Auth → Providers → Email: enabled ${see(2)}`),
  );
  out.push(
    a.disableSignup === true
      ? pass("supabase.auth.signup", SB, "Auth: self-signup off")
      : fail("supabase.auth.signup", SB, "Auth: anyone can sign up", `Auth → "Allow new users to sign up": off ${see(2)}`),
  );
  if (!f.pagesUrl) {
    out.push(skip("supabase.auth.site_url", SB, "Auth: site URL not compared (no Pages URL)", "pass --repo owner/name"));
  } else if (a.siteUrl && trimSlash(a.siteUrl).toLowerCase().startsWith(trimSlash(f.pagesUrl).toLowerCase())) {
    out.push(pass("supabase.auth.site_url", SB, `Auth: site URL is the Pages site`));
  } else {
    out.push(fail("supabase.auth.site_url", SB, `Auth: site URL is ${a.siteUrl || "empty"}, so invite and reset links land there`, `Auth → URL Configuration → Site URL: ${f.pagesUrl} ${see(2)}`));
  }
  return out;
}

export function checkContestData(f) {
  const d = f.supabase?.data;
  const g = gate(d, "supabase.data", SB, "Contest data", `Check the project's status, then run again ${PRE}`);
  if (g) return g;
  const out = [];
  const contest = pickContest(d.contests);
  const setup = "Admin desk → Setup (CLAUDE.md, Running a contest, step 1)";

  if (!contest) {
    const latest = [...(d.contests ?? [])].sort((a, b) => b.year - a.year)[0];
    out.push(
      latest
        ? fail("supabase.contest", SB, `No upcoming contest: the latest (${latest.year}) is complete`, `${setup} ${PRE}`)
        : fail("supabase.contest", SB, "No contest created yet", `${setup} ${PRE}`),
    );
  } else {
    const extra = [contest.beneficiary_split_pct != null && `${contest.beneficiary_split_pct}% to shelters`, contest.bracket_size && `bracket of ${contest.bracket_size}`]
      .filter(Boolean).join(", ");
    out.push(pass("supabase.contest", SB, `Contest ${contest.year} "${contest.name}" is ${contest.status}${extra ? ` (${extra})` : ""}`));
  }

  out.push(
    d.admins > 0
      ? pass("supabase.admins", SB, `${plural(d.admins, "admin")} can moderate`)
      : fail("supabase.admins", SB, "No admins: nobody can moderate or open a round", `Invite each moderator, then insert into admins ${see(2)}`),
  );

  if (!contest) {
    out.push(skip("supabase.contest_rows", SB, "Vote packs, shelters, Double Vote windows: no contest to check"));
    return out;
  }

  const active = (d.packs ?? []).filter((p) => p.active).length;
  out.push(
    active
      ? pass("supabase.packs", SB, `${plural(active, "active vote pack")}`)
      : fail("supabase.packs", SB, "No active vote packs: open_submissions refuses to start", `Admin desk → Packs & bonuses (seed.sql has the recommended ladder) ${see(7)}`),
  );

  const shelters = d.shelters ?? [];
  const noLogo = shelters.filter((s) => !s.hasLogo).map((s) => s.name);
  if (!shelters.length) {
    out.push(fail("supabase.shelters", SB, "No partner shelters", `Admin desk → Setup → Partner shelters, once each MOU is signed ${see(7)}`));
  } else if (noLogo.length) {
    out.push(warn("supabase.shelters", SB, `${noLogo.length} of ${plural(shelters.length, "shelter")} without a logo: ${list(noLogo)}`, `Add each logo in Admin desk → Setup → Partner shelters ${see(7)}`));
  } else {
    out.push(pass("supabase.shelters", SB, `${plural(shelters.length, "partner shelter")}, all with logos`));
  }

  out.push(
    pass(
      "supabase.bonus_windows",
      SB,
      d.bonusWindows ? `${plural(d.bonusWindows, "Double Vote window")} scheduled` : "No Double Vote windows yet (optional; one per sponsor, §7)",
    ),
  );
  return out;
}

// ------------------------------------------------------------------- GitHub --

// Free voting is a contest setting. When the contest has it on, a missing key
// means every reader who tries it gets "not available": block the launch.
export function checkFreeVote(f) {
  const id = "supabase.free_vote";
  const d = f.supabase?.data;
  const g = gate(d, id, SB, "Free daily vote", `Check the project's REST API ${PRE}`);
  if (g) return g;
  const contest = pickContest(d.contests);
  if (!contest?.free_vote_enabled) return pass(id, SB, "Free daily vote is off for this contest");
  const out = [];
  const secrets = f.supabase?.secrets;
  if (!secrets?.names) {
    out.push(skip(`${id}.secrets`, SB, "Free daily vote secrets: not checked"));
  } else {
    const missing = FREE_VOTE_SECRETS.filter((n) => !secrets.names.includes(n));
    out.push(
      missing.length
        ? fail(`${id}.secrets`, SB, `Free daily vote is on, but function secrets are missing: ${list(missing)}`, `supabase secrets set ${missing.map((n) => `${n}=…`).join(" ")} ${see(5)}`)
        : pass(`${id}.secrets`, SB, `Free daily vote is on, with ${list(FREE_VOTE_SECRETS)} set`),
    );
  }
  const site = f.github?.variables?.keys?.VITE_TURNSTILE_SITE_KEY;
  if (f.github?.variables?.keys) {
    out.push(
      site?.present
        ? pass(`${id}.turnstile`, GH, "VITE_TURNSTILE_SITE_KEY is set")
        : fail(`${id}.turnstile`, GH, "Free daily vote is on, but VITE_TURNSTILE_SITE_KEY is not set: no reader could request a code", `Set the Actions variable from the Cloudflare Turnstile widget ${see(3)}`),
    );
  }
  return out;
}

export function checkPages(f) {
  const id = "github.pages";
  const p = f.github?.pages;
  const g = gate(p, id, GH, "GitHub Pages", `Check gh auth status and the repo name ${see(3)}`);
  if (g) return g;
  const visibility = f.github?.repo?.visibility;
  const isPublic = visibility === "PUBLIC" || visibility === "public";
  if (!p.enabled) {
    return isPublic
      ? fail(id, GH, "Pages not enabled", `Settings → Pages → Source: GitHub Actions ${see(3)}`)
      : fail(id, GH, `Pages not enabled; the repo must be public on the free plan (it is ${String(visibility ?? "private").toLowerCase()})`, `Make the repo public (MIT, no secrets), then Settings → Pages → Source: GitHub Actions ${see(3)}`);
  }
  if (p.buildType && p.buildType !== "workflow") {
    return warn(id, GH, `Pages builds from a branch (${p.buildType}), not from the pages workflow`, `Settings → Pages → Source: GitHub Actions ${see(3)}`);
  }
  return pass(id, GH, `Pages enabled from GitHub Actions${isPublic ? "" : " (private repo, paid plan)"}`);
}

export function checkVariables(f) {
  const vars = f.github?.variables;
  const g = gate(vars, "github.variables", GH, "Actions variables", `Check gh auth status ${see(3)}`);
  if (g) return g;
  const v = vars.values ?? {};
  const k = vars.keys ?? {};
  const out = [];
  const id = (name) => `github.var.${name}`;

  out.push(
    v.PAGES_ENABLED === "true"
      ? pass(id("PAGES_ENABLED"), GH, "PAGES_ENABLED=true")
      : fail(id("PAGES_ENABLED"), GH, `PAGES_ENABLED is ${v.PAGES_ENABLED ? `"${v.PAGES_ENABLED}"` : "not set"}, so the pages workflow does nothing`, `Set the Actions variable PAGES_ENABLED=true once Pages is on ${see(3)}`),
  );

  const url = v.VITE_SUPABASE_URL;
  if (!url) {
    out.push(fail(id("VITE_SUPABASE_URL"), GH, "VITE_SUPABASE_URL not set", `Set it to ${f.supabaseUrl ?? "https://<ref>.supabase.co"} ${see(3)}`));
  } else if (f.supabaseUrl && trimSlash(url) !== f.supabaseUrl) {
    out.push(fail(id("VITE_SUPABASE_URL"), GH, `VITE_SUPABASE_URL is ${url}, not ${f.supabaseUrl}`, `Point it at this project ${see(3)}`));
  } else {
    out.push(pass(id("VITE_SUPABASE_URL"), GH, `VITE_SUPABASE_URL is ${trimSlash(url)}`));
  }

  const anon = k.VITE_SUPABASE_ANON_KEY ?? { present: false };
  const anonId = id("VITE_SUPABASE_ANON_KEY");
  if (!anon.present) out.push(fail(anonId, GH, "VITE_SUPABASE_ANON_KEY not set", `Set it to the project's anon (or publishable) key ${see(3)}`));
  else if (anon.secret) out.push(fail(anonId, GH, "VITE_SUPABASE_ANON_KEY holds a SERVICE key: every reader would download it", `Rotate that key in Supabase now, then set the anon key ${see(3)}`));
  else if (anon.ref && f.ref && anon.ref !== f.ref) out.push(fail(anonId, GH, `VITE_SUPABASE_ANON_KEY belongs to another project (${anon.ref})`, `Use this project's anon key ${see(3)}`));
  else if (anon.matchesProject === false) out.push(fail(anonId, GH, "VITE_SUPABASE_ANON_KEY matches none of this project's public keys", `Copy the anon key from Settings → API ${see(3)}`));
  else out.push(pass(anonId, GH, `VITE_SUPABASE_ANON_KEY set${anon.matchesProject ? ", matches the project" : ""}`));

  const pk = k.VITE_STRIPE_PUBLISHABLE_KEY ?? { present: false };
  const pkId = id("VITE_STRIPE_PUBLISHABLE_KEY");
  if (!pk.present) out.push(fail(pkId, GH, "VITE_STRIPE_PUBLISHABLE_KEY not set, so checkout says it is not switched on", `Set the contest account's pk_live_ key ${see(3)}`));
  else if (pk.secret) out.push(fail(pkId, GH, "VITE_STRIPE_PUBLISHABLE_KEY holds a SECRET Stripe key: every reader would download it", `Roll that key in Stripe now, then set the pk_ key ${see(1, 3)}`));
  else if (pk.kind !== "pk") out.push(fail(pkId, GH, "VITE_STRIPE_PUBLISHABLE_KEY is not a publishable key (pk_live_/pk_test_)", `Set the contest account's publishable key ${see(3)}`));
  else if (pk.mode === "test") out.push(warn(pkId, GH, "VITE_STRIPE_PUBLISHABLE_KEY is a test key (pk_test_): checkout takes no real money", `Switch to pk_live_ after the dry run ${see(8)}`));
  else out.push(pass(pkId, GH, "VITE_STRIPE_PUBLISHABLE_KEY is live (pk_live_)"));

  const pub = v.VITE_PUBLIC_URL;
  const pubId = id("VITE_PUBLIC_URL");
  if (!pub) out.push(fail(pubId, GH, "VITE_PUBLIC_URL not set: share links and emails would point at the bare Pages site", `Set it to the WordPress contest page, as web/EMBED.md describes ${see(3, 4)}`));
  else if (!/^https:\/\//.test(pub) || !hostOf(pub)) out.push(fail(pubId, GH, `VITE_PUBLIC_URL is not an https URL: ${pub}`, `Set it to the WordPress page's permalink ${see(3)}`));
  else if (hostOf(pub).endsWith("github.io")) out.push(warn(pubId, GH, "VITE_PUBLIC_URL points at GitHub Pages, not the WordPress page", `Set it to the WordPress page's permalink ${see(4)}`));
  else out.push(pass(pubId, GH, `VITE_PUBLIC_URL is ${pub}`));

  const it = v.VITE_IMAGE_TRANSFORMS;
  if (it == null || it === "") out.push(warn(id("VITE_IMAGE_TRANSFORMS"), GH, "VITE_IMAGE_TRANSFORMS not set (behaves as false)", `Set false, or true only on the Pro plan ${see(2)}`));
  else if (it === "true") out.push(pass(id("VITE_IMAGE_TRANSFORMS"), GH, "VITE_IMAGE_TRANSFORMS=true (needs the Pro plan's image transformations)"));
  else out.push(pass(id("VITE_IMAGE_TRANSFORMS"), GH, `VITE_IMAGE_TRANSFORMS=${it}: the gallery serves resized uploads`));

  out.push(
    v.HEALTH_CHECKS === "true"
      ? pass(id("HEALTH_CHECKS"), GH, "HEALTH_CHECKS=true: live checks run every ten minutes")
      : warn(id("HEALTH_CHECKS"), GH, "HEALTH_CHECKS is off: nobody is told if the webhook breaks", `Turn on before voting opens ${see(6)}`),
  );

  out.push(
    pass(
      id("EMAIL_SWEEP"),
      GH,
      v.EMAIL_SWEEP === "true" ? "EMAIL_SWEEP=true: the email sweep runs every 15 minutes" : "EMAIL_SWEEP off: emails go out only from the admin desk (optional, §5)",
    ),
  );
  return out;
}

export function checkGithubSecrets(f) {
  const s = f.github?.secrets;
  const g = gate(s, "github.secrets", GH, "Actions secrets", `Check gh auth status ${see(3)}`);
  if (g) return g;
  const has = (n) => s.names.includes(n);
  const vars = f.github?.variables?.values;
  const out = [];

  const deploy = DEPLOY_SECRETS.filter((n) => !has(n));
  out.push(
    deploy.length
      ? fail("github.secrets.deploy", GH, `Deploy secrets missing: ${list(deploy)}`, `Settings → Secrets and variables → Actions ${see(3)}`)
      : pass("github.secrets.deploy", GH, `Deploy secrets set: ${list(DEPLOY_SECRETS)}`),
  );

  const conditional = (id, label, variable, names, section) => {
    if (!vars) return skip(id, GH, `${label} secrets: not checked (Actions variables unavailable)`);
    if (vars[variable] !== "true") return skip(id, GH, `${label} secrets: not needed while ${variable} is off`);
    const missing = names.filter((n) => !has(n));
    return missing.length
      ? fail(id, GH, `${variable}=true but secrets missing: ${list(missing)}`, `Add them as Actions secrets; CRON_SECRET matches the function secret ${see(section)}`)
      : pass(id, GH, `${label} secrets set: ${list(names)}`);
  };
  out.push(conditional("github.secrets.health", "Health-check", "HEALTH_CHECKS", ["HEALTH_URL", "CRON_SECRET"], 6));
  out.push(conditional("github.secrets.notify", "Email-sweep", "EMAIL_SWEEP", ["NOTIFY_URL", "CRON_SECRET"], 5));
  return out;
}

export function checkCi(f) {
  const id = "github.ci";
  const r = f.github?.run;
  const g = gate(r, id, GH, `"test and deploy" on main`, `Check gh auth status ${see(3)}`);
  if (g) return g;
  const run = r.run;
  if (!run) return warn(id, GH, `No "test and deploy" run on main yet`, `Merge to main; that run ships migrations and functions ${see(3)}`);
  const when = run.createdAt ? ` (${String(run.createdAt).slice(0, 10)})` : "";
  if (run.status && run.status !== "completed") return warn(id, GH, `Latest "test and deploy" on main is ${run.status.replace(/_/g, " ")}${when}`, `Run the preflight again when it finishes ${see(3)}`);
  if (run.conclusion === "success") return pass(id, GH, `Latest "test and deploy" on main passed${when}`);
  return fail(id, GH, `Latest "test and deploy" on main: ${run.conclusion ?? "no conclusion"}${when}`, `Fix it and re-run: ${run.url ?? "the Actions tab"} ${see(3)}`);
}

// ------------------------------------------------------------------- Stripe --

export function checkStripe(f) {
  const s = f.stripe;
  const g = gate(s, "stripe", ST, "Stripe", `Check STRIPE_SECRET_KEY ${see(1)}`);
  if (g) return g;
  const out = [];

  // Mode: the secret key used here against the publishable key readers get.
  const pk = f.github?.variables?.keys?.VITE_STRIPE_PUBLISHABLE_KEY;
  if (s.key?.kind !== "sk" && s.key?.kind !== "rk") {
    out.push(fail("stripe.mode", ST, "STRIPE_SECRET_KEY here is not a secret or restricted key (sk_/rk_)", `Use the contest account's key ${see(1)}`));
  } else if (!pk?.present || !pk.mode) {
    out.push(skip("stripe.mode", ST, "Live/test mode: no publishable key to compare", "set VITE_STRIPE_PUBLISHABLE_KEY"));
  } else if (pk.mode !== s.key.mode) {
    out.push(fail("stripe.mode", ST, `Mode mismatch: the secret key is ${s.key.mode}, the publishable key is ${pk.mode}`, `Both from the same account and mode, live for launch ${see(1, 8)}`));
  } else {
    out.push(pass("stripe.mode", ST, `Secret and publishable keys are both ${s.key.mode} mode`));
  }

  // Webhook: exactly one enabled endpoint at our function, with the events
  // confirm_vote, refunds and disputes depend on.
  const wh = s.webhooks;
  const target = f.supabaseUrl ? `${f.supabaseUrl}/functions/v1/stripe-webhook` : null;
  const whGate = gate(wh, "stripe.webhook", ST, "Webhook endpoint", `Check the key's access ${see(1)}`);
  if (whGate) out.push(whGate);
  else if (!target) out.push(skip("stripe.webhook", ST, "Webhook endpoint: no project ref to compare", "pass --ref"));
  else {
    const ours = wh.list.filter((e) => trimSlash(e.url) === target);
    const enabled = ours.filter((e) => e.status === "enabled");
    const lacking = (e) => (e.events ?? []).includes("*") ? [] : WEBHOOK_EVENTS.filter((ev) => !(e.events ?? []).includes(ev));
    const complete = enabled.filter((e) => !lacking(e).length);
    const fix = `Stripe → Developers → Webhooks: ${target}, events ${list(WEBHOOK_EVENTS)} ${see(1)}`;
    if (!ours.length) out.push(fail("stripe.webhook", ST, `No webhook endpoint for ${target}`, fix));
    else if (!enabled.length) out.push(fail("stripe.webhook", ST, "Webhook endpoint exists but is disabled", fix));
    else if (!complete.length) out.push(fail("stripe.webhook", ST, `Webhook endpoint is missing events: ${list(lacking(enabled[0]))}`, fix));
    else if (enabled.length > 1) out.push(warn("stripe.webhook", ST, `${enabled.length} enabled endpoints point at stripe-webhook; only one signing secret can match, the rest fail every delivery`, `Delete the extras in Stripe → Developers → Webhooks ${see(1)}`));
    else out.push(pass("stripe.webhook", ST, `Webhook endpoint enabled with ${list(WEBHOOK_EVENTS)}`));
  }

  // Apple Pay: the iframe's origin and the top-level WordPress page, both.
  const dom = s.domains;
  const domGate = gate(dom, "stripe.domains", ST, "Apple Pay domains", `Check the key's access ${see(1)}`);
  if (domGate) out.push(domGate);
  else {
    const pagesHost = hostOf(f.pagesUrl);
    const wpHost = hostOf(f.github?.variables?.values?.VITE_PUBLIC_URL);
    const byName = new Map(dom.list.map((d) => [String(d.name).toLowerCase(), d]));
    const problems = [];
    for (const host of [pagesHost, wpHost].filter(Boolean)) {
      const d = byName.get(host);
      if (!d) problems.push(`${host} not registered`);
      else if (!d.enabled) problems.push(`${host} disabled`);
      else if (d.applePay && d.applePay !== "active") problems.push(`${host} Apple Pay ${d.applePay}`);
    }
    const fix = `Stripe → Settings → Payment method domains: add both hosts ${see(1)}`;
    if (!pagesHost && !wpHost) out.push(skip("stripe.domains", ST, "Apple Pay domains: no hosts to look for", "pass --repo and set VITE_PUBLIC_URL"));
    else if (problems.length) out.push(fail("stripe.domains", ST, `Apple Pay domains: ${problems.join("; ")}`, fix));
    else if (!wpHost) out.push(warn("stripe.domains", ST, `Apple Pay: ${pagesHost} registered; the WordPress host is unknown until VITE_PUBLIC_URL is set`, `Set VITE_PUBLIC_URL, then run again ${see(3)}`));
    else out.push(pass("stripe.domains", ST, `Apple Pay domains registered: ${pagesHost}, ${wpHost}`));
  }

  const acct = s.account;
  const acctGate = gate(acct, "stripe.descriptor", ST, "Statement descriptor", `Check the key's access ${see(1)}`);
  if (acctGate) out.push(acctGate);
  else if (!acct.descriptor) out.push(warn("stripe.descriptor", ST, "No statement descriptor: buyers who don't recognize a charge dispute it", `Settings → Business → Public details: WPR PET CONTEST ${see(1)}`));
  else out.push(pass("stripe.descriptor", ST, `Statement descriptor "${acct.descriptor}"`));
  return out;
}

// ---------------------------------------------------------------- Front end --

export function checkPagesSite(f) {
  const id = "web.pages";
  const p = f.web?.pages;
  const g = gate(p, id, FE, "Pages site", `Check that Pages is deployed ${see(3)}`);
  if (g) return g;
  if (p.status === 200) return pass(id, FE, `Pages site answers 200: ${f.pagesUrl}`);
  return fail(id, FE, `Pages site answers ${p.status}: ${f.pagesUrl}`, `Enable Pages, set PAGES_ENABLED=true, then run the pages workflow ${see(3)}`);
}

export function checkWordPress(f) {
  const id = "web.wordpress";
  const w = f.web?.wordpress;
  const g = gate(w, id, FE, "WordPress page", `Check the page is published ${see(4)}`);
  if (g) return g;
  if (w.status !== 200) {
    return w.challenged
      ? warn(id, FE, `WordPress page answered ${w.status} to a script (bot protection); check the embed by eye`, `Open ${w.url} and confirm the iframe from web/EMBED.md ${see(4)}`)
      : fail(id, FE, `WordPress page answers ${w.status}: ${w.url}`, `Publish the contest page, or fix VITE_PUBLIC_URL ${see(4)}`);
  }
  const out = [pass(id, FE, `WordPress page answers 200: ${w.url}`)];
  const fix = `Paste the snippet from web/EMBED.md into a Custom HTML block ${see(4)}`;
  const ours = (w.iframes ?? []).filter((fr) => f.pagesUrl && pointsAt(fr.src, f.pagesUrl));
  if (!ours.length) out.push(fail("web.embed", FE, `No iframe on the page points at ${f.pagesUrl}`, fix));
  else if (!ours.some((fr) => /(^|[;\s])payment\b/i.test(fr.allow))) out.push(fail("web.embed", FE, `The iframe lacks allow="payment": Apple Pay and Google Pay won't appear`, fix));
  else out.push(pass("web.embed", FE, `Embed iframe points at the Pages site with allow="payment"`));

  const s = w.script ?? {};
  const missing = [!s.forwardsHash && "hash forwarding (share links would open the home page)", !s.listensForHeight && "height listener (the frame stays 1400px tall)"].filter(Boolean);
  out.push(
    missing.length
      ? warn("web.embed.script", FE, `Embed script seems absent: no ${missing.join(", no ")}`, `Paste the <script> half of web/EMBED.md's snippet too ${see(4)}`)
      : pass("web.embed.script", FE, "Embed script forwards deep links and resizes the frame"),
  );
  return out;
}

export function checkConfig(f) {
  const c = f.web?.config;
  const g = gate(c, "web.config", FE, "web/src/config.js", `Check the file exists ${see(4)}`);
  if (g) return g;
  if (!c.found) return fail("web.config", FE, "web/src/config.js has no RULES object", `Restore RULES in web/src/config.js ${see(4)}`);
  const out = [];
  out.push(
    c.rulesApproved === true
      ? pass("web.rules.approved", FE, "Rules approved (no DRAFT ribbon)")
      : fail("web.rules.approved", FE, "rulesApproved is false: rules still show the DRAFT ribbon", `Have the rules reviewed, then set RULES.rulesApproved: true ${see(4)}`),
  );

  const empty = [!c.contact && "contact", !c.eligibility && "eligibility"].filter(Boolean);
  if (empty.length) out.push(fail("web.rules.placeholders", FE, `RULES ${list(empty)} empty`, `Fill in RULES in web/src/config.js ${see(4)}`));
  else if (!c.contact.includes("@")) out.push(fail("web.rules.placeholders", FE, `RULES contact is not an email address: ${c.contact}`, `Set the contest inbox in RULES.contact ${see(4)}`));
  else if (c.markers.length) out.push(fail("web.rules.placeholders", FE, `RULES still holds placeholder text: ${list(c.markers)}`, `Replace it with counsel's approved wording ${see(4)}`));
  else if (c.placeholderNote) out.push(warn("web.rules.placeholders", FE, "RULES is still marked PLACEHOLDERS in config.js", `Confirm eligibility and contact are the approved text, then update that comment ${see(4)}`));
  else out.push(pass("web.rules.placeholders", FE, "RULES eligibility and contact filled in"));

  out.push(
    c.analyticsDomain
      ? pass("web.analytics", FE, `Analytics on for ${c.analyticsDomain}`)
      : warn("web.analytics", FE, "Analytics off (ANALYTICS.domain empty): no traffic or sponsor-click numbers", `Set ANALYTICS.domain in web/src/config.js; the sponsor report needs it ${see(9)}`),
  );
  out.push(pass("web.sponsors", FE, c.presenting ? `Presenting sponsor: ${c.presenting}` : "Presenting sponsor: unsold (the upsell card shows; §7)"));
  return out;
}

// -------------------------------------------------------------------- run ---

export const CHECKS = [
  [SB, checkProject],
  [SB, checkSecrets],
  [SB, checkFunctionsDeployed],
  [SB, checkFunctionsHttp],
  [SB, checkMigrations],
  [SB, checkAuth],
  [SB, checkContestData],
  [SB, checkFreeVote],
  [GH, checkPages],
  [GH, checkVariables],
  [GH, checkGithubSecrets],
  [GH, checkCi],
  [ST, checkStripe],
  [FE, checkPagesSite],
  [FE, checkWordPress],
  [FE, checkConfig],
];

// A check that throws on an unexpected fact shape becomes one failed line; the
// rest still run.
export function runChecks(facts, checks = CHECKS) {
  const out = [];
  for (const [group, check] of checks) {
    try {
      out.push(...[check(facts)].flat().filter(Boolean));
    } catch (err) {
      out.push(fail(`internal.${check.name}`, group, `${check.name} crashed: ${err.message}`, `A preflight bug; the other checks still ran ${PRE}`));
    }
  }
  return out;
}

export function summarize(results, { strict = false } = {}) {
  const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const blocked = counts.fail > 0 || (strict && counts.warn > 0);
  return { counts, ok: !blocked, exitCode: blocked ? 1 : 0 };
}
