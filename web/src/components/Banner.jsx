import { SPONSORS } from '../config.js'
import { apDate } from '../lib/format.js'
import { roundLabel } from '../lib/rounds.js'
import { useContest } from './ContestContext.jsx'
import Sponsor from './Sponsor.jsx'

function dek(c) {
  const split = c.contest?.beneficiary_split_pct
  const cause = split != null ? `${split}% of every vote pack goes to local animal shelters.` : 'Vote packs benefit local animal shelters.'
  switch (c.phase) {
    case 'coming':
      return `Entries open ${apDate(c.contest.submissions_open_at)}. ${cause}`
    case 'submissions':
      return `Enter your pet free through ${apDate(c.contest.submissions_close_at)}. ${cause}`
    case 'submissions_closed':
      return `Entries are closed. Voting opens soon. ${cause}`
    case 'voting':
      return `${roundLabel(c.round.seq, c.bracketSize)} voting is on. ${cause}`
    case 'counting':
      return `${roundLabel(c.round.seq, c.bracketSize)} voting has closed. Results are coming shortly. ${cause}`
    case 'intermission':
      return `${c.nextRound ? `The ${roundLabel(c.nextRound.seq, c.bracketSize)} opens soon.` : 'The next round opens soon.'} ${cause}`
    case 'complete':
      return `The ${c.contest.year} champion is crowned. Thank you for helping local shelters.`
    default:
      return 'A Wausau Pilot & Review reader contest benefiting local animal shelters.'
  }
}

// One line for the slim banner: what the contest is doing right now.
function status(c) {
  const round = c.round ? roundLabel(c.round.seq, c.bracketSize) : null
  switch (c.phase) {
    case 'coming':
      return `Entries open ${apDate(c.contest.submissions_open_at, { weekday: false })}`
    case 'submissions':
      return 'Entries open now'
    case 'submissions_closed':
      return 'Voting opens soon'
    case 'voting':
      return `${round} · voting now`
    case 'counting':
      return `${round} · final count`
    case 'intermission':
      return c.nextRound ? `${roundLabel(c.nextRound.seq, c.bracketSize)} next` : 'Next round soon'
    case 'complete':
      return `${c.contest.year} champion crowned`
    default:
      return null
  }
}

export default function Banner({ compact = false }) {
  const c = useContest()
  if (compact) {
    const now = status(c)
    return (
      <div className="banner compact">
        <div className="wrap banner-row">
          <div className="banner-title">
            <a href="#/">{c.contest?.name || 'Cutest Pet in Marathon County'}</a>
          </div>
          {now && <span className="banner-status">{now}</span>}
          {SPONSORS.presenting && <span className="banner-status">Presented by {SPONSORS.presenting.name}</span>}
        </div>
      </div>
    )
  }
  return (
    <div className="banner">
      <div className="wrap">
        {/* Not a heading: every page carries its own h1. */}
        <div className="banner-title">
          <a href="#/">{c.contest?.name || 'Cutest Pet in Marathon County'}</a>
        </div>
        <p className="banner-dek">{dek(c)}</p>
        {SPONSORS.presenting && (
          <div className="banner-sponsor">
            <Sponsor sponsor={SPONSORS.presenting} slot="presenting" full />
          </div>
        )}
      </div>
    </div>
  )
}
