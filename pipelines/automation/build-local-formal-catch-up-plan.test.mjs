import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLocalFormalCatchUpPlan } from './build-local-formal-catch-up-plan.mjs';

const hash = (char) => `sha256:${char.repeat(64)}`;
const sourceSnapshot = (char) => ({ path: `.local/tmp/local-formal-catch-up/source/${char}.json`, sha256: hash(char), sourceFingerprint: hash('a'), immutable: true });

function classification(domain, status = 'behind') {
  return {
    domain,
    targetVersionContext: '1.4.5.8',
    classification: status,
    reason: status === 'behind' ? 'source_newer_than_formal_acknowledgement' : 'canonical_owner_or_projection_contract_missing',
    sourceIdentity: { fingerprint: hash('a'), runIdentity: '2026-10-24T12:50:15.041Z', contentIdentity: hash('b') },
    formalIdentity: { acknowledgement: { fingerprint: hash('c') }, tableReadback: { fingerprint: hash('c'), complete: true, committedRunId: `${domain}-run` } },
    writeAllowed: false,
  };
}

function policy(domain, ownedTables = []) {
  return { domainId: domain, currentVersion: 2, currentLevel: 'L2', operationalState: 'ACTIVE', policyHash: hash('d'), policy: { ownedTables } };
}

test('builds a serial read-only admission plan and admits only complete canonical domains', () => {
  const plan = buildLocalFormalCatchUpPlan({
    runId: 'lfc-plan-test',
    targetVersionContext: '1.4.5.8',
    formalServer: { host: '127.0.0.1', port: 13306, serverUuid: 'server-1' },
    classifications: [classification('items'), classification('armor_sets', 'canonical_blocked'), classification('audio', 'source_blocked')],
    dependencies: {
      items: { complete: true, unresolvedCount: 0, stableKeyHash: hash('e') },
      armor_sets: { complete: true, unresolvedCount: 0, stableKeyHash: hash('f') },
    },
    canonical: {
      items: { ready: true, apiParity: true, ownedTables: ['items'] },
      armor_sets: { ready: false, apiParity: true, reason: 'projection_contract_missing', ownedTables: ['armor_sets'] },
    },
    policies: [policy('items', [{ table: 'items', databaseRole: 'local' }]), policy('armor_sets', [{ table: 'armor_sets', databaseRole: 'local' }])],
    sourceSnapshots: { items: sourceSnapshot('e'), armor_sets: sourceSnapshot('f') },
  });

  assert.deepEqual(plan.actionScope, ['items']);
  assert.equal(plan.domains.find((entry) => entry.domain === 'items').classification, 'ready');
  assert.equal(plan.domains.find((entry) => entry.domain === 'armor_sets').classification, 'canonical_blocked');
  assert.equal(plan.domains.find((entry) => entry.domain === 'audio').classification, 'source_blocked');
  assert.equal(plan.writePolicy.deletesAllowed, false);
  assert.equal(plan.execution.serial, true);
});

test('blocks a behind domain when dependency evidence is incomplete', () => {
  const plan = buildLocalFormalCatchUpPlan({
    runId: 'lfc-plan-dependency',
    targetVersionContext: '1.4.5.8',
    formalServer: { host: '127.0.0.1', port: 13306, serverUuid: 'server-1' },
    classifications: [classification('items')],
    dependencies: { items: { complete: false, unresolvedCount: 2, stableKeyHash: hash('e') } },
    canonical: { items: { ready: true, apiParity: true, ownedTables: ['items'] } },
    policies: [policy('items', [{ table: 'items', databaseRole: 'local' }])],
    sourceSnapshots: { items: sourceSnapshot('e') },
  });

  assert.equal(plan.actionScope.length, 0);
  assert.equal(plan.domains[0].classification, 'dependency_blocked');
  assert.equal(plan.status, 'blocked');
});

test('accepts source monitor snapshot references as immutable admission artifacts', () => {
  const plan = buildLocalFormalCatchUpPlan({
    runId: 'lfc-plan-monitor-snapshot',
    targetVersionContext: '1.4.5.8',
    formalServer: { host: '127.0.0.1', port: 13306, serverUuid: 'server-1' },
    classifications: [classification('items')],
    dependencies: { items: { complete: true, unresolvedCount: 0 } },
    canonical: { items: { ready: true, apiParity: true, ownedTables: ['items'] } },
    policies: [policy('items', [{ table: 'items', databaseRole: 'local' }])],
    sourceSnapshots: {
      items: {
        path: 'reports/runtime/source-probe-snapshots/items.json',
        snapshotHash: hash('e'),
        sourceFingerprint: hash('a'),
      },
    },
  });
  assert.deepEqual(plan.actionScope, ['items']);
  assert.equal(plan.domains[0].sourceSnapshot.sha256, hash('e'));
});
