#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { writeJsonNoOverwrite } from '../lib/wiki-item-utils.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
  loadAuthorizedOperationServerFingerprint,
} from '../automation/authorized-operation-context.mjs';
import {
  assertArmorIncrementalRuntimeFence,
  buildArmorIncrementalConnectionOptions,
  readArmorIncrementalArtifact,
} from '../relation/run-armor-set-projection-incremental.mjs';
import {
  assertArmorMissingAttributeOwnerDecisionBinding,
} from './armor-missing-attribute-owner-decision.mjs';
import {
  buildArmorMissingAttributeSourceProposal,
  executeArmorMissingAttributeSourceTransaction,
  readArmorMissingAttributeSourceSnapshot,
  validateArmorMissingAttributeSourceProposal,
} from './armor-missing-attribute-source-transaction.mjs';

const OPERATION_ID = 'canonical-armor-missing-attribute-source';
const OWNERSHIP = [
  'maint.source_dataset_landings.armor_attributes_raw',
  'maint.maint_armor_attribute_rows.missing_attribute_owners',
];

export function buildArmorMissingAttributeSourcePaths(resultLabel) {
  if (typeof resultLabel !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resultLabel)) {
    throw new Error('Armor missing-attribute result label is required and must be normalized');
  }
  const prefix = `reports/authorization/canonical/${OPERATION_ID}.${resultLabel}`;
  return {
    proposalPath: `${prefix}.proposal.json`,
    preparedPath: `${prefix}.prepared.json`,
    resultPath: `${prefix}.result.json`,
    ownerDecisionPath: `${prefix}.owner-decision.json`,
  };
}

function targetPath(root, relativePath) {
  return assertRepositoryPathConfinement({ repoRoot: root, filePath: path.resolve(root, relativePath),
    label: 'Armor missing-attribute artifact', createParent: true });
}

function requireFresh(root, relativePath) {
  const target = targetPath(root, relativePath);
  try { fs.lstatSync(target); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('Armor missing-attribute artifact already exists; use a fresh label');
}

function readBoundEntry(root, context, relativePath) {
  const binding = context.dataBundleEntries.find(entry => entry.path === relativePath);
  if (!binding?.contentHash) throw new Error(`Armor missing-attribute data binding is missing: ${relativePath}`);
  return readArmorIncrementalArtifact(root, relativePath, binding.contentHash);
}

/** Read-only preparation captures the current namespace; it never creates a write packet. */
export async function prepareArmorMissingAttributeSource({
  repoRoot = process.cwd(), resultLabel, candidate, mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorMissingAttributeSourcePaths(resultLabel);
  requireFresh(root, paths.proposalPath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root)));
  let proposal;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION READ ONLY');
    const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS timezoneOffsetMinutes');
    if (servers.length !== 1 || Number(servers[0].timezoneOffsetMinutes) !== 480) throw new Error('Armor missing-attribute preparation timezone drift');
    await readArmorMissingAttributeSourceSnapshot({ connection, candidate });
    proposal = buildArmorMissingAttributeSourceProposal({ candidate, serverUuid: servers[0].serverUuid });
  } finally {
    try { await connection.rollback(); } finally { await connection.end(); }
  }
  writeJsonNoOverwrite(targetPath(root, paths.proposalPath), proposal);
  return { operationId: OPERATION_ID, ...paths, proposalSha256: proposal.proposalSha256,
    databaseWrites: false, executionReady: false };
}

export async function applyArmorMissingAttributeSource({
  repoRoot = process.cwd(), resultLabel, env = process.env, mysqlModule,
} = {}) {
  const root = path.resolve(repoRoot);
  const paths = buildArmorMissingAttributeSourcePaths(resultLabel);
  const context = loadAuthorizedOperationContext({ repoRoot: root, operationId: OPERATION_ID, env });
  assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
  const manifest = context.executionManifest;
  if (manifest.resultLabel !== resultLabel || JSON.stringify(manifest.ownershipKeys) !== JSON.stringify(OWNERSHIP)) {
    throw new Error('Armor missing-attribute packet label/ownership drift');
  }
  if (manifest.missingAttributeSource?.executionReady !== true
      || manifest.missingAttributeSource?.ownerDecisionPath !== paths.ownerDecisionPath) {
    throw new Error('Armor missing-attribute source owner decision is not execution-ready');
  }
  const fingerprint = loadAuthorizedOperationServerFingerprint({ authorizedContext: context, env });
  const options = buildArmorIncrementalConnectionOptions(loadLocalStackConfig(root));
  if (fingerprint.host !== options.host || Number(fingerprint.port) !== options.port
      || JSON.stringify([...fingerprint.databases].sort()) !== JSON.stringify(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'])) {
    throw new Error('Armor missing-attribute packet server target drift');
  }
  const proposal = readBoundEntry(root, context, paths.proposalPath);
  validateArmorMissingAttributeSourceProposal(proposal);
  const decision = readBoundEntry(root, context, paths.ownerDecisionPath);
  assertArmorMissingAttributeOwnerDecisionBinding(decision, {
    proposalSha256: proposal.proposalSha256,
    evidenceSha256: proposal.candidate.sourceEvidence.sha256,
  });
  if (fingerprint.serverUuid !== proposal.serverUuid) throw new Error('Armor missing-attribute proposal server UUID drift');
  requireFresh(root, paths.preparedPath);
  requireFresh(root, paths.resultPath);
  const mysql = await loadMysqlModule({ repoRoot: root, mysqlModule });
  const connection = await mysql.createConnection(options);
  let primaryError; let result;
  const authorization = { packetHash: context.packetHash, decisionIdentity: context.decisionIdentity,
    policySetHash: context.policySetHash, actor: context.actor, serverFingerprint: fingerprint };
  const writeEvidence = (relativePath, evidence) => writeJsonNoOverwrite(targetPath(root, relativePath), {
    ...evidence, authorization, recordedAt: new Date().toISOString(),
  });
  try {
    result = await executeArmorMissingAttributeSourceTransaction({ connection, proposal,
      assertRuntimeFence: async () => {
        assertAuthorizedOperationDataBundle({ repoRoot: root, authorizedContext: context });
        await assertArmorIncrementalRuntimeFence({ connection, authorizedContext: context, serverUuid: fingerprint.serverUuid });
      },
      consumePermit: async () => consumeAuthorizedOperationDispatchPermit({ env, authorizedContext: context,
        decisionLedgerPath: path.join(root, 'reports/authorization/canonical/used-decisions.json') }),
      persistPrepared: async evidence => writeEvidence(paths.preparedPath, evidence),
      persistOutcome: async evidence => writeEvidence(paths.resultPath, evidence),
    });
    return result;
  } catch (error) { primaryError = error; throw error; }
  finally {
    try { await connection.end(); }
    catch (cause) {
      if (primaryError) (primaryError.suppressedErrors ??= []).push(cause);
      else {
        const error = new Error('Armor missing-attribute connection teardown failed', { cause });
        error.transactionCommitted = result?.status === 'COMMITTED';
        error.requiresReadbackReconciliation = true;
        throw error;
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    for (const token of process.argv.slice(2)) {
      const match = /^--(operation-id|result-label|apply)=(.+)$/.exec(token);
      if (!match || Object.hasOwn(options, match[1])) throw new Error('Armor missing-attribute CLI argument is invalid or duplicate');
      options[match[1]] = match[2];
    }
    if (options['operation-id'] !== OPERATION_ID || options.apply !== 'true') {
      throw new Error('Armor missing-attribute CLI requires the exact operation and --apply=true');
    }
    const result = await applyArmorMissingAttributeSource({ resultLabel: options['result-label'] });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}; requiresReadbackReconciliation=${error.requiresReadbackReconciliation === true}\n`);
    process.exitCode = 1;
  }
}
