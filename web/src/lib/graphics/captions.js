// The words that go with each Social desk image, written from the same facts
// the image was drawn from. Pure: no DOM, no network.
//
// The caption-writer rules, applied:
//   * the hook is the first line and fits the platform's fold (Facebook shows
//     about 80 characters before "See more", Instagram about 125);
//   * one call to action, matched to the post's job;
//   * links where they are clickable (Facebook, X, Threads); "link in bio" on
//     Instagram, where they are not; a few local hashtags on Instagram only.
// And the contest's own: vote packs are never donations, totals reset every
// round, nothing names an owner, nothing invents urgency.
import { NEWSROOM } from '../../config.js'
import { apCount, apDateTime, apTime, fmtInt, fmtMoney, plural } from '../format.js'
import { sprintTitle, sprintWhen } from '../sprints.js'
import { isUpset } from '../rank.js'

export const FOLD = { facebook: 80, instagram: 125 }
// The newsroom's places as hashtags: "#Wausau #MarathonCounty #Wisconsin".
const tag = (s) => `#${String(s).replace(/^the /i, '').replace(/[^A-Za-z0-9]/g, '')}`
const TAGS = (NEWSROOM.hashtags || [NEWSROOM.city, NEWSROOM.region, NEWSROOM.state]).map(tag).join(' ')

const petName = (s) => s?.entry?.pet_name || 'TBD'
const seeded = (s) => (s?.seed != null ? `No. ${s.seed} ${petName(s)}` : petName(s))
const score = (a, b) => `${fmtInt(a)}–${fmtInt(b)}`

export function joinNames(names) {
  const list = names.filter(Boolean)
  if (list.length <= 1) return list[0] || ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

// card.meta -> { hook, body, cta, path } for one post.
const WRITERS = {
  sprint({ sprint, state, top }) {
    const leader = top?.[0]
    if (state === 'live') {
      return {
        hook: `The ${sprintTitle(sprint).toLowerCase() === 'sprint' ? 'sprint' : sprintTitle(sprint)} is on: the most votes by ${apTime(sprint.ends_at)} wins ${sprint.prize}.`,
        body: `${leader ? `${petName(leader)} leads with ${plural(leader.votes, 'vote')}. ` : ''}The prize is from ${sprint.sponsor_name}, and sprint votes count toward the round like any other.`,
        cta: 'Vote now:',
        path: 'gallery',
      }
    }
    return {
      hook: `Sprint: the most votes from ${sprintWhen(sprint)} wins ${sprint.prize}.`,
      body: `The prize is from ${sprint.sponsor_name}. Sprint votes count toward the round like any other, so pick your pet and mark the time.`,
      cta: 'Pick your pet:',
      path: 'gallery',
    }
  },

  sprintWinner({ sprint, winner }) {
    return {
      hook: `${petName(winner)} won the ${sprintTitle(sprint).toLowerCase() === 'sprint' ? 'sprint' : sprintTitle(sprint)} and ${sprint.prize}!`,
      body: `${plural(winner.votes, 'vote')}, ${sprintWhen(sprint)}. Thank you to ${sprint.sponsor_name} and to everyone who voted.`,
      cta: `See ${petName(winner)}:`,
      path: `pet/${winner.entry.id}`,
    }
  },

  lastchance({ rows, closesAt, o }) {
    const leader = rows[0]
    if (!leader) return null
    return {
      hook: `Last Chance: ${apCount(rows.length, 'pet')} race for the last spot in the bracket.`,
      body: `${petName(leader)} leads with ${plural(leader.votes, 'vote')}. Open Round votes carry over, the most votes takes seed ${o.bracketSize}, and voting closes ${apDateTime(closesAt)}.`,
      cta: 'Vote:',
      path: 'gallery',
    }
  },

  finale({ at, finalists }) {
    return {
      hook: `The champion is revealed live ${apDateTime(at)}.`,
      body: finalists ? `It's ${seeded(finalists[0])} against ${seeded(finalists[1])} in the Championship. Totals reset for the final, so it's anyone's.` : 'The Championship decides it, and every total starts at zero.',
      cta: 'The countdown and where to watch:',
      path: '',
    }
  },

  leaderboard({ ranked, round, final, o }) {
    const top = ranked[0]
    if (!top) return null
    if (final) {
      return {
        hook: `The Open Round is over, and ${petName(top)} finished first.`,
        body: `The top ${o.bracketSize} move on to the head-to-head bracket, where every total starts back at zero.`,
        cta: 'See the bracket:',
        path: 'bracket',
      }
    }
    return {
      hook: `${petName(top)} leads the Open Round with ${plural(top.votes, 'vote')}.`,
      body: `The top ${o.bracketSize} when voting closes ${apDateTime(round.closes_at)} make the bracket. Totals reset every round, so the bracket is anyone's.`,
      cta: 'Vote for your favorite:',
      path: 'gallery',
    }
  },

  bubble({ rows, cut, round }) {
    const out = rows.find((r) => !r.inside)
    const lastIn = [...rows].reverse().find((r) => r.inside)
    if (!out) return null
    return {
      hook: `${petName(out)} is ${out.note}.`,
      body: `The top ${cut} when the Open Round closes ${apDateTime(round.closes_at)} make the bracket.${lastIn ? ` ${petName(lastIn)} holds the last spot for now.` : ''}`,
      cta: 'Pick who gets in:',
      path: 'gallery',
    }
  },

  matchup({ st, round, label }) {
    const lead = st.leader === 'a' ? st.a : st.b
    const trail = st.leader === 'a' ? st.b : st.a
    if (round.status === 'pending') {
      return {
        hook: `${seeded(st.a)} vs. ${seeded(st.b)}: the ${label} starts ${apDateTime(round.opens_at)}.`,
        body: 'Both pets start at zero.',
        cta: 'See the bracket:',
        path: 'bracket',
      }
    }
    if (Boolean(st.a.entry) !== Boolean(st.b.entry)) {
      const present = st.a.entry ? st.a : st.b
      return {
        hook: `${petName(present)} advances in the ${label}: its opponent is out of the contest.`,
        body: '',
        cta: 'See the bracket:',
        path: 'bracket',
      }
    }
    if (st.winner) {
      const w = st.winner === st.a.id ? st.a : st.b
      const l = w === st.a ? st.b : st.a
      return {
        hook: `${petName(w)} beats ${petName(l)}, ${score(w.votes, l.votes)}.`,
        body: `That decides the ${label} matchup.`,
        cta: 'See the bracket:',
        path: 'bracket',
      }
    }
    const diff = lead.votes - trail.votes
    let hook
    if (st.tied) hook = `${petName(st.a)} and ${petName(st.b)} are tied at ${fmtInt(st.a.votes)}.`
    else if (isUpset(st)) hook = `Upset alert: ${seeded(lead)} leads ${seeded(trail)}.`
    else if (diff <= Math.max(10, lead.votes * 0.05)) hook = `${petName(lead)} and ${petName(trail)} are ${plural(diff, 'vote')} apart.`
    else hook = `${petName(lead)} leads ${petName(trail)} in the ${label}.`
    return {
      hook,
      body: `Both started the ${label} at zero, and the pet with more votes when it closes ${apDateTime(round.closes_at)} moves on.`,
      cta: 'Pick a side:',
      path: 'bracket',
    }
  },

  winner({ w, results }) {
    if (!w.opponent) {
      return { hook: `${petName(w)} is through to the ${results.nextLabel}.`, body: '', cta: 'See the bracket:', path: 'bracket' }
    }
    const upset = w.seed != null && w.opponentSeed != null && w.seed > w.opponentSeed
    return {
      hook: upset
        ? `No. ${w.seed} ${petName(w)} knocked out No. ${w.opponentSeed} ${w.opponent.pet_name}.`
        : `${petName(w)} is through to the ${results.nextLabel}.`,
      body: `${petName(w)} beat ${w.opponent.pet_name} in the ${results.label}, ${score(w.votes, w.opponentVotes)}. Totals reset for the ${results.nextLabel}, so it starts from zero.`,
      cta: 'See the bracket:',
      path: 'bracket',
    }
  },

  field({ results }) {
    const names = results.winners.map((w) => w.entry?.pet_name)
    return {
      hook: `The ${results.nextLabel} is set.`,
      body: `${joinNames(names)} ${names.length === 1 ? 'is' : 'are'} through. Every matchup starts at zero.`,
      cta: 'See the matchups:',
      path: 'bracket',
    }
  },

  champion({ c, o }) {
    const town = c.entry.town ? ` of ${c.entry.town}` : ''
    const raised = o.shelterCents > 0 ? ` Together, readers raised ${fmtMoney(o.shelterCents, { whole: true })} for local animal shelters.` : ''
    return {
      hook: `${petName(c)}${town} is the ${o.year} ${o.contestName}.`,
      body: `${c.opponent ? `${petName(c)} beat ${c.opponent.pet_name} in the Championship, ${score(c.votes, c.opponentVotes)}.` : ''}${raised} Thank you for voting.`.trim(),
      cta: 'See the final bracket:',
      path: 'results',
    }
  },

  milestone({ cents, exact, shelters, o }) {
    const money = fmtMoney(cents, { whole: true })
    const pct = Number(o.splitPct) || 0
    const who = joinNames(shelters.map((s) => s.name)) || 'local animal shelters'
    return {
      hook: `${cents < exact ? 'More than ' : ''}${money} raised for local animal shelters.`,
      body: `${pct ? `${pct}% of every vote pack` : 'A share of every vote pack'} goes to ${who}.`,
      cta: o.voting ? 'Vote for your favorite:' : 'See the results:',
      path: o.voting ? 'gallery' : 'results',
    }
  },
}

// { facebook, instagram, short } for a card, or null if it has no caption.
export function captionsFor(card, { publicUrl }) {
  const m = card?.meta
  const c = m && WRITERS[m.kind]?.(m)
  if (!c) return null
  const url = `${String(publicUrl || '').replace(/#.*$/, '')}#/${c.path}`
  const body = c.body || null
  const short = [c.hook, url].join(' ')
  return {
    hook: c.hook,
    facebook: [c.hook, body, `${c.cta} ${url}`].filter(Boolean).join('\n\n'),
    instagram: [c.hook, body, `${c.cta.replace(/:$/, '')}: link in bio.`, TAGS].filter(Boolean).join('\n\n'),
    // X counts any link as 23 characters; Threads allows 500.
    short: c.hook.length + 24 <= 280 ? short : `${c.hook.slice(0, 250)}… ${url}`,
  }
}
