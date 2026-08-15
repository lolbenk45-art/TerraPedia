import { get } from '~/composables/useApi'
import { progressRowsFromOverview } from '~/utils/crawlerMonitorProgressRows.mjs'
import { buildDomainTableRows } from '~/utils/crawlerMonitorDomainTable.mjs'
import { buildTriageWorkbench } from '~/utils/crawlerMonitorTriageWorkbench.mjs'

export function diffCrawlerMonitorEvents(prevDomainStatus, overview) {
  const domains = Array.isArray(overview?.wikiMonitor?.domains) ? overview.wikiMonitor.domains : []
  const dispatchQueue = Array.isArray(overview?.wikiMonitor?.dispatchQueue) ? overview.wikiMonitor.dispatchQueue : []
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

  return { events, nextState }
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
