// "Add the deadline to my calendar": an .ics event at a round's closing time,
// with a reminder two hours before. The reminder that works inside the
// WordPress iframe, where browsers refuse push notifications; on a phone the
// link opens the calendar's own "add event" sheet. Pure, so it is unit-tested.

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

export function deadlineIcs({ uid, title, closesAt, url, description, now = Date.now() }) {
  const end = new Date(closesAt)
  const start = new Date(end.getTime() - 15 * 60 * 1000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wausau Pilot & Review//Pet contest//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@wausaupilotandreview.com`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(title)}`,
    'TRIGGER:-PT2H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

export const icsHref = (ics) => `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
