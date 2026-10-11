#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import { assertRepositoryOrdinaryFile, assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { assertBuffFenceReadback } from './buff-canonical-governance-contract.mjs';
import { createBuffRecoveryJournalAdapter } from './buff-canonical-recovery-journal-adapter.mjs';
import { createBuffRecoveryJournalStore } from './buff-canonical-recovery-journal-store.mjs';
import {
  BUFF_ADDITIVE_RELATION_OPERATION_ID,
  applyBuffAdditiveRelationMutation,
  BUFF_ADDITIVE_RELATION_TABLES,
  buildBuffAdditiveRelationProposal,
  executeBuffAdditiveRelationTransaction,
  validateBuffAdditiveRelationProposal,
} from './buff-additive-relation-apply.mjs';

export { BUFF_ADDITIVE_RELATION_OPERATION_ID };

const repoRoot = getProjectRoot();
const EVIDENCE_PATH = '.local/tmp/buff-npc-infliction-verified-20261003-v7.json';
export const BUFF_ADDITIVE_RELATION_APPLY_OWNERSHIP_KEYS = Object.freeze([
  'relation.relation_buffs.inflicting_npcs_json',
  'relation.relation_buffs.source_evidence_json',
  'relation.npc_buff_relations.inflicts',
  'relation.projection_buffs.inflicting_npcs_json',
  'relation.projection_buffs.source_evidence_json',
]);
const BUFF_ADDITIVE_RELATION_WRITE_TARGETS = BUFF_ADDITIVE_RELATION_APPLY_OWNERSHIP_KEYS;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const FORMAL_DATABASES = Object.freeze(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']);

export function buildBuffAdditiveRelationPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) {
    throw new Error('Buff additive relation result label is required and must be normalized');
  }
  const prefix = `reports/authorization/canonical/${BUFF_ADDITIVE_RELATION_OPERATION_ID}.${resultLabel}`;
  return {
    proposalPath: `${prefix}.proposal.json`,
    resultPath: `${prefix}.result.json`,
    journalPath: `${prefix}.journal.json`,
  };
}

export function assertBuffAdditiveRelationApplyAuthorization({
  authorizedContext,
  proposal,
  paths,
  proposalHash,
} = {}) {
  if (authorizedContext?.authorizationStatus !== 'AUTHORIZED') {
    throw new Error('Buff additive relation apply requires an authorized packet');
  }
  if (authorizedContext.operationId !== BUFF_ADDITIVE_RELATION_OPERATION_ID) {
    throw new Error('Buff additive relation apply operation identity drifted');
  }
  if (!HASH_PATTERN.test(String(authorizedContext.packetHash ?? ''))
      || !String(authorizedContext.decisionIdentity ?? '').trim()) {
    throw new Error('Buff additive relation apply packet identity is incomplete');
  }
  if (JSON.stringify(authorizedContext.targetDatabases) !== JSON.stringify(FORMAL_DATABASES)) {
    throw new Error('Buff additive relation apply target databases drifted');
  }
  const manifest = authorizedContext.executionManifest;
  if (!manifest || manifest.executionClass !== 'formal_buff_additive_relation_apply'
      || manifest.databaseWrites !== true || manifest.networkAccess !== false) {
    throw new Error('Buff additive relation apply requires the canonical database-write manifest');
  }
  if (JSON.stringify(manifest.ownershipKeys) !== JSON.stringify(BUFF_ADDITIVE_RELATION_APPLY_OWNERSHIP_KEYS)) {
    throw new Error('Buff additive relation apply ownership scope drifted');
  }
  const binding = manifest.buffAdditiveRelation;
  if (!binding || binding.schemaVersion !== 'buff-additive-relation-operation-binding/v1'
      || binding.operationId !== BUFF_ADDITIVE_RELATION_OPERATION_ID
      || typeof binding.resultLabel !== 'string'
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(binding.resultLabel)
      || typeof binding.runId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(binding.runId)
      || typeof binding.fenceToken !== 'string'
      || !/^fence:[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(binding.fenceToken)
      || !paths || binding.proposalPath !== paths.proposalPath
      || binding.resultPath !== paths.resultPath
      || binding.journalPath !== paths.journalPath
      || !paths.proposalPath.includes(`.${binding.resultLabel}.`)
      || JSON.stringify(manifest.inputPaths) !== JSON.stringify([paths.proposalPath])
      || JSON.stringify(manifest.outputPaths) !== JSON.stringify([paths.resultPath, paths.journalPath])) {
    throw new Error('Buff additive relation apply artifact paths or runtime fence binding drifted');
  }
  if (!HASH_PATTERN.test(String(authorizedContext.executionManifestHash ?? ''))) {
    throw new Error('Buff additive relation apply manifest hash is invalid');
  }
  if (!Array.isArray(authorizedContext.requiredTechnicalFields)
      || !authorizedContext.requiredTechnicalFields.includes('executionManifestHash')) {
    throw new Error('Buff additive relation apply packet is missing manifest binding');
  }
  const proposalEntry = (authorizedContext.dataBundleEntries ?? [])
    .find((entry) => entry?.path === paths.proposalPath);
  if (!proposalEntry || !HASH_PATTERN.test(String(proposalEntry.contentHash ?? ''))) {
    throw new Error('Buff additive relation apply proposal binding is missing');
  }
  if (proposalHash != null && proposalEntry.contentHash !== proposalHash) {
    throw new Error('Buff additive relation apply proposal hash drifted');
  }
  if (!proposal || proposal.operationId !== BUFF_ADDITIVE_RELATION_OPERATION_ID
      || proposal.executable !== false || proposal.applyAllowed !== false
      || proposal.databaseWrites !== false || proposal.destructiveClear !== false) {
    throw new Error('Buff additive relation apply proposal must remain read-only evidence');
  }
  if (proposal.target?.database !== 'terria_v1_relation'
      || JSON.stringify(proposal.target?.tables) !== JSON.stringify(BUFF_ADDITIVE_RELATION_TABLES)
      || JSON.stringify(proposal.target?.writeTargets) !== JSON.stringify(BUFF_ADDITIVE_RELATION_WRITE_TARGETS)) {
    throw new Error('Buff additive relation apply proposal target scope drifted');
  }
  return true;
}

export async function prepareBuffAdditiveRelationProposal({
  repoRoot: suppliedRepoRoot = repoRoot,
  resultLabel,
  evidencePath = EVIDENCE_PATH,
  mysqlModule,
} = {}) {
  const root = path.resolve(suppliedRepoRoot);
  const paths = buildBuffAdditiveRelationPaths(resultLabel);
  assertFresh(root, paths.proposalPath);
  const evidenceTarget = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: path.resolve(root, evidencePath),
    label: 'Buff additive NPC evidence',
  });
  const evidenceBytes = fs.readFileSync(evidenceTarget);
  const evidenceArtifactSha256 = hashBytes(evidenceBytes);
  const artifact = JSON.parse(evidenceBytes.toString('utf8'));
  const evidence = artifact?.evidence;
  if (!evidence || !Array.isArray(evidence.facts) || !evidence.source) {
    throw new Error('Buff additive NPC evidence artifact is invalid');
  }
  const facts = evidence.facts.map((fact) => ({
    ...fact,
    npcId: fact.npcId ?? fact.npcSourceId,
    internalName: fact.internalName ?? fact.npcInternalName,
    name: fact.name ?? fact.npcName,
  }));
  const source = {
    ...evidence.source,
    schemaVersion: 'buff-npc-page-infliction-evidence/v1',
    artifactSha256: evidenceArtifactSha256,
  };
  const buffIds = [...new Set(facts.map((fact) => Number(fact.buffId)).filter(Number.isSafeInteger))];
  if (buffIds.length === 0) throw new Error('Buff additive NPC evidence has no Buff identities');
  const mysql = mysqlModule ?? await loadMysqlModule({ repoRoot: root });
  const connection = await mysql.createConnection(connectionOptions(root));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const relationQuery = selectBySourceId('terria_v1_relation.relation_buffs', buffIds);
    const projectionQuery = selectBySourceId('terria_v1_relation.projection_buffs', buffIds);
    const reverseQuery = selectBySourceId('terria_v1_relation.npc_buff_relations', buffIds, 'buff_source_id');
    const [relationBuffRows] = await connection.query(relationQuery.sql, relationQuery.values);
    const [projectionBuffRows] = await connection.query(projectionQuery.sql, projectionQuery.values);
    const [npcBuffRelationRows] = await connection.query(reverseQuery.sql, reverseQuery.values);
    proposal = buildBuffAdditiveRelationProposal({
      facts,
      source,
      relationBuffRows,
      npcBuffRelationRows,
      projectionBuffRows,
    });
    await connection.query('ROLLBACK');
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
  writePrivateJson(root, paths.proposalPath, proposal);
  return {
    operationId: BUFF_ADDITIVE_RELATION_OPERATION_ID,
    proposalPath: paths.proposalPath,
    proposalSha256: hashFile(path.resolve(root, paths.proposalPath)),
    scopeSha256: proposal.scopeSha256,
    factCount: proposal.summary.facts,
    changedRows: proposal.summary.changedRows,
  };
}

export async function applyBuffAdditiveRelationProposal({
  repoRoot: suppliedRepoRoot = repoRoot,
  resultLabel,
  env = process.env,
  mysqlModule,
  now = new Date().toISOString(),
} = {}) {
  const root = path.resolve(suppliedRepoRoot);
  const paths = buildBuffAdditiveRelationPaths(resultLabel);
  assertFresh(root, paths.resultPath);
  assertFresh(root, paths.journalPath);
  const context = loadAuthorizedOperationContext({
    repoRoot: root,
    operationId: BUFF_ADDITIVE_RELATION_OPERATION_ID,
    env,
    now,
  });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  const binding = context.executionManifest?.buffAdditiveRelation;
  if (!binding || binding.proposalPath !== paths.proposalPath
      || binding.resultPath !== paths.resultPath || binding.journalPath !== paths.journalPath) {
    throw new Error('Buff additive relation artifact path binding drifted');
  }
  const proposalBinding = (context.dataBundleEntries ?? []).find((entry) => entry.path === paths.proposalPath);
  if (!proposalBinding?.contentHash) throw new Error('Buff additive relation proposal binding is missing');
  const proposal = readPrivateJson(root, paths.proposalPath, proposalBinding.contentHash);
  validateBuffAdditiveRelationProposal(proposal);
  assertBuffAdditiveRelationApplyAuthorization({
    authorizedContext: context,
    proposal,
    paths,
    proposalHash: proposalBinding.contentHash,
  });
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  if (!['127.0.0.1', 'localhost', '::1'].includes(fingerprint.host) || Number(fingerprint.port) !== 13306) {
    throw new Error('Buff additive relation target must be the loopback local stack');
  }
  const mysql = mysqlModule ?? await loadMysqlModule({ repoRoot: root });
  const connection = await mysql.createConnection({
    host: fingerprint.host,
    port: fingerprint.port,
    user: env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: 'terria_v1_local',
    dateStrings: true,
  });
  const packet = {
    runId: binding.runId,
    fenceToken: binding.fenceToken,
    serverUuid: fingerprint.serverUuid,
    actor: context.actor,
    packetHash: context.packetHash,
    executionManifestHash: context.executionManifestHash,
  };
  const journal = createBuffRecoveryJournalAdapter({
    store: createBuffRecoveryJournalStore({ repoRoot: root, relativePath: paths.journalPath }),
    packet,
    envelopeSha256: proposalBinding.contentHash,
    operationId: BUFF_ADDITIVE_RELATION_OPERATION_ID,
  });
  try {
    const transaction = await executeBuffAdditiveRelationTransaction({
      connection,
      proposal,
      lockRuntime: async () => lockRuntime(connection, packet),
      readLockedRows: async () => readTargetRows(connection, proposal, true),
      consumeDispatchPermit: async () => {
        assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
        consumeAuthorizedOperationDispatchPermit({
          env,
          authorizedContext: context,
          decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'),
        });
      },
      applyMutation: ({ connection: txConnection, proposal: txProposal }) => applyBuffAdditiveRelationMutation({
        connection: txConnection,
        proposal: txProposal,
      }),
      readAfterRows: async () => readTargetRows(connection, proposal, true),
      journal,
    });
    const result = {
      schemaVersion: 1,
      resultKind: 'canonical_buff_additive_relation_apply_result',
      operationId: BUFF_ADDITIVE_RELATION_OPERATION_ID,
      status: 'COMPLETED',
      scopeSha256: proposal.scopeSha256,
      ...transaction,
      authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash },
      completedAt: now,
    };
    writePrivateJson(root, paths.resultPath, result);
    return result;
  } finally {
    await connection.end();
  }
}

async function lockRuntime(connection, packet) {
  const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, @@port AS serverPort');
  const [owners] = await connection.query(
    'SELECT username, status FROM terria_v1_local.crawler_automation_owner WHERE singleton_key = 1 FOR UPDATE',
  );
  const [fences] = await connection.query(
    'SELECT latest_run_id, fence_token, (expires_at > CURRENT_TIMESTAMP) AS active FROM terria_v1_local.crawler_automation_write_fence FOR UPDATE',
  );
  const active = (fences ?? []).filter((row) => Number(row.active) === 1);
  if (active.length !== 1) throw new Error('Buff additive relation ownership fence is missing or duplicated');
  if (servers?.length !== 1 || Number(servers[0].serverPort) !== 13306) throw new Error('Buff additive relation server identity is invalid');
  assertBuffFenceReadback({ packet, server: servers[0], owner: owners?.[0], fence: active[0] });
}

async function readTargetRows(connection, proposal, forUpdate = false) {
  const buffIds = [...new Set(proposal.facts.map((fact) => Number(fact.buffId)))];
  const relationQuery = selectBySourceId('terria_v1_relation.relation_buffs', buffIds, 'source_id', forUpdate);
  const projectionQuery = selectBySourceId('terria_v1_relation.projection_buffs', buffIds, 'source_id', forUpdate);
  const reverseQuery = selectBySourceId('terria_v1_relation.npc_buff_relations', buffIds, 'buff_source_id', forUpdate);
  const [relationBuffs] = await connection.query(relationQuery.sql, relationQuery.values);
  const [projectionBuffs] = await connection.query(projectionQuery.sql, projectionQuery.values);
  const [npcBuffRelations] = await connection.query(reverseQuery.sql, reverseQuery.values);
  return { relationBuffs, npcBuffRelations, projectionBuffs };
}

function selectBySourceId(table, ids, column = 'source_id', forUpdate = false) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => !Number.isSafeInteger(Number(id)))) {
    throw new Error('Buff additive relation source ID list is invalid');
  }
  return {
    sql: `SELECT * FROM ${table} WHERE ${column} IN (${ids.map(() => '?').join(',')}) ORDER BY id${forUpdate ? ' FOR UPDATE' : ''}`,
    values: ids.map(Number),
  };
}

function connectionOptions(root) {
  const config = loadLocalStackConfig(root);
  return {
    host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    dateStrings: true,
  };
}

function readPrivateJson(root, relativePath, expectedHash) {
  const target = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, relativePath), label: 'Buff additive relation proposal' });
  const bytes = fs.readFileSync(target);
  if (expectedHash != null && hashBytes(bytes) !== expectedHash) throw new Error('Buff additive relation proposal hash drifted');
  return JSON.parse(bytes.toString('utf8'));
}

function writePrivateJson(root, relativePath, value) {
  const target = assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relativePath), label: 'Buff additive relation artifact', createParent: true });
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function assertFresh(root, relativePath) {
  const target = path.resolve(root, relativePath);
  try { fs.lstatSync(target); throw new Error(`Buff additive relation artifact already exists: ${relativePath}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function hashFile(filePath) {
  return hashBytes(fs.readFileSync(filePath));
}

export function parseBuffAdditiveRelationArgs(argv = []) {
  const args = {};
  for (const token of argv) {
    const match = /^--(operation-id|result-label|apply|prepare)=(.+)$/.exec(token);
    if (!match || Object.hasOwn(args, match[1])) throw new Error('Buff additive relation CLI argument is invalid or duplicated');
    args[match[1]] = match[2];
  }
  if (args['operation-id'] !== BUFF_ADDITIVE_RELATION_OPERATION_ID
      || (args.apply === 'true') === (args.prepare === 'true')
      || (args.apply != null && args.apply !== 'true')
      || (args.prepare != null && args.prepare !== 'true')) {
    throw new Error('Buff additive relation CLI requires the exact operation and one explicit prepare/apply action');
  }
  return { operationId: args['operation-id'], resultLabel: args['result-label'], apply: args.apply === 'true' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseBuffAdditiveRelationArgs(process.argv.slice(2));
    const action = args.apply
      ? applyBuffAdditiveRelationProposal({ resultLabel: args.resultLabel })
      : prepareBuffAdditiveRelationProposal({ resultLabel: args.resultLabel });
    action.then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
