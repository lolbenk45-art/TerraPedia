import {
  assertItemImageProjectionInputContract,
  buildItemImageProjectionSnapshot,
  canonicalItemImageProjectionHash,
} from './item-image-projection-contract.mjs';

export async function readItemImageProjectionSnapshot(connection, {
  keys,
  target,
  lock = false,
} = {}) {
  requireConnection(connection);
  const normalizedTarget = normalizeTarget(target);
  const normalizedKeys = normalizeKeys(keys);
  let serverUuid;
  let relationRows;
  let projectionRows;
  if (lock) {
    relationRows = await readRelationRows(connection, normalizedTarget, normalizedKeys, true);
    projectionRows = await readProjectionRows(connection, normalizedTarget, normalizedKeys, true);
    serverUuid = await readServerUuid(connection);
  } else {
    serverUuid = await readServerUuid(connection);
    relationRows = await readRelationRows(connection, normalizedTarget, normalizedKeys, false);
    projectionRows = await readProjectionRows(connection, normalizedTarget, normalizedKeys, false);
  }
  if (serverUuid !== normalizedTarget.serverUuid) {
    throw new Error(`database server fingerprint drifted: expected ${normalizedTarget.serverUuid}, found ${serverUuid}`);
  }
  return {
    target: normalizedTarget,
    relationRows,
    projectionRows,
  };
}

export async function executeItemImageProjectionTransaction({
  connection,
  inputContract,
  consumeDispatchPermit,
} = {}) {
  requireConnection(connection);
  assertItemImageProjectionInputContract(inputContract);
  if (typeof consumeDispatchPermit !== 'function') {
    throw new Error('consumeDispatchPermit is required');
  }
  const transaction = {
    began: false,
    rolledBack: false,
    permitConsumed: false,
    dmlAttempted: false,
  };
  try {
    await connection.beginTransaction();
    transaction.began = true;
    const locked = await readItemImageProjectionSnapshot(connection, {
      keys: inputContract.keys,
      target: inputContract.target,
      lock: true,
    });
    const lockedSnapshot = buildItemImageProjectionSnapshot({
      generatedAt: inputContract.generatedAt,
      target: locked.target,
      managedUrlPolicy: inputContract.managedUrlPolicy,
      managedUrlPrefixes: inputContract.managedUrlPrefixes,
      lineageKeys: inputContract.keys,
      relationRows: locked.relationRows,
      projectionRows: locked.projectionRows,
    });
    assertLockedSnapshotMatchesInput(lockedSnapshot, inputContract);

    const changedRows = inputContract.projectionAfterRows.filter((row, index) => (
      row.image !== inputContract.projectionBeforeRows[index]?.image
    ));
    if (changedRows.length === 0 || changedRows.length !== inputContract.changedRowCount) {
      throw new Error('projection changed row set drifted or is empty');
    }
    await consumeDispatchPermit();
    transaction.permitConsumed = true;
    transaction.dmlAttempted = true;
    const [updateResult] = await connection.execute(
      buildImageUpdateSql(inputContract.target.databases.relation, changedRows.length),
      updateParameters(changedRows),
    );
    if (Number(updateResult?.affectedRows) !== inputContract.changedRowCount) {
      throw new Error(
        `projection affected row count drifted: expected ${inputContract.changedRowCount}, found ${Number(updateResult?.affectedRows ?? 0)}`,
      );
    }

    const projectionAfterRows = await readProjectionRows(
      connection,
      inputContract.target,
      inputContract.keys,
      true,
    );
    const afterSnapshot = buildItemImageProjectionSnapshot({
      generatedAt: inputContract.generatedAt,
      target: inputContract.target,
      managedUrlPolicy: inputContract.managedUrlPolicy,
      managedUrlPrefixes: inputContract.managedUrlPrefixes,
      lineageKeys: inputContract.keys,
      relationRows: locked.relationRows,
      projectionRows: projectionAfterRows,
    });
    if (afterSnapshot.projectionBeforeSha256 !== inputContract.projectionAfterSha256
        || canonicalItemImageProjectionHash(afterSnapshot.projectionBeforeRows)
          !== canonicalItemImageProjectionHash(inputContract.projectionAfterRows)) {
      throw new Error('projection after hash drifted');
    }
    await connection.commit();
    return {
      targetRowCount: inputContract.targetRowCount,
      changedRowCount: inputContract.changedRowCount,
      projectionAfterSha256: inputContract.projectionAfterSha256,
    };
  } catch (error) {
    if (transaction.began) {
      try {
        await connection.rollback();
        transaction.rolledBack = true;
      } catch {
        transaction.rolledBack = false;
      }
    }
    error.itemImageProjectionTransaction = Object.freeze({ ...transaction });
    throw error;
  }
}

function assertLockedSnapshotMatchesInput(snapshot, inputContract) {
  const comparisons = [
    ['key set', snapshot.keySetSha256, inputContract.keySetSha256],
    ['relation rows', snapshot.relationRowsSha256, inputContract.relationRowsSha256],
    ['projection before', snapshot.projectionBeforeSha256, inputContract.projectionBeforeSha256],
    ['target fingerprint', snapshot.target.fingerprintSha256, inputContract.target.fingerprintSha256],
  ];
  for (const [label, actual, expected] of comparisons) {
    if (actual !== expected) throw new Error(`locked projection ${label} snapshot drifted`);
  }
  if (snapshot.targetRowCount !== inputContract.targetRowCount) {
    throw new Error('locked projection target row count drifted');
  }
}

async function readServerUuid(connection) {
  const [rows] = await connection.query('SELECT @@server_uuid AS `server_uuid`');
  return requireText(rows?.[0]?.server_uuid, 'database server_uuid');
}

async function readRelationRows(connection, target, keys, lock) {
  const relation = requireIdentifier(target.databases.relation, 'relation database');
  const [rows] = await connection.query(
    `SELECT \`record_key\`, \`item_internal_name\`, \`cached_url\`, \`role\`, \`is_primary\`, \`status\`, \`deleted\`
     FROM \`${relation}\`.\`relation_item_images\`
     WHERE \`deleted\` = 0 AND \`status\` = 1
       AND \`role\` = 'icon' AND \`is_primary\` = 1
       AND BINARY \`item_internal_name\` IN (${placeholders(keys.length)})
     ORDER BY BINARY \`item_internal_name\`, BINARY \`record_key\`${lock ? '\n     FOR UPDATE' : ''}`,
    keys,
  );
  return (rows ?? []).map((row) => ({
    recordKey: row.record_key,
    internalName: row.item_internal_name,
    cachedUrl: row.cached_url,
    role: row.role,
    isPrimary: Number(row.is_primary),
    status: Number(row.status),
    deleted: Number(row.deleted),
  }));
}

async function readProjectionRows(connection, target, keys, lock) {
  const relation = requireIdentifier(target.databases.relation, 'relation database');
  const [rows] = await connection.query(
    `SELECT \`id\`, \`relation_record_key\`, \`internal_name\`, \`image\`, \`status\`, \`deleted\`
     FROM \`${relation}\`.\`projection_items\`
     WHERE \`deleted\` = 0 AND \`status\` = 1
       AND BINARY \`internal_name\` IN (${placeholders(keys.length)})
     ORDER BY BINARY \`internal_name\`${lock ? '\n     FOR UPDATE' : ''}`,
    keys,
  );
  return (rows ?? []).map((row) => ({
    id: Number(row.id),
    relationRecordKey: row.relation_record_key,
    internalName: row.internal_name,
    image: row.image,
    status: Number(row.status),
    deleted: Number(row.deleted),
  }));
}

function buildImageUpdateSql(relationDatabase, rowCount) {
  const relation = requireIdentifier(relationDatabase, 'relation database');
  const cases = Array.from({ length: rowCount }, () => 'WHEN BINARY ? THEN ?').join(' ');
  return `UPDATE \`${relation}\`.\`projection_items\`
     SET \`image\` = CASE BINARY \`internal_name\` ${cases} ELSE \`image\` END
     WHERE \`deleted\` = 0 AND \`status\` = 1
       AND BINARY \`internal_name\` IN (${placeholders(rowCount)})`;
}

function updateParameters(rows) {
  const parameters = [];
  for (const row of rows) parameters.push(row.internalName, row.image);
  parameters.push(...rows.map((row) => row.internalName));
  return parameters;
}

function normalizeTarget(target) {
  const normalized = {
    host: requireText(target?.host, 'target host'),
    port: Number(target?.port),
    serverUuid: requireText(target?.serverUuid, 'target serverUuid'),
    databases: {
      local: requireIdentifier(target?.databases?.local, 'local database'),
      maint: requireIdentifier(target?.databases?.maint, 'maint database'),
      relation: requireIdentifier(target?.databases?.relation, 'relation database'),
    },
    ownedDatabase: requireIdentifier(target?.ownedDatabase, 'owned database'),
    ownedTable: requireIdentifier(target?.ownedTable, 'owned table'),
    ownedColumn: requireIdentifier(target?.ownedColumn, 'owned column'),
  };
  if (!Number.isInteger(normalized.port) || normalized.port <= 0) {
    throw new Error('target port must be a positive integer');
  }
  if (normalized.ownedDatabase !== normalized.databases.relation
      || normalized.ownedTable !== 'projection_items'
      || normalized.ownedColumn !== 'image') {
    throw new Error('target ownership must be relation projection_items.image');
  }
  if (target.fingerprintSha256) normalized.fingerprintSha256 = target.fingerprintSha256;
  return normalized;
}

function normalizeKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('projection keys are required');
  const normalized = keys.map((key) => requireText(key, 'projection key')).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error('projection keys must be unique');
  return normalized;
}

function placeholders(count) {
  return Array.from({ length: count }, () => '?').join(', ');
}

function requireConnection(connection) {
  if (!connection || typeof connection.query !== 'function') throw new Error('database connection is required');
  return connection;
}

function requireIdentifier(value, label) {
  const normalized = requireText(value, label);
  if (!/^[A-Za-z0-9_]+$/.test(normalized)) throw new Error(`${label} must be a plain identifier`);
  return normalized;
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}
