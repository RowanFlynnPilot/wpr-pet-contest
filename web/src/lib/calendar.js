// "Add the deadline to my calendar": an .ics event at a round's closing time,
// with a reminder two hours before. The reminder that works inside the
// WordPress iframe, where browsers refuse push notifications; on a phone the
// link opens the calendar's own "add event" sheet. Pure, so it is unit-tested.
import { NEWSROOM } from '../config.js'
import { apDateTime, period } from './format.js'

const HOST = new URL(NEWSROOM.url).hostname

const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

// RFC 5545 text: escape \ ; , and newlines, and fold lines past 75 octets.
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
function fold(line) {
  const out = []
  let rest = line
  while (rest.length > 74) {
    out.push(rest.slice(0, 74))
    rest = ` ${rest.slice(74)}`
  }
  out.push(rest)
  return out.join('\r\n')
}

// Any event: a start, an end, and an alarm before it.
export function eventIcs({ uid, title, startsAt, endsAt, url, description, alarm = '-PT30M', now = Date.now() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${NEWSROOM.name}//Pet contest//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@${HOST}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(startsAt)}`,
    `DTEND:${stamp(endsAt)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)}`,
    `TRIGGER:${alarm}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

// A round's deadline: 15 minutes ending at the close, reminder two hours out.
export function deadlineIcs({ uid, title, closesAt, url, description, now = Date.now() }) {
  const end = new Date(closesAt)
  return eventIcs({ uid, title, startsAt: new Date(end.getTime() - 15 * 60 * 1000), endsAt: end, url, description, alarm: '-PT2H', now })
}

// Entries opening, for the weeks between the announcement and the first day:
// half an hour from the open, the reminder at the open itself.
export function entriesOpenIcs({ contest, url, now = Date.now() }) {
  const name = contest.name || `Cutest Pet in ${NEWSROOM.region}`
  return eventIcs({
    uid: `entries-open-${contest.id}`,
    title: `Entries open: ${name}`,
    startsAt: contest.submissions_open_at,
    endsAt: new Date(Date.parse(contest.submissions_open_at) + 30 * 60 * 1000),
    url,
    description: `${period(`Enter your pet free with one phone photo, until ${apDateTime(contest.submissions_close_at)}`)} ${url}`,
    alarm: 'PT0M',
    now,
  })
}

export const icsHref = (ics) => `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
