import { apDate, fmtMoney } from '../lib/format.js'
import { cheapestPerVote } from '../lib/packs.js'
import { roundLabel } from '../lib/rounds.js'
import { useContest } from './ContestContext.jsx'
import { Refresh } from './Icons.jsx'

// `compact` once voting is on: the readers who need the three steps have
// read them, and the rest came to vote. One line, the reset rule kept, and
// the rules a tap away.
export default function HowItWorks({ compact = false }) {
  const { contest, bracketSize, packs } = useContest()
  const from = packs.length ? Math.min(...packs.map((p) => p.cents)) : null
  const low = cheapestPerVote(packs)
  const hours = contest?.bracket_round_hours || 48
  const close = contest?.submissions_close_at
  if (compact) {
    return (
      <section className="section how-compact" aria-label="How it works">
        <p>
          <Refresh size={18} />
          <span>
            <strong>How it works:</strong> {from != null ? `vote packs from ${fmtMoney(from)}` : 'vote packs'}, the top {bracketSize} make the
            bracket, and <strong>every round starts at zero</strong>.{' '}
            <a href="#/rules">The rules</a>
          </span>
        </p>
      </section>
    )
  }
  return (
    <section className="section" aria-labelledby="how-title">
      <div className="section-head">
        <div>
          <h2 id="how-title">Three steps to top dog (or cat)</h2>
          <p className="section-count">How it works</p>
        </div>
      </div>
      <ol className="steps">
        <li className="step">
          <h3>Enter your pet, free</h3>
          <p>
            Upload a photo and a line about why they&rsquo;re the cutest{close ? ` by ${apDate(close, { weekday: false })}` : ''}. An editor
            checks every entry before it goes live.
          </p>
        </li>
        <li className="step">
          <h3>The Open Round</h3>
          <p>
            Every pet competes at once.{' '}
            {from != null ? `Vote packs start at ${fmtMoney(from)}, as low as ${low} a vote in bulk.` : 'Buy vote packs for your favorites.'}
            {contest?.free_vote_enabled && ' Everyone also gets one free vote a day.'} The top {bracketSize} make the bracket, seeded by their
            votes.
          </p>
        </li>
        <li className="step">
          <h3>Head-to-head bracket</h3>
          <p>
            The {roundLabel(2, bracketSize)} through the {roundLabel(1 + Math.log2(bracketSize), bracketSize)}, {hours} hours a round.
            The pet with more votes moves on until one is crowned.
          </p>
        </li>
      </ol>
      <div className="reset-callout">
        <Refresh size={20} />
        <span>
          <strong>Vote totals reset every round.</strong> Round 1 votes buy a spot in the bracket and a better seed, nothing more.
          Every matchup starts at zero, so any pet in the bracket can win it.
        </span>
      </div>
    </section>
  )
}
