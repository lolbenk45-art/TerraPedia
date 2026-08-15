import assert from 'node:assert/strict';
import test from 'node:test';

import { runItemCanonicalBaseEntityRestorationApply } from './apply-item-canonical-base-entity-restoration.mjs';

test('reconciliation apply requires explicit apply and emits deleted and inserted counts', async () => {
  const writes = [];
  const input = inputContract();
  const result = await runItemCanonicalBaseEntityRestorationApply({ inputContract: input, inputContractPath: 'reports/test/input.json', apply: true, now: '2026-08-05T03:30:00.000Z' }, {
    connect: async () => ({ end: async () => {} }),
    consumeDispatchPermit: async () => {},
    executeTransaction: async () => ({
      deletedCounts: { maintItems: 5, relationItems: 5, projectionItems: 5, itemProjectileAudits: 5 },
      insertedCounts: { maintItems: 5, relationItems: 5, projectionItems: 5 },
    }),
    writeResult: async ({ result: value }) => writes.push(value),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.apply, true);
  assert.deepEqual(result.deletedCounts, { maintItems: 5, relationItems: 5, projectionItems: 5, itemProjectileAudits: 5 });
  assert.deepEqual(result.insertedCounts, { maintItems: 5, relationItems: 5, projectionItems: 5 });
  assert.equal(writes.length, 1);
});

test('restoration apply rejects a non-five input before connecting', async () => {
  let connected = false;
  const input = inputContract();
  input.maintRows.pop();
  await assert.rejects(
    runItemCanonicalBaseEntityRestorationApply({ inputContract: input, inputContractPath: 'reports/test/input.json', apply: true }, { connect: async () => { connected = true; } }),
    /five|scope/i,
  );
  assert.equal(connected, false);
});

function inputContract() {
  const keys = ['AntlionEggs', 'BoneWhip', 'RoninShirt', 'TVHeadPants', 'TimelessTravelerHood'];
  const ids = [5067, 5074, 5049, 5063, 5051];
  return {
    operationId: 'canonical-item-base-entity-restoration', attemptId: 'test', attemptRoot: 'reports/test', keys, sourceIds: ids,
    target: { databases: { maint: 'terria_v1_maint', relation: 'terria_v1_relation' } },
    maintRows: ids.map((sourceId, index) => ({ sourceId, internalName: keys[index] })),
    relationRows: ids.map((sourceId, index) => ({ sourceId, internalName: keys[index], recordKey: `r-${keys[index]}` })),
    projectionRows: ids.map((id, index) => ({ id, internalName: keys[index], relationRecordKey: `r-${keys[index]}` })),
    managedImages: keys.map((itemInternalName) => ({ itemInternalName })),
    legacyMaintRows: legacyRows('sourceId'),
    legacyRelationRows: legacyRows('sourceId'),
    legacyProjectionRows: legacyRows('id'),
    legacyProjectileAudits: legacyRows('itemSourceId'),
  };
}

function legacyRows(idField) {
  const names = ['FestiveTopHat', 'Wiesnbrau', 'HeartArrow', 'TurkeyFeather', 'ValentineRing'];
  const ids = [5067, 5074, 5049, 5063, 5051];
  return names.map((internalName, index) => ({ [idField]: ids[index], internalName }));
}
