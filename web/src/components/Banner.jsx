import { SPONSORS } from '../config.js'
import { apDate } from '../lib/format.js'
import { roundLabel } from '../lib/rounds.js'
import { useContest } from './ContestContext.jsx'

// One line for the banner: what the contest is doing right now.
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

// The contest's slim bar under WPR's flag. Every page carries its own h1
// (Home's first screen holds the big title), so this stays one line: the
// contest's name, what it is doing now, and the presenting sponsor's credit.
export default function Banner() {
  const c = useContest()
  const now = status(c)
  return (
    <div className="banner compact">
      <div className="wrap banner-row">
        <div className="banner-title">
          <a href="#/">{c.contest?.name || 'Cutest Pet in Marathon County'}</a>
        </div>
        {now && <span className="banner-status">{now}</span>}
        {SPONSORS.presenting && <span className="banner-status banner-credit">Presented by {SPONSORS.presenting.name}</span>}
      </div>
    </div>
  )
}
