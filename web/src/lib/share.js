// Share links. Readers land on the WordPress page (publicUrl), which forwards
// its hash into the iframe. Facebook and X get the per-pet share page instead,
// because a crawler cannot run the app to find the pet's photo.
import { NEWSROOM } from '../config.js'
import { apDate } from './format.js'

const stripHash = (u) => String(u || '').replace(/#.*$/, '')

// What an owner posts the day they enter, before there is a page to link:
// the pet, the contest, when voting opens, and the contest's front door.
export function entryShareLine({ petName, contestName, opensAt, url }) {
  const when = opensAt ? ` Voting opens ${apDate(opensAt)} and I'll post the link then.` : " I'll post the link when voting opens."
  return `${petName} is entered in ${contestName}!${when}${url ? ` ${url}` : ''}`.trim()
}

// An owner's own links carry ?via=o (the owner panel's posts and share
// buttons, the owner's share images, the owner's emails), so a pack bought
// by someone who arrived that way counts toward "your link brought N packs"
// (entry_referrals, 0029). Attribution only: it never changes a vote.
export function ownerLink(url) {
  if (!url) return url
  const i = url.indexOf('#')
  if (i >= 0) {
    const hash = url.slice(i + 1)
    return `${url.slice(0, i)}#${hash}${hash.includes('?') ? '&' : '?'}via=o`
  }
  return `${url}${url.includes('?') ? '&' : '?'}via=o`
}

export function petPublicUrl(publicUrl, id) {
  return `${stripHash(publicUrl)}#/pet/${id}`
}

export function sharePageUrl(appBase, path) {
  const base = stripHash(appBase).replace(/\/?$/, '/')
  return `${base}${path}`
}

export const petSharePageUrl = (appBase, id) => sharePageUrl(appBase, `p/${id}/`)

// A matchup's share page carries both pets on its card, and a new address
// each round, since social sites cache previews.
export const matchupSharePageUrl = (appBase, id) => sharePageUrl(appBase, `m/${id}/`)

export function shareText(petName, contestName = `Cutest Pet in ${NEWSROOM.region}`) {
  return `Vote for ${petName} in the ${contestName} contest! Every vote pack helps local animal shelters.`
}

export function shareLinks({ url, crawlerUrl = url, text, subject }) {
  const u = encodeURIComponent
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u(crawlerUrl)}`,
    x: `https://x.com/intent/tweet?text=${u(text)}&url=${u(crawlerUrl)}`,
    // "?&body=" is the form both iOS and Android Messages accept.
    sms: `sms:?&body=${u(`${text} ${url}`)}`,
    email: `mailto:?subject=${u(subject || text)}&body=${u(`${text}\n\n${url}`)}`,
  }
}
