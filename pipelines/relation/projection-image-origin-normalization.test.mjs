import assert from 'node:assert/strict';
import test from 'node:test';

const operation = await import('./projection-image-origin-normalization.mjs').catch(() => ({}));

test('authorization uses the formal database fingerprint and a no-overwrite retry namespace', () => {
  assert.deepEqual(operation.PROJECTION_IMAGE_ORIGIN_AUTHORIZATION_DATABASES, [
    'terria_v1_local',
    'terria_v1_maint',
    'terria_v1_relation',
  ]);
  assert.equal(typeof operation.projectionImageOriginArtifactPaths, 'function');
  const paths = operation.projectionImageOriginArtifactPaths('canonical-item-image-origin-normalization');
  assert.match(paths.input, /\.retry-01\.input\.json$/);
  assert.match(paths.manifest, /\.retry-01\.execution-manifest\.json$/);
  assert.match(paths.request, /\.retry-01\.request\.json$/);
  assert.match(paths.result, /\.retry-01\.result\.json$/);
});

test('normalizes only the trusted legacy origin inside the owned entity bucket', () => {
  assert.equal(typeof operation.normalizeLegacyImageToManagedPath, 'function');
  assert.equal(
    operation.normalizeLegacyImageToManagedPath(
      'http://localhost:9000/terrapedia-images/npcs/2026/08/guide.png',
      { bucketPath: '/terrapedia-images/npcs/' },
    ),
    '/terrapedia-images/npcs/2026/08/guide.png',
  );
  assert.equal(
    operation.normalizeLegacyImageToManagedPath(
      'http://127.0.0.1:9000/terrapedia-images/projectiles/arrow.png',
      { bucketPath: '/terrapedia-images/projectiles/' },
    ),
    '/terrapedia-images/projectiles/arrow.png',
  );
});

test('rejects arbitrary origins, wrong buckets, queries, and path traversal', () => {
  const normalize = operation.normalizeLegacyImageToManagedPath;
  assert.equal(typeof normalize, 'function');
  for (const value of [
    'https://evil.example/terrapedia-images/npcs/guide.png',
    'http://localhost:19000/terrapedia-images/npcs/guide.png',
    'http://localhost:9000/terrapedia-images/items/guide.png',
    'http://localhost:9000/terrapedia-images/npcs/guide.png?variant=1',
    'http://localhost:9000/terrapedia-images/npcs/../items/guide.png',
  ]) {
    assert.throws(
      () => normalize(value, { bucketPath: '/terrapedia-images/npcs/' }),
      /legacy image|origin|bucket|path/i,
      value,
    );
  }
});

test('builds an exact projection-only proposal and preserves origin-free controls', () => {
  assert.equal(typeof operation.buildProjectionImageOriginNormalizationProposal, 'function');
  const proposal = operation.buildProjectionImageOriginNormalizationProposal({
    operationId: 'canonical-npc-image-origin-normalization',
    domain: 'npcs',
    relationRows: [
      { identity: 'Guide', image: 'http://localhost:9000/terrapedia-images/npcs/guide.png' },
      { identity: 'Merchant', image: '/terrapedia-images/npcs/merchant.png' },
    ],
    projectionRows: [
      { identity: 'Guide', image: 'http://localhost:9000/terrapedia-images/npcs/guide.png' },
      { identity: 'Merchant', image: '/terrapedia-images/npcs/merchant.png' },
      { identity: 'None', image: null },
    ],
    quarantinedIdentities: ['None'],
    expected: { relation: 2, projection: 3, changed: 1, controls: 1, quarantine: 1 },
    serverUuid: '11111111-2222-3333-8444-555555555555',
    generatedAt: '2026-08-24T01:00:00.000Z',
  });

  assert.equal(proposal.applyAllowed, false);
  assert.equal(proposal.databaseWrites, false);
  assert.deepEqual(proposal.target, {
    database: 'terria_v1_relation',
    table: 'terria_v1_relation.projection_npcs',
    keyColumn: 'internal_name',
    valueColumn: 'image_url',
    writeTargets: ['relation.projection_npcs.image_url'],
    mutationMode: 'update-existing-projection-only',
  });
  assert.deepEqual(proposal.rows, [{
    identity: 'Guide',
    before: 'http://localhost:9000/terrapedia-images/npcs/guide.png',
    after: '/terrapedia-images/npcs/guide.png',
  }]);
  assert.deepEqual(proposal.controls, [{
    identity: 'Merchant',
    value: '/terrapedia-images/npcs/merchant.png',
  }]);
  assert.deepEqual(proposal.quarantine, ['None']);
  assert.match(proposal.scopeSha256, /^sha256:[a-f0-9]{64}$/);
});

test('proposal rejects relation/projection mismatch and count drift', () => {
  const build = operation.buildProjectionImageOriginNormalizationProposal;
  assert.equal(typeof build, 'function');
  const base = {
    operationId: 'canonical-projectile-image-origin-normalization',
    domain: 'projectiles',
    relationRows: [{ identity: 'Arrow', image: 'http://localhost:9000/terrapedia-images/projectiles/arrow.png' }],
    projectionRows: [{ identity: 'Arrow', image: 'http://localhost:9000/terrapedia-images/projectiles/drift.png' }],
    quarantinedIdentities: [],
    expected: { relation: 1, projection: 1, changed: 1, controls: 0, quarantine: 0 },
    serverUuid: '11111111-2222-3333-8444-555555555555',
    generatedAt: '2026-08-24T01:00:00.000Z',
  };
  assert.throws(() => build(base), /before.*mismatch|relation.*projection/i);
  assert.throws(
    () => build({
      ...base,
      projectionRows: base.relationRows,
      expected: { ...base.expected, changed: 2 },
    }),
    /count.*drift/i,
  );
});

test('transaction locks the exact before set before permit consumption and update', async () => {
  assert.equal(typeof operation.executeProjectionImageOriginNormalizationTransaction, 'function');
  const events = [];
  const proposal = operation.buildProjectionImageOriginNormalizationProposal({
    operationId: 'canonical-biome-image-origin-normalization',
    domain: 'biomes',
    relationRows: [{ identity: 'forest', image: 'http://localhost:9000/terrapedia-images/items/forest.png' }],
    projectionRows: [{ identity: 'forest', image: 'http://localhost:9000/terrapedia-images/items/forest.png' }],
    expected: { relation: 1, projection: 1, changed: 1, controls: 0, quarantine: 0 },
    serverUuid: '11111111-2222-3333-8444-555555555555',
    generatedAt: '2026-08-24T01:00:00.000Z',
  });
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  const result = await operation.executeProjectionImageOriginNormalizationTransaction({
    connection,
    proposal,
    readCurrent: async (_connection, _proposal, options) => {
      events.push(options.forUpdate ? 'lock' : 'read');
      return options.after
        ? [{ identity: 'forest', image: '/terrapedia-images/items/forest.png' }]
        : [{ identity: 'forest', image: 'http://localhost:9000/terrapedia-images/items/forest.png' }];
    },
    readRelationCurrent: async () => {
      events.push('source-lock');
      return [{ identity: 'forest', image: 'http://localhost:9000/terrapedia-images/items/forest.png' }];
    },
    consumeDispatchPermit: async () => events.push('permit'),
    updateRows: async () => { events.push('update'); return 1; },
  });
  assert.equal(result.affectedRows, 1);
  assert.deepEqual(events, ['begin', 'source-lock', 'lock', 'permit', 'update', 'lock', 'commit']);
});

test('builds an exact Item relation and projection origin-normalization proposal', () => {
  const proposal = operation.buildProjectionImageOriginNormalizationProposal({
    operationId: 'canonical-item-image-origin-normalization',
    domain: 'items',
    relationRows: [
      { identity: 'Torch', image: 'http://localhost:9000/terrapedia-images/items/torch.png' },
      { identity: 'Wood', image: '/terrapedia-images/items/wood.png' },
    ],
    projectionRows: [
      { identity: 'Torch', image: 'http://localhost:9000/terrapedia-images/items/torch.png' },
      { identity: 'Wood', image: '/terrapedia-images/items/wood.png' },
      { identity: 'OgreMask', image: null },
    ],
    quarantinedIdentities: ['OgreMask'],
    expected: { relation: 2, projection: 3, changed: 1, controls: 1, quarantine: 1 },
    serverUuid: '11111111-2222-3333-8444-555555555555',
    generatedAt: '2026-08-24T01:00:00.000Z',
  });

  assert.deepEqual(proposal.target, {
    database: 'terria_v1_relation',
    table: 'terria_v1_relation.projection_items',
    keyColumn: 'internal_name',
    valueColumn: 'image',
    writeTargets: [
      'relation.relation_item_images.cached_url',
      'relation.projection_items.image',
    ],
    mutationMode: 'update-existing-relation-and-projection',
  });
  assert.equal(proposal.source.relationRowsReadOnly, false);
  assert.equal(proposal.changedRowCount, 1);
  assert.equal(proposal.changedPhysicalRowCount, 2);
  assert.match(proposal.after.relationRowsSha256, /^sha256:[a-f0-9]{64}$/);
});

test('Item origin normalization locks and reads back both relation and projection targets', async () => {
  const events = [];
  const proposal = operation.buildProjectionImageOriginNormalizationProposal({
    operationId: 'canonical-item-image-origin-normalization',
    domain: 'items',
    relationRows: [{ identity: 'Torch', image: 'http://localhost:9000/terrapedia-images/items/torch.png' }],
    projectionRows: [{ identity: 'Torch', image: 'http://localhost:9000/terrapedia-images/items/torch.png' }],
    quarantinedIdentities: [],
    expected: { relation: 1, projection: 1, changed: 1, controls: 0, quarantine: 0 },
    serverUuid: '11111111-2222-3333-8444-555555555555',
    generatedAt: '2026-08-24T01:00:00.000Z',
  });
  let relationReadCount = 0;
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
  };
  const result = await operation.executeProjectionImageOriginNormalizationTransaction({
    connection,
    proposal,
    readRelationCurrent: async () => {
      relationReadCount += 1;
      events.push(relationReadCount === 1 ? 'relation-before-lock' : 'relation-after-lock');
      return [{
        identity: 'Torch',
        image: relationReadCount === 1
          ? 'http://localhost:9000/terrapedia-images/items/torch.png'
          : '/terrapedia-images/items/torch.png',
      }];
    },
    readCurrent: async (_connection, _proposal, options) => {
      events.push(options.after ? 'projection-after-lock' : 'projection-before-lock');
      return [{
        identity: 'Torch',
        image: options.after
          ? '/terrapedia-images/items/torch.png'
          : 'http://localhost:9000/terrapedia-images/items/torch.png',
      }];
    },
    consumeDispatchPermit: async () => events.push('permit'),
    updateRows: async () => { events.push('update-both'); return 2; },
  });

  assert.equal(result.affectedRows, 2);
  assert.deepEqual(events, [
    'begin',
    'relation-before-lock',
    'projection-before-lock',
    'permit',
    'update-both',
    'relation-after-lock',
    'projection-after-lock',
    'commit',
  ]);
});
