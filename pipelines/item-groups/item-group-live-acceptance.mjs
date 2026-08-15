import fs from 'node:fs';
import path from 'node:path';

import { buildItemGroupBootstrap } from './item-group-bootstrap.mjs';
import {
  buildItemGroupMaintProjection,
  buildItemGroupRelationProjection,
  buildItemGroupRuntimeSnapshotPayload,
  buildItemGroupRuntimeProjection,
} from './item-group-canonical-sync.mjs';
import {
  buildItemGroupCompatibilitySnapshot,
  exportItemGroupCompatibility,
  parseItemGroupCompatibilityExports,
} from './export-item-group-compatibility.mjs';

const EXPECTED_COMMIT_COUNTS = Object.freeze([4, 35, 163, 72, 2, 35, 163, 72, 34, 161, 70, 1]);
const ZERO_COUNTS = Object.freeze(Array(12).fill(0));
const EXPECTED_PROJECTION_COUNTS = Object.freeze({
  landing: Object.freeze({ sourceCount: 4, groupCount: 64 }),
  maint: Object.freeze({ groupCount: 35, memberCount: 163, aliasCount: 72, exclusionCount: 2 }),
  relation: Object.freeze({
    groupCount: 35,
    memberCount: 163,
    aliasCount: 72,
    unresolvedCount: 0,
    ambiguousCount: 0,
    rejectedCount: 2,
  }),
  local: Object.freeze({ groupCount: 34, memberCount: 161, aliasCount: 70 }),
});
const INSERT_COLUMNS = Object.freeze({
  maint_item_groups: Object.freeze([
    'recordKey', 'canonicalKey', 'canonicalName', 'displayName', 'displayNameZh',
    'normalizedDomainsJson', 'sourceLayer', 'sourcePriority', 'sourceProvider', 'sourceKey',
    'sourcePage', 'sourceLocator', 'sourceRevisionTimestamp', 'landingSourceId',
    'landingContentHash', 'provenanceMode', 'adminAuditRecordKey', 'status', 'blockReason',
    'sourceMetadataJson', 'canonicalVersion', 'deleted',
  ]),
  maint_item_group_members: Object.freeze([
    'recordKey', 'groupRecordKey', 'sourceItemId', 'internalName', 'name', 'nameZh',
    'memberKey', 'sortOrder', 'sourceMetadataJson', 'resolutionHint', 'deleted',
  ]),
  maint_item_group_aliases: Object.freeze([
    'recordKey', 'groupRecordKey', 'aliasText', 'normalizedAlias', 'aliasKind',
    'aliasLanguage', 'sortOrder', 'deleted',
  ]),
  maint_item_group_member_exclusions: Object.freeze([
    'recordKey', 'canonicalKey', 'memberKey', 'reason', 'actor', 'evidenceReference', 'deleted',
  ]),
  relation_item_groups: Object.freeze([
    'recordKey', 'canonicalKey', 'canonicalName', 'displayName', 'displayNameZh',
    'normalizedDomainsJson', 'sourceLayer', 'sourcePriority', 'sourceMaintRecordKey',
    'landingSourceId', 'landingSourceKey', 'landingContentHash', 'resolvedMemberCount',
    'unresolvedMemberCount', 'ambiguousMemberCount', 'rejectedMemberCount', 'status',
    'blockReason', 'canonicalVersion', 'sourceMetadataJson', 'deleted',
  ]),
  relation_item_group_members: Object.freeze([
    'recordKey', 'groupRecordKey', 'memberKey', 'itemId', 'sourceItemId', 'internalName',
    'name', 'nameZh', 'sortOrder', 'resolutionState', 'resolutionReason',
    'sourceMetadataJson', 'deleted',
  ]),
  relation_item_group_aliases: Object.freeze([
    'recordKey', 'groupRecordKey', 'aliasText', 'normalizedAlias', 'aliasKind',
    'aliasLanguage', 'sortOrder', 'deleted',
  ]),
  item_groups: Object.freeze([
    'recordKey', 'canonicalKey', 'canonicalName', 'name', 'nameZh', 'normalizedDomainsJson',
    'sourceLayer', 'sourcePriority', 'relationRecordKey', 'sourceContentHash',
    'canonicalVersion', 'materializedAt', 'status', 'deleted',
  ]),
  item_group_projection_state: Object.freeze([
    'singletonKey', 'canonicalSnapshotHash', 'canonicalVersion', 'relationRunKey',
    'groupCount', 'memberCount', 'aliasCount', 'publicationStatus', 'publishedAt',
  ]),
});

export const EXPECTED_ITEM_GROUP_SCHEMA_EVIDENCE = Object.freeze([
  ...[
    ['local', 'source_dataset_landings'],
    ['local', 'item_groups'],
    ['local', 'item_group_members'],
    ['local', 'item_group_aliases'],
    ['local', 'item_group_admin_audit'],
    ['local', 'item_group_projection_state'],
    ['maint', 'maint_item_groups'],
    ['maint', 'maint_item_group_members'],
    ['maint', 'maint_item_group_aliases'],
    ['maint', 'maint_item_group_member_exclusions'],
    ['relation', 'relation_item_groups'],
    ['relation', 'relation_item_group_members'],
    ['relation', 'relation_item_group_aliases'],
  ].map(([role, table]) => ['table', role, table, 'present']),
  ...[
    ['local', 'source_dataset_landings', 'uk_source_dataset_landings_current'],
    ['local', 'source_dataset_landings', 'uk_source_dataset_landings_bootstrap_hash'],
    ['local', 'item_groups', 'uk_item_groups_canonical_layer'],
    ['local', 'item_group_members', 'uk_item_group_members_group_item'],
    ['local', 'item_group_aliases', 'uk_item_group_aliases_alias_group_layer'],
    ['local', 'item_group_admin_audit', 'uk_item_group_admin_audit_record_key'],
    ['local', 'item_group_projection_state', 'uk_item_group_projection_state_singleton'],
    ['maint', 'maint_item_groups', 'uk_maint_item_groups_canonical_layer_source'],
    ['maint', 'maint_item_group_members', 'uk_maint_item_group_members_group_member'],
    ['maint', 'maint_item_group_aliases', 'uk_maint_item_group_aliases_group_alias'],
    ['maint', 'maint_item_group_member_exclusions', 'uk_maint_item_group_member_exclusions_group_member'],
    ['relation', 'relation_item_groups', 'uk_relation_item_groups_canonical_layer'],
    ['relation', 'relation_item_group_members', 'uk_relation_item_group_members_group_member'],
    ['relation', 'relation_item_group_aliases', 'uk_relation_item_group_aliases_group_alias'],
  ].map(([role, table, index]) => ['index', role, table, index]),
  ['trigger', 'local', 'item_group_admin_audit', 'trg_item_group_admin_audit_no_update'],
  ['trigger', 'local', 'item_group_admin_audit', 'trg_item_group_admin_audit_no_delete'],
  ['check', 'maint', 'maint_item_groups', 'source_layer'],
  ['check', 'relation', 'relation_item_groups', 'source_layer'],
  ['check', 'relation', 'relation_item_group_members', 'resolution_state'],
  ['check', 'local', 'item_groups', 'source_layer'],
  ['check', 'local', 'item_group_aliases', 'source_layer'],
  ['check', 'local', 'item_group_projection_state', 'singleton_key'],
  ['check', 'local', 'item_group_projection_state', 'publication_status'],
]);

function identifier(value, label) {
  const text = String(value ?? '');
  if (!/^[a-z0-9_]+$/.test(text) || /^terria_v1_(?:local|maint|relation)$/.test(text)) {
    throw new Error(`${label} must be an isolated database identifier`);
  }
  return text;
}

function assertDatabaseSet(databases) {
  const roles = Object.keys(databases ?? {}).sort();
  if (roles.join(',') !== 'local,maint,relation') throw new Error('item-group acceptance requires three databases');
  return Object.fromEntries(roles.map((role) => [role, identifier(databases[role], `${role} database`)]));
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite SQL value is forbidden');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && !Number.isNaN(Date.parse(text))) {
    text = new Date(text).toISOString().slice(0, 19).replace('T', ' ');
  }
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function snakeCase(value) {
  return value.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function insertRows(database, table, rows, { extra = {}, columns: selectedColumns } = {}) {
  if (!rows.length) return '';
  const normalized = rows.map((row) => ({
    ...Object.fromEntries(Object.entries(row).filter(([key]) => !['scope', 'tableName'].includes(key))),
    ...extra,
  }));
  const columns = (selectedColumns
    ? [...selectedColumns]
    : [...new Set(normalized.flatMap((row) => Object.keys(row)))])
    .sort();
  const values = normalized.map((row) => `(${columns.map((column) => sqlValue(row[column])).join(', ')})`);
  return `INSERT INTO \`${database}\`.\`${table}\` (${columns.map((column) => `\`${snakeCase(column)}\``).join(', ')}) VALUES\n${values.join(',\n')}`;
}

function loadArtifacts(repoRoot) {
  const paths = {
    recipeReference: path.join(repoRoot, 'data/generated/recipe-material-reference.json'),
    recipeOverrides: path.join(repoRoot, 'data/generated/recipe-group-overrides.json'),
    itemOverrides: path.join(repoRoot, 'data/generated/item-group-overrides.json'),
  };
  return Object.fromEntries(Object.entries(paths).map(([key, filePath]) => {
    const raw = fs.readFileSync(filePath, 'utf8');
    return [key, { raw, payload: JSON.parse(raw), sourceLocator: filePath }];
  }));
}

export function loadItemGroupAcceptanceInputs(repoRoot) {
  const items = JSON.parse(fs.readFileSync(
    path.join(repoRoot, 'data/standardized/items.standardized.json'),
    'utf8',
  ));
  return { artifacts: loadArtifacts(repoRoot), items: items.records };
}

export function buildItemGroupAcceptanceProjection({ artifacts, items, runKey } = {}) {
  const bootstrap = buildItemGroupBootstrap({ artifacts, producerRunKey: `t1-${runKey}` });
  const landingRows = bootstrap.landingEntries.map((entry, index) => ({ ...entry, id: index + 1 }));
  const normalizedItems = (items ?? []).map((item) => ({
    id: Number(item.id),
    sourceId: Number(item.id),
    internalName: item.internalName,
    name: item.name,
  }));
  const maint = buildItemGroupMaintProjection({ landingRows });
  const relation = buildItemGroupRelationProjection({ maintProjection: maint, items: normalizedItems });
  const runtime = buildItemGroupRuntimeProjection(relation);
  const snapshot = buildItemGroupCompatibilitySnapshot({
    landingRevision: bootstrap.manifestHash,
    groups: bootstrap.groups,
    exclusions: bootstrap.exclusions,
  });
  const exports = exportItemGroupCompatibility({
    snapshot,
    recipeEvidence: { ...artifacts.recipeReference.payload, landingRevision: bootstrap.manifestHash },
    exportRunKey: `t1-${runKey}`,
  });
  const reparsed = parseItemGroupCompatibilityExports(exports);
  const counts = {
    landing: {
      sourceCount: landingRows.length,
      groupCount: landingRows.reduce((sum, row) => (
        sum + (row.payload.groups?.length ?? 0) + (row.payload.blockedGroups?.length ?? 0)
      ), 0),
    },
    maint: {
      groupCount: maint.groups.length,
      memberCount: maint.members.length,
      aliasCount: maint.aliases.length,
      exclusionCount: maint.exclusions.length,
    },
    relation: {
      groupCount: relation.groups.length,
      memberCount: relation.members.length,
      aliasCount: relation.aliases.length,
      unresolvedCount: relation.members.filter((row) => row.resolutionState === 'UNRESOLVED').length,
      ambiguousCount: relation.members.filter((row) => row.resolutionState === 'AMBIGUOUS').length,
      rejectedCount: relation.members.filter((row) => row.resolutionState === 'REJECTED').length,
    },
    local: {
      groupCount: runtime.groups.length,
      memberCount: runtime.members.length,
      aliasCount: runtime.aliases.length,
    },
  };
  return {
    bootstrap,
    landingRows,
    items: normalizedItems,
    maint,
    relation,
    runtime,
    counts,
    blockedGroupCount: relation.groups.filter((row) => row.status === 'BLOCKED').length,
    compatibility: {
      snapshotHash: snapshot.snapshotHash,
      exports,
      roundTripMatches: JSON.stringify(reparsed) === JSON.stringify(snapshot),
    },
    runKey,
  };
}

export function validateItemGroupAcceptanceProjection(projection) {
  if (JSON.stringify(projection?.counts) !== JSON.stringify(EXPECTED_PROJECTION_COUNTS)) {
    throw new Error('item-group projection counts do not match the frozen T1 contract');
  }
  if (projection.blockedGroupCount !== 1) {
    throw new Error('item-group projection must preserve exactly one blocked group');
  }
  if (projection.compatibility?.roundTripMatches !== true) {
    throw new Error('item-group compatibility round-trip does not match the canonical snapshot');
  }
  return projection;
}

function countSelect(label, databases) {
  const tables = [
    [databases.local, 'source_dataset_landings', "dataset_type = 'item_groups_raw'"],
    [databases.maint, 'maint_item_groups'],
    [databases.maint, 'maint_item_group_members'],
    [databases.maint, 'maint_item_group_aliases'],
    [databases.maint, 'maint_item_group_member_exclusions'],
    [databases.relation, 'relation_item_groups'],
    [databases.relation, 'relation_item_group_members'],
    [databases.relation, 'relation_item_group_aliases'],
    [databases.local, 'item_groups'],
    [databases.local, 'item_group_members'],
    [databases.local, 'item_group_aliases'],
    [databases.local, 'item_group_projection_state'],
  ];
  return `SELECT '${label}', ${tables.map(([database, table, predicate]) => (
    `(SELECT COUNT(*) FROM \`${database}\`.\`${table}\`${predicate ? ` WHERE ${predicate}` : ''})`
  )).join(', ')}`;
}

function runtimeMemberInsert(database, rows) {
  return rows.map((row) => `INSERT INTO \`${database}\`.\`item_group_members\` (`
    + '`record_key`, `group_id`, `item_id`, `source_item_id`, `member_key`, `internal_name`, '
    + '`name`, `name_zh`, `sort_order`, `resolution_state`) '
    + `SELECT ${sqlValue(row.recordKey)}, g.id, ${sqlValue(row.itemId)}, ${sqlValue(row.sourceItemId)}, `
    + `${sqlValue(row.memberKey)}, ${sqlValue(row.internalName)}, ${sqlValue(row.name)}, ${sqlValue(row.nameZh)}, `
    + `${sqlValue(row.sortOrder)}, ${sqlValue(row.resolutionState)} FROM \`${database}\`.\`item_groups\` g `
    + `WHERE g.record_key = ${sqlValue(row.groupRecordKey)}`).join(';\n');
}

function runtimeAliasInsert(database, rows) {
  return rows.map((row) => `INSERT INTO \`${database}\`.\`item_group_aliases\` (`
    + '`record_key`, `canonical_key`, `source_layer`, `alias_text`, `normalized_alias`, '
    + '`alias_kind`, `alias_language`, `sort_order`) '
    + `SELECT ${sqlValue(row.recordKey)}, g.canonical_key, g.source_layer, ${sqlValue(row.aliasText)}, `
    + `${sqlValue(row.normalizedAlias)}, ${sqlValue(row.aliasKind)}, ${sqlValue(row.aliasLanguage)}, `
    + `${sqlValue(row.sortOrder)} FROM \`${database}\`.\`item_groups\` g `
    + `WHERE g.record_key = ${sqlValue(row.groupRecordKey)}`).join(';\n');
}

function landingInsert(database, projection) {
  const rows = projection.landingRows.map((row) => ({
    datasetType: row.datasetType,
    provider: row.provider,
    sourceKind: row.sourceKind,
    sourceKey: row.sourceKey,
    sourceLocator: row.sourceLocator,
    sourcePage: row.sourcePage,
    sourceRevisionTimestamp: row.sourceRevisionTimestamp,
    contentHash: row.contentHash,
    payloadJson: JSON.stringify(row.payload),
    fetchedAt: row.fetchedAt,
    parsedAt: row.parsedAt,
    parseStatus: row.parseStatus,
    artifactRole: row.artifactRole,
    producerId: row.producerId,
    producerVersion: row.producerVersion,
    producerRunKey: row.producerRunKey,
    bootstrapManifestHash: row.bootstrapManifestHash,
    fullFileContentHash: row.fullFileContentHash,
    fullFileByteSize: row.fullFileByteSize,
    isCurrent: 1,
  }));
  return insertRows(database, 'source_dataset_landings', rows);
}

function applySql(databases, projection, {
  seedItems = true,
  includeLanding = true,
  materializedAt = new Date(0).toISOString(),
} = {}) {
  const runtimePayload = buildItemGroupRuntimeSnapshotPayload(projection.runtime);
  const localGroups = runtimePayload.groups.map((row) => ({
    ...row,
    materializedAt,
  }));
  const state = {
    singletonKey: 1,
    canonicalSnapshotHash: projection.runtime.snapshotHash,
    canonicalVersion: 1,
    relationRunKey: projection.runKey,
    groupCount: projection.runtime.groups.length,
    memberCount: projection.runtime.members.length,
    aliasCount: projection.runtime.aliases.length,
    publicationStatus: 'PUBLISHED',
    publishedAt: materializedAt,
  };
  const itemRows = new Map();
  for (const member of projection.relation.members.filter((row) => row.itemId != null)) {
    itemRows.set(member.itemId, projection.items.find((item) => item.id === member.itemId));
  }
  const itemInsert = [...itemRows.values()].filter(Boolean)
    .map((item) => `(${sqlValue(item.id)}, ${sqlValue(item.name || item.internalName)}, ${sqlValue(item.internalName)})`)
    .join(',\n');
  return [
    seedItems && itemInsert && `INSERT INTO \`${databases.local}\`.\`items\` (\`id\`, \`name\`, \`internal_name\`) VALUES\n${itemInsert} ON DUPLICATE KEY UPDATE \`id\` = VALUES(\`id\`)`,
    includeLanding && landingInsert(databases.local, projection),
    insertRows(databases.maint, 'maint_item_groups', projection.maint.groups,
      { columns: INSERT_COLUMNS.maint_item_groups }),
    insertRows(databases.maint, 'maint_item_group_members', projection.maint.members,
      { columns: INSERT_COLUMNS.maint_item_group_members }),
    insertRows(databases.maint, 'maint_item_group_aliases', projection.maint.aliases,
      { columns: INSERT_COLUMNS.maint_item_group_aliases }),
    insertRows(databases.maint, 'maint_item_group_member_exclusions', projection.maint.exclusions,
      { columns: INSERT_COLUMNS.maint_item_group_member_exclusions }),
    insertRows(databases.relation, 'relation_item_groups', projection.relation.groups,
      { columns: INSERT_COLUMNS.relation_item_groups }),
    insertRows(databases.relation, 'relation_item_group_members', projection.relation.members,
      { columns: INSERT_COLUMNS.relation_item_group_members }),
    insertRows(databases.relation, 'relation_item_group_aliases', projection.relation.aliases,
      { columns: INSERT_COLUMNS.relation_item_group_aliases }),
    insertRows(databases.local, 'item_groups', localGroups,
      { columns: INSERT_COLUMNS.item_groups }),
    runtimeMemberInsert(databases.local, runtimePayload.members),
    runtimeAliasInsert(databases.local, runtimePayload.aliases),
    insertRows(databases.local, 'item_group_projection_state', [state],
      { columns: INSERT_COLUMNS.item_group_projection_state }),
  ].filter(Boolean).join(';\n');
}

function restoreSql(databases, projection) {
  const itemIds = [...new Set(projection.relation.members.filter((row) => row.itemId != null).map((row) => row.itemId))];
  return [
    `DELETE FROM \`${databases.local}\`.\`item_group_members\``,
    `DELETE FROM \`${databases.local}\`.\`item_group_aliases\``,
    `DELETE FROM \`${databases.local}\`.\`item_group_projection_state\``,
    `DELETE FROM \`${databases.local}\`.\`item_groups\``,
    `DELETE FROM \`${databases.relation}\`.\`relation_item_group_members\``,
    `DELETE FROM \`${databases.relation}\`.\`relation_item_group_aliases\``,
    `DELETE FROM \`${databases.relation}\`.\`relation_item_groups\``,
    `DELETE FROM \`${databases.maint}\`.\`maint_item_group_members\``,
    `DELETE FROM \`${databases.maint}\`.\`maint_item_group_aliases\``,
    `DELETE FROM \`${databases.maint}\`.\`maint_item_group_member_exclusions\``,
    `DELETE FROM \`${databases.maint}\`.\`maint_item_groups\``,
    `DELETE FROM \`${databases.local}\`.\`source_dataset_landings\` WHERE \`dataset_type\` = 'item_groups_raw'`,
    itemIds.length
      ? `DELETE i FROM \`${databases.local}\`.\`items\` i LEFT JOIN \`__item_group_existing_items\` b ON b.id = i.id WHERE i.id IN (${itemIds.join(', ')}) AND b.id IS NULL`
      : '',
  ].filter(Boolean).join(';\n');
}

export function buildItemGroupAcceptanceSql({ databases, projection } = {}) {
  const names = assertDatabaseSet(databases);
  const itemIds = [...new Set(projection.relation.members.filter((row) => row.itemId != null).map((row) => row.itemId))];
  const apply = applySql(names, projection);
  const restore = restoreSql(names, projection);
  return [
    'CREATE TEMPORARY TABLE `__item_group_existing_items` (`id` BIGINT NOT NULL PRIMARY KEY)',
    itemIds.length
      ? `INSERT INTO \`__item_group_existing_items\` (\`id\`) SELECT \`id\` FROM \`${names.local}\`.\`items\` WHERE \`id\` IN (${itemIds.join(', ')})`
      : '',
    'START TRANSACTION', apply, 'ROLLBACK', countSelect('rollback', names),
    'START TRANSACTION', apply, 'COMMIT', countSelect('commit', names),
    `SELECT 'state', \`publication_status\`, \`canonical_snapshot_hash\` FROM \`${names.local}\`.\`item_group_projection_state\` WHERE \`singleton_key\` = 1`,
    'START TRANSACTION', restore, 'COMMIT', countSelect('restore', names),
  ].filter(Boolean).join(';\n') + ';\n';
}

export function buildItemGroupFormalBootstrapSql({ databases, projection, materializedAt } = {}) {
  const expected = {
    local: 'terria_v1_local',
    maint: 'terria_v1_maint',
    relation: 'terria_v1_relation',
  };
  if (JSON.stringify(databases) !== JSON.stringify(expected)) {
    throw new Error('formal item-group bootstrap requires the exact local/maint/relation databases');
  }
  return `${applySql(databases, projection, {
    seedItems: false,
    includeLanding: false,
    materializedAt,
  })};\n`;
}

export function buildItemGroupFormalLandingSql({ databases, projection } = {}) {
  if (databases?.local !== 'terria_v1_local') {
    throw new Error('formal item-group landing requires terria_v1_local');
  }
  return `${landingInsert(databases.local, projection)};\n`;
}

export function bindItemGroupFormalLandingIds(projection, landingIdsBySourceKey) {
  if (!(landingIdsBySourceKey instanceof Map)) {
    throw new TypeError('landing ids must be a Map');
  }
  const requireLandingId = (sourceKey) => {
    const id = Number(landingIdsBySourceKey.get(sourceKey));
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new Error(`landing id is missing for source key: ${sourceKey}`);
    }
    return id;
  };
  return {
    ...projection,
    landingRows: projection.landingRows.map((row) => ({
      ...row,
      id: requireLandingId(row.sourceKey),
    })),
    maint: {
      ...projection.maint,
      groups: projection.maint.groups.map((row) => ({
        ...row,
        landingSourceId: requireLandingId(row.sourceKey),
      })),
    },
    relation: {
      ...projection.relation,
      groups: projection.relation.groups.map((row) => ({
        ...row,
        landingSourceId: requireLandingId(row.landingSourceKey),
      })),
    },
  };
}

export function parseItemGroupAcceptanceOutput(output, projection) {
  const rows = String(output ?? '').trim().split(/\r?\n/).filter(Boolean).map((line) => line.split('\t'));
  const counts = Object.fromEntries(rows.filter(([label]) => ['rollback', 'commit', 'restore'].includes(label))
    .map(([label, ...values]) => [label, values.map(Number)]));
  for (const [label, expected] of [['rollback', ZERO_COUNTS], ['commit', EXPECTED_COMMIT_COUNTS], ['restore', ZERO_COUNTS]]) {
    if (!counts[label] || counts[label].length !== expected.length
      || counts[label].some((value, index) => value !== expected[index])) {
      throw new Error(`item-group ${label} counts are missing or invalid`);
    }
  }
  const state = rows.find(([label]) => label === 'state');
  if (!state || state[1] !== 'PUBLISHED' || state[2] !== projection.runtime.snapshotHash) {
    throw new Error('item-group published snapshot state is invalid');
  }
  return { status: 'passed', ...counts, publicationStatus: state[1], snapshotHash: state[2] };
}

function schemaEvidenceSql(databases, entry) {
  const [kind, role, objectName, detail] = entry;
  const database = databases[role];
  const literal = entry.map(sqlValue).join(', ');
  if (kind === 'table') {
    return `SELECT ${literal} FROM information_schema.tables WHERE table_schema = ${sqlValue(database)} AND table_name = ${sqlValue(objectName)}`;
  }
  if (kind === 'index') {
    return `SELECT ${literal} FROM information_schema.statistics WHERE table_schema = ${sqlValue(database)} AND table_name = ${sqlValue(objectName)} AND index_name = ${sqlValue(detail)} LIMIT 1`;
  }
  if (kind === 'trigger') {
    return `SELECT ${literal} FROM information_schema.triggers WHERE trigger_schema = ${sqlValue(database)} AND event_object_table = ${sqlValue(objectName)} AND trigger_name = ${sqlValue(detail)}`;
  }
  return `SELECT ${literal} FROM information_schema.table_constraints tc JOIN information_schema.check_constraints cc ON cc.constraint_schema = tc.constraint_schema AND cc.constraint_name = tc.constraint_name WHERE tc.table_schema = ${sqlValue(database)} AND tc.table_name = ${sqlValue(objectName)} AND tc.constraint_type = 'CHECK' AND LOWER(cc.check_clause) LIKE ${sqlValue(`%${detail}%`)} LIMIT 1`;
}

export function buildItemGroupSchemaProbeSql(databases) {
  const names = assertDatabaseSet(databases);
  return EXPECTED_ITEM_GROUP_SCHEMA_EVIDENCE.map((entry) => schemaEvidenceSql(names, entry)).join(';\n') + ';\n';
}

export function validateItemGroupSchemaOutput(output) {
  const actual = new Set(String(output ?? '').trim().split(/\r?\n/).filter(Boolean));
  const missing = EXPECTED_ITEM_GROUP_SCHEMA_EVIDENCE
    .map((entry) => entry.join('\t'))
    .filter((entry) => !actual.has(entry));
  if (missing.length) throw new Error(`missing schema evidence: ${missing.join(', ')}`);
  return { status: 'passed', evidenceCount: EXPECTED_ITEM_GROUP_SCHEMA_EVIDENCE.length };
}

export async function runItemGroupLiveAcceptance({ profile, repoRoot, databases, client, manifest } = {}) {
  if (!['t0', 't1'].includes(profile) || !client?.query) {
    throw new Error('item-group live acceptance requires t0/t1 and an isolated database client');
  }
  const schema = validateItemGroupSchemaOutput(await client.query(buildItemGroupSchemaProbeSql(databases)));
  if (profile === 't0') return { profile, status: 'passed', schema };
  const projection = validateItemGroupAcceptanceProjection(buildItemGroupAcceptanceProjection({
    ...loadItemGroupAcceptanceInputs(repoRoot),
    runKey: manifest?.runKey,
  }));
  const transaction = parseItemGroupAcceptanceOutput(
    await client.query(
      buildItemGroupAcceptanceSql({ databases, projection }),
      databases.local,
    ),
    projection,
  );
  return {
    profile,
    status: 'passed',
    schema,
    counts: projection.counts,
    blockedGroupCount: projection.blockedGroupCount,
    runtimeSnapshotHash: projection.runtime.snapshotHash,
    compatibilitySnapshotHash: projection.compatibility.snapshotHash,
    compatibilityRoundTrip: projection.compatibility.roundTripMatches,
    transaction,
  };
}
