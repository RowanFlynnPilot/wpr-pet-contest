import { apDate, fmtMoney } from '../lib/format.js'
import { cheapestPerVote } from '../lib/packs.js'
import { roundLabel } from '../lib/rounds.js'
import { useContest } from './ContestContext.jsx'
import { Refresh } from './Icons.jsx'

export default function HowItWorks() {
  const { contest, bracketSize, packs } = useContest()
  const from = packs.length ? Math.min(...packs.map((p) => p.cents)) : null
  const low = cheapestPerVote(packs)
  const hours = contest?.bracket_round_hours || 48
  const close = contest?.submissions_close_at
  return (
    <section className="section" aria-labelledby="how-title">
      <div className="section-head">
        <div>
          <p className="kicker">How it works</p>
          <h2 id="how-title">Three steps to top dog (or cat)</h2>
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
            {from != null ? `Vote packs start at ${fmtMoney(from)}, as low as ${low} a vote in bulk.` : 'Buy vote packs for your favorites.'} The
            top {bracketSize} make the bracket, seeded by their votes.
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
