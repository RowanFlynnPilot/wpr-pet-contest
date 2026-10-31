import { NEWSROOM } from '../config.js'
import { Calendar } from './Icons.jsx'
import { track } from '../lib/analytics.js'
import { entriesOpenIcs, icsHref } from '../lib/calendar.js'
import { PUBLIC_URL } from '../lib/env.js'
import { apDate } from '../lib/format.js'

// "Add Nov. 14 to my calendar": the one thing to do before entries open. No
// address to hand over, and it works inside the WordPress iframe, where a
// phone opens its calendar's own "add event" sheet.
export default function EntriesCalendar({ contest, where, className = 'btn btn-primary btn-lg' }) {
  const ics = entriesOpenIcs({ contest, url: PUBLIC_URL || NEWSROOM.url })
  return (
    <a className={className} href={icsHref(ics)} download="pet-contest-entries-open.ics" onClick={() => track('Calendar', { kind: 'entries', where })}>
      <Calendar size={18} /> Add {apDate(contest.submissions_open_at, { weekday: false })} to my calendar
    </a>
  )
}
