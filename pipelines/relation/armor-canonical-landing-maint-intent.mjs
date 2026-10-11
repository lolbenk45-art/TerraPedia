import { createHash } from 'node:crypto';

import { validateArmorSourceEvidenceTransition } from '../landing/armor-source-evidence-transition.mjs';

export const ARMOR_CANONICAL_LANDING_MAINT_INTENT_SCHEMA = 'armor-canonical-landing-maint-intent/v1';
export const ARMOR_CANONICAL_LANDING_MAINT_OPERATION_ID = 'canonical-armor-ingestion';

const HASH = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const LANDING_TABLE = 'source_dataset_landings';
const LANDING_DATABASE_ROLE = 'local';
const MAINT_DATABASE_ROLE = 'maint';
const MAINT_TABLES = ['maint_armor_sets', 'maint_armor_set_images'];
const LANDING_GENERATED_COLUMNS = ['created_at', 'current_slot', 'id', 'updated_at'];
const MAINT_GENERATED_COLUMNS = ['created_at', 'id', 'updated_at'];

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(value));
}

function compareStable(left, right) {
  const leftKey = stable(left);
  const rightKey = stable(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`${label} is required`);
  return value;
}

function positiveId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function hashValue(value, label) {
  if (!HASH.test(value ?? '')) throw new Error(`${label} must be a sha256 hash`);
  return value;
}

function utcSecond(value, label) {
  text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid second-precision UTC timestamp`);
  }
  if (new Date(value).toISOString().slice(0, 19) + 'Z' !== value) throw new Error(`${label} has an invalid UTC calendar date`);
  return value;
}

function exactSet(left, right) {
  return left.length === right.length && left.every(value => right.includes(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function omit(value, keys) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.has(key)));
}

function landingIdentity(row) {
  return [row.dataset_type, row.provider, row.source_key, row.source_page].map(value => text(value, 'landing identity')).join('|');
}

function maintIdentity(table, row) {
  if (!MAINT_TABLES.includes(table) || !/^[a-f0-9]{64}$/.test(row?.record_key ?? '')) {
    throw new Error(`Armor ${table} insert record_key is invalid`);
  }
  return row.record_key;
}

function validateLandingBaseline(rows) {
  if (!Array.isArray(rows)) throw new Error('Armor landing baseline rows are required');
  const ids = new Set();
  const identities = new Set();
  for (const row of rows) {
    plainObject(row, 'Armor landing baseline row');
    if (!positiveId(row.id) || ids.has(row.id)) throw new Error('Armor landing baseline IDs are invalid or duplicate');
    if (![0, 1].includes(Number(row.is_current)) || row.current_slot !== (Number(row.is_current) === 1 ? 1 : null)) {
      throw new Error('Armor landing baseline current marker is invalid');
    }
    const identity = landingIdentity(row);
    if (Number(row.is_current) === 1 && identities.has(identity)) {
      throw new Error(`Armor landing baseline current identity is duplicate: ${identity}`);
    }
    ids.add(row.id);
    if (Number(row.is_current) === 1) identities.add(identity);
  }
  return { ids, identities };
}

function validateMaintBaseline(rows) {
  plainObject(rows, 'Armor maint baseline');
  for (const table of MAINT_TABLES) {
    if (!Array.isArray(rows[table])) throw new Error(`Armor maint baseline ${table} is required`);
    const ids = new Set();
    const keys = new Set();
    for (const row of rows[table]) {
      plainObject(row, `Armor ${table} baseline row`);
      if (!positiveId(row.id) || ids.has(row.id) || !/^[a-f0-9]{64}$/.test(row.record_key ?? '') || keys.has(row.record_key)) {
        throw new Error(`Armor ${table} baseline identity is invalid or duplicate`);
      }
      ids.add(row.id);
      keys.add(row.record_key);
    }
  }
}

function validateMaintCandidate(candidate) {
  plainObject(candidate, 'Armor maint candidate');
  if (candidate.schemaVersion !== 'armor-canonical-maint-candidate/v1' || candidate.executable !== false
      || candidate.executionBlocker !== 'registered-full-chain-executor-required'
      || !Array.isArray(candidate.tables) || !exactSet(candidate.tables, MAINT_TABLES)
      || !Array.isArray(candidate.deletes) || candidate.deletes.length !== 0) {
    throw new Error('Armor maint candidate identity is invalid');
  }
  for (const table of MAINT_TABLES) {
    const changes = candidate.changes?.[table];
    if (!changes || !Array.isArray(changes.inserts) || !Array.isArray(changes.updates)
        || !Array.isArray(changes.unchanged) || !Array.isArray(changes.preserved)) {
      throw new Error(`Armor maint candidate ${table} changes are incomplete`);
    }
    const identities = new Set();
    for (const row of changes.inserts) {
      if (Object.hasOwn(row, 'id')) throw new Error(`Armor maint candidate insert has an allocated ID: ${table}`);
      const identity = maintIdentity(table, row);
      if (identities.has(identity)) throw new Error(`Armor maint candidate insert identity is duplicate: ${identity}`);
      identities.add(identity);
    }
  }
  hashValue(candidate.sourceSnapshotSha256, 'Armor maint source snapshot hash');
  hashValue(candidate.baselineSha256, 'Armor maint baseline hash');
  return candidate;
}

function landingPlan(row) {
  const logicalKey = landingIdentity(row);
  if (Object.hasOwn(row, 'id') || Object.hasOwn(row, 'current_slot')) {
    throw new Error(`Armor landing insert carries an allocated/generated ID: ${logicalKey}`);
  }
  return {
    databaseRole: LANDING_DATABASE_ROLE,
    table: LANDING_TABLE,
    logicalKey,
    primaryKeyColumn: 'id',
    generatedColumns: [...LANDING_GENERATED_COLUMNS],
    nonGeneratedFields: omit(row, new Set(['id', 'current_slot', 'created_at', 'updated_at'])),
    references: [],
  };
}

function maintDataset(table) {
  return table === 'maint_armor_sets' ? 'armor_sets_raw' : 'armor_set_images_raw';
}

function maintLandingIdentity(table, row) {
  return [maintDataset(table), row.source_provider, row.landing_source_key, row.landing_source_page].map(value => text(value, 'Armor maint landing identity')).join('|');
}

function maintPlan(table, row, insertedLandingPlans, landingById) {
  const logicalKey = maintIdentity(table, row);
  const references = [];
  const fields = { ...row };
  delete fields.id;
  delete fields.created_at;
  delete fields.updated_at;
  if (row.landing_source_id == null) {
    const target = maintLandingIdentity(table, row);
    const landing = insertedLandingPlans.get(target);
    if (!landing || landing.nonGeneratedFields.content_hash !== row.landing_content_hash) {
      throw new Error(`Armor maint landing reference is not a matching frozen landing insert: ${target}`);
    }
    references.push({ column: 'landing_source_id', target: `${LANDING_DATABASE_ROLE}.${LANDING_TABLE}|${target}` });
    delete fields.landing_source_id;
  } else {
    const landing = landingById.get(row.landing_source_id);
    if (!positiveId(row.landing_source_id) || !landing
        || landingIdentity(landing) !== maintLandingIdentity(table, row)
        || landing.content_hash !== row.landing_content_hash) {
      throw new Error(`Armor maint landing_source_id is not an existing frozen landing row: ${logicalKey}`);
    }
  }
  if (Object.hasOwn(fields, 'current_slot')) throw new Error(`Armor maint insert carries an unexpected generated slot: ${logicalKey}`);
  return {
    databaseRole: MAINT_DATABASE_ROLE,
    table,
    logicalKey,
    primaryKeyColumn: 'id',
    generatedColumns: [...MAINT_GENERATED_COLUMNS],
    nonGeneratedFields: fields,
    references,
  };
}

function buildBody({ landingTransition, landingCurrentRows, maintBaselineRows, maintCandidate, writeTimestamp } = {}) {
  validateArmorSourceEvidenceTransition(landingTransition);
  const landingBaseline = validateLandingBaseline(landingCurrentRows);
  const normalizedMaintBaselineRows = structuredClone(maintBaselineRows);
  for (const table of MAINT_TABLES) {
    normalizedMaintBaselineRows[table].sort((left, right) => compareStable(
      [left.text_key, left.image_role, left.source_file_title],
      [right.text_key, right.image_role, right.source_file_title],
    ));
  }
  validateMaintBaseline(normalizedMaintBaselineRows);
  validateMaintCandidate(maintCandidate);
  utcSecond(writeTimestamp, 'Armor landing/maint intent writeTimestamp');
  const landingPlans = landingTransition.inserts.map(landingPlan);
  const insertedLandingPlans = new Map(landingPlans.map(plan => [plan.logicalKey, plan]));
  const landingById = new Map(landingCurrentRows.map(row => [row.id, row]));
  const maintPlans = MAINT_TABLES.flatMap(table => maintCandidate.changes[table].inserts.map(row => maintPlan(
    table, row, insertedLandingPlans, landingById,
  )));
  const insertPlans = [...landingPlans, ...maintPlans];
  const identities = new Set();
  for (const plan of insertPlans) {
    const identity = `${plan.databaseRole}.${plan.table}|${plan.logicalKey}`;
    if (identities.has(identity)) throw new Error(`Armor landing/maint insert identity is duplicate: ${identity}`);
    identities.add(identity);
  }
  const snapshots = {
    landingCurrentRows: structuredClone(landingCurrentRows),
    landingTransition: structuredClone(landingTransition),
    maintBaselineRows: normalizedMaintBaselineRows,
    maintCandidate: structuredClone(maintCandidate),
  };
  const generatedIdDeclarations = insertPlans.map(plan => ({
    databaseRole: plan.databaseRole, table: plan.table, logicalKey: plan.logicalKey,
    column: 'id', kind: 'generated_primary_key', value: null,
  }));
  const referenceDeclarations = insertPlans.flatMap(plan => plan.references.map(reference => ({
    databaseRole: plan.databaseRole, table: plan.table, logicalKey: plan.logicalKey,
    column: reference.column, target: reference.target,
  })));
  return {
    schemaVersion: ARMOR_CANONICAL_LANDING_MAINT_INTENT_SCHEMA,
    operationId: ARMOR_CANONICAL_LANDING_MAINT_OPERATION_ID,
    executable: false,
    executionBlocker: 'registered-full-chain-executor-required',
    writeTimestamp,
    sourceSnapshotSha256: hash(landingTransition),
    baselineSha256: hash({ landingCurrentRows, maintBaselineRows: normalizedMaintBaselineRows }),
    inputSha256: hash(snapshots),
    snapshots,
    insertPlans,
    generatedIdDeclarations,
    referenceDeclarations,
    demotions: structuredClone(landingTransition.demotions),
  };
}

export function buildArmorCanonicalLandingMaintIntent(input = {}) {
  const body = buildBody(input);
  return deepFreeze({ ...body, intentSha256: hash(body) });
}

function validateReceipt(receipt, expected, writeTimestamp) {
  plainObject(receipt, 'Armor landing/maint insert receipt');
  const identity = `${text(receipt.databaseRole, 'receipt databaseRole')}.${text(receipt.table, 'receipt table')}|${text(receipt.logicalKey, 'receipt logicalKey')}`;
  if (identity !== `${expected.databaseRole}.${expected.table}|${expected.logicalKey}`) throw new Error(`foreign Armor receipt: ${identity}`);
  if (!positiveId(receipt.insertId) || receipt.affectedRows !== 1) throw new Error(`Armor receipt is invalid: ${identity}`);
  plainObject(receipt.readback, `Armor receipt ${identity} readback`);
  if (receipt.readback.id !== receipt.insertId) throw new Error(`Armor receipt ID readback drifted: ${identity}`);
  const generated = expected.generatedColumns;
  const allowed = new Set([...Object.keys(expected.nonGeneratedFields), ...expected.references.map(reference => reference.column), 'id', ...generated.filter(column => column !== 'id')]);
  if (!exactSet(Object.keys(receipt.readback), [...allowed])) throw new Error(`Armor receipt columns drifted: ${identity}`);
  for (const [column, value] of Object.entries(expected.nonGeneratedFields)) {
    if (stable(receipt.readback[column]) !== stable(value)) throw new Error(`Armor receipt field drifted: ${identity}.${column}`);
  }
  if (stable(receipt.readback.created_at) !== stable(writeTimestamp) || stable(receipt.readback.updated_at) !== stable(writeTimestamp)) {
    throw new Error(`Armor receipt timestamp drifted: ${identity}`);
  }
  if (expected.table === LANDING_TABLE) {
    const expectedSlot = expected.nonGeneratedFields.is_current === 1 ? 1 : null;
    if (receipt.readback.current_slot !== expectedSlot) throw new Error(`Armor landing current_slot drifted: ${identity}`);
  }
  return identity;
}

export function validateArmorCanonicalLandingMaintIntent(intent) {
  plainObject(intent, 'Armor landing/maint intent');
  if (intent.schemaVersion !== ARMOR_CANONICAL_LANDING_MAINT_INTENT_SCHEMA
      || intent.operationId !== ARMOR_CANONICAL_LANDING_MAINT_OPERATION_ID || intent.executable !== false
      || intent.executionBlocker !== 'registered-full-chain-executor-required') throw new Error('Armor landing/maint intent identity is invalid');
  utcSecond(intent.writeTimestamp, 'Armor landing/maint intent writeTimestamp');
  hashValue(intent.sourceSnapshotSha256, 'Armor landing/maint source snapshot hash');
  hashValue(intent.baselineSha256, 'Armor landing/maint baseline hash');
  hashValue(intent.inputSha256, 'Armor landing/maint input hash');
  if (!Array.isArray(intent.insertPlans) || !Array.isArray(intent.generatedIdDeclarations)
      || !Array.isArray(intent.referenceDeclarations)
      || !Array.isArray(intent.demotions) || !intent.snapshots) throw new Error('Armor landing/maint intent graph is incomplete');
  if (hash(intent.snapshots.landingTransition) !== intent.sourceSnapshotSha256) throw new Error('Armor landing/maint source snapshot drifted');
  if (hash({ landingCurrentRows: intent.snapshots.landingCurrentRows, maintBaselineRows: intent.snapshots.maintBaselineRows }) !== intent.baselineSha256) throw new Error('Armor landing/maint baseline drifted');
  if (hash(intent.snapshots) !== intent.inputSha256) throw new Error('Armor landing/maint input snapshot drifted');
  validateArmorSourceEvidenceTransition(intent.snapshots.landingTransition);
  validateLandingBaseline(intent.snapshots.landingCurrentRows);
  validateMaintBaseline(intent.snapshots.maintBaselineRows);
  validateMaintCandidate(intent.snapshots.maintCandidate);
  const ids = new Set();
  for (const plan of intent.insertPlans) {
    plainObject(plan, 'Armor landing/maint insert plan');
    if (!IDENTIFIER.test(plan.table) || !['local', 'maint'].includes(plan.databaseRole)) throw new Error('Armor landing/maint insert plan scope is invalid');
    if (plan.databaseRole === LANDING_DATABASE_ROLE && plan.table !== LANDING_TABLE) {
      throw new Error(`Armor landing/maint insert plan table is outside local landing scope: ${plan.table}`);
    }
    if (plan.databaseRole === MAINT_DATABASE_ROLE && !MAINT_TABLES.includes(plan.table)) {
      throw new Error(`Armor landing/maint insert plan table is outside maint scope: ${plan.table}`);
    }
    const identity = `${plan.databaseRole}.${plan.table}|${text(plan.logicalKey, 'insert plan logicalKey')}`;
    if (ids.has(identity)) throw new Error(`Armor landing/maint insert plan is duplicate: ${identity}`);
    ids.add(identity);
    const expectedColumns = plan.table === LANDING_TABLE ? LANDING_GENERATED_COLUMNS : MAINT_GENERATED_COLUMNS;
    if (!exactSet(plan.generatedColumns, expectedColumns)) throw new Error(`Armor landing/maint generated columns drifted: ${identity}`);
    if (!Array.isArray(plan.references)) throw new Error(`Armor landing/maint references are missing: ${identity}`);
    for (const reference of plan.references) {
      if (reference.column !== 'landing_source_id' || !reference.target.startsWith(`${LANDING_DATABASE_ROLE}.${LANDING_TABLE}|`)) {
        throw new Error(`Armor landing/maint reference is outside the typed graph: ${identity}`);
      }
      if (Object.hasOwn(plan.nonGeneratedFields, reference.column)) throw new Error(`Armor landing/maint reference is duplicated in fields: ${identity}`);
    }
  }
  const expectedDeclarations = intent.insertPlans.map(plan => ({
    databaseRole: plan.databaseRole, table: plan.table, logicalKey: plan.logicalKey,
    column: 'id', kind: 'generated_primary_key', value: null,
  }));
  if (stable(intent.generatedIdDeclarations) !== stable(expectedDeclarations)) {
    throw new Error('Armor landing/maint generated ID declarations are incomplete or foreign');
  }
  const expectedReferences = intent.insertPlans.flatMap(plan => plan.references.map(reference => ({
    databaseRole: plan.databaseRole, table: plan.table, logicalKey: plan.logicalKey,
    column: reference.column, target: reference.target,
  })));
  if (stable(intent.referenceDeclarations) !== stable(expectedReferences)) {
    throw new Error('Armor landing/maint reference declarations are incomplete or foreign');
  }
  const { intentSha256: _ignored, ...body } = intent;
  if (!HASH.test(intent.intentSha256 ?? '') || hash(body) !== intent.intentSha256) throw new Error('Armor landing/maint intent hash drifted');
  return true;
}

export function materializeArmorCanonicalLandingMaintIntent({ intent, receipts } = {}) {
  validateArmorCanonicalLandingMaintIntent(intent);
  if (!Array.isArray(receipts)) throw new Error('Armor landing/maint receipts are required');
  const expected = new Map(intent.insertPlans.map(plan => [`${plan.databaseRole}.${plan.table}|${plan.logicalKey}`, plan]));
  const byIdentity = new Map();
  const idsByTable = new Map();
  for (const receipt of receipts) {
    const receiptIdentity = `${receipt?.databaseRole}.${receipt?.table}|${receipt?.logicalKey}`;
    const expectedPlan = expected.get(receiptIdentity);
    if (!expectedPlan) throw new Error(`foreign or extra Armor receipt: ${receiptIdentity}`);
    const identity = validateReceipt(receipt, expectedPlan, intent.writeTimestamp);
    if (byIdentity.has(identity)) throw new Error(`duplicate Armor receipt: ${identity}`);
    const table = `${receipt.databaseRole}.${receipt.table}`;
    const ids = idsByTable.get(table) ?? new Set();
    if (ids.has(receipt.insertId)) throw new Error(`duplicate Armor allocated ID in table: ${table}`);
    ids.add(receipt.insertId);
    idsByTable.set(table, ids);
    byIdentity.set(identity, receipt);
  }
  if (byIdentity.size !== expected.size) throw new Error('Armor landing/maint receipt map is incomplete');
  const concreteInsertPlans = intent.insertPlans.map(plan => {
    const identity = `${plan.databaseRole}.${plan.table}|${plan.logicalKey}`;
    const receipt = byIdentity.get(identity);
    const concrete = structuredClone(plan);
    concrete.nonGeneratedFields.id = receipt.insertId;
    for (const reference of plan.references) {
      const target = byIdentity.get(reference.target);
      if (!target) throw new Error(`Armor landing/maint reference receipt is missing: ${reference.target}`);
      concrete.nonGeneratedFields[reference.column] = target.insertId;
    }
    return concrete;
  });
  const concreteAfter = { intentSha256: intent.intentSha256, writeTimestamp: intent.writeTimestamp, insertPlans: concreteInsertPlans, demotions: intent.demotions };
  return deepFreeze({
    intentSha256: intent.intentSha256,
    verifiedIdMap: Object.fromEntries([...byIdentity].map(([identity, receipt]) => [identity, receipt.insertId])),
    concreteInsertPlans: deepFreeze(concreteInsertPlans),
    concreteAfterSha256: hash(concreteAfter),
  });
}
