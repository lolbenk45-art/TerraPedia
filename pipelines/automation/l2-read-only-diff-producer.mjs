import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertRepositoryOrdinaryFile } from '../lib/private-repository-path.mjs';

import {
  buildIndependentArmorSetRows,
  buildIndependentBuffRows,
  buildIndependentNpcRows,
  buildIndependentProjectileRows,
  runIndependentEntityImport,
} from '../import/import-independent-entities-to-db.mjs';
import {
  buildStandardizedItemRows,
  runBaseItemsImport,
} from '../import/import-standardized-to-db.mjs';
import {
  buildAudioAssetRows,
  buildAudioLinkRows,
  validateAudioMetadata,
  runAudioAssetImport,
} from '../import/import-wiki-audio-assets-to-db.mjs';
import { buildBossImportProjection } from '../import/import-wiki-bosses-to-db.mjs';
import {
  buildShimmerImportProjection,
  loadVerifiedShimmerImportBundle,
} from '../import/import-wiki-shimmer-to-db.mjs';
import {
  getVerifiedSharedNpcsScopeDefinition,
  getVerifiedStructuredScopeDefinition,
} from './l2-automatic-ceiling.mjs';

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const READ_PREFIX = /^(SELECT|SHOW|DESCRIBE|EXPLAIN)\b/i;
const SESSION_PREFIX = /^SET\s+NAMES\b/i;
// The recorder must never hand a statement containing a separator to the
// underlying connection.  A conservative literal check is intentional: even
// a separator in a quoted/commented fragment is unsafe to classify from a
// prefix alone.
const SQL_SEPARATOR_PATTERN = /;/;
// Importers currently need only the simple one-token SET NAMES form.  The
// optional quote form keeps compatibility with MySQL's accepted syntax while
// rejecting compound clauses such as COLLATE or a second assignment.
const SIMPLE_SESSION_STATEMENT = /^SET\s+NAMES\s+(?:[A-Za-z0-9_]+|'[A-Za-z0-9_]+'|"[A-Za-z0-9_]+")$/i;
const MUTATION_PATTERN = /^(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?([a-z][a-z0-9_]*)`?/i;
export const STRUCTURED_L2_PRODUCER = 'structured_source_rows_v1';
export const STRUCTURED_L2_ROW_COUNT_EVIDENCE = 'verified_structured_row_diff';

const STRUCTURED_DOMAIN_TABLES = Object.freeze({
  items: Object.freeze(['items']),
  npcs: Object.freeze(['npcs']),
  bosses: Object.freeze(['boss_groups', 'npcs']),
  projectiles: Object.freeze(['projectiles']),
  armor_sets: Object.freeze(['armor_set_items', 'armor_sets']),
  buffs: Object.freeze(['buff_source_items', 'buffs']),
  audio: Object.freeze(['audio_asset_links', 'audio_assets']),
  shimmer: Object.freeze([
    'shimmer_decraft_rules',
    'shimmer_entity_transforms',
    'shimmer_item_transforms',
    'shimmer_npc_transforms',
  ]),
});

const MUTATION_KINDS = new Set(['entity', 'relationship']);
const SAFE_COLUMN_NAME = /^[a-z][a-z0-9_]*$/;

/**
 * Derive automatic L2 evidence by running the existing importer against a
 * read-only SQL-intent recorder. SELECTs are delegated to the locked source
 * connection. When a frozen bundle carries the reviewed structured candidate
 * row contract, the producer derives row-level changes without invoking an
 * importer or touching the connection. Bundles without that contract retain
 * the conservative SQL-intent path and can only prove zero mutations.
 */
export async function buildReadOnlyAutomaticL2Diff({
  repoRoot = process.cwd(),
  connection,
  bundle,
  current,
  executionTime = new Date().toISOString(),
} = {}, {
  runBaseItemsImportImpl = runBaseItemsImport,
  runIndependentEntityImportImpl = runIndependentEntityImport,
  runAudioAssetImportImpl = runAudioAssetImport,
} = {}) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  const normalizedBundle = normalizeBundle(bundle);
  const hasImporterStructuredProducer = [
    runBaseItemsImportImpl === runBaseItemsImport,
    runIndependentEntityImportImpl === runIndependentEntityImport,
    runAudioAssetImportImpl === runAudioAssetImport,
  ].every(Boolean) && ['items', 'npcs', 'projectiles', 'armor_sets', 'buffs', 'audio', 'bosses', 'shimmer']
    .includes(normalizedBundle.domainId);
  if (hasImporterStructuredProducer) {
    // Validate the physical scope and predicate contract before reading the
    // frozen source, just as explicit structured candidates are validated at
    // their boundary.
    normalizeStructuredOwnedTables(normalizedBundle.ownedTables, normalizedBundle.domainId);
  } else if (!hasStructuredCandidateDeclaration(normalizedBundle.importPlan)) {
    // Preserve the legacy fail-closed ordering for an unstructured bundle:
    // an unprovable scoped claim is rejected before filesystem or connection
    // work. Source-embedded structured candidates are validated after the
    // frozen source bytes are authenticated.
    assertTableOnlyRecorderCanProveScopes(normalizedBundle.ownedTables);
  }
  const sourceCheckedAt = requireTimestamp(normalizedBundle.importPlan.sourceCheckedAt, 'importPlan.sourceCheckedAt');
  const checkedAt = Date.parse(sourceCheckedAt);
  const executionAt = Date.parse(requireTimestamp(executionTime, 'executionTime'));
  if (checkedAt > executionAt) throw new Error('automatic diff sourceCheckedAt cannot be in the future');
  const frozenSource = readFrozenSource(root, normalizedBundle.source);
  const sourcePayload = frozenSource.payload;

  const structuredCandidate = resolveStructuredCandidate({
    bundle: normalizedBundle,
    sourcePayload,
  });
  if (structuredCandidate != null) {
    return buildStructuredRowLevelL2Diff({
      domainId: normalizedBundle.domainId,
      sourceCheckedAt,
      executionTime,
      ownedTables: normalizedBundle.ownedTables,
      candidate: structuredCandidate,
      current,
    });
  }

  const importerCandidate = hasImporterStructuredProducer
    ? buildImporterStructuredCandidate({
        domainId: normalizedBundle.domainId,
        ownedTables: normalizedBundle.ownedTables,
        sourcePayload,
        current,
        repoRoot: root,
      })
    : null;
  if (importerCandidate != null) {
    return buildStructuredRowLevelL2Diff({
      domainId: normalizedBundle.domainId,
      sourceCheckedAt,
      executionTime,
      ownedTables: normalizedBundle.ownedTables,
      candidate: importerCandidate,
      current,
    });
  }

  // The legacy recorder is intentionally kept only for bundles that do not
  // declare a structured candidate. It cannot attest a scoped table or any
  // non-zero mutation, so reject those claims before importer work.
  assertTableOnlyRecorderCanProveScopes(normalizedBundle.ownedTables);
  const recorder = createReadOnlyMutationRecorder({ connection, ownedTables: normalizedBundle.ownedTables });

  let summary;
  if (normalizedBundle.domainId === 'items') {
    const records = sourcePayload?.datasets?.items?.records;
    if (!Array.isArray(records)) throw new Error('frozen Items source is missing its dataset records');
    summary = await runBaseItemsImportImpl({ connection: recorder, records });
  } else if (['projectiles', 'buffs', 'armor_sets'].includes(normalizedBundle.domainId)) {
    const domainDataset = sourcePayload?.datasets?.[normalizedBundle.domainId];
    const itemDataset = sourcePayload?.datasets?.items;
    if (!Array.isArray(domainDataset?.records) || !Array.isArray(itemDataset?.records)) {
      throw new Error(`frozen ${normalizedBundle.domainId} source is missing exact domain and Item dependency datasets`);
    }
    summary = await runIndependentEntityImportImpl({
      apply: 'true',
      entity: normalizedBundle.domainId,
    }, {
      connection: recorder,
      transactionOwner: 'caller',
      datasets: sourcePayload.datasets,
    });
  } else if (normalizedBundle.domainId === 'audio') {
    summary = await runAudioAssetImportImpl({
      apply: true,
      inputJsonPath: frozenSource.absolutePath,
      reportPath: null,
      db: { database: 'terria_v1_local' },
    }, {
      connection: recorder,
      transactionOwner: 'caller',
    });
  } else {
    throw new Error(`read-only automatic L2 diff producer is unavailable for ${normalizedBundle.domainId}`);
  }
  assertSummaryHealthy(summary);
  return buildDiff({
    ownedTables: normalizedBundle.ownedTables,
    current,
    mutations: recorder.mutations,
    sourceCheckedAt,
  });
}

function hasStructuredCandidateDeclaration(importPlan) {
  return Object.hasOwn(importPlan, 'structuredCandidate')
    || Object.hasOwn(importPlan, 'structuredRows')
    || Object.hasOwn(importPlan, 'candidateTables');
}

function normalizeBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    throw new Error('automatic diff bundle is required');
  }
  const input = copyDataProperties(bundle, 'automatic diff bundle');
  const domainId = requireText(input.domainId, 'bundle.domainId');
  const sourceInput = input.source;
  const importPlanInput = input.importPlan;
  const ownedTablesInput = input.ownedTables;
  if (!sourceInput || typeof sourceInput !== 'object' || Array.isArray(sourceInput)) {
    throw new Error('automatic diff bundle source is required');
  }
  if (!importPlanInput || typeof importPlanInput !== 'object' || Array.isArray(importPlanInput)) {
    throw new Error('automatic diff bundle importPlan is required');
  }
  if (!Array.isArray(ownedTablesInput) || ownedTablesInput.length === 0) {
    throw new Error('automatic diff bundle owned tables are required');
  }
  const sourceData = normalizeDataValue(sourceInput, 'bundle.source');
  const importPlan = normalizeDataValue(importPlanInput, 'bundle.importPlan');
  const ownedTablesData = normalizeDataValue(ownedTablesInput, 'bundle.ownedTables');
  const source = {
    path: requireConfinedReportsPath(sourceData?.path, 'bundle.source.path'),
    sha256: requireHash(sourceData?.sha256, 'bundle.source.sha256'),
  };
  if (!importPlan || typeof importPlan !== 'object' || Array.isArray(importPlan)) {
    throw new Error('automatic diff bundle importPlan is required');
  }
  if (!Array.isArray(ownedTablesData) || ownedTablesData.length === 0) {
    throw new Error('automatic diff bundle owned tables are required');
  }
  const seen = new Set();
  const ownedTables = ownedTablesData.map((scope) => {
    const normalized = {
      databaseRole: requireText(scope?.databaseRole, 'bundle owned table databaseRole'),
      table: requireText(scope?.table, 'bundle owned table table'),
      fieldGroup: requireText(scope?.fieldGroup, 'bundle owned table fieldGroup'),
      ...(scope?.logicalPredicateHash == null
        ? {}
        : { logicalPredicateHash: requireHash(scope.logicalPredicateHash, 'bundle owned table logicalPredicateHash') }),
    };
    const key = scopeKey(normalized);
    if (seen.has(key)) throw new Error('automatic diff bundle owned tables contain duplicates');
    seen.add(key);
    return normalized;
  });
  return deepFreeze({ domainId, source, importPlan, ownedTables });
}

export function assertTableOnlyRecorderCanProveScopes(ownedTables) {
  // The SQL-intent recorder extracts only a physical table name. Until a
  // structured producer proves database role, selected columns, and predicate,
  // it cannot safely attest a narrower automatic ownership claim.
  if (ownedTables.some((scope) => scope.fieldGroup !== 'all_columns' || scope.logicalPredicateHash != null)) {
    throw new Error('automatic diff SQL intent recorder cannot prove scoped ownership without a registered structured SQL target producer');
  }
}

/**
 * Build non-zero L2 evidence from a frozen, canonical candidate row snapshot.
 * The caller must supply every owned table, its logical identity columns, and
 * the columns whose values the real importer is allowed to change. This is a
 * pure operation: it never receives or uses a database connection.
 */
export function buildStructuredRowLevelL2Diff({
  domainId,
  sourceCheckedAt,
  executionTime = null,
  ownedTables,
  candidate,
  candidateTables = undefined,
  producer = STRUCTURED_L2_PRODUCER,
  completeSnapshot = true,
  current,
} = {}) {
  const domain = requireStructuredDomain(domainId);
  const checkedAt = requireTimestamp(sourceCheckedAt, 'structured diff sourceCheckedAt');
  if (executionTime != null && Date.parse(checkedAt) > Date.parse(requireTimestamp(executionTime, 'structured diff executionTime'))) {
    throw new Error('structured diff sourceCheckedAt cannot be in the future');
  }
  const scopes = normalizeStructuredOwnedTables(ownedTables, domain);
  const normalizedCandidate = normalizeStructuredCandidate(
    candidate ?? {
      schemaVersion: 1,
      producer,
      completeSnapshot,
      tables: candidateTables,
    },
    scopes,
    domain,
  );
  const currentTables = normalizeCurrentTables(current, scopes);

  const scopeDiffs = scopes.map((scope) => {
    const table = normalizedCandidate.tablesByScope.get(scopeIdentity(scope));
    const baselineRows = filterRowsForScope(currentTables[scope.table], scope, 'current snapshot');
    const candidateRows = filterRowsForScope(table.rows, scope, 'structured candidate');
    return buildStructuredScopeDiff({
      scope,
      table,
      baselineRows,
      candidateRows,
      completeSnapshot: normalizedCandidate.completeSnapshot,
    });
  });
  const counts = sumScopeCounts(scopeDiffs);
  const rowLevelEvidence = {
    schemaVersion: 1,
    completeSnapshot: true,
    scopes: scopeDiffs.map((scope) => ({
      scopeId: scope.scopeId,
      databaseRole: scope.databaseRole,
      table: scope.table,
      fieldGroup: scope.fieldGroup,
      ...(scope.logicalPredicateHash == null ? {} : { logicalPredicateHash: scope.logicalPredicateHash }),
      keyColumns: scope.keyColumns,
      compareColumns: scope.compareColumns,
      mutationKind: scope.mutationKind,
      candidateRowCount: scope.candidateRowCount,
      baselineRowCount: scope.baselineRowCount,
      candidateRowsSha256: scope.candidateRowsSha256,
      baselineRowsSha256: scope.baselineRowsSha256,
    })),
  };
  // Keep the concrete row-level contract on each public diff scope as well as
  // in the evidence envelope, so the ceiling can bind both representations.
  const publicScopes = scopeDiffs.map(({ candidateRowCount, baselineRowCount,
    candidateRowsSha256, baselineRowsSha256, ...scope }) => scope);
  return deepFreeze({
    schemaVersion: 1,
    producer: STRUCTURED_L2_PRODUCER,
    rowCountEvidence: STRUCTURED_L2_ROW_COUNT_EVIDENCE,
    rowLevelEvidence,
    sourceCheckedAt: checkedAt,
    snapshot: true,
    wholeDomainRebuild: false,
    scopes: publicScopes,
    counts,
  });
}

// Compatibility aliases for adapters that describe this step as a planner
// rather than a diff builder. They point to the same reviewed implementation.
export const buildStructuredAutomaticL2Diff = buildStructuredRowLevelL2Diff;
export const buildAutomaticStructuredL2Diff = buildStructuredRowLevelL2Diff;

function resolveStructuredCandidate({ bundle, sourcePayload }) {
  const importPlan = bundle?.importPlan;
  if (importPlan && Object.hasOwn(importPlan, 'structuredCandidate')) return importPlan.structuredCandidate;
  if (importPlan && Object.hasOwn(importPlan, 'structuredRows')) {
    return {
      schemaVersion: importPlan.structuredSchemaVersion ?? 1,
      producer: importPlan.structuredProducer ?? null,
      completeSnapshot: importPlan.structuredCompleteSnapshot ?? true,
      tables: importPlan.structuredRows,
    };
  }
  if (importPlan && Object.hasOwn(importPlan, 'candidateTables')) {
    return {
      schemaVersion: importPlan.structuredSchemaVersion ?? 1,
      producer: importPlan.structuredProducer ?? null,
      completeSnapshot: importPlan.structuredCompleteSnapshot ?? true,
      tables: importPlan.candidateTables,
    };
  }
  if (sourcePayload && typeof sourcePayload === 'object' && Object.hasOwn(sourcePayload, 'structuredCandidate')) {
    return sourcePayload.structuredCandidate;
  }
  return null;
}

/**
 * Build the row snapshot that the real importer would submit without opening
 * a database connection.  These adapters intentionally share the importer's
 * pure projection helpers and only use the locked current snapshot to resolve
 * identities that are not present in the source (notably AUTO_INCREMENT
 * parent IDs for child tables).
 */
function buildImporterStructuredCandidate({ domainId, ownedTables, sourcePayload, current, repoRoot }) {
  if (!['items', 'npcs', 'projectiles', 'armor_sets', 'buffs', 'audio', 'bosses', 'shimmer'].includes(domainId)) return null;
  const currentTables = current?.tables && typeof current.tables === 'object' && !Array.isArray(current.tables)
    ? current.tables
    : {};
  const dependencyTables = current?.dependencyTables
    && typeof current.dependencyTables === 'object'
    && !Array.isArray(current.dependencyTables)
    ? current.dependencyTables
    : {};
  const dependency = (name) => {
    if (!Array.isArray(dependencyTables[name])) {
      throw new Error(`frozen ${domainId} projection requires a locked ${name} dependency snapshot`);
    }
    return dependencyTables[name];
  };
  const records = (name) => {
    const value = sourcePayload?.datasets?.[name]?.records;
    if (!Array.isArray(value)) throw new Error(`frozen ${domainId} source is missing ${name} dataset records`);
    return value;
  };
  const table = (tableName, rows) => buildImporterCandidateTable(domainId, ownedTables, tableName, rows);

  if (domainId === 'bosses') {
    const sourceRecords = Array.isArray(sourcePayload?.records)
      ? sourcePayload.records
      : records('bosses');
    const currentBossGroups = Array.isArray(currentTables.boss_groups) ? currentTables.boss_groups : [];
    const currentNpcs = Array.isArray(currentTables.npcs) ? currentTables.npcs : [];
    const dependencyNpcs = dependency('npcs');
    const projection = buildBossImportProjection({
      records: sourceRecords,
      currentBossGroups,
      currentNpcs,
      npcRows: dependencyNpcs,
    });
    return importerCandidateEnvelope([
      table('boss_groups', mergeEntityProjectionRows(projection.groups, currentBossGroups, domainId, 'boss_groups')),
      table('npcs', mergeEntityProjectionRows(projection.members, currentNpcs, domainId, 'npcs', ownedTables.find((scope) => scope.table === 'npcs'))),
    ]);
  }

  if (domainId === 'items') {
    const projected = buildStandardizedItemRows(records('items'), {
      categoryRows: dependency('categories'),
      existingRows: currentTables.items,
    });
    return importerCandidateEnvelope([
      table('items', mergeEntityProjectionRows(projected, currentTables.items, domainId, 'items')),
    ]);
  }

  if (domainId === 'projectiles') {
    const projected = buildIndependentProjectileRows(records('projectiles'));
    return importerCandidateEnvelope([
      table('projectiles', mergeEntityProjectionRows(projected, currentTables.projectiles, domainId, 'projectiles')),
    ]);
  }

  if (domainId === 'npcs') {
    const sourceRecords = records('npcs').filter((record) => record?.flags?.boss !== true);
    const projected = buildIndependentNpcRows(sourceRecords, {
      itemRows: dependency('items'),
      sourceItemRows: records('items'),
      categoryRows: dependency('categories'),
      npcZhRows: dependency('npcZhMap'),
      existingRows: currentTables.npcs,
    });
    return importerCandidateEnvelope([
      table('npcs', mergeEntityProjectionRows(
        projected,
        currentTables.npcs,
        domainId,
        'npcs',
        ownedTables.find((scope) => scope.table === 'npcs'),
      )),
    ]);
  }

  if (domainId === 'armor_sets') {
    const sourceRecords = records('armor_sets');
    const parentRows = buildIndependentArmorSetRows(sourceRecords);
    const itemContext = buildSourceItemContext(sourcePayload, {
      ...currentTables,
      items: dependency('items'),
    });
    const relationRows = buildReconcilingRelationRows({
      domainId,
      parentTable: 'armor_sets',
      relationTable: 'armor_set_items',
      parentRows,
      parentKeyColumns: ['source_key'],
      parentIdColumn: 'armor_set_id',
      sourceRecords,
      currentTables,
      buildRows: (record, index, parentId, baselineRows) => {
        const variants = Array.isArray(record?.sets) ? record.sets : [];
        const rows = [];
        for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
          const setArray = Array.isArray(variants[variantIndex]) ? variants[variantIndex] : [];
          for (let partIndex = 0; partIndex < setArray.length; partIndex += 1) {
            const item = resolveSourceItemReference(setArray[partIndex], itemContext, baselineRows, parentId, 'armor_set_id');
            rows.push({
              armor_set_id: parentId,
              set_variant_index: variantIndex,
              part_index: partIndex,
              source_item_id: item.sourceItemId,
              item_id: item.itemId,
              item_internal_name: item.internalName,
              item_name: item.itemName,
            });
          }
        }
        return rows;
      },
    });
    return importerCandidateEnvelope([
      table('armor_set_items', relationRows),
      table('armor_sets', mergeEntityProjectionRows(parentRows, currentTables.armor_sets, domainId, 'armor_sets')),
    ]);
  }

  if (domainId === 'buffs') {
    const sourceRecords = records('buffs');
    const parentRows = buildIndependentBuffRows(sourceRecords);
    const itemContext = buildSourceItemContext(sourcePayload, {
      ...currentTables,
      items: dependency('items'),
    });
    const relationRows = buildReconcilingRelationRows({
      domainId,
      parentTable: 'buffs',
      relationTable: 'buff_source_items',
      parentRows,
      parentKeyColumns: ['source_id'],
      parentIdColumn: 'buff_id',
      sourceRecords,
      currentTables,
      buildRows: (record, index, parentId, baselineRows) => {
        const sourceItems = Array.isArray(record?.sourceItems) ? record.sourceItems : [];
        return sourceItems.flatMap((sourceItem, sortOrder) => {
          const item = resolveSourceItemReference(sourceItem, itemContext, baselineRows, parentId, 'buff_id');
          if (item.itemId == null || item.internalName == null) return [];
          return [{
            buff_id: parentId,
            source_item_id: item.sourceItemId,
            source_item_internal_name: item.internalName,
            source_item_name: item.itemName,
            item_id: item.itemId,
            buff_time: toNullableInteger(sourceItem?.buffTime),
            sort_order: sortOrder,
          }];
        });
      },
    });
    return importerCandidateEnvelope([
      table('buff_source_items', relationRows),
      table('buffs', mergeEntityProjectionRows(parentRows, currentTables.buffs, domainId, 'buffs')),
    ]);
  }

  if (domainId === 'audio') {
    const assets = sourcePayload?.assets;
    if (!Array.isArray(assets)) throw new Error('frozen audio source is missing its assets array');
    const validation = validateAudioMetadata(sourcePayload);
    if (validation.failures.length > 0) {
      throw new Error(`frozen audio source validation failed: ${validation.failures[0].reason}`);
    }
    const itemRows = dependency('items');
    const npcRows = dependency('npcs');
    const bgmDisplayNameRows = dependency('audioBgmDisplayNames');
    const projectedAssets = buildAudioAssetRows(assets, { itemRows, npcRows, bgmDisplayNameRows, reportPath: null });
    const assetRows = projectedAssets.map((row) => ({
      ...toSnakeCaseRow(row),
      deleted: 0,
    }));
    const linkRows = buildAudioLinkRows(assets, itemRows);
    const assetIds = new Map();
    for (const row of Array.isArray(currentTables.audio_assets) ? currentTables.audio_assets : []) {
      const key = identityKey(row, ['asset_id'], 'current audio asset');
      const id = positiveInteger(row?.id);
      if (id == null) throw new Error('current audio asset is missing its stable id');
      if (assetIds.has(key)) throw new Error(`current audio asset identity is duplicated: ${key}`);
      assetIds.set(key, id);
    }
    const baselineLinks = Array.isArray(currentTables.audio_asset_links) ? currentTables.audio_asset_links : [];
    const projectedLinks = linkRows.map((row, index) => {
      const parentKey = identityKey({ asset_id: row.assetId }, ['asset_id'], `audio source asset ${index}`);
      const parentId = assetIds.get(parentKey);
      if (parentId == null) {
        throw new Error(`audio asset link requires an existing parent ID: ${row.assetId}`);
      }
      return {
        audio_asset_id: parentId,
        entity_type: row.entityType,
        entity_id: row.entityId,
        source_key: row.sourceKey,
        relation_type: row.relationType,
        match_status: row.matchStatus,
        match_reason: row.matchReason,
        sort_order: row.sortOrder,
        deleted: 0,
      };
    });
    return importerCandidateEnvelope([
      table('audio_asset_links', mergeRelationProjectionRows(projectedLinks, baselineLinks, ['audio_asset_id', 'entity_type', 'source_key', 'relation_type'])),
      table('audio_assets', mergeEntityProjectionRows(assetRows, currentTables.audio_assets, domainId, 'audio_assets')),
    ]);
  }

  const shimmerSource = sourcePayload;
  let shimmerBundle;
  try {
    shimmerBundle = loadVerifiedShimmerImportBundle({
      bundleManifestPath: shimmerSource?.manifestPath,
      repoRoot,
    });
  } catch (error) {
    throw new Error(`verified shimmer generation is required: ${error?.message ?? String(error)}`);
  }
  if (shimmerBundle.generationId !== shimmerSource?.generationId
      || shimmerBundle.manifestSha256 !== shimmerSource?.manifestSha256
      || shimmerBundle.dataBundleSha256 !== shimmerSource?.dataBundleSha256) {
    throw new Error('frozen Shimmer source does not match the verified generation');
  }
  const shimmerProjection = buildShimmerImportProjection({ bundle: shimmerBundle });
  return importerCandidateEnvelope(STRUCTURED_DOMAIN_TABLES.shimmer.map((tableName) => table(
    tableName,
    (shimmerProjection.shimmerTables[tableName] ?? []).map(toSnakeCaseRow),
  )));
}

function importerCandidateEnvelope(tables) {
  return {
    schemaVersion: 1,
    producer: STRUCTURED_L2_PRODUCER,
    completeSnapshot: true,
    tables,
  };
}

function buildImporterCandidateTable(domainId, ownedTables, tableName, rows) {
  const scope = ownedTables.find((entry) => entry?.table === tableName);
  if (!scope) throw new Error(`structured automatic L2 source projection is missing owned scope for ${domainId}/${tableName}`);
  const contract = getVerifiedStructuredScopeDefinition(domainId, scope);
  if (!contract) throw new Error(`structured automatic L2 source projection has no schema contract for ${domainId}/${tableName}`);
  return {
    ...scope,
    keyColumns: [...contract.keyColumns],
    compareColumns: [...contract.compareColumns],
    numericColumns: [...contract.numericColumns],
    jsonColumns: [...contract.jsonColumns],
    mutationKind: contract.mutationKind,
    rows: Array.isArray(rows) ? rows : [],
  };
}

function mergeEntityProjectionRows(projectedRows, baselineRows, domainId, tableName, scope = null) {
  const projected = Array.isArray(projectedRows) ? projectedRows : [];
  const baseline = Array.isArray(baselineRows) ? baselineRows : [];
  const contract = getVerifiedStructuredScopeDefinition(domainId, {
    databaseRole: 'local',
    table: tableName,
    fieldGroup: scope?.fieldGroup ?? 'all_columns',
    ...(scope?.logicalPredicateHash == null ? {} : { logicalPredicateHash: scope.logicalPredicateHash }),
  });
  if (!contract) throw new Error(`structured automatic L2 source projection has no schema contract for ${domainId}/${tableName}`);
  const projectedKeys = new Set(projected.map((row, index) => identityKey(row, contract.keyColumns, `projected ${tableName} row ${index}`)));
  return [
    ...projected,
    ...baseline.filter((row, index) => !projectedKeys.has(identityKey(row, contract.keyColumns, `current ${tableName} row ${index}`))),
  ];
}

function buildReconcilingRelationRows({
  domainId,
  parentTable,
  relationTable,
  parentRows,
  parentKeyColumns,
  parentIdColumn,
  sourceRecords,
  currentTables,
  buildRows,
}) {
  const parentDefinition = getVerifiedStructuredScopeDefinition(domainId, {
    databaseRole: 'local', table: parentTable, fieldGroup: 'all_columns',
  });
  const relationDefinition = getVerifiedStructuredScopeDefinition(domainId, {
    databaseRole: 'local', table: relationTable, fieldGroup: 'all_columns',
  });
  if (!parentDefinition || !relationDefinition?.parentIdentity) {
    throw new Error(`structured automatic L2 source projection has no parent identity contract for ${domainId}/${relationTable}`);
  }
  const currentParents = Array.isArray(currentTables[parentTable]) ? currentTables[parentTable] : [];
  const parentIds = new Map();
  for (const [index, row] of currentParents.entries()) {
    const key = identityKey(row, parentKeyColumns, `current ${parentTable} row ${index}`);
    const id = positiveInteger(row?.[relationDefinition.parentIdentity.idColumn]);
    if (id == null) throw new Error(`current ${parentTable} row ${index} is missing its stable parent ID`);
    if (parentIds.has(key)) throw new Error(`current ${parentTable} parent identity is duplicated: ${key}`);
    parentIds.set(key, id);
  }
  const baselineRows = Array.isArray(currentTables[relationTable]) ? currentTables[relationTable] : [];
  const knownParentIds = new Set(parentIds.values());
  for (const [index, row] of baselineRows.entries()) {
    const parentId = positiveInteger(row?.[relationDefinition.parentIdentity.foreignKeyColumn]);
    if (parentId == null || !knownParentIds.has(parentId)) {
      throw new Error(`current ${relationTable} row ${index} has an orphan or invalid parent ID`);
    }
  }
  const affectedParentIds = new Set();
  const projectedRows = [];
  for (const [index, record] of sourceRecords.entries()) {
    const parentRow = parentRows[index];
    const parentKey = identityKey(parentRow, parentKeyColumns, `projected ${parentTable} row ${index}`);
    const parentId = parentIds.get(parentKey);
    const rows = buildRows(record, index, parentId, baselineRows);
    if (rows.length > 0 && parentId == null) {
      throw new Error(`${relationTable} projection requires an existing ${parentTable} parent ID for ${parentKey}`);
    }
    if (parentId != null) affectedParentIds.add(String(parentId));
    projectedRows.push(...rows);
  }
  return [
    ...projectedRows,
    ...baselineRows.filter((row, index) => {
      const id = positiveInteger(row?.[relationDefinition.parentIdentity.foreignKeyColumn]);
      if (id == null) return true;
      return !affectedParentIds.has(String(id));
    }),
  ];
}

function buildSourceItemContext(sourcePayload, currentTables) {
  const sourceRecords = Array.isArray(sourcePayload?.datasets?.items?.records)
    ? sourcePayload.datasets.items.records
    : [];
  const sourceById = new Map();
  const sourceByInternalName = new Map();
  for (const [index, record] of sourceRecords.entries()) {
    const id = positiveInteger(record?.id);
    const internalName = nullableText(record?.internalName ?? record?.internal_name);
    if (id == null) continue;
    if (sourceById.has(id)) throw new Error(`source Items identity is duplicated: source_id=${id}`);
    if (internalName && sourceByInternalName.has(internalName)) {
      throw new Error(`source Items identity is duplicated: internal_name=${internalName}`);
    }
    const normalized = {
      internalName,
      name: nullableText(record?.name),
      index,
    };
    sourceById.set(id, normalized);
    if (internalName) sourceByInternalName.set(internalName, normalized);
  }
  const currentBySourceId = new Map();
  const currentByInternalName = new Map();
  for (const row of Array.isArray(currentTables.items) ? currentTables.items : []) {
    const id = positiveInteger(row?.id);
    if (id == null) continue;
    const sourceId = positiveInteger(row?.source_id ?? row?.sourceId);
    const internalName = nullableText(row?.internal_name ?? row?.internalName);
    const normalized = { id, name: nullableText(row?.name), internalName };
    if (sourceId != null) {
      if (currentBySourceId.has(sourceId)) throw new Error(`current Items identity is duplicated: source_id=${sourceId}`);
      currentBySourceId.set(sourceId, normalized);
    }
    if (internalName) {
      if (currentByInternalName.has(internalName)) {
        throw new Error(`current Items identity is duplicated: internal_name=${internalName}`);
      }
      currentByInternalName.set(internalName, normalized);
    }
  }
  return { sourceById, sourceByInternalName, currentBySourceId, currentByInternalName };
}

function resolveSourceItemReference(value, context, baselineRows, parentId, parentIdColumn) {
  const sourceItemId = positiveInteger(value?.itemId ?? value?.item_id ?? value?.id ?? value);
  const sourceItem = sourceItemId == null ? null : context.sourceById.get(sourceItemId);
  const internalName = nullableText(sourceItem?.internalName ?? value?.internalName ?? value?.internal_name);
  const mapped = (sourceItemId == null ? null : context.currentBySourceId.get(sourceItemId))
    ?? (internalName ? context.currentByInternalName.get(internalName) : null);
  const baseline = Array.isArray(baselineRows)
    ? baselineRows.find((row) => positiveInteger(row?.[parentIdColumn]) === parentId
      && (sourceItemId != null && positiveInteger(row?.source_item_id) === sourceItemId
        || internalName != null && nullableText(row?.item_internal_name ?? row?.source_item_internal_name) === internalName))
    : null;
  return {
    sourceItemId,
    internalName,
    itemId: mapped?.id ?? positiveInteger(baseline?.item_id),
    itemName: mapped?.name ?? nullableText(baseline?.item_name ?? baseline?.source_item_name),
  };
}

function mergeRelationProjectionRows(projectedRows, baselineRows, keyColumns) {
  const projected = Array.isArray(projectedRows) ? projectedRows : [];
  const baseline = Array.isArray(baselineRows) ? baselineRows : [];
  const projectedKeys = new Set(projected.map((row, index) => identityKey(row, keyColumns, `projected relation row ${index}`)));
  return [
    ...projected,
    ...baseline.filter((row, index) => !projectedKeys.has(identityKey(row, keyColumns, `current relation row ${index}`))),
  ];
}

function toSnakeCaseRow(row) {
  return Object.fromEntries(Object.entries(row ?? {})
    .filter(([key]) => key !== 'lastVerifiedAt' && key !== 'last_verified_at')
    .map(([key, value]) => [toSnakeCase(key), value]));
}

function toSnakeCase(value) {
  return String(value).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function identityKey(row, columns, label) {
  const values = columns.map((column) => {
    const value = row?.[column];
    if (value == null || (typeof value === 'string' && !value.trim())) {
      throw new Error(`${label} is missing identity column ${column}`);
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`${label} has an invalid identity column ${column}`);
    }
    return typeof value === 'number' ? String(value) : String(value).trim();
  });
  return JSON.stringify(values);
}

function positiveInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function nullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeSqlDateTime(value) {
  if (value == null || String(value).trim() === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid Boss revision timestamp: ${value}`);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function requireStructuredDomain(value) {
  const domain = requireText(value, 'structured diff domainId');
  if (!Object.hasOwn(STRUCTURED_DOMAIN_TABLES, domain)) {
    throw new Error(`structured automatic L2 diff producer is unavailable for ${domain}`);
  }
  return domain;
}

function normalizeStructuredOwnedTables(value, domain) {
  const snapshot = normalizeDataValue(value, 'structured diff owned table scopes');
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    throw new Error('structured diff owned table scopes are required');
  }
  const seen = new Set();
  const scopes = snapshot.map((raw) => {
    const scope = {
      databaseRole: requireText(raw?.databaseRole, 'structured diff owned table databaseRole'),
      table: requireIdentifier(raw?.table, 'structured diff owned table table'),
      fieldGroup: requireIdentifier(raw?.fieldGroup, 'structured diff owned table fieldGroup'),
      ...(raw?.logicalPredicateHash == null
        ? {}
        : { logicalPredicateHash: requireHash(raw.logicalPredicateHash, 'structured diff owned table logicalPredicateHash') }),
    };
    const key = scopeIdentity(scope);
    if (seen.has(key)) throw new Error('structured diff owned table scopes contain duplicates');
    seen.add(key);
    assertSupportedStructuredScope(domain, scope);
    return scope;
  });
  const expectedTables = STRUCTURED_DOMAIN_TABLES[domain];
  if (scopes.length !== expectedTables.length
      || expectedTables.some((table) => !scopes.some((scope) => scope.table === table))) {
    throw new Error(`structured automatic L2 diff scope is unsupported for ${domain}`);
  }
  const order = new Map(expectedTables.map((table, index) => [table, index]));
  return scopes.sort((left, right) => order.get(left.table) - order.get(right.table));
}

function assertSupportedStructuredScope(domain, scope) {
  if (scope.databaseRole !== 'local') {
    throw new Error(`structured automatic L2 diff supports only local scopes: ${scope.table}`);
  }
  if (!getVerifiedStructuredScopeDefinition(domain, scope)) {
    throw new Error(`structured automatic L2 diff has no registered schema contract for ${domain}/${scope.table}`);
  }
  if (scope.table === 'npcs') {
    const definition = getVerifiedSharedNpcsScopeDefinition(scope);
    if (!definition) {
      throw new Error('structured automatic L2 diff requires a registered shared npcs predicate contract');
    }
    if ((domain === 'npcs' && definition.fieldGroup !== 'npc_owned')
        || (domain === 'bosses' && definition.fieldGroup !== 'boss_owned')) {
      throw new Error(`structured automatic L2 diff shared npcs scope does not belong to ${domain}`);
    }
    return;
  }
  if (scope.fieldGroup !== 'all_columns' || scope.logicalPredicateHash != null) {
    throw new Error(`structured automatic L2 diff cannot verify scoped ownership for ${scope.table}`);
  }
}

function normalizeStructuredCandidate(value, scopes, domain) {
  const candidate = normalizeDataValue(value, 'structured diff candidate');
  if (!isPlainObject(candidate)) throw new Error('structured diff candidate is required');
  if (candidate.schemaVersion !== 1) throw new Error('structured diff candidate schemaVersion must be 1');
  if (candidate.producer !== STRUCTURED_L2_PRODUCER) {
    throw new Error('structured diff candidate producer is not registered');
  }
  if (candidate.completeSnapshot !== true) {
    throw new Error('structured diff candidate must declare completeSnapshot=true');
  }
  const entries = normalizeCandidateTableEntries(candidate.tables);
  const tablesByScope = new Map();
  for (const rawEntry of entries) {
    const entry = normalizeCandidateTableEntry(rawEntry);
    const scope = scopes.find((candidateScope) => scopeIdentity(candidateScope) === scopeIdentity(entry));
    if (!scope) throw new Error(`structured diff candidate table scope is not owned: ${entry.table}`);
    const contract = getVerifiedStructuredScopeDefinition(domain, scope);
    if (!contract) throw new Error(`structured diff candidate has no registered schema contract for ${domain}/${entry.table}`);
    const key = scopeIdentity(scope);
    if (tablesByScope.has(key)) throw new Error('structured diff candidate contains duplicate table scopes');
    if (entry.fieldGroup !== scope.fieldGroup
        || (entry.logicalPredicateHash ?? null) !== (scope.logicalPredicateHash ?? null)) {
      throw new Error(`structured diff candidate scope metadata does not exactly match ${entry.table}`);
    }
    assertCandidateMatchesSchemaContract(entry, contract);
    tablesByScope.set(key, entry);
  }
  if (tablesByScope.size !== scopes.length || scopes.some((scope) => !tablesByScope.has(scopeIdentity(scope)))) {
    throw new Error('structured diff candidate must cover every owned table exactly once');
  }
  return { completeSnapshot: true, tablesByScope };
}

function normalizeCandidateTableEntries(value) {
  if (Array.isArray(value)) return value;
  if (!isPlainObject(value)) throw new Error('structured diff candidate tables are required');
  return Object.entries(value).map(([table, entry]) => {
    if (!isPlainObject(entry)) throw new Error(`structured diff candidate table ${table} is invalid`);
    const copied = copyDataProperties(entry, `structured diff candidate table ${table}`);
    if (copied.table == null) copied.table = table;
    return copied;
  });
}

function normalizeCandidateTableEntry(value) {
  if (!isPlainObject(value)) throw new Error('structured diff candidate table entry is invalid');
  const databaseRole = requireText(value.databaseRole, 'structured diff candidate databaseRole');
  const table = requireIdentifier(value.table, 'structured diff candidate table');
  const fieldGroup = requireIdentifier(value.fieldGroup, 'structured diff candidate fieldGroup');
  const logicalPredicateHash = value.logicalPredicateHash == null
    ? null
    : requireHash(value.logicalPredicateHash, 'structured diff candidate logicalPredicateHash');
  const keyColumns = normalizeColumnList(value.keyColumns, 'structured diff candidate keyColumns');
  const compareColumns = normalizeColumnList(value.compareColumns, 'structured diff candidate compareColumns');
  if (keyColumns.some((column) => !compareColumns.includes(column))) {
    throw new Error('structured diff keyColumns must be included in compareColumns');
  }
  const numericColumns = normalizeOptionalColumnList(value.numericColumns, 'structured diff candidate numericColumns');
  const jsonColumns = normalizeOptionalColumnList(value.jsonColumns, 'structured diff candidate jsonColumns');
  if (numericColumns.some((column) => !compareColumns.includes(column))
      || jsonColumns.some((column) => !compareColumns.includes(column))) {
    throw new Error('structured diff numeric/json columns must be declared comparison columns');
  }
  if (!Object.hasOwn(value, 'mutationKind')) {
    throw new Error('structured diff candidate mutationKind is required for schema contract binding');
  }
  const mutationKind = value.mutationKind;
  if (!MUTATION_KINDS.has(mutationKind)) throw new Error('structured diff mutationKind is unsupported');
  if (!Array.isArray(value.rows)) throw new Error('structured diff candidate rows are required');
  if (!Object.hasOwn(value, 'numericColumns') || !Object.hasOwn(value, 'jsonColumns')) {
    throw new Error('structured diff candidate numeric/json columns are required for schema contract binding');
  }
  return {
    databaseRole,
    table,
    fieldGroup,
    ...(logicalPredicateHash == null ? {} : { logicalPredicateHash }),
    keyColumns,
    compareColumns,
    numericColumns,
    jsonColumns,
    mutationKind,
    rows: value.rows.map((row, index) => normalizeDataRow(row, `structured diff candidate ${table} row ${index}`)),
  };
}

function assertCandidateMatchesSchemaContract(entry, contract) {
  if (!sameColumnList(entry.keyColumns, contract.keyColumns)
      || !sameColumnList(entry.compareColumns, contract.compareColumns)
      || !sameColumnList(entry.numericColumns, contract.numericColumns)
      || !sameColumnList(entry.jsonColumns, contract.jsonColumns)
      || entry.mutationKind !== contract.mutationKind) {
    throw new Error(`structured diff candidate columns or mutationKind do not match the registered schema contract for ${entry.table}`);
  }
}

function normalizeCurrentTables(current, scopes) {
  const snapshot = normalizeDataValue(current, 'structured diff current snapshot');
  if (!isPlainObject(snapshot?.tables)) throw new Error('structured diff requires a locked current table snapshot');
  const tables = {};
  for (const scope of scopes) {
    const rows = snapshot.tables[scope.table];
    if (!Array.isArray(rows)) throw new Error(`structured diff current snapshot is missing ${scope.table}`);
    tables[scope.table] = rows.map((row, index) => normalizeDataRow(row, `structured diff current ${scope.table} row ${index}`));
  }
  return tables;
}

function buildStructuredScopeDiff({ scope, table, baselineRows, candidateRows, completeSnapshot }) {
  assertRowsContainColumns(baselineRows, table.compareColumns, `structured diff current ${table.table}`);
  assertRowsContainColumns(candidateRows, table.compareColumns, `structured diff candidate ${table.table}`);
  const baselineByKey = indexRowsByIdentity(baselineRows, table, 'baseline');
  const candidateByKey = indexRowsByIdentity(candidateRows, table, 'candidate');
  const insertedKeys = [];
  const updatedKeys = [];
  const deletedKeys = [];
  for (const [identity, candidateRow] of candidateByKey) {
    const baselineRow = baselineByKey.get(identity);
    if (!baselineRow) {
      insertedKeys.push(candidateRow.displayKey);
    } else if (!rowsMatch(baselineRow.row, candidateRow.row, table.compareColumns, table)) {
      updatedKeys.push(candidateRow.displayKey);
    }
  }
  for (const [identity, baselineRow] of baselineByKey) {
    if (!candidateByKey.has(identity)) deletedKeys.push(baselineRow.displayKey);
  }
  if (deletedKeys.length > 0 && completeSnapshot !== true) {
    throw new Error(`structured diff cannot derive deletes without a complete snapshot for ${scope.table}`);
  }
  insertedKeys.sort(compareUtf8);
  updatedKeys.sort(compareUtf8);
  deletedKeys.sort(compareUtf8);
  const relationship = table.mutationKind === 'relationship';
  return {
    scopeId: scopeKey(scope),
    ...scope,
    entityBaselineCount: relationship ? 0 : baselineRows.length,
    relationshipBaselineCount: relationship ? baselineRows.length : 0,
    inserts: insertedKeys.length,
    updates: updatedKeys.length,
    relationshipDeletes: relationship ? deletedKeys.length : 0,
    softDisables: relationship ? 0 : deletedKeys.length,
    hardDeletes: 0,
    insertedKeys,
    updatedKeys,
    deletedRelationshipKeys: relationship ? deletedKeys : [],
    softDisabledKeys: relationship ? [] : deletedKeys,
    hardDeletedKeys: [],
    keyColumns: table.keyColumns,
    compareColumns: table.compareColumns,
    mutationKind: table.mutationKind,
    candidateRowCount: candidateRows.length,
    baselineRowCount: baselineRows.length,
    candidateRowsSha256: sha256(stableJson(candidateRows)),
    baselineRowsSha256: sha256(stableJson(baselineRows)),
  };
}

function assertRowsContainColumns(rows, columns, label) {
  for (const [index, row] of rows.entries()) {
    for (const column of columns) {
      if (!Object.hasOwn(row, column)) throw new Error(`${label} row ${index} is missing comparison column ${column}`);
    }
  }
}

function filterRowsForScope(rows, scope, label) {
  if (scope.table.startsWith('shimmer_')) {
    const scoped = [];
    for (const [index, row] of rows.entries()) {
      const matches = matchesShimmerSourceScope(row, `${label} ${scope.table} row ${index}`);
      if (!matches && label.includes('candidate')) {
        throw new Error(`${label} ${scope.table} row ${index} is outside the verified wiki_zh/微光 source scope`);
      }
      if (matches) scoped.push(row);
    }
    return scoped;
  }
  if (scope.table !== 'npcs') return rows;
  const definition = getVerifiedSharedNpcsScopeDefinition(scope);
  if (!definition) throw new Error('structured diff shared npcs scope has no registered predicate contract');
  return rows.filter((row, index) => matchesSharedNpcsScope(row, definition, `${label} npcs row ${index}`));
}

function matchesShimmerSourceScope(row, label) {
  const provider = nullableText(row?.source_provider ?? row?.sourceProvider);
  const sourcePage = nullableText(row?.source_page ?? row?.sourcePage);
  const deleted = row?.deleted == null ? null : Number(row.deleted);
  if (provider !== 'wiki_zh' || sourcePage !== '微光' || deleted !== 0) return false;
  return true;
}

function matchesSharedNpcsScope(row, definition, label) {
  for (const column of definition.sourceColumns) {
    if (!Object.hasOwn(row, column)) {
      throw new Error(`${label} is missing shared npcs predicate source column ${column}`);
    }
  }
  const isBoss = normalizeNpcBossFlag(row.is_boss, label);
  if (definition.predicate.partition === 'non_boss') return isBoss !== 1;
  if (definition.predicate.partition === 'boss') return isBoss === 1;
  throw new Error('registered shared npcs predicate has an unsupported partition');
}

function normalizeNpcBossFlag(value, label) {
  if (value == null) return 0;
  if (value === 0 || value === 1) return value;
  if (value === '0' || value === '1') return Number(value);
  throw new Error(`${label} has an invalid is_boss predicate value`);
}

function indexRowsByIdentity(rows, table, label) {
  const index = new Map();
  for (const [rowIndex, row] of rows.entries()) {
    const parts = table.keyColumns.map((column) => normalizedKeyPart(row, column, `${label} ${table.table} row ${rowIndex}`, table));
    if (table.table.startsWith('shimmer_') && parts.every((part) => part == null)) {
      throw new Error(`structured diff ${label} has no stable identity for ${table.table} row ${rowIndex}`);
    }
    const identity = JSON.stringify(parts);
    if (index.has(identity)) {
      throw new Error(`structured diff ${label} has a duplicate or ambiguous row identity for ${table.table}`);
    }
    index.set(identity, {
      row,
      displayKey: `${table.table}:${parts.length === 1 ? parts[0] : stableJson(parts)}`,
    });
  }
  return index;
}

function normalizedKeyPart(row, column, label, table) {
  if (!Object.hasOwn(row, column)) throw new Error(`${label} is missing key column ${column}`);
  const value = row[column];
  if (value == null || (typeof value === 'string' && !value.trim())) {
    if (table?.table?.startsWith('shimmer_')) return null;
    throw new Error(`${label} has an invalid key column ${column}`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} has an invalid numeric key column ${column}`);
    return String(value);
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${label} has an invalid key column ${column}`);
}

function rowsMatch(left, right, columns, table) {
  return stableJson(columns.map((column) => normalizeComparedValue(left[column], column, table)))
    === stableJson(columns.map((column) => normalizeComparedValue(right[column], column, table)));
}

function normalizeComparedValue(value, column, table) {
  if (value == null) return null;
  if (table.numericColumns.includes(column)) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`structured diff comparison column ${column} must be numeric`);
    return number;
  }
  if (table.jsonColumns.includes(column)) {
    if (typeof value === 'string') {
      try { return normalizeDataValue(JSON.parse(value), `structured diff JSON column ${column}`); } catch {
        throw new Error(`structured diff comparison JSON column ${column} is invalid`);
      }
    }
    return normalizeDataValue(value, `structured diff JSON column ${column}`);
  }
  return value;
}

function sumScopeCounts(scopes) {
  return scopes.reduce((result, scope) => {
    for (const field of ['entityBaselineCount', 'relationshipBaselineCount', 'inserts', 'updates', 'relationshipDeletes', 'softDisables', 'hardDeletes']) {
      result[field] += scope[field];
    }
    return result;
  }, {
    entityBaselineCount: 0,
    relationshipBaselineCount: 0,
    inserts: 0,
    updates: 0,
    relationshipDeletes: 0,
    softDisables: 0,
    hardDeletes: 0,
  });
}

function normalizeColumnList(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  const columns = value.map((column) => requireIdentifier(column, label));
  if (new Set(columns).size !== columns.length) throw new Error(`${label} contains duplicates`);
  return columns;
}

function normalizeOptionalColumnList(value, label) {
  if (value == null) return [];
  if (Array.isArray(value) && value.length === 0) return [];
  return normalizeColumnList(value, label);
}

function requireIdentifier(value, label) {
  const text = requireText(value, label);
  if (!SAFE_COLUMN_NAME.test(text)) throw new Error(`${label} must be a safe identifier`);
  return text;
}

function scopeIdentity(scope) {
  return `${scope.databaseRole}:${scope.table}:${scope.fieldGroup}:${scope.logicalPredicateHash ?? ''}`;
}

function sameColumnList(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length
    && left.every((column, index) => column === right[index]);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function copyDataProperties(value, label) {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result = {};
  for (const key of Object.keys(descriptors)) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, 'value')) throw new Error(`${label}.${key} must be a data property`);
    if (!descriptor.enumerable) continue;
    Object.defineProperty(result, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

function normalizeDataRow(row, label) {
  if (!isPlainObject(row)) throw new Error(`${label} must be a plain object`);
  return normalizeDataValue(row, label);
}

function normalizeDataValue(value, label, ancestors = new WeakSet()) {
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
      const descriptors = Object.getOwnPropertyDescriptors(value);
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
        if (!Object.hasOwn(descriptor, 'value')) throw new Error(`${label}.${key} must be a data property`);
        if (!descriptor.enumerable) continue;
        Object.defineProperty(result, key, {
          value: normalizeDataValue(descriptor.value, `${label}[${key}]`, ancestors),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    }
    if (!isPlainObject(value)) throw new Error(`${label} contains a non-plain object`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = {};
    for (const key of Object.keys(descriptors).sort(compareUtf8)) {
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, 'value')) throw new Error(`${label}.${key} must be a data property`);
      if (!descriptor.enumerable) continue;
      Object.defineProperty(result, key, {
        value: normalizeDataValue(descriptor.value, `${label}.${key}`, ancestors),
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

function stableJson(value) {
  return JSON.stringify(value);
}

function compareUtf8(left, right) {
  return Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8'));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function readFrozenSource(root, source) {
  const absolutePath = path.resolve(root, source.path);
  const relativePath = path.relative(root, absolutePath).replaceAll('\\', '/');
  if (relativePath === '..' || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
    throw new Error('frozen source path must remain inside the repository');
  }
  assertRepositoryOrdinaryFile({
    repoRoot: root,
    filePath: absolutePath,
    label: 'frozen source',
  });
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('frozen source must be an ordinary file');
  if ((stat.mode & 0o077) !== 0) throw new Error('frozen source must be private mode 0600');
  const bytes = fs.readFileSync(absolutePath);
  if (sha256(bytes) !== source.sha256) throw new Error('frozen source hash drifted before automatic diff preview');
  try {
    return { payload: JSON.parse(bytes.toString('utf8')), absolutePath };
  } catch (error) {
    throw new Error(`frozen source must be valid JSON: ${error.message}`);
  }
}

function createReadOnlyMutationRecorder({ connection, ownedTables }) {
  if (!connection || typeof connection.query !== 'function' || typeof connection.execute !== 'function') {
    throw new Error('automatic diff producer requires a MySQL query/execute connection');
  }
  const ownedByTable = new Map(ownedTables.map((scope) => [scope.table, scope]));
  const mutations = [];
  const dispatch = async (method, sql, params = []) => {
    const statement = requireText(sql, 'automatic diff SQL').trim();
    if (SQL_SEPARATOR_PATTERN.test(statement)) {
      throw new Error('automatic diff preview rejected SQL containing a semicolon or multiple statements');
    }
    if (READ_PREFIX.test(statement)) {
      return connection[method](sql, params);
    }
    if (SESSION_PREFIX.test(statement)) {
      if (!SIMPLE_SESSION_STATEMENT.test(statement)) {
        throw new Error('automatic diff preview rejected compound SET NAMES SQL');
      }
      return [{ affectedRows: 0 }];
    }
    const mutation = MUTATION_PATTERN.exec(statement);
    if (!mutation) throw new Error(`automatic diff preview rejected non-read SQL: ${statement.slice(0, 48)}`);
    const operation = mutation[1].replace(/\s+/g, '_').toUpperCase();
    const table = mutation[2];
    if (!ownedByTable.has(table)) {
      throw new Error(`automatic diff preview mutation is outside declared owned tables: ${table}`);
    }
    throw new Error(
      `automatic diff SQL intent recorder cannot prove actual affected rows for ${operation} on ${table}; a structured row-level producer is required`,
    );
  };
  return {
    config: connection.config,
    query: (sql, params) => dispatch('query', sql, params),
    execute: (sql, params) => dispatch('execute', sql, params),
    mutations,
  };
}

function buildDiff({ ownedTables, current, mutations, sourceCheckedAt }) {
  if (!current?.tables || typeof current.tables !== 'object' || Array.isArray(current.tables)) {
    throw new Error('automatic diff requires a locked current table snapshot');
  }
  const scopes = ownedTables.map((scope) => {
    const baselineRows = current.tables[scope.table];
    if (!Array.isArray(baselineRows)) {
      throw new Error(`automatic diff current snapshot is missing ${scope.table}`);
    }
    const rows = mutations.filter((mutation) => mutation.table === scope.table);
    const insertedKeys = rows.filter((mutation) => mutation.kind === 'insert').map((mutation) => mutation.key).sort();
    const updatedKeys = rows.filter((mutation) => mutation.kind === 'update').map((mutation) => mutation.key).sort();
    const deletedRelationshipKeys = rows
      .filter((mutation) => mutation.kind === 'relationshipDelete')
      .map((mutation) => mutation.key)
      .sort();
    return {
      scopeId: scopeKey(scope),
      ...scope,
      entityBaselineCount: baselineRows.length,
      relationshipBaselineCount: baselineRows.length,
      inserts: insertedKeys.length,
      updates: updatedKeys.length,
      relationshipDeletes: deletedRelationshipKeys.length,
      softDisables: 0,
      hardDeletes: 0,
      insertedKeys,
      updatedKeys,
      deletedRelationshipKeys,
      softDisabledKeys: [],
      hardDeletedKeys: [],
    };
  });
  const counts = scopes.reduce((result, scope) => ({
    entityBaselineCount: result.entityBaselineCount + scope.entityBaselineCount,
    relationshipBaselineCount: result.relationshipBaselineCount + scope.relationshipBaselineCount,
    inserts: result.inserts + scope.inserts,
    updates: result.updates + scope.updates,
    relationshipDeletes: result.relationshipDeletes + scope.relationshipDeletes,
    softDisables: result.softDisables + scope.softDisables,
    hardDeletes: result.hardDeletes + scope.hardDeletes,
  }), {
    entityBaselineCount: 0,
    relationshipBaselineCount: 0,
    inserts: 0,
    updates: 0,
    relationshipDeletes: 0,
    softDisables: 0,
    hardDeletes: 0,
  });
  return Object.freeze({
    schemaVersion: 1,
    producer: 'read_only_sql_intent_zero_mutation_v2',
    rowCountEvidence: 'zero_mutation_sql_trace',
    sourceCheckedAt,
    snapshot: true,
    wholeDomainRebuild: false,
    scopes: Object.freeze(scopes.map((scope) => Object.freeze(scope))),
    counts: Object.freeze(counts),
  });
}

function assertSummaryHealthy(value) {
  const errors = [];
  const visit = (item) => {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      if ((key === 'errors' || key === 'failures') && Array.isArray(child) && child.length > 0) {
        errors.push(...child.map((entry) => String(entry)));
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  if (errors.length > 0) throw new Error(`automatic diff preview reported ${errors.length} importer error(s)`);
}

function scopeKey(scope) {
  return `${scope.databaseRole}.${scope.table}.${scope.fieldGroup}${scope.logicalPredicateHash == null ? '' : `.${scope.logicalPredicateHash.slice(7)}`}`;
}

function requireConfinedReportsPath(value, label) {
  const normalized = requireText(value, label).replaceAll('\\', '/');
  if (!normalized.startsWith('reports/') || normalized.includes('..') || normalized.startsWith('/')) {
    throw new Error(`${label} must be a confined reports path`);
  }
  return normalized;
}

function requireHash(value, label) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return text;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
