#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalServerFingerprint } from './automation-database-contract.mjs';
import { canonicalizePolicySet, computePolicySetHash } from './policy-set-hash.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { assertRepositoryPathConfinement } from '../lib/private-repository-path.mjs';

const OPERATION_ID = 'automation-crawler-v2-scheduler-activation';
const DOMAIN_ID = 'crawler_v2_scheduler';
const DATABASE_NAME = 'terria_v1_local';
const MINIMUM_SUCCESSFUL_L1_RUNS = 2;

export function buildCrawlerV2SchedulerActivationSnapshot({ policyRows, serverFingerprint } = {}) {
  if (!Array.isArray(policyRows)) throw new Error('policy rows must be an array');
  const scheduler = policyRows.find((row) => row?.domainId === DOMAIN_ID);
  if (!scheduler || scheduler.currentLevel !== 'L1' || scheduler.operationalState !== 'ACTIVE') {
    throw new Error('crawler_v2_scheduler policy must be L1 and ACTIVE');
  }
  const canonicalPolicyRows = canonicalizePolicySet(policyRows);
  const policy = canonicalPolicyRows.find((row) => row.domainId === DOMAIN_ID);
  if (!policy) throw new Error('crawler_v2_scheduler policy is missing');
  const fingerprint = canonicalServerFingerprint(serverFingerprint);
  return Object.freeze({
    input: Object.freeze({
      schemaVersion: 1,
      operationId: OPERATION_ID,
      databaseName: DATABASE_NAME,
      domainId: DOMAIN_ID,
      policySetHash: computePolicySetHash(canonicalPolicyRows),
      policyVersion: policy.policyVersion,
      policyHash: policy.policyHash,
      minimumSuccessfulL1Runs: MINIMUM_SUCCESSFUL_L1_RUNS,
    }),
    policyRows: Object.freeze(canonicalPolicyRows),
    serverFingerprint: fingerprint,
  });
}

export function writeCrawlerV2SchedulerActivationSnapshot({
  repoRoot = process.cwd(),
  snapshot,
  inputPath,
  policyRowsPath,
  serverFingerprintPath,
} = {}) {
  if (!snapshot?.input || !snapshot?.policyRows || !snapshot?.serverFingerprint) {
    throw new Error('scheduler activation snapshot is required');
  }
  const outputs = [
    [inputPath, snapshot.input],
    [policyRowsPath, snapshot.policyRows],
    [serverFingerprintPath, snapshot.serverFingerprint],
  ].map(([outputPath, payload]) => [resolveAuthorizationOutput(repoRoot, outputPath), payload]);
  if (new Set(outputs.map(([outputPath]) => outputPath)).size !== outputs.length) {
    throw new Error('scheduler activation snapshot outputs must be distinct');
  }
  for (const [outputPath] of outputs) {
    if (fs.existsSync(outputPath)) {
      throw new Error(`scheduler activation snapshot output already exists: ${outputPath}`);
    }
  }
  for (const [outputPath, payload] of outputs) writeJsonAtomicNoOverwrite(outputPath, payload);
  return Object.freeze({
    inputPath: outputs[0][0],
    policyRowsPath: outputs[1][0],
    serverFingerprintPath: outputs[2][0],
  });
}

export async function captureCrawlerV2SchedulerActivationInputCli({
  argv = process.argv.slice(2),
  env = process.env,
  mysqlModule = null,
} = {}) {
  const args = parseArgs(argv);
  const outputPaths = {
    inputPath: requireText(args.input, '--input'),
    policyRowsPath: requireText(args['policy-rows'], '--policy-rows'),
    serverFingerprintPath: requireText(args['server-fingerprint'], '--server-fingerprint'),
  };
  const connection = await (mysqlModule ?? loadMysqlModule()).createConnection(connectionOptions(env));
  let transactionOpen = false;
  try {
    await connection.query('START TRANSACTION READ ONLY');
    transactionOpen = true;
    const [policyRows] = await connection.query(
      'SELECT p.domain_id AS domainId, p.current_version AS policyVersion,'
      + ' pv.policy_hash AS policyHash, p.current_level AS currentLevel,'
      + ' p.operational_state AS operationalState FROM crawler_automation_policy p'
      + ' JOIN crawler_automation_policy_version pv ON pv.domain_id = p.domain_id'
      + ' AND pv.policy_version = p.current_version ORDER BY p.domain_id',
    );
    const [serverRows] = await connection.query('SELECT @@server_uuid AS serverUuid');
    const snapshot = buildCrawlerV2SchedulerActivationSnapshot({
      policyRows: policyRows ?? [],
      serverFingerprint: {
        host: env.TERRAPEDIA_DB_HOST,
        port: Number(env.TERRAPEDIA_DB_PORT),
        serverUuid: serverRows?.[0]?.serverUuid,
        databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
      },
    });
    const outputs = writeCrawlerV2SchedulerActivationSnapshot({
      repoRoot: env.WORKTREE_ROOT ?? process.cwd(),
      snapshot,
      ...outputPaths,
    });
    await connection.rollback();
    transactionOpen = false;
    return Object.freeze({
      operationId: OPERATION_ID,
      policySetHash: snapshot.input.policySetHash,
      ...outputs,
    });
  } finally {
    if (transactionOpen) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the original snapshot error.
      }
    }
    await connection.end();
  }
}

function connectionOptions(env) {
  if (env.TERRAPEDIA_DB_NAME !== DATABASE_NAME) {
    throw new Error(`TERRAPEDIA_DB_NAME must be exactly ${DATABASE_NAME}`);
  }
  const port = Number(requireText(env.TERRAPEDIA_DB_PORT, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TERRAPEDIA_DB_PORT must be an integer from 1 to 65535');
  }
  return {
    host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
    port,
    user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'),
    password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'),
    database: DATABASE_NAME,
    multipleStatements: false,
  };
}

function parseArgs(argv) {
  return Object.fromEntries(argv.filter((value) => value.startsWith('--')).map((value) => {
    const [key, ...rest] = value.slice(2).split('=');
    return [key, rest.join('=')];
  }));
}

function resolveAuthorizationOutput(repoRoot, outputPath) {
  const root = path.resolve(repoRoot, 'reports', 'authorization', 'canonical');
  const output = path.resolve(repoRoot, requireText(outputPath, 'snapshot output path'));
  if (!output.startsWith(`${root}${path.sep}`)) {
    throw new Error('scheduler activation snapshot output must remain under reports/authorization/canonical');
  }
  return assertRepositoryPathConfinement({
    repoRoot,
    filePath: output,
    label: 'scheduler activation snapshot output',
    createParent: true,
  });
}

function writeJsonAtomicNoOverwrite(outputPath, payload) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporary = `${outputPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.linkSync(temporary, outputPath);
    fs.unlinkSync(temporary);
    fs.chmodSync(outputPath, 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`scheduler activation snapshot output already exists: ${outputPath}`);
    }
    throw error;
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  captureCrawlerV2SchedulerActivationInputCli().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    process.stderr.write(`scheduler activation snapshot failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
