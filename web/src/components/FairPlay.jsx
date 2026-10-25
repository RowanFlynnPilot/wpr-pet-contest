import { NEWSROOM } from '../config.js'
import { useContest } from './ContestContext.jsx'
import { Check } from './Icons.jsx'

// The fair-play promises, in one place, on the rules page and the money
// page. Each line is something the code enforces, not a slogan: one field
// (some pet contests split entrants into small groups so every pet can say
// it leads its group; this one never does), totals that reset, the split
// after refunds with card fees on the newsroom, a purchase never a
// donation, one price list for everyone, results that never move once
// published, and staff who may not enter.
export default function FairPlay({ id = 'fair-play', wide = false }) {
  const c = useContest()
  const k = c.contest
  if (!k) return null
  const split = k.beneficiary_split_pct
  const half = split === 50
  const shelters = c.shelters.length === 1 ? c.shelters[0].name : 'the partner shelters'
  const lines = [
    ['One field, real ranks.', `Every pet runs in the same field, and the rank you see is its place among all of them. No small groups where every pet can say it is in first.`],
    ['Every round starts at zero.', `The Open Round picks the top ${c.bracketSize} and seeds them. After that each matchup starts fresh, so votes never carry over.`],
    [
      half ? 'Half of every vote pack goes to the shelters.' : `${split}% of every vote pack goes to the shelters.`,
      `It is paid to ${shelters} after any refunds. Card fees come out of ${NEWSROOM.shortName}'s share, not theirs.`,
    ],
    ['A purchase, never a donation.', 'A vote pack buys votes, so it is not tax-deductible. Checkout says so before you pay.'],
    ['One price list for everyone.', 'The packs listed in the rules are the only prices. During a bonus window, checkout shows the votes you get before you pay.'],
    ['Results stand.', 'Once a round is decided its totals never change. A later refund changes the money raised, never a result.'],
    ...(k.free_vote_enabled ? [['One free vote a day.', 'Per verified email address, counted as one vote, never multiplied.']] : []),
    ['Staff stay out.', `${NEWSROOM.shortName} staff and their households may not enter.`],
  ]
  return (
    <section className={`fair-play${wide ? ' wide' : ''}`} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Fair play</h2>
      <ul>
        {lines.map(([lead, rest]) => (
          <li key={lead}>
            <span className="fair-check" aria-hidden="true">
              <Check size={16} />
            </span>
            <span>
              <strong>{lead}</strong> {rest}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
