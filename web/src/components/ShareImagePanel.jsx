import { useEffect, useRef, useState } from 'react'
import { PUBLIC_URL } from '../lib/env.js'
import { ownerLink, petPublicUrl, shareText } from '../lib/share.js'
import { track } from '../lib/analytics.js'
import { keepsakeCopy, ownerCopy } from '../lib/graphics/content.js'
import { displayUrl, fileName } from '../lib/graphics/layout.js'
import { OWNER_FORMATS, renderOwner } from '../lib/graphics/owner.js'
import { toPng } from '../lib/graphics/draw.js'
import { downloadBlob, shareableFile, shareFile } from '../lib/graphics/save.js'
import { Close } from './Icons.jsx'
import './graphics.css'

// Owners sharing their own pet is what sells votes. This draws the pet's
// card in the browser, in the sizes Instagram, Facebook and a printer want.
// It opens inline under the share buttons (no overlay), which also keeps it
// where the reader is inside the WordPress iframe.
export default function ShareImagePanel({ entry, onClose, ready, contest, phase, round, nextRound, rounds, bracketSize, state, votes, club = null, owner = false, now, total = 0, raised = null, shelterNames = [], entries = 0, endedAt = null, lastChance = null }) {
  // The keepsake certificate, once the pet's run is over: at the finish, or
  // when it missed the bracket or lost a matchup.
  const runOver = phase === 'complete' || ['out', 'unseeded', 'champion'].includes(state?.status)
  const formats = OWNER_FORMATS.filter((f) => f.id !== 'keepsake' || runOver)
  const [formatId, setFormatId] = useState(phase === 'complete' ? 'keepsake' : 'story')
  const format = formats.find((f) => f.id === formatId) || formats[0]
  const heading = useRef(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  const r1 = rounds.find((r) => r.seq === 1)
  const copy = ownerCopy({
    name: entry.pet_name,
    phase,
    round,
    nextRound,
    state,
    seed: entry.seed,
    bracketSize,
    year: contest?.year,
    contestName: contest?.name,
    // Round 1 is staged to open when entries close; whichever is next.
    opensAt: [r1?.opens_at, contest?.submissions_close_at].filter((v) => v && new Date(v).getTime() > now).sort((a, b) => new Date(a) - new Date(b))[0] || null,
    now,
    lastChance,
  })
  const url = owner ? ownerLink(petPublicUrl(PUBLIC_URL, entry.id)) : petPublicUrl(PUBLIC_URL, entry.id)
  const data = {
    entry: { id: entry.id, pet_name: entry.pet_name, town: entry.town, photo_path: entry.photo_path, seed: entry.seed },
    copy,
    votes: copy.showVotes ? votes || 0 : null,
    where: displayUrl(PUBLIC_URL),
    shareUrl: url,
    splitPct: contest?.beneficiary_split_pct,
    // The highest milestone club, drawn as a badge (lib/graphics/owner.js).
    club,
    keepsake: runOver
      ? keepsakeCopy({ name: entry.pet_name, year: contest?.year, contestName: contest?.name, state, total, club, raised, shelters: shelterNames, entries, endedAt })
      : null,
  }
  // Redraw only when what the image says changes, not on every clock tick.
  const key = ready ? JSON.stringify([formatId, data]) : null
  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  })

  const frame = useRef(null)
  const [png, setPng] = useState(null) // { key, blob, file }
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const name = fileName(entry.pet_name, format.id, `${format.width}x${format.height}`)

  useEffect(() => {
    if (!key) return
    let alive = true
    const d = dataRef.current
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    // The preview is the same layout drawn at screen resolution; the export
    // is always exactly format.width x format.height.
    const scale = Math.min(1, (dpr * 480) / Math.max(format.width, format.height))
    renderOwner(format, d, { scale })
      .then((canvas) => {
        if (!alive || !frame.current) return null
        canvas.className = 'gfx-canvas'
        canvas.setAttribute('role', 'img')
        canvas.setAttribute(
          'aria-label',
          format.id === 'keepsake' && d.keepsake
            ? `Preview: ${d.keepsake.title} for ${d.entry.pet_name}, who ${d.keepsake.achievement}`
            : `Preview: ${d.copy.headline}. ${d.entry.pet_name}${d.entry.town ? `, ${d.entry.town}` : ''}.`,
        )
        frame.current.replaceChildren(canvas)
        // The full-size PNG, ready before anyone taps Share: browsers open
        // the share sheet only straight from a tap.
        return renderOwner(format, d, { scale: 1 }).then(toPng)
      })
      .then((blob) => {
        if (alive && blob) setPng({ key, blob, file: shareableFile(blob, name) })
      })
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
  }, [key, format, name])

  const current = png?.key === key ? png : null

  async function download() {
    setError(null)
    setBusy(true)
    try {
      const blob = current?.blob || (await renderOwner(format, dataRef.current, { scale: 1 }).then(toPng))
      downloadBlob(blob, name)
      track('Share Image', { format: format.id, from: 'pet', method: 'download' })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  async function share() {
    if (!current?.file) return
    setError(null)
    try {
      const shared = await shareFile(current.file, { title: `Vote for ${entry.pet_name}`, text: `${shareText(entry.pet_name, contest?.name)} ${url}` })
      if (shared) track('Share Image', { format: format.id, from: 'pet', method: 'share' })
    } catch {
      setError(new Error('Sharing isn’t available here. Download the image, then post it from your photos.'))
    }
  }

  // Preview box: width capped by the column, height by the screen, and the
  // ratio always the export's.
  const tall = format.height > format.width
  return (
    <section id={`share-image-${entry.id}`} className="gfx-panel" aria-labelledby={`share-image-title-${entry.id}`}>
      <div className="gfx-panel-head">
        <div>
          <h2 id={`share-image-title-${entry.id}`} ref={heading} tabIndex={-1}>
            Make a share image
          </h2>
          <p className="small muted">
            {runOver
              ? `Post ${entry.pet_name} to your story or feed, or keep a certificate of the run.`
              : `Post ${entry.pet_name} to your story or feed, or print a flyer.`}
          </p>
        </div>
        <button type="button" className="gfx-close" onClick={onClose} aria-label="Close the image maker">
          <Close />
        </button>
      </div>
      <div className="chips gfx-formats" role="group" aria-label="Image size">
        {formats.map((f) => (
          <button key={f.id} type="button" className="chip" aria-pressed={f.id === formatId} onClick={() => setFormatId(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="gfx-stage">
        <div
          ref={frame}
          className={`gfx-frame${current ? '' : ' skeleton'}`}
          style={{ width: `min(100%, calc(${tall ? 'min(440px, 60vh)' : '400px'} * ${format.width / format.height}))`, aspectRatio: `${format.width} / ${format.height}` }}
        />
      </div>
      <p className="small muted gfx-hint">
        {format.hint} · {format.width}×{format.height} PNG{format.id === 'flyer' ? ' · the QR code opens this page' : ''}
      </p>
      {error && (
        <div className="notice error" role="alert" style={{ marginBottom: 12 }}>
          <span>{error.message || 'We couldn’t make the image. Please try again.'}</span>
        </div>
      )}
      <div className="gfx-actions">
        {current?.file && (
          <button type="button" className="btn btn-primary" onClick={share}>
            Share image
          </button>
        )}
        <button type="button" className={`btn ${current?.file ? 'btn-quiet' : 'btn-primary'}`} onClick={download} disabled={busy || !key}>
          {busy ? 'Preparing…' : 'Download PNG'}
        </button>
      </div>
    </section>
  )
}
