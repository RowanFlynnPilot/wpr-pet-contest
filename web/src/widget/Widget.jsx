// The article widget: a compact card for any WPR story or sidebar that turns
// the pageview into a way into the contest. Reads only what its card shows,
// refreshes once a minute, and links out to the contest page.
import { SPONSORS, WPR_BADGE } from '../config.js'
import { withUtm } from '../components/Sponsor.jsx'
import { track } from '../lib/analytics.js'
import {
  fetchBonusWindows,
  fetchContests,
  fetchEntriesByAge,
  fetchEntriesByIds,
  fetchEntry,
  fetchMatchups,
  fetchRounds,
  fetchStats,
  fetchTotals,
} from '../lib/api.js'
import { activeWindow, windowTitle } from '../lib/bonus.js'
import { apTime, fmtInt, fmtMoney } from '../lib/format.js'
import { useLive } from '../lib/live.js'
import { contestPhase, pickActiveContest } from '../lib/phase.js'
import { entryPhotoUrl } from '../lib/photos.js'
import { roundLabel } from '../lib/rounds.js'
import { chooseView, closestMatchup, leaderIds, linkTo, timeLeft, topOpenRound } from '../lib/widget.js'
import { useNow } from '../lib/hooks.js'
import { Arrow } from '../components/Icons.jsx'

const REFRESH = 60000

function Thumb({ entry, size = 56 }) {
  const src = entryPhotoUrl(entry, { width: size * 2 })
  return src ? (
    <img className="w-thumb" src={src} alt="" width={size} height={size} loading="lazy" decoding="async" />
  ) : (
    <span className="w-thumb w-thumb-empty" aria-hidden="true" />
  )
}

function Cta({ href, view, children }) {
  return (
    <a className="w-cta" href={href} target="_top" onClick={() => track('Widget Click', { view })}>
      {children} <Arrow size={14} />
    </a>
  )
}

function useWidgetData(petId) {
  const contests = useLive('w:contests', fetchContests, REFRESH)
  const contest = pickActiveContest(contests.data || [])
  const cid = contest?.id
  const rounds = useLive(cid && `w:rounds:${cid}`, () => fetchRounds(cid), REFRESH)
  const stats = useLive(cid && `w:stats:${cid}`, () => fetchStats(cid), REFRESH)
  const windows = useLive(cid && `w:bonus:${cid}`, () => fetchBonusWindows(cid), REFRESH)
  const pet = useLive(petId && `w:pet:${petId}`, () => fetchEntry(petId), REFRESH)
  // The card waits for rounds and bonus windows: drawn sooner, the phase line
  // and the Double Votes banner would land after it and shove it around.
  const settled = (r) => r.data !== undefined || Boolean(r.error)
  const ready = Boolean(contest) && settled(rounds) && settled(windows)
  return { contest, contests, ready, rounds: rounds.data || [], stats: stats.data, windows: windows.data || [], pet }
}

function Enter({ contest, stats, to, now }) {
  const recent = useLive(`w:recent:${contest.id}`, () => fetchEntriesByAge(contest.id, 4, { newest: true }), REFRESH)
  const left = timeLeft(contest.submissions_close_at, now)
  return (
    <>
      <p className="w-headline">Is your pet the cutest in Marathon County?</p>
      <p className="w-sub">
        Entering is free. {stats?.entries ? `${fmtInt(stats.entries)} pets are in so far.` : 'Be one of the first.'}
        {left ? ` Entries close in ${left.replace(' left', '')}.` : ''}
      </p>
      {recent.data?.length > 0 && (
        <div className="w-strip" aria-hidden="true">
          {recent.data.map((e) => (
            <Thumb key={e.id} entry={e} size={48} />
          ))}
        </div>
      )}
      <Cta href={linkTo(to, 'enter')} view="enter">
        Enter your pet
      </Cta>
    </>
  )
}

// Placeholders the size of what replaces them, so the card does not grow
// (and push its footer down) when the numbers arrive.
function LeaderboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the leaderboard">
      <ol className="w-board" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i}>
            <span className="w-skel w-skel-row" />
          </li>
        ))}
      </ol>
      <span className="w-skel w-skel-cta" aria-hidden="true" />
    </div>
  )
}

function MatchupSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the matchup">
      <span className="w-skel w-skel-matchup" aria-hidden="true" />
      <span className="w-skel w-skel-cta" aria-hidden="true" />
    </div>
  )
}

function Leaderboard({ contest, round, to }) {
  const totals = useLive(`w:totals:${round.id}`, () => fetchTotals(round.id), REFRESH)
  const ids = totals.data ? leaderIds(totals.data) : null
  // A stable key: the store keeps refreshing with the latest ids rather than
  // a new store being made every time the order changes.
  const leaders = useLive(ids && `w:leaders:${round.id}`, () => fetchEntriesByIds(ids), REFRESH)
  const earliest = useLive(`w:earliest:${contest.id}`, () => fetchEntriesByAge(contest.id, 5), 0)
  const rows = totals.data && leaders.data && earliest.data ? topOpenRound(totals.data, [...leaders.data, ...earliest.data]) : null
  if (!rows) return <LeaderboardSkeleton />
  return (
    <>
      <ol className="w-board">
        {rows.map((r) => (
          <li key={r.entry.id}>
            <a href={linkTo(to, `pet/${r.entry.id}`)} target="_top" onClick={() => track('Widget Click', { view: 'leaderboard-pet' })}>
              <span className="w-rank">{r.rank}</span>
              <Thumb entry={r.entry} size={40} />
              <span className="w-name">
                {r.entry.pet_name}
                <span className="w-town">{r.entry.town}</span>
              </span>
              <span className="w-votes">{fmtInt(r.votes)}</span>
            </a>
          </li>
        ))}
      </ol>
      <Cta href={linkTo(to, 'gallery')} view="leaderboard">
        See every pet and vote
      </Cta>
    </>
  )
}

function Side({ entry, votes, share, lead, to }) {
  return (
    <a className={`w-side${lead ? ' lead' : ''}`} href={linkTo(to, `pet/${entry.id}`)} target="_top" onClick={() => track('Widget Click', { view: 'matchup-pet' })}>
      <Thumb entry={entry} size={72} />
      <span className="w-name">{entry.pet_name}</span>
      <span className="w-votes">{fmtInt(votes)}</span>
      <span className="w-bar" style={{ width: `${share}%` }} aria-hidden="true" />
    </a>
  )
}

function Matchup({ round, bracketSize, focusId, fallback = null, to }) {
  const matchups = useLive(`w:matchups:${round.id}`, () => fetchMatchups([round.id]), REFRESH)
  const totals = useLive(`w:totals:${round.id}`, () => fetchTotals(round.id), REFRESH)
  const ids = matchups.data ? [...new Set(matchups.data.flatMap((m) => [m.entry_a_id, m.entry_b_id]))] : null
  const pets = useLive(ids && `w:mpets:${round.id}`, () => fetchEntriesByIds(ids), REFRESH)
  if (!matchups.data || !totals.data || !pets.data) return <MatchupSkeleton />
  const byId = new Map(pets.data.map((e) => [e.id, e]))
  const m = focusId
    ? matchups.data.find((x) => x.entry_a_id === focusId || x.entry_b_id === focusId)
    : closestMatchup(matchups.data, totals.data, byId)
  const a = m && byId.get(m.entry_a_id)
  const b = m && byId.get(m.entry_b_id)
  if (!a || !b) return fallback
  const va = totals.data.get(a.id)?.votes || 0
  const vb = totals.data.get(b.id)?.votes || 0
  const total = va + vb
  const share = (v) => (total ? Math.max(6, Math.round((v / total) * 100)) : 50)
  const gap = Math.abs(va - vb)
  return (
    <>
      <p className="w-kicker-small">
        {focusId ? `${byId.get(focusId)?.pet_name} in the ` : 'The closest race in the '}
        {roundLabel(round.seq, bracketSize)}
      </p>
      <div className="w-matchup" role="group" aria-label={`${a.pet_name} versus ${b.pet_name}`}>
        <Side entry={a} votes={va} share={share(va)} lead={va >= vb} to={to} />
        <span className="w-vs" aria-hidden="true">
          vs
        </span>
        <Side entry={b} votes={vb} share={share(vb)} lead={vb > va} to={to} />
      </div>
      <p className="w-sub">{gap === 0 ? 'Dead even.' : `${gap === 1 ? 'One vote' : `${fmtInt(gap)} votes`} apart. Totals reset every round.`}</p>
      {focusId ? (
        <Cta href={linkTo(to, `pet/${focusId}`)} view="pet-matchup">
          Vote for {byId.get(focusId)?.pet_name}
        </Cta>
      ) : (
        <Cta href={linkTo(to, 'bracket')} view="matchup">
          See the bracket
        </Cta>
      )}
    </>
  )
}

function Champion({ rounds, to }) {
  const final = [...rounds].sort((x, y) => y.seq - x.seq)[0]
  const matchups = useLive(final && `w:matchups:${final.id}`, () => fetchMatchups([final.id]), 0)
  const winnerId = matchups.data?.find((m) => m.winner_entry_id)?.winner_entry_id
  const winner = useLive(winnerId && `w:pet:${winnerId}`, () => fetchEntry(winnerId), 0)
  const e = winner.data
  if (!e) return null
  return (
    <>
      <div className="w-champ">
        <Thumb entry={e} size={96} />
        <div>
          <p className="w-kicker-small">The {new Date(final.closes_at).getFullYear()} champion</p>
          <p className="w-headline">{e.pet_name}</p>
          <p className="w-sub">{e.town}</p>
        </div>
      </div>
      <Cta href={linkTo(to, 'results')} view="champion">
        See the results
      </Cta>
    </>
  )
}

function PetCard({ pet, round, contest, voting, to }) {
  const totals = useLive(round && `w:totals:${round.id}`, () => fetchTotals(round.id), REFRESH)
  const votes = totals.data?.get(pet.id)?.votes || 0
  const plain = (
    <>
      <div className="w-champ">
        <Thumb entry={pet} size={96} />
        <div>
          <p className="w-headline">{pet.pet_name}</p>
          <p className="w-sub">{pet.town}</p>
          {voting && round?.seq === 1 && (
            <p className="w-votes-line">
              {fmtInt(votes)} {votes === 1 ? 'vote' : 'votes'} in the Open Round
            </p>
          )}
        </div>
      </div>
      <Cta href={linkTo(to, `pet/${pet.id}`)} view="pet">
        {voting && round?.seq === 1 ? `Vote for ${pet.pet_name}` : `See ${pet.pet_name}’s page`}
      </Cta>
    </>
  )
  // In a bracket round: its matchup if it is still in one, otherwise the card.
  if (round && round.seq > 1) {
    return <Matchup round={round} bracketSize={contest.bracket_size} focusId={pet.id} fallback={plain} to={to} />
  }
  return plain
}

export default function Widget({ params }) {
  const now = useNow(30000)
  const d = useWidgetData(params.petId)
  const { phase, round, nextRound } = contestPhase(d.contest, d.rounds, now)
  const petUnavailable = params.petId && d.pet.data === null
  const view = chooseView({ phase, round, requested: params.view, petId: petUnavailable ? null : params.petId })
  const bonus = activeWindow(d.windows, now)
  const sponsor = SPONSORS.presenting
  const left = round && (phase === 'voting' || phase === 'counting') ? timeLeft(round.closes_at, now) : null

  if (d.contests.error) {
    return (
      <main className="w-card">
        <p className="w-sub">The contest is taking a breather. Try again in a minute.</p>
      </main>
    )
  }
  if (!d.ready) return <main className="w-card" aria-busy="true" aria-label="Loading the contest" />

  let body = null
  if (view === 'enter') body = <Enter contest={d.contest} stats={d.stats} to={params.to} now={now} />
  else if (view === 'leaderboard') body = <Leaderboard contest={d.contest} round={round} to={params.to} />
  else if (view === 'matchup') body = <Matchup round={round} bracketSize={d.contest.bracket_size} to={params.to} />
  else if (view === 'champion') body = <Champion rounds={d.rounds} to={params.to} />
  else if (view === 'pet' && d.pet.data)
    body = <PetCard pet={d.pet.data} round={round} contest={d.contest} voting={phase === 'voting'} to={params.to} />
  else if (view === 'soon')
    body = (
      <>
        <p className="w-headline">{nextRound ? `The ${roundLabel(nextRound.seq, d.contest.bracket_size)} starts soon` : 'Voting starts soon'}</p>
        <p className="w-sub">Every pet starts the round at zero.</p>
        <Cta href={linkTo(params.to, nextRound?.seq > 1 ? 'bracket' : 'gallery')} view="soon">
          {nextRound?.seq > 1 ? 'See the bracket' : 'Meet the pets'}
        </Cta>
      </>
    )

  return (
    // Its own page inside the iframe, so it carries a main landmark and a
    // heading for screen reader users who land in it.
    <main className="w-card">
      <header className="w-head">
        <img src={WPR_BADGE} alt="" width="28" height="28" />
        <h1 className="w-kicker">
          {d.contest.name}
          {round && (phase === 'voting' || phase === 'counting') && (
            <span className="w-phase">
              {roundLabel(round.seq, d.contest.bracket_size)}
              {left ? ` · ${left}` : ' · voting closed'}
            </span>
          )}
        </h1>
      </header>
      {bonus && phase === 'voting' && (
        <p className="w-bonus">
          {windowTitle(bonus)} until {apTime(bonus.ends_at)}
          {bonus.sponsor_name && <span className="w-bonus-by"> · presented by {bonus.sponsor_name}</span>}
        </p>
      )}
      <div className="w-body">{body}</div>
      <footer className="w-foot">
        {d.stats?.shelter_cents > 0 && (
          <span>
            <strong className="w-money">{fmtMoney(d.stats.shelter_cents, { whole: true })}</strong> raised for local shelters
          </span>
        )}
        {sponsor && (
          <span className="w-sponsor">
            Presented by{' '}
            {sponsor.url ? (
              <a href={withUtm(sponsor.url)} target="_blank" rel="noopener noreferrer sponsored" onClick={() => track('Sponsor Click', { slot: 'widget' })}>
                {sponsor.name}
              </a>
            ) : (
              sponsor.name
            )}
          </span>
        )}
        <span className="w-by">A Wausau Pilot &amp; Review contest</span>
      </footer>
    </main>
  )
}
