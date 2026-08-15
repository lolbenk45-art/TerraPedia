import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeItemImageProjectionMissingRowInsertTransaction,
} from './item-image-projection-missing-row-insert-db.mjs';

test('missing-row insert locks the exact five absent keys, inserts only five rows, and verifies before commit', async () => {
  const connection = recordingConnection();
  const proposal = proposalFixture();
  const result = await executeItemImageProjectionMissingRowInsertTransaction({
    connection,
    proposal,
    consumeDispatchPermit: async () => connection.events.push('consume-permit'),
  });

  assert.deepEqual(connection.events, [
    'begin',
    'lock-projection',
    'consume-permit',
    'insert-five',
    'read-inserted',
    'commit',
  ]);
  assert.equal(result.insertedRowCount, 5);
  const dml = connection.sql.filter((sql) => /^(?:INSERT|UPDATE|DELETE|REPLACE)/i.test(sql.trim()));
  assert.equal(dml.length, 1);
  assert.match(dml[0], /^INSERT INTO `terria_v1_relation`\.`projection_items`/i);
  assert.doesNotMatch(dml[0], /\bUPDATE\b|\bDELETE\b|\bREPLACE\b|ON DUPLICATE|INSERT\s+IGNORE/i);
  assert.equal((dml[0].match(/\?\s*(?:,|\))/g) ?? []).length > 5, true);
});

test('missing-row insert rolls back before permit when any target row exists', async () => {
  const connection = recordingConnection({ existing: true });

  await assert.rejects(
    executeItemImageProjectionMissingRowInsertTransaction({
      connection,
      proposal: proposalFixture(),
      consumeDispatchPermit: async () => connection.events.push('consume-permit'),
    }),
    /already exists|projection/i,
  );

  assert.equal(connection.events.includes('consume-permit'), false);
  assert.equal(connection.events.includes('insert-five'), false);
  assert.equal(connection.events.at(-1), 'rollback');
});

function proposalFixture() {
  const keys = [
    'AntlionEggs',
    'BoneWhip',
    'RoninShirt',
    'TVHeadPants',
    'TimelessTravelerHood',
  ];
  return {
    keys,
    target: { databases: { relation: 'terria_v1_relation' } },
    projectionRows: keys.map((internalName, index) => ({
      id: index + 100,
      relationRecordKey: `item-${internalName}`,
      name: internalName,
      nameZh: null,
      internalName,
      slug: internalName.toLowerCase(),
      image: `/terrapedia-images/items/${internalName}.png`,
      categoryId: null,
      description: null,
      descriptionZh: null,
      damage: 0,
      defense: 0,
      knockback: 0,
      useTime: 0,
      width: 20,
      height: 20,
      buy: 0,
      sell: 0,
      tooltip: null,
      tooltipZh: null,
      sourceProvider: 'wiki_gg',
      sourcePage: internalName,
      sourceRevisionTimestamp: null,
      lastSyncedAt: null,
      rarityId: 0,
      gamePeriodId: null,
      gameModelId: null,
      isStackable: 0,
      stackSize: 1,
      sourceNpcsJson: '[]',
      status: 1,
      deleted: 0,
      createdAt: null,
      updatedAt: null,
    })),
    insertedRowCount: 5,
  };
}

function recordingConnection({ existing = false } = {}) {
  const keys = proposalFixture().keys;
  return {
    events: [],
    sql: [],
    async beginTransaction() { this.events.push('begin'); },
    async commit() { this.events.push('commit'); },
    async rollback() { this.events.push('rollback'); },
    async query(sql) {
      this.sql.push(sql);
      if (/projection_items/i.test(sql) && /FOR UPDATE/i.test(sql)) {
        this.events.push('lock-projection');
        return [existing ? [{ internal_name: 'BoneWhip' }] : [], []];
      }
      if (/projection_items/i.test(sql)) {
        this.events.push('read-inserted');
        return [keys.map((internal_name) => ({ internal_name })), []];
      }
      throw new Error(`unexpected query: ${sql}`);
    },
    async execute(sql) {
      this.sql.push(sql);
      this.events.push('insert-five');
      return [{ affectedRows: 5 }, []];
    },
  };
}
