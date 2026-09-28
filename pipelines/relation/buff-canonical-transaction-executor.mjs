const TABLES = Object.freeze([
  'relation_buffs',
  'item_buff_relations',
  'npc_buff_relations',
  'relation_buff_images',
  'projection_buffs',
]);

const REQUIRED_PACKET_FIELDS = Object.freeze(['runId', 'fenceToken', 'serverUuid', 'actor']);

export async function executeBuffCanonicalTransaction({
  envelope,
  packet,
  connection,
  lockRuntime,
  readLockedRows,
  consumeDispatchPermit,
  applyMutation,
  verifyAfter,
} = {}) {
  validateEnvelope(envelope);
  validatePacket(packet);
  if (!connection || typeof connection.beginTransaction !== 'function'
      || typeof connection.commit !== 'function' || typeof connection.rollback !== 'function') {
    throw new TypeError('Buff canonical transaction connection is required');
  }
  for (const [name, callback] of Object.entries({ lockRuntime, readLockedRows, consumeDispatchPermit, applyMutation, verifyAfter })) {
    if (typeof callback !== 'function') throw new TypeError(`Buff canonical transaction ${name} callback is required`);
  }

  let begun = false;
  try {
    await connection.beginTransaction();
    begun = true;
    await lockRuntime({ packet, envelope });
    await readLockedRows({ packet, envelope });
    consumeDispatchPermit({ packet, envelope });
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
  if (!/^[a-z][a-z0-9_]*$/.test(database)) throw new Error('Buff mutation database is invalid');
  const counts = { inserts: 0, updates: 0 };
  for (const table of TABLES) {
    const changes = envelope.mutation.changes[table];
    for (const change of changes.updates) {
      const before = change?.before;
      const after = change?.after;
      const keyColumn = table === 'projection_buffs' ? 'id' : 'record_key';
      const keyValue = after?.[keyColumn] ?? before?.[keyColumn];
      if (keyValue == null) throw new Error(`Buff update identity is missing: ${table}`);
      const changedColumns = Array.isArray(change.changedColumns) && change.changedColumns.length > 0
        ? change.changedColumns
        : Object.keys(after ?? {}).filter((column) => !['id', 'record_key', 'created_at', 'updated_at'].includes(column)
          && after[column] !== before?.[column]);
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

function validateEnvelope(envelope) {
  if (!envelope || envelope.schemaVersion !== 'buff-full-chain-execution/v1'
      || envelope.executable !== true || envelope.executionBlocker != null) {
    throw new Error('Buff canonical transaction envelope is not executable');
  }
  const mutation = envelope.mutation;
  if (!mutation || mutation.destructiveClear !== false && mutation.deletes?.length > 0) {
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
