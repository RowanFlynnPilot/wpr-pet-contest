// The newsletter block: a contest section for WPR's daily newsletters, built
// from the live contest and pasted into a Noptin draft as one Custom HTML
// block.
//
// Email HTML: tables and inline styles only. It wears the newsletter's look
// (Oswald, Merriweather, Source Sans 3, the site teal), not the contest's,
// because the newsletter is the page it sits on. Palette, section head and
// button are wpr-newsletter's (newsmatch.py, support_box.py).
//
// Readers open it hours after it is built, so it gives clock times ("closes
// Thursday at 8 p.m."), never "5 hours left", and stamps its standings.
// Everything a reader submitted (pet names, towns) is escaped.

import { windowTitle } from './bonus.js'
import { apDate, apDateTime, apTime, fmtInt, fmtMoney, period, plural } from './format.js'
import { roundLabel } from './rounds.js'

// wpr-newsletter's MAX_CHUNK. Noptin sanitizes each Custom HTML block on its
// own and silently blanks one somewhere past 13 KB.
export const NOPTIN_LIMIT = 8000

const TEAL = '#3A867C'
const TEAL_DARK = '#2b655d'
const TEAL_TINT = '#eaf2f0'
const SUN = '#FED850'
const INK = '#1a1a1a'
const BODY = '#333333'
const FINE = '#52493d'
const RULE = '#e3dccb'
const OSWALD = "'Oswald','Arial Narrow',Arial,sans-serif"
const SERIF = "'Merriweather',Georgia,serif"
const SANS = "'Source Sans 3',Helvetica,Arial,sans-serif"
const HOUR = 3600 * 1000

const ESC = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c])
const ms = (v) => new Date(v).getTime()

// The contest page with the newsletter's UTM tags (the campaign is the
// edition, e.g. "morning-2026-10-23", as wpr-newsletter names it) and a route.
export function contestLink(base, route, campaign) {
  const u = new URL(base)
  u.hash = ''
  u.searchParams.set('utm_source', 'newsletter')
  u.searchParams.set('utm_medium', 'email')
  if (campaign) u.searchParams.set('utm_campaign', campaign)
  return `${u.href}#/${route}`
}

function sponsorLink(url) {
  if (url.includes('utm_source=')) return url
  return `${url}${url.includes('?') ? '&' : '?'}utm_source=wausaupilotandreview&utm_medium=email&utm_campaign=pet-contest`
}

const COUNTS = { 2: 'double', 3: 'triple' }

// A Double Votes window still to come within a day and a half of building (or
// on now), in clock times.
export function bonusLine(windows = [], now = Date.now()) {
  const w = windows
    .filter((x) => ms(x.ends_at) > now && ms(x.starts_at) - now < 36 * HOUR)
    .sort((a, b) => ms(a.starts_at) - ms(b.starts_at))[0]
  if (!w) return null
  const s = new Date(w.starts_at)
  const e = new Date(w.ends_at)
  let span
  if (ms(w.starts_at) <= now) span = `until ${apTime(e)} ${apDate(e)}`
  else if (apDate(s) === apDate(e)) span = `${apDate(s)}, ${apTime(s)} to ${apTime(e)}`
  else span = `${apDateTime(s)} to ${apDateTime(e)}`
  return {
    title: windowTitle(w),
    span,
    counts: COUNTS[w.multiplier] || `${w.multiplier} times over`,
    sponsor: w.sponsor_name || null,
  }
}

// A square crop without object-fit, which Gmail ignores: the image is sized
// from its real proportions to cover the box, and the box clips it. Outlook
// for Windows ignores the clip and shows the whole photo, undistorted.
export function photoBox(photo, size, alt = '', { center = false } = {}) {
  const box = `width:${size}px;height:${size}px;overflow:hidden;border-radius:6px;background:${TEAL_TINT};${center ? 'margin:0 auto;' : ''}`
  if (!photo?.src) return `<div style="${box}"></div>`
  let w = size
  let h = size
  let left = 0
  let top = 0
  if (photo.w > 0 && photo.h > 0) {
    if (photo.w >= photo.h) {
      w = Math.round((size * photo.w) / photo.h)
      left = Math.round((size - w) / 2)
    } else {
      h = Math.round((size * photo.h) / photo.w)
      top = Math.round((size - h) / 3) // a little above center, where faces are
    }
  }
  const dims = photo.w > 0 && photo.h > 0 ? ` height="${h}"` : ''
  const hStyle = dims ? `height:${h}px;` : 'height:auto;'
  return (
    `<div style="${box}"><img src="${esc(photo.src)}" width="${w}"${dims} alt="${esc(alt)}" ` +
    `style="display:block;width:${w}px;${hStyle}max-width:none;${top ? `margin-top:${top}px;` : ''}${left ? `margin-left:${left}px;` : ''}"></div>`
  )
}

function button(label, href) {
  // bgcolor gives Outlook a solid button; the link's padding makes all of it
  // clickable everywhere else (support_box.py's button)
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td bgcolor="${TEAL_DARK}" style="background:${TEAL_DARK};border-radius:6px;">` +
    `<a href="${esc(href)}" style="display:inline-block;padding:13px 28px;border-radius:6px;font-family:${SANS};` +
    `font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(label)}</a></td></tr></table>`
  )
}

// Inline pieces inherit the font from their cell (Outlook loses it only
// across a nested table), which keeps the big rounds inside NOPTIN_LIMIT.
const nameLink = (entry, href) =>
  `<a href="${esc(href)}" style="font-weight:700;color:${INK};text-decoration:none;">${esc(entry.pet_name)}</a>`
const small = (text) => `<span style="font-size:13px;color:${FINE};">${text}</span>`
const votesText = (n) => `${fmtInt(n)} ${n === 1 ? 'vote' : 'votes'}`

function strip(entries, ctx) {
  if (!entries?.length) return ''
  const cells = entries
    .slice(0, 3)
    .map((e) => `<td style="padding:0 8px 0 0;">${ctx.photo(e, 96, e.pet_name)}</td>`)
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr>${cells}</tr></table>`
}

// The leader with a photo, then the rest of the top five a line each.
function leaderboard(rows, ctx) {
  const [first, ...rest] = rows
  const text = `font-family:${SANS};font-size:15px;color:${BODY};`
  const card =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;"><tr>` +
    `<td width="112" valign="top">${ctx.photo(first.entry, 96, first.entry.pet_name)}</td>` +
    `<td valign="middle" style="${text}word-break:break-word;">${first.votes > 0 ? `${small('Leading')}<br>` : ''}` +
    `<span style="font-family:${SERIF};font-size:18px;">${nameLink(first.entry, ctx.link(`pet/${first.entry.id}`))}</span><br>${small(esc(first.entry.town))}` +
    `<div style="padding-top:4px;font-weight:700;color:${TEAL_DARK};">${votesText(first.votes)}</div></td></tr></table>`
  const cell = `padding:7px 0;border-top:1px solid ${RULE};${text}`
  const list = rest
    .map(
      (r) =>
        `<tr><td style="${cell}word-break:break-word;"><b style="color:${TEAL_DARK};">${r.rank}</b>&nbsp; ${nameLink(r.entry, ctx.link(`pet/${r.entry.id}`))} ${small(esc(r.entry.town))}</td>` +
        `<td align="right" style="${cell}padding-left:8px;font-weight:700;color:${TEAL_DARK};white-space:nowrap;">${fmtInt(r.votes)}</td></tr>`,
    )
    .join('')
  return (
    card +
    (list
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-bottom:1px solid ${RULE};">${list}</table>`
      : '')
  )
}

// The closest race, photos side by side.
function heroMatchup(m, ctx) {
  const side = (e, v, lead) =>
    `<td width="50%" align="center" valign="top" style="padding:0 4px;font-family:${SANS};font-size:15px;color:${BODY};">${ctx.photo(e, 120, e.pet_name, { center: true })}` +
    `<div style="padding-top:8px;">${nameLink(e, ctx.link(`pet/${e.id}`))}</div>` +
    `<div>${small(esc(e.town))}</div>` +
    (v == null ? '' : `<div style="padding-top:4px;font-weight:700;color:${lead ? TEAL_DARK : FINE};">${votesText(v)}</div>`) +
    `</td>`
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;"><tr>` +
    side(m.a, m.va, m.va >= m.vb) +
    `<td width="24" align="center" valign="top" style="padding-top:50px;font-family:${SERIF};font-size:15px;color:${FINE};">vs.</td>` +
    side(m.b, m.vb, m.vb > m.va) +
    `</tr></table>`
  )
}

// Every other matchup, one centered line each: "Biscuit 120 – 98 Pepper",
// or seeds and "vs." before voting starts. Names link only in the smaller
// rounds, and a field bigger than the Sweet 16 lists its first rows: more
// would overflow one Noptin block.
const LINKED_ROWS = 4
const MAX_ROWS = 7

function matchupList(list, ctx) {
  if (!list.length) return ''
  const cell = `padding:7px 0;border-top:1px solid ${RULE};font-family:${SANS};font-size:15px;color:${BODY};word-break:break-word;`
  const linked = list.length <= LINKED_ROWS
  const who = (e, seeded) =>
    `${seeded && e.seed ? `${small(`(${e.seed})`)} ` : ''}${linked ? nameLink(e, ctx.link(`pet/${e.id}`)) : `<b>${esc(e.pet_name)}</b>`}`
  const score = (v, lead) => `<b style="color:${lead ? TEAL_DARK : FINE};">${fmtInt(v)}</b>`
  const shown = list.length > MAX_ROWS ? MAX_ROWS - 1 : list.length
  const rows = list.slice(0, shown).map((m) => {
    const mid = m.va == null ? ' vs. ' : ` ${score(m.va, m.va >= m.vb)}&nbsp;&ndash;&nbsp;${score(m.vb, m.vb > m.va)} `
    return `<tr><td align="center" style="${cell}">${who(m.a, m.va == null)}${mid}${who(m.b, m.va == null)}</td></tr>`
  })
  if (shown < list.length)
    rows.push(`<tr><td align="center" style="${cell}">${small(`And ${list.length - shown} more on the bracket page`)}</td></tr>`)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-bottom:1px solid ${RULE};">${rows.join('')}</table>`
}

function championPhoto(entry, ctx) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr><td>${ctx.photo(entry, 200, entry.pet_name)}</td></tr></table>`
}

const future = (v, now) => v && ms(v) > now
const ENDS = ' Totals reset every round, so every pet started this one at zero.'

// Each phase: kicker, headline, body (HTML), visual (HTML), button, and
// whether it shows vote counts (and so needs a timestamp).
const PHASES = {
  coming: ({ contest }) => ({
    kicker: 'Entries open soon',
    headline: 'Is your pet the cutest in Marathon County?',
    body: esc(
      `Entries open ${period(apDateTime(contest.submissions_open_at))} Entering is free, and every vote pack sold helps local animal shelters.`,
    ),
    cta: ['See the rules', 'rules'],
  }),

  submissions: ({ contest, stats, recent }, ctx) => {
    const n = stats?.entries || 0
    return {
      kicker: 'Entries open',
      headline: 'Is your pet the cutest in Marathon County?',
      body: esc(
        `Entering is free, and every vote pack sold helps local animal shelters. ` +
          `${n ? `${plural(n, 'pet is', 'pets are')} in so far. ` : ''}` +
          `Entries close ${period(apDateTime(contest.submissions_close_at))}`,
      ),
      visual: strip(recent, ctx),
      cta: ['Enter your pet', 'enter'],
    }
  },

  submissions_closed: ({ stats, nextRound, recent, now }, ctx) => {
    const n = stats?.entries || 0
    const opens = future(nextRound?.opens_at, now) ? `Voting opens ${period(apDateTime(nextRound.opens_at))}` : 'Voting opens soon.'
    return {
      kicker: 'Entries closed',
      headline: 'Voting starts soon',
      body: esc(`Entries are closed${n ? `, with ${plural(n, 'pet')} in the running` : ''}. ${opens}`),
      visual: strip(recent, ctx),
      cta: ['Meet the field', 'gallery'],
    }
  },

  voting: (m, ctx) => (m.round.seq === 1 ? openRound(m, ctx, false) : bracketRound(m, ctx, false)),
  counting: (m, ctx) => (m.round.seq === 1 ? openRound(m, ctx, true) : bracketRound(m, ctx, true)),

  intermission: ({ contest, nextRound, matchups = [], now }, ctx) => {
    const label = nextRound ? roundLabel(nextRound.seq, contest.bracket_size) : 'next round'
    const opens = future(nextRound?.opens_at, now) ? `Voting opens ${period(apDateTime(nextRound.opens_at))}` : 'Voting opens soon.'
    return {
      kicker: nextRound ? label : 'Between rounds',
      headline: matchups.length ? `The ${label} is set` : `The ${label} starts soon`,
      body: esc(`${opens} Every total starts over at zero.`),
      visual: matchupList(matchups, ctx),
      cta: ['See the bracket', 'bracket'],
    }
  },

  complete: ({ contest, champion, stats }, ctx) => {
    const c = champion
    if (!c?.winner) return null
    const score = c.runnerUp
      ? c.vw > c.vr
        ? `, ${fmtInt(c.vw)}-${fmtInt(c.vr)} over ${c.runnerUp.pet_name}`
        : ` over ${c.runnerUp.pet_name}`
      : ''
    const raised =
      stats?.shelter_cents > 0
        ? ` Readers raised ${fmtMoney(stats.shelter_cents, { whole: true })} for local animal shelters. Thank you.`
        : ''
    return {
      kicker: `The ${contest.year} champion`,
      headline: `Meet the ${contest.year} champion: ${c.winner.pet_name}`,
      body: esc(`${c.winner.pet_name} of ${c.winner.town} won the Championship${score}.${raised}`),
      visual: championPhoto(c.winner, ctx),
      cta: ['See the results', 'results'],
      raisedInBody: true,
    }
  },
}

function openRound({ contest, round, leaders = [] }, ctx, counting) {
  const next = roundLabel(2, contest.bracket_size)
  const lead = leaders[0]
  let headline = 'Voting is open'
  if (counting) headline = 'Voting has closed in the Open Round'
  else if (lead?.votes > 0) headline = `${lead.entry.pet_name} leads the Open Round`
  const body = counting
    ? `The final count is underway, and the ${next} is announced shortly. These standings are unofficial.`
    : `Voting closes ${period(apDateTime(round.closes_at))} The top ${contest.bracket_size} make the ${next}, where every total starts over at zero.`
  return {
    kicker: 'Open Round',
    headline,
    body: esc(body),
    visual: leaders.length ? leaderboard(leaders, ctx) : '',
    cta: counting ? ['See the standings', 'gallery'] : ['See every pet and vote', 'gallery'],
    counts: leaders.length > 0,
  }
}

function bracketRound({ contest, round, matchups = [], hero = null }, ctx, counting) {
  const label = roundLabel(round.seq, contest.bracket_size)
  const top = hero == null ? null : matchups[hero]
  const rest = matchups.filter((_, i) => i !== hero)
  let headline = `The ${label} is on`
  if (counting) headline = `Voting has closed in the ${label}`
  else if (top) {
    const gap = Math.abs(top.va - top.vb)
    headline =
      gap === 0
        ? `Dead even: ${top.a.pet_name} vs. ${top.b.pet_name}`
        : `${top.a.pet_name} and ${top.b.pet_name} are ${gap === 1 ? 'one vote' : `${fmtInt(gap)} votes`} apart`
  }
  const body = counting
    ? 'Results are announced shortly. These totals are unofficial.'
    : `The ${label} closes ${period(apDateTime(round.closes_at))}${ENDS}`
  return {
    kicker: label,
    headline,
    body: esc(body),
    visual: (top ? heroMatchup(top, ctx) : '') + matchupList(rest, ctx),
    cta: counting ? ['See the bracket', 'bracket'] : [`Vote in the ${label}`, 'bracket'],
    counts: matchups.length > 0,
  }
}

// The whole block: Noptin's wrapper (wpr-newsletter's _wrap_block) around a
// section head, the phase's content, a button and the fine print. Null when
// the contest has nothing public to show.
export function buildNewsletterBlock(model, { base, campaign = '', sponsor = null } = {}) {
  const ctx = {
    link: (route) => contestLink(base, route, campaign),
    photo: (entry, size, alt = '', opts) => photoBox(model.photos?.get(entry.id), size, alt, opts),
  }
  const now = model.now ?? Date.now()
  const part = PHASES[model.phase]?.({ ...model, now }, ctx)
  if (!part) return null

  const bonus = model.phase === 'voting' ? bonusLine(model.windows, now) : null
  const fine = []
  if (part.counts) fine.push(`Standings as of ${apTime(now)} ${apDate(now)}`)
  if (!part.raisedInBody && model.stats?.shelter_cents > 0) {
    fine.push(`${fmtMoney(model.stats.shelter_cents, { whole: true })} raised for local animal shelters so far`)
  }
  if (sponsor?.name) {
    const name = esc(sponsor.name)
    fine.push(
      `Presented by ${sponsor.url ? `<a href="${esc(sponsorLink(sponsor.url))}" rel="sponsored" style="color:${FINE};font-weight:700;">${name}</a>` : `<b>${name}</b>`}`,
    )
  }

  const rows = [
    `<tr><td class="px" style="padding:22px 32px 0;"><hr style="border:none;border-top:2px solid ${TEAL};margin:0;"></td></tr>`,
    `<tr><td class="px oswald" style="padding:10px 32px 0;font-family:${OSWALD};font-size:15px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${INK};">${esc(model.contest.name)}</td></tr>`,
    `<tr><td class="px" style="padding:12px 32px 24px;">` +
      `<div class="oswald" style="font-family:${OSWALD};font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${TEAL_DARK};padding-bottom:6px;">${esc(part.kicker)}</div>` +
      `<div class="headline" style="font-family:${SERIF};font-size:20px;font-weight:700;color:${INK};line-height:1.3;padding-bottom:8px;">${esc(part.headline)}</div>` +
      `<div class="body" style="font-family:${SANS};font-size:15px;line-height:1.55;color:${BODY};padding-bottom:16px;">${part.body}</div>` +
      (bonus
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td bgcolor="${SUN}" style="background:${SUN};border-radius:6px;padding:10px 14px;font-family:${SANS};font-size:15px;line-height:1.45;color:${INK};">` +
          `<b>${esc(bonus.title)}</b> ${esc(bonus.span)}: every vote pack bought then counts ${esc(bonus.counts)}.${bonus.sponsor ? ` Presented by ${esc(bonus.sponsor)}.` : ''}</td></tr></table>`
        : '') +
      (part.visual || '') +
      button(part.cta[0], ctx.link(part.cta[1])) +
      (fine.length
        ? `<div class="body" style="font-family:${SANS};font-size:12px;line-height:1.6;color:${FINE};padding-top:10px;">${fine.join(' &middot; ')}</div>`
        : '') +
      `</td></tr>`,
  ]
  const inner =
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center" ` +
    `style="width:600px;max-width:100%;margin:0 auto;background:#ffffff;border-collapse:collapse;"><tbody>${rows.join('')}</tbody></table>`
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">` +
    `<tr><td align="center">${inner}</td></tr></table>`
  )
}
