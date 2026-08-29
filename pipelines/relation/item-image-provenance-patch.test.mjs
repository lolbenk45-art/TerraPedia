import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ITEM_IMAGE_PROVENANCE_OPERATION_ID,
  ITEM_IMAGE_PROVENANCE_WRITE_TARGETS,
  buildItemImageProvenanceMutationPlan,
  computeItemImageProvenanceScopeHash,
  executeItemImageProvenanceTransaction,
  validateItemImageProvenanceInput,
} from './item-image-provenance-patch.mjs';

const HASH = (char) => `sha256:${char.repeat(64)}`;

function row(index) {
  const internalName = `TestItem${index}`;
  const fileTitle = `Test Item ${index}.png`;
  const cachedUrl = `/terrapedia-images/items/test-${index}.png`;
  const originalUrl = `https://terraria.wiki.gg/images/Test_Item_${index}.png?abc${index}`;
  const sourcePage = `Test Item ${index}`;
  const revision = `2026-08-19T00:00:0${index}Z`;
  const recordKey = `record-${index}`;
  const before = {
    sourcePage: null,
    sourceRevisionTimestamp: null,
    originalUrl: null,
    cachedUrl,
    landingSourceId: 10,
    landingSourceKey: 'canonical.item_image_sources',
    landingContentHash: HASH('a'),
  };
  const after = {
    sourcePage,
    sourceRevisionTimestamp: revision,
    originalUrl,
    cachedUrl,
  };
  return {
    itemInternalName: internalName,
    sourceFileTitle: fileTitle,
    sourceProvider: 'terraria.wiki.gg',
    rawEvidence: {
      sourceFile: `${internalName.toLowerCase()}.latest.json`,
      rawFileSha256: HASH(String(index)),
      pageId: 100 + index,
      sourcePage,
      sourceRevisionTimestamp: revision,
      originalUrl,
    },
    maint: {
      id: 1000 + index,
      recordKey,
      before,
      after,
    },
    relation: {
      id: 2000 + index,
      recordKey,
      sourceMaintId: 1000 + index,
      before: { ...before },
      after,
    },
    local: {
      itemId: 3000 + index,
      imageId: 4000 + index,
      before: { ...before },
      after,
    },
  };
}

function preview() {
  const value = {
    schemaVersion: 1,
    operationId: ITEM_IMAGE_PROVENANCE_OPERATION_ID,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    evidence: { path: 'evidence.json', sha256: HASH('e') },
    scope: { item: { rowCount: 2, rows: [row(1), row(2)], errors: [] } },
  };
  value.scopeHash = computeItemImageProvenanceScopeHash(value);
  return value;
}

function input(value = preview(), overrides = {}) {
  return {
    schemaVersion: 1,
    operationId: ITEM_IMAGE_PROVENANCE_OPERATION_ID,
    apply: true,
    databaseWrites: true,
    externalRequests: false,
    scopeSha256: value.scopeHash,
    previewSha256: HASH('b'),
    evidenceReportSha256: HASH('e'),
    expectedCounts: { maint: 2, relation: 2, local: 2 },
    writeTargets: [...ITEM_IMAGE_PROVENANCE_WRITE_TARGETS],
    ...overrides,
  };
}

test('Item provenance contract accepts the exact three-layer metadata scope', () => {
  const value = preview();
  assert.doesNotThrow(() => validateItemImageProvenanceInput({
    input: input(value), preview: value, previewSha256: HASH('b'), expectedCount: 2,
  }));
  const plan = buildItemImageProvenanceMutationPlan(value, { expectedCount: 2 });
  assert.equal(plan.rows.length, 2);
  assert.deepEqual(plan.rows.map((candidate) => candidate.itemInternalName), ['TestItem1', 'TestItem2']);
  assert.deepEqual(ITEM_IMAGE_PROVENANCE_WRITE_TARGETS, [
    'maint.maint_item_images.source_page',
    'maint.maint_item_images.source_revision_timestamp',
    'maint.maint_item_images.original_url',
    'relation.relation_item_images.source_page',
    'relation.relation_item_images.source_revision_timestamp',
    'relation.relation_item_images.original_url',
    'local.item_images.source_page',
    'local.item_images.source_revision_timestamp',
    'local.item_images.original_url',
  ]);
});

test('Item provenance contract rejects quarantine and immutable-field drift', () => {
  const value = preview();
  value.scope.item.rows[0].itemInternalName = 'FallenStar';
  assert.throws(() => validateItemImageProvenanceInput({
    input: input(value), preview: value, previewSha256: HASH('b'), expectedCount: 2,
  }), /quarantine|scope/i);

  const changed = preview();
  changed.scope.item.rows[0].maint.after.cachedUrl = '/changed.png';
  changed.scopeHash = computeItemImageProvenanceScopeHash(changed);
  assert.throws(() => validateItemImageProvenanceInput({
    input: input(changed), preview: changed, previewSha256: HASH('b'), expectedCount: 2,
  }), /cached URL|immutable|drift/i);
});

test('Item provenance contract rejects timezone-less revision timestamps', () => {
  const value = preview();
  const candidate = value.scope.item.rows[0];
  const invalid = '2026-08-19 00:00:01';
  candidate.rawEvidence.sourceRevisionTimestamp = invalid;
  for (const layer of ['maint', 'relation', 'local']) candidate[layer].after.sourceRevisionTimestamp = invalid;
  value.scopeHash = computeItemImageProvenanceScopeHash(value);
  assert.throws(() => validateItemImageProvenanceInput({
    input: input(value), preview: value, previewSha256: HASH('b'), expectedCount: 2,
  }), /UTC|timestamp/i);
});

test('Item provenance transaction aborts before DML when a locked row drifts', async () => {
  const value = preview();
  const contract = input(value);
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute() { events.push('execute'); return [{ affectedRows: 1 }]; },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  const plan = buildItemImageProvenanceMutationPlan(value, { expectedCount: 2 });
  const drifted = structuredClone(plan);
  drifted.rows[0].before.maint.cachedUrl = '/drifted.png';
  await assert.rejects(() => executeItemImageProvenanceTransaction({
    connection,
    input: contract,
    plan,
    readCurrent: async () => drifted,
    readback: async () => drifted,
    consumeDispatchPermit: async () => events.push('permit'),
    verifyRawEvidence: async () => {},
  }), /drift/i);
  assert.deepEqual(events, ['begin', 'rollback']);
});

test('Item provenance transaction rejects source identity drift before DML', async () => {
  const value = preview();
  const contract = input(value);
  const plan = buildItemImageProvenanceMutationPlan(value, { expectedCount: 2 });
  const drifted = structuredClone(plan);
  drifted.rows[0].relation.sourceProvider = 'other.provider';
  const connection = {
    async beginTransaction() {},
    async execute() { throw new Error('DML must not run'); },
    async rollback() {},
  };
  await assert.rejects(() => executeItemImageProvenanceTransaction({
    connection,
    input: contract,
    plan,
    readCurrent: async () => drifted,
    readback: async () => drifted,
    consumeDispatchPermit: async () => {},
    verifyRawEvidence: async () => {},
  }), /source identity|drift/i);
});

test('Item provenance transaction rolls back on an affected-row mismatch', async () => {
  const value = preview();
  const contract = input(value);
  const plan = buildItemImageProvenanceMutationPlan(value, { expectedCount: 2 });
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql) { events.push(sql); return [{ affectedRows: 0 }]; },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  await assert.rejects(() => executeItemImageProvenanceTransaction({
    connection,
    input: contract,
    plan,
    readCurrent: async () => plan,
    readback: async () => plan,
    consumeDispatchPermit: async () => events.push('permit'),
    verifyRawEvidence: async () => {},
  }), /affected row/i);
  assert.equal(events[0], 'begin');
  assert.equal(events.at(-1), 'rollback');
  assert.equal(events.includes('commit'), false);
  assert.equal(events.some((event) => String(event).includes('SET cached_url')), false);
});

test('Item provenance transaction serializes ISO revisions for MySQL and semantically reads them back', async () => {
  const value = preview();
  const plan = buildItemImageProvenanceMutationPlan(value, { expectedCount: 2 });
  const executed = [];
  const connection = {
    async beginTransaction() {},
    async execute(sql, parameters) {
      executed.push({ sql, parameters });
      return [{ affectedRows: 1 }];
    },
    async commit() {},
    async rollback() {},
  };
  const readback = structuredClone(plan);
  for (const candidate of readback.rows) {
    for (const layer of ['maint', 'relation', 'local']) {
      candidate.after[layer].sourceRevisionTimestamp = mysqlDriverDate(
        plan.rows.find((row) => row.itemInternalName === candidate.itemInternalName).after[layer].sourceRevisionTimestamp,
      );
    }
  }

  await executeItemImageProvenanceTransaction({
    connection,
    input: input(value),
    plan,
    readCurrent: async () => plan,
    readback: async () => readback,
    consumeDispatchPermit: async () => {},
    verifyRawEvidence: async () => {},
  });

  assert.deepEqual(
    executed.map(({ parameters }) => parameters[1]),
    [
      '2026-08-19 00:00:01',
      '2026-08-19 00:00:01',
      '2026-08-19 00:00:01',
      '2026-08-19 00:00:02',
      '2026-08-19 00:00:02',
      '2026-08-19 00:00:02',
    ],
  );
});

function mysqlDriverDate(isoTimestamp) {
  const date = new Date(isoTimestamp);
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );
}
