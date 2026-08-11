import {
  buildItemImageProjectionMissingRowInsertProposal,
  buildItemImageProjectionMissingRowInsertInputContract,
  writeItemImageProjectionMissingRowInsertJson,
} from './item-image-projection-missing-row-insert-contract.mjs';
import {
  readItemImageProjectionMissingRowInsertSnapshot,
} from './item-image-projection-missing-row-insert-db.mjs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProjectRoot } from '../lib/project-root.mjs';
import { resolveItemImageLineageRuntimeConfig } from './item-image-lineage-db.mjs';

export async function runItemImageProjectionMissingRowInsertProposal(options = {}, dependencies = {}) {
  const openConnection = dependencies.openReadOnlyConnection;
  const readSnapshot = dependencies.readSnapshot;
  if (typeof openConnection !== 'function' || typeof readSnapshot !== 'function') {
    throw new Error('read-only proposal dependencies are required');
  }
  const connection = await openConnection();
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const snapshot = await readSnapshot(connection, options);
    return buildItemImageProjectionMissingRowInsertProposal({
      ...options,
      ...snapshot,
    });
  } finally {
    await connection.rollback?.();
    await connection.end?.();
  }
}

export async function materializeItemImageProjectionMissingRowInsertInput({
  repoRoot,
  proposal,
  inputPath,
} = {}) {
  const input = buildItemImageProjectionMissingRowInsertInputContract({ proposal });
  writeItemImageProjectionMissingRowInsertJson({ repoRoot, outputPath: inputPath, value: input });
  return input;
}

async function runCli(options) {
  const repoRoot = path.resolve(options.repoRoot ?? getProjectRoot());
  const runtime = resolveItemImageLineageRuntimeConfig({ repoRoot });
  const decisionIdentity = readOwnerDecisionIdentity(repoRoot, options.readOnlyAuthorization);
  const attemptRoot = `reports/authorization/canonical/item-image-projection-missing-row-insert/${sha256Text(decisionIdentity)}`;
  const target = {
    host: runtime.serverFingerprint.host,
    port: runtime.serverFingerprint.port,
    serverUuid: runtime.serverFingerprint.serverUuid,
    databases: {
      local: 'terria_v1_local',
      maint: 'terria_v1_maint',
      relation: 'terria_v1_relation',
    },
    ownedDatabase: 'terria_v1_relation',
    ownedTable: 'projection_items',
  };
  const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: target.host,
    port: target.port,
    user: process.env.TERRAPEDIA_DB_USERNAME ?? runtime.database?.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? runtime.database?.password ?? 'root',
    multipleStatements: false,
  });
  const proposalPaths = {
    proposalAuthorization: options.readOnlyAuthorization,
    snapshot: `${attemptRoot}/snapshot.json`,
    proposal: `${attemptRoot}/proposal.json`,
    input: `${attemptRoot}/input.json`,
  };
  try {
    const proposal = await runItemImageProjectionMissingRowInsertProposal({
      target,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      expiresAt: options.expiresAt,
      proposalAuthorization: {
        decisionIdentity,
        path: options.readOnlyAuthorization,
        sha256: sha256File(repoRoot, options.readOnlyAuthorization),
        authorizationHash: JSON.parse(fs.readFileSync(path.resolve(repoRoot, options.readOnlyAuthorization), 'utf8')).authorizationHash,
      },
    }, {
      openReadOnlyConnection: async () => connection,
      readSnapshot: async (readConnection, context) => readItemImageProjectionMissingRowInsertSnapshot(
        readConnection,
        { target: context.target },
      ),
    });
    writeItemImageProjectionMissingRowInsertJson({
      repoRoot,
      outputPath: proposalPaths.snapshot,
      value: {
        operationId: proposal.operationId,
        attemptRoot,
        keys: proposal.keys,
        projectionRows: proposal.projectionRows,
        sourceRowsSha256: proposal.sourceRowsSha256,
        relationImageRowsSha256: proposal.relationImageRowsSha256,
      },
    });
    writeItemImageProjectionMissingRowInsertJson({ repoRoot, outputPath: proposalPaths.proposal, value: proposal });
    await materializeItemImageProjectionMissingRowInsertInput({
      repoRoot,
      proposal: { ...proposal, snapshotPath: proposalPaths.snapshot },
      inputPath: proposalPaths.input,
    });
    return proposal;
  } finally {
    await connection.end();
  }
}

function readOwnerDecisionIdentity(repoRoot, ownerPath) {
  const value = JSON.parse(fs.readFileSync(path.resolve(repoRoot, ownerPath), 'utf8'));
  if (value?.operationId !== 'canonical-item-image-projection-missing-row-insert'
      || value?.noWrite !== true || !value.decisionIdentity) {
    throw new Error('missing-row insert read-only Owner authorization is invalid');
  }
  return String(value.decisionIdentity);
}

function sha256File(repoRoot, relativePath) {
  const bytes = fs.readFileSync(path.resolve(repoRoot, relativePath));
  return `sha256:${sha256Text(bytes)}`;
}

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  runCli({
    repoRoot: args['repo-root'],
    readOnlyAuthorization: args['read-only-authorization'],
    generatedAt: args['generated-at'],
    expiresAt: args['expires-at'],
  }).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
