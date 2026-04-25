import fs from 'node:fs';
import path from 'node:path';

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function normalizeKey(value) {
  const text = toText(value);
  return text ? text.toLowerCase() : null;
}

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function upsertZhEntry(map, key, value) {
  const normalizedKey = normalizeKey(key);
  const nameZh = toText(value?.nameZh);
  const subNameZh = toText(value?.subNameZh);
  if (!normalizedKey || (!nameZh && !subNameZh)) {
    return;
  }
  map.set(normalizedKey, {
    nameZh,
    subNameZh,
  });
}

function seedFromRecordObject(map, payload) {
  const records = payload?.records;
  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    return;
  }
  for (const [internalName, value] of Object.entries(records)) {
    upsertZhEntry(map, internalName, value);
  }
}

function seedFromStandardizedRecords(map, payload) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  for (const record of records) {
    upsertZhEntry(map, record?.internalName, {
      nameZh: record?.nameZh ?? record?.localized?.zh?.name,
      subNameZh: record?.subNameZh ?? record?.localized?.zh?.namesub,
    });
  }
}

function seedFromTownNpcMaintenance(map, payload) {
  const records = Array.isArray(payload?.records) ? payload.records : [];
  for (const record of records) {
    upsertZhEntry(map, record?.internalName, {
      nameZh: record?.nameZh,
      subNameZh: record?.subNameZh,
    });
  }
}

export function buildZhSourceIndexes({
  itemZhMap = null,
  npcZhMap = null,
  npcIdRows = null,
  projectileZhMap = null,
  townNpcMaintenance = null,
  standardizedItems = null,
  standardizedNpcs = null,
  standardizedProjectiles = null,
} = {}) {
  const itemsByInternalName = new Map();
  const npcsByInternalName = new Map();
  const projectilesByInternalName = new Map();

  seedFromStandardizedRecords(itemsByInternalName, standardizedItems);
  seedFromRecordObject(itemsByInternalName, itemZhMap);

  seedFromStandardizedRecords(npcsByInternalName, standardizedNpcs);
  seedFromTownNpcMaintenance(npcsByInternalName, townNpcMaintenance);
  seedFromTownNpcMaintenance(npcsByInternalName, npcIdRows);
  seedFromRecordObject(npcsByInternalName, npcZhMap);

  seedFromStandardizedRecords(projectilesByInternalName, standardizedProjectiles);
  seedFromRecordObject(projectilesByInternalName, projectileZhMap);

  return {
    itemsByInternalName,
    npcsByInternalName,
    projectilesByInternalName,
  };
}

export function loadZhSourceIndexes({ repoRoot }) {
  return buildZhSourceIndexes({
    itemZhMap: loadJsonIfExists(path.join(repoRoot, 'data', 'generated', 'item-zh-map.json')),
    npcZhMap: loadJsonIfExists(path.join(repoRoot, 'data', 'generated', 'npc-zh-map.json')),
    npcIdRows: loadJsonIfExists(path.join(repoRoot, 'data', 'generated', 'npc-id-row-images.json')),
    projectileZhMap: loadJsonIfExists(path.join(repoRoot, 'data', 'generated', 'projectile-zh-map.json')),
    townNpcMaintenance: loadJsonIfExists(path.join(repoRoot, 'data', 'generated', 'wiki-town-npc-maintenance.latest.json')),
    standardizedItems: loadJsonIfExists(path.join(repoRoot, 'data', 'standardized', 'items.standardized.json')),
    standardizedNpcs: loadJsonIfExists(path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json')),
    standardizedProjectiles: loadJsonIfExists(path.join(repoRoot, 'data', 'standardized', 'projectiles.standardized.json')),
  });
}
