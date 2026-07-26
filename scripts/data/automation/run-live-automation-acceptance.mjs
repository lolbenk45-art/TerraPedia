import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildAutomationDatabaseNames,
  openDurableRunKeyRegistry
} from './automation-database-contract.mjs';
import { createLiveAutomationAdapter } from './mysql-automation-acceptance-adapter.mjs';
import { provisionAutomationDatabases } from './provision-automation-databases.mjs';
import { dropAutomationDatabases } from './drop-automation-databases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PROBE_TABLE = '__automation_acceptance_probe';

function requireRunKey(runKey) {
  if (!/^[a-z0-9]{1,3}_[0-9a-f]{16}$/.test(runKey ?? '')) throw new Error('live acceptance runKey is invalid');
  return runKey;
}

export function buildLiveResourceNames({ profile, runKey } = {}) {
  requireRunKey(runKey);
  const prefix = profile === 't0'
    ? 'terria_v1_automation_test_'
    : profile === 't1' ? 'terria_v1_automation_acceptance_' : null;
  if (!prefix) throw new Error('live acceptance profile must be t0 or t1');
  const suffix = createHash('sha256').update(`${profile}:${runKey}`).digest('hex').slice(0, 12);
  return Object.freeze({
    databases: Object.freeze(Object.fromEntries(['local', 'maint', 'relation']
      .map((role) => [role, `${prefix}${runKey}_${role}`]))),
    accounts: Object.freeze({
      provisioner: `automation_prov_${suffix}`,
      readonly: `automation_ro_${suffix}`
    })
  });
}

function countsSql(databases, label) {
  return `SELECT '${label}',`
    + ` (SELECT COUNT(*) FROM \`${databases.local}\`.\`${PROBE_TABLE}\`),`
    + ` (SELECT COUNT(*) FROM \`${databases.maint}\`.\`${PROBE_TABLE}\`),`
    + ` (SELECT COUNT(*) FROM \`${databases.relation}\`.\`${PROBE_TABLE}\`)`;
}

export function buildAcceptanceProbeSql(databases, probeId) {
  if (!/^[a-z0-9_]+$/.test(probeId ?? '')) throw new Error('probe identity is invalid');
  const names = Object.values(databases ?? {});
  if (names.length !== 3 || names.some((name) => !/^terria_v1_automation_(?:test|acceptance)_[a-z0-9_]+$/.test(name))) {
    throw new Error('probe requires an exact isolated three-database set');
  }
  const create = names.map((name) => `CREATE TABLE IF NOT EXISTS \`${name}\`.\`${PROBE_TABLE}\` (`
    + '`probe_id` VARCHAR(64) NOT NULL PRIMARY KEY, `marker` VARCHAR(64) NOT NULL) ENGINE=InnoDB').join(';\n');
  const insert = names.map((name) => `INSERT INTO \`${name}\`.\`${PROBE_TABLE}\` (probe_id, marker) VALUES ('${probeId}', 'acceptance')`).join(';\n');
  const remove = names.map((name) => `DELETE FROM \`${name}\`.\`${PROBE_TABLE}\` WHERE probe_id = '${probeId}'`).join(';\n');
  return [
    create,
    `${remove}; COMMIT`,
    'START TRANSACTION', insert, 'ROLLBACK', countsSql(databases, 'rollback'),
    'START TRANSACTION', insert, 'COMMIT', countsSql(databases, 'commit'),
    'START TRANSACTION', remove, 'COMMIT', countsSql(databases, 'restore')
  ].join(';\n') + ';\n';
}

export function parseProbeCounts(output) {
  const parsed = Object.fromEntries(String(output ?? '').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [label, ...values] = line.split('\t');
    if (!['rollback', 'commit', 'restore'].includes(label) || values.length !== 3) {
      throw new Error('probe count output is malformed');
    }
    return [label, values.map(Number)];
  }));
  for (const label of ['rollback', 'commit', 'restore']) {
    if (!parsed[label] || parsed[label].some((value) => !Number.isInteger(value))) {
      throw new Error(`probe ${label} evidence is missing`);
    }
  }
  if (parsed.rollback.some((value) => value !== 0)) throw new Error('probe rollback left a database mutation');
  if (parsed.commit.some((value) => value !== 1)) throw new Error('probe commit did not reach all three databases');
  if (parsed.restore.some((value) => value !== 0)) throw new Error('probe snapshot restore did not restore the baseline');
  return parsed;
}

export async function runLiveAutomationAcceptance({
  profile,
  runId,
  mysql,
  redis,
  environmentId = 'local-automation-acceptance',
  privateDirectory,
  maxRowsPerTable = 2,
  onResources = () => {}
} = {}) {
  if (!['t0', 't1'].includes(profile)) throw new Error('live acceptance profile must be t0 or t1');
  if (!runId || !privateDirectory) throw new Error('runId and privateDirectory are required');
  fs.mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(privateDirectory, 0o700);
  const mappings = openDurableRunKeyRegistry(path.join(privateDirectory, 'run-keys.json'));
  const names = buildAutomationDatabaseNames({ profile, runId, mappings });
  const resources = buildLiveResourceNames({ profile, runKey: names.runKey });
  if (JSON.stringify(resources.databases) !== JSON.stringify({ local: names.local, maint: names.maint, relation: names.relation })) {
    throw new Error('derived live resource names disagree with the durable runKey contract');
  }
  if (!Number.isInteger(redis.logicalDb) || redis.logicalDb < 1 || redis.logicalDb > 14) {
    throw new Error('an explicit empty Redis logical DB from 1..14 is required');
  }
  await onResources({ ...resources, redis: { host: redis.host, port: redis.port, logicalDb: redis.logicalDb } });

  const accountPasswords = {
    provisioner: randomBytes(32).toString('hex'),
    readonly: randomBytes(32).toString('hex')
  };
  const adapter = await createLiveAutomationAdapter({
    repoRoot: ROOT, mysql, redis, environmentId,
    accountNames: resources.accounts, accountPasswords, maxRowsPerTable
  });
  let manifest;
  let primaryError;
  try {
    const observed = await adapter.inspectServer();
    manifest = await provisionAutomationDatabases({
      profile,
      runId,
      mappings,
      adapter,
      manifestPath: path.join(privateDirectory, `${profile}-manifest.json`),
      environmentId,
      expectedServerIdentity: observed,
      sourceSnapshot: profile === 't1' ? { snapshotId: `${runId}-readonly-snapshot` } : undefined
    });
    const snapshotVerification = profile === 't1'
      ? await adapter.verifyCopiedSnapshot({ sourceSnapshot: manifest.sourceSnapshot, targetDatabases: manifest.databases })
      : null;
    const probeId = `probe_${createHash('sha256').update(runId).digest('hex').slice(0, 16)}`;
    const probeCounts = parseProbeCounts(await adapter.provisionerClient.query(
      buildAcceptanceProbeSql(resources.databases, probeId)
    ));
    return {
      profile,
      runId,
      runKey: manifest.runKey,
      databases: resources.databases,
      redis: { host: redis.host, port: redis.port, logicalDb: redis.logicalDb },
      serverIdentity: manifest.serverIdentity,
      snapshot: manifest.sourceSnapshot ? {
        snapshotId: manifest.sourceSnapshot.snapshotId,
        snapshotHash: manifest.sourceSnapshot.snapshotHash,
        tableCount: manifest.sourceSnapshot.tables.length,
        tables: manifest.sourceSnapshot.tables
      } : null,
      snapshotVerification: snapshotVerification ? {
        verified: snapshotVerification.verified,
        tableCount: snapshotVerification.tables.length,
        verificationHash: snapshotVerification.verificationHash
      } : null,
      probeCounts,
      status: 'passed'
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    if (manifest) {
      try {
        await dropAutomationDatabases({ manifest, runKey: manifest.runKey, adapter });
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await adapter.verifyCleanup({ databases: resources.databases, logicalDb: redis.logicalDb });
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await adapter.cleanupAccounts();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length && !primaryError) {
      throw new AggregateError(cleanupErrors, 'live acceptance cleanup failed');
    }
    if (cleanupErrors.length && primaryError) {
      primaryError.message += `; cleanup failures: ${cleanupErrors.map((error) => error.message).join('; ')}`;
    }
  }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  }));
}

async function main() {
  if (process.env.TERRAPEDIA_AUTOMATION_ACCEPTANCE_ENABLED !== '1') {
    throw new Error('set TERRAPEDIA_AUTOMATION_ACCEPTANCE_ENABLED=1 for the authorized isolated run');
  }
  const args = parseArgs(process.argv);
  const configPath = path.resolve(args['config-path'] ?? '');
  if (!args['config-path'] || !fs.existsSync(configPath)) throw new Error('--config-path is required');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const profile = args.profile;
  const redisLogicalDb = Number(args['redis-db']);
  const privateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `terrapedia-${profile}-live-`));
  const runId = args['run-id'] || `${profile}-${Date.now()}-${randomBytes(8).toString('hex')}`;
  try {
    const result = await runLiveAutomationAcceptance({
      profile,
      runId,
      privateDirectory,
      mysql: {
        host: config.database.host,
        port: config.database.port,
        username: config.database.username,
        password: config.database.password
      },
      redis: {
        host: config.redis.host,
        port: Number(args['redis-port'] || config.redis.port),
        password: config.redis.password,
        logicalDb: redisLogicalDb
      },
      maxRowsPerTable: Number(args['max-rows'] || 2),
      onResources: async (resources) => {
        process.stdout.write(`${JSON.stringify({ safetyBoundary: {
          formalDatabases: 'read-only',
          isolatedDatabases: resources.databases,
          temporaryAccounts: resources.accounts,
          redis: resources.redis
        } }, null, 2)}\n`);
      }
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    fs.rmSync(privateDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`live automation acceptance failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
