import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { parseIteminfoModulePayload } from '../lib/wiki-item-utils.mjs';

export const ITEMS_SOURCE_PATHS = Object.freeze({
  items: 'data/standardized/items.standardized.json',
  itemPages: 'data/standardized/item_pages.standardized.json',
  itemsMeta: 'data/standardized-view/items/_meta.json',
  itemPagesMeta: 'data/standardized-view/item_pages/_meta.json',
});
export const ITEM_RELATIONS_META_PATH = 'data/standardized-view/item_relations/_meta.json';
export const ITEMINFO_LANDING_COLUMNS = Object.freeze([
  'id', 'dataset_type', 'provider', 'source_kind', 'source_key', 'source_locator', 'source_page',
  'source_revision_timestamp', 'content_hash', 'payload_json', 'fetched_at', 'parsed_at', 'parse_status',
  'artifact_role', 'producer_id', 'producer_version', 'producer_run_key', 'bootstrap_manifest_hash',
  'full_file_content_hash', 'full_file_byte_size', 'is_current', 'notes', 'created_at', 'updated_at',
]);
const ITEM_RELATION_GROUPS = Object.freeze(['biomes', 'itemBiomes', 'itemImages', 'itemSources', 'recipes']);
const SNAPSHOT_GROUP = 'snapshots';

export const EIGHT_DOMAIN_ITEMS_RUN_ID = 'e8pr-items-20261017-v1';
export const EIGHT_DOMAIN_ITEMS_RECORD_COUNT = 6131;
export const EIGHT_DOMAIN_ITEMS_SELECTED_IDS_SHA256 = 'sha256:5d6b33391383bc82f62b327510d1772b3205e0924374050f3deb7f18300a84d6';

const ITEMINFO_SOURCE_KEY = 'wiki.module.iteminfo';
const ITEMINFO_DATASET_TYPE = 'items_raw';
const HASH = /^sha256:[a-f0-9]{64}$/;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function hashBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return hashBytes(JSON.stringify(canonicalValue(value)));
}

function freezeJson(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, freezeJson(nested)])));
  }
  return value;
}

function resolveRepositoryFile(repoRoot, relativePath, label) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  const relative = requireText(relativePath, `${label} path`).replaceAll('\\', '/');
  if (path.isAbsolute(relative) || relative.startsWith('../') || relative.includes('/../')) {
    throw new Error(`${label} must be repository-relative`);
  }
  const resolved = path.resolve(root, relative);
  const relativeFromRoot = path.relative(root, resolved);
  if (relativeFromRoot === '..' || relativeFromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeFromRoot)) {
    throw new Error(`${label} must stay inside repoRoot`);
  }
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be an ordinary file`);
  return { root, relative, resolved };
}

function readJsonFile(repoRoot, relativePath, label) {
  const file = resolveRepositoryFile(repoRoot, relativePath, label);
  const bytes = fs.readFileSync(file.resolved);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
  return { ...file, bytes, value };
}

function requireRecords(payload, entity, label) {
  requireObject(payload, label);
  if (payload.entity !== entity || !Array.isArray(payload.records)) {
    throw new Error(`${label} must contain entity=${entity} records`);
  }
  if (payload.totalRecords !== undefined && Number(payload.totalRecords) !== payload.records.length) {
    throw new Error(`${label} totalRecords differs from its records length`);
  }
  return payload.records;
}

function requireMeta(payload, entity, recordCount, label) {
  requireObject(payload, label);
  if (payload.entity !== entity || Number(payload.totalRecords) !== recordCount) {
    throw new Error(`${label} does not bind entity ${entity} to record count ${recordCount}`);
  }
}

function relationGroupFromPartName(name) {
  const normalized = String(name ?? '').replaceAll('\\', '/');
  const slash = normalized.indexOf('/');
  if (slash < 1) throw new Error(`Item relation part path is invalid: ${normalized}`);
  return normalized.slice(0, slash);
}

function readRelationRows(repoRoot, metaFile, label) {
  if (metaFile.value.entity !== 'item_relations' || metaFile.value.mode !== 'object-arrays'
      || !Array.isArray(metaFile.value.parts)) {
    throw new Error(`${label} must be an object-arrays Item relation metadata file`);
  }
  const groups = new Map(ITEM_RELATION_GROUPS.map((group) => [group, []]));
  const snapshotParts = [];
  const missingSnapshots = [];
  const partHashes = [];
  const sourceRecordCounts = Object.fromEntries([...ITEM_RELATION_GROUPS, SNAPSHOT_GROUP].map((group) => [group, 0]));
  const seenGroups = new Set();
  const seenPaths = new Set();
  for (const rawPart of metaFile.value.parts) {
    requireObject(rawPart, `${label} part`);
    const relativePart = requireText(rawPart.name, `${label} part name`).replaceAll('\\', '/');
    if (path.posix.isAbsolute(relativePart) || relativePart.split('/').includes('..')) {
      throw new Error(`${label} part path must stay inside the relation view: ${relativePart}`);
    }
    const group = relationGroupFromPartName(relativePart);
    if (group !== SNAPSHOT_GROUP && !groups.has(group)) throw new Error(`Item relation group is not allowed: ${group}`);
    const recordCount = Number(rawPart.records);
    if (!Number.isSafeInteger(recordCount) || recordCount < 0) {
      throw new Error(`${label} part ${relativePart} has an invalid declared record count`);
    }
    const relationKey = path.posix.join(path.posix.dirname(ITEM_RELATIONS_META_PATH), relativePart);
    if (seenPaths.has(relationKey)) throw new Error(`${label} contains duplicate part path ${relativePart}`);
    seenPaths.add(relationKey);
    seenGroups.add(group);
    sourceRecordCounts[group] += recordCount;
    const relationPath = path.posix.join(path.posix.dirname(ITEM_RELATIONS_META_PATH), relativePart);
    const relationAbsolutePath = path.resolve(metaFile.root, relationPath);
    let partExists = true;
    try {
      const stat = fs.lstatSync(relationAbsolutePath);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label} part ${relativePart} must be an ordinary file`);
    } catch (error) {
      if (error?.code === 'ENOENT') partExists = false;
      else throw error;
    }
    if (group === SNAPSHOT_GROUP && !partExists) {
      missingSnapshots.push(Object.freeze({ path: relationPath, declaredRecordCount: recordCount, present: false }));
      continue;
    }
    const partFile = resolveRepositoryFile(repoRoot, relationPath, `${label} ${relativePart}`);
    const partBytes = fs.readFileSync(partFile.resolved);
    const partHash = hashBytes(partBytes);
    partHashes.push(Object.freeze({ path: partFile.relative, sha256: partHash, group, declaredRecordCount: recordCount, recordCount: null }));
    let payload;
    try { payload = JSON.parse(partBytes.toString('utf8')); } catch (error) {
      throw new Error(`${label} part ${relativePart} is not valid JSON`, { cause: error });
    }
    const rows = Array.isArray(payload) ? payload : Object.values(requireObject(payload, `${label} part ${relativePart} payload`));
    if (recordCount !== rows.length) throw new Error(`${label} part ${relativePart} record count differs from metadata`);
    partHashes[partHashes.length - 1] = Object.freeze({
      path: partFile.relative,
      sha256: partHash,
      group,
      declaredRecordCount: recordCount,
      recordCount: rows.length,
    });
    if (group === SNAPSHOT_GROUP) {
      snapshotParts.push(Object.freeze({ path: partFile.relative, sha256: partHash, declaredRecordCount: recordCount, recordCount: rows.length, present: true }));
      continue;
    }
    groups.get(group).push(...rows.map((row) => requireObject(row, `${label} ${relativePart} row`)));
  }
  for (const group of ITEM_RELATION_GROUPS) {
    if (!seenGroups.has(group)) throw new Error(`required Item relation group ${group} is missing`);
  }
  const declaredTotal = metaFile.value.parts.reduce((sum, part) => sum + Number(part.records ?? 0), 0);
  if (Number(metaFile.value.totalRecords) !== declaredTotal) throw new Error(`${label} totalRecords differs from declared part counts`);
  if (missingSnapshots.length > 0) {
    const presentSnapshotCount = snapshotParts.reduce((sum, part) => sum + part.declaredRecordCount, 0);
    snapshotParts.push(...missingSnapshots);
    snapshotParts.sort((left, right) => left.path.localeCompare(right.path));
    return {
      groups,
      partHashes,
      snapshotParts,
      sourceRecordCounts,
      missingSnapshotRecordCount: missingSnapshots.reduce((sum, part) => sum + part.declaredRecordCount, 0),
      snapshotDeclaredRecordCount: presentSnapshotCount + missingSnapshots.reduce((sum, part) => sum + part.declaredRecordCount, 0),
    };
  }
  return {
    groups,
    partHashes,
    snapshotParts,
    sourceRecordCounts,
    missingSnapshotRecordCount: 0,
    snapshotDeclaredRecordCount: snapshotParts.reduce((sum, part) => sum + part.declaredRecordCount, 0),
  };
}

function relationItemName(row, ...fields) {
  for (const field of fields) {
    const value = String(row?.[field] ?? '').trim();
    if (value) return value.toLowerCase();
  }
  return null;
}

function buildItemRelationSelection({ groups, selectedNames, itemIdsByName }) {
  const selectedRows = {};
  const selectedRecordCounts = {};
  for (const group of ITEM_RELATION_GROUPS) {
    const rows = groups.get(group) ?? [];
    if (group === 'biomes') {
      selectedRows[group] = rows;
      selectedRecordCounts[group] = rows.length;
      continue;
    }
    if (group === 'recipes') {
      selectedRows[group] = rows.filter((row) => selectedNames.has(relationItemName(row, 'resultInternalName', 'resultName'))
        || (Array.isArray(row.ingredients) && row.ingredients.some((ingredient) => {
          const ingredientGroupType = String(ingredient.ingredientGroupType ?? 'item').trim().toLowerCase();
          return ingredientGroupType === 'item'
            && selectedNames.has(relationItemName(ingredient, 'ingredientInternalName', 'internalName', 'ingredientName'));
        })));
    } else {
      selectedRows[group] = rows.filter((row) => selectedNames.has(relationItemName(row, 'itemInternalName', 'internalName', 'itemName')));
    }
    selectedRecordCounts[group] = selectedRows[group].length;
  }
  const selectedBiomeCodes = new Set([
    ...selectedRows.itemBiomes.map((row) => row.biomeCode),
    ...selectedRows.itemSources.map((row) => row.biomeCode),
  ].map((code) => String(code ?? '').trim().toLowerCase()).filter(Boolean));
  selectedRows.biomes = (groups.get('biomes') ?? []).filter((row) => selectedBiomeCodes.has(String(row.code ?? '').trim().toLowerCase()));
  selectedRecordCounts.biomes = selectedRows.biomes.length;
  const recipeDependencyItemIds = new Set();
  for (const recipe of selectedRows.recipes) {
    const resultName = relationItemName(recipe, 'resultInternalName', 'resultName');
    if (!resultName || !itemIdsByName.has(resultName)) {
      throw new Error(`recipe dependency ${resultName ?? '<missing result identity>'} has no stable Item ID`);
    }
    if (!selectedNames.has(resultName)) recipeDependencyItemIds.add(itemIdsByName.get(resultName));
    for (const ingredient of Array.isArray(recipe.ingredients) ? recipe.ingredients : []) {
      if (String(ingredient?.ingredientGroupType ?? 'item').trim().toLowerCase() !== 'item') continue;
      const ingredientGroupType = String(ingredient.ingredientGroupType ?? 'item').trim().toLowerCase();
      if (ingredientGroupType !== 'item') continue;
      const ingredientName = relationItemName(ingredient, 'ingredientInternalName', 'internalName', 'ingredientName');
      if (!ingredientName || !itemIdsByName.has(ingredientName)) {
        throw new Error(`recipe dependency ${ingredientName ?? '<missing ingredient identity>'} has no stable Item ID`);
      }
      if (!selectedNames.has(ingredientName)) recipeDependencyItemIds.add(itemIdsByName.get(ingredientName));
    }
    for (const station of Array.isArray(recipe.stations) ? recipe.stations : []) {
      const stationName = relationItemName(station, 'stationInternalName', 'internalName');
      if (!stationName) continue;
      if (!itemIdsByName.has(stationName)) throw new Error(`recipe station ${stationName} has no stable Item ID`);
      if (!selectedNames.has(stationName)) recipeDependencyItemIds.add(itemIdsByName.get(stationName));
    }
  }
  return Object.freeze({
    selectedRows: Object.freeze(selectedRows),
    selectedRecordCounts: Object.freeze(selectedRecordCounts),
    recipeDependencyItemIds: Object.freeze([...recipeDependencyItemIds].sort((left, right) => left - right)),
  });
}

function normalizeInternalName(value, label) {
  return requireText(value, label).toLowerCase();
}

function validateItemRecords(records, label) {
  const seen = new Set();
  return records.map((record, index) => {
    requireObject(record, `${label}[${index}]`);
    const id = Number(record.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new Error(`${label}[${index}] has an invalid stable Item ID`);
    if (seen.has(id)) throw new Error(`${label} contains duplicate stable Item ID ${id}`);
    seen.add(id);
    const internalName = requireText(record.internalName, `${label}[${index}].internalName`);
    return freezeJson({ ...record, id, internalName });
  });
}

export function selectRankStratifiedItemRecords({ records, limit = 100 } = {}) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('Item records are required');
  const normalizedLimit = Number(limit);
  if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 100) {
    throw new Error('Item selection limit must be an integer from 1 through 100');
  }
  if (normalizedLimit > records.length) throw new Error('Item selection limit exceeds the available records');
  const normalized = validateItemRecords(records, 'Item records').sort((left, right) => left.id - right.id);
  const selected = Array.from({ length: normalizedLimit }, (_, index) => (
    normalized[Math.floor((index + 0.5) * normalized.length / normalizedLimit)]
  ));
  return Object.freeze(selected);
}

function normalizeLanding(landing) {
  const value = requireObject(landing, 'ItemInfo landing');
  for (const column of ITEMINFO_LANDING_COLUMNS) {
    if (!Object.hasOwn(value, column)) throw new Error(`ItemInfo landing is missing canonical row column ${column}`);
  }
  const datasetType = value.datasetType ?? value.dataset_type;
  const sourceKey = value.sourceKey ?? value.source_key;
  const isCurrent = value.isCurrent ?? value.is_current;
  if (datasetType !== ITEMINFO_DATASET_TYPE) throw new Error(`ItemInfo landing dataset_type must be ${ITEMINFO_DATASET_TYPE}`);
  if (sourceKey !== ITEMINFO_SOURCE_KEY) throw new Error(`ItemInfo landing source_key must be ${ITEMINFO_SOURCE_KEY}`);
  if (!(isCurrent === true || Number(isCurrent) === 1)) throw new Error('ItemInfo landing must be current');
  const sourceId = Number(value.id ?? value.sourceId);
  if (!Number.isSafeInteger(sourceId) || sourceId < 1) throw new Error('ItemInfo landing source ID is invalid');
  const sourceRevisionTimestamp = requireText(
    value.sourceRevisionTimestamp ?? value.source_revision_timestamp,
    'ItemInfo landing source revision timestamp',
  );
  if (!Number.isFinite(new Date(sourceRevisionTimestamp).getTime())) {
    throw new Error('ItemInfo landing source revision timestamp is invalid');
  }
  const rawHash = String(value.contentHash ?? value.content_hash ?? '').replace(/^sha256:/, '').trim();
  if (!/^[a-f0-9]{64}$/.test(rawHash)) throw new Error('ItemInfo landing content hash is invalid');
  const payload = value.payloadJson ?? value.payload_json;
  if (typeof payload !== 'string' || payload.length === 0) throw new Error('ItemInfo landing payload_json is required');
  let payloadValue;
  try {
    payloadValue = JSON.parse(payload);
  } catch (error) {
    throw new Error('ItemInfo landing payload_json is malformed', { cause: error });
  }
  const moduleContent = requireText(payloadValue.moduleContent, 'ItemInfo landing moduleContent');
  let itemInfo;
  try {
    itemInfo = parseIteminfoModulePayload(moduleContent);
  } catch (error) {
    throw new Error('ItemInfo landing moduleContent is malformed', { cause: error });
  }
  const normalized = {
    datasetType,
    sourceKey,
    provider: requireText(value.provider, 'ItemInfo landing provider'),
    sourcePage: requireText(value.sourcePage ?? value.source_page, 'ItemInfo landing source page'),
    sourceId,
    sourceRevisionTimestamp,
    contentHash: `sha256:${rawHash}`,
    payloadSha256: hashBytes(payload),
    moduleContentSha256: hashBytes(moduleContent),
  };
  const canonicalRow = Object.fromEntries(ITEMINFO_LANDING_COLUMNS.map((column) => [
    column,
    value[column] ?? null,
  ]));
  return Object.freeze({
    ...normalized,
    canonicalSourceRowSha256: hashJson(canonicalRow),
    rowSha256: hashJson(normalized),
    itemInfo,
  });
}

export function buildItemsSourceManifest({
  repoRoot,
  landing,
  limit = 100,
  expectedRecordCount = EIGHT_DOMAIN_ITEMS_RECORD_COUNT,
  expectedSelectedIdsSha256 = null,
  expectedSourceHashes = null,
  expectedRelationHashes = null,
  runId = EIGHT_DOMAIN_ITEMS_RUN_ID,
  sourcePaths = ITEMS_SOURCE_PATHS,
} = {}) {
  if (runId !== EIGHT_DOMAIN_ITEMS_RUN_ID) throw new Error('Items runId differs from the fixed isolated allocation');
  const itemsFile = readJsonFile(repoRoot, sourcePaths.items, 'standardized Items source');
  const pagesFile = readJsonFile(repoRoot, sourcePaths.itemPages, 'standardized Item pages source');
  const itemsMetaFile = readJsonFile(repoRoot, sourcePaths.itemsMeta, 'standardized Items metadata');
  const pagesMetaFile = readJsonFile(repoRoot, sourcePaths.itemPagesMeta, 'standardized Item pages metadata');
  const itemRecords = validateItemRecords(requireRecords(itemsFile.value, 'items', 'standardized Items source'), 'standardized Items records');
  const pageRecords = requireRecords(pagesFile.value, 'item_pages', 'standardized Item pages source');
  const recordCount = itemRecords.length;
  if (expectedRecordCount != null && Number(expectedRecordCount) !== recordCount) {
    throw new Error(`standardized Item record count drift: expected ${expectedRecordCount}, got ${recordCount}`);
  }
  requireMeta(itemsMetaFile.value, 'items', recordCount, 'standardized Items metadata');
  requireMeta(pagesMetaFile.value, 'item_pages', pageRecords.length, 'standardized Item pages metadata');
  if (pageRecords.length !== recordCount) throw new Error('standardized Item/page record counts differ');

  const pagesByName = new Map();
  for (const [index, page] of pageRecords.entries()) {
    requireObject(page, `standardized Item page records[${index}]`);
    const key = normalizeInternalName(page.itemInternalName, `standardized Item page records[${index}].itemInternalName`);
    if (pagesByName.has(key)) throw new Error(`standardized Item pages contain duplicate identity ${page.itemInternalName}`);
    const pageId = Number(page.pageId);
    if (!Number.isSafeInteger(pageId) || pageId < 1) throw new Error(`standardized Item page ${page.itemInternalName} has an invalid page ID`);
    const revisionTimestamp = requireText(page.revisionTimestamp, `standardized Item page ${page.itemInternalName}.revisionTimestamp`);
    pagesByName.set(key, freezeJson({ ...page, pageId, revisionTimestamp }));
  }

  const selected = selectRankStratifiedItemRecords({ records: itemRecords, limit });
  const selectedIds = selected.map((record) => record.id);
  const selectedIdsSha256 = hashBytes(JSON.stringify(selectedIds));
  const selectedHashPin = expectedSelectedIdsSha256
    ?? (Number(limit) === 100 ? EIGHT_DOMAIN_ITEMS_SELECTED_IDS_SHA256 : null);
  if (selectedHashPin != null && selectedIdsSha256 !== selectedHashPin) {
    throw new Error(`selected Item ID hash drift: expected ${selectedHashPin}, got ${selectedIdsSha256}`);
  }
  const selectedPages = selected.map((record) => {
    const page = pagesByName.get(normalizeInternalName(record.internalName, 'selected Item internalName'));
    if (!page) throw new Error(`selected Item page is missing for ${record.internalName}`);
    return page;
  });
  const binding = normalizeLanding(landing);
  if (binding.provider !== 'terraria.wiki.gg') throw new Error('ItemInfo landing provider must be terraria.wiki.gg');
  const itemInfoMatches = selected.map((record) => {
    const source = binding.itemInfo[String(record.id)];
    if (!source || typeof source !== 'object') throw new Error(`ItemInfo landing is missing selected Item ID ${record.id}`);
    if (normalizeInternalName(source.internalName, `ItemInfo Item ${record.id}.internalName`)
        !== normalizeInternalName(record.internalName, `standardized Item ${record.id}.internalName`)) {
      throw new Error(`ItemInfo internalName drift for selected Item ID ${record.id}`);
    }
    return Object.freeze({
      id: record.id,
      internalName: record.internalName,
      sourceRecordSha256: hashJson(source),
    });
  });
  const sourceFiles = [
    [itemsFile, 'items', recordCount],
    [pagesFile, 'item_pages', pageRecords.length],
    [itemsMetaFile, 'items_meta', recordCount],
    [pagesMetaFile, 'item_pages_meta', pageRecords.length],
  ].map(([file, entity, fileRecordCount]) => Object.freeze({
    path: file.relative,
    sha256: hashBytes(file.bytes),
    entity,
    recordCount: fileRecordCount,
  }));
  if (expectedSourceHashes == null) {
    throw new Error('expected source hashes are required for the fixed Items manifest');
  }
  {
    const expected = requireObject(expectedSourceHashes, 'expected source hashes');
    if (Object.keys(expected).sort().join(',') !== Object.values(sourcePaths).sort().join(',')) {
      throw new Error('expected source hashes must bind exactly the four standardized Item/page files');
    }
    for (const file of sourceFiles) {
      const expectedHash = expected[file.path];
      if (!HASH.test(expectedHash ?? '') || expectedHash !== file.sha256) {
        throw new Error(`source file hash drift for ${file.path}`);
      }
    }
  }
  const relationMetaFile = expectedRelationHashes == null
    ? null
    : readJsonFile(repoRoot, ITEM_RELATIONS_META_PATH, 'standardized Item relation metadata');
  let itemRelations = null;
  if (relationMetaFile) {
    const relation = readRelationRows(repoRoot, relationMetaFile, 'standardized Item relation metadata');
    const selectedNameSet = new Set(selected.map((record) => record.internalName.toLowerCase()));
    const itemIdsByName = new Map();
    for (const record of itemRecords) {
      const key = record.internalName.toLowerCase();
      if (itemIdsByName.has(key)) throw new Error(`standardized Items contain duplicate internalName ${record.internalName}`);
      itemIdsByName.set(key, record.id);
    }
    const relationSelection = buildItemRelationSelection({ groups: relation.groups, selectedNames: selectedNameSet, itemIdsByName });
    const expectedRelations = requireObject(expectedRelationHashes, 'expected Item relation hashes');
    const relationExpectedKeys = [ITEM_RELATIONS_META_PATH, ...relation.partHashes.map((entry) => entry.path)].sort();
    if (Object.keys(expectedRelations).sort().join(',') !== relationExpectedKeys.join(',')) {
      throw new Error('expected Item relation hashes must bind the metadata and every present required relation part');
    }
    for (const entry of [{ path: ITEM_RELATIONS_META_PATH, sha256: hashBytes(relationMetaFile.bytes) }, ...relation.partHashes]) {
      if (expectedRelations[entry.path] !== entry.sha256) throw new Error(`Item relation source hash drift for ${entry.path}`);
    }
    itemRelations = Object.freeze({
      metaPath: ITEM_RELATIONS_META_PATH,
      metaSha256: hashBytes(relationMetaFile.bytes),
      partHashes: Object.freeze(relation.partHashes),
      sourceRecordCounts: Object.freeze(relation.sourceRecordCounts),
      selectedRecordCounts: relationSelection.selectedRecordCounts,
      selectedRowsSha256: Object.freeze(Object.fromEntries(ITEM_RELATION_GROUPS.map((group) => [
        group,
        hashJson(relationSelection.selectedRows[group]),
      ]))),
      selectedRows: freezeJson(relationSelection.selectedRows),
      relationBundleSha256: hashJson({
        biomes: relationSelection.selectedRows.biomes,
        itemBiomes: relationSelection.selectedRows.itemBiomes,
        itemImages: relationSelection.selectedRows.itemImages,
        itemSources: relationSelection.selectedRows.itemSources,
        recipes: relationSelection.selectedRows.recipes,
        snapshots: [],
      }),
      npcReferenceNames: Object.freeze([...new Set(relationSelection.selectedRows.itemSources
        .filter((row) => String(row.sourceRefType ?? '').trim().toLowerCase() === 'npc')
        .map((row) => String(row.sourceRefName ?? '').trim())
        .filter(Boolean))].sort((left, right) => left.localeCompare(right))),
      recipeDependencyItemIds: relationSelection.recipeDependencyItemIds,
      excludedSnapshots: Object.freeze({
        declaredRecordCount: relation.snapshotDeclaredRecordCount,
        missingPartCount: relation.snapshotParts.filter((part) => part.present === false).length,
        missingRecordCount: relation.missingSnapshotRecordCount,
        parts: Object.freeze(relation.snapshotParts),
      }),
    });
  }
  const manifest = {
    schemaVersion: 1,
    manifestKind: 'eight_domain_items_source',
    sourceMode: 'repository-frozen',
    networkAccess: false,
    productionSourceDelta: false,
    runId,
    sourceFiles,
    recordCount,
    selectedCount: selected.length,
    selectedIds,
    selectedIdsSha256,
    selectedItems: Object.freeze(selected.map((record) => Object.freeze({
      ...record,
      sourceRecordSha256: hashJson(record),
    }))),
    selectedPages: Object.freeze(selectedPages.map((record) => Object.freeze({
      ...record,
      sourceRecordSha256: hashJson(record),
    }))),
    itemInfoMatches: Object.freeze(itemInfoMatches),
    landing: Object.freeze({
      datasetType: binding.datasetType,
      sourceKey: binding.sourceKey,
      provider: binding.provider,
      sourcePage: binding.sourcePage,
      sourceId: binding.sourceId,
      sourceRevisionTimestamp: binding.sourceRevisionTimestamp,
      contentHash: binding.contentHash,
      payloadSha256: binding.payloadSha256,
      moduleContentSha256: binding.moduleContentSha256,
      canonicalSourceRowSha256: binding.canonicalSourceRowSha256,
      rowSha256: binding.rowSha256,
    }),
    ...(itemRelations ? { itemRelations } : {}),
  };
  return Object.freeze({ ...manifest, manifestSha256: hashJson(manifest) });
}
