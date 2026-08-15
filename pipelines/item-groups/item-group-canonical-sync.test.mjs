import assert from 'node:assert/strict';
import test from 'node:test';

const sync = await import('./item-group-canonical-sync.mjs').catch(() => ({}));

function group(overrides = {}) {
  return {
    canonicalKey: 'any-wood',
    canonicalName: 'Any Wood',
    displayNameEn: 'Any Wood',
    displayNameZh: 'any wood',
    sourceLayer: 'recipe_reference',
    sourcePriority: 100,
    sourceKind: 'generated_recipe_reference',
    status: 'ACTIVE',
    aliases: [],
    members: [
      { internalName: 'Wood', name: 'Wood', nameZh: 'wood' },
      { internalName: 'BorealWood', name: 'Boreal Wood', nameZh: 'boreal wood' },
    ],
    ...overrides,
  };
}

function landingEntry(overrides = {}) {
  const groups = overrides.groups ?? [group()];
  return {
    id: 17,
    datasetType: 'item_groups_raw',
    sourceKey: 'wiki.recipe_material_groups',
    sourcePage: 'recipe-material-reference',
    provider: 'terraria.wiki.gg',
    contentHash: 'a'.repeat(64),
    payload: { groups },
    ...overrides,
  };
}

function item(id, internalName) {
  return { id, sourceId: id, internalName, name: internalName };
}

test('selectWinner keeps consumer allowlists exact and chooses highest allowed priority', () => {
  assert.equal(typeof sync.selectWinner, 'function');
  const rows = [
    group(),
    group({ sourceLayer: 'central_override', sourcePriority: 400 }),
  ];

  assert.equal(sync.selectWinner(rows, ['recipe_reference']).sourceLayer, 'recipe_reference');
  assert.equal(
    sync.selectWinner(rows, ['recipe_reference', 'central_override']).sourceLayer,
    'central_override',
  );
  assert.equal(sync.selectWinner(rows, ['source_group']), null);
});

test('maint projection preserves immutable record keys while rotating changed source content', () => {
  const first = sync.buildItemGroupMaintProjection({ landingRows: [landingEntry()] });
  const changedLanding = landingEntry({
    id: 18,
    contentHash: 'b'.repeat(64),
    groups: [group({ displayNameZh: 'updated any wood' })],
  });
  const second = sync.buildItemGroupMaintProjection({
    landingRows: [changedLanding],
    currentRows: first.groups,
  });

  assert.equal(first.groups.length, 1);
  assert.equal(first.groups[0].recordKey, second.groups[0].recordKey);
  assert.equal(second.groups[0].landingContentHash, 'b'.repeat(64));
  assert.deepEqual(second.rotation.updatedRecordKeys, [first.groups[0].recordKey]);
  assert.deepEqual(second.rotation.retiredRecordKeys, []);

  const removed = sync.buildItemGroupMaintProjection({
    landingRows: [landingEntry({ id: 19, contentHash: 'c'.repeat(64), groups: [] })],
    currentRows: first.groups,
  });
  assert.deepEqual(removed.rotation.retiredRecordKeys, [first.groups[0].recordKey]);
});

test('maint projection persists implicit identities while keeping alias kinds explicit', () => {
  const projection = sync.buildItemGroupMaintProjection({
    landingRows: [landingEntry({ groups: [group({
      displayNameZh: '任意木材',
      aliases: ['Wood Group'],
    })] })],
  });

  assert.deepEqual(
    projection.aliases
      .map((row) => [row.aliasText, row.aliasKind])
      .sort((left, right) => left[0].localeCompare(right[0])),
    [
      ['Any Wood', 'canonical_name'],
      ['Wood Group', 'explicit'],
      ['任意木材', 'display_name_zh'],
    ],
  );
});

test('maint projection treats recipe override groups as reconciliation evidence only', () => {
  const projection = sync.buildItemGroupMaintProjection({
    landingRows: [landingEntry({
      sourceKey: 'admin.recipe_group_overrides',
      payload: {
        groups: [{
          canonicalName: 'Any Wood',
          members: [{ internalName: 'Wood', name: 'Wood', nameZh: 'wood' }],
        }],
        exclusions: [{
          canonicalKey: 'any-wood',
          memberKey: 'BorealWood',
          reason: 'frozen omission',
          actor: 'bootstrap.recipe_group_overrides',
          evidenceReference: 'evidence://recipe-overrides',
        }],
      },
    })],
  });

  assert.equal(projection.groups.length, 0);
  assert.equal(projection.members.length, 0);
  assert.equal(projection.exclusions.length, 1);
});

test('relation projection applies exclusions and produces stable counts and hashes', () => {
  const maint = sync.buildItemGroupMaintProjection({
    landingRows: [landingEntry({
      payload: {
        groups: [group()],
        exclusions: [{
          canonicalKey: 'any-wood',
          canonicalName: 'Any Wood',
          memberKey: 'BorealWood',
          reason: 'reviewed exclusion',
          actor: 'reviewer',
          evidenceReference: 'evidence://override',
        }],
      },
    })],
  });
  const relation = sync.buildItemGroupRelationProjection({
    maintProjection: maint,
    items: [item(9, 'Wood'), item(27, 'BorealWood')],
  });
  const reordered = sync.buildItemGroupRelationProjection({
    maintProjection: maint,
    items: [item(27, 'BorealWood'), item(9, 'Wood')],
  });

  assert.equal(relation.groups[0].resolvedMemberCount, 1);
  assert.equal(relation.groups[0].rejectedMemberCount, 1);
  assert.equal(relation.members.filter((row) => row.resolutionState === 'RESOLVED').length, 1);
  assert.equal(relation.members.filter((row) => row.resolutionState === 'REJECTED').length, 1);
  assert.match(relation.snapshotHash, /^[a-f0-9]{64}$/);
  assert.equal(relation.snapshotHash, reordered.snapshotHash);
  assert.deepEqual(
    relation.members.map((row) => row.recordKey),
    reordered.members.map((row) => row.recordKey),
  );
});

test('relation projection blocks protected recipe identities, alias collisions, and zero resolved members', () => {
  const protectedMaint = sync.buildItemGroupMaintProjection({
    landingRows: [
      landingEntry({ groups: [group()] }),
      landingEntry({
        id: 21,
        sourceKey: 'admin.item_group_overrides',
        groups: [group({ sourceLayer: 'central_override', sourcePriority: 400 })],
      }),
    ],
  });
  assert.throws(
    () => sync.buildItemGroupRelationProjection({
      maintProjection: protectedMaint,
      items: [item(9, 'Wood'), item(27, 'BorealWood')],
    }),
    /protected recipe identity.*any-wood/i,
  );

  const aliasMaint = sync.buildItemGroupMaintProjection({
    landingRows: [landingEntry({ groups: [
      group(),
      group({
        canonicalKey: 'any-plank',
        canonicalName: 'Any Plank',
        sourceLayer: 'source_group',
        sourcePriority: 300,
        aliases: ['Any Wood'],
      }),
    ] })],
  });
  assert.throws(
    () => sync.buildItemGroupRelationProjection({
      maintProjection: aliasMaint,
      items: [item(9, 'Wood'), item(27, 'BorealWood')],
    }),
    /alias collision.*any wood/i,
  );

  const unresolvedMaint = sync.buildItemGroupMaintProjection({
    landingRows: [landingEntry({ groups: [group({
      canonicalKey: 'missing-group',
      canonicalName: 'Missing Group',
      members: [{ internalName: 'MissingItem', name: 'Missing Item', nameZh: 'missing' }],
    })] })],
  });
  assert.throws(
    () => sync.buildItemGroupRelationProjection({ maintProjection: unresolvedMaint, items: [] }),
    /zero resolved members.*Missing Group/i,
  );
});

test('runtime projection and PUBLISHED state commit through one injected local transaction', async () => {
  const events = [];
  const transaction = {
    async replaceRuntimeProjection(projection) {
      events.push(['runtime', projection.groups.length, this]);
    },
    async publishProjectionState(state) {
      events.push(['state', state.publicationStatus, this]);
    },
  };
  const adapter = {
    async replaceMaintProjection(projection) {
      events.push(['maint', projection.groups.length]);
    },
    async replaceRelationProjection(projection) {
      events.push(['relation', projection.groups.length]);
    },
    async withLocalTransaction(callback) {
      events.push(['begin']);
      const result = await callback(transaction);
      events.push(['commit']);
      return result;
    },
  };

  const result = await sync.runItemGroupCanonicalSync({
    landingRows: [landingEntry()],
    items: [item(9, 'Wood'), item(27, 'BorealWood')],
    canonicalVersion: 3,
    relationRunKey: 'r'.repeat(64),
    adapter,
  });

  assert.deepEqual(events.map((event) => event.slice(0, 2)), [
    ['maint', 1],
    ['relation', 1],
    ['begin'],
    ['runtime', 1],
    ['state', 'PUBLISHED'],
    ['commit'],
  ]);
  assert.equal(events[3][2], transaction);
  assert.equal(events[4][2], transaction);
  assert.equal(result.state.groupCount, 1);
  assert.equal(result.state.memberCount, 2);
  assert.equal(result.state.publicationStatus, 'PUBLISHED');
  assert.equal(result.state.canonicalVersion, 3);
});

test('runtime snapshot hash covers only the persisted local projection contract', () => {
  const maint = sync.buildItemGroupMaintProjection({ landingRows: [landingEntry()] });
  const relation = sync.buildItemGroupRelationProjection({
    maintProjection: maint,
    items: [item(9, 'Wood'), item(27, 'BorealWood')],
  });
  const runtime = sync.buildItemGroupRuntimeProjection(relation);
  const payload = sync.buildItemGroupRuntimeSnapshotPayload(runtime);

  assert.equal(payload.schemaVersion, 1);
  assert.deepEqual(Object.keys(payload.groups[0]), [
    'recordKey',
    'canonicalKey',
    'canonicalName',
    'name',
    'nameZh',
    'normalizedDomainsJson',
    'sourceLayer',
    'sourcePriority',
    'relationRecordKey',
    'sourceContentHash',
    'canonicalVersion',
    'status',
    'deleted',
  ]);
  assert.equal(payload.groups[0].landingSourceKey, undefined);
  assert.equal(runtime.snapshotHash, sync.hashItemGroupRuntimeSnapshot(payload));
});

test('new canonical sync tests contain no formal database names', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => (
    readFile(new URL('./item-group-canonical-sync.test.mjs', import.meta.url), 'utf8')
  ));
  assert.doesNotMatch(source, /terria_v1_(?:local|maint|relation)/);
});
