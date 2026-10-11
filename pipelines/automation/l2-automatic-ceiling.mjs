/**
 * Transaction-independent L2 admission gate for automatic imports.
 *
 * The gate deliberately consumes an explicit, frozen diff description.  It
 * does not infer a missing diff from a row count: an unknown or incomplete
 * preview is unsafe for an automatic write and is rejected closed.
 */

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SAFE_COLUMN_NAME = /^[a-z][a-z0-9_]*$/;
const COUNT_FIELDS = Object.freeze([
  'entityBaselineCount',
  'relationshipBaselineCount',
  'inserts',
  'updates',
  'relationshipDeletes',
  'softDisables',
  'hardDeletes',
]);
const KEY_FIELDS = Object.freeze([
  ['inserts', 'insertedKeys'],
  ['updates', 'updatedKeys'],
  ['relationshipDeletes', 'deletedRelationshipKeys'],
  ['softDisables', 'softDisabledKeys'],
  ['hardDeletes', 'hardDeletedKeys'],
]);
const MUTATION_COUNT_FIELDS = Object.freeze(COUNT_FIELDS.slice(2));
// A hash alone cannot prove which rows or columns an importer may mutate.
// These two shared-table contracts are pinned to the approved policy artifacts
// and include the source column used to evaluate the predicate. The producer
// looks up this exact definition; it never derives a predicate from a hash.
const VERIFIED_SHARED_NPCS_SCOPE_DEFINITIONS = new Map([
  ['npc_owned:sha256:694a8d7bb81ab810737b5fc36b6815db4a5a849f5bc2a37c14bc8edd2295a09d', Object.freeze({
    table: 'npcs',
    fieldGroup: 'npc_owned',
    logicalPredicateHash: 'sha256:694a8d7bb81ab810737b5fc36b6815db4a5a849f5bc2a37c14bc8edd2295a09d',
    sourceColumns: Object.freeze(['is_boss']),
    predicate: Object.freeze({
      schemaVersion: 1,
      kind: 'column_partition',
      column: 'is_boss',
      partition: 'non_boss',
      expression: 'COALESCE(n.is_boss, 0) <> 1',
    }),
  })],
  ['boss_owned:sha256:8cfb6b96594928d4f7cc89b3edafbb2575cb063d689357e087ced1717117f842', Object.freeze({
    table: 'npcs',
    fieldGroup: 'boss_owned',
    logicalPredicateHash: 'sha256:8cfb6b96594928d4f7cc89b3edafbb2575cb063d689357e087ced1717117f842',
    sourceColumns: Object.freeze(['is_boss']),
    predicate: Object.freeze({
      schemaVersion: 1,
      kind: 'column_partition',
      column: 'is_boss',
      partition: 'boss',
      expression: 'COALESCE(n.is_boss, 0) = 1',
    }),
  })],
]);

// Structured row diffs are trustworthy only when their row identity and
// comparison columns are bound to the importer/schema contract for the exact
// domain scope.  A caller may still carry these fields in an evidence packet,
// but it cannot choose a narrower set (for example, comparing only a key and
// silently hiding a changed name).  Keep this registry local and immutable;
// it is the policy-side counterpart of the producer's projection contract.
const VERIFIED_STRUCTURED_SCOPE_DEFINITIONS = new Map([
  ['items:local:items:all_columns:', Object.freeze({
    domainId: 'items',
    databaseRole: 'local',
    table: 'items',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze(['internal_name']),
    compareColumns: Object.freeze([
      'name',
      'internal_name',
      'image',
      'category_id',
      'description',
      'damage',
      'defense',
      'knockback',
      'use_time',
      'width',
      'height',
      'buy',
      'sell',
      'tooltip',
      'rarity_id',
      'game_period_id',
      'game_model_id',
      'is_stackable',
      'stack_size',
      'status',
      'deleted',
    ]),
    numericColumns: Object.freeze([
      'category_id',
      'damage',
      'defense',
      'knockback',
      'use_time',
      'width',
      'height',
      'buy',
      'sell',
      'rarity_id',
      'game_period_id',
      'game_model_id',
      'is_stackable',
      'stack_size',
      'status',
      'deleted',
    ]),
    jsonColumns: Object.freeze([]),
    mutationKind: 'entity',
  })],
  ['npcs:local:npcs:npc_owned:sha256:694a8d7bb81ab810737b5fc36b6815db4a5a849f5bc2a37c14bc8edd2295a09d', Object.freeze({
    domainId: 'npcs',
    databaseRole: 'local',
    table: 'npcs',
    fieldGroup: 'npc_owned',
    logicalPredicateHash: 'sha256:694a8d7bb81ab810737b5fc36b6815db4a5a849f5bc2a37c14bc8edd2295a09d',
    keyColumns: Object.freeze(['source_id']),
    compareColumns: Object.freeze([
      'source_id',
      'internal_name',
      'name',
      'name_zh',
      'sub_name',
      'sub_name_zh',
      'category_id',
      'is_boss',
      'is_friendly',
      'is_town_npc',
      'net_id',
      'npc_type',
      'ai_style',
      'damage',
      'defense',
      'life_max',
      'knock_back_resist',
      'width',
      'height',
      'scale',
      'value',
      'banner_source_item_id',
      'banner_item_id',
      'catch_source_item_id',
      'catch_item_id',
      'buff_immune',
      'raw_json',
      'status',
      'deleted',
    ]),
    numericColumns: Object.freeze([
      'source_id',
      'category_id',
      'is_boss',
      'is_friendly',
      'is_town_npc',
      'net_id',
      'npc_type',
      'ai_style',
      'damage',
      'defense',
      'life_max',
      'knock_back_resist',
      'width',
      'height',
      'scale',
      'value',
      'banner_source_item_id',
      'banner_item_id',
      'catch_source_item_id',
      'catch_item_id',
      'status',
      'deleted',
    ]),
    jsonColumns: Object.freeze(['raw_json']),
    mutationKind: 'entity',
  })],
  ['bosses:local:boss_groups:all_columns:', Object.freeze({
    domainId: 'bosses',
    databaseRole: 'local',
    table: 'boss_groups',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze(['code']),
    compareColumns: Object.freeze([
      'code',
      'name_en',
      'name_zh',
      'boss_type',
      'image_url',
      'progression_order',
      'notes',
      'source_page',
      'source_revision_timestamp',
      'status',
      'deleted',
    ]),
    numericColumns: Object.freeze(['progression_order', 'status', 'deleted']),
    jsonColumns: Object.freeze([]),
    mutationKind: 'entity',
  })],
  ['bosses:local:npcs:boss_owned:sha256:8cfb6b96594928d4f7cc89b3edafbb2575cb063d689357e087ced1717117f842', Object.freeze({
    domainId: 'bosses',
    databaseRole: 'local',
    table: 'npcs',
    fieldGroup: 'boss_owned',
    logicalPredicateHash: 'sha256:8cfb6b96594928d4f7cc89b3edafbb2575cb063d689357e087ced1717117f842',
    keyColumns: Object.freeze(['id']),
    compareColumns: Object.freeze(['id', 'is_boss', 'boss_group_id', 'boss_role']),
    numericColumns: Object.freeze(['id', 'is_boss', 'boss_group_id']),
    jsonColumns: Object.freeze([]),
    mutationKind: 'entity',
  })],
  ['projectiles:local:projectiles:all_columns:', Object.freeze({
    domainId: 'projectiles',
    databaseRole: 'local',
    table: 'projectiles',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    // The importer locates existing projectiles by the stable source ID;
    // internal_name is mutable display data and must not define identity.
    keyColumns: Object.freeze(['source_id']),
    compareColumns: Object.freeze([
      'source_id',
      'internal_name',
      'name',
      'name_zh',
      'image_url',
      'ai_style',
      'damage',
      'knock_back',
      'penetrate',
      'time_left',
      'width',
      'height',
      'scale',
      'friendly',
      'hostile',
      'tile_collide',
      'raw_json',
      'status',
      'deleted',
    ]),
    numericColumns: Object.freeze([
      'source_id',
      'ai_style',
      'damage',
      'knock_back',
      'penetrate',
      'time_left',
      'width',
      'height',
      'scale',
      'friendly',
      'hostile',
      'tile_collide',
      'status',
      'deleted',
    ]),
    jsonColumns: Object.freeze([]),
    mutationKind: 'entity',
  })],
  ['armor_sets:local:armor_sets:all_columns:', Object.freeze({
    domainId: 'armor_sets',
    databaseRole: 'local',
    table: 'armor_sets',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze(['source_key']),
    compareColumns: Object.freeze([
      'source_key',
      'text_key',
      'benefit_expression',
      'primary_part',
      'set_count',
      'unique_item_count',
      'sets_json',
      'unique_item_ids_json',
      'status',
      'deleted',
    ]),
    numericColumns: Object.freeze(['set_count', 'unique_item_count', 'status', 'deleted']),
    jsonColumns: Object.freeze(['sets_json', 'unique_item_ids_json']),
    mutationKind: 'entity',
  })],
  ['armor_sets:local:armor_set_items:all_columns:', Object.freeze({
    domainId: 'armor_sets',
    databaseRole: 'local',
    table: 'armor_set_items',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze(['armor_set_id', 'set_variant_index', 'part_index']),
    compareColumns: Object.freeze([
      'armor_set_id',
      'set_variant_index',
      'part_index',
      'source_item_id',
      'item_id',
      'item_internal_name',
      'item_name',
    ]),
    numericColumns: Object.freeze(['armor_set_id', 'set_variant_index', 'part_index', 'source_item_id', 'item_id']),
    jsonColumns: Object.freeze([]),
    mutationKind: 'relationship',
    parentIdentity: Object.freeze({
      table: 'armor_sets',
      idColumn: 'id',
      keyColumns: Object.freeze(['source_key']),
      foreignKeyColumn: 'armor_set_id',
      resolution: 'required_existing_parent_id',
    }),
  })],
  ['buffs:local:buffs:all_columns:', Object.freeze({
    domainId: 'buffs',
    databaseRole: 'local',
    table: 'buffs',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze(['source_id']),
    compareColumns: Object.freeze([
      'source_id',
      'internal_name',
      'english_name',
      'name_zh',
      'tooltip_en',
      'tooltip_zh',
      'image',
      'buff_type',
      'source_item_count',
      'immune_npc_count',
      'source_items_json',
      'immune_npcs_json',
      'immune_npc_sample_json',
      'source_evidence_json',
      'status',
      'deleted',
    ]),
    numericColumns: Object.freeze(['source_id', 'source_item_count', 'immune_npc_count', 'status', 'deleted']),
    jsonColumns: Object.freeze(['source_items_json', 'immune_npcs_json', 'immune_npc_sample_json', 'source_evidence_json']),
    mutationKind: 'entity',
  })],
  ['buffs:local:buff_source_items:all_columns:', Object.freeze({
    domainId: 'buffs',
    databaseRole: 'local',
    table: 'buff_source_items',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze(['buff_id', 'sort_order']),
    compareColumns: Object.freeze([
      'buff_id',
      'source_item_id',
      'source_item_internal_name',
      'source_item_name',
      'item_id',
      'buff_time',
      'sort_order',
    ]),
    numericColumns: Object.freeze(['buff_id', 'source_item_id', 'item_id', 'buff_time', 'sort_order']),
    jsonColumns: Object.freeze([]),
    mutationKind: 'relationship',
    parentIdentity: Object.freeze({
      table: 'buffs',
      idColumn: 'id',
      keyColumns: Object.freeze(['source_id']),
      foreignKeyColumn: 'buff_id',
      resolution: 'required_existing_parent_id',
    }),
  })],
  ['audio:local:audio_assets:all_columns:', Object.freeze({
    domainId: 'audio',
    databaseRole: 'local',
    table: 'audio_assets',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze(['asset_id']),
    // last_verified_at is intentionally omitted: the importer refreshes it on
    // every successful run and excludes it from audioAssetRowsEqual().
    compareColumns: Object.freeze([
      'asset_id',
      'shard',
      'kind',
      'source_key',
      'display_name_zh',
      'display_name_en',
      'file_title',
      'wiki_file_url',
      'source_url',
      'local_path',
      'absolute_local_path',
      'mime',
      'size_bytes',
      'sha256',
      'provider',
      'status',
      'crawl_report_path',
      'raw_json',
      'deleted',
    ]),
    numericColumns: Object.freeze(['size_bytes', 'deleted']),
    jsonColumns: Object.freeze(['raw_json']),
    mutationKind: 'entity',
  })],
  ['audio:local:audio_asset_links:all_columns:', Object.freeze({
    domainId: 'audio',
    databaseRole: 'local',
    table: 'audio_asset_links',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze(['audio_asset_id', 'entity_type', 'source_key', 'relation_type']),
    compareColumns: Object.freeze([
      'audio_asset_id',
      'entity_type',
      'entity_id',
      'source_key',
      'relation_type',
      'match_status',
      'match_reason',
      'sort_order',
      'deleted',
    ]),
    numericColumns: Object.freeze(['audio_asset_id', 'entity_id', 'sort_order', 'deleted']),
    jsonColumns: Object.freeze([]),
    mutationKind: 'relationship',
    parentIdentity: Object.freeze({
      table: 'audio_assets',
      idColumn: 'id',
      keyColumns: Object.freeze(['asset_id']),
      foreignKeyColumn: 'audio_asset_id',
      resolution: 'required_existing_parent_id',
    }),
  })],
  ['shimmer:local:shimmer_item_transforms:all_columns:', Object.freeze({
    domainId: 'shimmer',
    databaseRole: 'local',
    table: 'shimmer_item_transforms',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze([
      'context_code',
      'input_kind',
      'input_name_en',
      'input_name_zh',
      'input_internal_name',
      'output_kind',
      'output_name_en',
      'output_name_zh',
      'output_internal_name',
      'sort_order',
    ]),
    compareColumns: Object.freeze([
      'context_code',
      'input_kind',
      'input_name_en',
      'input_name_zh',
      'input_internal_name',
      'output_kind',
      'output_name_en',
      'output_name_zh',
      'output_internal_name',
      'conditions_json',
      'notes',
      'source_provider',
      'source_page',
      'source_revision_timestamp',
      'sort_order',
      'status',
      'deleted',
    ]),
    numericColumns: Object.freeze(['sort_order', 'status', 'deleted']),
    jsonColumns: Object.freeze(['conditions_json']),
    mutationKind: 'entity',
  })],
  ['shimmer:local:shimmer_decraft_rules:all_columns:', Object.freeze({
    domainId: 'shimmer',
    databaseRole: 'local',
    table: 'shimmer_decraft_rules',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze([
      'context_code',
      'rule_type',
      'group_label',
      'input_kind',
      'input_name_en',
      'input_name_zh',
      'input_internal_name',
      'sort_order',
    ]),
    compareColumns: Object.freeze([
      'context_code',
      'rule_type',
      'group_label',
      'input_kind',
      'input_name_en',
      'input_name_zh',
      'input_internal_name',
      'outputs_json',
      'conditions_json',
      'notes',
      'source_provider',
      'source_page',
      'source_revision_timestamp',
      'sort_order',
      'status',
      'deleted',
    ]),
    numericColumns: Object.freeze(['sort_order', 'status', 'deleted']),
    jsonColumns: Object.freeze(['outputs_json', 'conditions_json']),
    mutationKind: 'entity',
  })],
  ['shimmer:local:shimmer_entity_transforms:all_columns:', Object.freeze({
    domainId: 'shimmer',
    databaseRole: 'local',
    table: 'shimmer_entity_transforms',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze([
      'context_code',
      'transform_group',
      'input_entity_type',
      'input_name_en',
      'input_name_zh',
      'input_internal_name',
      'output_entity_type',
      'output_name_en',
      'output_name_zh',
      'output_internal_name',
      'sort_order',
    ]),
    compareColumns: Object.freeze([
      'context_code',
      'transform_group',
      'input_entity_type',
      'input_name_en',
      'input_name_zh',
      'input_internal_name',
      'output_entity_type',
      'output_name_en',
      'output_name_zh',
      'output_internal_name',
      'source_provider',
      'source_page',
      'source_revision_timestamp',
      'sort_order',
      'status',
      'deleted',
    ]),
    numericColumns: Object.freeze(['sort_order', 'status', 'deleted']),
    jsonColumns: Object.freeze([]),
    mutationKind: 'entity',
  })],
  ['shimmer:local:shimmer_npc_transforms:all_columns:', Object.freeze({
    domainId: 'shimmer',
    databaseRole: 'local',
    table: 'shimmer_npc_transforms',
    fieldGroup: 'all_columns',
    logicalPredicateHash: null,
    keyColumns: Object.freeze([
      'context_code',
      'npc_name_en',
      'npc_name_zh',
      'npc_internal_name',
      'appearance_variant',
      'effect_type',
      'sort_order',
    ]),
    compareColumns: Object.freeze([
      'context_code',
      'npc_name_en',
      'npc_name_zh',
      'npc_internal_name',
      'appearance_variant',
      'effect_type',
      'variant_image_url',
      'variant_image_alt',
      'notes',
      'source_provider',
      'source_page',
      'source_revision_timestamp',
      'sort_order',
      'status',
      'deleted',
    ]),
    numericColumns: Object.freeze(['sort_order', 'status', 'deleted']),
    jsonColumns: Object.freeze([]),
    mutationKind: 'entity',
  })],
]);
// The read-only SQL-intent trace is verified only for a zero-mutation result.
// Keep this registry explicit so an unknown producer or evidence label cannot
// silently authorize a non-zero automatic write before a real row-level
// producer has been independently reviewed and registered.
const VERIFIED_ROW_COUNT_PRODUCER_DEFINITIONS = new Map([
  ['read_only_sql_intent_zero_mutation_v2', Object.freeze({
    rowCountEvidence: 'zero_mutation_sql_trace',
    allowsNonZero: false,
    requiresRowLevelEvidence: false,
  })],
  ['structured_source_rows_v1', Object.freeze({
    rowCountEvidence: 'verified_structured_row_diff',
    allowsNonZero: true,
    requiresRowLevelEvidence: true,
  })],
]);

export function getVerifiedSharedNpcsScopeDefinition(scope) {
  if (!scope || typeof scope !== 'object') return null;
  const key = `${scope.fieldGroup ?? ''}:${scope.logicalPredicateHash ?? ''}`;
  return VERIFIED_SHARED_NPCS_SCOPE_DEFINITIONS.get(key) ?? null;
}

export function getVerifiedStructuredScopeDefinition(domainId, scope) {
  if (typeof domainId !== 'string' || !domainId.trim() || !scope || typeof scope !== 'object') return null;
  return VERIFIED_STRUCTURED_SCOPE_DEFINITIONS.get(structuredScopeDefinitionKey(domainId, scope)) ?? null;
}

/**
 * Validate a planned automatic L2 change against the immutable policy JSON.
 *
 * @returns {Readonly<object>} a persisted-friendly gate result
 */
export function assertL2AutomaticGate({
  policy,
  ownedTables,
  diff,
  now = new Date().toISOString(),
} = {}) {
  const normalizedPolicy = normalizePolicy(policy);
  const normalizedOwnedTables = normalizeOwnedTables(ownedTables);
  assertSameScopes(normalizedPolicy.ownedTables, normalizedOwnedTables);
  assertSharedNpcsScopesAreVerifiable(normalizedPolicy.ownedTables);
  const normalizedDiff = normalizeDiff(diff);
  assertSameDiffScopes(normalizedPolicy.ownedTables, normalizedDiff.scopes);
  assertStructuredDiffScopeContracts(normalizedPolicy.domainId, normalizedDiff);
  const executionTime = parseTimestamp(now, 'automatic gate time');
  const sourceTime = parseTimestamp(normalizedDiff.sourceCheckedAt, 'sourceCheckedAt');
  if (sourceTime > executionTime) throw new Error('sourceCheckedAt cannot be in the future');
  const ageMinutes = (executionTime - sourceTime) / 60000;
  if (ageMinutes > normalizedPolicy.sourceFreshnessMaxAgeMinutes) {
    throw new Error('automatic source freshness ceiling is stale');
  }
  if (normalizedDiff.snapshot !== true) {
    throw new Error('automatic L2 apply requires a verified snapshot');
  }
  if (normalizedDiff.wholeDomainRebuild === true) {
    throw new Error('whole-domain rebuild is not eligible for automatic L2 apply');
  }

  const reasons = [];
  for (const scope of normalizedDiff.scopes) {
    const insertAllowed = allowed(scope.entityBaselineCount, normalizedPolicy.ratioInsertCap, normalizedPolicy.absoluteInsertCap);
    const updateAllowed = allowed(scope.entityBaselineCount, normalizedPolicy.ratioUpdateCap, normalizedPolicy.absoluteUpdateCap);
    const relationshipDeleteAllowed = allowed(scope.relationshipBaselineCount, normalizedPolicy.ratioRelationshipDeleteCap, normalizedPolicy.absoluteRelationshipDeleteCap);
    const disableAllowed = allowed(scope.entityBaselineCount, normalizedPolicy.ratioDisableCap, normalizedPolicy.absoluteDisableCap);
    if (scope.entityBaselineCount === 0
        && (scope.updates > 0 || scope.softDisables > 0 || scope.hardDeletes > 0)) {
      reasons.push('EMPTY_BASELINE_NON_INSERT_ANOMALY');
    }
    if (scope.relationshipBaselineCount === 0 && scope.relationshipDeletes > 0) {
      reasons.push('ZERO_RELATIONSHIP_BASELINE');
    }
    if (scope.inserts > insertAllowed) reasons.push('INSERT_THRESHOLD_EXCEEDED');
    if (scope.updates > updateAllowed) reasons.push('UPDATE_THRESHOLD_EXCEEDED');
    if (scope.relationshipDeletes > relationshipDeleteAllowed) reasons.push('RELATIONSHIP_DELETE_THRESHOLD_EXCEEDED');
    if (scope.softDisables > disableAllowed) reasons.push('SOFT_DISABLE_THRESHOLD_EXCEEDED');
    if (scope.entityBaselineCount === 0 && scope.inserts > 0) reasons.push('ZERO_BASELINE_FIRST_IMPORT');
  }
  if (normalizedDiff.counts.inserts > normalizedPolicy.absoluteInsertCap) reasons.push('INSERT_AGGREGATE_ABSOLUTE_EXCEEDED');
  if (normalizedDiff.counts.updates > normalizedPolicy.absoluteUpdateCap) reasons.push('UPDATE_AGGREGATE_ABSOLUTE_EXCEEDED');
  if (normalizedDiff.counts.relationshipDeletes > normalizedPolicy.absoluteRelationshipDeleteCap) reasons.push('RELATIONSHIP_DELETE_AGGREGATE_ABSOLUTE_EXCEEDED');
  if (normalizedDiff.counts.softDisables > normalizedPolicy.absoluteDisableCap) reasons.push('SOFT_DISABLE_AGGREGATE_ABSOLUTE_EXCEEDED');
  if (normalizedDiff.counts.hardDeletes > 0) reasons.push('HARD_DELETE_REQUIRES_OWNER');
  if (reasons.length > 0) {
    const unique = [...new Set(reasons)];
    throw new Error(`automatic L2 ceiling rejected: ${unique.join(',')}`);
  }

  return freezeDeep({
    schemaVersion: 1,
    status: 'passed',
    reasonCodes: Object.freeze(['WITHIN_POLICY_CEILINGS']),
    sourceCheckedAt: normalizedDiff.sourceCheckedAt,
    sourceAgeMinutes: Number(ageMinutes.toFixed(3)),
    producer: normalizedDiff.producer,
    rowCountEvidence: normalizedDiff.rowCountEvidence,
    ...(normalizedDiff.rowLevelEvidence == null ? {} : { rowLevelEvidence: normalizedDiff.rowLevelEvidence }),
    snapshot: true,
    wholeDomainRebuild: false,
    counts: Object.freeze({ ...normalizedDiff.counts }),
    scopes: Object.freeze(normalizedDiff.scopes.map((scope) => Object.freeze({ ...scope }))),
    limits: Object.freeze({
      ratioInsertCap: normalizedPolicy.ratioInsertCap,
      ratioUpdateCap: normalizedPolicy.ratioUpdateCap,
      ratioRelationshipDeleteCap: normalizedPolicy.ratioRelationshipDeleteCap,
      ratioDisableCap: normalizedPolicy.ratioDisableCap,
      absoluteInsertCap: normalizedPolicy.absoluteInsertCap,
      absoluteUpdateCap: normalizedPolicy.absoluteUpdateCap,
      absoluteRelationshipDeleteCap: normalizedPolicy.absoluteRelationshipDeleteCap,
      absoluteDisableCap: normalizedPolicy.absoluteDisableCap,
    }),
  });
}

/**
 * Normalize an import-plan diff.  Keeping this separate lets preview
 * producers and the transaction adapter share exactly one shape.
 */
export function normalizeL2AutomaticDiff(value) {
  return normalizeDiff(value);
}

export function extractL2AutomaticDiff(importPlan = {}) {
  const plan = snapshotDataValue(importPlan, 'automatic import plan');
  const candidate = plan?.l2Diff ?? plan?.automaticL2Diff ?? plan?.policyDiff;
  if (candidate == null) {
    throw new Error('automatic L2 diff evidence is required before apply');
  }
  return normalizeDiff(candidate);
}

function normalizePolicy(value) {
  const input = snapshotDataValue(value, 'automatic L2 policy');
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || input.level !== 'L2' || input.operationalState !== 'ACTIVE') {
    throw new Error('automatic L2 policy must be exact L2/ACTIVE');
  }
  const source = input.policyJson ?? input.ceiling ?? input;
  if (!source || typeof source !== 'object' || Array.isArray(source)
      || source.level !== 'L2' || source.requireSnapshot !== true
      || source.anomalyAction !== 'CIRCUIT_OPEN') {
    throw new Error('automatic L2 policy ceiling is incomplete');
  }
  const normalized = {
    domainId: input.domainId == null ? null : requireText(input.domainId, 'automatic L2 policy domainId'),
    ratioInsertCap: ratio(source.ratioInsertCap, 'ratioInsertCap'),
    ratioUpdateCap: ratio(source.ratioUpdateCap, 'ratioUpdateCap'),
    ratioRelationshipDeleteCap: ratio(source.ratioRelationshipDeleteCap, 'ratioRelationshipDeleteCap'),
    ratioDisableCap: ratio(source.ratioDisableCap, 'ratioDisableCap'),
    absoluteInsertCap: nonNegativeInteger(source.absoluteInsertCap, 'absoluteInsertCap'),
    absoluteUpdateCap: nonNegativeInteger(source.absoluteUpdateCap, 'absoluteUpdateCap'),
    absoluteRelationshipDeleteCap: nonNegativeInteger(source.absoluteRelationshipDeleteCap, 'absoluteRelationshipDeleteCap'),
    absoluteDisableCap: nonNegativeInteger(source.absoluteDisableCap, 'absoluteDisableCap'),
    sourceFreshnessMaxAgeMinutes: nonNegativeInteger(source.sourceFreshnessMaxAgeMinutes, 'sourceFreshnessMaxAgeMinutes'),
    ownedTables: normalizeOwnedTables(source.ownedTables),
  };
  if (!Number.isSafeInteger(input.policyVersion) || input.policyVersion < 1) {
    throw new Error('automatic L2 policyVersion must be a positive integer');
  }
  if (input.policyHash != null && !HASH_PATTERN.test(input.policyHash)) {
    throw new Error('automatic L2 policyHash must be a sha256 hash');
  }
  if (input.policySetHash != null && !HASH_PATTERN.test(input.policySetHash)) {
    throw new Error('automatic L2 policySetHash must be a sha256 hash');
  }
  return freezeDeep(normalized);
}

function normalizeDiff(value) {
  const input = snapshotDataValue(value, 'automatic L2 diff evidence');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('automatic L2 diff evidence is required');
  }
  if (input.schemaVersion !== 1) throw new Error('automatic L2 diff schemaVersion must be 1');
  const sourceCheckedAt = requireText(input.sourceCheckedAt, 'automatic diff sourceCheckedAt');
  parseTimestamp(sourceCheckedAt, 'sourceCheckedAt');
  if (input.snapshot !== true) throw new Error('automatic diff snapshot must be true');
  if (!Array.isArray(input.scopes) || input.scopes.length === 0) {
    throw new Error('automatic L2 diff scopes are required');
  }
  if (typeof input.wholeDomainRebuild !== 'boolean') {
    throw new Error('automatic diff wholeDomainRebuild must be a boolean');
  }
  const scopes = input.scopes.map(normalizeScope);
  const scopeIds = new Set();
  for (const scope of scopes) {
    if (scopeIds.has(scope.scopeId)) throw new Error('automatic L2 diff scopes contain duplicates');
    scopeIds.add(scope.scopeId);
  }
  const counts = normalizeCounts(input.counts, 'automatic diff counts');
  const summed = scopes.reduce((sum, scope) => {
    for (const field of COUNT_FIELDS) sum[field] += scope[field];
    return sum;
  }, Object.fromEntries(COUNT_FIELDS.map((field) => [field, 0])));
  for (const field of COUNT_FIELDS) {
    if (summed[field] !== counts[field]) {
      throw new Error(`automatic L2 diff ${field} does not match scope totals`);
    }
  }
  const provenance = assertProducerRowCountEvidence(input, counts, scopes);
  return freezeDeep({
    schemaVersion: 1,
    producer: provenance.producer,
    rowCountEvidence: provenance.rowCountEvidence,
    ...(provenance.rowLevelEvidence == null ? {} : { rowLevelEvidence: provenance.rowLevelEvidence }),
    sourceCheckedAt,
    snapshot: true,
    wholeDomainRebuild: input.wholeDomainRebuild,
    scopes,
    counts,
  });
}

function assertProducerRowCountEvidence(value, counts, scopes) {
  const producer = value.producer;
  const rowCountEvidence = value.rowCountEvidence;
  if (producer === 'read_only_sql_intent_v1') {
    throw new Error('automatic L2 diff rejects legacy SQL-intent row counts without real affected-row evidence');
  }
  if (typeof producer !== 'string' || !producer.trim()) {
    throw new Error('automatic L2 diff producer is required and must be registered');
  }
  if (typeof rowCountEvidence !== 'string' || !rowCountEvidence.trim()) {
    throw new Error('automatic L2 diff rowCountEvidence is required for producer verification');
  }
  const definition = VERIFIED_ROW_COUNT_PRODUCER_DEFINITIONS.get(producer);
  if (!definition) {
    throw new Error(`automatic L2 diff producer is not registered/verified: ${producer}`);
  }
  if (rowCountEvidence !== definition.rowCountEvidence) {
    throw new Error(`automatic L2 diff rowCountEvidence is not trustworthy for producer ${producer}`);
  }
  const hasNonZeroMutation = MUTATION_COUNT_FIELDS.some((field) => counts[field] !== 0);
  if (hasNonZeroMutation && !definition.allowsNonZero) {
    throw new Error('automatic L2 diff cannot claim non-zero rows without a verified structured row-level producer');
  }
  const rowLevelEvidence = definition.requiresRowLevelEvidence
    ? normalizeRowLevelEvidence(value.rowLevelEvidence, scopes)
    : null;
  return Object.freeze({
    producer,
    rowCountEvidence,
    rowLevelEvidence,
  });
}

function normalizeRowLevelEvidence(value, diffScopes) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.schemaVersion !== 1 || value.completeSnapshot !== true
      || !Array.isArray(value.scopes) || value.scopes.length === 0) {
    throw new Error('automatic L2 structured row-level evidence is incomplete');
  }
  const scopes = value.scopes.map((scope) => {
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
      throw new Error('automatic L2 structured row-level evidence scope is invalid');
    }
    const keyColumns = normalizeEvidenceColumns(scope.keyColumns, 'structured row-level keyColumns');
    const compareColumns = normalizeEvidenceColumns(scope.compareColumns, 'structured row-level compareColumns');
    const databaseRole = requireText(scope.databaseRole, 'structured row-level databaseRole');
    const table = requireText(scope.table, 'structured row-level table');
    const fieldGroup = requireText(scope.fieldGroup, 'structured row-level fieldGroup');
    const logicalPredicateHash = scope.logicalPredicateHash == null
      ? null
      : requireHash(scope.logicalPredicateHash, 'structured row-level logicalPredicateHash');
    const candidateRowCount = nonNegativeInteger(scope.candidateRowCount, 'structured row-level candidateRowCount');
    const baselineRowCount = nonNegativeInteger(scope.baselineRowCount, 'structured row-level baselineRowCount');
    const candidateRowsSha256 = requireHash(scope.candidateRowsSha256, 'structured row-level candidateRowsSha256');
    const baselineRowsSha256 = requireHash(scope.baselineRowsSha256, 'structured row-level baselineRowsSha256');
    const mutationKind = requireText(scope.mutationKind, 'structured row-level mutationKind');
    if (!['entity', 'relationship'].includes(mutationKind)) {
      throw new Error('structured row-level mutationKind is unsupported');
    }
    return {
      scopeId: requireText(scope.scopeId, 'structured row-level scopeId'),
      databaseRole,
      table,
      fieldGroup,
      ...(logicalPredicateHash == null ? {} : { logicalPredicateHash }),
      keyColumns,
      compareColumns,
      mutationKind,
      candidateRowCount,
      baselineRowCount,
      candidateRowsSha256,
      baselineRowsSha256,
    };
  });
  const ids = new Set(scopes.map((scope) => scope.scopeId));
  if (ids.size !== scopes.length) throw new Error('automatic L2 structured row-level evidence scopes contain duplicates');
  if (!Array.isArray(diffScopes) || diffScopes.length !== scopes.length
      || diffScopes.some((scope) => !ids.has(scope.scopeId))) {
    throw new Error('automatic L2 structured row-level evidence scopes do not match the diff');
  }
  for (const scope of scopes) {
    const diffScope = diffScopes.find((candidate) => candidate.scopeId === scope.scopeId);
    if (!diffScope
        || scope.databaseRole !== diffScope.databaseRole
        || scope.table !== diffScope.table
        || scope.fieldGroup !== diffScope.fieldGroup
        || (scope.logicalPredicateHash ?? null) !== (diffScope.logicalPredicateHash ?? null)
        || !Array.isArray(diffScope.keyColumns)
        || !Array.isArray(diffScope.compareColumns)
        || typeof diffScope.mutationKind !== 'string'
        || JSON.stringify(scope.keyColumns) !== JSON.stringify(diffScope.keyColumns)
        || JSON.stringify(scope.compareColumns) !== JSON.stringify(diffScope.compareColumns)
        || scope.mutationKind !== diffScope.mutationKind) {
      throw new Error(`automatic L2 structured row-level evidence concrete scope does not match ${scope.scopeId}`);
    }
    if (scope.mutationKind === 'relationship' && diffScope.entityBaselineCount !== 0) {
      throw new Error(`automatic L2 structured row-level evidence mutation kind does not match ${scope.scopeId}`);
    }
    if (scope.mutationKind === 'entity' && diffScope.relationshipBaselineCount !== 0) {
      throw new Error(`automatic L2 structured row-level evidence mutation kind does not match ${scope.scopeId}`);
    }
    const expectedBaseline = scope.mutationKind === 'relationship'
      ? diffScope.relationshipBaselineCount
      : diffScope.entityBaselineCount;
    const expectedCandidate = expectedBaseline
      + diffScope.inserts
      - (scope.mutationKind === 'relationship' ? diffScope.relationshipDeletes : diffScope.softDisables);
    if (scope.baselineRowCount !== expectedBaseline || scope.candidateRowCount !== expectedCandidate) {
      throw new Error(`automatic L2 structured row-level evidence counts do not match ${scope.scopeId}`);
    }
  }
  return freezeDeep({ schemaVersion: 1, completeSnapshot: true, scopes });
}

function normalizeEvidenceColumns(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  const columns = value.map((column) => {
    const normalized = requireText(column, `${label} column`);
    if (!SAFE_COLUMN_NAME.test(normalized)) throw new Error(`${label} column must be a safe identifier`);
    return normalized;
  });
  if (new Set(columns).size !== columns.length) throw new Error(`${label} contains duplicates`);
  return columns;
}

function freezeDeep(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeDeep(child, seen);
  return Object.freeze(value);
}

// Normalize caller-owned evidence before validation so accessors, mutable
// nested values, and shared array references cannot change the decision after
// the gate has inspected them.
function snapshotDataValue(value, label, ancestors = new WeakSet()) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite number`);
    return value;
  }
  if (typeof value !== 'object') throw new Error(`${label} contains an unsupported value`);
  if (ancestors.has(value)) throw new Error(`${label} contains a cyclic value`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      let descriptors;
      try {
        descriptors = Object.getOwnPropertyDescriptors(value);
      } catch (error) {
        throw new Error(`${label} must expose stable own data properties`, { cause: error });
      }
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')
          || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
        throw new Error(`${label} array length must be a stable data property`);
      }
      const result = [];
      result.length = lengthDescriptor.value;
      for (const key of Object.keys(descriptors).sort(compareUtf8)) {
        if (key === 'length') continue;
        const descriptor = descriptors[key];
        if (!Object.hasOwn(descriptor, 'value')) {
          throw new Error(`${label}.${key} must be a data property`);
        }
        if (!descriptor.enumerable) continue;
        Object.defineProperty(result, key, {
          value: snapshotDataValue(descriptor.value, `${label}[${key}]`, ancestors),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    }
    let descriptors;
    try {
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch (error) {
      throw new Error(`${label} must expose stable own data properties`, { cause: error });
    }
    let prototype;
    try {
      prototype = Object.getPrototypeOf(value);
    } catch (error) {
      throw new Error(`${label} must expose a stable prototype`, { cause: error });
    }
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} contains a non-plain object`);
    }
    const result = {};
    for (const key of Object.keys(descriptors).sort(compareUtf8)) {
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, 'value')) {
        throw new Error(`${label}.${key} must be a data property`);
      }
      if (!descriptor.enumerable) continue;
      Object.defineProperty(result, key, {
        value: snapshotDataValue(descriptor.value, `${label}.${key}`, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function normalizeScope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('automatic diff scope is invalid');
  const scopeId = requireText(value.scopeId, 'automatic diff scopeId');
  const databaseRole = requireText(value.databaseRole, 'automatic diff scope databaseRole');
  const table = requireText(value.table, 'automatic diff scope table');
  const fieldGroup = requireText(value.fieldGroup, 'automatic diff scope fieldGroup');
  const logicalPredicateHash = value.logicalPredicateHash == null
    ? null
    : requireHash(value.logicalPredicateHash, 'automatic diff scope logicalPredicateHash');
  const keyColumns = value.keyColumns == null
    ? null
    : normalizeEvidenceColumns(value.keyColumns, 'automatic diff scope keyColumns');
  const compareColumns = value.compareColumns == null
    ? null
    : normalizeEvidenceColumns(value.compareColumns, 'automatic diff scope compareColumns');
  const mutationKind = value.mutationKind == null ? null : requireText(value.mutationKind, 'automatic diff scope mutationKind');
  if (mutationKind != null && !['entity', 'relationship'].includes(mutationKind)) {
    throw new Error('automatic diff scope mutationKind is unsupported');
  }
  const hasRowLevelMetadata = keyColumns != null || compareColumns != null || mutationKind != null;
  if (hasRowLevelMetadata
      && (keyColumns == null || compareColumns == null || mutationKind == null)) {
    throw new Error('automatic diff scope row-level metadata is incomplete');
  }
  if (keyColumns != null && keyColumns.some((column) => !compareColumns.includes(column))) {
    throw new Error('automatic diff scope keyColumns must be included in compareColumns');
  }
  const scope = {
    scopeId,
    databaseRole,
    table,
    fieldGroup,
    ...(logicalPredicateHash == null ? {} : { logicalPredicateHash }),
    ...(keyColumns == null ? {} : { keyColumns, compareColumns, mutationKind }),
  };
  for (const field of COUNT_FIELDS) scope[field] = nonNegativeInteger(value[field], `automatic diff ${field}`);
  for (const [countField, keyField] of KEY_FIELDS) {
    if (!Array.isArray(value[keyField])) throw new Error(`automatic diff ${keyField} is required`);
    const keys = value[keyField].map((key) => requireText(key, `automatic diff ${keyField} key`));
    const sorted = [...keys].sort(compareUtf8);
    if (JSON.stringify(keys) !== JSON.stringify(sorted) || new Set(keys).size !== keys.length
        || keys.length !== scope[countField]) {
      throw new Error(`automatic diff ${keyField} is not a sorted unique count-matching key list`);
    }
    scope[keyField] = keys;
  }
  return scope;
}

function normalizeCounts(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} are required`);
  return Object.fromEntries(COUNT_FIELDS.map((field) => [field, nonNegativeInteger(value[field], `${label}.${field}`)]));
}

function normalizeOwnedTables(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('automatic L2 owned table scopes are required');
  const seen = new Set();
  return value.map((entry) => {
    const databaseRole = requireText(entry?.databaseRole, 'owned table databaseRole');
    const table = requireText(entry?.table, 'owned table table');
    const fieldGroup = requireText(entry?.fieldGroup ?? 'all_columns', 'owned table fieldGroup');
    const logicalPredicateHash = entry?.logicalPredicateHash == null ? null : requireHash(entry.logicalPredicateHash, 'owned table logicalPredicateHash');
    const key = `${databaseRole}:${table}:${fieldGroup}:${logicalPredicateHash ?? ''}`;
    if (seen.has(key)) throw new Error('automatic L2 owned table scopes contain duplicates');
    seen.add(key);
    return { databaseRole, table, fieldGroup, ...(logicalPredicateHash == null ? {} : { logicalPredicateHash }) };
  }).sort(compareScope);
}

function assertSameScopes(policyScopes, ownedScopes) {
  const left = JSON.stringify(policyScopes);
  const right = JSON.stringify(ownedScopes);
  if (left !== right) throw new Error('automatic L2 owned table scope does not match policy ceiling');
}

function assertSameDiffScopes(policyScopes, diffScopes) {
  const normalize = (scopes) => scopes.map((scope) => ({
    databaseRole: scope.databaseRole,
    table: scope.table,
    fieldGroup: scope.fieldGroup,
    ...(scope.logicalPredicateHash == null ? {} : { logicalPredicateHash: scope.logicalPredicateHash }),
  })).sort(compareScope);
  if (JSON.stringify(normalize(policyScopes)) !== JSON.stringify(normalize(diffScopes))) {
    throw new Error('automatic L2 diff scope does not exactly match the policy ceiling');
  }
}

function assertSharedNpcsScopesAreVerifiable(scopes) {
  for (const scope of scopes) {
    if (scope.table !== 'npcs') continue;
    const definition = getVerifiedSharedNpcsScopeDefinition(scope);
    if (!definition || definition.table !== 'npcs'
        || definition.fieldGroup !== scope.fieldGroup
        || definition.logicalPredicateHash !== scope.logicalPredicateHash
        || !Array.isArray(definition.sourceColumns) || definition.sourceColumns.length === 0
        || !definition.predicate || typeof definition.predicate !== 'object') {
      throw new Error('automatic shared npcs scope requires a registered logical predicate definition');
    }
  }
}

function assertStructuredDiffScopeContracts(domainId, diff) {
  if (diff.producer !== 'structured_source_rows_v1') return;
  if (typeof domainId !== 'string' || !domainId.trim()) {
    throw new Error('automatic structured L2 diff requires a policy domainId for schema contract binding');
  }
  for (const scope of diff.scopes) {
    const definition = getVerifiedStructuredScopeDefinition(domainId, scope);
    if (!definition) {
      throw new Error(`automatic structured L2 diff has no registered schema contract for ${domainId}/${scope.table}`);
    }
    if (!sameColumnList(scope.keyColumns, definition.keyColumns)
        || !sameColumnList(scope.compareColumns, definition.compareColumns)
        || scope.mutationKind !== definition.mutationKind) {
      throw new Error(`automatic structured L2 diff scope does not match the registered schema contract for ${domainId}/${scope.table}`);
    }
  }
}

function allowed(baseline, ratioValue, absolute) {
  return Math.min(Math.floor(baseline * ratioValue), absolute);
}

function compareScope(left, right) {
  return `${left.databaseRole}:${left.table}:${left.fieldGroup}:${left.logicalPredicateHash ?? ''}`
    .localeCompare(`${right.databaseRole}:${right.table}:${right.fieldGroup}:${right.logicalPredicateHash ?? ''}`);
}

function structuredScopeDefinitionKey(domainId, scope) {
  return `${domainId}:${scope.databaseRole ?? ''}:${scope.table ?? ''}:${scope.fieldGroup ?? ''}:${scope.logicalPredicateHash ?? ''}`;
}

function sameColumnList(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((column, index) => column === right[index]);
}

function compareUtf8(left, right) {
  return Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8'));
}

function parseTimestamp(value, label) {
  const time = Date.parse(requireText(value, label));
  if (!Number.isFinite(time)) throw new Error(`${label} must be an ISO timestamp`);
  return time;
}

function nonNegativeInteger(value, label) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function ratio(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error(`${label} must be between 0 and 1`);
  return number;
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}
