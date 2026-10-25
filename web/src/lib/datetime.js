// <input type="datetime-local"> speaks the browser's local time with no zone.
// Staff are on the newsroom's clock, but convert through the browser either
// way so what they type is what the database stores.
import { TIME_ZONE, apDate, apTime } from './format.js'

const pad = (n) => String(n).padStart(2, '0')

export function toLocalInput(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// A staff timestamp, AP style on the newsroom's clock, with the zone, since a
// contest can straddle the end of daylight time: "Oct. 25, 1:54 p.m. CDT".
export function stamp(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value
  return `${apDate(d, { weekday: false })}, ${apTime(d)}${zone ? ` ${zone}` : ''}`
}
