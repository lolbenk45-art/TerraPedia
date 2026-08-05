import {
  ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS,
} from './item-image-projection-missing-row-insert-contract.mjs';

const INSERT_COLUMNS = Object.freeze([
  'id', 'relation_record_key', 'name', 'name_zh', 'internal_name', 'slug', 'image',
  'category_id', 'description', 'description_zh', 'damage', 'defense', 'knockback',
  'use_time', 'width', 'height', 'buy', 'sell', 'tooltip', 'tooltip_zh',
  'source_provider', 'source_page', 'source_revision_timestamp', 'last_synced_at',
  'rarity_id', 'game_period_id', 'game_model_id', 'is_stackable', 'stack_size',
  'source_npcs_json', 'status', 'deleted', 'created_at', 'updated_at',
]);

export async function executeItemImageProjectionMissingRowInsertTransaction({
  connection,
  proposal,
  consumeDispatchPermit,
} = {}) {
  requireConnection(connection);
  if (!proposal || !Array.isArray(proposal.keys)
      || proposal.keys.length !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS.length
      || proposal.keys.some((key, index) => key !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS[index])) {
    throw new Error('missing-row insert proposal key set drifted');
  }
  if (typeof consumeDispatchPermit !== 'function') throw new Error('consumeDispatchPermit is required');
  const transaction = { began: false, rolledBack: false, permitConsumed: false, dmlAttempted: false };
  try {
    await connection.beginTransaction();
    transaction.began = true;
    const existing = await readProjectionRows(connection, proposal.target, proposal.keys, true);
    if (existing.length !== 0) throw new Error('projection row already exists for an approved insert key');
    await consumeDispatchPermit();
    transaction.permitConsumed = true;
    transaction.dmlAttempted = true;
    const [result] = await connection.execute(
      buildProjectionInsertSql(proposal.target.databases.relation, proposal.projectionRows.length),
      insertParameters(proposal.projectionRows),
    );
    if (Number(result?.affectedRows) !== proposal.insertedRowCount) {
      throw new Error(`projection insert affected row count drifted: expected ${proposal.insertedRowCount}, found ${Number(result?.affectedRows ?? 0)}`);
    }
    const inserted = await readProjectionRows(connection, proposal.target, proposal.keys, false);
    if (inserted.length !== proposal.insertedRowCount
        || inserted.some((row) => !proposal.keys.includes(row.internalName))) {
      throw new Error('projection inserted row set drifted');
    }
    await connection.commit();
    return { insertedRowCount: proposal.insertedRowCount };
  } catch (error) {
    if (transaction.began) {
      try {
        await connection.rollback();
        transaction.rolledBack = true;
      } catch {
        transaction.rolledBack = false;
      }
    }
    error.itemImageProjectionMissingRowInsertTransaction = Object.freeze({ ...transaction });
    throw error;
  }
}

export async function readItemImageProjectionMissingRowInsertSnapshot(connection, {
  target,
  keys = ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS,
} = {}) {
  requireConnection(connection);
  const relation = requireIdentifier(target?.databases?.relation, 'relation database');
  if (keys.length !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS.length
      || keys.some((key, index) => key !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS[index])) {
    throw new Error('missing-row insert snapshot key set must be exactly five');
  }
  const placeholders = keys.map(() => '?').join(', ');
  const [items] = await connection.query(
    `SELECT * FROM \`${relation}\`.\`relation_items\`
     WHERE \`deleted\` = 0 AND \`status\` = 1
       AND BINARY \`internal_name\` IN (${placeholders})
     ORDER BY BINARY \`internal_name\``,
    keys,
  );
  const [images] = await connection.query(
    `SELECT \`record_key\`, \`item_internal_name\`, \`cached_url\`, \`role\`, \`is_primary\`, \`status\`, \`deleted\`
     FROM \`${relation}\`.\`relation_item_images\`
     WHERE \`deleted\` = 0 AND \`status\` = 1
       AND \`role\` = 'icon' AND \`is_primary\` = 1
       AND BINARY \`item_internal_name\` IN (${placeholders})
     ORDER BY BINARY \`item_internal_name\`, BINARY \`record_key\``,
    keys,
  );
  const [projection] = await connection.query(
    `SELECT \`id\`, \`relation_record_key\`, \`internal_name\`, \`image\`, \`status\`, \`deleted\`
     FROM \`${relation}\`.\`projection_items\`
     WHERE \`deleted\` = 0 AND \`status\` = 1
       AND BINARY \`internal_name\` IN (${placeholders})
     ORDER BY BINARY \`internal_name\``,
    keys,
  );
  return {
    relationItems: (items ?? []).map(normalizeRelationItem),
    relationImageRows: (images ?? []).map(normalizeRelationImage),
    existingProjectionRows: (projection ?? []).map((row) => ({
      id: Number(row.id),
      relationRecordKey: row.relation_record_key,
      internalName: row.internal_name,
      image: row.image,
      status: Number(row.status),
      deleted: Number(row.deleted),
    })),
  };
}

export function buildProjectionInsertSql(relationDatabase, rowCount) {
  const relation = requireIdentifier(relationDatabase, 'relation database');
  if (!Number.isInteger(rowCount) || rowCount !== ITEM_IMAGE_PROJECTION_MISSING_ROW_INSERT_KEYS.length) {
    throw new Error('projection insert row count must be exactly five');
  }
  const columns = INSERT_COLUMNS.map((column) => `\`${column}\``).join(', ');
  const values = Array.from({ length: rowCount }, () => `(${INSERT_COLUMNS.map(() => '?').join(', ')})`).join(', ');
  return `INSERT INTO \`${relation}\`.\`projection_items\` (${columns}) VALUES ${values}`;
}

function insertParameters(rows) {
  return rows.flatMap((row) => INSERT_COLUMNS.map((column) => {
    const camel = column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    return row[camel] ?? null;
  }));
}

async function readProjectionRows(connection, target, keys, lock) {
  const relation = requireIdentifier(target?.databases?.relation, 'relation database');
  const placeholders = keys.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT \`internal_name\` FROM \`${relation}\`.\`projection_items\`
     WHERE \`deleted\` = 0 AND \`status\` = 1
       AND BINARY \`internal_name\` IN (${placeholders})${lock ? '\n     FOR UPDATE' : ''}`,
    keys,
  );
  return (rows ?? []).map((row) => ({ internalName: row.internal_name }));
}

function requireConnection(connection) {
  if (!connection || typeof connection.query !== 'function' || typeof connection.execute !== 'function') {
    throw new Error('database connection is required');
  }
}

function requireIdentifier(value, label) {
  const text = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(text)) throw new Error(`${label} must be a plain identifier`);
  return text;
}

function normalizeRelationItem(row) {
  return {
    ...row,
    id: Number(row.id ?? row.source_id),
    recordKey: row.record_key,
    internalName: row.internal_name,
    englishName: row.english_name,
    nameZh: row.name_zh,
    rawJson: row.raw_json,
    combatValue: row.combat_value,
    defenseValue: row.defense_value,
    useTime: row.use_time,
    stackSize: row.stack_size,
    width: row.width,
    height: row.height,
    rareRaw: row.rare_raw,
    majorValue: row.major_value,
    sellRaw: row.sell_raw,
    sourceProvider: row.source_provider,
    sourcePage: row.source_page,
    sourceRevisionTimestamp: row.source_revision_timestamp,
    status: Number(row.status),
    deleted: Number(row.deleted),
  };
}

function normalizeRelationImage(row) {
  return {
    recordKey: row.record_key,
    itemInternalName: row.item_internal_name,
    cachedUrl: row.cached_url,
    role: row.role,
    isPrimary: Number(row.is_primary),
    status: Number(row.status),
    deleted: Number(row.deleted),
  };
}
