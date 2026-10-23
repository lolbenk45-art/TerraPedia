import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const page = fs.readFileSync(path.join(appRoot, 'pages/operations/crawler-monitor.vue'), 'utf8')
const panelPath = path.join(appRoot, 'components/crawler-monitor/PcVersionUpdateTriagePanel.vue')
const panel = fs.existsSync(panelPath) ? fs.readFileSync(panelPath, 'utf8') : ''
const types = fs.readFileSync(path.join(appRoot, 'types/crawlerMonitor.ts'), 'utf8')

test('crawler monitor mounts the PC update panel separately from crawler queue controls', () => {
  assert.match(page, /<PcVersionUpdateTriagePanel/)
  assert.match(page, /@probe="runPcVersionUpdateProbe"/)
  assert.match(page, /@handling="updatePcVersionCandidateHandling"/)
  assert.ok(page.indexOf('<PcVersionUpdateTriagePanel') < page.indexOf('<DomainDetailDrawer'))
});

test('PC version panel shows pending, handled, informational, and probe progress states', () => {
  for (const marker of ['pendingCandidates', 'handledCandidates', 'informationalCandidates', 'probeProgress']) {
    assert.ok(panel.includes(marker), `missing panel state ${marker}`)
  }
  assert.match(panel, /公告未注明/)
  assert.match(panel, /unmapped|informational/)
  assert.match(panel, /handledBy/)
  assert.match(panel, /handledAt/)
});

test('PC version probe and handling actions use dedicated admin endpoints only', () => {
  assert.match(page, /post\('\/admin\/crawler-monitor\/pc-version-updates\/probe'/)
  assert.match(page, /put\(`\/admin\/crawler-monitor\/pc-version-updates\/\$\{encodeURIComponent\(candidate\.candidateId\)\}\/handling`/)
  assert.match(page, /expectedStateRevision/)
  const probeStart = page.indexOf('async function runPcVersionUpdateProbe')
  const probeEnd = page.indexOf('\nasync function updatePcVersionCandidateHandling', probeStart)
  assert.ok(probeStart >= 0 && probeEnd > probeStart, 'manual probe handler is present')
  const probeHandler = page.slice(probeStart, probeEnd)
  assert.match(probeHandler, /pc-version-updates\/probe/)
  assert.doesNotMatch(probeHandler, /\/dispatch(?:\/|['"`])/)
});

test('version update API types include stable identity, handling revision, and catalog provenance', () => {
  assert.match(types, /interface PcVersionUpdateState/)
  assert.match(types, /interface PcVersionUpdateCandidate/)
  assert.match(types, /stateRevision\??:\s*number/)
  assert.match(types, /impactStatus\??:\s*string/)
  assert.match(types, /identityCatalogProvenance/)
});
