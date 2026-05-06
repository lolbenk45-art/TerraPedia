#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs } from '../lib/wiki-item-utils.mjs';
import {
  buildTownNpcShopConditionLookup,
  extractTownNpcShopConditions,
  getRequiredTownNpcWorldContexts
} from '../lib/town-npc-shop-conditions.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const repoRoot = getProjectRoot();

const TOWN_NPC_SHOP_ITEM_ALIASES = new Map([
  ['闪耀翅膀', ["Cenx's Wings", 'Cenx的翅膀']],
]);

const TOWN_NPC_SHOP_ITEM_LEGACY_ONLY = new Set([
  '情人节戒指',
  'Wiesnbräu啤酒',
  '火鸡羽毛',
  '心箭',
  '节日大礼帽',
  '罗马焰火筒',
  '505顶饰',
  '老手杖',
  'George的帽子',
  'George的西装上衣',
  'George的裤子',
  '绝妙丝带',
  '绝妙礼服',
  '绝妙拖鞋',
  '啤酒节假发',
  '旦多尔女衫',
  '旦多尔裙',
  '登山帽',
  '皮背心',
  '皮裤',
  '多乐头部',
  '多乐身体',
  '多乐腿部',
  '粉白美头部',
  '粉白美身体',
  '粉白美腿部',
  '希炼衣',
  '希炼裤',
]);

const TOWN_NPC_SHOP_ITEM_GENERIC_PLACEHOLDERS = new Set([
  '任何晶塔',
  '堆石器',
  '逻辑门',
  '传送带',
]);

export async function runImportWikiTownNpcsToDb(rawArgs = process.argv.slice(2)) {
  const args = parseCliArgs(rawArgs);
  const apply = booleanOption(args.apply, false);
  const allowNonPrimaryDb = booleanOption(
    args['allow-non-primary-db'] ?? args.allowNonPrimaryDb ?? process.env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB,
    false
  );
  const replaceWhenNoMatchedShopEntries = booleanOption(
    args['replace-when-no-matched-shop-entries'] ?? args.replaceWhenNoMatchedShopEntries,
    false
  );
  const dateTag = new Date().toISOString().slice(0, 10);
  const inputPath = path.resolve(
    args.input ?? path.join(repoRoot, 'data', 'generated', 'wiki-town-npc-maintenance.latest.json')
  );
  const latestReportPath = path.resolve(
    args.output ?? path.join(repoRoot, 'data', 'generated', 'wiki-town-npc-import.latest.json')
  );
  const snapshotReportPath = path.resolve(
    args['snapshot-output'] ?? path.join(repoRoot, 'reports', `wiki-town-npc-import-${dateTag}.json`)
  );

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const config = loadLocalStackConfig(repoRoot);
  const db = {
    host: args.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(args.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
    user: args.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: args.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: args.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
  };

  assertPrimaryDb(db.database, apply, allowNonPrimaryDb);

  const payload = JSON.parse(await fs.promises.readFile(inputPath, 'utf8'));
  const records = Array.isArray(payload?.records) ? payload.records : [];

  const conn = await mysql.createConnection(db);
  try {
    await conn.query('SET NAMES utf8mb4');

    const npcLookup = await loadTownNpcLookup(conn);
    const itemLookup = await loadItemLookup(conn);
    const summary = {
      generatedAt: new Date().toISOString(),
      apply,
      database: db.database,
      inputPath,
      latestReportPath,
      snapshotReportPath,
      replaceWhenNoMatchedShopEntries,
      totalRecords: records.length,
      matchedNpcCount: 0,
      unmatchedNpcCount: 0,
      updatedGamePeriodCount: 0,
      updatedBehaviorNotesCount: 0,
      replacedShopNpcCount: 0,
      deletedShopEntryCount: 0,
      insertedShopEntryCount: 0,
      insertedShopConditionCount: 0,
      createdWorldContextCount: 0,
      unmatchedShopItemCount: 0,
      ignoredLegacyShopItemCount: 0,
      genericChoiceShopItemCount: 0,
      skippedShopReplaceCount: 0,
      unmatchedNpcSamples: [],
      unmatchedShopItemSamples: [],
      ignoredLegacyShopItemSamples: [],
      genericChoiceShopItemSamples: [],
      npcResults: []
    };

    const shopConditionContext = await prepareTownNpcShopConditionContext(conn, apply);
    summary.createdWorldContextCount = shopConditionContext.createdWorldContextCount;

    for (const record of records) {
      const result = await importTownNpcRecord(conn, record, {
        apply,
        npcLookup,
        itemLookup,
        shopConditionLookup: shopConditionContext.shopConditionLookup,
        replaceWhenNoMatchedShopEntries
      });
      summary.npcResults.push(result);
      if (result.npcMatched) summary.matchedNpcCount += 1;
      else {
        summary.unmatchedNpcCount += 1;
        pushSample(summary.unmatchedNpcSamples, {
          gameId: result.gameId,
          internalName: result.internalName,
          pageTitle: result.pageTitle
        });
      }
      if (result.updatedGamePeriod) summary.updatedGamePeriodCount += 1;
      if (result.updatedBehaviorNotes) summary.updatedBehaviorNotesCount += 1;
      if (result.shopReplaced) summary.replacedShopNpcCount += 1;
      summary.deletedShopEntryCount += result.deletedShopEntryCount;
      summary.insertedShopEntryCount += result.insertedShopEntryCount;
      summary.insertedShopConditionCount += result.insertedShopConditionCount;
      summary.unmatchedShopItemCount += result.unmatchedShopItems.length;
      summary.ignoredLegacyShopItemCount += result.ignoredLegacyShopItems.length;
      summary.genericChoiceShopItemCount += result.genericChoiceShopItems.length;
      if (result.shopReplaceSkipped) summary.skippedShopReplaceCount += 1;
      for (const item of result.unmatchedShopItems) {
        pushSample(summary.unmatchedShopItemSamples, {
          npcGameId: result.gameId,
          npcInternalName: result.internalName,
          itemNameEn: item.nameEn,
          priceText: item.priceText
        });
      }
      for (const item of result.ignoredLegacyShopItems) {
        pushSample(summary.ignoredLegacyShopItemSamples, {
          npcGameId: result.gameId,
          npcInternalName: result.internalName,
          itemNameEn: item.nameEn,
          priceText: item.priceText,
          reason: item.reason
        });
      }
      for (const item of result.genericChoiceShopItems) {
        pushSample(summary.genericChoiceShopItemSamples, {
          npcGameId: result.gameId,
          npcInternalName: result.internalName,
          itemNameEn: item.nameEn,
          priceText: item.priceText,
          reason: item.reason
        });
      }
    }

    if (apply) {
      await conn.commit();
    }

    await writeJson(latestReportPath, summary);
    await writeJson(snapshotReportPath, summary);
    return summary;
  } catch (error) {
    if (apply) {
      await conn.rollback();
    }
    throw error;
  } finally {
    await conn.end();
  }
}

export async function prepareTownNpcShopConditionContext(connection, shouldApply, dependencies = {}) {
  const ensureWorldContexts = dependencies.ensureWorldContexts ?? ensureTownNpcWorldContexts;
  const loadShopConditionLookup = dependencies.loadShopConditionLookup ?? loadTownNpcShopConditionLookup;

  if (shouldApply) {
    await connection.beginTransaction();
  }

  const createdWorldContextCount = await ensureWorldContexts(connection, shouldApply);
  const shopConditionLookup = await loadShopConditionLookup(connection);
  return {
    createdWorldContextCount,
    shopConditionLookup
  };
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectExecution()) {
  const summary = await runImportWikiTownNpcsToDb();
  console.log(JSON.stringify(summary, null, 2));
}

async function importTownNpcRecord(connection, rawRecord, context) {
  const gameId = toInt(rawRecord?.gameId);
  const internalName = toText(rawRecord?.internalName);
  const pageTitle = toText(rawRecord?.pageTitle);
  const npc = findNpc(context.npcLookup, gameId, internalName);

  const result = {
    gameId,
    internalName,
    pageTitle,
    npcId: npc?.id ?? null,
    npcMatched: Boolean(npc?.id),
    updatedGamePeriod: false,
    updatedBehaviorNotes: false,
    shopReplaced: false,
    shopReplaceSkipped: false,
    deletedShopEntryCount: 0,
    insertedShopEntryCount: 0,
    insertedShopConditionCount: 0,
    matchedShopItems: [],
    ignoredLegacyShopItems: [],
    genericChoiceShopItems: [],
    unmatchedShopItems: []
  };

  if (!npc?.id) {
    return result;
  }

  const nextGamePeriodId = toInt(rawRecord?.suggestedGamePeriodId);
  const nextBehaviorNotes = toText(rawRecord?.functionSummary)
    ? buildBehaviorNotes(rawRecord?.functionSummary, rawRecord?.moveInSummary)
    : null;

  if (context.apply) {
    if (nextGamePeriodId != null && Number(npc.gamePeriodId ?? 0) !== nextGamePeriodId) {
      await connection.execute(
        `UPDATE npcs
            SET game_period_id = ?,
                updated_at = NOW()
          WHERE id = ?`,
        [nextGamePeriodId, npc.id]
      );
      result.updatedGamePeriod = true;
      npc.gamePeriodId = nextGamePeriodId;
    }

    if (nextBehaviorNotes && normalizeMultiline(npc.behaviorNotes) !== normalizeMultiline(nextBehaviorNotes)) {
      await connection.execute(
        `UPDATE npcs
            SET behavior_notes = ?,
                updated_at = NOW()
          WHERE id = ?`,
        [nextBehaviorNotes, npc.id]
      );
      result.updatedBehaviorNotes = true;
      npc.behaviorNotes = nextBehaviorNotes;
    }
  } else {
    result.updatedGamePeriod = nextGamePeriodId != null && Number(npc.gamePeriodId ?? 0) !== nextGamePeriodId;
    result.updatedBehaviorNotes = Boolean(nextBehaviorNotes && normalizeMultiline(npc.behaviorNotes) !== normalizeMultiline(nextBehaviorNotes));
  }

  const preparedShopEntries = prepareShopEntries(
    rawRecord?.shopItems,
    context.itemLookup,
    context.shopConditionLookup,
    result
  );
  const shouldReplaceShop = preparedShopEntries.length > 0 || context.replaceWhenNoMatchedShopEntries;

  if (!shouldReplaceShop) {
    result.shopReplaceSkipped = true;
    return result;
  }

  const deletedEntryIds = await loadNpcShopEntryIds(connection, npc.id);
  result.deletedShopEntryCount = deletedEntryIds.length;

  if (context.apply) {
    if (deletedEntryIds.length > 0) {
      const placeholders = deletedEntryIds.map(() => '?').join(',');
      await connection.execute(
        `DELETE FROM npc_shop_conditions WHERE shop_entry_id IN (${placeholders})`,
        deletedEntryIds
      );
      await connection.execute(
        `DELETE FROM npc_shop_entries WHERE id IN (${placeholders})`,
        deletedEntryIds
      );
    }

    for (let index = 0; index < preparedShopEntries.length; index += 1) {
      const entry = preparedShopEntries[index];
      const [insertResult] = await connection.execute(
        `INSERT INTO npc_shop_entries
          (npc_id, item_id, source_item_id, price_text, notes, sort_order, status, deleted)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          npc.id,
          entry.itemId,
          null,
          entry.priceText,
          entry.notes,
          index + 1
        ]
      );
      const shopEntryId = Number(insertResult?.insertId);
      result.insertedShopEntryCount += 1;

      for (let conditionIndex = 0; conditionIndex < entry.conditions.length; conditionIndex += 1) {
        const condition = entry.conditions[conditionIndex];
        await connection.execute(
          `INSERT INTO npc_shop_conditions
            (shop_entry_id, ref_type, ref_id, condition_role, notes, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            shopEntryId,
            condition.refType,
            condition.refId,
            condition.conditionRole ?? 'required',
            condition.notes ?? null,
            conditionIndex
          ]
        );
        result.insertedShopConditionCount += 1;
      }
    }
    result.shopReplaced = true;
  } else {
    result.insertedShopEntryCount = preparedShopEntries.length;
    result.insertedShopConditionCount = preparedShopEntries.reduce(
      (sum, entry) => sum + entry.conditions.length,
      0
    );
    result.shopReplaced = true;
  }

  return result;
}

function prepareShopEntries(rawItems, itemLookup, shopConditionLookup, result) {
  const entries = [];
  const seenItemIds = new Set();
  for (const rawItem of Array.isArray(rawItems) ? rawItems : []) {
    const matchedItem = findItem(itemLookup, rawItem);
    if (!matchedItem?.id) {
      const disposition = classifyTownNpcShopItemDisposition(rawItem);
      if (disposition?.kind === 'ignored_legacy_only') {
        result.ignoredLegacyShopItems.push({
          nameZh: toText(rawItem?.nameZh),
          nameEn: toText(rawItem?.nameEn),
          priceText: toText(rawItem?.priceText),
          availability: toText(rawItem?.availability),
          reason: disposition.reason,
        });
        continue;
      }
      if (disposition?.kind === 'generic_choice_placeholder') {
        result.genericChoiceShopItems.push({
          nameZh: toText(rawItem?.nameZh),
          nameEn: toText(rawItem?.nameEn),
          priceText: toText(rawItem?.priceText),
          availability: toText(rawItem?.availability),
          reason: disposition.reason,
        });
        continue;
      }
      result.unmatchedShopItems.push({
        nameZh: toText(rawItem?.nameZh),
        nameEn: toText(rawItem?.nameEn),
        priceText: toText(rawItem?.priceText),
        availability: toText(rawItem?.availability)
      });
      continue;
    }
    if (seenItemIds.has(matchedItem.id)) {
      continue;
    }
    seenItemIds.add(matchedItem.id);
    entries.push({
      itemId: matchedItem.id,
      priceText: toText(rawItem?.priceText),
      notes: toText(rawItem?.availability),
      conditions: extractTownNpcShopConditions(toText(rawItem?.availability), shopConditionLookup)
    });
    result.matchedShopItems.push({
      itemId: matchedItem.id,
      itemName: matchedItem.name,
      itemNameZh: matchedItem.nameZh,
      sourceNameZh: toText(rawItem?.nameZh),
      sourceNameEn: toText(rawItem?.nameEn)
    });
  }
  return entries;
}

export function classifyTownNpcShopItemDisposition(rawItem) {
  const names = [
    toText(rawItem?.nameZh),
    toText(rawItem?.nameEn),
  ].filter(Boolean);
  for (const name of names) {
    if (TOWN_NPC_SHOP_ITEM_GENERIC_PLACEHOLDERS.has(name)) {
      return {
        kind: 'generic_choice_placeholder',
        canonicalName: null,
        reason: 'generic_choice_placeholder',
      };
    }
    if (TOWN_NPC_SHOP_ITEM_LEGACY_ONLY.has(name)) {
      return {
        kind: 'ignored_legacy_only',
        canonicalName: null,
        reason: 'legacy_only_shop_item',
      };
    }
  }
  return null;
}

export function findItem(itemLookup, rawItem) {
  const candidates = buildItemMatchCandidates(rawItem);
  for (const candidate of candidates) {
    const key = normalizeLookupKey(candidate);
    if (!key) continue;
    const item = itemLookup.byAny.get(key);
    if (item) {
      return item;
    }
  }
  return null;
}

function buildItemMatchCandidates(rawItem) {
  const baseCandidates = [
    toText(rawItem?.nameZh),
    toText(rawItem?.nameEn),
    normalizeUnderscoreText(rawItem?.nameEn),
    normalizeUnderscoreText(rawItem?.nameZh)
  ].filter(Boolean);

  const candidates = [];
  const seen = new Set();
  for (const candidate of baseCandidates) {
    pushCandidate(candidates, seen, candidate);
    pushCandidate(candidates, seen, stripTrailingItemQualifier(candidate));
    for (const alias of resolveTownNpcShopItemAliases(candidate)) {
      pushCandidate(candidates, seen, alias);
    }
  }
  return candidates;
}

function pushCandidate(candidates, seen, value) {
  const text = toText(value);
  if (!text || seen.has(text)) {
    return;
  }
  seen.add(text);
  candidates.push(text);
}

function stripTrailingItemQualifier(value) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  const stripped = text.replace(/\s*[（(][^（）()]+[）)]\s*$/u, '').trim();
  return stripped === text ? null : stripped;
}

function resolveTownNpcShopItemAliases(value) {
  const text = toText(value);
  if (!text) {
    return [];
  }
  return TOWN_NPC_SHOP_ITEM_ALIASES.get(text) ?? [];
}

function findNpc(npcLookup, gameId, internalName) {
  if (gameId != null && npcLookup.byGameId.has(gameId)) {
    return npcLookup.byGameId.get(gameId);
  }
  const key = normalizeLookupKey(internalName);
  if (key && npcLookup.byInternalName.has(key)) {
    return npcLookup.byInternalName.get(key);
  }
  return null;
}

async function loadNpcShopEntryIds(connection, npcId) {
  const [rows] = await connection.execute(
    `SELECT id
       FROM npc_shop_entries
      WHERE npc_id = ?`,
    [npcId]
  );
  return rows.map((row) => Number(row.id)).filter(Number.isFinite);
}

async function loadTownNpcLookup(connection) {
  const [rows] = await connection.query(
    `SELECT id, game_id AS gameId, internal_name AS internalName, game_period_id AS gamePeriodId, behavior_notes AS behaviorNotes
       FROM npcs
      WHERE COALESCE(is_town_npc, 0) = 1`
  );
  const lookup = {
    byGameId: new Map(),
    byInternalName: new Map()
  };
  for (const row of rows) {
    const npc = {
      id: Number(row.id),
      gameId: toInt(row.gameId),
      internalName: toText(row.internalName),
      gamePeriodId: toInt(row.gamePeriodId),
      behaviorNotes: toText(row.behaviorNotes)
    };
    if (npc.gameId != null && !lookup.byGameId.has(npc.gameId)) {
      lookup.byGameId.set(npc.gameId, npc);
    }
    const key = normalizeLookupKey(npc.internalName);
    if (key && !lookup.byInternalName.has(key)) {
      lookup.byInternalName.set(key, npc);
    }
  }
  return lookup;
}

async function loadItemLookup(connection) {
  const [rows] = await connection.query(
    `SELECT id, internal_name AS internalName, name, name_zh AS nameZh
       FROM items
      WHERE deleted = 0`
  );
  const lookup = {
    byAny: new Map()
  };
  for (const row of rows) {
    const item = {
      id: Number(row.id),
      internalName: toText(row.internalName),
      name: toText(row.name),
      nameZh: toText(row.nameZh)
    };
    for (const value of [item.internalName, item.name, item.nameZh]) {
      const key = normalizeLookupKey(value);
      if (key && !lookup.byAny.has(key)) {
        lookup.byAny.set(key, item);
      }
    }
  }
  return lookup;
}

async function loadTownNpcShopConditionLookup(connection) {
  const [biomes] = await connection.query(
    `SELECT id, code, name_zh AS nameZh, name_en AS nameEn
       FROM biomes
      WHERE deleted = 0`
  );
  const [gamePeriods] = await connection.query(
    `SELECT id, code, display_name_zh AS nameZh, display_name_en AS nameEn
       FROM game_period
      WHERE deleted = 0`
  );
  const [items] = await connection.query(
    `SELECT id, internal_name AS internalName, name AS nameEn, name_zh AS nameZh
       FROM items
      WHERE deleted = 0`
  );
  const [npcs] = await connection.query(
    `SELECT id, internal_name AS internalName, name AS nameEn, name_zh AS nameZh
       FROM npcs
      WHERE deleted = 0
      ORDER BY id ASC`
  );
  const [worldContexts] = await connection.query(
    `SELECT id, code, name_zh AS nameZh, name_en AS nameEn
       FROM world_contexts
      WHERE deleted = 0`
  );
  const mergedWorldContexts = dedupeWorldContextsByCode([
    ...worldContexts,
    ...getRequiredTownNpcWorldContexts()
  ]);
  return buildTownNpcShopConditionLookup({
    biomes,
    gamePeriods,
    items,
    npcs,
    worldContexts: mergedWorldContexts
  });
}

async function ensureTownNpcWorldContexts(connection, shouldApply) {
  const requiredContexts = getRequiredTownNpcWorldContexts();
  if (requiredContexts.length === 0) {
    return 0;
  }

  const [existingRows] = await connection.query(
    `SELECT code
       FROM world_contexts
      WHERE deleted = 0`
  );
  const existingCodes = new Set(
    existingRows
      .map((row) => toText(row.code))
      .filter(Boolean)
  );

  const missing = requiredContexts.filter((entry) => !existingCodes.has(entry.code));
  if (!shouldApply || missing.length === 0) {
    return missing.length;
  }

  for (const entry of missing) {
    await connection.execute(
      `INSERT INTO world_contexts
        (code, name_en, name_zh, context_type, description, sort_order, status, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        entry.code,
        entry.nameEn,
        entry.nameZh,
        entry.contextType,
        entry.description ?? null,
        entry.sortOrder ?? 0,
        entry.status ?? 1
      ]
    );
  }

  return missing.length;
}

function dedupeWorldContextsByCode(rows) {
  const result = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const code = toText(row?.code);
    if (!code || result.has(code)) {
      continue;
    }
    result.set(code, row);
  }
  return [...result.values()];
}

function buildBehaviorNotes(functionSummary, moveInSummary) {
  const parts = [];
  const functionText = toText(functionSummary);
  const moveInText = toText(moveInSummary);
  if (functionText) {
    parts.push(functionText);
  }
  if (moveInText) {
    parts.push(`入住条件：${moveInText}`);
  }
  return parts.join('\n\n') || null;
}

async function writeJson(filePath, payload) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function normalizeUnderscoreText(value) {
  const text = toText(value);
  return text ? text.replace(/_/g, ' ') : null;
}

function normalizeLookupKey(value) {
  const text = toText(value);
  return text
    ? text
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    : '';
}

function normalizeMultiline(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function pushSample(list, value) {
  if (list.length < 100) {
    list.push(value);
  }
}

function toText(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text === '' ? null : text;
}

function toInt(value) {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function assertPrimaryDb(database, shouldApply, allowNonPrimary) {
  if (!shouldApply) {
    return;
  }
  if (String(database || '').trim() === 'terria_v1_local') {
    return;
  }
  if (allowNonPrimary) {
    return;
  }
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}
