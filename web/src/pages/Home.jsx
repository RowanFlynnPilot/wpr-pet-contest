import { useMemo } from 'react'
import { NEWSROOM, SPONSORS } from '../config.js'
import { useContest } from '../components/ContestContext.jsx'
import { useBracket, useEntries, useMomentum, useRoundTotals } from '../lib/data.js'
import { useFavorites } from '../lib/favorites.js'
import { apCount, apNumber, apWhen, fmtInt, fmtMoney } from '../lib/format.js'
import { cheapestPerVote } from '../lib/packs.js'
import { useDocumentTitle } from '../lib/hooks.js'
import { climbers, cutline, matchupStanding, rankOpenRound } from '../lib/rank.js'
import { roundLabel } from '../lib/rounds.js'
import { closestMatchup } from '../lib/widget.js'
import RaisedCounter from '../components/RaisedCounter.jsx'
import SprintCard from '../components/SprintCard.jsx'
import FinaleCard from '../components/FinaleCard.jsx'
import { finaleState } from '../lib/finale.js'
import { nextSprint } from '../lib/sprints.js'
import ComingUp from '../components/ComingUp.jsx'
import { lastChanceRanked, rankPool } from '../lib/lastChance.js'
import HowItWorks from '../components/HowItWorks.jsx'
import AdoptButton from '../components/AdoptButton.jsx'
import Leaderboard from '../components/Leaderboard.jsx'
import ActivityTicker from '../components/ActivityTicker.jsx'
import MatchupCard from '../components/MatchupCard.jsx'
import PetCard from '../components/PetCard.jsx'
import PetPhoto from '../components/PetPhoto.jsx'
import Sponsor from '../components/Sponsor.jsx'
import { FaceOff, UpsetLamp } from '../components/FaceOff.jsx'
import { CountdownCells, Digits, GameClock, Scoreboard } from '../components/Scoreboard.jsx'
import { ShelterList } from './Shelters.jsx'
import Results from './Results.jsx'
import { Arrow } from '../components/Icons.jsx'

const votesWord = (n) => (n === 1 ? 'vote' : 'votes')
const plural = (n) => `${apNumber(n)} ${votesWord(n)}`

// The taped polaroids, for the entry weeks. The first pet given sits on top.
function Polaroids({ entries }) {
  if (!entries.length) return null
  return (
    <div className="polaroids" aria-hidden="true">
      {entries
        .slice(0, 3)
        .reverse()
        .map((e) => (
          <a className="polaroid" href={`#/pet/${e.id}`} key={e.id} tabIndex={-1}>
            <span className="tape" />
            <PetPhoto entry={e} width={500} square eager alt="" />
            <span className="cap">{e.pet_name}</span>
          </a>
        ))}
    </div>
  )
}

// Entry weeks: how many pets are in, and how long is left to join them.
function EntryBoard({ c, entryCount }) {
  const { phase, contest, nextRound } = c
  if (phase === 'coming') {
    return (
      <Scoreboard label="Entries open" sub={`Opens ${apWhen(contest.submissions_open_at, c.now)}`}>
        <CountdownCells to={contest.submissions_open_at} label="Entries open in" />
        <p className="sb-note">Entry is free, and every vote pack sold helps local animal shelters.</p>
      </Scoreboard>
    )
  }
  const closed = phase === 'submissions_closed'
  const opens = nextRound?.opens_at
  return (
    <Scoreboard
      label={closed ? 'Entries closed' : 'Entries'}
      sub={closed ? (opens ? `Voting opens ${apWhen(opens, c.now)}` : 'Voting opens soon') : `Closes ${apWhen(contest.submissions_close_at, c.now)}`}
      clock={closed ? null : <GameClock to={contest.submissions_close_at} done="Closed" />}
    >
      <div className="sb-solo">
        <div className="sb-solo-count">
          <Digits value={entryCount} label={`${fmtInt(entryCount)} ${entryCount === 1 ? 'pet' : 'pets'} entered`} />
          <span className="sb-unit">
            {entryCount === 1 ? (closed ? 'pet in the field' : 'pet entered so far') : closed ? 'pets in the field' : 'pets entered so far'}
          </span>
        </div>
      </div>
      {closed && opens && (
        <div className="sb-countdown-row">
          <CountdownCells to={opens} label="Voting opens in" />
        </div>
      )}
      <p className="sb-note">
        {closed
          ? 'The field is set. Pick your favorite now; the whole field goes head to head when voting opens.'
          : `Entering is free. Then readers vote with vote packs, and ${contest.beneficiary_split_pct}% of every pack goes to local animal shelters.`}
      </p>
    </Scoreboard>
  )
}

// The Open Round: the top three on the board, and the fight at the cut line.
function OpenBoard({ c, entries, totals }) {
  const ranked = useMemo(() => rankOpenRound(entries, totals), [entries, totals])
  const label = roundLabel(c.round.seq, c.bracketSize)
  const voting = c.phase === 'voting'
  const firstOut = ranked[c.bracketSize]
  const lastIn = ranked[c.bracketSize - 1]
  const cut = firstOut ? cutline(ranked, firstOut.entry.id, c.bracketSize) : null
  return (
    <Scoreboard
      label={label}
      sub={voting ? `Closes ${apWhen(c.round.closes_at, c.now)}` : 'Voting has closed'}
      clock={<GameClock to={c.round.closes_at} done="Final count" />}
    >
      <ol className="sb-rows" aria-label={`${label} leaders`}>
        {/* Until the pets load, three rows of the same height hold the
            board's size, so nothing below it moves when they arrive. */}
        {ranked.length === 0 &&
          [0, 1, 2].map((i) => (
            <li key={i} className="sb-row sb-row-hold" aria-hidden="true">
              <span className="sb-row-rank">{i + 1}</span>
              <span className="sb-hold-bar" />
            </li>
          ))}
        {ranked.slice(0, 3).map((r) => (
          <li key={r.entry.id} className={`sb-row${r.rank === 1 ? ' lead' : ''}`}>
            <span className="sb-row-rank">{r.rank}</span>
            <a className="sb-row-id" href={`#/pet/${r.entry.id}`}>
              <span className="sb-face sm">
                <PetPhoto entry={r.entry} width={96} square alt="" />
              </span>
              <span className="sb-row-name">
                {r.entry.pet_name}
                <span className="sb-row-town">{r.entry.town}</span>
              </span>
            </a>
            <Digits value={r.votes} label={`${fmtInt(r.votes)} ${votesWord(r.votes)}`} dim={r.rank !== 1} />
          </li>
        ))}
      </ol>
      <p className="sb-note">
        {cut && lastIn
          ? `At the cut, ${firstOut.entry.pet_name} needs ${plural(cut.needed)} to pass ${lastIn.entry.pet_name} for the last spot in the top ${c.bracketSize}. `
          : ranked.length === 0
            ? <span className="sb-note-hold" aria-hidden="true">At the cut, a pet needs a few votes to pass another for the last spot in the top {c.bracketSize}. </span>
            : ''}
        {voting ? `The top ${c.bracketSize} make the bracket, where every total starts over.` : 'Results are finalized shortly after the deadline.'}
      </p>
    </Scoreboard>
  )
}

// Last Chance on the arena: the pool racing for the last seed, best first.
function LastChanceBoard({ c, byId, totals }) {
  const pool = rankPool(c.lastChance, totals, byId)
  const voting = c.phase === 'voting'
  const lead = pool[0]
  const second = pool[1]
  return (
    <Scoreboard
      label="Last Chance"
      sub={voting ? `Closes ${apWhen(c.round.closes_at, c.now)}` : 'Voting has closed'}
      clock={<GameClock to={c.round.closes_at} done="Final count" />}
    >
      <ol className="sb-rows" aria-label="Last Chance standings">
        {pool.map((r) => (
          <li key={r.id} className={`sb-row${r.rank === 1 ? ' lead' : ''}`}>
            <span className="sb-row-rank">{r.rank}</span>
            <a className="sb-row-id" href={`#/pet/${r.id}`}>
              <span className="sb-face sm">
                <PetPhoto entry={r.entry} width={96} square alt="" />
              </span>
              <span className="sb-row-name">
                {r.entry.pet_name}
                <span className="sb-row-town">{r.entry.town}</span>
              </span>
            </a>
            <Digits value={r.votes} label={`${fmtInt(r.votes)} ${votesWord(r.votes)}`} dim={r.rank !== 1} />
          </li>
        ))}
      </ol>
      <p className="sb-note">
        {lead && second ? `${second.entry.pet_name} needs ${plural(lead.votes - second.votes + 1)} to take the lead from ${lead.entry.pet_name}. ` : ''}
        {voting ? 'The most votes when Last Chance ends takes the last spot in the bracket.' : 'The bracket is set shortly after Last Chance ends.'}
      </p>
    </Scoreboard>
  )
}

// A bracket round: the closest race on the board.
function MatchBoard({ c, byId, round }) {
  const { matchups, totalsByRound } = useBracket(c.rounds, { openRoundId: c.phase === 'voting' ? c.round?.id : null })
  const totals = totalsByRound.get(round.id) || new Map()
  const current = matchups.filter((m) => m.round_id === round.id)
  const m = closestMatchup(current, totals, byId)
  const label = roundLabel(round.seq, c.bracketSize)
  const voting = c.phase === 'voting'
  if (!m) return <div className="scoreboard-skeleton skeleton" aria-busy="true" aria-label="Loading the matchups" />
  const st = matchupStanding(m, totals, byId)
  const leading = st.leader === 'a'
  const lead = leading ? st.a : st.b
  const trail = leading ? st.b : st.a
  const gap = lead.votes - trail.votes
  return (
    <Scoreboard
      label={label}
      sub={voting ? `Closes ${apWhen(round.closes_at, c.now)}` : 'Voting has closed'}
      clock={<GameClock to={round.closes_at} done="Final count" />}
      lamp={<UpsetLamp standing={st} a={st.a} b={st.b} />}
    >
      <FaceOff a={st.a} b={st.b} leading={leading} />
      <p className="sb-note">
        The closest race:{' '}
        {gap === 0
          ? `${lead.entry?.pet_name} and ${trail.entry?.pet_name} are tied.`
          : `${lead.entry?.pet_name} leads ${trail.entry?.pet_name} by ${plural(gap)}.`}{' '}
        Totals reset every round.
      </p>
    </Scoreboard>
  )
}

// Between rounds: the countdown to the next one.
function NextBoard({ c }) {
  const next = c.nextRound
  const label = next ? roundLabel(next.seq, c.bracketSize) : 'Next round'
  return (
    <Scoreboard label={label} sub={next?.opens_at ? `Opens ${apWhen(next.opens_at, c.now)}` : 'Opens soon'}>
      {next?.opens_at && <CountdownCells to={next.opens_at} label={`${label} opens in`} />}
      <p className="sb-note">The matchups are set. Every total starts over at zero.</p>
    </Scoreboard>
  )
}

function Arena({ c, entries, byId, totals }) {
  const { phase, round, nextRound, bracketSize } = c
  const label = round ? roundLabel(round.seq, bracketSize) : null
  const entering = ['coming', 'submissions', 'submissions_closed'].includes(phase)
  const openRound = round?.kind === 'open' && ['voting', 'counting'].includes(phase)
  const cutest = (
    <>
      Is your pet the <em>cutest</em> in {NEWSROOM.region}?
    </>
  )
  let title, lede, actions, board

  if (entering) {
    title = phase === 'submissions_closed' ? 'The field is set.' : cutest
    lede =
      phase === 'coming'
        ? 'Get your best photo ready.'
        : phase === 'submissions'
          ? null
          : 'Voting opens soon, so pick your favorite now.'
    actions =
      phase === 'submissions' ? (
        <>
          <a className="btn btn-primary btn-lg" href="#/enter">
            Enter your pet
          </a>
          <a className="btn btn-ghost btn-lg" href="#/gallery">
            Meet the entrants
          </a>
        </>
      ) : phase === 'coming' ? (
        <a className="btn btn-ghost btn-lg" href="#/rules">
          Read the rules
        </a>
      ) : (
        <a className="btn btn-primary btn-lg" href="#/gallery">
          Meet the entrants
        </a>
      )
    board = <EntryBoard c={c} entryCount={entries.length} />
  } else if (openRound) {
    title = (
      <>
        Vote for the <em>cutest</em> pet in {NEWSROOM.region}
      </>
    )
    lede = `Every pet is in the running. The top ${bracketSize} when the ${label} closes make the bracket, seeded by votes.`
    actions =
      phase === 'voting' ? (
        <>
          <a className="btn btn-primary btn-lg" href="#/gallery">
            Vote now
          </a>
          <a className="btn btn-ghost btn-lg" href="#/bracket">
            Projected bracket
          </a>
        </>
      ) : (
        <a className="btn btn-primary btn-lg" href="#/gallery">
          See the standings
        </a>
      )
    board = <OpenBoard c={c} entries={entries} totals={totals} />
    if (c.lastChance && c.round?.mainClosesAt) {
      title = (
        <>
          <em>Last Chance</em> for the bracket
        </>
      )
      lede = `The top ${bracketSize - 1} are in. ${apCount(c.lastChance.size, 'pet')} just below the line race for the last spot; their Open Round votes carry over.`
      board = <LastChanceBoard c={c} byId={byId} totals={totals} />
    }
  } else if (phase === 'voting' || phase === 'counting') {
    title = phase === 'voting' ? <>The {label} is on.</> : 'The votes are in.'
    lede =
      phase === 'voting'
        ? 'Head to head, and every matchup started at zero. The pet with more votes when the clock runs out moves on.'
        : `Voting for the ${label} has closed. Results are finalized shortly after the deadline.`
    actions = (
      <a className="btn btn-primary btn-lg" href="#/bracket">
        {phase === 'voting' ? `Vote in the ${label}` : 'See the bracket'}
      </a>
    )
    board = <MatchBoard c={c} byId={byId} round={round} />
  } else {
    const next = nextRound ? roundLabel(nextRound.seq, bracketSize) : 'next round'
    title = <>The {next} is next.</>
    lede = 'The matchups are set, and every pet starts the round at zero.'
    actions = (
      <a className="btn btn-primary btn-lg" href="#/bracket">
        See the matchups
      </a>
    )
    board = <NextBoard c={c} />
  }

  const featured = entering ? [...entries].reverse() : []
  return (
    <section className="home-arena">
      <div className="wrap home-grid">
        <h1 className="home-title">{title}</h1>
        <div className="home-board">{board}</div>
        <div className="hero-actions home-actions">{actions}</div>
        {lede && <p className="hero-lede home-lede">{lede}</p>}
        {entering && (
          <div className="home-polaroids">
            <Polaroids entries={featured} />
          </div>
        )}
      </div>
    </section>
  )
}

// The reader's own favorites while a round is live, kept on this device.
function FavoritesRow({ c, byId }) {
  const ids = useFavorites(c.contest.id)
  const pets = ids.map((id) => byId.get(id)).filter(Boolean)
  if (!pets.length) return null
  return (
    <section className="section fav-row" aria-labelledby="fav-title">
      <h2 id="fav-title">Your favorites</h2>
      <p className="section-count">Saved on this device only</p>
      <ul className="fav-list">
        {pets.map((e) => (
          <li key={e.id}>
            <a className="fav-pet" href={`#/pet/${e.id}`}>
              <span className="fav-face">
                <PetPhoto entry={e} width={96} square alt="" />
              </span>
              <span className="fav-name">{e.pet_name}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PackCard({ c }) {
  if (!c.packs.length) return null
  const low = cheapestPerVote(c.packs)
  const from = Math.min(...c.packs.map((p) => p.cents))
  return (
    <div className="card sun">
      <h3>Every vote pack helps a shelter</h3>
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

function OpenRoundPreview({ c, entries, byId, totals }) {
  const lc = c.round?.mainClosesAt ? c.lastChance : null
  const ranked = useMemo(() => lastChanceRanked(rankOpenRound(entries, totals), lc), [entries, totals, lc])
  const recent = useMomentum(c.round, c.now)
  const climb = useMemo(() => climbers(entries, totals, recent), [entries, totals, recent])
  return (
    <section className="section" aria-labelledby="lb-title">
      <div className="section-head">
        <div>
          <h2 id="lb-title">{lc ? 'Who gets the last spot' : <>Who&rsquo;s in the top {c.bracketSize}</>}</h2>
          <p className="section-count">{lc ? `The top ${c.bracketSize - 1} are in; Last Chance below the line` : 'Live, with the cut line marked'}</p>
        </div>
        <a className="more" href="#/gallery">
          All {fmtInt(entries.length)} pets <Arrow size={14} />
        </a>
      </div>
      <div className="split">
        <Leaderboard ranked={ranked} cut={lc ? c.bracketSize - 1 : c.bracketSize} bubble climb={lc ? null : climb} pool={lc?.pool} />
        <div className="stack">
          <ActivityTicker roundId={c.round.id} byId={byId} />
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
          <h2 id="bp-title">Every {label} matchup</h2>
          <p className="section-count">{c.phase === 'voting' ? 'Live now' : c.phase === 'intermission' ? 'Up next' : 'Voting closed'}</p>
        </div>
        <a className="more" href="#/bracket">
          Full bracket <Arrow size={14} />
        </a>
      </div>
      {c.phase === 'voting' && (
        <div style={{ marginBottom: 14 }}>
          <ActivityTicker roundId={c.round.id} byId={byId} />
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {current.map((m) => (
          <MatchupCard key={m.id} matchup={m} totals={totalsByRound.get(m.round_id)} byId={byId} round={round} live={c.phase === 'voting'} />
        ))}
      </div>
    </section>
  )
}

function Newcomers({ entries }) {
  // The hero's polaroids already show the newest three (Polaroids).
  const recent = entries.slice(0, -3).slice(-8).reverse()
  if (!recent.length) return null
  return (
    <section className="section" aria-labelledby="new-title">
      <div className="section-head">
        <div>
          <h2 id="new-title">Meet the entrants</h2>
          <p className="section-count">The newest first</p>
        </div>
        <a className="more" href="#/gallery">
          See all {fmtInt(entries.length)} <Arrow size={14} />
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
  useDocumentTitle(`${c.contest ? c.contest.name : 'Pet contest'} — ${NEWSROOM.name}`)

  if (c.roundsError) {
    return (
      <div className="wrap section">
        <div className="notice error" role="alert">
          <span>
            <strong>We can&rsquo;t reach the contest right now.</strong>
            Check your connection. This page tries again on its own.
          </span>
        </div>
      </div>
    )
  }
  if (c.loading || !c.roundsLoaded) {
    return (
      <div className="wrap section" aria-busy="true">
        <div className="skeleton" style={{ height: 48, maxWidth: 520 }} />
        <div className="scoreboard-skeleton skeleton" style={{ marginTop: 18 }} />
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
  const raised = (c.stats?.shelter_cents ?? 0) > 0
  // Favorites never sit right under the arena, where they could reach into
  // the first screen: they follow the money raised or the presenting sponsor,
  // or, before either shows, the round's preview.
  const favRow = c.phase === 'voting' && <FavoritesRow c={c} byId={byId} />
  // Things on their way share one quiet card; a big card only for what is
  // running, or the finale on its last day.
  const finale = finaleState(c.contest, c.phase, c.now)
  const finaleFull = finale && (finale.state === 'live' || (finale.state === 'soon' && Date.parse(finale.at) - c.now <= 24 * 3600e3))
  const finaleRow = finale?.state === 'soon' && !finaleFull
  const sprintPhase = ['voting', 'counting', 'intermission'].includes(c.phase)
  const sprintFull = sprintPhase && c.sprint && c.sprint.state !== 'soon'
  const upcoming = sprintPhase ? nextSprint(c.sprints, c.now) : null
  const sprintRow = upcoming && !(sprintFull && c.sprint.sprint.id === upcoming.id) ? upcoming : null
  const favEarly = raised || Boolean(SPONSORS.presenting)
  return (
    <>
      <Arena c={c} entries={entries} byId={byId} totals={totals} />
      <div className="wrap">
        {finaleFull && (
          <div className="section" style={{ paddingTop: 20, paddingBottom: 0 }}>
            <FinaleCard />
          </div>
        )}
        {sprintFull && (
          <div className="section" style={{ paddingTop: 20, paddingBottom: 0 }}>
            <SprintCard byId={byId} />
          </div>
        )}
        {(finaleRow || sprintRow) && (
          <div className="section" style={{ paddingTop: 20, paddingBottom: 0 }}>
            <ComingUp finale={finaleRow ? finale : null} sprint={sprintRow} />
          </div>
        )}
        {raised && (
          <div className="section" style={{ paddingTop: 20 }}>
            <RaisedCounter />
          </div>
        )}
        {SPONSORS.presenting && (
          <section className="section" aria-label="Presenting sponsor">
            <Sponsor sponsor={SPONSORS.presenting} slot="presenting" full />
          </section>
        )}
        {favEarly && favRow}
        {openRound && <OpenRoundPreview c={c} entries={entries} byId={byId} totals={totals} />}
        {bracketLive && <BracketPreview c={c} byId={byId} round={previewRound} />}
        {!favEarly && favRow}
        {(c.phase === 'submissions' || c.phase === 'submissions_closed' || c.phase === 'coming') && <Newcomers entries={entries} />}
        <HowItWorks compact={['voting', 'counting', 'intermission'].includes(c.phase)} />
        {c.shelters.length > 0 && (
          <section className="section" aria-labelledby="sh-title">
            <div className="section-head">
              <div>
                <h2 id="sh-title">Where the money goes</h2>
                <p className="section-count">{c.shelters.length === 1 ? 'Our partner shelter' : 'Our partner shelters'}</p>
              </div>
              <a className="more" href="#/shelters">
                {c.shelters.length === 1 ? 'More about the shelter' : 'More about the shelters'} <Arrow size={14} />
              </a>
            </div>
            <ShelterList shelters={c.shelters} split={c.contest?.beneficiary_split_pct} />
            <AdoptButton className="adopt-button-home" />
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
