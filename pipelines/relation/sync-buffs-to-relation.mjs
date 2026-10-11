#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { buildBuffEntityRelations } from './buff-entity-processor.mjs';
import { normalizeText } from './relation-trace.mjs';
import { buildSecondaryRelations } from './secondary-relation-processor.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';
import { isManagedImagePath, normalizeManagedImageUrlPrefixes } from './managed-image-url-policy.mjs';
import { buildBuffPartialFactPlan } from './buff-source-applicability.mjs';

const repoRoot = getProjectRoot();
const moduleRequire = createRequire(import.meta.url);
let mysqlModule = null;

const BUFF_INCREMENTAL_TABLES = Object.freeze([
  'relation_buffs',
  'item_buff_relations',
  'npc_buff_relations',
  'relation_buff_images',
  'projection_buffs',
]);
const PAYLOAD_TABLES = Object.freeze({
  relation_buffs: 'relationBuffs',
  item_buff_relations: 'itemBuffRelations',
  npc_buff_relations: 'npcBuffRelations',
  relation_buff_images: 'relationBuffImages',
  projection_buffs: 'projectionBuffs',
});
const TRACE_COLUMNS = 'source_maint_table source_maint_record_key source_maint_id landing_source_id landing_source_key landing_content_hash source_provider source_page source_revision_timestamp';
const AUDIT_COLUMNS = 'id record_key confidence reason review_status raw_json status deleted created_at updated_at';
const CANDIDATE_COLUMNS = Object.freeze({
  relation_buffs: `${TRACE_COLUMNS} ${AUDIT_COLUMNS} source_id internal_name english_name name_zh buff_type tooltip_en tooltip_zh source_item_count immune_npc_count source_items_json prevention_items_json inflicting_npcs_json immune_npcs_json immune_npc_sample_json source_evidence_json`,
  item_buff_relations: `${TRACE_COLUMNS} ${AUDIT_COLUMNS} item_source_id item_internal_name buff_source_id buff_internal_name relation_type duration_ticks chance_value chance_text conditions`,
  npc_buff_relations: `${TRACE_COLUMNS} ${AUDIT_COLUMNS} npc_source_id npc_internal_name npc_name buff_source_id buff_internal_name relation_type duration_ticks chance_value chance_text conditions`,
  relation_buff_images: `${TRACE_COLUMNS} ${AUDIT_COLUMNS} buff_internal_name buff_name role source_file_title original_url cached_url width height content_type is_primary sort_order`,
  projection_buffs: 'id relation_record_key source_id internal_name english_name name_zh tooltip_en tooltip_zh image buff_type source_item_count immune_npc_count source_items_json prevention_items_json inflicting_npcs_json immune_npcs_json immune_npc_sample_json source_evidence_json status deleted created_at updated_at',
});

function loadMysqlModule() {
  if (mysqlModule) return mysqlModule;
  try {
    mysqlModule = moduleRequire('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    mysqlModule = createRequire(path.join(repoRoot, 'apps/admin-console', 'package.json'))('mysql2/promise');
  }
  return mysqlModule;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function formatDateTag(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function camelToSnake(value) {
  return String(value).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function mapRowToDb(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    const column = camelToSnake(key);
    if (Object.hasOwn(mapped, column)) throw new Error(`duplicate column alias: ${column}`);
    mapped[column] = value;
  }
  return mapped;
}

async function queryRows(connection, sql) {
  const [rows] = await connection.query(sql);
  return rows;
}

function parseRequiredJson(value, label, array = false) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { throw new Error(`invalid ${label} JSON`); }
  }
  if (array ? !Array.isArray(parsed) : !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid ${label} ${array ? 'array' : 'object'}`);
  }
  return parsed;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function equalJson(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`missing or invalid ${label}`);
  return value;
}

export function normalizeBuffPageEvidence({ evidence } = {}) {
  if (!evidence) throw new Error('buff page immunity evidence is missing');
  const sourceEvidence = parseRequiredJson(evidence.sourceEvidence, 'source evidence');
  const parseStatus = sourceEvidence.parseStatus;
  const group = sourceEvidence.factGroups?.immuneNpcs;
  const alternate = completeAlternateImmunityEvidence(sourceEvidence);
  if ((group?.status === 'parsed' || group?.status?.startsWith('target_'))
      && sourceEvidence.immunityTargetBinding !== undefined
      && sourceEvidence.immunityTargetBinding?.status !== 'matched'
      && alternate == null) {
    throw new Error('buff page immunity target binding is unresolved');
  }
  const unresolvedFacts = Array.isArray(sourceEvidence.unresolvedFacts) ? sourceEvidence.unresolvedFacts : null;
  const nonImmunityUnresolvedFacts = unresolvedFacts?.filter((fact) => fact?.group !== 'immuneNpcs') ?? null;
  const immunityUnresolvedFacts = unresolvedFacts?.filter((fact) => fact?.group === 'immuneNpcs') ?? null;
  if ((parseStatus !== 'parsed' && alternate == null) || unresolvedFacts == null || nonImmunityUnresolvedFacts.length > 0
      || (immunityUnresolvedFacts.length > 0 && alternate == null)) {
    throw new Error('buff page immunity evidence is incomplete');
  }
  const hasPageSection = group?.status === 'parsed' && Array.isArray(group.sections) && group.sections.length > 0
    && immunityUnresolvedFacts.length === 0;
  if (!hasPageSection && alternate == null) {
    throw new Error('buff page immunity evidence requires a parsed immunity section');
  }
  const immuneNpcs = parseRequiredJson(evidence.immuneNpcs, 'immunity list', true);
  const immuneNpcSample = parseRequiredJson(evidence.immuneNpcSample, 'immunity sample', true);
  const count = evidence.immuneNpcCount;
  if (!Number.isSafeInteger(count) || count < 0 || count !== immuneNpcs.length
      || (hasPageSection && group.count !== count)) {
    throw new Error('buff page immunity count is inconsistent');
  }
  if (alternate != null && !hasPageSection) {
    const expected = alternate.assertions.map(alternateNpcRow);
    const identity = (row) => [row?.npcId, row?.internalName, row?.name ?? null, row?.pageTitle];
    if (!equalJson(immuneNpcs.map(identity), expected.map(identity))) {
      throw new Error('complete alternate immunity rows drifted');
    }
  }
  const identities = immuneNpcs.map((row) => requiredText(row?.pageTitle ?? row?.internalName, 'immunity NPC identity'));
  if (new Set(identities).size !== identities.length && hasPageSection) throw new Error('duplicate immunity NPC identity');
  if (immuneNpcSample.length > count || !equalJson(immuneNpcSample, immuneNpcs.slice(0, immuneNpcSample.length))) {
    throw new Error('buff page immunity sample is inconsistent');
  }
  const sourcePage = requiredText(sourceEvidence.canonicalPageTitle, 'page evidence canonical page');
  requiredText(sourceEvidence.pageTitle, 'page evidence page title');
  if (sourceEvidence.provider !== 'terraria.wiki.gg') throw new Error('buff page evidence provider mismatch');
  if (!Number.isSafeInteger(sourceEvidence.revisionId) || sourceEvidence.revisionId <= 0
      || typeof sourceEvidence.revisionTimestamp !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(sourceEvidence.revisionTimestamp)
      || !Number.isFinite(Date.parse(sourceEvidence.revisionTimestamp))) {
    throw new Error('buff page evidence revision identity is missing or invalid');
  }
  const buffId = evidence.buffId ?? evidence.id;
  if (!Number.isSafeInteger(Number(buffId)) || Number(buffId) <= 0
      || (evidence.buffId != null && evidence.id != null && Number(evidence.buffId) !== Number(evidence.id))) {
    throw new Error('buff page evidence buff identity is missing or invalid');
  }
  return {
    buffId: Number(buffId),
    sourcePage,
    revisionId: sourceEvidence.revisionId,
    revisionTimestamp: sourceEvidence.revisionTimestamp,
    parseStatus,
    hasImmuneSection: hasPageSection,
    immuneNpcCount: count,
    immuneNpcs,
    immuneNpcSample,
    sourceEvidence,
  };
}

function completeAlternateImmunityEvidence(sourceEvidence) {
  const wrapper = sourceEvidence?.immuneNpcPositiveEvidence;
  const alternate = wrapper?.immuneNpcPositiveEvidence
    ?? sourceEvidence?.completeImmuneNpcEvidence
    ?? (wrapper && ['complete-npc-scope', 'complete-expanded-npc-scope'].includes(wrapper.status) ? wrapper : null);
  if (!alternate) return null;
  if (!['complete-npc-scope', 'complete-expanded-npc-scope'].includes(alternate.status)
      || !Array.isArray(alternate.assertions)) {
    return null;
  }
  const seen = new Set();
  for (const assertion of alternate.assertions) {
    if (!Number.isSafeInteger(Number(assertion?.npcId)) || Number(assertion.npcId) === 0
        || typeof assertion.npcInternalName !== 'string' || !assertion.npcInternalName.trim()) {
      throw new Error('complete alternate immunity assertion identity is invalid');
    }
    const key = `${Number(assertion.npcId)}:${assertion.npcInternalName}`;
    if (seen.has(key)) throw new Error('duplicate complete alternate immunity assertion');
    seen.add(key);
  }
  if (alternate.status === 'complete-expanded-npc-scope') {
    const semantic = alternate.source?.semanticExpansion ?? alternate.semanticExpansion;
    if (!isBoundSemanticExpansion(semantic)) {
      throw new Error('complete alternate immunity semantic evidence is missing');
    }
  }
  return alternate;
}

function isBoundSemanticExpansion(semantic) {
  const requiredTitles = new Set([
    'Module:Npcinfo/doc', 'Module:Npcinfo/datagen',
    'Template:GetBuffInfo', 'Whips',
  ]);
  if (!semantic || semantic.schemaVersion !== 'buff-npcinfo-semantic-expansion/v1'
      || !Array.isArray(semantic.whipDebuffBuffIds)
      || !Array.isArray(semantic.sourcePages) || semantic.sourcePages.length !== requiredTitles.size) {
    return false;
  }
  const titles = new Set();
  for (const page of semantic.sourcePages) {
    if (!page || !requiredTitles.has(page.pageTitle) || titles.has(page.pageTitle)
        || !Number.isSafeInteger(page.pageId) || page.pageId <= 0
        || !Number.isSafeInteger(page.revisionId) || page.revisionId <= 0
        || typeof page.revisionTimestamp !== 'string' || !Number.isFinite(Date.parse(page.revisionTimestamp))
        || !/^sha256:[a-f0-9]{64}$/.test(String(page.rawSha256 ?? ''))) return false;
    titles.add(page.pageTitle);
  }
  return titles.size === requiredTitles.size;
}

function alternateNpcRow(assertion) {
  const name = assertion.npcName ?? assertion.npcInternalName;
  return {
    npcId: Number(assertion.npcId),
    internalName: assertion.npcInternalName,
    name: assertion.npcName ?? null,
    pageTitle: name,
    source: 'npcinfo-module-expanded',
    ...(assertion.sourceRevisionId != null ? { sourceRevisionId: assertion.sourceRevisionId } : {}),
  };
}

export function buildBuffIncrementalMutationPlan({
  currentRows,
  payload,
  landingRows = [],
  allowUnmaterializedLandingIds = false,
  allowUnresolvedFacts = false,
  pageEvidenceByInternalName = new Map(),
  partialFactPlansByInternalName = new Map(),
  managedImageUrlPrefixes = [],
} = {}) {
  if (!payload || Object.keys(payload).some((key) => ![...Object.values(PAYLOAD_TABLES), 'issues'].includes(key))
      || Object.values(PAYLOAD_TABLES).some((key) => !Array.isArray(payload[key]))) {
    throw new Error('buff candidate payload table set is invalid');
  }
  if (!currentRows || BUFF_INCREMENTAL_TABLES.some((table) => !Array.isArray(currentRows[table]))) {
    throw new Error('buff candidate requires a complete current table snapshot');
  }
  if (Object.keys(currentRows).some((table) => !BUFF_INCREMENTAL_TABLES.includes(table))) throw new Error('unrelated baseline table');
  if (!Array.isArray(payload.issues) || payload.issues.length > 0 && !allowUnresolvedFacts) {
    throw new Error('buff candidate has unresolved facts');
  }
  const prefixes = normalizeManagedImageUrlPrefixes(managedImageUrlPrefixes);
  if (!Array.isArray(managedImageUrlPrefixes) || prefixes.length === 0
      || managedImageUrlPrefixes.some((prefix) => normalizeManagedImageUrlPrefixes([prefix]).length !== 1)) {
    throw new Error('buff managed image prefixes are missing or invalid');
  }
  const candidates = Object.fromEntries(BUFF_INCREMENTAL_TABLES.map((table) => [table, payload[PAYLOAD_TABLES[table]].map(mapRowToDb)]));
  const baseline = Object.fromEntries(BUFF_INCREMENTAL_TABLES.map((table) => [table, currentRows[table].map(mapRowToDb)]));
  for (const table of BUFF_INCREMENTAL_TABLES) {
    const allowed = new Set(CANDIDATE_COLUMNS[table].split(' '));
    if (candidates[table].some((row) => Object.keys(row).some((column) => !allowed.has(column)))) {
      throw new Error(`unowned candidate column in ${table}`);
    }
    indexRows(candidates[table], table);
    indexRows(baseline[table], table);
  }
  const landings = validateLandingRows(landingRows, { allowUnmaterializedLandingIds });
  const evidenceMap = pageEvidenceByInternalName instanceof Map
    ? pageEvidenceByInternalName
    : new Map(Object.entries(pageEvidenceByInternalName ?? {}));
  const partialPlanMap = partialFactPlansByInternalName instanceof Map
    ? partialFactPlansByInternalName
    : new Map(Object.entries(partialFactPlansByInternalName ?? {}));
  if ([...evidenceMap.keys()].some((name) => partialPlanMap.has(name))) {
    throw new Error('Buff strict and partial evidence contracts conflict');
  }
  const baselineRelationByName = new Map();
  for (const row of baseline.relation_buffs) {
    if (row.internal_name == null) continue;
    if (baselineRelationByName.has(row.internal_name)) throw new Error('duplicate baseline buff identity');
    baselineRelationByName.set(row.internal_name, row);
  }
  const relationByName = new Map();
  const sourceIds = new Set();
  for (const row of candidates.relation_buffs) {
    const name = requiredText(row.internal_name, 'buff identity');
    if (relationByName.has(name) || sourceIds.has(String(row.source_id))) throw new Error('duplicate buff identity');
    const partialPlan = partialPlanMap.get(name);
    const sourceEvidence = partialPlan ? parseRequiredJson(row.raw_json, 'buff raw').sourceEvidence : evidenceMap.get(name);
    const baselineRow = partialPlan ? baselineRelationByName.get(name) : null;
    const evidence = partialPlan
      ? normalizeBuffPartialFactEvidence({ row, partialPlan, baselineRow })
      : normalizeBuffPageEvidence({ evidence: sourceEvidence });
    if (partialPlan) applyPartialFactPlan(row, partialPlan, baselineRow);
    bindPageEvidence(row, sourceEvidence, evidence, landings, { partialPlan, baselineRow });
    validateDerivedBuffRow(row, JSON.parse(row.raw_json), evidence);
    row.immune_npc_count = evidence.immuneNpcCount;
    row.immune_npcs_json = JSON.stringify(evidence.immuneNpcs);
    row.immune_npc_sample_json = JSON.stringify(evidence.immuneNpcSample);
    row.source_evidence_json = JSON.stringify(evidence.sourceEvidence);
    relationByName.set(name, row);
    sourceIds.add(String(row.source_id));
  }
  if ([...evidenceMap.keys()].some((name) => !relationByName.has(name))) throw new Error('unrelated page evidence identity');
  if ([...partialPlanMap.keys()].some((name) => !relationByName.has(name))) throw new Error('unrelated partial fact plan identity');
  for (const table of ['item_buff_relations', 'npc_buff_relations', 'relation_buff_images']) {
    for (const row of candidates[table]) {
      const buff = relationByName.get(row.buff_internal_name);
      if (!buff || (table !== 'relation_buff_images' && String(row.buff_source_id) !== String(buff.source_id))) {
        throw new Error(`buff ${table} identity mismatch`);
      }
      if (table !== 'relation_buff_images') {
        validateSecondaryRelation(row, table, buff, evidenceMap.get(buff.internal_name), {
          partialPlan: partialPlanMap.get(buff.internal_name),
          allowUnmaterializedMaintTrace: allowUnmaterializedLandingIds,
        });
      }
    }
  }
  validatePartialAdditiveRelationCoverage({
    partialPlanMap,
    relationByName,
    candidateNpcRelations: candidates.npc_buff_relations,
  });
  const imagesByName = new Map();
  const currentImages = indexRows(baseline.relation_buff_images, 'relation_buff_images');
  const candidateImages = indexRows(candidates.relation_buff_images, 'relation_buff_images');
  if (baseline.relation_buff_images.some((row) => relationByName.has(row.buff_internal_name)
      && Number(row.status) === 1 && Number(row.deleted) === 0 && !candidateImages.has(row.record_key))) {
    throw new Error('buff image snapshot coverage is incomplete');
  }
  for (const row of candidates.relation_buff_images) {
    if (Number(row.status) !== 1 || Number(row.deleted) !== 0 || !managedImage(row.cached_url, prefixes)) {
      throw new Error('buff relation image ownership is unmanaged or inactive');
    }
    const current = currentImages.get(row.record_key);
    if (!current || changedColumns(current, row, 'relation_buff_images').length > 0) {
      throw new Error('buff image writes require separate upstream image evidence');
    }
    const images = imagesByName.get(row.buff_internal_name) ?? [];
    images.push(row);
    imagesByName.set(row.buff_internal_name, images);
  }
  const projectionNames = new Set();
  for (const row of candidates.projection_buffs) {
    const relation = relationByName.get(row.internal_name);
    if (!relation || String(row.id) !== String(relation.source_id) || String(row.source_id) !== String(relation.source_id)
        || row.relation_record_key !== relation.record_key || projectionNames.has(row.internal_name)) {
      throw new Error('buff projection identity mismatch');
    }
    projectionNames.add(row.internal_name);
    for (const column of ['english_name', 'name_zh', 'buff_type', 'tooltip_en', 'tooltip_zh']) {
      if (row[column] !== relation[column]) throw new Error(`buff projection field drifted: ${column}`);
    }
    for (const column of ['immune_npc_count', 'immune_npcs_json', 'immune_npc_sample_json', 'source_evidence_json']) {
      row[column] = relation[column];
    }
    if (partialPlanMap.has(row.internal_name)) {
      for (const column of ['source_item_count', 'source_items_json', 'inflicting_npcs_json']) {
        row[column] = relation[column];
      }
    }
    const images = imagesByName.get(row.internal_name) ?? [];
    const primary = images.filter((image) => Number(image.is_primary) === 1);
    if (primary.length > 1) throw new Error('ambiguous primary buff image identity');
    const selected = primary[0] ?? (images.length === 1 ? images[0] : null);
    if ((row.image != null && (!managedImage(row.image, prefixes) || row.image !== selected?.cached_url))
        || (selected && row.image !== selected.cached_url)) {
      throw new Error('buff projection image does not match managed relation image');
    }
  }
  if (projectionNames.size !== relationByName.size) throw new Error('buff projection coverage mismatch');
  const changes = {};
  const expectedRows = {};
  const summary = { inserts: 0, updates: 0, unchanged: 0, preserved: 0 };
  for (const table of BUFF_INCREMENTAL_TABLES) {
    const delta = buildTableDelta(baseline[table], candidates[table], table);
    changes[table] = delta.changes;
    expectedRows[table] = delta.expectedRows;
    for (const kind of Object.keys(summary)) summary[kind] += delta.changes[kind].length;
  }
  return {
    schemaVersion: 'buff-incremental-candidate/v1',
    executable: false,
    executionBlocker: 'registered-executor-required',
    tables: [...BUFF_INCREMENTAL_TABLES],
    changes,
    expectedRows,
    summary,
    deletes: [],
    managedImageUrlPrefixes: prefixes,
    managedImageUrlPrefixesSha256: `sha256:${createHash('sha256').update(JSON.stringify(prefixes)).digest('hex')}`,
    destructiveClear: false,
  };
}

function validateLandingRows(rows, { allowUnmaterializedLandingIds = false } = {}) {
  if (!Array.isArray(rows)) throw new Error('invalid landing rows');
  const result = new Map();
  for (const input of rows) {
    const row = mapRowToDb(input);
    const payload = parseRequiredJson(row.payload_json, 'landing payload');
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    if (row.content_hash !== hash) throw new Error('landing content hash mismatch');
    const validId = allowUnmaterializedLandingIds
      ? row.id == null || Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0
      : Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0;
    if (row.dataset_type !== 'buffs_raw' || row.parse_status !== 'ok' || Number(row.is_current) !== 1
        || !validId) throw new Error('invalid current Buff landing identity');
    if (result.has(String(row.id))) throw new Error('duplicate landing identity');
    const records = payload.records ?? payload.buffs;
    if (!Array.isArray(records)) throw new Error('invalid landing record list');
    result.set(String(row.id), { row, records });
  }
  return result;
}

function normalizeBuffPartialFactEvidence({ row, partialPlan, baselineRow }) {
  if (!baselineRow) throw new Error('partial Buff fact plan baseline relation is missing');
  if (!partialPlan || partialPlan.schemaVersion !== 'buff-partial-fact-plan/v1'
      || partialPlan.executable !== false
      || partialPlan.executionBlocker !== 'partial-fact-contract-review-required') {
    throw new Error('partial Buff fact plan contract is invalid');
  }
  const raw = parseRequiredJson(row.raw_json, 'buff raw');
  const supplied = buildBuffPartialFactPlan({ record: raw, baseline: partialPlan.baseline });
  if (supplied.buffId !== Number(partialPlan.buffId)
      || supplied.internalName !== partialPlan.internalName
      || !equalJson(supplied.replaceGroups, partialPlan.replaceGroups)
      || !equalJson(supplied.preserveGroups, partialPlan.preserveGroups)
      || !equalJson(supplied.additiveGroups ?? [], partialPlan.additiveGroups ?? [])
      || !equalJson(supplied.additiveFacts ?? {}, partialPlan.additiveFacts ?? {})
      || !equalJson(supplied.source, partialPlan.source)) {
    throw new Error('partial Buff fact plan source or group binding drifted');
  }
  const source = raw.sourceEvidence;
  if (!source || typeof source !== 'object') throw new Error('partial Buff source evidence is missing');
  if (Number(raw.id) !== Number(partialPlan.buffId) || raw.internalName !== partialPlan.internalName
      || source.provider !== partialPlan.source.provider
      || source.pageTitle !== partialPlan.source.pageTitle
      || source.canonicalPageTitle !== partialPlan.source.canonicalPageTitle
      || Number(source.revisionId) !== Number(partialPlan.source.revisionId)
      || source.revisionTimestamp !== partialPlan.source.revisionTimestamp) {
    throw new Error('partial Buff source identity drifted');
  }
  const preservedImmune = partialPlan.preserveGroups.includes('immuneNpcs')
    ? parsePartialBaselineArray(partialPlan, 'immuneNpcs', baselineRow)
    : Array.isArray(raw.immuneNpcs) ? raw.immuneNpcs : [];
  const preservedSample = partialPlan.preserveGroups.includes('immuneNpcs')
    ? parsePartialBaselineArray(partialPlan, 'immuneNpcSample', baselineRow)
    : Array.isArray(raw.immuneNpcSample) ? raw.immuneNpcSample : [];
  const immuneCount = partialPlan.preserveGroups.includes('immuneNpcs')
    ? parsePartialBaselineCount(partialPlan, baselineRow)
    : Array.isArray(raw.immuneNpcs) ? raw.immuneNpcs.length : 0;
  const inflictingNpcs = partialPlan.preserveGroups.includes('inflictingNpcs')
    ? mergeFactRows(
      parsePartialBaselineArray(partialPlan, 'inflictingNpcs', baselineRow),
      partialPlan.additiveFacts?.inflictingNpcs ?? [],
      'inflictingNpcs',
    )
    : Array.isArray(raw.inflictingNpcs) ? raw.inflictingNpcs : [];
  return {
    buffId: Number(raw.id),
    sourcePage: source.canonicalPageTitle,
    revisionId: Number(source.revisionId),
    revisionTimestamp: source.revisionTimestamp,
    parseStatus: source.parseStatus,
    hasImmuneSection: partialPlan.replaceGroups.includes('immuneNpcs'),
    immuneNpcCount: immuneCount,
    immuneNpcs: preservedImmune,
    immuneNpcSample: preservedSample,
    inflictingNpcs,
    sourceEvidence: {
      ...source,
      partialFactDisposition: {
        schemaVersion: 'buff-partial-fact-disposition/v1',
        status: 'partial',
        executionBlocker: partialPlan.executionBlocker,
        replaceGroups: [...partialPlan.replaceGroups],
        preserveGroups: [...partialPlan.preserveGroups],
        additiveGroups: [...(partialPlan.additiveGroups ?? [])],
      },
    },
  };
}

function parsePartialBaselineArray(partialPlan, groupName, baselineRow) {
  const field = `${groupName.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)}_json`;
  const expected = partialPlan.baseline?.[groupName];
  if (!Array.isArray(expected)) throw new Error(`partial Buff baseline ${groupName} is missing`);
  const baselineValue = parseRequiredJson(baselineRow[field], `baseline ${groupName}`, true);
  if (!equalJson(baselineValue, expected)) throw new Error(`partial Buff baseline ${groupName} drifted`);
  return expected;
}

function parsePartialBaselineCount(partialPlan, baselineRow) {
  const expected = partialPlan.baseline?.immuneNpcCount;
  if (!Number.isSafeInteger(Number(expected)) || Number(expected) < 0
      || Number(baselineRow.immune_npc_count) !== Number(expected)) {
    throw new Error('partial Buff baseline immuneNpcCount drifted');
  }
  return Number(expected);
}

function validatePartialAdditiveRelationCoverage({ partialPlanMap, relationByName, candidateNpcRelations }) {
  for (const [internalName, partialPlan] of partialPlanMap) {
    const additions = partialPlan.additiveFacts?.inflictingNpcs ?? [];
    if (!partialPlan.additiveGroups?.includes('inflictingNpcs') || additions.length === 0) continue;
    const buff = relationByName.get(internalName);
    if (!buff) throw new Error('partial Buff additive relation has no candidate Buff row');
    for (const fact of additions) {
      const matches = candidateNpcRelations.filter((row) => (row.status == null || Number(row.status) === 1)
        && (row.deleted == null || Number(row.deleted) === 0)
        && row.relation_type === 'inflicts'
        && String(row.buff_source_id) === String(buff.source_id)
        && row.buff_internal_name === internalName
        && Number(row.npc_source_id) === Number(fact.npcId)
        && row.npc_internal_name === fact.internalName);
      if (matches.length !== 1) {
        throw new Error(`partial Buff additive inflicting fact reverse relation coverage is ${matches.length === 0 ? 'missing' : 'ambiguous'}`);
      }
    }
  }
}

function applyPartialFactPlan(row, partialPlan, baselineRow) {
  if (!baselineRow) throw new Error('partial Buff fact plan baseline relation is missing');
  for (const groupName of partialPlan.preserveGroups) {
    const field = `${groupName.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)}_json`;
    const baseline = parsePartialBaselineArray(partialPlan, groupName, baselineRow);
    const value = mergeFactRows(baseline, partialPlan.additiveFacts?.[groupName] ?? [], groupName);
    row[field] = JSON.stringify(value);
    if (groupName === 'sourceItems') row.source_item_count = value.length;
    if (groupName === 'immuneNpcs') {
      row.immune_npc_count = parsePartialBaselineCount(partialPlan, baselineRow);
      row.immune_npc_sample_json = JSON.stringify(
        parsePartialBaselineArray(partialPlan, 'immuneNpcSample', baselineRow),
      );
    }
  }
}

function mergeFactRows(baseline, additions, groupName) {
  if (!Array.isArray(baseline) || !Array.isArray(additions)) {
    throw new Error(`partial Buff ${groupName} facts are invalid`);
  }
  const merged = [...baseline];
  const known = [];
  for (const row of merged) {
    const identity = factIdentityParts(row, groupName);
    for (const previous of known) assertFactIdentityCompatible(previous, identity, groupName);
    known.push(identity);
  }
  for (const addition of additions) {
    const identity = factIdentityParts(addition, groupName);
    for (const previous of known) assertFactIdentityCompatible(previous, identity, groupName);
    const duplicate = known.some((previous) => factIdentityOverlaps(previous, identity));
    if (!duplicate) {
      merged.push(addition);
    }
    known.push(identity);
  }
  return merged;
}

function factIdentity(value, groupName) {
  const identity = factIdentityParts(value, groupName);
  if (identity.id != null) return `id:${identity.id}`;
  if (identity.internalName != null) return `name:${identity.internalName}`;
  return `json:${JSON.stringify(value)}`;
}

function factIdentityParts(value, groupName) {
  const rawId = groupName === 'sourceItems'
    ? value?.itemId ?? value?.itemSourceId ?? value?.sourceId
    : value?.npcId ?? value?.npcSourceId ?? value?.sourceId;
  const rawName = groupName === 'sourceItems'
    ? value?.internalName ?? value?.itemInternalName
    : value?.internalName ?? value?.npcInternalName;
  const id = rawId != null && Number.isSafeInteger(Number(rawId)) && Number(rawId) !== 0
    ? Number(rawId) : null;
  const internalName = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : null;
  return { id, internalName };
}

function factIdentityOverlaps(left, right) {
  return (left.id != null && right.id != null && left.id === right.id)
    || (left.internalName != null && right.internalName != null && left.internalName === right.internalName);
}

function assertFactIdentityCompatible(left, right, groupName) {
  if (left.id != null && right.id != null && left.id === right.id
      && left.internalName != null && right.internalName != null
      && left.internalName !== right.internalName) {
    throw new Error(`partial Buff ${groupName} conflicting stable identity: source id ${left.id}`);
  }
  if (left.internalName != null && right.internalName != null && left.internalName === right.internalName
      && left.id != null && right.id != null && left.id !== right.id) {
    throw new Error(`partial Buff ${groupName} conflicting stable identity: internal name ${left.internalName}`);
  }
}

function bindPageEvidence(row, input, evidence, landings, { partialPlan = null, baselineRow = null } = {}) {
  const landing = landings.get(String(row.landing_source_id));
  if (!landing) throw new Error('buff landing source binding is missing');
  if (!Number.isSafeInteger(Number(row.source_id)) || Number(row.source_id) <= 0
      || evidence.buffId !== Number(row.source_id)) throw new Error('buff evidence identity mismatch');
  for (const [column, source] of [
    ['landing_content_hash', 'content_hash'], ['landing_source_key', 'source_key'],
    ['source_provider', 'provider'], ['source_page', 'source_page'],
  ]) {
    if (row[column] !== landing.row[source]) throw new Error(`buff source binding mismatch: ${column}`);
  }
  if (!equalJson(comparable(row.source_revision_timestamp, 'source_revision_timestamp'),
    comparable(landing.row.source_revision_timestamp, 'source_revision_timestamp'))) {
    throw new Error('buff source revision binding mismatch');
  }
  const matching = landing.records.filter((record) => record.internalName === row.internal_name && record.id === Number(row.source_id));
  if (matching.length !== 1) throw new Error('buff landing record identity is missing or duplicate');
  const record = matching[0];
  const raw = parseRequiredJson(row.raw_json, 'buff raw');
  if (!equalJson(record, raw)) throw new Error('buff raw record binding mismatch');
  for (const [column, field, groupName] of [
    ['source_items_json', 'sourceItems', 'sourceItems'],
    ['inflicting_npcs_json', 'inflictingNpcs', 'inflictingNpcs'],
  ]) {
    const facts = parseRequiredJson(row[column], column, true);
    const expected = partialPlan?.preserveGroups.includes(groupName)
      ? mergeFactRows(partialPlan.baseline[groupName], partialPlan.additiveFacts?.[groupName] ?? [], groupName)
      : (record[field] ?? []);
    if (!equalJson(facts, expected)) throw new Error(`buff source fact binding mismatch: ${column}`);
    if (partialPlan?.additiveGroups?.includes(groupName)) {
      const sourceFacts = Array.isArray(record[field]) ? record[field] : [];
      for (const addition of partialPlan.additiveFacts?.[groupName] ?? []) {
        if (!sourceFacts.some((fact) => factIdentity(fact, groupName) === factIdentity(addition, groupName))) {
          throw new Error(`buff additive fact binding mismatch: ${column}`);
        }
      }
    }
  }
  if (!partialPlan) {
    const bound = normalizeBuffPageEvidence({ evidence: record });
    if (!equalJson(evidence, bound)) throw new Error('buff page evidence content/revision binding mismatch');
  } else if (!baselineRow) {
    throw new Error('partial Buff baseline relation is missing');
  }
}

function validateDerivedBuffRow(row, raw, evidence) {
  if (Number(row.source_id) !== Number(raw.id) || row.internal_name !== raw.internalName) {
    throw new Error('buff derived identity is not landing-bound');
  }
  const expected = [
    ['english_name', raw.name ?? raw.englishName], ['name_zh', raw.localized?.zh?.name], ['buff_type', raw.type],
    ['tooltip_en', raw.localized?.en?.tooltip], ['tooltip_zh', raw.localized?.zh?.tooltip],
  ];
  for (const [column, value] of expected) {
    if (row[column] !== normalizeText(value)) throw new Error(`buff derived field drifted: ${column}`);
  }
  const expectedSourceItemCount = raw.sourceItemCount ?? (Array.isArray(raw.sourceItems) ? raw.sourceItems.length : null);
  if (expectedSourceItemCount != null && Number(row.source_item_count) !== Number(expectedSourceItemCount)) {
    throw new Error('buff source item count is not landing-bound');
  }
  if (Number(row.immune_npc_count) !== evidence.immuneNpcCount) throw new Error('buff immunity count is not page-bound');
}

function relationFactMatches(row, fact, kind) {
  const id = kind === 'item' ? row.item_source_id : row.npc_source_id;
  const internalName = kind === 'item' ? row.item_internal_name : row.npc_internal_name;
  const factId = fact?.itemId ?? fact?.itemSourceId ?? fact?.npcId ?? fact?.npcSourceId ?? fact?.sourceId;
  const factName = fact?.internalName ?? fact?.itemInternalName ?? fact?.npcInternalName;
  const idMatches = factId != null && Number.isSafeInteger(Number(id))
    && Number.isSafeInteger(Number(factId)) && Number(factId) === Number(id);
  const nameMatches = factName != null && factName === internalName;
  if (factId != null && factName != null) return idMatches && nameMatches;
  return idMatches || nameMatches;
}

function validateSecondaryRelation(row, table, buff, evidenceInput, {
  partialPlan = null,
  allowUnmaterializedMaintTrace = false,
} = {}) {
  const kind = table === 'item_buff_relations' ? 'item' : 'npc';
  const relationType = row.relation_type;
  const allowedType = table === 'item_buff_relations'
    ? relationType === 'buff_source_item'
    : relationType === 'inflicts' || relationType === 'immune';
  if (!allowedType) throw new Error(`Buff secondary relation type is not owned: ${relationType}`);
  const raw = parseRequiredJson(buff.raw_json, 'buff raw');
  const groupName = relationType === 'buff_source_item' ? 'sourceItems'
    : relationType === 'inflicts' ? 'inflictingNpcs' : 'immuneNpcs';
  const facts = partialPlan?.preserveGroups.includes(groupName)
    ? mergeFactRows(
      parseRequiredJson(partialPlan.baseline[groupName], `partial Buff ${groupName}`, true),
      partialPlan.additiveFacts?.[groupName] ?? [],
      groupName,
    )
    : relationType === 'buff_source_item'
      ? parseRequiredJson(raw.sourceItems ?? [], 'buff source items', true)
      : relationType === 'inflicts'
        ? parseRequiredJson(raw.inflictingNpcs ?? [], 'buff inflicting NPCs', true)
        : normalizeBuffPageEvidence({ evidence: evidenceInput }).immuneNpcs;
  if (!facts.some(fact => relationFactMatches(row, fact, kind))) {
    throw new Error(`Buff secondary relation ${kind} identity is not page-bound`);
  }
  const expectedOwner = relationType === 'immune' ? 'maint_npcs' : 'maint_buffs';
  const maintTraceValid = allowUnmaterializedMaintTrace
    ? row.source_maint_record_key == null || /^[a-f0-9]{64}$/.test(String(row.source_maint_record_key))
    : /^[a-f0-9]{64}$/.test(String(row.source_maint_record_key ?? ''));
  if (row.source_maint_table !== expectedOwner || !maintTraceValid) {
    throw new Error('Buff secondary relation owner trace is invalid');
  }
  for (const field of ['landing_source_id', 'landing_source_key', 'landing_content_hash', 'source_provider', 'source_page', 'source_revision_timestamp']) {
    if (row[field] == null || row[field] === '') {
      if (allowUnmaterializedMaintTrace
          && (field === 'landing_source_id' || field === 'source_revision_timestamp')) continue;
      throw new Error('Buff secondary relation landing trace is incomplete');
    }
  }
  if (expectedOwner === 'maint_buffs'
      && (row.landing_source_id !== buff.landing_source_id || row.landing_source_key !== buff.landing_source_key
        || row.landing_content_hash !== buff.landing_content_hash || row.source_provider !== buff.source_provider
        || row.source_page !== buff.source_page || !equalJson(comparable(row.source_revision_timestamp, 'source_revision_timestamp'), comparable(buff.source_revision_timestamp, 'source_revision_timestamp')))) {
    throw new Error('Buff secondary relation landing trace drifted');
  }
}

function managedImage(value, prefixes) {
  if (typeof value !== 'string' || value !== value.trim()
      || /[?#\\\u0000-\u0020\u007f]/.test(value) || /%(?:25|2f|5c)/i.test(value)) return false;
  let pathname;
  try {
    pathname = decodeURIComponent(value);
    if (value.startsWith('/') && new URL(value, 'https://managed.invalid').pathname !== value) return false;
  } catch { return false; }
  if (pathname.split('/').some((segment) => segment === '.' || segment === '..') || /[\\\u0000-\u001f\u007f]/.test(pathname)) return false;
  return isManagedImagePath(value, prefixes);
}

function rowKey(row, table) {
  if (table === 'projection_buffs') {
    if (!Number.isSafeInteger(Number(row.id)) || row.id == null || Number(row.id) < 0) throw new Error('invalid projection identity');
    return String(row.id);
  }
  if (typeof row.record_key !== 'string' || !/^[a-f0-9]{64}$/.test(row.record_key)) throw new Error(`invalid ${table} record key`);
  return row.record_key;
}

function indexRows(rows, table) {
  const index = new Map();
  for (const row of rows) {
    const key = rowKey(row, table);
    if (index.has(key)) throw new Error(`duplicate ${table} record key`);
    index.set(key, row);
  }
  return index;
}

function comparable(value, column) {
  if (value == null) return null;
  if (column.endsWith('_json')) {
    if (typeof value !== 'string') return stableValue(value);
    try { return stableValue(JSON.parse(value)); } catch { throw new Error(`invalid ${column} JSON`); }
  }
  if (column.endsWith('_timestamp') || column.endsWith('_at')) {
    if (value instanceof Date) return value.toISOString();
    const text = String(value);
    const date = new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
    return Number.isFinite(date.getTime()) ? date.toISOString() : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean'
      || /^(?:id|source_id|.*_id|.*_count|status|deleted|confidence|duration_ticks|chance_value|is_primary|sort_order|width|height)$/.test(column)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  return value;
}

function changedColumns(before, after, table) {
  return Object.keys(after).filter((column) => {
    if (['created_at', 'updated_at'].includes(column) || (column === 'id' && table !== 'projection_buffs')) return false;
    return !equalJson(comparable(before[column], column), comparable(after[column], column));
  }).sort();
}

function sameEntity(left, right, table) {
  if (table === 'relation_buffs' || table === 'projection_buffs') {
    return left.internal_name === right.internal_name || String(left.source_id) === String(right.source_id);
  }
  if (table === 'item_buff_relations') {
    return ['buff_source_id', 'buff_internal_name', 'item_source_id', 'item_internal_name', 'relation_type']
      .every(column => equalJson(comparable(left[column], column), comparable(right[column], column)));
  }
  if (table === 'npc_buff_relations') {
    return ['buff_source_id', 'buff_internal_name', 'npc_source_id', 'npc_internal_name', 'relation_type']
      .every(column => equalJson(comparable(left[column], column), comparable(right[column], column)));
  }
  return false;
}

function buildTableDelta(current, candidates, table) {
  const beforeByKey = indexRows(current, table);
  const proposedByKey = indexRows(candidates, table);
  const changes = { inserts: [], updates: [], unchanged: [], preserved: [] };
  const expected = new Map(beforeByKey);
  for (const proposed of [...candidates].sort((left, right) => rowKey(left, table).localeCompare(rowKey(right, table)))) {
    const key = rowKey(proposed, table);
    if (current.some((row) => rowKey(row, table) !== key && sameEntity(row, proposed, table))) {
      throw new Error(`remapped ${table} identity`);
    }
    const before = beforeByKey.get(key);
    if (before && (table === 'relation_buffs' || table === 'projection_buffs')
        && (before.internal_name !== proposed.internal_name || String(before.source_id) !== String(proposed.source_id))) {
      throw new Error(`remapped ${table} identity`);
    }
    if (before && table === 'projection_buffs' && before.relation_record_key !== proposed.relation_record_key) {
      throw new Error('remapped projection_buffs relation identity');
    }
    const identityColumns = table === 'item_buff_relations'
      ? ['buff_source_id', 'buff_internal_name', 'item_source_id', 'item_internal_name', 'relation_type']
      : table === 'npc_buff_relations'
        ? ['buff_source_id', 'buff_internal_name', 'npc_source_id', 'npc_internal_name', 'relation_type']
        : [];
    if (before && identityColumns.some((column) => !equalJson(comparable(before[column], column), comparable(proposed[column], column)))) {
      throw new Error(`remapped ${table} identity`);
    }
    const after = { ...proposed };
    delete after.created_at;
    delete after.updated_at;
    if (table !== 'projection_buffs') delete after.id;
    if (!before) {
      changes.inserts.push(after);
      expected.set(key, after);
      continue;
    }
    const columns = changedColumns(before, after, table);
    if (columns.length === 0) {
      changes.unchanged.push(before);
      continue;
    }
    const merged = { ...before, ...Object.fromEntries(columns.map((column) => [column, after[column]])) };
    changes.updates.push({ key, before, after: merged, changedColumns: columns });
    expected.set(key, merged);
  }
  for (const [key, row] of beforeByKey) {
    if (!proposedByKey.has(key)) changes.preserved.push(row);
  }
  const sortRows = (left, right) => rowKey(left, table).localeCompare(rowKey(right, table));
  changes.unchanged.sort(sortRows);
  changes.preserved.sort(sortRows);
  return { changes, expectedRows: [...expected.values()].sort(sortRows) };
}

export function parseArgs(argv) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }

  const dateTag = raw['date-tag'] ?? raw.dateTag ?? formatDateTag();
  return {
    apply: booleanOption(raw.apply, false),
    prepareSchema: booleanOption(raw['prepare-schema'] ?? raw.prepareSchema, false),
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? 'terria_v1_local',
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    output: raw.output ?? path.join(repoRoot, 'reports', 'relation', `buff-relation-sync-${dateTag}.json`),
  };
}

export function buildBuffRelationSyncPayload({
  maintBuffRows = [],
  maintItemRows = [],
  maintNpcRows = [],
  relationBuffImageRows = [],
  managedImageUrlPrefixes = [],
} = {}) {
  // Inactive evidence stays in the baseline, never in the publication candidate.
  const relationBuffImages = relationBuffImageRows.map(mapRowToDb)
    .filter((row) => Number(row.status) === 1 && Number(row.deleted) === 0)
    .map((row) => Object.fromEntries(
      Object.entries(row).map(([column, value]) => [column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value]),
    ));
  const { relationBuffs } = buildBuffEntityRelations({ maintBuffs: maintBuffRows });
  const secondary = buildSecondaryRelations({
    maintBuffRows,
    maintItemRows,
    maintNpcRows,
  });
  const projection = buildProjectionPayload({
    relationBuffs,
    relationBuffImages,
    relationItems: maintItemRows.map((row) => ({
      sourceId: row.source_id,
      internalName: row.internal_name,
      englishName: row.english_name,
      nameZh: row.name_zh,
      sourceProvider: row.source_provider,
      sourcePage: row.source_page,
      sourceRevisionTimestamp: row.source_revision_timestamp,
      rawJson: row.raw_json,
    })),
    relationNpcs: maintNpcRows.map((row) => ({
      sourceId: row.source_id,
      internalName: row.internal_name,
      englishName: row.english_name,
      nameZh: row.name_zh,
      subNameZh: row.sub_name_zh,
      sourceProvider: row.source_provider,
      sourcePage: row.source_page,
      sourceRevisionTimestamp: row.source_revision_timestamp,
      rawJson: row.raw_json,
    })),
    itemBuffRelations: secondary.itemBuffRelations,
    npcBuffRelations: secondary.npcBuffRelations,
    managedImageUrlPrefixes,
  });
  return {
    relationBuffs,
    relationBuffImages,
    itemBuffRelations: secondary.itemBuffRelations,
    npcBuffRelations: secondary.npcBuffRelations,
    projectionBuffs: projection.projectionBuffs,
    issues: secondary.issues,
  };
}

export function mergeNpcCrawlerFactsIntoMaintBuffRows({
  maintBuffRows = [],
  maintNpcCrawlerFactRows = [],
} = {}) {
  const factsByBuff = new Map();
  for (const fact of maintNpcCrawlerFactRows ?? []) {
    if (String(fact.match_status ?? fact.matchStatus ?? '').toUpperCase() !== 'MATCHED') continue;
    const npcInternalName = String(fact.npc_internal_name ?? fact.npcInternalName ?? '').trim();
    if (!npcInternalName) continue;
    let buffFacts = [];
    try {
      const parsed = typeof (fact.buff_inflictions_json ?? fact.buffInflictionsJson) === 'string'
        ? JSON.parse(fact.buff_inflictions_json ?? fact.buffInflictionsJson)
        : fact.buff_inflictions_json ?? fact.buffInflictionsJson;
      buffFacts = Array.isArray(parsed) ? parsed : [];
    } catch {
      buffFacts = [];
    }
    for (const buffFact of buffFacts) {
      const key = String(buffFact.buffInternalName ?? buffFact.internalName ?? buffFact.buffName ?? buffFact.name ?? '').trim().toLowerCase();
      if (!key) continue;
      const entries = factsByBuff.get(key) ?? [];
      entries.push({
        npcId: Number(fact.npc_source_id ?? fact.npcSourceId) || null,
        internalName: npcInternalName,
        name: fact.npc_name ?? fact.npcName ?? npcInternalName,
        durationText: buffFact.durationText ?? buffFact.duration_text ?? null,
        chanceText: buffFact.chanceText ?? buffFact.chance_text ?? null,
        crawlerFactRecordKey: fact.record_key ?? fact.recordKey,
        landingSourceKey: fact.landing_source_key ?? fact.landingSourceKey ?? null,
      });
      factsByBuff.set(key, entries);
    }
  }

  return (maintBuffRows ?? []).map((row) => {
    const keys = [row.internal_name, row.internalName, row.english_name, row.name]
      .map((value) => String(value ?? '').trim().toLowerCase())
      .filter(Boolean);
    const additions = keys.flatMap((key) => factsByBuff.get(key) ?? []);
    if (additions.length === 0) return row;
    let raw = {};
    try {
      raw = typeof row.raw_json === 'string' ? JSON.parse(row.raw_json) : row.raw_json ?? {};
    } catch {
      raw = {};
    }
    const existing = Array.isArray(raw.inflictingNpcs) ? raw.inflictingNpcs : [];
    const merged = [...existing];
    for (const addition of additions) {
      if (!merged.some((entry) => entry.internalName === addition.internalName && entry.crawlerFactRecordKey === addition.crawlerFactRecordKey)) {
        merged.push(addition);
      }
    }
    return { ...row, raw_json: JSON.stringify({ ...raw, inflictingNpcs: merged }) };
  });
}

async function defaultWriteReport(reportPath, payload) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2), 'utf8');
  return reportPath;
}

export async function runBuffRelationSync(options = {}, dependencies = {}) {
  if (options.apply || options.prepareSchema) {
    throw new Error('registered-executor-required: Buff sync is read-only; apply and schema preparation require a registered governed executor');
  }
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
  };
  const writeReport = dependencies.writeReport ?? defaultWriteReport;
  const queryMaint = dependencies.queryMaint ?? (async (sql) => {
    const mysql = dependencies.mysqlModule ?? loadMysqlModule();
    const connection = await mysql.createConnection({ ...mysqlOptions, database: options.maintDatabase });
    try {
      return await queryRows(connection, sql);
    } finally {
      await connection.end();
    }
  });
  const queryRelation = dependencies.queryRelation ?? (async (sql) => {
    const mysql = dependencies.mysqlModule ?? loadMysqlModule();
    const connection = await mysql.createConnection({ ...mysqlOptions, database: options.relationDatabase });
    try {
      return await queryRows(connection, sql);
    } finally {
      await connection.end();
    }
  });
  const [baseMaintBuffRows, maintItemRows, maintNpcRows, relationBuffImageRows, maintNpcCrawlerFactRows] = await Promise.all([
    queryMaint('SELECT * FROM maint_buffs WHERE status = 1 AND deleted = 0'),
    queryMaint('SELECT * FROM maint_items WHERE status = 1 AND deleted = 0'),
    queryMaint('SELECT * FROM maint_npcs WHERE status = 1 AND deleted = 0'),
    queryRelation('SELECT * FROM relation_buff_images WHERE deleted = 0'),
    queryMaint('SELECT * FROM maint_npc_crawler_facts WHERE match_status = \'MATCHED\' AND status = 1 AND deleted = 0'),
  ]);
  const maintBuffRows = mergeNpcCrawlerFactsIntoMaintBuffRows({
    maintBuffRows: baseMaintBuffRows,
    maintNpcCrawlerFactRows,
  });
  const payload = buildBuffRelationSyncPayload({
    maintBuffRows,
    maintItemRows,
    maintNpcRows,
    relationBuffImageRows,
    managedImageUrlPrefixes: dependencies.managedImageUrlPrefixes ?? [],
  });
  const report = {
    generatedAt: new Date().toISOString(),
    apply: Boolean(options.apply),
    maintDatabase: options.maintDatabase,
    relationDatabase: options.relationDatabase,
    candidateStatus: 'inventory-only',
    executable: false,
    executionBlocker: 'registered-executor-required',
    rows: {
      relationBuffs: payload.relationBuffs.length,
      projectionBuffs: payload.projectionBuffs.length,
      relationBuffImages: payload.relationBuffImages.length,
      itemBuffRelations: payload.itemBuffRelations.length,
      npcBuffRelations: payload.npcBuffRelations.length,
      issues: payload.issues.length,
    },
    writes: {
      relationBuffs: 0,
      projectionBuffs: 0,
      itemBuffRelations: 0,
      npcBuffRelations: 0,
      relationBuffImages: 0,
      total: 0,
    },
    issueSamples: payload.issues.slice(0, 20),
  };

  if (options.output) {
    report.reportPath = await writeReport(options.output, report);
  }
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runBuffRelationSync(options);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

export { CANDIDATE_COLUMNS as BUFF_CANDIDATE_COLUMNS, comparable as normalizeBuffRowValue };
