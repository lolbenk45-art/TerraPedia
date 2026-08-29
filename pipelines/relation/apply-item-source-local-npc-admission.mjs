#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID,
  assertAuthorizationEligibleProposal,
  assertItemSourceLocalNpcAdmissionInputContract,
  buildItemSourceLocalNpcAdmissionAttemptPaths,
} from './item-source-local-npc-admission-contract.mjs';
import {
  canonicalJson,
} from './item-source-local-npc-admission.mjs';
import {
  executeItemSourceLocalNpcAdmissionTransaction,
} from './item-source-local-npc-admission-db.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from '../automation/authorized-operation-context.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';

const INSERT_TABLES = Object.freeze([
  'terria_v1_local.source_dataset_landings',
  'terria_v1_maint.maint_npc_crawler_facts',
  'terria_v1_relation.item_source_facts',
  'terria_v1_relation.item_source_details',
  'terria_v1_relation.item_npc_shop_relations',
  'terria_v1_relation.item_npc_loot_relations',
  'terria_v1_local.item_acquisition_sources',
]);

export async function runItemSourceLocalNpcAdmissionApply(options = {}, dependencies = {}) {
  const inputContract = options.inputContract;
  const proposal = options.proposal;
  assertItemSourceLocalNpcAdmissionInputContract(inputContract);
  assertAuthorizationEligibleProposal(proposal);
  assertFrozenInputMatchesProposal({ inputContract, proposal });
  if (options.apply !== true) throw new Error('Item-source admission apply must be explicitly true');

  const repoRoot = path.resolve(String(options.repoRoot ?? getProjectRoot()));
  const inputContractPath = requireRelativePath(options.inputContractPath, 'Item-source admission input contract path');
  const outputPath = requireRelativePath(options.outputPath, 'Item-source admission result path');
  const paths = buildItemSourceLocalNpcAdmissionAttemptPaths(
    inputContract.proposalAuthorization.decisionIdentity,
  );
  if (inputContractPath !== paths.inputPath || outputPath !== paths.resultPath) {
    throw new Error('Item-source admission input and result must use the exact authorized attempt paths');
  }
  assertOutputAvailable(repoRoot, outputPath, dependencies);

  const now = requireTimestamp(options.now ?? new Date().toISOString(), 'Item-source admission now');
  if (typeof dependencies.loadAuthorizedContext !== 'function') {
    assertAuthorizationEnvironment({ repoRoot, paths });
  }
  const loadContext = dependencies.loadAuthorizedContext
    ?? (() => loadAuthorizedOperationContext({
      operationId: ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID,
      now,
    }));
  const authorizedContext = await loadContext({
    operationId: ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID,
    now,
  });
  if (authorizedContext?.operationId !== ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID
      || authorizedContext?.decisionIdentity !== inputContract.proposalAuthorization.decisionIdentity) {
    throw new Error('Item-source admission authorized context drifted from the input contract');
  }
  const assertDataBundle = dependencies.assertAuthorizedDataBundle
    ?? assertAuthorizedOperationDataBundle;
  await assertDataBundle({ repoRoot, authorizedContext, inputContract, proposal });

  const connect = dependencies.connect
    ?? ((context) => openDefaultConnection({ repoRoot, target: context.target }));
  const connection = await connect({
    repoRoot,
    target: inputContract.databaseFingerprint,
    authorizedContext,
  });
  try {
    const assertFingerprint = dependencies.assertDatabaseFingerprint
      ?? assertLiveDatabaseFingerprint;
    await assertFingerprint({ connection, expected: inputContract.databaseFingerprint });
    const consumeDispatchPermit = dependencies.consumeDispatchPermit
      ?? (() => consumeAuthorizedOperationDispatchPermit({
        authorizedContext,
        decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
      }));
    const executeTransaction = dependencies.executeTransaction
      ?? ((context) => executeItemSourceLocalNpcAdmissionTransaction({
        connection,
        inputContract,
        proposal,
        consumeDispatchPermit: context.consumeDispatchPermit,
      }));
    const outcome = await executeTransaction({
      connection,
      inputContract,
      proposal,
      authorizedContext,
      consumeDispatchPermit: () => consumeDispatchPermit({ authorizedContext, inputContract, proposal }),
    });
    const changedRowCount = assertOutcome({ outcome, inputContract });
    const result = Object.freeze({
      resultKind: 'item_source_local_npc_admission_result',
      operationId: ITEM_SOURCE_LOCAL_NPC_ADMISSION_OPERATION_ID,
      status: 'completed',
      apply: true,
      attemptId: paths.attemptId,
      attemptRoot: paths.attemptRoot,
      inputContractPath,
      proposalPath: inputContract.proposalPath,
      proposalSha256: inputContract.proposalSha256,
      proposalScopeHash: inputContract.proposalScopeHash,
      selectedIdentityHash: inputContract.selectedIdentityHash,
      beforeFingerprint: inputContract.beforeFingerprint,
      afterFingerprint: inputContract.afterFingerprint,
      changedRowCount,
      insertedCounts: outcome.insertedCounts,
      reconciledCount: outcome.reconciledCount,
      completedAt: now,
    });
    const writeResult = dependencies.writeResult
      ?? ((context) => writePrivateJson({ repoRoot, outputPath, value: context.result }));
    await writeResult({ repoRoot, outputPath, result });
    return result;
  } finally {
    await connection?.end?.();
  }
}

function assertFrozenInputMatchesProposal({ inputContract, proposal }) {
  for (const [inputField, proposalField] of [
    ['proposalScopeHash', 'scopeHash'],
    ['selectedIdentityHash', 'selectedIdentityHash'],
    ['beforeFingerprint', 'beforeFingerprint'],
    ['afterFingerprint', 'afterFingerprint'],
  ]) {
    if (inputContract[inputField] !== proposal[proposalField]) {
      throw new Error(`Item-source admission input ${inputField} drifted from the proposal`);
    }
  }
  if (canonicalJson(inputContract.tableBeforeFingerprints) !== canonicalJson(proposal.tableBeforeFingerprints)
      || canonicalJson(inputContract.databaseFingerprint) !== canonicalJson(proposal.databaseFingerprint)
      || canonicalJson(inputContract.sourceFreeze) !== canonicalJson(proposal.sourceFreeze)
      || Number(inputContract.expectedChangedRowCount) !== Number(proposal.changedRowCount)
      || Number(inputContract.expectedAcceptedCount) !== Number(proposal.summary?.accepted)
      || Number(inputContract.expectedLocalSourceReconciliationCount)
        !== Number(proposal.summary?.localSourceReconciliation)) {
    throw new Error('Item-source admission frozen input drifted from the proposal');
  }
}

function assertOutcome({ outcome, inputContract }) {
  const insertedCounts = outcome?.insertedCounts ?? {};
  for (const table of INSERT_TABLES) {
    const count = Number(insertedCounts[table]);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Item-source admission inserted count is invalid: ${table}`);
    }
  }
  if (Object.keys(insertedCounts).some((table) => !INSERT_TABLES.includes(table))) {
    throw new Error('Item-source admission transaction returned an unowned table count');
  }
  const reconciledCount = Number(outcome?.reconciledCount);
  if (!Number.isSafeInteger(reconciledCount) || reconciledCount < 0
      || reconciledCount !== Number(inputContract.expectedLocalSourceReconciliationCount)) {
    throw new Error('Item-source admission reconciliation count drifted');
  }
  const changedRowCount = INSERT_TABLES.reduce((total, table) => total + Number(insertedCounts[table]), 0)
    + reconciledCount;
  if (changedRowCount !== Number(inputContract.expectedChangedRowCount)) {
    throw new Error('Item-source admission changed row count drifted');
  }
  return changedRowCount;
}

function assertOutputAvailable(repoRoot, outputPath, dependencies) {
  if (typeof dependencies.assertOutputAvailable === 'function') {
    return dependencies.assertOutputAvailable({ repoRoot, outputPath });
  }
  const output = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, outputPath),
    label: 'Item-source admission result',
    createParent: true,
  });
  if (fs.existsSync(output)) throw new Error('Item-source admission result already exists; overwrite is forbidden');
  return output;
}

function assertAuthorizationEnvironment({ repoRoot, paths, env = process.env }) {
  const packetPath = path.resolve(requireText(
    env.TERRAPEDIA_AUTHORIZED_PACKET_PATH,
    'Item-source admission authorized packet path',
  ));
  const permitPath = path.resolve(requireText(
    env.TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH,
    'Item-source admission authorized dispatch permit path',
  ));
  if (packetPath !== path.resolve(repoRoot, paths.packetPath)
      || permitPath !== path.resolve(repoRoot, paths.permitPath)) {
    throw new Error('Item-source admission authorization artifacts must use the exact same-attempt paths');
  }
}

async function assertLiveDatabaseFingerprint({ connection, expected }) {
  const [rows] = await connection.query('SELECT @@server_uuid AS server_uuid');
  const actualUuid = String(rows?.[0]?.server_uuid ?? '').trim();
  if (!actualUuid || actualUuid !== expected.serverUuid) {
    throw new Error('Item-source admission database server fingerprint drifted');
  }
}

async function openDefaultConnection({ repoRoot, target }) {
  const require = createRequire(path.join(repoRoot, 'apps/admin-console', 'package.json'));
  const mysql = require('mysql2/promise');
  return mysql.createConnection({
    host: target.host,
    port: target.port,
    user: process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    multipleStatements: false,
  });
}

function writePrivateJson({ repoRoot, outputPath, value }) {
  const output = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, outputPath),
    label: 'Item-source admission result',
    createParent: true,
  });
  fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}

function parseArgs(argv) {
  const values = Object.fromEntries(argv.map((argument) => {
    const [key, ...parts] = String(argument).replace(/^--/, '').split('=');
    return [key, parts.join('=')];
  }));
  const allowed = new Set(['input-contract', 'output', 'apply']);
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) throw new Error(`Item-source admission apply does not accept --${key}`);
  }
  return values;
}

function readPrivateJson({ repoRoot, relativePath, label }) {
  const normalized = requireRelativePath(relativePath, `${label} path`);
  const absolute = assertRepositoryOrdinaryFile({
    repoRoot,
    filePath: path.resolve(repoRoot, normalized),
    label,
  });
  if ((fs.statSync(absolute).mode & 0o077) !== 0) throw new Error(`${label} must be private`);
  const bytes = fs.readFileSync(absolute);
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function requireRelativePath(value, label) {
  const normalized = requireText(value, label).replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || normalized === '..'
      || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`${label} must be repository-relative`);
  }
  return normalized;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireTimestamp(value, label) {
  const timestamp = requireText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${label} must be a valid timestamp`);
  return timestamp;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.apply !== 'true') throw new Error('Item-source admission apply must be explicitly true');
  const repoRoot = path.resolve(getProjectRoot());
  const inputContractPath = requireRelativePath(args['input-contract'], 'Item-source admission input contract path');
  const outputPath = requireRelativePath(args.output, 'Item-source admission result path');
  const inputArtifact = readPrivateJson({ repoRoot, relativePath: inputContractPath, label: 'Item-source admission input contract' });
  assertItemSourceLocalNpcAdmissionInputContract(inputArtifact.value);
  const proposalArtifact = readPrivateJson({
    repoRoot,
    relativePath: inputArtifact.value.proposalPath,
    label: 'Item-source admission proposal',
  });
  if (`sha256:${createHash('sha256').update(proposalArtifact.bytes).digest('hex')}`
      !== inputArtifact.value.proposalSha256) {
    throw new Error('Item-source admission proposal hash drifted');
  }
  const result = await runItemSourceLocalNpcAdmissionApply({
    repoRoot,
    inputContract: inputArtifact.value,
    proposal: proposalArtifact.value,
    inputContractPath,
    outputPath,
    apply: true,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Item-source admission apply failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
