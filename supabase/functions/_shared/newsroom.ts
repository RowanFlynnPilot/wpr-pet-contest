// Which paper the functions speak for: the name in the emails and in the
// staff refusal, the phone under every email, the button and paper colors,
// and the seal in the email masthead (NEWSROOM_BADGE_URL, https; another
// newsroom that names itself gets no WPR seal by default).
// Another newsroom sets the NEWSROOM_* secrets; the defaults are WPR's and
// match web/src/newsrooms.js and the tokens in tokens.css (--brand-ink,
// --cream). Colors must be six-digit hex: they go into inline styles.
import { optionalEnv } from "./env.ts";
import { DEFAULT_NEWSROOM, type Newsroom } from "./templates.ts";

const color = (name: string, fallback: string) => {
  const v = optionalEnv(name);
  return v && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
};

export const NEWSROOM: Newsroom = {
  name: optionalEnv("NEWSROOM_NAME") ?? DEFAULT_NEWSROOM.name,
  phone: optionalEnv("NEWSROOM_PHONE") ?? DEFAULT_NEWSROOM.phone,
  brand: color("NEWSROOM_BRAND_COLOR", DEFAULT_NEWSROOM.brand),
  paper: color("NEWSROOM_PAPER_COLOR", DEFAULT_NEWSROOM.paper),
  badge: optionalEnv("NEWSROOM_BADGE_URL") ?? (optionalEnv("NEWSROOM_NAME") ? undefined : DEFAULT_NEWSROOM.badge),
};
