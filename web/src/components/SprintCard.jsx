import { useContest } from './ContestContext.jsx'
import { InlineCountdown } from './Countdown.jsx'
import { Clock } from './Icons.jsx'
import PetPhoto from './PetPhoto.jsx'
import { fetchSprintStandings } from '../lib/api.js'
import { apTime, fmtInt } from '../lib/format.js'
import { useLive } from '../lib/live.js'
import { sprintTitle, sprintWhen } from '../lib/sprints.js'

const SHOWN = ['voting', 'counting', 'intermission']

function SponsorName({ s }) {
  return s.sponsor_url ? (
    <a href={s.sponsor_url} target="_blank" rel="noopener sponsored">
      {s.sponsor_name}
    </a>
  ) : (
    s.sponsor_name
  )
}

// A sponsor's sprint on Home: coming up, running (with the top three),
// being counted, or won. The prize is the sponsor's; sprint votes count
// toward the round like any other, and the card says so.
export default function SprintCard({ byId }) {
  const c = useContest()
  const pick = SHOWN.includes(c.phase) ? c.sprint : null
  const s = pick?.sprint
  const counted = pick && pick.state !== 'soon'
  const res = useLive(counted ? `sprint:${s.id}` : null, () => fetchSprintStandings(s.id), pick?.state === 'live' ? 20000 : 60000)
  if (!pick) return null
  const top = (res.data || []).map((r) => ({ ...r, entry: byId.get(r.entry_id) })).filter((r) => r.entry)
  const winner = pick.state === 'won' && s.winner_entry_id ? byId.get(s.winner_entry_id) : null
  const title = sprintTitle(s)

  let kicker
  let head
  if (pick.state === 'soon') {
    kicker = <>{title} · starts in <InlineCountdown to={s.starts_at} /></>
    head = (
      <>
        The most votes from {sprintWhen(s)} wins <strong>{s.prize}</strong>.
      </>
    )
  } else if (pick.state === 'live') {
    kicker = <>{title} on now · <InlineCountdown to={s.ends_at} /> left</>
    head = (
      <>
        The most votes by {apTime(s.ends_at)} wins <strong>{s.prize}</strong>.
      </>
    )
  } else if (winner) {
    kicker = <>{title} · final</>
    head = (
      <>
        <strong>{winner.pet_name}</strong> won {s.prize}, with {fmtInt(s.winner_votes)} votes from {sprintWhen(s)}.
      </>
    )
  } else if (pick.state === 'won') {
    kicker = <>{title} · final</>
    head = <>No votes came in during the sprint, so there is no winner.</>
  } else {
    kicker = <>{title} · counting</>
    head = <>The sprint is over. The last payments are being counted, and the winner is announced shortly.</>
  }

  return (
    <section className="sprint-card card sun" aria-labelledby="sprint-title">
      <p className="sprint-kicker">
        <Clock size={16} />
        <span>{kicker}</span>
      </p>
      <h2 id="sprint-title" className="sprint-head">
        {head}
      </h2>
      {winner && (
        <a className="sprint-winner" href={`#/pet/${winner.id}`}>
          <PetPhoto entry={winner} width={160} square alt="" />
          <span>See {winner.pet_name}</span>
        </a>
      )}
      {!winner && top.length > 0 && (
        <ol className="sprint-top" aria-label={pick.state === 'live' ? 'Leading the sprint' : 'Unofficial sprint standings'}>
          {top.map((r) => (
            <li key={r.entry_id}>
              <span className="sprint-place mono">{r.place}</span>
              <PetPhoto entry={r.entry} width={96} square alt="" />
              <a href={`#/pet/${r.entry_id}`}>{r.entry.pet_name}</a>
              <span className="mono sprint-votes">{fmtInt(r.votes)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="small sprint-note">
        Prize from <SponsorName s={s} />. Sprint votes count toward the round like any other.{' '}
        <a href="#/rules">How sprints work</a>
      </p>
    </section>
  )
}

// One line on a pet page while a sprint runs in the pet's round.
export function SprintLine({ roundId }) {
  const c = useContest()
  const pick = c.phase === 'voting' ? c.sprint : null
  if (!pick || pick.state !== 'live' || pick.sprint.round_id !== roundId) return null
  const s = pick.sprint
  return (
    <p className="sprint-line" role="note">
      <Clock size={16} />
      <span>
        <strong>{sprintTitle(s)} on now.</strong> The most votes by {apTime(s.ends_at)} wins {s.prize}, from <SponsorName s={s} />.
      </span>
    </p>
  )
}
