import {
  ITEM_CANONICAL_BASE_ENTITY_RESTORATION_IDS,
  ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS,
} from './item-canonical-base-entity-restoration-contract.mjs';

const MAINT_COLUMNS = Object.freeze([
  'source_id', 'internal_name', 'english_name', 'name_zh', 'source_provider', 'source_page',
  'source_revision_timestamp', 'landing_source_id', 'landing_source_key', 'landing_source_page',
  'landing_content_hash', 'landing_fetched_at', 'landing_parsed_at', 'module_generated_at',
  'terraria_version', 'major_value', 'combat_value', 'defense_value', 'use_time', 'stack_size',
  'width', 'height', 'flags_json', 'raw_json', 'status', 'deleted',
]);

const RELATION_COLUMNS = Object.freeze([
  'record_key', 'source_id', 'internal_name', 'english_name', 'name_zh', 'module_generated_at',
  'terraria_version', 'major_value', 'combat_value', 'defense_value', 'use_time', 'stack_size',
  'width', 'height', 'rare_raw', 'value_raw', 'sell_raw', 'sell_text_raw', 'flags_json',
  'source_maint_table', 'source_maint_record_key', 'source_maint_id', 'landing_source_id',
  'landing_source_key', 'landing_content_hash', 'source_provider', 'source_page',
  'source_revision_timestamp', 'confidence', 'reason', 'review_status', 'raw_json', 'status', 'deleted',
]);

const PROJECTION_COLUMNS = Object.freeze([
  'id', 'relation_record_key', 'name', 'name_zh', 'internal_name', 'slug', 'image', 'category_id',
  'description', 'description_zh', 'damage', 'defense', 'knockback', 'use_time', 'width', 'height',
  'buy', 'sell', 'tooltip', 'tooltip_zh', 'source_provider', 'source_page', 'source_revision_timestamp',
  'last_synced_at', 'rarity_id', 'game_period_id', 'game_model_id', 'is_stackable', 'stack_size',
  'source_npcs_json', 'status', 'deleted', 'created_at', 'updated_at',
]);

const LEGACY_OCCUPANT_NAMES = Object.freeze([
  'HeartArrow',
  'ValentineRing',
  'TurkeyFeather',
  'FestiveTopHat',
  'Wiesnbrau',
]);

export async function executeItemCanonicalBaseEntityRestorationTransaction({
  connection,
  proposal,
  consumeDispatchPermit,
} = {}) {
  requireConnection(connection);
  assertProposal(proposal);
  if (typeof consumeDispatchPermit !== 'function') throw new Error('consumeDispatchPermit is required');
  let began = false;
  try {
    await connection.beginTransaction();
    began = true;
    const existingMaint = await lockCanonicalRows(connection, proposal.target.databases.maint, 'maint_items', proposal);
    assertLockedLegacyRows(existingMaint, proposal.legacyMaintRows, 'maint');
    const existingRelation = await lockCanonicalRows(connection, proposal.target.databases.relation, 'relation_items', proposal);
    assertLockedLegacyRows(existingRelation, proposal.legacyRelationRows, 'relation');
    const existingProjection = await lockCanonicalRows(connection, proposal.target.databases.relation, 'projection_items', proposal);
    assertLockedLegacyRows(existingProjection, proposal.legacyProjectionRows, 'projection');
    const legacyProjectileAudits = await lockLegacyProjectileAudits(connection, proposal.target.databases.relation, proposal, true);
    assertLockedLegacyRows(legacyProjectileAudits, proposal.legacyProjectileAudits, 'item projectile audit');
    const images = await lockManagedImages(connection, proposal.target.databases.relation, proposal.keys);
    assertManagedImageLock(images, proposal.managedImages);
    await consumeDispatchPermit();
    await deleteLegacyRows(connection, proposal.target.databases.maint, 'maint_items', 'source_id', 'internal_name', proposal.legacyMaintRows);
    await deleteLegacyRows(connection, proposal.target.databases.relation, 'relation_items', 'source_id', 'internal_name', proposal.legacyRelationRows);
    await deleteLegacyRows(connection, proposal.target.databases.relation, 'projection_items', 'id', 'internal_name', proposal.legacyProjectionRows);
    await deleteLegacyRows(connection, proposal.target.databases.relation, 'item_projectile_audits', 'item_source_id', 'item_internal_name', proposal.legacyProjectileAudits);
    await insertRows(connection, proposal.target.databases.maint, 'maint_items', MAINT_COLUMNS, proposal.maintRows);
    await insertRows(connection, proposal.target.databases.relation, 'relation_items', RELATION_COLUMNS, proposal.relationRows);
    await insertRows(connection, proposal.target.databases.relation, 'projection_items', PROJECTION_COLUMNS, proposal.projectionRows);
    await assertReadBack(connection, proposal);
    await connection.commit();
    return {
      deletedCounts: { maintItems: 5, relationItems: 5, projectionItems: 5, itemProjectileAudits: 5 },
      insertedCounts: { maintItems: 5, relationItems: 5, projectionItems: 5 },
    };
  } catch (error) {
    if (began) await connection.rollback();
    throw error;
  }
}

export async function readItemCanonicalBaseEntityRestorationSnapshot(connection, { target } = {}) {
  requireConnection(connection);
  const proposal = { target: assertTarget(target), keys: ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS, sourceIds: ITEM_CANONICAL_BASE_ENTITY_RESTORATION_IDS };
  const [legacyMaintRows, legacyRelationRows, legacyProjectionRows, legacyProjectileAudits, managedImages, protectedReferences] = await Promise.all([
    readCanonicalRows(connection, proposal.target.databases.maint, 'maint_items', proposal, false),
    readCanonicalRows(connection, proposal.target.databases.relation, 'relation_items', proposal, false),
    readCanonicalRows(connection, proposal.target.databases.relation, 'projection_items', proposal, false),
    readLegacyProjectileAudits(connection, proposal.target.databases.relation, proposal),
    lockManagedImages(connection, proposal.target.databases.relation, proposal.keys, false),
    readProtectedReferences(connection, proposal.target.databases.relation, proposal),
  ]);
  return {
    legacyMaintRows,
    legacyRelationRows,
    legacyProjectionRows,
    legacyProjectileAudits,
    managedImages,
    protectedReferences,
  };
}

async function lockCanonicalRows(connection, database, table, proposal) {
  return readCanonicalRows(connection, database, table, proposal, true);
}

async function readCanonicalRows(connection, database, table, proposal, lock) {
  const db = identifier(database, 'database');
  const tableName = identifier(table, 'table');
  const idColumn = tableName === 'projection_items' ? 'id' : 'source_id';
  const provenanceColumns = tableName === 'projection_items'
    ? '`source_page`, `status`, `deleted`'
    : '`source_page`, `terraria_version`, `raw_json`, `status`, `deleted`';
  const ids = proposal.sourceIds.map(() => '?').join(', ');
  const keys = proposal.keys.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT \`${idColumn}\`, \`internal_name\`${tableName === 'relation_items' ? ', `record_key`' : ''},
            ${provenanceColumns}
     FROM \`${db}\`.\`${tableName}\`
     WHERE \`deleted\` = 0 AND \`status\` = 1
       AND (\`${idColumn}\` IN (${ids}) OR BINARY \`internal_name\` IN (${keys}))
     ORDER BY \`${idColumn}\`, BINARY \`internal_name\`${lock ? '\n     FOR UPDATE' : ''}`,
    [...proposal.sourceIds, ...proposal.keys],
  );
  return rows ?? [];
}

async function lockLegacyProjectileAudits(connection, relationDatabase, proposal, lock = true) {
  const db = identifier(relationDatabase, 'relation database');
  const ids = proposal.sourceIds.map(() => '?').join(', ');
  const keys = LEGACY_OCCUPANT_NAMES.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT \`item_source_id\`, \`item_internal_name\`, \`record_key\`, \`source_page\`,
            \`status\`, \`deleted\`
     FROM \`${db}\`.\`item_projectile_audits\`
     WHERE \`deleted\` = 0 AND \`status\` = 1
       AND (\`item_source_id\` IN (${ids}) OR BINARY \`item_internal_name\` IN (${keys}))
     ORDER BY \`item_source_id\`, BINARY \`item_internal_name\`${lock ? '\n     FOR UPDATE' : ''}`,
    [...proposal.sourceIds, ...LEGACY_OCCUPANT_NAMES],
  );
  return rows ?? [];
}

async function readLegacyProjectileAudits(connection, relationDatabase, proposal) {
  return lockLegacyProjectileAudits(connection, relationDatabase, proposal, false);
}

async function readProtectedReferences(connection, relationDatabase, proposal) {
  const db = identifier(relationDatabase, 'relation database');
  const ids = proposal.sourceIds.map(() => '?').join(', ');
  const names = LEGACY_OCCUPANT_NAMES.map(() => '?').join(', ');
  const checks = [
    ['item_recipe_heads', 'result_item_source_id', null],
    ['item_recipe_ingredients', 'ingredient_item_source_id', null],
    ['item_recipe_stations', 'station_item_source_id', null],
    ['item_source_facts', 'item_source_id', null],
    ['item_biome_relations', 'item_source_id', null],
    ['item_buff_relations', 'item_source_id', null],
    ['item_projectile_relations', 'item_source_id', null],
    ['item_npc_shop_relations', null, 'item_internal_name'],
    ['item_npc_loot_relations', null, 'item_internal_name'],
  ];
  const references = [];
  for (const [table, idColumn, nameColumn] of checks) {
    const column = idColumn ?? nameColumn;
    const values = idColumn ? proposal.sourceIds : LEGACY_OCCUPANT_NAMES;
    const placeholders = values.map(() => '?').join(', ');
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count FROM \`${db}\`.\`${identifier(table, 'protected table')}\`
       WHERE \`${identifier(column, 'protected column')}\` IN (${placeholders})
         AND \`status\` = 1 AND \`deleted\` = 0`,
      values,
    );
    if (Number(rows?.[0]?.count) > 0) references.push({ table, count: Number(rows[0].count) });
  }
  return references;
}

async function lockManagedImages(connection, relationDatabase, keys, lock = true) {
  const db = identifier(relationDatabase, 'relation database');
  const placeholders = keys.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT \`record_key\`, \`item_internal_name\`, \`cached_url\`, \`is_primary\`, \`status\`, \`deleted\`
     FROM \`${db}\`.\`relation_item_images\`
     WHERE \`deleted\` = 0 AND \`status\` = 1 AND \`is_primary\` = 1
       AND BINARY \`item_internal_name\` IN (${placeholders})
     ORDER BY BINARY \`item_internal_name\`, BINARY \`record_key\`${lock ? '\n     FOR UPDATE' : ''}`,
    keys,
  );
  return rows ?? [];
}

function assertManagedImageLock(actual, expected) {
  if (!Array.isArray(expected) || actual.length !== expected.length) throw new Error('managed image snapshot drifted');
  const expectedByKey = new Map(expected.map((row) => [row.itemInternalName, `${row.recordKey}|${row.cachedUrl}`]));
  for (const row of actual) {
    const expectedValue = expectedByKey.get(row.item_internal_name);
    if (expectedValue !== `${row.record_key}|${row.cached_url}`) throw new Error('managed image snapshot drifted');
  }
}

async function insertRows(connection, database, table, columns, rows) {
  const db = identifier(database, 'database');
  const tableName = identifier(table, 'table');
  const placeholders = rows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
  const [result] = await connection.execute(
    `INSERT INTO \`${db}\`.\`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES ${placeholders}`,
    rows.flatMap((row) => columns.map((column) => valueForColumn(row, column))),
  );
  if (Number(result?.affectedRows) !== rows.length) throw new Error(`${tableName} insert count drifted`);
}

async function deleteLegacyRows(connection, database, table, idColumn, nameColumn, rows) {
  const db = identifier(database, 'database');
  const tableName = identifier(table, 'table');
  const id = identifier(idColumn, 'id column');
  const name = identifier(nameColumn, 'name column');
  const where = rows.map(() => `(\`${id}\` = ? AND BINARY \`${name}\` = ?)`).join(' OR ');
  const [result] = await connection.execute(
    `DELETE FROM \`${db}\`.\`${tableName}\`
     WHERE \`deleted\` = 0 AND \`status\` = 1 AND (${where})`,
    rows.flatMap((row) => [row.sourceId, row.internalName]),
  );
  if (Number(result?.affectedRows) !== rows.length) throw new Error(`${tableName} legacy delete count drifted`);
}

function assertLockedLegacyRows(actualRows, expectedRows, label) {
  if (!Array.isArray(actualRows) || !Array.isArray(expectedRows) || actualRows.length !== 5 || expectedRows.length !== 5) {
    throw new Error(`${label} legacy snapshot drifted`);
  }
  const actual = new Map(actualRows.map((row) => [
    Number(row.source_id ?? row.id ?? row.item_source_id),
    row.internal_name ?? row.item_internal_name,
  ]));
  for (const row of expectedRows) {
    if (actual.get(Number(row.sourceId)) !== row.internalName) {
      throw new Error(`${label} legacy snapshot drifted`);
    }
  }
}

async function assertReadBack(connection, proposal) {
  const maint = await readCanonicalRows(connection, proposal.target.databases.maint, 'maint_items', proposal, false);
  const relation = await readCanonicalRows(connection, proposal.target.databases.relation, 'relation_items', proposal, false);
  const projection = await readCanonicalRows(connection, proposal.target.databases.relation, 'projection_items', proposal, false);
  if (maint.length !== 5 || relation.length !== 5 || projection.length !== 5) {
    throw new Error('canonical restoration read-back count drifted');
  }
  const expected = proposal.keys.join('|');
  for (const rows of [maint, relation, projection]) {
    if (rows.map((row) => row.internal_name).sort().join('|') !== expected) {
      throw new Error('canonical restoration read-back identity drifted');
    }
  }
}

function valueForColumn(row, column) {
  const camel = column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  const value = row[camel] ?? null;
  if (value != null && (column.endsWith('_at') || column.includes('timestamp'))) {
    return toMysqlDatetime(value, column);
  }
  return value;
}

function toMysqlDatetime(value, column) {
  const text = String(value).trim();
  const direct = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(text);
  if (direct) return `${direct[1]} ${direct[2]}`;
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) throw new Error(`${column} must be a valid datetime`);
  return new Date(milliseconds).toISOString().slice(0, 19).replace('T', ' ');
}

function assertProposal(proposal) {
  if (!proposal || JSON.stringify(proposal.keys) !== JSON.stringify(ITEM_CANONICAL_BASE_ENTITY_RESTORATION_KEYS)
      || JSON.stringify(proposal.sourceIds) !== JSON.stringify(ITEM_CANONICAL_BASE_ENTITY_RESTORATION_IDS)
      || proposal.maintRows?.length !== 5 || proposal.relationRows?.length !== 5 || proposal.projectionRows?.length !== 5
      || proposal.managedImages?.length !== 5 || proposal.legacyMaintRows?.length !== 5
      || proposal.legacyRelationRows?.length !== 5 || proposal.legacyProjectionRows?.length !== 5
      || proposal.legacyProjectileAudits?.length !== 5) {
    throw new Error('canonical restoration proposal must contain the exact five-row scope');
  }
  assertTarget(proposal.target);
}

function assertTarget(target) {
  if (target?.databases?.maint !== 'terria_v1_maint' || target?.databases?.relation !== 'terria_v1_relation') {
    throw new Error('canonical restoration target databases drifted');
  }
  return target;
}

function requireConnection(connection) {
  if (!connection || typeof connection.query !== 'function' || typeof connection.execute !== 'function') {
    throw new Error('database connection is required');
  }
}

function identifier(value, label) {
  const text = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(text)) throw new Error(`${label} must be a plain identifier`);
  return text;
}
