import { useContest } from './ContestContext.jsx'
import { finaleIcs } from './FinaleCard.jsx'
import { Calendar, Clock } from './Icons.jsx'
import { track } from '../lib/analytics.js'
import { icsHref } from '../lib/calendar.js'
import { apDateTime, period } from '../lib/format.js'
import { sprintTitle, sprintWhen } from '../lib/sprints.js'

// What is on its way, in one quiet card on Home: a sprint starting within
// two days and the finale until its last day. Each becomes its own card
// once it runs (SprintCard) or the finale is a day out (FinaleCard), so the
// page never stacks two big boards for things that have not started.
export default function ComingUp({ finale = null, sprint = null }) {
  const c = useContest()
  if (!finale && !sprint) return null
  return (
    <section className="coming-up" aria-labelledby="coming-up-title">
      <h2 id="coming-up-title" className="coming-up-title">
        Coming up
      </h2>
      <ul>
        {sprint && (
          <li>
            <Clock size={18} />
            <span>
              <strong>{sprintTitle(sprint)}</strong>, {period(sprintWhen(sprint))} The most votes wins {sprint.prize}, from {sprint.sponsor_name}.
            </span>
          </li>
        )}
        {finale && (
          <li>
            <Calendar size={18} />
            <span>
              <strong>The finale</strong>, {period(apDateTime(finale.at))} The champion is revealed live.{' '}
              {finale.url && (
                <>
                  <a href={finale.url} target="_blank" rel="noopener" onClick={() => track('Finale', { where: 'home-coming-up' })}>
                    Where to watch
                  </a>
                  {' · '}
                </>
              )}
              <a href={icsHref(finaleIcs(c.contest, finale))} download="pet-contest-finale.ics" onClick={() => track('Calendar', { finale: true })}>
                Add to calendar
              </a>
            </span>
          </li>
        )}
      </ul>
    </section>
  )
}
