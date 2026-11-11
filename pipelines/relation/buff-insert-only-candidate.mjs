import { createHash } from 'node:crypto';

import { buildBuffLandingInsertPlan } from '../landing/buff-bounded-landing-mutation.mjs';
import { buildBuffMaintMutationPlan } from './buff-maint-mutation-plan.mjs';
import {
  BUFF_CANDIDATE_COLUMNS,
  buildBuffIncrementalMutationPlan,
} from './sync-buffs-to-relation.mjs';

export const BUFF_INSERT_ONLY_CANDIDATE_SCHEMA = 'buff-insert-only-candidate/v1';
export const INSERT_ONLY_BUFF_IDS = Object.freeze(Array.from({ length: 12 }, (_, index) => 389 + index));
const TABLES = Object.freeze([
  'relation_buffs',
  'item_buff_relations',
  'npc_buff_relations',
  'relation_buff_images',
  'projection_buffs',
]);
const HASH = /^sha256:[a-f0-9]{64}$/;

/**
 * Build a deferred, read-only candidate for the twelve Buff IDs that have no
 * historical baseline. The relation planner validates the new rows against an
 * unmaterialized landing while this wrapper preserves the complete DB snapshot
 * as-is. Allocation, maint binding, and owner authorization remain external.
 */
export async function buildBuffInsertOnlyCandidate({
  runId,
  landing,
  sourceEvidenceHash,
  sourceInputSha256,
  payload,
  pageEvidenceByInternalName,
  currentMaintRows,
  currentRows,
  managedImageUrlPrefixes,
  allowUnresolvedSecondaryIssues = false,
} = {}) {
  requireHash(sourceEvidenceHash, 'Buff insert-only source evidence hash');
  requireHash(sourceInputSha256, 'Buff insert-only source input hash');
  if (!Array.isArray(currentMaintRows) || !currentRows || typeof currentRows !== 'object') {
    throw new Error('Buff insert-only complete DB snapshots are required');
  }
  if (TABLES.some((table) => !Array.isArray(currentRows[table]))) {
    throw new Error('Buff insert-only relation snapshot is incomplete');
  }
  if (!payload || !Array.isArray(payload.relationBuffs) || !Array.isArray(payload.projectionBuffs)
      || !Array.isArray(payload.itemBuffRelations) || !Array.isArray(payload.npcBuffRelations)
      || !Array.isArray(payload.relationBuffImages) || !Array.isArray(payload.issues)) {
    throw new Error('Buff insert-only relation payload is incomplete');
  }
  if (payload.issues.length > 0 && !allowUnresolvedSecondaryIssues) {
    throw new Error('Buff insert-only relation payload has unresolved issues');
  }

  const landingPlan = buildBuffLandingInsertPlan({ landingRow: landing, sourceEvidenceHash, runId });
  const sourcePayload = parseJson(landingPlan.landing.payload_json, 'Buff insert-only landing payload');
  const sourceBuffs = assertSourceScope(sourcePayload);
  const selectedNames = new Set(sourceBuffs.map((row) => row.internalName));
  const evidence = normalizeEvidence(pageEvidenceByInternalName, selectedNames);
  const maint = await buildBuffMaintMutationPlan({
    landingRow: { ...landing, id: null },
    currentRows: currentMaintRows,
    allowUnmaterializedLandingId: true,
  });
  if (maint.inserts.length !== INSERT_ONLY_BUFF_IDS.length || maint.updates.length !== 0
      || maint.deletes.length !== 0 || maint.preserved.length !== currentMaintRows.length) {
    throw new Error('Buff insert-only maint plan has baseline overlap or is not insert-only');
  }
  const maintIds = new Set(maint.inserts.map((row) => Number(row.source_id)));
  if (JSON.stringify([...maintIds].sort((a, b) => a - b)) !== JSON.stringify([...INSERT_ONLY_BUFF_IDS])) {
    throw new Error('Buff insert-only maint source scope drifted');
  }

  const scopedCurrentRows = Object.fromEntries(TABLES.map((table) => [table, []]));
  const relationPlan = buildBuffIncrementalMutationPlan({
    currentRows: scopedCurrentRows,
    payload,
    landingRows: [{ ...landing, id: null }],
    allowUnmaterializedLandingIds: true,
    allowUnresolvedFacts: allowUnresolvedSecondaryIssues,
    pageEvidenceByInternalName: evidence,
    managedImageUrlPrefixes,
  });
  assertRelationInsertScope(relationPlan, currentRows);
  const changes = Object.fromEntries(TABLES.map((table) => [table, {
    inserts: relationPlan.changes[table].inserts.map(clone),
    updates: [],
    unchanged: [],
    preserved: currentRows[table].map(clone),
  }]));
  const expectedRows = Object.fromEntries(TABLES.map((table) => [table,
    [...currentRows[table], ...relationPlan.changes[table].inserts].map(clone),
  ]));
  const candidate = {
    schemaVersion: 'buff-incremental-candidate/v1',
    executable: false,
    executionBlocker: 'zero-baseline-owner-and-full-chain-authorization-required',
    tables: [...TABLES],
    changes,
    expectedRows,
    summary: {
      inserts: TABLES.reduce((total, table) => total + changes[table].inserts.length, 0),
      updates: 0,
      unchanged: 0,
      preserved: TABLES.reduce((total, table) => total + changes[table].preserved.length, 0),
    },
    deletes: [],
    managedImageUrlPrefixes: relationPlan.managedImageUrlPrefixes,
    managedImageUrlPrefixesSha256: relationPlan.managedImageUrlPrefixesSha256,
    destructiveClear: false,
  };

  const result = {
    schemaVersion: BUFF_INSERT_ONLY_CANDIDATE_SCHEMA,
    operationId: 'canonical-buff-insert-only-candidate',
    status: payload.issues.length > 0 ? 'blocked' : 'ready-for-owner-review',
    databaseWrites: false,
    networkRequests: 0,
    executable: false,
    applyAllowed: false,
    destructiveClear: false,
    scope: {
      buffIds: [...INSERT_ONLY_BUFF_IDS],
      missingBaselineIds: [...INSERT_ONLY_BUFF_IDS],
      sourcePayloadSha256: hashValue(sourcePayload),
      sourceInputSha256,
    },
    upstream: { landing: landingPlan, maint },
    candidate,
    changes,
    expectedRows,
    summary: {
      buffIds: INSERT_ONLY_BUFF_IDS.length,
      maintInserts: maint.inserts.length,
      relationBuffInserts: changes.relation_buffs.inserts.length,
      itemBuffRelationInserts: changes.item_buff_relations.inserts.length,
      npcBuffRelationInserts: changes.npc_buff_relations.inserts.length,
      projectionBuffInserts: changes.projection_buffs.inserts.length,
      relationImageInserts: changes.relation_buff_images.inserts.length,
      secondaryIssues: payload.issues.length,
      preservedRows: candidate.summary.preserved,
      databaseWrites: 0,
    },
    lineage: {
      landingToMaint: maint.inserts.map((row) => ({
        buffId: Number(row.source_id),
        landingSourceKey: row.landing_source_key,
        landingContentHash: row.landing_content_hash,
        landingSourceId: null,
      })),
      maintToRelation: changes.relation_buffs.inserts.map((row) => ({
        buffId: Number(row.source_id),
        internalName: row.internal_name,
        sourceMaintTable: row.source_maint_table,
        sourceMaintId: row.source_maint_id,
        sourceMaintRecordKey: row.source_maint_record_key,
      })),
      relationToProjection: changes.projection_buffs.inserts.map((row) => ({
        buffId: Number(row.source_id),
        relationRecordKey: row.relation_record_key,
      })),
    },
    blockedBy: [
      'Buff IDs 389-400 have no historical baseline; zero-baseline owner decision is required',
      'deferred landing and maint identity allocation require an independent full-chain executor',
      'canonical publication requires independent owner authorization and fresh locked readback',
      ...(payload.issues.length > 0
        ? [`${payload.issues.length} secondary source facts require independent item/NPC identity review`]
        : []),
    ],
  };
  result.secondaryIssues = clone(payload.issues);
  result.candidateSha256 = hashValue(candidate);
  result.contractSha256 = hashValue({ ...result, contractSha256: undefined });
  return result;
}

function assertSourceScope(payload) {
  if (payload.sourcePageTitle !== 'Template:GetBuffInfo'
      || !Array.isArray(payload.buffs) || payload.buffs.length !== INSERT_ONLY_BUFF_IDS.length
      || Number(payload.totalBuffs) !== INSERT_ONLY_BUFF_IDS.length) {
    throw new Error('Buff insert-only source payload scope is invalid');
  }
  const ids = payload.buffs.map((row) => Number(row?.id));
  if (JSON.stringify([...ids].sort((a, b) => a - b)) !== JSON.stringify([...INSERT_ONLY_BUFF_IDS])) {
    throw new Error('Buff insert-only source payload must contain exactly 389-400');
  }
  const names = new Set();
  for (const row of payload.buffs) {
    if (!Number.isSafeInteger(Number(row.id)) || typeof row.internalName !== 'string'
        || !row.internalName.trim() || names.has(row.internalName)) {
      throw new Error('Buff insert-only source payload identity is invalid');
    }
    names.add(row.internalName);
  }
  return payload.buffs;
}

function normalizeEvidence(value, names) {
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value ?? {});
  if (entries.length !== names.size || entries.some(([name]) => !names.has(name))) {
    throw new Error('Buff insert-only page evidence scope is incomplete');
  }
  return new Map(entries.map(([name, row]) => [name, clone(row)]));
}

function assertRelationInsertScope(plan, currentRows) {
  for (const table of TABLES) {
    if (plan.changes[table].updates.length !== 0 || plan.changes[table].preserved.length !== 0) {
      throw new Error(`Buff insert-only scoped relation plan is not insert-only: ${table}`);
    }
    const baseline = currentRows[table];
    const baselineKeys = new Set(baseline.map((row) => rowKey(table, row)));
    const insertKeys = new Set();
    for (const row of plan.changes[table].inserts) {
      const key = rowKey(table, row);
      if (baselineKeys.has(key) || insertKeys.has(key)) throw new Error(`Buff insert-only ${table} identity overlaps baseline`);
      insertKeys.add(key);
      if (table === 'relation_buffs' || table === 'projection_buffs') {
        if (!INSERT_ONLY_BUFF_IDS.includes(Number(row.source_id))) throw new Error(`Buff insert-only ${table} source scope drifted`);
      } else if (!INSERT_ONLY_BUFF_IDS.includes(Number(row.buff_source_id))) {
        throw new Error(`Buff insert-only ${table} Buff scope drifted`);
      }
    }
  }
}

function rowKey(table, row) {
  const key = table === 'projection_buffs' ? row.id : row.record_key;
  if (key == null || key === '') throw new Error(`Buff insert-only ${table} identity is missing`);
  return String(key);
}

function parseJson(value, label) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    return parsed;
  } catch {
    throw new Error(`${label} is invalid`);
  }
}

function requireHash(value, label) {
  if (!HASH.test(String(value ?? ''))) throw new Error(`${label} is invalid`);
}

function hashValue(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export { BUFF_CANDIDATE_COLUMNS };
