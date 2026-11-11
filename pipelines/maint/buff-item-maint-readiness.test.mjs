import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBuffItemMaintReadiness } from './buff-item-maint-readiness.mjs';

const requiredItems = [
  { sourceId: 6148, buffId: 389, sourceInternalName: 'PalworldMinionTrustyCattiva' },
  { sourceId: 6155, buffId: 399, sourceInternalName: 'LightningStrike' },
  { sourceId: 1340, buffId: 395, sourceInternalName: 'FlaskOfVenom' },
];

const iteminfoAssertions = [
  { itemId: 6148, internalName: 'PalworldMinionTrustyCattiva', name: 'Trusty Cattiva', buffId: 389 },
  { itemId: 6155, internalName: 'LightningStrike', name: 'Lightning Strike', buffId: 399 },
  { itemId: 1340, internalName: 'FlaskofVenom', name: 'Flask of Venom', buffId: 395 },
];

test('reports missing maint identities without promoting local compatibility IDs', () => {
  const result = buildBuffItemMaintReadiness({
    requiredItems,
    iteminfoAssertions,
    maintItemRows: [],
    localItemRows: [{ id: 8429, source_id: 6148, internal_name: 'PalworldMinionTrustyCattiva' }],
  });

  assert.equal(result.readOnly, true);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.executable, false);
  assert.deepEqual(result.summary, {
    requiredCount: 3,
    sourceEvidenceCount: 3,
    maintPresentCount: 0,
    missingMaintCount: 3,
    localEvidenceCount: 1,
    sourceNameDriftCount: 1,
    blockedCount: 3,
    readyCount: 0,
  });
  assert.deepEqual(result.rows.map(row => row.classification), [
    'missing-maint-with-local-evidence',
    'missing-maint-without-local-evidence',
    'maint-source-name-drift',
  ]);
  assert.equal(result.rows[0].proposedCanonicalSourceId, 6148);
  assert.equal(result.rows[0].localRowId, 8429);
  assert.equal(result.rows[0].localRowIdIsCanonicalSourceId, false);
});

test('retains compatibility rows with different local source IDs as evidence only', () => {
  const result = buildBuffItemMaintReadiness({
    requiredItems: requiredItems.slice(0, 1), iteminfoAssertions, maintItemRows: [],
    localItemRows: [{ id: 8429, source_id: 8429, internal_name: 'PalworldMinionTrustyCattiva' }],
  });
  assert.equal(result.rows[0].classification, 'missing-maint-with-local-evidence');
  assert.equal(result.rows[0].sourceId, 6148);
  assert.equal(result.rows[0].localSourceId, 8429);
  assert.equal(result.rows[0].localRowIdIsCanonicalSourceId, false);
});

test('is ready only when every required source ID has an exact active maint identity', () => {
  const result = buildBuffItemMaintReadiness({
    requiredItems: requiredItems.slice(0, 2),
    iteminfoAssertions,
    maintItemRows: [
      { id: 10, source_id: 6148, internal_name: 'PalworldMinionTrustyCattiva', english_name: 'Trusty Cattiva', deleted: 0, status: 1 },
      { id: 11, source_id: 6155, internal_name: 'LightningStrike', english_name: 'Lightning Strike', deleted: 0, status: 1 },
    ],
    localItemRows: [],
  });

  assert.equal(result.verdict, 'ready');
  assert.equal(result.summary.readyCount, 2);
  assert.deepEqual(result.rows.map(row => row.classification), ['maint-present-exact', 'maint-present-exact']);
  assert.deepEqual(result.proposedRows, []);
});

test('fails closed when required source evidence is missing or duplicated', () => {
  assert.throws(() => buildBuffItemMaintReadiness({
    requiredItems: [{ sourceId: 9999, buffId: 389, sourceInternalName: 'MissingItem' }],
    iteminfoAssertions: [],
    maintItemRows: [],
    localItemRows: [],
  }), /source evidence is missing/);

  assert.throws(() => buildBuffItemMaintReadiness({
    requiredItems: [{ sourceId: 6148, buffId: 389, sourceInternalName: 'PalworldMinionTrustyCattiva' }],
    iteminfoAssertions: [
      { itemId: 6148, internalName: 'PalworldMinionTrustyCattiva', name: 'Trusty Cattiva' },
      { itemId: 6148, internalName: 'OtherIdentity', name: 'Other Identity' },
    ],
    maintItemRows: [],
    localItemRows: [],
  }), /duplicate Iteminfo source ID/);
});

test('requires stable source IDs and keeps canonical-name collisions blocked', () => {
  for (const sourceId of [null, true, 0, -1, '8429', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildBuffItemMaintReadiness({
      requiredItems: [{ sourceId, buffId: 389, sourceInternalName: 'PalworldMinionTrustyCattiva' }],
      iteminfoAssertions,
      maintItemRows: [],
      localItemRows: [],
    }), /required Item identity is invalid/);
  }

  const result = buildBuffItemMaintReadiness({
    requiredItems: requiredItems.slice(0, 1),
    iteminfoAssertions,
    maintItemRows: [{ id: 8429, source_id: 8429, internal_name: 'PalworldMinionTrustyCattiva', status: 1, deleted: 0 }],
    localItemRows: [],
  });
  assert.equal(result.rows[0].classification, 'maint-identity-conflict');
  assert.equal(result.verdict, 'blocked');
  assert.deepEqual(result.proposedRows, []);
});

test('keeps inactive maint rows and missing maint status out of readiness', () => {
  for (const state of [{ status: 1, deleted: 1 }, { status: 0, deleted: 0 }, {}]) {
    const result = buildBuffItemMaintReadiness({
      requiredItems: requiredItems.slice(0, 1),
      iteminfoAssertions,
      maintItemRows: [{ id: 10, source_id: 6148, internal_name: 'PalworldMinionTrustyCattiva', ...state }],
      localItemRows: [],
    });
    assert.equal(result.rows[0].classification, 'maint-inactive-or-unknown');
    assert.equal(result.summary.readyCount, 0);
    assert.deepEqual(result.proposedRows, []);
  }
});

test('rejects maint identity without its primary key and SQL collation name collisions', () => {
  const input = { requiredItems: requiredItems.slice(0, 1), iteminfoAssertions, localItemRows: [] };
  assert.throws(() => buildBuffItemMaintReadiness({
    ...input, maintItemRows: [{ source_id: 6148, internal_name: 'PalworldMinionTrustyCattiva', status: 1, deleted: 0 }],
  }), /maint primary key is invalid/);

  const result = buildBuffItemMaintReadiness({
    ...input,
    maintItemRows: [{ id: 8429, source_id: 8429, internal_name: 'palworldminiontrustycattiva', status: 1, deleted: 0 }],
  });
  assert.equal(result.rows[0].classification, 'maint-identity-conflict');
  assert.deepEqual(result.proposedRows, []);
});

test('does not coerce malformed status into an active maint identity', () => {
  for (const status of [true, ' 1 ', '01']) {
    const result = buildBuffItemMaintReadiness({
      requiredItems: requiredItems.slice(0, 1), iteminfoAssertions, localItemRows: [],
      maintItemRows: [{ id: 10, source_id: 6148, internal_name: 'PalworldMinionTrustyCattiva', status, deleted: 0 }],
    });
    assert.equal(result.rows[0].classification, 'maint-inactive-or-unknown');
  }
});

test('retains one dependency per item and all affected Buff source identities', () => {
  const result = buildBuffItemMaintReadiness({
    requiredItems: [requiredItems[1], { ...requiredItems[1], buffId: 400 }],
    iteminfoAssertions,
    maintItemRows: [],
    localItemRows: [],
  });
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].buffIds, [399, 400]);
  assert.deepEqual(result.proposedRows, [{
    source_id: 6155, internal_name: 'LightningStrike', english_name: 'Lightning Strike',
    landing_source_id: null, maint_row_id: null,
  }]);
});

test('rejects duplicate maint identities and preserves every input snapshot', () => {
  const input = {
    requiredItems: structuredClone(requiredItems),
    iteminfoAssertions: structuredClone(iteminfoAssertions),
    maintItemRows: [],
    localItemRows: [{ id: 8429, source_id: 6148, internal_name: 'PalworldMinionTrustyCattiva' }],
  };
  const before = structuredClone(input);
  buildBuffItemMaintReadiness(input);
  assert.deepEqual(input, before);

  assert.throws(() => buildBuffItemMaintReadiness({
    ...input,
    maintItemRows: [
      { id: 10, source_id: 6148, internal_name: 'PalworldMinionTrustyCattiva', status: 1, deleted: 0 },
      { id: 11, source_id: 6148, internal_name: 'OtherIdentity', status: 1, deleted: 0 },
    ],
  }), /duplicate maint source ID/);
});

test('rejects malformed canonical snapshots instead of treating them as a missing maint row', () => {
  const input = { requiredItems: requiredItems.slice(0, 1), iteminfoAssertions, localItemRows: [] };
  for (const source_id of [null, true, 0, -1]) {
    assert.throws(() => buildBuffItemMaintReadiness({
      ...input,
      maintItemRows: [{ id: 10, source_id, internal_name: 'PalworldMinionTrustyCattiva', status: 1, deleted: 0 }],
    }), /maint source identity is invalid/);
  }
});
