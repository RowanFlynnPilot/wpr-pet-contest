// Ready-made posts for an owner to copy from their panel: Facebook,
// Instagram and a text message, written for where the pet stands right now.
// Pure: no DOM, no network.
//
// The caption-writer rules, as on the Social desk: the hook first, one call
// to action, links where they are clickable (Facebook, a text) and "link in
// bio" where they are not (Instagram, with the local hashtags). And the
// contest's own: a vote pack is never a donation, totals reset every round,
// nothing invents urgency. Readers' choice programs hand nominees exactly
// this kind of kit; owners sharing their own pet is what sells votes.
import { NEWSROOM } from '../config.js'
import { clubLabel } from './milestones.js'
import { period } from './format.js'

const tag = (s) => `#${String(s).replace(/^the /i, '').replace(/[^A-Za-z0-9]/g, '')}`
const TAGS = (NEWSROOM.hashtags || [NEWSROOM.city, NEWSROOM.region, NEWSROOM.state]).filter(Boolean).map(tag).join(' ')

function shelterLine(split, short = false) {
  if (split === 50) return short ? 'half of every vote pack helps local shelters' : 'Half of every vote pack goes to local animal shelters.'
  if (split != null) return short ? `${split}% of every vote pack helps local shelters` : `${split}% of every vote pack goes to local animal shelters.`
  return short ? 'every vote pack helps local shelters' : 'Every vote pack helps local animal shelters.'
}

// o: {
//   stage:   'before' | 'open' | 'lastchance' | 'qualified' | 'matchup' | 'unseeded' | 'out' | 'champion'
//   name, contest, url, split, bracketSize,
//   closes, opens   (AP phrases, e.g. "Friday, Nov. 27 at 8 p.m.")
//   round, opponent (for a matchup, or the round a pet went out in)
//   club            (highest milestone club, or null)
//   raised          (dollars raised, as text, after the contest)
// }
export function ownerPosts(o) {
  const { name, contest, url } = o
  const share = shelterLine(o.split)
  const shareShort = shelterLine(o.split, true)
  const club = o.club ? clubLabel(o.club) : null
  const raised = o.raised ? `Together, voters raised ${o.raised} for local animal shelters.` : ''
  let facebook, instagram, text
  switch (o.stage) {
    case 'before':
      facebook = `${name} is entered in ${contest}! Voting opens ${period(o.opens)} ${share} Meet ${name}: ${url}`
      instagram = `${name} is entered in ${contest} 🐾 Voting opens ${period(o.opens)} ${share} Link in bio. ${TAGS}`
      text = `${name} is in ${contest}! Voting opens ${period(o.opens)} ${url}`
      break
    case 'matchup':
      facebook = `${name} made the ${o.round} and is head to head with ${o.opponent} until ${period(o.closes)} Every matchup starts at zero, so every vote counts. ${share} Vote for ${name}: ${url}`
      instagram = `${name} made the ${o.round} 🐾 It's ${name} against ${o.opponent} until ${o.closes}, and every matchup starts at zero. ${share} Link in bio. ${TAGS}`
      text = `${name} is up against ${o.opponent} in the ${o.round}! Voting closes ${o.closes}, and ${shareShort}. ${url}`
      break
    case 'lastchance':
      // Last Chance (lib/lastChance.js): just below the line, racing for the last seed.
      facebook = `Last Chance! ${name} finished just below the bracket line in ${contest} and has until ${o.closes} to win the last spot. Open Round votes carry over, and the most votes wins. ${share} Vote for ${name}: ${url}`
      instagram = `Last Chance for ${name} 🐾 Just below the bracket line, with until ${o.closes} to win the last spot. ${share} Link in bio. ${TAGS}`
      text = `${name} is in Last Chance for the bracket, until ${o.closes}! The most votes wins the last spot, and ${shareShort}. ${url}`
      break
    case 'qualified':
      // In the bracket, waiting for it to start.
      facebook = `${name} made the bracket in ${contest}! Thank you to everyone who voted. The bracket starts soon, and every matchup starts at zero. ${url}`
      instagram = `${name} made the bracket 🐾 Thank you to everyone who voted. Every matchup starts at zero. ${TAGS}`
      text = `${name} made the bracket! Thank you for voting. ${url}`
      break
    case 'unseeded':
      facebook = `Thank you to everyone who voted for ${name} in ${contest}!${club ? ` ${name} joined the ${club}.` : ''} ${raised}`.trim()
      instagram = `Thank you to everyone who voted for ${name} 🐾${club ? ` ${name} joined the ${club}.` : ''} ${raised} ${TAGS}`.replace(/\s+/g, ' ').trim()
      text = `Thank you for voting for ${name}!${club ? ` ${name} joined the ${club}.` : ''}`
      break
    case 'out':
      facebook = `Thank you to everyone who voted for ${name}! ${name} made the ${o.round}${club ? ` and joined the ${club}` : ''}. ${raised}`.trim()
      instagram = `Thank you to everyone who voted for ${name} 🐾 ${name} made the ${o.round}${club ? ` and joined the ${club}` : ''}. ${raised} ${TAGS}`.replace(/\s+/g, ' ').trim()
      text = `Thank you for voting for ${name}! ${name} made the ${o.round}.`
      break
    case 'champion':
      facebook = `${name} is the ${contest} champion! Thank you to everyone who voted. ${raised} ${url}`.replace(/\s+/g, ' ').trim()
      instagram = `${name} is the ${contest} champion 👑 Thank you to everyone who voted. ${raised} ${TAGS}`.replace(/\s+/g, ' ').trim()
      text = `${name} won ${contest}! Thank you for voting. ${url}`
      break
    default:
      // The Open Round, or any round this pet is in without a matchup yet.
      facebook = `Vote for ${name} in ${contest}! The top ${o.bracketSize} make the bracket, and voting closes ${period(o.closes)} ${share} ${url}`
      instagram = `${name} is in the running for ${contest} 🐾 The top ${o.bracketSize} make the bracket, and voting closes ${period(o.closes)} ${share} Link in bio. ${TAGS}`
      text = `Would you vote for ${name}? It's ${contest}, and ${shareShort}. Voting closes ${period(o.closes)} ${url}`
  }
  return { facebook, instagram, text }
}
