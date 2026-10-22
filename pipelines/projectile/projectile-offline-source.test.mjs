import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildLocalProjectileSourceBinding,
  buildProjectileDependencyManifest,
  buildProjectileOfflineSourceDecision,
  buildProjectileSourceRelationEvidence,
} from './projectile-offline-source.mjs';

const HASH = 'sha256:' + 'a'.repeat(64);

function writeFixture(t, { count = 1111 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectile-offline-source-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const records = Array.from({ length: count }, (_, index) => ({
    id: index,
    internalName: `Projectile${index}`,
    name: `Projectile ${index}`,
  }));
  const standardizedPath = path.join(root, 'projectiles.standardized.json');
  const viewMetaPath = path.join(root, '_meta.json');
  fs.writeFileSync(standardizedPath, JSON.stringify({
    entity: 'projectiles',
    generatedAt: '2026-03-26T08:51:56.833Z',
    upstreamMeta: { sourceRevisionTimestamp: '2026-03-14T09:34:58Z', totalProjectiles: count },
    records,
  }));
  fs.writeFileSync(viewMetaPath, JSON.stringify({ entity: 'projectiles', totalRecords: count }));
  return { root, records, standardizedPath, viewMetaPath };
}

function sourceRecord() {
  return {
    sourceKey: 'wiki.module.projectileinfo',
    pageId: 18025,
    revisionId: null,
    revisionTimestamp: '2026-03-14T09:34:58Z',
    contentHash: 'f37d2af093cbcbc636d982b799fbf94696d11e7c982bcc9e8606790d8f014714',
  };
}

test('Projectile local source binding freezes all 1,111 identities and the prior module revision', (t) => {
  const fixture = writeFixture(t);
  const binding = buildLocalProjectileSourceBinding({
    standardizedPath: fixture.standardizedPath,
    viewMetaPath: fixture.viewMetaPath,
    wikiManifestRecord: sourceRecord(),
  });
  assert.equal(binding.recordCount, 1111);
  assert.equal(binding.stableIdCount, 1111);
  assert.deepEqual(binding.sourceIdentity, {
    pageId: 18025,
    revisionId: null,
    revisionTimestamp: '2026-03-14T09:34:58Z',
  });
  assert.match(binding.stableIdsSha256, /^sha256:[a-f0-9]{64}$/);
});

test('Projectile local source rejects duplicate stable IDs', (t) => {
  const fixture = writeFixture(t);
  const duplicate = JSON.parse(fs.readFileSync(fixture.standardizedPath, 'utf8'));
  duplicate.records[1].id = duplicate.records[0].id;
  fs.writeFileSync(fixture.standardizedPath, JSON.stringify(duplicate));
  assert.throws(() => buildLocalProjectileSourceBinding({
    standardizedPath: fixture.standardizedPath,
    viewMetaPath: fixture.viewMetaPath,
    wikiManifestRecord: sourceRecord(),
  }), /duplicate|stable Projectile IDs/i);
});

test('Projectile offline source decision records the shared Wiki outage without claiming unchanged', (t) => {
  const fixture = writeFixture(t);
  const binding = buildLocalProjectileSourceBinding({
    standardizedPath: fixture.standardizedPath,
    viewMetaPath: fixture.viewMetaPath,
    wikiManifestRecord: sourceRecord(),
  });
  const decision = buildProjectileOfflineSourceDecision({
    localBinding: binding,
    authorization: 'user-directed-local-offline',
    outageEvidence: {
      status: 'probe_unavailable',
      actionId: 'domain-source-npcs',
      phase: 'wiki-revision-probe',
      artifactPath: '.local/tmp/eight-domain-production-readiness/20261017/npcs/source-decision.json',
      artifactSha256: HASH,
      reason: 'HTTP 502 Bad Gateway - Maintenance',
    },
  });
  assert.equal(decision.sourceMode, 'local-offline-authorized');
  assert.equal(decision.wikiUnchanged, false);
  assert.equal(decision.recordCount, 1111);
  assert.equal(decision.outageEvidence.actionId, 'domain-source-npcs');
  assert.throws(() => buildProjectileOfflineSourceDecision({
    localBinding: binding,
    authorization: 'user-directed-local-offline',
    outageEvidence: { status: 'probe_unavailable', actionId: 'domain-source-projectiles' },
  }), /private.*hash-bound Wiki outage evidence/i);
});

test('Projectile relation evidence uses only explicit Item/NPC raw_json fields and retains missing target audits', () => {
  const result = buildProjectileSourceRelationEvidence({
    projectiles: [
      { id: 1, internalName: 'WoodenArrowFriendly', name: 'Wooden Arrow Friendly' },
      { id: 2, internalName: 'FireArrow', name: 'Fire Arrow' },
    ],
    itemRows: [
      { source_id: 10, internal_name: 'WoodenBow', english_name: 'Wooden Bow', raw_json: JSON.stringify({ shoot: 1, aiStyle: 5 }) },
      { source_id: 11, internal_name: 'MissingProjectileItem', english_name: 'Missing', raw_json: JSON.stringify({ shoot: 99 }) },
      { source_id: 12, internal_name: 'AiStyleOnly', english_name: 'AI only', raw_json: JSON.stringify({ aiStyle: 5 }) },
    ],
    npcRows: [
      { source_id: 50, internal_name: 'NpcShooter', english_name: 'NPC Shooter', raw_json: JSON.stringify({ wikiCrawler: { combat: { projectileId: '2' } } }) },
      { source_id: 51, internal_name: 'NpcAiOnly', english_name: 'NPC AI only', raw_json: JSON.stringify({ aiStyle: 5 }) },
    ],
  });
  assert.equal(result.counts.itemRelationCount, 1);
  assert.equal(result.counts.itemExplicitAuditCount, 2);
  assert.equal(result.counts.unresolvedItemRelationCount, 1);
  assert.equal(result.counts.npcRelationCount, 1);
  assert.equal(result.counts.npcExplicitAuditCount, 1);
  assert.equal(result.counts.unresolvedNpcRelationCount, 0);
  assert.deepEqual(result.unresolvedItemSamples, [
    { itemSourceId: 11, itemInternalName: 'MissingProjectileItem', projectileSourceId: 99, sourceField: 'raw_json.shoot' },
  ]);
  assert.equal(result.explicitRelations.length, 2);
  assert.equal(result.explicitRelations.some((row) => row.sourceId === 12 || row.sourceId === 51), false);
  assert.match(result.manifestSha256, /^sha256:[a-f0-9]{64}$/);
});

test('Projectile relation evidence counts every unresolved target beyond the sample cap', () => {
  const itemRows = Array.from({ length: 15 }, (_, index) => ({
    source_id: index + 1,
    internal_name: `MissingProjectileItem${index + 1}`,
    raw_json: JSON.stringify({ shoot: index + 100 }),
  }));
  const result = buildProjectileSourceRelationEvidence({
    projectiles: [{ id: 1, internalName: 'KnownProjectile', name: 'Known Projectile' }],
    itemRows,
    npcRows: [],
  });

  assert.equal(result.counts.unresolvedItemRelationCount, 15);
  assert.equal(result.unresolvedItemSamples.length, 12);
});

test('Projectile dependency manifest contains only exact maintained Item identities that carry explicit relations', () => {
  const row = {
    id: 901,
    source_id: 901,
    internal_name: 'WoodenBow',
    english_name: 'Wooden Bow',
    name_zh: null,
    source_provider: 'terraria.wiki.gg',
    source_page: 'Wooden Bow',
    source_revision_timestamp: '2026-03-14 09:34:58',
    landing_source_id: 100,
    landing_source_key: 'wiki.module.iteminfo',
    landing_source_page: 'Module:Iteminfo/data',
    landing_content_hash: 'a'.repeat(64),
    landing_fetched_at: null,
    landing_parsed_at: null,
    module_generated_at: null,
    terraria_version: '1.4.5.1',
    major_value: null,
    combat_value: 4,
    defense_value: null,
    use_time: 30,
    stack_size: null,
    width: 12,
    height: 28,
    flags_json: '{}',
    raw_json: JSON.stringify({ shoot: 1 }),
    status: 1,
    deleted: 0,
  };
  const manifest = buildProjectileDependencyManifest({
    runId: 'e8pr-projectiles-20261017-v1',
    runKey: 'e8p_cbf91b9072f33db5',
    databases: {
      local: 'terria_v1_automation_acceptance_e8p_cbf91b9072f33db5_local',
      maint: 'terria_v1_automation_acceptance_e8p_cbf91b9072f33db5_maint',
      relation: 'terria_v1_automation_acceptance_e8p_cbf91b9072f33db5_relation',
    },
    itemRows: [row],
    relationSourceIds: [901],
  });
  assert.equal(manifest.dependencies.length, 1);
  assert.equal(manifest.dependencies[0].source.database, 'terria_v1_maint');
  assert.equal(manifest.dependencies[0].source.table, 'maint_items');
  assert.equal(manifest.dependencies[0].target.database, 'terria_v1_automation_acceptance_e8p_cbf91b9072f33db5_maint');
  assert.deepEqual(manifest.dependencies[0].keyValues, [{ source_id: 901 }]);
  assert.equal(manifest.dependencies[0].expectedRowCount, 1);
});
