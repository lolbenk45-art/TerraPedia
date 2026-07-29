import assert from 'node:assert/strict';
import test from 'node:test';

const verification = await import('./item-group-cutover-verification.mjs').catch(() => ({}));

const HASH = '8d3fb0b1f8d995b8c356e1de032f12cf359bf31f438287e6f5f47907f89fe819';

function fixture() {
  const group = {
    canonicalKey: 'any-iron-bar',
    canonicalName: 'Any Iron Bar',
    displayNameEn: 'Any Iron Bar',
    displayNameZh: '任意铁锭',
    aliases: ['任意铁锭'],
    domains: ['recipe'],
    sourceLayer: 'recipe_reference',
    sourceMetadata: { sourceFile: 'recipe-material-reference.json' },
    status: 'ACTIVE',
    blockReason: null,
    members: [{ itemId: 22, internalName: 'IronBar', name: 'Iron Bar', nameZh: '铁锭' }],
  };
  const itemGroupApi = {
    canonicalName: group.canonicalName,
    displayNameEn: group.displayNameEn,
    displayNameZh: group.displayNameZh,
    aliases: group.aliases,
    domains: group.domains,
    members: [{
      ...group.members[0],
      resolved: true,
      resolutionStatus: 'resolved',
      resolutionReason: null,
    }],
    sourceKind: 'canonical:recipe_reference',
    sourceProvider: 'canonical_database',
    sourceLabel: 'source-content-hash',
    sourceFile: 'canonical:item_groups',
    manualOnly: false,
  };
  const recipeGroupApi = {
    canonicalName: group.canonicalName,
    displayNameEn: group.displayNameEn,
    displayNameZh: group.displayNameZh,
    members: group.members,
  };
  return {
    expected: {
      runtimeSnapshotHash: HASH,
      consumers: {
        adminItemGroups: { groups: [group], exclusions: [] },
        adminRecipeGroups: { groups: [group], exclusions: [] },
        recipeTree: { groups: [group], exclusions: [] },
      },
      api: { adminItemGroups: [itemGroupApi], adminRecipeGroups: [recipeGroupApi] },
    },
    actual: {
      publicationState: { status: 'PUBLISHED', snapshotHash: HASH },
      runtimeSnapshotHash: HASH,
      consumers: {
        adminItemGroups: { groups: [group], exclusions: [] },
        adminRecipeGroups: { groups: [group], exclusions: [] },
        recipeTree: { groups: [group], exclusions: [] },
      },
      consumerContract: { directJsonReaders: 0, fallbackEnabled: false },
      api: {
        adminItemGroups: [itemGroupApi],
        adminRecipeGroups: [recipeGroupApi],
        recipeTree: {
          root: {
            groupCanonicalName: group.canonicalName,
            groupMembers: group.members,
          },
        },
      },
    },
  };
}

test('cutover verification passes exact DB, shadow, no-fallback, and API evidence', () => {
  assert.equal(typeof verification.verifyItemGroupCutoverEvidence, 'function');
  const result = verification.verifyItemGroupCutoverEvidence(fixture());

  assert.equal(result.status, 'passed');
  assert.equal(result.runtimeSnapshotHash, HASH);
  assert.deepEqual(Object.values(result.shadows).map((row) => row.status), ['PASS', 'PASS', 'PASS']);
  assert.deepEqual(result.consumerContract, { directJsonReaders: 0, fallbackEnabled: false });
  assert.equal(result.api.recipeTree.sampleGroup, 'Any Iron Bar');
});

test('cutover verification fails closed on every unsafe evidence class', () => {
  const mutations = [
    ['unpublished projection', (value) => { value.actual.publicationState.status = 'STAGED'; }],
    ['runtime hash drift', (value) => { value.actual.runtimeSnapshotHash = 'b'.repeat(64); }],
    ['shadow mismatch', (value) => { value.actual.consumers.recipeTree.groups[0].members = []; }],
    ['direct JSON reader', (value) => { value.actual.consumerContract.directJsonReaders = 1; }],
    ['fallback enabled', (value) => { value.actual.consumerContract.fallbackEnabled = true; }],
    ['admin API mismatch', (value) => { value.actual.api.adminItemGroups = []; }],
    ['recipe tree lacks a canonical group', (value) => { value.actual.api.recipeTree = { root: {} }; }],
  ];

  for (const [name, mutate] of mutations) {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => verification.verifyItemGroupCutoverEvidence(value),
      /cutover verification blocked/i,
      name,
    );
  }
});

test('production consumer inventory permits compatibility readers but no runtime JSON reader', () => {
  assert.equal(typeof verification.evaluateItemGroupConsumerInventory, 'function');
  const inventory = verification.EXPECTED_ITEM_GROUP_CONSUMER_PATHS.map((path) => ({
    path,
    role: path.startsWith('scripts/data/generate/') ? 'compat_export'
      : path.includes('/item-group-bootstrap.mjs') || path.includes('/item-group-live-acceptance.mjs')
        || path.includes('/source-dataset-locator.mjs') ? 'bootstrap' : 'governance',
  }));
  assert.deepEqual(verification.evaluateItemGroupConsumerInventory(inventory), { directJsonReaders: 0, fallbackEnabled: false });

  assert.throws(
    () => verification.evaluateItemGroupConsumerInventory([
      ...inventory.slice(0, -1),
      { path: 'scripts/data/landing/source-dataset-locator.mjs', role: 'runtime_reader' },
    ]),
    /inventory|runtime JSON reader/i,
  );
});

test('runtime table rows produce the exact consumer and API cutover shapes', () => {
  assert.equal(typeof verification.buildItemGroupCutoverExpectedEvidence, 'function');
  assert.equal(typeof verification.buildItemGroupCutoverActualEvidence, 'function');
  const runtime = {
    groups: [{
      recordKey: 'group-record',
      canonicalKey: 'any-iron-bar',
      canonicalName: 'Any Iron Bar',
      displayName: 'Any Iron Bar',
      displayNameZh: '任意铁锭',
      normalizedDomainsJson: '["recipe"]',
      sourceLayer: 'recipe_reference',
      sourcePriority: 100,
      relationRecordKey: 'relation-record',
      sourceContentHash: 'source-content-hash',
      sourceMetadataJson: '{"sourceFile":"recipe-material-reference.json"}',
      canonicalVersion: 1,
      status: 'ACTIVE',
      blockReason: null,
      deleted: 0,
    }],
    members: [{
      recordKey: 'member-record',
      groupRecordKey: 'group-record',
      itemId: 22,
      sourceItemId: 22,
      memberKey: 'IronBar',
      internalName: 'IronBar',
      name: 'Iron Bar',
      nameZh: '铁锭',
      sortOrder: 0,
      resolutionState: 'RESOLVED',
    }],
    aliases: [{
      recordKey: 'alias-record',
      groupRecordKey: 'group-record',
      aliasText: '任意铁锭',
      normalizedAlias: '任意铁锭',
      aliasKind: 'explicit',
      aliasLanguage: 'zh',
      sortOrder: 0,
    }],
  };
  const expected = verification.buildItemGroupCutoverExpectedEvidence({ runtime });
  const actual = verification.buildItemGroupCutoverActualEvidence({
    runtime,
    publicationState: { status: 'PUBLISHED', snapshotHash: expected.runtimeSnapshotHash },
    consumerContract: { directJsonReaders: 0, fallbackEnabled: false },
    api: {
      ...expected.api,
      recipeTree: {
        groupCanonicalName: 'Any Iron Bar',
        groupMembers: [{ itemId: 22, internalName: 'IronBar', name: 'Iron Bar', nameZh: '铁锭' }],
      },
    },
  });

  const result = verification.verifyItemGroupCutoverEvidence({ expected, actual });
  assert.equal(result.status, 'passed');
  assert.equal(expected.api.adminItemGroups[0].sourceKind, 'canonical:recipe_reference');
  assert.equal(expected.api.adminRecipeGroups.length, 1);
});

test('cutover runner gathers only injected read evidence and emits a durable result', async () => {
  assert.equal(typeof verification.runItemGroupCutoverVerification, 'function');
  const source = fixture();
  const calls = [];
  const result = await verification.runItemGroupCutoverVerification({
    expected: source.expected,
    readDatabase: async () => {
      calls.push('database');
      return {
        publicationState: source.actual.publicationState,
        runtimeSnapshotHash: source.actual.runtimeSnapshotHash,
        consumers: source.actual.consumers,
      };
    },
    scanConsumers: async () => {
      calls.push('consumers');
      return verification.EXPECTED_ITEM_GROUP_CONSUMER_PATHS.map((path) => ({
        path,
        role: path.startsWith('scripts/data/generate/') ? 'compat_export'
          : path.includes('/item-group-bootstrap.mjs') || path.includes('/item-group-live-acceptance.mjs')
            || path.includes('/source-dataset-locator.mjs') ? 'bootstrap' : 'governance',
      }));
    },
    readApi: async () => {
      calls.push('api');
      return source.actual.api;
    },
    now: () => '2026-07-29T04:00:00.000Z',
  });

  assert.deepEqual(calls, ['database', 'consumers', 'api']);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.reportKind, 'canonical_item_group_cutover_verification');
  assert.equal(result.generatedAt, '2026-07-29T04:00:00.000Z');
  assert.equal(result.writesDatabase, false);
  assert.equal(result.status, 'passed');
});

test('formal database adapter issues SELECT statements only', async () => {
  assert.equal(typeof verification.readItemGroupFormalRuntime, 'function');
  const calls = [];
  const resultSets = [
    [[{ status: 'PUBLISHED', snapshotHash: HASH }]],
    [[]],
    [[]],
    [[]],
  ];
  const result = await verification.readItemGroupFormalRuntime({
    query: async (sql) => {
      calls.push(sql);
      return resultSets.shift();
    },
  });

  assert.equal(calls.length, 4);
  assert.equal(calls.every((sql) => /^\s*SELECT\b/i.test(sql)), true);
  assert.equal(calls.every((sql) => !/\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql)), true);
  assert.equal(result.publicationState.status, 'PUBLISHED');
  assert.equal(result.consumers.adminItemGroups.groups.length, 0);
});

test('API adapter uses a locally signed token and GET requests only', async () => {
  assert.equal(typeof verification.createAdminReadToken, 'function');
  assert.equal(typeof verification.readItemGroupApi, 'function');
  const token = verification.createAdminReadToken({
    username: 'admin',
    displayName: 'Admin',
    secret: 'a'.repeat(32),
    nowSeconds: 1_785_296_000,
  });
  assert.equal(token.split('.').length, 3);

  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const data = url.includes('/admin/item-groups')
      ? [{ canonicalName: 'Any Iron Bar' }]
      : url.includes('/admin/recipe-groups')
        ? [{ canonicalName: 'Any Iron Bar' }]
        : { root: { groupCanonicalName: 'Any Iron Bar' } };
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
  const result = await verification.readItemGroupApi({
    apiBase: 'http://127.0.0.1:18101/api',
    token,
    recipeTreeItemId: 85,
    fetchImpl,
  });

  assert.equal(calls.length, 3);
  assert.equal(calls.every((call) => (call.options.method ?? 'GET') === 'GET'), true);
  assert.equal(calls.every((call) => call.options.headers.authorization === `Bearer ${token}`), true);
  assert.equal(result.adminItemGroups.length, 1);
  assert.equal(result.recipeTree.root.groupCanonicalName, 'Any Iron Bar');
});
