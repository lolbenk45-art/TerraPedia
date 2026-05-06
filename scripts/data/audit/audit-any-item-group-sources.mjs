#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import { getProjectRoot } from '../lib/project-root.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';

const repoRoot = getProjectRoot();

const DEFAULT_GROUP_SOURCES = [
  {
    sourceFile: 'data/generated/recipe-material-reference.json',
    sourceKind: 'generated_recipe_reference',
    defaultDomains: ['recipe'],
  },
  {
    sourceFile: 'data/generated/recipe-group-overrides.json',
    sourceKind: 'recipe_group_override',
    defaultDomains: ['recipe'],
  },
  {
    sourceFile: 'data/generated/item-group-overrides.json',
    sourceKind: 'manual_wiki_source',
    defaultDomains: ['recipe'],
  },
];

const DEFAULT_CONSUMER_FILES = [
  {
    consumer: 'npc_shop',
    sourceFile: 'data/generated/npc-item-relations.bundle.json',
  },
  {
    consumer: 'shimmer',
    sourceFile: 'data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json',
  },
];

const STRUCTURED_GROUP_NAME_ALIASES = new Map([
  ['任何水果', 'Any Fruit'],
  ['任意水果', 'Any Fruit'],
  ['任何火把', 'Any Torch'],
  ['任意火把', 'Any Torch'],
  ['任何晶塔', 'Any Pylon'],
  ['任意晶塔', 'Any Pylon'],
  ['录音后的八音盒', 'Recorded Music Boxes'],
]);

export function normalizeGroupKey(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function classifyItemGroupSource(group) {
  const sourceKind = normalizeGroupKey(group?.sourceKind ?? group?.source_kind);
  const sourceProvider = text(group?.sourceProvider ?? group?.source_provider);
  const sourcePage = text(group?.sourcePage ?? group?.source_page);
  const sourceFile = text(group?.sourceFile ?? group?.source_file);
  const sourceUrls = array(group?.sourceUrls ?? group?.source_urls);

  if (
    sourceKind.includes('generated')
    || sourceProvider === 'wiki_gg'
    || sourceProvider.startsWith('wiki_gg')
    || sourcePage.startsWith('https://terraria.wiki.gg/')
    || sourceUrls.some((url) => String(url).startsWith('https://terraria.wiki.gg/'))
  ) {
    return 'source-backed';
  }
  if (sourceKind.includes('recipe_group_override') || sourceFile.endsWith('recipe-group-overrides.json')) {
    return 'derived-from-source';
  }
  if (sourceKind.includes('local') || sourceKind.includes('manual')) {
    return 'local-only';
  }
  return 'unknown';
}

export function buildAnyItemGroupSourceAudit({
  generatedAt = new Date().toISOString(),
  groupSources = [],
  consumerReferences = [],
} = {}) {
  const groups = [];
  const blockedGroups = [];
  for (const source of groupSources) {
    groups.push(...extractGroupsFromSource(source));
    blockedGroups.push(...extractBlockedGroupsFromSource(source));
  }

  const groupKeySet = new Set(groups.map((group) => group.key).filter(Boolean));
  const blockedGroupsByKey = new Map(blockedGroups.map((group) => [group.key, group]));
  const consumersByKey = groupConsumerReferences(consumerReferences);
  const duplicates = findDuplicates(groups);
  const consumerOnlyReferences = [...consumersByKey.entries()]
    .filter(([key]) => key && !groupKeySet.has(key) && !blockedGroupsByKey.has(key))
    .map(([, references]) => summarizeConsumerReferences(references))
    .sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));
  const blockedGroupReferences = [...consumersByKey.entries()]
    .filter(([key]) => key && !groupKeySet.has(key) && blockedGroupsByKey.has(key))
    .map(([key, references]) => ({
      ...summarizeConsumerReferences(references),
      blockReason: blockedGroupsByKey.get(key).blockReason,
      sourceFile: blockedGroupsByKey.get(key).sourceFile,
    }))
    .sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));
  const unresolvedMembers = groups.flatMap((group) =>
    group.unresolvedMembers.map((member) => ({
      canonicalName: group.canonicalName,
      sourceFile: group.sourceFile,
      member,
    })),
  );

  return {
    generatedAt,
    summary: {
      totalGroups: groups.length,
      uniqueGroupKeys: groupKeySet.size,
      byClassification: countBy(groups, (group) => group.classification),
      bySourceFile: countBy(groups, (group) => group.sourceFile),
      duplicateGroupKeys: duplicates.length,
      unresolvedMemberReferences: unresolvedMembers.length,
      blockedGroupReferences: blockedGroupReferences.length,
      consumerOnlyReferences: consumerOnlyReferences.length,
    },
    groups: groups.sort(compareGroupEntries),
    blockedGroups: blockedGroups.sort(compareGroupEntries),
    duplicates,
    unresolvedMembers,
    blockedGroupReferences,
    consumerOnlyReferences,
  };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  const generatedAt = new Date().toISOString();
  const dateTag = generatedAt.slice(0, 10);
  const outputJson = path.resolve(repoRoot, args.output ?? path.join('reports', 'item-groups', `any-item-group-source-audit-${dateTag}.json`));
  const outputMd = path.resolve(repoRoot, args.markdown ?? path.join('reports', 'item-groups', `any-item-group-source-audit-${dateTag}.md`));

  const groupSources = await loadDefaultGroupSources();
  const consumerReferences = await loadDefaultConsumerReferences();
  const audit = buildAnyItemGroupSourceAudit({ generatedAt, groupSources, consumerReferences });

  writeJson(outputJson, audit);
  await fs.mkdir(path.dirname(outputMd), { recursive: true });
  await fs.writeFile(outputMd, formatAuditMarkdown(audit), 'utf8');
  console.log(JSON.stringify({ outputJson, outputMd, summary: audit.summary }, null, 2));
}

async function loadDefaultGroupSources() {
  const sources = [];
  for (const source of DEFAULT_GROUP_SOURCES) {
    const absolutePath = path.resolve(repoRoot, source.sourceFile);
    const root = await readJsonIfExists(absolutePath);
    sources.push({
      ...source,
      exists: root !== null,
      root: root ?? {},
    });
  }
  return sources;
}

async function loadDefaultConsumerReferences() {
  const references = [];
  for (const consumerFile of DEFAULT_CONSUMER_FILES) {
    const absolutePath = path.resolve(repoRoot, consumerFile.sourceFile);
    const raw = await readTextIfExists(absolutePath);
    if (raw == null) {
      continue;
    }
    for (const canonicalName of extractAnyGroupNames(raw)) {
      references.push({
        consumer: consumerFile.consumer,
        canonicalName,
        sourceFile: consumerFile.sourceFile,
      });
    }
  }
  return references;
}

function extractGroupsFromSource(source) {
  const root = source.root ?? {};
  const rawGroups = Array.isArray(root.groups) ? root.groups : [];
  return rawGroups
    .map((group) => summarizeGroup(source, root, group))
    .filter((group) => group.key);
}

function extractBlockedGroupsFromSource(source) {
  const root = source.root ?? {};
  const rawGroups = Array.isArray(root.blockedGroups) ? root.blockedGroups : [];
  return rawGroups
    .map((group) => summarizeBlockedGroup(source, group))
    .filter((group) => group.key);
}

function summarizeBlockedGroup(source, group) {
  const canonicalName = text(group?.canonicalName ?? group?.canonical_name);
  const sourceFile = text(group?.sourceFile ?? group?.source_file) || source.sourceFile;
  return {
    key: normalizeGroupKey(canonicalName),
    canonicalName,
    displayNameEn: text(group?.displayNameEn ?? group?.display_name_en) || null,
    displayNameZh: text(group?.displayNameZh ?? group?.display_name_zh) || null,
    domains: array(group?.domains).length > 0 ? array(group.domains) : array(source.defaultDomains),
    sourceKind: text(group?.sourceKind ?? group?.source_kind) || null,
    sourceProvider: text(group?.sourceProvider ?? group?.source_provider) || null,
    sourcePage: text(group?.sourcePage ?? group?.source_page) || null,
    sourceFile,
    sourceUrls: array(group?.sourceUrls ?? group?.source_urls),
    classification: 'blocked',
    memberCount: 0,
    unresolvedMembers: [],
    blockReason: text(group?.blockReason ?? group?.block_reason) || null,
  };
}

function summarizeGroup(source, root, group) {
  const canonicalName = text(group?.canonicalName ?? group?.canonical_name);
  const sourceFile = text(group?.sourceFile ?? group?.source_file) || source.sourceFile;
  const enriched = {
    ...group,
    sourceKind: text(group?.sourceKind ?? group?.source_kind) || source.sourceKind,
    sourceProvider: text(group?.sourceProvider ?? group?.source_provider) || inferSourceProvider(root),
    sourceFile,
    sourceUrls: mergeLists(group?.sourceUrls ?? group?.source_urls, root.sourceUrls ?? root.source_urls),
  };
  const domains = array(group?.domains).length > 0 ? array(group.domains) : array(source.defaultDomains);
  const members = array(group?.members);
  return {
    key: normalizeGroupKey(canonicalName),
    canonicalName,
    displayNameEn: text(group?.displayNameEn ?? group?.display_name_en) || null,
    displayNameZh: text(group?.displayNameZh ?? group?.display_name_zh) || null,
    domains,
    sourceKind: enriched.sourceKind || null,
    sourceProvider: enriched.sourceProvider || null,
    sourcePage: text(group?.sourcePage ?? group?.source_page) || null,
    sourceFile,
    sourceUrls: enriched.sourceUrls,
    classification: classifyItemGroupSource(enriched),
    memberCount: members.length,
    unresolvedMembers: members.map(summarizeMember).filter((member) => !member.hasLookupKey),
  };
}

function summarizeMember(member) {
  const itemId = member?.itemId ?? member?.item_id ?? null;
  const internalName = text(member?.internalName ?? member?.internal_name);
  const name = text(member?.name);
  const nameZh = text(member?.nameZh ?? member?.name_zh);
  return {
    itemId,
    internalName: internalName || null,
    name: name || null,
    nameZh: nameZh || null,
    hasLookupKey: itemId != null || internalName !== '' || name !== '',
  };
}

function groupConsumerReferences(references) {
  const map = new Map();
  for (const reference of references) {
    const key = normalizeGroupKey(reference?.canonicalName);
    if (!key) {
      continue;
    }
    const bucket = map.get(key) ?? [];
    bucket.push({
      consumer: text(reference.consumer) || 'unknown',
      canonicalName: text(reference.canonicalName),
      sourceFile: text(reference.sourceFile),
    });
    map.set(key, bucket);
  }
  return map;
}

function findDuplicates(groups) {
  const byKey = new Map();
  for (const group of groups) {
    const bucket = byKey.get(group.key) ?? [];
    bucket.push(group);
    byKey.set(group.key, bucket);
  }
  return [...byKey.values()]
    .filter((entries) => entries.length > 1)
    .map((entries) => ({
      canonicalName: entries[0].canonicalName,
      sources: entries.map((entry) => ({
        sourceFile: entry.sourceFile,
        classification: entry.classification,
        memberCount: entry.memberCount,
      })),
    }))
    .sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));
}

function summarizeConsumerReferences(references) {
  return {
    canonicalName: references[0]?.canonicalName ?? '',
    consumers: [...new Set(references.map((reference) => reference.consumer).filter(Boolean))].sort(),
    sourceFiles: [...new Set(references.map((reference) => reference.sourceFile).filter(Boolean))].sort(),
  };
}

export function extractAnyGroupNames(raw) {
  const structuredNames = extractStructuredAnyGroupNames(raw);
  if (structuredNames.length > 0) {
    return structuredNames;
  }

  const names = new Set();
  const textValue = String(raw ?? '');
  const quotedAnyNamePattern = /"((?:Any|Recorded)\s+[^"]+?)"/g;
  for (const match of textValue.matchAll(quotedAnyNamePattern)) {
    names.add(match[1].trim());
  }
  const bareAnyNamePattern = /\b((?:Any|Recorded)\s+[A-Z][A-Za-z0-9' -]{1,60}?)(?=[\s<>{}¦|,"\\])/g;
  for (const match of textValue.matchAll(bareAnyNamePattern)) {
    names.add(match[1].trim());
  }
  return [...names].sort();
}

function extractStructuredAnyGroupNames(raw) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(raw ?? ''));
  } catch {
    return [];
  }
  const names = new Set();
  visitJsonValues(parsed, (value, key) => {
    if (typeof value !== 'string') {
      return;
    }
    if (!['canonicalName', 'nameEn', 'itemName', 'inputNameEn', 'ingredientName', 'ingredientNameRaw'].includes(key)) {
      const canonical = STRUCTURED_GROUP_NAME_ALIASES.get(value.trim());
      if (canonical) {
        names.add(canonical);
      }
      return;
    }
    if (/^(Any|Recorded)\s+/.test(value.trim())) {
      names.add(value.trim());
      return;
    }
    const canonical = STRUCTURED_GROUP_NAME_ALIASES.get(value.trim());
    if (canonical) {
      names.add(canonical);
    }
  });
  return [...names].sort();
}

function visitJsonValues(value, visitor, key = '') {
  visitor(value, key);
  if (Array.isArray(value)) {
    value.forEach((entry) => visitJsonValues(entry, visitor, key));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      visitJsonValues(childValue, visitor, childKey);
    }
  }
}

function formatAuditMarkdown(audit) {
  const lines = [
    '# Any Item Group Source Audit',
    '',
    `Generated at: ${audit.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Total groups: ${audit.summary.totalGroups}`,
    `- Unique group keys: ${audit.summary.uniqueGroupKeys}`,
    `- Duplicate group keys: ${audit.summary.duplicateGroupKeys}`,
    `- Unresolved member references: ${audit.summary.unresolvedMemberReferences}`,
    `- Blocked group references: ${audit.summary.blockedGroupReferences}`,
    `- Consumer-only references: ${audit.summary.consumerOnlyReferences}`,
    '',
    '## Classification Counts',
    '',
    ...Object.entries(audit.summary.byClassification).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## Consumer-Only References',
    '',
    ...(audit.consumerOnlyReferences.length
      ? audit.consumerOnlyReferences.map((entry) => `- ${entry.canonicalName}: ${entry.consumers.join(', ')} (${entry.sourceFiles.join(', ')})`)
      : ['- None']),
    '',
    '## Blocked Group References',
    '',
    ...(audit.blockedGroupReferences.length
      ? audit.blockedGroupReferences.map((entry) => `- ${entry.canonicalName}: ${entry.consumers.join(', ')} (${entry.blockReason || 'blocked'})`)
      : ['- None']),
    '',
    '## Duplicate Groups',
    '',
    ...(audit.duplicates.length
      ? audit.duplicates.map((entry) => `- ${entry.canonicalName}: ${entry.sources.map((source) => source.sourceFile).join(', ')}`)
      : ['- None']),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function compareGroupEntries(left, right) {
  return left.key.localeCompare(right.key) || left.sourceFile.localeCompare(right.sourceFile);
}

function inferSourceProvider(root) {
  const sourceType = text(root?.sourceType ?? root?.source_type);
  if (sourceType.startsWith('wiki_gg')) {
    return 'wiki_gg';
  }
  return sourceType;
}

function mergeLists(...lists) {
  return [...new Set(lists.flatMap((list) => array(list)).map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? '').trim();
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
