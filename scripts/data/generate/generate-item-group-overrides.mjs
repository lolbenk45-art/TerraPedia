#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const DEFAULT_ITEMS_PATH = 'data/standardized/items.standardized.json';
const DEFAULT_ZH_MAP_PATH = 'data/generated/item-zh-map.json';
const DEFAULT_OUTPUT_PATH = 'data/generated/item-group-overrides.json';
const DEFAULT_SHIMMER_SOURCE_FILE = 'data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json';
const DEFAULT_SHIMMER_RAW_SOURCE_FILE = 'data/generated/wiki-shimmer.latest.json';

const WIKI_PROVIDER = 'wiki_gg';
const PYLONS_SOURCE_PAGE = 'https://terraria.wiki.gg/wiki/Pylons';
const SHIMMER_SOURCE_PAGE = 'https://terraria.wiki.gg/wiki/Shimmer';

export const ANY_PYLON_INTERNAL_NAMES = [
  'TeleportationPylonPurity',
  'TeleportationPylonJungle',
  'TeleportationPylonHallow',
  'TeleportationPylonUnderground',
  'TeleportationPylonOcean',
  'TeleportationPylonDesert',
  'TeleportationPylonSnow',
  'TeleportationPylonMushroom',
  'TeleportationPylonUnderworld',
];

export function buildItemGroupOverrides({
  generatedAt = new Date().toISOString(),
  standardizedItemsRoot = {},
  zhMapRoot = {},
  shimmerRoot = {},
  shimmerRawRoot = {},
  pylonInternalNames = null,
} = {}) {
  const lookup = buildItemLookup({
    standardizedItems: recordsFromRoot(standardizedItemsRoot),
    zhMapRecords: zhMapRoot?.records ?? zhMapRoot,
  });
  const pylonItemIds = extractShimmerPylonItemIds(shimmerRawRoot?.wikitext);
  const sourceRevisionTimestamp = shimmerRawRoot?.revisionTimestamp
    ?? standardizedItemsRoot?.upstreamMeta?.sourceRevisionTimestamp
    ?? null;
  const pylonMembers = pylonItemIds.length > 0
    ? selectRequiredMembersByItemIds(lookup, pylonItemIds, 'Any Pylon')
    : selectRequiredMembers(lookup, pylonInternalNames ?? ANY_PYLON_INTERNAL_NAMES, 'Any Pylon');

  return {
    schemaVersion: '1.0.0',
    generatedAt,
    sourceProvider: WIKI_PROVIDER,
    sourceFiles: [
      DEFAULT_ITEMS_PATH,
      DEFAULT_ZH_MAP_PATH,
      DEFAULT_SHIMMER_SOURCE_FILE,
      DEFAULT_SHIMMER_RAW_SOURCE_FILE,
    ],
    groups: [
      {
        canonicalName: 'Any Pylon',
        displayNameEn: 'Any Pylon',
        displayNameZh: '任何晶塔',
        aliases: ['任意晶塔', 'Any Teleportation Pylon'],
        domains: ['shimmer'],
        sourceKind: 'curated_wiki_item_group',
        sourceProvider: WIKI_PROVIDER,
        sourcePage: PYLONS_SOURCE_PAGE,
        sourceRevisionTimestamp,
        sourceFile: DEFAULT_OUTPUT_PATH,
        sourceUrls: [PYLONS_SOURCE_PAGE, SHIMMER_SOURCE_PAGE],
        sourceLabel: 'Any Pylon members are parsed from the Shimmer raw wikitext ID list and verified against standardized wiki item data.',
        members: pylonMembers,
      },
    ],
    blockedGroups: [
      buildRecordedMusicBoxesBlockedGroup(shimmerRoot),
    ],
  };
}

export function buildItemLookup({ standardizedItems = [], zhMapRecords = {} } = {}) {
  const zhByInternalName = normalizeZhMap(zhMapRecords);
  const lookup = new Map();
  for (const item of standardizedItems) {
    const internalName = text(item?.internalName);
    if (!internalName) {
      continue;
    }
    const zh = zhByInternalName.get(internalName);
    lookup.set(internalName, {
      itemId: item?.id ?? item?.itemId ?? null,
      internalName,
      name: text(item?.name) || null,
      nameZh: text(item?.nameZh) || text(zh?.nameZh) || null,
      ...(text(item?.image) || text(item?.imageUrl)
        ? { image: text(item?.image) || text(item?.imageUrl) }
        : {}),
    });
  }
  return lookup;
}

export function selectRequiredMembers(lookup, internalNames, groupName) {
  const missing = [];
  const members = [];
  for (const internalName of internalNames) {
    const member = lookup.get(internalName);
    if (!member) {
      missing.push(internalName);
      continue;
    }
    members.push(compactMember(member));
  }
  if (missing.length > 0) {
    throw new Error(`${groupName} missing required item members: ${missing.join(', ')}`);
  }
  return members;
}

export function selectRequiredMembersByItemIds(lookup, itemIds, groupName) {
  const byItemId = new Map([...lookup.values()].map((member) => [Number(member.itemId), member]));
  const missing = [];
  const members = [];
  for (const itemId of itemIds) {
    const member = byItemId.get(Number(itemId));
    if (!member) {
      missing.push(itemId);
      continue;
    }
    members.push(compactMember(member));
  }
  if (missing.length > 0) {
    throw new Error(`${groupName} missing required item ids: ${missing.join(', ')}`);
  }
  return members;
}

export function extractShimmerPylonItemIds(wikitext) {
  const textValue = String(wikitext ?? '');
  const match = textValue.match(/((?:\s*\d+\s*,)+)\s*<!--\s*Any Pylon\s*\(=>\s*Aether Pylon\)\s*-->/i);
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/\d+/g)].map((entry) => Number(entry[0]));
}

export function selectRecordedMusicBoxMembers() {
  return [];
}

async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const itemsPath = path.resolve(repoRoot, args.items ?? DEFAULT_ITEMS_PATH);
  const zhMapPath = path.resolve(repoRoot, args.zhMap ?? DEFAULT_ZH_MAP_PATH);
  const shimmerPath = path.resolve(repoRoot, args.shimmer ?? DEFAULT_SHIMMER_SOURCE_FILE);
  const shimmerRawPath = path.resolve(repoRoot, args.shimmerRaw ?? DEFAULT_SHIMMER_RAW_SOURCE_FILE);
  const outputPath = path.resolve(repoRoot, args.output ?? DEFAULT_OUTPUT_PATH);
  const payload = buildItemGroupOverrides({
    standardizedItemsRoot: readJson(itemsPath),
    zhMapRoot: readJson(zhMapPath),
    shimmerRoot: readJsonIfExists(shimmerPath) ?? {},
    shimmerRawRoot: readJsonIfExists(shimmerRawPath) ?? {},
  });
  writeJson(outputPath, payload);
  console.log(JSON.stringify({
    outputPath,
    groups: payload.groups.length,
    blockedGroups: payload.blockedGroups.length,
  }, null, 2));
}

function buildRecordedMusicBoxesBlockedGroup(shimmerRoot) {
  const record = recordsFromRoot(shimmerRoot).find((entry) => entry?.inputNameEn === 'Recorded Music Boxes');
  return {
    canonicalName: 'Recorded Music Boxes',
    displayNameEn: 'Recorded Music Boxes',
    displayNameZh: '录音后的八音盒',
    domains: ['shimmer'],
    sourceKind: 'blocked_consumer_reference',
    sourceProvider: WIKI_PROVIDER,
    sourcePage: SHIMMER_SOURCE_PAGE,
    sourceRevisionTimestamp: record?.sourceRevisionTimestamp ?? null,
    sourceFile: DEFAULT_SHIMMER_SOURCE_FILE,
    sourceUrls: [SHIMMER_SOURCE_PAGE],
    blockReason: 'Local artifacts prove the shimmer item_group reference but do not provide an explicit source-backed member list.',
  };
}

function normalizeZhMap(records) {
  const map = new Map();
  if (Array.isArray(records)) {
    for (const record of records) {
      const internalName = text(record?.internalName);
      if (internalName) {
        map.set(internalName, record);
      }
    }
    return map;
  }
  if (records && typeof records === 'object') {
    for (const [key, record] of Object.entries(records)) {
      const internalName = text(record?.internalName) || key;
      if (internalName) {
        map.set(internalName, record);
      }
    }
  }
  return map;
}

function compactMember(member) {
  const result = {
    itemId: member.itemId,
    internalName: member.internalName,
    name: member.name,
    nameZh: member.nameZh,
  };
  if (member.image) {
    result.image = member.image;
  }
  return result;
}

function recordsFromRoot(root) {
  if (Array.isArray(root)) {
    return root;
  }
  if (Array.isArray(root?.records)) {
    return root.records;
  }
  if (Array.isArray(root?.items)) {
    return root.items;
  }
  return [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJson(filePath);
}

function text(value) {
  return String(value ?? '').trim();
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
