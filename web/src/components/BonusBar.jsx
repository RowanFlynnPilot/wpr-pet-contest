import { apDate, apTime } from '../lib/format.js'
import { multiplierWord, windowTitle } from '../lib/bonus.js'
import { track } from '../lib/analytics.js'
import { useContest } from './ContestContext.jsx'
import { InlineCountdown } from './Countdown.jsx'
import { withUtm } from './Sponsor.jsx'

function SponsorCredit({ w }) {
  if (!w.sponsor_name) return null
  return (
    <span>
      Presented by{' '}
      {w.sponsor_url ? (
        <a
          href={withUtm(w.sponsor_url)}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => track('Sponsor Click', { sponsor: w.sponsor_name, slot: 'bonus-window' })}
        >
          {w.sponsor_name}
        </a>
      ) : (
        <b>{w.sponsor_name}</b>
      )}
    </span>
  )
}

// Site-wide strip for a live bonus window, or a teaser for one starting within
// a day. Only while a round is open: a bonus with nothing to vote on is noise.
export default function BonusBar() {
  const { bonus, upcomingBonus, phase, round } = useContest()
  const votingSoon = phase === 'voting' || phase === 'intermission' || phase === 'submissions_closed'
  if (bonus && phase === 'voting') {
    const endsFirst = round && new Date(round.closes_at) < new Date(bonus.ends_at)
    return (
      <div className="bonus-bar" role="status">
        <div className="wrap">
          <span className="bonus-badge" aria-hidden="true">
            ×{bonus.multiplier}
          </span>
          <strong>{windowTitle(bonus)}</strong>
          <span>
            Every vote pack counts {multiplierWord(bonus.multiplier).toLowerCase()}. Ends in{' '}
            <InlineCountdown to={endsFirst ? round.closes_at : bonus.ends_at} />
          </span>
          <SponsorCredit w={bonus} />
        </div>
      </div>
    )
  }
  if (upcomingBonus && votingSoon) {
    return (
      <div className="bonus-bar upcoming">
        <div className="wrap">
          <span className="bonus-badge" aria-hidden="true">
            ×{upcomingBonus.multiplier}
          </span>
          <span>
            <strong>{windowTitle(upcomingBonus)}</strong> starts {apDate(upcomingBonus.starts_at)} at {apTime(upcomingBonus.starts_at)}, in{' '}
            <InlineCountdown to={upcomingBonus.starts_at} />.
          </span>
          <SponsorCredit w={upcomingBonus} />
        </div>
      </div>
    )
  }
  return null
}
