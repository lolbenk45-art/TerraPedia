import { BUFF_CANDIDATE_COLUMNS, normalizeBuffRowValue } from './sync-buffs-to-relation.mjs';

const TABLES = Object.freeze([
  'relation_buffs',
  'item_buff_relations',
  'npc_buff_relations',
  'relation_buff_images',
  'projection_buffs',
]);

const REQUIRED_PACKET_FIELDS = Object.freeze(['runId', 'fenceToken', 'serverUuid', 'actor']);
const MAINT_COLUMNS = Object.freeze(('source_id internal_name english_name name_zh source_provider source_page source_revision_timestamp landing_source_id landing_source_key landing_source_page landing_content_hash landing_fetched_at landing_parsed_at module_generated_at terraria_version major_value combat_value defense_value use_time stack_size width height flags_json raw_json status deleted').split(' '));

export async function executeBuffCanonicalTransaction({
  envelope,
  packet,
  connection,
  lockRuntime,
  readLockedRows,
  consumeDispatchPermit,
  applyMutation,
  applyUpstream,
  verifyAfter,
} = {}) {
  validateEnvelope(envelope);
  validatePacket(packet);
  if (!connection || typeof connection.beginTransaction !== 'function'
      || typeof connection.commit !== 'function' || typeof connection.rollback !== 'function') {
    throw new TypeError('Buff canonical transaction connection is required');
  }
  for (const [name, callback] of Object.entries({ lockRuntime, readLockedRows, consumeDispatchPermit, applyUpstream, applyMutation, verifyAfter })) {
    if (typeof callback !== 'function') throw new TypeError(`Buff canonical transaction ${name} callback is required`);
  }

  let begun = false;
  try {
    await connection.beginTransaction();
    begun = true;
    await lockRuntime({ packet, envelope });
    await readLockedRows({ packet, envelope });
    await consumeDispatchPermit({ packet, envelope });
    await applyUpstream({ packet, envelope });
    await applyMutation({ packet, envelope });
    await verifyAfter({ packet, envelope });
    await connection.commit();
    return Object.freeze({ status: 'completed' });
  } catch (error) {
    if (begun) await connection.rollback();
    throw error;
  }
}

export async function applyBuffCanonicalMutation({
  envelope,
  connection,
  database = 'terria_v1_relation',
  writeTimestamp = null,
} = {}) {
  validateEnvelope(envelope);
  if (!connection || typeof connection.execute !== 'function') {
    throw new TypeError('Buff mutation writer connection is required');
  }
  if (database !== 'terria_v1_relation') throw new Error('Buff mutation database is invalid');
  const counts = { inserts: 0, updates: 0 };
  for (const table of TABLES) {
    const changes = envelope.mutation.changes[table];
    for (const change of changes.updates) {
      const before = change?.before;
      const after = change?.after;
      const keyColumn = table === 'projection_buffs' ? 'id' : 'record_key';
      const keyValue = after?.[keyColumn] ?? before?.[keyColumn];
      if (keyValue == null) throw new Error(`Buff update identity is missing: ${table}`);
      const changedColumns = change.changedColumns;
      if (changedColumns.length === 0) continue;
      const assignments = changedColumns.map((column) => `${quote(column)} = ?`);
      const values = changedColumns.map((column) => after[column]);
      if (writeTimestamp != null && !changedColumns.includes('updated_at')) {
        assignments.push(`${quote('updated_at')} = ?`);
        values.push(writeTimestamp);
      }
      values.push(keyValue);
      const [result] = await connection.execute(
        `UPDATE ${quote(database)}.${quote(table)} SET ${assignments.join(', ')} WHERE ${quote(keyColumn)} = ?`,
        values,
      );
      if (Number(result?.affectedRows ?? 0) !== 1) throw new Error(`Buff update receipt is invalid: ${table}`);
      counts.updates += 1;
    }
    for (const row of changes.inserts) {
      const values = { ...row };
      if (table !== 'projection_buffs') delete values.id;
      const columns = Object.keys(values).filter((column) => values[column] !== undefined);
      if (columns.length === 0) throw new Error(`Buff insert row is empty: ${table}`);
      const [result] = await connection.execute(
        `INSERT INTO ${quote(database)}.${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((column) => values[column]),
      );
      if (Number(result?.affectedRows ?? 0) !== 1) throw new Error(`Buff insert receipt is invalid: ${table}`);
      counts.inserts += 1;
    }
  }
  return Object.freeze(counts);
}


export async function applyBuffMaintMutation({ envelope, connection, database = 'terria_v1_maint' } = {}) {
  validateEnvelope(envelope);
  if (database !== 'terria_v1_maint') throw new Error('Buff maint mutation database is invalid');
  if (!connection || typeof connection.execute !== 'function') throw new TypeError('Buff maint connection is required');
  const plan = envelope.upstream.maint;
  const counts = { inserts: 0, updates: 0 };
  const columns = MAINT_COLUMNS;
  for (const row of plan.inserts) {
    const values = columns.map(column => row[column]);
    const [result] = await connection.execute(
      `INSERT INTO \`terria_v1_maint\`.\`maint_buffs\` (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      values,
    );
    if (Number(result?.affectedRows ?? 0) !== 1) throw new Error('Buff maint insert receipt is invalid');
    counts.inserts += 1;
  }
  for (const change of plan.updates) {
    const columnsToUpdate = change.changedColumns.filter(column => column !== 'id' && column !== 'source_id');
    if (columnsToUpdate.length === 0) continue;
    const [result] = await connection.execute(
      `UPDATE \`terria_v1_maint\`.\`maint_buffs\` SET ${columnsToUpdate.map(column => `${quote(column)} = ?`).join(', ')} WHERE \`id\` = ?`,
      [...columnsToUpdate.map(column => change.after[column]), change.before.id],
    );
    if (Number(result?.affectedRows ?? 0) !== 1) throw new Error('Buff maint update receipt is invalid');
    counts.updates += 1;
  }
  return Object.freeze(counts);
}

function validateEnvelope(envelope) {
  if (envelope?.upstream?.landing != null) {
    throw new Error('Buff deferred landing lineage integration is incomplete');
  }
  if (!envelope || envelope.schemaVersion !== 'buff-full-chain-execution/v1'
      || envelope.executable !== true || envelope.executionBlocker != null) {
    throw new Error('Buff canonical transaction envelope is not executable');
  }
  if (!envelope.upstream?.maint || envelope.upstream.maint.table !== 'terria_v1_maint.maint_buffs') {
    throw new Error('Buff canonical transaction upstream maint plan is required');
  }
  const mutation = envelope.mutation;
  if (!mutation || mutation.destructiveClear !== false) {
    throw new Error('Buff canonical transaction mutation is invalid');
  }
  if (!Array.isArray(mutation.deletes) || mutation.deletes.length !== 0) {
    throw new Error('Buff canonical transaction deletes are forbidden');
  }
  if (!mutation.changes || TABLES.some((table) => !Array.isArray(mutation.changes[table]?.inserts)
      || !Array.isArray(mutation.changes[table]?.updates)
      || !Array.isArray(mutation.changes[table]?.unchanged)
      || !Array.isArray(mutation.changes[table]?.preserved))) {
    throw new Error('Buff canonical transaction change scope is incomplete');
  }
  if (Object.keys(mutation.changes).some((table) => !TABLES.includes(table))) {
    throw new Error('Buff canonical transaction change scope contains an unowned table');
  }
  for (const table of TABLES) {
    const changes = mutation.changes[table];
    const allowed = new Set(BUFF_CANDIDATE_COLUMNS[table].split(' '));
    const immutable = new Set(['id', 'record_key', 'created_at', 'updated_at',
      ...({
        relation_buffs: ['source_id', 'internal_name'],
        projection_buffs: ['source_id', 'internal_name', 'relation_record_key'],
        item_buff_relations: ['buff_source_id', 'buff_internal_name', 'item_source_id', 'item_internal_name', 'relation_type'],
        npc_buff_relations: ['buff_source_id', 'buff_internal_name', 'npc_source_id', 'npc_internal_name', 'relation_type'],
        relation_buff_images: ['buff_internal_name', 'role', 'source_file_title'],
      })[table],
    ]);
    const validateRow = (row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)
          || Object.keys(row).some((column) => !allowed.has(column) || row[column] === undefined)) {
        throw new Error(`Buff mutation row has an unowned column or missing value: ${table}`);
      }
    };
    for (const row of changes.inserts) validateRow(row);
    for (const change of changes.updates) {
      validateRow(change?.before);
      validateRow(change?.after);
      const columns = change.changedColumns;
      if (!Array.isArray(columns) || columns.length === 0 || new Set(columns).size !== columns.length
          || columns.some((column) => !allowed.has(column) || immutable.has(column)
            || !Object.hasOwn(change.after, column))) {
        throw new Error(`Buff mutation changed columns or identity are invalid: ${table}`);
      }
      const actual = [...new Set([...Object.keys(change.before), ...Object.keys(change.after)])]
        .filter((column) => JSON.stringify(normalizeBuffRowValue(change.before[column], column))
          !== JSON.stringify(normalizeBuffRowValue(change.after[column], column))).sort();
      if (JSON.stringify(actual) !== JSON.stringify([...columns].sort())) {
        throw new Error(`Buff mutation changed columns do not match before/after: ${table}`);
      }
    }
  }
}

function validatePacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    throw new Error('Buff canonical transaction packet is required');
  }
  for (const field of REQUIRED_PACKET_FIELDS) {
    if (typeof packet[field] !== 'string' || !packet[field].trim()) {
      throw new Error(`Buff canonical transaction packet ${field} is required`);
    }
  }
}

function quote(identifier) {
  if (typeof identifier !== 'string' || !/^[a-z][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Buff SQL identifier is invalid: ${identifier ?? ''}`);
  }
  return `\`${identifier}\``;
}

export { TABLES as BUFF_CANONICAL_TRANSACTION_TABLES };
