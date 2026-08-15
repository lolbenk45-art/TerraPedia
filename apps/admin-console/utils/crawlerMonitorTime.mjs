const SHANGHAI_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const SHANGHAI_SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function normalize(value) {
  return String(value || '').trim()
}

export function formatShanghaiDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return normalize(value)
  const parts = Object.fromEntries(SHANGHAI_DATE_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

export function formatShanghaiDateLabel(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return normalize(value)
  const parts = Object.fromEntries(SHANGHAI_SHORT_DATE_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}
