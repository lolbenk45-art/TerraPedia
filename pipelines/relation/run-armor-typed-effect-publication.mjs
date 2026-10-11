#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalStackConfig, resolveBackendApiBase } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { writeJsonNoOverwrite } from '../lib/wiki-item-utils.mjs';
import { writeArmorIncrementalArtifact, readArmorIncrementalArtifact,
  buildArmorIncrementalConnectionOptions, assertArmorIncrementalRuntimeFence } from './run-armor-set-projection-incremental.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import {
  executeArmorTypedEffectPublicationTransaction,
  reconcileArmorTypedEffectPublicationReadback,
  readArmorTypedEffectSourceSnapshot,
} from './armor-typed-effect-publication-db.mjs';
import { buildArmorTypedEffectPublicationPlan, validateArmorTypedEffectPublicationPlan } from './armor-typed-effect-publication.mjs';
import { buildArmorTypedEffectPostCommitAcceptance } from './armor-typed-effect-runtime-acceptance.mjs';

export const ARMOR_TYPED_EFFECT_PUBLICATION_OPERATION_ID =
  'canonical-armor-typed-effect-publication';

function normalizePostCommitAcceptance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schemaVersion !== 'armor-projection-api-acceptance/v1'
      || !['verified', 'blocked'].includes(value.status)
      || typeof value.runtimeVerified !== 'boolean'
      || value.databaseWrites !== false || value.apiReadOnly !== true || value.postCommit !== true
      || !Array.isArray(value.blockers)) {
    throw new Error('Armor post-commit projection/API acceptance evidence is invalid');
  }
  return structuredClone(value);
}

function pendingPostCommitAcceptance() {
  return {
    schemaVersion: 'armor-projection-api-acceptance/v1',
    status: 'blocked',
    runtimeVerified: false,
    databaseWrites: false,
    apiReadOnly: true,
    postCommit: true,
    blockers: [{ code: 'projection-api-readback-adapter-required' }],
  };
}

function buildRuntimeAcceptanceAdapter(repoRoot) {
  const apiBase = resolveBackendApiBase({}, { repoRoot });
  return input => buildArmorTypedEffectPostCommitAcceptance({
    ...input,
    repoRoot,
    apiBase,
  });
}

export function buildArmorTypedEffectPublicationPaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) {
    throw new Error('Armor typed-effect publication result label is required and must be normalized');
  }
  const prefix = `reports/authorization/canonical/${ARMOR_TYPED_EFFECT_PUBLICATION_OPERATION_ID}.${resultLabel}`;
  return {
    proposalPath: `${prefix}.proposal.json`,
    preparedPath: `${prefix}.prepared.json`,
    resultPath: `${prefix}.result.json`,
    reconciliationPath: `${prefix}.reconciliation.json`,
  };
}

export function assertArmorTypedEffectPublicationReady() {
  return true;
}

function assertFreshArtifact(repoRoot, relativePath) {
  const target = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'Armor typed-effect artifact',
    createParent: true,
  });
  try { fs.lstatSync(target); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`Armor typed-effect artifact already exists: ${relativePath}`);
}

export async function prepareArmorTypedEffectPublication({
  repoRoot = process.cwd(), resultLabel, mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorTypedEffectPublicationPaths(resultLabel);
  for (const relativePath of Object.values(paths)) assertFreshArtifact(root, relativePath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(
    buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root)),
  );
  let proposal;
  let primaryError;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION READ ONLY');
    const [servers] = await connection.query(
      'SELECT @@server_uuid AS serverUuid, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes',
    );
    if (!Array.isArray(servers) || servers.length !== 1 || Number(servers[0].timezoneOffsetMinutes) !== 480) {
      throw new Error('Armor typed-effect preparation server or timezone identity drift');
    }
    const sources = await readArmorTypedEffectSourceSnapshot({ connection });
    const [currentRelationRows] = await connection.query(
      'SELECT * FROM terria_v1_relation.relation_equipment_effect_attributes ORDER BY id',
    );
    if (!Array.isArray(currentRelationRows)) throw new Error('Armor typed-effect relation snapshot is invalid');
    proposal = buildArmorTypedEffectPublicationPlan({ ...sources, currentRelationRows });
    await validateArmorTypedEffectPublicationPlan(proposal);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try { await connection.rollback(); }
    catch (cause) { if (primaryError) primaryError.rollbackError = cause; else throw cause; }
    try { await connection.end(); }
    catch (cause) { if (primaryError) primaryError.connectionTeardownError = cause; else throw cause; }
  }
  writeJsonNoOverwrite(path.resolve(root, paths.proposalPath), proposal);
  return {
    operationId: ARMOR_TYPED_EFFECT_PUBLICATION_OPERATION_ID,
    ...paths,
    proposalSha256: proposal.proposalSha256,
    plannedChanges: {
      inserts: proposal.changes.inserts.length,
      updates: proposal.changes.updates.length,
      retirements: proposal.changes.retire.length,
    },
    sourceFingerprint: proposal.sourceFingerprint,
    databaseWrites: false,
    applyAllowed: false,
  };
}

function requirePrivateOutputFresh(repoRoot, relativePath) {
  const target = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'Armor typed-effect reconciliation output',
    createParent: true,
  });
  try { fs.lstatSync(target); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('Armor typed-effect reconciliation artifact already exists');
}

function assertPreparedAttempt(prepared, proposal, paths) {
  const fingerprint = prepared?.authorization?.serverFingerprint;
  const targetDatabases = ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'];
  if (!['armor-typed-effect-publication-attempt/v1', 'armor-typed-effect-publication-execution/v1'].includes(prepared?.schemaVersion)
      || prepared.operationId !== ARMOR_TYPED_EFFECT_PUBLICATION_OPERATION_ID
      || prepared.status !== 'PREPARED'
      || prepared.proposalPath !== paths.proposalPath
      || prepared.proposalSha256 !== proposal.proposalSha256
      || prepared.proposalContentSha256 !== `sha256:${createHash('sha256')
        .update(`${JSON.stringify(proposal, null, 2)}\n`, 'utf8').digest('hex')}`
      || JSON.stringify(prepared.sourceFingerprint) !== JSON.stringify(proposal.sourceFingerprint)
      || typeof prepared.authorization?.decisionIdentity !== 'string'
      || !prepared.authorization.decisionIdentity.trim()
      || !/^sha256:[a-f0-9]{64}$/.test(prepared.authorization?.packetHash ?? '')
      || typeof fingerprint?.serverUuid !== 'string' || !fingerprint.serverUuid.trim()
      || !['127.0.0.1', 'localhost', '::1'].includes(fingerprint.host)
      || Number(fingerprint.port) !== 13306
      || JSON.stringify([...(fingerprint.databases ?? [])].sort()) !== JSON.stringify(targetDatabases)) {
    throw new Error('Armor typed-effect PREPARED attempt binding is invalid or drifted');
  }
  if (!Number.isFinite(Date.parse(prepared.preparedAt ?? prepared.recordedAt))) {
    throw new Error('Armor typed-effect PREPARED timestamp is invalid');
  }
  return fingerprint;
}

/** Reconciles a prior prepared attempt using read-only DB evidence and no new authorization. */
export async function reconcileArmorTypedEffectPublication({
  repoRoot = process.cwd(), resultLabel, mysqlModule, recordedAt = new Date().toISOString(),
  postCommitAcceptance,
} = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorTypedEffectPublicationPaths(resultLabel);
  requirePrivateOutputFresh(root, paths.reconciliationPath);
  const prepared = readArmorIncrementalArtifact(root, paths.preparedPath);
  const proposal = readArmorIncrementalArtifact(root, paths.proposalPath, prepared?.proposalContentSha256);
  await validateArmorTypedEffectPublicationPlan(proposal);
  const serverFingerprint = assertPreparedAttempt(prepared, proposal, paths);
  const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root));
  if (serverFingerprint.host !== options.host || Number(serverFingerprint.port) !== options.port) {
    throw new Error('Armor typed-effect reconciliation database target drift');
  }
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(options);
  let result;
  let primaryError;
  try {
    result = await reconcileArmorTypedEffectPublicationReadback({
      connection,
      proposal,
      expectedServerUuid: serverFingerprint.serverUuid,
    });
    if (result.projectionAndApiReadbackRequired) {
        const acceptance = typeof postCommitAcceptance === 'function'
        ? normalizePostCommitAcceptance(await postCommitAcceptance({
          proposal: structuredClone(proposal),
          reconciliation: structuredClone(result),
          connection,
        }))
        : pendingPostCommitAcceptance();
      result = {
        ...result,
        postCommitAcceptance: acceptance,
        runtimeVerified: acceptance.status === 'verified' && acceptance.runtimeVerified === true,
      };
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try { await connection.end(); }
    catch (cause) {
      if (primaryError) primaryError.connectionTeardownError = cause;
      else throw new Error('Armor typed-effect reconciliation connection teardown failed', { cause });
    }
  }
  const recorded = {
    ...result,
    attemptLabel: resultLabel,
    recordedAt,
    authorization: {
      decisionIdentity: prepared.authorization.decisionIdentity,
      packetHash: prepared.authorization.packetHash,
      serverUuid: serverFingerprint.serverUuid,
    },
    databaseWrites: false,
    permitConsumed: false,
  };
  writeArmorIncrementalArtifact(root, paths.reconciliationPath, recorded);
  return recorded;
}

export async function applyArmorTypedEffectPublication({
  repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule, postCommitAcceptance,
} = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorTypedEffectPublicationPaths(resultLabel);
  const context = loadAuthorizedOperationContext({
    repoRoot: root,
    operationId: ARMOR_TYPED_EFFECT_PUBLICATION_OPERATION_ID,
    env,
  });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  if (context.executionManifest?.resultLabel !== resultLabel) {
    throw new Error('Armor typed-effect packet label drifted');
  }
  if (context.executionManifest?.typedEffectPublication?.executionReady !== true) {
    throw new Error('Armor typed-effect packet is not execution-ready');
  }
  const acceptanceAdapter = postCommitAcceptance ?? buildRuntimeAcceptanceAdapter(root);
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || Number(fingerprint.port) !== options.port
      || fingerprint.serverUuid == null
      || JSON.stringify([...fingerprint.databases].sort())
        !== JSON.stringify(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'])) {
    throw new Error('Armor typed-effect packet database target drifted');
  }
  const binding = context.dataBundleEntries.find(entry => entry.path === paths.proposalPath);
  if (!binding?.contentHash) throw new Error('Armor typed-effect proposal binding is missing');
  const proposal = readArmorIncrementalArtifact(root, paths.proposalPath, binding.contentHash);
  await validateArmorTypedEffectPublicationPlan(proposal);
  if (JSON.stringify(proposal.sourceFingerprint) !== JSON.stringify(context.executionManifest?.typedEffectPublication?.sourceFingerprint ?? proposal.sourceFingerprint)) {
    // Older manifests do not repeat the source tuple; the proposal remains the
    // authoritative source binding in that case.
    if (context.executionManifest?.typedEffectPublication?.sourceFingerprint != null) {
      throw new Error('Armor typed-effect source fingerprint drifted');
    }
  }
  assertFreshArtifact(root, paths.preparedPath);
  assertFreshArtifact(root, paths.resultPath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(options);
  const authorization = {
    decisionIdentity: context.decisionIdentity,
    packetHash: context.packetHash,
    serverFingerprint: fingerprint,
  };
  const proposalContentSha256 = `sha256:${createHash('sha256')
    .update(`${JSON.stringify(proposal, null, 2)}\n`, 'utf8').digest('hex')}`;
  const persist = (relativePath, evidence) => writeArmorIncrementalArtifact(root, relativePath, {
    ...evidence,
    proposalPath: paths.proposalPath,
    proposalContentSha256,
    authorization,
    recordedAt: new Date().toISOString(),
  });
  let primaryError;
  try {
    return await executeArmorTypedEffectPublicationTransaction({
      connection,
      proposal,
      assertRuntimeFence: async () => {
        assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
        await assertArmorIncrementalRuntimeFence({
          connection,
          authorizedContext: context,
          serverUuid: fingerprint.serverUuid,
        });
      },
      rederiveTypedEffects: ({ connection: lockedConnection }) => (
        readArmorTypedEffectSourceSnapshot({ connection: lockedConnection, forUpdate: true })
      ),
      consumePermit: async () => {
        assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
        consumeAuthorizedOperationDispatchPermit({
          env,
          authorizedContext: context,
          decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json'),
        });
      },
      persistPrepared: async evidence => persist(paths.preparedPath, evidence),
      persistOutcome: async evidence => persist(paths.resultPath, evidence),
      postCommitAcceptance: acceptanceAdapter,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try { await connection.end(); }
    catch (cause) {
      if (primaryError) (primaryError.suppressedErrors ??= []).push(cause);
      else throw cause;
    }
  }
}

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    const match = /^--(operation-id|result-label|prepare|apply|reconcile)=(.+)$/.exec(token);
    if (!match || Object.hasOwn(args, match[1])) {
      throw new Error('Armor typed-effect publication CLI argument is invalid or duplicated');
    }
    args[match[1]] = match[2];
  }
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args['operation-id'] !== ARMOR_TYPED_EFFECT_PUBLICATION_OPERATION_ID || args['result-label'] == null) {
      throw new Error('Armor typed-effect CLI requires the exact operation and result label');
    }
    if (args.prepare === 'true' && args.apply == null && args.reconcile == null) {
      const result = await prepareArmorTypedEffectPublication({ resultLabel: args['result-label'] });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else if (args.reconcile === 'true' && args.apply == null && args.prepare == null) {
      const result = await reconcileArmorTypedEffectPublication({
        resultLabel: args['result-label'],
        postCommitAcceptance: buildRuntimeAcceptanceAdapter(process.cwd()),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else if (args.prepare != null || args.reconcile != null || args.apply !== 'true') {
      throw new Error('Armor typed-effect CLI requires one of --prepare=true, --reconcile=true or --apply=true');
    } else {
      const result = await applyArmorTypedEffectPublication({
        resultLabel: args['result-label'],
        postCommitAcceptance: buildRuntimeAcceptanceAdapter(process.cwd()),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
