#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureDir,
  parseCliArgs,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import {
  getKnownNpcSourceBossNames,
  normalizeBossNameKey,
  parseTreasureBagBossName,
  resolveBossNameFromStructuredSource,
  toNullableText,
} from '../lib/boss-loot-source-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const GENERATED_SOURCE = 'terraria.wiki.gg:boss-loot-assembly';
const DIRECT_BOSS = 'direct_boss';
const TREASURE_BAG = 'treasure_bag';

export function buildBossLootBundle({
  relationPayload,
  npcPayload,
  bossNameOverrides = [],
  generatedAt = new Date().toISOString(),
  relationsSourceFile = null,
  npcSourceFile = null
} = {}) {
  const itemSources = Array.isArray(relationPayload?.itemSources) ? relationPayload.itemSources : [];
  const bossByKey = buildBossLookup(npcPayload, itemSources, bossNameOverrides);
  const bossNameLookup = new Map(Array.from(bossByKey.values()).map((boss) => [normalizeBossNameKey(boss.bossName), boss.bossName]));
  const bosses = [];
  const bossRecordByKey = new Map();
  const dropKeyByBoss = new Map();

  for (const boss of bossByKey.values()) {
    const record = {
      bossInternalName: boss.bossInternalName,
      bossName: boss.bossName,
      treasureBagName: buildTreasureBagName(boss.bossName),
      drops: []
    };
    bosses.push(record);
    bossRecordByKey.set(normalizeBossNameKey(boss.bossName), record);
    dropKeyByBoss.set(normalizeBossNameKey(boss.bossName), new Set());
  }

  for (const source of itemSources) {
    if (source?.sourceType !== 'drop') {
      continue;
    }

    const directBossName = resolveDirectBossName(source, bossNameLookup);
    if (directBossName) {
      appendBossDrop({
        bossRecord: bossRecordByKey.get(normalizeBossNameKey(directBossName)),
        dedupeSet: dropKeyByBoss.get(normalizeBossNameKey(directBossName)),
        source,
        dropSourceKind: DIRECT_BOSS
      });
    }

    const treasureBagBossName = resolveTreasureBagBossName(source, bossNameLookup);
    if (treasureBagBossName) {
      appendBossDrop({
        bossRecord: bossRecordByKey.get(normalizeBossNameKey(treasureBagBossName)),
        dedupeSet: dropKeyByBoss.get(normalizeBossNameKey(treasureBagBossName)),
        source,
        dropSourceKind: TREASURE_BAG
      });
    }
  }

  const materializedBosses = bosses
    .filter((boss) => boss.drops.length > 0)
    .map((boss) => {
      boss.drops.sort(compareBossDrops);
      return {
        ...boss,
        dropRecordCount: boss.drops.length,
        uniqueItemCount: new Set(boss.drops.map((drop) => drop.itemName ?? drop.itemInternalName ?? '')).size
      };
    })
    .sort((left, right) => compareText(left.bossName, right.bossName));

  return {
    schemaVersion: '1.0.0',
    source: GENERATED_SOURCE,
    generatedAt,
    relationsSourceFile,
    npcSourceFile,
    totalBosses: materializedBosses.length,
    totalDrops: materializedBosses.reduce((sum, boss) => sum + boss.drops.length, 0),
    bosses: materializedBosses
  };
}

function buildBossLookup(npcPayload, itemSources, bossNameOverrides) {
  const bosses = new Map();
  const npcs = Array.isArray(npcPayload?.npcs) ? npcPayload.npcs : [];

  for (const bossName of [...getKnownNpcSourceBossNames(), ...(Array.isArray(bossNameOverrides) ? bossNameOverrides : [])]) {
    upsertBossRecord(bosses, {
      bossInternalName: null,
      bossName: toNullableText(bossName)
    });
  }

  for (const npc of npcs) {
    if (!(npc?.boss === true || npc?.boss === 1)) {
      continue;
    }
    const bossName = toNullableText(npc.name);
    if (!bossName) {
      continue;
    }
    upsertBossRecord(bosses, {
      bossInternalName: toNullableText(npc.internalName),
      bossName
    });
  }

  for (const source of itemSources) {
    if (source?.sourceType !== 'drop') {
      continue;
    }

    if (source.sourceRefType === 'boss') {
      upsertBossRecord(bosses, {
        bossInternalName: null,
        bossName: toNullableText(source.sourceRefName)
      });
    }

    const bagBossName = parseBossNameFromTreasureBag(source.sourceRefName);
    if (bagBossName) {
      upsertBossRecord(bosses, {
        bossInternalName: null,
        bossName: bagBossName
      });
    }
  }

  return bosses;
}

function upsertBossRecord(map, boss) {
  if (!boss?.bossName) {
    return;
  }

  const key = normalizeBossNameKey(boss.bossName);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      bossInternalName: boss.bossInternalName ?? null,
      bossName: boss.bossName
    });
    return;
  }

  if (existing.bossInternalName == null && boss.bossInternalName != null) {
    existing.bossInternalName = boss.bossInternalName;
  }
}

function resolveDirectBossName(source, bossNameLookup) {
  const sourceName = toNullableText(source?.sourceRefName);
  if (!sourceName || parseBossNameFromTreasureBag(sourceName)) {
    return null;
  }

  return resolveBossNameFromStructuredSource(source, bossNameLookup);
}

function resolveTreasureBagBossName(source, bossNameLookup) {
  const bossName = parseBossNameFromTreasureBag(source?.sourceRefName);
  if (!bossName) {
    return null;
  }

  return bossNameLookup.get(normalizeBossNameKey(bossName)) ?? null;
}

function appendBossDrop({ bossRecord, dedupeSet, source, dropSourceKind }) {
  if (!bossRecord || !dedupeSet) {
    return;
  }

  const drop = serializeDrop(source, dropSourceKind);
  const dedupeKey = [
    drop.itemInternalName ?? '',
    drop.itemName ?? '',
    drop.dropSourceKind,
    drop.sourceName ?? '',
    drop.quantityText ?? '',
    drop.chanceText ?? '',
    drop.conditions ?? '',
    drop.notes ?? '',
    drop.sourcePage ?? '',
    drop.sourceRevisionTimestamp ?? ''
  ].join('|');

  if (dedupeSet.has(dedupeKey)) {
    return;
  }

  dedupeSet.add(dedupeKey);
  bossRecord.drops.push(drop);
}

function serializeDrop(source, dropSourceKind) {
  return {
    itemInternalName: toNullableText(source.itemInternalName),
    itemName: toNullableText(source.itemName),
    dropSourceKind,
    sourceName: toNullableText(source.sourceRefName),
    sourceRefType: toNullableText(source.sourceRefType),
    quantityMin: toNullableInteger(source.quantityMin),
    quantityMax: toNullableInteger(source.quantityMax),
    quantityText: toNullableText(source.quantityText),
    chanceValue: toNullableNumber(source.chanceValue),
    chanceText: toNullableText(source.chanceText),
    conditions: toNullableText(source.conditions),
    notes: toNullableText(source.notes),
    sourcePage: toNullableText(source.sourcePage),
    sourceRevisionTimestamp: toNullableText(source.sourceRevisionTimestamp)
  };
}

function buildTreasureBagName(bossName) {
  return bossName ? `Treasure Bag (${bossName})` : null;
}

function parseBossNameFromTreasureBag(value) {
  return parseTreasureBagBossName(value);
}

function compareBossDrops(left, right) {
  return (
    compareText(left.itemName, right.itemName) ||
    compareText(left.itemInternalName, right.itemInternalName) ||
    compareDropSourceKind(left.dropSourceKind, right.dropSourceKind) ||
    compareText(left.sourceName, right.sourceName) ||
    compareText(left.chanceText, right.chanceText) ||
    compareText(left.quantityText, right.quantityText)
  );
}

function compareDropSourceKind(left, right) {
  const rank = {
    [DIRECT_BOSS]: 0,
    [TREASURE_BAG]: 1
  };
  return (rank[left] ?? 99) - (rank[right] ?? 99);
}

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''));
}

function toNullableInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function toNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }
  return path.resolve(process.argv[1]) === __filename;
}

if (isDirectExecution()) {
  const options = parseCliArgs(process.argv.slice(2));
  const relationsPath = path.resolve(
    process.cwd(),
    options.input ??
      options.relations ??
      sharedDataPath('normalized', 'item-relations.bundle.json')
  );
  const npcPath = path.resolve(
    process.cwd(),
    options.npcs ??
      sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json')
  );
  const outputPath = path.resolve(
    process.cwd(),
    options.output ??
      sharedDataPath('normalized', 'boss-loot.bundle.json')
  );

  const relationPayload = JSON.parse(fs.readFileSync(relationsPath, 'utf8'));
  const npcPayload = JSON.parse(fs.readFileSync(npcPath, 'utf8'));
  const bundle = buildBossLootBundle({
    relationPayload,
    npcPayload,
    relationsSourceFile: relationsPath,
    npcSourceFile: npcPath
  });

  ensureDir(path.dirname(outputPath));
  writeJson(outputPath, bundle);

  console.log(`Relations input: ${relationsPath}`);
  console.log(`NPC input: ${npcPath}`);
  console.log(`Bosses: ${bundle.totalBosses}`);
  console.log(`Drops: ${bundle.totalDrops}`);
  console.log(`Output: ${outputPath}`);
}
