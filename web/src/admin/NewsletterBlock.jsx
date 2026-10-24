import { useRef, useState } from 'react'
import { SPONSORS } from '../config.js'
import { fetchBonusWindows, fetchEntriesByAge, fetchEntriesByIds, fetchMatchups, fetchRounds, fetchStats, fetchTotals } from '../lib/api.js'
import { APP_BASE, PUBLIC_URL } from '../lib/env.js'
import { TIME_ZONE, apTime, fmtInt } from '../lib/format.js'
import { NOPTIN_LIMIT, buildNewsletterBlock } from '../lib/newsletter.js'
import { contestPhase } from '../lib/phase.js'
import { entryPhotoUrl } from '../lib/photos.js'
import { closestMatchup, leaderIds, topOpenRound } from '../lib/widget.js'
import { ErrorNote, useDesk } from './shared.jsx'

const EDITIONS = ['morning', 'afternoon', 'events', 'sports']

// The block's numbers come from the public reads, the same ones the contest
// page uses, so nothing staff-only can end up in a newsletter.
async function pairsFor(roundId) {
  const rows = await fetchMatchups([roundId])
  const ids = [...new Set(rows.flatMap((m) => [m.entry_a_id, m.entry_b_id]).filter(Boolean))]
  const byId = new Map((await fetchEntriesByIds(ids)).map((e) => [e.id, e]))
  // A matchup missing a side (a disqualified pet) is left out, as on the widget.
  return {
    rows: rows.filter((m) => byId.has(m.entry_a_id) && byId.has(m.entry_b_id)),
    byId,
  }
}

export async function gatherNewsletter(contest, now = Date.now()) {
  const cid = contest.id
  const [rounds, stats, windows] = await Promise.all([fetchRounds(cid), fetchStats(cid), fetchBonusWindows(cid)])
  const { phase, round, nextRound } = contestPhase(contest, rounds, now)
  const model = { contest, phase, round, nextRound, stats, windows, now }
  const sizes = new Map()
  const want = (entry, size) =>
    entry &&
    sizes.set(entry.id, {
      entry,
      size: Math.max(size, sizes.get(entry.id)?.size || 0),
    })

  if (phase === 'coming' || phase === 'submissions' || phase === 'submissions_closed') {
    model.recent = await fetchEntriesByAge(cid, 3, { newest: true })
    model.recent.forEach((e) => want(e, 96))
  } else if ((phase === 'voting' || phase === 'counting') && round.seq === 1) {
    const totals = await fetchTotals(round.id)
    const [leaders, earliest] = await Promise.all([fetchEntriesByIds(leaderIds(totals)), fetchEntriesByAge(cid, 5)])
    model.leaders = topOpenRound(totals, [...leaders, ...earliest])
    want(model.leaders[0]?.entry, 96) // only the leader has a photo
  } else if (phase === 'voting' || phase === 'counting') {
    const [totals, { rows, byId }] = await Promise.all([fetchTotals(round.id), pairsFor(round.id)])
    const v = (id) => totals.get(id)?.votes || 0
    model.matchups = rows.map((m) => ({
      a: byId.get(m.entry_a_id),
      b: byId.get(m.entry_b_id),
      va: v(m.entry_a_id),
      vb: v(m.entry_b_id),
    }))
    const close = closestMatchup(rows, totals, byId)
    model.hero = close ? rows.indexOf(close) : null
    if (model.hero != null) {
      want(model.matchups[model.hero].a, 120)
      want(model.matchups[model.hero].b, 120)
    }
  } else if (phase === 'intermission' && nextRound) {
    const { rows, byId } = await pairsFor(nextRound.id)
    model.matchups = rows.map((m) => ({
      a: byId.get(m.entry_a_id),
      b: byId.get(m.entry_b_id),
      va: null,
      vb: null,
    }))
  } else if (phase === 'complete') {
    const final = [...rounds].sort((x, y) => y.seq - x.seq)[0]
    if (final) {
      const [totals, { rows, byId }] = await Promise.all([fetchTotals(final.id), pairsFor(final.id)])
      const m = rows.find((x) => x.winner_entry_id)
      if (m) {
        const loserId = m.winner_entry_id === m.entry_a_id ? m.entry_b_id : m.entry_a_id
        model.champion = {
          winner: byId.get(m.winner_entry_id),
          runnerUp: byId.get(loserId) || null,
          vw: totals.get(m.winner_entry_id)?.votes || 0,
          vr: totals.get(loserId)?.votes || 0,
        }
        want(model.champion.winner, 200)
      }
    }
  }

  // Each photo's real proportions, so the email can crop it square without
  // object-fit (see photoBox).
  const measured = await Promise.all(
    [...sizes.values()].map(async ({ entry, size }) => [entry.id, await measure(entryPhotoUrl(entry, { width: size * 2 }))]),
  )
  model.photos = new Map(measured)
  return model
}

function measure(src, timeout = 8000) {
  if (!src) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    const done = (v) => {
      clearTimeout(timer)
      resolve(v)
    }
    const timer = setTimeout(() => done({ src }), timeout)
    img.onload = () => done({ src, w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => done({ src })
    img.src = src
  })
}

const centralDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(d)
const centralHour = (d = new Date()) =>
  Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(d),
  )

const PREVIEW_HEAD =
  '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" ' +
  'href="https://fonts.googleapis.com/css2?family=Merriweather:wght@700&family=Oswald:wght@600;700&family=Source+Sans+3:wght@400;700&display=swap">' +
  '</head><body style="margin:0;padding:16px 0;background:#f6f2e9;">'

export default function NewsletterBlock() {
  const { contest } = useDesk()
  const [edition, setEdition] = useState(() => (centralHour() < 12 ? 'morning' : 'afternoon'))
  const [date, setDate] = useState(() => centralDate())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState('')
  const frame = useRef(null)
  const campaign = `${edition}-${date}`
  const linksToPages = PUBLIC_URL === APP_BASE

  async function build() {
    setBusy(true)
    setError(null)
    setCopied('')
    try {
      const now = Date.now()
      const model = await gatherNewsletter(contest, now)
      const html = buildNewsletterBlock(model, {
        base: PUBLIC_URL,
        campaign,
        sponsor: SPONSORS.presenting,
      })
      setResult({ html, now, phase: model.phase, campaign })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.html)
      setCopied('Copied. Paste it into a Custom HTML block in the Noptin draft.')
    } catch {
      setCopied('The browser blocked the clipboard. Open “HTML” below and copy it from there.')
    }
  }

  function fit() {
    const doc = frame.current?.contentDocument
    if (doc?.body) frame.current.style.height = `${doc.documentElement.scrollHeight}px`
  }

  const size = result?.html?.length || 0
  return (
    <section className="card plain">
      <h3 style={{ marginTop: 0 }}>Newsletter block</h3>
      <p className="small">
        A contest section for the daily newsletters, built from the live numbers: entries, the Open Round leaders, the closest matchup, the
        champion, whatever the contest is doing. Build it when you build the newsletter; it is a snapshot, and says so.
      </p>
      <div className="window-form" style={{ marginBottom: 10 }}>
        <label>
          <span className="label">Edition</span>
          <select value={edition} onChange={(e) => setEdition(e.target.value)}>
            {EDITIONS.map((x) => (
              <option key={x} value={x}>
                {x[0].toUpperCase() + x.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <div className="tool-row" style={{ alignSelf: 'end' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={build} disabled={busy || !date}>
            {busy ? 'Building…' : result ? 'Rebuild' : 'Build block'}
          </button>
        </div>
      </div>
      <p className="small muted">
        Links are tagged <code>utm_campaign={campaign}</code>, as the newsletter tags its own.
        {linksToPages && ' VITE_PUBLIC_URL is not set, so they go to the GitHub Pages copy instead of the WPR contest page.'}
      </p>
      <ErrorNote error={error} />
      {result && !result.html && <p className="small">Nothing to put in a newsletter yet: the contest is not public.</p>}
      {result?.html && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="tool-row">
            <button type="button" className="btn btn-quiet btn-sm" onClick={copy}>
              Copy HTML
            </button>
            <span className={`small ${size > NOPTIN_LIMIT ? 'bad' : 'muted'}`}>
              Built at {apTime(result.now)} · {fmtInt(size)} characters
              {size > NOPTIN_LIMIT ? `, over Noptin’s ${fmtInt(NOPTIN_LIMIT)} per block. Split it or it may arrive blank.` : ''}
            </span>
          </div>
          <p className="small" role="status">
            {copied}
          </p>
          <iframe
            ref={frame}
            title="Newsletter block preview"
            srcDoc={PREVIEW_HEAD + result.html + '</body></html>'}
            sandbox="allow-same-origin"
            onLoad={fit}
            style={{
              width: '100%',
              maxWidth: 640,
              height: 600,
              border: '1px solid var(--rule)',
              borderRadius: 8,
              background: '#f6f2e9',
            }}
          />
          <details>
            <summary className="small">HTML</summary>
            <textarea
              readOnly
              value={result.html}
              rows={8}
              style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 12 }}
              onFocus={(e) => e.target.select()}
            />
          </details>
        </div>
      )}
    </section>
  )
}
