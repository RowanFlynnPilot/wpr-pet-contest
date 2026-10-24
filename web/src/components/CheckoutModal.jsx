import { useEffect, useMemo, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { NEWSLETTER_URL, RULES, SPONSORS, SUPPORT_URL } from '../config.js'
import { createCheckout, fetchActivity, fetchTotals } from '../lib/api.js'
import { APP_BASE, STRIPE_PUBLISHABLE_KEY } from '../lib/env.js'
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
import { Check } from './Icons.jsx'
import Modal from './Modal.jsx'
import PetPhoto from './PetPhoto.jsx'
import ShareTools from './ShareTools.jsx'
import Sponsor from './Sponsor.jsx'

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

const APPEARANCE = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#2b655d',
    colorText: '#1a1a1a',
    colorDanger: '#9b2226',
    fontFamily: '"Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSizeBase: '16px',
    borderRadius: '8px',
  },
}
const FONTS = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;700&display=swap' }]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function CheckoutModal({ entry, round, onClose }) {
  const c = useContest()
  const packs = useMemo(() => orderPacksForDisplay(c.packs), [c.packs])
  const [picked, setSlug] = useState(null)
  const slug = picked ?? defaultPack(c.packs)?.slug ?? null
  const [email, setEmail] = useState('')
  const [optIn, setOptIn] = useState(false)
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

  const head = (
    <div className="modal-head">
      <PetPhoto entry={entry} width={160} square />
      <div>
        <h2 id="checkout-title">{step === 'done' ? 'Thank you!' : `Vote for ${entry.pet_name}`}</h2>
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
                          {multiplier > 1 && <s>{fmtInt(p.votes)}</s>}
                          {fmtInt(votesWithBonus(p, multiplier))} votes
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
          <label className="check" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>Send me Wausau Pilot &amp; Review&rsquo;s free daily newsletter.</span>
          </label>

          {error && (
            <div className="notice error" role="alert" style={{ marginBottom: 12 }}>
              <span>{error}</span>
            </div>
          )}

          {!STRIPE_PUBLISHABLE_KEY ? (
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

      {step === 'pay' && intent && STRIPE_PUBLISHABLE_KEY && (!closed || paying) && (
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
          {stripe.status === 'error' ? (
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
            <Elements stripe={stripe.value} options={{ clientSecret: intent.client_secret, appearance: APPEARANCE, fonts: FONTS }}>
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
      Votes count in the {label} only; totals reset every round. <a href="#/rules">Rules</a>
    </p>
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

function Done({ entry, intent, outcome, label, closesAt, currentVotes, contestName, canBuyAgain, onAgain, onClose }) {
  const votes = fmtInt(intent.votes)
  return (
    <div>
      <div className="success-burst" style={{ padding: '8px 0 4px' }}>
        <div className="mark">
          <Check size={34} />
        </div>
        <h2 style={{ fontSize: 26 }}>Payment received</h2>
        <p aria-live="polite">
          {outcome === 'credited' && (
            <>
              <strong>Your {votes} votes are in.</strong> {entry.pet_name} now has <span className="mono">{fmtInt(currentVotes)}</span> votes
              this round.
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

      <ShareTools entry={entry} contestName={contestName} title={`Now get ${entry.pet_name} more votes`} compact />

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

      <div className="support-box">
        <strong>WPR is a nonprofit newsroom</strong>
        Your vote pack isn&rsquo;t a donation. If you&rsquo;d like to support local journalism too,{' '}
        <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={() => track('Donate Click', { from: 'post-purchase' })}>
          make a tax-deductible gift to Wausau Pilot &amp; Review
        </a>
        , or{' '}
        <a href={NEWSLETTER_URL} target="_blank" rel="noopener noreferrer">
          get our free newsletter
        </a>
        .
      </div>

      <div style={{ marginTop: 14 }}>
        {/* A buyer's thank-you screen never carries an ad for itself. */}
        <Sponsor sponsor={SPONSORS.thankyou} slot="thankyou" eyebrow="Thank-you screen presented by" quiet />
      </div>
    </div>
  )
}
