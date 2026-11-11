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
  BUFF_NPC_SECONDARY_COLUMNS,
  BUFF_NPC_SECONDARY_OPERATION_ID,
  BUFF_NPC_SECONDARY_WRITE_TARGETS,
  buildBuffNpcSecondaryProposal,
  applyBuffNpcSecondaryMutation,
  executeBuffNpcSecondaryTransaction,
  hashJson,
  validateBuffNpcSecondaryProposal,
} from './buff-npc-secondary-apply.mjs';

export { BUFF_NPC_SECONDARY_OPERATION_ID };

const repoRoot = getProjectRoot();
export const BUFF_NPC_SECONDARY_CANDIDATE_PATH = '.local/tmp/buff-npc-secondary-candidate-20261006-v3.json';
const FORMAL_DATABASES = Object.freeze(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']);
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function buildBuffNpcSecondaryPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) {
    throw new Error('NPC secondary result label is required and must be normalized');
  }
  const prefix = `reports/authorization/canonical/${BUFF_NPC_SECONDARY_OPERATION_ID}.${resultLabel}`;
  return {
    proposalPath: `${prefix}.proposal.json`,
    resultPath: `${prefix}.result.json`,
    journalPath: `${prefix}.journal.json`,
  };
}

export function assertBuffNpcSecondaryApplyAuthorization({ authorizedContext, proposal, paths, proposalHash } = {}) {
  if (authorizedContext?.authorizationStatus !== 'AUTHORIZED') throw new Error('NPC secondary apply requires an authorized packet');
  if (authorizedContext.operationId !== BUFF_NPC_SECONDARY_OPERATION_ID) throw new Error('NPC secondary operation identity drifted');
  if (!HASH_PATTERN.test(String(authorizedContext.packetHash ?? '')) || !String(authorizedContext.decisionIdentity ?? '').trim()) {
    throw new Error('NPC secondary packet identity is incomplete');
  }
  if (JSON.stringify(authorizedContext.targetDatabases) !== JSON.stringify(FORMAL_DATABASES)) throw new Error('NPC secondary target databases drifted');
  const manifest = authorizedContext.executionManifest;
  if (!manifest || manifest.executionClass !== 'formal_buff_npc_secondary_apply'
      || manifest.databaseWrites !== true || manifest.networkAccess !== false
      || JSON.stringify(manifest.ownershipKeys) !== JSON.stringify(BUFF_NPC_SECONDARY_WRITE_TARGETS)) {
    throw new Error('NPC secondary database-write manifest is invalid');
  }
  const binding = manifest.buffNpcSecondary;
  if (!binding || binding.schemaVersion !== 'buff-npc-secondary-operation-binding/v1'
      || binding.operationId !== BUFF_NPC_SECONDARY_OPERATION_ID
      || typeof binding.resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(binding.resultLabel)
      || typeof binding.runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(binding.runId)
      || typeof binding.fenceToken !== 'string' || !/^fence:[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(binding.fenceToken)
      || !paths || binding.proposalPath !== paths.proposalPath || binding.resultPath !== paths.resultPath
      || binding.journalPath !== paths.journalPath
      || JSON.stringify(manifest.inputPaths) !== JSON.stringify([paths.proposalPath])
      || JSON.stringify(manifest.outputPaths) !== JSON.stringify([paths.resultPath, paths.journalPath])) {
    throw new Error('NPC secondary artifact paths or fence binding drifted');
  }
  if (!HASH_PATTERN.test(String(authorizedContext.executionManifestHash ?? ''))
      || !Array.isArray(authorizedContext.requiredTechnicalFields)
      || !authorizedContext.requiredTechnicalFields.includes('executionManifestHash')) {
    throw new Error('NPC secondary manifest binding is incomplete');
  }
  const proposalEntry = (authorizedContext.dataBundleEntries ?? []).find(entry => entry?.path === paths.proposalPath);
  if (!proposalEntry || !HASH_PATTERN.test(String(proposalEntry.contentHash ?? ''))) throw new Error('NPC secondary proposal binding is missing');
  if (proposalHash != null && proposalEntry.contentHash !== proposalHash) throw new Error('NPC secondary proposal hash drifted');
  validateBuffNpcSecondaryProposal(proposal);
  return true;
}

export async function prepareBuffNpcSecondaryProposal({
  repoRoot: suppliedRoot = repoRoot,
  resultLabel,
  candidatePath = BUFF_NPC_SECONDARY_CANDIDATE_PATH,
  mysqlModule,
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(suppliedRoot);
  const paths = buildBuffNpcSecondaryPaths(resultLabel);
  assertFresh(root, paths.proposalPath);
  const candidateTarget = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, candidatePath), label: 'NPC secondary candidate' });
  const candidateBytes = fs.readFileSync(candidateTarget);
  const candidateArtifactSha256 = hashBytes(candidateBytes);
  const candidate = JSON.parse(candidateBytes.toString('utf8'));
  const mysql = mysqlModule ?? await loadMysqlModule({ repoRoot: root });
  const connection = await mysql.createConnection(connectionOptions(root));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [[serverRows], [currentRows]] = await Promise.all([
      connection.query('SELECT @@server_uuid AS serverUuid'),
      connection.query(`SELECT ${BUFF_NPC_SECONDARY_COLUMNS.map(column => `\`${column}\``).join(', ')} FROM terria_v1_relation.npc_buff_relations WHERE status=1 AND deleted=0 ORDER BY id`),
    ]);
    if (serverRows?.[0]?.serverUuid !== candidate.serverUuid) throw new Error('NPC secondary candidate server UUID drifted');
    if (hashJson(currentRows) !== candidate.before.rowsSha256) throw new Error('NPC secondary live baseline drifted from candidate');
    proposal = buildBuffNpcSecondaryProposal({ candidate, candidateArtifactSha256, currentRows, generatedAt });
    await connection.query('ROLLBACK');
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
  writePrivateJson(root, paths.proposalPath, proposal);
  return {
    operationId: BUFF_NPC_SECONDARY_OPERATION_ID,
    proposalPath: paths.proposalPath,
    proposalSha256: hashFile(path.resolve(root, paths.proposalPath)),
    scopeSha256: proposal.scopeSha256,
    currentRowCount: proposal.summary.currentRowCount,
    insertCount: proposal.summary.insertCount,
    deferredCount: proposal.summary.deferredCount,
  };
}

export async function applyBuffNpcSecondaryProposal({
  repoRoot: suppliedRoot = repoRoot,
  resultLabel,
  env = process.env,
  mysqlModule,
  now = new Date().toISOString(),
} = {}) {
  const root = path.resolve(suppliedRoot);
  const paths = buildBuffNpcSecondaryPaths(resultLabel);
  assertFresh(root, paths.resultPath);
  assertFresh(root, paths.journalPath);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: BUFF_NPC_SECONDARY_OPERATION_ID, env, now });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  const binding = context.executionManifest?.buffNpcSecondary;
  if (!binding || binding.proposalPath !== paths.proposalPath || binding.resultPath !== paths.resultPath || binding.journalPath !== paths.journalPath) {
    throw new Error('NPC secondary artifact path binding drifted');
  }
  const proposalBinding = (context.dataBundleEntries ?? []).find(entry => entry.path === paths.proposalPath);
  if (!proposalBinding?.contentHash) throw new Error('NPC secondary proposal binding is missing');
  const proposal = readPrivateJson(root, paths.proposalPath, proposalBinding.contentHash);
  assertBuffNpcSecondaryApplyAuthorization({ authorizedContext: context, proposal, paths, proposalHash: proposalBinding.contentHash });
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  if (!['127.0.0.1', 'localhost', '::1'].includes(fingerprint.host) || Number(fingerprint.port) !== 13306) throw new Error('NPC secondary target must be loopback port 13306');
  const mysql = mysqlModule ?? await loadMysqlModule({ repoRoot: root });
  const connection = await mysql.createConnection({ host: fingerprint.host, port: fingerprint.port, user: env.TERRAPEDIA_DB_USERNAME ?? 'root', password: env.TERRAPEDIA_DB_PASSWORD ?? 'root', database: 'terria_v1_local', dateStrings: true });
  const packet = { runId: binding.runId, fenceToken: binding.fenceToken, serverUuid: fingerprint.serverUuid, actor: context.actor, packetHash: context.packetHash, executionManifestHash: context.executionManifestHash };
  const journal = createBuffRecoveryJournalAdapter({
    store: createBuffRecoveryJournalStore({ repoRoot: root, relativePath: paths.journalPath }),
    packet, envelopeSha256: proposalBinding.contentHash, operationId: BUFF_NPC_SECONDARY_OPERATION_ID,
  });
  try {
    const transaction = await executeBuffNpcSecondaryTransaction({
      connection,
      proposal,
      lockRuntime: async () => lockRuntime(connection, packet),
      readLockedRows: async () => readTargetRows(connection, true),
      consumeDispatchPermit: async () => {
        assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
        consumeAuthorizedOperationDispatchPermit({ env, authorizedContext: context, decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') });
      },
      applyMutation: ({ connection: txConnection, proposal: txProposal }) => applyBuffNpcSecondaryMutation({ connection: txConnection, proposal: txProposal }),
      readAfterRows: async () => readTargetRows(connection, false),
      journal,
    });
    const result = {
      schemaVersion: 1,
      resultKind: 'canonical_buff_npc_secondary_apply_result',
      operationId: BUFF_NPC_SECONDARY_OPERATION_ID,
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
  const [owners] = await connection.query('SELECT username, status FROM terria_v1_local.crawler_automation_owner WHERE singleton_key = 1 FOR UPDATE');
  const [fences] = await connection.query('SELECT latest_run_id, fence_token, (expires_at > CURRENT_TIMESTAMP) AS active FROM terria_v1_local.crawler_automation_write_fence FOR UPDATE');
  const active = (fences ?? []).filter(row => Number(row.active) === 1);
  if (active.length !== 1) throw new Error('NPC secondary ownership fence is missing or duplicated');
  if (servers?.length !== 1 || Number(servers[0].serverPort) !== 13306) throw new Error('NPC secondary server identity is invalid');
  assertBuffFenceReadback({ packet, server: servers[0], owner: owners?.[0], fence: active[0] });
}

async function readTargetRows(connection, forUpdate = false) {
  const orderBy = forUpdate ? 'id' : 'record_key';
  const [rows] = await connection.query(`SELECT ${BUFF_NPC_SECONDARY_COLUMNS.map(column => `\`${column}\``).join(', ')} FROM terria_v1_relation.npc_buff_relations WHERE status=1 AND deleted=0 ORDER BY ${orderBy}${forUpdate ? ' FOR UPDATE' : ''}`);
  return rows;
}

function connectionOptions(root) {
  const config = loadLocalStackConfig(root);
  return { host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1', port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306), user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root', password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root', dateStrings: true };
}
function readPrivateJson(root, relativePath, expectedHash) {
  const target = assertRepositoryOrdinaryFile({ repoRoot: root, filePath: path.resolve(root, relativePath), label: 'NPC secondary proposal' });
  const bytes = fs.readFileSync(target);
  if (hashBytes(bytes) !== expectedHash) throw new Error('NPC secondary proposal hash drifted');
  return JSON.parse(bytes.toString('utf8'));
}
function writePrivateJson(root, relativePath, value) {
  const target = assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relativePath), label: 'NPC secondary artifact', createParent: true });
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function assertFresh(root, relativePath) {
  try { fs.lstatSync(path.resolve(root, relativePath)); throw new Error(`NPC secondary artifact already exists: ${relativePath}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function hashBytes(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function hashFile(filePath) { return hashBytes(fs.readFileSync(filePath)); }

export function parseBuffNpcSecondaryArgs(argv = []) {
  const args = {};
  for (const token of argv) {
    const match = /^--(operation-id|result-label|candidate-path|apply|prepare)=(.+)$/.exec(token);
    if (!match || Object.hasOwn(args, match[1])) throw new Error('NPC secondary CLI argument is invalid or duplicated');
    args[match[1]] = match[2];
  }
  if (args['operation-id'] !== BUFF_NPC_SECONDARY_OPERATION_ID
      || (args.apply === 'true') === (args.prepare === 'true')
      || (args.apply != null && args.apply !== 'true') || (args.prepare != null && args.prepare !== 'true')) {
    throw new Error('NPC secondary CLI requires the exact operation and one explicit prepare/apply action');
  }
  if (args['candidate-path'] != null && args.apply === 'true') {
    throw new Error('NPC secondary candidate path override is only valid for prepare');
  }
  return {
    operationId: args['operation-id'],
    resultLabel: args['result-label'],
    candidatePath: args['candidate-path'],
    apply: args.apply === 'true',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseBuffNpcSecondaryArgs(process.argv.slice(2));
    const action = args.apply
      ? applyBuffNpcSecondaryProposal({ resultLabel: args.resultLabel })
      : prepareBuffNpcSecondaryProposal({ resultLabel: args.resultLabel, candidatePath: args.candidatePath });
    action.then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
