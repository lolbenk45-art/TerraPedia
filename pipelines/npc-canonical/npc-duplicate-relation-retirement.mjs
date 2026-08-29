#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from '../automation/authorized-operation-context.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';

export const DUPLICATE_RELATION_RETIREMENT_OPERATION_ID =
  'canonical-npc-loot-duplicate-relation-retirement';
export const INPUT_PATH =
  'reports/authorization/canonical/canonical-npc-loot-duplicate-relation-retirement.input.json';
export const PROPOSAL_PATH =
  'reports/runtime/local-data-chain-closure/20260825/parent-final-1055/npc-duplicate-relation-retirement.proposal.json';
export const RESULT_PATH =
  'reports/authorization/canonical/canonical-npc-loot-duplicate-relation-retirement.result.json';
export const WRITE_TARGETS = Object.freeze([
  'relation.item_npc_loot_relations.status_deleted',
]);

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hashValue(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value)), 'utf8').digest('hex')}`;
}

function hashFile(repoRoot, relativePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(path.resolve(repoRoot, relativePath))).digest('hex')}`;
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function assertRelation(row, label, expectedId) {
  if (!row || Number(row.id) !== Number(expectedId) || !active(row)) throw new Error(`${label} drifted`);
  if (row.npc_internal_name !== 'UndeadMiner' || row.item_internal_name !== 'MiningHelmet'
      || row.quantity_text !== '1' || row.chance_text !== '5%') throw new Error(`${label} stable identity drifted`);
}

function assertProjection(projection, survivor) {
  if (!projection || Number(projection.id) !== 44 || projection.internal_name !== 'UndeadMiner') {
    throw new Error('projection drifted');
  }
  let loot;
  try { loot = JSON.parse(projection.loot_items_json); } catch { throw new Error('projection loot JSON is invalid'); }
  const matches = loot.filter((row) => row?.itemInternalName === 'MiningHelmet');
  if (matches.length !== 1 || matches[0].relationRecordKey !== survivor.record_key
      || matches[0].sourceFactKey !== survivor.source_fact_key
      || matches[0].quantityText !== '1' || matches[0].chanceText !== '5%') {
    throw new Error('projection survivor binding drifted');
  }
}

export function buildDuplicateRelationRetirementProposal({ relation, survivor, projection, generatedAt } = {}) {
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) throw new Error('generatedAt is required');
  assertRelation(relation, 'relation target', 1551);
  assertRelation(survivor, 'survivor', 609);
  if (relation.record_key === survivor.record_key || relation.source_fact_key === survivor.source_fact_key) {
    throw new Error('target and survivor must be distinct');
  }
  if (relation.source_maint_table !== 'maint_npc_crawler_facts') throw new Error('relation target lineage drifted');
  assertProjection(projection, survivor);

  const beforeRows = {
    relation: {
      id: Number(relation.id), recordKey: relation.record_key, sourceFactKey: relation.source_fact_key,
      sourceMaintTable: relation.source_maint_table, sourceMaintRecordKey: relation.source_maint_record_key,
      npcInternalName: relation.npc_internal_name, itemInternalName: relation.item_internal_name,
      quantityText: relation.quantity_text, chanceText: relation.chance_text,
      status: Number(relation.status), deleted: Number(relation.deleted),
    },
    survivor: {
      id: Number(survivor.id), recordKey: survivor.record_key, sourceFactKey: survivor.source_fact_key,
      npcInternalName: survivor.npc_internal_name, itemInternalName: survivor.item_internal_name,
      quantityText: survivor.quantity_text, chanceText: survivor.chance_text,
      status: Number(survivor.status), deleted: Number(survivor.deleted),
    },
    projection: { id: Number(projection.id), lootItemsSha256: hashValue(JSON.parse(projection.loot_items_json)) },
  };
  const scope = {
    operationId: DUPLICATE_RELATION_RETIREMENT_OPERATION_ID,
    targetRelationId: Number(relation.id), targetRecordKey: relation.record_key,
    targetSourceFactKey: relation.source_fact_key,
    survivorRelationId: Number(survivor.id), survivorRecordKey: survivor.record_key,
    projectionId: Number(projection.id),
  };
  return {
    schemaVersion: 1,
    proposalKind: 'canonical_npc_duplicate_relation_retirement',
    operationId: DUPLICATE_RELATION_RETIREMENT_OPERATION_ID,
    generatedAt,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    target: {
      database: 'terria_v1_relation',
      relationId: Number(relation.id),
      recordKey: relation.record_key,
      sourceFactKey: relation.source_fact_key,
      sourceMaintTable: relation.source_maint_table,
      sourceMaintRecordKey: relation.source_maint_record_key,
      sourceMaintId: relation.source_maint_id == null ? null : Number(relation.source_maint_id),
      npcInternalName: relation.npc_internal_name,
      itemInternalName: relation.item_internal_name,
      quantityText: relation.quantity_text,
      chanceText: relation.chance_text,
      beforeStatus: 1,
      beforeDeleted: 0,
      afterStatus: 0,
      afterDeleted: 1,
    },
    survivor: {
      relationId: Number(survivor.id), recordKey: survivor.record_key,
      sourceFactKey: survivor.source_fact_key,
      sourceMaintTable: survivor.source_maint_table,
      sourceMaintRecordKey: survivor.source_maint_record_key,
      sourceMaintId: survivor.source_maint_id == null ? null : Number(survivor.source_maint_id),
    },
    projection: {
      projectionId: Number(projection.id), internalName: projection.internal_name,
      relationRecordKey: survivor.record_key, changed: false,
    },
    writeTargets: [...WRITE_TARGETS],
    counts: { relationRetirements: 1, projectionChanges: 0, changedPhysicalRows: 1 },
    scopeSha256: hashValue(scope),
    beforeRowsSha256: hashValue(beforeRows),
    afterRowsSha256: hashValue({ relation: { id: Number(relation.id), status: 0, deleted: 1 }, survivor: beforeRows.survivor, projection: beforeRows.projection }),
    sourceEvidence: {
      relationSource: 'generated.npc_item_relations_bundle',
      duplicateSource: 'local-npc-admission',
      externalRequests: false,
    },
  };
}

export function validateDuplicateRelationRetirementInput({ input, proposal, proposalSha256 } = {}) {
  if (input?.schemaVersion !== 1 || input.operationId !== DUPLICATE_RELATION_RETIREMENT_OPERATION_ID) throw new Error('duplicate relation input contract is invalid');
  if (input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) throw new Error('duplicate relation input flags are invalid');
  if (!proposal || proposal.operationId !== DUPLICATE_RELATION_RETIREMENT_OPERATION_ID || proposal.applyAllowed !== false || proposal.databaseWrites !== false) throw new Error('duplicate relation proposal is invalid');
  if (!HASH_PATTERN.test(input.proposalSha256) || input.proposalSha256 !== proposalSha256) throw new Error('duplicate relation proposal hash drifted');
  if (!HASH_PATTERN.test(input.scopeSha256) || input.scopeSha256 !== proposal.scopeSha256) throw new Error('duplicate relation scope hash drifted');
  if (JSON.stringify(input.expectedCounts) !== JSON.stringify(proposal.counts)) throw new Error('duplicate relation counts drifted');
  if (JSON.stringify(input.writeTargets) !== JSON.stringify(WRITE_TARGETS)) throw new Error('duplicate relation write targets drifted');
  return true;
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

async function readCurrent(connection, proposal, { forUpdate = false } = {}) {
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [relationRows] = await connection.execute(
    'SELECT * FROM `terria_v1_relation`.`item_npc_loot_relations` WHERE id = ? AND record_key = ?' + lock,
    [proposal.target.relationId, proposal.target.recordKey],
  );
  const [survivorRows] = await connection.execute(
    'SELECT * FROM `terria_v1_relation`.`item_npc_loot_relations` WHERE id = ? AND record_key = ?' + lock,
    [proposal.survivor.relationId, proposal.survivor.recordKey],
  );
  const [projectionRows] = await connection.execute(
    'SELECT * FROM `terria_v1_relation`.`projection_npcs` WHERE id = ? AND internal_name = ?' + lock,
    [proposal.projection.projectionId, proposal.projection.internalName],
  );
  return { relation: relationRows[0], survivor: survivorRows[0], projection: projectionRows[0] };
}

export async function runDuplicateRelationRetirement({ repoRoot = process.cwd(), inputPath = INPUT_PATH, proposalPath = PROPOSAL_PATH, apply = false, outputPath = RESULT_PATH, mysqlModule } = {}) {
  const input = JSON.parse(fs.readFileSync(path.resolve(repoRoot, inputPath), 'utf8'));
  const proposal = JSON.parse(fs.readFileSync(path.resolve(repoRoot, proposalPath), 'utf8'));
  validateDuplicateRelationRetirementInput({ input, proposal, proposalSha256: hashFile(repoRoot, proposalPath) });
  if (!apply) return { operationId: DUPLICATE_RELATION_RETIREMENT_OPERATION_ID, apply: false, scopeSha256: proposal.scopeSha256, counts: proposal.counts, writeTargets: WRITE_TARGETS };

  const authorizedContext = loadAuthorizedOperationContext({ operationId: DUPLICATE_RELATION_RETIREMENT_OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext });
  consumeAuthorizedOperationDispatchPermit({ authorizedContext, decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json') });
  const connection = await loadMysqlModule({ repoRoot, mysqlModule }).createConnection(configFor(repoRoot));
  try {
    await connection.beginTransaction();
    try {
      const before = await readCurrent(connection, proposal, { forUpdate: true });
      assertRelation(before.relation, 'relation target', proposal.target.relationId);
      assertRelation(before.survivor, 'survivor', proposal.survivor.relationId);
      assertProjection(before.projection, before.survivor);
      const [result] = await connection.execute(
        'UPDATE `terria_v1_relation`.`item_npc_loot_relations` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND record_key = ? AND source_fact_key = ? AND source_maint_table = ? AND source_maint_record_key = ? AND status = 1 AND deleted = 0',
        [proposal.target.relationId, proposal.target.recordKey, proposal.target.sourceFactKey, proposal.target.sourceMaintTable, proposal.target.sourceMaintRecordKey],
      );
      if (Number(result?.affectedRows) !== 1) throw new Error('duplicate relation affected row count drifted');
      const [after] = await connection.execute(
        'SELECT status, deleted FROM `terria_v1_relation`.`item_npc_loot_relations` WHERE id = ? AND record_key = ?',
        [proposal.target.relationId, proposal.target.recordKey],
      );
      if (after.length !== 1 || active(after[0])) throw new Error('duplicate relation readback remained active');
      await connection.commit();
      return {
        schemaVersion: 1,
        resultKind: 'canonical_npc_duplicate_relation_retirement_result',
        operationId: DUPLICATE_RELATION_RETIREMENT_OPERATION_ID,
        status: 'COMPLETED',
        transactionCommitted: true,
        scopeSha256: proposal.scopeSha256,
        affected: proposal.counts,
        authorization: { decisionIdentity: authorizedContext.decisionIdentity, packetHash: authorizedContext.packetHash },
        readback: { retiredRelationId: proposal.target.relationId, activeRetiredRows: 0, survivorRelationId: proposal.survivor.relationId },
        preserved: { survivorRelation: true, projection: true, sourceFacts: true, sourceDetails: true, localRows: true },
        completedAt: new Date().toISOString(),
      };
    } catch (error) { await connection.rollback(); throw error; }
  } finally { await connection.end(); }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...parts] = String(arg).replace(/^--/, '').split('=');
    return [key, parts.join('=') || 'true'];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = parseArgs(process.argv.slice(2));
  runDuplicateRelationRetirement({
    inputPath: args.input ?? INPUT_PATH,
    proposalPath: args.proposal ?? PROPOSAL_PATH,
    outputPath: args.output ?? RESULT_PATH,
    apply: args.apply === 'true',
  }).then((result) => {
    if (args.apply === 'true') fs.writeFileSync(path.resolve(process.cwd(), args.output ?? RESULT_PATH), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify(result));
  }).catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
}
