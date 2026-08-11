import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS,
  ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID,
  buildItemImageProjectionMissingRowInsertCompletedResult,
  writeItemImageProjectionMissingRowInsertJson,
} from './item-image-projection-missing-row-insert-contract.mjs';
import {
  executeItemImageProjectionMissingRowInsertTransaction,
} from './item-image-projection-missing-row-insert-db.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from '../automation/authorized-operation-context.mjs';

export async function runItemImageProjectionMissingRowInsertApply(options = {}, dependencies = {}) {
  const inputContract = options.inputContract;
  assertInputContract(inputContract);
  if (options.apply !== true) throw new Error('missing-row insert apply must be explicitly true');
  if (typeof options.inputContractPath !== 'string' || !options.inputContractPath.trim()) {
    throw new Error('missing-row insert inputContractPath is required');
  }
  const connect = dependencies.connect;
  if (typeof connect !== 'function') throw new Error('missing-row insert database connection is required');
  const connection = await connect({ target: inputContract.target });
  try {
    const transaction = dependencies.executeTransaction
      ?? ((context) => executeItemImageProjectionMissingRowInsertTransaction(context));
    const consumeDispatchPermit = dependencies.consumeDispatchPermit;
    if (typeof consumeDispatchPermit !== 'function') throw new Error('missing-row insert dispatch permit is required');
    const outcome = await transaction({ connection, proposal: inputContract, consumeDispatchPermit });
    if (Number(outcome?.insertedRowCount) !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS.length) {
      throw new Error('missing-row insert transaction count drifted');
    }
    const result = buildItemImageProjectionMissingRowInsertCompletedResult({
      inputContract,
      inputContractPath: options.inputContractPath,
      completedAt: options.now ?? new Date().toISOString(),
    });
    if (typeof dependencies.writeResult !== 'function') throw new Error('missing-row insert result writer is required');
    await dependencies.writeResult({ result });
    return result;
  } finally {
    await connection?.end?.();
  }
}

function assertInputContract(input) {
  if (!input || input.operationId !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID
      || !Array.isArray(input.keys)
      || input.keys.length !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS.length
      || input.keys.some((key, index) => key !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS[index])
      || Number(input.insertedRowCount) !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS.length
      || !Array.isArray(input.projectionRows)
      || input.projectionRows.length !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS.length) {
    throw new Error('missing-row insert input must contain the exact five-row contract');
  }
}

async function runCli(options) {
  const repoRoot = path.resolve(options.repoRoot ?? getProjectRoot());
  const inputContractPath = String(options.inputContractPath ?? '').trim().replaceAll('\\', '/');
  const inputBytes = fs.readFileSync(path.resolve(repoRoot, inputContractPath));
  const inputContract = JSON.parse(inputBytes.toString('utf8'));
  const now = options.now ?? new Date().toISOString();
  const authorizedContext = loadAuthorizedOperationContext({
    operationId: ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_OPERATION_ID,
    now,
  });
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext });
  const runtime = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'scripts/dev/config/local-stack.config.json'),
    'utf8',
  ));
  const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: inputContract.target.host,
    port: inputContract.target.port,
    user: process.env.TERRAPEDIA_DB_USERNAME ?? runtime.database?.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? runtime.database?.password ?? 'root',
    multipleStatements: false,
  });
  try {
    return await runItemImageProjectionMissingRowInsertApply({
      ...options,
      repoRoot,
      inputContract,
      inputContractPath,
      now,
    }, {
      connect: async () => connection,
      consumeDispatchPermit: async () => consumeAuthorizedOperationDispatchPermit({
        authorizedContext,
        decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
      }),
      writeResult: async ({ result }) => writeItemImageProjectionMissingRowInsertJson({
        repoRoot,
        outputPath: options.outputPath,
        value: result,
      }),
    });
  } finally {
    await connection.end();
  }
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
    inputContractPath: args['input-contract'],
    outputPath: args.output,
    apply: args.apply === 'true',
    now: args.now,
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
