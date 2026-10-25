import { NEWSROOM, SPONSORS } from '../config.js'
import { useContest } from './ContestContext.jsx'
import { CountdownCells } from './Scoreboard.jsx'
import { Calendar } from './Icons.jsx'
import { track } from '../lib/analytics.js'
import { eventIcs, icsHref } from '../lib/calendar.js'
import { PUBLIC_URL } from '../lib/env.js'
import { finaleState } from '../lib/finale.js'
import { apDateTime, period } from '../lib/format.js'

const watch = (where) => track('Finale', { where })

// The finale as a calendar event: an hour from its start, a reminder before.
export function finaleIcs(contest, f) {
  const name = contest?.name || `Cutest Pet in ${NEWSROOM.region}`
  return eventIcs({
    uid: `finale-${contest.id}`,
    title: `The finale: ${name}`,
    startsAt: f.at,
    endsAt: new Date(Date.parse(f.at) + 3600e3),
    url: f.url || PUBLIC_URL,
    description: `${NEWSROOM.name} reveals the champion live.${f.url ? ` Watch: ${f.url}` : ''}`,
  })
}

// The finale on Home and Results: a countdown and a calendar link before
// it, "live now" while it runs, and a quiet replay link after.
export default function FinaleCard({ where = 'home' }) {
  const c = useContest()
  const f = finaleState(c.contest, c.phase, c.now)
  if (!f) return null
  // The presenting sponsor's name rides on the finale too (part of that
  // placement, sold as Best in Show in the sponsor kit).
  const by = SPONSORS.presenting?.name
  const presented = by ? <span className="finale-by"> · presented by {by}</span> : null

  if (f.state === 'replay') {
    return (
      <p className="finale-replay">
        Missed the finale?{' '}
        <a href={f.url} target="_blank" rel="noopener" onClick={() => watch(`${where}-replay`)}>
          Watch the champion&rsquo;s reveal
        </a>
        .
      </p>
    )
  }

  if (f.state === 'live') {
    return (
      <section className="finale-card is-live" aria-labelledby="finale-title">
        <p className="finale-kicker">
          <span className="finale-dot" aria-hidden="true" /> Live now{presented}
        </p>
        <h2 id="finale-title">The finale is on: watch the champion revealed.</h2>
        <a className="btn btn-sun" href={f.url} target="_blank" rel="noopener" onClick={() => watch(`${where}-live`)}>
          Watch live
        </a>
      </section>
    )
  }

  const ics = finaleIcs(c.contest, f)
  return (
    <section className="finale-card" aria-labelledby="finale-title">
      <p className="finale-kicker">The finale{presented}</p>
      <h2 id="finale-title">{period(`The champion is revealed live ${apDateTime(f.at)}`)}</h2>
      <CountdownCells to={f.at} label="The finale starts in" />
      <div className="finale-actions">
        {f.url && (
          <a className="btn btn-sun" href={f.url} target="_blank" rel="noopener" onClick={() => watch(`${where}-early`)}>
            Where to watch
          </a>
        )}
        <a className="btn btn-quiet" href={icsHref(ics)} download="pet-contest-finale.ics" onClick={() => track('Calendar', { finale: true })}>
          <Calendar size={16} /> Add to calendar
        </a>
      </div>
    </section>
  )
}
