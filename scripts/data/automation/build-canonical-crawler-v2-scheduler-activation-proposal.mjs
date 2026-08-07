#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function sha256File(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

export function buildCrawlerV2SchedulerActivationProposal({ t1Report, codeBundle = [], current = {}, actor = null, reason = null, expiresAt = null } = {}) {
  if (!t1Report || t1Report.status !== 'passed' || t1Report.scheduledTickObserved !== true || t1Report.cleanupPassed !== true) throw new Error('scheduler activation requires a passed cleaned runtime T1 report');
  if (current.enabled !== false || current.mode !== 'changed-only') throw new Error('scheduler activation proposal requires disabled changed-only config');
  if (Number(current.liveAttempts ?? 0) !== 0 || Number(current.sweepClaims ?? 0) !== 0) throw new Error('scheduler activation proposal requires zero live attempts and sweep claims');
  if (!current.epoch || !current.namespace || current.reconcilerHealthy !== true) throw new Error('scheduler activation proposal requires durable epoch/namespace and healthy reconciler');
  const payload = {
    schemaVersion: 1,
    operationId: 'canonical-crawler-v2-scheduler-activation',
    proposalOnly: true,
    authorizationStatus: 'AWAITING_OWNER',
    databaseWrites: false,
    mutation: { method: 'PUT', endpoint: '/admin/crawler-monitor/v2/automation', authenticatedLoopbackOnly: true },
    t1Report: { path: t1Report.path, sha256: t1Report.sha256, cleanupPassed: true },
    codeBundle: codeBundle.map((entry) => ({ path: entry.path, sha256: entry.sha256 })),
    current: { enabled: false, mode: 'changed-only', epoch: current.epoch, namespace: current.namespace, liveAttempts: 0, sweepClaims: 0, reconcilerHealthy: true },
    eligibleDomains: current.eligibleDomains ?? {},
    requested: { intervalSeconds: Number(current.intervalSeconds ?? 300), actor, reason, expiresAt },
    rollback: { endpoint: '/admin/crawler-monitor/v2/automation', body: { enabled: false, mode: 'changed-only' } },
    forbidden: ['direct-json-write', 'direct-redis-write', 'manual-sweep', 'external-daemon', 'formal-permit-consumption'],
  };
  const packetHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return Object.freeze({ ...payload, packetHash: `sha256:${packetHash}` });
}

function main() {
  const root = process.cwd();
  const t1Path = path.join(root, 'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance.json');
  if (!fs.existsSync(t1Path)) throw new Error(`missing T1 report: ${t1Path}`);
  const t1Report = JSON.parse(fs.readFileSync(t1Path, 'utf8'));
  const proposal = buildCrawlerV2SchedulerActivationProposal({
    t1Report: { path: 'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance.json', sha256: sha256File(t1Path), status: t1Report.status, scheduledTickObserved: t1Report.scheduledTickObserved, cleanupPassed: t1Report.cleanupPassed },
    current: { enabled: false, mode: 'changed-only', epoch: 'production-epoch-read-only', namespace: 'terrapedia:crawler:wiki-monitor:v2:production:', liveAttempts: 0, sweepClaims: 0, reconcilerHealthy: true, eligibleDomains: { items: 'readiness-required', npcs: 'readiness-required', projectiles: 'readiness-required', buffs: 'readiness-required', armorSets: 'readiness-required' } },
  });
  const output = path.join(root, 'reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.proposal.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(proposal, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ output, proposalOnly: proposal.proposalOnly, enabled: proposal.current.enabled })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
