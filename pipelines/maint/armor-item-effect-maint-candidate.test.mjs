import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, change } from '../relation/armor-shroomite-source-test-fixture.mjs';
import { buildArmorItemEffectMaintCandidate as build, bindArmorItemEffectMaintReadback as bind } from './armor-item-effect-maint-candidate.mjs';

function input() {
  return { source: fixture(), parsedAt: '2026-09-29T15:00:00Z', currentLocalLandings: [], currentMaintLandings: [], currentMaintRows: [] };
}

function readbacks(candidate) {
  return {
    localLandingReadback: { ...candidate.localLandingRow, id: 800 },
    maintLandingReadback: { ...candidate.maintLandingRow, id: 900 },
    maintReadback: candidate.maintRows.map((row, i) => ({ ...row, id: 1000 + i, landing_source_id: 900 })),
  };
}

test('derives append-only landing and three typed maint rows without allocating IDs', () => {
  const args = input(); const candidate = build(args);
  assert.equal(candidate.executable, false);
  assert.equal(candidate.databaseWrites, false);
  assert.equal(candidate.maintLandingRow.dataset_type, 'armor_item_effects_raw');
  assert.match(candidate.maintLandingRow.source_key, /^wiki\.armor\.item-effects\.shroomite\.[a-f0-9]{64}$/);
  assert.equal(candidate.changes.maintLanding.inserts.length, 1);
  assert.equal(candidate.changes.localLanding.inserts.length, 1);
  assert.equal(candidate.changes.maint.inserts.length, 3);
  assert.deepEqual(candidate.updates, []);
  assert.deepEqual(candidate.deletes, []);
  assert.ok(!Object.hasOwn(candidate.maintLandingRow, 'id'));
  assert.ok(candidate.maintRows.every(row => !Object.hasOwn(row, 'id') && row.landing_source_id === null));
  const payload = JSON.parse(candidate.maintLandingRow.payload_json);
  for (const key of ['page', 'iteminfo', 'armorSets']) {
    assert.deepEqual(Buffer.from(payload.artifacts[key].bytesBase64, 'base64'), args.source[key].bytes);
    assert.deepEqual(payload.artifacts[key].expected, args.source[key].expected);
  }
  assert.deepEqual(candidate.maintRows.map(row => {
    const raw = JSON.parse(row.raw_json);
    assert.equal(raw.schemaVersion, 'armor-item-effect-maint/v1');
    assert.equal(row.defense_value, null);
    assert.equal(row.raw_cells_json, '{}');
    return [raw.effect.ownerId, raw.effect.operation, raw.effect.valueDecimal];
  }), [[1546, 'multiply', 1.12], [1547, 'multiply', 1.12], [1548, 'multiply', 1.12]]);
});

test('preserves unrelated history and reuses exact persisted rows on replay', () => {
  const args = input(); const candidate = build(args); const persisted = readbacks(candidate);
  const oldLanding = { id: 77, dataset_type: 'armor_attributes_raw', source_key: 'old' };
  const oldMaint = { id: 78, record_key: 'a'.repeat(64), landing_source_key: 'old' };
  args.currentLocalLandings = [persisted.localLandingReadback];
  args.currentMaintLandings = [oldLanding, persisted.maintLandingReadback];
  args.currentMaintRows = [oldMaint, ...persisted.maintReadback];
  args.parsedAt = '2026-09-29T16:00:00Z';
  const replay = build(args);
  assert.equal(replay.changes.maintLanding.inserts.length, 0);
  assert.equal(replay.changes.maint.inserts.length, 0);
  assert.equal(replay.changes.maint.reused.length, 3);
  assert.deepEqual(replay.changes.maintLanding.preserved, [oldLanding]);
  assert.deepEqual(replay.changes.maint.preserved, [oldMaint]);
  assert.deepEqual(replay.maintRows.map(row => row.id), [1000, 1001, 1002]);
});

test('binds exact readback IDs and source keys into effect lineage and projection', () => {
  const args = input(); const candidate = build(args);
  const result = bind({ input: args, candidate, ...readbacks(candidate) });
  assert.equal(result.executable, false);
  assert.equal(result.databaseWrites, false);
  for (const [i, effect] of result.effects.entries()) {
    assert.equal(effect.sourceMaintTable, 'maint_armor_attribute_rows');
    assert.equal(effect.sourceMaintId, 1000 + i);
    assert.equal(effect.landingSourceId, 900);
    assert.equal(effect.ownerRecordKey, candidate.maintRows[i].record_key);
    assert.equal(effect.sourceMaintRecordKey, candidate.maintRows[i].record_key);
    assert.equal(effect.landingContentHash, candidate.maintLandingRow.content_hash);
    assert.equal(effect.landingSourceKey, candidate.maintLandingRow.source_key);
  }
  assert.deepEqual(result.projectionEffects.map(row => row.ownerId), [1546, 1547, 1548]);
  assert.ok(result.projectionEffects.every(row => row.unit === 'multiplier' && row.conditionText && !Object.hasOwn(row, 'id')));
  assert.deepEqual(result.acceptance.blockers.map(row => row.code), [
    'registered-item-effect-upstream-executor-required', 'complete-item-and-set-coverage-unverified',
  ]);
});

test('retains precise raw fetch timestamps while using DATETIME seconds in database columns', () => {
  const args = input();
  for (const key of ['page', 'iteminfo', 'armorSets']) {
    change(args.source[key], raw => { raw.fetchedAt = '2026-09-29T14:35:36.968Z'; });
  }
  args.parsedAt = '2026-09-29T14:35:36.999Z';
  const candidate = build(args);
  assert.equal(candidate.maintLandingRow.fetched_at, '2026-09-29T14:35:36.000Z');
  assert.equal(candidate.maintLandingRow.parsed_at, '2026-09-29T14:35:36.000Z');
  const receipts = readbacks(candidate);
  receipts.localLandingReadback.fetched_at = new Date(receipts.localLandingReadback.fetched_at);
  receipts.maintLandingReadback.fetched_at = new Date(receipts.maintLandingReadback.fetched_at);
  assert.equal(bind({ input: args, candidate, ...receipts }).effects.length, 3);
  args.currentLocalLandings = [receipts.localLandingReadback];
  args.currentMaintLandings = [receipts.maintLandingReadback];
  args.currentMaintRows = receipts.maintReadback;
  const replay = build(args);
  assert.equal(replay.changes.maint.inserts.length, 0);
  const persistedCandidate = JSON.parse(JSON.stringify(replay));
  assert.equal(bind({ input: args, candidate: persistedCandidate, ...receipts }).effects.length, 3);
});

for (const [label, mutate] of [
  ['landing payload drift', a => { const c = build(a); a.currentMaintLandings = [{ ...c.maintLandingRow, id: 900, payload_json: '{}' }]; }],
  ['maint effect drift', a => { const c = build(a); const r = readbacks(c); a.currentMaintLandings = [r.maintLandingReadback]; a.currentMaintRows = r.maintReadback; a.currentMaintRows[0].raw_json = '{}'; }],
  ['maint orphan', a => { a.currentMaintRows = readbacks(build(a)).maintReadback; }],
  ['duplicate landing ID', a => { a.currentMaintLandings = [{ id: 1 }, { id: 1 }]; }],
  ['duplicate maint key', a => { a.currentMaintRows = [{ id: 1, record_key: 'a'.repeat(64) }, { id: 2, record_key: 'a'.repeat(64) }]; }],
  ['parse time before fetch', a => { a.parsedAt = '2026-09-01T00:00:00Z'; }],
  ['undeclared input', a => { a.effects = []; }],
]) {
  test(`rejects ${label} before planning mutations`, () => {
    const args = input(); mutate(args); assert.throws(() => build(args), /drift|orphan|duplicate|time|input/);
  });
}

for (const [label, mutate] of [
  ['landing ID', r => { r.maintLandingReadback.id = 0; }],
  ['maint ID', r => { r.maintReadback[0].id = null; }],
  ['duplicate maint IDs', r => { r.maintReadback[0].id = r.maintReadback[1].id; }],
  ['local landing used as maint reference', r => { r.maintReadback[0].landing_source_id = 800; }],
  ['local landing drift', r => { r.localLandingReadback.content_hash = 'b'.repeat(64); }],
  ['invalid current marker', r => { r.maintLandingReadback.current_slot = 0; }],
  ['missing maint', r => { r.maintReadback.pop(); }],
  ['extra maint', r => { r.maintReadback.push({ ...r.maintReadback[0], id: 9 }); }],
  ['wrong condition', r => { const raw = JSON.parse(r.maintReadback[0].raw_json); raw.effect.conditionText = null; r.maintReadback[0].raw_json = JSON.stringify(raw); }],
  ['wrong revision', r => { r.maintLandingReadback.source_revision_timestamp = '2023-10-23T04:15:47Z'; }],
]) {
  test(`rejects readback ${label}`, () => {
    const args = input(); const candidate = build(args); const receipts = readbacks(candidate); mutate(receipts);
    assert.throws(() => bind({ input: args, candidate, ...receipts }), /readback|ID|duplicate/);
  });
}

test('caller-modified maint candidates cannot supply authority', () => {
  const args = input(); const candidate = build(args); const receipts = readbacks(candidate);
  candidate.maintRows[0].defense_value = 11;
  assert.throws(() => bind({ input: args, candidate, ...receipts }), /candidate.*drift/);
});


for (const role of ['Local', 'Maint']) {
  test(`rejects ${role} landing readback ID colliding with preserved history`, () => {
    const args = input();
    args[`current${role}Landings`] = [{ id: role === 'Local' ? 800 : 900, source_key: 'historical' }];
    const candidate = build(args);
    assert.throws(() => bind({ input: args, candidate, ...readbacks(candidate) }), /collision/);
  });
}

test('rejects a maint readback ID colliding with unrelated preserved rows', () => {
  const args = input(); args.currentMaintRows = [{ id: 1000, record_key: 'f'.repeat(64), landing_source_key: 'historical' }];
  const candidate = build(args);
  assert.throws(() => bind({ input: args, candidate, ...readbacks(candidate) }), /collision/);
});
