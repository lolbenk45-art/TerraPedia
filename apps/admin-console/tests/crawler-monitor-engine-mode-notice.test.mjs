import assert from 'node:assert/strict'
import test from 'node:test'
import { crawlerEngineModeNotice } from '../pages/operations/crawler-monitor.v2-state.mjs'

test('overview 未加载时不提示引擎回退', () => {
  assert.equal(crawlerEngineModeNotice(null), null)
  assert.equal(crawlerEngineModeNotice(undefined), null)
  assert.equal(crawlerEngineModeNotice({}), null)
})

test('V2 overview 不提示引擎回退', () => {
  assert.equal(crawlerEngineModeNotice({ queueContractVersion: 2, liveQueue: [] }), null)
  assert.equal(crawlerEngineModeNotice({ queueContractVersion: '2' }), null)
})

test('已加载的 V1 overview 返回警告内容', () => {
  const notice = crawlerEngineModeNotice({ generatedAt: '2026-07-17T03:00:00Z', wikiMonitor: { domains: [] } })
  assert.ok(notice, 'V1 overview 应产生提示')
  assert.equal(notice.engine, 'v1')
  assert.match(notice.title, /V2/)
  assert.match(notice.detail, /V1/)
  assert.equal(notice.runbookPath, 'docs/runbooks/crawler-monitor-queue-v2-cutover.md')
})

test('缺失 queueContractVersion 但有 wikiMonitor 数据视为 V1', () => {
  const notice = crawlerEngineModeNotice({ wikiMonitor: { summary: { domainCount: 10 } } })
  assert.ok(notice)
  assert.equal(notice.engine, 'v1')
})

test('queueContractVersion 为其它值时同样视为非 V2', () => {
  const notice = crawlerEngineModeNotice({ queueContractVersion: 1, wikiMonitor: {} })
  assert.ok(notice)
  assert.equal(notice.engine, 'v1')
})
