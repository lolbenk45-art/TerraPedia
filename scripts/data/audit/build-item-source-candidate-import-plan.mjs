#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  auditItemSourceGapCandidates
} from './audit-item-source-gap-candidates.mjs';
import {
  numericOption,
  parseCliArgs,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { normalizeText } from '../lib/wiki-page-utils.mjs';

const MUTATION_FLAGS = new Set([
  'apply',
  'write-db',
  'sync',
  'import',
  'materialize',
  'backfill',
  'refresh',
  'pipeline'
]);

const ALLOWED_SOURCE_TYPES = new Set([
  'drop',
  'shop',
  'container',
  'crate',
  'treasure_bag',
  'worldgen',
  'mining',
  'quest_reward',
  'craft',
  'unknown'
]);

const ALLOWED_SOURCE_REF_TYPES = new Set([
  'npc',
  'boss',
  'item',
  'container',
  'crate',
  'treasure_bag',
  'world',
  'unknown'
]);

const ITEM_BACKED_SOURCE_REF_TYPES = new Set(['item', 'container', 'crate', 'treasure_bag']);
const NPC_BACKED_SOURCE_REF_TYPES = new Set(['npc', 'boss']);
const CONTAINER_LIKE_NPC_POLLUTION = /\b(chest|crate|treasure\s+bag|lock\s*box|present|bag)\b/i;

export function parseBuildItemSourceCandidateImportPlanArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key) && value !== false && value !== 'false') {
      throw new Error(`read-only import plan refuses mutation flag: --${key}`);
    }
  }

  return {
    rawItemPageDir: options['raw-dir'] ?? options.rawDir ?? '/home/lolben/data/terraPedia/raw/wiki/item-pages',
    npcParsedPath: options.npcs ?? sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'),
    standardizedNpcsPath: options['standardized-npcs'] ?? path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json'),
    standardizedItemsPath: options.items ?? options['standardized-items'] ?? path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json'),
    itemSourcesDir: options['item-sources-dir'] ?? options.itemSourcesDir ?? path.join(process.cwd(), 'data', 'standardized-view', 'item_relations', 'itemSources'),
    sample: options.sample ?? null,
    limit: numericOption(options.limit, null),
    outputPath: options.output ?? null,
    bundleRoot: options['bundle-root'] ?? options.bundleRoot ?? null
  };
}

export function buildItemSourceCandidateImportPlan({
  auditSummary = null,
  rawItemPageDir = '/home/lolben/data/terraPedia/raw/wiki/item-pages',
  npcParsedPath = sharedDataPath('raw', 'wiki', 'module__npcinfo__data.parsed.latest.json'),
  standardizedNpcsPath = path.join(process.cwd(), 'data', 'standardized', 'npcs.standardized.json'),
  standardizedItemsPath = path.join(process.cwd(), 'data', 'standardized', 'items.standardized.json'),
  itemSourcesDir = path.join(process.cwd(), 'data', 'standardized-view', 'item_relations', 'itemSources'),
  sample = null,
  limit = null
} = {}) {
  const summary = auditSummary ?? auditItemSourceGapCandidates({
    rawItemPageDir,
    npcParsedPath,
    standardizedNpcsPath,
    standardizedItemsPath,
    itemSourcesDir,
    sample,
    limit
  });
  const itemLookup = buildEntityLookup(loadEntityRecords(standardizedItemsPath), {
    includePlural: false
  });
  const npcLookup = buildEntityLookup(loadEntityRecords(fs.existsSync(npcParsedPath) ? npcParsedPath : standardizedNpcsPath), {
    includePlural: true
  });

  const eligibleCandidates = [];
  const blockedCandidates = [];
  let plannedSourceRows = 0;
  let blockedSourceRows = 0;

  for (const candidate of Array.isArray(summary.candidates) ? summary.candidates : []) {
    const classification = normalizeText(candidate.classification) ?? 'unknown';
    const itemResolution = resolveEntityRef(itemLookup, candidate.itemInternalName, candidate.itemName);
    const candidateBlockReason = classifyCandidateBlockReason(candidate, itemResolution);
    const sourcePlans = dedupeSourcePlans((Array.isArray(candidate.extractedSources) ? candidate.extractedSources : [])
      .map((source, sourceIndex) => buildSourcePlan({
        candidate,
        source,
        sourceIndex,
        itemLookup,
        npcLookup
      })));

    const blockedSources = sourcePlans.filter((source) => source.blockedReason);
    if (candidateBlockReason || blockedSources.length > 0 || classification !== 'high_confidence') {
      const blockedReason = candidateBlockReason ?? (classification !== 'high_confidence' ? classification : 'blocked_source_rows');
      blockedSourceRows += sourcePlans.length;
      blockedCandidates.push({
        itemInternalName: candidate.itemInternalName,
        itemName: candidate.itemName,
        pageTitle: candidate.pageTitle,
        rawPath: candidate.rawPath,
        classification,
        blockedReason,
        itemResolution,
        rawSourceCount: candidate.rawSourceCount,
        standardizedSourceCount: candidate.standardizedSourceCount,
        sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
        blockedSources: sourcePlans.map((source) => ({
          ...source,
          blockedReason: source.blockedReason ?? blockedReason
        }))
      });
      continue;
    }

    plannedSourceRows += sourcePlans.length;
    eligibleCandidates.push({
      itemInternalName: candidate.itemInternalName,
      itemName: candidate.itemName,
      itemResolution,
      pageTitle: candidate.pageTitle,
      rawPath: candidate.rawPath,
      classification,
      rawSourceCount: candidate.rawSourceCount,
      standardizedSourceCount: candidate.standardizedSourceCount,
      sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
      plannedSources: sourcePlans
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    mode: 'candidate_import_plan',
    inputs: {
      rawItemPageDir,
      npcParsedPath,
      standardizedNpcsPath,
      standardizedItemsPath,
      itemSourcesDir,
      sample,
      limit
    },
    sourceAudit: {
      generatedAt: summary.generatedAt,
      readOnly: summary.readOnly,
      parsedRawItemPages: summary.parsedRawItemPages,
      inspectedRawPages: summary.inspectedRawPages,
      rawPagesWithExtractedSources: summary.rawPagesWithExtractedSources,
      rawExtractedButStandardizedZeroCandidates: summary.rawExtractedButStandardizedZeroCandidates
    },
    summary: {
      totalCandidates: Number(summary.totalCandidates ?? 0),
      eligibleCandidates: eligibleCandidates.length,
      blockedCandidates: blockedCandidates.length,
      plannedSourceRows,
      blockedSourceRows,
      classificationCounts: summary.classificationCounts ?? {},
      blockedReasonCounts: countBy(blockedCandidates, (candidate) => candidate.blockedReason),
      plannedSourceRefTypeCounts: countBy(
        eligibleCandidates.flatMap((candidate) => candidate.plannedSources),
        (source) => source.sourceRefType ?? 'unknown'
      )
    },
    eligibleCandidates,
    blockedCandidates
  };
}

export function buildItemSourceCandidateBundle(plan) {
  const itemSources = (Array.isArray(plan?.eligibleCandidates) ? plan.eligibleCandidates : [])
    .flatMap((candidate) => Array.isArray(candidate.plannedSources) ? candidate.plannedSources : [])
    .map((source) => ({ ...source.landingRow }));

  return {
    source: 'terraria.wiki.gg:item-source-gap-repair',
    generatedAt: plan?.generatedAt ?? new Date().toISOString(),
    overwriteExisting: false,
    itemImages: [],
    recipes: [],
    itemSources,
    biomes: [],
    itemBiomes: [],
    snapshots: [],
    importPlanSummary: plan?.summary ?? null
  };
}

function classifyCandidateBlockReason(candidate, itemResolution) {
  const classification = normalizeText(candidate.classification) ?? 'unknown';
  if (classification === 'family_page_candidate') return 'family_page_candidate';
  if (classification === 'polluted_candidate') return 'polluted_candidate';
  if (classification !== 'high_confidence') return classification;
  if (itemResolution.status !== 'resolved') return 'item_unresolved';
  return null;
}

function buildSourcePlan({
  candidate,
  source,
  sourceIndex,
  itemLookup,
  npcLookup
}) {
  const sourceType = normalizeText(source.sourceType)?.toLowerCase() ?? 'unknown';
  const sourceRefType = normalizeText(source.sourceRefType)?.toLowerCase() ?? 'unknown';
  const sourceRefName = normalizeSourceRefNameForPlanning(sourceRefType, source.sourceRefName);
  const base = {
    importPlanKey: createImportPlanKey(candidate, source, sourceIndex),
    sourceType,
    sourceRefType,
    sourceRefName,
    quantityText: source.quantityText ?? null,
    chanceText: source.chanceText ?? null,
    conditions: source.conditions ?? null,
    notes: source.notes ?? null,
    sourcePage: candidate.pageTitle ?? null,
    sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
    sortOrder: sourceIndex,
    landingRow: {
      itemInternalName: candidate.itemInternalName,
      itemName: candidate.itemName,
      sourceType,
      sourceRefType,
      sourceRefName,
      quantityText: source.quantityText ?? null,
      chanceText: source.chanceText ?? null,
      conditions: source.conditions ?? null,
      notes: source.notes ?? null,
      sourceProvider: 'wiki_gg',
      sourcePage: candidate.pageTitle ?? null,
      sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
      sortOrder: sourceIndex
    }
  };

  const blockedReason = validateSourceContract({ sourceType, sourceRefType, sourceRefName });
  if (blockedReason) {
    return {
      ...base,
      resolutionStatus: 'blocked',
      resolvedRef: null,
      blockedReason
    };
  }

  if (sourceRefType === 'world') {
    return {
      ...base,
      resolutionStatus: 'world_text_ref',
      resolvedRef: null,
      blockedReason: null
    };
  }

  if (ITEM_BACKED_SOURCE_REF_TYPES.has(sourceRefType)) {
    const resolvedRef = resolveEntityRef(itemLookup, sourceRefName);
    if (resolvedRef.status !== 'resolved') {
      return {
        ...base,
        resolutionStatus: resolvedRef.status,
        resolvedRef,
        blockedReason: 'source_item_ref_unresolved'
      };
    }
    return {
      ...base,
      resolutionStatus: 'resolved_item_ref',
      resolvedRef,
      blockedReason: null
    };
  }

  if (NPC_BACKED_SOURCE_REF_TYPES.has(sourceRefType)) {
    const resolvedRef = resolveEntityRef(npcLookup, sourceRefName);
    if (resolvedRef.status !== 'resolved') {
      return {
        ...base,
        resolutionStatus: resolvedRef.status,
        resolvedRef,
        blockedReason: sourceRefType === 'boss' ? 'source_boss_ref_unresolved' : 'source_npc_ref_unresolved'
      };
    }
    return {
      ...base,
      resolutionStatus: sourceRefType === 'boss' ? 'resolved_boss_ref' : 'resolved_npc_ref',
      resolvedRef,
      blockedReason: null
    };
  }

  return {
    ...base,
    resolutionStatus: 'blocked',
    resolvedRef: null,
    blockedReason: 'unsupported_source_ref_type'
  };
}

function dedupeSourcePlans(sourcePlans) {
  const deduped = new Map();
  for (const source of sourcePlans) {
    const key = JSON.stringify([
      source.sourceType,
      source.sourceRefType,
      source.sourceRefName,
      source.quantityText ?? null,
      source.chanceText ?? null,
      source.conditions ?? null
    ]);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, source);
      continue;
    }
    deduped.set(key, mergeSourcePlan(existing, source));
  }
  return reindexSourcePlans(dropCoveredCompositeNpcRows([...deduped.values()]));
}

function reindexSourcePlans(sourcePlans) {
  return sourcePlans.map((source, index) => ({
    ...source,
    sortOrder: index,
    landingRow: {
      ...source.landingRow,
      sortOrder: index
    }
  }));
}

function dropCoveredCompositeNpcRows(sourcePlans) {
  return sourcePlans.flatMap((source) => {
    const components = compositeNpcComponents(source);
    if (!components.length) return [source];

    const coveredRows = components.map((name) => sourcePlans.find((candidate) =>
      !candidate.blockedReason
      && candidate.sourceType === source.sourceType
      && candidate.sourceRefType === source.sourceRefType
      && candidate.sourceRefName === name
    ));
    if (coveredRows.some((row) => !row)) return [source];

    for (const row of coveredRows) {
      row.notes = mergeText(row.notes, source.notes);
      row.landingRow = {
        ...row.landingRow,
        notes: row.notes
      };
    }
    return [];
  });
}

function compositeNpcComponents(source) {
  if (
    source.sourceRefType !== 'npc'
    || source.blockedReason !== 'source_npc_ref_unresolved'
    || !/\s+and\s+/i.test(source.sourceRefName ?? '')
  ) {
    return [];
  }
  return String(source.sourceRefName)
    .split(/\s+and\s+/i)
    .map((value) => normalizeText(value))
    .filter(Boolean);
}

function mergeSourcePlan(primary, fallback) {
  const notes = mergeText(primary.notes, fallback.notes);
  return {
    ...primary,
    notes,
    landingRow: {
      ...primary.landingRow,
      notes
    }
  };
}

function mergeText(primary, fallback) {
  const first = normalizeText(primary);
  const second = normalizeText(fallback);
  if (!first) return second ?? null;
  if (!second || first === second) return first;
  return `${first} ${second}`;
}

function normalizeSourceRefNameForPlanning(sourceRefType, value) {
  const text = normalizeText(value);
  if (!text || !NPC_BACKED_SOURCE_REF_TYPES.has(sourceRefType)) return text;
  const withoutNpcSuffix = text.replace(/\s+NPC\s+for$/i, '').trim();
  const duringMatch = withoutNpcSuffix.match(/^(.+?)\s+during\b.+\s+for(?:\b.*)?$/i);
  if (duringMatch) return duringMatch[1].trim();
  const withoutForTail = withoutNpcSuffix.replace(/\s+for(?:\b.*)?$/i, '').trim();
  return withoutForTail || text;
}

function validateSourceContract({ sourceType, sourceRefType, sourceRefName }) {
  if (!ALLOWED_SOURCE_TYPES.has(sourceType)) return 'invalid_source_type';
  if (!ALLOWED_SOURCE_REF_TYPES.has(sourceRefType)) return 'invalid_source_ref_type';
  if (sourceType === 'unknown' || sourceRefType === 'unknown') return 'unknown_source_contract';
  if (sourceRefType === 'npc' && CONTAINER_LIKE_NPC_POLLUTION.test(sourceRefName ?? '')) {
    return 'forbidden_npc_container_mapping';
  }
  return null;
}

function createImportPlanKey(candidate, source, sourceIndex) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      itemInternalName: candidate.itemInternalName ?? null,
      sourceType: source.sourceType ?? null,
      sourceRefType: source.sourceRefType ?? null,
      sourceRefName: source.sourceRefName ?? null,
      quantityText: source.quantityText ?? null,
      chanceText: source.chanceText ?? null,
      conditions: source.conditions ?? null,
      sourceRevisionTimestamp: candidate.sourceRevisionTimestamp ?? null,
      sourceIndex
    }))
    .digest('hex');
}

function loadEntityRecords(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(payload?.records)
    ? payload.records
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.npcs)
        ? payload.npcs
        : Array.isArray(payload)
          ? payload
          : [];
}

function buildEntityLookup(records, { includePlural = false } = {}) {
  const byKey = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    rememberEntity(byKey, record?.internalName ?? record?.internal_name, record);
    rememberEntity(byKey, record?.name, record);
    rememberEntity(byKey, record?.nameZh ?? record?.name_zh, record);
    if (includePlural && typeof record?.name === 'string' && !record.name.toLowerCase().endsWith('s')) {
      rememberEntity(byKey, `${record.name}s`, record);
    }
  }
  return byKey;
}

function rememberEntity(byKey, value, record) {
  const key = normalizeIdentity(value);
  if (!key || byKey.has(key)) {
    return;
  }
  byKey.set(key, record);
}

function resolveEntityRef(lookup, ...names) {
  for (const name of names) {
    const key = normalizeIdentity(name);
    if (!key) continue;
    const record = lookup.get(key);
    if (record) {
      return {
        status: 'resolved',
        id: record.id ?? record.sourceId ?? record.source_id ?? null,
        internalName: record.internalName ?? record.internal_name ?? null,
        name: record.name ?? null
      };
    }
  }
  return {
    status: 'unresolved',
    id: null,
    internalName: null,
    name: normalizeText(names.find((value) => normalizeText(value))) ?? null
  };
}

function countBy(values, keySelector) {
  const counts = {};
  for (const value of values) {
    const key = keySelector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function normalizeIdentity(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function isDirectRun(metaUrl) {
  return process.argv[1] && metaUrl === new URL(`file://${path.resolve(process.argv[1])}`).href;
}

if (isDirectRun(import.meta.url)) {
  try {
    const options = parseBuildItemSourceCandidateImportPlanArgs();
    const outputPath = options.outputPath;
    const bundleRoot = options.bundleRoot;
    const plan = buildItemSourceCandidateImportPlan(options);
    if (outputPath) {
      writeJson(path.resolve(process.cwd(), outputPath), plan);
    }
    if (bundleRoot) {
      writeJson(
        path.resolve(process.cwd(), bundleRoot, 'normalized', 'item-relations.bundle.json'),
        buildItemSourceCandidateBundle(plan)
      );
    }
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
