import test from 'node:test';
import assert from 'node:assert/strict';

import {
  admitFormalCatchUpDomain,
  classifyFormalCatchUpDomain,
} from './local-formal-catch-up-classifier.mjs';

const source = {
  status: 'ok',
  fingerprint: `sha256:${'a'.repeat(64)}`,
  runIdentity: '2026-10-24T09:00:00.000Z',
  contentIdentity: `sha256:${'b'.repeat(64)}`,
};

function formal(overrides = {}) {
  return {
    acknowledgement: {
      status: 'committed',
      fingerprint: `sha256:${'c'.repeat(64)}`,
    },
    tableReadback: {
      status: 'verified',
      fingerprint: `sha256:${'c'.repeat(64)}`,
      complete: true,
      apiParity: true,
      committedRunId: 'committed-run',
      committedRunId: 'items_l1_auto_old',
    },
    manifestFingerprint: 'sha256:source',
    ...overrides,
  };
}

test('classifies a source newer than formal acknowledgement as behind', () => {
  const result = classifyFormalCatchUpDomain({
    domain: 'items',
    targetVersionContext: '1.4.5.8',
    source,
    formal: formal(),
  });

  assert.equal(result.classification, 'behind');
  assert.equal(result.writeAllowed, false);
  assert.equal(result.reason, 'source_newer_than_formal_acknowledgement');
});

test('classifies matching source, acknowledgement, table lineage, and API as current', () => {
  const result = classifyFormalCatchUpDomain({
    domain: 'npcs',
    targetVersionContext: '1.4.5.8',
    source,
    formal: formal({
      acknowledgement: { status: 'committed', fingerprint: source.fingerprint },
      tableReadback: { status: 'verified', fingerprint: source.fingerprint, complete: true, apiParity: true, committedRunId: 'npcs_l1_auto_current' },
    }),
  });

  assert.equal(result.classification, 'current');
  assert.equal(result.writeAllowed, false);
});

test('classifies a formal acknowledgement and table lineage conflict as blocked', () => {
  const result = classifyFormalCatchUpDomain({
    domain: 'projectiles',
    targetVersionContext: '1.4.5.8',
    source,
    formal: formal({
      tableReadback: { status: 'verified', fingerprint: `sha256:${'d'.repeat(64)}`, complete: true, apiParity: true, committedRunId: 'projectiles_l1_auto_old' },
    }),
  });

  assert.equal(result.classification, 'formal_state_blocked');
  assert.equal(result.reason, 'formal_acknowledgement_table_lineage_conflict');
});

test('allows acknowledgement reconciliation when committed lineage is current but acknowledgement is absent', () => {
  const result = classifyFormalCatchUpDomain({
    domain: 'audio',
    targetVersionContext: '1.4.5.8',
    source,
    formal: formal({
      acknowledgement: { status: 'missing', fingerprint: null },
      tableReadback: { status: 'verified', fingerprint: source.fingerprint, complete: true, apiParity: true, committedRunId: 'audio_l1_auto_current' },
    }),
  });

  assert.equal(result.classification, 'acknowledgement_reconcile');
  assert.equal(result.writeAllowed, false);
});

test('blocks a source probe without a complete fingerprint', () => {
  const result = classifyFormalCatchUpDomain({
    domain: 'bosses',
    targetVersionContext: '1.4.5.8',
    source: { status: 'error', fingerprint: null },
    formal: formal(),
  });

  assert.equal(result.classification, 'source_blocked');
  assert.equal(result.reason, 'source_identity_unavailable');
});

test('blocks formal readback that is incomplete or does not prove API parity', () => {
  const result = classifyFormalCatchUpDomain({
    domain: 'armor_sets',
    targetVersionContext: '1.4.5.8',
    source,
    formal: formal({
      tableReadback: { status: 'verified', fingerprint: `sha256:${'c'.repeat(64)}`, complete: false, apiParity: false, committedRunId: 'armor_old' },
    }),
  });

  assert.equal(result.classification, 'formal_state_blocked');
  assert.equal(result.reason, 'formal_table_readback_incomplete');
});

test('blocks matching source lineage when consumer API identity parity is unverified', () => {
  const result = classifyFormalCatchUpDomain({
    domain: 'items',
    targetVersionContext: '1.4.5.8',
    source,
    formal: formal({
      acknowledgement: { status: 'committed', fingerprint: source.fingerprint },
      tableReadback: { status: 'verified', fingerprint: source.fingerprint, complete: true, apiParity: false, committedRunId: 'items_l1_auto_current' },
    }),
  });

  assert.equal(result.classification, 'formal_state_blocked');
  assert.equal(result.reason, 'formal_api_parity_unverified');
});

test('blocks populated formal tables whose source lineage is unknown', () => {
  const result = classifyFormalCatchUpDomain({
    domain: 'buffs',
    targetVersionContext: '1.4.5.8',
    source,
    formal: formal({
      acknowledgement: { status: 'missing', fingerprint: null },
      tableReadback: { status: 'verified', fingerprint: null, complete: true, apiParity: true, committedRunId: null, rowCount: 388 },
    }),
  });

  assert.equal(result.classification, 'formal_state_blocked');
  assert.equal(result.reason, 'formal_table_lineage_missing');
});

test('does not reconcile a missing acknowledgement without a committed run identity', () => {
  const result = classifyFormalCatchUpDomain({
    domain: 'items',
    targetVersionContext: '1.4.5.8',
    source,
    formal: formal({
      acknowledgement: { status: 'missing', fingerprint: null },
      tableReadback: { status: 'verified', fingerprint: source.fingerprint, complete: true, apiParity: true, committedRunId: null, rowCount: 6208 },
    }),
  });

  assert.equal(result.classification, 'formal_state_blocked');
  assert.equal(result.reason, 'committed_run_identity_missing');
});

test('admission blocks unresolved dependencies before canonical write permission', () => {
  const result = admitFormalCatchUpDomain({
    classification: classifyFormalCatchUpDomain({
      domain: 'buffs',
      targetVersionContext: '1.4.5.8',
      source,
      formal: formal(),
    }),
    dependencies: { complete: false, unresolvedCount: 27 },
    canonical: { ready: true },
  });

  assert.equal(result.classification, 'dependency_blocked');
  assert.equal(result.writeAllowed, false);
});

test('admits only a behind domain with complete dependencies and canonical ownership', () => {
  const result = admitFormalCatchUpDomain({
    classification: classifyFormalCatchUpDomain({
      domain: 'items',
      targetVersionContext: '1.4.5.8',
      source,
      formal: formal(),
    }),
    dependencies: { complete: true, unresolvedCount: 0 },
    canonical: { ready: true, apiParity: true, ownedTables: ['maint_items', 'relation_items', 'projection_items'] },
  });

  assert.equal(result.classification, 'ready');
  assert.equal(result.writeAllowed, true);
  assert.deepEqual(result.ownedTables, ['maint_items', 'relation_items', 'projection_items']);
});

test('canonical ownership remains a block even when source and dependencies are ready', () => {
  const result = admitFormalCatchUpDomain({
    classification: classifyFormalCatchUpDomain({
      domain: 'shimmer',
      targetVersionContext: '1.4.5.8',
      source,
      formal: formal(),
    }),
    dependencies: { complete: true, unresolvedCount: 0 },
    canonical: { ready: false, apiParity: true, reason: 'cross_owner_partition_missing' },
  });

  assert.equal(result.classification, 'canonical_blocked');
  assert.equal(result.reason, 'cross_owner_partition_missing');
  assert.equal(result.writeAllowed, false);
});
