import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import {
  ARMOR_CANONICAL_OPERATION_ID,
  assertArmorCanonicalPacketBinding,
} from './armor-canonical-operation-binding.mjs';
import { validateArmorCanonicalFullChainIntent } from './armor-canonical-full-chain-intent.mjs';
import { executeArmorCanonicalTransaction } from './armor-canonical-transaction-executor.mjs';
import { createArmorCanonicalRecoveryJournalAdapter } from './armor-canonical-recovery-journal-adapter.mjs';
import { createArmorCanonicalRecoveryJournalStore } from './armor-canonical-recovery-journal-store.mjs';
import { createArmorCanonicalLockedRederivation } from './armor-canonical-locked-rederivation.mjs';

export function buildArmorCanonicalIngestionPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) {
    throw new Error('Armor canonical ingestion result label is required and must be normalized');
  }
  const prefix = `reports/authorization/canonical/${ARMOR_CANONICAL_OPERATION_ID}.${resultLabel}`;
  return {
    intentPath: `${prefix}.intent.json`,
    resultPath: `${prefix}.result.json`,
    journalPath: `${prefix}.journal.json`,
  };
}

export function buildArmorCanonicalIngestionConnectionOptions(config) {
  const database = config?.database;
  if (!['127.0.0.1', 'localhost', '::1'].includes(database?.host)) {
    throw new Error('Armor canonical ingestion target must be loopback');
  }
  if (Number(database.port) !== 13306) throw new Error('Armor canonical ingestion target port must be 13306');
  return {
    host: database.host,
    port: 13306,
    user: database.username,
    password: database.password,
    database: 'terria_v1_local',
    timezone: '+08:00',
    dateStrings: false,
  };
}

function readPrivateJson(repoRoot, relativePath, expectedHash = null) {
  const target = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'Armor canonical ingestion intent',
  });
  if ((fs.statSync(target).mode & 0o077) !== 0) throw new Error('Armor canonical ingestion intent must be private');
  const bytes = fs.readFileSync(target);
  if (expectedHash != null) {
    const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (actual !== expectedHash) throw new Error('Armor canonical ingestion intent hash drifted');
  }
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Armor canonical ingestion intent must be valid JSON'); }
}

function writePrivateJson(repoRoot, relativePath, value) {
  const target = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'Armor canonical ingestion result',
    createParent: true,
  });
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function hashEvidence(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex')}`;
}

export function readArmorCanonicalIngestionIntent({ repoRoot = process.cwd(), relativePath, expectedHash } = {}) {
  const intent = readPrivateJson(repoRoot, relativePath, expectedHash);
  validateArmorCanonicalFullChainIntent(intent);
  return intent;
}

export async function applyArmorCanonicalIngestion({
  repoRoot = process.cwd(),
  resultLabel,
  intentPath = null,
  env = process.env,
  mysqlModule,
  deriveLocked,
  now = new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorCanonicalIngestionPaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: ARMOR_CANONICAL_OPERATION_ID, env, now });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest.resultLabel !== resultLabel) throw new Error('Armor canonical ingestion packet label drifted');
  const binding = context.executionManifest.armorCanonicalIntent;
  if (intentPath !== paths.intentPath || binding?.intentPath !== paths.intentPath) {
    throw new Error('Armor canonical ingestion intent path drifted');
  }
  const intent = readArmorCanonicalIngestionIntent({
    repoRoot: root,
    relativePath: paths.intentPath,
    expectedHash: binding.intentFileSha256,
  });
  assertArmorCanonicalPacketBinding({ authorizedContext: context, binding, intent });
  const effectiveDeriveLocked = typeof deriveLocked === 'function'
    ? deriveLocked
    : createArmorCanonicalLockedRederivation({ expected: intent, repoRoot: root });
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  if (!['127.0.0.1', 'localhost', '::1'].includes(fingerprint.host)
      || Number(fingerprint.port) !== 13306
      || JSON.stringify(fingerprint.databases) !== JSON.stringify(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'])) {
    throw new Error('Armor canonical ingestion packet server target drifted');
  }
  const options = buildArmorCanonicalIngestionConnectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || fingerprint.port !== options.port) {
    throw new Error('Armor canonical ingestion packet target drifted from local runtime');
  }
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(options);
  const packet = {
    ...context,
    runId: binding.runId,
    fenceToken: binding.fenceToken,
    fenceCommit: binding.fenceCommit,
    serverUuid: fingerprint.serverUuid,
  };
  const store = createArmorCanonicalRecoveryJournalStore({ repoRoot: root, relativePath: paths.journalPath });
  let permitConsumed = false;
  const consumePermit = () => {
    if (permitConsumed) throw new Error('Armor canonical ingestion dispatch permit was consumed twice');
    consumeAuthorizedOperationDispatchPermit({
      env,
      authorizedContext: context,
      decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'),
    });
    permitConsumed = true;
  };
  const journal = createArmorCanonicalRecoveryJournalAdapter({
    store,
    packet,
    expected: intent,
    materialize: async ({ receipts, verifiedIdMap }) => ({
      intentSha256: intent.recoveryIntent.intentSha256,
      receipts,
      verifiedIdMap,
      concreteAfterSha256: hashEvidence({
        intentSha256: intent.recoveryIntent.intentSha256,
        receipts,
        verifiedIdMap,
      }),
    }),
  });
  const governedJournal = Object.freeze({
    ...journal,
    async materialized(args) {
      const result = await journal.materialized(args);
      consumePermit();
      return result;
    },
  });
  try {
    const transaction = await executeArmorCanonicalTransaction({
      connection,
      packet,
      expected: intent,
      deriveLocked: effectiveDeriveLocked,
      journal: governedJournal,
    });
    const result = {
      schemaVersion: 1,
      resultKind: 'canonical_armor_ingestion_result',
      operationId: ARMOR_CANONICAL_OPERATION_ID,
      status: 'COMPLETED',
      transaction,
      authorization: { decisionIdentity: context.decisionIdentity, packetHash: context.packetHash },
      completedAt: now,
    };
    writePrivateJson(root, paths.resultPath, result);
    return result;
  } finally {
    await connection.end();
    void permitConsumed;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = {};
  for (const token of process.argv.slice(2)) {
    const match = /^--(operation-id|result-label|intent|apply)=(.+)$/.exec(token);
    if (!match || Object.hasOwn(args, match[1])) throw new Error('Armor canonical ingestion CLI argument is invalid or duplicated');
    args[match[1]] = match[2];
  }
  if (args['operation-id'] !== ARMOR_CANONICAL_OPERATION_ID || args.apply !== 'true' || args.intent == null) {
    throw new Error('Armor canonical ingestion CLI requires the exact operation, intent path and --apply=true');
  }
  applyArmorCanonicalIngestion({ resultLabel: args['result-label'], intentPath: args.intent })
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}; requiresReadbackReconciliation=${error.requiresReadbackReconciliation === true}\n`); process.exitCode = 1; });
}
