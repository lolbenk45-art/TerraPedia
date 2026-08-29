#!/usr/bin/env node

import { createHash } from 'node:crypto';
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
import { canonicalServerFingerprint } from '../automation/automation-database-contract.mjs';
import { canonicalizePolicySet } from '../automation/policy-set-hash.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { buildSecondaryRelations } from './secondary-relation-processor.mjs';
import { buildNpcCrawlerFactRelationInputs } from './sync-maint-to-relation.mjs';

export const NPC_BUFF_RELATION_RECOVERY_OPERATION_ID = 'canonical-npc-buff-relation-recovery';
export const NPC_BUFF_RELATION_RECOVERY_EXPECTED_COUNT = 1270;
export const NPC_BUFF_RELATION_RECOVERY_WRITE_TARGETS = Object.freeze([
  'relation.npc_buff_relations.buffs',
]);
export const NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH =
  'reports/runtime/local-data-chain-closure/20260824/ten-blocker-closure/072100/npc-buff-relation-recovery.proposal.json';
export const NPC_BUFF_RELATION_RECOVERY_INPUT_PATH =
  'reports/authorization/canonical/canonical-npc-buff-relation-recovery.retry-02.input.json';
export const NPC_BUFF_RELATION_RECOVERY_MANIFEST_PATH =
  'reports/authorization/canonical/canonical-npc-buff-relation-recovery.retry-02.execution-manifest.json';
export const NPC_BUFF_RELATION_RECOVERY_REQUEST_PATH =
  'reports/authorization/canonical/canonical-npc-buff-relation-recovery.retry-02.request.json';
export const NPC_BUFF_RELATION_RECOVERY_RESULT_PATH =
  'reports/authorization/canonical/canonical-npc-buff-relation-recovery.retry-02.result.json';

const TARGET_COLUMNS = Object.freeze([
  'record_key',
  'npc_source_id',
  'npc_internal_name',
  'npc_name',
  'buff_source_id',
  'buff_internal_name',
  'relation_type',
  'duration_ticks',
  'chance_value',
  'chance_text',
  'conditions',
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
  'status',
  'deleted',
]);

export function buildNpcBuffRelationRecoveryProposal({
  maintNpcRows = [],
  maintBuffRows = [],
  matchedCrawlerFacts = [],
  localRows = [],
  relationRows = [],
  serverUuid,
  expectedCount = NPC_BUFF_RELATION_RECOVERY_EXPECTED_COUNT,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!isUuid(serverUuid)) throw new Error('NPC Buff recovery server UUID is invalid');
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('NPC Buff recovery generatedAt is invalid');
  if (relationRows.length !== 0) {
    throw new Error('NPC Buff recovery requires the current relation table to be empty');
  }
  const mergedBuffRows = buildNpcCrawlerFactRelationInputs({
    maintNpcCrawlerFactRows: matchedCrawlerFacts,
    maintBuffRows,
  }).maintBuffRows;
  const rows = buildSecondaryRelations({
    maintNpcRows,
    maintBuffRows: mergedBuffRows,
  }).npcBuffRelations.map(toProposalRow).sort(compareRecordKey);
  if (rows.length !== expectedCount) {
    throw new Error(`NPC Buff recovery derived count drifted: expected ${expectedCount}, found ${rows.length}`);
  }
  assertUniqueRecordKeys(rows);
  const derivedComparable = rows.map(toComparableTuple).map(stableString).sort();
  const localComparable = localRows.map(toComparableTuple).map(stableString).sort();
  if (JSON.stringify(derivedComparable) !== JSON.stringify(localComparable)) {
    throw new Error('NPC Buff recovery local equivalence drifted from the maint-derived rows');
  }
  const keys = rows.map((row) => row.recordKey);
  const proposal = {
    schemaVersion: 1,
    proposalKind: 'canonical_npc_buff_relation_recovery',
    operationId: NPC_BUFF_RELATION_RECOVERY_OPERATION_ID,
    generatedAt,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    ownerCapability: 'buffs',
    serverFingerprint: {
      serverUuid,
      databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
    },
    source: {
      maintNpcRowCount: maintNpcRows.length,
      maintNpcRowsSha256: hashJson(maintNpcRows),
      maintBuffRowCount: maintBuffRows.length,
      maintBuffRowsSha256: hashJson(maintBuffRows),
      matchedCrawlerFactCount: matchedCrawlerFacts.length,
      matchedCrawlerFactsSha256: hashJson(matchedCrawlerFacts),
      derivation: 'buildNpcCrawlerFactRelationInputs -> buildSecondaryRelations.npcBuffRelations',
      localUsedAsAuthority: false,
    },
    target: {
      database: 'terria_v1_relation',
      table: 'terria_v1_relation.npc_buff_relations',
      columns: [...TARGET_COLUMNS],
      writeTargets: [...NPC_BUFF_RELATION_RECOVERY_WRITE_TARGETS],
      mutationMode: 'insert-only-empty-table',
    },
    keys,
    keySetSha256: hashJson(keys),
    before: { rowCount: 0, rowsSha256: hashJson([]) },
    after: { rowCount: rows.length, rowsSha256: hashJson(rows) },
    localEquivalence: {
      exact: true,
      rowCount: localComparable.length,
      derivedTupleSha256: hashJson(derivedComparable),
      localTupleSha256: hashJson(localComparable),
      role: 'downstream_equivalence_evidence_only',
    },
    expectedRowCount: expectedCount,
    changedRowCount: rows.length,
    rows,
  };
  proposal.scopeSha256 = computeScopeHash(proposal);
  validateNpcBuffRelationRecoveryProposal(proposal, { expectedCount });
  return proposal;
}

export function validateNpcBuffRelationRecoveryProposal(proposal, options = {}) {
  const expectedCount = options.expectedCount
    ?? proposal?.expectedRowCount
    ?? NPC_BUFF_RELATION_RECOVERY_EXPECTED_COUNT;
  if (proposal?.schemaVersion !== 1
      || proposal.proposalKind !== 'canonical_npc_buff_relation_recovery'
      || proposal.operationId !== NPC_BUFF_RELATION_RECOVERY_OPERATION_ID) {
    throw new Error('NPC Buff recovery proposal identity is invalid');
  }
  if (proposal.applyAllowed !== false || proposal.databaseWrites !== false
      || proposal.externalRequests !== false || proposal.ownerCapability !== 'buffs') {
    throw new Error('NPC Buff recovery proposal safety flags are invalid');
  }
  if (proposal.target?.database !== 'terria_v1_relation'
      || proposal.target?.table !== 'terria_v1_relation.npc_buff_relations'
      || proposal.target?.mutationMode !== 'insert-only-empty-table'
      || JSON.stringify(proposal.target?.columns) !== JSON.stringify(TARGET_COLUMNS)
      || JSON.stringify(proposal.target?.writeTargets) !== JSON.stringify(NPC_BUFF_RELATION_RECOVERY_WRITE_TARGETS)) {
    throw new Error('NPC Buff recovery proposal target drifted');
  }
  if (!Array.isArray(proposal.rows) || proposal.rows.length !== expectedCount
      || proposal.changedRowCount !== expectedCount || proposal.after?.rowCount !== expectedCount
      || proposal.before?.rowCount !== 0) {
    throw new Error(`NPC Buff recovery proposal count drifted: expected ${expectedCount}`);
  }
  assertUniqueRecordKeys(proposal.rows);
  const keys = proposal.rows.map((row) => row.recordKey);
  if (JSON.stringify(proposal.keys) !== JSON.stringify(keys)
      || proposal.keySetSha256 !== hashJson(keys)
      || proposal.before.rowsSha256 !== hashJson([])
      || proposal.after.rowsSha256 !== hashJson(proposal.rows)
      || proposal.scopeSha256 !== computeScopeHash(proposal)) {
    throw new Error('NPC Buff recovery proposal hash drifted');
  }
  if (proposal.localEquivalence?.exact !== true
      || proposal.localEquivalence?.rowCount !== expectedCount
      || proposal.localEquivalence?.derivedTupleSha256 !== proposal.localEquivalence?.localTupleSha256) {
    throw new Error('NPC Buff recovery proposal local equivalence is invalid');
  }
  return true;
}

export function buildNpcBuffRelationRecoveryInput({ proposal, proposalPath, proposalSha256 } = {}) {
  validateNpcBuffRelationRecoveryProposal(proposal);
  if (!isHash(proposalSha256)) throw new Error('NPC Buff recovery proposal byte hash is invalid');
  return {
    schemaVersion: 1,
    operationId: NPC_BUFF_RELATION_RECOVERY_OPERATION_ID,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    proposalPath,
    proposalSha256,
    scopeSha256: proposal.scopeSha256,
    keySetSha256: proposal.keySetSha256,
    beforeRowsSha256: proposal.before.rowsSha256,
    afterRowsSha256: proposal.after.rowsSha256,
    expectedCounts: { before: 0, after: proposal.rows.length, changed: proposal.rows.length },
    writeTargets: [...NPC_BUFF_RELATION_RECOVERY_WRITE_TARGETS],
  };
}

export function validateNpcBuffRelationRecoveryInput({ input, proposal, proposalSha256 } = {}) {
  validateNpcBuffRelationRecoveryProposal(proposal);
  if (input?.schemaVersion !== 1 || input.operationId !== NPC_BUFF_RELATION_RECOVERY_OPERATION_ID
      || input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) {
    throw new Error('NPC Buff recovery input identity or safety flags are invalid');
  }
  if (input.proposalPath !== NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH
      || input.proposalSha256 !== proposalSha256 || !isHash(proposalSha256)
      || input.scopeSha256 !== proposal.scopeSha256
      || input.keySetSha256 !== proposal.keySetSha256
      || input.beforeRowsSha256 !== proposal.before.rowsSha256
      || input.afterRowsSha256 !== proposal.after.rowsSha256
      || JSON.stringify(input.writeTargets) !== JSON.stringify(NPC_BUFF_RELATION_RECOVERY_WRITE_TARGETS)
      || Number(input.expectedCounts?.before) !== 0
      || Number(input.expectedCounts?.after) !== proposal.rows.length
      || Number(input.expectedCounts?.changed) !== proposal.rows.length) {
    throw new Error('NPC Buff recovery input binding drifted');
  }
  return true;
}

export async function executeNpcBuffRelationRecoveryTransaction({
  connection,
  proposal,
  consumeDispatchPermit,
  readCurrent = readNpcBuffRelationRows,
  insertRows = insertNpcBuffRelationRows,
  readback = readNpcBuffRelationRows,
} = {}) {
  if (!connection || typeof connection.beginTransaction !== 'function') {
    throw new Error('NPC Buff recovery database connection is required');
  }
  validateNpcBuffRelationRecoveryProposal(proposal);
  if (typeof consumeDispatchPermit !== 'function') {
    throw new Error('NPC Buff recovery dispatch permit consumer is required');
  }
  let began = false;
  try {
    await connection.beginTransaction();
    began = true;
    const before = await readCurrent(connection, proposal, { forUpdate: true });
    if (!Array.isArray(before) || before.length !== 0 || hashJson(before) !== proposal.before.rowsSha256) {
      throw new Error('NPC Buff recovery before-set drifted after lock');
    }
    await consumeDispatchPermit();
    const affectedRows = Number(await insertRows(connection, proposal.rows));
    if (affectedRows !== proposal.rows.length) {
      throw new Error('NPC Buff recovery affected row count drifted');
    }
    const after = (await readback(connection, proposal, { forUpdate: true }))
      .map(toProposalRow).sort(compareRecordKey);
    if (hashJson(after) !== proposal.after.rowsSha256) {
      throw new Error('NPC Buff recovery transaction readback drifted');
    }
    await connection.commit();
    return {
      transactionCommitted: true,
      affectedRows,
      afterRowsSha256: proposal.after.rowsSha256,
    };
  } catch (error) {
    if (began) await connection.rollback();
    throw error;
  }
}

export async function prepareNpcBuffRelationRecoveryProposal({
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
  expectedCount = NPC_BUFF_RELATION_RECOVERY_EXPECTED_COUNT,
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  assertFreshOutputPaths(root, [NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH]);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [server, maintNpcRows, maintBuffRows, matchedCrawlerFacts, localRows, relationRows] = await Promise.all([
      readRows(connection, 'SELECT @@server_uuid AS serverUuid'),
      readRows(connection, 'SELECT * FROM terria_v1_maint.maint_npcs WHERE status=1 AND deleted=0 ORDER BY source_id, internal_name'),
      readRows(connection, 'SELECT * FROM terria_v1_maint.maint_buffs WHERE status=1 AND deleted=0 ORDER BY source_id, internal_name'),
      readRows(connection, "SELECT * FROM terria_v1_maint.maint_npc_crawler_facts WHERE match_status='MATCHED' AND status=1 AND deleted=0 ORDER BY record_key"),
      readLocalEquivalenceRows(connection),
      readNpcBuffRelationRows(connection),
    ]);
    proposal = buildNpcBuffRelationRecoveryProposal({
      maintNpcRows,
      maintBuffRows,
      matchedCrawlerFacts,
      localRows,
      relationRows,
      serverUuid: server[0]?.serverUuid,
      generatedAt,
      expectedCount,
    });
    await connection.query('ROLLBACK');
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
  writePrivateJson(root, NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH, proposal);
  const proposalSha256 = hashFile(path.resolve(root, NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH));
  return {
    operationId: NPC_BUFF_RELATION_RECOVERY_OPERATION_ID,
    changedRowCount: proposal.changedRowCount,
    scopeSha256: proposal.scopeSha256,
    proposalSha256,
    proposalPath: NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH,
  };
}

export async function prepareNpcBuffRelationRecoveryAuthorization({
  repoRoot = process.cwd(),
  generatedAt = new Date().toISOString(),
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  assertFreshOutputPaths(root, [
    NPC_BUFF_RELATION_RECOVERY_INPUT_PATH,
    NPC_BUFF_RELATION_RECOVERY_MANIFEST_PATH,
    NPC_BUFF_RELATION_RECOVERY_REQUEST_PATH,
    NPC_BUFF_RELATION_RECOVERY_RESULT_PATH,
  ]);
  const proposal = readJson(root, NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH);
  validateNpcBuffRelationRecoveryProposal(proposal);
  const proposalSha256 = hashFile(path.resolve(root, NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH));
  const input = buildNpcBuffRelationRecoveryInput({
    proposal,
    proposalPath: NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH,
    proposalSha256,
  });
  writePrivateJson(root, NPC_BUFF_RELATION_RECOVERY_INPUT_PATH, input);
  const manifest = buildCanonicalOperationExecutionManifest({
    repoRoot: root,
    operationId: NPC_BUFF_RELATION_RECOVERY_OPERATION_ID,
    artifactDate: generatedAt.slice(0, 10),
  });
  writeCanonicalOperationExecutionManifest({
    repoRoot: root,
    outputPath: path.resolve(root, NPC_BUFF_RELATION_RECOVERY_MANIFEST_PATH),
    operationId: NPC_BUFF_RELATION_RECOVERY_OPERATION_ID,
    artifactDate: generatedAt.slice(0, 10),
  });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  let policyRows;
  try {
    policyRows = await readCurrentAutomationPolicyRows(connection);
  } finally {
    await connection.end();
  }
  const serverFingerprint = canonicalServerFingerprint({
    host: process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? 13306),
    serverUuid: proposal.serverFingerprint.serverUuid,
    databases: proposal.serverFingerprint.databases,
  });
  const request = buildCanonicalAuthorizationRequestForOperation({
    repoRoot: root,
    operationId: NPC_BUFF_RELATION_RECOVERY_OPERATION_ID,
    serverFingerprint,
    policyRows,
    executionManifest: manifest,
    generatedAt,
    expiresAt: new Date(Date.parse(generatedAt) + 24 * 60 * 60 * 1000).toISOString(),
  });
  writePrivateJson(root, NPC_BUFF_RELATION_RECOVERY_REQUEST_PATH, request);
  return {
    operationId: NPC_BUFF_RELATION_RECOVERY_OPERATION_ID,
    changedRowCount: proposal.changedRowCount,
    scopeSha256: proposal.scopeSha256,
    proposalSha256,
    requestSha256: hashFile(path.resolve(root, NPC_BUFF_RELATION_RECOVERY_REQUEST_PATH)),
    paths: {
      proposal: NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH,
      input: NPC_BUFF_RELATION_RECOVERY_INPUT_PATH,
      manifest: NPC_BUFF_RELATION_RECOVERY_MANIFEST_PATH,
      request: NPC_BUFF_RELATION_RECOVERY_REQUEST_PATH,
    },
  };
}

export async function applyNpcBuffRelationRecovery({
  repoRoot = process.cwd(),
  now = new Date().toISOString(),
  mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const proposal = readJson(root, NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH);
  const input = readJson(root, NPC_BUFF_RELATION_RECOVERY_INPUT_PATH);
  validateNpcBuffRelationRecoveryInput({
    input,
    proposal,
    proposalSha256: hashFile(path.resolve(root, NPC_BUFF_RELATION_RECOVERY_PROPOSAL_PATH)),
  });
  const context = loadAuthorizedOperationContext({
    operationId: NPC_BUFF_RELATION_RECOVERY_OPERATION_ID,
    now,
  });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context });
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(connectionOptions(root));
  try {
    const server = await readRows(connection, 'SELECT @@server_uuid AS serverUuid');
    if (server[0]?.serverUuid !== fingerprint.serverUuid
        || fingerprint.serverUuid !== proposal.serverFingerprint.serverUuid) {
      throw new Error('NPC Buff recovery database fingerprint drifted');
    }
    const result = await executeNpcBuffRelationRecoveryTransaction({
      connection,
      proposal,
      consumeDispatchPermit: () => consumeAuthorizedOperationDispatchPermit({
        authorizedContext: context,
        decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'),
      }),
    });
    const payload = {
      schemaVersion: 1,
      resultKind: 'canonical_npc_buff_relation_recovery_result',
      operationId: NPC_BUFF_RELATION_RECOVERY_OPERATION_ID,
      status: 'COMPLETED',
      transactionCommitted: true,
      affected: { relationNpcBuff: result.affectedRows },
      scopeSha256: proposal.scopeSha256,
      afterRowsSha256: result.afterRowsSha256,
      authorization: {
        decisionIdentity: context.decisionIdentity,
        packetHash: context.packetHash,
      },
      completedAt: now,
    };
    writePrivateJson(root, NPC_BUFF_RELATION_RECOVERY_RESULT_PATH, payload);
    return payload;
  } finally {
    await connection.end();
  }
}

export async function readNpcBuffRelationRows(connection, _proposal = null, { forUpdate = false } = {}) {
  return readRows(connection, `SELECT record_key AS recordKey, npc_source_id AS npcSourceId,
    npc_internal_name AS npcInternalName, npc_name AS npcName, buff_source_id AS buffSourceId,
    buff_internal_name AS buffInternalName, relation_type AS relationType,
    duration_ticks AS durationTicks, chance_value AS chanceValue, chance_text AS chanceText,
    conditions, source_maint_table AS sourceMaintTable,
    source_maint_record_key AS sourceMaintRecordKey, source_maint_id AS sourceMaintId,
    landing_source_id AS landingSourceId, landing_source_key AS landingSourceKey,
    landing_content_hash AS landingContentHash, source_provider AS sourceProvider,
    source_page AS sourcePage, source_revision_timestamp AS sourceRevisionTimestamp,
    confidence, reason, review_status AS reviewStatus, status, deleted
    FROM terria_v1_relation.npc_buff_relations ORDER BY record_key${forUpdate ? ' FOR UPDATE' : ''}`);
}

export async function insertNpcBuffRelationRows(connection, rows) {
  const sql = `INSERT INTO terria_v1_relation.npc_buff_relations
    (${TARGET_COLUMNS.map((column) => `\`${column}\``).join(', ')})
    VALUES (${TARGET_COLUMNS.map(() => '?').join(', ')})`;
  let affected = 0;
  for (const row of rows) {
    const values = TARGET_COLUMNS.map((column) => proposalValue(row, column));
    const [result] = await connection.execute(sql, values);
    affected += Number(result?.affectedRows ?? 0);
  }
  return affected;
}

async function readLocalEquivalenceRows(connection) {
  return readRows(connection, `SELECT n.source_id AS npcSourceId, n.internal_name AS npcInternalName,
    b.source_id AS buffSourceId, b.internal_name AS buffInternalName,
    r.relation_type AS relationType, r.duration_ticks AS durationTicks,
    r.chance_value AS chanceValue, r.chance_text AS chanceText,
    r.conditions, r.notes AS reason
    FROM terria_v1_local.npc_buff_relations r
    INNER JOIN terria_v1_local.npcs n ON n.id=r.npc_id AND n.deleted=0 AND n.status=1
    INNER JOIN terria_v1_local.buffs b ON b.id=r.buff_id AND b.deleted=0 AND b.status=1
    WHERE r.deleted=0 AND r.status=1 ORDER BY r.id`);
}

async function readCurrentAutomationPolicyRows(connection) {
  const rows = await readRows(connection,
    'SELECT p.domain_id AS domainId, p.current_version AS policyVersion, '
      + 'pv.policy_hash AS policyHash FROM terria_v1_local.crawler_automation_policy p '
      + 'JOIN terria_v1_local.crawler_automation_policy_version pv ON pv.domain_id=p.domain_id '
      + 'AND pv.policy_version=p.current_version ORDER BY p.domain_id');
  const canonical = canonicalizePolicySet(rows);
  if (canonical.length === 0) throw new Error('NPC Buff recovery automation policy rows are missing');
  return canonical;
}

function toProposalRow(row) {
  return {
    recordKey: text(row?.recordKey ?? row?.record_key),
    npcSourceId: numberOrNull(row?.npcSourceId ?? row?.npc_source_id),
    npcInternalName: text(row?.npcInternalName ?? row?.npc_internal_name),
    npcName: text(row?.npcName ?? row?.npc_name),
    buffSourceId: numberOrNull(row?.buffSourceId ?? row?.buff_source_id),
    buffInternalName: text(row?.buffInternalName ?? row?.buff_internal_name),
    relationType: text(row?.relationType ?? row?.relation_type),
    durationTicks: numberOrNull(row?.durationTicks ?? row?.duration_ticks),
    chanceValue: numberOrNull(row?.chanceValue ?? row?.chance_value),
    chanceText: text(row?.chanceText ?? row?.chance_text),
    conditions: text(row?.conditions),
    sourceMaintTable: text(row?.sourceMaintTable ?? row?.source_maint_table),
    sourceMaintRecordKey: text(row?.sourceMaintRecordKey ?? row?.source_maint_record_key),
    sourceMaintId: numberOrNull(row?.sourceMaintId ?? row?.source_maint_id),
    landingSourceId: numberOrNull(row?.landingSourceId ?? row?.landing_source_id),
    landingSourceKey: text(row?.landingSourceKey ?? row?.landing_source_key),
    landingContentHash: text(row?.landingContentHash ?? row?.landing_content_hash),
    sourceProvider: text(row?.sourceProvider ?? row?.source_provider),
    sourcePage: text(row?.sourcePage ?? row?.source_page),
    sourceRevisionTimestamp: timestampOrNull(row?.sourceRevisionTimestamp ?? row?.source_revision_timestamp),
    confidence: numberOrNull(row?.confidence),
    reason: text(row?.reason),
    reviewStatus: text(row?.reviewStatus ?? row?.review_status),
    status: Number(row?.status ?? 1),
    deleted: Number(row?.deleted ?? 0),
  };
}

function toComparableTuple(row) {
  return {
    npcSourceId: numberOrNull(row?.npcSourceId ?? row?.npc_source_id),
    npcInternalName: text(row?.npcInternalName ?? row?.npc_internal_name),
    buffSourceId: numberOrNull(row?.buffSourceId ?? row?.buff_source_id),
    buffInternalName: text(row?.buffInternalName ?? row?.buff_internal_name),
    relationType: text(row?.relationType ?? row?.relation_type),
    durationTicks: numberOrNull(row?.durationTicks ?? row?.duration_ticks),
    chanceValue: numberOrNull(row?.chanceValue ?? row?.chance_value),
    chanceText: text(row?.chanceText ?? row?.chance_text),
    conditions: text(row?.conditions),
    reason: text(row?.reason ?? row?.notes),
  };
}

function proposalValue(row, column) {
  const key = column.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
  return row[key];
}

function computeScopeHash(proposal) {
  return hashJson({
    operationId: proposal.operationId,
    ownerCapability: proposal.ownerCapability,
    serverFingerprint: proposal.serverFingerprint,
    source: proposal.source,
    target: proposal.target,
    keySetSha256: proposal.keySetSha256,
    before: proposal.before,
    after: proposal.after,
    localEquivalence: proposal.localEquivalence,
    expectedRowCount: proposal.expectedRowCount,
    changedRowCount: proposal.changedRowCount,
  });
}

function assertUniqueRecordKeys(rows) {
  const keys = new Set();
  for (const row of rows) {
    if (!/^[a-f0-9]{64}$/.test(row?.recordKey ?? '') || keys.has(row.recordKey)) {
      throw new Error('NPC Buff recovery record key is missing or duplicated');
    }
    keys.add(row.recordKey);
  }
}

function compareRecordKey(left, right) {
  return String(left.recordKey).localeCompare(String(right.recordKey));
}

function stableString(value) {
  return JSON.stringify(stableValue(value));
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(stableString(value)).digest('hex')}`;
}

function hashFile(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function isHash(value) {
  return /^sha256:[a-f0-9]{64}$/.test(String(value ?? ''));
}

function isUuid(value) {
  return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(value ?? ''));
}

function text(value) {
  const result = String(value ?? '').trim();
  return result || null;
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function timestampOrNull(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : String(value);
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

function readJson(repoRoot, relativePath) {
  const target = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'NPC Buff recovery artifact',
  });
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function writePrivateJson(repoRoot, relativePath, value) {
  const target = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'NPC Buff recovery artifact',
    createParent: true,
  });
  if (fs.existsSync(target)) throw new Error(`NPC Buff recovery artifact already exists: ${relativePath}`);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}

function assertFreshOutputPaths(repoRoot, relativePaths) {
  for (const relativePath of relativePaths) {
    if (fs.existsSync(path.resolve(repoRoot, relativePath))) {
      throw new Error(`NPC Buff recovery output already exists: ${relativePath}`);
    }
  }
}

function parseArgs(argv) {
  const result = {};
  for (const token of argv) {
    const [key, ...values] = String(token).replace(/^--/, '').split('=');
    result[key] = values.join('=');
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const action = args.apply === 'true'
    ? applyNpcBuffRelationRecovery()
    : args['prepare-authorization'] === 'true'
      ? prepareNpcBuffRelationRecoveryAuthorization()
      : prepareNpcBuffRelationRecoveryProposal();
  action.then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error}\n`);
      process.exitCode = 1;
    });
}
