import { useEffect, useMemo, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { NEWSLETTER_URL, NEWSROOM, RULES, SUPPORT_URL } from '../config.js'
import { tokenColor, tokenFont } from '../lib/theme.js'
import { createCheckout, fetchActivity, fetchTotals, mockPay } from '../lib/api.js'
import { APP_BASE, MOCK_CHECKOUT, STRIPE_PUBLISHABLE_KEY } from '../lib/env.js'
import { apTime, fmtInt, fmtMoney, formatCountdown } from '../lib/format.js'
import { bestValue, defaultPack, formatPerVote, orderPacksForDisplay, savingsPct, votesWithBonus } from '../lib/packs.js'
import { attemptKey, nextRequestId } from '../lib/requestId.js'
import { roundLabel } from '../lib/rounds.js'
import { boostLive, useLive } from '../lib/live.js'
import { totalsKey, useActivity } from '../lib/data.js'
import { multiplierWord, windowTitle } from '../lib/bonus.js'
import { track } from '../lib/analytics.js'
import { useNow } from '../lib/hooks.js'
import { useContest } from './ContestContext.jsx'
import Confetti from './Confetti.jsx'
import { buzz } from '../lib/haptics.js'
import { Check } from './Icons.jsx'
import { Digits } from './Scoreboard.jsx'
import { ShelterMark } from './ShelterLogo.jsx'
import Modal from './Modal.jsx'
import PetPhoto from './PetPhoto.jsx'
import ShareTools from './ShareTools.jsx'

// Loaded with this chunk. A failed load is forgotten, so "Try again" really
// tries again instead of handing back the same rejected promise.
let stripeLoad = null
function getStripe() {
  if (!stripeLoad && STRIPE_PUBLISHABLE_KEY) {
    stripeLoad = loadStripe(STRIPE_PUBLISHABLE_KEY).catch((err) => {
      stripeLoad = null
      throw err
    })
  }
  return stripeLoad
}
getStripe()?.catch(() => {})

// confirm_vote counts a payment made by closes_at plus this grace; anything
// later is marked late and refunded by the webhook.
const PAYMENT_GRACE_MS = 2 * 60 * 1000
const CLOSING_SOON_MS = 5 * 60 * 1000
const SLOW_CREDIT_MS = 3 * 60 * 1000
const activityKey = (r) => `${r.entry_id}|${r.votes}|${r.confirmed_at}`

// The card form in the theme's colors and face, read when the form opens.
const appearance = () => ({
  theme: 'stripe',
  variables: {
    colorPrimary: tokenColor('--brand-ink', '#2b655d'),
    colorText: tokenColor('--ink', '#1a1a1a'),
    colorDanger: tokenColor('--danger', '#9b2226'),
    fontFamily: tokenFont('--sans', '"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'),
    fontSizeBase: '16px',
    borderRadius: '8px',
  },
})
const FONTS = [{ cssSrc: NEWSROOM.fonts || 'https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;700&display=swap' }]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function CheckoutModal({ entry, round, onClose }) {
  const c = useContest()
  const packs = useMemo(() => orderPacksForDisplay(c.packs), [c.packs])
  const [picked, setSlug] = useState(null)
  const slug = picked ?? defaultPack(c.packs)?.slug ?? null
  const [email, setEmail] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [playsAgain, setPlaysAgain] = useState(false)
  const [step, setStep] = useState('pack')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [emailError, setEmailError] = useState(null)
  const [intent, setIntent] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const request = useRef(null)

  const totals = useLive(totalsKey(round.id), () => fetchTotals(round.id), 20000)
  const currentVotes = totals.data?.get(entry.id)?.votes || 0
  const activity = useActivity(receipt ? round.id : null)
  const [stripe, setStripe] = useState({ status: 'idle', value: null })

  const pack = packs.find((p) => p.slug === slug) || null
  const best = bestValue(packs)
  // Stripe, or the mock API's stand-in for it on a demo build.
  const canPay = Boolean(STRIPE_PUBLISHABLE_KEY) || MOCK_CHECKOUT
  const multiplier = c.bonus?.multiplier || 1
  const split = c.contest?.beneficiary_split_pct
  const label = roundLabel(round.seq, c.bracketSize)
  // The deadline is when payment must complete. Past it, nobody is offered a
  // Pay button: the server would refund the votes anyway.
  const now = useNow(1000)
  const closesAt = new Date(round.closes_at).getTime()
  const closed = now >= closesAt
  const closingSoon = !closed && closesAt - now <= CLOSING_SOON_MS
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (step !== 'pay' || stripe.status !== 'idle') return
    const load = getStripe()
    if (!load) return
    load.then(
      (value) => setStripe({ status: 'ready', value }),
      () => setStripe({ status: 'error', value: null }),
    )
  }, [step, stripe.status])

  async function begin(e) {
    e.preventDefault()
    setError(null)
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter the email address for your receipt.')
      document.getElementById('checkout-email')?.focus()
      return
    }
    setEmailError(null)
    if (!pack || busy) return
    const body = {
      pack_slug: pack.slug,
      round_id: round.id,
      entry_id: entry.id,
      buyer_email: email.trim(),
      newsletter_opt_in: optIn,
      plays_again_opt_in: playsAgain,
    }
    setBusy(true)
    // This pet's recent purchases before this one, so the success screen can
    // tell when the webhook credits *this* payment (the pet's total also moves
    // with everyone else's). Null when the feed could not be read: then the
    // screen makes no claim. The browser never adds votes itself.
    const before = fetchActivity(round.id).then(
      (rows) => new Set(rows.filter((r) => r.entry_id === entry.id).map(activityKey)),
      () => null,
    )
    try {
      request.current = nextRequestId(request.current, attemptKey(body))
      let res
      try {
        res = await createCheckout({ ...body, request_id: request.current.id })
      } catch (err) {
        // 409: this request id was already used for a different selection.
        if (err.status !== 409) throw err
        request.current = nextRequestId(null, attemptKey(body))
        res = await createCheckout({ ...body, request_id: request.current.id })
      }
      setIntent({ ...res, pack, seen: await before })
      setStep('pay')
      track('Checkout Started', { pack: pack.slug, round: label, multiplier: String(res.multiplier || 1) })
    } catch (err) {
      setError(err.status >= 500 ? 'Something went wrong on our end. Please try again in a minute.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  // The intent PayForm actually paid, not whatever is in state by now, and
  // when Stripe said it went through.
  function paid(paidIntent, paidAt) {
    setReceipt({ ...paidIntent, paidAt })
    setStep('done')
    buzz()
    boostLive(totalsKey(round.id))
    boostLive(`activity:${round.id}`)
    track(
      'Checkout Completed',
      { pack: paidIntent.pack.slug, round: label, votes: String(paidIntent.votes) },
      { currency: 'USD', amount: paidIntent.cents / 100 },
    )
  }

  let outcome = null
  if (receipt) {
    const { seen } = receipt
    const credited = seen && activity.some((r) => r.entry_id === entry.id && r.votes === receipt.votes && !seen.has(activityKey(r)))
    if (credited) outcome = 'credited'
    else if (receipt.paidAt > closesAt + PAYMENT_GRACE_MS) outcome = 'late'
    else if (now - receipt.paidAt > SLOW_CREDIT_MS) outcome = 'slow'
    else outcome = 'waiting'
  }

  // The done step shows the pet and its count below; the head only thanks.
  const head =
    step === 'done' ? (
      <div className="modal-head">
        <h2 id="checkout-title">Thank you!</h2>
      </div>
    ) : (
      <div className="modal-head">
        <PetPhoto entry={entry} width={160} square />
        <div>
          <h2 id="checkout-title">Vote for {entry.pet_name}</h2>
          <div className="sub">
            {label} · {fmtInt(currentVotes)} {currentVotes === 1 ? 'vote' : 'votes'} so far
          </div>
        </div>
      </div>
    )

  return (
    <Modal label={step === 'done' ? 'Purchase complete' : `Vote for ${entry.pet_name}`} onClose={onClose} head={head} locked={paying}>
      {closingSoon && step !== 'done' && (
        <div className="notice warn" style={{ marginBottom: 14 }}>
          <span>
            <strong>
              The {label} closes in <span className="mono">{formatCountdown(closesAt - now)}</span>.
            </strong>
            A payment that completes after the deadline is refunded, not counted.
          </span>
        </div>
      )}
      {closed && step !== 'done' && !paying && (
        <div className="notice warn" role="alert">
          <span>
            <strong>Voting has closed.</strong> The {label} deadline has passed, so no more vote packs can be bought for it. You have not been
            charged. {c.nextRound ? 'Check back for the next round.' : ''}
          </span>
        </div>
      )}

      {step === 'pack' && !closed && (
        <form onSubmit={begin} noValidate>
          {c.bonus && (
            <p className="notice warn" style={{ marginBottom: 14 }}>
              <span>
                <strong>
                  ×{c.bonus.multiplier} {windowTitle(c.bonus)} is on!
                </strong>
                Every pack counts {multiplierWord(c.bonus.multiplier).toLowerCase()} if you start checkout before it ends.
                {c.bonus.sponsor_name && <> Presented by {c.bonus.sponsor_name}.</>}
              </span>
            </p>
          )}

          {packs.length === 0 ? (
            <div className="notice">
              <span>
                <strong>Vote packs aren&rsquo;t on sale yet.</strong>
                Check back soon.
              </span>
            </div>
          ) : (
            <fieldset className="packs">
              <legend className="label" style={{ marginBottom: 8 }}>
                Choose a vote pack
              </legend>
              {packs.map((p) => {
                const save = savingsPct(p, packs)
                const id = `pack-${p.slug}`
                return (
                  <div className="pack" key={p.id}>
                    <input type="radio" name="pack" id={id} value={p.slug} checked={slug === p.slug} onChange={() => setSlug(p.slug)} />
                    <label htmlFor={id}>
                      <span className="dot" aria-hidden="true" />
                      <span>
                        <span className="pack-votes">
                          {fmtInt(votesWithBonus(p, multiplier))} votes
                          {multiplier > 1 && (
                            <span className="pack-was">
                              ×{multiplier} from {fmtInt(p.votes)}
                            </span>
                          )}
                        </span>
                        <span className="pack-meta">
                          <span>{p.label}</span>
                          <span>{formatPerVote({ votes: votesWithBonus(p, multiplier), cents: p.cents })}</span>
                          {save > 0 && <span className="save">Save {save}%</span>}
                        </span>
                      </span>
                      <span className="pack-price">{fmtMoney(p.cents)}</span>
                    </label>
                    {p.featured ? (
                      <span className="pack-tag">Most popular</span>
                    ) : best && best.slug === p.slug && packs.length > 2 ? (
                      <span className="pack-tag value">Best value</span>
                    ) : null}
                  </div>
                )
              })}
            </fieldset>
          )}

          <div className="field">
            <label htmlFor="checkout-email">Email for your receipt</label>
            <input
              id="checkout-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={emailError ? 'true' : undefined}
              aria-describedby={emailError ? 'checkout-email-error' : undefined}
              required
            />
            {emailError && (
              <span className="error-text" id="checkout-email-error">
                {emailError}
              </span>
            )}
          </div>
          <label className="check" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={playsAgain} onChange={(e) => setPlaysAgain(e.target.checked)} />
            <span>Email me when {entry.pet_name} plays again (this contest only, one email a round).</span>
          </label>
          <label className="check" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>Send me {NEWSROOM.name}&rsquo;s free daily newsletter.</span>
          </label>

          {error && (
            <div className="notice error" role="alert" style={{ marginBottom: 12 }}>
              <span>{error}</span>
            </div>
          )}

          {!canPay ? (
            <div className="notice warn">
              <span>
                <strong>Checkout isn&rsquo;t switched on yet.</strong>
                Vote packs will be on sale here shortly. Thanks for your patience!
              </span>
            </div>
          ) : (
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!pack || busy}>
              {busy ? 'One moment…' : pack ? `Continue · ${fmtMoney(pack.cents)}` : 'Choose a pack'}
            </button>
          )}
          <Legal split={split} label={label} />
        </form>
      )}

      {step === 'pay' && intent && canPay && (!closed || paying) && (
        <>
          <div className="summary-line">
            <span>
              <b>{fmtInt(intent.votes)}</b> votes for {intent.pet_name || entry.pet_name}
              {intent.multiplier > 1 && (
                <>
                  {' '}
                  <span className="bonus-badge">×{intent.multiplier} bonus</span>
                </>
              )}
            </span>
            <b>{fmtMoney(intent.cents)}</b>
          </div>
          {intent.mock && MOCK_CHECKOUT ? (
            <MockPay intent={intent} onPaid={paid} />
          ) : stripe.status === 'error' ? (
            <div className="notice error" role="alert">
              <span>
                <strong>The payment form couldn&rsquo;t load.</strong>
                Check your connection, then try again. You have not been charged.{' '}
                <button type="button" className="link-btn" onClick={() => setStripe({ status: 'idle', value: null })}>
                  Try again
                </button>
              </span>
            </div>
          ) : stripe.status === 'ready' ? (
            <Elements stripe={stripe.value} options={{ clientSecret: intent.client_secret, appearance: appearance(), fonts: FONTS }}>
              <PayForm intent={intent} entry={entry} email={email.trim()} onPaid={paid} onBusy={setPaying} split={split} label={label} />
            </Elements>
          ) : (
            <div className="stripe-slot skeleton" style={{ height: 220 }} role="status" aria-label="Loading the payment form" />
          )}
          <p className="center" style={{ marginTop: 12 }}>
            <button type="button" className="link-btn" onClick={() => setStep('pack')} disabled={paying}>
              Change pack or email
            </button>
          </p>
        </>
      )}

      {step === 'done' && receipt && (
        <Done
          entry={entry}
          intent={receipt}
          outcome={outcome}
          label={label}
          closesAt={closesAt}
          currentVotes={currentVotes}
          contestName={c.contest?.name}
          split={c.contest?.beneficiary_split_pct}
          shelter={c.shelters.length === 1 ? c.shelters[0] : null}
          canBuyAgain={!closed}
          onAgain={() => {
            request.current = null
            setIntent(null)
            setReceipt(null)
            setStep('pack')
          }}
          onClose={onClose}
        />
      )}
    </Modal>
  )
}

function Legal({ split, label }) {
  return (
    <p className="legal">
      <strong>Vote pack purchases are not tax-deductible.</strong>{' '}
      {split != null ? `${split}% of proceeds go to the partner shelters.` : 'A share of proceeds goes to the partner shelters.'}{' '}
      Votes count in the {label} only; totals reset every round. Vote packs aren&rsquo;t refunded if an owner withdraws a pet.{' '}
      <a href="#/rules">Rules</a>
    </p>
  )
}

// The mock API's stand-in for the card form: one button, no charge. Only
// reachable on a build with MOCK_CHECKOUT set, against an API that says so.
function MockPay({ intent, onPaid }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function pay() {
    setBusy(true)
    setError(null)
    try {
      await mockPay(intent.id)
      onPaid(intent, Date.now())
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <div className="mock-pay">
      <div className="notice warn" style={{ marginBottom: 12 }}>
        <span>
          <strong>Demo checkout.</strong> No card and no charge: this button stands in for the payment form.
        </span>
      </div>
      {error && (
        <div className="notice error" role="alert" style={{ marginBottom: 12 }}>
          <span>{error}</span>
        </div>
      )}
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={pay} disabled={busy}>
        {busy ? 'One moment…' : `Pay ${fmtMoney(intent.cents)} (pretend)`}
      </button>
    </div>
  )
}

function PayForm({ intent, entry, email, onPaid, onBusy, split, label }) {
  const stripe = useStripe()
  const elements = useElements()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function pay(e) {
    e.preventDefault()
    if (!stripe || !elements || busy) return
    setBusy(true)
    onBusy(true)
    setError(null)
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        // Only for payment methods that must leave the page. App.jsx shows
        // the confirmation when the reader comes back.
        return_url: `${APP_BASE}?paid=1&pet=${entry.id}`,
        receipt_email: email,
      },
    })
    setBusy(false)
    onBusy(false)
    if (err) {
      setError(err.message || 'Your payment did not go through. Please try again.')
      return
    }
    if (paymentIntent && ['succeeded', 'processing', 'requires_capture'].includes(paymentIntent.status)) {
      onPaid(intent, Date.now())
    } else {
      setError('Your payment did not go through. Please try another method.')
    }
  }

  return (
    <form onSubmit={pay}>
      <div className="stripe-slot">
        <PaymentElement
          onReady={() => setReady(true)}
          onLoadError={() => setError('The payment form could not load. Check your connection, then close this window and try again.')}
          options={{ layout: 'tabs', wallets: { applePay: 'auto', googlePay: 'auto' }, paymentMethodOrder: ['apple_pay', 'google_pay', 'card'] }}
        />
      </div>
      {error && (
        <div className="notice error" role="alert" style={{ marginTop: 12 }}>
          <span>{error}</span>
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 14 }} disabled={!stripe || !ready || busy}>
        {busy ? 'Processing…' : `Pay ${fmtMoney(intent.cents)}`}
      </button>
      <Legal split={split} label={label} />
    </form>
  )
}

// The peak of the whole contest for a reader: their pet, its count lighting
// up as the votes land, and what the pack did for the shelters. A late
// payment gets the plain truth instead of a celebration.
function Done({ entry, intent, outcome, label, closesAt, currentVotes, contestName, split, shelter, canBuyAgain, onAgain, onClose }) {
  const votes = fmtInt(intent.votes)
  const late = outcome === 'late'
  const toShelters = split != null ? Math.round((intent.cents * split) / 100) : null
  return (
    <div className="done">
      {outcome === 'credited' && <Confetti count={28} />}
      <div className="done-hero">
        <span className="done-photo">
          <PetPhoto entry={entry} width={240} square alt="" />
          <span className="done-check" aria-hidden="true">
            <Check size={18} />
          </span>
        </span>
        <div className="done-head">
          <h2 className="done-title">{late ? 'Payment received' : `${votes} votes for ${entry.pet_name}`}</h2>
          {!late && (
            <div className="done-board">
              <Digits value={currentVotes} label={`${entry.pet_name} has ${fmtInt(currentVotes)} votes this round`} />
              <span className="done-board-label">{outcome === 'credited' ? 'votes this round, yours included' : 'votes this round so far'}</span>
            </div>
          )}
        </div>
      </div>
      {!late && toShelters > 0 && (
        <p className="done-impact">
          Your pack sends <strong>{fmtMoney(toShelters)}</strong> to{' '}
          {shelter ? (
            <span className="shelter-lockup">
              <ShelterMark shelter={shelter} size={40} />
              {shelter.url ? (
                <a href={shelter.url} target="_blank" rel="noopener noreferrer">
                  {shelter.name}
                </a>
              ) : (
                shelter.name
              )}
            </span>
          ) : (
            'local animal shelters'
          )}
          .
        </p>
      )}
      <div className="done-status">
        <p aria-live="polite">
          {outcome === 'credited' && (
            <>
              <strong>Your {votes} votes are in.</strong> Totals reset every round.
            </>
          )}
          {outcome === 'late' && (
            <>
              <strong>This payment completed after the {label} closed at {apTime(closesAt)},</strong> so its votes can&rsquo;t count. Late
              payments are refunded to your card automatically; you don&rsquo;t need to do anything. Your receipt is on its way by email.
            </>
          )}
          {outcome === 'waiting' && (
            <>
              Your {votes} votes for {entry.pet_name} will appear within a minute. Your receipt is on its way by email.
            </>
          )}
          {outcome === 'slow' && (
            <>
              Your {votes} votes are taking longer than usual to show here, which can happen when lots of people are voting. Your receipt is on
              its way. If {entry.pet_name} doesn&rsquo;t seem to have them within the hour, email{' '}
              <a href={`mailto:${RULES.contact}`}>{RULES.contact}</a>.
            </>
          )}
        </p>
      </div>

      {!late && <ShareTools entry={entry} contestName={contestName} title={`Now get ${entry.pet_name} more votes`} compact />}

      <div className="hero-actions" style={{ marginTop: 16 }}>
        {canBuyAgain && (
          <button type="button" className="btn btn-ghost" onClick={onAgain}>
            Buy another pack
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Done
        </button>
      </div>

      <p className="done-support">
        Your vote pack isn&rsquo;t a donation. {NEWSROOM.nonprofit ? `${NEWSROOM.shortName} is a nonprofit newsroom:` : `Support ${NEWSROOM.shortName}:`}{' '}
        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={() => track('Donate Click', { from: 'post-purchase' })}>
          {NEWSROOM.nonprofit ? 'make a tax-deductible gift' : 'subscribe'}
        </a>{' '}
        or{' '}
        <a href={NEWSLETTER_URL} target="_blank" rel="noopener noreferrer">
          get the free newsletter
        </a>
        .
      </p>
    </div>
  )
}
