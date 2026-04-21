#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolveIndependentEntityImportApply } from './independent-entity-import-mode.mjs';
import { loadStandardizedDataset } from '../lib/load-standardized-dataset.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) args[body.slice(0, eq)] = body.slice(eq + 1);
    else args[body] = 'true';
  }
  return args;
}

function toNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function toNullablePositiveInteger(value) {
  const num = toNullableInteger(value);
  if (num == null || num <= 0) return null;
  return num;
}

function toNullableDecimal(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function toTinyInt(value, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return Number(value) ? 1 : 0;
}

function normalizeInternalName(value, fallback = '') {
  const text = toNullableString(value);
  if (text) return text;
  const generated = String(fallback || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return generated || null;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function makeStats() {
  return { input: 0, created: 0, updated: 0, errors: [] };
}

function makeRelationStats() {
  return { input: 0, created: 0, updated: 0, errors: [], unmatched: 0, unmatchedSamples: [] };
}

function makeItemLinkStats() {
  return { checked: 0, resolved: 0, unmatched: 0, unmatchedSamples: [] };
}

function loadSourceItemLookup(records) {
  const bySourceId = new Map();
  const list = Array.isArray(records) ? records : [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const sourceItemId = toNullableInteger(item?.id);
    const internalName = normalizeInternalName(item?.internalName, item?.name || sourceItemId || i);
    if (sourceItemId == null || !internalName) continue;
    bySourceId.set(sourceItemId, internalName);
  }
  return { bySourceId };
}

function resolveMappedItem(sourceItemId, sourceItemLookup, itemLookup) {
  if (sourceItemId == null) {
    return { sourceItemId: null, internalName: null, dbItem: null, reason: 'missing_source_item_id' };
  }
  const internalName = sourceItemLookup.bySourceId.get(sourceItemId) ?? null;
  if (!internalName) {
    return { sourceItemId, internalName: null, dbItem: null, reason: 'source_item_id_not_found_in_standardized_items' };
  }
  const dbItem = itemLookup.byInternal.get(internalName) ?? null;
  if (!dbItem) {
    return { sourceItemId, internalName, dbItem: null, reason: 'internal_name_not_found_in_db_items' };
  }
  return { sourceItemId, internalName, dbItem, reason: null };
}

function recordUnmatched(relationStats, sample) {
  relationStats.unmatched += 1;
  if (relationStats.unmatchedSamples.length < 50) {
    relationStats.unmatchedSamples.push(sample);
  }
}

function recordItemLink(linkStats, sample, mapped) {
  linkStats.checked += 1;
  if (!mapped?.reason && mapped?.dbItem) {
    linkStats.resolved += 1;
    return;
  }
  linkStats.unmatched += 1;
  if (linkStats.unmatchedSamples.length < 50) {
    linkStats.unmatchedSamples.push({
      reason: mapped?.reason ?? 'unknown_mapping_error',
      standardizedItemInternalName: mapped?.internalName ?? null,
      ...sample,
    });
  }
}

async function ensureSchema(conn) {
  const migrationNames = [
    'V16__create_independent_entity_tables.sql',
    'V17__add_npc_item_link_columns.sql',
    'V29__align_npc_table_with_admin_schema.sql',
    'V30__add_npc_zh_columns.sql',
    'V31__add_projectile_zh_column.sql',
  ];
  for (const migrationName of migrationNames) {
    const sqlPath = path.join(repoRoot, 'back', 'src', 'main', 'resources', 'db', 'migration', migrationName);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await conn.query(sql);
  }
}

async function loadItemsLookup(conn) {
  const [rows] = await conn.query('SELECT id, internal_name, name FROM items WHERE deleted = 0');
  const byId = new Map();
  const byInternal = new Map();
  for (const row of rows) {
    const id = Number(row.id);
    const internalName = normalizeInternalName(row.internal_name);
    const name = toNullableString(row.name);
    byId.set(id, { id, internalName, name });
    if (internalName) byInternal.set(internalName, { id, internalName, name });
  }
  return { byId, byInternal };
}

async function loadCategoryCodeMap(conn) {
  const [rows] = await conn.query('SELECT id, code FROM category WHERE deleted = 0');
  const byCode = new Map();
  for (const row of rows) {
    const code = toNullableString(row.code);
    const id = toNullableInteger(row.id);
    if (code && id != null && !byCode.has(code)) {
      byCode.set(code, id);
    }
  }
  return byCode;
}

function firstCategoryId(categoryByCode, codes) {
  for (const code of codes) {
    const id = categoryByCode.get(code);
    if (id != null) return id;
  }
  return 0;
}

function inferNpcCategoryId(record, categoryByCode) {
  const friendly = record?.flags?.friendly === true;
  const townNpc = record?.extras?.townNPC === true || record?.extras?.townnpc === true;

  if (friendly) {
    if (townNpc) {
      return firstCategoryId(categoryByCode, [
        'CATEGORY_NPC_FRIENDLY_TOWN',
        'NPC_FRIENDLY_TOWN',
        'CATEGORY_NPC_FRIENDLY',
        'NPC_FRIENDLY',
        'CATEGORY_NPC',
      ]);
    }
    return firstCategoryId(categoryByCode, [
      'CATEGORY_NPC_FRIENDLY_OTHER',
      'NPC_FRIENDLY_OTHER',
      'CATEGORY_NPC_FRIENDLY',
      'NPC_FRIENDLY',
      'CATEGORY_NPC',
    ]);
  }

  return firstCategoryId(categoryByCode, [
    'CATEGORY_NPC_ENEMY',
    'NPC_ENEMY',
    'CATEGORY_NPC',
  ]);
}

async function upsertBuff(conn, record, index) {
  const internalName = normalizeInternalName(record.internalName, record.englishName || record.id || index);
  const [[existing]] = await conn.execute('SELECT id FROM buffs WHERE source_id = ? LIMIT 1', [toNullableInteger(record.id)]);
  const [result] = await conn.execute(
    `INSERT INTO buffs
      (source_id, internal_name, english_name, name_zh, tooltip_en, tooltip_zh, image, buff_type, source_item_count, immune_npc_count, source_items_json, immune_npc_sample_json, status, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       internal_name = VALUES(internal_name),
       english_name = VALUES(english_name),
       name_zh = VALUES(name_zh),
       tooltip_en = VALUES(tooltip_en),
       tooltip_zh = VALUES(tooltip_zh),
       image = VALUES(image),
       buff_type = VALUES(buff_type),
       source_item_count = VALUES(source_item_count),
       immune_npc_count = VALUES(immune_npc_count),
       source_items_json = VALUES(source_items_json),
       immune_npc_sample_json = VALUES(immune_npc_sample_json),
       status = 1,
       deleted = 0,
       updated_at = NOW()`,
    [
      toNullableInteger(record.id),
      internalName,
      toNullableString(record.englishName),
      toNullableString(record.localized?.zh?.name),
      toNullableString(record.localized?.en?.tooltip),
      toNullableString(record.localized?.zh?.tooltip),
      toNullableString(record.imageUrl ?? record.image),
      toNullableString(record.type),
      toNullableInteger(record.sourceItemCount) ?? 0,
      toNullableInteger(record.immuneNpcCount) ?? 0,
      JSON.stringify(record.sourceItems ?? []),
      JSON.stringify(record.immuneNpcSample ?? []),
    ]
  );
  return { id: Number(result.insertId), isNew: !existing };
}

async function importBuffs(conn, records, itemLookup, sourceItemLookup, stats, relationStats) {
  stats.input = Array.isArray(records) ? records.length : 0;
  relationStats.input = 0;
  for (let i = 0; i < stats.input; i += 1) {
    try {
      const record = records[i];
      const buffInternalName = normalizeInternalName(record.internalName, record.englishName || record.id || i);
      const { id: buffId, isNew } = await upsertBuff(conn, record, i);
      if (isNew) stats.created += 1;
      else stats.updated += 1;

      await conn.execute('DELETE FROM buff_source_items WHERE buff_id = ?', [buffId]);
      const sourceItems = Array.isArray(record.sourceItems) ? record.sourceItems : [];
      relationStats.input += sourceItems.length;
      for (let j = 0; j < sourceItems.length; j += 1) {
        const sourceItem = sourceItems[j];
        const sourceItemId = toNullablePositiveInteger(sourceItem.itemId);
        const mapped = sourceItemId == null
          ? { sourceItemId: null, internalName: null, dbItem: null, reason: null }
          : resolveMappedItem(sourceItemId, sourceItemLookup, itemLookup);
        if (sourceItemId != null && mapped.reason) {
          recordUnmatched(relationStats, {
            reason: mapped.reason,
            buffSourceId: toNullableInteger(record.id),
            buffInternalName,
            sourceItemId,
            standardizedItemInternalName: mapped.internalName,
            rawSourceItemInternalName: toNullableString(sourceItem.internalName),
            rawSourceItemName: toNullableString(sourceItem.name),
            sortOrder: j,
          });
        }
        await conn.execute(
          `INSERT INTO buff_source_items
            (buff_id, source_item_id, source_item_internal_name, source_item_name, item_id, buff_time, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            buffId,
            sourceItemId,
            mapped.internalName,
            mapped.dbItem?.name ?? null,
            mapped.dbItem?.id ?? null,
            toNullableInteger(sourceItem.buffTime),
            j,
          ]
        );
        relationStats.updated += 1;
      }
    } catch (error) {
      stats.errors.push(`buffs[${i}]: ${error?.message ?? String(error)}`);
    }
  }
}

async function importNpcs(conn, records, itemLookup, sourceItemLookup, categoryByCode, stats, linkStats) {
  const npcZhMap = loadNpcZhMap();
  stats.input = Array.isArray(records) ? records.length : 0;
  for (let i = 0; i < stats.input; i += 1) {
    const r = records[i];
    try {
      const npcSourceId = toNullableInteger(r.id);
      const bannerSourceItemId = toNullablePositiveInteger(r.banner);
      const catchSourceItemId = toNullablePositiveInteger(r.extras?.catchItem);
      const bannerMapped = bannerSourceItemId == null
        ? { sourceItemId: null, internalName: null, dbItem: null, reason: null }
        : resolveMappedItem(bannerSourceItemId, sourceItemLookup, itemLookup);
      const catchMapped = catchSourceItemId == null
        ? { sourceItemId: null, internalName: null, dbItem: null, reason: null }
        : resolveMappedItem(catchSourceItemId, sourceItemLookup, itemLookup);
      if (bannerSourceItemId != null) {
        recordItemLink(linkStats.banner, {
          npcSourceId,
          npcInternalName: normalizeInternalName(r.internalName, r.name || r.id || i),
          linkType: 'banner',
          sourceItemId: bannerSourceItemId,
        }, bannerMapped);
      }
      if (catchSourceItemId != null) {
        recordItemLink(linkStats.catchItem, {
          npcSourceId,
          npcInternalName: normalizeInternalName(r.internalName, r.name || r.id || i),
          linkType: 'catchItem',
          sourceItemId: catchSourceItemId,
        }, catchMapped);
      }
      const [[existing]] = await conn.execute('SELECT id, category_id FROM npcs WHERE source_id = ? LIMIT 1', [toNullableInteger(r.id)]);
      const npcInternalName = normalizeInternalName(r.internalName, r.name || r.id || i);
      const zhMeta = npcZhMap.get(npcInternalName) ?? null;
      const nextNameZh = resolveNpcZhName(r, npcZhMap);
      const nextSubNameZh = toNullableString(zhMeta?.subNameZh) ?? toNullableString(r.localized?.zh?.namesub);
      const nextCategoryId = (existing?.category_id != null && Number(existing.category_id) !== 0)
        ? Number(existing.category_id)
        : inferNpcCategoryId(r, categoryByCode);
      await conn.execute(
        `INSERT INTO npcs
          (source_id, internal_name, name, name_zh, sub_name, sub_name_zh, category_id, net_id, npc_type, ai_style, damage, defense, life_max, knock_back_resist, width, height, scale, value, banner_source_item_id, banner_item_id, catch_source_item_id, catch_item_id, buff_immune, raw_json, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
         ON DUPLICATE KEY UPDATE
            internal_name = VALUES(internal_name),
            name = VALUES(name),
            name_zh = VALUES(name_zh),
            sub_name = VALUES(sub_name),
            sub_name_zh = VALUES(sub_name_zh),
            category_id = VALUES(category_id),
           net_id = VALUES(net_id),
           npc_type = VALUES(npc_type),
           ai_style = VALUES(ai_style),
           damage = VALUES(damage),
           defense = VALUES(defense),
           life_max = VALUES(life_max),
           knock_back_resist = VALUES(knock_back_resist),
            width = VALUES(width),
            height = VALUES(height),
            scale = VALUES(scale),
            value = VALUES(value),
            banner_source_item_id = VALUES(banner_source_item_id),
            banner_item_id = VALUES(banner_item_id),
            catch_source_item_id = VALUES(catch_source_item_id),
            catch_item_id = VALUES(catch_item_id),
            buff_immune = VALUES(buff_immune),
            raw_json = VALUES(raw_json),
            status = 1,
           deleted = 0,
           updated_at = NOW()`,
        [
          toNullableInteger(r.id),
          npcInternalName,
          toNullableString(r.name),
          nextNameZh,
          toNullableString(r.localized?.en?.namesub) ?? '',
          nextSubNameZh,
          nextCategoryId,
          toNullableInteger(r.netID),
          toNullableInteger(r.type),
          toNullableInteger(r.aiStyle),
          toNullableInteger(r.combat?.damage),
          toNullableInteger(r.combat?.defense),
          toNullableInteger(r.combat?.lifeMax),
          toNullableDecimal(r.combat?.knockBackResist),
          toNullableInteger(r.dimensions?.width),
          toNullableInteger(r.dimensions?.height),
          toNullableDecimal(r.dimensions?.scale),
          toNullableInteger(r.economy?.value),
          bannerSourceItemId,
          bannerMapped.dbItem?.id ?? null,
          catchSourceItemId,
          catchMapped.dbItem?.id ?? null,
          toNullableString(r.buffImmune),
          JSON.stringify(r),
        ]
      );
      if (existing) stats.updated += 1;
      else stats.created += 1;
    } catch (error) {
      stats.errors.push(`npcs[${i}]: ${error?.message ?? String(error)}`);
    }
  }
}

function loadNpcZhMap() {
  const mapPath = path.join(repoRoot, 'data', 'generated', 'npc-id-row-images.json');
  if (!fs.existsSync(mapPath)) {
    return new Map();
  }
  const payload = loadJson(mapPath);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  return new Map(
    records
      .map((record) => [
        toNullableString(record?.internalName),
        {
          nameZh: toNullableString(record?.nameZh),
          subNameZh: toNullableString(record?.subNameZh),
        },
      ])
      .filter(([internalName, zh]) => internalName && (zh?.nameZh || zh?.subNameZh))
  );
}

function stripNpcVariantPrefix(internalName) {
  const text = toNullableString(internalName);
  if (!text) return null;
  return text
    .replace(/^(Big|Little|Large|Small)/, '')
    .replace(/(Fatty|Honey|Leafy|Spikey|Stingy)$/, '');
}

function resolveNpcZhName(record, npcZhMap) {
  const internalName = toNullableString(record.internalName);
  if (internalName) {
    const direct = npcZhMap.get(internalName);
    if (direct?.nameZh) return direct.nameZh;

    const stripped = stripNpcVariantPrefix(internalName);
    if (stripped) {
      const variantFallback = npcZhMap.get(stripped);
      if (variantFallback?.nameZh) return variantFallback.nameZh;
    }
  }

  return toNullableString(record.localized?.zh?.name);
}

async function importProjectiles(conn, records, stats) {
  stats.input = Array.isArray(records) ? records.length : 0;
  for (let i = 0; i < stats.input; i += 1) {
    const r = records[i];
    try {
      const [[existing]] = await conn.execute('SELECT id FROM projectiles WHERE source_id = ? LIMIT 1', [toNullableInteger(r.id)]);
      await conn.execute(
        `INSERT INTO projectiles
          (source_id, internal_name, name, name_zh, ai_style, damage, knock_back, penetrate, time_left, width, height, scale, friendly, hostile, tile_collide, raw_json, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
         ON DUPLICATE KEY UPDATE
           internal_name = VALUES(internal_name),
           name = VALUES(name),
           name_zh = VALUES(name_zh),
           ai_style = VALUES(ai_style),
           damage = VALUES(damage),
           knock_back = VALUES(knock_back),
           penetrate = VALUES(penetrate),
           time_left = VALUES(time_left),
           width = VALUES(width),
           height = VALUES(height),
           scale = VALUES(scale),
           friendly = VALUES(friendly),
           hostile = VALUES(hostile),
           tile_collide = VALUES(tile_collide),
           raw_json = VALUES(raw_json),
           status = 1,
           deleted = 0,
           updated_at = NOW()`,
        [
          toNullableInteger(r.id),
          normalizeInternalName(r.internalName, r.name || r.id || i),
          toNullableString(r.name),
          toNullableString(r.localized?.zh?.name ?? r.nameZh),
          toNullableInteger(r.aiStyle),
          toNullableInteger(r.combat?.damage),
          toNullableDecimal(r.combat?.knockBack),
          toNullableInteger(r.combat?.penetrate),
          toNullableInteger(r.lifecycle?.timeLeft),
          toNullableInteger(r.dimensions?.width),
          toNullableInteger(r.dimensions?.height),
          toNullableDecimal(r.dimensions?.scale),
          toTinyInt(r.flags?.friendly, 0),
          toTinyInt(r.flags?.hostile, 0),
          toTinyInt(r.flags?.tileCollide, 1),
          JSON.stringify(r),
        ]
      );
      if (existing) stats.updated += 1;
      else stats.created += 1;
    } catch (error) {
      stats.errors.push(`projectiles[${i}]: ${error?.message ?? String(error)}`);
    }
  }
}

function resolveArmorSetSourceKey(record, index) {
  return toNullableString(record.textKey)
    ?? toNullableString(record.benefitExpression)
    ?? `armor_set_${index + 1}`;
}

async function importArmorSets(conn, records, itemLookup, sourceItemLookup, stats, relationStats) {
  stats.input = Array.isArray(records) ? records.length : 0;
  relationStats.input = 0;

  for (let i = 0; i < stats.input; i += 1) {
    const r = records[i];
    try {
      const sourceKey = resolveArmorSetSourceKey(r, i);
      const [[existing]] = await conn.execute('SELECT id FROM armor_sets WHERE source_key = ? LIMIT 1', [sourceKey]);
      const [result] = await conn.execute(
        `INSERT INTO armor_sets
          (source_key, text_key, benefit_expression, primary_part, set_count, unique_item_count, sets_json, unique_item_ids_json, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
         ON DUPLICATE KEY UPDATE
           id = LAST_INSERT_ID(id),
           text_key = VALUES(text_key),
           benefit_expression = VALUES(benefit_expression),
           primary_part = VALUES(primary_part),
           set_count = VALUES(set_count),
           unique_item_count = VALUES(unique_item_count),
           sets_json = VALUES(sets_json),
           unique_item_ids_json = VALUES(unique_item_ids_json),
           status = 1,
           deleted = 0,
           updated_at = NOW()`,
        [
          sourceKey,
          toNullableString(r.textKey),
          toNullableString(r.benefitExpression),
          toNullableString(r.primaryPart),
          toNullableInteger(r.setCount) ?? 0,
          Array.isArray(r.uniqueItemIds) ? r.uniqueItemIds.length : 0,
          JSON.stringify(r.sets ?? []),
          JSON.stringify(r.uniqueItemIds ?? []),
        ]
      );
      const armorSetId = Number(result.insertId);
      if (existing) stats.updated += 1;
      else stats.created += 1;

      await conn.execute('DELETE FROM armor_set_items WHERE armor_set_id = ?', [armorSetId]);
      const variants = Array.isArray(r.sets) ? r.sets : [];
      relationStats.input += variants.reduce((sum, setArray) => sum + (Array.isArray(setArray) ? setArray.length : 0), 0);
      for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
        const setArray = Array.isArray(variants[variantIndex]) ? variants[variantIndex] : [];
        for (let partIndex = 0; partIndex < setArray.length; partIndex += 1) {
          const sourceItemId = toNullablePositiveInteger(setArray[partIndex]);
          const mapped = sourceItemId == null
            ? { sourceItemId: null, internalName: null, dbItem: null, reason: null }
            : resolveMappedItem(sourceItemId, sourceItemLookup, itemLookup);
          if (sourceItemId != null && mapped.reason) {
            recordUnmatched(relationStats, {
              reason: mapped.reason,
              armorSetSourceKey: sourceKey,
              textKey: toNullableString(r.textKey),
              benefitExpression: toNullableString(r.benefitExpression),
              sourceItemId,
              standardizedItemInternalName: mapped.internalName,
              setVariantIndex: variantIndex,
              partIndex,
            });
          }
          await conn.execute(
            `INSERT INTO armor_set_items
              (armor_set_id, set_variant_index, part_index, source_item_id, item_id, item_internal_name, item_name)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              armorSetId,
              variantIndex,
              partIndex,
              sourceItemId,
              mapped.dbItem?.id ?? null,
              mapped.internalName,
              mapped.dbItem?.name ?? null,
            ]
          );
          relationStats.updated += 1;
        }
      }
    } catch (error) {
      stats.errors.push(`armor_sets[${i}]: ${error?.message ?? String(error)}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = resolveIndependentEntityImportApply(args);
  const dataDir = path.resolve(
    args['data-dir']
    ?? process.env.TERRAPEDIA_STANDARDIZED_OUTPUT_DIR
    ?? path.join(repoRoot, 'data', 'standardized')
  );

  const conn = await mysql.createConnection({
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local',
    multipleStatements: true,
  });

  assertPrimaryDb(conn.config.database, args['allow-non-primary-db'] === 'true' || process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB === 'true');

  const buffs = loadStandardizedDataset(dataDir, 'buffs').records ?? [];
  const npcs = loadStandardizedDataset(dataDir, 'npcs').records ?? [];
  const projectiles = loadStandardizedDataset(dataDir, 'projectiles').records ?? [];
  const armorSets = loadStandardizedDataset(dataDir, 'armor_sets').records ?? [];
  const sourceItems = loadStandardizedDataset(dataDir, 'items').records ?? [];
  const sourceItemLookup = loadSourceItemLookup(sourceItems);

  const summary = {
    generatedAt: new Date().toISOString(),
    database: conn.config.database,
    apply,
    buffs: makeStats(),
    npcs: makeStats(),
    projectiles: makeStats(),
    armorSets: makeStats(),
    buffSourceItems: makeRelationStats(),
    armorSetItems: makeRelationStats(),
    npcItemLinks: {
      banner: makeItemLinkStats(),
      catchItem: makeItemLinkStats(),
    },
  };

  try {
    await conn.query('SET NAMES utf8mb4');
    await ensureSchema(conn);
    const itemLookup = await loadItemsLookup(conn);
    const categoryByCode = await loadCategoryCodeMap(conn);

    await conn.beginTransaction();
    await importBuffs(conn, buffs, itemLookup, sourceItemLookup, summary.buffs, summary.buffSourceItems);
    await importNpcs(conn, npcs, itemLookup, sourceItemLookup, categoryByCode, summary.npcs, summary.npcItemLinks);
    await importProjectiles(conn, projectiles, summary.projectiles);
    await importArmorSets(conn, armorSets, itemLookup, sourceItemLookup, summary.armorSets, summary.armorSetItems);
    if (apply) {
      await conn.commit();
    } else {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[import-independent-entities-to-db] failed');
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});

function assertPrimaryDb(database, allowNonPrimaryDb) {
  if (String(database || '').trim() === 'terria_v1_local') return;
  if (allowNonPrimaryDb) return;
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}
