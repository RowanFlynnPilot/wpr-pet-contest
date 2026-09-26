import { useMemo } from 'react'
import { useContest } from '../components/ContestContext.jsx'
import PetPhoto from '../components/PetPhoto.jsx'
import PetCard from '../components/PetCard.jsx'
import ShareTools from '../components/ShareTools.jsx'
import VoteButton from '../components/VoteButton.jsx'
import Countdown from '../components/Countdown.jsx'
import { fetchEntry } from '../lib/api.js'
import { entryStates } from '../lib/bracketState.js'
import { useBracket, useEntries, useRoundTotals } from '../lib/data.js'
import { apDate, fmtInt, fmtMoney, plural } from '../lib/format.js'
import { useDocumentTitle } from '../lib/hooks.js'
import { useLive } from '../lib/live.js'
import { cheapestPerVote } from '../lib/packs.js'
import { cutline, matchupStanding, rankOpenRound } from '../lib/rank.js'
import { roundLabel } from '../lib/rounds.js'

const SPECIES = { dog: 'Dog', cat: 'Cat', other: 'Other' }

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

function OpenRoundPanel({ c, entry, entries }) {
  const { totals, loading } = useRoundTotals(c.round.id)
  const ranked = useMemo(() => rankOpenRound(entries, totals), [entries, totals])
  const votes = totals.get(entry.id)?.votes || 0
  const line = cutline(ranked, entry.id, c.bracketSize)
  const label = roundLabel(c.round.seq, c.bracketSize)
  const voting = c.phase === 'voting'
  return (
    <div className="card vote-panel">
      <p className="kicker">{label} · this round&rsquo;s votes</p>
      <div className="big-votes" aria-live="polite">
        <span className="n">{loading ? '–' : fmtInt(votes)}</span>
        <span className="u">{votes === 1 ? 'vote' : 'votes'}</span>
      </div>
      {line && (
        <p className={`standing${line.qualifying ? '' : ' behind'}`}>
          <strong>
            #{line.rank} of {fmtInt(line.total)}
          </strong>
          {line.qualifying
            ? line.margin != null
              ? ` · in the top ${c.bracketSize}. The first pet out needs ${plural(line.margin, 'vote')} to pass.`
              : ` · in the top ${c.bracketSize}.`
            : ` · ${plural(line.needed, 'vote')} to crack the top ${c.bracketSize}.`}
        </p>
      )}
      {voting ? (
        <>
          <VoteButton entry={entry} round={c.round} className="btn btn-primary btn-lg btn-block">
            Vote for {entry.pet_name}
          </VoteButton>
          <Countdown to={c.round.closes_at} label={`${label} closes in`} />
          <PriceHint packs={c.packs} />
        </>
      ) : (
        <p className="small muted" style={{ marginTop: 12 }}>
          Voting for the {label} has closed. Results are finalized shortly after the deadline.
        </p>
      )}
    </div>
  )
}

function BracketPanel({ c, entry, entries, byId }) {
  const openId = c.phase === 'voting' ? c.round?.id : null
  const { matchups, totalsByRound, loading } = useBracket(c.rounds, { openRoundId: openId })
  const r1 = c.rounds.find((r) => r.seq === 1)
  const r1Totals = useRoundTotals(r1 && entry.seed == null ? r1.id : null, { live: false })
  const states = useMemo(() => entryStates(entries.length ? entries : [entry], c.rounds, matchups, c.bracketSize), [entries, entry, c.rounds, matchups, c.bracketSize])
  const s = states.get(entry.id)

  if (loading) return <div className="card vote-panel skeleton" style={{ height: 180 }} />

  if (!s || s.status === 'unseeded') {
    const rank = rankOpenRound(entries, r1Totals.totals).find((r) => r.entry.id === entry.id)
    return (
      <div className="card plain vote-panel">
        <p className="kicker">Open Round</p>
        <p style={{ fontSize: 17, margin: 0 }}>
          {entry.pet_name} {rank ? `finished #${rank.rank} in the Open Round` : 'competed in the Open Round'} and didn&rsquo;t make the
          bracket this year. Thanks for playing, {entry.pet_name}!
        </p>
      </div>
    )
  }
  if (s.status === 'champion') {
    return (
      <div className="card sun vote-panel">
        <p className="kicker sun">{c.contest.year} champion</p>
        <p style={{ fontSize: 18, margin: 0 }}>
          {entry.pet_name} is the <strong>{c.contest.name}</strong>. <a href="#/results">See the final bracket</a>.
        </p>
      </div>
    )
  }

  const m = s.matchup
  const round = c.rounds.find((r) => r.id === m.round_id)
  const label = roundLabel(round.seq, c.bracketSize)
  const st = matchupStanding(m, totalsByRound.get(m.round_id) || new Map(), byId)
  const me = st.a.id === entry.id ? st.a : st.b
  const opp = st.a.id === entry.id ? st.b : st.a
  const meKey = st.a.id === entry.id ? 'a' : 'b'
  const live = c.phase === 'voting' && c.round?.id === round.id
  const leading = st.leader === meKey
  const total = me.votes + opp.votes
  const pct = total ? Math.round((me.votes / total) * 100) : 50

  if (s.status === 'out') {
    return (
      <div className="card plain vote-panel">
        <p className="kicker">{label}</p>
        <p style={{ fontSize: 17, margin: 0 }}>
          {entry.pet_name} was knocked out in the {label} by{' '}
          <a href={`#/pet/${opp.id}`}>{opp.entry?.pet_name || 'their opponent'}</a>, {fmtInt(me.votes)} to {fmtInt(opp.votes)}. What a run!
        </p>
      </div>
    )
  }

  return (
    <div className={`card vote-panel${live ? '' : ' plain'}`}>
      <p className="kicker">
        {label} · seed {entry.seed} vs. seed {opp.seed ?? '–'}
      </p>
      <div className="h2h">
        {[me, opp].map((side) => (
          <a className="h2h-row" key={side.id} href={`#/pet/${side.id}`} aria-current={side.id === entry.id ? 'page' : undefined}>
            <PetPhoto entry={side.entry} width={160} square alt="" />
            <span>
              <span className="h2h-name">{side.entry?.pet_name}</span>
              <span className="h2h-seed" style={{ display: 'block' }}>
                Seed {side.seed} · {side.entry?.town}
              </span>
            </span>
            <span className="h2h-votes">{live || m.winner_entry_id || round.status !== 'pending' ? fmtInt(side.votes) : '0'}</span>
          </a>
        ))}
        <div className="tug" role="img" aria-label={`${entry.pet_name} has ${pct}% of the votes in this matchup`}>
          <span className="a" style={{ width: `${pct}%` }} />
          <span className="b" style={{ width: `${100 - pct}%` }} />
        </div>
      </div>
      {round.status === 'pending' ? (
        <p className="standing">Both pets start at zero when the {label} opens.</p>
      ) : (
        <p className={`standing${leading ? '' : ' behind'}`}>
          {leading ? (
            <>
              <strong>Leading</strong>
              {st.tied ? ` on the tiebreak (better seed). One vote for ${opp.entry?.pet_name} flips it.` : ` by ${plural(me.votes - opp.votes, 'vote')}.`}
            </>
          ) : (
            <>
              <strong>{plural(st.toTake, 'vote')} behind</strong>
              {st.tied ? ` — tied, and ${opp.entry?.pet_name} wins ties as the better seed.` : ` ${opp.entry?.pet_name}.`}
            </>
          )}
        </p>
      )}
      {live && (
        <>
          <VoteButton entry={entry} round={round} className="btn btn-primary btn-lg btn-block">
            Vote for {entry.pet_name}
          </VoteButton>
          <Countdown to={round.closes_at} label={`${label} closes in`} />
          <PriceHint packs={c.packs} />
        </>
      )}
    </div>
  )
}

function WaitingPanel({ c, entry }) {
  return (
    <div className="card vote-panel">
      <p className="kicker">Voting opens soon</p>
      <p style={{ fontSize: 17, margin: 0 }}>
        {c.phase === 'submissions'
          ? `Voting starts after entries close ${apDate(c.contest.submissions_close_at)}. Share ${entry.pet_name}'s page now so friends are ready.`
          : `The Open Round opens soon. Share ${entry.pet_name}'s page so friends are ready.`}
      </p>
    </div>
  )
}

export default function Pet({ route }) {
  const c = useContest()
  const { entries, byId, loading } = useEntries(c.contest?.id)
  const fromList = byId.get(route.id)
  const single = useLive(fromList ? null : `entry:${route.id}`, () => fetchEntry(route.id), 0)
  const entry = fromList || single.data || null
  useDocumentTitle(entry ? `Vote for ${entry.pet_name} — Wausau Pilot & Review` : 'Pet — Wausau Pilot & Review')

  const shelter = entry?.shelter_id ? c.shelters.find((s) => s.id === entry.shelter_id) : null
  const inBracket = c.rounds.some((r) => r.kind === 'bracket')
  const more = useMemo(() => {
    if (!entry || !entries.length) return []
    const i = entries.findIndex((e) => e.id === entry.id)
    const rest = [...entries.slice(i + 1), ...entries.slice(0, Math.max(0, i))]
    return rest.slice(0, 4)
  }, [entries, entry])

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
          <div className="pet-layout" aria-busy="true">
            <div className="skeleton" style={{ aspectRatio: '4 / 5' }} />
            <div>
              <div className="skeleton" style={{ height: 60, width: '70%' }} />
              <div className="skeleton" style={{ height: 20, width: '40%', marginTop: 12 }} />
            </div>
          </div>
        )}
      </div>
    )
  }

  let panel
  if (inBracket) panel = <BracketPanel c={c} entry={entry} entries={entries} byId={byId} />
  else if (c.round?.kind === 'open' && ['voting', 'counting'].includes(c.phase)) panel = <OpenRoundPanel c={c} entry={entry} entries={entries} />
  else if (c.phase === 'complete') panel = null
  else panel = <WaitingPanel c={c} entry={entry} />

  return (
    <div className="wrap">
      <p style={{ margin: '16px 0 0' }}>
        <a href="#/gallery" style={{ fontWeight: 700, fontSize: 14 }}>
          ← All pets
        </a>
      </p>
      <article className="pet-layout">
        <div className="pet-photo">
          <PetPhoto entry={entry} width={1200} contain eager />
        </div>
        <div>
          <p className="kicker">{c.contest?.name || 'Pet contest'}</p>
          <h1 className="pet-name">{entry.pet_name}</h1>
          <div className="pet-sub">
            <span>{entry.town}</span>
            <span aria-hidden="true">·</span>
            <span>{SPECIES[entry.species] || 'Pet'}</span>
            {entry.seed != null && (
              <>
                <span aria-hidden="true">·</span>
                <span>Seed {entry.seed}</span>
              </>
            )}
          </div>
          {entry.caption && <p className="caption">{entry.caption}</p>}
          {entry.shelter_id && (
            <div className="adopt-badge">
              <span className="bonus-badge">Adoptable</span>
              <span>
                <strong>{entry.pet_name} is looking for a home.</strong>
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
          {panel}
          <ShareTools entry={entry} contestName={c.contest?.name} title={`Share ${entry.pet_name} and get more votes`} />
        </div>
      </article>

      {more.length > 0 && (
        <section className="section" aria-labelledby="more-title">
          <div className="section-head">
            <h2 id="more-title">More pets</h2>
            <a className="more" href="#/gallery">
              See them all →
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
