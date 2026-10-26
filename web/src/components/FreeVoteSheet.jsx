import { useEffect, useRef, useState } from 'react'
import { NEWSROOM } from '../config.js'
import { track } from '../lib/analytics.js'
import { apTime, fmtInt, fmtMoney, packShareLine, TIME_ZONE_NAME } from '../lib/format.js'
import { dropLinkToken, freeVote, getDevice, setDevice } from '../lib/freeVote.js'
import { roundLabel } from '../lib/rounds.js'
import { useContest } from './ContestContext.jsx'
import { Check } from './Icons.jsx'
import Modal from './Modal.jsx'
import PetPhoto from './PetPhoto.jsx'
import { Digits } from './Scoreboard.jsx'
import ShareTools from './ShareTools.jsx'
import Turnstile, { turnstileConfigured } from './Turnstile.jsx'
import { buzz } from '../lib/haptics.js'

// The same loose check as checkout: something@something.tld.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// One free vote a day, verified by email. The first time: an address, then a
// six-digit code. After that this browser votes in two taps. An emailed link
// opens here ready to confirm; it never votes on its own.
export default function FreeVoteSheet({ entry, round, link, onClose, onBuy }) {
  const c = useContest()
  const contestId = c.contest?.id
  const label = roundLabel(round.seq, c.bracketSize)
  const [step, setStep] = useState(() => {
    if (link) return link.kind === 'link' ? 'confirm-link' : 'confirm-reminder'
    return getDevice(contestId) ? 'loading' : 'email'
  })
  const [masked, setMasked] = useState(null)
  const [nextAt, setNextAt] = useState(null)
  const [votes, setVotes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // A remembered browser: whose it is, and whether today's vote is spent.
  useEffect(() => {
    if (link) {
      dropLinkToken()
      return
    }
    const device = getDevice(contestId)
    if (!device) return
    let alive = true
    freeVote('status', { device_token: device })
      .then((s) => {
        if (!alive) return
        if (!s.known) {
          setDevice(contestId, null)
          setStep('email')
          return
        }
        setMasked(s.masked_email)
        setNextAt(s.next_vote_at)
        setStep(s.voted_today ? 'spent' : 'device')
      })
      .catch(() => alive && setStep('email'))
    return () => {
      alive = false
    }
  }, [link, contestId])

  // Every verify and cast answers with an outcome; this is where each lands.
  function land(res) {
    if (res.device_token) setDevice(contestId, res.device_token)
    if (res.masked_email) setMasked(res.masked_email)
    setError(null)
    switch (res.outcome) {
      case 'cast':
        track('Free Vote', { pet: entry.pet_name, via: link?.kind || (step === 'device' ? 'device' : 'code') })
        setVotes(res.votes)
        setStep('done')
        buzz()
        return
      case 'already_voted':
        setStep('spent')
        return
      case 'unknown_device':
        setDevice(contestId, null)
        setStep('email')
        return
      case 'wrong':
        setError(res.message)
        return
      default:
        // refused, expired, locked, used, invalid: the message says why.
        setError(res.message || 'That didn’t work. Please try again.')
        if (['expired', 'locked', 'used', 'invalid'].includes(res.outcome)) setStep('email')
    }
  }

  async function run(fn) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const castWithDevice = () =>
    run(async () => {
      land(await freeVote('cast', { device_token: getDevice(contestId), round_id: round.id, entry_id: entry.id }))
    })

  const confirmLink = () =>
    run(async () => {
      if (link.kind === 'link') {
        land(await freeVote('verify', { kind: 'link', token: link.token }))
        return
      }
      // A reminder proves the address; the vote is one more call, same tap.
      const v = await freeVote('verify', { kind: 'reminder', token: link.token })
      if (v.outcome !== 'verified') return land(v)
      setDevice(contestId, v.device_token)
      land(await freeVote('cast', { device_token: v.device_token, round_id: round.id, entry_id: entry.id }))
    })

  const head = (
    <div className="modal-head">
      <PetPhoto entry={entry} width={160} square />
      <div>
        <h2 id="free-vote-title">{step === 'done' ? 'Your free vote is in' : `Vote free for ${entry.pet_name}`}</h2>
        <div className="sub">One free vote a day · {label}</div>
      </div>
    </div>
  )

  return (
    <Modal label={`Free vote for ${entry.pet_name}`} onClose={onClose} head={head}>
      <div className="modal-body fv">
        {step === 'loading' && <p className="fv-wait">Checking for today&rsquo;s free vote&hellip;</p>}

        {step === 'device' && (
          <>
            <p className="fv-lede">
              Today&rsquo;s free vote is ready{masked ? ` for ${masked}` : ''}.
            </p>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={castWithDevice} disabled={busy}>
              {busy ? 'Voting…' : `Cast my free vote for ${entry.pet_name}`}
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-block fv-switch"
              onClick={() => {
                setDevice(contestId, null)
                setStep('email')
              }}
            >
              Use a different email
            </button>
          </>
        )}

        {(step === 'confirm-link' || step === 'confirm-reminder') && (
          <>
            <p className="fv-lede">
              {step === 'confirm-link'
                ? `Confirm your free vote for ${entry.pet_name}.`
                : `Your free vote is ready. One tap casts it for ${entry.pet_name}.`}
            </p>
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={confirmLink} disabled={busy}>
              {busy ? 'Voting…' : `Cast my free vote for ${entry.pet_name}`}
            </button>
          </>
        )}

        {step === 'email' && (
          <EmailStep
            entry={entry}
            round={round}
            busy={busy}
            onSubmit={async (payload) => {
              let ok = false
              await run(async () => {
                const res = await freeVote('request', payload)
                setMasked(res.masked_email)
                setStep({ code: res.challenge_id })
                ok = true
              })
              return ok
            }}
          />
        )}

        {typeof step === 'object' && step.code && (
          <CodeStep
            masked={masked}
            busy={busy}
            onSubmit={(code) =>
              run(async () => {
                land(await freeVote('verify', { kind: 'code', challenge_id: step.code, code }))
              })
            }
            onRestart={() => {
              setError(null)
              setStep('email')
            }}
          />
        )}

        {error && (
          <div className="notice error" role="alert" style={{ marginTop: 12 }}>
            <span>{error}</span>
          </div>
        )}

        {step === 'done' && <Done entry={entry} votes={votes} contestName={c.contest?.name} onBuy={onBuy} packs={c.packs} />}

        {step === 'spent' && (
          <div className="fv-spent">
            <p className="fv-lede">
              You&rsquo;ve used today&rsquo;s free vote{masked ? ` (${masked})` : ''}. The next one unlocks at{' '}
              {nextAt ? apTime(nextAt) : 'midnight'}.
            </p>
            <Offer entry={entry} packs={c.packs} onBuy={onBuy} />
            <ShareTools entry={entry} contestName={c.contest?.name} title={`Share ${entry.pet_name} instead`} compact />
          </div>
        )}
      </div>
    </Modal>
  )
}

function EmailStep({ entry, round, busy, onSubmit }) {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState(null)
  const [newsletter, setNewsletter] = useState(false)
  const [reminders, setReminders] = useState(false)
  const [token, setToken] = useState(null)
  const [botFailed, setBotFailed] = useState(false)
  // A Turnstile token is spent by the request even when it fails, so a retry
  // needs a fresh widget.
  const [attempt, setAttempt] = useState(0)
  const honeypot = useRef(null)
  const waiting = turnstileConfigured && !token && !botFailed

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        if (!EMAIL_RE.test(email.trim())) {
          setEmailError('Enter your email address, and we’ll send the code there.')
          document.getElementById('fv-email')?.focus()
          return
        }
        setEmailError(null)
        const ok = await onSubmit({
          round_id: round.id,
          entry_id: entry.id,
          email: email.trim(),
          newsletter,
          reminders,
          turnstile_token: token,
          website: honeypot.current?.value || '',
        })
        if (!ok) {
          setToken(null)
          setAttempt((n) => n + 1)
        }
      }}
    >
      <p className="fv-lede">
        Everyone gets one free vote a day. We&rsquo;ll email you a code to confirm it&rsquo;s you; after that, this browser votes in
        two taps.
      </p>
      <div className="field">
        <label htmlFor="fv-email">Your email</label>
        <input
          id="fv-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="send"
          spellCheck={false}
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailError ? 'true' : undefined}
          aria-describedby={emailError ? 'fv-email-error' : undefined}
          required
        />
        {emailError && (
          <span className="error-text" id="fv-email-error">
            {emailError}
          </span>
        )}
      </div>
      {/* For bots only: people never see it. */}
      <div className="fv-trap" aria-hidden="true">
        <label>
          Website <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="check fv-check">
        <input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} />
        <span>Remind me each morning to vote (this contest only).</span>
      </label>
      <label className="check fv-check">
        <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />
        <span>Send me {NEWSROOM.name}&rsquo;s free daily newsletter.</span>
      </label>
      <Turnstile key={attempt} onToken={setToken} onError={() => setBotFailed(true)} />
      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || waiting}>
        {busy ? 'Sending…' : waiting ? 'Checking your browser…' : 'Email me a code'}
      </button>
      <p className="fv-fine">
        One free vote per person per day, {TIME_ZONE_NAME}. Your address is never published or sold, and it is erased a year after
        the contest.
      </p>
    </form>
  )
}

function CodeStep({ masked, busy, onSubmit, onRestart }) {
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(null)
  const input = useRef(null)
  useEffect(() => {
    input.current?.focus()
  }, [])
  const digits = code.replace(/\D/g, '')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (digits.length !== 6) {
          setCodeError('Enter the six-digit code from the email.')
          input.current?.focus()
          return
        }
        setCodeError(null)
        onSubmit(digits)
      }}
    >
      <p className="fv-lede">
        We sent a six-digit code to <strong>{masked || 'your email'}</strong>. It works for 15 minutes.
      </p>
      <div className="field">
        <label htmlFor="fv-code">Code from the email</label>
        <input
          ref={input}
          id="fv-code"
          className="fv-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          enterKeyHint="done"
          maxLength={9}
          name="code"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={codeError ? 'true' : undefined}
          aria-describedby={codeError ? 'fv-code-error' : undefined}
        />
        {codeError && (
          <span className="error-text" id="fv-code-error">
            {codeError}
          </span>
        )}
      </div>
      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
        {busy ? 'Checking…' : 'Cast my free vote'}
      </button>
      <button type="button" className="btn btn-quiet btn-block fv-switch" onClick={onRestart}>
        No email? Send a new code
      </button>
    </form>
  )
}

// Every free vote ends on the packs: a free vote is one vote, a pack is many.
function Offer({ entry, packs, onBuy }) {
  const c = useContest()
  const from = packs?.length ? Math.min(...packs.map((p) => p.cents)) : null
  return (
    <div className="fv-offer">
      <p>
        Want to give {entry.pet_name} a bigger boost? {from != null ? `Vote packs start at ${fmtMoney(from)}, ` : 'Vote packs '}
        and {packShareLine(c.contest?.beneficiary_split_pct, c.shelters).replace(/^Half/, 'half').replace(/^A share/, 'a share')}
      </p>
      <button type="button" className="btn btn-ghost btn-block" onClick={onBuy}>
        Buy a vote pack for {entry.pet_name}
      </button>
    </div>
  )
}

function Done({ entry, votes, contestName, packs, onBuy }) {
  return (
    <div className="done fv-done">
      <div className="done-hero">
        <span className="done-photo">
          <PetPhoto entry={entry} width={240} square alt="" />
          <span className="done-check" aria-hidden="true">
            <Check size={18} />
          </span>
        </span>
        <div className="done-head">
          <h3 className="done-title">1 free vote for {entry.pet_name}</h3>
          {votes != null && (
            <div className="done-board">
              <Digits value={votes} label={`${entry.pet_name} has ${fmtInt(votes)} ${votes === 1 ? 'vote' : 'votes'} this round`} />
              <span className="done-board-label">votes this round, yours included</span>
            </div>
          )}
        </div>
      </div>
      <p className="fv-lede">Your next free vote unlocks at midnight. Totals reset every round.</p>
      <Offer entry={entry} packs={packs} onBuy={onBuy} />
      <ShareTools entry={entry} contestName={contestName} title={`Now get ${entry.pet_name} more votes`} compact />
    </div>
  )
}
