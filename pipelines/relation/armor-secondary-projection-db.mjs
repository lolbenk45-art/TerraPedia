import {
  ARMOR_SECONDARY_SOURCE_TABLES, ARMOR_SECONDARY_PROJECTION_TABLES, ARMOR_SECONDARY_COLUMNS,
  buildArmorSecondaryProjectionProposal, validateArmorSecondaryProjectionProposal, hashArmorSecondaryProjectionRows,
} from './armor-secondary-projection.mjs';

export async function readArmorSecondarySnapshot({ connection, forUpdate = false } = {}) {
  if (typeof connection?.query !== 'function') throw new Error('Armor secondary snapshot requires query capability');
  const sourceRows = {}; const beforeRows = {};
  const read = async (sql) => {
    const result = await connection.query(sql);
    if (!Array.isArray(result) || !Array.isArray(result[0])) throw new Error('Armor secondary snapshot query must return rows');
    return structuredClone(result[0]);
  };
  for (const [key, table] of Object.entries(ARMOR_SECONDARY_SOURCE_TABLES)) {
    let sql = `SELECT * FROM ${table}`;
    if (key === 'maint_landings') sql += ' WHERE id IN (SELECT DISTINCT landing_source_id FROM terria_v1_maint.maint_armor_attribute_rows)';
    if (key === 'local_items') sql = `SELECT id, internal_name, status, deleted FROM ${table}`;
    if (key === 'maint_items') sql = `SELECT id, source_id, internal_name, name_zh, english_name, defense_value, raw_json, status, deleted FROM ${table}`;
    sourceRows[key] = await read(`${sql} ORDER BY id${forUpdate ? ' FOR SHARE' : ''}`);
  }
  for (const table of ARMOR_SECONDARY_PROJECTION_TABLES) {
    beforeRows[table] = await read(`SELECT * FROM terria_v1_relation.${table} ORDER BY id${forUpdate ? ' FOR UPDATE' : ''}`);
  }
  return { sourceRows, beforeRows };
}

async function readProjectionRows(connection) {
  const rows = {};
  for (const table of ARMOR_SECONDARY_PROJECTION_TABLES) {
    const result = await connection.query(`SELECT * FROM terria_v1_relation.${table} ORDER BY id`);
    if (!Array.isArray(result?.[0])) throw new Error('Armor secondary terminal readback must return rows');
    rows[table] = result[0];
  }
  return rows;
}

function sqlValue(value, column) {
  if (value != null && (column.endsWith('_timestamp') || column.endsWith('_at'))) return new Date(value);
  return value;
}

function normalizeFailure(cause) {
  return cause instanceof Error && Object.isExtensible(cause) ? cause
    : new Error(cause instanceof Error ? cause.message : String(cause), { cause });
}

export async function executeArmorSecondaryProjectionTransaction({
  connection, proposal, assertRuntimeFence, consumePermit, persistPrepared, persistOutcome,
} = {}) {
  if (['query', 'execute', 'beginTransaction', 'commit', 'rollback'].some(key => typeof connection?.[key] !== 'function')
      || [assertRuntimeFence, consumePermit, persistPrepared, persistOutcome].some(fn => typeof fn !== 'function')) {
    throw new Error('Armor secondary execution requires connection, authorization, permit and durable evidence adapters');
  }
  const bound = structuredClone(proposal);
  await validateArmorSecondaryProjectionProposal(bound);
  let began = false; let prepared = false; let committing = false; let committed = false;
  let permitConsumed = false; let affectedRows = 0;
  const evidence = {
    schemaVersion: 'armor-secondary-projection-execution/v1', operationId: bound.operationId,
    proposalSha256: bound.proposalSha256, sourceSha256: bound.sourceSha256,
    beforeSha256: bound.beforeSha256, afterSha256: bound.afterSha256,
    serverUuid: bound.serverUuid, insertBindings: bound.insertBindings,
    selectedMemberIds: bound.selectedMemberIds, coverage: bound.coverage,
  };
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction(); began = true;
    await assertRuntimeFence();
    const [servers] = await connection.query('SELECT @@server_uuid AS serverUuid');
    if (servers.length !== 1 || servers[0].serverUuid !== bound.serverUuid) throw new Error('Armor secondary server UUID drift');
    const locked = await readArmorSecondarySnapshot({ connection, forUpdate: true });
    const rederived = await buildArmorSecondaryProjectionProposal({ ...bound, ...locked });
    if (rederived.proposalSha256 !== bound.proposalSha256) throw new Error('Armor secondary locked proposal drift');
    await assertRuntimeFence();
    await persistPrepared({ ...structuredClone(evidence), status: 'PREPARED' }); prepared = true;
    await consumePermit(); permitConsumed = true;
    for (const table of ARMOR_SECONDARY_PROJECTION_TABLES) {
      const columns = ARMOR_SECONDARY_COLUMNS[table];
      for (const row of bound.inserts[table]) {
        const [receipt] = await connection.execute(
          `INSERT INTO \`terria_v1_relation\`.\`${table}\` (${columns.map(column => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          columns.map(column => sqlValue(row[column], column)),
        );
        if (receipt.affectedRows !== 1) throw new Error('Armor secondary insert receipt is not exactly one row');
        affectedRows += 1;
      }
      // The projection id is the stable identity. A semantic upstream repair may
      // replace a retired relation key while retaining that projection row.
      const mutable = columns.filter(column => column !== 'id');
      for (const row of bound.updates[table]) {
        const [receipt] = await connection.execute(
          `UPDATE \`terria_v1_relation\`.\`${table}\` SET ${mutable.map(column => `\`${column}\` = ?`).join(', ')} WHERE \`id\` = ?`,
          [...mutable.map(column => sqlValue(row[column], column)), row.id],
        );
        if (receipt.affectedRows !== 1) throw new Error('Armor secondary update receipt is not exactly one row');
        affectedRows += 1;
      }
    }
    const assertAfter = async () => {
      const actual = await readProjectionRows(connection);
      if (hashArmorSecondaryProjectionRows(actual) !== bound.afterSha256) throw new Error('Armor secondary exact after-set readback mismatch');
    };
    await assertAfter();
    await assertRuntimeFence();
    committing = true;
    await connection.commit(); committed = true;
    await assertAfter();
    const result = { ...structuredClone(evidence), status: 'COMMITTED', affectedRows,
      dispatchPermitConsumed: permitConsumed, terminalRowsSha256: bound.afterSha256,
      acceptance: affectedRows === 0 ? 'mechanism-no-op-only' : 'bounded-projection-repair-only' };
    await persistOutcome(result);
    return result;
  } catch (cause) {
    const error = normalizeFailure(cause);
    error.suppressedErrors = [];
    error.transactionCommitted = committed ? true : committing ? null : false;
    error.requiresReadbackReconciliation = committing;
    error.dispatchPermitConsumed = permitConsumed;
    let status = committed ? 'COMMITTED_READBACK_REQUIRED' : committing ? 'COMMIT_UNKNOWN' : 'NOT_STARTED';
    if (began && !committing) {
      try { await connection.rollback(); status = 'ROLLBACK_CONFIRMED'; }
      catch (rollbackError) {
        error.suppressedErrors.push(normalizeFailure(rollbackError));
        error.requiresReadbackReconciliation = true;
        status = 'ROLLBACK_UNKNOWN';
      }
    }
    if (prepared) {
      try { await persistOutcome({ ...structuredClone(evidence), status, affectedRows,
        dispatchPermitConsumed: permitConsumed, error: error.message,
        requiresReadbackReconciliation: error.requiresReadbackReconciliation }); }
      catch (outcomeError) {
        error.suppressedErrors.push(normalizeFailure(outcomeError));
        error.requiresReadbackReconciliation = true;
      }
    }
    throw error;
  }
}
