#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import {
  buildCanonicalAuthorizationRequestForOperation,
} from '../automation/build-canonical-cutover-authorization.mjs';
import {
  buildCanonicalOperationExecutionManifest,
  writeCanonicalOperationExecutionManifest,
} from '../automation/canonical-operation-execution-manifest.mjs';
import { FORMAL_DATABASES, canonicalServerFingerprint } from '../automation/automation-database-contract.mjs';
import { canonicalizePolicySet } from '../automation/policy-set-hash.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';

export const NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID =
  'canonical-npc-loot-identity-restoration';

export const NPC_LOOT_IDENTITY_RESTORATION_PROPOSAL_PATH =
  'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/npc-loot-identity-restoration.proposal.json';
export const NPC_LOOT_IDENTITY_RESTORATION_INPUT_PATH =
  'reports/authorization/canonical/canonical-npc-loot-identity-restoration.retry-01.input.json';
export const NPC_LOOT_IDENTITY_RESTORATION_MANIFEST_PATH =
  'reports/authorization/canonical/canonical-npc-loot-identity-restoration.retry-01.execution-manifest.json';
export const NPC_LOOT_IDENTITY_RESTORATION_REQUEST_PATH =
  'reports/authorization/canonical/canonical-npc-loot-identity-restoration.retry-01.request.json';
export const NPC_LOOT_IDENTITY_RESTORATION_RESULT_PATH =
  'reports/authorization/canonical/canonical-npc-loot-identity-restoration.retry-01.result.json';

export const NPC_LOOT_IDENTITY_RESTORATION_WRITE_TARGETS = Object.freeze([
  'relation.item_npc_loot_relations.canonical_insert',
  'relation.item_npc_loot_relations.legacy_status_deleted',
  'relation.projection_npcs.loot_items_json',
]);

const T2_ANCHOR = Object.freeze({
  commit: '0ad73c20d1bb204ebfc9aeb8d63cd039a20f99bf',
  path: 'reports/canonical-migration/canonical-npc-crawler-facts-readiness.json',
  sha256: 'sha256:db6e150fdbfe8499ac4453a0d8da2d0a330b62c55c43eff42cf36739841a3bb5',
  readinessLevel: 'T2_CUTOVER_VERIFIED',
});

const ACCEPTED_PROJECTION = Object.freeze({
  path: 'reports/runtime/local-data-chain-closure/20260819/npc-external-relation-scope-accepted-quarantine-projection.json',
  sha256: 'sha256:2e499d5b089a83f9654828a69113c1994a71d52a026cf6ea377b094be0dec6a4',
});

const CANONICAL_LINEAGE = Object.freeze({
  landingDatabase: 'terria_v1_local',
  landingProvider: 'terrapedia.generated',
  landingSourceId: 12474,
  landingSourceKey: 'generated.npc_item_relations_bundle',
  landingContentHash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
  sourceProvider: 'terraria.wiki.gg',
  sourceMaintTable: 'maint_item_sources',
});

const LEGACY_LINEAGE = Object.freeze({
  landingSourceId: 6180,
  landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
  landingContentHash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
  sourceProvider: 'wiki_gg',
  sourceMaintTable: 'maint_item_sources',
});

const RELATION_INSERT_COLUMNS = Object.freeze([
  'record_key',
  'source_fact_key',
  'item_internal_name',
  'item_name',
  'npc_source_id',
  'npc_internal_name',
  'npc_name',
  'quantity_min',
  'quantity_max',
  'quantity_text',
  'chance_value',
  'chance_text',
  'conditions',
  'condition_source_text',
  'condition_parse_status',
  'condition_biome_code',
  'condition_game_period_code',
  'condition_time_code',
  'condition_weather_code',
  'condition_events_json',
  'special_flags_json',
  'source_maint_table',
  'source_maint_record_key',
  'source_maint_id',
  'landing_source_id',
  'landing_source_key',
  'landing_content_hash',
  'source_provider',
  'source_page',
  'source_revision_timestamp',
  'confidence',
  'reason',
  'review_status',
  'raw_json',
  'status',
  'deleted',
]);

export const NPC_LOOT_IDENTITY_RESTORATION_TARGETS = Object.freeze([
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

export function buildNpcLootIdentityRestorationProposal({
  landingRow,
  maintRows = [],
  sourceFactRows = [],
  acceptedRelationRows = [],
  legacyRelationRows = [],
  canonicalRelationRows = [],
  projectionRows = [],
  localRows = [],
  serverUuid,
  t2Anchor,
  acceptedProjection,
  generatedAt = new Date().toISOString(),
} = {}) {
  assertUuid(serverUuid);
  assertGeneratedAt(generatedAt);
  assertExactObject(t2Anchor, T2_ANCHOR, 'NPC loot T2 anchor');
  assertExactObject(acceptedProjection, ACCEPTED_PROJECTION, 'NPC loot accepted projection');
  assertLanding(landingRow);
  assertExactLength(canonicalRelationRows, 0, 'canonical relation before-set');
  assertExactLength(maintRows, 6, 'maint source set');
  assertExactLength(sourceFactRows, 6, 'source fact set');
  assertExactLength(acceptedRelationRows, 6, 'accepted relation evidence set');
  assertExactLength(legacyRelationRows, 6, 'legacy relation set');
  assertExactLength(projectionRows, 6, 'projection set');
  assertExactLength(localRows, 12, 'local evidence set');

  const maintByKey = keyed(maintRows, 'record_key', 'maint source');
  const factByKey = keyed(sourceFactRows, 'record_key', 'source fact');
  const acceptedByKey = keyed(acceptedRelationRows, 'recordKey', 'accepted relation');
  const legacyByKey = keyed(legacyRelationRows, 'record_key', 'legacy relation');
  const projectionById = keyed(projectionRows, 'id', 'projection', Number);
  const rows = NPC_LOOT_IDENTITY_RESTORATION_TARGETS.map((target) => {
    const maint = maintByKey.get(target.canonicalSourceMaintRecordKey);
    const sourceFact = factByKey.get(target.canonicalSourceFactKey);
    const accepted = acceptedByKey.get(target.canonicalRecordKey);
    const legacy = legacyByKey.get(target.legacyRecordKey);
    const projection = projectionById.get(target.projectionId);
    assertMaint(target, maint);
    assertSourceFact(target, sourceFact);
    assertAcceptedRelation(target, accepted);
    assertLegacyRelation(target, legacy);
    const localEvidence = assertLocalEvidence(target, localRows);
    const projectionChange = buildProjectionChange(target, accepted, projection);
    const canonicalRelation = {
      ...stableValue(accepted),
      sourceMaintId: target.maintId,
      landingSourceId: CANONICAL_LINEAGE.landingSourceId,
      landingSourceKey: CANONICAL_LINEAGE.landingSourceKey,
      landingContentHash: CANONICAL_LINEAGE.landingContentHash,
      status: 1,
      deleted: 0,
    };
    return {
      npcInternalName: target.npcInternalName,
      itemInternalName: target.itemInternalName,
      canonicalRelation,
      legacyRelation: {
        id: Number(legacy.id),
        recordKey: legacy.record_key,
        sourceFactKey: legacy.source_fact_key,
        sourceMaintRecordKey: legacy.source_maint_record_key,
        sourceMaintId: Number(legacy.source_maint_id),
        landingSourceId: Number(legacy.landing_source_id),
        landingSourceKey: legacy.landing_source_key,
        landingContentHash: legacy.landing_content_hash,
        sourceProvider: legacy.source_provider,
        beforeStatus: 1,
        beforeDeleted: 0,
        afterStatus: 0,
        afterDeleted: 1,
      },
      projection: projectionChange,
      localEvidence,
    };
  });

  const beforeState = rows.map((row) => ({
    canonicalRecordKey: row.canonicalRelation.recordKey,
    canonicalPresent: false,
    legacyRelation: row.legacyRelation,
    projectionId: row.projection.projectionId,
    projectionBeforeSha256: row.projection.beforeLootItemsSha256,
  }));
  const afterState = rows.map((row) => ({
    canonicalRelation: row.canonicalRelation,
    legacyRecordKey: row.legacyRelation.recordKey,
    legacyStatus: row.legacyRelation.afterStatus,
    legacyDeleted: row.legacyRelation.afterDeleted,
    projectionId: row.projection.projectionId,
    projectionAfterSha256: row.projection.afterLootItemsSha256,
  }));
  const proposal = {
    schemaVersion: 1,
    proposalKind: 'canonical_npc_loot_identity_restoration',
    operationId: NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID,
    generatedAt,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    ownerCapability: 'npcs',
    authorities: {
      t2Anchor: stableValue(t2Anchor),
      acceptedProjection: stableValue(acceptedProjection),
      landing: stableValue(landingRow),
    },
    serverFingerprint: {
      serverUuid,
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    target: {
      database: 'terria_v1_relation',
      writeTargets: [...NPC_LOOT_IDENTITY_RESTORATION_WRITE_TARGETS],
      mutationMode: 'insert-canonical-retire-legacy-replace-projection',
    },
    counts: {
      canonicalRelationInserts: 6,
      legacyRelationRetirements: 6,
      projectionReplacements: 6,
      changedPhysicalRows: 18,
    },
    readOnlyEvidence: {
      localRows: localRows.length,
      localRowsSha256: hashJson(normalizeRows(localRows)),
      maintRows: maintRows.length,
      maintRowsSha256: hashJson(normalizeRows(maintRows)),
      sourceFactRows: sourceFactRows.length,
      sourceFactRowsSha256: hashJson(normalizeRows(sourceFactRows)),
      landingRows: 1,
      sourceFactsTargeted: 0,
      sourceDetailsTargeted: 0,
      maintRowsTargeted: 0,
      landingRowsTargeted: 0,
      localRowsTargeted: 0,
    },
    before: { rowsSha256: hashJson(beforeState) },
    after: { rowsSha256: hashJson(afterState) },
    rows,
  };
  proposal.scopeSha256 = hashJson(scopePayload(proposal));
  validateNpcLootIdentityRestorationProposal(proposal);
  return proposal;
}

export function validateNpcLootIdentityRestorationProposal(proposal) {
  if (proposal?.schemaVersion !== 1
      || proposal.proposalKind !== 'canonical_npc_loot_identity_restoration'
      || proposal.operationId !== NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID) {
    throw new Error('NPC loot restoration proposal identity is invalid');
  }
  if (proposal.applyAllowed !== false || proposal.databaseWrites !== false
      || proposal.externalRequests !== false || proposal.ownerCapability !== 'npcs') {
    throw new Error('NPC loot restoration proposal safety flags are invalid');
  }
  if (proposal.target?.database !== 'terria_v1_relation'
      || proposal.target?.mutationMode !== 'insert-canonical-retire-legacy-replace-projection'
      || JSON.stringify(proposal.target?.writeTargets)
        !== JSON.stringify(NPC_LOOT_IDENTITY_RESTORATION_WRITE_TARGETS)) {
    throw new Error('NPC loot restoration proposal target drifted');
  }
  const counts = proposal.counts;
  if (Number(counts?.canonicalRelationInserts) !== 6
      || Number(counts?.legacyRelationRetirements) !== 6
      || Number(counts?.projectionReplacements) !== 6
      || Number(counts?.changedPhysicalRows) !== 18
      || !Array.isArray(proposal.rows)
      || proposal.rows.length !== 6) {
    throw new Error('NPC loot restoration proposal counts drifted');
  }
  assertExactObject(proposal.authorities?.t2Anchor, T2_ANCHOR, 'NPC loot T2 anchor');
  assertExactObject(
    proposal.authorities?.acceptedProjection,
    ACCEPTED_PROJECTION,
    'NPC loot accepted projection',
  );
  assertLanding(proposal.authorities?.landing);
  if (Number(proposal.readOnlyEvidence?.localRows) !== 12
      || Number(proposal.readOnlyEvidence?.maintRows) !== 6
      || Number(proposal.readOnlyEvidence?.sourceFactRows) !== 6
      || Number(proposal.readOnlyEvidence?.landingRows) !== 1
      || Number(proposal.readOnlyEvidence?.sourceFactsTargeted) !== 0
      || Number(proposal.readOnlyEvidence?.sourceDetailsTargeted) !== 0
      || Number(proposal.readOnlyEvidence?.maintRowsTargeted) !== 0
      || Number(proposal.readOnlyEvidence?.landingRowsTargeted) !== 0
      || Number(proposal.readOnlyEvidence?.localRowsTargeted) !== 0) {
    throw new Error('NPC loot restoration read-only evidence drifted');
  }
  for (let index = 0; index < NPC_LOOT_IDENTITY_RESTORATION_TARGETS.length; index += 1) {
    const target = NPC_LOOT_IDENTITY_RESTORATION_TARGETS[index];
    const row = proposal.rows[index];
    assertFields(row, {
      npcInternalName: target.npcInternalName,
      itemInternalName: target.itemInternalName,
    }, `NPC loot restoration row ${index}`);
    assertFields(row.canonicalRelation, {
      recordKey: target.canonicalRecordKey,
      sourceFactKey: target.canonicalSourceFactKey,
      sourceMaintRecordKey: target.canonicalSourceMaintRecordKey,
      sourceMaintId: target.maintId,
      landingSourceId: CANONICAL_LINEAGE.landingSourceId,
      landingSourceKey: CANONICAL_LINEAGE.landingSourceKey,
      landingContentHash: CANONICAL_LINEAGE.landingContentHash,
      sourceProvider: CANONICAL_LINEAGE.sourceProvider,
      npcInternalName: target.npcInternalName,
      itemInternalName: target.itemInternalName,
      quantityText: '1',
      chanceText: target.chanceText,
      status: 1,
      deleted: 0,
    }, `NPC loot canonical proposal row ${target.npcInternalName}`);
    assertFields(row.legacyRelation, {
      recordKey: target.legacyRecordKey,
      sourceFactKey: target.legacySourceFactKey,
      sourceMaintRecordKey: target.legacySourceMaintRecordKey,
      landingSourceId: LEGACY_LINEAGE.landingSourceId,
      landingSourceKey: LEGACY_LINEAGE.landingSourceKey,
      landingContentHash: LEGACY_LINEAGE.landingContentHash,
      sourceProvider: LEGACY_LINEAGE.sourceProvider,
      beforeStatus: 1,
      beforeDeleted: 0,
      afterStatus: 0,
      afterDeleted: 1,
    }, `NPC loot legacy proposal row ${target.npcInternalName}`);
    const projection = row.projection;
    if (Number(projection?.projectionId) !== target.projectionId
        || projection?.projectionInternalName !== target.npcInternalName
        || !Array.isArray(projection.beforeLootItems)
        || !Array.isArray(projection.afterLootItems)
        || projection.beforeLootItems.length !== projection.afterLootItems.length
        || projection.beforeLootItemsSha256 !== hashJson(projection.beforeLootItems)
        || projection.afterLootItemsSha256 !== hashJson(projection.afterLootItems)) {
      throw new Error(`NPC loot restoration projection hash drifted: ${target.npcInternalName}`);
    }
    const afterEntry = projection.afterLootItems[projection.targetIndex];
    assertFields(afterEntry, {
      itemInternalName: target.itemInternalName,
      chanceText: target.chanceText,
      quantityText: '1',
      sourceFactKey: target.canonicalSourceFactKey,
      relationRecordKey: target.canonicalRecordKey,
      sourceProvider: CANONICAL_LINEAGE.sourceProvider,
      sourcePage: target.sourcePage,
    }, `NPC loot restoration projection after ${target.npcInternalName}`);
    if (row.localEvidence?.mutation !== 'none') {
      throw new Error(`NPC loot restoration local mutation drifted: ${target.npcInternalName}`);
    }
  }
  const beforeState = proposal.rows.map((row) => ({
    canonicalRecordKey: row.canonicalRelation.recordKey,
    canonicalPresent: false,
    legacyRelation: row.legacyRelation,
    projectionId: row.projection.projectionId,
    projectionBeforeSha256: row.projection.beforeLootItemsSha256,
  }));
  const afterState = proposal.rows.map((row) => ({
    canonicalRelation: row.canonicalRelation,
    legacyRecordKey: row.legacyRelation.recordKey,
    legacyStatus: row.legacyRelation.afterStatus,
    legacyDeleted: row.legacyRelation.afterDeleted,
    projectionId: row.projection.projectionId,
    projectionAfterSha256: row.projection.afterLootItemsSha256,
  }));
  if (proposal.before?.rowsSha256 !== hashJson(beforeState)
      || proposal.after?.rowsSha256 !== hashJson(afterState)
      || proposal.scopeSha256 !== hashJson(scopePayload(proposal))) {
    throw new Error('NPC loot restoration proposal hash drifted');
  }
  return true;
}

export function buildNpcLootIdentityRestorationInput({
  proposal,
  proposalPath = NPC_LOOT_IDENTITY_RESTORATION_PROPOSAL_PATH,
  proposalSha256,
} = {}) {
  validateNpcLootIdentityRestorationProposal(proposal);
  if (!isHash(proposalSha256)) {
    throw new Error('NPC loot restoration proposal byte hash is invalid');
  }
  return {
    schemaVersion: 1,
    operationId: NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    proposalPath,
    proposalSha256,
    scopeSha256: proposal.scopeSha256,
    beforeRowsSha256: proposal.before.rowsSha256,
    afterRowsSha256: proposal.after.rowsSha256,
    expectedCounts: {
      canonicalRelationInserts: 6,
      legacyRelationRetirements: 6,
      projectionReplacements: 6,
    },
    writeTargets: [...NPC_LOOT_IDENTITY_RESTORATION_WRITE_TARGETS],
  };
}

export function validateNpcLootIdentityRestorationInput({ input, proposal, proposalSha256 } = {}) {
  validateNpcLootIdentityRestorationProposal(proposal);
  const counts = input?.expectedCounts;
  if (input?.schemaVersion !== 1
      || input.operationId !== NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID
      || input.apply !== true
      || input.databaseWrites !== true
      || input.externalRequests !== false) {
    throw new Error('NPC loot restoration input identity or safety flags are invalid');
  }
  if (input.proposalPath !== NPC_LOOT_IDENTITY_RESTORATION_PROPOSAL_PATH
      || input.proposalSha256 !== proposalSha256
      || !isHash(proposalSha256)
      || input.scopeSha256 !== proposal.scopeSha256
      || input.beforeRowsSha256 !== proposal.before.rowsSha256
      || input.afterRowsSha256 !== proposal.after.rowsSha256
      || Number(counts?.canonicalRelationInserts) !== 6
      || Number(counts?.legacyRelationRetirements) !== 6
      || Number(counts?.projectionReplacements) !== 6
      || JSON.stringify(input.writeTargets)
        !== JSON.stringify(NPC_LOOT_IDENTITY_RESTORATION_WRITE_TARGETS)) {
    throw new Error('NPC loot restoration input binding drifted');
  }
  return true;
}

export function extractNpcLootIdentityAcceptedRelations(document) {
  if (document?.operationId !== 'canonical-npc-external-relation-scope-apply'
      || !Array.isArray(document?.accepted?.lootRelations)) {
    throw new Error('NPC loot accepted projection contract is invalid');
  }
  const byKey = keyed(document.accepted.lootRelations, 'recordKey', 'accepted projection relation');
  const rows = NPC_LOOT_IDENTITY_RESTORATION_TARGETS.map((target) => byKey.get(target.canonicalRecordKey));
  if (rows.some((row) => !row)) {
    throw new Error('NPC loot accepted projection target set drifted');
  }
  return rows;
}

export function parseNpcLootIdentityRestorationArgs(argv) {
  const values = {};
  for (const token of argv) {
    if (!String(token).startsWith('--')) throw new Error(`unknown argument: ${token}`);
    const [key, ...parts] = String(token).slice(2).split('=');
    if (!['apply', 'proposal', 'input', 'output'].includes(key)) {
      throw new Error(`unknown argument: --${key}`);
    }
    values[key] = parts.join('=') || 'true';
  }
  if (values.apply != null && !['true', 'false'].includes(values.apply)) {
    throw new Error('apply must be true or false');
  }
  return {
    apply: values.apply === 'true',
    proposalPath: values.proposal ?? NPC_LOOT_IDENTITY_RESTORATION_PROPOSAL_PATH,
    inputPath: values.input ?? NPC_LOOT_IDENTITY_RESTORATION_INPUT_PATH,
    resultPath: values.output ?? NPC_LOOT_IDENTITY_RESTORATION_RESULT_PATH,
  };
}

export async function prepareNpcLootIdentityRestorationProposal({
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
  mysqlModule,
  loadEvidence = loadNpcLootIdentityRestorationEvidence,
  writeProposal = writePrivateJson,
} = {}) {
  const root = path.resolve(repoRoot);
  const evidence = await loadEvidence({ repoRoot: root, generatedAt, mysqlModule });
  const proposal = buildNpcLootIdentityRestorationProposal({
    ...evidence,
    generatedAt,
  });
  writeProposal(root, NPC_LOOT_IDENTITY_RESTORATION_PROPOSAL_PATH, proposal);
  return {
    operationId: NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID,
    changedPhysicalRows: proposal.counts.changedPhysicalRows,
    scopeSha256: proposal.scopeSha256,
    proposalSha256: hashJsonFileBytes(proposal),
    paths: { proposal: NPC_LOOT_IDENTITY_RESTORATION_PROPOSAL_PATH },
  };
}

export async function prepareNpcLootIdentityRestorationAuthorization({
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  assertFreshAuthorizationPaths(root);
  const proposal = readJson(root, NPC_LOOT_IDENTITY_RESTORATION_PROPOSAL_PATH);
  validateNpcLootIdentityRestorationProposal(proposal);
  const proposalSha256 = hashFile(root, NPC_LOOT_IDENTITY_RESTORATION_PROPOSAL_PATH);
  const input = buildNpcLootIdentityRestorationInput({ proposal, proposalSha256 });
  writePrivateJson(root, NPC_LOOT_IDENTITY_RESTORATION_INPUT_PATH, input);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: root,
    operationId: NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID,
    artifactDate: generatedAt.slice(0, 10),
  });
  writeCanonicalOperationExecutionManifest({
    repoRoot: root,
    outputPath: path.resolve(root, NPC_LOOT_IDENTITY_RESTORATION_MANIFEST_PATH),
    operationId: NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID,
    artifactDate: generatedAt.slice(0, 10),
  });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  let policyRows;
  try {
    policyRows = canonicalizePolicySet(await readRows(connection,
      'SELECT p.domain_id AS domainId, p.current_version AS policyVersion, '
        + 'pv.policy_hash AS policyHash FROM terria_v1_local.crawler_automation_policy p '
        + 'JOIN terria_v1_local.crawler_automation_policy_version pv ON pv.domain_id=p.domain_id '
        + 'AND pv.policy_version=p.current_version ORDER BY p.domain_id'));
    if (policyRows.length === 0) throw new Error('NPC loot restoration automation policy rows are missing');
  } finally {
    await connection.end();
  }
  const options = connectionOptions(root);
  const request = buildCanonicalAuthorizationRequestForOperation({
    repoRoot: root,
    operationId: NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID,
    serverFingerprint: canonicalServerFingerprint({
      host: options.host,
      port: options.port,
      serverUuid: proposal.serverFingerprint.serverUuid,
      databases: Object.values(FORMAL_DATABASES),
    }),
    policyRows,
    executionManifest: manifest,
    generatedAt,
    expiresAt: new Date(Date.parse(generatedAt) + 24 * 60 * 60 * 1000).toISOString(),
  });
  writePrivateJson(root, NPC_LOOT_IDENTITY_RESTORATION_REQUEST_PATH, request);
  return {
    operationId: NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID,
    proposalSha256,
    scopeSha256: proposal.scopeSha256,
    paths: {
      input: NPC_LOOT_IDENTITY_RESTORATION_INPUT_PATH,
      manifest: NPC_LOOT_IDENTITY_RESTORATION_MANIFEST_PATH,
      request: NPC_LOOT_IDENTITY_RESTORATION_REQUEST_PATH,
      result: NPC_LOOT_IDENTITY_RESTORATION_RESULT_PATH,
    },
  };
}

export async function runNpcLootIdentityRestoration({
  argv = process.argv.slice(2),
  repoRoot = process.cwd(),
  prepare = prepareNpcLootIdentityRestorationProposal,
  apply = applyNpcLootIdentityRestoration,
} = {}) {
  const args = parseNpcLootIdentityRestorationArgs(argv);
  return args.apply
    ? apply({
        repoRoot,
        proposalPath: args.proposalPath,
        inputPath: args.inputPath,
        resultPath: args.resultPath,
      })
    : prepare({ repoRoot });
}

export async function applyNpcLootIdentityRestoration({
  repoRoot = process.cwd(),
  proposalPath = NPC_LOOT_IDENTITY_RESTORATION_PROPOSAL_PATH,
  inputPath = NPC_LOOT_IDENTITY_RESTORATION_INPUT_PATH,
  resultPath = NPC_LOOT_IDENTITY_RESTORATION_RESULT_PATH,
  now = new Date().toISOString(),
  mysqlModule,
  readArtifact = readJson,
  hashArtifact = hashFile,
  loadContext = loadAuthorizedOperationContext,
  assertDataBundle = assertAuthorizedOperationDataBundle,
  loadFingerprint = loadAuthorizedOperationServerFingerprint,
  readServerUuid = readDatabaseServerUuid,
  executeTransaction = executeNpcLootIdentityRestorationTransaction,
  writeResult = writePrivateJson,
} = {}) {
  const root = path.resolve(repoRoot);
  const proposal = readArtifact(root, proposalPath);
  const input = readArtifact(root, inputPath);
  const proposalSha256 = hashArtifact(root, proposalPath);
  validateNpcLootIdentityRestorationInput({ input, proposal, proposalSha256 });
  const context = loadContext({
    operationId: NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID,
    now,
  });
  assertDataBundle({ repoRoot: root, authorizedContext: context });
  const fingerprint = loadFingerprint({ authorizedContext: context });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  try {
    const serverUuid = await readServerUuid(connection);
    if (serverUuid !== proposal.serverFingerprint.serverUuid
        || serverUuid !== fingerprint.serverUuid) {
      throw new Error('NPC loot restoration database fingerprint drifted');
    }
    const transaction = await executeTransaction({
      connection,
      proposal,
      readBefore: readNpcLootIdentityBeforeState,
      consumeDispatchPermit: () => consumeAuthorizedOperationDispatchPermit({
        authorizedContext: context,
        decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'),
      }),
      insertCanonicalRelations: insertNpcLootIdentityCanonicalRelations,
      retireLegacyRelations: retireNpcLootIdentityLegacyRelations,
      replaceProjectionEntries: replaceNpcLootIdentityProjectionEntries,
      readAfter: readNpcLootIdentityAfterState,
    });
    const result = {
      schemaVersion: 1,
      resultKind: 'canonical_npc_loot_identity_restoration_result',
      operationId: NPC_LOOT_IDENTITY_RESTORATION_OPERATION_ID,
      status: 'COMPLETED',
      transactionCommitted: transaction.transactionCommitted,
      affected: transaction.affected,
      scopeSha256: proposal.scopeSha256,
      afterRowsSha256: transaction.afterRowsSha256,
      authorization: {
        decisionIdentity: context.decisionIdentity,
        packetHash: context.packetHash,
      },
      completedAt: now,
    };
    writeResult(root, resultPath, result);
    return result;
  } finally {
    await connection.end();
  }
}

export async function insertNpcLootIdentityCanonicalRelations(connection, rows) {
  const sql = `INSERT INTO terria_v1_relation.item_npc_loot_relations
    (${RELATION_INSERT_COLUMNS.map((column) => `\`${column}\``).join(', ')})
    VALUES (${RELATION_INSERT_COLUMNS.map(() => '?').join(', ')})`;
  let affected = 0;
  for (const row of rows) {
    const values = RELATION_INSERT_COLUMNS.map((column) => relationInsertValue(
      row.canonicalRelation,
      column,
    ));
    const [result] = await connection.execute(sql, values);
    affected += Number(result?.affectedRows ?? 0);
  }
  return affected;
}

export async function retireNpcLootIdentityLegacyRelations(connection, rows) {
  const sql = `UPDATE terria_v1_relation.item_npc_loot_relations
    SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP
    WHERE record_key = ? AND source_fact_key = ? AND source_maint_record_key = ?
      AND source_maint_id = ? AND landing_source_id = ? AND landing_source_key = ?
      AND landing_content_hash = ? AND source_provider = ? AND status = 1 AND deleted = 0`;
  let affected = 0;
  for (const row of rows) {
    const legacy = row.legacyRelation;
    const [result] = await connection.execute(sql, [
      legacy.recordKey,
      legacy.sourceFactKey,
      legacy.sourceMaintRecordKey,
      legacy.sourceMaintId,
      legacy.landingSourceId,
      legacy.landingSourceKey,
      legacy.landingContentHash,
      legacy.sourceProvider,
    ]);
    affected += Number(result?.affectedRows ?? 0);
  }
  return affected;
}

export async function replaceNpcLootIdentityProjectionEntries(connection, rows) {
  const sql = `UPDATE terria_v1_relation.projection_npcs
    SET loot_items_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND internal_name = ? AND status = 1 AND deleted = 0`;
  let affected = 0;
  for (const row of rows) {
    const projection = row.projection;
    const [result] = await connection.execute(sql, [
      JSON.stringify(projection.afterLootItems),
      projection.projectionId,
      projection.projectionInternalName,
    ]);
    affected += Number(result?.affectedRows ?? 0);
  }
  return affected;
}

export async function readNpcLootIdentityBeforeState(connection, proposal) {
  const { relations, projections } = await readLockedTargets(connection, proposal);
  const canonicalKeys = new Set(proposal.rows.map((row) => row.canonicalRelation.recordKey));
  const legacyByKey = new Map(relations
    .filter((row) => !canonicalKeys.has(row.record_key))
    .map((row) => [row.record_key, row]));
  if (relations.some((row) => canonicalKeys.has(row.record_key)) || legacyByKey.size !== 6) {
    throw new Error('NPC loot restoration relation before-set drifted');
  }
  const projectionById = new Map(projections.map((row) => [Number(row.id), row]));
  for (let index = 0; index < NPC_LOOT_IDENTITY_RESTORATION_TARGETS.length; index += 1) {
    const target = NPC_LOOT_IDENTITY_RESTORATION_TARGETS[index];
    assertLegacyRelation(target, legacyByKey.get(target.legacyRecordKey));
    const projection = projectionById.get(target.projectionId);
    if (!projection || projection.internal_name !== target.npcInternalName
        || Number(projection.status) !== 1 || Number(projection.deleted) !== 0
        || hashJson(parseJsonArray(projection.loot_items_json, target.npcInternalName))
          !== proposal.rows[index].projection.beforeLootItemsSha256) {
      throw new Error(`NPC loot restoration projection before-set drifted: ${target.npcInternalName}`);
    }
  }
  await assertLockedReadOnlyEvidence(connection, proposal);
  return { rowsSha256: proposal.before.rowsSha256 };
}

export async function readNpcLootIdentityAfterState(connection, proposal) {
  const { relations, projections } = await readLockedTargets(connection, proposal);
  if (relations.length !== 12 || projections.length !== 6) {
    throw new Error('NPC loot restoration after target set drifted');
  }
  const relationByKey = new Map(relations.map((row) => [row.record_key, row]));
  const projectionById = new Map(projections.map((row) => [Number(row.id), row]));
  for (let index = 0; index < NPC_LOOT_IDENTITY_RESTORATION_TARGETS.length; index += 1) {
    const target = NPC_LOOT_IDENTITY_RESTORATION_TARGETS[index];
    const expected = proposal.rows[index];
    const canonical = relationByKey.get(target.canonicalRecordKey);
    assertCanonicalReadback(target, canonical);
    const legacy = relationByKey.get(target.legacyRecordKey);
    if (!legacy || Number(legacy.status) !== 0 || Number(legacy.deleted) !== 1
        || legacy.source_fact_key !== target.legacySourceFactKey
        || legacy.source_maint_record_key !== target.legacySourceMaintRecordKey) {
      throw new Error(`NPC loot restoration legacy readback drifted: ${target.npcInternalName}`);
    }
    const projection = projectionById.get(target.projectionId);
    if (!projection || projection.internal_name !== target.npcInternalName
        || Number(projection.status) !== 1 || Number(projection.deleted) !== 0
        || hashJson(parseJsonArray(projection.loot_items_json, target.npcInternalName))
          !== expected.projection.afterLootItemsSha256) {
      throw new Error(`NPC loot restoration projection readback drifted: ${target.npcInternalName}`);
    }
  }
  return { rowsSha256: proposal.after.rowsSha256 };
}

export async function loadNpcLootIdentityRestorationEvidence({
  repoRoot = process.cwd(),
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const t2Bytes = execFileSync('git', ['show', `${T2_ANCHOR.commit}:${T2_ANCHOR.path}`], {
    cwd: root,
    encoding: null,
    maxBuffer: 10 * 1024 * 1024,
  });
  const t2Sha256 = hashBytes(t2Bytes);
  const t2Document = JSON.parse(t2Bytes.toString('utf8'));
  if (t2Sha256 !== T2_ANCHOR.sha256 || t2Document.readinessLevel !== T2_ANCHOR.readinessLevel) {
    throw new Error('NPC loot immutable T2 anchor drifted');
  }
  const acceptedPath = confinedPath(root, ACCEPTED_PROJECTION.path, 'NPC loot accepted projection');
  const acceptedBytes = fs.readFileSync(acceptedPath);
  if (hashBytes(acceptedBytes) !== ACCEPTED_PROJECTION.sha256) {
    throw new Error('NPC loot accepted projection byte hash drifted');
  }
  const acceptedRelationRows = extractNpcLootIdentityAcceptedRelations(
    JSON.parse(acceptedBytes.toString('utf8')),
  );
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const maintKeys = NPC_LOOT_IDENTITY_RESTORATION_TARGETS
      .map((target) => target.canonicalSourceMaintRecordKey);
    const factKeys = NPC_LOOT_IDENTITY_RESTORATION_TARGETS
      .map((target) => target.canonicalSourceFactKey);
    const canonicalKeys = NPC_LOOT_IDENTITY_RESTORATION_TARGETS
      .map((target) => target.canonicalRecordKey);
    const legacyKeys = NPC_LOOT_IDENTITY_RESTORATION_TARGETS
      .map((target) => target.legacyRecordKey);
    const projectionIds = NPC_LOOT_IDENTITY_RESTORATION_TARGETS
      .map((target) => target.projectionId);
    const localWhere = NPC_LOOT_IDENTITY_RESTORATION_TARGETS
      .map(() => '(npc_id = ? AND item_id = ?)').join(' OR ');
    const [serverRows, landingRows, maintRows, sourceFactRows, relationRows, projectionRows, localRows] =
      await Promise.all([
        readRows(connection, 'SELECT @@server_uuid AS serverUuid'),
        readRows(connection, `SELECT 'terria_v1_local' AS landingDatabase,
          id, source_key, content_hash, provider, is_current
          FROM terria_v1_local.source_dataset_landings WHERE id = ?`, [CANONICAL_LINEAGE.landingSourceId]),
        readRows(connection, `SELECT id, record_key, item_name, source_type, source_ref_type,
          source_ref_name, source_provider, source_page, landing_source_id, landing_source_key,
          landing_content_hash, status, deleted FROM terria_v1_maint.maint_item_sources
          WHERE record_key IN (?) ORDER BY record_key`, [maintKeys]),
        readRows(connection, `SELECT record_key, item_internal_name, source_ref_normalized,
          source_maint_record_key, source_maint_id, landing_source_id, landing_source_key,
          landing_content_hash, source_provider, status, deleted
          FROM terria_v1_relation.item_source_facts WHERE record_key IN (?) ORDER BY record_key`, [factKeys]),
        readRows(connection, `SELECT * FROM terria_v1_relation.item_npc_loot_relations
          WHERE record_key IN (?) ORDER BY record_key`, [[...canonicalKeys, ...legacyKeys]]),
        readRows(connection, `SELECT id, internal_name, loot_items_json, status, deleted
          FROM terria_v1_relation.projection_npcs WHERE id IN (?) ORDER BY id`, [projectionIds]),
        readRows(connection, `SELECT id, npc_id, item_id, source_item_id, drop_source_kind,
          quantity_min, quantity_max, quantity_text, chance_value, chance_text, conditions,
          notes, sort_order, status, deleted FROM terria_v1_local.npc_loot_entries
          WHERE ${localWhere} ORDER BY npc_id, item_id, id`,
        NPC_LOOT_IDENTITY_RESTORATION_TARGETS.flatMap((target) => [target.projectionId, target.itemId])),
      ]);
    await connection.query('ROLLBACK');
    const canonicalKeySet = new Set(canonicalKeys);
    const legacyKeySet = new Set(legacyKeys);
    return {
      landingRow: landingRows[0],
      maintRows,
      sourceFactRows,
      acceptedRelationRows,
      legacyRelationRows: relationRows.filter((row) => legacyKeySet.has(row.record_key)),
      canonicalRelationRows: relationRows.filter((row) => canonicalKeySet.has(row.record_key)),
      projectionRows,
      localRows,
      serverUuid: serverRows[0]?.serverUuid,
      t2Anchor: { ...T2_ANCHOR },
      acceptedProjection: { ...ACCEPTED_PROJECTION },
    };
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
}

export async function executeNpcLootIdentityRestorationTransaction({
  connection,
  proposal,
  consumeDispatchPermit,
  readBefore,
  insertCanonicalRelations,
  retireLegacyRelations,
  replaceProjectionEntries,
  readAfter,
} = {}) {
  validateNpcLootIdentityRestorationProposal(proposal);
  if (!connection || typeof connection.beginTransaction !== 'function') {
    throw new Error('NPC loot restoration database connection is required');
  }
  for (const [label, value] of Object.entries({
    consumeDispatchPermit,
    readBefore,
    insertCanonicalRelations,
    retireLegacyRelations,
    replaceProjectionEntries,
    readAfter,
  })) {
    if (typeof value !== 'function') throw new Error(`NPC loot restoration ${label} is required`);
  }
  let began = false;
  try {
    await connection.beginTransaction();
    began = true;
    const before = await readBefore(connection, proposal, { forUpdate: true });
    if (before?.rowsSha256 !== proposal.before.rowsSha256) {
      throw new Error('NPC loot restoration before-set drifted after lock');
    }
    await consumeDispatchPermit();
    const inserted = Number(await insertCanonicalRelations(connection, proposal.rows));
    if (inserted !== 6) throw new Error('NPC loot canonical insert affected-row count drifted');
    const retired = Number(await retireLegacyRelations(connection, proposal.rows));
    if (retired !== 6) throw new Error('NPC loot legacy retirement affected-row count drifted');
    const projected = Number(await replaceProjectionEntries(connection, proposal.rows));
    if (projected !== 6) throw new Error('NPC loot projection affected-row count drifted');
    const after = await readAfter(connection, proposal, { forUpdate: true });
    if (after?.rowsSha256 !== proposal.after.rowsSha256) {
      throw new Error('NPC loot restoration transaction readback drifted');
    }
    await connection.commit();
    return {
      transactionCommitted: true,
      affected: {
        canonicalRelationInserts: inserted,
        legacyRelationRetirements: retired,
        projectionReplacements: projected,
      },
      afterRowsSha256: proposal.after.rowsSha256,
    };
  } catch (error) {
    if (began) await connection.rollback();
    throw error;
  }
}

function scopePayload(proposal) {
  return {
    operationId: proposal.operationId,
    authorities: proposal.authorities,
    serverFingerprint: proposal.serverFingerprint,
    target: proposal.target,
    counts: proposal.counts,
    readOnlyEvidence: proposal.readOnlyEvidence,
    before: proposal.before,
    after: proposal.after,
    rows: proposal.rows,
  };
}

function assertLanding(row) {
  if (row?.landingDatabase !== CANONICAL_LINEAGE.landingDatabase
      || Number(row?.id) !== CANONICAL_LINEAGE.landingSourceId
      || row?.source_key !== CANONICAL_LINEAGE.landingSourceKey
      || row?.content_hash !== CANONICAL_LINEAGE.landingContentHash
      || row?.provider !== CANONICAL_LINEAGE.landingProvider
      || Number(row?.is_current) !== 1) {
    throw new Error('NPC loot canonical landing drifted');
  }
}

function assertMaint(target, row) {
  const expected = {
    id: target.maintId,
    record_key: target.canonicalSourceMaintRecordKey,
    source_type: 'drop',
    source_ref_type: 'npc',
    source_ref_name: target.sourceRefName,
    source_provider: CANONICAL_LINEAGE.sourceProvider,
    source_page: target.sourcePage,
    landing_source_id: CANONICAL_LINEAGE.landingSourceId,
    landing_source_key: CANONICAL_LINEAGE.landingSourceKey,
    landing_content_hash: CANONICAL_LINEAGE.landingContentHash,
    status: 1,
    deleted: 0,
  };
  assertFields(row, expected, `NPC loot maint source ${target.npcInternalName}`);
}

function assertSourceFact(target, row) {
  const expected = {
    record_key: target.canonicalSourceFactKey,
    item_internal_name: target.itemInternalName,
    source_ref_normalized: target.sourceRefName,
    source_maint_record_key: target.canonicalSourceMaintRecordKey,
    source_maint_id: target.maintId,
    landing_source_id: CANONICAL_LINEAGE.landingSourceId,
    landing_source_key: CANONICAL_LINEAGE.landingSourceKey,
    landing_content_hash: CANONICAL_LINEAGE.landingContentHash,
    source_provider: CANONICAL_LINEAGE.sourceProvider,
    status: 1,
    deleted: 0,
  };
  assertFields(row, expected, `NPC loot source fact ${target.npcInternalName}`);
}

function assertAcceptedRelation(target, row) {
  const expected = {
    recordKey: target.canonicalRecordKey,
    sourceFactKey: target.canonicalSourceFactKey,
    itemInternalName: target.itemInternalName,
    npcSourceId: target.projectionId,
    npcInternalName: target.npcInternalName,
    quantityText: '1',
    chanceText: target.chanceText,
    sourceMaintTable: CANONICAL_LINEAGE.sourceMaintTable,
    sourceMaintRecordKey: target.canonicalSourceMaintRecordKey,
    sourceProvider: CANONICAL_LINEAGE.sourceProvider,
    sourcePage: target.sourcePage,
  };
  assertFields(row, expected, `NPC loot accepted relation ${target.npcInternalName}`);
}

function assertLegacyRelation(target, row) {
  const expected = {
    record_key: target.legacyRecordKey,
    source_fact_key: target.legacySourceFactKey,
    item_internal_name: target.itemInternalName,
    npc_source_id: target.projectionId,
    npc_internal_name: target.npcInternalName,
    quantity_text: '1',
    chance_text: target.legacyChanceText,
    source_maint_table: LEGACY_LINEAGE.sourceMaintTable,
    source_maint_record_key: target.legacySourceMaintRecordKey,
    landing_source_id: LEGACY_LINEAGE.landingSourceId,
    landing_source_key: LEGACY_LINEAGE.landingSourceKey,
    landing_content_hash: LEGACY_LINEAGE.landingContentHash,
    source_provider: LEGACY_LINEAGE.sourceProvider,
    status: 1,
    deleted: 0,
  };
  assertFields(row, expected, `NPC loot legacy relation ${target.npcInternalName}`);
}

function assertLocalEvidence(target, rows) {
  const pair = rows.filter((row) => Number(row.npc_id) === target.projectionId
    && Number(row.item_id) === target.itemId);
  if (pair.length !== 2) throw new Error(`NPC loot local evidence set drifted: ${target.npcInternalName}`);
  const accepted = pair.find((row) => Number(row.status) === 1 && Number(row.deleted) === 0);
  const legacy = pair.find((row) => Number(row.status) === 0 && Number(row.deleted) === 1);
  const common = {
    npc_id: target.projectionId,
    item_id: target.itemId,
    source_item_id: target.itemId,
    drop_source_kind: 'npc_drop',
    quantity_text: '1',
  };
  assertFields(accepted, { ...common, chance_text: target.chanceText }, `NPC loot local accepted ${target.npcInternalName}`);
  assertFields(legacy, { ...common, chance_text: target.legacyChanceText }, `NPC loot local legacy ${target.npcInternalName}`);
  return {
    acceptedId: Number(accepted.id),
    legacyId: Number(legacy.id),
    rowsSha256: hashJson(normalizeRows(pair)),
    mutation: 'none',
  };
}

function buildProjectionChange(target, accepted, projection) {
  if (Number(projection?.id) !== target.projectionId
      || projection?.internal_name !== target.npcInternalName
      || Number(projection?.status) !== 1
      || Number(projection?.deleted) !== 0) {
    throw new Error(`NPC loot projection identity drifted: ${target.npcInternalName}`);
  }
  let beforeLootItems;
  try {
    beforeLootItems = JSON.parse(String(projection.loot_items_json ?? ''));
  } catch {
    throw new Error(`NPC loot projection JSON is invalid: ${target.npcInternalName}`);
  }
  if (!Array.isArray(beforeLootItems)) {
    throw new Error(`NPC loot projection JSON is not an array: ${target.npcInternalName}`);
  }
  const indexes = beforeLootItems.map((entry, index) => (
    entry?.relationType === 'loot'
      && entry.itemInternalName === target.itemInternalName
      && entry.relationRecordKey === target.legacyRecordKey
      && entry.sourceFactKey === target.legacySourceFactKey
      && entry.chanceText === target.legacyChanceText
      && entry.quantityText === '1'
      && entry.sourceProvider === LEGACY_LINEAGE.sourceProvider
      ? index : -1
  )).filter((index) => index >= 0);
  if (indexes.length !== 1) {
    throw new Error(`NPC loot projection legacy identity drifted: ${target.npcInternalName}`);
  }
  const targetIndex = indexes[0];
  const afterLootItems = beforeLootItems.map((entry, index) => index === targetIndex ? {
    ...entry,
    chanceText: target.chanceText,
    quantityText: '1',
    sourceFactKey: target.canonicalSourceFactKey,
    relationRecordKey: target.canonicalRecordKey,
    sourceProvider: CANONICAL_LINEAGE.sourceProvider,
    sourcePage: target.sourcePage,
    sourceRevisionTimestamp: accepted.sourceRevisionTimestamp ?? null,
  } : entry);
  return {
    projectionId: target.projectionId,
    projectionInternalName: target.npcInternalName,
    targetIndex,
    beforeLootItems,
    beforeLootItemsSha256: hashJson(beforeLootItems),
    afterLootItems,
    afterLootItemsSha256: hashJson(afterLootItems),
  };
}

function keyed(rows, key, label, normalize = String) {
  const result = new Map();
  for (const row of rows) {
    const value = normalize(row?.[key]);
    if (result.has(value)) throw new Error(`NPC loot duplicate ${label} key: ${value}`);
    result.set(value, row);
  }
  return result;
}

function assertFields(actual, expected, label) {
  if (!actual) throw new Error(`${label} is missing`);
  for (const [field, value] of Object.entries(expected)) {
    if (comparable(actual[field]) !== comparable(value)) {
      throw new Error(`${label} ${field} drifted`);
    }
  }
}

function comparable(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return String(value);
  return value == null ? null : String(value);
}

function assertExactObject(actual, expected, label) {
  if (JSON.stringify(stableValue(actual)) !== JSON.stringify(stableValue(expected))) {
    throw new Error(`${label} drifted`);
  }
}

function assertExactLength(rows, length, label) {
  if (!Array.isArray(rows) || rows.length !== length) {
    throw new Error(`NPC loot ${label} count drifted: expected ${length}`);
  }
}

function assertUuid(value) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(value ?? ''))) {
    throw new Error('NPC loot server UUID is invalid');
  }
}

function assertGeneratedAt(value) {
  if (!Number.isFinite(Date.parse(value))) throw new Error('NPC loot generatedAt is invalid');
}

function normalizeRows(rows) {
  return rows.map(stableValue).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashJsonFileBytes(value) {
  return hashBytes(Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
}

function isHash(value) {
  return /^sha256:[a-f0-9]{64}$/.test(String(value ?? ''));
}

async function readRows(connection, sql, values = []) {
  const [rows] = await connection.query(sql, values);
  return Array.isArray(rows) ? rows : [];
}

function connectionOptions(repoRoot) {
  const config = loadLocalStackConfig(repoRoot);
  return {
    host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  };
}

function confinedPath(repoRoot, relativePath, label) {
  return assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label,
  });
}

function writePrivateJson(repoRoot, relativePath, value) {
  const target = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'NPC loot restoration proposal',
    createParent: true,
  });
  if (fs.existsSync(target)) {
    throw new Error(`NPC loot restoration proposal already exists: ${relativePath}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}

function readJson(repoRoot, relativePath) {
  return JSON.parse(fs.readFileSync(confinedPath(
    repoRoot,
    relativePath,
    'NPC loot restoration artifact',
  ), 'utf8'));
}

function hashFile(repoRoot, relativePath) {
  return hashBytes(fs.readFileSync(confinedPath(
    repoRoot,
    relativePath,
    'NPC loot restoration artifact',
  )));
}

function assertFreshAuthorizationPaths(repoRoot) {
  for (const relativePath of [
    NPC_LOOT_IDENTITY_RESTORATION_INPUT_PATH,
    NPC_LOOT_IDENTITY_RESTORATION_MANIFEST_PATH,
    NPC_LOOT_IDENTITY_RESTORATION_REQUEST_PATH,
    NPC_LOOT_IDENTITY_RESTORATION_RESULT_PATH,
  ]) {
    if (fs.existsSync(path.resolve(repoRoot, relativePath))) {
      throw new Error(`NPC loot restoration authorization output already exists: ${relativePath}`);
    }
  }
}

async function readDatabaseServerUuid(connection) {
  const rows = await readRows(connection, 'SELECT @@server_uuid AS serverUuid');
  return rows[0]?.serverUuid ?? null;
}

async function readLockedTargets(connection, proposal) {
  const keys = proposal.rows.flatMap((row) => [
    row.canonicalRelation.recordKey,
    row.legacyRelation.recordKey,
  ]);
  const ids = proposal.rows.map((row) => row.projection.projectionId);
  const relations = await readRows(connection, `SELECT *
    FROM terria_v1_relation.item_npc_loot_relations
    WHERE record_key IN (?) ORDER BY record_key FOR UPDATE`, [keys]);
  const projections = await readRows(connection, `SELECT id, internal_name, loot_items_json, status, deleted
    FROM terria_v1_relation.projection_npcs
    WHERE id IN (?) ORDER BY id FOR UPDATE`, [ids]);
  return { relations, projections };
}

async function assertLockedReadOnlyEvidence(connection, proposal) {
  const maintKeys = NPC_LOOT_IDENTITY_RESTORATION_TARGETS
    .map((target) => target.canonicalSourceMaintRecordKey);
  const factKeys = NPC_LOOT_IDENTITY_RESTORATION_TARGETS
    .map((target) => target.canonicalSourceFactKey);
  const localWhere = NPC_LOOT_IDENTITY_RESTORATION_TARGETS
    .map(() => '(npc_id = ? AND item_id = ?)').join(' OR ');
  const [landingRows, maintRows, sourceFactRows, localRows] = await Promise.all([
    readRows(connection, `SELECT 'terria_v1_local' AS landingDatabase,
      id, source_key, content_hash, provider, is_current
      FROM terria_v1_local.source_dataset_landings WHERE id = ? FOR SHARE`,
    [CANONICAL_LINEAGE.landingSourceId]),
    readRows(connection, `SELECT id, record_key, item_name, source_type, source_ref_type,
      source_ref_name, source_provider, source_page, landing_source_id, landing_source_key,
      landing_content_hash, status, deleted FROM terria_v1_maint.maint_item_sources
      WHERE record_key IN (?) ORDER BY record_key FOR SHARE`, [maintKeys]),
    readRows(connection, `SELECT record_key, item_internal_name, source_ref_normalized,
      source_maint_record_key, source_maint_id, landing_source_id, landing_source_key,
      landing_content_hash, source_provider, status, deleted
      FROM terria_v1_relation.item_source_facts
      WHERE record_key IN (?) ORDER BY record_key FOR SHARE`, [factKeys]),
    readRows(connection, `SELECT id, npc_id, item_id, source_item_id, drop_source_kind,
      quantity_min, quantity_max, quantity_text, chance_value, chance_text, conditions,
      notes, sort_order, status, deleted FROM terria_v1_local.npc_loot_entries
      WHERE ${localWhere} ORDER BY npc_id, item_id, id FOR SHARE`,
    NPC_LOOT_IDENTITY_RESTORATION_TARGETS.flatMap((target) => [target.projectionId, target.itemId])),
  ]);
  assertLanding(landingRows[0]);
  if (hashJson(normalizeRows(maintRows)) !== proposal.readOnlyEvidence.maintRowsSha256
      || hashJson(normalizeRows(sourceFactRows)) !== proposal.readOnlyEvidence.sourceFactRowsSha256
      || hashJson(normalizeRows(localRows)) !== proposal.readOnlyEvidence.localRowsSha256) {
    throw new Error('NPC loot restoration read-only evidence changed after proposal');
  }
}

function assertCanonicalReadback(target, row) {
  const expected = {
    record_key: target.canonicalRecordKey,
    source_fact_key: target.canonicalSourceFactKey,
    item_internal_name: target.itemInternalName,
    npc_source_id: target.projectionId,
    npc_internal_name: target.npcInternalName,
    quantity_text: '1',
    chance_text: target.chanceText,
    source_maint_table: CANONICAL_LINEAGE.sourceMaintTable,
    source_maint_record_key: target.canonicalSourceMaintRecordKey,
    source_maint_id: target.maintId,
    landing_source_id: CANONICAL_LINEAGE.landingSourceId,
    landing_source_key: CANONICAL_LINEAGE.landingSourceKey,
    landing_content_hash: CANONICAL_LINEAGE.landingContentHash,
    source_provider: CANONICAL_LINEAGE.sourceProvider,
    source_page: target.sourcePage,
    status: 1,
    deleted: 0,
  };
  assertFields(row, expected, `NPC loot canonical readback ${target.npcInternalName}`);
}

function parseJsonArray(value, label) {
  let parsed;
  try {
    parsed = JSON.parse(String(value ?? ''));
  } catch {
    throw new Error(`NPC loot projection JSON is invalid: ${label}`);
  }
  if (!Array.isArray(parsed)) throw new Error(`NPC loot projection JSON is not an array: ${label}`);
  return parsed;
}

function relationInsertValue(row, column) {
  const values = {
    record_key: row.recordKey,
    source_fact_key: row.sourceFactKey,
    item_internal_name: row.itemInternalName,
    item_name: row.itemName,
    npc_source_id: row.npcSourceId,
    npc_internal_name: row.npcInternalName,
    npc_name: row.npcName,
    quantity_min: row.quantityMin,
    quantity_max: row.quantityMax,
    quantity_text: row.quantityText,
    chance_value: row.chanceValue,
    chance_text: row.chanceText,
    conditions: row.conditions,
    condition_source_text: row.conditionSourceText,
    condition_parse_status: row.conditionParseStatus,
    condition_biome_code: row.conditionBiomeCode,
    condition_game_period_code: row.conditionGamePeriodCode,
    condition_time_code: row.conditionTimeCode,
    condition_weather_code: row.conditionWeatherCode,
    condition_events_json: row.conditionEventsJson,
    special_flags_json: row.specialFlagsJson,
    source_maint_table: row.sourceMaintTable,
    source_maint_record_key: row.sourceMaintRecordKey,
    source_maint_id: row.sourceMaintId,
    landing_source_id: row.landingSourceId,
    landing_source_key: row.landingSourceKey,
    landing_content_hash: row.landingContentHash,
    source_provider: row.sourceProvider,
    source_page: row.sourcePage,
    source_revision_timestamp: row.sourceRevisionTimestamp,
    confidence: row.confidence,
    reason: row.reason,
    review_status: row.reviewStatus,
    raw_json: row.rawJson,
    status: row.status,
    deleted: row.deleted,
  };
  return values[column] ?? null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runNpcLootIdentityRestoration().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
