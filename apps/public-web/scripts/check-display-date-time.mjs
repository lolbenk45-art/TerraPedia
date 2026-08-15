import { formatDisplayDateTime } from '../lib/displayDateTime.mjs'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const isoMinute = formatDisplayDateTime('2026-06-06T11:24:44')
assert(isoMinute === '2026-06-06 11:24', `expected minute precision date, got ${isoMinute}`)
assert(!isoMinute.includes('T'), 'formatted date must not expose ISO T separator')
assert(!/\d{2}:\d{2}:\d{2}/.test(isoMinute), 'formatted date must not include seconds')

const isoWithSpace = formatDisplayDateTime('2026-06-06 11:24:44')
assert(isoWithSpace === '2026-06-06 11:24', `expected space timestamp to drop seconds, got ${isoWithSpace}`)

const dateOnly = formatDisplayDateTime('2026-06-06')
assert(dateOnly === '2026-06-06', `expected date-only value to stay date-only, got ${dateOnly}`)

const blank = formatDisplayDateTime(null)
assert(blank === '', `expected blank fallback for null, got ${blank}`)

const invalid = formatDisplayDateTime('待审核')
assert(invalid === '待审核', `expected invalid date labels to pass through, got ${invalid}`)

console.log('Display date time checks passed.')
