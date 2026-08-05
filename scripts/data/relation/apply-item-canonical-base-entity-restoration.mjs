import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { executeItemCanonicalBaseEntityRestorationTransaction } from './item-canonical-base-entity-restoration-db.mjs';
import {
  buildItemCanonicalBaseEntityRestorationAttemptPaths,
  buildItemCanonicalBaseEntityRestorationInputContract,
  hashCanonicalJson,
  ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS,
  ITEM_CANONICAL_BASE_ENTITY_RESTORATION_OPERATION_ID,
} from './item-canonical-base-entity-restoration-contract.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from '../automation/authorized-operation-context.mjs';

export async function runItemCanonicalBaseEntityRestorationApply(options = {}, dependencies = {}) {
  const inputContract = options.inputContract;
  assertInputContract(inputContract);
  if (options.apply !== true) throw new Error('canonical restoration apply must be explicitly true');
  if (typeof options.inputContractPath !== 'string' || !options.inputContractPath.trim()) {
    throw new Error('canonical restoration inputContractPath is required');
  }
  if (typeof dependencies.connect !== 'function' || typeof dependencies.consumeDispatchPermit !== 'function'
      || typeof dependencies.writeResult !== 'function') {
    throw new Error('canonical restoration apply dependencies are required');
  }
  const connection = await dependencies.connect({ target: inputContract.target });
  try {
    const transaction = dependencies.executeTransaction ?? executeItemCanonicalBaseEntityRestorationTransaction;
    const outcome = await transaction({
      connection,
      proposal: inputContract,
      consumeDispatchPermit: dependencies.consumeDispatchPermit,
    });
    assertInsertedCounts(outcome?.insertedCounts);
    assertDeletedCounts(outcome?.deletedCounts);
    const result = {
      resultKind: 'canonical_item_base_entity_restoration_result',
      operationId: ITEM_CANONICAL_BASE_ENTITY_RESTORATION_OPERATION_ID,
      status: 'completed',
      apply: true,
      inputContractPath: options.inputContractPath,
      inputContractSha256: `sha256:${createHash('sha256').update(JSON.stringify(inputContract)).digest('hex')}`,
      attemptId: inputContract.attemptId ?? null,
      attemptRoot: inputContract.attemptRoot ?? null,
      deletedCounts: outcome.deletedCounts,
      insertedCounts: outcome.insertedCounts,
      completedAt: options.now ?? new Date().toISOString(),
    };
    await dependencies.writeResult({ result });
    return result;
  } finally {
    await connection?.end?.();
  }
}

function assertInputContract(input) {
  if (!input || input.operationId !== ITEM_CANONICAL_BASE_ENTITY_RESTORATION_OPERATION_ID
      || JSON.stringify(input.keys) !== JSON.stringify(ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS)
      || input.maintRows?.length !== 5 || input.relationRows?.length !== 5 || input.projectionRows?.length !== 5
      || input.managedImages?.length !== 5 || input.legacyMaintRows?.length !== 5
      || input.legacyRelationRows?.length !== 5 || input.legacyProjectionRows?.length !== 5
      || input.legacyProjectileAudits?.length !== 5) {
    throw new Error('canonical restoration input must contain the exact five-row scope');
  }
}

function assertInsertedCounts(counts) {
  if (Number(counts?.maintItems) !== 5 || Number(counts?.relationItems) !== 5 || Number(counts?.projectionItems) !== 5) {
    throw new Error('canonical restoration inserted count drifted');
  }
}

function assertDeletedCounts(counts) {
  if (Number(counts?.maintItems) !== 5 || Number(counts?.relationItems) !== 5
      || Number(counts?.projectionItems) !== 5 || Number(counts?.itemProjectileAudits) !== 5) {
    throw new Error('canonical restoration deleted count drifted');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(getProjectRoot());
  const inputContractPath = requireRelativePath(args['input-contract'], 'input contract path');
  const outputPath = requireRelativePath(args.output, 'result path');
  if (args.apply !== 'true') throw new Error('canonical restoration apply must be explicitly true');
  const inputBytes = fs.readFileSync(path.resolve(repoRoot, inputContractPath));
  const inputContract = JSON.parse(inputBytes);
  assertInputContract(inputContract);
  const attemptPaths = buildItemCanonicalBaseEntityRestorationAttemptPaths(
    inputContract.proposalAuthorization.decisionIdentity,
  );
  if (inputContractPath !== attemptPaths.inputPath || outputPath !== attemptPaths.resultPath
      || inputContract.attemptRoot !== attemptPaths.attemptRoot || inputContract.attemptId !== attemptPaths.attemptId) {
    throw new Error('canonical restoration attempt paths drifted');
  }
  assertInputArtifacts({ repoRoot, inputContract });
  if (fs.existsSync(path.resolve(repoRoot, outputPath))) {
    throw new Error('canonical restoration result already exists; overwrite is forbidden');
  }
  const now = new Date().toISOString();
  const authorizedContext = loadAuthorizedOperationContext({
    operationId: ITEM_CANONICAL_BASE_ENTITY_RESTORATION_OPERATION_ID,
    now,
  });
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext });
  const connection = await openDefaultConnection(repoRoot, inputContract.target);
  try {
    const result = await runItemCanonicalBaseEntityRestorationApply({
      inputContract,
      inputContractPath,
      apply: true,
      now,
    }, {
      connect: async () => connection,
      consumeDispatchPermit: () => consumeAuthorizedOperationDispatchPermit({
        authorizedContext,
        decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
      }),
      writeResult: async ({ result: value }) => writePrivateJson(repoRoot, outputPath, value),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await connection.end();
  }
}

function assertInputArtifacts({ repoRoot, inputContract }) {
  const proposalPath = requireRelativePath(inputContract.proposalPath, 'proposal path');
  const snapshotPath = requireRelativePath(inputContract.snapshotPath, 'snapshot path');
  const archivePath = requireRelativePath(inputContract.archivePath, 'archive path');
  const ownerPath = requireRelativePath(inputContract.proposalAuthorization?.path, 'proposal authorization path');
  for (const [relativePath, label] of [[proposalPath, 'proposal'], [snapshotPath, 'snapshot'], [archivePath, 'archive'], [ownerPath, 'proposal authorization']]) {
    if (!relativePath.startsWith(`${inputContract.attemptRoot}/`)) {
      throw new Error(`canonical restoration ${label} is outside the attempt root`);
    }
    const absolute = path.resolve(repoRoot, relativePath);
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
      throw new Error(`canonical restoration ${label} must be a private ordinary file`);
    }
  }
  const proposal = JSON.parse(fs.readFileSync(path.resolve(repoRoot, proposalPath), 'utf8'));
  if (proposal.apply !== false || hashCanonicalJson(buildItemCanonicalBaseEntityRestorationInputContract(proposal))
      !== hashCanonicalJson(inputContract)) {
    throw new Error('canonical restoration input contract drifted from proposal');
  }
  const archive = JSON.parse(fs.readFileSync(path.resolve(repoRoot, archivePath), 'utf8'));
  if (hashCanonicalJson(archive) !== inputContract.archiveSha256) {
    throw new Error('canonical restoration archive hash drifted');
  }
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

function writePrivateJson(repoRoot, relativePath, value) {
  const output = path.resolve(repoRoot, relativePath);
  fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}

function requireRelativePath(value, label) {
  const normalized = String(value ?? '').trim().replaceAll('\\', '/');
  if (!normalized || path.isAbsolute(normalized) || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`${label} must be repository-relative`);
  }
  return normalized;
}

function parseArgs(argv) {
  const values = {};
  for (const token of argv) {
    const [key, ...parts] = String(token).replace(/^--/, '').split('=');
    values[key] = parts.join('=');
  }
  return values;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
