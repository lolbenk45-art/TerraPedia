import { createHash } from 'node:crypto';

import {
  ARMOR_CANONICAL_INTENT_OPERATION_ID,
  buildArmorCanonicalIntent,
  validateArmorCanonicalIntent,
} from './armor-canonical-intent.mjs';
import {
  validateArmorCanonicalLandingMaintIntent,
} from './armor-canonical-landing-maint-intent.mjs';
import { inspectArmorCanonicalLandingLineage } from './armor-canonical-landing-lineage.mjs';

export const ARMOR_CANONICAL_FULL_CHAIN_SCHEMA = 'armor-canonical-full-chain-intent/v1';
export const ARMOR_CANONICAL_RECOVERY_INTENT_SCHEMA = 'armor-canonical-recovery-intent/v1';
export const ARMOR_CANONICAL_FULL_CHAIN_OPERATION_ID = ARMOR_CANONICAL_INTENT_OPERATION_ID;

const HASH = /^sha256:[0-9a-f]{64}$/;
const RELATION_TABLES = Object.freeze([
  'relation_armor_sets', 'relation_armor_set_items', 'relation_armor_set_images',
]);
const MAINT_TABLES = new Set(['maint_armor_sets', 'maint_armor_set_images']);
const GENERATED_COLUMNS = new Set(['id', 'created_at', 'updated_at']);

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

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
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

function same(left, right, label) {
  if (stable(left) !== stable(right)) throw new Error(`${label} drifted from the full-chain source graph`);
}

function planIdentity(plan) {
  return `${plan.databaseRole}.${plan.table}|${plan.logicalKey}`;
}

function landingLogicalKey(row) {
  return [row.dataset_type, row.provider, row.source_key, row.source_page].map((value) => text(value, 'Armor landing identity')).join('|');
}

function relationLogicalKey(table, row) {
  return text(table === 'projection_armor_sets' ? row.text_key : row.record_key, `Armor ${table} logical key`);
}

function relationSourceLandingTarget(row, landingPlans, landingCurrentRows) {
  const sourceTable = text(row.source_maint_table, 'Armor relation source maint table');
  const datasetType = sourceTable === 'maint_armor_sets' ? 'armor_sets_raw'
    : sourceTable === 'maint_armor_set_images' ? 'armor_set_images_raw' : null;
  if (!datasetType) throw new Error(`Armor relation source maint table is outside the full-chain scope: ${sourceTable}`);
  const provider = text(row.source_provider, 'Armor relation source provider');
  const sourceKey = text(row.landing_source_key, 'Armor relation landing source key');
  const sourcePage = row.landing_source_page == null ? null : text(row.landing_source_page, 'Armor relation landing source page');
  const contentHash = text(row.landing_content_hash, 'Armor relation landing content hash');
  if (row.landing_source_id != null) {
    if (!positiveId(row.landing_source_id)) throw new Error('Armor relation landing_source_id is malformed');
    if (!Array.isArray(landingCurrentRows)) throw new Error('Armor frozen landing baseline is required to verify relation landing IDs');
    const matches = landingCurrentRows.filter(landing => landing.id === row.landing_source_id);
    if (matches.length !== 1) throw new Error(`Armor relation landing id does not resolve to one frozen landing row: ${row.landing_source_id}`);
    const [landing] = matches;
    if (landing.dataset_type !== datasetType || landing.provider !== provider || landing.source_key !== sourceKey
        || (sourcePage != null && landing.source_page !== sourcePage) || landing.content_hash !== contentHash) {
      throw new Error(`Armor relation landing id does not match source identity/content hash: ${row.landing_source_id}`);
    }
    return null;
  }
  const matches = [...landingPlans.entries()].filter(([, plan]) => plan.nonGeneratedFields.dataset_type === datasetType
    && plan.nonGeneratedFields.provider === provider
    && plan.nonGeneratedFields.source_key === sourceKey);
  if (matches.length !== 1) {
    throw new Error(`Armor relation landing reference does not resolve to one exact landing insert: ${datasetType}|${provider}|${sourceKey}`);
  }
  const [target, plan] = matches[0];
  const landingPage = text(plan.nonGeneratedFields.source_page, 'Armor landing plan source page');
  if (row.landing_source_page != null && row.landing_source_page !== landingPage) {
    throw new Error(`Armor relation landing page drifted from its exact landing insert: ${target}`);
  }
  if (plan.nonGeneratedFields.content_hash !== contentHash) {
    throw new Error(`Armor relation landing content hash drifted from its exact landing insert: ${target}`);
  }
  return target;
}

function relationSourceMaintTarget(row, maintPlans) {
  if (row.source_maint_id != null) {
    if (!positiveId(row.source_maint_id)) throw new Error('Armor relation source_maint_id is malformed');
    return null;
  }
  const table = text(row.source_maint_table, 'Armor relation source maint table');
  if (!MAINT_TABLES.has(table)) throw new Error(`Armor relation source maint table is outside the full-chain scope: ${table}`);
  const recordKey = text(row.source_maint_record_key, 'Armor relation source maint record key');
  const target = `maint.${table}|${recordKey}`;
  if (!maintPlans.has(target)) throw new Error(`Armor relation maint reference is not a maint insert: ${target}`);
  return target;
}

function fieldsAndReferences(table, row, landingPlans, maintPlans, relationPlans, landingCurrentRows) {
  const references = [];
  if (table !== 'projection_armor_sets') {
    const landingTarget = relationSourceLandingTarget(row, landingPlans, landingCurrentRows);
    if (landingTarget) references.push({ column: 'landing_source_id', target: landingTarget });
    const maintTarget = relationSourceMaintTarget(row, maintPlans);
    if (maintTarget) references.push({ column: 'source_maint_id', target: maintTarget });
  } else {
    const parentKey = text(row.relation_record_key, 'Armor projection relation_record_key');
    const target = `relation.relation_armor_sets|${parentKey}`;
    if (!relationPlans.has(target)) throw new Error(`Armor projection parent is not a relation insert or frozen row: ${target}`);
    references.push({ column: 'id', target });
  }
  const referenceColumns = new Set(references.map(reference => reference.column));
  const nonGeneratedFields = Object.fromEntries(Object.entries(row)
    .filter(([column]) => !GENERATED_COLUMNS.has(column) && !referenceColumns.has(column)));
  return { references, nonGeneratedFields };
}

function assertSourceGraph(landingMaintIntent, projectionCandidate) {
  const relationCandidate = projectionCandidate.relationCandidate;
  plain(relationCandidate, 'Armor relation candidate');
  const maintCandidate = landingMaintIntent.snapshots?.maintCandidate;
  plain(maintCandidate, 'Armor maint candidate');
  same(relationCandidate.sourceSnapshotSha256, maintCandidate.sourceSnapshotSha256, 'Armor relation source snapshot');
  same(relationCandidate.inputSnapshots.landingCurrentRows, landingMaintIntent.snapshots.landingCurrentRows, 'Armor relation landing baseline');
  same(relationCandidate.maintBaselineSha256, hash(relationCandidate.inputSnapshots.maintInput.currentRows), 'Armor relation maint baseline');
  same(landingMaintIntent.snapshots.maintBaselineRows, relationCandidate.inputSnapshots.maintInput.currentRows, 'Armor maint baseline');
  same(maintCandidate.managedImageUrlPrefixes, relationCandidate.managedImageUrlPrefixes, 'Armor managed image policy');
  const incoming = new Map((relationCandidate.inputSnapshots.maintInput.landingRows ?? []).map(row => [row.dataset_type, row]));
  const transition = landingMaintIntent.snapshots.landingTransition;
  for (const row of transition.inserts ?? []) {
    const relationRow = incoming.get(row.dataset_type);
    if (!relationRow) throw new Error(`Armor full-chain landing dataset is missing from the relation graph: ${row.dataset_type}`);
    for (const column of ['provider', 'source_key', 'source_page', 'content_hash', 'artifact_role']) {
      if (relationRow[column] !== row[column]) throw new Error(`Armor full-chain landing ${column} drifted: ${row.dataset_type}`);
    }
  }
  for (const dataset of ['armor_sets_raw', 'armor_set_images_raw']) {
    if (!incoming.has(dataset)) throw new Error(`Armor full-chain landing dataset is missing: ${dataset}`);
  }
}

function buildRelationPlans(projectionCandidate, landingMaintIntent) {
  const relationCandidate = projectionCandidate.relationCandidate;
  const landingCurrentRows = landingMaintIntent.snapshots.landingCurrentRows;
  const lineageIssues = inspectArmorCanonicalLandingLineage({ relationCandidate, landingCurrentRows });
  if (lineageIssues.length) throw new Error(`Armor relation landing lineage mismatch: ${stable(lineageIssues[0])}`);
  const landingPlans = new Map(landingMaintIntent.insertPlans
    .filter(plan => plan.databaseRole === 'local')
    .map(plan => [planIdentity(plan), plan]));
  const maintPlans = new Map(landingMaintIntent.insertPlans
    .filter(plan => plan.databaseRole === 'maint')
    .map(plan => [planIdentity(plan), plan]));
  const relationPlans = new Map();
  const plans = [];
  for (const table of RELATION_TABLES) {
    if (table !== 'relation_armor_set_items') {
      for (const update of relationCandidate.changes[table]?.updates ?? []) {
        relationSourceLandingTarget(update.after, landingPlans, landingCurrentRows);
      }
    }
    for (const row of relationCandidate.changes[table]?.inserts ?? []) {
      const logicalKey = relationLogicalKey(table, row);
      const identity = `relation.${table}|${logicalKey}`;
      const { references, nonGeneratedFields } = fieldsAndReferences(table, row, landingPlans, maintPlans, relationPlans, landingCurrentRows);
      const plan = {
        databaseRole: 'relation', table, logicalKey, primaryKeyColumn: 'id',
        generatedColumns: ['id', 'created_at', 'updated_at'], nonGeneratedFields, references,
      };
      plans.push(plan);
      relationPlans.set(identity, plan);
    }
  }
  for (const row of projectionCandidate.changes.projection_armor_sets?.inserts ?? []) {
    const logicalKey = relationLogicalKey('projection_armor_sets', row);
    const identity = `relation.projection_armor_sets|${logicalKey}`;
    const { references, nonGeneratedFields } = fieldsAndReferences('projection_armor_sets', row, landingPlans, maintPlans, relationPlans, landingCurrentRows);
    plans.push({
      databaseRole: 'relation', table: 'projection_armor_sets', logicalKey, primaryKeyColumn: 'id',
      generatedColumns: ['created_at', 'updated_at'], nonGeneratedFields, references,
    });
    relationPlans.set(identity, plans.at(-1));
  }
  return { plans, landingPlans, maintPlans, relationPlans };
}

function buildRecoveryIntent({ landingMaintIntent, relationIntent, projectionCandidate, dependencyGraph, writeTimestamp }) {
  const body = {
    schemaVersion: ARMOR_CANONICAL_RECOVERY_INTENT_SCHEMA,
    operationId: ARMOR_CANONICAL_FULL_CHAIN_OPERATION_ID,
    executable: false,
    writeTimestamp,
    landingMaintIntentSha256: landingMaintIntent.intentSha256,
    relationIntentSha256: relationIntent.intentSha256,
    candidateSha256: projectionCandidate.candidateSha256,
    partialPolicy: projectionCandidate.partialPolicy ?? null,
    dependencyGraph,
  };
  return Object.freeze({ ...body, intentSha256: hash(body) });
}

export function buildArmorCanonicalFullChainIntent({
  landingMaintIntent, projectionCandidate, writeTimestamp,
} = {}) {
  validateArmorCanonicalLandingMaintIntent(landingMaintIntent);
  plain(projectionCandidate, 'Armor projection candidate');
  hashValue(projectionCandidate.candidateSha256, 'Armor projection candidate hash');
  if (projectionCandidate.executable !== false || projectionCandidate.schemaVersion !== 'armor-canonical-projection-candidate/v1') {
    throw new Error('Armor projection candidate identity is invalid');
  }
  text(writeTimestamp, 'Armor full-chain writeTimestamp');
  if (writeTimestamp !== landingMaintIntent.writeTimestamp) throw new Error('Armor full-chain writeTimestamp drifted');
  assertSourceGraph(landingMaintIntent, projectionCandidate);
  const { plans, landingPlans, maintPlans, relationPlans } = buildRelationPlans(projectionCandidate, landingMaintIntent);
  const upstreamReferenceDeclarations = plans.flatMap(plan => plan.references
    .map(reference => reference.target)
    .filter(target => target.startsWith('local.source_dataset_landings|') || target.startsWith('maint.')));
  const relationIntent = buildArmorCanonicalIntent({
    candidate: projectionCandidate,
    insertPlans: plans,
    writeTimestamp,
    upstreamReferenceDeclarations: [...new Set(upstreamReferenceDeclarations)].sort(),
  });
  const dependencyGraph = {
    landingToMaint: landingMaintIntent.insertPlans.flatMap(plan => plan.references.map(reference => ({
      source: planIdentity(plan), column: reference.column, target: reference.target,
    }))),
    maintToRelation: relationIntent.insertPlans.flatMap(plan => plan.references
      .filter(reference => reference.target.startsWith('maint.'))
      .map(reference => ({ source: planIdentity(plan), column: reference.column, target: reference.target }))),
    landingToRelation: relationIntent.insertPlans.flatMap(plan => plan.references
      .filter(reference => reference.target.startsWith('local.source_dataset_landings|'))
      .map(reference => ({ source: planIdentity(plan), column: reference.column, target: reference.target }))),
    relationToProjection: relationIntent.insertPlans.flatMap(plan => plan.references
      .filter(reference => reference.target.startsWith('relation.relation_armor_sets|'))
      .map(reference => ({ source: planIdentity(plan), column: reference.column, target: reference.target }))),
  };
  const recoveryIntent = buildRecoveryIntent({ landingMaintIntent, relationIntent, projectionCandidate, dependencyGraph, writeTimestamp });
  const body = {
    schemaVersion: ARMOR_CANONICAL_FULL_CHAIN_SCHEMA,
    operationId: ARMOR_CANONICAL_FULL_CHAIN_OPERATION_ID,
    executable: false,
    executionBlocker: 'registered-full-chain-executor-required',
    writeTimestamp,
    partialPolicy: projectionCandidate.partialPolicy ?? null,
    landingMaintIntent,
    relationIntent,
    recoveryIntent,
    dependencyGraph,
  };
  return Object.freeze({ ...body, fullChainSha256: hash(body) });
}

export function validateArmorCanonicalFullChainIntent(value) {
  plain(value, 'Armor full-chain intent');
  if (value.schemaVersion !== ARMOR_CANONICAL_FULL_CHAIN_SCHEMA
      || value.operationId !== ARMOR_CANONICAL_FULL_CHAIN_OPERATION_ID || value.executable !== false
      || value.executionBlocker !== 'registered-full-chain-executor-required') throw new Error('Armor full-chain intent identity is invalid');
  text(value.writeTimestamp, 'Armor full-chain writeTimestamp');
  validateArmorCanonicalLandingMaintIntent(value.landingMaintIntent);
  validateArmorCanonicalIntent(value.relationIntent);
  if (value.landingMaintIntent.writeTimestamp !== value.writeTimestamp
      || value.relationIntent.writeTimestamp !== value.writeTimestamp
      || value.recoveryIntent?.writeTimestamp !== value.writeTimestamp) throw new Error('Armor full-chain timestamp binding drifted');
  plain(value.recoveryIntent, 'Armor recovery intent');
  hashValue(value.recoveryIntent.intentSha256, 'Armor recovery intent hash');
  const { intentSha256: _recoveryHash, ...recoveryBody } = value.recoveryIntent;
  if (hash(recoveryBody) !== value.recoveryIntent.intentSha256) throw new Error('Armor recovery intent hash drifted');
  const candidatePolicy = value.relationIntent.candidateSnapshot?.partialPolicy ?? null;
  if (stable(value.partialPolicy ?? null) !== stable(candidatePolicy)
      || stable(value.recoveryIntent.partialPolicy ?? null) !== stable(candidatePolicy)) {
    throw new Error('Armor full-chain partial policy drifted from candidate');
  }
  for (const key of ['landingToMaint', 'maintToRelation', 'landingToRelation', 'relationToProjection']) {
    if (!Array.isArray(value.dependencyGraph?.[key])) throw new Error(`Armor full-chain dependency graph ${key} is missing`);
  }
  const expectedGraph = {
    landingToMaint: value.landingMaintIntent.insertPlans.flatMap(plan => plan.references.map(reference => ({
      source: planIdentity(plan), column: reference.column, target: reference.target,
    }))),
    maintToRelation: value.relationIntent.insertPlans.flatMap(plan => plan.references
      .filter(reference => reference.target.startsWith('maint.'))
      .map(reference => ({ source: planIdentity(plan), column: reference.column, target: reference.target }))),
    landingToRelation: value.relationIntent.insertPlans.flatMap(plan => plan.references
      .filter(reference => reference.target.startsWith('local.source_dataset_landings|'))
      .map(reference => ({ source: planIdentity(plan), column: reference.column, target: reference.target }))),
    relationToProjection: value.relationIntent.insertPlans.flatMap(plan => plan.references
      .filter(reference => reference.target.startsWith('relation.relation_armor_sets|'))
      .map(reference => ({ source: planIdentity(plan), column: reference.column, target: reference.target }))),
  };
  same(value.dependencyGraph, expectedGraph, 'Armor full-chain dependency graph');
  same(value.recoveryIntent.dependencyGraph, value.dependencyGraph, 'Armor recovery dependency graph');
  if (value.recoveryIntent.landingMaintIntentSha256 !== value.landingMaintIntent.intentSha256
      || value.recoveryIntent.relationIntentSha256 !== value.relationIntent.intentSha256) {
    throw new Error('Armor recovery intent bindings drifted from full-chain intents');
  }
  const { fullChainSha256: _ignored, ...body } = value;
  hashValue(value.fullChainSha256, 'Armor full-chain hash');
  if (hash(body) !== value.fullChainSha256) throw new Error('Armor full-chain hash drifted');
  return true;
}
