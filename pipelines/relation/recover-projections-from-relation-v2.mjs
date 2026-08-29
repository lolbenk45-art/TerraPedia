#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadAuthorizedOperationContext } from '../automation/authorized-operation-context.mjs';
import { hashOrderedBundleBytes } from '../automation/build-canonical-cutover-authorization.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';
import { resolveManagedImageUrlPrefixes } from './managed-image-url-policy.mjs';

export const PROJECTION_RECOVERY_V2_OPERATION_ID = 'canonical-projection-recovery-from-relation-v2';
export const PROJECTION_RECOVERY_V2_ALLOW_LIST = Object.freeze([
  'relation.projection_items',
  'relation.projection_npcs',
  'relation.projection_bosses',
  'relation.projection_projectiles',
  'relation.projection_buffs',
]);

const BOSS_IMAGE_PREFIXES = Object.freeze([
  'http://localhost:9000/terrapedia-images/bosses/',
  'http://127.0.0.1:9000/terrapedia-images/bosses/',
]);

const TABLE_INPUTS = Object.freeze({
  relationItems: 'relation_items', relationItemImages: 'relation_item_images', relationItemRarities: 'relation_item_rarities',
  relationNpcs: 'relation_npcs', relationNpcImages: 'relation_npc_images', relationProjectiles: 'relation_projectiles',
  relationProjectileImages: 'relation_projectile_images', relationBosses: 'relation_bosses', relationBuffs: 'relation_buffs',
  relationBuffImages: 'relation_buff_images', relationArmorSets: 'relation_armor_sets', relationArmorSetItems: 'relation_armor_set_items',
  relationArmorSetImages: 'relation_armor_set_images', relationArmorAttributeRows: 'relation_armor_attribute_rows',
  relationEquipmentEffectAttributes: 'relation_equipment_effect_attributes', itemNpcShopRelations: 'item_npc_shop_relations',
  itemNpcLootRelations: 'item_npc_loot_relations', itemProjectileRelations: 'item_projectile_relations', npcProjectileRelations: 'npc_projectile_relations',
  itemBuffRelations: 'item_buff_relations', npcBuffRelations: 'npc_buff_relations', bossItemRewardRelations: 'boss_item_reward_relations',
  bossEffectRelations: 'boss_effect_relations',
});
const PROJECTION_TABLES = Object.freeze([
  ['projectionItems', 'projection_items'], ['projectionNpcs', 'projection_npcs'], ['projectionBosses', 'projection_bosses'],
  ['projectionProjectiles', 'projection_projectiles'], ['projectionBuffs', 'projection_buffs'],
]);
const PRESERVATION_FIELDS = Object.freeze({
  projection_items: ['internal_name', 'image'],
  projection_npcs: ['internal_name', 'image_url', 'source_items_json', 'loot_items_json', 'shop_items_json'],
  projection_bosses: ['code', 'image_url'],
  projection_projectiles: ['internal_name', 'image_url', 'source_items_json', 'source_npcs_json'],
  projection_buffs: ['internal_name', 'image', 'source_items_json', 'inflicting_npcs_json'],
});

export function buildProjectionRecoveryPlan({ relationBundleSha256, managedImageUrlPrefixes = [], counts = {} } = {}) {
  if (!/^sha256:[a-f0-9]{64}$/.test(String(relationBundleSha256 ?? ''))) throw new Error('relation bundle hash must be sha256');
  if (!Array.isArray(managedImageUrlPrefixes) || managedImageUrlPrefixes.length === 0) throw new Error('managed image URL prefixes are required');
  for (const [key] of PROJECTION_TABLES) {
    if (!Number.isInteger(Number(counts[key])) || Number(counts[key]) <= 0) throw new Error(`${key} count must be positive`);
  }
  return {
    operationId: PROJECTION_RECOVERY_V2_OPERATION_ID,
    relationBundleSha256,
    managedImageUrlPrefixes: [...managedImageUrlPrefixes],
    counts: Object.fromEntries(PROJECTION_TABLES.map(([key]) => [key, Number(counts[key])])),
    allowList: [...PROJECTION_RECOVERY_V2_ALLOW_LIST],
    databaseWrites: true,
    networkAccess: false,
  };
}

function mapRow(row) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), value])); }
function snakeCase(value) { return String(value).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`); }
function mapProjectionRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const column = snakeCase(key);
    if (column.endsWith('_timestamp') && value != null && value !== '') {
      const date = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(date.getTime())) throw new Error(`invalid projection timestamp: ${value}`);
      value = date.toISOString().slice(0, 19).replace('T', ' ');
    }
    return [column, value];
  }));
}
function sha256Bytes(bytes) { return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`; }
function writePrivateJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 }); fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }

function projectionBossCode(boss) {
  const value = String(boss?.code ?? boss?.nameEn ?? '').trim();
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function applyBossImageOverrides({ projectionBosses = [], localBossImages = [] } = {}) {
  const bossImages = new Map(localBossImages.map((row) => [
    String(row.code ?? '').trim().toUpperCase(),
    row.image_url,
  ]));
  for (const boss of projectionBosses) {
    const image = bossImages.get(projectionBossCode(boss));
    if (image && BOSS_IMAGE_PREFIXES.some((prefix) => image.startsWith(prefix))) boss.imageUrl = image;
  }
  return projectionBosses;
}

function projectionRowKey(row) {
  return String(row?.internalName ?? row?.internal_name ?? row?.code ?? '').trim().toLowerCase();
}

function isEmptyJsonArray(value) {
  if (value == null || value === '') return true;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) && parsed.length === 0;
  } catch {
    return false;
  }
}

export function applyProjectionPreservation({ payload = {}, preservedProjectionRows = {} } = {}) {
  for (const [payloadKey, tableName] of PROJECTION_TABLES) {
    const rows = payload[payloadKey] ?? [];
    const preserved = new Map((preservedProjectionRows[tableName] ?? []).map((row) => [projectionRowKey(row), row]));
    const fields = PRESERVATION_FIELDS[tableName] ?? [];
    for (const row of rows) {
      const previous = preserved.get(projectionRowKey(row));
      if (!previous) continue;
      for (const field of fields) {
        const targetKey = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const currentValue = row[targetKey];
        const previousValue = previous[field] ?? previous[targetKey];
        if (isEmptyJsonArray(currentValue) && !isEmptyJsonArray(previousValue)) row[targetKey] = previousValue;
        else if ((currentValue == null || currentValue === '') && previousValue != null && previousValue !== '') row[targetKey] = previousValue;
      }
    }
  }
  return payload;
}

async function insertRows(connection, tableName, rows) {
  for (const row of rows) {
    const mapped = mapProjectionRow(row); const columns = Object.keys(mapped);
    await connection.execute(`INSERT INTO \`${tableName}\` (${columns.map((c) => `\`${c}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${columns.filter((c) => c !== 'id').map((c) => `\`${c}\`=VALUES(\`${c}\`)`).join(',')}`, columns.map((c) => mapped[c]));
  }
}

export async function runProjectionRecoveryV2({ snapshotPath, expectedSha256, backupPath, outputPath, requireAuthorization = true, db = {} } = {}) {
  const resolved = path.resolve(snapshotPath); const bytes = fs.readFileSync(resolved); const actual = sha256Bytes(bytes);
  if (actual !== expectedSha256) throw new Error('relation snapshot hash drifted');
  const snapshot = JSON.parse(bytes);
  const inputs = Object.fromEntries(Object.entries(TABLE_INPUTS).map(([key]) => [key, (snapshot.rows?.[key] ?? []).map(mapRow)]));
  const managed = snapshot.managedImageUrlPrefixes;
  const payload = buildProjectionPayload({
    ...inputs,
    itemNumericOverrides: (snapshot.maintOverrides?.itemNumericOverrides ?? []).map(mapRow),
    itemRarityOverrides: (snapshot.maintOverrides?.itemRarityOverrides ?? []).map(mapRow),
    itemTextOverrides: (snapshot.maintOverrides?.itemTextOverrides ?? []).map(mapRow),
    managedImageUrlPrefixes: managed,
  });
  applyProjectionPreservation({ payload, preservedProjectionRows: snapshot.preservedProjectionRows ?? {} });
  applyBossImageOverrides({ projectionBosses: payload.projectionBosses, localBossImages: snapshot.localBossImages ?? [] });
  const counts = Object.fromEntries(PROJECTION_TABLES.map(([key]) => [key, payload[key].length]));
  const plan = buildProjectionRecoveryPlan({ relationBundleSha256: actual, managedImageUrlPrefixes: managed, counts });
  if (requireAuthorization) {
    const context = loadAuthorizedOperationContext({ operationId: PROJECTION_RECOVERY_V2_OPERATION_ID });
    const bundleHash = hashOrderedBundleBytes([{ path: 'reports/runtime/local-data-chain-closure/20260823/projection-recovery-v2/relation-snapshot.json', bytes }], 'projection recovery data bundle');
    if (context.dataBundleSha256 !== bundleHash) throw new Error('authorized relation snapshot bundle drifted');
  }
  const mysql = createRequire(path.resolve('apps/admin-console/package.json'))('mysql2/promise');
  const config = (await import('../../scripts/lib/local-runtime-config.mjs')).loadLocalStackConfig();
  const connection = await mysql.createConnection({ host: config.database.host, port: Number(config.database.port), user: config.database.username, password: config.database.password, database: 'terria_v1_relation', ...db, database: 'terria_v1_relation' });
  try {
    const backup = { operationId: PROJECTION_RECOVERY_V2_OPERATION_ID, generatedAt: new Date().toISOString(), tables: {} };
    for (const [, table] of PROJECTION_TABLES) { const [rows] = await connection.query(`SELECT * FROM \`${table}\``); backup.tables[table] = rows; }
    writePrivateJson(path.resolve(backupPath), backup);
    await connection.beginTransaction();
    try {
      for (const [, table] of PROJECTION_TABLES) await connection.query(`DELETE FROM \`${table}\``);
      for (const [key, table] of PROJECTION_TABLES) await insertRows(connection, table, payload[key]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    const readback = {};
    for (const [, table] of PROJECTION_TABLES) { const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``); readback[table] = Number(rows[0]?.count ?? 0); }
    const result = { operationId: PROJECTION_RECOVERY_V2_OPERATION_ID, status: 'completed', apply: true, plan, backupPath: path.relative(process.cwd(), path.resolve(backupPath)), readback };
    writePrivateJson(path.resolve(outputPath), result); return result;
  } finally { await connection.end(); }
}

export async function buildRelationSnapshot({ outputPath, managedImageUrlPrefixes = resolveManagedImageUrlPrefixes(), preservedProjectionRowsPath = null } = {}) {
  const mysql = createRequire(path.resolve('apps/admin-console/package.json'))('mysql2/promise'); const config = (await import('../../scripts/lib/local-runtime-config.mjs')).loadLocalStackConfig();
  const connection = await mysql.createConnection({ host: config.database.host, port: Number(config.database.port), user: config.database.username, password: config.database.password, database: 'terria_v1_relation' });
  try {
    const rows = {};
    for (const [key, table] of Object.entries(TABLE_INPUTS)) { const [result] = await connection.query(`SELECT * FROM \`${table}\` WHERE deleted = 0`); rows[key] = result; }
    const [itemNumericOverrides] = await connection.query('SELECT item_internal_name, damage_value, defense_value, knockback_value, use_time, buy_value, sell_value FROM `terria_v1_maint`.`maint_item_numeric_overrides` WHERE deleted = 0');
    const [itemRarityOverrides] = await connection.query('SELECT item_internal_name, rarity_id FROM `terria_v1_maint`.`maint_item_rarity_overrides` WHERE deleted = 0');
    const [itemTextOverrides] = await connection.query('SELECT item_internal_name, tooltip_zh, description_zh FROM `terria_v1_maint`.`maint_item_text_overrides` WHERE deleted = 0');
    const [localBossImages] = await connection.query('SELECT code, image_url FROM `terria_v1_local`.`boss_groups` WHERE deleted = 0 AND status = 1');
    const preservedProjectionRows = preservedProjectionRowsPath
      ? JSON.parse(fs.readFileSync(path.resolve(preservedProjectionRowsPath), 'utf8')).tables ?? {}
      : {};
    for (const table of Object.values(Object.fromEntries(PROJECTION_TABLES))) {
      if (preservedProjectionRows[table]) continue;
      const fields = PRESERVATION_FIELDS[table];
      const [projectionRows] = await connection.query(`SELECT ${fields.map((field) => `\`${field}\``).join(', ')} FROM \`${table}\` WHERE deleted = 0`);
      preservedProjectionRows[table] = projectionRows;
    }
    const payload = { schemaVersion: 1, operationId: PROJECTION_RECOVERY_V2_OPERATION_ID, generatedAt: new Date().toISOString(), managedImageUrlPrefixes, rows, preservedProjectionRows, maintOverrides: { itemNumericOverrides, itemRarityOverrides, itemTextOverrides }, localBossImages };
    writePrivateJson(path.resolve(outputPath), payload);
    console.log(JSON.stringify({ snapshotPath: outputPath, snapshotSha256: sha256Bytes(fs.readFileSync(path.resolve(outputPath))) }, null, 2));
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=') || true]; }));
  if (args['build-snapshot']) await buildRelationSnapshot({ outputPath: args.output, preservedProjectionRowsPath: args['preserved-from-backup'] ?? null });
  else await runProjectionRecoveryV2({ snapshotPath: args.snapshot, expectedSha256: args['expected-sha256'], backupPath: args.backup, outputPath: args.output });
}
