import { useEffect, useMemo, useRef, useState } from 'react'
import { NEWSROOM } from '../config.js'
import { useContest } from '../components/ContestContext.jsx'
import { Arrow, Calendar as CalendarIcon } from '../components/Icons.jsx'
import FavoriteButton from '../components/FavoriteButton.jsx'
import { FreeVoteButton, useFreeVoteLanding } from '../components/FreeVote.jsx'
import { deadlineIcs, icsHref } from '../lib/calendar.js'
import { callLinks, fetchReferrals } from '../lib/api.js'
import { goalProgress } from '../lib/goal.js'
import { PUBLIC_URL } from '../lib/env.js'
import PetPhoto from '../components/PetPhoto.jsx'
import PetCard from '../components/PetCard.jsx'
import { FaceOff, UpsetLamp } from '../components/FaceOff.jsx'
import { CountdownCells, CrownMark, Digits, GameClock, Lamp, RoadStrip, Scoreboard, StickyVote } from '../components/Scoreboard.jsx'
import ShareTools, { useSharePage } from '../components/ShareTools.jsx'
import ShareImageButton from '../components/ShareImageButton.jsx'
import PhotoLightbox from '../components/PhotoLightbox.jsx'
import LinkPreview from '../components/LinkPreview.jsx'
import PetAbout from '../components/PetAbout.jsx'
import { SprintLine } from '../components/SprintCard.jsx'
import VoteButton from '../components/VoteButton.jsx'
import { track } from '../lib/analytics.js'
import { fetchEntry } from '../lib/api.js'
import { entryStates } from '../lib/bracketState.js'
import { useBracket, useContestTotals, useEntries, useMomentum, useRoundTotals } from '../lib/data.js'
import { apCount, apDate, apDateTime, apWhen, fmtInt, fmtMoney, plural } from '../lib/format.js'
import { useDocumentTitle } from '../lib/hooks.js'
import { useLive } from '../lib/live.js'
import { cheapestPerVote } from '../lib/packs.js'
import { climbers, cutline, matchupStanding, rankOpenRound } from '../lib/rank.js'
import { clubLabel, milestone } from '../lib/milestones.js'
import { roadStops } from '../lib/road.js'
import { roundLabel } from '../lib/rounds.js'
import { entryPhotoUrl } from '../lib/photos.js'
import { tintStyle, usePhotoTint } from '../lib/photoTint.js'
import { ownerPosts } from '../lib/ownerPosts.js'
import { rememberVia } from '../lib/referral.js'
import { canVoteNow, rankPool } from '../lib/lastChance.js'
import { ownerLink, petPublicUrl } from '../lib/share.js'
import { useCheckout } from '../components/Checkout.jsx'
import PetCheers from '../components/PetCheers.jsx'

const SPECIES = { dog: 'Dog', cat: 'Cat', other: 'Other' }
const votesWord = (n) => (n === 1 ? 'vote' : 'votes')

function PriceHint({ packs }) {
  if (!packs.length) return null
  const from = Math.min(...packs.map((p) => p.cents))
  return (
    <p className="price-hint">
      Vote packs from {fmtMoney(from)}, as low as {cheapestPerVote(packs)} a vote. Not tax-deductible; a share of every pack goes to
      local shelters.
    </p>
  )
}

// The owner's goal, shown to everyone while a round is live: "Biscuit's goal:
// 300 votes · 88 to go".
function GoalLine({ entry, round }) {
  const { totals, known } = useRoundTotals(round?.id || null)
  const g = known ? goalProgress(totals.get(entry.id)?.votes || 0, entry.goal_votes) : null
  if (!g) return null
  const pct = Math.min(100, Math.round((g.raised / g.goal) * 100))
  return (
    <div className="goal-line" role="group" aria-label={`${entry.pet_name}'s goal`}>
      <div className="goal-line-head">
        <span>
          <strong>{entry.pet_name}&rsquo;s goal:</strong> {fmtInt(g.goal)} votes this round
        </span>
        <span className="goal-line-left">{g.reached ? 'Reached' : `${fmtInt(g.remaining)} to go`}</span>
      </div>
      <div className="raised-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${pct}% of the goal`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// What the owner's link from the approval email unlocks: a goal for the
// page, and a way to stop the tips emails. The token proves the owner; it
// never leaves this panel.
function OwnerTools({ entry, token, round, c, standing, byId, club }) {
  const [goal, setGoal] = useState(entry.goal_votes ? String(entry.goal_votes) : '')
  const [saved, setSaved] = useState(entry.goal_votes || null)
  const [state, setState] = useState('ready')
  const [error, setError] = useState(null)
  const live = round?.status === 'open'

  async function save(e) {
    e.preventDefault()
    setState('busy')
    setError(null)
    try {
      const res = await callLinks('goal', { entry_id: entry.id, token, goal: goal.trim() ? Number(goal) : null })
      setSaved(res.goal)
      track('Owner Goal', { pet: entry.pet_name, goal: res.goal })
      setState('ready')
    } catch (err) {
      setError(err.message)
      setState('ready')
    }
  }

  return (
    <section className="owner-tools" aria-labelledby="owner-tools-title">
      <h2 id="owner-tools-title">Your tools for {entry.pet_name}</h2>
      <form onSubmit={save} className="owner-goal">
        <label htmlFor="owner-goal">
          <strong>Set a vote goal.</strong> It shows on this page{live ? ' now' : ' while voting is open'}, and people like helping a pet
          reach one.
        </label>
        <div className="tool-row">
          <input id="owner-goal" type="text" inputMode="numeric" placeholder="300" value={goal} onChange={(e) => setGoal(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={state === 'busy'}>
            {state === 'busy' ? 'Saving…' : saved ? 'Update goal' : 'Set goal'}
          </button>
        </div>
        {saved ? (
          <p className="small" role="status">
            Goal: {fmtInt(saved)} votes. Leave the box empty and save to remove it.
          </p>
        ) : null}
      </form>
      <OwnerPosts entry={entry} c={c} standing={standing} byId={byId} club={club} />
      <Referrals entry={entry} />
      <p className="small">
        Below: share buttons and &ldquo;Make a share image&rdquo; for a story, a square post and a flyer with a QR code. The Facebook button
        uses a link that shows {entry.pet_name}&rsquo;s photo in the preview. Links from this page count toward the line above.
      </p>
      {error && (
        <div className="notice error" role="alert">
          <span>{error}</span>
        </div>
      )}
    </section>
  )
}

// Ready-made posts (lib/ownerPosts.js) for where the pet stands now, on the
// owner's own link (?via=o), one tap to copy.
const PLATFORMS = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['text', 'Text message'],
]
function OwnerPosts({ entry, c, standing: state, byId, club }) {
  const [platform, setPlatform] = useState('facebook')
  const [copied, setCopied] = useState(false)
  const petPage = useSharePage(`p/${entry.id}/`)
  const url = ownerLink(petPage || petPublicUrl(PUBLIC_URL, entry.id))
  const r1 = c.rounds.find((r) => r.seq === 1)
  const matchRound = state?.matchup ? c.rounds.find((r) => r.id === state.matchup.round_id) : null
  let stage = 'open'
  if (['coming', 'submissions', 'submissions_closed'].includes(c.phase)) stage = 'before'
  else if (state?.status === 'champion') stage = 'champion'
  else if (state?.status === 'out') stage = 'out'
  else if (state?.status === 'unseeded') stage = 'unseeded'
  else if (state?.status === 'alive' && state.matchup && !state.matchup.winner_entry_id) stage = 'matchup'
  else if (c.lastChance && c.round?.mainClosesAt && c.round.status === 'open') {
    // Last Chance: racing for the last seed, or already in.
    const place = c.lastChance.place.get(entry.id)
    if (c.lastChance.pool.has(entry.id)) stage = 'lastchance'
    else if (place != null && place < c.bracketSize) stage = 'qualified'
    else stage = 'unseeded'
  }
  const oppId = state?.matchup ? (state.matchup.entry_a_id === entry.id ? state.matchup.entry_b_id : state.matchup.entry_a_id) : null
  const closesAt = matchRound?.closes_at || c.round?.closes_at
  const raisedCents = Number(c.stats?.shelter_cents ?? 0) + Number(c.stats?.match_cents ?? 0)
  const posts = ownerPosts({
    stage,
    name: entry.pet_name,
    contest: c.contest?.name || `Cutest Pet in ${NEWSROOM.region}`,
    url,
    split: c.contest?.beneficiary_split_pct,
    bracketSize: c.bracketSize,
    closes: closesAt ? apDateTime(closesAt) : 'soon',
    opens: r1?.opens_at ? apDateTime(r1.opens_at) : 'soon',
    round: state?.label,
    opponent: (oppId && byId.get(oppId)?.pet_name) || 'their opponent',
    club,
    raised: c.phase === 'complete' && raisedCents ? fmtMoney(raisedCents, { whole: true }) : null,
  })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(posts[platform])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      track('Owner Post Copied', { pet: entry.pet_name, platform })
    } catch {
      // The text stays selectable in the box.
    }
  }
  return (
    <div className="owner-posts">
      <h3>Ready-made posts</h3>
      <div className="chips" role="group" aria-label="Where you will post">
        {PLATFORMS.map(([key, label]) => (
          <button key={key} type="button" className="chip" aria-pressed={platform === key} onClick={() => setPlatform(key)}>
            {label}
          </button>
        ))}
      </div>
      <textarea readOnly value={posts[platform]} rows={platform === 'text' ? 4 : 6} aria-label={`Post for ${PLATFORMS.find(([k]) => k === platform)[1]}`} onFocus={(e) => e.target.select()} />
      <button type="button" className="btn btn-primary btn-sm" onClick={copy}>
        {copied ? 'Copied' : 'Copy the post'}
      </button>
    </div>
  )
}

// What the owner's links have brought (entry_referrals, 0029).
function Referrals({ entry }) {
  const res = useLive(`referrals:${entry.id}`, () => fetchReferrals(entry.id), 60000)
  const r = res.data
  if (!r) return null
  return (
    <p className="owner-ref" role="status">
      {r.packs > 0 ? (
        <>
          Your links have brought <strong>{fmtInt(r.packs)}</strong> {r.packs === 1 ? 'vote pack' : 'vote packs'} and {plural(r.votes, 'vote')} for {entry.pet_name}.
        </>
      ) : (
        <>When someone buys a vote pack within a week of tapping one of your links, it counts here.</>
      )}
    </p>
  )
}

// A calendar event at the round's deadline with a two-hour reminder: the
// reminder that works inside the WordPress iframe, where push cannot.
function DeadlineReminder({ entry, round }) {
  const c = useContest()
  if (!round?.closes_at || round.status !== 'open') return null
  const label = roundLabel(round.seq, c.bracketSize)
  const ics = deadlineIcs({
    uid: `${round.id}-${entry.id}`,
    title: `Voting closes: ${label}, ${c.contest?.name || 'pet contest'}`,
    closesAt: round.closes_at,
    url: `${PUBLIC_URL}#/pet/${entry.id}`,
    description: `Last call to vote for ${entry.pet_name}. Totals reset every round.`,
  })
  return (
    <a className="deadline-link" href={icsHref(ics)} download={`vote-${entry.pet_name}.ics`} onClick={() => track('Calendar', { pet: entry.pet_name })}>
      <CalendarIcon size={16} /> Remind me before voting closes
    </a>
  )
}

// The page's one action, inside the first screen; on phones a pinned copy
// takes over whenever it is off screen.
function VoteBlock({ entry, round, packs }) {
  const ref = useRef(null)
  return (
    <>
      <div className="vote-block" ref={ref}>
        <VoteButton entry={entry} round={round} className="btn btn-primary btn-lg btn-block">
          Vote for {entry.pet_name}
        </VoteButton>
        <PriceHint packs={packs} />
        <FreeVoteButton entry={entry} round={round} />
        <DeadlineReminder entry={entry} round={round} />
      </div>
      <StickyVote targetRef={ref}>
        <VoteButton entry={entry} round={round} className="btn btn-primary btn-block">
          Vote for {entry.pet_name}
        </VoteButton>
      </StickyVote>
    </>
  )
}

// The milestone clubs (lib/milestones.js): every club this pet has joined,
// the next one ghosted, and how far there is to go. Every round counts.
function Milestones({ name, total, started }) {
  if (!started || total == null) return null
  const m = milestone(total)
  if (!m.earned && !m.next) return null
  const shown = m.all.slice(-3)
  return (
    <section className="milestones" aria-label={`${name}'s milestones`}>
      <ol className="ms-badges">
        {shown.map((t, i) => (
          <li key={t} className={`ms-badge on${i < shown.length - 1 ? ' older' : ''}`}>
            <span className="ms-medal" aria-hidden="true">
              🏅
            </span>
            {clubLabel(t)}
          </li>
        ))}
        {m.next && (
          <li className="ms-badge next">
            <span className="sr-only">Next: </span>
            {clubLabel(m.next)}
          </li>
        )}
      </ol>
      {m.next ? (
        <div className="ms-progress">
          <span className="ms-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(m.progress * 100)}%` }} />
          </span>
          <span className="ms-note">
            {m.earned ? `${name} is in the ${clubLabel(m.earned)}. ` : ''}
            {fmtInt(m.toNext)} {m.toNext === 1 ? 'vote' : 'votes'} to the {clubLabel(m.next)}.
          </span>
        </div>
      ) : (
        <p className="ms-note">{name} has joined every club. Every vote from here is a bonus.</p>
      )}
    </section>
  )
}

function OpenRoundPanel({ c, entry, entries }) {
  const { totals, known } = useRoundTotals(c.round.id)
  const ranked = useMemo(() => rankOpenRound(entries, totals), [entries, totals])
  const recent = useMomentum(c.round, c.now)
  const up = useMemo(() => (known ? climbers(entries, totals, recent).get(entry.id) || 0 : 0), [known, entries, totals, recent, entry.id])
  const votes = totals.get(entry.id)?.votes || 0
  const free = totals.get(entry.id)?.free || 0
  const line = known ? cutline(ranked, entry.id, c.bracketSize) : null
  const label = roundLabel(c.round.seq, c.bracketSize)
  const voting = c.phase === 'voting'
  let note = 'Live totals are still loading. Voting works either way.'
  if (line?.qualifying) note = line.margin != null ? `The first pet out needs ${plural(line.margin, 'vote')} to pass ${entry.pet_name}.` : ''
  else if (line) note = `${plural(line.needed, 'vote')} to crack the top ${c.bracketSize}.`
  else if (known) note = ''
  return (
    <>
      <Scoreboard
        label={label}
        sub={voting ? `Closes ${apWhen(c.round.closes_at, c.now)}` : 'Voting has closed'}
        clock={<GameClock to={c.round.closes_at} done="Final count" />}
        lamp={
          line && (
            <Lamp on={line.qualifying} sr={line.qualifying ? `In the top ${c.bracketSize}.` : `Below the top ${c.bracketSize}.`}>
              Top {c.bracketSize}
            </Lamp>
          )
        }
      >
        <div className="sb-solo">
          <div className="sb-solo-count">
            <Digits value={known ? votes : null} label={known ? `${fmtInt(votes)} ${votesWord(votes)} this round` : 'Votes loading'} />
            <span className="sb-unit">
              {votesWord(votes)} this round{free > 0 && `, including ${fmtInt(free)} free`}
            </span>
          </div>
          {line && (
            <span className="sb-rank">
              <b>#{line.rank}</b>of {fmtInt(line.total)}
              {up > 0 && (
                <span className="sb-climb">
                  <span aria-hidden="true">▲</span> {up} since yesterday
                </span>
              )}
            </span>
          )}
        </div>
        <p className="sb-note">
          {note}{' '}
          {voting
            ? `The top ${c.bracketSize} make the bracket, where every total starts over.`
            : 'Results are finalized shortly after the deadline.'}
        </p>
      </Scoreboard>
      {voting && <VoteBlock entry={entry} round={c.round} packs={c.packs} />}
    </>
  )
}

// The Open Round's overtime (lib/lastChance.js): a pool pet races for the
// last seed; a pet above the line is in; anyone else has finished.
function LastChancePanel({ c, entry, byId }) {
  const { totals, known } = useRoundTotals(c.round.id)
  const lc = c.lastChance
  const voting = c.phase === 'voting'
  const inPool = lc.pool.has(entry.id)
  const place = lc.place.get(entry.id)
  const votes = totals.get(entry.id)?.votes || 0
  const others = Math.max(0, lc.size - 1)
  if (!inPool) {
    const inBracket = place != null && place < c.bracketSize
    return (
      <Scoreboard label="Open Round" sub={inBracket ? `Finished No. ${place}` : 'Voting has closed'} clock={<GameClock to={c.round.mainClosesAt} done="Final count" />}>
        <p className="sb-note">
          {inBracket
            ? `${entry.pet_name} finished No. ${place} and is in the bracket. `
            : `Voting has closed for ${entry.pet_name}. `}
          {voting
            ? `${apCount(lc.size, 'pet')} just below the line have until ${apWhen(c.round.closes_at, c.now, { long: true })} to win the last spot in Last Chance.`
            : 'The bracket is set shortly after Last Chance ends.'}
        </p>
      </Scoreboard>
    )
  }
  const pool = rankPool(lc, totals, byId)
  const me = pool.find((r) => r.id === entry.id)
  const leader = pool[0]
  const behind = me && leader && leader.id !== entry.id ? leader.votes - me.votes + 1 : 0
  return (
    <>
      <Scoreboard
        label="Last Chance"
        sub={voting ? `Closes ${apWhen(c.round.closes_at, c.now)}` : 'Voting has closed'}
        clock={<GameClock to={c.round.closes_at} done="Final count" />}
        lamp={me && <Lamp on={me.rank === 1} sr={me.rank === 1 ? 'Leading Last Chance.' : 'Not leading Last Chance.'}>Leading</Lamp>}
      >
        <div className="sb-solo">
          <div className="sb-solo-count">
            <Digits value={known ? votes : null} label={known ? `${fmtInt(votes)} ${votesWord(votes)} this round` : 'Votes loading'} />
            <span className="sb-unit">{votesWord(votes)} this round</span>
          </div>
          {me && (
            <span className="sb-rank">
              <b>#{me.rank}</b>of {lc.size}
            </span>
          )}
        </div>
        <p className="sb-note">
          {me?.rank === 1
            ? `${entry.pet_name} leads Last Chance. `
            : behind > 0
              ? `${entry.pet_name} needs ${plural(behind, 'vote')} to take the lead. `
              : ''}
          {voting
            ? `${entry.pet_name} and ${apCount(others, 'other pet')} finished just below the line. Open Round votes carry over, and the most votes when Last Chance ends takes the last spot in the bracket.`
            : 'Results are finalized shortly after Last Chance ends.'}
        </p>
      </Scoreboard>
      {voting && <VoteBlock entry={entry} round={c.round} packs={c.packs} />}
    </>
  )
}

function BracketPanel({ c, entry, entries, byId, bracket, state }) {
  const r1 = c.rounds.find((r) => r.seq === 1)
  const r1Totals = useRoundTotals(r1 && entry.seed == null ? r1.id : null, { live: false })

  if (bracket.loading) return <div className="scoreboard-skeleton skeleton" aria-busy="true" aria-label="Loading the matchup" />

  if (!state || state.status === 'unseeded') {
    const rank = rankOpenRound(entries, r1Totals.totals).find((r) => r.entry.id === entry.id)
    return (
      <Scoreboard label="Open Round" clock={<span className="sb-clock final">Final</span>}>
        {rank && (
          <div className="sb-solo">
            <div className="sb-solo-count">
              <Digits value={rank.votes} label={`${fmtInt(rank.votes)} ${votesWord(rank.votes)} in the Open Round`} dim />
              <span className="sb-unit">{votesWord(rank.votes)} in the Open Round</span>
            </div>
            <span className="sb-rank">
              <b>#{rank.rank}</b>of {fmtInt(entries.length)}
            </span>
          </div>
        )}
        <p className="sb-note">
          {entry.pet_name} {rank ? `finished #${rank.rank} in the Open Round` : 'competed in the Open Round'} and didn&rsquo;t make the
          bracket this year. Thanks for playing, {entry.pet_name}! Totals reset every round.
        </p>
      </Scoreboard>
    )
  }

  const m = state.matchup
  const round = m && c.rounds.find((r) => r.id === m.round_id)
  if (!round) {
    // The matchups failed to load, or have not caught up with the rounds yet.
    return (
      <Scoreboard label="Bracket">
        <p className="sb-note lead">{entry.pet_name} is in the bracket. Its matchup is still loading; this page updates on its own.</p>
      </Scoreboard>
    )
  }
  const label = roundLabel(round.seq, c.bracketSize)
  const st = matchupStanding(m, bracket.totalsByRound.get(m.round_id) || new Map(), byId)
  const mine = st.a.id === entry.id ? 'a' : 'b'
  const me = st[mine]
  const opp = mine === 'a' ? st.b : st.a
  const live = c.phase === 'voting' && c.round?.id === round.id
  const pending = round.status === 'pending'
  const leading = st.leader === mine
  const oppName = opp.entry?.pet_name || 'their opponent'

  // The top of the road: the final, its score, and the crown lit.
  if (state.status === 'champion') {
    return (
      <Scoreboard
        className="crowned"
        label={label}
        clock={<span className="sb-clock final">Final</span>}
        lamp={
          <Lamp on sr={`${entry.pet_name} is the champion.`}>
            Champion
          </Lamp>
        }
      >
        <p className="sb-crowned">
          <CrownMark size={30} /> {entry.pet_name} wins the crown
        </p>
        <FaceOff a={me} b={opp} leading here />
        <p className="sb-note">
          {entry.pet_name} is the {c.contest.year} {c.contest.name} champion. Scores count each round&rsquo;s votes; totals reset every
          round. <a href="#/results">See the final bracket</a>
        </p>
      </Scoreboard>
    )
  }

  // An opponent the public cannot see was disqualified or withdrawn: this pet advances
  // whatever the count, so there is nothing to sell votes for.
  if (!m.winner_entry_id && opp.id && !opp.entry) {
    return (
      <Scoreboard label={label}>
        <p className="sb-note lead">
          {entry.pet_name}&rsquo;s opponent in the {label} is out of the contest, so {entry.pet_name} advances whatever the count. There is
          nothing to vote on in this matchup.
        </p>
      </Scoreboard>
    )
  }

  const out = state.status === 'out'
  const decided = Boolean(m.winner_entry_id) || out
  let clock = <GameClock to={round.closes_at} done={decided ? 'Final' : 'Final count'} />
  if (pending) clock = <span className="sb-clock">{round.opens_at ? `Opens ${apDate(round.opens_at, { weekday: false })}` : 'Up next'}</span>
  if (out) clock = <span className="sb-clock final">Final</span>

  let note
  if (out) {
    note = `${entry.pet_name} was knocked out in the ${label} by ${oppName}, ${fmtInt(me.votes)} to ${fmtInt(opp.votes)}. What a run!`
  } else if (pending) {
    note = `Both pets start at zero when the ${label} opens.`
  } else if (leading) {
    note = st.tied
      ? `${entry.pet_name} leads on the tiebreak, as the better seed. One vote for ${oppName} flips it.`
      : `${entry.pet_name} leads by ${plural(me.votes - opp.votes, 'vote')}.`
  } else {
    note = st.tied ? `Tied, and ${oppName} wins ties as the better seed.` : `${plural(st.toTake, 'vote')} behind ${oppName}.`
  }

  return (
    <>
      <Scoreboard
        label={label}
        sub={live ? `Closes ${apWhen(round.closes_at, c.now)}` : null}
        clock={clock}
        lamp={pending ? null : <UpsetLamp standing={st} a={me} b={opp} decided={decided} />}
      >
        <FaceOff a={me} b={opp} leading={leading} here />
        <p className="sb-note">
          {note} Totals reset every round.
        </p>
      </Scoreboard>
      {live && !out && <VoteBlock entry={entry} round={round} packs={c.packs} />}
    </>
  )
}

// Before voting: the board counts down to it, in its own cells.
function WaitingPanel({ c, entry }) {
  const opens = c.nextRound?.opens_at || c.contest.submissions_close_at
  return (
    <Scoreboard label="Open Round" sub={opens ? `Voting opens ${apWhen(opens, c.now)}` : null}>
      {opens && <CountdownCells to={opens} label="Voting opens in" />}
      <p className="sb-note">
        {c.phase === 'submissions'
          ? `Entries close ${apDate(c.contest.submissions_close_at)}; then the whole field goes head to head. Share ${entry.pet_name}’s page now so friends are ready.`
          : `Share ${entry.pet_name}’s page so friends are ready when voting opens.`}
      </p>
    </Scoreboard>
  )
}

export default function Pet({ route }) {
  const c = useContest()
  const { entries, byId, loading } = useEntries(c.contest?.id)
  const fromList = byId.get(route.id)
  const single = useLive(fromList ? null : `entry:${route.id}`, () => fetchEntry(route.id), 0)
  const entry = fromList || single.data || null
  useDocumentTitle(`${entry ? `Vote for ${entry.pet_name}` : 'Pet'} — ${NEWSROOM.name}`)

  const inBracket = c.rounds.some((r) => r.kind === 'bracket')
  const bracket = useBracket(inBracket ? c.rounds : [], { openRoundId: c.phase === 'voting' ? c.round?.id : null })
  const states = useMemo(
    () => (inBracket && entry ? entryStates(entries.length ? entries : [entry], c.rounds, bracket.matchups, c.bracketSize) : null),
    [inBracket, entry, entries, c.rounds, bracket.matchups, c.bracketSize],
  )
  const state = (entry && states?.get(entry.id)) || null
  // The hero takes the color of the pet's own photo; teal until it loads.
  const tint = usePhotoTint(entry ? entryPhotoUrl(entry, { width: 200 }) : null)
  // A tap on the hero shows the photo whole, on its own color.
  const [photoOpen, setPhotoOpen] = useState(false)
  // Opened from an emailed free-vote link: the sheet opens ready to confirm.
  const freeRound =
    c.phase === 'voting' &&
    entry &&
    canVoteNow(c.lastChance, entry.id) &&
    (!inBracket || (state?.status === 'alive' && state.matchup && c.round?.id === state.matchup.round_id))
      ? c.round
      : null
  useFreeVoteLanding(entry, freeRound, route.params)
  // Opened from the checkout reminder's link (?vote=<pack>): checkout opens
  // on the pack the reader chose before, while the pet can still be voted for.
  const openCheckout = useCheckout()
  const wantPack = route.params?.vote
  const openedFromLink = useRef(false)
  useEffect(() => {
    if (!wantPack || openedFromLink.current || !entry || !freeRound) return
    openedFromLink.current = true
    openCheckout(entry, freeRound, { pack: wantPack })
  }, [wantPack, entry, freeRound, openCheckout])
  // Arrived through one of the owner's links: remember it for a week, so a
  // pack bought here counts toward "your link brought" (lib/referral.js).
  const via = route.params?.via
  useEffect(() => {
    if (entry?.id && via === 'o') rememberVia(entry.id)
  }, [entry?.id, via])

  // What each stop on the road carries: the open-round seed, a decided
  // score, or the date a set matchup opens.
  const details = useMemo(() => {
    const d = {}
    if (!entry) return d
    if (entry.seed != null) d[1] = `#${entry.seed}`
    for (const r of c.rounds) {
      if (r.kind !== 'bracket') continue
      const m = bracket.matchups.find((x) => x.round_id === r.id && (x.entry_a_id === entry.id || x.entry_b_id === entry.id))
      const totals = bracket.totalsByRound.get(r.id)
      if (m?.winner_entry_id && totals) {
        const other = m.entry_a_id === entry.id ? m.entry_b_id : m.entry_a_id
        d[r.seq] = `${fmtInt(totals.get(entry.id)?.votes || 0)}–${fmtInt(totals.get(other)?.votes || 0)}`
      } else if (m && r.status === 'pending' && r.opens_at) {
        d[r.seq] = apDate(r.opens_at, { weekday: false })
      }
    }
    return d
  }, [entry, c.rounds, bracket.matchups, bracket.totalsByRound])

  // Every round's votes, for the milestone clubs.
  const contestTotals = useContestTotals(c.rounds)

  // In the bracket, "more pets" means the ones still in it.
  const more = useMemo(() => {
    if (!entry || !entries.length) return []
    const pool = states ? entries.filter((e) => ['alive', 'champion'].includes(states.get(e.id)?.status)) : entries
    const i = pool.findIndex((e) => e.id === entry.id)
    const rest = i >= 0 ? [...pool.slice(i + 1), ...pool.slice(0, i)] : pool
    return rest.filter((e) => e.id !== entry.id).slice(0, 4)
  }, [entries, entry, states])

  if (!entry) {
    const settled = !loading && (fromList || single.data !== undefined || single.error)
    return (
      <div className="wrap section">
        {settled ? (
          <div className="card">
            <h1 style={{ fontSize: 28 }}>We can&rsquo;t find that pet.</h1>
            <p style={{ marginTop: 10 }}>It may still be waiting for an editor to review it. New entries usually go live within a day.</p>
            <a className="btn btn-primary" href="#/gallery">
              See all the pets
            </a>
          </div>
        ) : (
          <div className="pet-stage" aria-busy="true">
            <div className="pet-hero skeleton" />
            <div className="pet-play">
              <div className="skeleton" style={{ height: 40 }} />
              <div className="scoreboard-skeleton skeleton" />
            </div>
          </div>
        )}
      </div>
    )
  }

  const name = entry.pet_name
  // The hero name's size follows the name (break-ui): a 40-character name
  // gets a smaller face, and the longest word sets a ceiling so a one-word
  // name fits whole when it can.
  const nameChars = Array.from(name).length
  const longestWord = Math.max(...name.split(/\s+/).map((w) => Array.from(w).length))
  const nameSize = nameChars > 30 ? ' longer' : nameChars > 18 ? ' long' : ''
  const shelter = entry.shelter_id ? c.shelters.find((s) => s.id === entry.shelter_id) : null
  const road = roadStops({
    bracketSize: c.bracketSize,
    rounds: c.rounds,
    phase: c.phase,
    state: inBracket ? state || { status: 'unseeded' } : null,
    details,
  })

  let panel
  if (inBracket) panel = <BracketPanel c={c} entry={entry} entries={entries} byId={byId} bracket={bracket} state={state} />
  else if (c.round?.kind === 'open' && ['voting', 'counting'].includes(c.phase))
    panel = c.lastChance && c.round.mainClosesAt ? <LastChancePanel c={c} entry={entry} byId={byId} /> : <OpenRoundPanel c={c} entry={entry} entries={entries} />
  else if (c.phase === 'complete') panel = null
  else panel = <WaitingPanel c={c} entry={entry} />

  // Sharing only earns votes while this pet can be voted for.
  // During Last Chance only its pool can be voted for (lib/lastChance.js).
  const votable =
    c.phase === 'voting' &&
    canVoteNow(c.lastChance, entry.id) &&
    (!inBracket || (state?.status === 'alive' && state.matchup && c.round?.id === state.matchup.round_id))
  let shareTitle = `Share ${name}`
  if (votable) shareTitle = `Share ${name} and get more votes`
  else if (state?.status === 'champion') shareTitle = `Share ${name}’s win`

  const meta = [entry.seed != null && `No. ${entry.seed} seed`, entry.town, SPECIES[entry.species] || 'Pet'].filter(Boolean).join(' · ')
  const ownerToken = /^[0-9a-f-]{36}$/i.test(route.params?.owner || '') ? route.params.owner : null
  const liveRound = votable ? c.round : null
  // The crawlers get the matchup card while a bracket round is live; `p`
  // names the pet whose page a tap on the preview opens.
  const sharePage = votable && inBracket && state?.matchup ? `m/${state.matchup.id}/?p=${entry.id}` : null
  // The matchup card's two names, in the card's order, for the link preview.
  const previewMatchup =
    sharePage && c.round
      ? {
          a: byId.get(state.matchup.entry_a_id)?.pet_name || entry.pet_name,
          b: byId.get(state.matchup.entry_b_id)?.pet_name || 'their opponent',
          round: roundLabel(c.round.seq, c.bracketSize),
        }
      : null

  return (
    <div className="wrap pet-page">
      <article className="pet-stage">
        <header className="pet-hero" style={tintStyle(tint)}>
          <button type="button" className="pet-hero-open" onClick={() => setPhotoOpen(true)} aria-label={`See ${name}'s photo full size`}>
            {/* Keyed, so a new pet gets a fresh element carrying the morph name. */}
            <PetPhoto key={entry.id} entry={entry} width={1200} contain eager className="vt-photo" />
          </button>
          <a className="pet-back" href="#/gallery">
            <Arrow size={14} /> All pets
          </a>
          <div className="pet-title">
            <div className="pet-title-text">
              <h1 className={`pet-name${nameSize}`} style={{ '--longest': longestWord }}>
                {name}
              </h1>
              <p className="pet-meta">{meta}</p>
            </div>
            <FavoriteButton entry={entry} size={24} />
          </div>
        </header>
        {photoOpen && <PhotoLightbox entry={entry} tint={tint} onClose={() => setPhotoOpen(false)} />}

        <div className="pet-play">
          {/* Who the pet is, first; then where it stands and how to help. */}
          <PetAbout entry={entry} />
          <RoadStrip road={road} name={name} />
          {panel}
          {liveRound && <SprintLine roundId={liveRound.id} />}
          {entry.goal_votes && liveRound ? <GoalLine entry={entry} round={liveRound} /> : null}
          <Milestones name={name} total={contestTotals.get(entry.id)} started={c.rounds.some((r) => r.status !== 'pending')} />
          <PetCheers entry={entry} />
          {ownerToken && (
            <OwnerTools entry={entry} token={ownerToken} round={liveRound} c={c} standing={state} byId={byId} club={milestone(contestTotals.get(entry.id)).earned} />
          )}
          {entry.shelter_id && (
            <div className="adopt-badge">
              <span className="bonus-badge">Adoptable</span>
              <span>
                <strong>{name} is looking for a home.</strong>
                {shelter ? (
                  <>
                    Adoptable from{' '}
                    {shelter.url ? (
                      <a href={shelter.url} target="_blank" rel="noopener noreferrer">
                        {shelter.name}
                      </a>
                    ) : (
                      shelter.name
                    )}
                    .
                  </>
                ) : (
                  'Ask our partner shelters.'
                )}
              </span>
            </div>
          )}
          <ShareTools
            entry={entry}
            contestName={c.contest?.name}
            title={shareTitle}
            before={<LinkPreview entry={entry} contestName={c.contest?.name} sharePage={sharePage} matchup={previewMatchup} />}
            extra={<ShareImageButton entry={entry} owner={Boolean(ownerToken)} />}
            sharePage={sharePage}
            owner={Boolean(ownerToken)}
          />
        </div>
      </article>

      {more.length > 0 && (
        <section className="section" aria-labelledby="more-title">
          <div className="section-head">
            <h2 id="more-title">{states ? 'Still in the running' : 'More pets'}</h2>
            <a className="more" href="#/gallery">
              See them all <Arrow size={14} />
            </a>
          </div>
          <div className="grid">
            {more.map((e) => (
              <PetCard key={e.id} entry={e} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
