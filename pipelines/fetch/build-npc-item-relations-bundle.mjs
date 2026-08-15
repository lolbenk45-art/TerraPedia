#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from '../lib/project-root.mjs';

const repoRoot = resolveProjectPath();

function slug(value) {
  return String(value ?? '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function wikiPageUrl(pageTitle, apiUrl) {
  const title = String(pageTitle ?? '').trim();
  if (!title) return null;
  const wikiPath = String(apiUrl ?? '').includes('/zh/api.php') ? '/zh/wiki/' : '/wiki/';
  return `https://terraria.wiki.gg${wikiPath}${encodeURIComponent(title).replaceAll('%20', '_')}`;
}

function normalizeRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.normalizedRows)) return value.normalizedRows;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function compactRecordKey(value) {
  const key = String(value ?? '').trim();
  return key.length <= 64 ? key : sha256Hex(key);
}

function isTruthyFlag(value) {
  if (value === true || value === 1) return true;
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

function isCrawlerRelationItemRow(row = {}) {
  const itemName = String(row?.itemName ?? row?.item ?? row?.name ?? '').trim();
  if (!itemName) return false;
  return !itemName.startsWith(':group:');
}

const REVIEWED_ITEM_DISAMBIGUATION_CANONICAL_NAMES = new Map([
  ['brain scrambler (item)', 'Brain Scrambler'],
  ['shark fin (sand shark)', 'Shark Fin'],
  ['shark fin (bone biter)', 'Shark Fin'],
  ['shark fin (flesh reaver)', 'Shark Fin'],
  ['shark fin (crystal thresher)', 'Shark Fin']
]);

const REVIEWED_DEFAULT_MIMIC_ITEM_NAMES = new Set([
  'dual hook',
  'magic dagger',
  "philosopher's stone",
  'titan glove',
  'star cloak',
  'cross necklace'
]);

const REVIEWED_BOSS_KIND_NPC_LOOT_INTERNAL_NAMES = new Set([
  'DD2DarkMageT1',
  'DD2DarkMageT3',
  'DD2OgreT2',
  'DD2OgreT3'
]);

const REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION = 'reviewed_page_level_shared_loot';

function canonicalizeReviewedItemName(value) {
  const text = String(value ?? '').trim();
  if (!text) return value ?? null;
  return REVIEWED_ITEM_DISAMBIGUATION_CANONICAL_NAMES.get(text.toLowerCase()) ?? text;
}

function isBossNpcRecord(npc = {}) {
  if (isTruthyFlag(npc?.flags?.boss ?? npc?.boss ?? npc?.isBoss)) return true;
  const profileKind = String(npc?.wikiCrawler?.profile?.kind ?? npc?.profile?.kind ?? '').trim();
  return /\bboss\b/i.test(profileKind);
}

function isReviewedBossKindNpcLootException(npc = {}) {
  return REVIEWED_BOSS_KIND_NPC_LOOT_INTERNAL_NAMES.has(String(npc?.internalName ?? '').trim());
}

function isReviewedBossKindNpcExactLootRow({ npc, row }) {
  if (!isReviewedBossKindNpcLootException(npc)) return false;
  const sourceRefInternalName = String(row?.sourceRefInternalName ?? row?.raw?.sourceRefInternalName ?? '').trim();
  const sourceRefResolution = String(row?.sourceRefResolution ?? row?.raw?.sourceRefResolution ?? '').trim();
  return sourceRefInternalName === String(npc?.internalName ?? '').trim()
    && sourceRefResolution === 'exact_internal_name';
}

function buildBossNpcKeys(npcs = []) {
  return new Set(
    npcs
      .filter((npc) => isBossNpcRecord(npc) && !isReviewedBossKindNpcLootException(npc))
      .flatMap((npc) => [npc.internalName, npc.name])
      .map(slug)
      .filter(Boolean)
  );
}

function buildRelationRecord({ npc, row, relationType, sortOrder }) {
  const npcInternalName = npc.internalName ?? row.npcInternalName ?? null;
  const npcName = npc.name ?? row.npcName ?? npcInternalName;
  const itemName = canonicalizeReviewedItemName(row.itemName ?? row.item ?? row.name ?? null);
  const pageTitle = npc.wikiCrawler?.pageTitle ?? npcName;
  const sourceMetadata = npc.wikiCrawler?.sourceMetadata ?? {};
  const sourceRowIdentity = row.sourceRowKey ?? row.sourceRowIndex ?? sortOrder;
  const explicitExactSourceRef = String(row.sourceRefResolution ?? row.raw?.sourceRefResolution ?? '').trim() === 'exact_internal_name'
    && String(row.sourceRefInternalName ?? row.raw?.sourceRefInternalName ?? '').trim() === String(npcInternalName ?? '').trim();
  const readableRecordKey = `npc-item:${slug(npcInternalName ?? npcName)}:${relationType}:${slug(itemName)}:${slug(sourceRowIdentity)}`;
  return {
    recordKey: compactRecordKey(readableRecordKey),
    relationType,
    npcInternalName,
    npcName,
    itemName,
    sourceRefName: row.sourceRefName ?? null,
    sourceRefInternalName: row.sourceRefInternalName ?? npcInternalName,
    sourceRefResolution: row.sourceRefResolution ?? (npcInternalName ? 'exact_internal_name' : null),
    priceText: row.priceText ?? row.price ?? row.valueText ?? null,
    chanceText: row.chanceText ?? null,
    quantityText: row.quantityText ?? null,
    conditionText: row.conditionText ?? row.condition ?? row.availabilityNote ?? null,
    sourceUrl: row.sourceUrl ?? wikiPageUrl(pageTitle, sourceMetadata.apiUrl),
    sourceSection: row.sourceSection ?? (relationType === 'shop' ? 'shop' : 'drops'),
    sourceRowIndex: row.sourceRowIndex ?? sortOrder,
    raw: {
      ...(row.raw ?? row),
      sourceRefName: row.sourceRefName ?? row.raw?.sourceRefName ?? null,
      sourceRefInternalName: row.sourceRefInternalName ?? npcInternalName,
      sourceRefResolution: row.sourceRefResolution ?? (npcInternalName ? 'exact_internal_name' : null),
      explicitExactSourceRef
    }
  };
}

export function buildNpcItemRelationsBundle({
  standardizedPayload,
  baselineBundle,
  noDirectItemLootInternalNames = new Set(),
  generatedAt = new Date().toISOString()
} = {}) {
  const generatedRecords = [];
  const generatedBackfillCandidates = [];
  const npcs = Array.isArray(standardizedPayload?.records) ? standardizedPayload.records : [];
  const bossNpcKeys = buildBossNpcKeys(npcs);
  const currentNpcRelationKeys = buildCurrentNpcRelationKeys(npcs, {
    noDirectItemLootInternalNames
  });

  for (const npc of npcs) {
    const wikiCrawler = npc.wikiCrawler ?? {};
    const isBossNpc = isBossNpcRecord(npc);
    const shopRows = normalizeRows(wikiCrawler.shop);
    const lootRows = normalizeRows(wikiCrawler.loot);

    for (let index = 0; index < shopRows.length; index += 1) {
      if (!isCrawlerRelationItemRow(shopRows[index])) continue;
      generatedRecords.push(buildRelationRecord({
        npc,
        row: shopRows[index],
        relationType: 'shop',
        sortOrder: index
      }));
    }

    if (!isBossNpc || isReviewedBossKindNpcLootException(npc)) {
      for (let index = 0; index < lootRows.length; index += 1) {
        if (!isCrawlerRelationItemRow(lootRows[index])) continue;
        if (isBossNpc && !isReviewedBossKindNpcExactLootRow({ npc, row: lootRows[index] })) continue;
        const lootRow = normalizeReviewedSharedLootRow({
          npc,
          row: normalizeOrdinaryMimicLootRow({
            npc,
            row: lootRows[index],
          }),
        });
        if (!lootRow) continue;
        generatedRecords.push(buildRelationRecord({
          npc,
          row: lootRow,
          relationType: 'loot',
          sortOrder: index
        }));
      }
    }

    const backfillCandidates = isBossNpc ? [] : Array.isArray(wikiCrawler.backfillCandidates) ? wikiCrawler.backfillCandidates : [];
    for (const candidate of backfillCandidates) {
      generatedBackfillCandidates.push({
        ...candidate,
        entityInternalName: candidate.entityInternalName ?? npc.internalName ?? null,
        entitySourceId: candidate.entitySourceId ?? npc.id ?? null
      });
    }
  }

  const records = mergeRecords({
    baselineRecords: baselineBundle?.records,
    generatedRecords,
    bossNpcKeys,
    currentNpcRelationKeys
  });
  const backfillCandidates = mergeBackfillCandidates({
    baselineBackfillCandidates: baselineBundle?.backfillCandidates,
    generatedBackfillCandidates,
    bossNpcKeys
  });

  return {
    schemaVersion: 1,
    source: 'wiki-crawler:npc',
    generatedAt,
    records,
    backfillCandidates
  };
}

function normalizeOrdinaryMimicLootRow({ npc, row }) {
  if (!isOrdinaryMimicGroupPageNpc(npc)) return row;
  return normalizeReviewedOrdinaryMimicRow(row);
}

function normalizeReviewedSharedLootRow({ npc, row }) {
  const reviewedSharedLoot = npc?.wikiCrawler?.reviewedSharedLoot;
  if (!row || !reviewedSharedLoot || typeof reviewedSharedLoot !== 'object') return row;
  const targetInternalNames = Array.isArray(reviewedSharedLoot.targetInternalNames)
    ? reviewedSharedLoot.targetInternalNames.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    : [];
  const npcInternalName = String(npc?.internalName ?? '').trim();
  const evidenceSource = String(reviewedSharedLoot.evidenceSource ?? '').trim();
  if (!npcInternalName || !evidenceSource || !targetInternalNames.includes(npcInternalName)) {
    return row;
  }

  const pageTitle = String(npc?.wikiCrawler?.pageTitle ?? npc?.name ?? '').trim();
  return {
    ...row,
    sourceRefName: row.sourceRefName ?? pageTitle,
    sourceRefInternalName: npcInternalName,
    sourceRefResolution: REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION,
    raw: {
      ...(row.raw ?? row),
      sourceRefName: row.sourceRefName ?? pageTitle,
      sourceRefInternalName: npcInternalName,
      sourceRefResolution: REVIEWED_PAGE_LEVEL_SHARED_LOOT_RESOLUTION,
      reviewedSharedLootEvidenceSource: evidenceSource,
    },
  };
}

function isOrdinaryMimicGroupPageNpc(npc = {}) {
  return String(npc.internalName ?? '').trim() === 'Mimic'
    && String(npc.wikiCrawler?.pageTitle ?? npc.name ?? '').trim().toLowerCase() === 'mimics';
}

function normalizeReviewedOrdinaryMimicRow(row) {
  const itemName = canonicalizeReviewedItemName(row?.itemName ?? row?.item ?? row?.name ?? null);
  if (!REVIEWED_DEFAULT_MIMIC_ITEM_NAMES.has(String(itemName ?? '').trim().toLowerCase())) {
    return null;
  }
  return {
    ...row,
    itemName,
    sourceRefName: 'Mimics',
    sourceRefInternalName: 'Mimic',
    sourceRefResolution: 'reviewed_mimic_contract',
    raw: {
      ...(row.raw ?? row),
      itemName,
      sourceRefName: 'Mimics',
      sourceRefInternalName: 'Mimic',
      sourceRefResolution: 'reviewed_mimic_contract',
    },
  };
}

function normalizeReviewedOrdinaryMimicBaselineRow(row) {
  if (!isOrdinaryMimicBaselineRow(row)) return row;
  return normalizeReviewedOrdinaryMimicRow(row);
}

function isOrdinaryMimicBaselineRow(row = {}) {
  if (slug(row?.relationType) !== 'loot') return false;
  if (String(row?.npcInternalName ?? row?.raw?.npcInternalName ?? '').trim() !== 'Mimic') return false;
  if (String(row?.sourceRefInternalName ?? row?.raw?.sourceRefInternalName ?? row?.npcInternalName ?? '').trim() !== 'Mimic') {
    return false;
  }

  const sourceRefName = String(row?.sourceRefName ?? row?.raw?.sourceRefName ?? '').trim().toLowerCase();
  if (sourceRefName === 'mimics') return true;

  const sourceUrl = String(row?.sourceUrl ?? row?.raw?.sourceUrl ?? '').trim();
  if (/\/(?:zh\/)?wiki\/Mimics(?:[#?]|$)/i.test(sourceUrl)) return true;

  return false;
}

function isBossLootRecord(row, bossNpcKeys = new Set()) {
  if (slug(row?.relationType) !== 'loot') return false;
  const keys = [
    row?.sourceRefInternalName,
    row?.npcInternalName,
    row?.sourceRefName,
    row?.npcName
  ].map(slug).filter(Boolean);
  return keys.some((key) => bossNpcKeys.has(key));
}

function normalizeRecordKeyRow(row) {
  const recordKey = String(row?.recordKey ?? '').trim();
  if (!recordKey || recordKey.length <= 64) {
    return row;
  }
  return {
    ...row,
    recordKey: compactRecordKey(recordKey)
  };
}

function dedupeGeneratedRecordsByLogicalKey(records = []) {
  const rows = [];
  const seenLogicalKeys = new Set();
  for (const row of Array.isArray(records) ? records : []) {
    const logicalKey = buildLogicalRecordKey(row, { preserveForwardRowIdentity: true });
    if (logicalKey) {
      if (seenLogicalKeys.has(logicalKey)) continue;
      seenLogicalKeys.add(logicalKey);
    }
    rows.push(row);
  }
  return rows;
}

function mergeRecords({ baselineRecords, generatedRecords, bossNpcKeys = new Set(), currentNpcRelationKeys = new Set() }) {
  const generatedRows = dedupeGeneratedRecordsByLogicalKey(generatedRecords);
  const generatedLogicalKeys = new Set(generatedRows.map(buildLogicalRecordKey).filter(Boolean));
  const rows = [];
  const seenRecordKeys = new Set();

  for (const baselineRow of (Array.isArray(baselineRecords) ? baselineRecords : []).filter((entry) => !isBossLootRecord(entry, bossNpcKeys))) {
    const row = normalizeReviewedOrdinaryMimicBaselineRow(baselineRow);
    if (!row) continue;
    const logicalKey = buildLogicalRecordKey(row);
    if (logicalKey && generatedLogicalKeys.has(logicalKey)) continue;
    if (isCurrentNpcRelationBaselineRow(row, currentNpcRelationKeys)) continue;
    const nextRow = normalizeRecordKeyRow(row);
    const recordKey = String(nextRow?.recordKey ?? '').trim();
    if (recordKey && seenRecordKeys.has(recordKey)) continue;
    if (recordKey) seenRecordKeys.add(recordKey);
    rows.push(nextRow);
  }

  for (const row of generatedRows.filter((entry) => !isBossLootRecord(entry, bossNpcKeys))) {
    const nextRow = normalizeRecordKeyRow(row);
    const recordKey = String(nextRow?.recordKey ?? '').trim();
    if (recordKey && seenRecordKeys.has(recordKey)) continue;
    if (recordKey) seenRecordKeys.add(recordKey);
    rows.push(nextRow);
  }

  return rows;
}

function buildCurrentNpcRelationKeys(npcs = [], { noDirectItemLootInternalNames = new Set() } = {}) {
  const keys = new Set();
  const noDirectSet = normalizeInternalNameSet(noDirectItemLootInternalNames);
  for (const npc of Array.isArray(npcs) ? npcs : []) {
    const npcKey = slug(npc?.internalName);
    if (!npcKey) continue;
    if (hasCurrentRelationPayload(npc, 'loot', noDirectSet)) {
      keys.add(`loot:${npcKey}`);
    }
    if (hasCurrentRelationPayload(npc, 'shop', noDirectSet)) {
      keys.add(`shop:${npcKey}`);
    }
  }
  return keys;
}

function hasCurrentRelationPayload(npc, relationType, noDirectSet = new Set()) {
  const wikiCrawler = npc?.wikiCrawler;
  const key = relationType === 'shop' ? 'shop' : 'loot';
  const value = wikiCrawler?.[key];
  const rows = normalizeRows(value);
  if (rows.length > 0) return relationType !== 'loot';
  if (relationType !== 'loot') return false;
  if (!Array.isArray(value) && !Array.isArray(value?.normalizedRows) && !Array.isArray(value?.items)) return false;
  if (!noDirectSet.has(slug(npc?.internalName))) return false;
  return hasCurrentNoDirectLootEvidence(npc, wikiCrawler);
}

function normalizeInternalNameSet(values) {
  if (!(values instanceof Set)) return new Set();
  return new Set([...values].map(slug).filter(Boolean));
}

function hasCurrentNoDirectLootEvidence(npc = {}, wikiCrawler = {}) {
  const sourceLootRowsTotal = Number(wikiCrawler.sourceLootRowsTotal);
  const hasPositiveSourceLootRows = Object.hasOwn(wikiCrawler, 'sourceLootRowsTotal')
    && Number.isFinite(sourceLootRowsTotal)
    && sourceLootRowsTotal > 0;
  return hasPositiveSourceLootRows && hasMatchingSourceInfobox(npc, wikiCrawler.sourceInfoboxes);
}

function hasMatchingSourceInfobox(npc = {}, sourceInfoboxes = []) {
  const rows = Array.isArray(sourceInfoboxes) ? sourceInfoboxes : [];
  const npcId = String(npc?.id ?? npc?.gameId ?? npc?.game_id ?? '').trim();
  const npcImageTitle = normalizeFileTitle(npc?.imageFileTitle ?? npc?.image_file_title ?? npc?.image);
  return rows.some((sourceInfobox) => {
    const autoId = String(sourceInfobox?.autoId ?? sourceInfobox?.auto_id ?? '').trim();
    if (npcId && autoId) return npcId === autoId;
    if (autoId) return false;
    const sourceImageTitle = normalizeFileTitle(sourceInfobox?.image ?? sourceInfobox?.imageFileTitle ?? sourceInfobox?.image_file_title);
    return Boolean(npcImageTitle && sourceImageTitle && npcImageTitle === sourceImageTitle);
  });
}

function normalizeFileTitle(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const fileMatch = /\[\[\s*File:([^|\]]+)/i.exec(text);
  return (fileMatch?.[1] ?? text)
    .replace(/^File:/i, '')
    .trim()
    .toLowerCase();
}

function isCurrentNpcRelationBaselineRow(row = {}, currentNpcRelationKeys = new Set()) {
  if (!(currentNpcRelationKeys instanceof Set) || currentNpcRelationKeys.size === 0) return false;
  const relationType = slug(row?.relationType);
  if (!relationType) return false;
  const candidates = [
    row?.sourceRefInternalName,
    row?.raw?.sourceRefInternalName,
    row?.npcInternalName,
    row?.raw?.npcInternalName,
  ].map(slug).filter(Boolean);
  return candidates.some((candidate) => currentNpcRelationKeys.has(`${relationType}:${candidate}`));
}

function isBossBackfillCandidate(candidate, bossNpcKeys = new Set()) {
  const keys = [
    candidate?.entityInternalName,
    candidate?.entityName,
    candidate?.sourceRefInternalName,
    candidate?.sourceRefName
  ].map(slug).filter(Boolean);
  return keys.some((key) => bossNpcKeys.has(key));
}

function mergeBackfillCandidates({ baselineBackfillCandidates, generatedBackfillCandidates, bossNpcKeys = new Set() }) {
  const candidates = [];
  const seenKeys = new Set();

  for (const candidate of [
    ...(Array.isArray(baselineBackfillCandidates) ? baselineBackfillCandidates : []),
    ...(Array.isArray(generatedBackfillCandidates) ? generatedBackfillCandidates : [])
  ]) {
    if (isBossBackfillCandidate(candidate, bossNpcKeys)) continue;
    const key = String(candidate?.candidateKey ?? '').trim() || JSON.stringify(candidate);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    candidates.push(candidate);
  }

  return candidates;
}

function buildLogicalRecordKey(row, { preserveForwardRowIdentity = false } = {}) {
  const npcKey = slug(row?.sourceRefInternalName ?? row?.npcInternalName ?? row?.npcName);
  const itemKey = slug(row?.itemInternalName ?? canonicalizeReviewedItemName(row?.itemName));
  const relationType = slug(row?.relationType);
  if (!npcKey || !itemKey || !relationType) {
    return null;
  }

  return JSON.stringify([
    npcKey,
    relationType,
    itemKey,
    normalizeLogicalText(row?.chanceText),
    normalizeLogicalText(row?.quantityText),
    normalizeLogicalText(row?.conditionText ?? row?.conditions),
    slug(row?.sourceSection ?? defaultSourceSection(row?.relationType)),
    preserveForwardRowIdentity && isAuthoritativeForwardNpcPageRow(row)
      ? normalizeLogicalText(row?.sourceRowKey ?? row?.sourceRowIndex ?? row?.raw?.sourceRowKey ?? row?.raw?.sourceRowIndex)
      : null
  ]);
}

function normalizeLogicalText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isAuthoritativeForwardNpcPageRow(row = {}) {
  if (slug(row?.relationType) !== 'loot') return false;
  if (String(row?.sourceRefResolution ?? row?.raw?.sourceRefResolution ?? '').trim() !== 'exact_internal_name') {
    return false;
  }

  const sourceRefInternalName = String(row?.sourceRefInternalName ?? row?.raw?.sourceRefInternalName ?? '').trim();
  const npcInternalName = String(row?.npcInternalName ?? row?.raw?.npcInternalName ?? '').trim();
  if (!sourceRefInternalName || !npcInternalName || sourceRefInternalName !== npcInternalName) {
    return false;
  }

  if (normalizeLogicalText(row?.sourceRowKey ?? row?.sourceRowIndex ?? row?.raw?.sourceRowKey ?? row?.raw?.sourceRowIndex) === '') {
    return false;
  }

  return hasExplicitExactSourceRef(row);
}

function hasExplicitExactSourceRef(row = {}) {
  return row?.raw?.explicitExactSourceRef === true
    && String(row?.raw?.sourceRefResolution ?? '').trim() === 'exact_internal_name'
    && String(row?.raw?.sourceRefInternalName ?? '').trim() === String(row?.npcInternalName ?? '').trim();
}

function defaultSourceSection(relationType) {
  return slug(relationType) === 'shop' ? 'shop' : 'drops';
}

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) args[body.slice(0, index)] = body.slice(index + 1);
    else args[body] = 'true';
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(
    repoRoot,
    args.input ?? path.join('data', 'generated', 'wiki-crawler-npc-bridge', 'standardized', 'npcs.standardized.json')
  );
  const outputPath = path.resolve(
    repoRoot,
    args.output ?? path.join('data', 'generated', 'npc-item-relations.bundle.json')
  );
  const standardizedPayload = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const baselineBundle = await readOptionalJson(outputPath);
  const noDirectItemLootInternalNames = await loadNoDirectItemLootInternalNames();
  const bundle = buildNpcItemRelationsBundle({
    standardizedPayload,
    baselineBundle,
    noDirectItemLootInternalNames,
    generatedAt: args['generated-at'] ?? args.generatedAt ?? new Date().toISOString()
  });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(bundle, null, 2));
  console.log(`NPC item relations bundle: ${outputPath}`);
  console.log(`records=${bundle.records.length} backfillCandidates=${bundle.backfillCandidates.length}`);
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function loadNoDirectItemLootInternalNames() {
  const contractPath = path.join(repoRoot, 'docs', 'contracts', 'npc-domain-no-direct-item-loot-contract.md');
  try {
    const text = await fs.readFile(contractPath, 'utf8');
    return new Set(parseMarkdownTableRows(text).map((row) => row.npcInternalName).filter(Boolean));
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set();
    throw error;
  }
}

function parseMarkdownTableRows(text) {
  const rows = [];
  const lines = String(text ?? '').split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
  let headers = null;
  for (const line of lines) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length === 0 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells.includes('npcInternalName')) {
      headers = cells;
      continue;
    }
    if (!headers || !headers.includes('npcInternalName')) continue;
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? null]));
    const npcInternalName = String(row.npcInternalName ?? '').trim();
    if (npcInternalName && npcInternalName !== '_none yet_') rows.push(row);
  }
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
