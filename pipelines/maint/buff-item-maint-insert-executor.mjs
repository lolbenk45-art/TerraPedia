import {
  buildBuffItemMaintInsertProposal,
  hashBuffItemMaintValue,
  normalizeBuffItemMaintSnapshot,
  BUFF_ITEM_MAINT_INSERT_COLUMNS,
  BUFF_ITEM_LANDING_INSERT_COLUMNS,
  BUFF_ITEM_LANDING_SNAPSHOT_COLUMNS,
  BUFF_ITEM_MAINT_OWNERSHIP_KEYS,
  BUFF_ITEM_MAINT_INSERT_OPERATION_ID,
} from './buff-item-maint-insert-contract.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

// The registered runner must verify Owner/server/policy/fence under lock and
// consume the canonical one-use permit. This core supplies no CLI authority.
export async function executeBuffItemMaintInsertTransaction({
  proposal: suppliedProposal,
  authorization: suppliedAuthorization,
  connection,
  readSource,
  lockRuntime,
  readLockedRows,
  consumeDispatchPermit,
  retainOwnershipFences,
  releaseOwnershipFences,
  readAfterRows,
  journal,
} = {}) {
  const proposal = freeze(clone(suppliedProposal));
  const authorization = freeze(clone(suppliedAuthorization));
  assertAuthorization(authorization, proposal);
  for (const [name, callback] of Object.entries({ readSource, lockRuntime, readLockedRows, consumeDispatchPermit, retainOwnershipFences, releaseOwnershipFences, readAfterRows })) {
    if (typeof callback !== 'function') throw new Error(`Item maint transaction ${name} callback is required`);
  }
  for (const name of ['beginTransaction', 'execute', 'commit', 'rollback']) {
    if (typeof connection?.[name] !== 'function') throw new Error(`Item maint connection ${name} is required`);
  }
  for (const name of ['prepared', 'materialized', 'rolledBack', 'commitUnknown', 'committed', 'rollbackUnknown']) {
    if (typeof journal?.[name] !== 'function') throw new Error(`Item maint journal ${name} callback is required`);
  }
  await assertRederivation({ proposal, source: await readSource(), snapshot: proposal.before });
  await retainOwnershipFences({ proposal, authorization });
  let ownershipHeld = true;
  let begun = false;
  let commitAttempted = false;
  let committed = false;
  let prepared = false;
  const evidence = { operationId: proposal.operationId, runId: proposal.runId,
    decisionIdentity: authorization.decisionIdentity, packetHash: authorization.packetHash,
    executionManifestHash: authorization.executionManifestHash,
    contractHash: proposal.contractHash, beforeHash: proposal.beforeHash,
    landingId: null, maintReceipts: [], afterHash: null };
  try {
    await connection.beginTransaction();
    begun = true;
    await lockRuntime({ proposal, authorization });
    const locked = normalizeBuffItemMaintSnapshot(await readLockedRows({ proposal, authorization }));
    if (hashBuffItemMaintValue(locked) !== proposal.beforeHash) throw new Error('Item maint locked baseline drifted');
    await assertRederivation({ proposal, source: await readSource(), snapshot: locked });
    assertBuffItemMaintAuthorizationValidity(authorization);
    await journal.prepared(clone(evidence));
    prepared = true;
    assertBuffItemMaintAuthorizationValidity(authorization);
    await consumeDispatchPermit({ proposal, authorization });
    assertBuffItemMaintAuthorizationValidity(authorization);

    const landingId = await insertRow(connection, 'terria_v1_local', 'source_dataset_landings',
      BUFF_ITEM_LANDING_INSERT_COLUMNS, proposal.landing);
    evidence.landingId = landingId;
    if (locked.landingRows.some(row => row.id === landingId)) throw new Error('Item landing receipt collides with the baseline');
    const [landingRows] = await connection.execute(
      `SELECT ${BUFF_ITEM_LANDING_SNAPSHOT_COLUMNS.map(quote).join(', ')}
       FROM \`terria_v1_local\`.\`source_dataset_landings\` WHERE id = ? FOR UPDATE`, [landingId],
    );
    if (!Array.isArray(landingRows) || landingRows.length !== 1) throw new Error('Item landing insert readback is missing');
    const landing = normalizeBuffItemMaintSnapshot({ maintRows: [], landingRows }).landingRows[0];
    assertInsertedRow(landing, proposal.landing, landingId, BUFF_ITEM_LANDING_INSERT_COLUMNS, 'landing insert readback');

    const ids = new Set(locked.maintRows.map(row => row.id));
    for (const row of proposal.maintInserts) {
      const insert = { ...row, landing_source_id: landingId };
      const maintRowId = await insertRow(connection, 'terria_v1_maint', 'maint_items', BUFF_ITEM_MAINT_INSERT_COLUMNS, insert);
      if (ids.has(maintRowId)) throw new Error('Item maint receipt collides with an existing or newly inserted primary key');
      ids.add(maintRowId);
      evidence.maintReceipts.push({ sourceId: row.source_id, internalName: row.internal_name, maintRowId, landingId });
    }
    const after = normalizeBuffItemMaintSnapshot(await readAfterRows({ proposal, authorization }));
    assertAfterSet({ proposal, after, evidence });
    evidence.afterHash = hashBuffItemMaintValue(after);
    await journal.materialized(clone(evidence));
    assertBuffItemMaintAuthorizationValidity(authorization);
    commitAttempted = true;
    await connection.commit();
    committed = true;
    await journal.committed(clone(evidence));
    return { status: 'committed', ...evidence };
  } catch (error) {
    if (committed) throw outcomeError(error, 'committed');
    if (commitAttempted) {
      let journalError;
      try { await journal.commitUnknown({ ...clone(evidence), error: error.message }); } catch (failure) { journalError = failure; }
      throw outcomeError(journalError ? new AggregateError([error, journalError], 'COMMIT outcome and journal publication are uncertain') : error, 'unknown');
    }
    if (begun) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        let journalError;
        try { await journal.rollbackUnknown({ ...clone(evidence), error: rollbackError.message }); } catch (failure) { journalError = failure; }
        throw outcomeError(new AggregateError([error, rollbackError, ...(journalError ? [journalError] : [])], 'ROLLBACK outcome is uncertain'), 'unknown');
      }
      if (prepared) {
        try { await journal.rolledBack({ ...clone(evidence), error: error.message }); } catch (journalError) {
          throw outcomeError(new AggregateError([error, journalError], 'Transaction rolled back but terminal evidence is missing'), 'rolled-back');
        }
      }
      try {
        await releaseOwnershipFences({ proposal, authorization });
        ownershipHeld = false;
      } catch (releaseError) {
        const uncertain = outcomeError(new AggregateError([error, releaseError], 'Transaction rolled back but ownership fence release is uncertain'), 'rolled-back');
        uncertain.requiresReadbackReconciliation = true;
        throw uncertain;
      }
    }
    if (!begun && ownershipHeld) {
      try {
        await releaseOwnershipFences({ proposal, authorization });
        ownershipHeld = false;
      } catch (releaseError) {
        const uncertain = outcomeError(new AggregateError([error, releaseError], 'Pre-transaction ownership fence release is uncertain'), 'unknown');
        uncertain.requiresReadbackReconciliation = true;
        throw uncertain;
      }
    }
    throw outcomeError(error, begun ? 'rolled-back' : 'not-started');
  }
}

function assertAuthorization(context, proposal) {
  if (!context || context.authorizationStatus !== 'AUTHORIZED') throw new Error('Item maint insert authorization packet is required');
  assertBuffItemMaintAuthorizationValidity(context);
  if (context.operationId !== BUFF_ITEM_MAINT_INSERT_OPERATION_ID) throw new Error('Item maint insert operation identity drifted');
  if (!HASH_PATTERN.test(context.packetHash ?? '') || !context.decisionIdentity || !context.actor) {
    throw new Error('Item maint insert authorization identity is incomplete');
  }
  const manifest = context.executionManifest;
  if (!manifest || manifest.operationId !== context.operationId || manifest.executionClass !== 'formal_buff_item_maint_insert'
      || manifest.databaseWrites !== true || manifest.networkAccess !== false
      || hashBuffItemMaintValue(manifest) !== context.executionManifestHash
      || context.technical?.executionManifestHash !== context.executionManifestHash
      || JSON.stringify(manifest.ownershipKeys) !== JSON.stringify(BUFF_ITEM_MAINT_OWNERSHIP_KEYS)) {
    throw new Error('Item maint insert execution manifest binding drifted');
  }
  const binding = manifest.buffItemMaintInsert;
  if (!binding || binding.runId !== proposal?.runId || binding.contractHash !== proposal?.contractHash
      || JSON.stringify(binding.sourceIds) !== JSON.stringify(proposal?.maintInserts?.map(row => row.source_id))) {
    throw new Error('Item maint insert manifest proposal binding drifted');
  }
}

export function assertBuffItemMaintAuthorizationValidity(context) {
  const authorizedAt = typeof context.authorizedAt === 'string' ? Date.parse(context.authorizedAt) : NaN;
  const expiresAt = typeof context.expiresAt === 'string' ? Date.parse(context.expiresAt) : NaN;
  const now = Date.now();
  if (!Number.isFinite(authorizedAt) || !Number.isFinite(expiresAt)
      || authorizedAt >= expiresAt || now < authorizedAt || now >= expiresAt) {
    throw new Error('Item maint authorization packet validity is invalid or expired');
  }
}

async function assertRederivation({ proposal, source, snapshot }) {
  const derived = await buildBuffItemMaintInsertProposal({ source, runId: proposal.runId, ...snapshot });
  if (hashBuffItemMaintValue(derived) !== hashBuffItemMaintValue(proposal)) {
    throw new Error('Item maint source/proposal locked rederivation drifted');
  }
}

async function insertRow(connection, database, table, columns, row) {
  const [receipt] = await connection.execute(
    `INSERT INTO ${quote(database)}.${quote(table)} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map(column => row[column]),
  );
  const insertId = Number(receipt?.insertId);
  if (Number(receipt?.affectedRows) !== 1 || typeof receipt?.insertId === 'boolean'
      || !Number.isSafeInteger(insertId) || insertId <= 0) {
    throw new Error(`Item ${table} insert receipt must contain exactly one real generated ID`);
  }
  return insertId;
}

function assertAfterSet({ proposal, after, evidence }) {
  const insertedMaint = new Set(evidence.maintReceipts.map(row => row.maintRowId));
  const preserved = { maintRows: after.maintRows.filter(row => !insertedMaint.has(row.id)),
    landingRows: after.landingRows.filter(row => row.id !== evidence.landingId) };
  if (hashBuffItemMaintValue(preserved) !== proposal.beforeHash
      || after.maintRows.length !== proposal.before.maintRows.length + 6
      || after.landingRows.length !== proposal.before.landingRows.length + 1) {
    throw new Error('Item maint after-set does not preserve the exact baseline');
  }
  assertInsertedRow(after.landingRows.find(row => row.id === evidence.landingId), proposal.landing,
    evidence.landingId, BUFF_ITEM_LANDING_INSERT_COLUMNS, 'landing after-set');
  for (const receipt of evidence.maintReceipts) {
    const expected = { ...proposal.maintInserts.find(row => row.source_id === receipt.sourceId), landing_source_id: evidence.landingId };
    assertInsertedRow(after.maintRows.find(row => row.id === receipt.maintRowId), expected,
      receipt.maintRowId, BUFF_ITEM_MAINT_INSERT_COLUMNS, 'maint after-set');
  }
}

function assertInsertedRow(actual, expected, id, columns, label) {
  if (!actual || actual.id !== id || columns.some(column => actual[column] !== expected[column])) {
    throw new Error(`Item ${label} drifted`);
  }
}

function outcomeError(error, outcome) {
  error.transactionOutcome = outcome;
  return error;
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function quote(identifier) {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) throw new Error('Invalid Item insert SQL identifier');
  return `\`${identifier}\``;
}
