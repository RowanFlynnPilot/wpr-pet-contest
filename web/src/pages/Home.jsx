import { useMemo } from 'react'
import { SPONSORS } from '../config.js'
import { useContest } from '../components/ContestContext.jsx'
import { useBracket, useEntries, useRoundTotals } from '../lib/data.js'
import { apDate, apDateTime, fmtInt, fmtMoney, period } from '../lib/format.js'
import { cheapestPerVote } from '../lib/packs.js'
import { useDocumentTitle } from '../lib/hooks.js'
import { rankOpenRound } from '../lib/rank.js'
import { roundLabel } from '../lib/rounds.js'
import Countdown from '../components/Countdown.jsx'
import RaisedCounter from '../components/RaisedCounter.jsx'
import HowItWorks from '../components/HowItWorks.jsx'
import Leaderboard from '../components/Leaderboard.jsx'
import ActivityTicker from '../components/ActivityTicker.jsx'
import MatchupCard from '../components/MatchupCard.jsx'
import PetCard from '../components/PetCard.jsx'
import PetPhoto from '../components/PetPhoto.jsx'
import Sponsor from '../components/Sponsor.jsx'
import { ShelterList } from './Shelters.jsx'
import Results from './Results.jsx'

function Polaroids({ entries }) {
  if (!entries.length) return null
  return (
    <div className="polaroids" aria-hidden="true">
      {entries.slice(0, 3).map((e) => (
        <a className="polaroid" href={`#/pet/${e.id}`} key={e.id} tabIndex={-1}>
          <span className="tape" />
          <PetPhoto entry={e} width={500} square eager alt="" />
          <span className="cap">{e.pet_name}</span>
        </a>
      ))}
    </div>
  )
}

function Hero({ c, featured, entryCount }) {
  const { phase, contest, round, nextRound, bracketSize } = c
  const label = round ? roundLabel(round.seq, bracketSize) : null
  let kicker, title, lede, actions, clock

  if (phase === 'coming') {
    kicker = `Entries open ${apDate(contest.submissions_open_at)}`
    title = (
      <>
        Is your pet the <em>cutest</em> in Marathon County?
      </>
    )
    lede = 'Get your best photo ready. Entry is free, and every vote pack helps local animal shelters.'
    actions = (
      <a className="btn btn-ghost btn-lg" href="#/rules">
        Read the rules
      </a>
    )
    clock = <Countdown to={contest.submissions_open_at} label="Entries open in" />
  } else if (phase === 'submissions') {
    kicker = `Free to enter · ${fmtInt(entryCount)} ${entryCount === 1 ? 'pet' : 'pets'} so far`
    title = (
      <>
        Is your pet the <em>cutest</em> in Marathon County?
      </>
    )
    lede = `Enter a photo free. Then readers vote with vote packs, and ${contest.beneficiary_split_pct}% of every pack goes to local animal shelters.`
    actions = (
      <>
        <a className="btn btn-primary btn-lg" href="#/enter">
          Enter your pet
        </a>
        <a className="btn btn-ghost btn-lg" href="#/gallery">
          Meet the entrants
        </a>
      </>
    )
    clock = <Countdown to={contest.submissions_close_at} label="Entries close in" />
  } else if (phase === 'submissions_closed') {
    kicker = 'Entries are closed'
    title = 'The field is set.'
    lede = `${fmtInt(entryCount)} pets are in. Voting opens soon, so pick your favorite now.`
    actions = (
      <a className="btn btn-primary btn-lg" href="#/gallery">
        Meet the entrants
      </a>
    )
  } else if (phase === 'voting' && round.kind === 'open') {
    kicker = `${label} · voting now`
    title = (
      <>
        Vote for the <em>cutest</em> pet in Marathon County
      </>
    )
    lede = `Every pet is in the running. The top ${bracketSize} when the ${label} closes make the bracket, seeded by votes.`
    actions = (
      <>
        <a className="btn btn-primary btn-lg" href="#/gallery">
          Vote now
        </a>
        <a className="btn btn-ghost btn-lg" href="#/bracket">
          Projected bracket
        </a>
      </>
    )
    clock = <Countdown to={round.closes_at} label={`${label} closes in`} />
  } else if (phase === 'voting') {
    kicker = `${label} · voting now`
    title = <>The {label} is on.</>
    lede = 'Head to head, and every matchup started at zero. The pet with more votes when the clock runs out moves on.'
    actions = (
      <a className="btn btn-primary btn-lg" href="#/bracket">
        Vote in the {label}
      </a>
    )
    clock = <Countdown to={round.closes_at} label={`${label} closes in`} />
  } else if (phase === 'counting') {
    kicker = `${label} · voting closed`
    title = 'The votes are in.'
    lede = `Voting for the ${label} has closed. Results are finalized shortly after the deadline.`
    actions = (
      <a className="btn btn-primary btn-lg" href="#/bracket">
        See the bracket
      </a>
    )
  } else {
    const next = nextRound ? roundLabel(nextRound.seq, bracketSize) : 'next round'
    kicker = 'Between rounds'
    title = <>The {next} is next.</>
    lede = nextRound
      ? `${period(`Scheduled to open ${apDateTime(nextRound.opens_at)}`)} Totals start from zero.`
      : 'The next round opens soon. Totals start from zero.'
    actions = (
      <a className="btn btn-primary btn-lg" href="#/bracket">
        See the matchups
      </a>
    )
  }

  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div>
          <p className="kicker">{kicker}</p>
          <h1>{title}</h1>
          <p className="hero-lede">{lede}</p>
          {clock}
          <div className="hero-actions">{actions}</div>
        </div>
        <Polaroids entries={featured} />
      </div>
    </section>
  )
}

function PackCard({ c }) {
  if (!c.packs.length) return null
  const low = cheapestPerVote(c.packs)
  const from = Math.min(...c.packs.map((p) => p.cents))
  return (
    <div className="card sun">
      <h3>Every vote helps a shelter</h3>
      <p className="small" style={{ margin: '0 0 12px' }}>
        Vote packs from {fmtMoney(from)}, down to {low} a vote in bulk. {c.contest.beneficiary_split_pct}% of every pack goes to local animal
        shelters. Not tax-deductible.
      </p>
      <a className="btn btn-primary" href="#/gallery">
        Pick a pet to vote for
      </a>
    </div>
  )
}

function OpenRoundPreview({ c, entries, byId }) {
  const { totals } = useRoundTotals(c.round.id)
  const ranked = useMemo(() => rankOpenRound(entries, totals), [entries, totals])
  return (
    <section className="section" aria-labelledby="lb-title">
      <div className="section-head">
        <div>
          <p className="kicker">Live leaderboard</p>
          <h2 id="lb-title">Who&rsquo;s in the top {c.bracketSize}</h2>
        </div>
        <a className="more" href="#/gallery">
          All {fmtInt(entries.length)} pets →
        </a>
      </div>
      <div className="split">
        <Leaderboard ranked={ranked} cut={c.bracketSize} bubble />
        <div className="stack">
          <ActivityTicker roundId={c.round.id} byId={byId} />
          <div className="card">
            <h3>Totals reset after this round</h3>
            <p className="small" style={{ margin: 0 }}>
              Open Round votes decide who makes the bracket and each pet&rsquo;s seed. When the {roundLabel(2, c.bracketSize)} starts,
              everyone is back to zero.
            </p>
          </div>
          <PackCard c={c} />
        </div>
      </div>
    </section>
  )
}

function BracketPreview({ c, byId, round }) {
  const { matchups, totalsByRound } = useBracket(c.rounds, { openRoundId: c.phase === 'voting' ? c.round?.id : null })
  const current = matchups.filter((m) => m.round_id === round.id)
  const label = roundLabel(round.seq, c.bracketSize)
  return (
    <section className="section" aria-labelledby="bp-title">
      <div className="section-head">
        <div>
          <p className="kicker">{c.phase === 'voting' ? 'Live now' : c.phase === 'intermission' ? 'Up next' : 'Voting closed'}</p>
          <h2 id="bp-title">The {label}</h2>
        </div>
        <a className="more" href="#/bracket">
          Full bracket →
        </a>
      </div>
      {c.phase === 'voting' && (
        <div style={{ marginBottom: 14 }}>
          <ActivityTicker roundId={c.round.id} byId={byId} />
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {current.map((m) => (
          <MatchupCard
            key={m.id}
            matchup={m}
            totals={totalsByRound.get(m.round_id)}
            byId={byId}
            round={round}
            live={c.phase === 'voting'}
          />
        ))}
      </div>
    </section>
  )
}

function Newcomers({ entries }) {
  const recent = entries.slice(-8).reverse()
  if (!recent.length) return null
  return (
    <section className="section" aria-labelledby="new-title">
      <div className="section-head">
        <div>
          <p className="kicker">Just entered</p>
          <h2 id="new-title">Meet the entrants</h2>
        </div>
        <a className="more" href="#/gallery">
          See all {fmtInt(entries.length)} →
        </a>
      </div>
      <div className="grid">
        {recent.map((e) => (
          <PetCard key={e.id} entry={e} />
        ))}
      </div>
    </section>
  )
}

export default function Home() {
  const c = useContest()
  const { entries, byId } = useEntries(c.contest?.id)
  const openRound = c.round?.kind === 'open' && ['voting', 'counting'].includes(c.phase)
  const { totals } = useRoundTotals(openRound ? c.round.id : null)
  useDocumentTitle(c.contest ? `${c.contest.name} — Wausau Pilot & Review` : 'Pet contest — Wausau Pilot & Review')

  const featured = useMemo(() => {
    if (openRound) return rankOpenRound(entries, totals).map((r) => r.entry)
    return [...entries].reverse()
  }, [entries, totals, openRound])

  if (c.loading || !c.roundsLoaded) {
    return (
      <div className="wrap section" aria-busy="true">
        <div className="skeleton" style={{ height: 48, maxWidth: 520 }} />
        <div className="skeleton" style={{ height: 22, maxWidth: 380, marginTop: 14 }} />
        <div className="skeleton" style={{ height: 160, marginTop: 28 }} />
      </div>
    )
  }
  if (!c.contest) {
    return (
      <div className="wrap section">
        <div className="card">
          <h1 style={{ fontSize: 30 }}>The next pet contest is on its way.</h1>
          <p style={{ marginTop: 10 }}>Check back soon for dates, and start picking out your best photo.</p>
        </div>
      </div>
    )
  }
  if (c.phase === 'complete') return <Results route={{ name: 'results' }} />

  const previewRound = c.phase === 'intermission' ? c.nextRound || c.round : c.round
  const bracketLive = previewRound?.kind === 'bracket' && ['voting', 'counting', 'intermission'].includes(c.phase)
  return (
    <>
      <Hero c={c} featured={featured} entryCount={entries.length} />
      <div className="wrap">
        <div className="section" style={{ paddingTop: 20 }}>
          <RaisedCounter />
        </div>
        {openRound && <OpenRoundPreview c={c} entries={entries} byId={byId} />}
        {bracketLive && <BracketPreview c={c} byId={byId} round={previewRound} />}
        {(c.phase === 'submissions' || c.phase === 'submissions_closed' || c.phase === 'coming') && <Newcomers entries={entries} />}
        <HowItWorks />
        {c.shelters.length > 0 && (
          <section className="section" aria-labelledby="sh-title">
            <div className="section-head">
              <div>
                <p className="kicker">Where the money goes</p>
                <h2 id="sh-title">Our partner shelters</h2>
              </div>
              <a className="more" href="#/shelters">
                Adopt a pet →
              </a>
            </div>
            <ShelterList shelters={c.shelters} />
          </section>
        )}
        {!SPONSORS.presenting && (
          <section className="section" aria-label="Presenting sponsor">
            <Sponsor sponsor={null} slot="presenting" />
          </section>
        )}
      </div>
    </>
  )
}
