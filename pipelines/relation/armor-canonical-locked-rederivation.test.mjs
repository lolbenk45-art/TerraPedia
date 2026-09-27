import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARMOR_CANONICAL_LOCKED_SNAPSHOT_TABLES,
  createArmorCanonicalLockedRederivation,
  readArmorCanonicalLockedSnapshot,
} from './armor-canonical-locked-rederivation.mjs';

const HASH = (char) => `sha256:${char.repeat(64)}`;

function expectedIntent() {
  const landingTransition = { transitionSha256: HASH('a') };
  const maintCandidate = { sourceSnapshotSha256: HASH('b'), baselineSha256: HASH('c') };
  const projectionCandidate = {
    candidateSha256: HASH('d'),
    managedImageUrlPrefixes: ['http://localhost:9000/terrapedia-images/items/'],
    inputSnapshots: {
      relationInput: {
        maintInput: {
          landingRows: [{ dataset_type: 'armor_sets_raw' }, { dataset_type: 'armor_set_images_raw' }],
        },
      },
    },
  };
  const landingMaintIntent = {
    writeTimestamp: '2026-09-26T04:00:00Z',
    intentSha256: HASH('e'),
    snapshots: { landingTransition, maintCandidate },
  };
  const relationIntent = {
    intentSha256: HASH('f'),
    candidateSnapshot: projectionCandidate,
  };
  return {
    fullChainSha256: HASH('0'),
    writeTimestamp: landingMaintIntent.writeTimestamp,
    landingMaintIntent,
    relationIntent,
  };
}

function fakeRows() {
  return Object.fromEntries(ARMOR_CANONICAL_LOCKED_SNAPSHOT_TABLES.map((entry) => [entry.key, [{ id: entry.key }]]));
}

test('reads every Armor baseline and dependency table with explicit read locks', async () => {
  const calls = [];
  const rows = fakeRows();
  const connection = {
    async query(sql) {
      calls.push(sql);
      const entry = ARMOR_CANONICAL_LOCKED_SNAPSHOT_TABLES.find((candidate) => sql.includes(candidate.qualified));
      return [entry ? rows[entry.key] : []];
    },
  };

  const snapshot = await readArmorCanonicalLockedSnapshot({ connection, landingRows: [{ id: 'locked' }] });

  assert.deepEqual(snapshot.maintRows.maint_armor_sets, rows.maint_armor_sets);
  assert.deepEqual(snapshot.relationRows.relation_armor_set_items, rows.relation_armor_set_items);
  assert.deepEqual(snapshot.dependencyRows.relation_items, rows.relation_items);
  assert.deepEqual(snapshot.consumerRows.items, rows.items);
  assert.equal(snapshot.landingRows[0].id, 'locked');
  assert.equal(calls.length, ARMOR_CANONICAL_LOCKED_SNAPSHOT_TABLES.length);
  assert.ok(calls.every((sql) => /FOR SHARE|FOR UPDATE/.test(sql)));
  assert.ok(calls.every((sql) => !/INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|TRUNCATE/i.test(sql)));
});

test('locked rederivation rejects a rebuilt full-chain hash that differs from the packet intent', async () => {
  const expected = expectedIntent();
  const builders = {
    buildArmorSourceEvidenceTransition: () => expected.landingMaintIntent.snapshots.landingTransition,
    buildArmorCanonicalMaintCandidate: () => expected.landingMaintIntent.snapshots.maintCandidate,
    buildArmorCanonicalLandingMaintIntent: () => expected.landingMaintIntent,
    buildArmorCanonicalProjectionIdIndependentCandidate: () => expected.relationIntent.candidateSnapshot,
    buildArmorCanonicalFullChainIntent: () => ({ ...expected, fullChainSha256: HASH('1') }),
  };
  const connection = {
    async query(sql) {
      const entry = ARMOR_CANONICAL_LOCKED_SNAPSHOT_TABLES.find((candidate) => sql.includes(candidate.qualified));
      return [entry ? [{ id: entry.key }] : []];
    },
  };
  const deriveLocked = createArmorCanonicalLockedRederivation({
    expected,
    builders,
    managedImageUrlPrefixes: expected.relationIntent.candidateSnapshot.managedImageUrlPrefixes,
  });

  await assert.rejects(
    () => deriveLocked({ connection, lockedRows: new Map([['local.source_dataset_landings|partition:armor', [{ id: 'prelocked' }]]]) }),
    /full-chain|hash|drift/i,
  );
});
