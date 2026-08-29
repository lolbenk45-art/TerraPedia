import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUFF_IMAGE_PROJECTION_OPERATION_ID,
  BUFF_IMAGE_PROJECTION_WRITE_TARGETS,
  buildBuffImageProjectionMutationPlan,
  computeBuffImageProjectionScopeHash,
  executeBuffImageProjectionTransaction,
  validateBuffImageProjectionInput,
} from './buff-image-projection-patch.mjs';

const HASH = (char) => `sha256:${char.repeat(64)}`;

function preview() {
  const rows = [1, 2].map((index) => ({
    internalName: `Buff${index}`,
    relation: {
      id: index,
      sourceFileTitle: `Buff ${index}.png`,
      sourceProvider: 'terraria.wiki.gg',
      cachedUrl: `http://localhost:9000/terrapedia-images/buffs/${index}.png`,
      originalUrl: `https://terraria.wiki.gg/images/Buff_${index}.png`,
    },
    projection: { id: index, beforeImage: null, afterImage: `http://localhost:9000/terrapedia-images/buffs/${index}.png` },
  }));
  const value = {
    schemaVersion: 1,
    operationId: BUFF_IMAGE_PROJECTION_OPERATION_ID,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    evidence: { path: 'evidence.json', sha256: HASH('e') },
    scope: { buff: { rowCount: rows.length, rows, errors: [] } },
  };
  value.scopeHash = computeBuffImageProjectionScopeHash(value);
  return value;
}

function input(value = preview(), overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: BUFF_IMAGE_PROJECTION_OPERATION_ID,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    scopeSha256: value.scopeHash,
    previewSha256: HASH('c'),
    evidenceReportSha256: HASH('e'),
    expectedCounts: { projection: 2 },
    writeTargets: [...BUFF_IMAGE_PROJECTION_WRITE_TARGETS],
    ...overrides,
  };
}

test('Buff projection contract accepts only the one-column projection scope', () => {
  const value = preview();
  assert.doesNotThrow(() => validateBuffImageProjectionInput({
    input: input(value), preview: value, previewSha256: HASH('c'), expectedCount: 2,
  }));
  const plan = buildBuffImageProjectionMutationPlan(value, { expectedCount: 2 });
  assert.deepEqual(plan.rows.map((row) => row.internalName), ['Buff1', 'Buff2']);
  assert.deepEqual(BUFF_IMAGE_PROJECTION_WRITE_TARGETS, ['relation.projection_buffs.image']);
});

test('Buff projection contract rejects a pre-existing image or relation cache drift', () => {
  const value = preview();
  value.scope.buff.rows[0].projection.beforeImage = 'already-set';
  value.scopeHash = computeBuffImageProjectionScopeHash(value);
  assert.throws(() => validateBuffImageProjectionInput({
    input: input(value), preview: value, previewSha256: HASH('c'), expectedCount: 2,
  }), /before image|empty|drift/i);
});

test('Buff projection transaction rolls back and never updates relation image evidence', async () => {
  const value = preview();
  const contract = input(value);
  const plan = buildBuffImageProjectionMutationPlan(value, { expectedCount: 2 });
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql) { events.push(sql); return [{ affectedRows: 0 }]; },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  await assert.rejects(() => executeBuffImageProjectionTransaction({
    connection,
    input: contract,
    plan,
    readCurrent: async () => plan,
    readback: async () => plan,
    consumeDispatchPermit: async () => events.push('permit'),
  }), /affected row/i);
  assert.equal(events.at(-1), 'rollback');
  assert.equal(events.includes('commit'), false);
  assert.equal(events.some((event) => String(event).includes('relation_buff_images')), false);
});

test('Buff projection transaction rejects relation source identity drift before DML', async () => {
  const value = preview();
  const contract = input(value);
  const plan = buildBuffImageProjectionMutationPlan(value, { expectedCount: 2 });
  const drifted = structuredClone(plan);
  drifted.rows[0].relation.sourceFileTitle = 'Different.png';
  const connection = {
    async beginTransaction() {},
    async execute() { throw new Error('DML must not run'); },
    async rollback() {},
  };
  await assert.rejects(() => executeBuffImageProjectionTransaction({
    connection,
    input: contract,
    plan,
    readCurrent: async () => drifted,
    readback: async () => drifted,
    consumeDispatchPermit: async () => {},
  }), /source identity|drift/i);
});
