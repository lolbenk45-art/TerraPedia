#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);

const CATEGORY_DEFINITIONS = [
  { code: 'ACCESSORY', name: '饰品', parentCode: null, topType: 'ACCESSORY', sort: 51 },
  { code: 'ACCESSORY_SHIELD', name: '盾牌', parentCode: 'ACCESSORY', topType: 'ACCESSORY', sort: 50 },
  { code: 'ACCESSORY_BOOTS', name: '靴子', parentCode: 'ACCESSORY', topType: 'ACCESSORY', sort: 49 },
  { code: 'ACCESSORY_MISC', name: '其他饰品', parentCode: 'ACCESSORY', topType: 'ACCESSORY', sort: 48 },
  { code: 'ACCESSORY_WINGS', name: '翅膀', parentCode: 'ACCESSORY', topType: 'ACCESSORY', sort: 47 },
  { code: 'VANITY', name: '时装', parentCode: null, topType: 'VANITY', sort: 52 },
  { code: 'DYE', name: '染料', parentCode: null, topType: 'DYE', sort: 53 },
  { code: 'PET', name: '宠物召唤', parentCode: null, topType: 'PET', sort: 54 },
  { code: 'MOUNT', name: '坐骑召唤', parentCode: null, topType: 'MOUNT', sort: 55 },
  { code: 'CRITTER', name: '小动物', parentCode: null, topType: 'CRITTER', sort: 56 },
  { code: 'MISC', name: '杂项', parentCode: null, topType: 'MISC', sort: 57 },
  { code: 'CONSUMABLE_POTION', name: '药水', parentCode: 'CONSUMABLE', topType: 'CONSUMABLE', sort: 10 },
  { code: 'CONSUMABLE_SUMMON', name: '召唤物品', parentCode: 'CONSUMABLE', topType: 'CONSUMABLE', sort: 9 },
  { code: 'CONSUMABLE_GRAB_BAG', name: '抓包与宝匣', parentCode: 'CONSUMABLE', topType: 'CONSUMABLE', sort: 8 },
  { code: 'CONSUMABLE_PERMANENT_BOOSTER', name: '永久增益', parentCode: 'CONSUMABLE', topType: 'CONSUMABLE', sort: 7 },
  { code: 'CONSUMABLE_MISC', name: '其他消耗品', parentCode: 'CONSUMABLE', topType: 'CONSUMABLE', sort: 6 },
  { code: 'CONSUMABLE_FOOD', name: '食物与饮品', parentCode: 'CONSUMABLE', topType: 'CONSUMABLE', sort: 5 },
  { code: 'MATERIAL_ORE', name: '矿石', parentCode: 'MATERIAL', topType: 'MATERIAL', sort: 15 },
  { code: 'MATERIAL_BAR', name: '锭', parentCode: 'MATERIAL', topType: 'MATERIAL', sort: 14 },
  { code: 'MATERIAL_GEM', name: '宝石', parentCode: 'MATERIAL', topType: 'MATERIAL', sort: 13 },
  { code: 'MATERIAL_SEED', name: '种子', parentCode: 'MATERIAL', topType: 'MATERIAL', sort: 12 },
  { code: 'MATERIAL_POTION_INGREDIENT', name: '药水材料', parentCode: 'MATERIAL', topType: 'MATERIAL', sort: 11 },
  { code: 'MATERIAL_BLOCK', name: '物块', parentCode: 'MATERIAL', topType: 'MATERIAL', sort: 10 },
  { code: 'MATERIAL_BRICK', name: '砖块', parentCode: 'MATERIAL', topType: 'MATERIAL', sort: 9 },
  { code: 'MATERIAL_WALL', name: '墙', parentCode: 'MATERIAL', topType: 'MATERIAL', sort: 8 },
  { code: 'MATERIAL_MISC', name: '其他材料', parentCode: 'MATERIAL', topType: 'MATERIAL', sort: 7 },
  { code: 'MATERIAL_CURRENCY', name: '货币', parentCode: 'MATERIAL', topType: 'MATERIAL', sort: 6 },
  { code: 'MATERIAL_KEY', name: '钥匙', parentCode: 'MATERIAL', topType: 'MATERIAL', sort: 5 },
];

export async function runItemCategorySync(rawArgs = parseArgs(process.argv.slice(2)), dependencies = {}) {
  const repoRoot = path.resolve(dependencies.repoRoot || process.cwd());
  const apply = rawArgs.apply === true || rawArgs.apply === 'true';
  const reportPath = rawArgs.report || path.join(repoRoot, 'reports', `items-wiki-category-sync-${new Date().toISOString().slice(0, 10)}.json`);
  const itemPagesDir = path.resolve(
    repoRoot,
    rawArgs.itemPagesDir || path.join('..', 'data', 'terraPedia', 'raw', 'wiki', 'item-pages')
  );
  const standardizedPath = path.join(repoRoot, 'data', 'standardized', 'items.standardized.json');
  const db = dependencies.db || {
    host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT || '3306'),
    user: process.env.TERRAPEDIA_DB_USERNAME || 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD || 'root',
    database: process.env.TERRAPEDIA_DB_NAME || 'terria_v1_local',
  };

  if (!dependencies.wikiPagesByInternal && !fs.existsSync(itemPagesDir)) {
    throw new Error(`Item pages directory not found: ${itemPagesDir}`);
  }
  if (!dependencies.standardizedByInternal && !fs.existsSync(standardizedPath)) {
    throw new Error(`Standardized items dataset not found: ${standardizedPath}`);
  }

  const standardizedByInternal = dependencies.standardizedByInternal || buildStandardizedIndex(
    JSON.parse(fs.readFileSync(standardizedPath, 'utf8'))
  );
  const wikiPagesByInternal = dependencies.wikiPagesByInternal || loadWikiPages(itemPagesDir);
  const ownConnection = !dependencies.connection;
  const connection = dependencies.connection || await mysql.createConnection(db);

  try {
    if (apply) {
      await connection.beginTransaction();
    }

    const categoryLookup = await ensureCategories(connection, apply);
    const items = dependencies.items || await loadItems(connection);

    let scanned = 0;
    let wikiMatched = 0;
    let classified = 0;
    let updated = 0;
    let skippedInactive = 0;
    let skippedNoWiki = 0;
    let skippedNoCategory = 0;
    const samples = [];

    for (const item of items) {
      scanned += 1;
      if (Number(item.status || 0) !== 1) {
        skippedInactive += 1;
        continue;
      }

      const internalName = toText(item.internal_name);
      const wiki = internalName ? wikiPagesByInternal.get(internalName) : null;
      if (!wiki) {
        skippedNoWiki += 1;
        continue;
      }

      wikiMatched += 1;
      const standardizedRecord = internalName ? standardizedByInternal.get(internalName) : null;
      const result = classifyItem({
        item,
        wiki,
        standardizedRecord,
        categoryLookup,
      });

      if (!result?.categoryCode) {
        skippedNoCategory += 1;
        if (samples.length < 40) {
          samples.push({
            id: item.id,
            internalName,
            currentCategoryCode: item.current_category_code || null,
            reason: result?.reason || 'unclassified',
          });
        }
        continue;
      }

      const nextCategory = categoryLookup.byCode.get(result.categoryCode);
      if (!nextCategory?.id) {
        skippedNoCategory += 1;
        if (samples.length < 40) {
          samples.push({
            id: item.id,
            internalName,
            currentCategoryCode: item.current_category_code || null,
            categoryCode: result.categoryCode,
            reason: 'missing_category_row',
          });
        }
        continue;
      }

      classified += 1;
      const currentCode = toText(item.current_category_code);
      const relatedCategoryCodes = buildRelatedCategoryCodes({
        primaryCode: result.categoryCode,
        wiki,
        categoryLookup,
      });
      const shouldUpdate = shouldApplyCategoryChange({
        currentCode,
        nextCode: result.categoryCode,
        categoryLookup,
        reason: result.reason,
      });

      if (samples.length < 40) {
        samples.push({
          id: item.id,
          internalName,
          currentCategoryCode: currentCode,
          nextCategoryCode: result.categoryCode,
          reason: result.reason,
          willUpdate: shouldUpdate,
        });
      }

      if (!shouldUpdate) {
        if (apply) {
          await syncItemCategoryRelations(connection, {
            itemId: item.id,
            categoryCodes: relatedCategoryCodes,
            primaryCode: result.categoryCode,
            wiki,
            categoryLookup,
          });
        }
        continue;
      }

      if (apply) {
        const [updateResult] = await connection.execute(
          'UPDATE items SET category_id = ?, updated_at = NOW() WHERE id = ?',
          [nextCategory.id, item.id]
        );
        updated += Number(updateResult.affectedRows || 0);
        await syncItemCategoryRelations(connection, {
          itemId: item.id,
          categoryCodes: relatedCategoryCodes,
          primaryCode: result.categoryCode,
          wiki,
          categoryLookup,
        });
      } else {
        updated += 1;
      }
    }

    if (apply) {
      await connection.commit();
    }

    const report = {
      apply,
      db,
      itemPagesDir,
      scanned,
      wikiMatched,
      classified,
      updated,
      skippedInactive,
      skippedNoWiki,
      skippedNoCategory,
      samples,
    };

    if (!dependencies.skipWriteReport) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    }

    return { report, reportPath };
  } catch (error) {
    if (apply) {
      await connection.rollback();
    }
    throw error;
  } finally {
    if (ownConnection) {
      await connection.end();
    }
  }
}

async function loadItems(connection) {
  const [items] = await connection.query(`
    SELECT i.id, i.name, i.internal_name, i.category_id, i.status, c.code AS current_category_code
    FROM items i
    LEFT JOIN category c ON c.id = i.category_id AND c.deleted = 0
    WHERE i.deleted = 0
    ORDER BY i.id ASC
  `);
  return items;
}

function buildStandardizedIndex(standardized) {
  const standardizedByInternal = new Map();
  for (const record of standardized.records || []) {
    const internalName = toText(record?.internalName);
    if (internalName) standardizedByInternal.set(internalName, record);
  }
  return standardizedByInternal;
}

export async function ensureCategories(connection, applyChanges) {
  const [categoryRows] = await connection.query(
    'SELECT id, parent_id, code, name FROM category WHERE deleted = 0 ORDER BY id ASC'
  );

  const byCode = new Map(categoryRows.map((row) => [String(row.code), row]));
  if (!applyChanges) {
    const virtualRows = categoryRows.map((row) => ({ ...row }));
    const virtualByCode = new Map(virtualRows.map((row) => [String(row.code), row]));
    let nextVirtualId = -1;
    let inserted = true;
    while (inserted) {
      inserted = false;
      for (const definition of CATEGORY_DEFINITIONS) {
        if (virtualByCode.has(definition.code)) continue;
        if (definition.parentCode && !virtualByCode.has(definition.parentCode)) continue;
        const parentId = definition.parentCode ? Number(virtualByCode.get(definition.parentCode)?.id || 0) : 0;
        const row = {
          id: nextVirtualId--,
          parent_id: parentId,
          code: definition.code,
          name: definition.name,
        };
        virtualRows.push(row);
        virtualByCode.set(definition.code, row);
        inserted = true;
      }
    }
    return buildCategoryLookup(virtualRows);
  }

  for (const definition of CATEGORY_DEFINITIONS) {
    if (byCode.has(definition.code)) continue;
    const parentId = definition.parentCode ? Number(byCode.get(definition.parentCode)?.id || 0) : 0;
    if (definition.parentCode && !parentId) continue;
    const [result] = await connection.execute(
      `INSERT INTO category (parent_id, name, code, top_type, sort, status, creator_id, deleted)
       VALUES (?, ?, ?, ?, ?, 1, 1, 0)`,
      [parentId, definition.name, definition.code, definition.topType, definition.sort]
    );
    byCode.set(definition.code, {
      id: Number(result.insertId),
      parent_id: parentId,
      code: definition.code,
      name: definition.name,
    });
  }

  const [refreshedRows] = await connection.query(
    'SELECT id, parent_id, code, name FROM category WHERE deleted = 0 ORDER BY id ASC'
  );
  return buildCategoryLookup(refreshedRows);
}

function buildCategoryLookup(rows) {
  const byCode = new Map(rows.map((row) => [String(row.code), row]));
  const depthByCode = new Map();
  const parentCodeByCode = new Map();

  function depthFor(code) {
    if (!code || !byCode.has(code)) return 0;
    if (depthByCode.has(code)) return depthByCode.get(code);
    const row = byCode.get(code);
    const parent = rows.find((candidate) => Number(candidate.id) === Number(row.parent_id));
    parentCodeByCode.set(code, parent ? String(parent.code) : null);
    const depth = parent ? depthFor(parent.code) + 1 : 1;
    depthByCode.set(code, depth);
    return depth;
  }

  for (const row of rows) {
    depthFor(String(row.code));
  }

  return { byCode, depthByCode, parentCodeByCode };
}

export function classifyItem({ item, wiki, standardizedRecord }) {
  const text = String(wiki.wikitext || '');
  const normalizedText = text.toLowerCase();
  const infoboxText = extractItemInfobox(text);
  const typeTokens = extractTypeTokens(infoboxText);
  const tagTokens = extractTagTokens(infoboxText);
  const showFlags = extractShowFlags(text);
  const listcat = normalizeFreeText(extractSingleValue(infoboxText, 'listcat'));
  const wikiCategories = extractWikiCategories(text);
  const standardizedCategory = normalizeCode(standardizedRecord?.categoryCode);

  if (standardizedCategory === 'PICKAXE') return { categoryCode: 'TOOL_PICKAXE_DRILL', reason: 'standardized_pickaxe' };
  if (standardizedCategory === 'AXE') return { categoryCode: 'TOOL_AXE_CHAINSAW', reason: 'standardized_axe' };
  if (standardizedCategory === 'HELMET') return { categoryCode: 'ARMOR_PART_HEAD', reason: 'standardized_helmet' };
  if (standardizedCategory === 'CHESTPLATE') return { categoryCode: 'ARMOR_PART_BODY', reason: 'standardized_chestplate' };
  if (standardizedCategory === 'LEGGINGS') return { categoryCode: 'ARMOR_PART_LEGS', reason: 'standardized_leggings' };

  const byListcat = classifyByListcat(listcat);
  if (byListcat) return { categoryCode: byListcat, reason: `listcat:${listcat}` };

  const byExplicitType = classifyByTypeTokens({ typeTokens, tagTokens, normalizedText, showFlags, itemName: item.name });
  if (byExplicitType) return { categoryCode: byExplicitType, reason: `type:${typeTokens.join('|') || 'none'}` };

  const byTemplate = classifyByTemplates({ showFlags, tagTokens, normalizedText, itemName: item.name });
  if (byTemplate) return { categoryCode: byTemplate, reason: `template:${[...showFlags].join('|')}` };

  const byWikiCategory = classifyByWikiCategories({ wikiCategories, normalizedText, itemName: item.name });
  if (byWikiCategory) return { categoryCode: byWikiCategory, reason: `wiki_categories:${wikiCategories.slice(0, 4).join('|')}` };

  const byName = classifyByNameHeuristics({ normalizedText, itemName: item.name, standardizedCategory });
  if (byName) return { categoryCode: byName, reason: 'name_heuristic' };

  if (standardizedCategory) {
    const fallback = classifyByStandardizedRoot(standardizedCategory);
    if (fallback) return { categoryCode: fallback, reason: `standardized_root:${standardizedCategory}` };
  }

  return { categoryCode: null, reason: 'no_rule_matched' };
}

function classifyByListcat(listcat) {
  if (!listcat) return null;
  if (containsAny(listcat, ['boomerang'])) return 'WEAPON_MELEE_BOOMERANG';
  if (containsAny(listcat, ['yoyo'])) return 'WEAPON_MELEE_YOYO';
  if (containsAny(listcat, ['spear'])) return 'WEAPON_MELEE_SPEAR';
  if (containsAny(listcat, ['flail'])) return 'WEAPON_MELEE_FLAIL';
  if (containsAny(listcat, ['broadsword', 'shortsword'])) return 'WEAPON_MELEE_SWORD';
  if (containsAny(listcat, ['bows', 'bow ', 'repeaters'])) return 'WEAPON_RANGED_BOW_CROSSBOW';
  if (containsAny(listcat, ['guns', 'scope'])) return 'WEAPON_RANGED_GUN';
  if (containsAny(listcat, ['launcher'])) return 'WEAPON_RANGED_LAUNCHER';
  if (containsAny(listcat, ['magic guns'])) return 'WEAPON_MAGIC_GUN';
  if (containsAny(listcat, ['spell book', 'spell books'])) return 'WEAPON_MAGIC_SPELLBOOK';
  if (containsAny(listcat, ['wands', 'wand'])) return 'WEAPON_MAGIC_WAND';
  if (containsAny(listcat, ['whips', 'whip'])) return 'WEAPON_SUMMON_WHIP';
  if (containsAny(listcat, ['explosives', 'explosive'])) return 'WEAPON_OTHER_EXPLOSIVE';
  if (containsAny(listcat, ['storage item'])) return 'FURNITURE_STORAGE';
  if (containsAny(listcat, ['potion ingredient'])) return 'MATERIAL_POTION_INGREDIENT';
  if (containsAny(listcat, ['ammunition'])) return 'AMMUNITION_OTHER_TYPE';
  return null;
}

function classifyByTypeTokens({ typeTokens, tagTokens, normalizedText, showFlags, itemName }) {
  const tokenSet = new Set(typeTokens);
  const tagSet = new Set(tagTokens);
  const joined = typeTokens.join(' ');
  const normalizedName = String(itemName || '').toLowerCase();

  if (tokenSet.has('pet summon') || tokenSet.has('light pet')) return 'PET';
  if (tokenSet.has('mount summon')) return 'MOUNT';
  if (tokenSet.has('critter') || tokenSet.has('gold critter')) return 'CRITTER';
  if (tokenSet.has('vanity')) return 'VANITY';
  if (tokenSet.has('dye')) return 'DYE';
  if (tokenSet.has('shield')) return 'ACCESSORY_SHIELD';
  if (tokenSet.has('boots')) return 'ACCESSORY_BOOTS';
  if (tokenSet.has('armor')) return 'ARMOR_OTHER';

  if (tokenSet.has('boss summon') || tokenSet.has('event summon')) return 'CONSUMABLE_SUMMON';
  if (tokenSet.has('potion')) return 'CONSUMABLE_POTION';
  if (tokenSet.has('permanent booster')) return 'CONSUMABLE_PERMANENT_BOOSTER';
  if (tokenSet.has('grab bag') || tokenSet.has('crate')) return 'CONSUMABLE_GRAB_BAG';
  if (tokenSet.has('consumable')) return 'CONSUMABLE_MISC';

  if (tokenSet.has('ore')) return 'MATERIAL_ORE';
  if (tokenSet.has('bar')) return 'MATERIAL_BAR';
  if (tokenSet.has('gem')) return 'MATERIAL_GEM';
  if (tokenSet.has('seeds')) return 'MATERIAL_SEED';
  if (tokenSet.has('crafting material')) return 'MATERIAL_MISC';
  if (tokenSet.has('brick')) return 'MATERIAL_BRICK';
  if (tokenSet.has('wall')) return 'MATERIAL_WALL';

  if (tokenSet.has('furniture') || tokenSet.has('background object')) {
    if (tokenSet.has('crafting station')) return 'FURNITURE_CRAFTING_STATION';
    if (tokenSet.has('storage')) return 'FURNITURE_STORAGE';
    if (tokenSet.has('light source')) return 'FURNITURE_LIGHT';
    if (tokenSet.has('mechanism')) return 'FURNITURE_FUNCTIONAL';
    return 'FURNITURE_DECORATION';
  }

  if (tokenSet.has('light source')) return 'FURNITURE_LIGHT';

  if (tokenSet.has('block') || tokenSet.has('brick') || tokenSet.has('wall')) {
    if (tokenSet.has('mechanism')) return 'FURNITURE_FUNCTIONAL';
    if (tokenSet.has('brick')) return 'MATERIAL_BRICK';
    if (tokenSet.has('wall')) return 'MATERIAL_WALL';
    return 'MATERIAL_BLOCK';
  }

  if (tokenSet.has('ammunition')) {
    if (containsAny(`${normalizedName} ${normalizedText}`, ['arrow'])) return 'AMMUNITION_ARROW';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['bullet'])) return 'AMMUNITION_BULLET';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['rocket'])) return 'AMMUNITION_ROCKET';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['dart'])) return 'AMMUNITION_DART';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['flare'])) return 'AMMUNITION_FLASH';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['bait'])) return 'AMMUNITION_TOOL_BAIT';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['solution'])) return 'AMMUNITION_TOOL_SOLUTION';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['wire'])) return 'AMMUNITION_TOOL_WIRE';
    return 'AMMUNITION_OTHER_TYPE';
  }

  if (tokenSet.has('weapon') && tokenSet.has('tool')) return 'WEAPON_OTHER_TOOL';
  if (tokenSet.has('tool') && tokenSet.has('miscellaneous')) return 'TOOL_OTHER_OTHER';
  if (tokenSet.has('miscellaneous') && showFlags.has('acc')) return 'ACCESSORY_MISC';
  if (tokenSet.has('miscellaneous')) return 'MISC';

  if (tokenSet.has('tool')) {
    if (showFlags.has('hook') || containsAny(`${normalizedName} ${normalizedText}`, ['hook', 'grappling'])) return 'TOOL_GRAPPLE';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['fishing pole', 'fishing rod'])) return 'TOOL_FISHING_ROD';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['hammer', 'hamaxe'])) return 'TOOL_HAMMER';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['paint', 'coating', 'paintbrush', 'paint roller', 'paint scraper'])) return 'TOOL_PAINT';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['wrench', 'wire', 'actuator', 'lever', 'switch', 'pressure plate', 'timer', 'sensor', 'logic gate'])) return 'TOOL_CIRCUIT';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['wand'])) return 'TOOL_OTHER_PLACE_WAND';
    return 'TOOL_OTHER_OTHER';
  }

  if (tokenSet.has('weapon')) {
    if (showFlags.has('melee')) return 'WEAPON_MELEE';
    if (showFlags.has('meleeother')) return 'WEAPON_MELEE_OTHER';
    if (showFlags.has('ranged')) return 'WEAPON_RANGED';
    if (showFlags.has('rangedother')) return 'WEAPON_RANGED_OTHER';
    if (showFlags.has('magic')) return 'WEAPON_MAGIC';
    if (showFlags.has('summon')) {
      if (tagSet.has('sentry') || containsAny(joined, ['sentry']) || containsAny(normalizedName, ['whip', 'scourge', 'lash'])) return 'WEAPON_SUMMON_SENTRY';
      if (tagSet.has('minion') || containsAny(joined, ['minion'])) return 'WEAPON_SUMMON_MINION';
      if (containsAny(normalizedName, ['whip', 'scourge', 'lash'])) return 'WEAPON_SUMMON_WHIP';
      return 'WEAPON_SUMMON_MINION';
    }
    if (containsAny(`${normalizedName} ${normalizedText}`, ['explosive', 'bomb', 'dynamite'])) return 'WEAPON_OTHER_EXPLOSIVE';
    return 'WEAPON';
  }

  return null;
}

function classifyByTemplates({ showFlags, tagTokens, normalizedText, itemName }) {
  const normalizedName = String(itemName || '').toLowerCase();
  const tagSet = new Set(tagTokens);

  if (showFlags.has('dye')) return 'DYE';
  if (showFlags.has('vanity') || showFlags.has('vanityacc')) return 'VANITY';
  if (showFlags.has('acc') || showFlags.has('combatacc')) {
    if (containsAny(`${normalizedName} ${normalizedText}`, ['shield'])) return 'ACCESSORY_SHIELD';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['boots'])) return 'ACCESSORY_BOOTS';
    return 'ACCESSORY_MISC';
  }
  if (showFlags.has('critter')) return 'CRITTER';
  if (showFlags.has('familiar') && !showFlags.has('summon')) return 'PET';
  if (showFlags.has('summon') && containsAny(normalizedText, ['is a [[mounts|mount-summoning]] item', 'is a mount-summoning item'])) return 'MOUNT';
  if (showFlags.has('summon') && containsAny(normalizedText, ['is a [[pet]]-summoning item', 'is a pet-summoning item', 'is a light pet-summoning item'])) return 'PET';
  if (showFlags.has('seed')) return 'MATERIAL_SEED';
  if (showFlags.has('ore')) return 'MATERIAL_ORE';
  if (showFlags.has('material')) return 'MATERIAL_MISC';
  if (showFlags.has('blocks')) return 'MATERIAL_BLOCK';
  if (showFlags.has('bricks')) return 'MATERIAL_BRICK';
  if (showFlags.has('walls') || showFlags.has('brickwalls')) return 'MATERIAL_WALL';
  if (showFlags.has('ammo')) {
    if (containsAny(`${normalizedName} ${normalizedText}`, ['arrow'])) return 'AMMUNITION_ARROW';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['bullet'])) return 'AMMUNITION_BULLET';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['rocket'])) return 'AMMUNITION_ROCKET';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['dart'])) return 'AMMUNITION_DART';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['flare'])) return 'AMMUNITION_FLASH';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['bait'])) return 'AMMUNITION_TOOL_BAIT';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['solution'])) return 'AMMUNITION_TOOL_SOLUTION';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['wire'])) return 'AMMUNITION_TOOL_WIRE';
    return 'AMMUNITION_OTHER_TYPE';
  }
  if (showFlags.has('potion')) return 'CONSUMABLE_POTION';
  if (showFlags.has('storage')) return 'FURNITURE_STORAGE';
  if (showFlags.has('craft')) return 'FURNITURE_CRAFTING_STATION';
  if (showFlags.has('light')) return 'FURNITURE_LIGHT';
  if (showFlags.has('tool')) {
    if (containsAny(`${normalizedName} ${normalizedText}`, ['hook', 'grappling'])) return 'TOOL_GRAPPLE';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['fishing pole', 'fishing rod'])) return 'TOOL_FISHING_ROD';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['hammer', 'hamaxe'])) return 'TOOL_HAMMER';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['paint', 'coating', 'paintbrush', 'paint roller', 'paint scraper'])) return 'TOOL_PAINT';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['wrench', 'wire', 'actuator', 'lever', 'switch', 'pressure plate', 'timer', 'sensor', 'logic gate'])) return 'TOOL_CIRCUIT';
    if (containsAny(`${normalizedName} ${normalizedText}`, ['wand'])) return 'TOOL_OTHER_PLACE_WAND';
    return 'TOOL_OTHER_OTHER';
  }
  if (showFlags.has('meleeother')) return 'WEAPON_MELEE_OTHER';
  if (showFlags.has('melee')) return 'WEAPON_MELEE';
  if (showFlags.has('rangedother')) return 'WEAPON_RANGED_OTHER';
  if (showFlags.has('ranged')) return 'WEAPON_RANGED';
  if (showFlags.has('magic')) return 'WEAPON_MAGIC';
  if (showFlags.has('summon')) {
    if (tagSet.has('sentry')) return 'WEAPON_SUMMON_SENTRY';
    if (tagSet.has('minion')) return 'WEAPON_SUMMON_MINION';
    if (containsAny(normalizedName, ['whip', 'scourge', 'lash'])) return 'WEAPON_SUMMON_WHIP';
    return 'WEAPON_SUMMON_MINION';
  }
  return null;
}

function classifyByWikiCategories({ wikiCategories, normalizedText, itemName }) {
  const combined = String(itemName || '').toLowerCase();
  if (wikiCategories.includes('block items')) return 'MATERIAL_BLOCK';
  if (wikiCategories.includes('wall items')) return 'MATERIAL_WALL';
  if (wikiCategories.includes('brick items')) return 'MATERIAL_BRICK';
  if (wikiCategories.includes('crafting station items')) return 'FURNITURE_CRAFTING_STATION';
  if (wikiCategories.includes('weapon items')) {
    if (wikiCategories.includes('melee weapons')) {
      if (containsAny(combined, ['phaseblade', 'phasesaber', 'broadsword', 'shortsword'])) return 'WEAPON_MELEE_SWORD';
    }
    if (containsAny(combined, ['phaseblade', 'phasesaber'])) return 'WEAPON_MELEE_SWORD';
  }
  if (wikiCategories.includes('furniture items')) {
    if (containsAny(combined, ['torch', 'candle', 'chandelier', 'lantern', 'lamp', 'candelabra', 'campfire', 'fireplace', 'bulb', 'lights'])) return 'FURNITURE_LIGHT';
    if (containsAny(combined, ['chest', 'dresser', 'safe', 'piggy bank'])) return 'FURNITURE_STORAGE';
    if (containsAny(combined, ['work bench', 'anvil', 'furnace', 'bottle', 'cooking pot', 'keg', 'loom', 'sawmill', 'hellforge', 'alchemy table', 'bewitching table', 'crystal ball', 'dye vat', 'extractinator', 'heavy work bench', 'imbuing station', 'meat grinder', 'mythril anvil', 'orichalcum anvil', 'workshop', 'solidifier', 'bone welder', 'glass kiln', 'ice machine', 'living loom', 'skymill', 'tinkerers workshop', 'titanium forge', 'adamantite forge'])) return 'FURNITURE_CRAFTING_STATION';
    if (containsAny(combined, ['door', 'bed', 'statue', 'toilet', 'lever', 'switch', 'timer', 'pressure plate', 'music box', 'clock', 'trap', 'banner'])) return 'FURNITURE_FUNCTIONAL';
    return null;
  }
  if (wikiCategories.includes('consumable items')) {
    if (containsAny(combined, ['potion'])) return 'CONSUMABLE_POTION';
    return null;
  }
  return null;
}

function classifyByNameHeuristics({ normalizedText, itemName, standardizedCategory }) {
  const nameOnly = String(itemName || '').toLowerCase();
  const combined = `${nameOnly} ${normalizedText}`;
  if (containsAny(nameOnly, ['pretty mirror'])) return 'WEAPON_RANGED_CONSUMABLE';
  if (containsAny(nameOnly, ['phaseblade', 'phasesaber'])) return 'WEAPON_MELEE_SWORD';
  if (containsAny(nameOnly, ['tombstone', 'grave', 'gravestone', 'headstone', 'obelisk', 'water fountain', 'pylon', 'monolith', 'altar'])) return 'FURNITURE_FUNCTIONAL';
  if (containsAny(nameOnly, ['trophy', 'painting', 'stained glass', 'vase', 'cage', 'bathtub'])) return 'FURNITURE_DECORATION';
  if (containsAny(nameOnly, ['wings'])) return 'ACCESSORY_WINGS';
  if (containsAny(nameOnly, ['cloak', 'scowl', 'paws', 'ring', 'shampoo'])) return 'ACCESSORY_MISC';
  if (containsAny(nameOnly, ['dye']) || containsAny(nameOnly, ['hair dye'])) return 'DYE';
  if (containsAny(nameOnly, ['paint', 'coating'])) return 'TOOL_PAINT';
  if (containsAny(nameOnly, [' coin'])) return 'MATERIAL_CURRENCY';
  if (containsAny(nameOnly, [' key', 'key)', 'chest lock'])) return 'MATERIAL_KEY';
  if (containsAny(nameOnly, ['present', 'treasure bag'])) return 'CONSUMABLE_GRAB_BAG';
  if (containsAny(nameOnly, [' license'])) return 'PET';
  if (containsAny(nameOnly, ['butterfly', 'dragonfly', 'jellyfish', 'scorpion', 'fairy', 'squirrel'])) return 'CRITTER';
  if (containsAny(nameOnly, ['bait'])) return 'AMMUNITION_TOOL_BAIT';
  if (containsAny(nameOnly, ['rocket i', 'rocket ii', 'rocket iii', 'rocket iv', 'rocket ', 'stynger bolt'])) return 'AMMUNITION_ROCKET';
  if (containsAny(nameOnly, ['solution'])) return 'AMMUNITION_TOOL_SOLUTION';
  if (containsAny(nameOnly, ['flare'])) return 'AMMUNITION_FLASH';
  if (containsAny(nameOnly, ['hook'])) return 'TOOL_GRAPPLE';
  if (containsAny(nameOnly, ['chest'])) return 'FURNITURE_STORAGE';
  if (containsAny(nameOnly, ['pressure plate', 'actuator', 'music box', 'chest lock'])) return 'TOOL_CIRCUIT';
  if (containsAny(nameOnly, ['bucket', 'sponge', 'dropper'])) return 'TOOL_OTHER_OTHER';
  if (containsAny(nameOnly, ['torch', 'candle'])) return 'FURNITURE_LIGHT';
  if (containsAny(nameOnly, ['wall'])) return 'MATERIAL_WALL';
  if (containsAny(nameOnly, ['shelf'])) return 'FURNITURE_DECORATION';
  if (containsAny(nameOnly, ['banner'])) return 'FURNITURE_FUNCTIONAL';
  if (containsAny(nameOnly, ['soup', 'pie', 'pudding', 'cookie', 'thai', 'pho', 'fish', 'shrimp', 'sashimi', 'bacon', 'split', 'ribs', 'stew', 'burger', 'nugget', 'soda', 'egg', 'fries', 'delight', 'hotdog', 'cream', 'milkshake', 'nachos', 'pizza', 'chips', 'bird', 'duck', 'legs', 'dinner', 'spaghetti', 'steak', 'tail', 'oyster', 'juice', 'lemonade', 'daiquiri', 'sangria', 'colada', 'smoothie', 'moscato', 'punch', 'salad', 'teacup', 'milk', 'coffee', 'lasagna', 'bunwich', 'cola', 'candy'])) return 'CONSUMABLE_FOOD';
  if (containsAny(nameOnly, ['platform', 'fence'])) return 'MATERIAL_BLOCK';
  if (containsAny(nameOnly, ['torch', 'candle', 'chandelier', 'lantern', 'lamp', 'candelabra', 'campfire', 'fireplace', 'bulb', 'lights']) && standardizedCategory === 'FURNITURE') return 'FURNITURE_LIGHT';
  if (containsAny(nameOnly, ['chest', 'dresser', 'safe', 'piggy bank']) && standardizedCategory === 'FURNITURE') return 'FURNITURE_STORAGE';
  if (containsAny(nameOnly, ['work bench', 'anvil', 'furnace', 'bottle', 'cooking pot', 'keg', 'loom', 'sawmill', 'hellforge', 'alchemy table', 'bewitching table', 'crystal ball', 'dye vat', 'extractinator', 'heavy work bench', 'imbuing station', 'meat grinder', 'mythril anvil', 'orichalcum anvil', 'solidifier', 'skymill', 'tinkerers workshop', 'workshop']) && standardizedCategory === 'FURNITURE') return 'FURNITURE_CRAFTING_STATION';
  if (containsAny(nameOnly, ['door', 'bed', 'statue', 'toilet', 'lever', 'switch', 'timer', 'pressure plate', 'music box', 'clock', 'trap', 'banner']) && standardizedCategory === 'FURNITURE') return 'FURNITURE_FUNCTIONAL';
  if (containsAny(nameOnly, ['hammer']) && (standardizedCategory === 'TOOL' || standardizedCategory === 'WEAPON')) return 'TOOL_HAMMER';
  return null;
}

function classifyByStandardizedRoot(code) {
  switch (code) {
    case 'WEAPON':
      return 'WEAPON_OTHER';
    case 'TOOL':
      return 'TOOL_OTHER_OTHER';
    case 'ARMOR':
      return 'ARMOR_OTHER';
    case 'FURNITURE':
      return 'FURNITURE_DECORATION';
    case 'CONSUMABLE':
      return 'CONSUMABLE_MISC';
    case 'MATERIAL':
      return 'MATERIAL_MISC';
    default:
      return null;
  }
}

export function buildRelatedCategoryCodes({ primaryCode, wiki, categoryLookup }) {
  const codes = new Set();

  let currentCode = primaryCode;
  while (currentCode) {
    codes.add(currentCode);
    currentCode = categoryLookup.parentCodeByCode.get(currentCode) || null;
  }

  const infoboxText = extractItemInfobox(String(wiki?.wikitext || ''));
  const typeTokens = extractTypeTokens(infoboxText);
  for (const token of typeTokens) {
    const mapped = mapTypeTokenToCategoryCode(token);
    if (mapped) codes.add(mapped);
  }

  return [...codes];
}

function mapTypeTokenToCategoryCode(token) {
  switch (token) {
    case 'weapon':
      return 'WEAPON';
    case 'tool':
      return 'TOOL';
    case 'furniture':
      return 'FURNITURE';
    case 'mount summon':
      return 'MOUNT';
    case 'pet summon':
    case 'light pet':
      return 'PET';
    case 'vanity':
      return 'VANITY';
    case 'dye':
      return 'DYE';
    case 'critter':
    case 'gold critter':
      return 'CRITTER';
    case 'boss summon':
    case 'event summon':
    case 'consumable':
    case 'potion':
      return 'CONSUMABLE';
    case 'ore':
    case 'bar':
    case 'gem':
    case 'seeds':
    case 'crafting material':
    case 'block':
    case 'brick':
    case 'wall':
      return 'MATERIAL';
    case 'ammunition':
      return 'AMMUNITION';
    case 'armor':
    case 'shield':
    case 'boots':
      return 'ACCESSORY';
    default:
      return null;
  }
}

async function syncItemCategoryRelations(connection, { itemId, categoryCodes, primaryCode, wiki, categoryLookup }) {
  await connection.execute('DELETE FROM item_category_rel WHERE item_id = ?', [itemId]);

  let sortOrder = 1;
  for (const code of categoryCodes) {
    const category = categoryLookup.byCode.get(code);
    if (!category?.id) continue;
    await connection.execute(
      `INSERT INTO item_category_rel (
        item_id, category_id, is_primary, relation_type, sort_order, source_provider, source_page, source_revision_timestamp, status, deleted
      ) VALUES (?, ?, ?, 'wiki_type', ?, 'terraria.wiki.gg', ?, ?, 1, 0)`,
      [
        itemId,
        category.id,
        code === primaryCode ? 1 : 0,
        sortOrder++,
        toText(wiki?.pageTitle),
        normalizeSqlDateTime(wiki?.revisionTimestamp),
      ]
    );
  }
}

export function shouldApplyCategoryChange({ currentCode, nextCode, categoryLookup, reason }) {
  if (!nextCode) return false;
  if (!currentCode) return true;
  if (currentCode === nextCode) return false;

  const currentDepth = categoryLookup.depthByCode.get(currentCode) || 0;
  const nextDepth = categoryLookup.depthByCode.get(nextCode) || 0;
  if (currentDepth === 0) return true;
  if (nextDepth > currentDepth) return true;

   const explicitRulePrefixes = ['listcat:', 'type:', 'template:', 'wiki_categories:'];
   if (explicitRulePrefixes.some((prefix) => String(reason || '').startsWith(prefix))) {
    return true;
   }

  const genericRoots = new Set(['WEAPON', 'TOOL', 'ARMOR', 'FURNITURE', 'CONSUMABLE', 'MATERIAL']);
  if (genericRoots.has(currentCode) && nextCode !== currentCode) return true;

  const currentRoot = rootFor(currentCode);
  const nextRoot = rootFor(nextCode);
  if (genericRoots.has(currentCode) && currentRoot !== nextRoot) return true;

  return false;
}

function rootFor(code) {
  if (!code) return null;
  return code.split('_')[0];
}

function loadWikiPages(dirPath) {
  const files = fs.readdirSync(dirPath).filter((name) => name.endsWith('.latest.json'));
  const map = new Map();
  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8'));
    const internalName = toText(payload?.itemInternalName);
    if (internalName) map.set(internalName, payload);
  }
  return map;
}

function extractTypeTokens(text) {
  const raw = extractSingleValue(text, 'type');
  if (!raw) return [];
  return raw
    .replace(/\{\{!}}/g, '/')
    .split('/')
    .map((entry) => normalizeFreeText(entry))
    .filter(Boolean);
}

function extractTagTokens(text) {
  const raw = extractSingleValue(text, 'tags');
  if (!raw) return [];
  return raw
    .split('/')
    .map((entry) => normalizeFreeText(entry))
    .filter(Boolean);
}

function extractWikiCategories(text) {
  const categories = [];
  for (const match of String(text || '').matchAll(/\[\[Category:([^\]]+)\]\]/gi)) {
    const value = normalizeFreeText(match[1]);
    if (value) categories.push(value);
  }
  return categories;
}

function extractItemInfobox(text) {
  const source = String(text || '');
  const start = source.search(/\{\{\s*item infobox/i);
  if (start < 0) return source;
  const end = source.indexOf('\n}}', start);
  if (end < 0) return source.slice(start);
  return source.slice(start, end + 3);
}

function extractShowFlags(text) {
  const flags = new Set();
  for (const match of text.matchAll(/\|\s*show-([a-z0-9_-]+)\s*=\s*yes/gi)) {
    const key = normalizeFreeText(match[1]);
    if (key) flags.add(key);
  }
  return flags;
}

function extractSingleValue(text, key) {
  const regex = new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\n]+)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function normalizeFreeText(value) {
  if (value == null) return null;
  return String(value)
    .replace(/<!--.*?-->/g, ' ')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/\[\[[^\]]*\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeCode(value) {
  return toText(value)?.toUpperCase() || null;
}

function containsAny(text, keywords) {
  const source = String(text || '').toLowerCase();
  return keywords.some((keyword) => source.includes(String(keyword).toLowerCase()));
}

export function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) out[body.slice(0, index)] = body.slice(index + 1);
    else out[body] = 'true';
  }
  return out;
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeSqlDateTime(value) {
  const text = toText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

if (process.argv[1] && __filename === path.resolve(process.argv[1])) {
  const { report, reportPath } = await runItemCategorySync(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}
