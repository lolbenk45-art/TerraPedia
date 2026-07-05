import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(appRoot, relativePath), 'utf8')
}

const page = read('pages/operations/crawler-monitor.vue')
const triageBoard = read('components/crawler-monitor/CrawlerTriageBoard.vue')
const domainDrawer = read('components/crawler-monitor/DomainDetailDrawer.vue')
const activityDrawer = read('components/crawler-monitor/ActivityDrawer.vue')
const systemDrawer = read('components/crawler-monitor/SystemDrawer.vue')
const logViewer = read('components/crawler-monitor/CrawlerLogViewer.vue')

test('crawler monitor mounts the triage workbench and drawers instead of old top-level panels', () => {
  assert.match(page, /class="page-wrap page-workspace crawler-monitor crawler-monitor-triage"/)
  assert.match(page, /<CrawlerTriageBoard/)
  assert.match(page, /<DomainDetailDrawer/)
  assert.match(page, /<ActivityDrawer/)
  assert.match(page, /<SystemDrawer/)
  assert.match(page, /buildTriageWorkbench/)
  assert.match(page, /buildDomainDetailViewModel/)

  assert.doesNotMatch(page, /<nav class="module-tabs"/)
  assert.doesNotMatch(page, /v-show="activeMonitorPanel === 'queue'"/)
  assert.doesNotMatch(page, /v-show="activeMonitorPanel === 'progress'"/)
  assert.doesNotMatch(page, /v-show="activeMonitorPanel === 'reports'"/)
  assert.doesNotMatch(page, /v-show="activeMonitorPanel === 'diagnostics'"/)
})

test('crawler monitor keeps the existing backend endpoints and control actions wired', () => {
  for (const marker of [
    "get('/admin/crawler-monitor/overview')",
    "get('/admin/crawler-monitor/report'",
    "put('/admin/crawler-monitor/auto-dispatch'",
    "post('/admin/crawler-monitor/dispatch'",
    "post('/admin/crawler-monitor/dispatch/control'",
    "controlAction: 'forceReclaimAll'",
    "buildDispatchControlPayload('forceReclaim'",
  ]) {
    assert.ok(page.includes(marker), `missing endpoint/control marker: ${marker}`)
  }
})

test('triage board implements capped attention, overflow chips, and card/table switching', () => {
  for (const marker of [
    'attentionCards',
    'overflowAttentionRows',
    "viewMode === 'cards'",
    "viewMode === 'table'",
    'tableFilter',
    'scrollIntoView',
    'domain-table-shell--virtual',
    'force-reclaim-all',
  ]) {
    assert.ok(triageBoard.includes(marker), `missing triage board marker: ${marker}`)
  }
})

test('domain detail drawer owns single-domain overview, history, queue, artifacts, and logs', () => {
  for (const marker of [
    "{ key: 'overview'",
    "{ key: 'history'",
    "{ key: 'queue'",
    "{ key: 'artifacts'",
    "{ key: 'logs'",
    '<CrawlerLogViewer',
    'taskHistory',
    'queueItems',
    'artifacts',
  ]) {
    assert.ok(domainDrawer.includes(marker), `missing domain drawer marker: ${marker}`)
  }
})

test('activity and system drawers move secondary content out of the first screen', () => {
  assert.match(activityDrawer, /跨域任务流/)
  assert.match(activityDrawer, /activity-list/)
  assert.match(systemDrawer, /报告库/)
  assert.match(systemDrawer, /自动派发/)
  assert.match(systemDrawer, /dataQualitySignals/)
  assert.match(systemDrawer, /runtimeStateCards/)
})

test('log viewer filters by level and search through pure helper', () => {
  assert.match(logViewer, /filterLogLines/)
  assert.match(logViewer, /selectedLevels/)
  assert.match(logViewer, /搜索日志/)
})
