import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from '../automation/canonical-operation-catalog.mjs';
import { buildCanonicalOperationExecutionManifest } from '../automation/canonical-operation-execution-manifest.mjs';

let subject = {};
try {
  subject = await import('./npc-loot-identity-restoration.mjs');
} catch {
  // The first RED run proves the operation does not exist yet.
}

const EXPECTED = Object.freeze([
  Object.freeze({
    npcInternalName: 'CrimsonAxe', itemInternalName: 'Nazar', projectionId: 179,
    canonicalRecordKey: 'd5f5ac84c046117962a402a194c12f9084b858ff42daa9974d7275ce63636fa5',
    canonicalSourceFactKey: '8a926d60439431042f14e30bb61d7cf3aee431e03c26aa50be3f9fd0d20ab245',
    canonicalSourceMaintRecordKey: '11cf10672227d212a15d3287e0bd0aac92db0e7cfb8cdc9d2f7ce048946f52f2',
    legacyRecordKey: 'a4a51693c3764482eb4356bad860d81b2aad86da7defcafc58206d5bc44afff9',
    legacySourceFactKey: 'cf18ff25756a712c09f84ec5f748393e34147f3734a1c91f18bfd57a72b77cc3',
    legacySourceMaintRecordKey: 'e97267fa8e5bb24e8224e62eb5bed2627eb319d5eabedf4712a96aa6158058c8',
    itemId: 891, chanceText: '{{modes|1%|1.99%}}', legacyChanceText: '1% 1.99%',
    sourcePage: 'https://terraria.wiki.gg/wiki/Crimson_Axe', sourceRefName: 'Crimson Axe', maintId: 9908,
  }),
  Object.freeze({
    npcInternalName: 'CursedHammer', itemInternalName: 'Nazar', projectionId: 83,
    canonicalRecordKey: 'b1dd5ffbdff4a30df259cbfe49f034009f791541382395bc980d6fa5b7def405',
    canonicalSourceFactKey: 'e82aa93f49a26172df459d106cd873e155f8e14c0b23d069f1e9a6b7fcc12112',
    canonicalSourceMaintRecordKey: '5fecf3ad4d32c84d9fad4ae81b520d0648bf8f2b660b5288a6542575e8699d62',
    legacyRecordKey: '930a37f89e3417c7f5547ebe5206725dbdfd2258256452ecc704ad09f59db552',
    legacySourceFactKey: '1890328939c36c9d790b37c92fb7222b716bbbb0fb9521820d15286bb87a30b6',
    legacySourceMaintRecordKey: '472009165fa392a578afd866884e6a8a0c691ff609acf1782c6cb5e36053210d',
    itemId: 891, chanceText: '{{modes|1%|1.99%}}', legacyChanceText: '1% 1.99%',
    sourcePage: 'https://terraria.wiki.gg/wiki/Cursed_Hammer', sourceRefName: 'Cursed Hammer', maintId: 9727,
  }),
  Object.freeze({
    npcInternalName: 'CursedSkull', itemInternalName: 'Nazar', projectionId: 34,
    canonicalRecordKey: '814335bd87bcb75ab728f4f56816634812689774307c691d6bf700e27c978167',
    canonicalSourceFactKey: 'd08b1810e482bfe390cb0af7f41324f9ba76d4a29623c3b3f2c02460b0986adf',
    canonicalSourceMaintRecordKey: '8f428dc573f23ae36f4db870196870b87492492fdc0c6dd9eb6616df80a4ccce',
    legacyRecordKey: '3b236ed3c9ba6e92d17124c9f7f946cb8596cb363c1144ec0c8c8bb75a6f0fc0',
    legacySourceFactKey: '824ed012df6fb6dc8247d5fbd169223bd38b615cf06c532158a82a3ac01015bd',
    legacySourceMaintRecordKey: '81ba2f9b5905ea9575b295300b7d81fe2e6c56c6254faa418d7392f255222ce7',
    itemId: 891, chanceText: '{{modes|1%|1.99%}}', legacyChanceText: '1% 1.99%',
    sourcePage: 'https://terraria.wiki.gg/wiki/Cursed_Skull', sourceRefName: 'Cursed Skull', maintId: 9648,
  }),
  Object.freeze({
    npcInternalName: 'Hornet', itemInternalName: 'Stinger', projectionId: 42,
    canonicalRecordKey: 'f99572374ca1e34a2b5b3ab2a050850d97ef8c34e6974002b965acb56778d2d5',
    canonicalSourceFactKey: 'a2ac1646917d5652ab8cb97ea10613464e650e639b31f7147eddee8393ca989f',
    canonicalSourceMaintRecordKey: '51bd6f7959e5fd842bebcab0e0031f561edbd18e909291ccab21997df61448fa',
    legacyRecordKey: '2e3885486e017aff4a135fadb9d0101248b54b8620e5fde60c9c308059dd7dc2',
    legacySourceFactKey: '0c3d9a9d6fefc3ae627fd13b4f1d2631bb86c495a7a1c705fa3d28b54feb69c8',
    legacySourceMaintRecordKey: '6f165a5e14f05a8b489df5426740d0492ff385e0b35e169509589d8da679e3ee',
    itemId: 209, chanceText: '{{modes|66%|100%}}', legacyChanceText: '66% 100%',
    sourcePage: 'https://terraria.wiki.gg/wiki/Hornet', sourceRefName: 'Hornet', maintId: 9671,
  }),
  Object.freeze({
    npcInternalName: 'JungleSlime', itemInternalName: 'SlimeStaff', projectionId: -10,
    canonicalRecordKey: '54b14274bcd308be48a8102729d3d23912050c9bbfbae5b22ee7338dd8e83b96',
    canonicalSourceFactKey: 'ebc542fa440e2bcece54fae42aa822a2351a0d504ee0c951faaac321240de2ce',
    canonicalSourceMaintRecordKey: 'be27b75160a81912934815362bb197aa4d7517500900f221684a1013a5a4caa3',
    legacyRecordKey: 'fc73e03fee6e27e60eed1b31f3a5f379b6918eec796331542f1d5b4f8b7a3b75',
    legacySourceFactKey: '248166b2c1512a090756eeb806df22956ff3177813441db9f889fd07e2002461',
    legacySourceMaintRecordKey: '0472cc853e3c2dc9b56ca571b2539cacee11be74a770fe4b53cdd8a64773e17b',
    itemId: 1309, chanceText: '{{modes|0.01%|0.014%}}', legacyChanceText: '0.01% 0.014%',
    sourcePage: 'https://terraria.wiki.gg/wiki/Jungle_Slime', sourceRefName: 'Jungle Slime', maintId: 9446,
  }),
  Object.freeze({
    npcInternalName: 'ManEater', itemInternalName: 'Vine', projectionId: 43,
    canonicalRecordKey: '7df5ffebb5b67f4efaad13527d5cebd00975d163cb83043c554054a9fd006f99',
    canonicalSourceFactKey: 'add97e869f75c0381d5f614250eaeedf436fae9443e35a850514a57111999da5',
    canonicalSourceMaintRecordKey: '1544f44b37e61110088bf3f6ac9cf2bb4d0e11e202793617d36ccbeb59b27ffe',
    legacyRecordKey: '8c3172823a4f2aee9eac9ae9cb342a77184f3c9b7a53ebb62e6ac1f4d06da9ac',
    legacySourceFactKey: 'c7381fbfbe67ce6efa187ee1f911916ae63244da75c2fa33f2eedd18d4483268',
    legacySourceMaintRecordKey: '2f57c9790cacc1ceb55ed5560cc5bbb141ba8a454816012974dcc6ad81ace348',
    itemId: 210, chanceText: '{{modes|50%|100%}}', legacyChanceText: '50% 100%',
    sourcePage: 'https://terraria.wiki.gg/wiki/Man_Eater', sourceRefName: 'Man Eater', maintId: 9677,
  }),
]);

function acceptedRelation(target) {
  return {
    recordKey: target.canonicalRecordKey,
    sourceFactKey: target.canonicalSourceFactKey,
    itemInternalName: target.itemInternalName,
    itemName: target.itemInternalName === 'SlimeStaff' ? 'Slime Staff' : target.itemInternalName,
    npcSourceId: target.projectionId,
    npcInternalName: target.npcInternalName,
    npcName: target.npcInternalName,
    quantityMin: null,
    quantityMax: null,
    quantityText: '1',
    chanceValue: null,
    chanceText: target.chanceText,
    conditions: null,
    conditionSourceText: null,
    conditionParseStatus: 'no_condition_text',
    conditionBiomeCode: null,
    conditionGamePeriodCode: null,
    conditionTimeCode: null,
    conditionWeatherCode: null,
    conditionEventsJson: null,
    specialFlagsJson: null,
    reviewStatus: 'resolved',
    confidence: 1,
    reason: 'npc_loot_relation_resolved',
    rawJson: JSON.stringify({ itemName: target.itemInternalName, chanceText: target.chanceText }),
    sourceMaintTable: 'maint_item_sources',
    sourceMaintRecordKey: target.canonicalSourceMaintRecordKey,
    sourceMaintId: null,
    landingSourceId: null,
    landingSourceKey: null,
    landingContentHash: null,
    sourceProvider: 'terraria.wiki.gg',
    sourcePage: target.sourcePage,
    sourceRevisionTimestamp: null,
  };
}

function fixture() {
  const landingRow = {
    landingDatabase: 'terria_v1_local',
    id: 12474,
    source_key: 'generated.npc_item_relations_bundle',
    content_hash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
    provider: 'terrapedia.generated',
    is_current: 1,
  };
  const maintRows = EXPECTED.map((target) => ({
    id: target.maintId,
    record_key: target.canonicalSourceMaintRecordKey,
    item_name: target.itemInternalName === 'SlimeStaff' ? 'Slime Staff' : target.itemInternalName,
    source_type: 'drop',
    source_ref_type: 'npc',
    source_ref_name: target.sourceRefName,
    source_provider: 'terraria.wiki.gg',
    source_page: target.sourcePage,
    landing_source_id: 12474,
    landing_source_key: landingRow.source_key,
    landing_content_hash: landingRow.content_hash,
    status: 1,
    deleted: 0,
  }));
  const sourceFactRows = EXPECTED.map((target) => ({
    record_key: target.canonicalSourceFactKey,
    item_internal_name: target.itemInternalName,
    source_ref_normalized: target.sourceRefName,
    source_maint_record_key: target.canonicalSourceMaintRecordKey,
    source_maint_id: target.maintId,
    landing_source_id: 12474,
    landing_source_key: landingRow.source_key,
    landing_content_hash: landingRow.content_hash,
    source_provider: 'terraria.wiki.gg',
    status: 1,
    deleted: 0,
  }));
  const legacyRelationRows = EXPECTED.map((target, index) => ({
    id: 128 + index,
    record_key: target.legacyRecordKey,
    source_fact_key: target.legacySourceFactKey,
    item_internal_name: target.itemInternalName,
    item_name: target.itemInternalName,
    npc_source_id: target.projectionId,
    npc_internal_name: target.npcInternalName,
    npc_name: target.npcInternalName,
    quantity_min: 1,
    quantity_max: 1,
    quantity_text: '1',
    chance_value: 0.01,
    chance_text: target.legacyChanceText,
    conditions: null,
    condition_parse_status: 'source_fields_only',
    source_maint_table: 'maint_item_sources',
    source_maint_record_key: target.legacySourceMaintRecordKey,
    source_maint_id: 1900 + index,
    landing_source_id: 6180,
    landing_source_key: 'generated.item_relations_bundle:chunk:0001',
    landing_content_hash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
    source_provider: 'wiki_gg',
    source_page: target.itemInternalName,
    confidence: 1,
    reason: 'npc_loot_relation_resolved',
    review_status: 'resolved',
    status: 1,
    deleted: 0,
  }));
  const projectionRows = EXPECTED.map((target) => ({
    id: target.projectionId,
    internal_name: target.npcInternalName,
    loot_items_json: JSON.stringify([
      { relationType: 'loot', itemInternalName: 'OtherItem', relationRecordKey: 'other' },
      {
        relationType: 'loot', itemId: target.itemId, itemSourceId: target.itemId,
        itemInternalName: target.itemInternalName, itemName: target.itemInternalName,
        itemNameZh: 'fixture', itemImageUrl: '/managed.png', chanceText: target.legacyChanceText,
        quantityText: '1', priceText: null, conditionText: null,
        sourceFactKey: target.legacySourceFactKey, relationRecordKey: target.legacyRecordKey,
        sourceProvider: 'wiki_gg', sourcePage: target.itemInternalName,
      },
    ]),
    status: 1,
    deleted: 0,
  }));
  const localRows = EXPECTED.flatMap((target, index) => ([
    {
      id: 81000 + index, npc_id: target.projectionId, item_id: target.itemId,
      source_item_id: target.itemId, drop_source_kind: 'npc_drop', quantity_text: '1',
      chance_text: target.legacyChanceText, status: 0, deleted: 1,
    },
    {
      id: 83000 + index, npc_id: target.projectionId, item_id: target.itemId,
      source_item_id: target.itemId, drop_source_kind: 'npc_drop', quantity_text: '1',
      chance_text: target.chanceText, status: 1, deleted: 0,
    },
  ]));
  return {
    landingRow,
    maintRows,
    sourceFactRows,
    acceptedRelationRows: EXPECTED.map(acceptedRelation),
    legacyRelationRows,
    canonicalRelationRows: [],
    projectionRows,
    localRows,
    serverUuid: '11111111-2222-3333-4444-555555555555',
    t2Anchor: {
      commit: '0ad73c20d1bb204ebfc9aeb8d63cd039a20f99bf',
      path: 'reports/canonical-migration/canonical-npc-crawler-facts-readiness.json',
      sha256: 'sha256:db6e150fdbfe8499ac4453a0d8da2d0a330b62c55c43eff42cf36739841a3bb5',
      readinessLevel: 'T2_CUTOVER_VERIFIED',
    },
    acceptedProjection: {
      path: 'reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-accepted-quarantine-projection.json',
      sha256: 'sha256:2e499d5b089a83f9654828a69113c1994a71d52a026cf6ea377b094be0dec6a4',
    },
    generatedAt: '2026-08-24T08:00:00.000Z',
  };
}

test('builds one exact restore-retire-project proposal and keeps source and local rows read-only', () => {
  assert.equal(typeof subject.buildNpcLootIdentityRestorationProposal, 'function');
  const proposal = subject.buildNpcLootIdentityRestorationProposal(fixture());
  assert.equal(proposal.operationId, 'canonical-npc-loot-identity-restoration');
  assert.deepEqual(proposal.counts, {
    canonicalRelationInserts: 6,
    legacyRelationRetirements: 6,
    projectionReplacements: 6,
    changedPhysicalRows: 18,
  });
  assert.deepEqual(proposal.target.writeTargets, [
    'relation.item_npc_loot_relations.canonical_insert',
    'relation.item_npc_loot_relations.legacy_status_deleted',
    'relation.projection_npcs.loot_items_json',
  ]);
  assert.equal(proposal.readOnlyEvidence.localRows, 12);
  assert.equal(proposal.readOnlyEvidence.maintRows, 6);
  assert.equal(proposal.readOnlyEvidence.sourceFactRows, 6);
  assert.deepEqual(proposal.rows.map((row) => row.canonicalRelation.recordKey), EXPECTED.map((row) => row.canonicalRecordKey));
  assert.deepEqual(proposal.rows.map((row) => row.legacyRelation.recordKey), EXPECTED.map((row) => row.legacyRecordKey));
  for (const row of proposal.rows) {
    const after = row.projection.afterLootItems[row.projection.targetIndex];
    assert.equal(after.relationRecordKey, row.canonicalRelation.recordKey);
    assert.equal(after.sourceFactKey, row.canonicalRelation.sourceFactKey);
    assert.equal(after.sourceProvider, 'terraria.wiki.gg');
  }
});

test('rejects target, authority, projection, and local evidence drift', () => {
  const seventh = fixture();
  seventh.legacyRelationRows.push({ ...seventh.legacyRelationRows[0], record_key: 'f'.repeat(64) });
  assert.throws(
    () => subject.buildNpcLootIdentityRestorationProposal(seventh),
    /legacy relation set count drifted/,
  );

  const itemDrift = fixture();
  itemDrift.acceptedRelationRows[0].itemInternalName = 'WrongItem';
  assert.throws(
    () => subject.buildNpcLootIdentityRestorationProposal(itemDrift),
    /accepted relation CrimsonAxe itemInternalName drifted/,
  );

  const chanceDrift = fixture();
  chanceDrift.acceptedRelationRows[0].chanceText = '1% 1.99%';
  assert.throws(
    () => subject.buildNpcLootIdentityRestorationProposal(chanceDrift),
    /accepted relation CrimsonAxe chanceText drifted/,
  );

  const projectionDrift = fixture();
  const projectionLoot = JSON.parse(projectionDrift.projectionRows[0].loot_items_json);
  projectionLoot[1].relationRecordKey = 'e'.repeat(64);
  projectionDrift.projectionRows[0].loot_items_json = JSON.stringify(projectionLoot);
  assert.throws(
    () => subject.buildNpcLootIdentityRestorationProposal(projectionDrift),
    /projection legacy identity drifted/,
  );

  const landingDrift = fixture();
  landingDrift.landingRow.content_hash = '0'.repeat(64);
  assert.throws(
    () => subject.buildNpcLootIdentityRestorationProposal(landingDrift),
    /canonical landing drifted/,
  );

  const landingDatabaseDrift = fixture();
  landingDatabaseDrift.landingRow.landingDatabase = 'terria_v1_maint';
  assert.throws(
    () => subject.buildNpcLootIdentityRestorationProposal(landingDatabaseDrift),
    /canonical landing drifted/,
  );

  const localDrift = fixture();
  localDrift.localRows.find((row) => row.status === 1).chance_text = '1% 1.99%';
  assert.throws(
    () => subject.buildNpcLootIdentityRestorationProposal(localDrift),
    /local accepted CrimsonAxe chance_text drifted/,
  );
});

test('proposal validation rejects a stale before hash or broadened write target', () => {
  assert.equal(typeof subject.validateNpcLootIdentityRestorationProposal, 'function');
  const proposal = subject.buildNpcLootIdentityRestorationProposal(fixture());
  assert.doesNotThrow(() => subject.validateNpcLootIdentityRestorationProposal(proposal));

  const stale = structuredClone(proposal);
  stale.rows[0].projection.beforeLootItemsSha256 = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => subject.validateNpcLootIdentityRestorationProposal(stale),
    /projection hash drifted/,
  );

  const broad = structuredClone(proposal);
  broad.target.writeTargets.push('local.npc_loot_entries.status_deleted');
  assert.throws(
    () => subject.validateNpcLootIdentityRestorationProposal(broad),
    /proposal target drifted/,
  );
});

test('transaction consumes the permit only after the locked before-state matches', async () => {
  assert.equal(typeof subject.executeNpcLootIdentityRestorationTransaction, 'function');
  const proposal = subject.buildNpcLootIdentityRestorationProposal(fixture());
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  const result = await subject.executeNpcLootIdentityRestorationTransaction({
    connection,
    proposal,
    readBefore: async () => {
      events.push('read-before');
      return { rowsSha256: proposal.before.rowsSha256 };
    },
    consumeDispatchPermit: async () => { events.push('permit'); },
    insertCanonicalRelations: async () => { events.push('insert'); return 6; },
    retireLegacyRelations: async () => { events.push('retire'); return 6; },
    replaceProjectionEntries: async () => { events.push('project'); return 6; },
    readAfter: async () => {
      events.push('read-after');
      return { rowsSha256: proposal.after.rowsSha256 };
    },
  });
  assert.deepEqual(events, [
    'begin', 'read-before', 'permit', 'insert', 'retire', 'project', 'read-after', 'commit',
  ]);
  assert.deepEqual(result.affected, {
    canonicalRelationInserts: 6,
    legacyRelationRetirements: 6,
    projectionReplacements: 6,
  });
});

test('transaction rolls back when any affected-row count drifts', async () => {
  const proposal = subject.buildNpcLootIdentityRestorationProposal(fixture());
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  await assert.rejects(() => subject.executeNpcLootIdentityRestorationTransaction({
    connection,
    proposal,
    readBefore: async () => ({ rowsSha256: proposal.before.rowsSha256 }),
    consumeDispatchPermit: async () => {},
    insertCanonicalRelations: async () => 6,
    retireLegacyRelations: async () => 5,
    replaceProjectionEntries: async () => 6,
    readAfter: async () => ({ rowsSha256: proposal.after.rowsSha256 }),
  }), /legacy retirement affected-row count drifted/);
  assert.deepEqual(events, ['begin', 'rollback']);
});

test('operation registry owns only restore, retire, and projection targets', () => {
  const operationId = 'canonical-npc-loot-identity-restoration';
  assert.ok(CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId));
  assert.equal(
    CANONICAL_OPERATION_ENTRYPOINTS[operationId],
    'pipelines/relation/npc-loot-identity-restoration.mjs',
  );
  assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[operationId], [
    'reports/authorization/canonical/canonical-npc-loot-identity-restoration.retry-01.input.json',
    'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/npc-loot-identity-restoration.proposal.json',
  ]);
  const manifest = buildCanonicalOperationExecutionManifest({ operationId });
  assert.equal(manifest.databaseWrites, true);
  assert.equal(manifest.networkAccess, false);
  assert.deepEqual(manifest.ownershipKeys, [
    'relation.item_npc_loot_relations.canonical_insert',
    'relation.item_npc_loot_relations.legacy_status_deleted',
    'relation.projection_npcs.loot_items_json',
  ]);
});

test('NPC loot authorization preparation uses one immutable retry attempt', () => {
  assert.equal(typeof subject.prepareNpcLootIdentityRestorationAuthorization, 'function');
  assert.match(subject.NPC_LOOT_IDENTITY_RESTORATION_INPUT_PATH, /\.retry-01\.input\.json$/);
  assert.match(subject.NPC_LOOT_IDENTITY_RESTORATION_MANIFEST_PATH, /\.retry-01\.execution-manifest\.json$/);
  assert.match(subject.NPC_LOOT_IDENTITY_RESTORATION_REQUEST_PATH, /\.retry-01\.request\.json$/);
  assert.match(subject.NPC_LOOT_IDENTITY_RESTORATION_RESULT_PATH, /\.retry-01\.result\.json$/);
});

test('authorization input binds the immutable proposal bytes and exact 6/6/6 scope', () => {
  assert.equal(typeof subject.buildNpcLootIdentityRestorationInput, 'function');
  assert.equal(typeof subject.validateNpcLootIdentityRestorationInput, 'function');
  const proposal = subject.buildNpcLootIdentityRestorationProposal(fixture());
  const proposalSha256 = `sha256:${'a'.repeat(64)}`;
  const input = subject.buildNpcLootIdentityRestorationInput({
    proposal,
    proposalPath: 'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/npc-loot-identity-restoration.proposal.json',
    proposalSha256,
  });
  assert.doesNotThrow(() => subject.validateNpcLootIdentityRestorationInput({
    input,
    proposal,
    proposalSha256,
  }));
  assert.deepEqual(input.expectedCounts, {
    canonicalRelationInserts: 6,
    legacyRelationRetirements: 6,
    projectionReplacements: 6,
  });
  const stale = structuredClone(input);
  stale.proposalSha256 = `sha256:${'b'.repeat(64)}`;
  assert.throws(() => subject.validateNpcLootIdentityRestorationInput({
    input: stale,
    proposal,
    proposalSha256,
  }), /input binding drifted/);
});

test('accepted projection extraction returns only the six frozen canonical relations', () => {
  assert.equal(typeof subject.extractNpcLootIdentityAcceptedRelations, 'function');
  const acceptedRelationRows = EXPECTED.map(acceptedRelation);
  const document = {
    operationId: 'canonical-npc-external-relation-scope-apply',
    accepted: {
      lootRelations: [
        { ...acceptedRelationRows[0], recordKey: '0'.repeat(64) },
        ...acceptedRelationRows.toReversed(),
      ],
    },
  };
  assert.deepEqual(
    subject.extractNpcLootIdentityAcceptedRelations(document).map((row) => row.recordKey),
    EXPECTED.map((row) => row.canonicalRecordKey),
  );
  document.accepted.lootRelations.pop();
  assert.throws(
    () => subject.extractNpcLootIdentityAcceptedRelations(document),
    /accepted projection target set drifted/,
  );
});

test('CLI defaults to proposal-only and requires explicit apply=true for mutation mode', () => {
  assert.equal(typeof subject.parseNpcLootIdentityRestorationArgs, 'function');
  assert.deepEqual(subject.parseNpcLootIdentityRestorationArgs([]), {
    apply: false,
    proposalPath: 'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/npc-loot-identity-restoration.proposal.json',
    inputPath: 'reports/authorization/canonical/canonical-npc-loot-identity-restoration.retry-01.input.json',
    resultPath: 'reports/authorization/canonical/canonical-npc-loot-identity-restoration.retry-01.result.json',
  });
  assert.equal(subject.parseNpcLootIdentityRestorationArgs(['--apply=true']).apply, true);
  assert.throws(
    () => subject.parseNpcLootIdentityRestorationArgs(['--apply=yes']),
    /apply must be true or false/,
  );
  assert.throws(
    () => subject.parseNpcLootIdentityRestorationArgs(['--write-db=true']),
    /unknown argument/,
  );
});

test('proposal preparation writes only the proposal artifact', async () => {
  assert.equal(typeof subject.prepareNpcLootIdentityRestorationProposal, 'function');
  const evidence = fixture();
  const writes = [];
  const result = await subject.prepareNpcLootIdentityRestorationProposal({
    repoRoot: '/repo',
    generatedAt: evidence.generatedAt,
    loadEvidence: async () => evidence,
    writeProposal: (_repoRoot, relativePath, value) => writes.push({ relativePath, value }),
  });
  assert.equal(writes.length, 1);
  assert.equal(
    writes[0].relativePath,
    'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/npc-loot-identity-restoration.proposal.json',
  );
  assert.equal(writes[0].value.operationId, 'canonical-npc-loot-identity-restoration');
  assert.equal(result.changedPhysicalRows, 18);
  assert.deepEqual(Object.keys(result.paths), ['proposal']);
});

test('entrypoint routes default mode to proposal and explicit apply mode to the authorized executor', async () => {
  assert.equal(typeof subject.runNpcLootIdentityRestoration, 'function');
  const calls = [];
  assert.equal(await subject.runNpcLootIdentityRestoration({
    argv: [],
    prepare: async () => { calls.push('prepare'); return 'proposal'; },
    apply: async () => { calls.push('apply'); return 'applied'; },
  }), 'proposal');
  assert.equal(await subject.runNpcLootIdentityRestoration({
    argv: ['--apply=true'],
    prepare: async () => { calls.push('prepare'); return 'proposal'; },
    apply: async () => { calls.push('apply'); return 'applied'; },
  }), 'applied');
  assert.deepEqual(calls, ['prepare', 'apply']);
});

test('database writers issue exactly six inserts, retirements, and projection replacements', async () => {
  assert.equal(typeof subject.insertNpcLootIdentityCanonicalRelations, 'function');
  assert.equal(typeof subject.retireNpcLootIdentityLegacyRelations, 'function');
  assert.equal(typeof subject.replaceNpcLootIdentityProjectionEntries, 'function');
  const proposal = subject.buildNpcLootIdentityRestorationProposal(fixture());
  const statements = [];
  const connection = {
    async execute(sql, values) {
      statements.push({ sql, values });
      return [{ affectedRows: 1 }];
    },
  };
  assert.equal(await subject.insertNpcLootIdentityCanonicalRelations(connection, proposal.rows), 6);
  assert.equal(await subject.retireNpcLootIdentityLegacyRelations(connection, proposal.rows), 6);
  assert.equal(await subject.replaceNpcLootIdentityProjectionEntries(connection, proposal.rows), 6);
  assert.equal(statements.filter((entry) => entry.sql.startsWith('INSERT INTO')).length, 6);
  assert.equal(statements.filter((entry) => entry.sql.startsWith('UPDATE') && entry.sql.includes('item_npc_loot_relations')).length, 6);
  assert.equal(statements.filter((entry) => entry.sql.startsWith('UPDATE') && entry.sql.includes('projection_npcs')).length, 6);
});

test('authorized apply binds proposal, server fingerprint, transaction, and terminal result', async () => {
  assert.equal(typeof subject.applyNpcLootIdentityRestoration, 'function');
  const proposal = subject.buildNpcLootIdentityRestorationProposal(fixture());
  const proposalSha256 = `sha256:${'a'.repeat(64)}`;
  const input = subject.buildNpcLootIdentityRestorationInput({ proposal, proposalSha256 });
  const calls = [];
  const result = await subject.applyNpcLootIdentityRestoration({
    repoRoot: '/repo',
    now: '2026-08-24T08:30:00.000Z',
    readArtifact: (_root, relativePath) => relativePath.endsWith('.input.json') ? input : proposal,
    hashArtifact: () => proposalSha256,
    loadContext: () => ({ decisionIdentity: 'owner-npc-loot-01', packetHash: `sha256:${'b'.repeat(64)}` }),
    assertDataBundle: () => calls.push('bundle'),
    loadFingerprint: () => ({ serverUuid: proposal.serverFingerprint.serverUuid }),
    mysqlModule: {
      async createConnection() { return { async end() { calls.push('end'); } }; },
    },
    readServerUuid: async () => proposal.serverFingerprint.serverUuid,
    executeTransaction: async (options) => {
      calls.push('transaction');
      assert.equal(options.proposal.scopeSha256, proposal.scopeSha256);
      return {
        transactionCommitted: true,
        affected: {
          canonicalRelationInserts: 6,
          legacyRelationRetirements: 6,
          projectionReplacements: 6,
        },
        afterRowsSha256: proposal.after.rowsSha256,
      };
    },
    writeResult: (_root, relativePath, value) => {
      calls.push('result');
      assert.equal(relativePath, 'reports/authorization/canonical/canonical-npc-loot-identity-restoration.retry-01.result.json');
      assert.equal(value.status, 'COMPLETED');
    },
  });
  assert.deepEqual(calls, ['bundle', 'transaction', 'result', 'end']);
  assert.deepEqual(result.affected, {
    canonicalRelationInserts: 6,
    legacyRelationRetirements: 6,
    projectionReplacements: 6,
  });
});
