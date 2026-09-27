import { createHash } from 'node:crypto';

export const ARMOR_CANONICAL_INTENT_OPERATION_ID = 'canonical-armor-ingestion';
const INTENT_SCHEMA_VERSION = 'armor-canonical-intent/v1';
const HASH = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const ROLES = new Set(['local', 'maint', 'relation']);
const GENERATED_COLUMNS = new Set(['id', 'created_at', 'updated_at']);
const REQUIRED_GENERATED_COLUMNS = ['id', 'created_at', 'updated_at'];
const ARMOR_RELATION_TABLES = ['relation_armor_sets', 'relation_armor_set_items', 'relation_armor_set_images'];
const ARMOR_PROJECTION_TABLES = ['projection_armor_sets'];
const ARMOR_INSERT_TABLES = new Set([...ARMOR_RELATION_TABLES, ...ARMOR_PROJECTION_TABLES]);

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(value));
}

function hash(value) {
  return `sha256:${createHash('sha256').update(stable(value), 'utf8').digest('hex')}`;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`${label} is required`);
  return value;
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
  const normalized = new Date(value).toISOString().slice(0, 19) + 'Z';
  if (normalized !== value) throw new Error(`${label} has an invalid UTC calendar date`);
  return value;
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object`);
  }
  return value;
}

function logicalIdentity(plan) {
  return `${plan.databaseRole}.${plan.table}|${plan.logicalKey}`;
}

function targetIdentity(plan) {
  return `${plan.databaseRole}.${plan.table}|${plan.logicalKey}`;
}

function parseTarget(value, label) {
  const raw = text(value, label);
  const separator = raw.indexOf('|');
  if (separator < 1 || separator === raw.length - 1) throw new Error(`${label} target is malformed`);
  const roleTable = raw.slice(0, separator);
  const split = roleTable.indexOf('.');
  if (split < 1 || split === roleTable.length - 1) throw new Error(`${label} target is malformed`);
  const databaseRole = roleTable.slice(0, split);
  const table = roleTable.slice(split + 1);
  if (!ROLES.has(databaseRole) || !IDENTIFIER.test(table)) throw new Error(`${label} target is invalid`);
  return raw;
}

function exactSet(left, right) {
  return left.length === right.length && left.every(value => right.includes(value));
}

function hashWithout(value, field) {
  const { [field]: _ignored, ...without } = value;
  return hash(without);
}

function validateRelationCandidate(candidate) {
  plainObject(candidate, 'Armor relation candidate');
  if (candidate.schemaVersion !== 'armor-canonical-relation-candidate/v1' || candidate.executable !== false) {
    throw new Error('Armor relation candidate identity is invalid');
  }
  hashValue(candidate.candidateSha256, 'relation candidate candidateSha256');
  if (hashWithout(candidate, 'candidateSha256') !== candidate.candidateSha256) {
    throw new Error('Armor relation candidate hash drifted');
  }
  if (!Array.isArray(candidate.tables) || !exactSet(candidate.tables, ARMOR_RELATION_TABLES)
      || !candidate.changes || !candidate.expectedRows || !candidate.inputSnapshots) {
    throw new Error('Armor relation candidate graph is incomplete');
  }
  if (!candidate.inputSnapshots.maintInput
      || !Array.isArray(candidate.inputSnapshots.maintInput.landingRows)
      || candidate.inputSnapshots.maintInput.landingRows.length !== 2
      || !candidate.inputSnapshots.currentRows
      || !Array.isArray(candidate.inputSnapshots.maintItems)) {
    throw new Error('Armor relation candidate snapshots are incomplete');
  }
  for (const table of ARMOR_RELATION_TABLES) {
    if (!candidate.changes[table] || !Array.isArray(candidate.changes[table].inserts)
        || !Array.isArray(candidate.changes[table].updates)
        || !Array.isArray(candidate.changes[table].unchanged)
        || !Array.isArray(candidate.changes[table].preserved)
        || !Array.isArray(candidate.expectedRows[table])) {
      throw new Error(`Armor relation candidate ${table} changes are incomplete`);
    }
  }
  const snapshots = candidate.inputSnapshots;
  if (hash(snapshots) !== candidate.inputSha256) throw new Error('Armor relation candidate input snapshot hash drifted');
  if (hash(snapshots.currentRows) !== candidate.baselineSha256) throw new Error('Armor relation candidate baseline hash drifted');
  if (hash(snapshots.maintItems) !== candidate.itemDependenciesSha256) throw new Error('Armor relation candidate item dependency hash drifted');
  if (hash(snapshots.maintInput.currentRows) !== candidate.maintBaselineSha256) throw new Error('Armor relation candidate maint baseline hash drifted');
  if (hash(snapshots.maintInput.landingRows) !== candidate.sourceSnapshotSha256) throw new Error('Armor relation candidate source snapshot hash drifted');
  if (!Array.isArray(candidate.managedImageUrlPrefixes)
      || stable(candidate.managedImageUrlPrefixes) !== stable(snapshots.maintInput.managedImageUrlPrefixes)) {
    throw new Error('Armor relation candidate managed image policy drifted');
  }
}

function validateInsertPlan(plan, index) {
  plainObject(plan, `insert plan ${index}`);
  const databaseRole = text(plan.databaseRole, `insert plan ${index} databaseRole`);
  if (!ROLES.has(databaseRole)) throw new Error(`insert plan ${index} databaseRole is invalid`);
  const table = text(plan.table, `insert plan ${index} table`);
  if (!IDENTIFIER.test(table)) throw new Error(`insert plan ${index} table is invalid`);
  const logicalKey = text(plan.logicalKey, `insert plan ${index} logicalKey`);
  const primaryKeyColumn = text(plan.primaryKeyColumn, `insert plan ${index} primaryKeyColumn`);
  if (primaryKeyColumn !== 'id') throw new Error('Armor generated primary keys must use id');
  if (!Array.isArray(plan.generatedColumns) || plan.generatedColumns.length === 0
      || new Set(plan.generatedColumns).size !== plan.generatedColumns.length
      || plan.generatedColumns.some(column => !GENERATED_COLUMNS.has(column))) {
    throw new Error(`insert plan ${index} generated columns are invalid`);
  }
  plainObject(plan.nonGeneratedFields, `insert plan ${index} nonGeneratedFields`);
  if (Object.keys(plan.nonGeneratedFields).some(column => plan.generatedColumns.includes(column))) {
    throw new Error(`insert plan ${index} mixes generated and non-generated fields`);
  }
  if (!Array.isArray(plan.references)) throw new Error(`insert plan ${index} references are required`);
  const referenceColumns = new Set();
  const references = plan.references.map((reference, referenceIndex) => {
    plainObject(reference, `insert plan ${index} reference ${referenceIndex}`);
    const column = text(reference.column, `insert plan ${index} reference column`);
    const target = parseTarget(reference.target, `insert plan ${index} reference`);
    // The projection primary key is intentionally a declared reference to the
    // exact relation-set insert; all other generated columns remain opaque.
    const projectionIdReference = column === 'id' && table === 'projection_armor_sets'
      && target.startsWith('relation.relation_armor_sets|');
    if (referenceColumns.has(column)) {
      throw new Error(`insert plan ${index} contains duplicate reference column`);
    }
    referenceColumns.add(column);
    const supported = projectionIdReference
      || table !== 'projection_armor_sets' && (column === 'landing_source_id' && target.startsWith('local.source_dataset_landings|')
        || column === 'source_maint_id' && target.startsWith('maint.'));
    if (!supported) throw new Error(`insert plan ${index} reference column/target is outside the typed Armor graph`);
    if (plan.generatedColumns.includes(column) && !projectionIdReference) {
      throw new Error(`insert plan ${index} reference targets generated column`);
    }
    return { column, target, projectionIdReference };
  });
  const projectionIdReference = references.some(reference => reference.projectionIdReference);
  if (table === 'projection_armor_sets' && !projectionIdReference) {
    throw new Error(`insert plan ${index} projection row must reference its exact relation parent ID`);
  }
  if (REQUIRED_GENERATED_COLUMNS.some(column => !plan.generatedColumns.includes(column)
      && !(column === 'id' && projectionIdReference))) {
    throw new Error(`insert plan ${index} omits required generated system column`);
  }
  if (projectionIdReference && plan.generatedColumns.includes('id')) {
    throw new Error(`insert plan ${index} declares projection id as both generated and referenced`);
  }
  if (Object.hasOwn(plan.nonGeneratedFields, 'id')) {
    throw new Error(`insert plan ${index} must not predeclare generated or referenced id`);
  }
  return {
    databaseRole, table, logicalKey, primaryKeyColumn,
    generatedColumns: [...plan.generatedColumns].sort(),
    nonGeneratedFields: structuredClone(plan.nonGeneratedFields),
    references: references.map(reference => ({ column: reference.column, target: reference.target }))
      .sort((left, right) => left.column.localeCompare(right.column) || left.target.localeCompare(right.target)),
  };
}

function candidateInsertIdentity(databaseRole, table, row) {
  if (!ARMOR_INSERT_TABLES.has(table)) throw new Error(`Armor insert table is outside candidate scope: ${databaseRole}.${table}`);
  if (databaseRole !== 'relation') throw new Error(`Armor insert table must use relation database role: ${databaseRole}.${table}`);
  const keyColumn = table === 'projection_armor_sets' ? 'text_key' : 'record_key';
  if (typeof row?.[keyColumn] !== 'string' || !row[keyColumn].trim()) {
    throw new Error(`Armor ${table} insert logical identity is missing`);
  }
  return `${databaseRole}.${table}|${row[keyColumn]}`;
}

function candidateInsertRows(candidate) {
  const rows = new Map();
  const add = (databaseRole, table, changeSet) => {
    for (const row of changeSet.inserts) {
      const identity = candidateInsertIdentity(databaseRole, table, row);
      if (rows.has(identity)) throw new Error(`duplicate Armor candidate insert identity: ${identity}`);
      rows.set(identity, row);
    }
  };
  for (const table of ARMOR_RELATION_TABLES) add('relation', table, candidate.relationCandidate.changes[table]);
  add('relation', 'projection_armor_sets', candidate.changes.projection_armor_sets);
  return rows;
}

function existingCandidateReferenceId(candidate, target) {
  const parsed = parseTarget(target, 'Armor reference');
  const separator = parsed.indexOf('|');
  const roleTable = parsed.slice(0, separator);
  const logicalKey = parsed.slice(separator + 1);
  if (roleTable !== 'relation.relation_armor_sets') return null;
  const row = candidate.relationCandidate.expectedRows.relation_armor_sets
    .find(candidateRow => candidateRow.record_key === logicalKey);
  return positiveId(row?.id) ? row.id : null;
}

function validatePlansAgainstCandidate(candidate, plans, upstreamReferences = new Set()) {
  const expectedRows = candidateInsertRows(candidate);
  const planRows = new Map();
  for (const plan of plans) {
    const identity = targetIdentity(plan);
    if (!ARMOR_INSERT_TABLES.has(plan.table)
        || plan.databaseRole !== 'relation') {
      throw new Error(`Armor insert plan is outside frozen candidate scope: ${identity}`);
    }
    if (plan.databaseRole === 'maint') throw new Error(`Armor maint insert plan requires an upstream maint candidate: ${identity}`);
    if (planRows.has(identity)) throw new Error(`duplicate Armor insert identity: ${identity}`);
    const row = expectedRows.get(identity);
    if (!row) throw new Error(`Armor insert plan is not a frozen candidate insert: ${identity}`);
    if (plan.table !== 'projection_armor_sets' && row.id != null) {
      throw new Error(`Armor candidate insert preallocates a generated ID: ${identity}`);
    }
    planRows.set(identity, row);
    const referenceColumns = new Set(plan.references.map(reference => reference.column));
    const expectedFields = Object.keys(row).filter(column => !GENERATED_COLUMNS.has(column) && !referenceColumns.has(column)).sort();
    const actualFields = Object.keys(plan.nonGeneratedFields).filter(column => !referenceColumns.has(column)).sort();
    if (!exactSet(actualFields, expectedFields)) {
      throw new Error(`Armor insert plan fields do not match frozen candidate row: ${identity}`);
    }
    for (const column of expectedFields) {
      if (stable(plan.nonGeneratedFields[column]) !== stable(row[column])) {
        throw new Error(`Armor insert plan field drifted from candidate: ${identity}.${column}`);
      }
    }
    for (const column of referenceColumns) {
      if (Object.hasOwn(plan.nonGeneratedFields, column) && plan.nonGeneratedFields[column] !== null) {
        throw new Error(`Armor reference slot must be null before materialization: ${identity}.${column}`);
      }
    }
    const idReference = plan.references.some(reference => reference.column === 'id');
    const expectedGenerated = idReference ? ['created_at', 'updated_at'] : REQUIRED_GENERATED_COLUMNS;
    if (!exactSet(plan.generatedColumns, expectedGenerated)) {
      throw new Error(`Armor generated columns do not match candidate table contract: ${identity}`);
    }
  }
  if (planRows.size !== expectedRows.size) throw new Error('Armor insert plans omit frozen candidate inserts');
  for (const identity of expectedRows.keys()) if (!planRows.has(identity)) {
    throw new Error(`Armor candidate insert has no typed plan: ${identity}`);
  }
  for (const plan of plans) {
    const identity = targetIdentity(plan);
    const row = planRows.get(identity);
    for (const reference of plan.references) {
      if (reference.column === 'id' && reference.target !== `relation.relation_armor_sets|${row.relation_record_key}`) {
        throw new Error(`Armor projection reference does not match its exact frozen relation parent: ${identity}`);
      }
      const targetId = planRows.has(reference.target)
        ? null
        : existingCandidateReferenceId(candidate, reference.target);
      if (!planRows.has(reference.target) && !positiveId(targetId) && !upstreamReferences.has(reference.target)) {
        throw new Error(`Armor reference target is not a frozen insert or existing candidate row: ${reference.target}`);
      }
      if (reference.column === 'id' && row.id != null && positiveId(targetId) && row.id !== targetId) {
        throw new Error(`Armor projection ID disagrees with its frozen relation reference: ${identity}`);
      }
    }
  }
}

function validateCandidate(candidate) {
  plainObject(candidate, 'Armor projection candidate');
  if (candidate.schemaVersion !== 'armor-canonical-projection-candidate/v1') throw new Error('Armor candidate schema version is invalid');
  if (candidate.executable !== false) throw new Error('Armor candidate must remain non-executable');
  for (const key of ['candidateSha256', 'baselineSha256', 'inputSha256', 'dependencySnapshotSha256', 'consumerSnapshotSha256', 'managedImagePolicySha256']) {
    hashValue(candidate[key], `candidate ${key}`);
  }
  if (hashWithout(candidate, 'candidateSha256') !== candidate.candidateSha256) throw new Error('Armor candidate hash drifted');
  if (!candidate.inputSnapshots || typeof candidate.inputSnapshots !== 'object') throw new Error('Armor candidate input snapshots are required');
  if (!candidate.expectedRows || typeof candidate.expectedRows !== 'object') throw new Error('Armor candidate expected rows are required');
  if (!candidate.relationCandidate) throw new Error('Armor relation candidate is required');
  validateRelationCandidate(candidate.relationCandidate);
  if (!Array.isArray(candidate.tables) || !exactSet(candidate.tables, ARMOR_PROJECTION_TABLES)
      || !candidate.changes?.projection_armor_sets || !Array.isArray(candidate.changes.projection_armor_sets.inserts)
      || !Array.isArray(candidate.changes.projection_armor_sets.updates)
      || !Array.isArray(candidate.changes.projection_armor_sets.unchanged)
      || !Array.isArray(candidate.changes.projection_armor_sets.preserved)
      || !Array.isArray(candidate.expectedRows.projection_armor_sets)) {
    throw new Error('Armor projection candidate graph is incomplete');
  }
  if (!candidate.acceptance || candidate.acceptance.runtimeVerified !== false
      || !Array.isArray(candidate.acceptance.blockers)
      || candidate.acceptance.blockers.some(blocker => blocker?.code !== 'generated-identities-unresolved')
      || candidate.requiresRemovalReview === true || candidate.relationCandidate.requiresRemovalReview === true) {
    throw new Error('Armor projection candidate has unresolved non-generated blockers');
  }
  if (hash(candidate.inputSnapshots) !== candidate.inputSha256) throw new Error('Armor candidate input snapshot hash drifted');
  if (hash(candidate.inputSnapshots.currentRows) !== candidate.baselineSha256) throw new Error('Armor candidate baseline hash drifted');
  if (hash(candidate.inputSnapshots.dependencyRows) !== candidate.dependencySnapshotSha256) throw new Error('Armor candidate dependency snapshot hash drifted');
  if (hash(candidate.inputSnapshots.consumerRows) !== candidate.consumerSnapshotSha256) throw new Error('Armor candidate consumer snapshot hash drifted');
  if (hash(candidate.inputSnapshots.managedImageUrlPrefixes) !== candidate.managedImagePolicySha256) throw new Error('Armor candidate managed image policy hash drifted');
  const sortedPrefixes = value => [...value].sort();
  if (stable(sortedPrefixes(candidate.managedImageUrlPrefixes)) !== stable(sortedPrefixes(candidate.inputSnapshots.managedImageUrlPrefixes))
      || stable(sortedPrefixes(candidate.managedImageUrlPrefixes)) !== stable(sortedPrefixes(candidate.relationCandidate.managedImageUrlPrefixes))) {
    throw new Error('Armor candidate managed image policy drifted');
  }
}

function validateIntentShape(intent) {
  plainObject(intent, 'Armor intent');
  if (intent.schemaVersion !== INTENT_SCHEMA_VERSION || intent.operationId !== ARMOR_CANONICAL_INTENT_OPERATION_ID) throw new Error('Armor intent identity is invalid');
  if (intent.executable !== false) throw new Error('Armor intent must remain non-executable');
  utcSecond(intent.writeTimestamp, 'Armor intent writeTimestamp');
  hashValue(intent.candidateSha256, 'Armor intent candidateSha256');
  for (const key of ['sourceSnapshotSha256', 'maintBaselineSha256', 'relationBaselineSha256', 'relationInputSha256',
    'baselineSha256', 'inputSha256', 'dependencySnapshotSha256', 'consumerSnapshotSha256', 'managedImagePolicySha256']) {
    hashValue(intent[key], `Armor intent ${key}`);
  }
  if (!Array.isArray(intent.insertPlans) || !Array.isArray(intent.generatedIdDeclarations)
      || !Array.isArray(intent.referenceDeclarations)
      || !Array.isArray(intent.upstreamReferenceDeclarations ?? [])) throw new Error('Armor intent declarations are incomplete');
}

export function buildArmorCanonicalIntent({ candidate, insertPlans, writeTimestamp, upstreamReferenceDeclarations = [] } = {}) {
  validateCandidate(candidate);
  utcSecond(writeTimestamp, 'Armor intent writeTimestamp');
  if (!Array.isArray(insertPlans) || insertPlans.length === 0) throw new Error('Armor insert plans are required');
  const normalizedPlans = insertPlans.map(validateInsertPlan);
  if (!Array.isArray(upstreamReferenceDeclarations)) throw new Error('Armor upstream reference declarations are required');
  const upstreamReferences = new Set(upstreamReferenceDeclarations.map(reference => {
    const target = parseTarget(reference, 'Armor upstream reference');
    if (!target.startsWith('maint.') && !target.startsWith('local.source_dataset_landings|')) {
      throw new Error(`Armor upstream reference is outside the landing/maint scope: ${target}`);
    }
    return target;
  }));
  const identities = new Set();
  for (const plan of normalizedPlans) {
    const identity = logicalIdentity(plan);
    if (identities.has(identity)) throw new Error(`duplicate Armor insert identity: ${identity}`);
    identities.add(identity);
  }
  for (const plan of normalizedPlans) {
    for (const reference of plan.references) {
      if (!identities.has(reference.target) && !positiveId(existingCandidateReferenceId(candidate, reference.target))
          && !upstreamReferences.has(reference.target)) {
        throw new Error(`Armor reference target is not declared in the typed graph: ${reference.target}`);
      }
    }
  }
  validatePlansAgainstCandidate(candidate, normalizedPlans, upstreamReferences);
  const expectedUpstreamReferences = [...new Set(normalizedPlans.flatMap(plan => plan.references
    .map(reference => reference.target)
    .filter(target => target.startsWith('maint.') || target.startsWith('local.source_dataset_landings|'))))].sort();
  if (stable([...upstreamReferences].sort()) !== stable(expectedUpstreamReferences)) {
    throw new Error('Armor upstream reference declarations are incomplete or foreign');
  }
  const generatedIdDeclarations = normalizedPlans.filter(plan => plan.generatedColumns.includes('id')).map(plan => ({
    databaseRole: plan.databaseRole, table: plan.table, logicalKey: plan.logicalKey,
    column: 'id', kind: 'generated_primary_key', value: null,
  }));
  const referenceDeclarations = normalizedPlans.flatMap(plan => plan.references.map(reference => ({
    databaseRole: plan.databaseRole, table: plan.table, logicalKey: plan.logicalKey,
    column: reference.column, target: reference.target,
  })));
  const intent = {
    schemaVersion: INTENT_SCHEMA_VERSION,
    operationId: ARMOR_CANONICAL_INTENT_OPERATION_ID,
    executable: false,
    writeTimestamp,
    candidateSha256: candidate.candidateSha256,
    sourceSnapshotSha256: candidate.relationCandidate.sourceSnapshotSha256,
    maintBaselineSha256: candidate.relationCandidate.maintBaselineSha256,
    relationBaselineSha256: candidate.relationCandidate.baselineSha256,
    relationInputSha256: candidate.relationCandidate.inputSha256,
    baselineSha256: candidate.baselineSha256,
    inputSha256: candidate.inputSha256,
    dependencySnapshotSha256: candidate.dependencySnapshotSha256,
    consumerSnapshotSha256: candidate.consumerSnapshotSha256,
    managedImagePolicySha256: candidate.managedImagePolicySha256,
    candidateSnapshot: structuredClone(candidate),
    insertPlans: normalizedPlans,
    generatedIdDeclarations,
    referenceDeclarations,
    upstreamReferenceDeclarations: [...upstreamReferences].sort(),
  };
  return Object.freeze({ ...deepFreeze(intent), intentSha256: hash(intent) });
}

export function validateArmorCanonicalIntent(intent) {
  validateIntentShape(intent);
  const { intentSha256: _ignored, ...withoutHash } = intent;
  if (!HASH.test(intent.intentSha256 ?? '') || hash(withoutHash) !== intent.intentSha256) throw new Error('Armor intent hash drifted');
  validateCandidate(intent.candidateSnapshot);
  const plans = intent.insertPlans.map(validateInsertPlan);
  validatePlansAgainstCandidate(intent.candidateSnapshot, plans, new Set(intent.upstreamReferenceDeclarations ?? []));
  const relationCandidate = intent.candidateSnapshot.relationCandidate;
  if (intent.candidateSha256 !== intent.candidateSnapshot.candidateSha256
      || intent.sourceSnapshotSha256 !== relationCandidate.sourceSnapshotSha256
      || intent.maintBaselineSha256 !== relationCandidate.maintBaselineSha256
      || intent.relationBaselineSha256 !== relationCandidate.baselineSha256
      || intent.relationInputSha256 !== relationCandidate.inputSha256
      || intent.baselineSha256 !== intent.candidateSnapshot.baselineSha256
      || intent.inputSha256 !== intent.candidateSnapshot.inputSha256
      || intent.dependencySnapshotSha256 !== intent.candidateSnapshot.dependencySnapshotSha256
      || intent.consumerSnapshotSha256 !== intent.candidateSnapshot.consumerSnapshotSha256
      || intent.managedImagePolicySha256 !== intent.candidateSnapshot.managedImagePolicySha256) {
    throw new Error('Armor intent snapshot bindings drifted from candidate graph');
  }
  const generatedPlans = plans.filter(plan => plan.generatedColumns.includes('id'));
  const expectedDeclarations = generatedPlans.map(plan => ({
    databaseRole: plan.databaseRole, table: plan.table, logicalKey: plan.logicalKey,
    column: 'id', kind: 'generated_primary_key', value: null,
  }));
  if (stable(intent.generatedIdDeclarations) !== stable(expectedDeclarations)) {
    throw new Error('Armor generated ID declarations are incomplete or foreign');
  }
  const expectedReferences = plans.flatMap(plan => plan.references.map(reference => ({
    databaseRole: plan.databaseRole, table: plan.table, logicalKey: plan.logicalKey,
    column: reference.column, target: reference.target,
  })));
  if (stable(intent.referenceDeclarations) !== stable(expectedReferences)) {
    throw new Error('Armor reference declarations are incomplete or foreign');
  }
  const expectedUpstreamReferences = [...new Set(expectedReferences.map(reference => reference.target)
    .filter(target => target.startsWith('maint.') || target.startsWith('local.source_dataset_landings|')))].sort();
  if (stable([...(intent.upstreamReferenceDeclarations ?? [])].sort()) !== stable(expectedUpstreamReferences)) {
    throw new Error('Armor upstream reference declarations are incomplete or foreign');
  }
  return true;
}

export function materializeArmorCanonicalIntent({ intent, receipts, externalReceipts = [] } = {}) {
  validateArmorCanonicalIntent(intent);
  if (!Array.isArray(receipts)) throw new Error('Armor insert receipts are required');
  const plans = intent.insertPlans;
  const expected = new Map(plans.map(plan => [targetIdentity(plan), plan]));
  const seen = new Set();
  const receiptMap = new Map();
  const externalReceiptMap = new Map();
  const declaredExternalReferences = new Set(intent.upstreamReferenceDeclarations ?? []);
  for (const receipt of externalReceipts) {
    plainObject(receipt, 'Armor external insert receipt');
    const identity = `${text(receipt.databaseRole, 'external receipt databaseRole')}.${text(receipt.table, 'external receipt table')}|${text(receipt.logicalKey, 'external receipt logicalKey')}`;
    if ((!identity.startsWith('maint.') && !identity.startsWith('local.source_dataset_landings|'))
        || !declaredExternalReferences.has(identity) || externalReceiptMap.has(identity)
        || !Number.isSafeInteger(receipt.insertId) || receipt.insertId < 1 || receipt.affectedRows !== 1) {
      throw new Error(`invalid Armor external insert receipt: ${identity}`);
    }
    externalReceiptMap.set(identity, receipt);
  }
  const idsByTable = new Map();
  for (const receipt of receipts) {
    plainObject(receipt, 'Armor insert receipt');
    const identity = `${text(receipt.databaseRole, 'receipt databaseRole')}.${text(receipt.table, 'receipt table')}|${text(receipt.logicalKey, 'receipt logicalKey')}`;
    if (seen.has(identity)) throw new Error(`duplicate Armor insert receipt: ${identity}`);
    if (!expected.has(identity)) throw new Error(`foreign or extra Armor insert receipt: ${identity}`);
    if (!Number.isSafeInteger(receipt.insertId) || receipt.insertId < 1) throw new Error(`Armor receipt insertId is invalid: ${identity}`);
    if (receipt.affectedRows !== 1) throw new Error(`Armor receipt affectedRows must be one: ${identity}`);
    const tableKey = `${receipt.databaseRole}.${receipt.table}`;
    const tableIds = idsByTable.get(tableKey) ?? new Set();
    if (tableIds.has(receipt.insertId)) throw new Error(`duplicate Armor insert ID allocation in table: ${tableKey}`);
    tableIds.add(receipt.insertId);
    idsByTable.set(tableKey, tableIds);
    plainObject(receipt.readback, `Armor receipt ${identity} readback`);
    seen.add(identity);
    receiptMap.set(identity, receipt);
  }
  if (seen.size !== expected.size) throw new Error('Armor insert receipt map is missing declarations');
  const concretePlans = plans.map(plan => {
    const identity = targetIdentity(plan);
    const receipt = receiptMap.get(identity);
    const concrete = structuredClone(plan);
    const allowedReadback = new Set(['id', 'created_at', 'updated_at', ...Object.keys(plan.nonGeneratedFields), ...plan.references.map(reference => reference.column)]);
    const readbackColumns = Object.keys(receipt.readback).sort();
    if (!exactSet(readbackColumns, [...allowedReadback].sort())) {
      throw new Error(`Armor insert readback contains undeclared columns: ${identity}`);
    }
    concrete.nonGeneratedFields.id = receipt.insertId;
    for (const column of ['created_at', 'updated_at']) {
      if (!Object.hasOwn(receipt.readback, column)) throw new Error(`Armor receipt readback omits ${column}: ${identity}`);
      if (!timestampsEqual(receipt.readback[column], intent.writeTimestamp)) {
        throw new Error(`Armor receipt ${column} drifted from writeTimestamp: ${identity}`);
      }
      concrete.nonGeneratedFields[column] = receipt.readback[column];
    }
    for (const reference of plan.references) {
      const targetReceipt = receiptMap.get(reference.target) ?? externalReceiptMap.get(reference.target);
      const targetId = targetReceipt?.insertId ?? existingCandidateReferenceId(intent.candidateSnapshot, reference.target);
      if (!positiveId(targetId)) throw new Error(`Armor reference receipt or frozen row is missing: ${reference.target}`);
      if (reference.column === 'id' && receipt.insertId !== targetId) {
        throw new Error(`Armor projection id does not equal its relation insert id: ${identity}`);
      }
      concrete.nonGeneratedFields[reference.column] = targetId;
    }
    const expectedReadback = { ...plan.nonGeneratedFields, id: receipt.insertId };
    for (const reference of plan.references) {
      const targetReceipt = receiptMap.get(reference.target) ?? externalReceiptMap.get(reference.target);
      const targetId = targetReceipt?.insertId ?? existingCandidateReferenceId(intent.candidateSnapshot, reference.target);
      if (!positiveId(targetId)) throw new Error(`Armor reference receipt or frozen row is missing: ${reference.target}`);
      expectedReadback[reference.column] = targetId;
    }
    for (const [column, expectedValue] of Object.entries(expectedReadback)) {
      if (stable(receipt.readback[column]) !== stable(expectedValue)) throw new Error(`Armor insert readback drifted: ${identity}.${column}`);
    }
    return concrete;
  });
  const concreteAfter = { intentSha256: intent.intentSha256, writeTimestamp: intent.writeTimestamp, plans: concretePlans };
  return deepFreeze({
    intentSha256: intent.intentSha256,
    verifiedIdMap: Object.fromEntries([...receiptMap].map(([identity, receipt]) => [identity, receipt.insertId])),
    concreteInsertPlans: deepFreeze(concretePlans),
    concreteAfterSha256: hash(concreteAfter),
  });
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function timestampsEqual(actual, expected) {
  if (typeof actual !== 'string') return false;
  const iso = actual.includes(' ') ? `${actual.replace(' ', 'T')}Z` : actual;
  const expectedIso = expected.includes(' ') ? `${expected.replace(' ', 'T')}Z` : expected;
  return iso === expectedIso;
}
