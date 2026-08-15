const twoDigits = (value) => String(value).padStart(2, '0')

export const formatDisplayDateTime = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/)
  if (match) {
    const [, year, month, day, hour, minute] = match
    return hour && minute ? `${year}-${month}-${day} ${hour}:${minute}` : `${year}-${month}-${day}`
  }

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return [
    date.getFullYear(),
    twoDigits(date.getMonth() + 1),
    twoDigits(date.getDate()),
  ].join('-') + ` ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
}
