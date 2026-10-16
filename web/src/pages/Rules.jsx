import { RULES, WPR_URL } from '../config.js'
import { useContest } from '../components/ContestContext.jsx'
import { apDate, apDateTime, fmtInt, fmtMoney, period } from '../lib/format.js'
import { useDocumentTitle } from '../lib/hooks.js'
import { formatPerVote } from '../lib/packs.js'
import { bracketRoundCount, roundLabel } from '../lib/rounds.js'
import { windowTitle } from '../lib/bonus.js'

// Generated from the contest row, the packs table and the bonus schedule, so
// the published rules cannot drift from what checkout actually does. DRAFT
// until RULES.rulesApproved is flipped in config.js.
export default function Rules() {
  const c = useContest()
  useDocumentTitle('Official rules — Wausau Pilot & Review')
  const k = c.contest
  if (!k) return <div className="wrap section" aria-busy="true" />

  const size = c.bracketSize
  const hours = k.bracket_round_hours || 48
  const round1 = c.rounds.find((r) => r.seq === 1)
  const packs = [...c.packs].sort((a, b) => a.cents - b.cents)
  const bracketRounds = Array.from({ length: bracketRoundCount(size) }, (_, i) => {
    const seq = i + 2
    return { seq, label: roundLabel(seq, size), round: c.rounds.find((r) => r.seq === seq) }
  })

  return (
    <>
      {!RULES.rulesApproved && (
        <div className="draft-ribbon" role="note">
          Draft: these rules are pending review by Wausau Pilot &amp; Review and are not yet final.
        </div>
      )}
      <article className="wrap-narrow section rules">
        <p className="kicker">{k.year} · Official rules</p>
        <h1 style={{ fontSize: 'clamp(30px, 6vw, 44px)' }}>{k.name}</h1>
        <p className="dek">Free to enter. Voting is by vote pack purchase. Vote packs are not tax-deductible.</p>

        <h2>1. The contest</h2>
        <p>
          The {k.name} contest (the &ldquo;Contest&rdquo;) is run by Wausau Pilot &amp; Review (&ldquo;WPR&rdquo;), a nonprofit newsroom in
          Wausau, Wisconsin. <strong>{k.beneficiary_split_pct}% of vote pack sales</strong>, after any refunds, is paid to the Contest&rsquo;s partner
          animal shelters{c.shelters.length ? ` (${c.shelters.map((s) => s.name).join(', ')})` : ''}. The remainder covers payment
          processing and supports WPR.
        </p>

        <h2>2. Eligibility</h2>
        <p>{RULES.eligibility}</p>
        <p>Pets of any kind may be entered. Each entry must be a different pet, and an email address may enter a limited number of pets.</p>

        <h2>3. How to enter</h2>
        <p>
          Entry is free at the Contest page between <strong>{apDateTime(k.submissions_open_at)}</strong> and{' '}
          <strong>{apDateTime(k.submissions_close_at)}</strong> Central time. Each entry needs one photo (JPEG, PNG or WebP, up to 10 MB),
          the pet&rsquo;s name, species and town, and the entrant&rsquo;s name and email address. The entrant&rsquo;s name and email are never
          published.
        </p>
        <p>
          Every entry is reviewed by a WPR editor before it appears. WPR may decline any entry, with a reason, including a photo that is not a
          pet, is of low quality, duplicates another entry, is inappropriate, or is not the entrant&rsquo;s own photo. A declined photo is
          deleted.
        </p>

        <h2>4. Photo release</h2>
        <p>
          By entering, the entrant confirms they took the photo or have the right to share it, that the pet lives with them or is in their
          care, and that they are 18 or older; and grants WPR permission to publish the photo, the pet&rsquo;s name, town and caption in
          print, online and on social media to promote the Contest, without payment.
        </p>

        <h2>5. Rounds and schedule</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Round</th>
              <th scope="col">Who competes</th>
              <th scope="col">When</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Open Round</td>
              <td>Every approved entry</td>
              <td>{round1 ? `${apDate(round1.opens_at, { weekday: false })} to ${apDateTime(round1.closes_at, { weekday: false })}` : 'After entries close'}</td>
            </tr>
            {bracketRounds.map((r) => (
              <tr key={r.seq}>
                <td>{r.label}</td>
                <td>{r.seq === 2 ? `Top ${size} from the Open Round, seeded 1 to ${size}` : 'Winners of the previous round'}</td>
                <td>{r.round && r.round.status !== 'pending' ? `Closes ${apDateTime(r.round.closes_at, { weekday: false })}` : `About ${hours} hours`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          The top {size} pets in the Open Round advance to a head-to-head bracket, seeded by their Open Round vote totals (1 is the most votes).
          Seeds are paired so the top two can only meet in the {roundLabel(1 + bracketRoundCount(size), size)}.
        </p>
        <p>
          <strong>Vote totals reset at the start of every round.</strong> Open Round votes decide which pets qualify for the bracket and
          their seeds, and nothing more. In every bracket round both pets start at zero, and the pet with more votes when the round closes
          advances.
        </p>
        <p>
          <strong>The deadline.</strong> A vote counts if its payment completes by the round&rsquo;s posted closing time. A two-minute grace
          period covers a payment already in progress at the deadline. A payment completed later does not count and is refunded
          automatically, even if the results have not been finalized yet. A WPR editor finalizes the results shortly after the deadline, and
          finalized results are final.
        </p>

        <h2>6. Ties</h2>
        <ul>
          <li>
            <strong>Open Round:</strong> the pet that was entered earlier ranks higher.
          </li>
          <li>
            <strong>Bracket rounds:</strong> the better (lower-numbered) seed advances.
          </li>
        </ul>
        <p>Ties are never decided by a drawing or by WPR staff.</p>

        <h2>7. Vote packs</h2>
        <p>
          Votes are cast by buying vote packs for one pet in the round that is open. Vote pack purchases are <strong>not tax-deductible</strong>{' '}
          donations: the buyer receives votes in exchange. There is no limit on the number of packs a person may buy.
        </p>
        {packs.length > 0 && (
          <table>
            <thead>
              <tr>
                <th scope="col">Pack</th>
                <th scope="col">Votes</th>
                <th scope="col">Price</th>
                <th scope="col">Per vote</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((p) => (
                <tr key={p.id}>
                  <td>{p.label}</td>
                  <td className="mono">{fmtInt(p.votes)}</td>
                  <td>{fmtMoney(p.cents)}</td>
                  <td>{formatPerVote(p).replace(' a vote', '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>
          Payment is by card, including Apple Pay and Google Pay. Votes are credited only when the payment processor confirms the payment,
          usually within seconds. Votes count only in the round they were bought in.
        </p>

        <h2>8. Bonus windows</h2>
        <p>
          WPR may announce bonus windows (for example, &ldquo;Double Votes&rdquo;), sometimes presented by a sponsor, during which every vote pack
          counts two to five times over. A bonus applies to vote packs <strong>whose checkout begins during the window</strong>. The vote count
          shown at checkout is the count the buyer receives.
        </p>
        {c.windows.length > 0 && (
          <ul>
            {c.windows.map((w) => (
              <li key={w.id}>
                {windowTitle(w)} (×{w.multiplier}): {apDateTime(w.starts_at)} to {period(`${apDateTime(w.ends_at, { weekday: false })}${w.sponsor_name ? `, presented by ${w.sponsor_name}` : ''}`)}
              </li>
            ))}
          </ul>
        )}

        <h2>9. Late, refunded and disputed payments</h2>
        <ul>
          <li>A payment completed after the round&rsquo;s deadline (plus the two-minute grace period) does not count and is refunded automatically.</li>
          <li>Votes from a refunded payment are removed from the totals.</li>
          <li>Votes from a disputed payment (a chargeback) are removed from the totals.</li>
          <li>Finalized results of a closed round are not reopened.</li>
        </ul>

        <h2>10. Disqualification</h2>
        <p>
          If an entry is disqualified after voting has begun (for example, because its photo is not the entrant&rsquo;s own or the entrant is
          not eligible), <strong>every vote pack bought for that pet, in every round, is refunded in full</strong> to the original payment
          method. The pet is removed from the Contest. If it is in a matchup, its opponent advances regardless of the vote count. Results of
          rounds already finalized stand. Disqualification is not available once the Contest is complete.
        </p>

        <h2>11. Side awards</h2>
        <p>
          After the Open Round, the dog, the cat and the other pet with the most Open Round votes are named Best Dog, Best Cat and Best
          Other, using the same tiebreak.
        </p>

        <h2>12. General</h2>
        <p>
          WPR may disqualify an entry (section 10) or void votes that break these rules or that it reasonably believes were obtained by fraud, and may
          modify or cancel the Contest if it cannot run as planned. Decisions of WPR are final. Adoptable shelter pets may be entered by a
          partner shelter as wildcards and compete under the same rules.
        </p>

        <h2>13. Contact</h2>
        <p>
          Questions: <a href={`mailto:${RULES.contact}`}>{RULES.contact}</a> or 715-301-5539 ·{' '}
          <a href={WPR_URL} target="_blank" rel="noopener noreferrer">
            Wausau Pilot &amp; Review
          </a>
        </p>
      </article>
    </>
  )
}
