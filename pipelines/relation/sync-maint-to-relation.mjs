#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  DEPRECATED_RELATION_TABLE_NAMES,
  RELATION_DATABASE_NAME,
  buildRelationSchemaStatements
} from './relation-schema.mjs';
import { createRecordKey } from './relation-trace.mjs';
import { buildBaseEntityRelations } from './base-entity-processor.mjs';
import { buildBuffEntityRelations } from './buff-entity-processor.mjs';
import { buildImageRelations } from './image-processor.mjs';
import { buildCategoryRelations } from './category-relation-processor.mjs';
import { buildRecipeRelations } from './recipe-relation-processor.mjs';
import {
  buildCanonicalRecipeGroups,
  buildRecipeGroupExpansions,
} from './recipe-expansion-processor.mjs';
import { buildItemGroupRelationProjection } from '../item-groups/item-group-canonical-sync.mjs';
import { buildItemSourceRelations } from './item-source-relation-processor.mjs';
import { buildNpcCrawlerFactItemSourceRows } from './item-source-relation-processor.mjs';
import { mergeNpcCrawlerFactsIntoMaintBuffRows } from './sync-buffs-to-relation.mjs';
import { buildBuffSourceNpcRelations, buildSecondaryRelations } from './secondary-relation-processor.mjs';
import { buildBossSeriesRelations } from './boss-series-processor.mjs';
import { buildNpcSeriesRelations } from './npc-series-processor.mjs';
import { buildRelationItemRarities } from './item-rarity-support-processor.mjs';
import { buildArmorSetRelations } from './armor-set-processor.mjs';
import { buildEquivalentArmorAttributeLookup } from './equivalent-armor-attribute-rules.mjs';
import { isArmorItemEffectMaintRow, readArmorItemEffectMaintSources } from '../maint/armor-item-effect-source-reader.mjs';
import { parseEquipmentEffectLines } from './equipment-effect-parser.mjs';
import { buildProjectionSchemaStatements } from './projection-schema.mjs';
import {
  buildProjectionPayload,
  validateProjectionArmorSetConsistency
} from './projection-sync.mjs';
import { writeRelationReports } from './relation-report.mjs';
import {
  isManagedImagePath,
  managedImagePathPrefixes,
  normalizeManagedImageUrlPrefixes,
  resolveManagedImageUrlPrefixes
} from './managed-image-url-policy.mjs';

const repoRoot = getProjectRoot();
const moduleRequire = createRequire(import.meta.url);
let mysqlModule = null;

const BUFF_ONLY_CLEAR_TABLES = Object.freeze([
  'item_buff_relations',
  'npc_buff_relations',
  'relation_buff_images',
  'projection_buffs',
  'relation_buffs',
]);
const BUFF_ONLY_WRITE_ENTRIES = Object.freeze([
  Object.freeze(['relation_buffs', 'relationBuffs']),
  Object.freeze(['item_buff_relations', 'itemBuffRelations']),
  Object.freeze(['npc_buff_relations', 'npcBuffRelations']),
  Object.freeze(['relation_buff_images', 'relationBuffImages']),
  Object.freeze(['projection_buffs', 'projectionBuffs']),
]);
const ARMOR_ONLY_CLEAR_TABLES = Object.freeze([
  'relation_armor_set_images',
  'relation_equipment_effect_attributes',
  'relation_armor_attribute_rows',
  'relation_armor_set_items',
  'relation_armor_sets',
  'projection_armor_sets',
  'projection_item_armor_attributes',
  'projection_equipment_effect_attributes',
]);
const ARMOR_ONLY_WRITE_ENTRIES = Object.freeze([
  Object.freeze(['relation_armor_sets', 'relationArmorSets']),
  Object.freeze(['relation_armor_set_items', 'relationArmorSetItems']),
  Object.freeze(['relation_armor_attribute_rows', 'relationArmorAttributeRows']),
  Object.freeze(['relation_equipment_effect_attributes', 'relationEquipmentEffectAttributes']),
  Object.freeze(['relation_armor_set_images', 'relationArmorSetImages']),
  Object.freeze(['projection_armor_sets', 'projectionArmorSets']),
  Object.freeze(['projection_item_armor_attributes', 'projectionItemArmorAttributes']),
  Object.freeze(['projection_equipment_effect_attributes', 'projectionEquipmentEffectAttributes']),
]);

export function buildRelationApplyPlan(scopes) {
  const normalized = Array.isArray(scopes)
    ? scopes.map((scope) => String(scope).trim()).filter(Boolean)
    : String(scopes ?? '').split(',').map((scope) => scope.trim()).filter(Boolean);
  const buffOnly = normalized.length === 1 && normalized[0] === 'buff';
  const armorOnly = normalized.length === 1 && normalized[0] === 'armor';
  return Object.freeze({
    buffOnly,
    ...(armorOnly ? { armorOnly: true } : {}),
    clearTables: buffOnly ? [...BUFF_ONLY_CLEAR_TABLES] : armorOnly ? [...ARMOR_ONLY_CLEAR_TABLES] : [],
    writeEntries: buffOnly
      ? BUFF_ONLY_WRITE_ENTRIES.map(([table, key]) => [table, key])
      : armorOnly ? ARMOR_ONLY_WRITE_ENTRIES.map(([table, key]) => [table, key]) : [],
    runPostApplyProjectionReconciliation: !buffOnly && !armorOnly,
  });
}

function loadMysqlModule() {
  if (mysqlModule) {
    return mysqlModule;
  }
  try {
    mysqlModule = moduleRequire('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
    mysqlModule = createRequire(path.join(repoRoot, 'apps/admin-console', 'package.json'))('mysql2/promise');
  }
  return mysqlModule;
}
const ALLOWED_INHERITANCE_KINDS = new Set([
  'segment_family',
  'prototype_variant',
  'same_name_variant',
]);

const ALLOWED_NON_NPC_EXCLUSION_REASONS = new Set([
  'chest_container',
  'crate_container',
  'treasure_bag_container',
  'present_container',
  'tree_source',
  'bag_container',
  'lock_box_container',
  'heart_or_orb_source',
  'mode_or_bonus_bucket',
  'non_npc_item_source_entity',
  'boss_lane_reference_source',
]);

const ALLOWED_SOURCE_ONLY_ITEM_EXCLUSION_REASONS = new Set([
  'item_group_requires_expansion',
  'legacy_only_item_not_in_current_corpus',
]);

export const ITEM_ONLY_RELATION_TABLE_ALLOWLIST = Object.freeze([
  'relation_items',
  'relation_item_images',
  'relation_item_rarities',
  'category_nodes',
  'item_category_assignments',
  'item_recipe_heads',
  'item_recipe_ingredients',
  'item_recipe_stations',
  'item_source_facts',
  'item_source_details',
  'item_npc_shop_relations',
  'item_npc_loot_relations',
  'item_npc_relation_audits',
  'item_biome_relations',
  'projection_items',
]);

const ITEM_ONLY_DATABASE_PATTERN = /^terria_v1_automation_acceptance_(e8p_[0-9a-f]{16})_(local|maint|relation)$/;
const FORMAL_DATABASE_NAMES = new Set(['terria_v1_local', 'terria_v1_maint', 'terria_v1_relation']);

export const buildCanonicalItemGroupRelationProjection = buildItemGroupRelationProjection;

export function buildNpcCrawlerFactRelationInputs({
  maintNpcCrawlerFactRows = [],
  maintBuffRows = [],
} = {}) {
  return {
    itemSourceRows: buildNpcCrawlerFactItemSourceRows(maintNpcCrawlerFactRows),
    maintBuffRows: mergeNpcCrawlerFactsIntoMaintBuffRows({
      maintBuffRows,
      maintNpcCrawlerFactRows,
    }),
  };
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
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

  return {
    apply: booleanOption(raw.apply, false),
    createDatabase: booleanOption(raw['create-database'] ?? raw.createDatabase, false),
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? 'terria_v1_maint',
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    allowLocalItemImageFallback: booleanOption(raw['allow-local-item-image-fallback'] ?? raw.allowLocalItemImageFallback, true),
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    wikiArmorSetsInput: raw['wiki-armor-sets-input'] ?? raw.wikiArmorSetsInput ?? path.join(repoRoot, 'data', 'generated', 'wiki-armor-sets.latest.json'),
    scopes: String(raw.scopes ?? 'category,recipe,npc,buff,biome,projectile')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  };
}

function resolveWikiArmorSetsInputPath(inputPath) {
  if (!inputPath) {
    return null;
  }
  const resolved = path.resolve(process.cwd(), inputPath);
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  const dirname = path.dirname(resolved);
  const basename = path.basename(resolved);
  if (basename !== 'wiki-armor-sets.latest.json' || !fs.existsSync(dirname)) {
    return null;
  }
  const snapshots = fs.readdirSync(dirname)
    .filter((entry) => /^wiki-armor-sets\.\d{4}-\d{2}-\d{2}T.+\.json$/.test(entry))
    .sort((left, right) => right.localeCompare(left));
  return snapshots.length ? path.join(dirname, snapshots[0]) : null;
}

export function readWikiArmorSets(inputPath) {
  const resolved = resolveWikiArmorSetsInputPath(inputPath);
  if (!resolved) {
    return [];
  }
  const payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (Array.isArray(payload.records)) {
    return payload.records;
  }
  if (Array.isArray(payload.armorSets)) {
    return payload.armorSets;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return [];
}

function readArmorSetDefinitionMap(inputPath = path.join(repoRoot, 'data', 'generated', 'armor-set-definition-map.json')) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(inputPath, 'utf8'));
}

function readInheritanceRules(inputPath = path.join(repoRoot, 'docs', 'contracts', 'npc-domain-loot-inheritance-contract.md')) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    return [];
  }
  return parseInheritanceContractRows(fs.readFileSync(inputPath, 'utf8'));
}

function readReviewedNonNpcSourceExclusions(inputPath = path.join(repoRoot, 'docs', 'contracts', 'npc-domain-non-npc-source-exclusion-contract.md')) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    return [];
  }
  return parseReviewedNonNpcSourceExclusionRows(fs.readFileSync(inputPath, 'utf8'));
}

function readReviewedSourceOnlyItemExclusions(inputPath = path.join(repoRoot, 'docs', 'contracts', 'npc-domain-source-only-item-exclusion-contract.md')) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    return [];
  }
  return parseReviewedSourceOnlyItemExclusionRows(fs.readFileSync(inputPath, 'utf8'));
}

function parseInheritanceContractRows(text) {
  const rows = [];
  const lines = String(text ?? '').split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
  let headers = null;
  for (const line of lines) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length === 0 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells.includes('targetNpcInternalName')) {
      headers = cells;
      continue;
    }
    if (!headers || !headers.includes('targetNpcInternalName')) continue;
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? null]));
    if (!normalizeTableText(row.targetNpcInternalName) || row.targetNpcInternalName === '_none yet_') continue;
    rows.push({
      targetNpcInternalName: row.targetNpcInternalName,
      sourceNpcInternalName: row.sourceNpcInternalName,
      inheritanceKind: row.inheritanceKind,
      evidenceSource: row.evidenceSource,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
    });
  }
  return rows;
}

function parseReviewedNonNpcSourceExclusionRows(text) {
  const rows = [];
  const lines = String(text ?? '').split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
  let headers = null;
  for (const line of lines) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length === 0 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells.includes('sourceRefName')) {
      headers = cells;
      continue;
    }
    if (!headers || !headers.includes('sourceRefName')) continue;
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? null]));
    if (!normalizeTableText(row.sourceRefName) || row.sourceRefName === '_none yet_') continue;
    rows.push({
      sourceType: row.sourceType,
      sourceRefType: row.sourceRefType,
      matchType: row.matchType,
      sourceRefName: row.sourceRefName,
      reason: row.reason,
      evidenceSource: row.evidenceSource,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      notes: row.notes,
    });
  }
  return rows;
}

function parseReviewedSourceOnlyItemExclusionRows(text) {
  const rows = [];
  const lines = String(text ?? '').split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
  let headers = null;
  for (const line of lines) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length === 0 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells.includes('recordKey') && cells.includes('itemName')) {
      headers = cells;
      continue;
    }
    if (!headers || !headers.includes('recordKey') || !headers.includes('itemName')) continue;
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? null]));
    if (!normalizeTableText(row.recordKey) || row.recordKey === '_none yet_') continue;
    rows.push({
      sourceType: row.sourceType,
      sourceRefType: row.sourceRefType,
      sourceRefInternalName: row.sourceRefInternalName,
      itemName: row.itemName,
      recordKey: row.recordKey,
      chanceText: row.chanceText,
      quantityText: row.quantityText,
      sourceUrl: row.sourceUrl,
      reason: row.reason,
      evidenceSource: row.evidenceSource,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      notes: row.notes,
    });
  }
  return rows;
}

function normalizeTableText(value) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function isIsoDateOnly(value) {
  const text = normalizeTableText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function describeInheritanceRule(row = {}) {
  return `${normalizeTableText(row.targetNpcInternalName) ?? '<missing target>'} <= ${normalizeTableText(row.sourceNpcInternalName) ?? '<missing source>'}`;
}

function validateInheritanceRules(inheritanceRules = []) {
  if (!Array.isArray(inheritanceRules)) {
    const error = new Error('NPC loot inheritance contract validation failed: expected inheritance rules to be an array.');
    error.validationIssues = ['expected inheritance rules to be an array'];
    throw error;
  }

  const issues = [];
  const seenTargets = new Set();
  for (const [index, row] of inheritanceRules.entries()) {
    const targetNpcInternalName = normalizeTableText(row?.targetNpcInternalName);
    const sourceNpcInternalName = normalizeTableText(row?.sourceNpcInternalName);
    const inheritanceKind = normalizeTableText(row?.inheritanceKind);
    const evidenceSource = normalizeTableText(row?.evidenceSource);
    const reviewedBy = normalizeTableText(row?.reviewedBy);
    const reviewedAt = normalizeTableText(row?.reviewedAt);
    const rowLabel = `row ${index + 1} (${describeInheritanceRule(row)})`;

    if (!targetNpcInternalName) {
      issues.push(`${rowLabel}: missing targetNpcInternalName`);
    } else if (seenTargets.has(targetNpcInternalName)) {
      issues.push(`${rowLabel}: duplicate targetNpcInternalName "${targetNpcInternalName}"`);
    } else {
      seenTargets.add(targetNpcInternalName);
    }

    if (!sourceNpcInternalName) {
      issues.push(`${rowLabel}: missing sourceNpcInternalName`);
    }

    if (targetNpcInternalName && sourceNpcInternalName && targetNpcInternalName === sourceNpcInternalName) {
      issues.push(`${rowLabel}: self-inheritance is not allowed`);
    }

    if (!inheritanceKind) {
      issues.push(`${rowLabel}: missing inheritanceKind`);
    } else if (!ALLOWED_INHERITANCE_KINDS.has(inheritanceKind)) {
      issues.push(`${rowLabel}: invalid inheritanceKind "${inheritanceKind}"`);
    }

    if (!evidenceSource) {
      issues.push(`${rowLabel}: missing evidenceSource`);
    }
    if (!reviewedBy) {
      issues.push(`${rowLabel}: missing reviewedBy`);
    }
    if (!isIsoDateOnly(reviewedAt)) {
      issues.push(`${rowLabel}: missing or invalid ISO reviewedAt`);
    }
  }

  if (issues.length) {
    const error = new Error([
      `NPC loot inheritance contract validation failed with ${issues.length} issue(s):`,
      ...issues.map((issue) => `- ${issue}`)
    ].join('\n'));
    error.validationIssues = issues;
    throw error;
  }
}

function validateReviewedNonNpcSourceExclusions(rows = []) {
  if (!Array.isArray(rows)) {
    const error = new Error('NPC reviewed non-NPC source exclusion contract validation failed: expected rows to be an array.');
    error.validationIssues = ['expected reviewed non-NPC source exclusion rows to be an array'];
    throw error;
  }

  const issues = [];
  for (const [index, row] of rows.entries()) {
    const sourceType = normalizeTableText(row?.sourceType);
    const sourceRefType = normalizeTableText(row?.sourceRefType);
    const matchType = normalizeTableText(row?.matchType);
    const sourceRefName = normalizeTableText(row?.sourceRefName);
    const reason = normalizeTableText(row?.reason);
    const evidenceSource = normalizeTableText(row?.evidenceSource);
    const reviewedBy = normalizeTableText(row?.reviewedBy);
    const reviewedAt = normalizeTableText(row?.reviewedAt);
    const rowLabel = `row ${index + 1} (${sourceRefName ?? '<missing sourceRefName>'})`;

    if (sourceType !== 'drop') issues.push(`${rowLabel}: invalid sourceType "${sourceType ?? ''}"`);
    if (sourceRefType !== 'npc') issues.push(`${rowLabel}: invalid sourceRefType "${sourceRefType ?? ''}"`);
    if (!['exact', 'regex'].includes(matchType)) issues.push(`${rowLabel}: invalid matchType "${matchType ?? ''}"`);
    if (!sourceRefName) issues.push(`${rowLabel}: missing sourceRefName`);
    if (matchType === 'regex' && sourceRefName && (!sourceRefName.startsWith('^') || !sourceRefName.endsWith('$'))) {
      issues.push(`${rowLabel}: regex sourceRefName must be anchored`);
    }
    if (!reason || !ALLOWED_NON_NPC_EXCLUSION_REASONS.has(reason)) issues.push(`${rowLabel}: invalid reason "${reason ?? ''}"`);
    if (!evidenceSource) issues.push(`${rowLabel}: missing evidenceSource`);
    if (!reviewedBy) issues.push(`${rowLabel}: missing reviewedBy`);
    if (!isIsoDateOnly(reviewedAt)) issues.push(`${rowLabel}: missing or invalid ISO reviewedAt`);
  }

  if (issues.length) {
    const error = new Error([
      `NPC reviewed non-NPC source exclusion contract validation failed with ${issues.length} issue(s):`,
      ...issues.map((issue) => `- ${issue}`)
    ].join('\n'));
    error.validationIssues = issues;
    throw error;
  }
}

function validateReviewedSourceOnlyItemExclusions(rows = []) {
  if (!Array.isArray(rows)) {
    const error = new Error('NPC reviewed source-only item exclusion contract validation failed: expected rows to be an array.');
    error.validationIssues = ['expected reviewed source-only item exclusion rows to be an array'];
    throw error;
  }

  const issues = [];
  for (const [index, row] of rows.entries()) {
    const sourceType = normalizeTableText(row?.sourceType);
    const sourceRefType = normalizeTableText(row?.sourceRefType);
    const sourceRefInternalName = normalizeTableText(row?.sourceRefInternalName);
    const itemName = normalizeTableText(row?.itemName);
    const recordKey = normalizeTableText(row?.recordKey);
    const chanceText = normalizeTableText(row?.chanceText);
    const hasQuantityText = Object.hasOwn(row ?? {}, 'quantityText');
    const sourceUrl = normalizeTableText(row?.sourceUrl);
    const reason = normalizeTableText(row?.reason);
    const evidenceSource = normalizeTableText(row?.evidenceSource);
    const reviewedBy = normalizeTableText(row?.reviewedBy);
    const reviewedAt = normalizeTableText(row?.reviewedAt);
    const rowLabel = `row ${index + 1} (${recordKey ?? '<missing recordKey>'})`;

    if (sourceType !== 'drop') issues.push(`${rowLabel}: invalid sourceType "${sourceType ?? ''}"`);
    if (sourceRefType !== 'npc') issues.push(`${rowLabel}: invalid sourceRefType "${sourceRefType ?? ''}"`);
    if (!sourceRefInternalName) issues.push(`${rowLabel}: missing sourceRefInternalName`);
    if (!itemName) issues.push(`${rowLabel}: missing itemName`);
    if (!recordKey) issues.push(`${rowLabel}: missing recordKey`);
    if (!chanceText) issues.push(`${rowLabel}: missing chanceText`);
    if (!hasQuantityText) issues.push(`${rowLabel}: missing quantityText`);
    if (!sourceUrl) issues.push(`${rowLabel}: missing sourceUrl`);
    if (!reason || !ALLOWED_SOURCE_ONLY_ITEM_EXCLUSION_REASONS.has(reason)) issues.push(`${rowLabel}: invalid reason "${reason ?? ''}"`);
    if (!evidenceSource) issues.push(`${rowLabel}: missing evidenceSource`);
    if (!reviewedBy) issues.push(`${rowLabel}: missing reviewedBy`);
    if (!isIsoDateOnly(reviewedAt)) issues.push(`${rowLabel}: missing or invalid ISO reviewedAt`);
  }

  if (issues.length) {
    const error = new Error([
      `NPC reviewed source-only item exclusion contract validation failed with ${issues.length} issue(s):`,
      ...issues.map((issue) => `- ${issue}`)
    ].join('\n'));
    error.validationIssues = issues;
    throw error;
  }
}

function toDateTag(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function camelToSnake(name) {
  return String(name).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function mapRowToDb(row) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    const column = camelToSnake(key);
    mapped[column] = normalizeRelationDateValue(column, value);
  }
  return mapped;
}

const RELATION_DATETIME_COLUMNS = new Set([
  'source_revision_timestamp',
  'landing_fetched_at',
  'landing_parsed_at',
  'created_at',
  'updated_at',
]);

export function normalizeRelationDateValue(column, value) {
  if (!RELATION_DATETIME_COLUMNS.has(column) || value == null || value === '') return value;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return value;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function queryRows(connection, sql) {
  const [rows] = await connection.query(sql);
  return rows;
}

async function loadDataset(mysqlOptions, database, sql) {
  const mysql = loadMysqlModule();
  const connection = await mysql.createConnection({ ...mysqlOptions, database });
  try {
    return await queryRows(connection, sql);
  } finally {
    await connection.end();
  }
}

async function queryMaintOptional(queryMaint, sql, fallback = []) {
  try {
    return await queryMaint(sql);
  } catch (error) {
    const code = error?.code ?? '';
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'ER_NO_SUCH_TABLE' || /doesn't exist|does not exist|unknown table/i.test(message)) {
      return fallback;
    }
    throw error;
  }
}

function buildNpcIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const candidates = [
      row.name,
      row.english_name,
      row.internal_name
    ].filter(Boolean);
    for (const candidate of candidates) {
      const existing = index.get(candidate);
      if (!existing) {
        index.set(candidate, row);
      } else if (Array.isArray(existing)) {
        existing.push(row);
      } else {
        index.set(candidate, [existing, row]);
      }
    }
  }
  return index;
}

function buildItemIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    if (row.internal_name) index.set(row.internal_name, row);
  }
  return index;
}

function isManagedProjectionImageUrl(value, prefixes) {
  return isManagedImagePath(value, prefixes);
}

function escapeSqlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function escapeSqlLikeLiteral(value) {
  return escapeSqlString(String(value).replace(/[\\%_]/g, (match) => `\\${match}`));
}

// A managed image is stored either at a configured origin or as the origin-free
// path that origin resolves to, so both forms have to be matched here. Each
// pattern stays anchored at the start: a loose `%/terrapedia-images/%` would
// trust any host that happens to serve that path.
function managedImageSqlPatterns(prefixes) {
  return [
    ...normalizeManagedImageUrlPrefixes(prefixes),
    ...managedImagePathPrefixes(prefixes)
  ];
}

function buildManagedImageSqlLikeAny(column, prefixes) {
  const clauses = managedImageSqlPatterns(prefixes)
    .map((prefix) => `BINARY TRIM(${column}) LIKE BINARY '${escapeSqlLikeLiteral(prefix)}%' ESCAPE '\\\\'`);
  return clauses.length ? `(${clauses.join(' OR ')})` : 'FALSE';
}

function buildManagedImageSqlNotLikeAll(column, prefixes) {
  const clauses = managedImageSqlPatterns(prefixes)
    .map((prefix) => `BINARY TRIM(${column}) NOT LIKE BINARY '${escapeSqlLikeLiteral(prefix)}%' ESCAPE '\\\\'`);
  return clauses.length ? `(${clauses.join(' AND ')})` : 'TRUE';
}

function resolveBuffManagedUrlPrefixes(prefixes = []) {
  return normalizeManagedImageUrlPrefixes(prefixes).filter((prefix) => /\/buffs\/$/i.test(prefix));
}

export function rewriteArmorSetRelatedItemImages(relatedItems, imageByInternalName, prefixes) {
  if (!Array.isArray(relatedItems)) {
    return { changed: false, items: relatedItems };
  }
  let changed = false;
  const items = relatedItems.map((item) => {
    if (!item || typeof item !== 'object') {
      return item;
    }
    const copy = { ...item };
    const internalName = copy.internalName ?? copy.internal_name ?? copy.itemInternalName ?? copy.item_internal_name;
    const key = typeof internalName === 'string' ? internalName.trim().toLowerCase() : '';
    const managedImage = key ? imageByInternalName.get(key) : null;
    if (managedImage && copy.image !== managedImage) {
      copy.image = managedImage;
      changed = true;
    } else if (!managedImage && copy.image && !isManagedProjectionImageUrl(copy.image, prefixes)) {
      copy.image = null;
      changed = true;
    }
    return copy;
  });
  return { changed, items };
}

function addIndexEntry(index, key, row) {
  if (!key) return;
  const normalizedKey = String(key).trim().toLowerCase();
  if (!normalizedKey) return;
  const existing = index.get(normalizedKey);
  if (!existing) {
    index.set(normalizedKey, row);
  } else if (Array.isArray(existing)) {
    existing.push(row);
  } else {
    index.set(normalizedKey, [existing, row]);
  }
}

async function queryRelationOptional(queryRelation, sql, fallback = []) {
  try {
    return await queryRelation(sql);
  } catch (error) {
    const code = error?.code ?? '';
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'ER_NO_SUCH_TABLE' || /doesn't exist|does not exist|unknown table/i.test(message)) {
      return fallback;
    }
    throw error;
  }
}

function parseJsonObject(value) {
  if (value == null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildItemSourceLookupIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    addIndexEntry(index, row.internal_name, row);
    addIndexEntry(index, row.english_name, row);
    addIndexEntry(index, row.name, row);
    addIndexEntry(index, row.name_zh, row);
  }
  return index;
}

async function upsertRows(connection, tableName, rows) {
  if (!rows || rows.length === 0) return 0;
  let total = 0;
  for (const row of rows) {
    const mapped = mapRowToDb(row);
    const columns = Object.keys(mapped);
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter((column) => column !== 'record_key')
      .map((column) => `\`${column}\` = VALUES(\`${column}\`)`)
      .join(', ');
    const sql = `
INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(', ')})
VALUES (${placeholders})
ON DUPLICATE KEY UPDATE ${updates || '`record_key` = VALUES(`record_key`)'}
`.trim();
    await connection.execute(sql, columns.map((column) => normalizeMysqlPersistenceValue(column, mapped[column])));
    total += 1;
  }
  return total;
}

const MYSQL_DATETIME_COLUMN_PATTERN = /(?:_at|_timestamp)$/;

export function normalizeMysqlPersistenceValue(column, value) {
  if (typeof value !== 'string' || !MYSQL_DATETIME_COLUMN_PATTERN.test(String(column ?? ''))
      || !/T/.test(value)) {
    return value;
  }
  const normalizedInput = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  const parsed = new Date(normalizedInput);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

async function reconcileItemStackSizeFromMaint(connection, maintDatabase) {
  await connection.query(
    `
    UPDATE \`relation_items\` ri
    INNER JOIN \`${maintDatabase}\`.\`maint_items\` mi
      ON mi.source_id = ri.source_id
    SET ri.stack_size = mi.stack_size
    WHERE ri.deleted = 0
      AND mi.deleted = 0
      AND mi.stack_size IS NOT NULL
    `.trim()
  );

  await connection.query(
    `
    UPDATE \`projection_items\` pi
    INNER JOIN \`relation_items\` ri
      ON ri.record_key = pi.relation_record_key
    SET
      pi.stack_size = ri.stack_size,
      pi.is_stackable = CASE
        WHEN ri.stack_size IS NULL THEN NULL
        WHEN ri.stack_size > 1 THEN 1
        ELSE 0
      END
    WHERE pi.deleted = 0
      AND ri.deleted = 0
      AND ri.stack_size IS NOT NULL
    `.trim()
  );
}

async function reconcileProjectionItemImageFromMaint(connection, maintDatabase, prefixes) {
  const managedCachedUrlPredicate = buildManagedImageSqlLikeAny('mi.cached_url', prefixes);
  const [result] = await connection.query(
    `
    UPDATE \`projection_items\` pi
    INNER JOIN (
      SELECT ranked.*
      FROM (
        SELECT
          mi.*,
          ROW_NUMBER() OVER (
            PARTITION BY mi.item_internal_name
            ORDER BY COALESCE(mi.is_primary, 0) DESC, COALESCE(mi.sort_order, 2147483647) ASC, mi.id ASC
          ) AS image_rank
        FROM \`${maintDatabase}\`.\`maint_item_images\` mi
        WHERE mi.deleted = 0
          AND mi.cached_url IS NOT NULL
          AND TRIM(mi.cached_url) <> ''
          AND ${managedCachedUrlPredicate}
      ) ranked
      WHERE ranked.image_rank = 1
    ) picked
      ON picked.item_internal_name COLLATE utf8mb4_unicode_ci = pi.internal_name COLLATE utf8mb4_unicode_ci
    SET pi.image = picked.cached_url
    WHERE pi.deleted = 0
    `.trim()
  );
  return Number(result?.affectedRows ?? 0);
}

async function reconcileProjectionArmorSetRelatedItemImagesFromLocal(connection, localDatabase, enabled = true, prefixes) {
  if (!localDatabase || !enabled) {
    return 0;
  }

  const [armorRows] = await connection.query(
    `
    SELECT id, related_items_json
    FROM \`projection_armor_sets\`
    WHERE deleted = 0
      AND related_items_json IS NOT NULL
      AND TRIM(related_items_json) <> ''
    `.trim()
  );
  if (!armorRows.length) {
    return 0;
  }

  const localImageManagedPredicate = buildManagedImageSqlLikeAny('image', prefixes);
  const [itemRows] = await connection.query(
    `
    SELECT internal_name, image
    FROM \`${localDatabase}\`.\`items\`
    WHERE deleted = 0
      AND internal_name IS NOT NULL
      AND image IS NOT NULL
      AND TRIM(image) <> ''
      AND ${localImageManagedPredicate}
    `.trim()
  );
  const imageByInternalName = new Map(
    itemRows
      .filter((row) => row.internal_name && isManagedProjectionImageUrl(row.image, prefixes))
      .map((row) => [String(row.internal_name).trim().toLowerCase(), row.image.trim()])
  );
  if (!imageByInternalName.size) {
    return 0;
  }

  let changedRows = 0;
  for (const row of armorRows) {
    let relatedItems;
    try {
      relatedItems = JSON.parse(row.related_items_json);
    } catch {
      continue;
    }
    if (!Array.isArray(relatedItems)) {
      continue;
    }
    const rewrite = rewriteArmorSetRelatedItemImages(relatedItems, imageByInternalName, prefixes);
    if (rewrite.changed) {
      await connection.query(
        'UPDATE `projection_armor_sets` SET related_items_json = ? WHERE id = ?',
        [JSON.stringify(rewrite.items), row.id]
      );
      changedRows += 1;
    }
  }
  return changedRows;
}

async function clearRelationSnapshotTables(connection, tableNames) {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const tableName of tableNames) {
      try {
        await connection.query(`TRUNCATE TABLE \`${tableName}\``);
      } catch {
        await connection.query(`DELETE FROM \`${tableName}\``);
      }
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

async function dropDeprecatedRelationTables(connection, databaseName = RELATION_DATABASE_NAME) {
  for (const tableName of DEPRECATED_RELATION_TABLE_NAMES) {
    await connection.query(`DROP TABLE IF EXISTS \`${databaseName}\`.\`${tableName}\``);
  }
}

async function getTableColumns(connection, databaseName, tableName) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`,
    [databaseName, tableName]
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function ensureRelationMigrations(connection, databaseName) {
  const migrations = [
    {
      tableName: 'relation_items',
      columns: [
        ['rare_raw', 'INT DEFAULT NULL AFTER `height`'],
        ['value_raw', 'INT DEFAULT NULL AFTER `rare_raw`'],
        ['sell_raw', 'INT DEFAULT NULL AFTER `value_raw`'],
        ['sell_text_raw', 'VARCHAR(255) DEFAULT NULL AFTER `sell_raw`']
      ]
    },
    {
      tableName: 'relation_npcs',
      columns: [
        ['sub_name_zh', 'VARCHAR(255) DEFAULT NULL AFTER `name_zh`']
      ]
    },
    {
      tableName: 'projection_npcs',
      columns: [
        ['image_url', 'VARCHAR(500) DEFAULT NULL AFTER `sub_name_zh`'],
        ['loot_items_json', 'LONGTEXT AFTER `raw_json`'],
        ['shop_items_json', 'LONGTEXT AFTER `loot_items_json`'],
        ['source_items_json', 'LONGTEXT AFTER `shop_items_json`']
      ]
    },
    {
      tableName: 'projection_items',
      columns: [
        ['source_npcs_json', 'LONGTEXT AFTER `stack_size`']
      ]
    },
    {
      tableName: 'projection_projectiles',
      columns: [
        ['image_url', 'VARCHAR(500) DEFAULT NULL AFTER `name_zh`'],
        ['source_items_json', 'LONGTEXT AFTER `tile_collide`'],
        ['source_npcs_json', 'LONGTEXT AFTER `source_items_json`']
      ]
    },
    {
      tableName: 'relation_buffs',
      columns: [
        ['inflicting_npcs_json', 'LONGTEXT AFTER `source_items_json`'],
        ['source_evidence_json', 'LONGTEXT AFTER `immune_npc_sample_json`']
      ]
    },
    {
      tableName: 'projection_buffs',
      columns: [
        ['inflicting_npcs_json', 'LONGTEXT AFTER `source_items_json`'],
        ['source_evidence_json', 'LONGTEXT AFTER `immune_npc_sample_json`']
      ]
    },
    {
      tableName: 'projection_armor_sets',
      columns: [
        ['entity_type', 'VARCHAR(64) DEFAULT NULL AFTER `text_key`'],
        ['composition_kind', 'VARCHAR(64) DEFAULT NULL AFTER `entity_type`']
      ]
    },
    {
      tableName: 'item_npc_shop_relations',
      columns: [
        ['item_name', 'VARCHAR(255) DEFAULT NULL AFTER `item_internal_name`'],
        ['condition_source_text', 'TEXT AFTER `conditions`'],
        ['condition_parse_status', 'VARCHAR(64) DEFAULT NULL AFTER `condition_source_text`'],
        ['condition_biome_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_parse_status`'],
        ['condition_game_period_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_biome_code`'],
        ['condition_time_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_game_period_code`'],
        ['condition_weather_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_time_code`'],
        ['condition_events_json', 'LONGTEXT AFTER `condition_weather_code`'],
        ['special_flags_json', 'LONGTEXT AFTER `condition_events_json`']
      ]
    },
    {
      tableName: 'item_npc_loot_relations',
      columns: [
        ['item_name', 'VARCHAR(255) DEFAULT NULL AFTER `item_internal_name`'],
        ['condition_source_text', 'TEXT AFTER `conditions`'],
        ['condition_parse_status', 'VARCHAR(64) DEFAULT NULL AFTER `condition_source_text`'],
        ['condition_biome_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_parse_status`'],
        ['condition_game_period_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_biome_code`'],
        ['condition_time_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_game_period_code`'],
        ['condition_weather_code', 'VARCHAR(64) DEFAULT NULL AFTER `condition_time_code`'],
        ['condition_events_json', 'LONGTEXT AFTER `condition_weather_code`'],
        ['special_flags_json', 'LONGTEXT AFTER `condition_events_json`']
      ]
    }
  ];

  for (const migration of migrations) {
    const existingColumns = await getTableColumns(connection, databaseName, migration.tableName);
    for (const [columnName, definition] of migration.columns) {
      if (existingColumns.has(columnName)) {
        continue;
      }
      await connection.query(
        `ALTER TABLE \`${databaseName}\`.\`${migration.tableName}\` ADD COLUMN \`${columnName}\` ${definition}`
      );
      existingColumns.add(columnName);
    }
  }
}

async function insertRun(connection, run) {
  const sql = `
INSERT INTO \`relation_runs\`
  (\`run_key\`, \`apply_mode\`, \`maint_database\`, \`local_database\`, \`relation_database\`, \`scopes_json\`, \`summary_json\`, \`started_at\`, \`finished_at\`, \`status\`)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  \`apply_mode\` = VALUES(\`apply_mode\`),
  \`maint_database\` = VALUES(\`maint_database\`),
  \`local_database\` = VALUES(\`local_database\`),
  \`relation_database\` = VALUES(\`relation_database\`),
  \`scopes_json\` = VALUES(\`scopes_json\`),
  \`summary_json\` = VALUES(\`summary_json\`),
  \`started_at\` = VALUES(\`started_at\`),
  \`finished_at\` = VALUES(\`finished_at\`),
  \`status\` = VALUES(\`status\`)
`.trim();

  await connection.execute(sql, [
    run.runKey,
    run.applyMode,
    run.maintDatabase,
    run.localDatabase,
    run.relationDatabase,
    JSON.stringify(run.scopes),
    run.summaryJson == null ? null : JSON.stringify(run.summaryJson),
    run.startedAt,
    run.finishedAt,
    run.status
  ]);
}

async function insertReportRows(connection, runKey, reportPaths) {
  const rows = [
    ['audit_json', reportPaths.auditJsonPath, 'json'],
    ['audit_md', reportPaths.auditMdPath, 'md'],
    ['conflicts_json', reportPaths.conflictsPath, 'json'],
    ['unresolved_json', reportPaths.unresolvedPath, 'json']
  ];

  for (const [kind, reportPath, format] of rows) {
    await connection.execute(
      `
      INSERT INTO \`relation_run_reports\`
        (\`run_key\`, \`report_kind\`, \`report_path\`, \`report_format\`)
      VALUES (?, ?, ?, ?)
      `.trim(),
      [runKey, kind, reportPath, format]
    );
  }
}

function flattenResults(category, recipe, itemSource, secondary, bossSeries, npcSeries, armorSet) {
  return {
    relationItems: [],
    relationNpcs: [],
    relationProjectiles: [],
    relationBuffs: [],
    relationBosses: [],
    relationArmorSets: armorSet.relationArmorSets,
    relationArmorSetItems: armorSet.relationArmorSetItems,
    relationArmorAttributeRows: armorSet.relationArmorAttributeRows ?? [],
    relationEquipmentEffectAttributes: [],
    relationArmorSetImages: armorSet.relationArmorSetImages,
    relationItemRarities: [],
    relationItemImages: [],
    relationNpcImages: [],
    relationProjectileImages: [],
    relationBuffImages: [],
    categoryNodes: category.categoryNodes,
    itemCategoryAssignments: category.itemCategoryAssignments,
    itemRecipeHeads: recipe.recipeHeads,
    itemRecipeIngredients: recipe.recipeIngredients,
    itemRecipeStations: recipe.recipeStations,
    itemRecipeGroupExpansions: [],
    itemSourceFacts: itemSource.sourceFacts,
    itemSourceDetails: itemSource.sourceDetails,
    itemNpcShopRelations: itemSource.npcShopRelations,
    itemNpcLootRelations: itemSource.npcLootRelations,
    itemNpcRelationAudits: itemSource.itemNpcRelationAudits,
    itemBuffRelations: secondary.itemBuffRelations,
    npcBuffRelations: secondary.npcBuffRelations,
    itemBiomeRelations: secondary.itemBiomeRelations,
    itemProjectileRelations: secondary.itemProjectileRelations,
    npcProjectileRelations: secondary.npcProjectileRelations,
    itemProjectileAudits: secondary.itemProjectileAudits,
    npcProjectileAudits: secondary.npcProjectileAudits,
    bossItemRewardRelations: bossSeries.bossItemRewardRelations,
    bossEffectRelations: bossSeries.bossEffectRelations,
    npcSeriesNodes: npcSeries.npcSeriesNodes,
    npcSeriesMemberships: npcSeries.npcSeriesMemberships,
    npcSeriesItemRelations: npcSeries.npcSeriesItemRelations,
    projectionItems: [],
    projectionNpcs: [],
    projectionBosses: [],
    projectionProjectiles: [],
    projectionBuffs: [],
    projectionArmorSets: [],
    projectionItemArmorAttributes: [],
    projectionEquipmentEffectAttributes: [],
    issues: [
      ...category.issues,
      ...recipe.issues,
      ...itemSource.issues,
      ...(secondary.issues ?? []),
      ...bossSeries.issues,
      ...npcSeries.issues,
      ...armorSet.issues
    ]
  };
}

function requireItemOnlyIds(itemIds) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new TypeError('Item-only relation sync requires a non-empty itemIds array');
  }
  const seen = new Set();
  for (const itemId of itemIds) {
    if (!Number.isSafeInteger(itemId) || itemId <= 0 || seen.has(itemId)) {
      throw new TypeError('Item-only relation sync itemIds must be unique positive safe integers');
    }
    seen.add(itemId);
  }
  return [...itemIds];
}

function assertItemOnlyDatabases(databases) {
  if (!databases || typeof databases !== 'object' || Array.isArray(databases)) {
    throw new Error('Item-only relation sync requires exact isolated local, maint, and relation databases');
  }
  if (Object.keys(databases).sort().join(',') !== 'local,maint,relation') {
    throw new Error('Item-only relation sync requires exact local, maint, and relation database roles');
  }
  const runKeys = new Set();
  for (const role of ['local', 'maint', 'relation']) {
    const database = String(databases[role] ?? '');
    if (FORMAL_DATABASE_NAMES.has(database)) throw new Error('Item-only relation sync cannot target formal databases');
    const match = database.match(ITEM_ONLY_DATABASE_PATTERN);
    if (!match || match[2] !== role) throw new Error(`Item-only relation sync ${role} database is not an exact run-derived T1 schema`);
    runKeys.add(match[1]);
  }
  if (runKeys.size !== 1) throw new Error('Item-only relation sync database roles do not share one run identity');
  return [...runKeys][0];
}

function normalizeItemRelationItemRow(row) {
  const sourceId = Number(row?.source_id ?? row?.sourceId ?? row?.id);
  const internalName = String(row?.internal_name ?? row?.internalName ?? '').trim();
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || !internalName) {
    throw new Error('Item-only relation sync requires stable Item ID and internal_name rows');
  }
  return {
    ...row,
    source_id: sourceId,
    internal_name: internalName,
    english_name: row.english_name ?? row.englishName ?? row.name ?? internalName,
    raw_json: row.raw_json ?? row.rawJson ?? '{}',
  };
}

function itemRelationTrace(group, row, index, sourceBinding) {
  const sourceMaintRecordKey = createRecordKey({ type: 'e8pr_item_relation', group, index, row });
  return {
    record_key: sourceMaintRecordKey,
    source_maint_table: `standardized_item_relations_${group}`,
    source_maint_record_key: sourceMaintRecordKey,
    source_maint_id: null,
    landing_source_id: sourceBinding?.sourceId ?? null,
    landing_source_key: sourceBinding?.sourceKey ?? 'repository-frozen:item_relations',
    landing_source_page: sourceBinding?.sourcePage ?? 'data/standardized-view/item_relations',
    landing_content_hash: sourceBinding?.contentHash ?? null,
    source_provider: row?.sourceProvider ?? row?.provider ?? 'wiki_gg',
    source_page: row?.sourcePage ?? null,
    source_revision_timestamp: row?.sourceRevisionTimestamp ?? null,
  };
}

function mapItemOnlyRecipeRow(row, index, sourceBinding) {
  return {
    ...itemRelationTrace('recipes', row, index, sourceBinding),
    result_internal_name: row.resultInternalName ?? row.result_internal_name ?? null,
    result_name: row.resultName ?? row.result_name ?? null,
    result_quantity: row.resultQuantity ?? row.result_quantity ?? null,
    version_scope: row.versionScope ?? row.version_scope ?? null,
    ingredients_json: JSON.stringify(row.ingredients ?? parseJsonArrayOrObject(row.ingredients_json, [])),
    stations_json: JSON.stringify(row.stations ?? parseJsonArrayOrObject(row.stations_json, [])),
    source_context_page: row.sourceContextPage ?? row.source_context_page ?? null,
  };
}

function mapItemOnlyImageRow(row, index, sourceBinding) {
  return {
    ...itemRelationTrace('itemImages', row, index, sourceBinding),
    item_internal_name: row.itemInternalName ?? row.item_internal_name ?? null,
    item_name: row.itemName ?? row.item_name ?? null,
    role: row.role ?? 'icon',
    source_file_title: row.sourceFileTitle ?? row.source_file_title ?? null,
    original_url: row.originalUrl ?? row.original_url ?? null,
    cached_url: row.cachedUrl ?? row.cached_url ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    content_type: row.contentType ?? row.content_type ?? null,
    is_primary: row.isPrimary ?? row.is_primary ?? false,
    sort_order: row.sortOrder ?? row.sort_order ?? index,
    raw_json: JSON.stringify(row),
  };
}

function mapItemOnlySourceRow(row, index, sourceBinding) {
  return {
    ...itemRelationTrace('itemSources', row, index, sourceBinding),
    item_internal_name: row.itemInternalName ?? row.item_internal_name ?? null,
    item_name: row.itemName ?? row.item_name ?? null,
    source_type: row.sourceType ?? row.source_type ?? null,
    source_ref_type: row.sourceRefType ?? row.source_ref_type ?? null,
    source_ref_name: row.sourceRefName ?? row.source_ref_name ?? null,
    sort_order: row.sortOrder ?? row.sort_order ?? index,
    biome_code: row.biomeCode ?? row.biome_code ?? null,
    raw_json: JSON.stringify(row),
  };
}

function mapItemOnlyBiomeRow(row, index, itemByName, sourceBinding) {
  const itemInternalName = row.itemInternalName ?? row.item_internal_name ?? null;
  const item = itemByName.get(String(itemInternalName ?? '').trim().toLowerCase());
  return {
    ...itemRelationTrace('itemBiomes', row, index, sourceBinding),
    item_source_id: item?.source_id ?? null,
    item_internal_name: itemInternalName,
    biome_code: row.biomeCode ?? row.biome_code ?? null,
    relation_type: row.relationType ?? row.relation_type ?? 'relevant_to',
    raw_json: JSON.stringify(row),
  };
}

function canonicalItemRelationValue(value) {
  if (Array.isArray(value)) return value.map(canonicalItemRelationValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalItemRelationValue(value[key])]));
  }
  return value;
}

function canonicalItemRelationHash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalItemRelationValue(value))).digest('hex')}`;
}

function readMaintRawRelation(row, group) {
  const raw = row?.raw_json ?? row?.rawJson;
  if (typeof raw !== 'string' || raw.length === 0) throw new Error(`maintained Item ${group} row is missing raw_json source evidence`);
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) { throw new Error(`maintained Item ${group} row has malformed raw_json`, { cause: error }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`maintained Item ${group} row raw_json must contain an object`);
  }
  return parsed;
}

function assertMaintainedRelationGroup({ rows, sourceRows, group, sourceBinding }) {
  if (!Array.isArray(rows) || rows.length !== sourceRows.length) {
    throw new Error(`maintained Item ${group} count differs from the manifest-bound source group`);
  }
  const expected = sourceRows.map(canonicalItemRelationHash).sort();
  const actual = rows.map((row) => {
    if (Number(row.landing_source_id ?? row.landingSourceId) !== Number(sourceBinding.sourceId)
        || String(row.landing_content_hash ?? row.landingContentHash ?? '').replace(/^sha256:/, '')
          !== String(sourceBinding.contentHash).replace(/^sha256:/, '')) {
      throw new Error(`maintained Item ${group} row has a different source landing binding`);
    }
    return canonicalItemRelationHash(readMaintRawRelation(row, group));
  }).sort();
  if (expected.join(',') !== actual.join(',')) {
    throw new Error(`maintained Item ${group} rows differ from the manifest-bound source rows`);
  }
}

function buildStableNpcIndex(rows) {
  if (!Array.isArray(rows)) throw new Error('stable Item source NPC dependencies must be an array');
  const index = new Map();
  const ids = new Set();
  for (const row of rows) {
    const sourceId = Number(row?.source_id ?? row?.sourceId);
    const internalName = String(row?.internal_name ?? row?.internalName ?? '').trim();
    if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || !internalName) {
      throw new Error('stable Item source NPC dependency requires source_id and internal_name');
    }
    if (ids.has(sourceId) || index.has(internalName.toLowerCase())) {
      throw new Error('stable Item source NPC dependencies contain duplicate IDs or internal names');
    }
    ids.add(sourceId);
    index.set(internalName, row);
  }
  return index;
}

export function buildItemOnlyRelationResults({
  itemIds,
  maintItems = [],
  referenceItems = [],
  referenceNpcs = [],
  maintItemCategories = [],
  maintItemRecipes = [],
  maintItemImages = [],
  maintItemSources = [],
  maintItemBiomes = [],
  relationRows = {},
  sourceBinding = null,
  managedImageUrlPrefixes = [],
} = {}) {
  const selectedIds = requireItemOnlyIds(itemIds);
  const selectedIdSet = new Set(selectedIds);
  if (relationRows == null || typeof relationRows !== 'object' || Array.isArray(relationRows)) {
    throw new Error('Item-only relation sync requires declared relationRows');
  }
  if (Array.isArray(relationRows.snapshots) && relationRows.snapshots.length > 0) {
    throw new Error('Item-only relation sync excludes entity source snapshots');
  }
  const selectedMaintItems = maintItems.map(normalizeItemRelationItemRow);
  const selectedMaintIds = new Set(selectedMaintItems.map((row) => row.source_id));
  if (selectedMaintIds.size !== selectedIds.length || selectedIds.some((id) => !selectedMaintIds.has(id))) {
    throw new Error('Item-only relation sync maint Item IDs do not exactly match the selected manifest IDs');
  }
  const allReferenceItems = [...new Map(
    [...referenceItems, ...selectedMaintItems]
      .map((row) => normalizeItemRelationItemRow(row))
      .map((row) => [row.source_id, row]),
  ).values()];
  const itemByName = new Map(allReferenceItems.map((row) => [row.internal_name.trim().toLowerCase(), row]));
  const ensureSelectedName = (row, label) => {
    const name = String(row?.itemInternalName ?? row?.item_internal_name ?? '').trim().toLowerCase();
    const item = itemByName.get(name);
    if (!item || !selectedIdSet.has(item.source_id)) throw new Error(`${label} references an undeclared selected Item identity`);
    return item;
  };
  const raw = {
    biomes: Array.isArray(relationRows.biomes) ? relationRows.biomes : [],
    itemBiomes: Array.isArray(relationRows.itemBiomes) ? relationRows.itemBiomes : [],
    itemImages: Array.isArray(relationRows.itemImages) ? relationRows.itemImages : [],
    itemSources: Array.isArray(relationRows.itemSources) ? relationRows.itemSources : [],
    recipes: Array.isArray(relationRows.recipes) ? relationRows.recipes : [],
  };
  raw.itemBiomes.forEach((row) => ensureSelectedName(row, 'Item biome relation'));
  raw.itemImages.forEach((row) => ensureSelectedName(row, 'Item image relation'));
  raw.itemSources.forEach((row) => ensureSelectedName(row, 'Item source relation'));
  if (!sourceBinding || !Number.isSafeInteger(Number(sourceBinding.sourceId)) || Number(sourceBinding.sourceId) <= 0
      || !/^sha256:[a-f0-9]{64}$/.test(String(sourceBinding.contentHash ?? ''))) {
    throw new Error('Item-only relation sync requires the exact generated source landing identity and hash');
  }
  assertMaintainedRelationGroup({ rows: maintItemRecipes, sourceRows: raw.recipes, group: 'recipes', sourceBinding });
  assertMaintainedRelationGroup({ rows: maintItemImages, sourceRows: raw.itemImages, group: 'itemImages', sourceBinding });
  assertMaintainedRelationGroup({ rows: maintItemSources, sourceRows: raw.itemSources, group: 'itemSources', sourceBinding });
  assertMaintainedRelationGroup({ rows: maintItemBiomes, sourceRows: raw.itemBiomes, group: 'itemBiomes', sourceBinding });
  const selectedNameSet = new Set(selectedMaintItems.map((row) => row.internal_name.trim().toLowerCase()));
  if (!Array.isArray(maintItemCategories) || maintItemCategories.some((row) => (
    !selectedNameSet.has(String(row?.item_internal_name ?? row?.itemInternalName ?? '').trim().toLowerCase())
  ))) {
    throw new Error('maintained Item category rows reference an undeclared selected identity');
  }
  const itemRecipes = raw.recipes.map((row, index) => {
    const resultName = String(row?.resultInternalName ?? row?.result_internal_name ?? '').trim().toLowerCase();
    const resultItem = itemByName.get(resultName);
    if (!resultItem) throw new Error('Item recipe result has no stable Item ID');
    if (!selectedIdSet.has(resultItem.source_id)) {
      const ingredientSelected = (row.ingredients ?? []).some((ingredient) => selectedIdSet.has(itemByName.get(String(ingredient?.ingredientInternalName ?? '').trim().toLowerCase())?.source_id));
      if (!ingredientSelected) throw new Error('Item recipe result is outside the selected Item relation scope');
    }
    for (const ingredient of row.ingredients ?? []) {
      if (String(ingredient?.ingredientGroupType ?? 'item').toLowerCase() !== 'item') continue;
      const ingredientItem = itemByName.get(String(ingredient?.ingredientInternalName ?? ingredient?.internalName ?? '').trim().toLowerCase());
      if (!ingredientItem) throw new Error('Item recipe ingredient has no stable Item ID');
    }
    if (canonicalItemRelationHash(readMaintRawRelation(maintItemRecipes[index], 'recipes')) !== canonicalItemRelationHash(row)) {
      throw new Error('maintained Item recipe row order differs from the source manifest');
    }
    return maintItemRecipes[index];
  });
  const itemImages = maintItemImages;
  const itemSources = maintItemSources;
  const itemBiomes = maintItemBiomes;
  const relationItems = buildBaseEntityRelations({ maintItems: selectedMaintItems }).relationItems;
  const itemIndex = buildItemIndex(allReferenceItems);
  const recipe = buildRecipeRelations({ itemRecipes, itemIndex });
  const itemSource = buildItemSourceRelations({ itemSourceRows: itemSources, itemIndex, npcIndex: buildStableNpcIndex(referenceNpcs) });
  const category = buildCategoryRelations({ itemCategoryRows: maintItemCategories });
  const secondary = buildSecondaryRelations({ itemBiomeRows: itemBiomes, maintItemRows: allReferenceItems });
  const images = buildImageRelations({ maintItemImages: itemImages });
  const relationItemRarities = buildRelationItemRarities();
  const projection = buildProjectionPayload({
    relationItems,
    relationItemImages: images.relationItemImages,
    relationItemRarities,
    itemNpcShopRelations: itemSource.npcShopRelations,
    itemNpcLootRelations: itemSource.npcLootRelations,
    managedImageUrlPrefixes,
  });
  return {
    relationItems,
    relationItemImages: images.relationItemImages,
    relationItemRarities,
    categoryNodes: category.categoryNodes,
    itemCategoryAssignments: category.itemCategoryAssignments,
    itemRecipeHeads: recipe.recipeHeads,
    itemRecipeIngredients: recipe.recipeIngredients,
    itemRecipeStations: recipe.recipeStations,
    itemSourceFacts: itemSource.sourceFacts,
    itemSourceDetails: itemSource.sourceDetails,
    itemNpcShopRelations: itemSource.npcShopRelations,
    itemNpcLootRelations: itemSource.npcLootRelations,
    itemNpcRelationAudits: itemSource.itemNpcRelationAudits,
    itemBiomeRelations: secondary.itemBiomeRelations,
    projectionItems: projection.projectionItems,
    issues: [...category.issues, ...recipe.issues, ...itemSource.issues, ...(secondary.issues ?? [])],
    nonItemTableRows: 0,
  };
}

function countQueryResult(result) {
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  const row = Array.isArray(rows) ? rows[0] : null;
  return Number(row?.total ?? row?.['COUNT(*)'] ?? 0);
}

export async function runItemOnlySync(options = {}, dependencies = {}) {
  if (options.itemOnly !== true) throw new Error('runItemOnlySync requires itemOnly=true');
  if (Array.isArray(options.scopes) && (options.scopes.length !== 1 || options.scopes[0] !== 'items')) {
    throw new Error("Item-only relation sync scopes must be exactly ['items']");
  }
  const databases = {
    local: options.localDatabase,
    maint: options.maintDatabase,
    relation: options.relationDatabase,
  };
  assertItemOnlyDatabases(databases);
  const itemIds = requireItemOnlyIds(options.itemIds);
  if (dependencies.queryMaint != null && typeof dependencies.queryMaint !== 'function') {
    throw new Error('Item-only relation sync maint reader is invalid');
  }
  const inputs = dependencies.itemOnlyInputs;
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    throw new Error('Item-only relation sync requires exact maintained Item input arrays');
  }
  const relationResults = buildItemOnlyRelationResults({
    itemIds,
    maintItems: inputs.maintItems,
    referenceItems: inputs.referenceItems,
    referenceNpcs: inputs.referenceNpcs ?? [],
    maintItemCategories: inputs.maintItemCategories,
    maintItemRecipes: inputs.maintItemRecipes,
    maintItemImages: inputs.maintItemImages,
    maintItemSources: inputs.maintItemSources,
    maintItemBiomes: inputs.maintItemBiomes,
    relationRows: inputs.relationRows,
    sourceBinding: inputs.sourceBinding,
    managedImageUrlPrefixes: dependencies.managedImageUrlPrefixes ?? [],
  });
  const tableRows = {
    relation_items: relationResults.relationItems,
    relation_item_images: relationResults.relationItemImages,
    relation_item_rarities: relationResults.relationItemRarities,
    category_nodes: relationResults.categoryNodes,
    item_category_assignments: relationResults.itemCategoryAssignments,
    item_recipe_heads: relationResults.itemRecipeHeads,
    item_recipe_ingredients: relationResults.itemRecipeIngredients,
    item_recipe_stations: relationResults.itemRecipeStations,
    item_source_facts: relationResults.itemSourceFacts,
    item_source_details: relationResults.itemSourceDetails,
    item_npc_shop_relations: relationResults.itemNpcShopRelations,
    item_npc_loot_relations: relationResults.itemNpcLootRelations,
    item_npc_relation_audits: relationResults.itemNpcRelationAudits,
    item_biome_relations: relationResults.itemBiomeRelations,
    projection_items: relationResults.projectionItems,
  };
  let rowsWritten = 0;
  if (options.apply) {
    const executeRelation = dependencies.executeRelation ?? (async (fn) => {
      const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
      const connection = await loadMysqlModule().createConnection({
        host: config.database?.host ?? '127.0.0.1',
        port: Number(config.database?.port ?? 3306),
        user: config.database?.username ?? 'root',
        password: config.database?.password ?? 'root',
        database: options.relationDatabase,
      });
      try { return await fn(connection); } finally { await connection.end(); }
    });
    await executeRelation(async (connection) => {
      if (typeof connection.beginTransaction === 'function') await connection.beginTransaction();
      try {
        for (const tableName of ITEM_ONLY_RELATION_TABLE_ALLOWLIST) {
          const count = countQueryResult(await connection.query(`SELECT COUNT(*) AS total FROM \`${tableName}\``));
          if (!Number.isSafeInteger(count) || count !== 0) throw new Error(`Item-only relation target ${tableName} is not empty`);
        }
        for (const [tableName, rows] of Object.entries(tableRows)) rowsWritten += await upsertRows(connection, tableName, rows);
        if (typeof connection.commit === 'function') await connection.commit();
      } catch (error) {
        if (typeof connection.rollback === 'function') await connection.rollback();
        throw error;
      }
    });
  }
  return {
    apply: Boolean(options.apply),
    relationWriteMode: 'items-only',
    itemIds,
    tableRows,
    rowsWritten,
    summary: {
      relationItems: relationResults.relationItems.length,
      projectionItems: relationResults.projectionItems.length,
      recipeHeads: relationResults.itemRecipeHeads.length,
      recipeIngredients: relationResults.itemRecipeIngredients.length,
      itemSourceFacts: relationResults.itemSourceFacts.length,
      itemBiomeRelations: relationResults.itemBiomeRelations.length,
      issues: relationResults.issues.length,
    },
    results: relationResults,
  };
}

function buildArmorSetEquipmentEffectAttributes(relationArmorSets = []) {
  const rows = [];
  for (const armorSet of relationArmorSets) {
    const raw = parseJsonObject(armorSet.rawJson);
    const benefitZh = raw.effectText ?? null;
    if (!benefitZh) {
      continue;
    }
    const effectSource = raw.effectTextSource && typeof raw.effectTextSource === 'object'
      ? raw.effectTextSource : null;
    const parsedRows = parseEquipmentEffectLines({
      owner: {
        ownerKind: 'armor_set',
        ownerRecordKey: armorSet.recordKey ?? null,
        ownerId: armorSet.id ?? null,
        ownerKey: armorSet.textKey ?? null,
        sourceProvider: effectSource?.provider ?? armorSet.sourceProvider ?? null,
        sourcePage: effectSource?.pageTitle ?? armorSet.sourcePage ?? null,
        sourceRevisionTimestamp: effectSource?.revisionTimestamp ?? armorSet.sourceRevisionTimestamp ?? null
      },
      text: benefitZh,
      sourceKind: 'benefit_zh',
      sourceLocale: effectSource?.locale ?? 'zh'
    }).filter((row) => !isItemScopedArmorMultiplier(row));
    for (const row of parsedRows) {
      rows.push({
        recordKey: createRecordKey([
          'equipment-effect',
          row.ownerKind,
          row.ownerRecordKey,
          row.sourceKind,
          row.sourceLineIndex,
          row.effectIndex,
          row.statKey,
          row.variantLabel ?? 'all'
        ]),
        ...row,
        confidence: row.confidence ?? 0.9,
        reviewStatus: row.parseStatus === 'parsed' ? 'accepted' : 'needs_review',
        reason: row.parseStatus === 'parsed' ? 'parsed_from_armor_set_benefit_zh' : 'unparsed_armor_set_benefit_zh',
        rawJson: JSON.stringify({
          sourceLine: row.sourceLine,
          rawText: row.rawText,
          ownerKey: row.ownerKey,
          benefitExpression: armorSet.benefitExpression ?? null
        })
      });
    }
  }
  return rows;
}

function isItemScopedArmorMultiplier(row) {
  return row?.ownerKind === 'armor_set'
    && row.statKey === 'damage_bonus'
    && row.operation === 'multiply'
    && /弓|连弩|箭|枪|子弹|玉米糖|特定远程武器|非消耗品远程武器/.test(row.conditionText ?? '');
}

function normalizeLookupText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function parseJsonArrayOrObject(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildArmorAttributeItemIndex(maintItems = []) {
  const index = new Map();
  for (const item of maintItems) {
    const raw = parseJsonArrayOrObject(item.raw_json ?? item.rawJson, {});
    for (const candidate of [
      item.name_zh,
      item.nameZh,
      item.english_name,
      item.englishName,
      item.internal_name,
      item.internalName,
      raw.name,
      raw.nameZh,
      raw.internalName
    ]) {
      const key = normalizeLookupText(candidate);
      if (key && !index.has(key)) {
        index.set(key, item);
      }
    }
  }
  return index;
}

function slotGroupToSlotType(slotGroup) {
  if (slotGroup === 'head') return 'headSlot';
  if (slotGroup === 'body') return 'bodySlot';
  if (slotGroup === 'legs') return 'legSlot';
  return null;
}

function armorCellNumber(value, unit, cellKey) {
  const text = String(value ?? '').trim().replace(/\u2212/g, '-').replace(/\uff05/g, '%');
  if (!text || text === '—' || text === '-') return null;
  const pattern = unit === 'percent' ? /^[+-]?\d+(?:\.\d+)?%$/ : /^[+-]?\d+$/;
  if (!pattern.test(text)) throw new Error(`Armor effect cell ${cellKey} requires an exact ${unit} numeric value`);
  return Number(text.replace(/%$/, ''));
}

const ARMOR_ATTRIBUTE_EFFECT_SPECS = Object.freeze([
  ['meleeDamage', 'damage_bonus', '近战伤害', 'melee'],
  ['rangedDamage', 'damage_bonus', '远程伤害', 'ranged'],
  ['magicDamage', 'damage_bonus', '魔法伤害', 'magic'],
  ['summonDamage', 'damage_bonus', '召唤伤害', 'summon'],
  ['meleeCritChance', 'crit_chance', '近战暴击率', 'melee'],
  ['rangedCritChance', 'crit_chance', '远程暴击率', 'ranged'],
  ['magicCritChance', 'crit_chance', '魔法暴击率', 'magic'],
  ['classSpecific', 'melee_speed', '近战速度', 'melee'],
  ['maxMana', 'mana_max', '最大魔力', 'magic', 'count'],
  ['manaCost', 'mana_cost', '魔力花费', null],
  ['minionSlots', 'minion_capacity', '仆从容量', null, 'count'],
  ['sentrySlots', 'sentry_capacity', '哨兵容量', null, 'count'],
  ['movementSpeed', 'move_speed', '移动速度', null]
]);

function hasSpecializedArmorDamage(rawCells, cellKey, value) {
  // These source notes describe scoped multiplicative bonuses, not generic addends.
  return cellKey === 'rangedDamage' && value != null && value !== 0
    && /额外(?:弓|枪|其他远程)伤害/.test(String(rawCells.otherBonus ?? ''));
}

function hasLegacyShroomiteGenericDamage(armorRow, rawCells, cellKey, rawValue) {
  if (cellKey !== 'rangedDamage') return false;
  const identity = [armorRow.itemInternalName, armorRow.itemPageTitle, armorRow.itemNameZh]
    .filter(Boolean).join(' ');
  return /Shroomite(?:Headgear|Mask|Helmet)|Shroomite/i.test(identity)
    && /^\s*15(?:\.0+)?%\s*$/.test(String(rawValue ?? ''))
    && rawCells.otherBonus == null;
}

const ARMOR_ATTRIBUTE_DIAGNOSTIC_SPECS = [
  ...ARMOR_ATTRIBUTE_EFFECT_SPECS.map(([cellKey, , , , unit = 'percent']) => [cellKey, unit, 'effect']),
  ...['meleeDamageCritChance', 'rangedDamageCritChance', 'magicDamageCritChance']
    .map(cellKey => [cellKey, 'percent', 'summary']),
];

export function collectArmorAttributeCellDiagnostics(relationArmorAttributeRows = []) {
  const diagnostics = [];
  for (const armorRow of relationArmorAttributeRows) {
    const rawCells = parseJsonArrayOrObject(armorRow.rawCellsJson, {});
    for (const [cellKey, unit, cellRole] of ARMOR_ATTRIBUTE_DIAGNOSTIC_SPECS) {
      const rawValue = rawCells[cellKey];
      if (rawValue == null || rawValue === '' || rawValue === '—' || rawValue === '-') continue;
      const identity = {
        recordKey: armorRow.recordKey ?? null,
        itemId: armorRow.itemId == null ? null : Number(armorRow.itemId),
        itemNameZh: armorRow.itemNameZh ?? armorRow.itemPageTitle ?? null,
        cellKey,
        rawValue: String(rawValue),
        unit,
        ...(cellRole === 'summary' ? { cellRole } : {}),
      };
      try {
        const value = armorCellNumber(rawValue, unit, cellKey);
        if (hasSpecializedArmorDamage(rawCells, cellKey, value)) {
          diagnostics.push({ ...identity, reason: 'specialized-damage-semantics-unresolved',
            sourceContext: String(rawCells.otherBonus) });
        }
      } catch {
        diagnostics.push(identity);
      }
    }
  }
  return diagnostics;
}

function deriveEquivalentArmorAttributeRows(rows = [], maintItems = []) {
  const equivalentLookup = buildEquivalentArmorAttributeLookup(maintItems);
  if (!equivalentLookup.size) return rows;

  const existingItemIds = new Set(rows.filter((row) => row.itemId).map((row) => Number(row.itemId)));
  const derivedRows = [];
  for (const row of rows) {
    if (!row.itemId || row.reviewStatus === 'unresolved' || !row.itemInternalName) {
      continue;
    }
    const equivalents = equivalentLookup.get(String(row.itemInternalName)) ?? [];
    for (const item of equivalents) {
      const itemId = Number(item.source_id);
      if (!itemId || existingItemIds.has(itemId)) {
        continue;
      }
      derivedRows.push({
        ...row,
        recordKey: createRecordKey([
          'derived-equivalent-armor-attribute',
          row.recordKey,
          itemId,
          item.internal_name
        ]),
        itemId,
        itemInternalName: item.internal_name ?? null,
        itemNameZh: item.name_zh ?? null,
        itemPageTitle: item.name_zh ?? item.english_name ?? item.internal_name ?? null,
        itemHref: null,
        defenseValue: item.defense_value == null ? row.defenseValue : Number(item.defense_value),
        sourceMaintRecordKey: row.sourceMaintRecordKey,
        confidence: Math.min(Number(row.confidence ?? 1), 0.95),
        reason: 'derived_from_equivalent_armor_attribute_item',
        reviewStatus: 'accepted',
        rawJson: JSON.stringify({
          derivedFromRecordKey: row.recordKey,
          derivedFromItemInternalName: row.itemInternalName,
          equivalentItemInternalName: item.internal_name,
          equivalentArmorAttributeGroupId: item.equivalentArmorAttributeGroupId ?? null,
          evidence: item.equivalentArmorAttributeEvidence ?? 'explicit_equivalent_armor_attribute_rule'
        })
      });
    }
  }
  return [...rows, ...derivedRows];
}

export function buildArmorAttributeEffectRows(relationArmorAttributeRows = [], { unresolvedMode = 'error' } = {}) {
  if (!['error', 'skip'].includes(unresolvedMode)) throw new Error('Armor attribute unresolved mode is invalid');
  const rows = [];
  for (const armorRow of relationArmorAttributeRows) {
    if (!armorRow.itemId || armorRow.reviewStatus === 'unresolved') {
      continue;
    }
    const rawCells = parseJsonArrayOrObject(armorRow.rawCellsJson, {});
    ARMOR_ATTRIBUTE_EFFECT_SPECS.forEach(([cellKey, statKey, statLabelZh, classScope, unit = 'percent'], effectIndex) => {
      if (hasLegacyShroomiteGenericDamage(armorRow, rawCells, cellKey, rawCells[cellKey])) {
        throw new Error('Armor legacy Shroomite generic 15% damage row is not current source authority');
      }
      let value;
      try {
        value = armorCellNumber(rawCells[cellKey], unit, cellKey);
      } catch (error) {
        if (unresolvedMode === 'skip') return;
        throw error;
      }
      if (value == null || value === 0) {
        return;
      }
      if (hasSpecializedArmorDamage(rawCells, cellKey, value)) {
        if (unresolvedMode === 'skip') return;
        throw new Error('Armor effect cell rangedDamage has unresolved specialized damage semantics');
      }
      rows.push({
        recordKey: createRecordKey([
          'armor-attribute-effect',
          armorRow.recordKey,
          armorRow.itemId,
          cellKey,
          statKey,
          classScope,
          value
        ]),
        ownerKind: 'item',
        ownerRecordKey: armorRow.recordKey,
        ownerId: Number(armorRow.itemId),
        ownerKey: armorRow.itemInternalName,
        sourceKind: 'armor_attribute_cell',
        sourceLocale: 'zh',
        sourceLineIndex: 0,
        sourceLine: `${armorRow.itemNameZh ?? armorRow.itemPageTitle ?? armorRow.itemInternalName} ${cellKey}: ${rawCells[cellKey]}`,
        effectIndex,
        applyScope: 'item_bonus',
        variantLabel: armorRow.itemNameZh ?? armorRow.itemPageTitle ?? null,
        itemInternalName: armorRow.itemInternalName,
        slotType: slotGroupToSlotType(armorRow.slotGroup),
        statKey,
        statLabelZh,
        classScope,
        operation: 'add',
        valueDecimal: value,
        valueMaxDecimal: null,
        unit,
        conditionText: null,
        rawText: String(rawCells[cellKey]),
        parseStatus: 'parsed',
        sourceMaintTable: armorRow.sourceMaintTable,
        sourceMaintRecordKey: armorRow.sourceMaintRecordKey,
        sourceMaintId: armorRow.sourceMaintId,
        landingSourceId: armorRow.landingSourceId,
        landingSourceKey: armorRow.landingSourceKey,
        landingContentHash: armorRow.landingContentHash,
        sourceProvider: armorRow.sourceProvider,
        sourcePage: armorRow.sourcePage,
        sourceRevisionTimestamp: armorRow.sourceRevisionTimestamp,
        confidence: 1,
        reviewStatus: 'accepted',
        reason: 'parsed_from_armor_attribute_cell',
        rawJson: JSON.stringify({ cellKey, cellValue: rawCells[cellKey], armorAttributeRecordKey: armorRow.recordKey })
      });
    });
  }
  return rows;
}

export function buildArmorAttributeRelations({ maintArmorAttributeRows = [], maintItems = [], relationArmorSetItems = [] } = {}) {
  for (const row of maintArmorAttributeRows) {
    if (isArmorItemEffectMaintRow(row)) {
      throw new Error('Armor item-effect source requires its dedicated source contract');
    }
  }
  const itemIndex = buildArmorAttributeItemIndex(maintItems);
  const exactPartRoles = new Map();
  for (const part of relationArmorSetItems) {
    const itemId = Number(part.item_source_id ?? part.itemSourceId);
    const role = String(part.part_role ?? part.partRole ?? '').trim();
    if (!Number.isSafeInteger(itemId) || itemId <= 0 || !['head', 'body', 'legs'].includes(role)) continue;
    const roles = exactPartRoles.get(itemId) ?? new Set();
    roles.add(role);
    exactPartRoles.set(itemId, roles);
  }
  const rows = maintArmorAttributeRows.map((row) => {
    const item = itemIndex.get(normalizeLookupText(row.item_name_zh))
      ?? itemIndex.get(normalizeLookupText(row.item_page_title))
      ?? null;
    const resolved = item != null;
    const itemId = resolved ? Number(item.source_id) : null;
    const roles = itemId == null ? null : exactPartRoles.get(itemId);
    const reconciledSlotGroup = roles?.size === 1 ? [...roles][0] : null;
    const slotGroup = reconciledSlotGroup ?? row.slot_group ?? null;
    return {
      recordKey: row.record_key,
      itemId,
      itemInternalName: resolved ? (item.internal_name ?? null) : null,
      itemNameZh: row.item_name_zh ?? null,
      itemPageTitle: row.item_page_title ?? null,
      itemHref: row.item_href ?? null,
      sectionCode: row.section_code ?? null,
      slotGroup,
      defenseValue: resolved && item.defense_value != null ? Number(item.defense_value) : (row.defense_value == null ? null : Number(row.defense_value)),
      rawCellsJson: row.raw_cells_json ?? null,
      sourceMaintTable: 'maint_armor_attribute_rows',
      sourceMaintRecordKey: row.record_key ?? null,
      sourceMaintId: row.id ?? null,
      landingSourceId: row.landing_source_id ?? null,
      landingSourceKey: row.landing_source_key ?? null,
      landingContentHash: row.landing_content_hash ?? null,
      sourceProvider: row.source_provider ?? null,
      sourcePage: row.source_page ?? null,
      sourceRevisionTimestamp: row.source_revision_timestamp ?? null,
      confidence: resolved ? 1 : 0,
      reason: !resolved
        ? 'unresolved_maint_item_by_wiki_identity'
        : reconciledSlotGroup && reconciledSlotGroup !== row.slot_group
          ? 'reconciled_slot_group_from_relation_armor_set_item'
          : 'matched_maint_item_by_wiki_identity',
      reviewStatus: resolved ? 'accepted' : 'unresolved',
      rawJson: row.raw_json ?? JSON.stringify(row)
    };
  });
  return deriveEquivalentArmorAttributeRows(rows, maintItems);
}

/** Typed sources are item effects, never substitutes for complete table-derived attributes. */
export function buildArmorAttributeDispatch({
  maintArmorAttributeRows = [], maintItems = [], relationArmorSetItems = [], maintLandings = [],
} = {}) {
  const typed = maintArmorAttributeRows.filter(isArmorItemEffectMaintRow);
  const groups = readArmorItemEffectMaintSources({ maintArmorAttributeRows: typed, maintItems, maintLandings });
  const relationArmorAttributeRows = buildArmorAttributeRelations({
    maintArmorAttributeRows: maintArmorAttributeRows.filter(row => !isArmorItemEffectMaintRow(row)),
    maintItems, relationArmorSetItems,
  });
  const typedEffects = groups.flatMap(group => group.sourceCandidate.effects.map((effect, i) => {
    const maint = group.maintRows[i];
    return { ...effect, ownerRecordKey: maint.record_key, sourceMaintTable: 'maint_armor_attribute_rows',
      sourceMaintRecordKey: maint.record_key, sourceMaintId: maint.id,
      landingSourceId: group.landing.id, landingSourceKey: group.landing.source_key,
      landingContentHash: group.landing.content_hash, reviewStatus: 'accepted', reason: 'derived_from_versioned_item_source' };
  }));
  return { relationArmorAttributeRows,
    relationEquipmentEffectAttributes: [...buildArmorAttributeEffectRows(relationArmorAttributeRows), ...typedEffects],
    typedSourceCount: typed.length,
    acceptance: { status: typed.length ? 'blocked' : 'not-applicable', blockers: typed.length ? [
      { code: 'registered-typed-effect-downstream-publication-required' },
      { code: 'complete-item-and-set-coverage-unverified' },
    ] : [] },
  };
}

export async function runSync(options, dependencies = {}) {
  if (options?.itemOnly === true) {
    return runItemOnlySync(options, dependencies);
  }
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const managedImageUrlPrefixes = normalizeManagedImageUrlPrefixes(
    dependencies.managedImageUrlPrefixes ?? resolveManagedImageUrlPrefixes()
  );
  const canonicalBuffManagedUrlPrefixes = resolveBuffManagedUrlPrefixes(managedImageUrlPrefixes);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root'
  };

  const queryMaint = dependencies.queryMaint ?? ((sql) => loadDataset(mysqlOptions, options.maintDatabase, sql));
  const queryRelation = dependencies.queryRelation ?? ((sql) => loadDataset(mysqlOptions, options.relationDatabase, sql));
  const writeReports = dependencies.writeReports ?? ((payload) => writeRelationReports(payload));
  const loadInheritanceRules = dependencies.loadInheritanceRules ?? (() => readInheritanceRules());
  const loadReviewedNonNpcSourceExclusions = dependencies.loadReviewedNonNpcSourceExclusions ?? (() => readReviewedNonNpcSourceExclusions());
  const loadReviewedSourceOnlyItemExclusions = dependencies.loadReviewedSourceOnlyItemExclusions ?? (() => readReviewedSourceOnlyItemExclusions());
  const executeRelation = dependencies.executeRelation ?? (async (fn) => {
    const mysql = loadMysqlModule();
    const connection = await mysql.createConnection({ ...mysqlOptions, database: options.relationDatabase });
    try {
      return await fn(connection);
    } finally {
      await connection.end();
    }
  });

  const [
    categoryRows,
    itemCategoryRows,
    itemRecipes,
    itemPageRecipes,
    recipePageRecipes,
    baseItemSourceRows,
    itemBiomeRows,
    baseMaintBuffRows,
    maintBossRows,
    maintNpcImageRows,
    maintItems,
    maintProjectiles,
    localProjectiles,
    maintNpcs,
    localBossGroupRows,
    localBossLootRows,
    localBuffRows,
    itemImageRows,
    maintItemPages,
    maintItemNumericOverrides,
    maintItemRarityOverrides
    ,
    maintItemTextOverrides,
    maintArmorSets,
    maintArmorSetImages,
    maintArmorAttributeRows,
    existingRelationArmorSetImages,
    maintItemGroupRows,
    maintItemGroupMemberRows,
    inheritanceRules,
    reviewedNonNpcSourceExclusions,
    reviewedSourceOnlyItemExclusions,
    maintNpcCrawlerFactRows
  ] = await Promise.all([
    queryMaint('SELECT * FROM maint_categories'),
    queryMaint('SELECT * FROM maint_item_categories'),
    queryMaint('SELECT * FROM maint_item_recipes'),
    queryMaint('SELECT * FROM maint_item_page_recipes'),
    queryMaint('SELECT * FROM maint_recipe_page_recipes'),
    queryMaint('SELECT * FROM maint_item_sources WHERE status = 1 AND deleted = 0'),
    queryMaint('SELECT * FROM maint_item_biomes'),
    queryMaint('SELECT * FROM maint_buffs'),
    queryMaint('SELECT * FROM maint_bosses'),
    queryMaint('SELECT * FROM maint_npc_images WHERE deleted = 0'),
    queryMaint('SELECT * FROM maint_items'),
    queryMaint('SELECT * FROM maint_projectiles'),
    options.localDatabase ? loadDataset(mysqlOptions, options.localDatabase, 'SELECT internal_name, image_url FROM projectiles WHERE deleted = 0') : [],
    queryMaint('SELECT * FROM maint_npcs'),
    options.localDatabase ? loadDataset(mysqlOptions, options.localDatabase, 'SELECT code, image_url FROM boss_groups WHERE deleted = 0') : [],
    options.localDatabase ? loadDataset(mysqlOptions, options.localDatabase, `
      SELECT
        n.internal_name AS npc_internal_name,
        i.internal_name AS item_internal_name,
        nle.quantity_text,
        nle.chance_text
      FROM npc_loot_entries nle
      INNER JOIN npcs n ON n.id = nle.npc_id AND n.deleted = 0 AND n.status = 1
      INNER JOIN items i ON i.id = nle.item_id AND i.deleted = 0 AND i.status = 1
      WHERE nle.deleted = 0 AND nle.status = 1
    `) : [],
    options.localDatabase ? loadDataset(mysqlOptions, options.localDatabase, 'SELECT internal_name, image, image_cached_url FROM buffs WHERE deleted = 0') : [],
    queryMaint('SELECT * FROM maint_item_images'),
    queryMaint('SELECT item_internal_name, sell_text, sell_value, source_revision_timestamp, updated_at FROM maint_item_pages'),
    queryMaint('SELECT item_internal_name, damage_value, defense_value, knockback_value, use_time, buy_value, sell_value FROM maint_item_numeric_overrides WHERE deleted = 0'),
    queryMaint('SELECT item_internal_name, rarity_id FROM maint_item_rarity_overrides WHERE deleted = 0'),
    queryMaint('SELECT item_internal_name, tooltip_zh, description_zh FROM maint_item_text_overrides WHERE deleted = 0'),
    queryMaint('SELECT * FROM maint_armor_sets WHERE deleted = 0'),
    queryMaintOptional(queryMaint, 'SELECT * FROM maint_armor_set_images WHERE deleted = 0', []),
    queryMaintOptional(queryMaint, 'SELECT * FROM maint_armor_attribute_rows WHERE deleted = 0', []),
    queryRelationOptional(queryRelation, 'SELECT * FROM relation_armor_set_images WHERE deleted = 0', []),
    queryMaintOptional(queryMaint, "SELECT * FROM maint_item_groups WHERE deleted = 0 AND status = 'ACTIVE'", []),
    queryMaintOptional(queryMaint, 'SELECT * FROM maint_item_group_members WHERE deleted = 0', []),
    loadInheritanceRules(),
    loadReviewedNonNpcSourceExclusions(),
    loadReviewedSourceOnlyItemExclusions()
    ,
    queryMaintOptional(queryMaint, "SELECT * FROM maint_npc_crawler_facts WHERE match_status = 'MATCHED' AND status = 1 AND deleted = 0", [])
  ]);
  validateInheritanceRules(inheritanceRules);
  validateReviewedNonNpcSourceExclusions(reviewedNonNpcSourceExclusions);
  validateReviewedSourceOnlyItemExclusions(reviewedSourceOnlyItemExclusions);

  const typedArmorRows = maintArmorAttributeRows.filter(isArmorItemEffectMaintRow);
  if (typedArmorRows.length && options.apply) throw new Error('Armor typed effects require governed downstream publication');
  const typedLandingIds = [...new Set(typedArmorRows.map(row => row.landing_source_id))];
  if (typedLandingIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Armor typed landing ID is invalid');
  const maintItemEffectLandings = typedLandingIds.length ? await queryMaint(
    "SELECT * FROM source_dataset_landings WHERE provider = 'terraria.wiki.gg' AND dataset_type = 'armor_item_effects_raw' "
      + `AND id IN (${typedLandingIds.join(',')}) ORDER BY id`,
  ) : [];

  const wikiArmorSets = readWikiArmorSets(options.wikiArmorSetsInput);
  const armorSetDefinitionMap = readArmorSetDefinitionMap();
  const npcCrawlerInputs = buildNpcCrawlerFactRelationInputs({
    maintNpcCrawlerFactRows,
    maintBuffRows: baseMaintBuffRows,
  });
  const itemSourceRows = [...baseItemSourceRows, ...npcCrawlerInputs.itemSourceRows];
  const maintBuffRows = npcCrawlerInputs.maintBuffRows;
  const itemIndex = buildItemIndex(maintItems);
  const itemSourceLookupIndex = buildItemSourceLookupIndex(maintItems);
  const npcIndex = buildNpcIndex(maintNpcs);
  const baseEntities = buildBaseEntityRelations({
    maintItems,
    maintItemNumericOverrides,
    maintItemPages,
    maintNpcs,
    maintProjectiles
  });
  const buffEntities = buildBuffEntityRelations({
    maintBuffs: maintBuffRows
  });
  const imageEntities = buildImageRelations({
    maintItemImages: itemImageRows,
    maintNpcImages: maintNpcImageRows,
    maintProjectiles,
    maintBuffs: maintBuffRows,
    localProjectiles,
    localBuffs: localBuffRows,
    canonicalBuffUrlMatcher: (value) => isManagedImagePath(value, canonicalBuffManagedUrlPrefixes)
  });
  const relationItemRarities = buildRelationItemRarities();

  const category = buildCategoryRelations({ categoryRows, itemCategoryRows });
  const recipe = buildRecipeRelations({ itemRecipes, itemPageRecipes, recipePageRecipes, itemIndex });
  const canonicalRecipeGroups = buildCanonicalRecipeGroups({
    groupRows: maintItemGroupRows,
    memberRows: maintItemGroupMemberRows,
  });
  const recipeExpansions = buildRecipeGroupExpansions({
    recipeIngredients: recipe.recipeIngredients,
    canonicalGroups: canonicalRecipeGroups,
  });
  const itemSource = buildItemSourceRelations({
    itemSourceRows,
    npcIndex,
    itemIndex: itemSourceLookupIndex,
    inheritanceRules,
    reviewedNonNpcSourceExclusions,
    reviewedSourceOnlyItemExclusions,
  });
  let secondary = buildSecondaryRelations({
    itemBiomeRows,
    maintBuffRows,
    maintProjectileRows: maintProjectiles,
    maintItemRows: maintItems,
    maintNpcRows: maintNpcs,
    itemImageRows
  });
  if (options.buffSourceNpcRelationMode === 'source-bound') {
    if (!buildRelationApplyPlan(options.scopes).buffOnly) {
      throw new Error('source-bound Buff NPC relations require the Buff-only apply scope');
    }
    secondary = {
      ...secondary,
      npcBuffRelations: buildBuffSourceNpcRelations({ maintBuffRows, maintNpcRows: maintNpcs }),
    };
  }
  const bossSeries = buildBossSeriesRelations({
    maintBossRows,
    localBossGroupRows,
    relationNpcRows: baseEntities.relationNpcs,
    itemNpcLootRelations: itemSource.npcLootRelations,
    bossLootRows: localBossLootRows
  });
  const npcSeries = buildNpcSeriesRelations({
    relationNpcRows: baseEntities.relationNpcs,
    itemNpcShopRelations: itemSource.npcShopRelations,
    itemNpcLootRelations: itemSource.npcLootRelations
  });
  const armorSet = buildArmorSetRelations({
    wikiArmorSets,
    maintArmorSets,
    armorSetDefinitionMap,
    maintItems,
    maintArmorSetImages,
    existingRelationArmorSetImages,
    managedImageUrlPrefixes
  });

  const results = flattenResults(category, recipe, itemSource, secondary, bossSeries, npcSeries, armorSet);
  const armorAttributes = buildArmorAttributeDispatch({
    maintArmorAttributeRows,
    maintItems,
    maintLandings: maintItemEffectLandings,
    relationArmorSetItems: results.relationArmorSetItems
  });
  results.relationArmorAttributeRows = armorAttributes.relationArmorAttributeRows;
  results.relationItems = baseEntities.relationItems;
  results.relationNpcs = baseEntities.relationNpcs;
  results.relationProjectiles = baseEntities.relationProjectiles;
  results.relationBuffs = buffEntities.relationBuffs;
  results.relationBosses = bossSeries.relationBosses;
  results.relationItemRarities = relationItemRarities;
  results.relationItemImages = imageEntities.relationItemImages;
  results.relationNpcImages = imageEntities.relationNpcImages;
  results.relationProjectileImages = imageEntities.relationProjectileImages;
  results.relationBuffImages = imageEntities.relationBuffImages;
  results.itemRecipeGroupExpansions = recipeExpansions.groupExpansions;
  results.relationEquipmentEffectAttributes = [
    ...buildArmorSetEquipmentEffectAttributes(results.relationArmorSets),
    ...armorAttributes.relationEquipmentEffectAttributes
  ];
  const projection = buildProjectionPayload({
    relationItems: results.relationItems,
    relationItemImages: results.relationItemImages,
    relationItemRarities: results.relationItemRarities,
    itemNumericOverrides: maintItemNumericOverrides.map((row) => ({
      itemInternalName: row.item_internal_name,
      damageValue: row.damage_value,
      defenseValue: row.defense_value,
      knockbackValue: row.knockback_value,
      useTime: row.use_time,
      buyValue: row.buy_value,
      sellValue: row.sell_value,
    })),
    itemRarityOverrides: maintItemRarityOverrides.map((row) => ({
      itemInternalName: row.item_internal_name,
      rarityId: row.rarity_id,
    })),
    itemTextOverrides: maintItemTextOverrides.map((row) => ({
      itemInternalName: row.item_internal_name,
      tooltipZh: row.tooltip_zh,
      descriptionZh: row.description_zh,
    })),
    relationNpcs: results.relationNpcs,
    relationNpcImages: results.relationNpcImages,
    relationProjectiles: results.relationProjectiles,
    relationProjectileImages: results.relationProjectileImages,
    itemNpcShopRelations: results.itemNpcShopRelations,
    itemNpcLootRelations: results.itemNpcLootRelations,
    itemProjectileRelations: results.itemProjectileRelations,
    npcProjectileRelations: results.npcProjectileRelations,
    itemBuffRelations: results.itemBuffRelations,
    npcBuffRelations: results.npcBuffRelations,
    relationBosses: results.relationBosses,
    bossItemRewardRelations: results.bossItemRewardRelations,
    bossEffectRelations: results.bossEffectRelations,
    relationBuffs: results.relationBuffs,
    relationBuffImages: results.relationBuffImages,
    relationArmorSets: results.relationArmorSets,
    relationArmorSetItems: results.relationArmorSetItems,
    relationArmorSetImages: results.relationArmorSetImages,
    relationArmorAttributeRows: results.relationArmorAttributeRows,
    relationEquipmentEffectAttributes: results.relationEquipmentEffectAttributes,
    managedImageUrlPrefixes
  });
  results.projectionItems = projection.projectionItems;
  results.projectionNpcs = projection.projectionNpcs;
  results.projectionBosses = projection.projectionBosses;
  results.projectionProjectiles = projection.projectionProjectiles;
  results.projectionBuffs = projection.projectionBuffs;
  results.projectionArmorSets = projection.projectionArmorSets;
  results.projectionItemArmorAttributes = projection.projectionItemArmorAttributes;
  results.projectionEquipmentEffectAttributes = projection.projectionEquipmentEffectAttributes;
  const armorSetProjectionConsistencyIssues = validateProjectionArmorSetConsistency(results.projectionArmorSets);
  const runKey = createRecordKey({
    dateTag: toDateTag(),
    scopes: options.scopes,
    apply: options.apply
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    apply: options.apply,
    armorItemEffectSourceAcceptance: armorAttributes.acceptance,
    maintArmorSetImages: maintArmorSetImages.length,
    relationArmorSetImages: results.relationArmorSetImages.length,
    projectionArmorSets: results.projectionArmorSets.length,
    domainSummary: {
      base: results.relationItems.length
        + results.relationNpcs.length
        + results.relationProjectiles.length
        + results.relationBuffs.length,
      image: results.relationItemImages.length
        + results.relationNpcImages.length
        + results.relationProjectileImages.length
        + results.relationBuffImages.length,
      category: results.categoryNodes.length + results.itemCategoryAssignments.length,
      recipe: results.itemRecipeHeads.length + results.itemRecipeIngredients.length + results.itemRecipeStations.length,
      npc: results.itemSourceFacts.length
        + results.itemSourceDetails.length
        + results.itemNpcShopRelations.length
        + results.itemNpcLootRelations.length
        + results.itemNpcRelationAudits.length,
      buff: results.itemBuffRelations.length,
      npcBuff: results.npcBuffRelations.length,
      biome: results.itemBiomeRelations.length,
      projectile: results.itemProjectileRelations.length
        + results.npcProjectileRelations.length
        + results.itemProjectileAudits.length
        + results.npcProjectileAudits.length,
      boss: results.relationBosses.length + results.bossItemRewardRelations.length + results.bossEffectRelations.length,
      npcSeries: results.npcSeriesNodes.length + results.npcSeriesMemberships.length + results.npcSeriesItemRelations.length,
      armorSet: results.relationArmorSets.length + results.relationArmorSetItems.length + results.relationArmorSetImages.length,
      armorAttribute: results.relationArmorAttributeRows.length,
      equipmentEffect: results.relationEquipmentEffectAttributes.length
    },
    entityBreakdown: {
      item: results.relationItems.length,
      npc: results.relationNpcs.length,
      projectile: results.relationProjectiles.length,
      buff: results.relationBuffs.length,
      armorSet: results.relationArmorSets.length
    },
    imageBreakdown: {
      item: results.relationItemImages.length,
      npc: results.relationNpcImages.length,
      projectile: results.relationProjectileImages.length,
      buff: results.relationBuffImages.length,
      armorSet: results.relationArmorSetImages.length
    },
    bridgeBreakdown: {
      itemTextOverrideRows: maintItemTextOverrides.length,
      localItemImageFallbackEnabled: Boolean(options.allowLocalItemImageFallback && options.localDatabase),
      maintItemImageFillRows: 0,
      localArmorSetRelatedItemImageFallbackRows: 0,
    },
    gateBreakdown: {
      armorSetProjectionConsistencyIssues: armorSetProjectionConsistencyIssues.length,
    },
    unresolvedSamples: results.issues.slice(0, 20)
  };

  const applyStartedAt = new Date();

  if (options.apply) {
    if (managedImageUrlPrefixes.length === 0) {
      throw new Error(
        'Refusing relation apply with empty managed image URL prefixes. Check platform/local/config/local-stack.config.json or TERRAPEDIA_MANAGED_IMAGE_URL_PREFIXES before writing relation/projection image fields.'
      );
    }
    if (armorSetProjectionConsistencyIssues.length > 0) {
      const error = new Error(`Armor set projection consistency gate failed with ${armorSetProjectionConsistencyIssues.length} issue(s).`);
      error.validationIssues = armorSetProjectionConsistencyIssues;
      throw error;
    }
    if (options.createDatabase) {
      const mysql = loadMysqlModule();
      const adminConnection = await mysql.createConnection(mysqlOptions);
      try {
        for (const statement of buildRelationSchemaStatements(options.relationDatabase)) {
          await adminConnection.query(statement);
        }
        for (const statement of buildProjectionSchemaStatements(options.relationDatabase)) {
          await adminConnection.query(statement);
        }
        await ensureRelationMigrations(adminConnection, options.relationDatabase);
        await dropDeprecatedRelationTables(adminConnection, options.relationDatabase);
      } finally {
        await adminConnection.end();
      }
    } else {
      await executeRelation(async (connection) => {
        for (const statement of buildRelationSchemaStatements(options.relationDatabase).slice(1)) {
          await connection.query(statement);
        }
        for (const statement of buildProjectionSchemaStatements(options.relationDatabase)) {
          await connection.query(statement);
        }
        await ensureRelationMigrations(connection, options.relationDatabase);
        await dropDeprecatedRelationTables(connection, options.relationDatabase);
      });
    }

    await executeRelation(async (connection) => {
      await insertRun(connection, {
        runKey,
        applyMode: 1,
        maintDatabase: options.maintDatabase,
        localDatabase: options.localDatabase,
        relationDatabase: options.relationDatabase,
        scopes: options.scopes,
        summaryJson: summary,
        startedAt: applyStartedAt,
        finishedAt: null,
        status: 'running'
      });

      const applyPlan = buildRelationApplyPlan(options.scopes);
      if (applyPlan.buffOnly || applyPlan.armorOnly) {
        await clearRelationSnapshotTables(connection, applyPlan.clearTables);
        for (const [tableName, resultKey] of applyPlan.writeEntries) {
          await upsertRows(connection, tableName, results[resultKey]);
        }
      } else {
        await clearRelationSnapshotTables(connection, [
        'item_recipe_group_expansions',
        'item_recipe_ingredients',
        'item_recipe_stations',
        'item_recipe_heads',
        'item_category_assignments',
        'category_nodes',
        'item_npc_shop_relations',
        'item_npc_loot_relations',
        'item_npc_relation_audits',
        'item_source_details',
        'item_source_facts',
        'item_buff_relations',
        'npc_buff_relations',
        'item_biome_relations',
        'item_projectile_relations',
        'npc_projectile_relations',
        'item_projectile_audits',
        'npc_projectile_audits',
        'boss_item_reward_relations',
        'boss_effect_relations',
        'npc_series_item_relations',
        'npc_series_memberships',
        'npc_series_nodes',
        'relation_armor_set_images',
        'relation_equipment_effect_attributes',
        'relation_armor_attribute_rows',
        'relation_armor_set_items',
        'relation_armor_sets',
        'relation_item_rarities',
        'relation_item_images',
        'relation_npc_images',
        'relation_projectile_images',
        'relation_buff_images',
        'relation_bosses',
        'projection_items',
        'projection_npcs',
        'projection_bosses',
        'projection_projectiles',
        'projection_buffs',
        'projection_armor_sets',
        'projection_item_armor_attributes',
        'projection_equipment_effect_attributes',
        'relation_items',
        'relation_npcs',
        'relation_projectiles',
        'relation_buffs'
      ]);

        await upsertRows(connection, 'relation_items', results.relationItems);
      await upsertRows(connection, 'relation_npcs', results.relationNpcs);
      await upsertRows(connection, 'relation_projectiles', results.relationProjectiles);
      await upsertRows(connection, 'relation_buffs', results.relationBuffs);
      await upsertRows(connection, 'relation_bosses', results.relationBosses);
      await upsertRows(connection, 'relation_armor_sets', results.relationArmorSets);
      await upsertRows(connection, 'relation_armor_set_items', results.relationArmorSetItems);
      await upsertRows(connection, 'relation_armor_attribute_rows', results.relationArmorAttributeRows);
      await upsertRows(connection, 'relation_equipment_effect_attributes', results.relationEquipmentEffectAttributes);
      await upsertRows(connection, 'relation_item_rarities', results.relationItemRarities);
      await upsertRows(connection, 'relation_item_images', results.relationItemImages);
      await upsertRows(connection, 'relation_npc_images', results.relationNpcImages);
      await upsertRows(connection, 'relation_projectile_images', results.relationProjectileImages);
      await upsertRows(connection, 'relation_buff_images', results.relationBuffImages);
      await upsertRows(connection, 'relation_armor_set_images', results.relationArmorSetImages);
      await upsertRows(connection, 'category_nodes', results.categoryNodes);
      await upsertRows(connection, 'item_category_assignments', results.itemCategoryAssignments);
      await upsertRows(connection, 'item_recipe_heads', results.itemRecipeHeads);
      await upsertRows(connection, 'item_recipe_ingredients', results.itemRecipeIngredients);
      await upsertRows(connection, 'item_recipe_stations', results.itemRecipeStations);
      await upsertRows(connection, 'item_recipe_group_expansions', results.itemRecipeGroupExpansions);
      await upsertRows(connection, 'item_source_facts', results.itemSourceFacts);
      await upsertRows(connection, 'item_source_details', results.itemSourceDetails);
      await upsertRows(connection, 'item_npc_shop_relations', results.itemNpcShopRelations);
      await upsertRows(connection, 'item_npc_loot_relations', results.itemNpcLootRelations);
      await upsertRows(connection, 'item_npc_relation_audits', results.itemNpcRelationAudits);
      await upsertRows(connection, 'item_buff_relations', results.itemBuffRelations);
      await upsertRows(connection, 'npc_buff_relations', results.npcBuffRelations);
      await upsertRows(connection, 'item_biome_relations', results.itemBiomeRelations);
      await upsertRows(connection, 'item_projectile_relations', results.itemProjectileRelations);
      await upsertRows(connection, 'npc_projectile_relations', results.npcProjectileRelations);
      await upsertRows(connection, 'item_projectile_audits', results.itemProjectileAudits);
      await upsertRows(connection, 'npc_projectile_audits', results.npcProjectileAudits);
      await upsertRows(connection, 'boss_item_reward_relations', results.bossItemRewardRelations);
      await upsertRows(connection, 'boss_effect_relations', results.bossEffectRelations);
      await upsertRows(connection, 'npc_series_nodes', results.npcSeriesNodes);
      await upsertRows(connection, 'npc_series_memberships', results.npcSeriesMemberships);
      await upsertRows(connection, 'npc_series_item_relations', results.npcSeriesItemRelations);
      await upsertRows(connection, 'projection_items', results.projectionItems);
      await upsertRows(connection, 'projection_npcs', results.projectionNpcs);
      await upsertRows(connection, 'projection_bosses', results.projectionBosses);
      await upsertRows(connection, 'projection_projectiles', results.projectionProjectiles);
      await upsertRows(connection, 'projection_buffs', results.projectionBuffs);
      await upsertRows(connection, 'projection_armor_sets', results.projectionArmorSets);
      await upsertRows(connection, 'projection_item_armor_attributes', results.projectionItemArmorAttributes);
      await upsertRows(connection, 'projection_equipment_effect_attributes', results.projectionEquipmentEffectAttributes);
      await reconcileItemStackSizeFromMaint(connection, options.maintDatabase);
      summary.bridgeBreakdown.maintItemImageFillRows = await reconcileProjectionItemImageFromMaint(
        connection,
        options.maintDatabase,
        managedImageUrlPrefixes
      );
        summary.bridgeBreakdown.localArmorSetRelatedItemImageFallbackRows =
        await reconcileProjectionArmorSetRelatedItemImagesFromLocal(
          connection,
          options.localDatabase,
          options.allowLocalItemImageFallback,
          managedImageUrlPrefixes
        );
      }
    });
  }

  const reportPaths = await writeReports({
    repoRoot,
    dateTag: toDateTag(),
    summary,
    issues: results.issues,
    conflicts: []
  });

  if (options.apply) {
    await executeRelation(async (connection) => {
      await insertReportRows(connection, runKey, reportPaths);
      await insertRun(connection, {
        runKey,
        applyMode: 1,
        maintDatabase: options.maintDatabase,
        localDatabase: options.localDatabase,
        relationDatabase: options.relationDatabase,
        scopes: options.scopes,
        summaryJson: summary,
        startedAt: applyStartedAt,
        finishedAt: new Date(),
        status: 'succeeded'
      });
    });
  }

  return {
    runKey,
    apply: options.apply,
    maintDatabase: options.maintDatabase,
    localDatabase: options.localDatabase,
    relationDatabase: options.relationDatabase,
    results,
    summary,
    reportPaths
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  const result = await runSync(options);
  console.log(`Apply: ${result.apply}`);
  console.log(`Maint database: ${result.maintDatabase}`);
  console.log(`Relation database: ${result.relationDatabase}`);
  console.log(`Reports: ${result.reportPaths.auditJsonPath}`);
  console.log(`Relation writes: ${result.apply ? 'performed' : 0}`);
}
