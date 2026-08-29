import assert from 'node:assert/strict';
import test from 'node:test';

const operation = await import('./armor-set-projection-restoration.mjs').catch(() => ({}));

test('Armor authorization uses the formal database fingerprint and a no-overwrite retry namespace', () => {
  assert.deepEqual(operation.ARMOR_SET_PROJECTION_RESTORATION_AUTHORIZATION_DATABASES, [
    'terria_v1_local',
    'terria_v1_maint',
    'terria_v1_relation',
  ]);
  assert.match(operation.ARMOR_SET_PROJECTION_RESTORATION_INPUT_PATH, /\.retry-05\.input\.json$/);
  assert.match(operation.ARMOR_SET_PROJECTION_RESTORATION_MANIFEST_PATH, /\.retry-05\.execution-manifest\.json$/);
  assert.match(operation.ARMOR_SET_PROJECTION_RESTORATION_REQUEST_PATH, /\.retry-05\.request\.json$/);
  assert.match(operation.ARMOR_SET_PROJECTION_RESTORATION_RESULT_PATH, /\.retry-05\.result\.json$/);
});

const rows = [
  {
    id: 1,
    relationRecordKey: 'a'.repeat(64),
    textKey: 'ArmorSetBonus.Wood',
    entityType: 'armor_set',
    compositionKind: 'traditional_set',
    name: 'Wood armor',
    nameZh: 'Wood armor',
    nameEn: 'Wood armor',
    sourceKey: 'Wood armor',
    benefitExpression: null,
    benefitZh: null,
    benefitEn: null,
    primaryPart: null,
    setCount: 1,
    uniqueItemCount: 3,
    setsJson: '[[1,2,3]]',
    uniqueItemIdsJson: '[1,2,3]',
    currentItemIdsJson: '[1,2,3]',
    relatedItemsJson: '[{"id":1,"image":"/terrapedia-images/items/wood.png"}]',
    maleImages: null,
    femaleImages: null,
    specialImages: null,
    mappingStatus: 'mapped',
    sourceProvider: 'terraria.wiki.gg',
    sourcePage: 'Module:Armorsetbonuses',
    sourceRevisionTimestamp: '2026-01-01T00:00:00.000Z',
    status: 1,
    deleted: 0,
    createdAt: null,
    updatedAt: null,
  },
];

test('builds an insert-only proposal from the current relation-backed Armor projection', () => {
  assert.equal(typeof operation.buildArmorSetProjectionRestorationProposal, 'function');
  const proposal = operation.buildArmorSetProjectionRestorationProposal({
    beforeRows: [],
    derivedRows: rows,
    sourceCounts: {
      relationArmorSets: 1,
      relationArmorSetItems: 3,
      relationArmorSetImages: 2,
      relationArmorAttributeRows: 4,
      relationEquipmentEffectAttributes: 5,
    },
    expectedCount: 1,
    serverUuid: '11111111-2222-3333-8444-555555555555',
    generatedAt: '2026-08-24T01:00:00.000Z',
  });
  assert.equal(proposal.changedRowCount, 1);
  assert.deepEqual(proposal.target, {
    database: 'terria_v1_relation',
    table: 'terria_v1_relation.projection_armor_sets',
    writeTargets: ['relation.projection_armor_sets.insert'],
    mutationMode: 'insert-only-empty-table',
  });
  assert.deepEqual(proposal.rows, rows);
  assert.match(proposal.scopeSha256, /^sha256:[a-f0-9]{64}$/);
});

test('converts proposal timestamps to MySQL DATETIME parameters without changing readback identity', () => {
  assert.equal(operation.toMysqlDateTime('2026-01-31T20:21:00.000Z'), '2026-01-31 20:21:00');
  assert.equal(operation.toMysqlDateTime(null), null);
});

test('normalizes MySQL DATETIME readback as UTC', () => {
  assert.equal(operation.normalizeArmorRows([{
    source_revision_timestamp: '2026-01-31 20:21:00',
  }])[0].sourceRevisionTimestamp, '2026-01-31T20:21:00.000Z');
});

test('rejects a non-empty projection, count drift, duplicate keys, and obsolete backup authority', () => {
  const build = operation.buildArmorSetProjectionRestorationProposal;
  assert.equal(typeof build, 'function');
  const base = {
    beforeRows: [],
    derivedRows: rows,
    sourceCounts: {
      relationArmorSets: 1,
      relationArmorSetItems: 3,
      relationArmorSetImages: 2,
      relationArmorAttributeRows: 4,
      relationEquipmentEffectAttributes: 5,
    },
    expectedCount: 1,
    serverUuid: '11111111-2222-3333-8444-555555555555',
    generatedAt: '2026-08-24T01:00:00.000Z',
  };
  assert.throws(() => build({ ...base, beforeRows: rows }), /empty|before/i);
  assert.throws(() => build({ ...base, expectedCount: 2 }), /count.*drift/i);
  assert.throws(() => build({ ...base, derivedRows: [...rows, rows[0]], expectedCount: 2 }), /duplicate/i);
  assert.throws(() => build({ ...base, authorityKind: 'historical_88_row_backup' }), /authority|backup/i);
});

test('transaction consumes the permit only after locking an empty target and inserts no other table', async () => {
  assert.equal(typeof operation.executeArmorSetProjectionRestorationTransaction, 'function');
  const proposal = operation.buildArmorSetProjectionRestorationProposal({
    beforeRows: [],
    derivedRows: rows,
    sourceCounts: {
      relationArmorSets: 1,
      relationArmorSetItems: 3,
      relationArmorSetImages: 2,
      relationArmorAttributeRows: 4,
      relationEquipmentEffectAttributes: 5,
    },
    expectedCount: 1,
    serverUuid: '11111111-2222-3333-8444-555555555555',
    generatedAt: '2026-08-24T01:00:00.000Z',
  });
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  const result = await operation.executeArmorSetProjectionRestorationTransaction({
    connection,
    proposal,
    readCurrent: async (_connection, _proposal, options) => {
      events.push(options.forUpdate ? 'lock' : 'read');
      return options.after ? rows : [];
    },
    readSourceSnapshotHash: async () => {
      events.push('source-lock');
      return proposal.source.sourceSnapshotSha256;
    },
    consumeDispatchPermit: async () => events.push('permit'),
    insertRows: async () => { events.push('insert'); return 1; },
  });
  assert.equal(result.affectedRows, 1);
  assert.deepEqual(events, ['begin', 'source-lock', 'lock', 'permit', 'insert', 'lock', 'commit']);
});
