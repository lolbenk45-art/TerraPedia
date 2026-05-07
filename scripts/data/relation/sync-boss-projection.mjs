#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const repoRoot = getProjectRoot();
const DEFAULT_MANAGED_IMAGE_URL_PREFIXES = [
  'http://localhost:9000/terrapedia-images/bosses/',
  'http://127.0.0.1:9000/terrapedia-images/bosses/',
  'http://localhost:9000/terrapedia-images/items/',
  'http://127.0.0.1:9000/terrapedia-images/items/'
];

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
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    dateTag: raw['date-tag'] ?? raw.dateTag ?? null
  };
}

function quoteIdentifier(value) {
  return `\`${String(value).replaceAll('`', '``')}\``;
}

function qualified(database, table) {
  return `${quoteIdentifier(database)}.${quoteIdentifier(table)}`;
}

function toDateTag(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function normalizeQueryRows(result) {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  return [];
}

async function defaultQueryRows(connection, sql, params = []) {
  const result = await connection.query(sql, params);
  return normalizeQueryRows(result);
}

async function defaultExecuteRelation(relationDatabase, dependencies, fn) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root',
    database: relationDatabase
  };
  const connection = await mysql.createConnection(mysqlOptions);
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

async function defaultWriteReport(report) {
  const reportsDir = path.join(repoRoot, 'reports', 'relation');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `boss-projection-sync-${report.dateTag}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

function selectBossProjectionColumns() {
  return [
    'id',
    'relation_record_key',
    'code',
    'name_en',
    'name_zh',
    'page_title_en',
    'page_title_zh',
    'boss_type',
    'progression_order',
    'order_within_group',
    'image_url',
    'npc_source_id',
    'npc_internal_name',
    'npc_match_status',
    'npc_match_count',
    'member_count',
    'member_npcs_json',
    'loot_item_count',
    'loot_items_json',
    'effect_count',
    'effects_json',
    'notes',
    'source_provider',
    'source_page',
    'source_revision_timestamp',
    'status',
    'deleted',
    'created_at',
    'updated_at'
  ];
}

function mapProjectionBossRow(row) {
  return {
    id: row.id ?? null,
    relation_record_key: row.relationRecordKey ?? null,
    code: row.code ?? null,
    name_en: row.nameEn ?? null,
    name_zh: row.nameZh ?? null,
    page_title_en: row.pageTitleEn ?? null,
    page_title_zh: row.pageTitleZh ?? null,
    boss_type: row.bossType ?? null,
    progression_order: row.progressionOrder ?? null,
    order_within_group: row.orderWithinGroup ?? null,
    image_url: row.imageUrl ?? null,
    npc_source_id: row.npcSourceId ?? null,
    npc_internal_name: row.npcInternalName ?? null,
    npc_match_status: row.npcMatchStatus ?? null,
    npc_match_count: row.npcMatchCount ?? null,
    member_count: row.memberCount ?? null,
    member_npcs_json: row.memberNpcsJson ?? null,
    loot_item_count: row.lootItemCount ?? null,
    loot_items_json: row.lootItemsJson ?? null,
    effect_count: row.effectCount ?? null,
    effects_json: row.effectsJson ?? null,
    notes: row.notes ?? null,
    source_provider: row.sourceProvider ?? null,
    source_page: row.sourcePage ?? null,
    source_revision_timestamp: row.sourceRevisionTimestamp ?? null,
    status: row.status ?? 1,
    deleted: row.deleted ?? 0,
    created_at: row.createdAt ?? null,
    updated_at: row.updatedAt ?? null
  };
}

export function buildBossProjectionUpsertSql({
  relationDatabase = 'terria_v1_relation',
  rows = []
} = {}) {
  if (!rows.length) {
    return null;
  }

  const columns = selectBossProjectionColumns();
  const placeholders = `(${columns.map(() => '?').join(', ')})`;
  const valuesSql = rows.map(() => placeholders).join(', ');
  const updateColumns = columns.filter((column) => column !== 'id');
  const updateSql = updateColumns
    .map((column) => `${quoteIdentifier(column)} = VALUES(${quoteIdentifier(column)})`)
    .join(', ');

  return {
    sql: `INSERT INTO ${qualified(relationDatabase, 'projection_bosses')} (${columns.map(quoteIdentifier).join(', ')}) VALUES ${valuesSql} ON DUPLICATE KEY UPDATE ${updateSql}`,
    params: rows.flatMap((row) => {
      const mapped = mapProjectionBossRow(row);
      return columns.map((column) => mapped[column]);
    })
  };
}

async function queryBossSourceRows(connection, relationDatabase) {
  const selectAll = (table) => `SELECT * FROM ${qualified(relationDatabase, table)} WHERE deleted = 0 AND status = 1`;
  const rows = await Promise.all([
    defaultQueryRows(connection, selectAll('relation_bosses')),
    defaultQueryRows(connection, selectAll('relation_npcs')),
    defaultQueryRows(connection, selectAll('relation_items')),
    defaultQueryRows(connection, `SELECT
      id,
      npc_internal_name AS npcInternalName,
      cached_url AS cachedUrl,
      is_primary AS isPrimary,
      sort_order AS sortOrder,
      status,
      deleted
    FROM ${qualified(relationDatabase, 'relation_npc_images')} WHERE deleted = 0 AND status = 1`),
    defaultQueryRows(connection, `SELECT
      id,
      item_internal_name AS itemInternalName,
      cached_url AS cachedUrl,
      is_primary AS isPrimary,
      sort_order AS sortOrder,
      status,
      deleted
    FROM ${qualified(relationDatabase, 'relation_item_images')} WHERE deleted = 0 AND status = 1`),
    defaultQueryRows(connection, `SELECT
      record_key AS recordKey,
      boss_record_key AS bossRecordKey,
      item_internal_name AS itemInternalName,
      reward_source_type AS rewardSourceType,
      npc_member_count AS npcMemberCount,
      chance_texts_json AS chanceTextsJson,
      quantity_texts_json AS quantityTextsJson,
      status,
      deleted
    FROM ${qualified(relationDatabase, 'boss_item_reward_relations')} WHERE deleted = 0 AND status = 1`),
    defaultQueryRows(connection, `SELECT
      record_key AS recordKey,
      boss_record_key AS bossRecordKey,
      effect_type AS effectType,
      target_type AS targetType,
      target_key AS targetKey,
      target_name AS targetName,
      evidence_text AS evidenceText,
      status,
      deleted
    FROM ${qualified(relationDatabase, 'boss_effect_relations')} WHERE deleted = 0 AND status = 1`)
  ]);

  const [relationBosses, relationNpcs, relationItems, relationNpcImages, relationItemImages, bossItemRewardRelations, bossEffectRelations] = rows;
  return {
    relationBosses,
    relationNpcs,
    relationItems,
    relationNpcImages,
    relationItemImages,
    bossItemRewardRelations,
    bossEffectRelations
  };
}

export async function runBossProjectionSync(options = {}, dependencies = {}) {
  const now = dependencies.now ?? new Date();
  const normalized = {
    apply: Boolean(options.apply),
    localDatabase: options.localDatabase ?? 'terria_v1_local',
    relationDatabase: options.relationDatabase ?? 'terria_v1_relation',
    dateTag: options.dateTag ?? toDateTag(now)
  };
  const executeRelation = dependencies.executeRelation
    ?? ((fn) => defaultExecuteRelation(normalized.relationDatabase, dependencies, fn));
  const writeReport = dependencies.writeReport ?? defaultWriteReport;

  return executeRelation(async (connection) => {
    const sourceRows = await queryBossSourceRows(connection, normalized.relationDatabase);
    const payload = buildProjectionPayload({
      relationItems: sourceRows.relationItems,
      relationNpcs: sourceRows.relationNpcs,
      relationNpcImages: sourceRows.relationNpcImages,
      relationBosses: sourceRows.relationBosses,
      bossItemRewardRelations: sourceRows.bossItemRewardRelations,
      bossEffectRelations: sourceRows.bossEffectRelations,
      relationItemImages: sourceRows.relationItemImages,
      managedImageUrlPrefixes: dependencies.managedImageUrlPrefixes ?? DEFAULT_MANAGED_IMAGE_URL_PREFIXES
    });
    const projectionBosses = payload.projectionBosses ?? [];

    let writeCount = 0;
    if (normalized.apply) {
      await connection.query('START TRANSACTION');
      try {
        await connection.query(`DELETE FROM ${qualified(normalized.relationDatabase, 'projection_bosses')}`);
        if (projectionBosses.length > 0) {
          const statement = buildBossProjectionUpsertSql({
            relationDatabase: normalized.relationDatabase,
            rows: projectionBosses
          });
          const result = await connection.execute(statement.sql, statement.params);
          writeCount = Number(result?.[0]?.affectedRows ?? 0);
        }
        await connection.query('COMMIT');
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      }
    }

    const report = {
      generatedAt: now.toISOString(),
      dateTag: normalized.dateTag,
      apply: normalized.apply,
      localDatabase: normalized.localDatabase,
      relationDatabase: normalized.relationDatabase,
      summary: {
        sourceBossRows: sourceRows.relationBosses.length,
        projectionBossCount: projectionBosses.length,
        writeCount
      },
      projectionBosses
    };
    const reportPath = await writeReport(report);
    return { report, reportPath };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await runBossProjectionSync(parseArgs(process.argv.slice(2)));
  console.log(`Apply: ${result.report.apply}`);
  console.log(`Relation database: ${result.report.relationDatabase}`);
  console.log(`Report: ${result.reportPath}`);
}
