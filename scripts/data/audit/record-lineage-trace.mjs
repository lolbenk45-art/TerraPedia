#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';
import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');

const DEFAULTS = {
  entity: 'item',
  landingDatabase: 'terria_v1_maint',
  maintDatabase: 'terria_v1_maint',
  relationDatabase: 'terria_v1_relation',
  localDatabase: 'terria_v1_local',
};

export function parseArgs(argv = process.argv.slice(2)) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }

  return {
    entity: normalizeEntity(raw.entity ?? DEFAULTS.entity),
    id: toNullableNumber(raw.id),
    sourceId: toNullableNumber(raw['source-id'] ?? raw.sourceId),
    internalName: normalizeText(raw['internal-name'] ?? raw.internalName),
    recordKey: normalizeText(raw['record-key'] ?? raw.recordKey),
    landingDatabase: raw['landing-database'] ?? raw.landingDatabase ?? DEFAULTS.landingDatabase,
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? DEFAULTS.maintDatabase,
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? DEFAULTS.localDatabase,
  };
}

export function buildRecordLineageTracePlan(options = {}) {
  const normalized = {
    ...DEFAULTS,
    ...options,
    entity: normalizeEntity(options.entity ?? DEFAULTS.entity),
  };
  return normalized.entity === 'npc'
    ? buildNpcPlan(normalized)
    : buildItemPlan(normalized);
}

export async function runRecordLineageTrace(options = {}, dependencies = {}) {
  const normalized = {
    ...DEFAULTS,
    ...options,
    entity: normalizeEntity(options.entity ?? DEFAULTS.entity),
  };
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
  };
  const createConnection = dependencies.createConnection ?? mysql.createConnection;
  const connection = await createConnection(mysqlOptions);

  try {
    const plan = buildRecordLineageTracePlan(normalized);
    const stages = [];
    for (const step of plan.steps) {
      const [rows] = await connection.query(step.sql, step.params ?? []);
      stages.push({
        stageId: step.stageId,
        title: step.title,
        rows,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      entity: normalized.entity,
      lookup: {
        id: normalized.id ?? null,
        sourceId: normalized.sourceId ?? null,
        internalName: normalized.internalName ?? null,
        recordKey: normalized.recordKey ?? null,
      },
      databases: {
        landingDatabase: normalized.landingDatabase,
        maintDatabase: normalized.maintDatabase,
        relationDatabase: normalized.relationDatabase,
        localDatabase: normalized.localDatabase,
      },
      stages,
    };
  } finally {
    await connection.end();
  }
}

function buildItemPlan(options) {
  const localItems = table(options.localDatabase, 'items');
  const projectionItems = table(options.relationDatabase, 'projection_items');
  const relationFacts = table(options.relationDatabase, 'item_source_facts');
  const maintItems = table(options.maintDatabase, 'maint_items');
  const maintSources = table(options.maintDatabase, 'maint_item_sources');
  const localItemSources = table(options.localDatabase, 'item_acquisition_sources');
  const landing = table(options.landingDatabase, 'source_dataset_landings');

  return {
    steps: [
      {
        stageId: 'local.item',
        title: 'Local item record',
        sql: `SELECT id, source_id AS sourceId, internal_name AS internalName, name, name_zh AS nameZh, image
FROM ${localItems}
WHERE deleted = 0 AND ${entityWhereClause('items', options)}`,
        params: entityParams(options),
      },
      {
        stageId: 'relation.projection_item',
        title: 'Relation projection item',
        sql: `SELECT *
FROM ${projectionItems}
WHERE ${projectionEntityWhereClause('item', options)}`,
        params: projectionEntityParams('item', options),
      },
      {
        stageId: 'relation.item_source_facts',
        title: 'Relation item source facts',
        sql: `SELECT *
FROM ${relationFacts}
WHERE ${itemSourceFactWhereClause(options)}`,
        params: itemSourceFactParams(options),
      },
      {
        stageId: 'maint.items',
        title: 'Maint item records',
        sql: `SELECT *
FROM ${maintItems}
WHERE ${maintEntityWhereClause('item', options)}`,
        params: maintEntityParams(options),
      },
      {
        stageId: 'maint.item_sources',
        title: 'Maint item source records',
        sql: `SELECT *
FROM ${maintSources}
WHERE ${maintItemSourceWhereClause(options)}`,
        params: maintItemSourceParams(options),
      },
      {
        stageId: 'local.item_acquisition_sources',
        title: 'Local item acquisition sources',
        sql: `SELECT *
FROM ${localItemSources}
WHERE deleted = 0
  AND status = 1
  AND (${localItemSourceWhereClause(options)})`,
        params: localItemSourceParams(options),
      },
      {
        stageId: 'landing.current_rows',
        title: 'Landing source rows',
        sql: `SELECT *
FROM ${landing}
WHERE deleted = 0
  AND is_current = 1
  AND (${itemLandingWhereClause(options)})`,
        params: itemLandingParams(options),
      },
    ],
  };
}

function buildNpcPlan(options) {
  const localNpcs = table(options.localDatabase, 'npcs');
  const projectionNpcs = table(options.relationDatabase, 'projection_npcs');
  const shopRelations = table(options.relationDatabase, 'item_npc_shop_relations');
  const lootRelations = table(options.relationDatabase, 'item_npc_loot_relations');
  const maintNpcs = table(options.maintDatabase, 'maint_npcs');
  const localLoot = table(options.localDatabase, 'npc_loot_entries');
  const localShop = table(options.localDatabase, 'npc_shop_entries');
  const landing = table(options.landingDatabase, 'source_dataset_landings');

  return {
    steps: [
      {
        stageId: 'local.npc',
        title: 'Local npc record',
        sql: `SELECT id, source_id AS sourceId, internal_name AS internalName, name, name_zh AS nameZh, image_url AS imageUrl
FROM ${localNpcs}
WHERE deleted = 0 AND ${entityWhereClause('npcs', options)}`,
        params: entityParams(options),
      },
      {
        stageId: 'relation.projection_npc',
        title: 'Relation projection npc',
        sql: `SELECT *
FROM ${projectionNpcs}
WHERE ${projectionEntityWhereClause('npc', options)}`,
        params: projectionEntityParams('npc', options),
      },
      {
        stageId: 'relation.npc_shop_relations',
        title: 'Relation npc shop relations',
        sql: `SELECT *
FROM ${shopRelations}
WHERE deleted = 0 AND status = 1 AND ${npcRelationWhereClause(options)}`,
        params: npcRelationParams(options),
      },
      {
        stageId: 'relation.npc_loot_relations',
        title: 'Relation npc loot relations',
        sql: `SELECT *
FROM ${lootRelations}
WHERE deleted = 0 AND status = 1 AND ${npcRelationWhereClause(options)}`,
        params: npcRelationParams(options),
      },
      {
        stageId: 'maint.npcs',
        title: 'Maint npc records',
        sql: `SELECT *
FROM ${maintNpcs}
WHERE ${maintEntityWhereClause('npc', options)}`,
        params: maintEntityParams(options),
      },
      {
        stageId: 'local.npc_loot_entries',
        title: 'Local npc loot entries',
        sql: `SELECT *
FROM ${localLoot}
WHERE deleted = 0 AND npc_id = ?`,
        params: [options.id ?? -1],
      },
      {
        stageId: 'local.npc_shop_entries',
        title: 'Local npc shop entries',
        sql: `SELECT *
FROM ${localShop}
WHERE deleted = 0 AND npc_id = ?`,
        params: [options.id ?? -1],
      },
      {
        stageId: 'landing.current_rows',
        title: 'Landing source rows',
        sql: `SELECT *
FROM ${landing}
WHERE deleted = 0
  AND is_current = 1
  AND (${npcLandingWhereClause(options)})`,
        params: npcLandingParams(options),
      },
    ],
  };
}

function entityWhereClause(tableName, options) {
  const clauses = [];
  if (options.id != null && ['items', 'npcs'].includes(tableName)) {
    clauses.push('id = ?');
  }
  if (options.sourceId != null) clauses.push('source_id = ?');
  if (options.internalName) clauses.push('internal_name = ?');
  return clauses.length > 0 ? clauses.join(' OR ') : '1 = 0';
}

function entityParams(options) {
  const params = [];
  if (options.id != null) params.push(options.id);
  if (options.sourceId != null) params.push(options.sourceId);
  if (options.internalName) params.push(options.internalName);
  return params;
}

function projectionEntityWhereClause(entity, options) {
  const clauses = [];
  if (options.sourceId != null) clauses.push('source_id = ?');
  if (options.internalName) clauses.push('internal_name = ?');
  return clauses.length > 0 ? clauses.join(' OR ') : '1 = 0';
}

function projectionEntityParams(_entity, options) {
  const params = [];
  if (options.sourceId != null) params.push(options.sourceId);
  if (options.internalName) params.push(options.internalName);
  return params;
}

function localItemSourceWhereClause(options) {
  const clauses = [];
  if (options.id != null) clauses.push('item_id = ?');
  if (options.internalName) clauses.push('source_ref_name = ?');
  return clauses.length > 0 ? clauses.join(' OR ') : '1 = 0';
}

function localItemSourceParams(options) {
  const params = [];
  if (options.id != null) params.push(options.id);
  if (options.internalName) params.push(options.internalName);
  return params;
}

function itemSourceFactWhereClause(options) {
  const clauses = [];
  if (options.sourceId != null) clauses.push('item_source_id = ?');
  if (options.internalName) clauses.push('item_internal_name = ?');
  if (options.recordKey) clauses.push('(record_key = ? OR source_maint_record_key = ?)');
  return clauses.length > 0 ? clauses.join(' OR ') : '1 = 0';
}

function itemSourceFactParams(options) {
  const params = [];
  if (options.sourceId != null) params.push(options.sourceId);
  if (options.internalName) params.push(options.internalName);
  if (options.recordKey) params.push(options.recordKey, options.recordKey);
  return params;
}

function npcRelationWhereClause(options) {
  const clauses = [];
  if (options.sourceId != null) clauses.push('npc_source_id = ?');
  if (options.internalName) clauses.push('npc_internal_name = ?');
  if (options.recordKey) clauses.push('source_fact_key = ?');
  return clauses.length > 0 ? clauses.join(' OR ') : '1 = 0';
}

function npcRelationParams(options) {
  const params = [];
  if (options.sourceId != null) params.push(options.sourceId);
  if (options.internalName) params.push(options.internalName);
  if (options.recordKey) params.push(options.recordKey);
  return params;
}

function maintEntityWhereClause(entity, options) {
  const clauses = [];
  if (options.sourceId != null) clauses.push('source_id = ?');
  if (options.internalName) clauses.push('internal_name = ?');
  if (entity === 'item' && options.recordKey) clauses.push('landing_source_key = ?');
  if (entity === 'npc' && options.recordKey) clauses.push('landing_source_key = ?');
  return clauses.length > 0 ? clauses.join(' OR ') : '1 = 0';
}

function maintEntityParams(options) {
  const params = [];
  if (options.sourceId != null) params.push(options.sourceId);
  if (options.internalName) params.push(options.internalName);
  if (options.recordKey) params.push(options.recordKey);
  return params;
}

function maintItemSourceWhereClause(options) {
  const clauses = [];
  if (options.internalName) clauses.push('item_internal_name = ?');
  if (options.recordKey) clauses.push('(record_key = ? OR landing_source_key = ?)');
  return clauses.length > 0 ? clauses.join(' OR ') : '1 = 0';
}

function maintItemSourceParams(options) {
  const params = [];
  if (options.internalName) params.push(options.internalName);
  if (options.recordKey) params.push(options.recordKey, options.recordKey);
  return params;
}

function itemLandingWhereClause(options) {
  const clauses = [];
  if (options.recordKey) clauses.push('source_key = ?');
  if (options.internalName) clauses.push('(source_key = ? OR source_page = ?)');
  return clauses.length > 0 ? clauses.join(' OR ') : '1 = 0';
}

function itemLandingParams(options) {
  const params = [];
  if (options.recordKey) params.push(options.recordKey);
  if (options.internalName) params.push(options.internalName, options.internalName);
  return params;
}

function npcLandingWhereClause(options) {
  const clauses = [];
  if (options.recordKey) clauses.push('source_key = ?');
  if (options.internalName) clauses.push('(source_key = ? OR source_page = ?)');
  return clauses.length > 0 ? clauses.join(' OR ') : '1 = 0';
}

function npcLandingParams(options) {
  const params = [];
  if (options.recordKey) params.push(options.recordKey);
  if (options.internalName) params.push(options.internalName, options.internalName);
  return params;
}

function table(database, tableName) {
  return `${quoteIdentifier(database)}.${quoteIdentifier(tableName)}`;
}

function quoteIdentifier(value) {
  const text = String(value ?? '');
  if (!/^[A-Za-z0-9_]+$/.test(text)) {
    throw new Error(`Invalid identifier: ${text}`);
  }
  return `\`${text}\``;
}

function normalizeEntity(value) {
  return String(value ?? DEFAULTS.entity).trim().toLowerCase() === 'npc' ? 'npc' : 'item';
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function toNullableNumber(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  const result = await runRecordLineageTrace(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
