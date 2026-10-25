// Numbers, money and dates. Dates are AP style in the newsroom's time zone,
// because the contest runs on the newsroom's clock no matter where a share
// link is opened. Imported by Node scripts too: nothing here touches the DOM.
import { NEWSROOM } from '../config.js'

export const TIME_ZONE = NEWSROOM.timeZone

// The zone's everyday name for copy beside a clock time: "Central time",
// "Mountain time". Same words in winter and summer.
export function timeZoneName(timeZone = TIME_ZONE) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'long' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')
  return `${(part?.value || 'local').replace(/ (Standard|Daylight) Time$/, '').replace(/ Time$/, '')} time`
}
export const TIME_ZONE_NAME = timeZoneName()

const intFmt = new Intl.NumberFormat('en-US')
export const fmtInt = (n) => intFmt.format(Math.round(n || 0))

// `exact` always shows cents: statements and receipts, where $20 and $20.00
// must not look like different kinds of number.
export function fmtMoney(cents, { whole = false, exact = false } = {}) {
  const dollars = (cents || 0) / 100
  if (!exact && (whole || Number.isInteger(dollars))) {
    return `$${intFmt.format(Math.round(dollars))}`
  }
  return `$${dollars.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

// Counts in a sentence, AP style: one through nine in words ("three votes"),
// numerals from 10. apNumber and apCount below are the same rule.
export const plural = (n, one, many = `${one}s`) => `${apNumber(n)} ${n === 1 ? one : many}`

// AP style: spell out one through nine, figures from 10. "five pets", "12 pets".
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
export const apNumber = (n) => (Number.isInteger(n) && n >= 0 && n < 10 ? WORDS[n] : fmtInt(n))
export const apCount = (n, one, many = `${one}s`) => `${apNumber(n)} ${n === 1 ? one : many}`

export function countdownParts(msLeft) {
  const s = Math.max(0, Math.floor(msLeft / 1000))
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}

// Two units, largest first: "2d 4h", "4h 12m", "12m 05s", "9s".
export function formatCountdown(msLeft) {
  const { days, hours, minutes, seconds } = countdownParts(msLeft)
  const pad = (n) => String(n).padStart(2, '0')
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${pad(minutes)}m`
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`
  return `${seconds}s`
}

// Spoken form for screen readers and headlines: "2 days, 4 hours".
export function describeCountdown(msLeft) {
  const { days, hours, minutes } = countdownParts(msLeft)
  const bits = []
  if (days) bits.push(plural(days, 'day'))
  if (hours) bits.push(plural(hours, 'hour'))
  if (!days && minutes) bits.push(plural(minutes, 'minute'))
  return bits.slice(0, 2).join(', ') || 'less than a minute'
}

export function timeAgo(date, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

const AP_MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']

function centralParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(date))
  const get = (type) => parts.find((p) => p.type === type)?.value
  return {
    weekday: get('weekday'),
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: get('minute'),
    period: get('dayPeriod'),
  }
}

// "Sunday, Oct. 11"
export function apDate(date, { weekday = true, year = false } = {}) {
  const p = centralParts(date)
  const d = `${AP_MONTHS[p.month - 1]} ${p.day}${year ? `, ${p.year}` : ''}`
  return weekday ? `${p.weekday}, ${d}` : d
}

// "8 p.m.", "8:30 a.m.", "noon", "midnight"
export function apTime(date) {
  const p = centralParts(date)
  const pm = p.period?.toUpperCase() === 'PM'
  if (p.minute === '00' && p.hour === 12) return pm ? 'noon' : 'midnight'
  const mins = p.minute === '00' ? '' : `:${p.minute}`
  return `${p.hour}${mins} ${pm ? 'p.m.' : 'a.m.'}`
}

export const apDateTime = (date, opts) => `${apDate(date, opts)} at ${apTime(date)}`

const AP_DAYS = { Sunday: 'Sun.', Monday: 'Mon.', Tuesday: 'Tue.', Wednesday: 'Wed.', Thursday: 'Thu.', Friday: 'Fri.', Saturday: 'Sat.' }

// A deadline short enough to sit beside a clock: "Sat. at 8 p.m." within the
// coming week, "Oct. 30 at 8 p.m." beyond it. In a sentence, `long` spells the
// day out ("Saturday at 8 p.m."), as AP does outside tables.
export function apWhen(date, now, { long = false } = {}) {
  const p = centralParts(date)
  const ahead = new Date(date).getTime() - now
  const day = ahead >= 0 && ahead < 6 * 86400000 ? (long ? p.weekday : AP_DAYS[p.weekday]) : `${AP_MONTHS[p.month - 1]} ${p.day}`
  return `${day} at ${apTime(date)}`
}

// End a sentence without doubling the period after "p.m."
export const period = (s) => (s.endsWith('.') ? s : `${s}.`)
