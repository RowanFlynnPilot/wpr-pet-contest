import { useEffect, useMemo, useRef, useState } from 'react'
import { NEWSROOM } from '../config.js'
import { useContest } from '../components/ContestContext.jsx'
import Countdown from '../components/Countdown.jsx'
import { Calendar as CalendarIcon, Camera, Check, LinkIcon, Share } from '../components/Icons.jsx'
import { submitEntry } from '../lib/api.js'
import { track } from '../lib/analytics.js'
import { deadlineIcs, icsHref } from '../lib/calendar.js'
import { PUBLIC_URL } from '../lib/env.js'
import { entryShareLine } from '../lib/share.js'
import { apDate, apDateTime, period } from '../lib/format.js'
import { useDocumentTitle } from '../lib/hooks.js'
import { ACCEPTED_TYPES, MAX_BYTES, prepareUpload } from '../lib/image.js'
import { OTHER_TOWN, TOWNS } from '../lib/towns.js'
import { EMPTY_ENTRY as EMPTY, LIMITS, validateEntry } from '../lib/entryForm.js'

// Exactly this, and never HEIC: when `accept` leaves HEIC out, iOS converts
// the photo to JPEG as it is picked. That is what makes iPhone entries work.
const ACCEPT = 'image/jpeg,image/png,image/webp'

const ORDER = ['photo', 'pet_name', 'species', 'town', 'caption', 'owner_name', 'owner_email', 'rights']

function PhotoField({ photo, preparing, onPick, error }) {
  const [drag, setDrag] = useState(false)
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  return (
    <div className="field" id="field-photo">
      <span className="label" id="photo-label">
        Your best photo
      </span>
      {photo && preview ? (
        <div className="preview">
          <img src={preview} alt="Your photo, ready to upload" />
          <div>
            <strong style={{ display: 'block' }}>Looking good.</strong>
            <span className="small muted">{(photo.size / 1024 / 1024).toFixed(1)} MB, ready to upload.</span>
            <label className="btn btn-quiet btn-sm" style={{ marginTop: 10, position: 'relative', overflow: 'hidden' }}>
              Choose a different photo
              <input
                type="file"
                accept={ACCEPT}
                onChange={(e) => onPick(e.target.files?.[0])}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              />
            </label>
          </div>
        </div>
      ) : (
        <div
          className={`dropzone${drag ? ' drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            onPick(e.dataTransfer.files?.[0])
          }}
        >
          <Camera size={34} />
          <span className="big">{preparing ? 'Getting your photo ready…' : 'Tap to add a photo'}</span>
          <span className="small muted">JPEG, PNG or WebP, up to 10 MB. Straight from your phone is fine.</span>
          <input
            type="file"
            accept={ACCEPT}
            aria-labelledby="photo-label"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'photo-error' : undefined}
            onChange={(e) => onPick(e.target.files?.[0])}
          />
        </div>
      )}
      {error && (
        <span className="error-text" id="photo-error">
          {error}
        </span>
      )}
    </div>
  )
}

function TextField({ id, label, value, onChange, error, hint, optional, max, ...rest }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className="field" id={`field-${id}`}>
      <label htmlFor={id}>
        {label} {optional && <span className="opt">(optional)</span>}
      </label>
      {hint && (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} maxLength={max} {...rest} />
      {error && (
        <span className="error-text" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  )
}

function Closed({ c }) {
  const { phase, contest } = c
  if (phase === 'coming') {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 32 }}>Entries open {apDate(contest.submissions_open_at)}</h1>
        <p style={{ marginTop: 10 }}>Get your best photo ready. It&rsquo;s free to enter.</p>
        <Countdown to={contest.submissions_open_at} label="Entries open in" />
      </div>
    )
  }
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 32 }}>Entries are closed{contest ? ` for ${contest.year}` : ''}</h1>
      <p style={{ marginTop: 10 }}>
        {contest ? period(`Entries closed ${apDateTime(contest.submissions_close_at)}`) : ''} Thank you to everyone who entered.{' '}
        {phase === 'voting' ? 'Voting is on now.' : phase === 'complete' ? 'See how it turned out.' : 'Voting opens soon.'}
      </p>
      <div className="hero-actions">
        <a className="btn btn-primary" href={phase === 'complete' ? '#/results' : '#/gallery'}>
          {phase === 'complete' ? 'See the results' : phase === 'voting' ? 'Vote now' : 'Meet the entrants'}
        </a>
      </div>
    </div>
  )
}

// The moment after entering: the photo they just sent, in a frame, a line
// they can post today (there is no page to link until an editor approves
// the entry, so it points at the front door), and a calendar note for the
// day voting opens.
function Success({ petName, photo, contest, onAnother }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])
  const opensAt = contest?.submissions_close_at || null
  const contestName = contest?.name || `Cutest Pet in ${NEWSROOM.region}`
  const line = entryShareLine({ petName, contestName, opensAt, url: PUBLIC_URL })
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(line)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      track('Entry Line Copied')
    } catch {
      // The line is selectable text; nothing else to do.
    }
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const share = () =>
    navigator
      .share({ text: line })
      .then(() => track('Entry Line Shared'))
      .catch(() => {})
  const ics = opensAt
    ? deadlineIcs({
        uid: `voting-opens-${contest.id}`,
        title: `Voting opens: ${contestName}`,
        closesAt: opensAt,
        url: PUBLIC_URL,
        description: `Entries are in. Vote for ${petName} from the first hour; totals reset every round.`,
      })
    : null
  return (
    <div className="card success-burst youre-in" tabIndex={-1} ref={ref} role="status">
      {preview ? (
        <figure className="youre-in-photo">
          <img src={preview} alt="" />
          <figcaption>{petName}</figcaption>
        </figure>
      ) : (
        <div className="mark">
          <Check size={38} />
        </div>
      )}
      <h1 style={{ fontSize: 'clamp(28px, 6vw, 40px)' }}>{petName} is entered!</h1>
      <p>
        An editor looks at every entry before it goes live, usually within a day. Once {petName} is approved you&rsquo;ll find them in the
        gallery{opensAt ? `, and voting starts after entries close ${apDate(opensAt)}` : ''}.
      </p>
      <div className="youre-in-line">
        <div className="share-title">Tell people now</div>
        <p className="youre-in-text">{line}</p>
        <div className="share-buttons">
          {canShare && (
            <button type="button" className="share-btn primary" onClick={share}>
              <Share size={16} /> Share
            </button>
          )}
          <button type="button" className="share-btn" onClick={copy}>
            <LinkIcon size={16} /> {copied ? 'Copied' : 'Copy the line'}
          </button>
          {ics && (
            <a className="share-btn" href={icsHref(ics)} download={`voting-opens-${petName}.ics`} onClick={() => track('Calendar', { pet: petName, kind: 'opens' })}>
              <CalendarIcon size={16} /> Remind me when voting opens
            </a>
          )}
        </div>
      </div>
      <div className="hero-actions" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn btn-primary" onClick={onAnother}>
          Enter another pet
        </button>
        <a className="btn btn-ghost" href="#/gallery">
          See the entrants
        </a>
      </div>
    </div>
  )
}

export default function Enter() {
  const c = useContest()
  const [v, setV] = useState(EMPTY)
  const [photo, setPhoto] = useState(null)
  const [thumb, setThumb] = useState(null)
  const [preparing, setPreparing] = useState(false)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  useDocumentTitle(`Enter your pet — ${NEWSROOM.name}`)

  const set = (key) => (value) => setV((prev) => ({ ...prev, [key]: value }))

  async function pick(file) {
    if (!file) return
    setServerError(null)
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrors((e) => ({
        ...e,
        photo: 'That file type won’t display on the web. Please choose a JPEG, PNG or WebP photo. On an iPhone, pick it from your Photos library.',
      }))
      return
    }
    setPreparing(true)
    const { photo: ready, thumb: small } = await prepareUpload(file)
    setPreparing(false)
    if (ready.size > MAX_BYTES) {
      setErrors((e) => ({ ...e, photo: 'That photo is over 10 MB. Please choose a smaller one.' }))
      return
    }
    setErrors((e) => ({ ...e, photo: undefined }))
    setPhoto(ready)
    setThumb(small)
  }

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setServerError(null)
    const found = validateEntry(v, photo)
    setErrors(found)
    const firstBad = ORDER.find((k) => found[k])
    if (firstBad) {
      const el = document.querySelector(`#field-${firstBad} input, #field-${firstBad} select, #field-${firstBad} textarea`)
      el?.focus()
      return
    }
    const form = new FormData()
    form.append('photo', photo, photo.name || 'photo.jpg')
    if (thumb) form.append('thumb', thumb, thumb.name || 'photo.thumb.jpg')
    form.append('pet_name', v.pet_name.trim())
    form.append('species', v.species)
    form.append('owner_name', v.owner_name.trim())
    form.append('owner_email', v.owner_email.trim())
    form.append('town', v.town === OTHER_TOWN ? v.town_other.trim() : v.town)
    if (v.caption.trim()) form.append('caption', v.caption.trim())
    form.append('rights_accepted', 'true')
    if (v.newsletter) form.append('newsletter_opt_in', 'true')
    form.append('website', v.website)

    setBusy(true)
    try {
      await submitEntry(form)
      track('Entry Submitted', { species: v.species })
      setDone(v.pet_name.trim())
      window.scrollTo(0, 0)
    } catch (err) {
      setServerError(err.status >= 500 ? 'Something went wrong on our end. Your entry was not saved. Please try again in a minute.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  if (c.loading) return <div className="wrap section" aria-busy="true" />
  if (c.phase !== 'submissions') {
    return (
      <div className="wrap section">
        <Closed c={c} />
      </div>
    )
  }

  if (done) {
    return (
      <div className="wrap-narrow section">
        <Success
          petName={done}
          photo={photo}
          contest={c.contest}
          onAnother={() => {
            setDone(null)
            setV((prev) => ({ ...EMPTY, owner_name: prev.owner_name, owner_email: prev.owner_email }))
            setPhoto(null)
            setThumb(null)
          }}
        />
      </div>
    )
  }

  const errorCount = Object.values(errors).filter(Boolean).length

  return (
    <div className="wrap">
      <div className="enter-layout">
        <form onSubmit={submit} noValidate aria-labelledby="enter-title">
          <h1 id="enter-title" style={{ fontSize: 'clamp(32px, 6vw, 48px)' }}>
            Enter your pet
          </h1>
          <p className="section-count">Free to enter · closes {apDate(c.contest.submissions_close_at)}</p>
          <p className="dek" style={{ marginBottom: 20 }}>
            One great photo and a few details. An editor reviews every entry before it goes live.
          </p>

          {errorCount > 0 && (
            <div className="notice error" role="alert" style={{ marginBottom: 16 }}>
              <span>
                <strong>A few things need fixing.</strong> Check the {errorCount === 1 ? 'field' : `${errorCount} fields`} marked below.
              </span>
            </div>
          )}

          <PhotoField photo={photo} preparing={preparing} onPick={pick} error={errors.photo} />

          <TextField id="pet_name" label="Pet's name" value={v.pet_name} onChange={set('pet_name')} error={errors.pet_name} max={LIMITS.pet_name} autoComplete="off" />

          <fieldset className="field" id="field-species" style={{ border: 0, padding: 0, margin: '0 0 16px' }} aria-describedby={errors.species ? 'species-error' : undefined}>
            <legend className="label" style={{ marginBottom: 6 }}>
              Dog, cat or other?
            </legend>
            <div className="chips">
              {[
                ['dog', 'Dog'],
                ['cat', 'Cat'],
                ['other', 'Other'],
              ].map(([val, text]) => (
                <label key={val} className={`chip${v.species === val ? ' is-on' : ''}`}>
                  <input
                    type="radio"
                    name="species"
                    value={val}
                    checked={v.species === val}
                    onChange={() => set('species')(val)}
                    style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
                  />
                  {text}
                </label>
              ))}
            </div>
            {errors.species && (
              <span className="error-text" id="species-error">
                {errors.species}
              </span>
            )}
          </fieldset>

          <div className="field" id="field-town">
            <label htmlFor="town">Your town</label>
            <select id="town" value={v.town} onChange={(e) => set('town')(e.target.value)} aria-invalid={errors.town && v.town !== OTHER_TOWN ? 'true' : undefined} aria-describedby={errors.town ? 'town-error' : undefined}>
              <option value="">Choose…</option>
              {TOWNS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value={OTHER_TOWN}>Somewhere else…</option>
            </select>
            {v.town === OTHER_TOWN && (
              <input
                type="text"
                aria-label="Your town"
                placeholder="Type your town"
                value={v.town_other}
                onChange={(e) => set('town_other')(e.target.value)}
                maxLength={LIMITS.town}
                aria-invalid={errors.town ? 'true' : undefined}
                autoComplete="address-level2"
              />
            )}
            {errors.town && (
              <span className="error-text" id="town-error">
                {errors.town}
              </span>
            )}
          </div>

          <div className="field" id="field-caption">
            <label htmlFor="caption">
              Why is your pet the cutest? <span className="opt">(optional)</span>
            </label>
            <textarea
              id="caption"
              value={v.caption}
              onChange={(e) => set('caption')(e.target.value)}
              maxLength={LIMITS.caption}
              rows={3}
              aria-describedby="caption-count"
              aria-invalid={errors.caption ? 'true' : undefined}
            />
            <span className="counter" id="caption-count">
              {v.caption.length}/{LIMITS.caption}
            </span>
            {errors.caption && <span className="error-text">{errors.caption}</span>}
          </div>

          <div className="row-2">
            <TextField id="owner_name" label="Your name" hint="Never published." value={v.owner_name} onChange={set('owner_name')} error={errors.owner_name} max={LIMITS.owner_name} autoComplete="name" />
            <TextField
              id="owner_email"
              label="Your email"
              hint="Only for contest updates about your pet."
              value={v.owner_email}
              onChange={set('owner_email')}
              error={errors.owner_email}
              type="email"
              inputMode="email"
              autoComplete="email"
            />
          </div>

          <div className="honeypot" aria-hidden="true">
            <label htmlFor="hp-field">Leave this field empty</label>
            <input
              id="hp-field"
              type="text"
              tabIndex={-1}
              autoComplete="one-time-code"
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              data-form-type="other"
              value={v.website}
              onChange={(e) => set('website')(e.target.value)}
            />
          </div>

          <label className="check" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={v.newsletter} onChange={(e) => set('newsletter')(e.target.checked)} />
            <span>Send me {NEWSROOM.name}&rsquo;s free daily newsletter.</span>
          </label>

          <div className="field" id="field-rights">
            <label className="check">
              <input
                type="checkbox"
                checked={v.rights}
                onChange={(e) => set('rights')(e.target.checked)}
                aria-describedby="release-text"
                aria-invalid={errors.rights ? 'true' : undefined}
              />
              <span>
                <strong>I agree to the photo release below.</strong>
              </span>
            </label>
            <div className="release" id="release-text">
              <p>By entering, I confirm that:</p>
              <p>1. I took this photo or have the right to share it, and the pet in it lives with me or is in my care.</p>
              <p>
                2. {NEWSROOM.name} may publish the photo, my pet&rsquo;s name, my town and my caption in print, online and on social
                media to promote this contest, now and in future contest coverage, without payment to me.
              </p>
              <p>3. I am 18 or older.</p>
              <p>4. I don&rsquo;t work for {NEWSROOM.name}, and no one in my household does.</p>
              <p>My name and email address are never published.</p>
            </div>
            {errors.rights && <span className="error-text">{errors.rights}</span>}
          </div>

          {serverError && (
            <div className="notice error" role="alert" style={{ marginBottom: 14 }}>
              <span>
                <strong>Your entry didn&rsquo;t go through.</strong> {serverError}
              </span>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || preparing}>
            {busy ? 'Uploading your photo…' : 'Enter my pet'}
          </button>
          <p className="fine">
            Entering is free. By entering you agree to the <a href="#/rules">official rules</a>.
          </p>
        </form>

        <aside className="enter-aside" aria-label="Tips">
          <div className="card sun">
            <h2 style={{ fontSize: 21, marginBottom: 8 }}>Photos that win votes</h2>
            <ul className="tips">
              <li>Get down to your pet&rsquo;s eye level.</li>
              <li>Daylight by a window beats a flash.</li>
              <li>One pet, filling most of the frame.</li>
              <li>No people&rsquo;s faces, text or filters, please.</li>
            </ul>
          </div>
          <div className="card plain">
            <h2 style={{ fontSize: 19, marginBottom: 6 }}>What happens next</h2>
            <p className="small" style={{ margin: 0 }}>
              An editor reviews your entry, usually within a day. Once approved, your pet appears in the gallery with a page you can share.{' '}
              {period(`Voting opens after entries close ${apDateTime(c.contest.submissions_close_at)}`)}
            </p>
          </div>
          <Countdown to={c.contest.submissions_close_at} label="Entries close in" />
        </aside>
      </div>
    </div>
  )
}
