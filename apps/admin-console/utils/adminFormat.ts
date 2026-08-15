export function formatDateTime(value?: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN')
}

export function statusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (['pass', 'success', 'ok', 'readable', 'ready'].includes(normalized)) return 'success'
  if (['blocked', 'error', 'fail', 'failed', 'read error'].includes(normalized)) return 'danger'
  if (['warning', 'warn', 'needs_confirmation'].includes(normalized)) return 'warning'
  return 'muted'
}
