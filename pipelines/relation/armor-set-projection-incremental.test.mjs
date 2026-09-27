import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectionPayload } from './projection-sync.mjs';

const operation = await import('./armor-set-projection-incremental.mjs');
const serverUuid = '11111111-2222-3333-8444-555555555555';
const generatedAt = '2026-09-24T01:00:00.000Z';
const prefixes = ['http://localhost:9000/terrapedia-images/items/'];
const image = `${prefixes[0]}wood.png`;
const key = 'a'.repeat(64);

function fixture() {
  const sourceRows = {
    relationItems: [{ id: 1, recordKey: 'b'.repeat(64), sourceId: 1, internalName: 'WoodHelmet', nameZh: 'Wood helmet', status: 1, deleted: 0 }],
    relationItemImages: [{ id: 1, itemInternalName: 'WoodHelmet', cachedUrl: image, status: 1, deleted: 0 }],
    relationArmorSets: [{ id: 7, recordKey: key, textKey: 'ArmorSetBonus.Wood', rawJson: JSON.stringify({ entityType: 'armor_set', pageTitle: 'Wood armor', nameZh: 'Wood armor' }), setsJson: '[[1]]', uniqueItemIdsJson: '[1]', setCount: 1, uniqueItemCount: 1, status: 1, deleted: 0 }],
    relationArmorSetItems: [{ id: 1, armorSetRecordKey: key, itemSourceId: 1, itemInternalName: 'WoodHelmet', setVariantIndex: 0, partIndex: 0, partRole: 'head', status: 1, deleted: 0 }],
    relationArmorSetImages: [{ id: 1, armorSetRecordKey: key, textKey: 'ArmorSetBonus.Wood', imageRole: 'male', cachedUrl: image, status: 1, deleted: 0 }],
    relationArmorAttributeRows: [],
    relationEquipmentEffectAttributes: [],
  };
  const beforeRows = buildProjectionPayload({ ...sourceRows, managedImageUrlPrefixes: prefixes }).projectionArmorSets;
  beforeRows[0].id = 91;
  beforeRows[0].createdAt = '2026-01-01T00:00:00.000Z';
  beforeRows[0].updatedAt = '2026-01-02T00:00:00.000Z';
  return { beforeRows, sourceRows, serverUuid, generatedAt, managedImageUrlPrefixes: prefixes };
}

function changedFixture() {
  const input = fixture();
  input.beforeRows[0].nameZh = 'Old name';
  return input;
}

test('incremental Armor API has a separate operation identity', () => {
  assert.equal(typeof operation.buildArmorSetProjectionIncrementalProposal, 'function');
  assert.equal(operation.ARMOR_SET_PROJECTION_INCREMENTAL_OPERATION_ID, 'canonical-armor-set-projection-incremental');
});

test('actual unchanged relation facts produce no delta despite projection ids and timestamps', () => {
  const input = fixture();
  const proposal = operation.buildArmorSetProjectionIncrementalProposal(input);
  assert.equal(proposal.changedRowCount, 0);
  assert.equal(proposal.before.rowsSha256, proposal.after.rowsSha256);
  assert.equal(proposal.after.rows[0].id, 91);
  assert.equal(proposal.after.rows[0].createdAt, input.beforeRows[0].createdAt);
  assert.equal(operation.validateArmorSetProjectionIncrementalProposal(proposal), true);
});

test('CST-decoded source Dates and historical projection DATE_FORMAT values at the same instant are a no-op', async () => {
  const input = fixture();
  input.sourceRows.relationArmorSets[0].sourceRevisionTimestamp = new Date('2026-09-24T09:30:00+08:00');
  input.beforeRows = await operation.readArmorProjectionRows({
    async query(sql) {
      assert.match(sql, /DATE_FORMAT\(`source_revision_timestamp`, '%Y-%m-%d %H:%i:%s'\)/);
      const { sourceRevisionTimestamp, ...row } = input.beforeRows[0];
      return [[{ ...row, source_revision_timestamp: '2026-09-24 01:30:00' }]];
    },
  });
  const proposal = operation.buildArmorSetProjectionIncrementalProposal(input);
  assert.equal(proposal.changedRowCount, 0);
  assert.equal(proposal.before.rowsSha256, proposal.after.rowsSha256);
  assert.equal(proposal.after.rows[0].sourceRevisionTimestamp, '2026-09-24T01:30:00.000Z');
  assert.equal(operation.validateArmorSetProjectionIncrementalProposal(JSON.parse(JSON.stringify(proposal))), true);
});

test('changed relation facts update existing rows and retain unmatched projection rows', () => {
  const input = changedFixture();
  input.beforeRows.push({ ...input.beforeRows[0], id: 92, textKey: 'ArmorSetBonus.Other', sourceKey: 'Other armor', relationRecordKey: 'c'.repeat(64) });
  const proposal = operation.buildArmorSetProjectionIncrementalProposal(input);
  assert.deepEqual(proposal.changedKeys, ['ArmorSetBonus.Wood']);
  assert.equal(proposal.rows[0].nameZh, 'Wood armor');
  assert.equal(proposal.rows[0].id, 91);
  assert.equal(proposal.after.rowCount, 2);
  assert.equal(proposal.after.rows.find((row) => row.id === 92).nameZh, 'Old name');
  assert.deepEqual(proposal.target.writeTargets, ['relation.projection_armor_sets.update']);
});

test('JSON field formatting and image arrays do not create changes or lose managed media', () => {
  const input = fixture();
  input.beforeRows[0].maleImages = JSON.stringify([image]);
  input.beforeRows[0].setsJson = '[ [1] ]';
  const proposal = operation.buildArmorSetProjectionIncrementalProposal(input);
  assert.equal(proposal.changedRowCount, 0);
  assert.equal(proposal.after.rows[0].maleImages, JSON.stringify([image]));
});

test('metadata-only source changes do not republish Armor rows', () => {
  const input = fixture();
  input.sourceRows.relationArmorSets[0].id = 8;
  input.sourceRows.relationArmorSets[0].createdAt = '2026-09-24T00:00:00.000Z';
  input.sourceRows.relationArmorSets[0].updatedAt = '2026-09-24T00:00:00.000Z';
  assert.equal(operation.buildArmorSetProjectionIncrementalProposal(input).changedRowCount, 0);
});

test('Armor part source ID and internal name must resolve to the same unique active item', async (t) => {
  const cases = {
    'conflicting item identity': (rows) => {
      rows.relationItems[0].internalName = 'ForeignItem';
      rows.relationItems[0].nameZh = 'Foreign item translation';
    },
    'dangling source ID': (rows) => { rows.relationItems[0].sourceId = 2; },
    'missing active item': (rows) => { rows.relationItems = []; },
    'ambiguous source ID': (rows) => {
      rows.relationItems.push({ ...rows.relationItems[0], id: 2, recordKey: 'c'.repeat(64), sourceId: '1', internalName: 'ForeignItem' });
    },
    'ambiguous internal name': (rows) => {
      rows.relationItems.push({ ...rows.relationItems[0], id: 2, recordKey: 'c'.repeat(64), sourceId: 2 });
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    await t.test(name, () => {
      const input = fixture();
      input.sourceRows.relationItemImages = [];
      const parts = JSON.parse(input.beforeRows[0].relatedItemsJson);
      parts[0].image = null;
      input.beforeRows[0].relatedItemsJson = JSON.stringify(parts);
      mutate(input.sourceRows);
      assert.throws(() => operation.buildArmorSetProjectionIncrementalProposal(input), /source item identity|part item identity/i);
    });
  }
});

test('a translated item name can change when the active item identity remains stable', () => {
  const input = fixture();
  input.sourceRows.relationItems[0].nameZh = 'Updated wood helmet';
  const proposal = operation.buildArmorSetProjectionIncrementalProposal(input);
  assert.equal(proposal.changedRowCount, 1);
  const [part] = JSON.parse(proposal.rows[0].relatedItemsJson);
  assert.equal(part.nameZh, 'Updated wood helmet');
  assert.equal(part.internalName, 'WoodHelmet');
  assert.equal(part.sourceId, 1);
});

test('all authoritative role images are retained and removal requires a separate scope', () => {
  const input = fixture();
  const second = `${prefixes[0]}wood-2.png`;
  input.sourceRows.relationArmorSetImages.push({ ...input.sourceRows.relationArmorSetImages[0], id: 2, cachedUrl: second });
  input.beforeRows[0].maleImages = JSON.stringify([image, second]);
  assert.equal(operation.buildArmorSetProjectionIncrementalProposal(input).changedRowCount, 0);
  input.sourceRows.relationArmorSetImages.pop();
  assert.throws(() => operation.buildArmorSetProjectionIncrementalProposal(input), /image.*loss|media.*loss/i);
});

test('rejects missing sources, unrelated identities, source-key remapping and duplicate ids', () => {
  for (const mutate of [
    (input) => { delete input.sourceRows.relationArmorSetItems; },
    (input) => { input.sourceRows.relationArmorSets[0].recordKey = 'd'.repeat(64); },
    (input) => { input.sourceRows.relationArmorSets[0].rawJson = '{"entityType":"armor_set","pageTitle":"Other armor"}'; },
    (input) => { input.beforeRows.push({ ...input.beforeRows[0], textKey: 'Other', relationRecordKey: 'e'.repeat(64) }); },
    (input) => { input.sourceRows.relationArmorSets[0].rawJson = '{"entityType":"npc","pageTitle":"Wood armor"}'; },
    (input) => { input.sourceRows.relationArmorSets[0].rawJson = '{broken'; },
    (input) => { input.sourceRows.relationArmorSetItems.push({ ...input.sourceRows.relationArmorSetItems[0], id: 2 }); },
    (input) => { input.sourceRows.relationArmorSetItems[0].partIndex = 1; },
    (input) => { input.sourceRows.relationArmorSetItems[0].partRole = 'feet'; },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => operation.buildArmorSetProjectionIncrementalProposal(input), /source|identity|duplicate|armor|part/i);
  }
});

test('rejects colliding image ownership and duplicate current part identities', () => {
  const sourceMismatch = fixture();
  sourceMismatch.sourceRows.relationArmorSetImages[0].armorSetRecordKey = 'c'.repeat(64);
  assert.throws(() => operation.buildArmorSetProjectionIncrementalProposal(sourceMismatch), /source|identity|owner/i);
  const duplicatePart = fixture();
  const parts = JSON.parse(duplicatePart.beforeRows[0].relatedItemsJson);
  duplicatePart.beforeRows[0].relatedItemsJson = JSON.stringify([...parts, parts[0]]);
  assert.throws(() => operation.buildArmorSetProjectionIncrementalProposal(duplicatePart), /part.*duplicat|duplicat.*part/i);
});

test('rejects nonnumeric and duplicated projection identities even with alternate numeric representations', () => {
  for (const id of [true, '091']) {
    const input = fixture();
    input.beforeRows.push({ ...input.beforeRows[0], id, textKey: 'ArmorSetBonus.Other', relationRecordKey: 'c'.repeat(64), sourceKey: 'Other' });
    assert.throws(() => operation.buildArmorSetProjectionIncrementalProposal(input), /identity|duplicat/i);
  }
});

test('managed image validation rejects malformed arrays, traversal, foreign hosts and empty-prefix bypass', () => {
  for (const value of ['https://external.example/a.png', 'http://localhost:9000/terrapedia-images/items/../private/a.png', '/terrapedia-images/items/../private/a.png', 'http://localhost:9000/terrapedia-images/items/%2f..%2fprivate.png', '[broken', '["https://external.example/a.png"]']) {
    const input = fixture();
    input.sourceRows.relationArmorSetImages[0].cachedUrl = value;
    assert.throws(() => operation.buildArmorSetProjectionIncrementalProposal(input), /image|managed/i);
  }
  const input = fixture();
  input.managedImageUrlPrefixes = [''];
  assert.throws(() => operation.buildArmorSetProjectionIncrementalProposal(input), /prefix|managed/i);
});

test('new image cannot bypass management checks using encoded path separators', () => {
  const input = fixture();
  input.beforeRows[0].maleImages = null;
  input.sourceRows.relationArmorSetImages[0].cachedUrl = 'http://localhost:9000/terrapedia-images/items/%2f..%2fprivate.png';
  assert.throws(() => operation.buildArmorSetProjectionIncrementalProposal(input), /image.*path|unmanaged/i);
});

test('rejects two source items occupying the same part coordinate with different roles', () => {
  const input = fixture();
  input.sourceRows.relationArmorSetItems.push({ ...input.sourceRows.relationArmorSetItems[0], id: 2, partRole: 'body' });
  assert.throws(() => operation.buildArmorSetProjectionIncrementalProposal(input), /part.*identity|duplicat/i);
});

test('validator rejects tampered hashes, rows, identities, arbitrary tables and columns', () => {
  const proposal = operation.buildArmorSetProjectionIncrementalProposal(changedFixture());
  for (const mutate of [
    (value) => { value.before.rowsSha256 = `sha256:${'0'.repeat(64)}`; },
    (value) => { value.rows[0].id = 123; },
    (value) => { value.rows[0].nameZh = 'Forged'; },
    (value) => { value.rows[0].arbitrary = 'forged'; },
    (value) => { value.source.rows.relationArmorSets[0].rawJson = '{}'; },
    (value) => { value.target.table = 'terria_v1_local.items'; },
    (value) => { value.columns.push('id'); },
    (value) => { value.after.rows[0].entityType = 'npc'; },
  ]) {
    const forged = structuredClone(proposal);
    mutate(forged);
    assert.throws(() => operation.validateArmorSetProjectionIncrementalProposal(forged), /proposal|hash|identity|source|target|column|drift/i);
  }
});

function transactionFixture(input = changedFixture()) {
  const proposal = operation.buildArmorSetProjectionIncrementalProposal(input);
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    async execute(sql, values) {
      events.push('update');
      assert.match(sql, /^UPDATE `terria_v1_relation`\.`projection_armor_sets` SET /);
      assert.doesNotMatch(sql.split(' WHERE ')[0], /`id` =|`created_at` =|`relation_record_key` =|`source_key` =/);
      assert.match(sql, /`updated_at` = `updated_at`/);
      assert.ok(values.includes('Wood armor'));
      return [{ affectedRows: 1 }];
    },
  };
  const args = {
    connection, proposal,
    readServerUuid: async () => { events.push('server'); return serverUuid; },
    assertWriterFence: async () => { events.push('fence'); },
    readSourceRows: async (_connection, options) => { assert.equal(options.forUpdate, true); events.push('source-lock'); return input.sourceRows; },
    readCurrent: async (_connection, _proposal, options) => { assert.equal(options.forUpdate, true); events.push(options.after ? 'readback' : 'baseline-lock'); return options.after ? proposal.after.rows : input.beforeRows; },
    consumeDispatchPermit: async () => { events.push('permit'); },
  };
  return { args, events };
}

test('transaction locks and rederives current source, then consumes permit immediately before parameterized updates', async () => {
  const { args, events } = transactionFixture();
  const result = await operation.executeArmorSetProjectionIncrementalTransaction(args);
  assert.equal(result.transactionCommitted, true);
  assert.equal(result.affectedRows, 1);
  assert.deepEqual(events, ['begin', 'server', 'fence', 'source-lock', 'baseline-lock', 'permit', 'update', 'readback', 'commit']);
});

test('a changed CST source timestamp survives proposal serialization, SQL update and historical readback', async () => {
  const input = fixture();
  input.sourceRows.relationArmorSets[0].sourceRevisionTimestamp = new Date('2026-09-24T09:30:01+08:00');
  input.beforeRows[0].sourceRevisionTimestamp = '2026-09-24 01:30:00';
  const { args } = transactionFixture(input);
  args.proposal = JSON.parse(JSON.stringify(args.proposal));
  assert.equal(args.proposal.changedRowCount, 1);
  let storedTimestamp = '2026-09-24 01:30:00';
  delete args.readCurrent;
  args.connection.query = async sql => {
    assert.match(sql, /DATE_FORMAT\(`source_revision_timestamp`, '%Y-%m-%d %H:%i:%s'\)/);
    const { sourceRevisionTimestamp, ...row } = input.beforeRows[0];
    return [[{ ...row, source_revision_timestamp: storedTimestamp }]];
  };
  args.connection.execute = async (_sql, values) => {
    storedTimestamp = values[operation.ARMOR_SET_PROJECTION_INCREMENTAL_COLUMNS.indexOf('source_revision_timestamp')];
    assert.equal(storedTimestamp, '2026-09-24 01:30:01');
    return [{ affectedRows: 1 }];
  };
  const result = await operation.executeArmorSetProjectionIncrementalTransaction(args);
  assert.equal(result.transactionCommitted, true);
  assert.equal(result.affectedRows, 1);
  assert.equal(result.afterRowsSha256, args.proposal.after.rowsSha256);
});

test('transaction rejects baseline/source/server drift and writer fences before permit or DML', async () => {
  for (const dependency of ['readCurrent', 'readSourceRows', 'readServerUuid', 'assertWriterFence']) {
    const { args, events } = transactionFixture();
    if (dependency === 'readCurrent') args.readCurrent = async () => [];
    if (dependency === 'readSourceRows') args.readSourceRows = async () => {
      const drifted = fixture().sourceRows;
      drifted.relationArmorSets[0].benefitExpression = 'Changed after proposal';
      return drifted;
    };
    if (dependency === 'readServerUuid') args.readServerUuid = async () => 'different';
    if (dependency === 'assertWriterFence') args.assertWriterFence = async () => { throw new Error('foreign writer fence'); };
    await assert.rejects(operation.executeArmorSetProjectionIncrementalTransaction(args));
    assert.ok(!events.includes('permit'));
    assert.ok(!events.includes('update'));
  }
});

test('readback mismatch and row-count drift roll back without reporting completion', async () => {
  for (const scenario of ['readback', 'affectedRows', 'permit']) {
    const { args, events } = transactionFixture();
    if (scenario === 'readback') args.readCurrent = async (_connection, _proposal, options) => options.after ? [] : args.proposal.before.rows;
    if (scenario === 'affectedRows') args.connection.execute = async () => [{ affectedRows: 0 }];
    if (scenario === 'permit') args.consumeDispatchPermit = async () => { throw new Error('expired permit'); };
    await assert.rejects(operation.executeArmorSetProjectionIncrementalTransaction(args));
    assert.ok(events.includes('rollback'));
    assert.ok(!events.includes('commit'));
    if (scenario === 'permit') assert.ok(!events.includes('update'));
  }
});

test('no-op verifies current facts without consuming a write permit', async () => {
  const { args, events } = transactionFixture(fixture());
  const result = await operation.executeArmorSetProjectionIncrementalTransaction(args);
  assert.equal(result.affectedRows, 0);
  assert.ok(!events.includes('permit'));
  assert.ok(!events.includes('update'));
});

test('default SQL reads lock all declared source rows and projection rows before DML', async () => {
  const input = changedFixture();
  const { args, events } = transactionFixture(input);
  const sourceTables = args.proposal.source.tables;
  delete args.readSourceRows;
  delete args.readServerUuid;
  delete args.readCurrent;
  args.connection.query = async (sql) => {
    if (sql === 'SELECT @@server_uuid AS serverUuid') return [[{ serverUuid }]];
    for (const [key, table] of Object.entries(sourceTables)) {
      if (sql.includes(table.split('.').map((part) => `\`${part}\``).join('.'))) {
        assert.match(sql, /WHERE status=1 AND deleted=0 ORDER BY id FOR SHARE$/);
        events.push(key);
        return [input.sourceRows[key]];
      }
    }
    assert.match(sql, /FROM terria_v1_relation\.projection_armor_sets ORDER BY text_key FOR UPDATE$/);
    return [events.includes('update') ? args.proposal.after.rows : input.beforeRows];
  };
  await operation.executeArmorSetProjectionIncrementalTransaction(args);
  for (const key of Object.keys(sourceTables)) assert.ok(events.indexOf(key) < events.indexOf('permit'));
});

test('ambiguous commit failure requires reconciliation rather than a rollback success claim', async () => {
  const { args, events } = transactionFixture();
  args.connection.commit = async () => { throw new Error('connection lost during commit'); };
  await assert.rejects(operation.executeArmorSetProjectionIncrementalTransaction(args), (error) => error.requiresReadbackReconciliation === true);
  assert.ok(!events.includes('rollback'));
});
