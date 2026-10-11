import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { persistedItemSourceFixture } from '../maint/armor-item-effect-test-fixture.mjs';
import { buildArmorAttributeDispatch } from './sync-maint-to-relation.mjs';
import { buildArmorTypedEffectPublicationPlan } from './armor-typed-effect-publication.mjs';

const OPERATION_ID = 'canonical-armor-typed-effect-publication';
const sourceFingerprint = { pageRevisionId: 1027106, iteminfoRevisionId: 1023241, armorSetsRevisionId: 964993 };
const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function makeProposal() {
  return buildArmorTypedEffectPublicationPlan({
    typedEffects: buildArmorAttributeDispatch(persistedItemSourceFixture()).relationEquipmentEffectAttributes,
    currentRelationRows: [{
      id: 1, record_key: 'a'.repeat(64), owner_kind: 'item', owner_id: 256,
      source_kind: 'armor_attribute_cell', status: 1, deleted: 0,
    }],
    sourceFingerprint,
  });
}

function materializedRows(plan) {
  return [
    ...structuredClone(plan.currentRelationRows),
    ...plan.proposedRows.map((row, index) => ({ ...row, id: 800 + index })),
  ];
}

function writePrivateJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
}

function makeAttempt(repoRoot, { proposal = makeProposal(), serverUuid = 'server-01' } = {}) {
  const label = 'recover-01';
  const prefix = path.join(repoRoot, 'reports/authorization/canonical', `${OPERATION_ID}.${label}`);
  const proposalPath = `${prefix}.proposal.json`;
  const preparedPath = `${prefix}.prepared.json`;
  const proposalRelativePath = path.relative(repoRoot, proposalPath).split(path.sep).join('/');
  const proposalBytes = `${JSON.stringify(proposal, null, 2)}\n`;
  fs.mkdirSync(path.dirname(proposalPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(proposalPath, proposalBytes, { mode: 0o600 });
  fs.chmodSync(proposalPath, 0o600);
  writePrivateJson(preparedPath, {
    schemaVersion: 'armor-typed-effect-publication-attempt/v1',
    operationId: OPERATION_ID,
    status: 'PREPARED',
    proposalPath: proposalRelativePath,
    proposalSha256: proposal.proposalSha256,
    proposalContentSha256: hash(proposalBytes),
    sourceFingerprint: proposal.sourceFingerprint,
    preparedAt: '2026-10-04T00:00:00.000Z',
    authorization: {
      decisionIdentity: 'decision-recover-01',
      packetHash: `sha256:${'b'.repeat(64)}`,
      serverFingerprint: {
        serverUuid,
        host: '127.0.0.1',
        port: 13306,
        databases: ['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation'],
      },
    },
  });
  return { label, proposalPath, preparedPath,
    reconciliationPath: path.relative(repoRoot, `${prefix}.reconciliation.json`).split(path.sep).join('/') };
}

function connection(serverUuid, rows) {
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(['query', sql]);
      if (sql === 'SELECT @@server_uuid AS serverUuid') return [[{ serverUuid }]];
      if (sql.startsWith('SELECT * FROM terria_v1_relation.relation_equipment_effect_attributes')) return [structuredClone(rows)];
      return [[]];
    },
    async rollback() { calls.push(['rollback']); },
    async end() { calls.push(['end']); },
    async execute() { throw new Error('reconciliation attempted DML'); },
    async beginTransaction() { throw new Error('reconciliation attempted a writable transaction'); },
    async commit() { throw new Error('reconciliation attempted a commit'); },
  };
}

function config(repoRoot) {
  writePrivateJson(path.join(repoRoot, 'platform/local/config/local-stack.config.json'), {
    database: { host: '127.0.0.1', port: 13306, username: 'readonly', password: 'unused' },
  });
}

async function loadRunner() {
  const module = await import('./run-armor-typed-effect-publication.mjs');
  assert.equal(typeof module.reconcileArmorTypedEffectPublication, 'function');
  return module;
}

test('typed-effect recovery command writes private read-only reconciliation evidence for the original attempt', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-typed-effect-reconcile-'));
  const plan = makeProposal();
  const paths = makeAttempt(repoRoot, { proposal: plan });
  config(repoRoot);
  const db = connection('server-01', materializedRows(plan));
  try {
    const runner = await loadRunner();
    const result = await runner.reconcileArmorTypedEffectPublication({
      repoRoot,
      resultLabel: paths.label,
      mysqlModule: { createConnection: async () => db },
      recordedAt: '2026-10-04T01:00:00.000Z',
    });

    assert.equal(result.status, 'COMMITTED_READBACK_REQUIRED');
    assert.equal(result.applyAllowed, false);
    assert.equal(result.permitReplayAllowed, false);
    assert.equal(fs.existsSync(path.join(repoRoot, paths.reconciliationPath)), true);
    assert.equal(fs.statSync(path.join(repoRoot, paths.reconciliationPath)).mode & 0o077, 0);
    assert.deepEqual(db.calls.map(([kind, sql]) => kind === 'query' ? sql : kind), [
      'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
      'START TRANSACTION READ ONLY',
      'SELECT @@server_uuid AS serverUuid',
      'SELECT * FROM terria_v1_relation.relation_equipment_effect_attributes',
      'rollback',
      'end',
    ]);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('typed-effect recovery attaches projection/API acceptance evidence after committed relation readback', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-typed-effect-reconcile-'));
  const plan = makeProposal();
  const paths = makeAttempt(repoRoot, { proposal: plan });
  config(repoRoot);
  const db = connection('server-01', materializedRows(plan));
  const calls = [];
  try {
    const runner = await loadRunner();
    const result = await runner.reconcileArmorTypedEffectPublication({
      repoRoot,
      resultLabel: paths.label,
      mysqlModule: { createConnection: async () => db },
      postCommitAcceptance: async input => {
        calls.push(input);
        return {
          schemaVersion: 'armor-projection-api-acceptance/v1', status: 'verified', runtimeVerified: true,
          databaseWrites: false, apiReadOnly: true, postCommit: true, blockers: [],
        };
      },
      recordedAt: '2026-10-04T01:00:00.000Z',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].reconciliation.status, 'COMMITTED_READBACK_REQUIRED');
    assert.equal(result.postCommitAcceptance.status, 'verified');
    assert.equal(result.runtimeVerified, true);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('typed-effect recovery refuses proposal bytes that differ from PREPARED evidence', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-typed-effect-reconcile-'));
  const paths = makeAttempt(repoRoot);
  config(repoRoot);
  const changedProposal = JSON.parse(fs.readFileSync(paths.proposalPath, 'utf8'));
  changedProposal.reviewNote = 'changed after preparation';
  fs.writeFileSync(paths.proposalPath, `${JSON.stringify(changedProposal, null, 2)}\n`);
  let connections = 0;
  try {
    const runner = await loadRunner();
    await assert.rejects(runner.reconcileArmorTypedEffectPublication({
      repoRoot,
      resultLabel: paths.label,
      mysqlModule: { createConnection: async () => { connections += 1; return connection('server-01', []); } },
    }), /hash drift/i);
    assert.equal(connections, 0);
    assert.equal(fs.existsSync(path.join(repoRoot, paths.reconciliationPath)), false);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('typed-effect recovery refuses target-server drift and does not publish a reconciliation result', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'armor-typed-effect-reconcile-'));
  const plan = makeProposal();
  const paths = makeAttempt(repoRoot, { proposal: plan });
  config(repoRoot);
  const db = connection('foreign-server', materializedRows(plan));
  try {
    const runner = await loadRunner();
    await assert.rejects(runner.reconcileArmorTypedEffectPublication({
      repoRoot,
      resultLabel: paths.label,
      mysqlModule: { createConnection: async () => db },
    }), /server UUID/i);
    assert.equal(db.calls.some(([, sql]) => String(sql).startsWith('SELECT * FROM')), false);
    assert.equal(fs.existsSync(path.join(repoRoot, paths.reconciliationPath)), false);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
