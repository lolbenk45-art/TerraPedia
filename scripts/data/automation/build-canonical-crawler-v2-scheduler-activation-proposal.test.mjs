import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCrawlerV2SchedulerActivationProposal } from './build-canonical-crawler-v2-scheduler-activation-proposal.mjs';

const t1Report = { path: 'reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance.json', sha256: 'sha256:' + 'a'.repeat(64), status: 'passed', scheduledTickObserved: true, cleanupPassed: true };
const current = { enabled: false, mode: 'changed-only', epoch: 'production-epoch', namespace: 'terrapedia:crawler:wiki-monitor:v2:production:', liveAttempts: 0, sweepClaims: 0, reconcilerHealthy: true, eligibleDomains: { items: 'pass', npcs: 'pass', projectiles: 'pass', buffs: 'pass', armorSets: 'pass' } };

test('activation proposal is disabled, hash-bound, and proposal-only', () => {
  const proposal = buildCrawlerV2SchedulerActivationProposal({ t1Report, current, codeBundle: [{ path: 'back/src/main/java/Scheduler.java', sha256: 'sha256:' + 'b'.repeat(64) }] });
  assert.equal(proposal.proposalOnly, true);
  assert.equal(proposal.databaseWrites, false);
  assert.equal(proposal.current.enabled, false);
  assert.equal(proposal.mutation.authenticatedLoopbackOnly, true);
  assert.ok(proposal.forbidden.includes('manual-sweep'));
  assert.match(proposal.packetHash, /^sha256:[a-f0-9]{64}$/);
});

test('activation proposal rejects stale or live production state', () => {
  assert.throws(() => buildCrawlerV2SchedulerActivationProposal({ t1Report: { ...t1Report, cleanupPassed: false }, current }), /runtime T1/);
  assert.throws(() => buildCrawlerV2SchedulerActivationProposal({ t1Report: { ...t1Report, scheduledTickObserved: false }, current }), /runtime T1/);
  assert.throws(() => buildCrawlerV2SchedulerActivationProposal({ t1Report, current: { ...current, enabled: true } }), /disabled/);
  assert.throws(() => buildCrawlerV2SchedulerActivationProposal({ t1Report, current: { ...current, liveAttempts: 1 } }), /zero live/);
});
