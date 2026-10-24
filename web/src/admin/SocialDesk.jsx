import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchEntries, fetchMatchups, fetchRounds, fetchShelters, fetchStats, fetchTotalsByRound } from '../lib/api.js'
import { stamp } from '../lib/datetime.js'
import { PUBLIC_URL } from '../lib/env.js'
import { contestPhase } from '../lib/phase.js'
import { rankOpenRound } from '../lib/rank.js'
import { roundLabel } from '../lib/rounds.js'
import { bubbleRows, currentBracketRound, lastDecidedRound, matchupCards, milestoneCents, roundResults, sampleScenario } from '../lib/graphics/content.js'
import { displayUrl } from '../lib/graphics/layout.js'
import { STAFF_SIZES, buildCards, cardFile, renderCard } from '../lib/graphics/staff.js'
import { captionsFor } from '../lib/graphics/captions.js'
import { toPng } from '../lib/graphics/draw.js'
import { downloadBlob, pause } from '../lib/graphics/save.js'
import { ErrorNote, useAsync, useDesk } from './shared.jsx'
import '../components/graphics.css'

// Ready-to-post images for the promotion calendar (docs/LAUNCH.md section 8):
// the daily leaderboard and bubble, a card per matchup, round results, the
// champion and the shelter total. Public data only, read the way the public
// site reads it, so nothing here can carry an owner's name or email.

const done = (r) => r?.status === 'resolved' || r?.status === 'closed'

async function load(cid) {
  const [rounds, entries, stats, shelters] = await Promise.all([fetchRounds(cid), fetchEntries(cid), fetchStats(cid), fetchShelters(cid)])
  const bracketIds = rounds.filter((r) => r.kind === 'bracket').map((r) => r.id)
  const started = rounds.filter((r) => r.status !== 'pending').map((r) => r.id)
  const [matchups, totals] = await Promise.all([fetchMatchups(bracketIds), fetchTotalsByRound(started)])
  return { rounds, entries, stats, shelters, matchups, totals, at: Date.now() }
}

// What there is to post, from live data.
function liveScene(contest, d) {
  const bracketSize = contest.bracket_size || 16
  const now = d.at
  const { phase } = contestPhase(contest, d.rounds, now)
  const byId = new Map(d.entries.map((e) => [e.id, e]))
  const s = { contest, bracketSize, phase, now, stats: d.stats, shelters: d.shelters }
  const r1 = d.rounds.find((r) => r.seq === 1)
  const bracketStarted = d.rounds.some((r) => r.kind === 'bracket' && r.status !== 'pending')
  if (r1 && (r1.status === 'open' || (done(r1) && !bracketStarted))) {
    s.openRound = r1
    s.ranked = rankOpenRound(d.entries, d.totals.get(r1.id) || new Map())
    if (r1.status === 'open') s.bubble = bubbleRows(s.ranked, bracketSize)
  }
  const br = currentBracketRound(d.rounds, d.matchups)
  if (br) s.bracket = { round: br, label: roundLabel(br.seq, bracketSize), cards: matchupCards(d.matchups, br, d.totals.get(br.id) || new Map(), byId) }
  // Results are news between rounds; once the next round opens, its
  // matchups are. Read off the rounds themselves, not the contest's status.
  const last = lastDecidedRound(d.rounds)
  if (last && !d.rounds.some((r) => r.status === 'open')) {
    s.results = roundResults({ rounds: d.rounds, matchups: d.matchups, entries: d.entries, totals: d.totals.get(last.id) || new Map(), bracketSize })
    // close_round decides the final and completes the contest in one step.
    if (s.results?.final) s.champion = s.results.winners[0] || null
  }
  return s
}

// Every card type at once, on made-up numbers.
function sampleScene(contest, d) {
  const sc = sampleScenario(d.entries, { bracketSize: contest.bracket_size || 16, now: d.at })
  if (!sc) return null
  return {
    contest,
    bracketSize: sc.bracketSize,
    phase: 'voting',
    now: d.at,
    shelters: d.shelters,
    stats: { shelter_cents: sc.shelterCents },
    openRound: sc.openRound,
    ranked: sc.ranked,
    bubble: bubbleRows(sc.ranked, sc.bracketSize),
    bracket: { round: sc.bracketRound, label: roundLabel(2, sc.bracketSize), cards: matchupCards(sc.matchups, sc.bracketRound, sc.bracketTotals, sc.byId) },
    results: sc.results,
    champion: sc.champion,
  }
}

// One preview at a time: a page of thirty cards should not hog the tab.
let chain = Promise.resolve()
const queue = (job) => {
  const p = chain.then(job, job)
  chain = p.catch(() => {})
  return p
}

const PLATFORMS = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['short', 'X and Threads'],
]

// The post's words, from the same numbers as the image: a hook inside the
// platform's fold, the facts, one action. Staff edit before posting.
function CaptionBox({ card, sample }) {
  const captions = useMemo(() => captionsFor(card, { publicUrl: PUBLIC_URL }), [card])
  const [platform, setPlatform] = useState('facebook')
  const [copied, setCopied] = useState(false)
  const box = useRef(null)
  if (!captions) return null
  const text = sample ? `SAMPLE NUMBERS: DO NOT POST\n\n${captions[platform]}` : captions[platform]

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      box.current?.select()
    }
  }

  return (
    <details className="gfx-caption">
      <summary>Caption</summary>
      <div className="chips" role="group" aria-label={`Caption for ${card.label}: platform`}>
        {PLATFORMS.map(([id, name]) => (
          <button key={id} type="button" className="chip" aria-pressed={platform === id} onClick={() => setPlatform(id)}>
            {name}
          </button>
        ))}
      </div>
      <textarea ref={box} readOnly rows={6} value={text} aria-label={`${PLATFORMS.find(([id]) => id === platform)[1]} caption for ${card.label}`} />
      <button type="button" className="btn btn-quiet btn-sm" onClick={copy}>
        {copied ? 'Copied' : 'Copy caption'}
      </button>
    </details>
  )
}

function CardPreview({ card, size, sample, onDownload, busy }) {
  const frame = useRef(null)
  const [drawn, setDrawn] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    queue(() => (alive ? renderCard(card, size, { scale: Math.min(1, (dpr * 280) / size.width), sample }) : null)).then(
      (canvas) => {
        if (!alive || !canvas || !frame.current) return
        canvas.className = 'gfx-canvas'
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', `Preview: ${card.label}`)
        frame.current.replaceChildren(canvas)
        setDrawn(true)
      },
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [card, size, sample])
  return (
    <figure className="gfx-card">
      <div ref={frame} className={`gfx-frame${drawn ? '' : ' skeleton'}`} style={{ aspectRatio: `${size.width} / ${size.height}` }} />
      <figcaption>{failed ? `${card.label} (preview failed)` : card.label}</figcaption>
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => onDownload([card])} disabled={busy}>
        Download
      </button>
      <CaptionBox card={card} sample={sample} />
    </figure>
  )
}

export default function SocialDesk() {
  const { contest, reloadContest } = useDesk()
  const [nonce, setNonce] = useState(0)
  const refresh = () => {
    setNonce((n) => n + 1)
    // The contest's status drives the wording ("Vote at" or "Follow along").
    reloadContest?.()
  }
  const data = useAsync(() => load(contest.id), [contest.id, nonce])
  const [sizeId, setSizeId] = useState('square')
  const [sample, setSample] = useState(false)
  const [rounded, setRounded] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const size = STAFF_SIZES.find((s) => s.id === sizeId)
  const where = displayUrl(PUBLIC_URL)

  const groups = useMemo(() => {
    if (!data.data) return []
    const s = sample ? sampleScene(contest, data.data) : liveScene(contest, data.data)
    if (!s) return []
    const cents = s.stats?.shelter_cents || 0
    return buildCards({ ...s, where, milestone: rounded, milestoneCents: milestoneCents(cents) })
  }, [data.data, contest, sample, rounded, where])
  const all = groups.flatMap((g) => g.cards)

  async function download(cards) {
    setError(null)
    try {
      for (const [i, card] of cards.entries()) {
        setProgress({ done: i, total: cards.length })
        const canvas = await renderCard(card, size, { scale: 1, sample })
        downloadBlob(await toPng(canvas), cardFile(card, size, sample))
        // Browsers drop downloads fired back to back.
        if (i < cards.length - 1) await pause(450)
      }
    } catch (e) {
      setError(e)
    } finally {
      setProgress(null)
    }
  }

  const busy = Boolean(progress)
  const loading = data.loading && !data.data
  return (
    <div className="stack">
      <div className="panel-head">
        <h2>Social graphics</h2>
        <div className="chips" role="group" aria-label="Image size">
          {STAFF_SIZES.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={s.id === sizeId} onClick={() => setSizeId(s.id)}>
              {s.label} {s.width}×{s.height}
            </button>
          ))}
        </div>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Posts for the promotion calendar, drawn from the public numbers, each with a caption to copy for Facebook, Instagram, or X
        and Threads. Vote counts are as of{' '}
        {data.data ? stamp(data.data.at) : '…'}; refresh right before you download.
      </p>
      <div className="gfx-toolbar">
        <button type="button" className="btn btn-quiet btn-sm" onClick={refresh} disabled={data.loading || busy}>
          {data.loading ? 'Refreshing…' : 'Refresh numbers'}
        </button>
        <label>
          <input type="checkbox" checked={rounded} onChange={(e) => setRounded(e.target.checked)} /> Round the shelter total down to a milestone
        </label>
        <label>
          <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} /> Preview every layout with sample numbers
        </label>
        <span className="desk-spacer" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => download(all)} disabled={busy || !all.length}>
          {progress ? `Downloading ${progress.done + 1} of ${progress.total}…` : `Download all (${all.length})`}
        </button>
      </div>
      {sample && (
        <div className="notice warn" role="status">
          <span>
            <strong>Sample numbers.</strong> Real pets, made-up votes and results, so you can check every layout. Each image carries a red
            &ldquo;do not post&rdquo; band and its file name starts with &ldquo;sample&rdquo;.
          </span>
        </div>
      )}
      <ErrorNote error={error || data.error} />
      {loading && <p className="muted">Loading the numbers…</p>}
      {!loading && !groups.length && (
        <div className="notice">
          <span>
            <strong>Nothing to post yet.</strong> Leaderboard cards appear when the Open Round opens, matchup cards once the bracket is built,
            and the shelter total after the first vote pack sells. Tick &ldquo;sample numbers&rdquo; to preview the layouts now.
          </span>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.key} className="gfx-group" aria-labelledby={`gfx-${g.key}`}>
          <div className="gfx-group-head">
            <h3 id={`gfx-${g.key}`}>{g.title}</h3>
            {g.cards.length > 1 && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => download(g.cards)} disabled={busy}>
                Download these ({g.cards.length})
              </button>
            )}
          </div>
          <div className="gfx-grid">
            {g.cards.map((card) => (
              <CardPreview key={card.key} card={card} size={size} sample={sample} onDownload={download} busy={busy} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
