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
  BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID,
  applyBuffNpcInflictionDedupMutation,
  buildBuffNpcInflictionDedupProposal,
  executeBuffNpcInflictionDedupTransaction,
  hashBuffNpcInflictionDedupJson,
  validateBuffNpcInflictionDedupProposal,
} from './buff-npc-infliction-dedup.mjs';

export { BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID };

const repoRoot = getProjectRoot();
export const BUFF_NPC_INFLICTION_DEDUP_SOURCE_PATH = '.local/tmp/buff-npc-infliction-verified-20261003-v6.json';
const FORMAL_DATABASES = Object.freeze(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']);
const WRITE_TARGETS = Object.freeze(['relation.npc_buff_relations.inflicts.status_deleted']);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function buildBuffNpcInflictionDedupPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) {
    throw new Error('NPC infliction dedup result label is required and must be normalized');
  }
  const prefix = `reports/authorization/canonical/${BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID}.${resultLabel}`;
  return {
    proposalPath: `${prefix}.proposal.json`,
    resultPath: `${prefix}.result.json`,
    journalPath: `${prefix}.journal.json`,
    readbackPath: `${prefix}.readback.json`,
  };
}

export function assertBuffNpcInflictionDedupApplyAuthorization({
  authorizedContext,
  proposal,
  paths,
  proposalHash,
} = {}) {
  if (authorizedContext?.authorizationStatus !== 'AUTHORIZED') throw new Error('NPC infliction dedup requires an authorized packet');
  if (authorizedContext.operationId !== BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID) throw new Error('NPC infliction dedup operation identity drifted');
  if (!HASH_PATTERN.test(String(authorizedContext.packetHash ?? '')) || !String(authorizedContext.decisionIdentity ?? '').trim()) {
    throw new Error('NPC infliction dedup packet identity is incomplete');
  }
  if (JSON.stringify(authorizedContext.targetDatabases) !== JSON.stringify(FORMAL_DATABASES)) {
    throw new Error('NPC infliction dedup target databases drifted');
  }
  const manifest = authorizedContext.executionManifest;
  const binding = manifest?.buffNpcInflictionDedup;
  if (!manifest || manifest.executionClass !== 'formal_buff_npc_infliction_dedup'
      || manifest.databaseWrites !== true || manifest.networkAccess !== false
      || JSON.stringify(manifest.ownershipKeys) !== JSON.stringify(WRITE_TARGETS)
      || !binding || binding.schemaVersion !== 'buff-npc-infliction-dedup-operation-binding/v1'
      || binding.operationId !== BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID
      || typeof binding.resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(binding.resultLabel)
      || typeof binding.runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(binding.runId)
      || typeof binding.fenceToken !== 'string' || !/^fence:[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(binding.fenceToken)
      || !paths || binding.proposalPath !== paths.proposalPath || binding.resultPath !== paths.resultPath
      || binding.journalPath !== paths.journalPath || binding.readbackPath !== paths.readbackPath
      || JSON.stringify(manifest.inputPaths) !== JSON.stringify([paths.proposalPath, BUFF_NPC_INFLICTION_DEDUP_SOURCE_PATH])
      || JSON.stringify(manifest.outputPaths) !== JSON.stringify([paths.resultPath, paths.journalPath, paths.readbackPath])) {
    throw new Error('NPC infliction dedup manifest, artifact paths, or runtime fence binding drifted');
  }
  if (!HASH_PATTERN.test(String(authorizedContext.executionManifestHash ?? ''))
      || !Array.isArray(authorizedContext.requiredTechnicalFields)
      || !authorizedContext.requiredTechnicalFields.includes('executionManifestHash')) {
    throw new Error('NPC infliction dedup manifest binding is incomplete');
  }
  const entries = authorizedContext.dataBundleEntries ?? [];
  const proposalEntry = entries.find(entry => entry?.path === paths.proposalPath);
  const sourceEntry = entries.find(entry => entry?.path === BUFF_NPC_INFLICTION_DEDUP_SOURCE_PATH);
  if (!proposalEntry || !HASH_PATTERN.test(String(proposalEntry.contentHash ?? ''))
      || !sourceEntry || !HASH_PATTERN.test(String(sourceEntry.contentHash ?? ''))) {
    throw new Error('NPC infliction dedup source/proposal bundle binding is missing');
  }
  if (proposalHash != null && proposalEntry.contentHash !== proposalHash) throw new Error('NPC infliction dedup proposal hash drifted');
  validateBuffNpcInflictionDedupProposal(proposal);
  if (proposal.source.artifactSha256 !== sourceEntry.contentHash) throw new Error('NPC infliction dedup source artifact hash drifted');
  return true;
}

export async function prepareBuffNpcInflictionDedupProposal({
  repoRoot: suppliedRoot = repoRoot,
  resultLabel,
  mysqlModule,
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(suppliedRoot);
  const paths = buildBuffNpcInflictionDedupPaths(resultLabel);
  assertFresh(root, [paths.proposalPath]);
  const sourcePath = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: path.resolve(root, BUFF_NPC_INFLICTION_DEDUP_SOURCE_PATH),
    label: 'NPC infliction dedup source evidence',
  });
  const sourceBytes = fs.readFileSync(sourcePath);
  const sourceArtifactSha256 = hashBytes(sourceBytes);
  const sourceArtifact = parseJson(sourceBytes, 'NPC infliction dedup source evidence');
  const sourceEvidence = sourceArtifact.evidence;
  if (sourceArtifact.databaseWrites !== false
      || !HASH_PATTERN.test(String(sourceArtifact.manifestSha256 ?? ''))
      || sourceEvidence?.schemaVersion !== 'buff-npc-page-infliction-evidence/v1'
      || !Array.isArray(sourceEvidence.facts)) {
    throw new Error('NPC infliction dedup source evidence is not a verified read-only artifact');
  }
  const targetPairs = new Set(['222:20', '370:30', '370:148', '668:32', '668:47']);
  const facts = sourceEvidence.facts.filter(fact => targetPairs.has(`${Number(fact?.npcSourceId)}:${Number(fact?.buffId)}`));
  const mysql = mysqlModule ?? await loadMysqlModule({ repoRoot: root });
  const connection = await mysql.createConnection(connectionOptions(root));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [serverRows] = await connection.query('SELECT @@server_uuid AS serverUuid');
    const currentBuffRows = await readMaintSourceRows(connection);
    const [currentRows] = await connection.query('SELECT * FROM terria_v1_relation.npc_buff_relations WHERE status=1 AND deleted=0 ORDER BY id');
    if (serverRows?.length !== 1 || typeof serverRows[0].serverUuid !== 'string') {
      throw new Error('NPC infliction dedup MySQL server identity is unavailable');
    }
    proposal = buildBuffNpcInflictionDedupProposal({
      facts,
      source: { artifactSha256: sourceArtifactSha256, manifestSha256: sourceArtifact.manifestSha256 },
      currentBuffRows,
      currentRows,
      serverUuid: serverRows[0].serverUuid,
      generatedAt,
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
    operationId: BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID,
    proposalPath: paths.proposalPath,
    proposalSha256: hashFile(path.resolve(root, paths.proposalPath)),
    scopeSha256: proposal.scopeSha256,
    serverUuid: proposal.serverUuid,
    activeRowCountBefore: proposal.before.activeRowCount,
    activeRowCountAfter: proposal.after.activeRowCount,
    retirementCount: proposal.summary.retirementCount,
  };
}

export async function applyBuffNpcInflictionDedupProposal({
  repoRoot: suppliedRoot = repoRoot,
  resultLabel,
  env = process.env,
  mysqlModule,
  now = new Date().toISOString(),
} = {}) {
  const root = path.resolve(suppliedRoot);
  const paths = buildBuffNpcInflictionDedupPaths(resultLabel);
  assertFresh(root, [paths.resultPath, paths.journalPath, paths.readbackPath]);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID, env, now });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  const binding = context.executionManifest?.buffNpcInflictionDedup;
  if (!binding || binding.proposalPath !== paths.proposalPath || binding.resultPath !== paths.resultPath
      || binding.journalPath !== paths.journalPath || binding.readbackPath !== paths.readbackPath) {
    throw new Error('NPC infliction dedup artifact path binding drifted');
  }
  const proposalBinding = (context.dataBundleEntries ?? []).find(entry => entry.path === paths.proposalPath);
  if (!proposalBinding?.contentHash) throw new Error('NPC infliction dedup proposal binding is missing');
  const proposal = readPrivateJson(root, paths.proposalPath, proposalBinding.contentHash);
  assertBuffNpcInflictionDedupApplyAuthorization({
    authorizedContext: context,
    proposal,
    paths,
    proposalHash: proposalBinding.contentHash,
  });
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  if (!['127.0.0.1', 'localhost', '::1'].includes(fingerprint.host) || Number(fingerprint.port) !== 13306) {
    throw new Error('NPC infliction dedup target must be loopback port 13306');
  }
  const mysql = mysqlModule ?? await loadMysqlModule({ repoRoot: root });
  const connectionOptionsValue = {
    host: fingerprint.host,
    port: fingerprint.port,
    user: env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: 'terria_v1_local',
    dateStrings: true,
  };
  const connection = await mysql.createConnection(connectionOptionsValue);
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
    operationId: BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID,
  });
  let transaction;
  try {
    transaction = await executeBuffNpcInflictionDedupTransaction({
      connection,
      proposal,
      packet,
      lockRuntime: async () => lockRuntime(connection, packet),
      readLockedMaintSourceRows: async () => readMaintSourceRows(connection, true),
      readLockedRows: async () => readActiveRows(connection, true),
      consumeDispatchPermit: async () => {
        assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
        consumeAuthorizedOperationDispatchPermit({
          env,
          authorizedContext: context,
          decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'),
        });
      },
      applyMutation: ({ connection: txConnection, proposal: txProposal }) => (
        applyBuffNpcInflictionDedupMutation({ connection: txConnection, proposal: txProposal })
      ),
      readAfterRows: async () => readExpectedAfterRows(connection, proposal, true),
      journal,
    });
  } finally {
    await connection.end();
  }
  const readback = await readBuffNpcInflictionDedupIndependentAfterSet({
    mysql,
    connectionOptions: connectionOptionsValue,
    proposal,
    expectedServerUuid: fingerprint.serverUuid,
  });
  const readbackArtifact = {
    schemaVersion: 1,
    resultKind: 'canonical_buff_npc_infliction_dedup_readback',
    operationId: BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID,
    proposalSha256: proposalBinding.contentHash,
    beforeRowsSha256: proposal.before.rowsSha256,
    expectedAfterRowsSha256: proposal.after.rowsSha256,
    actualAfterRowsSha256: hashBuffNpcInflictionDedupJson(readback.rows),
    activeRowCount: readback.rows.filter(row => Number(row.status) === 1 && Number(row.deleted) === 0).length,
    retiredIds: proposal.changes.retirements.map(change => Number(change.before.id)),
    serverUuid: readback.serverUuid,
    verifiedAt: now,
  };
  writePrivateJson(root, paths.readbackPath, readbackArtifact);
  const result = {
    schemaVersion: 1,
    resultKind: 'canonical_buff_npc_infliction_dedup_result',
    operationId: BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID,
    status: 'COMPLETED',
    scopeSha256: proposal.scopeSha256,
    ...transaction,
    authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash },
    readbackPath: paths.readbackPath,
    readbackSha256: hashFile(path.resolve(root, paths.readbackPath)),
    completedAt: now,
  };
  writePrivateJson(root, paths.resultPath, result);
  return result;
}

async function lockRuntime(connection, packet) {
  const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, @@port AS serverPort');
  const [owners] = await connection.query('SELECT username, status FROM terria_v1_local.crawler_automation_owner WHERE singleton_key = 1 FOR UPDATE');
  const [fences] = await connection.query('SELECT latest_run_id, fence_token, (expires_at > CURRENT_TIMESTAMP) AS active FROM terria_v1_local.crawler_automation_write_fence FOR UPDATE');
  const active = (fences ?? []).filter(row => Number(row.active) === 1);
  if (active.length !== 1 || servers?.length !== 1 || Number(servers[0].serverPort) !== 13306) {
    throw new Error('NPC infliction dedup server or ownership fence is invalid');
  }
  assertBuffFenceReadback({ packet, server: servers[0], owner: owners?.[0], fence: active[0] });
}

async function readActiveRows(connection, forUpdate = false) {
  const [rows] = await connection.query(
    `SELECT * FROM terria_v1_relation.npc_buff_relations WHERE status=1 AND deleted=0 ORDER BY id${forUpdate ? ' FOR UPDATE' : ''}`
  );
  return rows;
}

async function readMaintSourceRows(connection, forUpdate = false) {
  const [rows] = await connection.query(
    'SELECT source_id, internal_name, raw_json, status, deleted FROM terria_v1_maint.maint_buffs WHERE source_id IN (20, 30, 32, 47, 148) ORDER BY source_id'
      + (forUpdate ? ' FOR UPDATE' : '')
  );
  return rows;
}

async function readExpectedAfterRows(connection, proposal, forUpdate = false) {
  const retiredIds = proposal.changes.retirements.map(change => Number(change.before.id));
  const placeholders = retiredIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT * FROM terria_v1_relation.npc_buff_relations WHERE (status=1 AND deleted=0) OR id IN (${placeholders}) ORDER BY id${forUpdate ? ' FOR UPDATE' : ''}`,
    retiredIds
  );
  return rows;
}

export async function readBuffNpcInflictionDedupIndependentAfterSet({
  mysql,
  connectionOptions: options,
  proposal,
  expectedServerUuid,
} = {}) {
  const connection = await mysql.createConnection(options);
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [serverRows] = await connection.query('SELECT @@server_uuid AS serverUuid');
    if (serverRows?.length !== 1 || serverRows[0].serverUuid !== expectedServerUuid) {
      throw new Error('NPC infliction dedup readback server identity drifted');
    }
    const rows = await readExpectedAfterRows(connection, proposal, false);
    if (hashBuffNpcInflictionDedupJson(rows) !== proposal.after.rowsSha256) {
      throw new Error('NPC infliction dedup independent after-set readback drifted');
    }
    await connection.query('ROLLBACK');
    return { serverUuid: serverRows[0].serverUuid, rows };
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
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
  const target = assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: path.resolve(root, relativePath),
    label: 'NPC infliction dedup proposal',
  });
  const bytes = fs.readFileSync(target);
  if (hashBytes(bytes) !== expectedHash) throw new Error('NPC infliction dedup proposal hash drifted');
  return parseJson(bytes, 'NPC infliction dedup proposal');
}

function writePrivateJson(root, relativePath, value) {
  const target = assertRepositoryPathConfinement({
    repoRoot: root,
    filePath: path.resolve(root, relativePath),
    label: 'NPC infliction dedup artifact',
    createParent: true,
  });
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function assertFresh(root, relativePaths) {
  for (const relativePath of relativePaths) {
    try {
      fs.lstatSync(path.resolve(root, relativePath));
      throw new Error(`NPC infliction dedup artifact already exists: ${relativePath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} JSON is invalid: ${error.message}`);
  }
}

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function hashFile(filePath) {
  return hashBytes(fs.readFileSync(filePath));
}

export function parseBuffNpcInflictionDedupArgs(argv = []) {
  const args = {};
  for (const token of argv) {
    const match = /^--(operation-id|result-label|apply|prepare)=(.+)$/.exec(token);
    if (!match || Object.hasOwn(args, match[1])) throw new Error('NPC infliction dedup CLI argument is invalid or duplicated');
    args[match[1]] = match[2];
  }
  if (args['operation-id'] !== BUFF_NPC_INFLICTION_DEDUP_OPERATION_ID
      || (args.apply === 'true') === (args.prepare === 'true')
      || (args.apply != null && args.apply !== 'true')
      || (args.prepare != null && args.prepare !== 'true')) {
    throw new Error('NPC infliction dedup CLI requires the exact operation and one explicit prepare/apply action');
  }
  return {
    operationId: args['operation-id'],
    resultLabel: args['result-label'],
    apply: args.apply === 'true',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseBuffNpcInflictionDedupArgs(process.argv.slice(2));
    const result = args.apply
      ? await applyBuffNpcInflictionDedupProposal({ resultLabel: args.resultLabel })
      : await prepareBuffNpcInflictionDedupProposal({ resultLabel: args.resultLabel });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`Buff NPC infliction dedup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
