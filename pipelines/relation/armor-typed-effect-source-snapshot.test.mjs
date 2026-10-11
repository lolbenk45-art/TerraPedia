import test from 'node:test';
import assert from 'node:assert/strict';
import { persistedItemSourceFixture } from '../maint/armor-item-effect-test-fixture.mjs';

async function readSnapshot(input, options) {
  const module = await import('./armor-typed-effect-publication-db.mjs');
  assert.equal(typeof module.readArmorTypedEffectSourceSnapshot, 'function');
  return module.readArmorTypedEffectSourceSnapshot(input, options);
}

function connection(fixture) {
  const calls = [];
  return {
    calls,
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes('FROM terria_v1_maint.maint_armor_attribute_rows')) return [fixture.maintArmorAttributeRows];
      if (sql.includes('FROM terria_v1_maint.source_dataset_landings')) return [fixture.maintLandings];
      if (sql.includes('FROM terria_v1_maint.maint_items')) return [fixture.maintItems];
      if (sql.startsWith('SET ') || sql.startsWith('START ')) return [[]];
      return [[]];
    },
  };
}

test('typed-effect source snapshot independently rederives exact item facts and revision tuple', async () => {
  const fixture = persistedItemSourceFixture();
  const db = connection(fixture);
  const result = await readSnapshot({ connection: db });

  assert.equal(result.typedEffects.length, 3);
  assert.deepEqual(result.sourceFingerprint, {
    pageRevisionId: 1027106,
    iteminfoRevisionId: 1023241,
    armorSetsRevisionId: 964993,
  });
  assert.deepEqual(result.typedEffects.map(row => row.ownerId), [1546, 1547, 1548]);
  assert.equal(db.calls.length, 3);
});

test('typed-effect source snapshot locks maint rows, landing evidence and item owners during execution', async () => {
  const db = connection(persistedItemSourceFixture());
  await readSnapshot({ connection: db, forUpdate: true });

  assert.equal(db.calls.every(({ sql }) => /FOR UPDATE$/.test(sql)), true);
});

test('typed-effect source snapshot rejects ambiguous current item ownership', async () => {
  const fixture = persistedItemSourceFixture();
  fixture.maintItems.push({ ...fixture.maintItems[0], id: 2999 });
  const db = connection(fixture);

  await assert.rejects(readSnapshot({ connection: db }), /ambiguous|duplicate/i);
});
