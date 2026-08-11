#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  ITEM_IMAGE_PROJECTION_OPERATION_ID,
  assertItemImageProjectionInputContract,
  assertItemImageProjectionProposal,
  assertItemImageProjectionSnapshot,
  buildItemImageProjectionCompletedResult,
  buildItemImageProjectionFailedResult,
  buildItemImageProjectionInputContract,
  buildItemImageProjectionSnapshot,
  buildItemImageProjectionAttemptPaths,
  canonicalItemImageProjectionHash,
  writeItemImageProjectionPrivateJson,
} from './item-image-projection-contract.mjs';
import {
  executeItemImageProjectionTransaction,
} from './item-image-projection-db.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  assertAuthorizedOperationDataBundle,
  assertItemImageProjectionAuthorizationEnvironment,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from '../automation/authorized-operation-context.mjs';
import {
  assertRepositoryOrdinaryFile,
  assertRepositoryPathConfinement,
} from '../lib/private-repository-path.mjs';

export async function runItemImageProjectionApply(options = {}, dependencies = {}) {
  const repoRoot = path.resolve(String(options.repoRoot ?? getProjectRoot()));
  const inputContractPath = requireRelativePath(
    options.inputContractPath,
    'inputContractPath',
  );
  const now = requireTimestamp(options.now ?? new Date().toISOString(), 'now');
  const inputBytes = await readArtifact({
    repoRoot,
    relativePath: inputContractPath,
    expectedSha256: null,
    label: 'projection input contract',
    privateEvidence: true,
    dependencies,
  });
  const inputContract = parseJson(inputBytes, 'projection input contract');
  assertItemImageProjectionInputContract(inputContract);
  const attemptPaths = buildItemImageProjectionAttemptPaths(
    inputContract.proposalAuthorization.decisionIdentity,
  );
  if (inputContractPath !== attemptPaths.inputPath) {
    throw new Error('projection input must use the exact authorized attempt path');
  }
  if (Date.parse(now) < Date.parse(inputContract.generatedAt)) {
    throw new Error('projection input contract is not yet valid');
  }
  if (Date.parse(inputContract.expiresAt) <= Date.parse(now)) {
    throw new Error('projection input contract is expired');
  }

  const proposalBytes = await readArtifact({
    repoRoot,
    relativePath: inputContract.proposalPath,
    expectedSha256: inputContract.proposalSha256,
    label: 'projection proposal',
    privateEvidence: true,
    dependencies,
  });
  const proposal = parseJson(proposalBytes, 'projection proposal');
  assertItemImageProjectionProposal(proposal);
  if (proposal.apply !== false) throw new Error('projection proposal must be dry-run evidence');
  const expectedInputContract = buildItemImageProjectionInputContract({
    proposal,
    proposalPath: inputContract.proposalPath,
    proposalSha256: inputContract.proposalSha256,
  });
  if (canonicalItemImageProjectionHash(expectedInputContract)
      !== canonicalItemImageProjectionHash(inputContract)) {
    throw new Error('projection input contract drifted from its bound proposal');
  }

  const snapshotBytes = await readArtifact({
    repoRoot,
    relativePath: inputContract.snapshotPath,
    expectedSha256: inputContract.snapshotSha256,
    label: 'projection snapshot',
    privateEvidence: true,
    dependencies,
  });
  const snapshot = parseJson(snapshotBytes, 'projection snapshot');
  assertItemImageProjectionSnapshot(snapshot);
  const expectedSnapshot = buildItemImageProjectionSnapshot({
    generatedAt: inputContract.generatedAt,
    target: inputContract.target,
    managedUrlPolicy: inputContract.managedUrlPolicy,
    managedUrlPrefixes: inputContract.managedUrlPrefixes,
    lineageKeys: inputContract.keys,
    relationRows: inputContract.relationRows.map((row) => ({
      ...row,
      role: 'icon',
      isPrimary: 1,
      status: 1,
      deleted: 0,
    })),
    projectionRows: inputContract.projectionBeforeRows.map((row) => ({
      ...row,
      status: 1,
      deleted: 0,
    })),
  });
  if (canonicalItemImageProjectionHash(expectedSnapshot)
      !== canonicalItemImageProjectionHash(snapshot)) {
    throw new Error('projection snapshot content drifted from input contract');
  }

  const proposalAuthorizationBytes = await readArtifact({
    repoRoot,
    relativePath: inputContract.proposalAuthorization.path,
    expectedSha256: inputContract.proposalAuthorization.sha256,
    label: 'proposal read-only Owner authorization',
    privateEvidence: true,
    dependencies,
  });
  assertProposalAuthorizationEvidence({
    value: parseJson(proposalAuthorizationBytes, 'proposal read-only Owner authorization'),
    binding: inputContract.proposalAuthorization,
    target: inputContract.target,
  });

  await readArtifact({
    repoRoot,
    relativePath: inputContract.managedUrlPolicy.sourcePath,
    expectedSha256: inputContract.managedUrlPolicy.sourceSha256,
    label: 'managed URL policy source',
    dependencies,
  });
  await verifyLineageArtifacts({ repoRoot, inputContract, dependencies });

  if (options.apply !== true) {
    return Object.freeze({
      operationId: ITEM_IMAGE_PROJECTION_OPERATION_ID,
      apply: false,
      status: 'dry-run',
      inputContractPath,
      inputContractSha256: sha256Bytes(inputBytes),
    });
  }

  const outputPath = requireRelativePath(options.outputPath, 'outputPath');
  if (outputPath !== attemptPaths.resultPath) {
    throw new Error('projection output must use the exact authorized attempt path');
  }
  if (typeof dependencies.assertOutputAvailable === 'function') {
    await dependencies.assertOutputAvailable({ repoRoot, outputPath });
  } else {
    assertOutputAvailable(repoRoot, outputPath);
  }

  if (typeof dependencies.loadAuthorizedContext !== 'function') {
    assertItemImageProjectionAuthorizationEnvironment({
      repoRoot,
      attemptRoot: attemptPaths.attemptRoot,
    });
  }
  const loadContext = dependencies.loadAuthorizedContext
    ?? (() => loadAuthorizedOperationContext({
      operationId: ITEM_IMAGE_PROJECTION_OPERATION_ID,
      now,
    }));
  const authorizedContext = await loadContext({ operationId: ITEM_IMAGE_PROJECTION_OPERATION_ID, now });
  if (authorizedContext?.operationId !== ITEM_IMAGE_PROJECTION_OPERATION_ID) {
    throw new Error('authorized context operationId drifted');
  }
  const assertAuthorizedDataBundle = dependencies.assertAuthorizedDataBundle
    ?? assertAuthorizedOperationDataBundle;
  await assertAuthorizedDataBundle({ authorizedContext, inputContract, repoRoot });

  const connect = dependencies.connect ?? (() => openDefaultConnection(repoRoot, inputContract.target));
  const connection = await connect({ repoRoot, target: inputContract.target, authorizedContext });
  const startedAt = now;
  try {
    const consumeDispatchPermit = dependencies.consumeDispatchPermit
      ?? (() => consumeAuthorizedOperationDispatchPermit({
        authorizedContext,
        decisionLedgerPath: path.join(
          repoRoot,
          'reports/authorization/canonical/used-decisions.json',
        ),
      }));
    const executeTransaction = dependencies.executeTransaction
      ?? ((context) => executeItemImageProjectionTransaction({
        connection,
        inputContract,
        consumeDispatchPermit: context.consumeDispatchPermit,
      }));
    await executeTransaction({
      connection,
      inputContract,
      authorizedContext,
      consumeDispatchPermit: () => consumeDispatchPermit({
        authorizedContext,
        inputContract,
      }),
    });
    const result = buildItemImageProjectionCompletedResult({
      inputContract,
      inputContractPath,
      inputContractSha256: sha256Bytes(inputBytes),
      completedAt: now,
    });
    await writeResult({
      repoRoot,
      outputPath,
      result,
      dependencies,
      label: 'item image projection completed result',
    });
    return result;
  } catch (error) {
    const evidence = error?.itemImageProjectionTransaction;
    if (!evidence) throw error;
    const failed = buildItemImageProjectionFailedResult({
      inputContract,
      inputContractPath,
      inputContractSha256: sha256Bytes(inputBytes),
      startedAt,
      failedAt: now,
      transaction: evidence,
      error: {
        name: error.name ?? 'Error',
        message: error.message ?? String(error),
      },
    });
    await writeResult({
      repoRoot,
      outputPath,
      result: failed,
      dependencies,
      label: 'item image projection failed result',
    });
    throw error;
  } finally {
    await connection?.end?.();
  }
}

async function verifyLineageArtifacts({ repoRoot, inputContract, dependencies }) {
  for (const [field, label, privateEvidence] of [
    ['inputContractPath', 'lineage input contract', true],
    ['resultPath', 'lineage result', true],
    ['bundlePath', 'lineage bundle', false],
    ['applySnapshotPath', 'lineage apply snapshot', true],
    ['authorizationPacketPath', 'lineage authorization packet', true],
  ]) {
    const expectedSha256 = inputContract.lineage[`${field.replace('Path', '')}Sha256`];
    await readArtifact({
      repoRoot,
      relativePath: inputContract.lineage[field],
      expectedSha256,
      label,
      privateEvidence,
      dependencies,
    });
  }
}

async function readArtifact({
  repoRoot,
  relativePath,
  expectedSha256,
  label,
  privateEvidence = false,
  dependencies,
}) {
  const normalized = requireRelativePath(relativePath, `${label} path`);
  let bytes;
  if (typeof dependencies.readArtifactBytes === 'function') {
    bytes = await dependencies.readArtifactBytes({ repoRoot, relativePath: normalized, label });
  } else {
    const absolutePath = assertRepositoryOrdinaryFile({
      repoRoot,
      filePath: path.resolve(repoRoot, normalized),
      label,
    });
    if (privateEvidence && (fs.statSync(absolutePath).mode & 0o077) !== 0) {
      throw new Error(`${label} must be private`);
    }
    bytes = fs.readFileSync(absolutePath);
  }
  const buffer = Buffer.from(bytes);
  if (expectedSha256 && sha256Bytes(buffer) !== expectedSha256) {
    throw new Error(`${label} hash drifted`);
  }
  return buffer;
}

async function writeResult({ repoRoot, outputPath, result, dependencies, label }) {
  if (typeof dependencies.writeResult === 'function') {
    await dependencies.writeResult({ repoRoot, outputPath, result });
    return;
  }
  writeItemImageProjectionPrivateJson({ repoRoot, outputPath, value: result, label });
}

function assertOutputAvailable(repoRoot, relativePath) {
  const absolute = assertRepositoryPathConfinement({
    repoRoot,
    filePath: path.resolve(repoRoot, relativePath),
    label: 'projection result',
  });
  if (fs.existsSync(absolute)) throw new Error('projection result already exists; overwrite is forbidden');
}

async function openDefaultConnection(repoRoot, target) {
  const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
  const mysql = require('mysql2/promise');
  return mysql.createConnection({
    host: target.host,
    port: target.port,
    user: process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    multipleStatements: false,
  });
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function assertProposalAuthorizationEvidence({ value, binding, target }) {
  const expectedKeys = [
    'schemaVersion',
    'authorizationKind',
    'operationId',
    'action',
    'actor',
    'reason',
    'authorizationReference',
    'decisionIdentity',
    'authorizedAt',
    'expiresAt',
    'targetDatabases',
    'noWrite',
    'authorizationHash',
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalItemImageProjectionHash(Object.keys(value).sort())
        !== canonicalItemImageProjectionHash(expectedKeys.sort())) {
    throw new Error('proposal read-only Owner authorization schema drifted');
  }
  if (Number(value.schemaVersion) !== 1
      || value.operationId !== ITEM_IMAGE_PROJECTION_OPERATION_ID
      || value.authorizationKind !== 'canonical_read_only_proposal_authorization'
      || value.action !== 'read-only-proposal'
      || value.noWrite !== true
      || value.decisionIdentity !== binding.decisionIdentity
      || value.authorizationHash !== binding.authorizationHash) {
    throw new Error('proposal read-only Owner authorization identity drifted');
  }
  for (const field of ['actor', 'reason', 'authorizationReference']) {
    requireText(value[field], `proposal read-only Owner authorization ${field}`);
  }
  const authorizedAt = Date.parse(requireTimestamp(value.authorizedAt, 'proposal authorization authorizedAt'));
  const expiresAt = Date.parse(requireTimestamp(value.expiresAt, 'proposal authorization expiresAt'));
  if (authorizedAt >= expiresAt) {
    throw new Error('proposal read-only Owner authorization timestamp order drifted');
  }
  if (canonicalItemImageProjectionHash(value.targetDatabases)
      !== canonicalItemImageProjectionHash(Object.values(target.databases))) {
    throw new Error('proposal read-only Owner authorization target databases drifted');
  }
  const payload = { ...value };
  delete payload.authorizationHash;
  if (canonicalItemImageProjectionHash(payload) !== value.authorizationHash) {
    throw new Error('proposal read-only Owner authorization hash drifted');
  }
}

function requireRelativePath(value, label) {
  const normalized = String(value ?? '').trim().replaceAll('\\', '/');
  if (!normalized || path.isAbsolute(normalized) || normalized === '..'
      || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`${label} must be repository-relative`);
  }
  return normalized;
}

function requireTimestamp(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized || !Number.isFinite(Date.parse(normalized))) throw new Error(`${label} must be an ISO timestamp`);
  return normalized;
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function parseArgs(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    if (separator > 2) options[token.slice(2, separator)] = token.slice(separator + 1);
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await runItemImageProjectionApply({
      repoRoot: getProjectRoot(),
      inputContractPath: args['input-contract'],
      outputPath: args.output,
      apply: args.apply === 'true',
      now: args.now ?? new Date().toISOString(),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
