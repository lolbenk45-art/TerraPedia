#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from '../automation/authorized-operation-context.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  EXPECTED_TARGETS,
  PROJECTION_TEXT_IDENTITY_RESIDUAL_OPERATION_ID,
  PROJECTION_TEXT_IDENTITY_RESIDUAL_SCOPE,
} from '../audit/npc-projection-text-identity-residual-preview.mjs';

export const OPERATION_ID = PROJECTION_TEXT_IDENTITY_RESIDUAL_OPERATION_ID;
export const INPUT_PATH = 'reports/authorization/canonical/canonical-npc-projection-text-identity-residual-repair.input.json';
export const PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260819/post-final/npc-projection-text-identity-residual-preview.json';
export const RESULT_PATH = 'reports/authorization/canonical/canonical-npc-projection-text-identity-residual-repair.result.json';
export const WRITE_TARGETS = Object.freeze([
  'relation.item_npc_loot_relations.status_deleted',
  'relation.projection_npcs.loot_items_json',
  'local.npc_loot_entries.status_deleted',
]);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const DATABASE = 'terria_v1_relation';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

function hashFile(repoRoot, relativePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(path.resolve(repoRoot, relativePath))).digest('hex')}`;
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function comparable(value) {
  if (value instanceof Date) return value.toISOString();
  return value == null ? null : String(value);
}

function assertEqualFields(row, fields, label) {
  for (const [key, expected] of Object.entries(fields)) {
    if (comparable(row?.[key]) !== comparable(expected)) throw new Error(`${label} drifted at ${key}`);
  }
}

function targetByAcceptedKey(key) {
  return EXPECTED_TARGETS.find((target) => target.relationRecordKey === key);
}

function assertTargetPreviewRow(row) {
  const target = targetByAcceptedKey(row?.relationRecordKey);
  if (!target) throw new Error('residual repair target is outside the frozen scope');
  assertEqualFields(row, { relationId: target.relationId, projectionId: target.projectionId, projectionInternalName: target.npcInternalName }, 'residual repair accepted target');
  assertEqualFields(row.relationRetirement, {
    relationId: target.beforeRelationId,
    recordKey: target.beforeRelationRecordKey,
    sourceFactKey: target.beforeSourceFactKey,
    sourceMaintRecordKey: target.beforeSourceMaintRecordKey,
    sourceMaintId: target.beforeSourceMaintId,
    landingSourceId: target.beforeLandingSourceId,
    sourceProvider: 'wiki_gg',
    landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
    landingContentHash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
    quantityText: target.quantityText,
    chanceText: target.beforeChanceText,
    conditions: null,
  }, 'residual repair relation retirement');
  assertEqualFields(row.localRetirement, {
    localId: target.localRetirementId,
    npcId: target.projectionId,
    itemId: 891,
    sourceItemId: 891,
    dropSourceKind: 'npc_drop',
    quantityText: target.quantityText,
    chanceText: target.beforeChanceText,
    conditions: null,
  }, 'residual repair local retirement');
  assertEqualFields(row.localSurvivor, {
    localId: target.localSurvivorId,
    npcId: target.projectionId,
    itemId: 891,
    sourceItemId: 891,
    dropSourceKind: 'npc_drop',
    quantityText: target.quantityText,
    chanceText: target.chanceText,
    conditions: null,
  }, 'residual repair local survivor');
  if (!Array.isArray(row.beforeLootItems) || !Array.isArray(row.afterLootItems)
      || row.beforeLootItems.length !== row.afterLootItems.length) {
    throw new Error('residual repair projection array drifted');
  }
  const before = row.beforeLootItems[row.targetIndex];
  const after = row.afterLootItems[row.targetIndex];
  if (!before || !after
      || before.relationRecordKey !== target.beforeRelationRecordKey
      || after.relationRecordKey !== target.relationRecordKey
      || after.sourceFactKey !== target.sourceFactKey
      || after.chanceText !== target.chanceText
      || after.quantityText !== target.quantityText
      || after.sourceProvider !== 'terraria.wiki.gg') {
    throw new Error('residual repair projection identity drifted');
  }
  return target;
}

export function validateProjectionTextIdentityResidualRepairInput({ input, preview, previewSha256 } = {}) {
  if (input?.schemaVersion !== 1 || input.operationId !== OPERATION_ID
      || preview?.schemaVersion !== 1 || preview.operationId !== OPERATION_ID) {
    throw new Error('residual projection repair contract is invalid');
  }
  if (input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) {
    throw new Error('residual projection repair flags are invalid');
  }
  if (preview.applyAllowed !== false || preview.databaseWrites !== false || preview.externalRequests !== false) {
    throw new Error('residual projection preview must remain read-only');
  }
  if (!HASH_PATTERN.test(input.scopeSha256) || input.scopeSha256 !== PROJECTION_TEXT_IDENTITY_RESIDUAL_SCOPE
      || preview.scopeSha256 !== input.scopeSha256) {
    throw new Error('residual projection repair scope drifted');
  }
  if (!HASH_PATTERN.test(input.previewSha256) || input.previewSha256 !== previewSha256) {
    throw new Error('residual projection preview hash drifted');
  }
  const expectedCounts = {
    acceptedRelationLoot: 2,
    relationRowsToRetire: 2,
    projectionNpcsToReplace: 2,
    localRowsToRetire: 2,
  };
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (Number(input.expectedCounts?.[key]) !== expected || Number(preview.summary?.[key]) !== expected) {
      throw new Error(`residual projection count drifted at ${key}`);
    }
  }
  if (preview.summary.sourceFactsTargeted !== 0 || preview.summary.sourceDetailsTargeted !== 0
      || !Array.isArray(preview.rows) || preview.rows.length !== EXPECTED_TARGETS.length) {
    throw new Error('residual projection preview write scope drifted');
  }
  if (JSON.stringify(input.writeTargets) !== JSON.stringify(WRITE_TARGETS)) {
    throw new Error('residual projection write targets drifted');
  }
  const seen = new Set();
  for (const row of preview.rows) {
    const target = assertTargetPreviewRow(row);
    if (seen.has(target.relationRecordKey)) throw new Error('duplicate residual projection target');
    seen.add(target.relationRecordKey);
  }
  if (seen.size !== EXPECTED_TARGETS.length) throw new Error('residual projection target set drifted');
  return true;
}

export function buildProjectionTextIdentityResidualMutationPlan(preview) {
  validateProjectionTextIdentityResidualRepairInput({
    input: {
      schemaVersion: 1,
      operationId: OPERATION_ID,
      apply: true,
      databaseWrites: true,
      externalRequests: false,
      scopeSha256: PROJECTION_TEXT_IDENTITY_RESIDUAL_SCOPE,
      previewSha256: `sha256:${'0'.repeat(64)}`,
      expectedCounts: { acceptedRelationLoot: 2, relationRowsToRetire: 2, projectionNpcsToReplace: 2, localRowsToRetire: 2 },
      writeTargets: WRITE_TARGETS,
    },
    preview,
    previewSha256: `sha256:${'0'.repeat(64)}`,
  });
  const rows = preview.rows.map((row) => ({
    relationRecordKey: row.relationRecordKey,
    relationId: Number(row.relationId),
    retiringRelationRecordKey: row.relationRetirement.recordKey,
    retiringRelationId: Number(row.relationRetirement.relationId),
    projectionId: Number(row.projectionId),
    projectionInternalName: row.projectionInternalName,
    targetIndex: Number(row.targetIndex),
    beforeLootItems: row.beforeLootItems,
    afterLootItems: row.afterLootItems,
    localRetirementId: Number(row.localRetirement.localId),
    localSurvivorId: Number(row.localSurvivor.localId),
    beforeSourceFactKey: row.relationRetirement.sourceFactKey,
    beforeSourceMaintRecordKey: row.relationRetirement.sourceMaintRecordKey,
    beforeSourceMaintId: row.relationRetirement.sourceMaintId,
    beforeLandingSourceId: row.relationRetirement.landingSourceId,
  }));
  return {
    rows,
    counts: { acceptedRelationLoot: 2, relationRowsToRetire: 2, projectionNpcsToReplace: 2, localRowsToRetire: 2 },
  };
}

function configFor(repoRoot) {
  const config = loadLocalStackConfig(repoRoot);
  return {
    host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  };
}

function placeholders(values) { return values.map(() => '?').join(', '); }

async function selectRelations(connection, keys, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.execute(
    `SELECT * FROM \`${DATABASE}\`.\`item_npc_loot_relations\` WHERE record_key IN (${placeholders(keys)})${lock}`,
    keys,
  );
  return rows;
}

async function selectProjections(connection, ids, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.execute(
    `SELECT * FROM \`${DATABASE}\`.\`projection_npcs\` WHERE id IN (${placeholders(ids)})${lock}`,
    ids,
  );
  return rows;
}

async function selectLocal(connection, ids, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.execute(
    `SELECT * FROM \`terria_v1_local\`.\`npc_loot_entries\` WHERE id IN (${placeholders(ids)})${lock}`,
    ids,
  );
  return rows;
}

export function assertCurrentRows(relations, projections, localRows, plan) {
  const relationMap = new Map(relations.map((row) => [row.record_key, row]));
  const projectionMap = new Map(projections.map((row) => [Number(row.id), row]));
  const localMap = new Map(localRows.map((row) => [Number(row.id), row]));
  if (relations.length !== plan.rows.length * 2
      || projections.length !== plan.rows.length
      || localRows.length !== plan.rows.length * 2) {
    throw new Error('residual repair target set drifted');
  }
  for (const target of EXPECTED_TARGETS) {
    const row = plan.rows.find((candidate) => candidate.relationRecordKey === target.relationRecordKey);
    const accepted = relationMap.get(target.relationRecordKey);
    const retiring = relationMap.get(target.beforeRelationRecordKey);
    const projection = projectionMap.get(target.projectionId);
    const localRetirement = localMap.get(target.localRetirementId);
    const localSurvivor = localMap.get(target.localSurvivorId);
    if (!row || !accepted || !retiring || !projection || !localRetirement || !localSurvivor) throw new Error(`residual repair target missing: ${target.npcInternalName}`);
    if (!active(accepted) || !active(retiring) || !active(projection) || !active(localRetirement) || !active(localSurvivor)) throw new Error(`residual repair target inactive: ${target.npcInternalName}`);
    assertEqualFields(accepted, {
      id: target.relationId,
      record_key: target.relationRecordKey,
      source_fact_key: target.sourceFactKey,
      source_maint_record_key: target.sourceMaintRecordKey,
      source_maint_id: null,
      landing_source_id: 12474,
      npc_internal_name: target.npcInternalName,
      item_internal_name: target.itemInternalName,
      quantity_text: target.quantityText,
      chance_text: target.chanceText,
      source_provider: 'terraria.wiki.gg',
      source_maint_table: 'maint_item_sources',
      landing_source_key: 'generated.npc_item_relations_bundle',
      landing_content_hash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
      source_page: target.sourcePage,
      source_revision_timestamp: null,
      conditions: null,
    }, 'accepted relation');
    assertEqualFields(retiring, {
      id: target.beforeRelationId,
      record_key: target.beforeRelationRecordKey,
      source_fact_key: target.beforeSourceFactKey,
      source_maint_record_key: target.beforeSourceMaintRecordKey,
      source_maint_id: target.beforeSourceMaintId,
      landing_source_id: target.beforeLandingSourceId,
      npc_internal_name: target.npcInternalName,
      item_internal_name: target.itemInternalName,
      quantity_text: target.quantityText,
      chance_text: target.beforeChanceText,
      source_provider: 'wiki_gg',
      source_maint_table: 'maint_item_sources',
      landing_source_key: 'generated.item_relations_bundle:chunk:0001',
      landing_content_hash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
      source_page: 'Nazar',
      source_revision_timestamp: '2026-02-19T02:11:12.000Z',
      conditions: null,
    }, 'retiring relation');
    if (Number(projection.id) !== target.projectionId || projection.internal_name !== target.npcInternalName) {
      throw new Error(`projection identity drifted: ${target.npcInternalName}`);
    }
    if (hashJson(parseLoot(projection.loot_items_json)) !== hashJson(row.beforeLootItems)) throw new Error(`projection drifted: ${target.npcInternalName}`);
    assertEqualFields(localRetirement, { id: target.localRetirementId, npc_id: target.projectionId, item_id: 891, source_item_id: 891, drop_source_kind: 'npc_drop', quantity_text: target.quantityText, chance_text: target.beforeChanceText, conditions: null }, 'local retirement');
    assertEqualFields(localSurvivor, { id: target.localSurvivorId, npc_id: target.projectionId, item_id: 891, source_item_id: 891, drop_source_kind: 'npc_drop', quantity_text: target.quantityText, chance_text: target.chanceText, conditions: null }, 'local survivor');
  }
}

export function assertReadbackRows(relations, projections, localRows, plan) {
  const relationMap = new Map(relations.map((row) => [row.record_key, row]));
  const projectionMap = new Map(projections.map((row) => [Number(row.id), row]));
  const localMap = new Map(localRows.map((row) => [Number(row.id), row]));
  for (const target of EXPECTED_TARGETS) {
    const planRow = plan.rows.find((row) => row.relationRecordKey === target.relationRecordKey);
    const accepted = relationMap.get(target.relationRecordKey);
    const retiring = relationMap.get(target.beforeRelationRecordKey);
    const projection = projectionMap.get(target.projectionId);
    const localRetirement = localMap.get(target.localRetirementId);
    const localSurvivor = localMap.get(target.localSurvivorId);
    if (!accepted || !retiring || !projection || !localRetirement || !localSurvivor) {
      throw new Error(`residual repair readback target missing: ${target.npcInternalName}`);
    }
    if (!active(accepted) || active(retiring) || !active(projection) || active(localRetirement) || !active(localSurvivor)) {
      throw new Error(`residual repair readback status drifted: ${target.npcInternalName}`);
    }
    assertEqualFields(accepted, {
      id: target.relationId,
      record_key: target.relationRecordKey,
      source_fact_key: target.sourceFactKey,
      source_maint_record_key: target.sourceMaintRecordKey,
      source_maint_id: null,
      landing_source_id: 12474,
      npc_internal_name: target.npcInternalName,
      item_internal_name: target.itemInternalName,
      quantity_text: target.quantityText,
      chance_text: target.chanceText,
      source_provider: 'terraria.wiki.gg',
      source_maint_table: 'maint_item_sources',
      landing_source_key: 'generated.npc_item_relations_bundle',
      landing_content_hash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
      source_page: target.sourcePage,
      source_revision_timestamp: null,
      conditions: null,
    }, 'accepted relation readback');
    assertEqualFields(retiring, {
      id: target.beforeRelationId,
      record_key: target.beforeRelationRecordKey,
      source_fact_key: target.beforeSourceFactKey,
      source_maint_record_key: target.beforeSourceMaintRecordKey,
      source_maint_id: target.beforeSourceMaintId,
      landing_source_id: target.beforeLandingSourceId,
      source_maint_table: 'maint_item_sources',
      landing_source_key: 'generated.item_relations_bundle:chunk:0001',
      landing_content_hash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
      source_provider: 'wiki_gg',
      source_page: 'Nazar',
      source_revision_timestamp: '2026-02-19T02:11:12.000Z',
      conditions: null,
    }, 'retiring relation readback');
    assertEqualFields(localRetirement, {
      id: target.localRetirementId,
      npc_id: target.projectionId,
      item_id: 891,
      source_item_id: 891,
      drop_source_kind: 'npc_drop',
      quantity_text: target.quantityText,
      chance_text: target.beforeChanceText,
      conditions: null,
    }, 'local retirement readback');
    assertEqualFields(localSurvivor, {
      id: target.localSurvivorId,
      npc_id: target.projectionId,
      item_id: 891,
      source_item_id: 891,
      drop_source_kind: 'npc_drop',
      quantity_text: target.quantityText,
      chance_text: target.chanceText,
      conditions: null,
    }, 'local survivor readback');
    if (Number(projection.id) !== target.projectionId || projection.internal_name !== target.npcInternalName) {
      throw new Error(`projection identity readback drifted: ${target.npcInternalName}`);
    }
    if (hashJson(parseLoot(projection.loot_items_json)) !== hashJson(planRow.afterLootItems)) {
      throw new Error(`projection readback drifted: ${target.npcInternalName}`);
    }
  }
}

function parseLoot(value) {
  const parsed = JSON.parse(String(value ?? '[]'));
  if (!Array.isArray(parsed)) throw new Error('projection loot_items_json must be an array');
  return parsed;
}

async function applyPlan(connection, plan) {
  for (const row of plan.rows) {
    const [relationResult] = await connection.execute(
      'UPDATE `terria_v1_relation`.`item_npc_loot_relations` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND record_key = ? AND source_fact_key = ? AND source_maint_table = ? AND source_maint_record_key = ? AND source_maint_id <=> ? AND landing_source_id <=> ? AND landing_source_key = ? AND landing_content_hash = ? AND source_provider = ? AND source_page = ? AND source_revision_timestamp <=> ? AND conditions <=> ? AND status = 1 AND deleted = 0',
      [row.retiringRelationId, row.retiringRelationRecordKey, row.beforeSourceFactKey, 'maint_item_sources', row.beforeSourceMaintRecordKey, row.beforeSourceMaintId, row.beforeLandingSourceId, 'generated.item_relations_bundle:chunk:0001', 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818', 'wiki_gg', 'Nazar', new Date('2026-02-19T02:11:12.000Z'), null],
    );
    if (Number(relationResult?.affectedRows) !== 1) throw new Error(`relation retirement affected row count drifted: ${row.retiringRelationRecordKey}`);
    const [projectionResult] = await connection.execute(
      'UPDATE `terria_v1_relation`.`projection_npcs` SET loot_items_json = ? WHERE id = ? AND internal_name = ? AND status = 1 AND deleted = 0',
      [JSON.stringify(row.afterLootItems), row.projectionId, row.projectionInternalName],
    );
    if (Number(projectionResult?.affectedRows) !== 1) throw new Error(`projection replacement affected row count drifted: ${row.projectionInternalName}`);
    const [localResult] = await connection.execute(
      'UPDATE `terria_v1_local`.`npc_loot_entries` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND npc_id = ? AND item_id = ? AND source_item_id = ? AND drop_source_kind = ? AND quantity_text <=> ? AND chance_text <=> ? AND conditions <=> ? AND status = 1 AND deleted = 0',
      [row.localRetirementId, row.projectionId, 891, 891, 'npc_drop', '1', '1% 1.99%', null],
    );
    if (Number(localResult?.affectedRows) !== 1) throw new Error(`local retirement affected row count drifted: ${row.localRetirementId}`);
  }
}

export async function runProjectionTextIdentityResidualRepair({ repoRoot = process.cwd(), inputPath = INPUT_PATH, previewPath = PREVIEW_PATH, apply = false, mysqlModule } = {}) {
  const input = JSON.parse(fs.readFileSync(path.resolve(repoRoot, inputPath), 'utf8'));
  const preview = JSON.parse(fs.readFileSync(path.resolve(repoRoot, previewPath), 'utf8'));
  validateProjectionTextIdentityResidualRepairInput({ input, preview, previewSha256: hashFile(repoRoot, previewPath) });
  const plan = buildProjectionTextIdentityResidualMutationPlan(preview);
  if (!apply) return { operationId: OPERATION_ID, apply: false, scopeSha256: input.scopeSha256, counts: plan.counts, writeTargets: WRITE_TARGETS };
  const authorizedContext = loadAuthorizedOperationContext({ operationId: OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext });
  consumeAuthorizedOperationDispatchPermit({ authorizedContext, decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json') });
  const connection = await loadMysqlModule({ repoRoot, mysqlModule }).createConnection(configFor(repoRoot));
  try {
    await connection.beginTransaction();
    try {
      const relationKeys = plan.rows.flatMap((row) => [row.relationRecordKey, row.retiringRelationRecordKey]);
      const projectionIds = plan.rows.map((row) => row.projectionId);
      const localIds = plan.rows.flatMap((row) => [row.localRetirementId, row.localSurvivorId]);
      const beforeRelations = await selectRelations(connection, relationKeys, { forUpdate: true });
      const beforeProjections = await selectProjections(connection, projectionIds, { forUpdate: true });
      const beforeLocal = await selectLocal(connection, localIds, { forUpdate: true });
      assertCurrentRows(beforeRelations, beforeProjections, beforeLocal, plan);
      await applyPlan(connection, plan);
      const afterRelations = await selectRelations(connection, relationKeys);
      const afterProjections = await selectProjections(connection, projectionIds);
      const afterLocal = await selectLocal(connection, localIds);
      assertReadbackRows(afterRelations, afterProjections, afterLocal, plan);
      await connection.commit();
      const readback = { relationRows: afterRelations.length, retiredRelations: 2, activeRetiredRelations: 0, projectionNpcs: afterProjections.length, localRows: afterLocal.length, retiredLocalRows: 2, activeRetiredLocal: 0 };
      return { schemaVersion: 1, resultKind: 'canonical_npc_projection_text_identity_residual_repair_result', operationId: OPERATION_ID, status: 'COMPLETED', transactionCommitted: true, scopeSha256: input.scopeSha256, authorization: { decisionIdentity: authorizedContext.decisionIdentity, packetHash: authorizedContext.packetHash }, affected: plan.counts, readback, preserved: { sourceFacts: true, sourceDetails: true }, outputHash: hashJson({ input, affected: plan.counts, readback }), completedAt: new Date().toISOString() };
    } catch (error) { await connection.rollback(); throw error; }
  } finally { await connection.end(); }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => { const [key, ...parts] = String(arg).replace(/^--/, '').split('='); return [key, parts.join('=') || 'true']; }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = parseArgs(process.argv.slice(2));
  runProjectionTextIdentityResidualRepair({ repoRoot: process.cwd(), inputPath: args.input ?? INPUT_PATH, previewPath: args.preview ?? PREVIEW_PATH, apply: args.apply === 'true' }).then((result) => {
    if (args.apply === 'true') fs.writeFileSync(path.resolve(process.cwd(), args.output ?? RESULT_PATH), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
}
