import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { assertRepositoryOrdinaryFile, assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import { computePolicySetHash } from '../automation/policy-set-hash.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import {
  ARMOR_SET_PROJECTION_INCREMENTAL_OPERATION_ID as OPERATION_ID,
  buildArmorSetProjectionIncrementalProposal,
  executeArmorSetProjectionIncrementalTransaction,
  readArmorProjectionRows,
  readArmorSourceRows,
  validateArmorSetProjectionIncrementalProposal,
} from './armor-set-projection-incremental.mjs';
import { resolveManagedImageUrlPrefixes } from './managed-image-url-policy.mjs';

export function buildArmorIncrementalPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) {
    throw new Error('Armor incremental result label is required and must be normalized');
  }
  const prefix = `reports/authorization/canonical/${OPERATION_ID}.${resultLabel}`;
  return { proposalPath: `${prefix}.proposal.json`, resultPath: `${prefix}.result.json` };
}

export function buildArmorIncrementalConnectionOptions(config) {
  const d = config?.database;
  if (!['127.0.0.1', 'localhost', '::1'].includes(d?.host)) throw new Error('Armor incremental target must be loopback');
  if (Number(d.port) !== 13306) throw new Error('Armor incremental target port must be 13306');
  // Relation lineage stores historical CST wall time. Projection readers already
  // return UTC-serialized SQL dates. Do not switch both sides to dateStrings.
  return { host: d.host, port: 13306, user: d.username, password: d.password,
    database: 'terria_v1_local', timezone: '+08:00', dateStrings: false };
}

export async function assertArmorIncrementalRuntimeFence({ connection, authorizedContext, serverUuid }) {
  const [owners] = await connection.query('SELECT username, status FROM terria_v1_local.crawler_automation_owner WHERE singleton_key = 1 FOR UPDATE');
  if (owners.length !== 1 || owners[0].status !== 'ACTIVE' || owners[0].username !== authorizedContext.actor) {
    throw new Error('Armor incremental active Owner drifted');
  }
  const [policies] = await connection.query('SELECT p.domain_id AS domainId, p.current_version AS policyVersion, pv.policy_hash AS policyHash '
    + 'FROM terria_v1_local.crawler_automation_policy p JOIN terria_v1_local.crawler_automation_policy_version pv '
    + 'ON pv.domain_id=p.domain_id AND pv.policy_version=p.current_version ORDER BY p.domain_id FOR UPDATE');
  if (computePolicySetHash(policies) !== authorizedContext.policySetHash) throw new Error('Armor incremental policy drifted');
  // Under REPEATABLE READ the full index range (including gaps) stays locked
  // until commit, preventing new fence admission during this serial operation.
  // Historical fences remain intact. Source/target row locks follow in core.
  const [fences] = await connection.query('SELECT id, (expires_at > CURRENT_TIMESTAMP) AS active FROM terria_v1_local.crawler_automation_write_fence ORDER BY id FOR UPDATE');
  if (fences.some(row => Number(row.active) !== 0)) throw new Error('Armor incremental live writer fence blocks publication');
  // Read clock after potentially blocking locks, not before waiting for them.
  const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, @@port AS serverPort, DATABASE() AS databaseName, '
    + "TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes, DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s') AS nowUtc");
  const server = servers[0];
  const now = Date.parse(`${String(server?.nowUtc).replace(' ', 'T')}Z`);
  const start = Date.parse(authorizedContext.authorizedAt);
  const end = Date.parse(authorizedContext.expiresAt);
  if (servers.length !== 1 || server.serverUuid !== serverUuid || Number(server.serverPort) !== 13306
      || server.databaseName !== 'terria_v1_local' || Number(server.timezoneOffsetMinutes) !== 480
      || !Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end) || now < start || now >= end) {
    throw new Error('Armor incremental server, timezone or DB-clock authorization validity drifted');
  }
}

export function readArmorIncrementalArtifact(repoRoot, relativePath, expectedHash = null) {
  const target = assertRepositoryOrdinaryFile({ repoRoot, filePath: path.resolve(repoRoot, relativePath), label: 'Armor incremental artifact' });
  const fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || (before.mode & 0o077) !== 0) throw new Error('Armor incremental artifact must be private and ordinary');
    const bytes = fs.readFileSync(fd);
    if (expectedHash != null && `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== expectedHash) {
      throw new Error('Armor incremental artifact hash drifted from authorization');
    }
    const value = JSON.parse(bytes.toString('utf8'));
    const after = fs.fstatSync(fd);
    const current = fs.lstatSync(target);
    if (before.dev !== current.dev || before.ino !== current.ino || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Armor incremental artifact changed while reading');
    return value;
  } finally { fs.closeSync(fd); }
}

export function writeArmorIncrementalArtifact(repoRoot, relativePath, value) {
  const target = assertRepositoryPathConfinement({ repoRoot, filePath: path.resolve(repoRoot, relativePath), label: 'Armor incremental artifact', createParent: true });
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function assertFreshOutput(repoRoot, relativePath) {
  const target = assertRepositoryPathConfinement({ repoRoot, filePath: path.resolve(repoRoot, relativePath), label: 'Armor incremental output', createParent: true });
  try { fs.lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`Armor incremental output already exists: ${relativePath}`);
}

export async function prepareArmorIncrementalProposal({ repoRoot = process.cwd(), resultLabel, mysqlModule } = {}) {
  const paths = buildArmorIncrementalPaths(resultLabel);
  assertFreshOutput(repoRoot, paths.proposalPath);
  assertFreshOutput(repoRoot, paths.resultPath);
  const mysql = await loadMysqlModule({ repoRoot, mysqlModule });
  const connection = await mysql.createConnection(buildArmorIncrementalConnectionOptions(loadLocalStackConfig(repoRoot)));
  let proposal;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes');
    if (Number(servers[0]?.timezoneOffsetMinutes) !== 480) throw new Error('Armor incremental source timezone drifted');
    proposal = buildArmorSetProjectionIncrementalProposal({
      beforeRows: await readArmorProjectionRows(connection), sourceRows: await readArmorSourceRows(connection),
      serverUuid: servers[0].serverUuid, managedImageUrlPrefixes: resolveManagedImageUrlPrefixes({ repoRoot }),
    });
  } finally { try { await connection.rollback(); } finally { await connection.end(); } }
  writeArmorIncrementalArtifact(repoRoot, paths.proposalPath, proposal);
  return { operationId: OPERATION_ID, proposalPath: paths.proposalPath, changedRowCount: proposal.changedRowCount, scopeSha256: proposal.scopeSha256 };
}

export async function applyArmorIncrementalProposal({ repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule } = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorIncrementalPaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: OPERATION_ID, env });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel) throw new Error('Armor incremental packet label drifted');
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || fingerprint.port !== options.port) throw new Error('Armor incremental packet target drifted');
  const binding = context.dataBundleEntries.find(entry => entry.path === paths.proposalPath);
  if (!binding?.contentHash) throw new Error('Armor incremental proposal binding is missing');
  const proposal = readArmorIncrementalArtifact(root, paths.proposalPath, binding.contentHash);
  validateArmorSetProjectionIncrementalProposal(proposal);
  const currentPrefixes = resolveManagedImageUrlPrefixes({ repoRoot: root, env });
  if (JSON.stringify([...currentPrefixes].sort()) !== JSON.stringify([...proposal.source.managedImageUrlPrefixes].sort())) {
    throw new Error('Armor incremental managed image prefixes drifted');
  }
  if (fingerprint.serverUuid !== proposal.serverFingerprint.serverUuid) throw new Error('Armor incremental proposal server drifted');
  assertFreshOutput(root, paths.resultPath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(options);
  let committed = false;
  let commitAttempted = false;
  let permitConsumed = false;
  let resultPublished = false;
  let preCommitRollbackConfirmed = false;
  let primaryError = null;
  const gate = () => assertArmorIncrementalRuntimeFence({ connection, authorizedContext: context, serverUuid: fingerprint.serverUuid });
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const transaction = await executeArmorSetProjectionIncrementalTransaction({
      // Wrap commit so authorization is rechecked after source/target waits and
      // again at the last reversible point. A no-op still consumes its permit.
      connection: {
        beginTransaction: () => connection.beginTransaction(),
        query: (...args) => connection.query(...args),
        execute: (...args) => connection.execute(...args),
        rollback: () => connection.rollback(),
        commit: async () => {
          try {
            await gate();
            assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
            if (!permitConsumed) consumePermit();
          } catch (error) {
            try { await connection.rollback(); preCommitRollbackConfirmed = true; }
            catch (rollbackError) { error.rollbackError = rollbackError; }
            throw error;
          }
          commitAttempted = true;
          await connection.commit();
        },
      },
      proposal,
      assertWriterFence: gate,
      consumeDispatchPermit: async () => {
        await gate();
        assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
        consumePermit();
      },
    });
    committed = true;
    const result = { schemaVersion: 1, resultKind: 'canonical_armor_set_projection_incremental_result',
      operationId: OPERATION_ID, status: 'COMPLETED', ...transaction,
      acceptance: transaction.affectedRows === 0 ? 'mechanism-no-op-only' : 'projection-publication-only',
      authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash }, completedAt: new Date().toISOString() };
    writeArmorIncrementalArtifact(root, paths.resultPath, result);
    resultPublished = true;
    return result;
  } catch (error) {
    primaryError = classifyExecutionError(error);
    throw primaryError;
  } finally {
    try { await connection.end(); } catch (teardownError) {
      if (primaryError) primaryError.teardownError = teardownError;
      else throw classifyExecutionError(teardownError);
    }
  }

  function classifyExecutionError(error) {
    if (preCommitRollbackConfirmed) error.requiresReadbackReconciliation = false;
    if (committed || commitAttempted) error.requiresReadbackReconciliation = true;
    // A rejected commit has an unknown outcome until a separate readback.
    error.transactionCommitted = committed ? true : commitAttempted ? null : false;
    error.commitAttempted = commitAttempted;
    error.dispatchPermitConsumed = permitConsumed;
    error.resultPublished = resultPublished;
    return error;
  }

  function consumePermit() {
    consumeAuthorizedOperationDispatchPermit({ env, authorizedContext: context, decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') });
    permitConsumed = true;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (const token of process.argv.slice(2)) {
    const match = /^--(operation-id|result-label|apply|prepare)=(.+)$/.exec(token);
    if (!match || Object.hasOwn(args, match[1])) throw new Error('Armor incremental CLI argument is invalid or duplicated');
    args[match[1]] = match[2];
  }
  if (args['operation-id'] !== OPERATION_ID || (args.apply === 'true') === (args.prepare === 'true')
      || Object.hasOwn(args, 'apply') && args.apply !== 'true' || Object.hasOwn(args, 'prepare') && args.prepare !== 'true') {
    throw new Error('Armor incremental CLI requires the exact operation and one explicit prepare/apply action');
  }
  const action = args.apply === 'true' ? applyArmorIncrementalProposal : prepareArmorIncrementalProposal;
  action({ resultLabel: args['result-label'] }).then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}; requiresReadbackReconciliation=${error.requiresReadbackReconciliation === true}\n`); process.exitCode = 1; });
}
