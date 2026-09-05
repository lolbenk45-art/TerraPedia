import { get } from '~/composables/useApi'
import { progressRowsFromOverview } from '~/utils/crawlerMonitorProgressRows.mjs'
import { buildDomainTableRows } from '~/utils/crawlerMonitorDomainTable.mjs'
import { buildTriageWorkbench } from '~/utils/crawlerMonitorTriageWorkbench.mjs'

export function diffCrawlerMonitorEvents(prevDomainStatus, overview) {
  const domains = Array.isArray(overview?.wikiMonitor?.domains) ? overview.wikiMonitor.domains : []
  const dispatchQueue = Array.isArray(overview?.wikiMonitor?.dispatchQueue) ? overview.wikiMonitor.dispatchQueue : []
  const alerts = Array.isArray(overview?.wikiMonitor?.alerts) ? overview.wikiMonitor.alerts : []
  const progressRows = progressRowsFromOverview(overview || {})
  const domainRows = buildDomainTableRows({ domains, progressRows, dispatchQueue })
  const workbench = buildTriageWorkbench({ domainRows })

  const nextState = {}
  const events = []

  for (const row of workbench.allRows || []) {
    const key = row.domain
    if (!key) continue

    nextState[key] = row.triageStatus
    const prevStatus = prevDomainStatus?.[key]

    if (row.triageStatus !== prevStatus && row.needsAttention) {
      events.push({
        id: `crawler:${key}:${row.triageStatus}`,
        source: 'crawler-monitor',
        level: 'danger',
        title: `${row.label || key} · ${row.diagnosisTitle || row.triageStatus}`,
        detail: row.reason || '',
        link: `/operations/crawler-monitor?domain=${encodeURIComponent(key)}`,
        createdAt: Date.now(),
      })
    }
  }

  const previousAlerts = prevDomainStatus?.__alerts && typeof prevDomainStatus.__alerts === 'object'
    ? prevDomainStatus.__alerts
    : {}
  const nextAlerts = {}
  for (const alert of alerts) {
    if (String(alert?.status || 'OPEN').toUpperCase() !== 'OPEN') continue
    const dedupeKey = String(alert?.dedupeKey || alert?.id || '').trim()
    if (!dedupeKey) continue
    nextAlerts[dedupeKey] = true
    if (previousAlerts[dedupeKey]) continue

    const level = alertLevel(alert?.severity)
    const domain = String(alert?.domain || '').trim()
    events.push({
      id: `crawler-alert:${dedupeKey}`,
      source: 'crawler-monitor',
      level,
      title: String(alert?.title || 'Crawler automation alert'),
      detail: String(alert?.details || ''),
      link: domain
        ? `/operations/crawler-monitor?domain=${encodeURIComponent(domain)}`
        : '/operations/crawler-monitor',
      createdAt: toEventTimestamp(alert?.createdAt || alert?.lastSeenAt),
    })
  }
  if (alerts.length > 0 || Object.keys(previousAlerts).length > 0) {
    nextState.__alerts = nextAlerts
  }

  return { events, nextState }
}

function alertLevel(severity) {
  const normalized = String(severity || '').toUpperCase()
  if (normalized === 'CRITICAL' || normalized === 'ERROR' || normalized === 'HIGH') return 'danger'
  if (normalized === 'WARNING' || normalized === 'WARN' || normalized === 'MEDIUM') return 'warning'
  return 'info'
}

function toEventTimestamp(value) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : Date.now()
}

export const crawlerMonitorSource = {
  key: 'crawler-monitor',
  intervalMs: 20000,
  async fetch() {
    const response = await get('/admin/crawler-monitor/overview')
    return (response?.data ?? response) || null
  },
  diff: diffCrawlerMonitorEvents,
}
