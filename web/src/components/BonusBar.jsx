import { apDate, apTime, fmtMoney } from '../lib/format.js'
import { multiplierWord, windowTitle } from '../lib/bonus.js'
import { track } from '../lib/analytics.js'
import { useContest } from './ContestContext.jsx'
import { InlineCountdown } from './Countdown.jsx'
import { withUtm } from './Sponsor.jsx'

function SponsorCredit({ w }) {
  if (!w.sponsor_name) return null
  return (
    <span>
      <span className="bonus-presented">Presented </span>by{' '}
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

// The match bar's sponsor on phones, where the explanation that names it is
// hidden. (The bonus bars keep SponsorCredit, whose "by" survives there.)
function SponsorShort({ name, url, slot }) {
  if (!name) return null
  return (
    <span className="bonus-sponsor-short">
      ·{' '}
      {url ? (
        <a href={withUtm(url)} target="_blank" rel="noopener noreferrer sponsored" onClick={() => track('Sponsor Click', { sponsor: name, slot })}>
          {name}
        </a>
      ) : (
        name
      )}
    </span>
  )
}

// Site-wide strip for a live bonus window, or a teaser for one starting within
// a day. Only while a round is open: a bonus with nothing to vote on is noise.
export default function BonusBar() {
  const { bonus, upcomingBonus, match, phase, round, roundsLoaded, contest } = useContest()
  const votingSoon = phase === 'voting' || phase === 'intermission' || phase === 'submissions_closed'
  // The rounds arrive a request after the contest. Waiting for them would drop
  // the bar in after the page has painted and push everything below it down,
  // so a voting contest with a live window shows it straight away.
  const voting = phase === 'voting' || (!roundsLoaded && contest?.status === 'voting')
  if (bonus && voting) {
    const endsFirst = round && new Date(round.closes_at) < new Date(bonus.ends_at)
    return (
      <div className="bonus-bar" role="status">
        <div className="wrap">
          <span className="bonus-badge" aria-hidden="true">
            ×{bonus.multiplier}
          </span>
          <strong>{windowTitle(bonus)}</strong>
          <span>
            <span className="bonus-explain">Every vote pack counts {multiplierWord(bonus.multiplier).toLowerCase()}. </span>
            <span className="bonus-ends">Ends in </span>
            <InlineCountdown to={endsFirst ? round.closes_at : bonus.ends_at} />
          </span>
          <SponsorCredit w={bonus} />
        </div>
      </div>
    )
  }
  // A sponsor match: new money for the shelters, the count unchanged. The
  // badge says the ratio, not a multiplier, so nobody reads it as more votes.
  if (match && voting) {
    const endsFirst = round && new Date(round.closes_at) < new Date(match.ends_at)
    const ratio = Number(match.ratio)
    // "Match hour" only when it is one; a sponsor may match a whole evening.
    const hours = (new Date(match.ends_at) - new Date(match.starts_at)) / 3600000
    return (
      <div className="bonus-bar match" role="status">
        <div className="wrap">
          <span className="bonus-badge" aria-hidden="true">
            {ratio >= 1 ? `${ratio % 1 ? ratio : Math.round(ratio)}:1` : `${Math.round(ratio * 100)}¢`}
          </span>
          <strong>{hours <= 1.5 ? 'Match hour' : 'Sponsor match'}</strong>
          <SponsorShort name={match.sponsor_name} url={match.sponsor_url} slot="match" />
          <span>
            <span className="bonus-explain">
              {match.sponsor_url ? (
                <a
                  href={withUtm(match.sponsor_url)}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  onClick={() => track('Sponsor Click', { sponsor: match.sponsor_name, slot: 'match' })}
                >
                  {match.sponsor_name}
                </a>
              ) : (
                <b>{match.sponsor_name}</b>
              )}{' '}
              matches every vote pack for the shelters, up to {fmtMoney(match.cap_cents, { whole: true })}.{' '}
            </span>
            <span className="bonus-ends">Ends in </span>
            <InlineCountdown to={endsFirst ? round.closes_at : match.ends_at} />
          </span>
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
