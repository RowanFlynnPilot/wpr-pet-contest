import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { SPONSORS } from '../config.js'
import { useContest } from '../components/ContestContext.jsx'
import PetCard from '../components/PetCard.jsx'
import Sponsor from '../components/Sponsor.jsx'
import { Heart, Search } from '../components/Icons.jsx'
import { useBracket, useEntries, useRoundTotals } from '../lib/data.js'
import { entryStates } from '../lib/bracketState.js'
import { useFavorites } from '../lib/favorites.js'
import { fmtInt } from '../lib/format.js'
import { useDocumentTitle, useMediaQuery } from '../lib/hooks.js'
import { rankOpenRound } from '../lib/rank.js'
import { roundLabel } from '../lib/rounds.js'

const PAGE = 48
const fold = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function useIncremental(total, resetKey) {
  const [shown, setShown] = useState(PAGE)
  const sentinel = useRef(null)
  const [prevKey, setPrevKey] = useState(resetKey)
  if (prevKey !== resetKey) {
    setPrevKey(resetKey)
    setShown(PAGE)
  }
  useEffect(() => {
    const el = sentinel.current
    if (!el || shown >= total || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((items) => {
      if (items.some((i) => i.isIntersecting)) setShown((n) => n + PAGE)
    }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [shown, total])
  return { shown, more: () => setShown((n) => n + PAGE), sentinel }
}

export default function Gallery() {
  const c = useContest()
  const { entries, loading } = useEntries(c.contest?.id)
  const round1 = c.rounds.find((r) => r.seq === 1)
  const inBracket = c.rounds.some((r) => r.kind === 'bracket')
  const openLive = !inBracket && round1 && ['voting', 'counting'].includes(c.phase) && c.round?.id === round1.id
  const bracketOpenId = inBracket && c.phase === 'voting' ? c.round?.id : null
  const { matchups } = useBracket(inBracket ? c.rounds : [], { openRoundId: bracketOpenId })

  const r1 = useRoundTotals(round1 && (openLive || inBracket || c.phase === 'complete') ? round1.id : null, { live: openLive })
  const current = useRoundTotals(bracketOpenId)

  const ranked = useMemo(() => rankOpenRound(entries, r1.totals), [entries, r1.totals])
  const rankOf = useMemo(() => new Map(ranked.map((r) => [r.entry.id, r.rank])), [ranked])
  const states = useMemo(() => (inBracket ? entryStates(entries, c.rounds, matchups, c.bracketSize) : null), [inBracket, entries, c.rounds, matchups, c.bracketSize])
  // Pets with something to vote on: both sides of a current matchup are in
  // the field. A side that is not was disqualified, and the other walks over.
  const inCurrent = useMemo(() => {
    const listed = new Set(entries.map((e) => e.id))
    const ids = new Set()
    for (const m of matchups) {
      if (m.round_id === bracketOpenId && listed.has(m.entry_a_id) && listed.has(m.entry_b_id)) ids.add(m.entry_a_id).add(m.entry_b_id)
    }
    return ids
  }, [matchups, bracketOpenId, entries])

  const [q, setQ] = useState('')
  const [species, setSpecies] = useState('all')
  const [town, setTown] = useState('')
  const [statusPick, setStatus] = useState(null)
  const status = statusPick ?? (inBracket ? 'alive' : 'all')
  const defaultSort = inBracket ? 'seed' : openLive || c.phase === 'complete' ? 'votes' : 'newest'
  const [sort, setSort] = useState(null)
  const sortBy = sort || defaultSort
  // Favorites, kept on this device. While the filter is on, a pet un-hearted
  // here stays in view until the filter is toggled, so the card (and focus)
  // does not vanish from under the reader's finger.
  const favIds = useFavorites(c.contest?.id)
  const [favOnly, setFavOnly] = useState(false)
  const [favKept, setFavKept] = useState(null)
  const favSet = useMemo(() => new Set(favIds), [favIds])
  const favCount = useMemo(() => entries.filter((e) => favSet.has(e.id)).length, [entries, favSet])
  function toggleFavOnly() {
    setFavKept(favOnly ? null : favSet)
    setFavOnly(!favOnly)
  }
  useDocumentTitle('The pets — Wausau Pilot & Review')

  const towns = useMemo(() => [...new Set(entries.map((e) => e.town))].sort((a, b) => a.localeCompare(b)), [entries])
  const speciesCount = useMemo(() => {
    const n = { all: entries.length, dog: 0, cat: 0, other: 0 }
    for (const e of entries) n[e.species] = (n[e.species] || 0) + 1
    return n
  }, [entries])

  const list = useMemo(() => {
    const needle = fold(q.trim())
    let out = entries.filter(
      (e) =>
        (species === 'all' || e.species === species) &&
        (!town || e.town === town) &&
        (!favOnly || favSet.has(e.id) || favKept?.has(e.id)) &&
        (!needle || fold(e.pet_name).includes(needle) || fold(e.town).includes(needle)),
    )
    if (states && status !== 'all') {
      out = out.filter((e) => {
        const s = states.get(e.id)?.status
        return status === 'alive' ? s === 'alive' || s === 'champion' : s === 'out' || s === 'unseeded'
      })
    }
    const byVotes = (a, b) => (rankOf.get(a.id) ?? 1e9) - (rankOf.get(b.id) ?? 1e9)
    const sorters = {
      votes: byVotes,
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      az: (a, b) => a.pet_name.localeCompare(b.pet_name),
      seed: (a, b) => (a.seed ?? 1e9) - (b.seed ?? 1e9) || byVotes(a, b),
    }
    return [...out].sort(sorters[sortBy] || byVotes)
  }, [entries, q, species, town, favOnly, favSet, favKept, status, states, sortBy, rankOf])

  const resetKey = `${q}|${species}|${town}|${favOnly}|${status}|${sortBy}`
  // The Open Round leader leads the grid, unfiltered and sorted by votes.
  const featureLeader = openLive && sortBy === 'votes' && !q && species === 'all' && !town && !favOnly
  const { shown, more, sentinel } = useIncremental(list.length, resetKey)
  // Photos first: the sponsor sits after the first full row, whatever the
  // column count (the featured card takes two cells).
  const four = useMediaQuery('(min-width: 980px)')
  const three = useMediaQuery('(min-width: 640px)')
  const cols = four ? 4 : three ? 3 : 2
  const sponsorAfter = (featureLeader ? cols - 1 : cols) - 1
  const sponsor = <Sponsor sponsor={SPONSORS.gallery} slot="gallery" full />
  const cut = c.bracketSize
  const currentLabel = c.round ? roundLabel(c.round.seq, c.bracketSize) : null

  function cardProps(e) {
    if (openLive) {
      return {
        votes: r1.totals.get(e.id)?.votes || 0,
        rank: rankOf.get(e.id),
        voteRound: c.phase === 'voting' ? c.round : null,
      }
    }
    if (states) {
      const s = states.get(e.id)
      const live = inCurrent.has(e.id)
      const base = { seed: e.seed ?? undefined }
      if (s?.status === 'champion') return { ...base, state: { label: 'Champion', alive: true } }
      if (s?.status === 'alive')
        return {
          ...base,
          votes: live ? current.totals.get(e.id)?.votes || 0 : undefined,
          voteRound: live ? c.round : null,
          state: { label: s.short || 'In', alive: true },
        }
      if (s?.status === 'out') return { ...base, state: { label: 'Out', out: true, note: `Out in the ${s.label}` } }
      return { state: { label: 'Out', out: true, note: rankOf.get(e.id) ? `Open Round: #${rankOf.get(e.id)}` : 'Open Round' } }
    }
    if (c.phase === 'complete') return { votes: r1.totals.get(e.id)?.votes || 0, rank: rankOf.get(e.id) }
    return {}
  }

  const heading =
    c.phase === 'submissions' || c.phase === 'coming'
      ? 'Meet the entrants'
      : c.phase === 'submissions_closed'
        ? 'The field is set'
        : openLive
          ? `${currentLabel}: vote for your favorite`
          : inBracket
            ? 'Every pet in the contest'
            : 'The pets'

  return (
    <div className="wrap section" style={{ paddingTop: 24 }}>
      <div className="section-head">
        <div>
          <h1 style={{ fontSize: 'clamp(30px, 6vw, 46px)' }}>{heading}</h1>
          <p className="section-count">
            {fmtInt(entries.length)} {entries.length === 1 ? 'pet' : 'pets'}
            {openLive && ' · counts update live'}
          </p>
          {openLive && (
            <p className="dek">
              The top {cut} when the {currentLabel} closes make the bracket. Totals reset every round.
            </p>
          )}
          {inBracket && (
            <p className="dek">
              {cut} pets made the bracket. <a href="#/bracket">See the matchups</a>.
            </p>
          )}
        </div>
      </div>

      <div className="gallery-tools" role="search">
        <div className="search">
          <label className="sr-only" htmlFor="gallery-q">
            Search pets by name or town
          </label>
          <Search />
          <input id="gallery-q" type="search" placeholder="Search by name or town" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="tool-row">
          <label className="sr-only" htmlFor="gallery-town">
            Town
          </label>
          <select id="gallery-town" value={town} onChange={(e) => setTown(e.target.value)}>
            <option value="">All towns</option>
            {towns.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="gallery-sort">
            Sort
          </label>
          <select id="gallery-sort" value={sortBy} onChange={(e) => setSort(e.target.value)}>
            {inBracket && <option value="seed">By seed</option>}
            {(openLive || inBracket || c.phase === 'complete') && <option value="votes">{inBracket ? 'Open Round finish' : 'Most votes'}</option>}
            <option value="newest">Newest</option>
            <option value="az">A–Z</option>
          </select>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 12 }} role="group" aria-label="Filter pets">
        {[
          ['all', 'All'],
          ['dog', 'Dogs'],
          ['cat', 'Cats'],
          ['other', 'Others'],
        ].map(([key, text]) => (
          <button key={key} type="button" className="chip" aria-pressed={species === key} onClick={() => setSpecies(key)}>
            {text} <span className="count">{speciesCount[key] || 0}</span>
          </button>
        ))}
        {states && (
          <>
            <span aria-hidden="true" style={{ width: 8 }} />
            {[
              ['alive', 'Still in'],
              ['out', 'Out'],
              ['all', 'Everyone'],
            ].map(([key, text]) => (
              <button key={key} type="button" className="chip" aria-pressed={status === key} onClick={() => setStatus(key)}>
                {text}
              </button>
            ))}
          </>
        )}
        <span aria-hidden="true" style={{ width: 8 }} />
        <button type="button" className="chip" aria-pressed={favOnly} onClick={toggleFavOnly}>
          <Heart size={15} filled={favOnly} /> Favorites <span className="count">{favCount}</span>
        </button>
      </div>

      {openLive && (
        <p className="legend">
          <span>
            <i style={{ background: 'var(--sun)' }} />
            Top 3
          </span>
          <span>
            <i style={{ background: 'var(--teal-ink)' }} />
            In the top {cut}: on track for the bracket
          </span>
        </p>
      )}

      <p className="sr-only" aria-live="polite">
        {list.length} {list.length === 1 ? 'pet' : 'pets'} shown
      </p>

      {loading ? (
        <div className="grid" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: '4 / 6' }} />
          ))}
        </div>
      ) : favOnly && list.length === 0 && favCount === 0 ? (
        <div className="empty">
          <h2>No favorites yet.</h2>
          <p>Tap the heart on any pet to keep it here. Saved on this device only.</p>
          <button type="button" className="btn btn-quiet" style={{ marginTop: 6 }} onClick={toggleFavOnly}>
            See every pet
          </button>
          <div style={{ marginTop: 16 }}>{sponsor}</div>
        </div>
      ) : list.length === 0 ? (
        <div className="empty">
          <h3>{!entries.length ? 'No pets yet.' : favOnly ? 'None of your favorites match that search.' : 'No pets match that search.'}</h3>
          <p>
            {entries.length ? (
              'Try a different name or town.'
            ) : c.phase === 'submissions' ? (
              <>
                Be the first! <a href="#/enter">Enter your pet</a>.
              </>
            ) : (
              'Check back soon.'
            )}
          </p>
          <div style={{ marginTop: 16 }}>{sponsor}</div>
        </div>
      ) : (
        <>
          <div className="grid">
            {list.slice(0, shown).map((e, i) => (
              <Fragment key={e.id}>
                <PetCard
                  entry={e}
                  cut={cut}
                  eager={i < 4}
                  adoptable={Boolean(e.shelter_id)}
                  level={2}
                  featured={i === 0 && featureLeader}
                  {...cardProps(e)}
                />
                {(i === sponsorAfter || (i === list.length - 1 && i < sponsorAfter)) && <div className="grid-break">{sponsor}</div>}
              </Fragment>
            ))}
          </div>
          {shown < list.length && (
            <div className="load-more" ref={sentinel}>
              <button type="button" className="btn btn-quiet" onClick={more}>
                Show more pets
              </button>
              <span>
                Showing {fmtInt(Math.min(shown, list.length))} of {fmtInt(list.length)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
