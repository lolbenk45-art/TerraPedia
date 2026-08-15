import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildBiomesAutomationPreview,
  buildBiomesAutomationBundle,
  classifyBiomesWriteFence,
  createMysqlBiomesAutomationAdapter,
  executeBiomesAutomationOperation,
  runBiomesAutomationOperationCli,
} from './run-biomes-automation-operation.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

function bundle(operationId = 'automation-biomes-first-l1') {
  return buildBiomesAutomationBundle({
    operationId,
    runId: operationId === 'automation-biomes-first-l1'
      ? 'biomes_l1_20260728_first'
      : 'biomes_l1_20260728_second',
    generatedAt: '2026-07-28T03:00:00.000Z',
    policy: {
      domainId: 'biomes',
      policyVersion: 1,
      policyHash: HASH_A,
      policySetHash: HASH_B,
    },
    baseline: {
      tables: {
        biomes: [{ id: 1, code: 'forest', name_en: 'Forest' }],
        biome_relations: [],
        biome_resources: [],
        item_biomes: [],
      },
      generations: [
        { databaseRole: 'local', table: 'biomes', generation: 0 },
        { databaseRole: 'local', table: 'biome_relations', generation: 0 },
        { databaseRole: 'local', table: 'biome_resources', generation: 0 },
        { databaseRole: 'local', table: 'item_biomes', generation: 0 },
      ],
    },
    importPlan: {
      sourceFiles: { wikiBiomesFile: 'data/generated/wiki-biomes.importable.latest.json' },
      biomes: [{ code: 'forest', nameEn: 'Forest', nameZh: '森林' }],
      itemBiomes: [],
      summary: {
        biomes: { input: 1 },
        biomeRelations: { input: 0 },
        biomeResources: { input: 0 },
        itemBiomes: { input: 0 },
      },
    },
  });
}

function authorizationContext(operationId) {
  return {
    operationId,
    actor: 'system-owner',
    reason: `apply ${operationId}`,
    authorizationReference: `decision://${operationId}`,
    decisionIdentity: `decision-${operationId}`,
    packetHash: HASH_A,
    authorizedAt: '2026-07-28T03:01:00.000Z',
    expiresAt: '2026-07-28T04:00:00.000Z',
  };
}

function adapter(currentBundle = bundle()) {
  const calls = [];
  return {
    calls,
    async begin() { calls.push(['begin']); },
    async lockCurrentContext() {
      calls.push(['lockCurrentContext']);
      return {
        ownerUsername: 'system-owner',
        ownerStatus: 'ACTIVE',
        domainId: 'biomes',
        policyVersion: 1,
        policyHash: HASH_A,
        policySetHash: HASH_B,
        currentLevel: 'L1',
        operationalState: 'ACTIVE',
        baselineFingerprint: currentBundle.baselineFingerprint,
        generations: currentBundle.baseline.generations,
      };
    },
    async persistRunChain(value, context) { calls.push(['persistRunChain', value, context]); },
    async applyFrozenImport() {
      calls.push(['applyFrozenImport']);
      return { biomes: { updated: 1 } };
    },
    async advanceMutationGenerations() { calls.push(['advanceMutationGenerations']); },
    async persistCommittedApply(value) { calls.push(['persistCommittedApply', value]); },
    async commit() { calls.push(['commit']); },
    async rollback() { calls.push(['rollback']); },
  };
}

test('biomes preview bundle freezes exact policy baseline import plan and operation identity', () => {
  const first = bundle();
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.operationId, 'automation-biomes-first-l1');
  assert.equal(first.domainId, 'biomes');
  assert.equal(first.plannedApplyActionId, 'biome-sync');
  assert.match(first.baselineFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.match(first.evidenceHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(first.logicalDiffHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(first.bundleHash, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(bundle('automation-biomes-second-l1').bundleHash, first.bundleHash);
});

test('authorized biomes L1 revalidates transaction context and commits the frozen import with governance facts', async () => {
  const frozen = bundle();
  const db = adapter(frozen);
  const result = await executeBiomesAutomationOperation({
    adapter: db,
    bundle: frozen,
    authorizationContext: authorizationContext(frozen.operationId),
    now: '2026-07-28T03:02:00.000Z',
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.bundleHash, frozen.bundleHash);
  assert.deepEqual(db.calls.map(([name]) => name), [
    'begin',
    'lockCurrentContext',
    'persistRunChain',
    'applyFrozenImport',
    'advanceMutationGenerations',
    'persistCommittedApply',
    'commit',
  ]);
  assert.equal(db.calls[2][2].decisionIdentity, authorizationContext(frozen.operationId).decisionIdentity);
});

test('biomes L1 keeps policy baseline and operation drift fail closed in one rollback', async () => {
  const frozen = bundle();
  const wrongOperation = adapter(frozen);
  await assert.rejects(() => executeBiomesAutomationOperation({
    adapter: wrongOperation,
    bundle: frozen,
    authorizationContext: authorizationContext('automation-biomes-second-l1'),
    now: '2026-07-28T03:02:00.000Z',
  }), /operationId/i);
  assert.equal(wrongOperation.calls.length, 0);

  const drifted = adapter(frozen);
  drifted.lockCurrentContext = async () => ({
    ...(await adapter(frozen).lockCurrentContext()),
    baselineFingerprint: HASH_A,
  });
  await assert.rejects(() => executeBiomesAutomationOperation({
    adapter: drifted,
    bundle: frozen,
    authorizationContext: authorizationContext(frozen.operationId),
    now: '2026-07-28T03:02:00.000Z',
  }), /baseline/i);
  assert.equal(drifted.calls.at(-1)[0], 'rollback');
  assert.equal(drifted.calls.some(([name]) => name === 'applyFrozenImport'), false);
});

test('biomes apply passes the exact authorized execution time into transaction-time locking', async () => {
  const frozen = bundle();
  const db = adapter(frozen);
  let lockedAt = null;
  db.lockCurrentContext = async (_bundle, executionTime) => {
    lockedAt = executionTime;
    return adapter(frozen).lockCurrentContext();
  };

  await executeBiomesAutomationOperation({
    adapter: db,
    bundle: frozen,
    authorizationContext: authorizationContext(frozen.operationId),
    now: '2026-07-28T03:02:00.000Z',
  });

  assert.equal(lockedAt, '2026-07-28T03:02:00.000Z');
});

test('biomes MySQL adapter binds snapshot integrity to frozen bundle bytes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biomes-adapter-'));
  const bundlePath = path.join(directory, 'bundle.json');
  const frozen = bundle();
  fs.writeFileSync(bundlePath, `${JSON.stringify(frozen, null, 2)}\n`, { mode: 0o600 });
  const calls = [];
  const connection = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/INSERT INTO crawler_automation_approval/.test(sql)) return [{ insertId: 41 }];
      if (/INSERT INTO crawler_automation_apply\b/.test(sql)) return [{ insertId: 42 }];
      return [{ affectedRows: 1 }];
    },
  };
  try {
    const mysql = createMysqlBiomesAutomationAdapter(connection, { bundlePath });
    await mysql.persistRunChain(frozen, authorizationContext(frozen.operationId));
    const snapshot = calls.find(({ sql }) => /INSERT INTO crawler_automation_snapshot/.test(sql));
    const expectedFileHash = `sha256:${createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex')}`;
    assert.ok(snapshot);
    assert.equal(snapshot.params[3], expectedFileHash);
    assert.equal(snapshot.params[5], frozen.baselineFingerprint);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('biomes MySQL adapter rejects a lost write-fence update', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biomes-fence-'));
  const bundlePath = path.join(directory, 'bundle.json');
  const frozen = bundle();
  fs.writeFileSync(bundlePath, JSON.stringify(frozen), { mode: 0o600 });
  const connection = {
    async query(sql) {
      if (/UPDATE crawler_automation_mutation_generation/.test(sql)) return [{ affectedRows: 1 }];
      if (/UPDATE crawler_automation_write_fence/.test(sql)) return [{ affectedRows: 0 }];
      return [{ affectedRows: 1 }];
    },
  };
  try {
    const mysql = createMysqlBiomesAutomationAdapter(connection, { bundlePath });
    await assert.rejects(() => mysql.advanceMutationGenerations(frozen), /write fence was lost: biomes/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('biomes MySQL adapter stores the fence marker within the VARCHAR(64) contract', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biomes-fence-marker-'));
  const bundlePath = path.join(directory, 'bundle.json');
  const frozen = bundle();
  fs.writeFileSync(bundlePath, JSON.stringify(frozen), { mode: 0o600 });
  const calls = [];
  const connection = {
    async query(sql, params) {
      calls.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  try {
    const mysql = createMysqlBiomesAutomationAdapter(connection, { bundlePath });
    await mysql.advanceMutationGenerations(frozen);
    const fenceUpdate = calls.find(({ sql }) => /UPDATE crawler_automation_write_fence SET committed_generation/.test(sql));
    assert.ok(fenceUpdate);
    assert.match(fenceUpdate.params[1], /^[a-f0-9]{64}$/);
    assert.equal(fenceUpdate.params[1], frozen.bundleHash.slice('sha256:'.length));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('biomes write fence permits the next generation only after the prior fence committed', () => {
  const executionTime = '2026-08-05T14:58:00.000Z';
  const expiresAt = '2026-08-06T14:43:09.000Z';

  assert.equal(classifyBiomesWriteFence({
    fence: { latestRunId: 'first-run', committedGeneration: null, expiresAt },
    runId: 'second-run',
    currentGeneration: 1,
    executionTime,
  }), 'active');
  assert.equal(classifyBiomesWriteFence({
    fence: { latestRunId: 'first-run', committedGeneration: 1, expiresAt },
    runId: 'second-run',
    currentGeneration: 1,
    executionTime,
  }), 'committed');
  assert.equal(classifyBiomesWriteFence({
    fence: { latestRunId: 'first-run', committedGeneration: 2, expiresAt },
    runId: 'second-run',
    currentGeneration: 1,
    executionTime,
  }), 'drifted');
});

test('biomes preview is read-only deterministic and writes a private atomic bundle', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biomes-preview-'));
  const standardizedPath = path.join(repoRoot, 'data/standardized/biomes.standardized.json');
  const relationDir = path.join(repoRoot, 'data/standardized-view/item_relations/biomes');
  const itemDir = path.join(repoRoot, 'data/standardized-view/item_relations/itemBiomes');
  const wikiPath = path.join(repoRoot, 'data/generated/wiki-biomes.importable.latest.json');
  const outputPath = path.join(repoRoot, 'reports/biomes.bundle.json');
  for (const directory of [path.dirname(standardizedPath), relationDir, itemDir, path.dirname(wikiPath)]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(standardizedPath, JSON.stringify({ records: [{ code: 'forest', nameEn: 'Forest' }] }));
  fs.writeFileSync(wikiPath, JSON.stringify({ biomes: [{ code: 'forest', nameEn: 'Forest', nameZh: '森林' }] }));
  const calls = [];
  const connection = previewConnection(calls);
  const mysqlModule = {
    async createConnection() {
      return connection;
    },
  };
  try {
    const result = await runBiomesAutomationOperationCli({
      argv: [
        '--operation-id=automation-biomes-first-l1',
        '--run-id=biomes_l1_20260728_preview',
        `--output=${outputPath}`,
        '--apply=false',
        `--standardized-biomes-file=${standardizedPath}`,
        `--relation-biomes-dir=${relationDir}`,
        `--item-biomes-dir=${itemDir}`,
        `--wiki-biomes-file=${wikiPath}`,
      ],
      env: databaseEnv(repoRoot),
      mysqlModule,
      now: '2026-07-28T03:02:00.000Z',
    });
    assert.equal(result.importPlan.generatedAt, '2026-07-28T03:02:00.000Z');
    assert.equal(fs.statSync(outputPath).mode & 0o077, 0);
    assert.deepEqual(fs.readdirSync(path.dirname(outputPath)), ['biomes.bundle.json']);
    assert.equal(calls.some(({ sql }) => /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)), false);
    assert.equal(connection.beginCount, 0);
    assert.equal(connection.endCount, 1);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('biomes apply validates authorization before opening a database connection', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biomes-auth-first-'));
  const inputPath = path.join(directory, 'bundle.json');
  const outputPath = path.join(directory, 'result.json');
  fs.writeFileSync(inputPath, JSON.stringify(bundle()), { mode: 0o600 });
  let connectionCount = 0;
  try {
    await assert.rejects(() => runBiomesAutomationOperationCli({
      argv: [
        '--operation-id=automation-biomes-first-l1',
        `--input=${inputPath}`,
        `--output=${outputPath}`,
        '--apply=true',
      ],
      env: databaseEnv(directory),
      mysqlModule: {
        async createConnection() {
          connectionCount += 1;
          throw new Error('database must not be opened');
        },
      },
      loadAuthorizationContextImpl() {
        throw new Error('authorization packet rejected');
      },
      now: '2026-07-28T03:02:00.000Z',
    }), /authorization packet rejected/);
    assert.equal(connectionCount, 0);
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('biomes CLI apply reaches the transaction with a valid authorization context', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-biomes-valid-auth-'));
  const inputPath = path.join(directory, 'bundle.json');
  const outputPath = path.join(directory, 'result.json');
  fs.writeFileSync(inputPath, JSON.stringify(bundle()), { mode: 0o600 });
  try {
    await assert.rejects(() => runBiomesAutomationOperationCli({
      argv: [
        '--operation-id=automation-biomes-first-l1',
        `--input=${inputPath}`,
        `--output=${outputPath}`,
        '--apply=true',
      ],
      env: databaseEnv(directory),
      mysqlModule: {
        async createConnection() {
          return {
            async beginTransaction() { throw new Error('transaction reached'); },
            async end() {},
          };
        },
      },
      loadAuthorizationContextImpl() {
        return authorizationContext('automation-biomes-first-l1');
      },
      now: '2026-07-28T03:02:00.000Z',
    }), /transaction reached/);
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function previewConnection(calls) {
  return {
    beginCount: 0,
    endCount: 0,
    async beginTransaction() { this.beginCount += 1; },
    async end() { this.endCount += 1; },
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM crawler_automation_owner/.test(sql)) {
        return [[{ username: 'system-owner', status: 'ACTIVE' }]];
      }
      if (/FROM crawler_automation_policy p/.test(sql)) {
        return [[{
          domainId: 'biomes',
          policyVersion: 1,
          policyHash: HASH_A,
          currentLevel: 'L1',
          operationalState: 'ACTIVE',
        }]];
      }
      if (/FROM crawler_automation_mutation_generation/.test(sql)) return [[]];
      if (/FROM `biomes`/.test(sql)) return [[{ id: 1, code: 'forest', name_en: 'Forest' }]];
      if (/FROM `(?:biome_relations|biome_resources|item_biomes)`/.test(sql)) return [[]];
      throw new Error(`unexpected preview SQL: ${sql}`);
    },
  };
}

function databaseEnv(worktreeRoot) {
  return {
    WORKTREE_ROOT: worktreeRoot,
    TERRAPEDIA_DB_HOST: '127.0.0.1',
    TERRAPEDIA_DB_PORT: '3306',
    TERRAPEDIA_DB_USERNAME: 'test',
    TERRAPEDIA_DB_PASSWORD: 'test',
    TERRAPEDIA_DB_NAME: 'terria_v1_local',
  };
}
