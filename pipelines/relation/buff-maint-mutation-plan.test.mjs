import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  bindBuffMaintMutationPlanToLanding,
  buildBuffMaintMutationPlan,
} from './buff-maint-mutation-plan.mjs';

function landing(records = [{ id: 24, internalName: 'OnFire', englishName: 'On Fire!', type: 'debuff' }]) {
  const payload = { buffs: records };
  return {
    id: 31, dataset_type: 'buffs_raw', provider: 'terraria.wiki.gg',
    source_key: 'wiki.buffs.test-01', source_page: 'Template:GetBuffInfo',
    source_revision_timestamp: '2026-09-28T00:00:00Z',
    fetched_at: '2026-09-28T01:00:00Z', parsed_at: '2026-09-28T01:00:00Z',
    parse_status: 'ok', is_current: 1,
    payload_json: JSON.stringify(payload),
    content_hash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  };
}

async function existing() {
  const plan = await buildBuffMaintMutationPlan({ landingRow: landing(), currentRows: [] });
  return { ...plan.inserts[0], id: 91, created_at: '2026-09-28 01:00:00', updated_at: '2026-09-28 01:00:00' };
}

test('Buff maint plan uses real base schema and remains non-executable', async () => {
  const plan = await buildBuffMaintMutationPlan({ landingRow: landing(), currentRows: [] });
  assert.equal(plan.executable, false);
  assert.equal(plan.table, 'terria_v1_maint.maint_buffs');
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].source_id, 24);
  assert.equal(plan.inserts[0].landing_source_id, 31);
  assert.equal(plan.inserts[0].landing_content_hash, landing().content_hash);
  for (const column of ['id', 'record_key', 'sub_name_zh', 'scope', 'table_name']) {
    assert.equal(Object.hasOwn(plan.inserts[0], column), false, column);
  }
  assert.deepEqual(plan.deletes, []);
  assert.equal(plan.destructiveClear, false);
});

test('Buff maint plan is idempotent against equivalent database dates and JSON', async () => {
  const row = await existing();
  row.flags_json = JSON.parse(row.flags_json);
  row.landing_fetched_at = '2026-09-28 01:00:00';
  const plan = await buildBuffMaintMutationPlan({ landingRow: landing(), currentRows: [row] });
  assert.equal(plan.unchanged.length, 1);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.inserts.length, 0);
});

test('Buff maint plan preserves existing IDs and unrelated inactive rows', async () => {
  const row = await existing();
  const unrelated = { ...row, id: 92, source_id: 25, internal_name: 'Tipsy', deleted: 1, status: 0 };
  const source = landing([{ id: 24, internalName: 'OnFire', englishName: 'New title', type: 'debuff' }]);
  const before = structuredClone([row, unrelated]);
  const plan = await buildBuffMaintMutationPlan({ landingRow: source, currentRows: [row, unrelated] });
  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].after.id, 91);
  assert.ok(plan.updates[0].changedColumns.includes('english_name'));
  assert.deepEqual(plan.preserved, [unrelated]);
  assert.deepEqual([row, unrelated], before);
});

for (const alter of [
  row => { row.content_hash = 'f'.repeat(64); },
  row => { row.dataset_type = 'items_raw'; },
  row => { row.provider = 'terrapedia.generated'; },
  row => { row.id = 0; },
  row => { row.is_current = 0; },
  row => { row.parse_status = 'failed'; },
]) {
  test(`Buff maint plan refuses invalid landing: ${alter}`, async () => {
    const row = landing(); alter(row);
    await assert.rejects(buildBuffMaintMutationPlan({ landingRow: row, currentRows: [] }), /landing/);
  });
}

for (const records of [
  [{ id: 24, internalName: 'Other' }],
  [{ id: 25, internalName: 'OnFire' }],
  [{ id: 24, internalName: 'OnFire' }, { id: 24, internalName: 'Other' }],
  [{ id: 24, internalName: 'OnFire' }, { id: 25, internalName: 'OnFire' }],
]) {
  test(`Buff maint plan rejects remapped or duplicate identity: ${JSON.stringify(records)}`, async () => {
    await assert.rejects(buildBuffMaintMutationPlan({ landingRow: landing(records), currentRows: [await existing()] }), /identity/);
  });
}

test('Buff maint plan rejects duplicate inactive baseline identity', async () => {
  const row = await existing();
  await assert.rejects(buildBuffMaintMutationPlan({
    landingRow: landing(), currentRows: [row, { ...row, id: 92, deleted: 1 }],
  }), /identity/);
});

test('Buff maint plan can defer only the generated landing ID', async () => {
  const deferredLanding = landing();
  deferredLanding.id = null;
  const plan = await buildBuffMaintMutationPlan({
    landingRow: deferredLanding,
    currentRows: [],
    allowUnmaterializedLandingId: true,
  });
  assert.equal(plan.landingIdentity.id, null);
  assert.equal(plan.inserts[0].landing_source_id, null);
});

test('Buff maint plan binds the real landing ID without changing source identity', async () => {
  const deferredLanding = landing();
  deferredLanding.id = null;
  const plan = await buildBuffMaintMutationPlan({
    landingRow: deferredLanding,
    currentRows: [],
    allowUnmaterializedLandingId: true,
  });
  const bound = bindBuffMaintMutationPlanToLanding({
    plan,
    landingRow: { ...deferredLanding, id: 13001 },
  });
  assert.equal(bound.landingIdentity.id, 13001);
  assert.equal(bound.inserts[0].landing_source_id, 13001);
  assert.equal(bound.landingIdentity.contentHash, deferredLanding.content_hash);
});

test('Buff maint landing ID binding rejects source drift', async () => {
  const deferredLanding = landing();
  deferredLanding.id = null;
  const plan = await buildBuffMaintMutationPlan({
    landingRow: deferredLanding,
    currentRows: [],
    allowUnmaterializedLandingId: true,
  });
  assert.throws(() => bindBuffMaintMutationPlanToLanding({
    plan,
    landingRow: { ...deferredLanding, id: 13001, content_hash: 'f'.repeat(64) },
  }), /landing|source|hash/i);
});
