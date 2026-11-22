// What setting up a newsroom's copy means, as data. No I/O: setup.mjs gathers
// what exists (secret and variable names, never values) and carries out what
// this returns; setup.test.mjs pins the decisions.
//
// A step never overwrites what a person set by hand unless it is derived
// from the newsroom entry (and so reproducible) or named on this run's
// command line, and never replaces
// FREE_VOTE_HASH_KEY: changing that mid-contest orphans every free-vote code.

export const REF = /^[a-z0-9]{20}$/;
export const REPO = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;
// Strict on purpose: these addresses are written into a SQL statement.
export const EMAIL = /^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function pagesUrl(repo) {
  const [owner, name] = repo.split("/");
  return `https://${owner.toLowerCase()}.github.io/${name}/`;
}

// A role token's value for a newsroom: its theme block over the root block,
// following var() one step at a time. Null when it is not a plain hex color.
export function token(css, name, theme) {
  const block = (selector) => {
    const at = css.indexOf(selector);
    if (at < 0) return "";
    const open = css.indexOf("{", at);
    return css.slice(open + 1, css.indexOf("}", open));
  };
  const root = block(":root {");
  const themed = theme ? block(`:root[data-theme='${theme}']`) : "";
  const read = (n) => {
    for (const body of [themed, root]) {
      const m = body.match(new RegExp(`(?:^|[;\\s])${n}:\\s*([^;]+);`));
      if (m) return m[1].trim();
    }
    return null;
  };
  let value = read(name);
  for (let i = 0; i < 4 && value; i++) {
    const ref = value.match(/^var\((--[a-z0-9-]+)\)$/i);
    if (!ref) break;
    value = read(ref[1]);
  }
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

// One line of a dotenv file, as `supabase secrets set --env-file` reads it.
export function envLine(name, value) {
  if (/[\r\n]/.test(value)) throw new Error(`${name}: a secret cannot span lines`);
  if (!value.includes("'")) return `${name}='${value}'`;
  return `${name}="${value.replace(/[\\"$]/g, (c) => `\\${c}`)}"`;
}

const host = (url) => new URL(url).hostname.replace(/^www\./, "");

// input: { newsroom, tokensCss, ref, repo, publicUrl?, emailFrom?, staffDomains?, admins[] }
// existing: { functionSecrets: Set, ghVariables: Map, ghSecrets: Set } (names only for secrets)
export function buildPlan(input, existing) {
  const { newsroom: n, ref, repo } = input;
  const problems = [];
  if (!n) problems.push("no such newsroom in web/src/newsrooms.js: add its entry first (docs/NEWSROOM.md)");
  if (!REF.test(ref ?? "")) problems.push("--ref must be the Supabase project ref (20 lowercase letters and digits)");
  if (!REPO.test(repo ?? "")) problems.push("--repo must be owner/name");
  const admins = [...new Set((input.admins ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean))];
  for (const a of admins) if (!EMAIL.test(a)) problems.push(`--admin ${a} is not an address this script will write`);
  if (input.publicUrl && !/^https:\/\/\S+\/$/.test(input.publicUrl)) problems.push("--public-url must be https and end with /");
  if (problems.length) return { problems };

  const site = pagesUrl(repo);
  const base = `https://${ref}.supabase.co`;
  const brand = token(input.tokensCss, "--brand-ink", n.theme);
  const paper = token(input.tokensCss, "--cream-light", n.theme);
  const warnings = [];
  if (!brand || !paper) warnings.push("could not read --brand-ink or --cream-light as hex from tokens.css; emails keep the default colors until NEWSROOM_BRAND_COLOR and NEWSROOM_PAPER_COLOR are set by hand");
  if (!input.publicUrl) warnings.push(`no --public-url: links in emails open the contest at ${site}. Pass it once the newsroom's own page carries the embed and the site-wide script (web/EMBED.md)`);

  // Derived from the newsroom entry and the addresses: set every run.
  const derived = {
    ALLOWED_ORIGIN: new URL(site).origin,
    SHARE_BASE_URL: site,
    PUBLIC_URL: input.publicUrl || site,
    NEWSROOM_NAME: n.name,
    NEWSROOM_PHONE: n.phone,
    ...(brand ? { NEWSROOM_BRAND_COLOR: brand } : {}),
    ...(paper ? { NEWSROOM_PAPER_COLOR: paper } : {}),
    STAFF_EMAIL_DOMAINS: input.staffDomains || host(n.url),
    EMAIL_FROM: input.emailFrom || `${n.name.replace(/[<>"]/g, "")} <${n.contact}>`,
    ...(admins.length ? { MODERATOR_EMAILS: admins.join(","), STAFF_ALERT_EMAILS: admins.join(",") } : {}),
  };
  // A value a person may have chosen by hand (a sending subdomain, another
  // alert address) is only replaced when this run was told one.
  const chosen = { PUBLIC_URL: !!input.publicUrl, STAFF_EMAIL_DOMAINS: !!input.staffDomains, EMAIL_FROM: !!input.emailFrom, MODERATOR_EMAILS: false, STAFF_ALERT_EMAILS: false };
  const keep = (name) => name in chosen && !chosen[name] && existing.functionSecrets.has(name);
  const kept = Object.keys(derived).filter(keep);
  const functionSecrets = Object.entries(derived).filter(([name]) => !keep(name)).map(([name, value]) => ({ name, value }));

  // Random, made here, never shown. CRON_SECRET lives in two places that must
  // match and neither can be read back, so it is made new unless both have it.
  const generated = [];
  const cronBoth = existing.functionSecrets.has("CRON_SECRET") && existing.ghSecrets.has("CRON_SECRET");
  if (!cronBoth) generated.push({ name: "CRON_SECRET", to: ["functions", "github"] });
  if (!existing.functionSecrets.has("FREE_VOTE_HASH_KEY")) generated.push({ name: "FREE_VOTE_HASH_KEY", to: ["functions"] });

  const wantVars = {
    PAGES_ENABLED: "true",
    VITE_NEWSROOM: n.key,
    VITE_SUPABASE_URL: base,
    VITE_SUPABASE_ANON_KEY: { from: "anonKey" },
    ...(input.publicUrl ? { VITE_PUBLIC_URL: input.publicUrl } : {}),
  };
  const ghVariables = Object.entries(wantVars)
    .filter(([name, value]) => typeof value !== "string" || existing.ghVariables.get(name) !== value)
    .map(([name, value]) => ({ name, value }));
  // VITE_IMAGE_TRANSFORMS is a plan decision (Pro plan or not): only a default.
  if (!existing.ghVariables.has("VITE_IMAGE_TRANSFORMS")) {
    ghVariables.push({ name: "VITE_IMAGE_TRANSFORMS", value: "false" });
    warnings.push("VITE_IMAGE_TRANSFORMS starts as false (free plan). On the Pro plan set it to true: lists load far lighter");
  }

  const ghSecrets = [
    { name: "SUPABASE_PROJECT_ID", value: ref },
    { name: "HEALTH_URL", value: `${base}/functions/v1/health` },
    { name: "NOTIFY_URL", value: `${base}/functions/v1/notify` },
    { name: "SUPABASE_ACCESS_TOKEN", env: "SUPABASE_ACCESS_TOKEN" },
    { name: "SUPABASE_DB_PASSWORD", env: "SUPABASE_DB_PASSWORD" },
  ];

  const auth = { site_url: site, disable_signup: true, external_email_enabled: true };

  // What no script can do: other companies' dashboards, and people.
  const has = (name) => existing.functionSecrets.has(name);
  const manual = [
    !has("STRIPE_SECRET_KEY") && "Stripe: the contest's own account, a restricted key as STRIPE_SECRET_KEY, and the publishable key as the VITE_STRIPE_PUBLISHABLE_KEY variable (LAUNCH.md, 1 and 2)",
    !has("STRIPE_WEBHOOK_SECRET") && `Stripe: webhook to ${base}/functions/v1/stripe-webhook, its signing secret as STRIPE_WEBHOOK_SECRET (LAUNCH.md, 1)`,
    `Stripe: register ${new URL(site).hostname}${input.publicUrl ? ` and ${new URL(input.publicUrl).hostname}` : " and the newsroom's own domain"} as payment method domains`,
    !has("RESEND_API_KEY") && `Resend: verify the sending domain of ${derived.EMAIL_FROM}, then set RESEND_API_KEY (LAUNCH.md, 5)`,
    !has("TURNSTILE_SECRET_KEY") && "Only for the free daily vote: a Turnstile widget, TURNSTILE_SECRET_KEY and the VITE_TURNSTILE_SITE_KEY variable (LAUNCH.md, 5)",
    "GitHub: Settings → Pages → Source: GitHub Actions (once per repository)",
    "The newsroom's page: the iframe from web/EMBED.md",
    "Their counsel reads the rules page; paid voting law differs by state",
    "Then: node scripts/preflight.mjs --ref " + ref + " --repo " + repo,
  ].filter(Boolean);

  return { problems: [], warnings, site, base, functionSecrets, kept, generated, ghVariables, ghSecrets, auth, admins, manual };
}

// The admins statement. Addresses passed EMAIL above; nothing else is interpolated.
export function adminSql(admins) {
  for (const a of admins) if (!EMAIL.test(a)) throw new Error(`refusing to write ${a}`);
  const list = admins.map((a) => `'${a}'`).join(", ");
  return `insert into admins (user_id) select id from auth.users where lower(email) in (${list}) on conflict do nothing returning user_id`;
}
