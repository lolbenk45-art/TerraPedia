import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { buildArmorSourceEvidenceTransition } from '../landing/armor-source-evidence-transition.mjs';
import {
  buildArmorCanonicalLandingMaintIntent,
  materializeArmorCanonicalLandingMaintIntent,
  validateArmorCanonicalLandingMaintIntent,
} from './armor-canonical-landing-maint-intent.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const PREFIX = 'https://media.example.test/terrapedia-images/items/';
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;

function landing(overrides = {}) {
  return {
    dataset_type: 'armor_sets_raw', provider: 'terraria.wiki.gg', source_kind: 'module',
    source_key: 'wiki.module.armorsetbonuses', source_page: 'Module:ArmorSetBonuses',
    source_revision_timestamp: '2026-09-25T03:00:00Z', content_hash: HASH_B,
    payload_json: '{"source":"armor"}', fetched_at: '2026-09-25T03:01:00Z',
    parsed_at: '2026-09-25T03:01:00Z', parse_status: 'ok', artifact_role: 'source_evidence',
    producer_id: 'armor.module.fetcher', producer_version: 'v2', producer_run_key: 'run-armor-01',
    bootstrap_manifest_hash: null, is_current: 1, current_slot: 1, ...overrides,
  };
}

function graph() {
  const current = [landing({ id: 7, artifact_role: 'legacy_compat', content_hash: HASH_A })];
  const transition = buildArmorSourceEvidenceTransition({
    currentRows: current,
    incomingRows: [landing({ id: null })],
  });
  const maintBaselineRows = { maint_armor_sets: [], maint_armor_set_images: [] };
  const maintCandidate = {
    schemaVersion: 'armor-canonical-maint-candidate/v1', executable: false,
    executionBlocker: 'registered-full-chain-executor-required',
    tables: ['maint_armor_sets', 'maint_armor_set_images'], deletes: [],
    changes: {
      maint_armor_sets: {
        inserts: [{ record_key: 'c'.repeat(64), text_key: 'ArmorSetBonus.Wood', source_provider: 'terraria.wiki.gg', landing_source_id: undefined,
          landing_source_key: landing().source_key, landing_source_page: landing().source_page,
          landing_content_hash: HASH_B, status: 1, deleted: 0 }],
        updates: [], unchanged: [], preserved: [],
      },
      maint_armor_set_images: { inserts: [], updates: [], unchanged: [], preserved: [] },
    },
    expectedRows: { maint_armor_sets: [], maint_armor_set_images: [] },
    summary: { inserts: 1, updates: 0, unchanged: 0, preserved: 0 },
    removedSourceIdentities: [], removedImageIdentities: [], requiresRemovalReview: false,
    unresolvedLandingReferences: ['armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses'],
    sourceSnapshotSha256: `sha256:${HASH_A}`, baselineSha256: `sha256:${HASH_B}`, managedImageUrlPrefixes: [PREFIX],
  };
  return { current, transition, maintBaselineRows, maintCandidate };
}

function intentInput() {
  const { current, transition, ...rest } = graph();
  return { landingCurrentRows: current, landingTransition: transition, ...rest, writeTimestamp: '2026-09-25T03:30:00Z' };
}

function receipts() {
  return [
    {
      databaseRole: 'local', table: 'source_dataset_landings',
      logicalKey: 'armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses',
      insertId: 101, affectedRows: 1,
      readback: { ...landing({ id: 101 }), current_slot: 1, created_at: '2026-09-25T03:30:00Z', updated_at: '2026-09-25T03:30:00Z' },
    },
    {
      databaseRole: 'maint', table: 'maint_armor_sets', logicalKey: 'c'.repeat(64),
      insertId: 201, affectedRows: 1,
      readback: { record_key: 'c'.repeat(64), text_key: 'ArmorSetBonus.Wood', source_provider: 'terraria.wiki.gg', landing_source_id: 101,
        landing_source_key: landing().source_key, landing_source_page: landing().source_page,
        landing_content_hash: HASH_B, status: 1, deleted: 0, id: 201,
        created_at: '2026-09-25T03:30:00Z', updated_at: '2026-09-25T03:30:00Z' },
    },
  ];
}

test('builds a non-executable landing/maint graph with typed unresolved landing reference', () => {
  const result = buildArmorCanonicalLandingMaintIntent(intentInput());
  assert.equal(result.executable, false);
  assert.equal(result.insertPlans.length, 2);
  assert.deepEqual(result.insertPlans[1].references, [{
    column: 'landing_source_id',
    target: 'local.source_dataset_landings|armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses',
  }]);
  assert.equal(result.insertPlans[1].nonGeneratedFields.landing_source_id, undefined);
  assert.equal(result.generatedIdDeclarations.length, 2);
  assert.deepEqual(result.referenceDeclarations, [{
    databaseRole: 'maint', table: 'maint_armor_sets', logicalKey: 'c'.repeat(64),
    column: 'landing_source_id',
    target: 'local.source_dataset_landings|armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses',
  }]);
  assert.doesNotThrow(() => validateArmorCanonicalLandingMaintIntent(result));
});

test('keeps retired landing history in the baseline while enforcing one current identity', () => {
  const input = intentInput();
  input.landingCurrentRows.push(landing({
    id: 8,
    artifact_role: 'source_evidence',
    is_current: 0,
    current_slot: null,
    content_hash: HASH_A,
  }));
  assert.doesNotThrow(() => buildArmorCanonicalLandingMaintIntent(input));
});

test('materializes exact landing and maint receipts without guessing allocator order', () => {
  const intent = buildArmorCanonicalLandingMaintIntent(intentInput());
  const result = materializeArmorCanonicalLandingMaintIntent({ intent, receipts: receipts() });
  assert.deepEqual(result.verifiedIdMap, {
    'local.source_dataset_landings|armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses': 101,
    [`maint.maint_armor_sets|${'c'.repeat(64)}`]: 201,
  });
  const maint = result.concreteInsertPlans.find(plan => plan.table === 'maint_armor_sets');
  assert.equal(maint.nonGeneratedFields.landing_source_id, 101);
  assert.match(result.concreteAfterSha256, /^sha256:[0-9a-f]{64}$/);
});

test('rejects a receipt map that omits the landing row or drifts a receipt ID', () => {
  const intent = buildArmorCanonicalLandingMaintIntent(intentInput());
  assert.throws(() => materializeArmorCanonicalLandingMaintIntent({
    intent,
    receipts: receipts().slice(1),
  }), /receipt|missing|map/i);
  const swapped = receipts().map(receipt => ({ ...receipt, ...(receipt.table === 'maint_armor_sets' ? { insertId: 301 } : {}) }));
  assert.throws(() => materializeArmorCanonicalLandingMaintIntent({ intent, receipts: swapped }), /duplicate|readback|ID/i);
});

test('rejects a rehashed intent with a caller-allocated landing ID', () => {
  const input = intentInput();
  input.landingTransition = structuredClone(input.landingTransition);
  input.landingTransition.inserts[0].id = 999;
  assert.throws(() => buildArmorCanonicalLandingMaintIntent(input), /allocated|generated|ID/i);
});

test('rejects a semantically invalid landing transition even when every outer hash is recomputed', () => {
  const value = structuredClone(buildArmorCanonicalLandingMaintIntent(intentInput()));
  value.snapshots.landingTransition.inserts[0].id = 999;
  value.sourceSnapshotSha256 = digest(value.snapshots.landingTransition);
  value.inputSha256 = digest(value.snapshots);
  const { intentSha256: _ignored, ...body } = value;
  value.intentSha256 = digest(body);
  assert.throws(() => validateArmorCanonicalLandingMaintIntent(value), /allocated|generated|ID|insert/i);
});

test('rejects a maint insert whose concrete landing ID belongs to a different source identity', () => {
  const input = intentInput();
  input.maintCandidate = structuredClone(input.maintCandidate);
  input.maintCandidate.changes.maint_armor_sets.inserts[0].landing_source_id = 7;
  assert.throws(() => buildArmorCanonicalLandingMaintIntent(input), /landing|identity|source/i);
});

test('rejects a rehashed intent that moves an insert outside the landing/maint table scope', () => {
  const value = structuredClone(buildArmorCanonicalLandingMaintIntent(intentInput()));
  value.insertPlans[0].table = 'users';
  value.generatedIdDeclarations[0].table = 'users';
  value.referenceDeclarations = [];
  const { intentSha256: _ignored, ...body } = value;
  value.intentSha256 = digest(body);
  assert.throws(() => validateArmorCanonicalLandingMaintIntent(value), /scope|table/i);
});
