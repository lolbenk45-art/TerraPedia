import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertL2AutomaticGate,
  extractL2AutomaticDiff,
  getVerifiedStructuredScopeDefinition,
  normalizeL2AutomaticDiff,
} from './l2-automatic-ceiling.mjs';

const HASH = (letter) => `sha256:${letter.repeat(64)}`;
const NOW = '2026-08-31T10:00:00.000Z';
const ITEMS_SCOPE_CONTRACT = getVerifiedStructuredScopeDefinition('items', {
  databaseRole: 'local',
  table: 'items',
  fieldGroup: 'all_columns',
});

function policy(overrides = {}) {
  return {
    domainId: 'items',
    level: 'L2',
    operationalState: 'ACTIVE',
    policyVersion: 2,
    policyHash: HASH('a'),
    policySetHash: HASH('b'),
    policyJson: {
      schemaVersion: 1,
      level: 'L2',
      ratioInsertCap: 0.1,
      ratioUpdateCap: 0.1,
      ratioRelationshipDeleteCap: 0.05,
      ratioDisableCap: 0.005,
      absoluteInsertCap: 500,
      absoluteUpdateCap: 500,
      absoluteRelationshipDeleteCap: 200,
      absoluteDisableCap: 20,
      sourceFreshnessMaxAgeMinutes: 60,
      requireSnapshot: true,
      anomalyAction: 'CIRCUIT_OPEN',
      ownedTables: [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
    },
    ...overrides,
  };
}

function diff(overrides = {}) {
  const scope = {
    scopeId: 'local.items.all_columns',
    databaseRole: 'local',
    table: 'items',
    fieldGroup: 'all_columns',
    keyColumns: [...ITEMS_SCOPE_CONTRACT.keyColumns],
    compareColumns: [...ITEMS_SCOPE_CONTRACT.compareColumns],
    mutationKind: 'entity',
    entityBaselineCount: 100,
    relationshipBaselineCount: 0,
    inserts: 2,
    updates: 3,
    relationshipDeletes: 0,
    softDisables: 0,
    hardDeletes: 0,
    insertedKeys: ['item:101', 'item:102'],
    updatedKeys: ['item:1', 'item:2', 'item:3'],
    deletedRelationshipKeys: [],
    softDisabledKeys: [],
    hardDeletedKeys: [],
  };
  return {
    schemaVersion: 1,
    snapshot: true,
    sourceCheckedAt: NOW,
    wholeDomainRebuild: false,
    scopes: [scope],
    counts: {
      entityBaselineCount: 100,
      relationshipBaselineCount: 0,
      inserts: 2,
      updates: 3,
      relationshipDeletes: 0,
      softDisables: 0,
      hardDeletes: 0,
    },
    ...overrides,
  };
}

function zeroMutationDiff(overrides = {}) {
  const zeroScope = {
    ...diff().scopes[0],
    inserts: 0,
    updates: 0,
    relationshipDeletes: 0,
    softDisables: 0,
    hardDeletes: 0,
    insertedKeys: [],
    updatedKeys: [],
    deletedRelationshipKeys: [],
    softDisabledKeys: [],
    hardDeletedKeys: [],
  };
  return diff({
    producer: 'read_only_sql_intent_zero_mutation_v2',
    rowCountEvidence: 'zero_mutation_sql_trace',
    scopes: [zeroScope],
    counts: {
      entityBaselineCount: 100,
      relationshipBaselineCount: 0,
      inserts: 0,
      updates: 0,
      relationshipDeletes: 0,
      softDisables: 0,
      hardDeletes: 0,
    },
    ...overrides,
  });
}

function structuredNonZeroDiff(overrides = {}) {
  const base = diff({
    producer: 'structured_source_rows_v1',
    rowCountEvidence: 'verified_structured_row_diff',
    rowLevelEvidence: {
      schemaVersion: 1,
      completeSnapshot: true,
      scopes: [{
        scopeId: 'local.items.all_columns',
        databaseRole: 'local',
        table: 'items',
        fieldGroup: 'all_columns',
        keyColumns: [...ITEMS_SCOPE_CONTRACT.keyColumns],
        compareColumns: [...ITEMS_SCOPE_CONTRACT.compareColumns],
        mutationKind: 'entity',
        candidateRowCount: 102,
        baselineRowCount: 100,
        candidateRowsSha256: HASH('c'),
        baselineRowsSha256: HASH('d'),
      }],
    },
  });
  return { ...base, ...overrides };
}

test('rejects a non-zero diff without an explicit verified row-level producer', () => {
  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy(),
      ownedTables: [{ databaseRole: 'local', table: 'items' }],
      diff: diff(),
      now: NOW,
    }),
    /producer|row.?count.*evidence|structured/i,
  );
});

test('rejects a legacy SQL-intent diff before its fabricated row count can pass a ceiling', () => {
  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy(),
      ownedTables: [{ databaseRole: 'local', table: 'items' }],
      diff: diff({ producer: 'read_only_sql_intent_v1' }),
      now: NOW,
    }),
    /legacy.*SQL.intent|real affected.row|structured.*producer/i,
  );
});

test('limits a zero-mutation SQL-intent trace to verified zero rows', () => {
  const zeroDiff = zeroMutationDiff();

  assert.equal(assertL2AutomaticGate({
    policy: policy(),
    ownedTables: [{ databaseRole: 'local', table: 'items' }],
    diff: zeroDiff,
    now: NOW,
  }).status, 'passed');
  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy(),
      ownedTables: [{ databaseRole: 'local', table: 'items' }],
      diff: diff({
        producer: 'read_only_sql_intent_zero_mutation_v2',
        rowCountEvidence: 'zero_mutation_sql_trace',
      }),
      now: NOW,
    }),
    /SQL.intent.*non-zero|structured.*producer|affected.row/i,
  );
});

test('preserves validated provenance through raw normalization and the automatic gate', () => {
  const raw = zeroMutationDiff();
  const normalized = normalizeL2AutomaticDiff(raw);

  assert.equal(normalized.producer, raw.producer);
  assert.equal(normalized.rowCountEvidence, raw.rowCountEvidence);
  const result = assertL2AutomaticGate({
    policy: policy(),
    ownedTables: [{ databaseRole: 'local', table: 'items' }],
    diff: normalized,
    now: NOW,
  });
  assert.equal(result.producer, raw.producer);
  assert.equal(result.rowCountEvidence, raw.rowCountEvidence);
});

test('preserves extractor provenance and rejects tampered evidence before the gate', () => {
  const raw = zeroMutationDiff();
  const extracted = extractL2AutomaticDiff({ l2Diff: raw });

  assert.equal(extracted.producer, raw.producer);
  assert.equal(extracted.rowCountEvidence, raw.rowCountEvidence);
  const result = assertL2AutomaticGate({
    policy: policy(),
    ownedTables: [{ databaseRole: 'local', table: 'items' }],
    diff: extracted,
    now: NOW,
  });
  assert.equal(result.producer, raw.producer);
  assert.equal(result.rowCountEvidence, raw.rowCountEvidence);

  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy(),
      ownedTables: [{ databaseRole: 'local', table: 'items' }],
      diff: { ...extracted, rowCountEvidence: 'tampered_row_count_evidence' },
      now: NOW,
    }),
    /row.?count.*evidence|trustworthy|producer/i,
  );
});

test('rejects coercible non-number values in aggregate and key-related counts', () => {
  const countFields = [
    'entityBaselineCount',
    'relationshipBaselineCount',
    'inserts',
    'updates',
    'relationshipDeletes',
    'softDisables',
    'hardDeletes',
  ];
  const malformedValues = [null, false, '', '0', []];

  for (const field of countFields) {
    for (const malformed of malformedValues) {
      const base = zeroMutationDiff();
      const candidate = {
        ...base,
        scopes: [{ ...base.scopes[0], [field]: malformed }],
        counts: { ...base.counts, [field]: malformed },
      };
      assert.throws(
        () => assertL2AutomaticGate({
          policy: policy(),
          ownedTables: [{ databaseRole: 'local', table: 'items' }],
          diff: candidate,
          now: NOW,
        }),
        /non.?negative integer|number|count/i,
        `${field} must reject ${String(malformed)}`,
      );
    }
  }
});

test('rejects an unknown producer even when it supplies row-count evidence', () => {
  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy(),
      ownedTables: [{ databaseRole: 'local', table: 'items' }],
      diff: zeroMutationDiff({
        producer: 'unregistered_row_level_producer_v1',
        rowCountEvidence: 'verified_affected_rows',
      }),
      now: NOW,
    }),
    /producer|row.?count.*evidence|structured/i,
  );
});

test('accepts the registered structured producer with non-zero row-level evidence', () => {
  const result = assertL2AutomaticGate({
    policy: policy(),
    ownedTables: [{ databaseRole: 'local', table: 'items' }],
    diff: structuredNonZeroDiff(),
    now: NOW,
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.producer, 'structured_source_rows_v1');
  assert.equal(result.rowCountEvidence, 'verified_structured_row_diff');
  assert.equal(result.rowLevelEvidence.scopes.length, 1);
});

test('exposes immutable schema contracts for every currently supported structured scope', () => {
  const cases = [
    {
      domainId: 'items',
      scope: { databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' },
      keyColumns: ['internal_name'],
      mutationKind: 'entity',
    },
    {
      domainId: 'npcs',
      scope: {
        databaseRole: 'local',
        table: 'npcs',
        fieldGroup: 'npc_owned',
        logicalPredicateHash: 'sha256:694a8d7bb81ab810737b5fc36b6815db4a5a849f5bc2a37c14bc8edd2295a09d',
      },
      keyColumns: ['source_id'],
      mutationKind: 'entity',
    },
    {
      domainId: 'bosses',
      scope: { databaseRole: 'local', table: 'boss_groups', fieldGroup: 'all_columns' },
      keyColumns: ['code'],
      mutationKind: 'entity',
    },
    {
      domainId: 'bosses',
      scope: {
        databaseRole: 'local',
        table: 'npcs',
        fieldGroup: 'boss_owned',
        logicalPredicateHash: 'sha256:8cfb6b96594928d4f7cc89b3edafbb2575cb063d689357e087ced1717117f842',
      },
      keyColumns: ['id'],
      mutationKind: 'entity',
    },
  ];
  for (const entry of cases) {
    const contract = getVerifiedStructuredScopeDefinition(entry.domainId, entry.scope);
    assert.ok(contract);
    assert.deepEqual(contract.keyColumns, entry.keyColumns);
    assert.equal(contract.mutationKind, entry.mutationKind);
    assert.equal(Object.isFrozen(contract), true);
    assert.equal(Object.isFrozen(contract.keyColumns), true);
    assert.equal(Object.isFrozen(contract.compareColumns), true);
    assert.throws(() => { contract.keyColumns.push('unsafe'); }, TypeError);
  }
});

test('exposes exact importer contracts for the remaining automatic domains', () => {
  const cases = [
    {
      domainId: 'projectiles',
      scope: { databaseRole: 'local', table: 'projectiles', fieldGroup: 'all_columns' },
      keyColumns: ['source_id'],
      compareColumns: [
        'source_id', 'internal_name', 'name', 'name_zh', 'image_url', 'ai_style',
        'damage', 'knock_back', 'penetrate', 'time_left', 'width', 'height', 'scale',
        'friendly', 'hostile', 'tile_collide', 'raw_json', 'status', 'deleted',
      ],
      numericColumns: [
        'source_id', 'ai_style', 'damage', 'knock_back', 'penetrate', 'time_left',
        'width', 'height', 'scale', 'friendly', 'hostile', 'tile_collide', 'status', 'deleted',
      ],
      jsonColumns: [],
      mutationKind: 'entity',
    },
    {
      domainId: 'armor_sets',
      scope: { databaseRole: 'local', table: 'armor_sets', fieldGroup: 'all_columns' },
      keyColumns: ['source_key'],
      compareColumns: [
        'source_key', 'text_key', 'benefit_expression', 'primary_part', 'set_count',
        'unique_item_count', 'sets_json', 'unique_item_ids_json', 'status', 'deleted',
      ],
      numericColumns: ['set_count', 'unique_item_count', 'status', 'deleted'],
      jsonColumns: ['sets_json', 'unique_item_ids_json'],
      mutationKind: 'entity',
    },
    {
      domainId: 'armor_sets',
      scope: { databaseRole: 'local', table: 'armor_set_items', fieldGroup: 'all_columns' },
      keyColumns: ['armor_set_id', 'set_variant_index', 'part_index'],
      compareColumns: [
        'armor_set_id', 'set_variant_index', 'part_index', 'source_item_id', 'item_id',
        'item_internal_name', 'item_name',
      ],
      numericColumns: ['armor_set_id', 'set_variant_index', 'part_index', 'source_item_id', 'item_id'],
      jsonColumns: [],
      mutationKind: 'relationship',
      parentIdentity: {
        table: 'armor_sets',
        idColumn: 'id',
        keyColumns: ['source_key'],
        foreignKeyColumn: 'armor_set_id',
        resolution: 'required_existing_parent_id',
      },
    },
    {
      domainId: 'buffs',
      scope: { databaseRole: 'local', table: 'buffs', fieldGroup: 'all_columns' },
      keyColumns: ['source_id'],
      compareColumns: [
        'source_id', 'internal_name', 'english_name', 'name_zh', 'tooltip_en', 'tooltip_zh',
        'image', 'buff_type', 'source_item_count', 'immune_npc_count', 'source_items_json',
        'immune_npcs_json', 'immune_npc_sample_json', 'source_evidence_json', 'status', 'deleted',
      ],
      numericColumns: ['source_id', 'source_item_count', 'immune_npc_count', 'status', 'deleted'],
      jsonColumns: ['source_items_json', 'immune_npcs_json', 'immune_npc_sample_json', 'source_evidence_json'],
      mutationKind: 'entity',
    },
    {
      domainId: 'buffs',
      scope: { databaseRole: 'local', table: 'buff_source_items', fieldGroup: 'all_columns' },
      keyColumns: ['buff_id', 'sort_order'],
      compareColumns: [
        'buff_id', 'source_item_id', 'source_item_internal_name', 'source_item_name',
        'item_id', 'buff_time', 'sort_order',
      ],
      numericColumns: ['buff_id', 'source_item_id', 'item_id', 'buff_time', 'sort_order'],
      jsonColumns: [],
      mutationKind: 'relationship',
      parentIdentity: {
        table: 'buffs',
        idColumn: 'id',
        keyColumns: ['source_id'],
        foreignKeyColumn: 'buff_id',
        resolution: 'required_existing_parent_id',
      },
    },
    {
      domainId: 'audio',
      scope: { databaseRole: 'local', table: 'audio_assets', fieldGroup: 'all_columns' },
      keyColumns: ['asset_id'],
      compareColumns: [
        'asset_id', 'shard', 'kind', 'source_key', 'display_name_zh', 'display_name_en',
        'file_title', 'wiki_file_url', 'source_url', 'local_path', 'absolute_local_path',
        'mime', 'size_bytes', 'sha256', 'provider', 'status', 'crawl_report_path', 'raw_json', 'deleted',
      ],
      numericColumns: ['size_bytes', 'deleted'],
      jsonColumns: ['raw_json'],
      mutationKind: 'entity',
    },
    {
      domainId: 'audio',
      scope: { databaseRole: 'local', table: 'audio_asset_links', fieldGroup: 'all_columns' },
      keyColumns: ['audio_asset_id', 'entity_type', 'source_key', 'relation_type'],
      compareColumns: [
        'audio_asset_id', 'entity_type', 'entity_id', 'source_key', 'relation_type',
        'match_status', 'match_reason', 'sort_order', 'deleted',
      ],
      numericColumns: ['audio_asset_id', 'entity_id', 'sort_order', 'deleted'],
      jsonColumns: [],
      mutationKind: 'relationship',
      parentIdentity: {
        table: 'audio_assets',
        idColumn: 'id',
        keyColumns: ['asset_id'],
        foreignKeyColumn: 'audio_asset_id',
        resolution: 'required_existing_parent_id',
      },
    },
    {
      domainId: 'shimmer',
      scope: { databaseRole: 'local', table: 'shimmer_item_transforms', fieldGroup: 'all_columns' },
      keyColumns: [
        'context_code', 'input_kind', 'input_name_en', 'input_name_zh', 'input_internal_name',
        'output_kind', 'output_name_en', 'output_name_zh', 'output_internal_name', 'sort_order',
      ],
      compareColumns: [
        'context_code', 'input_kind', 'input_name_en', 'input_name_zh', 'input_internal_name',
        'output_kind', 'output_name_en', 'output_name_zh', 'output_internal_name', 'conditions_json',
        'notes', 'source_provider', 'source_page', 'source_revision_timestamp', 'sort_order', 'status', 'deleted',
      ],
      numericColumns: ['sort_order', 'status', 'deleted'],
      jsonColumns: ['conditions_json'],
      mutationKind: 'entity',
    },
    {
      domainId: 'shimmer',
      scope: { databaseRole: 'local', table: 'shimmer_decraft_rules', fieldGroup: 'all_columns' },
      keyColumns: [
        'context_code', 'rule_type', 'group_label', 'input_kind', 'input_name_en', 'input_name_zh',
        'input_internal_name', 'sort_order',
      ],
      compareColumns: [
        'context_code', 'rule_type', 'group_label', 'input_kind', 'input_name_en', 'input_name_zh',
        'input_internal_name', 'outputs_json', 'conditions_json', 'notes', 'source_provider', 'source_page',
        'source_revision_timestamp', 'sort_order', 'status', 'deleted',
      ],
      numericColumns: ['sort_order', 'status', 'deleted'],
      jsonColumns: ['outputs_json', 'conditions_json'],
      mutationKind: 'entity',
    },
    {
      domainId: 'shimmer',
      scope: { databaseRole: 'local', table: 'shimmer_entity_transforms', fieldGroup: 'all_columns' },
      keyColumns: [
        'context_code', 'transform_group', 'input_entity_type', 'input_name_en', 'input_name_zh',
        'input_internal_name', 'output_entity_type', 'output_name_en', 'output_name_zh', 'output_internal_name',
        'sort_order',
      ],
      compareColumns: [
        'context_code', 'transform_group', 'input_entity_type', 'input_name_en', 'input_name_zh',
        'input_internal_name', 'output_entity_type', 'output_name_en', 'output_name_zh', 'output_internal_name',
        'source_provider', 'source_page', 'source_revision_timestamp', 'sort_order', 'status', 'deleted',
      ],
      numericColumns: ['sort_order', 'status', 'deleted'],
      jsonColumns: [],
      mutationKind: 'entity',
    },
    {
      domainId: 'shimmer',
      scope: { databaseRole: 'local', table: 'shimmer_npc_transforms', fieldGroup: 'all_columns' },
      keyColumns: [
        'context_code', 'npc_name_en', 'npc_name_zh', 'npc_internal_name', 'appearance_variant',
        'effect_type', 'sort_order',
      ],
      compareColumns: [
        'context_code', 'npc_name_en', 'npc_name_zh', 'npc_internal_name', 'appearance_variant',
        'effect_type', 'variant_image_url', 'variant_image_alt', 'notes', 'source_provider', 'source_page',
        'source_revision_timestamp', 'sort_order', 'status', 'deleted',
      ],
      numericColumns: ['sort_order', 'status', 'deleted'],
      jsonColumns: [],
      mutationKind: 'entity',
    },
  ];

  for (const expected of cases) {
    const contract = getVerifiedStructuredScopeDefinition(expected.domainId, expected.scope);
    assert.ok(contract, `${expected.domainId}/${expected.scope.table} contract is registered`);
    assert.deepEqual(contract.keyColumns, expected.keyColumns, `${expected.domainId}/${expected.scope.table} key`);
    assert.deepEqual(contract.compareColumns, expected.compareColumns, `${expected.domainId}/${expected.scope.table} compare columns`);
    assert.deepEqual(contract.numericColumns, expected.numericColumns, `${expected.domainId}/${expected.scope.table} numeric columns`);
    assert.deepEqual(contract.jsonColumns, expected.jsonColumns, `${expected.domainId}/${expected.scope.table} JSON columns`);
    assert.equal(contract.mutationKind, expected.mutationKind, `${expected.domainId}/${expected.scope.table} mutation kind`);
    if (expected.parentIdentity) assert.deepEqual(contract.parentIdentity, expected.parentIdentity);
    assert.equal(Object.isFrozen(contract), true);
    assert.equal(Object.isFrozen(contract.keyColumns), true);
    assert.equal(Object.isFrozen(contract.compareColumns), true);
    assert.equal(Object.isFrozen(contract.numericColumns), true);
    assert.equal(Object.isFrozen(contract.jsonColumns), true);
    if (expected.parentIdentity) {
      assert.equal(Object.isFrozen(contract.parentIdentity), true);
      assert.equal(Object.isFrozen(contract.parentIdentity.keyColumns), true);
    }
  }
});

test('rejects a structured Items diff whose compareColumns omit an importer-owned field', () => {
  const candidate = structuredNonZeroDiff({
    scopes: [{
      ...structuredNonZeroDiff().scopes[0],
      keyColumns: ['source_id'],
      compareColumns: ['source_id'],
    }],
    rowLevelEvidence: {
      ...structuredNonZeroDiff().rowLevelEvidence,
      scopes: [{
        ...structuredNonZeroDiff().rowLevelEvidence.scopes[0],
        keyColumns: ['source_id'],
        compareColumns: ['source_id'],
      }],
    },
  });
  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy(),
      ownedTables: [{ databaseRole: 'local', table: 'items', fieldGroup: 'all_columns' }],
      diff: candidate,
      now: NOW,
    }),
    /schema contract|compareColumns|field contract|column/i,
  );
});

test('rejects a structured producer that omits or corrupts row-level evidence', () => {
  for (const candidate of [
    structuredNonZeroDiff({ rowLevelEvidence: undefined }),
    structuredNonZeroDiff({ rowLevelEvidence: { schemaVersion: 1, completeSnapshot: true, scopes: [] } }),
    structuredNonZeroDiff({ rowLevelEvidence: {
      schemaVersion: 1,
      completeSnapshot: true,
      scopes: [{
        scopeId: 'local.items.all_columns',
        databaseRole: 'local',
        table: 'items',
        fieldGroup: 'all_columns',
        keyColumns: ['source_id'],
        compareColumns: ['source_id', 'name'],
        mutationKind: 'entity',
        candidateRowCount: 102,
        baselineRowCount: 100,
        candidateRowsSha256: 'not-a-hash',
        baselineRowsSha256: HASH('d'),
      }],
    } }),
  ]) {
    assert.throws(
      () => assertL2AutomaticGate({
        policy: policy(),
        ownedTables: [{ databaseRole: 'local', table: 'items' }],
        diff: candidate,
        now: NOW,
      }),
      /structured.*row.?level|evidence|sha256/i,
    );
  }
});

test('binds structured row-level evidence to the concrete diff scope and columns', () => {
  const base = structuredNonZeroDiff();
  for (const mutation of [
    { table: 'npcs' },
    { fieldGroup: 'item_names' },
    { logicalPredicateHash: HASH('f') },
    { keyColumns: ['id'] },
    { compareColumns: ['source_id', 'status'] },
    { mutationKind: 'relationship' },
  ]) {
    const evidenceScope = { ...base.rowLevelEvidence.scopes[0], ...mutation };
    assert.throws(
      () => assertL2AutomaticGate({
        policy: policy(),
        ownedTables: [{ databaseRole: 'local', table: 'items' }],
        diff: {
          ...base,
          rowLevelEvidence: { ...base.rowLevelEvidence, scopes: [evidenceScope] },
        },
        now: NOW,
      }),
      /scope|column|mutation|predicate/i,
      `must reject evidence drift for ${Object.keys(mutation)[0]}`,
    );
  }
});

test('normalizes automatic diff evidence into a detached deeply frozen value', () => {
  const raw = structuredNonZeroDiff();
  const normalized = normalizeL2AutomaticDiff(raw);

  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.scopes), true);
  assert.equal(Object.isFrozen(normalized.scopes[0]), true);
  assert.equal(Object.isFrozen(normalized.scopes[0].insertedKeys), true);
  assert.equal(Object.isFrozen(normalized.rowLevelEvidence), true);
  assert.equal(Object.isFrozen(normalized.rowLevelEvidence.scopes[0]), true);

  raw.scopes[0].insertedKeys.push('item:999');
  raw.rowLevelEvidence.scopes[0].compareColumns.push('status');
  assert.deepEqual(normalized.scopes[0].insertedKeys, ['item:101', 'item:102']);
  assert.deepEqual(normalized.rowLevelEvidence.scopes[0].compareColumns, [...ITEMS_SCOPE_CONTRACT.compareColumns]);
  assert.throws(() => { normalized.scopes[0].inserts = 99; }, TypeError);

  const gateResult = assertL2AutomaticGate({
    policy: policy(),
    ownedTables: [{ databaseRole: 'local', table: 'items' }],
    diff: normalized,
    now: NOW,
  });
  assert.equal(Object.isFrozen(gateResult), true);
  assert.equal(Object.isFrozen(gateResult.limits), true);
});

test('rejects accessor-backed diff arrays before reading their values', () => {
  const raw = structuredNonZeroDiff();
  let getterReads = 0;
  const scope = raw.scopes[0];
  const scopes = [];
  Object.defineProperty(scopes, '0', {
    enumerable: true,
    configurable: true,
    get() {
      getterReads += 1;
      return scope;
    },
  });
  scopes.length = 1;
  raw.scopes = scopes;
  assert.throws(
    () => normalizeL2AutomaticDiff(raw),
    /data property|accessor|stable/i,
  );
  assert.equal(getterReads, 0);
});

test('rejects unsupported diff schema and row-level mutation metadata', () => {
  assert.throws(
    () => normalizeL2AutomaticDiff({ ...structuredNonZeroDiff(), schemaVersion: 2 }),
    /schemaVersion|schema/i,
  );
  assert.throws(
    () => normalizeL2AutomaticDiff({
      ...structuredNonZeroDiff(),
      scopes: [{ ...structuredNonZeroDiff().scopes[0], mutationKind: 'unknown' }],
    }),
    /mutationKind|mutation/i,
  );
  const partial = structuredNonZeroDiff();
  partial.scopes = [{ ...partial.scopes[0], keyColumns: undefined, compareColumns: undefined }];
  assert.throws(
    () => normalizeL2AutomaticDiff(partial),
    /row.level.*metadata|metadata|column/i,
  );
});

test('accepts only the pinned shared NPC/Boss predicate hashes', () => {
  const npcScope = {
    databaseRole: 'local',
    table: 'npcs',
    fieldGroup: 'npc_owned',
    logicalPredicateHash: 'sha256:694a8d7bb81ab810737b5fc36b6815db4a5a849f5bc2a37c14bc8edd2295a09d',
  };
  const npcPolicy = policy({
    domainId: 'npcs',
    policyJson: { ...policy().policyJson, ownedTables: [npcScope] },
  });
  const npcDiff = zeroMutationDiff({
    scopes: [{
      ...zeroMutationDiff().scopes[0],
      scopeId: 'local.npcs.npc_owned',
      ...npcScope,
      entityBaselineCount: 10,
    }],
    counts: {
      entityBaselineCount: 10,
      relationshipBaselineCount: 0,
      inserts: 0,
      updates: 0,
      relationshipDeletes: 0,
      softDisables: 0,
      hardDeletes: 0,
    },
    rowLevelEvidence: undefined,
  });
  assert.equal(assertL2AutomaticGate({
    policy: npcPolicy,
    ownedTables: [npcScope],
    diff: npcDiff,
    now: NOW,
  }).status, 'passed');
  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy({ domainId: 'npcs', policyJson: { ...policy().policyJson, ownedTables: [{ ...npcScope, logicalPredicateHash: HASH('f') }] } }),
      ownedTables: [{ ...npcScope, logicalPredicateHash: HASH('f') }],
      diff: zeroMutationDiff(),
      now: NOW,
    }),
    /shared.*predicate|definition|scope/i,
  );
});

test('rejects missing, null, numeric, and string wholeDomainRebuild values', () => {
  const validZero = zeroMutationDiff();
  const missing = { ...validZero };
  delete missing.wholeDomainRebuild;
  for (const candidate of [
    missing,
    { ...validZero, wholeDomainRebuild: null },
    { ...validZero, wholeDomainRebuild: 0 },
    { ...validZero, wholeDomainRebuild: 1 },
    { ...validZero, wholeDomainRebuild: 'false' },
    { ...validZero, wholeDomainRebuild: 'true' },
  ]) {
    assert.throws(
      () => assertL2AutomaticGate({
        policy: policy(),
        ownedTables: [{ databaseRole: 'local', table: 'items' }],
        diff: candidate,
        now: NOW,
      }),
      /wholeDomainRebuild.*boolean|boolean.*wholeDomainRebuild/i,
    );
  }
});

test('fails closed when an insert ceiling is exceeded', () => {
  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy(),
      ownedTables: [{ databaseRole: 'local', table: 'items' }],
      diff: diff({
        scopes: [{ ...diff().scopes[0], inserts: 11, insertedKeys: Array.from({ length: 11 }, (_, i) => `item:${String(i).padStart(2, '0')}`) }],
        counts: { ...diff().counts, inserts: 11 },
      }),
      now: NOW,
    }),
    /INSERT_THRESHOLD_EXCEEDED|insert.*ceiling|producer|row.?count.*evidence/i,
  );
});

test('rejects missing snapshot, hard deletes, and unknown diff evidence', () => {
  for (const candidate of [
    diff({ snapshot: false }),
    diff({
      scopes: [{ ...diff().scopes[0], hardDeletes: 1, hardDeletedKeys: ['item:9'] }],
      counts: { ...diff().counts, hardDeletes: 1 },
    }),
    { ...diff(), scopes: null },
  ]) {
    assert.throws(
      () => assertL2AutomaticGate({
        policy: policy(),
        ownedTables: [{ databaseRole: 'local', table: 'items' }],
        diff: candidate,
        now: NOW,
      }),
      /snapshot|hard.?delete|diff|anomaly/i,
    );
  }
});

test('rejects a stale source and a policy scope mismatch', () => {
  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy(),
      ownedTables: [{ databaseRole: 'local', table: 'items' }],
      diff: zeroMutationDiff({ sourceCheckedAt: '2026-08-31T08:59:59.000Z' }),
      now: NOW,
    }),
    /freshness|stale/i,
  );
  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy(),
      ownedTables: [{ databaseRole: 'local', table: 'npcs' }],
      diff: zeroMutationDiff(),
      now: NOW,
    }),
    /owned|scope/i,
  );
});

test('rejects a diff whose concrete scope is outside the exact L2 policy scope', () => {
  const mismatchedScope = { ...zeroMutationDiff().scopes[0], table: 'npcs' };
  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy(),
      ownedTables: [{ databaseRole: 'local', table: 'items' }],
      diff: zeroMutationDiff({
        scopes: [mismatchedScope],
      }),
      now: NOW,
    }),
    /diff.*scope|scope.*policy|owned.*scope/i,
  );
});

test('rejects automatic shared npcs writes without a registered predicate definition', () => {
  const sharedScope = {
    databaseRole: 'local',
    table: 'npcs',
    fieldGroup: 'npc_owned',
    logicalPredicateHash: HASH('d'),
  };
  assert.throws(
    () => assertL2AutomaticGate({
      policy: policy({
        domainId: 'npcs',
        policyJson: { ...policy().policyJson, ownedTables: [sharedScope] },
      }),
      ownedTables: [sharedScope],
      diff: diff({
        scopes: [{ ...diff().scopes[0], scopeId: 'local.npcs', ...sharedScope }],
      }),
      now: NOW,
    }),
    /shared.*npcs.*predicate|predicate.*definition/i,
  );
});
