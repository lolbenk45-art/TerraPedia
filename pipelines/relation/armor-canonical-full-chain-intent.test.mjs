import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { buildArmorSourceEvidenceTransition } from '../landing/armor-source-evidence-transition.mjs';
import { buildArmorCanonicalLandingMaintIntent } from './armor-canonical-landing-maint-intent.mjs';
import {
  buildArmorCanonicalFullChainIntent,
  validateArmorCanonicalFullChainIntent,
} from './armor-canonical-full-chain-intent.mjs';
import { materializeArmorCanonicalIntent } from './armor-canonical-intent.mjs';
import { executeArmorCanonicalTransaction } from './armor-canonical-transaction-executor.mjs';

const digest = value => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value instanceof Date ? value.toISOString()
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const KEY = 'a'.repeat(64);
const MAINT_KEY = 'b'.repeat(64);
const PREFIX = 'https://media.example.test/terrapedia-images/items/';
const CONTENT_HASH = 'c'.repeat(64);
const WRITE_TIME = '2026-09-26T04:00:00Z';

function landing(overrides = {}) {
  return {
    dataset_type: 'armor_sets_raw', provider: 'terraria.wiki.gg', source_kind: 'module',
    source_key: 'wiki.module.armorsetbonuses', source_page: 'Module:ArmorSetBonuses',
    source_revision_timestamp: '2026-09-26T03:00:00Z', content_hash: CONTENT_HASH,
    payload_json: '{}', fetched_at: '2026-09-26T03:01:00Z', parsed_at: '2026-09-26T03:01:00Z',
    parse_status: 'ok', artifact_role: 'source_evidence', producer_id: 'armor.test',
    producer_version: 'v1', producer_run_key: 'run-1', bootstrap_manifest_hash: null,
    is_current: 1, current_slot: 1, ...overrides,
  };
}

function imageLanding() {
  return landing({ dataset_type: 'armor_set_images_raw', source_key: 'wiki.armor_set_images', source_page: 'Armor set pages' });
}

function landingMaintIntent({ currentLanding = {} } = {}) {
  const current = [landing({ id: 10, artifact_role: 'legacy_compat', content_hash: 'd'.repeat(64), ...currentLanding })];
  const transition = buildArmorSourceEvidenceTransition({ currentRows: current, incomingRows: [landing(), imageLanding()] });
  const maintCandidate = {
    schemaVersion: 'armor-canonical-maint-candidate/v1', executable: false,
    executionBlocker: 'registered-full-chain-executor-required',
    tables: ['maint_armor_sets', 'maint_armor_set_images'], deletes: [],
    changes: {
      maint_armor_sets: { inserts: [{
        record_key: MAINT_KEY, text_key: 'ArmorSetBonus.Test', source_provider: 'terraria.wiki.gg',
        landing_source_id: undefined, landing_source_key: landing().source_key,
        landing_source_page: landing().source_page, landing_content_hash: CONTENT_HASH,
        status: 1, deleted: 0,
      }], updates: [], unchanged: [], preserved: [] },
      maint_armor_set_images: { inserts: [], updates: [], unchanged: [], preserved: [] },
    },
    expectedRows: { maint_armor_sets: [], maint_armor_set_images: [] },
    summary: { inserts: 1, updates: 0, unchanged: 0, preserved: 0 },
    removedSourceIdentities: [], removedImageIdentities: [], requiresRemovalReview: false,
    unresolvedLandingReferences: ['armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses'],
    sourceSnapshotSha256: digest([landing(), imageLanding()]), baselineSha256: digest({ maint_armor_sets: [], maint_armor_set_images: [] }),
    managedImageUrlPrefixes: [PREFIX],
  };
  return buildArmorCanonicalLandingMaintIntent({
    landingCurrentRows: current, landingTransition: transition, maintBaselineRows: { maint_armor_sets: [], maint_armor_set_images: [] },
    maintCandidate, writeTimestamp: WRITE_TIME,
  });
}

function projectionCandidate(landingMaint, { includeLandingSourcePage = true } = {}) {
  const relationInput = {
    landingCurrentRows: structuredClone(landingMaint.snapshots.landingCurrentRows),
    maintInput: {
      landingRows: [landing(), imageLanding()], currentRows: { maint_armor_sets: [], maint_armor_set_images: [] },
      managedImageUrlPrefixes: [PREFIX], allowUnmaterializedLandingIds: true,
    },
    maintItems: [], currentRows: { relation_armor_sets: [], relation_armor_set_items: [], relation_armor_set_images: [] },
  };
  const relationRow = {
    record_key: KEY, text_key: 'ArmorSetBonus.Test', source_maint_table: 'maint_armor_sets',
    source_maint_record_key: MAINT_KEY, source_maint_id: null, source_provider: 'terraria.wiki.gg',
    landing_source_id: null, landing_source_key: landing().source_key, landing_source_page: landing().source_page,
    landing_content_hash: CONTENT_HASH, status: 1, deleted: 0,
  };
  if (!includeLandingSourcePage) delete relationRow.landing_source_page;
  const relationCandidate = {
    schemaVersion: 'armor-canonical-relation-candidate/v1', executable: false,
    executionBlocker: 'registered-full-chain-executor-required',
    tables: ['relation_armor_sets', 'relation_armor_set_items', 'relation_armor_set_images'],
    changes: {
      relation_armor_sets: { inserts: [relationRow], updates: [], unchanged: [], preserved: [] },
      relation_armor_set_items: { inserts: [], updates: [], unchanged: [], preserved: [] },
      relation_armor_set_images: { inserts: [], updates: [], unchanged: [], preserved: [] },
    }, expectedRows: { relation_armor_sets: [relationRow], relation_armor_set_items: [], relation_armor_set_images: [] },
    summary: { inserts: 1, updates: 0, unchanged: 0, preserved: 0 }, deletes: [],
    removedIdentities: { relation_armor_sets: [], relation_armor_set_items: [], relation_armor_set_images: [] },
    requiresRemovalReview: false, unresolvedGeneratedIds: [{ table: 'relation_armor_sets', recordKey: KEY }],
    unresolvedDependencies: [{ table: 'relation_armor_sets', recordKey: KEY, column: 'source_maint_id' }],
    inputSnapshots: relationInput, sourceSnapshotSha256: digest(relationInput.maintInput.landingRows),
    maintBaselineSha256: digest(relationInput.maintInput.currentRows), baselineSha256: digest(relationInput.currentRows),
    itemDependenciesSha256: digest(relationInput.maintItems), inputSha256: digest(relationInput),
    managedImageUrlPrefixes: [PREFIX], candidateSha256: null,
  };
  { const { candidateSha256: _ignored, ...body } = relationCandidate; relationCandidate.candidateSha256 = digest(body); }
  const projectionRow = {
    text_key: 'ArmorSetBonus.Test', relation_record_key: KEY, source_key: 'ArmorSetBonus.Test',
    entity_type: 'armor_set', status: 1, deleted: 0,
  };
  const snapshot = { relationInput, currentRows: { projection_armor_sets: [] }, dependencyRows: {}, consumerRows: {}, managedImageUrlPrefixes: [PREFIX] };
  const candidate = {
    schemaVersion: 'armor-canonical-projection-candidate/v1', executable: false,
    candidateSha256: null, baselineSha256: digest(snapshot.currentRows), inputSha256: digest(snapshot),
    dependencySnapshotSha256: digest(snapshot.dependencyRows), consumerSnapshotSha256: digest(snapshot.consumerRows),
    managedImagePolicySha256: digest(snapshot.managedImageUrlPrefixes), tables: ['projection_armor_sets'],
    managedImageUrlPrefixes: [PREFIX], inputSnapshots: snapshot,
    changes: { projection_armor_sets: { inserts: [projectionRow], updates: [], unchanged: [], preserved: [] } },
    expectedRows: { projection_armor_sets: [projectionRow] }, dependencyExpectations: {
      projection_item_armor_attributes: [], projection_equipment_effect_attributes: [],
    }, unresolvedGeneratedIds: [{ table: 'projection_armor_sets', textKey: projectionRow.text_key, column: 'id', referencedTable: 'relation_armor_sets', recordKey: KEY }],
    unresolvedDependencies: [], acceptance: { status: 'blocked', runtimeVerified: false, blockers: [{ code: 'generated-identities-unresolved' }] },
    relationCandidate,
  };
  { const { candidateSha256: _ignored, ...body } = candidate; candidate.candidateSha256 = digest(body); }
  return candidate;
}

test('composes one typed full-chain graph and declares landing, maint, relation, and projection dependencies', () => {
  const landingMaint = structuredClone(landingMaintIntent());
  const result = buildArmorCanonicalFullChainIntent({ landingMaintIntent: landingMaint, projectionCandidate: projectionCandidate(landingMaint), writeTimestamp: WRITE_TIME });
  assert.equal(result.executable, false);
  assert.equal(result.landingMaintIntent.intentSha256, landingMaint.intentSha256);
  assert.equal(result.relationIntent.insertPlans.length, 2);
  assert.deepEqual([...result.relationIntent.upstreamReferenceDeclarations].sort(), [
    `local.source_dataset_landings|armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses`,
    `maint.maint_armor_sets|${MAINT_KEY}`,
  ]);
  const relation = result.relationIntent.insertPlans.find(plan => plan.table === 'relation_armor_sets');
  assert.deepEqual([...relation.references].sort((a, b) => a.column.localeCompare(b.column)), [
    { column: 'landing_source_id', target: 'local.source_dataset_landings|armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses' },
    { column: 'source_maint_id', target: `maint.maint_armor_sets|${MAINT_KEY}` },
  ]);
  const projection = result.relationIntent.insertPlans.find(plan => plan.table === 'projection_armor_sets');
  assert.deepEqual(projection.references, [{ column: 'id', target: `relation.relation_armor_sets|${KEY}` }]);
  assert.equal(result.recoveryIntent.operationId, 'canonical-armor-ingestion');
  assert.match(result.recoveryIntent.intentSha256, /^sha256:[0-9a-f]{64}$/);
  assert.doesNotThrow(() => validateArmorCanonicalFullChainIntent(result));
});

test('resolves the landing page for relation references from the exact frozen landing insert', () => {
  const landingMaint = structuredClone(landingMaintIntent());
  const candidate = projectionCandidate(landingMaint, { includeLandingSourcePage: false });

  const result = buildArmorCanonicalFullChainIntent({
    landingMaintIntent: landingMaint,
    projectionCandidate: candidate,
    writeTimestamp: WRITE_TIME,
  });

  const relation = result.relationIntent.insertPlans.find(plan => plan.table === 'relation_armor_sets');
  assert.ok(relation.references.some(reference => reference.column === 'landing_source_id'
    && reference.target === 'local.source_dataset_landings|armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses'));
  assert.equal(Object.hasOwn(relation.nonGeneratedFields, 'landing_source_page'), false);
});

test('rejects a relation update whose landing id points to a different content version', () => {
  const landingMaint = landingMaintIntent();
  const candidate = projectionCandidate(landingMaint);
  const relationCandidate = candidate.relationCandidate;
  const after = { ...relationCandidate.changes.relation_armor_sets.inserts[0], id: 101, landing_source_id: 10 };
  relationCandidate.changes.relation_armor_sets.inserts = [];
  relationCandidate.changes.relation_armor_sets.updates = [{
    before: { ...after, landing_source_id: null }, after, changedColumns: ['landing_source_id'],
  }];
  relationCandidate.expectedRows.relation_armor_sets = [after];
  relationCandidate.unresolvedGeneratedIds = [];
  {
    const { candidateSha256: _ignored, ...body } = relationCandidate;
    relationCandidate.candidateSha256 = digest(body);
  }
  candidate.changes.projection_armor_sets.inserts = [];
  candidate.unresolvedGeneratedIds = [];
  {
    const { candidateSha256: _ignored, ...body } = candidate;
    candidate.candidateSha256 = digest(body);
  }

  assert.throws(() => buildArmorCanonicalFullChainIntent({
    landingMaintIntent: landingMaint,
    projectionCandidate: candidate,
    writeTimestamp: WRITE_TIME,
  }), /landing id.*content hash|landing lineage/i);
});

test('composes a full-chain intent when the relation/projection candidate has only updates', () => {
  const landingMaint = structuredClone(landingMaintIntent());
  const candidate = projectionCandidate(landingMaint);
  candidate.relationCandidate.changes.relation_armor_sets.inserts = [];
  candidate.relationCandidate.changes.relation_armor_sets.updates = [{
    before: { ...candidate.relationCandidate.expectedRows.relation_armor_sets[0], id: 101 },
    after: { ...candidate.relationCandidate.expectedRows.relation_armor_sets[0], id: 101, status: 1 },
    changedColumns: ['status'],
  }];
  candidate.relationCandidate.unresolvedGeneratedIds = [];
  {
    const { candidateSha256: _ignored, ...body } = candidate.relationCandidate;
    candidate.relationCandidate.candidateSha256 = digest(body);
  }
  candidate.changes.projection_armor_sets.inserts = [];
  candidate.changes.projection_armor_sets.updates = [{
    before: { ...candidate.expectedRows.projection_armor_sets[0], id: 201 },
    after: { ...candidate.expectedRows.projection_armor_sets[0], id: 201, status: 1 },
    changedColumns: ['status'],
  }];
  candidate.unresolvedGeneratedIds = [];
  candidate.acceptance = { status: 'dependencies-satisfied', runtimeVerified: false, blockers: [] };
  {
    const { candidateSha256: _ignored, ...body } = candidate;
    candidate.candidateSha256 = digest(body);
  }

  const result = buildArmorCanonicalFullChainIntent({
    landingMaintIntent: landingMaint,
    projectionCandidate: candidate,
    writeTimestamp: WRITE_TIME,
  });
  assert.deepEqual(result.relationIntent.insertPlans, []);
  assert.doesNotThrow(() => validateArmorCanonicalFullChainIntent(result));
});

test('accepts database Date values when the relation and full-chain baseline hashes use the same instant', () => {
  const landingMaint = structuredClone(landingMaintIntent());
  const candidate = projectionCandidate(landingMaint);
  const createdAt = new Date('2026-09-26T04:00:00.000Z');
  const baseline = {
    maint_armor_sets: [{ id: 1, record_key: 'e'.repeat(64), status: 1, deleted: 0, created_at: createdAt }],
    maint_armor_set_images: [],
  };
  landingMaint.snapshots.maintBaselineRows = baseline;
  landingMaint.snapshots.maintCandidate.baselineSha256 = digest(baseline);
  landingMaint.baselineSha256 = digest({
    landingCurrentRows: landingMaint.snapshots.landingCurrentRows,
    maintBaselineRows: baseline,
  });
  landingMaint.inputSha256 = digest(landingMaint.snapshots);
  { const { intentSha256: _ignored, ...body } = landingMaint; landingMaint.intentSha256 = digest(body); }
  candidate.relationCandidate.inputSnapshots.maintInput.currentRows = baseline;
  candidate.relationCandidate.maintBaselineSha256 = digest(baseline);
  candidate.relationCandidate.inputSha256 = digest(candidate.relationCandidate.inputSnapshots);
  { const { candidateSha256: _ignored, ...body } = candidate.relationCandidate; candidate.relationCandidate.candidateSha256 = digest(body); }
  candidate.inputSha256 = digest(candidate.inputSnapshots);
  candidate.baselineSha256 = digest(candidate.inputSnapshots.currentRows);
  { const { candidateSha256: _ignored, ...body } = candidate; candidate.candidateSha256 = digest(body); }
  assert.doesNotThrow(() => buildArmorCanonicalFullChainIntent({
    landingMaintIntent: landingMaint,
    projectionCandidate: candidate,
    writeTimestamp: WRITE_TIME,
  }));
});

test('rejects a relation candidate whose landing/maint graph is not the same source graph', () => {
  const landingMaint = landingMaintIntent();
  const candidate = projectionCandidate(landingMaint);
  candidate.inputSnapshots.relationInput.maintInput.landingRows[0].content_hash = 'e'.repeat(64);
  candidate.inputSnapshots.relationInput.maintInput.landingRows[0].id = undefined;
  assert.throws(() => buildArmorCanonicalFullChainIntent({ landingMaintIntent: landingMaint, projectionCandidate: candidate, writeTimestamp: WRITE_TIME }), /source|landing|graph|drift/i);
});

test('rejects an undeclared or foreign upstream reference before intent construction', () => {
  const landingMaint = landingMaintIntent();
  const candidate = projectionCandidate(landingMaint);
  candidate.relationCandidate.changes.relation_armor_sets.inserts[0].source_maint_record_key = 'f'.repeat(64);
  assert.throws(() => buildArmorCanonicalFullChainIntent({ landingMaintIntent: landingMaint, projectionCandidate: candidate, writeTimestamp: WRITE_TIME }), /maint|reference|target|graph/i);
});

test('materializes relation receipts only with declared landing and maint receipts', () => {
  const landingMaint = landingMaintIntent();
  const result = buildArmorCanonicalFullChainIntent({ landingMaintIntent: landingMaint, projectionCandidate: projectionCandidate(landingMaint), writeTimestamp: WRITE_TIME });
  const externalIds = new Map(result.relationIntent.upstreamReferenceDeclarations.map((identity, index) => [identity, 100 + index]));
  const relationReceipts = result.relationIntent.insertPlans.map((plan, index) => {
    const refs = Object.fromEntries(plan.references.map(reference => [reference.column,
      externalIds.get(reference.target) ?? 300]));
    const insertId = 300;
    return {
      databaseRole: plan.databaseRole, table: plan.table, logicalKey: plan.logicalKey,
      insertId, affectedRows: 1,
      readback: { ...plan.nonGeneratedFields, ...refs, id: insertId,
        created_at: WRITE_TIME, updated_at: WRITE_TIME },
    };
  });
  const externalReceipts = result.relationIntent.upstreamReferenceDeclarations.map((identity, index) => {
    const separator = identity.indexOf('|');
    const roleTable = identity.slice(0, separator);
    const logicalKey = identity.slice(separator + 1);
    const split = roleTable.indexOf('.');
    return { databaseRole: roleTable.slice(0, split), table: roleTable.slice(split + 1), logicalKey,
      insertId: 100 + index, affectedRows: 1, readback: {} };
  });
  const materialized = materializeArmorCanonicalIntent({ intent: result.relationIntent, receipts: relationReceipts, externalReceipts });
  assert.equal(materialized.verifiedIdMap['relation.relation_armor_sets|' + KEY], 300);
  assert.equal(materialized.concreteInsertPlans[0].nonGeneratedFields.landing_source_id,
    externalIds.get('local.source_dataset_landings|armor_sets_raw|terraria.wiki.gg|wiki.module.armorsetbonuses|Module:ArmorSetBonuses'));
  assert.equal(materialized.concreteInsertPlans[0].nonGeneratedFields.source_maint_id, externalIds.get(`maint.maint_armor_sets|${MAINT_KEY}`));
  assert.throws(() => materializeArmorCanonicalIntent({ intent: result.relationIntent, receipts: relationReceipts, externalReceipts: [{ ...externalReceipts[0], logicalKey: 'foreign' }] }), /declared|foreign|missing/i);
});

test('full-chain executor consumes the composed relation intent with real landing and maint plans', async () => {
  const landingMaint = landingMaintIntent();
  const expected = buildArmorCanonicalFullChainIntent({ landingMaintIntent: landingMaint, projectionCandidate: projectionCandidate(landingMaint), writeTimestamp: WRITE_TIME });
  const calls = [];
  let nextId = 700;
  const connection = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    async query(sql, params = []) {
      calls.push(sql);
      if (sql.includes('@@server_uuid')) return [[{ serverUuid: '11111111-1111-1111-1111-111111111111' }]];
      if (sql.includes('crawler_automation_owner')) return [[{ username: 'owner', status: 'ACTIVE' }]];
      if (sql.startsWith('UPDATE') && sql.includes('crawler_automation_write_fence')) return [{ affectedRows: 1 }];
      if (sql.includes('crawler_automation_write_fence')) return [[{ latest_run_id: 'run-full', fence_token: 'fence-full', active: 1 }]];
      if (sql.includes('COLLATE utf8mb4_0900_ai_ci')) return [[]];
      if (sql.startsWith('SELECT id FROM')) return [[{ id: params[0] }]];
      if (sql.startsWith('INSERT INTO')) return [{ affectedRows: 1, insertId: nextId++ }];
      if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
      if (sql.startsWith('SELECT *')) return [[{ id: sql.includes('WHERE `id`') ? params.at(-1) : nextId - 1,
        created_at: WRITE_TIME, updated_at: WRITE_TIME }]];
      return [[]];
    },
  };
  let materializedReceipts = 0;
  const result = await executeArmorCanonicalTransaction({
    connection,
    packet: {
      runId: 'run-full', decisionIdentity: 'decision-full', packetHash: `sha256:${'d'.repeat(64)}`,
      actor: 'owner', serverUuid: '11111111-1111-1111-1111-111111111111', fenceToken: 'fence-full',
      fenceCommit: { generation: 1, marker: 'commit-full' },
    },
    expected,
    deriveLocked: async () => expected,
    journal: {
      prepared: async () => {},
      materialized: async ({ receipts }) => { materializedReceipts = receipts.length; },
      rolledBack: async () => {}, commitUnknown: async () => {}, committed: async () => {},
    },
  });
  assert.equal(result.status, 'committed');
  assert.equal(materializedReceipts, expected.landingMaintIntent.insertPlans.length + expected.relationIntent.insertPlans.length);
  assert.equal(calls.some(sql => sql.includes('`relation_armor_sets`')), true);
  assert.equal(calls.some(sql => sql.includes('projection_armor_sets')), true);
});

test('rejects a rehashed full-chain envelope whose dependency graph no longer matches its typed plans', () => {
  const landingMaint = landingMaintIntent();
  const result = buildArmorCanonicalFullChainIntent({ landingMaintIntent: landingMaint, projectionCandidate: projectionCandidate(landingMaint), writeTimestamp: WRITE_TIME });
  const tampered = structuredClone(result);
  tampered.dependencyGraph.landingToMaint = [];
  tampered.recoveryIntent.dependencyGraph.landingToMaint = [];
  { const { intentSha256: _ignored, ...recoveryBody } = tampered.recoveryIntent; tampered.recoveryIntent.intentSha256 = digest(recoveryBody); }
  const { fullChainSha256: _ignored, ...body } = tampered;
  tampered.fullChainSha256 = digest(body);
  assert.throws(() => validateArmorCanonicalFullChainIntent(tampered), /dependency|graph|binding/i);
});
