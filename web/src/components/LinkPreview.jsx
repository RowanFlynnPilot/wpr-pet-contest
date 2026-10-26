import { useState } from 'react'
import { NEWSROOM } from '../config.js'
import { PUBLIC_URL } from '../lib/env.js'
import { entryPhotoUrl } from '../lib/photos.js'
import { useSharePage } from './ShareTools.jsx'
import { packShareLine } from '../lib/format.js'
import { useContest } from './ContestContext.jsx'

const SPECIES = { dog: 'dog', cat: 'cat', other: 'pet' }

function host(url) {
  try {
    return new URL(url, window.location.href).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// What a friend sees when the link lands in Messenger or a feed: the share
// page's picture, the site, its title and its description, in the words
// scripts/build-share-pages.mjs writes. During a bracket round the picture
// is the matchup card, when the deploy drew one.
export default function LinkPreview({ entry, contestName, sharePage, matchup }) {
  const page = useSharePage(sharePage)
  const [cardFailed, setCardFailed] = useState(false)
  const c = useContest()
  const kind = SPECIES[entry.species] || 'pet'
  const name = contestName || `Cutest Pet in ${NEWSROOM.region}`
  const money = packShareLine(c?.contest?.beneficiary_split_pct, c?.shelters)
  const card = page && matchup && !cardFailed ? `${page.replace(/\?.*$/, '')}card.png` : null
  const title = card ? `${matchup.a} vs. ${matchup.b}: ${matchup.round}` : `Vote for ${entry.pet_name} in the ${name} contest`
  const description = card
    ? `${matchup.a} meets ${matchup.b} in the ${matchup.round} of the ${name} contest. ${money}`
    : `${entry.pet_name}, a ${kind} from ${entry.town}, is in the running for ${name}. ${money}`
  return (
    <figure className="link-preview" aria-label="How the link looks when it is shared">
      <div className="link-preview-image">
        {card ? (
          <img src={card} alt="" loading="lazy" decoding="async" onError={() => setCardFailed(true)} />
        ) : (
          <img src={entryPhotoUrl(entry, { width: 1200 })} alt="" loading="lazy" decoding="async" />
        )}
      </div>
      <figcaption>
        <span className="link-preview-host">{host(PUBLIC_URL) || NEWSROOM.name}</span>
        <strong className="link-preview-title">{title}</strong>
        <span className="link-preview-desc">{description}</span>
      </figcaption>
    </figure>
  )
}
