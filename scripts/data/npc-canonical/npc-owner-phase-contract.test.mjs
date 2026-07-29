import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { TABLE_OWNERSHIP_MATRIX } from '../automation/table-ownership-matrix.mjs';
import { NPC_APPLY_OWNER_PHASES } from './npc-apply-ownership-preparation.mjs';
import {
  buildCanonicalNpcApplyCompletion,
  buildNpcOwnerOperationPlan,
  createCanonicalNpcOwnerMysqlAdapter,
  executeNpcOwnerOperation,
  writeCanonicalNpcApplyResult,
} from './npc-owner-phase-apply.mjs';

const INPUT_PATH = 'reports/authorization/canonical/canonical-npc-apply.input.json';
const COMPLETED_AT = '2026-07-29T05:30:00.000Z';
const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

function hashBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function frozenInput(marker = 'same') {
  return {
    schemaVersion: 1,
    operationId: 'canonical-npc-apply',
    pairCount: 25,
    evidencePairs: Array.from({ length: 25 }, (_, index) => ({ entityId: `npc-${index + 1}` })),
    marker,
  };
}

function inputEnvelope(marker = 'same') {
  const payload = frozenInput(marker);
  const bytes = Buffer.from(`${JSON.stringify(payload)}\n`);
  return { payload, bytes, path: INPUT_PATH };
}

function operationDefinition(operationId) {
  if (operationId === 'canonical-npc-landing-apply') {
    return {
      phaseIndex: 0,
      capability: 'landing',
      ownershipKeys: [
        'local.source_dataset_landings.npcs_base',
        'local.source_dataset_landings.npc_crawler_facts',
      ],
      requiredOperationIds: [],
    };
  }
  return NPC_APPLY_OWNER_PHASES.find((phase) => phase.operationId === operationId);
}

function completedResult(operationId, inputHash, overrides = {}) {
  const definition = operationDefinition(operationId);
  return {
    schemaVersion: 1,
    resultKind: 'canonical_npc_owner_operation_result',
    operationId,
    phaseIndex: definition.phaseIndex,
    capability: definition.capability,
    status: 'COMPLETED',
    input: { path: INPUT_PATH, contentHash: inputHash, sizeBytes: 123 },
    requiredResults: definition.requiredOperationIds.map((requiredOperationId) => ({
      operationId: requiredOperationId,
      path: `reports/authorization/canonical/${requiredOperationId}.result.json`,
      contentHash: `sha256:${requiredOperationId.padEnd(64, 'a').slice(0, 64).replace(/[^a-f0-9]/g, 'a')}`,
      sizeBytes: 100,
    })),
    ownershipKeys: [...definition.ownershipKeys],
    transactionCommitted: true,
    rowCounts: Object.fromEntries(definition.ownershipKeys.map((key) => [key, 1])),
    outputHash: `sha256:${'b'.repeat(64)}`,
    completedAt: COMPLETED_AT,
    ...overrides,
  };
}

function completedChain(inputHash) {
  const results = [];
  for (const operationId of ['canonical-npc-landing-apply', ...NPC_APPLY_OWNER_PHASES.map((phase) => phase.operationId)]) {
    const requiredResults = results.map((result) => {
      const bytes = Buffer.from(`${JSON.stringify(result)}\n`);
      return {
        operationId: result.operationId,
        path: `reports/authorization/canonical/${result.operationId}.result.json`,
        contentHash: hashBytes(bytes),
        sizeBytes: bytes.length,
      };
    });
    results.push(completedResult(operationId, inputHash, { requiredResults }));
  }
  return results;
}

test('landing ownership is partitioned explicitly and every downstream phase binds all predecessors', () => {
  const byKey = new Map(TABLE_OWNERSHIP_MATRIX.map((row) => [row.key, row]));
  assert.equal(byKey.get('local.source_dataset_landings.npcs_base')?.capability, 'landing');
  assert.equal(byKey.get('local.source_dataset_landings.npc_crawler_facts')?.capability, 'landing');
  assert.deepEqual(NPC_APPLY_OWNER_PHASES[0].requiredOperationIds, ['canonical-npc-landing-apply']);
  assert.equal(NPC_APPLY_OWNER_PHASES[6].requiredOperationIds.length, 7);
});

test('operation plan binds one raw input hash and rejects incomplete or drifted predecessors', async () => {
  const input = inputEnvelope();
  const inputHash = hashBytes(input.bytes);
  const landing = completedResult('canonical-npc-landing-apply', inputHash);
  const landingBytes = Buffer.from(`${JSON.stringify(landing)}\n`);
  const maint = completedResult('canonical-npc-facts-maint-apply', inputHash, {
    requiredResults: [{
      operationId: landing.operationId,
      path: `reports/authorization/canonical/${landing.operationId}.result.json`,
      contentHash: hashBytes(landingBytes),
      sizeBytes: landingBytes.length,
    }],
  });
  const plan = await buildNpcOwnerOperationPlan({
    operationId: 'canonical-npc-item-relations-apply',
    input,
    requiredResults: [landing, maint],
  });

  assert.equal(plan.input.contentHash, inputHash);
  assert.deepEqual(plan.requiredResults.map((result) => result.operationId), [
    'canonical-npc-landing-apply',
    'canonical-npc-facts-maint-apply',
  ]);
  assert.deepEqual(plan.ownershipKeys, operationDefinition(plan.operationId).ownershipKeys);

  await assert.rejects(() => buildNpcOwnerOperationPlan({
    operationId: plan.operationId,
    input,
    requiredResults: [landing],
  }), /required predecessor.*canonical-npc-facts-maint-apply/i);
  await assert.rejects(() => buildNpcOwnerOperationPlan({
    operationId: plan.operationId,
    input,
    requiredResults: [landing, { ...maint, input: { ...maint.input, contentHash: hashBytes(inputEnvelope('drift').bytes) } }],
  }), /input hash mismatch/i);
  await assert.rejects(() => buildNpcOwnerOperationPlan({
    operationId: plan.operationId,
    input,
    requiredResults: [landing, { ...maint, transactionCommitted: false }],
  }), /committed predecessor/i);
  await assert.rejects(() => buildNpcOwnerOperationPlan({
    operationId: plan.operationId,
    input,
    requiredResults: [landing, {
      ...maint,
      requiredResults: [{ ...maint.requiredResults[0], contentHash: `sha256:${'d'.repeat(64)}` }],
    }],
  }), /predecessor result hash mismatch/i);
});

test('production adapter executes only the selected local projection ownership', async () => {
  const input = inputEnvelope();
  input.payload.databases = {
    local: 'terria_v1_local',
    maint: 'terria_v1_maint',
    relation: 'terria_v1_relation',
  };
  input.bytes = Buffer.from(`${JSON.stringify(input.payload)}\n`);
  const phase = operationDefinition('canonical-npc-buff-projection-apply');
  const plan = {
    operationId: phase.operationId,
    phaseIndex: phase.phaseIndex,
    capability: phase.capability,
    ownershipKeys: [...phase.ownershipKeys],
    requiredResults: [],
    input: {
      path: INPUT_PATH,
      contentHash: hashBytes(input.bytes),
      sizeBytes: input.bytes.length,
      payload: input.payload,
    },
  };
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    query: async (sql) => {
      calls.push(sql);
      return /^SELECT COUNT\(\*\)/.test(sql.trim()) ? [[{ total: 9 }]] : [[]];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    end: async () => calls.push('end'),
  };
  const adapter = createCanonicalNpcOwnerMysqlAdapter({
    plan,
    connectionFactory: async () => connection,
  });
  const result = await executeNpcOwnerOperation({ plan, adapter, completedAt: COMPLETED_AT });
  assert.equal(result.rowCounts['local.npc_buff_relations.buffs'], 9);
  const sql = calls.filter((call) => typeof call === 'string').join('\n');
  assert.match(sql, /npc_buff_relations/);
  assert.doesNotMatch(sql, /npc_shop_entries|npc_loot_entries|item_source_facts/);
  assert.deepEqual(calls.slice(-2), ['commit', 'end']);
});

test('production adapter re-reads the owned partition before commit', async () => {
  const input = inputEnvelope();
  input.payload.databases = {
    local: 'terria_v1_local',
    maint: 'terria_v1_maint',
    relation: 'terria_v1_relation',
  };
  input.bytes = Buffer.from(`${JSON.stringify(input.payload)}\n`);
  const phase = operationDefinition('canonical-npc-buff-projection-apply');
  const plan = {
    operationId: phase.operationId,
    phaseIndex: phase.phaseIndex,
    capability: phase.capability,
    ownershipKeys: [...phase.ownershipKeys],
    requiredResults: [],
    input: {
      path: INPUT_PATH,
      contentHash: hashBytes(input.bytes),
      sizeBytes: input.bytes.length,
      payload: input.payload,
    },
  };
  let countReads = 0;
  const connection = {
    beginTransaction: async () => {},
    query: async (sql) => {
      if (/^SELECT COUNT\(\*\)/.test(sql.trim())) {
        countReads += 1;
        return [[{ total: countReads === 1 ? 9 : 8 }]];
      }
      return [[]];
    },
    commit: async () => {},
    rollback: async () => {},
    end: async () => {},
  };
  const adapter = createCanonicalNpcOwnerMysqlAdapter({
    plan,
    connectionFactory: async () => connection,
  });

  await assert.rejects(
    () => executeNpcOwnerOperation({ plan, adapter, completedAt: COMPLETED_AT }),
    /readback counts do not match writes/i,
  );
  assert.equal(countReads, 2);
});

test('production landing adapter supplies governed source-evidence metadata', async () => {
  const plan = await buildNpcOwnerOperationPlan({
    repoRoot: REPO_ROOT,
    operationId: 'canonical-npc-landing-apply',
  });
  const inserts = [];
  const connection = {
    beginTransaction: async () => {},
    execute: async (sql, params = []) => {
      if (/^SELECT COUNT\(\*\)/.test(sql.trim())) return [[{ total: 1 }]];
      if (/^SELECT id, content_hash, source_page/.test(sql.trim())) return [[]];
      if (/^INSERT INTO source_dataset_landings/.test(sql.trim())) {
        inserts.push(params);
        return [{}];
      }
      throw new Error(`unexpected landing SQL: ${sql.trim().split('\n')[0]}`);
    },
    commit: async () => {},
    rollback: async () => {},
    end: async () => {},
  };
  const result = await executeNpcOwnerOperation({
    plan,
    adapter: createCanonicalNpcOwnerMysqlAdapter({
      repoRoot: REPO_ROOT,
      plan,
      connectionFactory: async () => connection,
    }),
    completedAt: COMPLETED_AT,
  });

  assert.equal(result.rowCounts['local.source_dataset_landings.npcs_base'], 1);
  assert.equal(result.rowCounts['local.source_dataset_landings.npc_crawler_facts'], 25);
  assert.equal(inserts.length, 26);
  assert.equal(inserts.every((params) => params[12] === 'source_evidence'), true);
  assert.equal(inserts.every((params) => params[13] === 'canonical-npc-landing-bundle'), true);
  assert.equal(inserts.every((params) => params[14] === '1'), true);
  assert.equal(inserts.every((params) => /^canonical-npc-landing:sha256:[a-f0-9]{64}$/.test(params[15])), true);
  assert.equal(inserts.every((params) => /^[a-f0-9]{64}$/.test(params[17])), true);
  assert.equal(inserts.every((params) => Number.isSafeInteger(params[18]) && params[18] > 0), true);
});

test('production maint adapter persists only physical maint crawler-fact columns', async () => {
  const normalized = {
    entityId: 'medusa',
    source: { pageTitle: 'Medusa' },
    sourceMetadata: { revisionTimestamp: '2026-07-29T00:00:00Z' },
    display: { name: 'Medusa' },
    buffInflictions: [],
    shop: { normalizedRows: [] },
    loot: [],
  };
  const audit = { status: 'pass' };
  const normalizedContentHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  const phase = operationDefinition('canonical-npc-facts-maint-apply');
  const plan = {
    operationId: phase.operationId,
    phaseIndex: phase.phaseIndex,
    capability: phase.capability,
    ownershipKeys: [...phase.ownershipKeys],
    requiredResults: [],
    input: {
      path: INPUT_PATH,
      contentHash: `sha256:${'a'.repeat(64)}`,
      sizeBytes: 1,
      payload: {
        databases: {
          local: 'terria_v1_local',
          maint: 'terria_v1_maint',
          relation: 'terria_v1_relation',
        },
        pairCount: 1,
        evidencePairs: [{ normalizedContentHash }],
      },
    },
  };
  const landingRows = [{
    id: 1,
    source_key: 'wiki.npc.crawler_fact:medusa',
    source_page: 'Medusa',
    content_hash: 'landing-1',
    payload_json: JSON.stringify({ normalized, audit }),
  }];
  const inserts = [];
  const connection = {
    beginTransaction: async () => {},
    query: async (sql) => {
      if (sql.includes('source_dataset_landings')) return [landingRows];
      if (sql.includes('maint_npcs')) {
        return [[{ source_id: 477, internal_name: 'Medusa', english_name: 'Medusa' }]];
      }
      throw new Error(`unexpected maint query: ${sql.trim().split('\n')[0]}`);
    },
    execute: async (sql, params = []) => {
      if (sql.startsWith('INSERT INTO')) {
        inserts.push(sql);
        return [{}];
      }
      if (sql.startsWith('SELECT COUNT(*)')) return [[{ total: params.length }]];
      throw new Error(`unexpected maint execute: ${sql.trim().split('\n')[0]}`);
    },
    commit: async () => {},
    rollback: async () => {},
    end: async () => {},
  };

  const result = await executeNpcOwnerOperation({
    plan,
    adapter: createCanonicalNpcOwnerMysqlAdapter({
      plan,
      connectionFactory: async () => connection,
    }),
    completedAt: COMPLETED_AT,
  });

  assert.equal(result.rowCounts['maint.maint_npc_crawler_facts.canonical'], 1);
  assert.equal(inserts.length, 1);
  assert.equal(inserts.every((sql) => !sql.includes('`scope`')), true);
  assert.equal(inserts.every((sql) => !sql.includes('`table_name`')), true);
});

test('operation executor commits one exact ownership set and rolls back without success evidence on failure', async () => {
  const input = inputEnvelope();
  const plan = await buildNpcOwnerOperationPlan({
    operationId: 'canonical-npc-landing-apply',
    input,
    requiredResults: [],
  });
  const calls = [];
  const result = await executeNpcOwnerOperation({
    plan,
    completedAt: COMPLETED_AT,
    adapter: {
      begin: async () => calls.push('begin'),
      apply: async (actual) => {
        calls.push(['apply', actual.ownershipKeys]);
        return Object.fromEntries(actual.ownershipKeys.map((key) => [key, 25]));
      },
      verify: async ({ rowCounts }) => {
        calls.push('verify');
        return { rowCounts, outputHash: `sha256:${'c'.repeat(64)}` };
      },
      commit: async () => calls.push('commit'),
      rollback: async () => calls.push('rollback'),
    },
  });
  assert.deepEqual(calls, [
    'begin',
    ['apply', plan.ownershipKeys],
    'verify',
    'commit',
  ]);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.transactionCommitted, true);
  assert.deepEqual(result.ownershipKeys, plan.ownershipKeys);

  const failedCalls = [];
  await assert.rejects(() => executeNpcOwnerOperation({
    plan,
    adapter: {
      begin: async () => failedCalls.push('begin'),
      apply: async () => { throw new Error('write failed'); },
      verify: async () => { throw new Error('must not verify'); },
      commit: async () => failedCalls.push('commit'),
      rollback: async () => failedCalls.push('rollback'),
    },
  }), /write failed/);
  assert.deepEqual(failedCalls, ['begin', 'rollback']);
});

test('completion requires landing plus all seven ordered results for one frozen input', () => {
  const input = inputEnvelope();
  const inputHash = hashBytes(input.bytes);
  const results = completedChain(inputHash);
  const completion = buildCanonicalNpcApplyCompletion({ input, results, completedAt: COMPLETED_AT });
  assert.equal(completion.status, 'COMPLETED');
  assert.equal(completion.inputHash, inputHash);
  assert.match(completion.landingResultHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(completion.phaseResultHashes.length, 7);

  assert.throws(
    () => buildCanonicalNpcApplyCompletion({ input, results: results.slice(0, -1) }),
    /missing.*canonical-npc-boss-loot-projection-apply/i,
  );
  const drifted = structuredClone(results);
  drifted[4].input.contentHash = hashBytes(inputEnvelope('drift').bytes);
  assert.throws(
    () => buildCanonicalNpcApplyCompletion({ input, results: drifted }),
    /input hash mismatch/i,
  );
});

test('result writer publishes one private atomic JSON file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-owner-result-'));
  const input = inputEnvelope();
  const result = completedResult('canonical-npc-landing-apply', hashBytes(input.bytes));
  try {
    const outputPath = 'reports/authorization/canonical/canonical-npc-landing-apply.result.json';
    await writeCanonicalNpcApplyResult({ repoRoot: root, outputPath, result });
    const fullPath = path.join(root, outputPath);
    assert.equal(JSON.parse(fs.readFileSync(fullPath, 'utf8')).status, 'COMPLETED');
    assert.equal(fs.statSync(fullPath).mode & 0o777, 0o600);
    assert.deepEqual(fs.readdirSync(path.dirname(fullPath)).filter((name) => name.endsWith('.tmp')), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
