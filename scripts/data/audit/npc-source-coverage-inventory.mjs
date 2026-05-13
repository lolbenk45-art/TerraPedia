#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const mysql = require('mysql2/promise');

const DEFAULTS = Object.freeze({
  maintDatabase: 'terria_v1_maint',
  relationDatabase: 'terria_v1_relation',
  localDatabase: 'terria_v1_local',
  crawlerOutputRoot: path.join('data', 'wiki-crawler'),
  writeReport: true,
  dateTag: new Date().toISOString().slice(0, 10)
});

const SOURCE_COVERAGE_STATUSES = Object.freeze([
  'source_page_present_with_loot',
  'source_page_present_no_loot',
  'source_page_present_no_direct_item_loot',
  'source_page_present_unextracted',
  'source_page_present_parse_failed',
  'source_page_missing',
  'group_page_present_variant_not_extracted',
  'item_page_reverse_source_only',
  'no_source_required_expected_zero',
  'no_source_required_domain_separated'
]);

const ALLOWED_DOMAIN_SEPARATED_REASONS = new Set([
  'boss_reward_domain_separated',
  'boss_segment_reward_domain_separated',
  'boss_component_health_pickup_domain_separated',
  'boss_clone_or_helper_domain_separated',
  'item_projectile_entity_domain_separated',
]);

const REPRESENTATIVE_SAFE_NPC_SUFFIXES = Object.freeze(['Head', 'Body', 'Tail', 'Legs']);

const REPRESENTATIVE_UNSAFE_NPC_SUFFIX_TOKENS = Object.freeze([
  'Corruption',
  'Crimson',
  'Hallow',
  'Hallowed',
  'Jungle',
  'Desert',
  'Light',
  'Dark',
  'T1',
  'T2',
  'T3',
  'Axe',
  'Flail',
  'Sword',
  'Spear',
  'Gun',
  'Snow',
  'Frozen'
]);

const REVIEWED_POSITIVE_ID_FALLBACK_NPC_INTERNAL_NAMES = new Set([
  'DesertLamiaLight',
  'DesertScorpionWalk',
  'DiabolistRed',
  'DD2DarkMageT1',
  'DD2OgreT2',
  'PigronCorruption',
  'RustyArmoredBonesAxe',
  'ZombieEskimo',
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }

  return {
    maintDatabase: raw['maint-database'] ?? raw.maintDatabase ?? DEFAULTS.maintDatabase,
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? DEFAULTS.localDatabase,
    crawlerOutputRoot: raw['crawler-output-root'] ?? raw.crawlerOutputRoot ?? DEFAULTS.crawlerOutputRoot,
    writeReport: booleanOption(raw['write-report'] ?? raw.writeReport, DEFAULTS.writeReport),
    output: raw.output ?? null,
    dateTag: raw['date-tag'] ?? raw.dateTag ?? DEFAULTS.dateTag
  };
}

export async function runNpcSourceCoverageInventory(options = {}, dependencies = {}) {
  const normalized = {
    maintDatabase: options.maintDatabase ?? DEFAULTS.maintDatabase,
    relationDatabase: options.relationDatabase ?? DEFAULTS.relationDatabase,
    localDatabase: options.localDatabase ?? DEFAULTS.localDatabase,
    crawlerOutputRoot: options.crawlerOutputRoot ?? DEFAULTS.crawlerOutputRoot,
    writeReport: options.writeReport ?? DEFAULTS.writeReport,
    output: options.output ?? null,
    dateTag: options.dateTag ?? DEFAULTS.dateTag
  };

  let connection = dependencies.connection ?? null;
  let shouldClose = false;
  try {
    const readJson = dependencies.readJson ?? readJsonFile;
    const readOptionalJson = dependencies.readOptionalJson ?? ((filePath) => readOptionalJsonFile(filePath, readJson));
    const crawlerOutputRoot = path.resolve(repoRoot, normalized.crawlerOutputRoot);
    const [coverageAudit, coverageTargets, standardizedPayload, bridgeStandardizedPayload, standardizedMap] = await Promise.all([
      readJson(path.join(crawlerOutputRoot, 'report', 'npc', 'coverage-audit.latest.json')),
      readJson(path.join(crawlerOutputRoot, 'report', 'npc', 'coverage-targets.latest.json')),
      readJson(path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json')),
      readOptionalJson(path.join(repoRoot, 'data', 'generated', 'wiki-crawler-npc-bridge', 'standardized', 'npcs.standardized.json')),
      readJson(path.join(repoRoot, 'data', 'generated', 'npc-standardized-map.json'))
    ]);

    if (!connection) {
      const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
      const mysqlFactory = dependencies.mysqlFactory ?? mysql;
      connection = await mysqlFactory.createConnection({
        host: config.database?.host ?? '127.0.0.1',
        port: Number(config.database?.port ?? 3306),
        user: config.database?.username ?? 'root',
        password: config.database?.password ?? 'root'
      });
      shouldClose = true;
    }

    const stageCounts = await (dependencies.loadStageCounts ?? loadStageCounts)(connection, normalized);
    const readText = dependencies.readText ?? readTextFile;
    const expectedZeroInternalNames = dependencies.expectedZeroInternalNames
      ?? await loadExpectedZeroInternalNames(readText);
    const domainSeparatedInternalNames = dependencies.domainSeparatedInternalNames
      ?? await loadDomainSeparatedInternalNames(readText);
    const noDirectItemLootInternalNames = dependencies.noDirectItemLootInternalNames
      ?? await loadNoDirectItemLootInternalNames(readText);
    const report = buildNpcSourceCoverageInventoryReport({
      coverageAudit,
      coverageTargets,
      standardizedPayload: mergeBridgeStandardizedPayload(standardizedPayload, bridgeStandardizedPayload),
      standardizedMap,
      stageCounts,
      expectedZeroInternalNames,
      domainSeparatedInternalNames,
      noDirectItemLootInternalNames
    });
    const reportPath = normalized.writeReport ? await writeReport(report, normalized) : null;
    return { report, reportPath };
  } catch (error) {
    const report = buildBlockedReport(normalized, error);
    const reportPath = normalized.writeReport ? await writeReport(report, normalized) : null;
    return { report, reportPath };
  } finally {
    if (shouldClose && connection) {
      await connection.end();
    }
  }
}

export function buildNpcSourceCoverageInventoryReport({
  standardizedPayload = {},
  coverageAudit = {},
  coverageTargets = {},
  standardizedMap = {},
  stageCounts = new Map(),
  expectedZeroInternalNames = new Set(),
  domainSeparatedInternalNames = new Set(),
  noDirectItemLootInternalNames = new Set()
} = {}) {
  const records = normalizeStandardizedRecords(standardizedPayload);
  const coverageByInternalName = buildCoverageIndex(coverageAudit);
  const targetByInternalName = buildCoverageIndex(coverageTargets);
  const groupCoverageByInternalName = buildGroupCoverageIndex([coverageAudit, coverageTargets]);
  const mapByInternalName = buildStandardizedMapIndex(standardizedMap);
  const expectedZeroSet = normalizeSet(expectedZeroInternalNames);
  const domainSeparatedSet = normalizeSet(domainSeparatedInternalNames);
  const noDirectItemLootSet = normalizeSet(noDirectItemLootInternalNames);

  const npcs = records.map((record) => {
    const npcInternalName = normalizeText(record.internalName ?? record.internal_name);
    const counts = normalizeCounts(stageCounts instanceof Map ? stageCounts.get(npcInternalName) : stageCounts?.[npcInternalName]);
    const coverage = coverageByInternalName.get(npcInternalName) ?? targetByInternalName.get(npcInternalName) ?? null;
    const mapRecord = mapByInternalName.get(npcInternalName) ?? {};
    const standardizedLootCount = countStandardizedLoot(record);
    const sourceCoverageStatus = classifySourceCoverage({
      npcInternalName,
      record,
      coverage,
      groupCoverage: groupCoverageByInternalName.get(npcInternalName),
      counts,
      standardizedLootCount,
      expectedZeroSet,
      domainSeparatedSet,
      noDirectItemLootSet
    });

    return {
      npcInternalName,
      npcName: normalizeText(record.name ?? record.englishName ?? record.english_name),
      npcType: resolveNpcType(record),
      sourcePage: normalizeText(coverage?.resolvedPageTitle ?? coverage?.pageTitle ?? mapRecord.sourcePage ?? record.sourcePage),
      sourceUrl: buildSourceUrl(coverage),
      crawlerCoverageStatus: resolveCrawlerCoverageStatus(coverage),
      standardizedLootCount,
      maintSourceCount: traceableLootMaintSourceCount(npcInternalName, counts, groupCoverageByInternalName.get(npcInternalName)),
      maintSourceRows: counts.maintSourceRows,
      relationLootCount: counts.relationLootCount,
      projectionLootCount: counts.projectionLootCount,
      localLootCount: counts.localLootCount,
      sourceCoverageStatus,
      nextAction: resolveNextAction(sourceCoverageStatus)
    };
  });

  return {
    auditName: 'npc-source-coverage-inventory',
    generatedAt: new Date().toISOString(),
    auditStatus: 'pass',
    evidenceHealth: 'sufficient',
    summary: {
      totalNpcs: npcs.length,
      bySourceCoverageStatus: summarizeByStatus(npcs)
    },
    npcs
  };
}

export function mergeBridgeStandardizedPayload(standardizedPayload = {}, bridgeStandardizedPayload = {}) {
  const baseRecords = normalizeStandardizedRecords(standardizedPayload);
  const bridgeByInternalName = new Map(
    normalizeStandardizedRecords(bridgeStandardizedPayload)
      .map((record) => [normalizeText(record.internalName ?? record.internal_name), record])
      .filter(([internalName]) => internalName)
  );

  if (!baseRecords.length || bridgeByInternalName.size === 0) {
    return standardizedPayload;
  }

  return {
    ...standardizedPayload,
    records: baseRecords.map((record) => {
      const internalName = normalizeText(record.internalName ?? record.internal_name);
      const bridgeRecord = bridgeByInternalName.get(internalName);
      if (!bridgeRecord?.wikiCrawler) {
        return record;
      }
      return {
        ...record,
        wikiCrawler: bridgeRecord.wikiCrawler
      };
    })
  };
}

export async function loadStageCounts(connection, options) {
  const [rows] = await connection.query(`
    SELECT
      n.internal_name AS npcInternalName,
      (
        SELECT COUNT(*)
        FROM \`${options.maintDatabase}\`.\`maint_item_sources\` m
        WHERE m.source_ref_type = 'npc'
          AND (
            m.source_ref_name COLLATE utf8mb4_unicode_ci = n.name COLLATE utf8mb4_unicode_ci
            OR m.source_ref_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci
          )
          AND m.deleted = 0
      ) AS maintSourceCount,
      (
        SELECT COUNT(*)
        FROM \`${options.relationDatabase}\`.\`item_npc_loot_relations\` r
        WHERE r.npc_internal_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci
          AND r.deleted = 0
          AND r.status = 1
      ) AS relationLootCount,
      (
        SELECT COALESCE(JSON_LENGTH(p.loot_items_json), 0)
        FROM \`${options.relationDatabase}\`.\`projection_npcs\` p
        WHERE p.internal_name COLLATE utf8mb4_unicode_ci = n.internal_name COLLATE utf8mb4_unicode_ci
          AND p.deleted = 0
          AND p.status = 1
        LIMIT 1
      ) AS projectionLootCount,
      (
        SELECT COUNT(*)
        FROM \`${options.localDatabase}\`.\`npc_loot_entries\` l
        WHERE l.npc_id = n.id
          AND l.deleted = 0
          AND (l.drop_source_kind IS NULL OR l.drop_source_kind = 'npc_drop')
      ) AS localLootCount,
      0 AS itemPageReverseSourceCount
    FROM \`${options.localDatabase}\`.\`npcs\` n
    WHERE n.deleted = 0
      AND n.status = 1
  `);

  const countsByNpc = new Map(rows.map((row) => [row.npcInternalName, normalizeCounts(row)]));
  const maintRowsByNpc = await loadMaintSourceRowsByNpc(connection, options);
  for (const [npcInternalName, maintSourceRows] of maintRowsByNpc.entries()) {
    const counts = countsByNpc.get(npcInternalName);
    if (!counts) continue;
    counts.maintSourceRows = maintSourceRows;
  }
  return countsByNpc;
}

async function loadMaintSourceRowsByNpc(connection, options) {
  const [npcRows] = await connection.query(`
    SELECT internal_name AS npcInternalName, name AS npcName
    FROM \`${options.localDatabase}\`.\`npcs\`
    WHERE deleted = 0
      AND status = 1
  `);
  const npcInternalNamesByKey = new Map();
  for (const row of npcRows) {
    const npcInternalName = normalizeText(row.npcInternalName);
    if (!npcInternalName) continue;
    npcInternalNamesByKey.set(normalizeKey(npcInternalName), npcInternalName);
    const npcName = normalizeText(row.npcName);
    if (npcName && !npcInternalNamesByKey.has(normalizeKey(npcName))) {
      npcInternalNamesByKey.set(normalizeKey(npcName), npcInternalName);
    }
  }

  const [rows] = await connection.query(`
    SELECT
      m.record_key AS recordKey,
      m.item_internal_name AS itemInternalName,
      m.item_name AS itemName,
      m.source_type AS sourceType,
      m.source_ref_type AS sourceRefType,
      m.source_ref_name AS sourceRefName,
      m.raw_json AS rawJson
    FROM \`${options.maintDatabase}\`.\`maint_item_sources\` m
    WHERE m.source_ref_type = 'npc'
      AND m.deleted = 0
    ORDER BY m.source_ref_name, m.item_internal_name, m.record_key
  `);

  const grouped = new Map();
  for (const row of rows) {
    const normalizedRow = normalizeMaintSourceRow(row);
    const npcInternalName = resolveMaintSourceNpcInternalName(normalizedRow, npcInternalNamesByKey);
    if (!npcInternalName) continue;
    if (!grouped.has(npcInternalName)) grouped.set(npcInternalName, []);
    grouped.get(npcInternalName).push(normalizedRow);
  }
  return grouped;
}

function resolveMaintSourceNpcInternalName(row, npcInternalNamesByKey) {
  const candidates = [
    row?.sourceRefInternalName,
    row?.sourceRefName,
  ];
  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    if (key && npcInternalNamesByKey.has(key)) return npcInternalNamesByKey.get(key);
  }
  return null;
}

function classifySourceCoverage({
  npcInternalName,
  record,
  coverage,
  groupCoverage,
  counts,
  standardizedLootCount,
  expectedZeroSet,
  domainSeparatedSet,
  noDirectItemLootSet
}) {
  if (counts.itemPageReverseSourceCount > 0 && counts.relationLootCount === 0 && counts.localLootCount === 0) {
    return 'item_page_reverse_source_only';
  }
  if (isCoverageParseFailed(coverage)) {
    return 'source_page_present_parse_failed';
  }
  if (
    coverage
    && !isCoverageMissing(coverage)
    && !coverage.alreadyCrawled
    && !hasCurrentWikiCrawlerExtractionEvidence(record, standardizedLootCount)
  ) {
    if (groupCoverage && standardizedLootCount === 0 && !hasDownstreamNpcLootEvidence(npcInternalName, counts, groupCoverage)) {
      return 'group_page_present_variant_not_extracted';
    }
    if (groupCoverage && standardizedLootCount === 0 && hasDownstreamNpcLootEvidence(npcInternalName, counts, groupCoverage)) {
      return 'source_page_present_with_loot';
    }
    return 'source_page_present_unextracted';
  }
  if (domainSeparatedSet.has(normalizeKey(npcInternalName))) {
    return 'no_source_required_domain_separated';
  }
  if (expectedZeroSet.has(normalizeKey(npcInternalName))) {
    return 'no_source_required_expected_zero';
  }
  if (noDirectItemLootSet.has(normalizeKey(npcInternalName)) && hasExactNoDirectItemLootWikiCrawlerEvidence(record)) {
    return 'source_page_present_no_direct_item_loot';
  }
  if (hasCurrentCrawlerLootEvidence(standardizedLootCount)) {
    return 'source_page_present_with_loot';
  }
  if (hasExactNoLootWikiCrawlerEvidence(record)) {
    return 'source_page_present_no_loot';
  }
  if (hasUnmatchedNoLootWikiCrawlerInfoboxEvidence(record) && groupCoverage) {
    if (hasDownstreamNpcLootEvidence(npcInternalName, counts, groupCoverage)) {
      return 'source_page_present_with_loot';
    }
    return 'group_page_present_variant_not_extracted';
  }
  if (isCoverageMissing(coverage)) {
    if (groupCoverage && hasDownstreamNpcLootEvidence(npcInternalName, counts, groupCoverage)) {
      return 'source_page_present_with_loot';
    }
    if (groupCoverage) {
      return 'group_page_present_variant_not_extracted';
    }
    return 'source_page_missing';
  }
  if (!coverage && !groupCoverage) {
    return 'source_page_missing';
  }
  if (!coverage && groupCoverage && hasDownstreamNpcLootEvidence(npcInternalName, counts, groupCoverage)) {
    return 'source_page_present_with_loot';
  }
  if (groupCoverage && !coverage && standardizedLootCount === 0) {
    return 'group_page_present_variant_not_extracted';
  }
  if (groupCoverage && coverage && !coverage.alreadyCrawled && standardizedLootCount === 0 && !hasDownstreamNpcLootEvidence(npcInternalName, counts, groupCoverage)) {
    return 'group_page_present_variant_not_extracted';
  }
  if (hasDownstreamNpcLootEvidence(npcInternalName, counts, groupCoverage)) {
    return 'source_page_present_with_loot';
  }
  if (groupCoverage && standardizedLootCount === 0 && traceableLootMaintSourceCount(npcInternalName, counts, groupCoverage) === 0) {
    return 'group_page_present_variant_not_extracted';
  }
  if (coverage && !isHostileNpc(record)) {
    return 'source_page_present_no_loot';
  }
  if (coverage) {
    return 'source_page_present_no_loot';
  }
  return 'source_page_missing';
}

function hasExactNoLootWikiCrawlerEvidence(record) {
  const wikiCrawler = record?.wikiCrawler;
  if (!wikiCrawler) return false;
  if (!Array.isArray(wikiCrawler.loot) || wikiCrawler.loot.length > 0) return false;
  if (!hasKnownSourceLootRowsTotal(wikiCrawler)) return false;
  if (toNumber(wikiCrawler.sourceLootRowsTotal) > 0) return false;
  return hasMatchingSourceInfobox(record, wikiCrawler.sourceInfoboxes);
}

function hasExactNoDirectItemLootWikiCrawlerEvidence(record) {
  const wikiCrawler = record?.wikiCrawler;
  if (!wikiCrawler) return false;
  if (!Array.isArray(wikiCrawler.loot) || wikiCrawler.loot.length > 0) return false;
  if (!hasKnownSourceLootRowsTotal(wikiCrawler)) return false;
  if (toNumber(wikiCrawler.sourceLootRowsTotal) <= 0) return false;
  return hasMatchingSourceInfobox(record, wikiCrawler.sourceInfoboxes);
}

function hasUnmatchedNoLootWikiCrawlerInfoboxEvidence(record) {
  const wikiCrawler = record?.wikiCrawler;
  if (!wikiCrawler) return false;
  if (!Array.isArray(wikiCrawler.loot) || wikiCrawler.loot.length > 0) return false;
  if (!hasKnownSourceLootRowsTotal(wikiCrawler)) {
    return Array.isArray(wikiCrawler.sourceInfoboxes) && wikiCrawler.sourceInfoboxes.length > 0;
  }
  if (toNumber(wikiCrawler.sourceLootRowsTotal) > 0) return true;
  return Array.isArray(wikiCrawler.sourceInfoboxes) && wikiCrawler.sourceInfoboxes.length > 0;
}

function hasKnownSourceLootRowsTotal(wikiCrawler) {
  return Object.hasOwn(wikiCrawler, 'sourceLootRowsTotal') && Number.isFinite(Number(wikiCrawler.sourceLootRowsTotal));
}

function hasMatchingSourceInfobox(record, sourceInfoboxes) {
  const rows = Array.isArray(sourceInfoboxes) ? sourceInfoboxes : [];
  const recordId = normalizeText(record?.id ?? record?.gameId);
  const recordImageTitle = normalizeFileTitle(record?.imageFileTitle);
  return rows.some((sourceInfobox) => {
    const autoId = normalizeText(sourceInfobox?.autoId);
    if (recordId && autoId && recordId === autoId) return true;
    if (autoId) return false;
    const sourceImageTitle = normalizeFileTitle(sourceInfobox?.image);
    return Boolean(recordImageTitle && sourceImageTitle && recordImageTitle === sourceImageTitle);
  });
}

function hasCurrentCrawlerLootEvidence(standardizedLootCount) {
  if (standardizedLootCount > 0) return true;
  return false;
}

function hasCurrentWikiCrawlerExtractionEvidence(record, standardizedLootCount) {
  return hasCurrentCrawlerLootEvidence(standardizedLootCount)
    || hasExactNoLootWikiCrawlerEvidence(record)
    || hasExactNoDirectItemLootWikiCrawlerEvidence(record)
    || hasUnmatchedNoLootWikiCrawlerInfoboxEvidence(record);
}

function hasDownstreamNpcLootEvidence(npcInternalName, counts, groupCoverage = null) {
  return traceableLootMaintSourceCount(npcInternalName, counts, groupCoverage) > 0;
}

function normalizeFileTitle(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const fileMatch = /\[\[\s*File:([^|\]]+)/i.exec(text);
  return (fileMatch?.[1] ?? text)
    .replace(/^File:/i, '')
    .trim()
    .toLowerCase();
}

function traceableMaintSourceCount(npcInternalName, counts) {
  const normalizedNpcInternalName = normalizeKey(npcInternalName);
  return counts.maintSourceRows
    .filter((row) => normalizeKey(row.sourceRefInternalName) === normalizedNpcInternalName)
    .length;
}

function traceableLootMaintSourceCount(npcInternalName, counts, groupCoverage = null) {
  const normalizedNpcInternalName = normalizeKey(npcInternalName);
  return counts.maintSourceRows
    .filter((row) => normalizeKey(row.sourceRefInternalName) === normalizedNpcInternalName)
    .filter((row) => normalizeKey(row.sourceRefType) === 'npc')
    .filter((row) => ['drop', 'loot'].includes(normalizeKey(row.sourceType)))
    .filter((row) => isReviewedNpcSourceResolution(row, npcInternalName, groupCoverage))
    .length;
}

function isReviewedNpcSourceResolution(row, npcInternalName, groupCoverage = null) {
  const resolution = normalizeText(row?.sourceRefResolution);
  if ([
    'exact_internal_name',
    'reviewed_page_level_shared_loot',
  ].includes(resolution)) {
    return true;
  }
  if (resolution !== 'positive_id_fallback') {
    return false;
  }
  const candidateNpcInternalNames = normalizeList(row?.candidateNpcInternalNames).length > 0
    ? row.candidateNpcInternalNames
    : groupCoverageCandidateInternalNames(groupCoverage);
  return isRepresentativeSafeNpcFamily(candidateNpcInternalNames, npcInternalName)
    || REVIEWED_POSITIVE_ID_FALLBACK_NPC_INTERNAL_NAMES.has(normalizeText(npcInternalName));
}

function groupCoverageCandidateInternalNames(groupCoverage) {
  return Array.isArray(groupCoverage?.standardizedRecords)
    ? groupCoverage.standardizedRecords
    : [];
}

function isRepresentativeSafeNpcFamily(candidates, rawInternalName) {
  const internalNames = dedupeCandidateInternalNames(candidates);
  if (!rawInternalName || !internalNames.includes(rawInternalName)) return false;
  if (internalNames.filter((name) => name === rawInternalName).length !== 1) return false;
  if (internalNames.length < 2) return false;

  const prefix = commonPrefix(internalNames);
  if (!prefix) return false;
  const suffixes = internalNames.map((name) => name.slice(prefix.length));
  if (suffixes.some((suffix) => !suffix)) return false;
  if (suffixes.some((suffix) => REPRESENTATIVE_UNSAFE_NPC_SUFFIX_TOKENS.some((token) => suffix.includes(token)))) {
    return false;
  }
  return suffixes.every((suffix) =>
    REPRESENTATIVE_SAFE_NPC_SUFFIXES.some((token) => suffix === token || new RegExp(`^${token}\\d+$`).test(suffix))
  );
}

function dedupeCandidateInternalNames(candidates) {
  const seen = new Set();
  const names = [];
  for (const candidate of normalizeList(candidates)) {
    const name = normalizeText(
      typeof candidate === 'object' && candidate
        ? candidate.internalName ?? candidate.internal_name
        : candidate
    );
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function commonPrefix(values) {
  if (!values.length) return '';
  let prefix = values[0] ?? '';
  for (const value of values.slice(1)) {
    while (prefix && !String(value ?? '').startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function buildCoverageIndex(payload) {
  const index = new Map();
  for (const target of normalizeCoverageTargets(payload)) {
    for (const record of Array.isArray(target.standardizedRecords) ? target.standardizedRecords : []) {
      const internalName = normalizeText(record.internalName ?? record.internal_name);
      if (internalName && !index.has(internalName)) {
        index.set(internalName, target);
      }
    }
  }
  return index;
}

function buildGroupCoverageIndex(payloads) {
  const index = new Map();
  for (const payload of payloads) {
    for (const target of normalizeCoverageTargets(payload)) {
      const records = Array.isArray(target.standardizedRecords) ? target.standardizedRecords : [];
      if (records.length <= 1) continue;
      const groupPresent = target.alreadyCrawled || (!target.missing && target.resolutionStatus !== 'missing');
      if (!groupPresent) continue;
      for (const record of records) {
        const internalName = normalizeText(record.internalName ?? record.internal_name);
        if (internalName && !index.has(internalName)) {
          index.set(internalName, target);
        }
      }
    }
  }
  return index;
}

function buildStandardizedMapIndex(payload) {
  const rows = Array.isArray(payload?.records)
    ? payload.records
    : payload?.records && typeof payload.records === 'object'
      ? Object.values(payload.records)
      : [];
  return new Map(rows
    .map((row) => [normalizeText(row.internalName ?? row.internal_name), row])
    .filter(([internalName]) => internalName));
}

function normalizeCoverageTargets(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.targets)) return payload.targets;
  if (Array.isArray(payload?.eligibleBatchTargets)) return payload.eligibleBatchTargets;
  return [];
}

function normalizeStandardizedRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.records)) return payload.records;
  return [];
}

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [value];
  } catch {
    return [value];
  }
}

function omitEmptyArrays(row) {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => !(Array.isArray(value) && value.length === 0))
  );
}

function normalizeCounts(value = {}) {
  return {
    maintSourceCount: toNumber(value.maintSourceCount ?? value.maint_source_count),
    maintSourceRows: normalizeMaintSourceRows(value.maintSourceRows ?? value.maint_source_rows),
    relationLootCount: toNumber(value.relationLootCount ?? value.relation_loot_count),
    projectionLootCount: toNumber(value.projectionLootCount ?? value.projection_loot_count),
    localLootCount: toNumber(value.localLootCount ?? value.local_loot_count),
    itemPageReverseSourceCount: toNumber(value.itemPageReverseSourceCount ?? value.item_page_reverse_source_count)
  };
}

function normalizeMaintSourceRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeMaintSourceRow).filter(Boolean) : [];
}

function normalizeMaintSourceRow(row = {}) {
  const raw = parseJsonObject(row.rawJson ?? row.raw_json);
  const recordKey = normalizeText(row.recordKey ?? row.record_key);
  if (!recordKey && !normalizeText(row.itemInternalName ?? row.item_internal_name)) return null;
  const candidateNpcInternalNames = normalizeList(row.candidateNpcInternalNames ?? row.candidate_npc_internal_names ?? raw.candidateNpcInternalNames ?? raw.candidate_npc_internal_names);
  return omitEmptyArrays({
    recordKey,
    itemInternalName: normalizeText(row.itemInternalName ?? row.item_internal_name),
    itemName: normalizeText(row.itemName ?? row.item_name),
    sourceType: normalizeText(row.sourceType ?? row.source_type),
    sourceRefType: normalizeText(row.sourceRefType ?? row.source_ref_type),
    sourceRefName: normalizeText(row.sourceRefName ?? row.source_ref_name),
    sourceRefInternalName: normalizeText(row.sourceRefInternalName ?? row.source_ref_internal_name ?? raw.sourceRefInternalName ?? raw.source_ref_internal_name),
    sourceRefResolution: normalizeText(row.sourceRefResolution ?? row.source_ref_resolution ?? raw.sourceRefResolution ?? raw.source_ref_resolution),
    candidateNpcInternalNames,
    chanceText: normalizeText(row.chanceText ?? row.chance_text ?? raw.chanceText ?? raw.chance_text),
    quantityText: normalizeText(row.quantityText ?? row.quantity_text ?? raw.quantityText ?? raw.quantity_text),
    conditions: normalizeText(row.conditions ?? row.conditionText ?? row.condition_text ?? raw.conditions ?? raw.conditionText ?? raw.condition_text ?? raw.notes),
  });
}

function countStandardizedLoot(record) {
  const candidates = [
    record?.wikiCrawler?.loot,
    record?.loot,
    record?.lootEntries,
    record?.lootEntries?.items,
    record?.lootItems
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.length;
  }
  return 0;
}

function resolveNpcType(record) {
  if (record?.flags?.boss || record?.boss) return 'boss';
  if (record?.flags?.townNPC || record?.flags?.townNpc || record?.flags?.friendly || record?.townNPC || record?.friendly) {
    return 'friendly';
  }
  return 'enemy';
}

function resolveCrawlerCoverageStatus(coverage) {
  if (!coverage) return 'missing_from_coverage_report';
  if (isCoverageParseFailed(coverage)) return 'parse_failed';
  if (isCoverageMissing(coverage)) return 'missing';
  if (coverage.alreadyCrawled) return 'already_crawled';
  if (coverage.eligibleBatch) return 'eligible_batch';
  return normalizeText(coverage.resolutionStatus) || 'present';
}

function resolveNextAction(status) {
  switch (status) {
    case 'source_page_present_with_loot':
      return 'verify_relation_projection_local_counts';
    case 'source_page_present_no_loot':
      return 'review_expected_zero_contract';
    case 'source_page_present_no_direct_item_loot':
      return 'verify_no_direct_item_loot_contract';
    case 'source_page_present_unextracted':
      return 'crawl_or_extract_source_page';
    case 'source_page_present_parse_failed':
      return 'fix_parser_for_source_page';
    case 'source_page_missing':
      return 'find_or_contract_source_gap';
    case 'group_page_present_variant_not_extracted':
      return 'crawl_or_extract_variant_specific_source';
    case 'item_page_reverse_source_only':
      return 'promote_or_block_reverse_source_mapping';
    case 'no_source_required_expected_zero':
      return 'verify_expected_zero_contract';
    case 'no_source_required_domain_separated':
      return 'verify_domain_separation_contract';
    default:
      return 'review_unknown_source_coverage';
  }
}

function buildSourceUrl(coverage) {
  const title = normalizeText(coverage?.resolvedPageTitle ?? coverage?.pageTitle);
  if (!title) return null;
  return `https://terraria.wiki.gg/wiki/${encodeURIComponent(title).replaceAll('%20', '_')}`;
}

function isCoverageMissing(coverage) {
  if (!coverage) return true;
  return Boolean(coverage.missing) || normalizeText(coverage.resolutionStatus) === 'missing';
}

function isCoverageParseFailed(coverage) {
  const values = [
    coverage?.crawlerCoverageStatus,
    coverage?.coverageStatus,
    coverage?.parseStatus,
    coverage?.resolutionStatus,
    coverage?.auditStatus
  ].map((value) => normalizeText(value));
  return values.some((value) => /parse.*fail|failed.*parse|parser_error|artifact_unreadable/.test(value));
}

function isHostileNpc(record) {
  return !(record?.flags?.friendly || record?.flags?.townNPC || record?.flags?.townNpc || record?.friendly || record?.townNPC);
}

function summarizeByStatus(rows) {
  const summary = {};
  for (const status of SOURCE_COVERAGE_STATUSES) {
    const count = rows.filter((row) => row.sourceCoverageStatus === status).length;
    if (count > 0) summary[status] = count;
  }
  return summary;
}

function buildBlockedReport(options, error) {
  return {
    auditName: 'npc-source-coverage-inventory',
    generatedAt: new Date().toISOString(),
    auditStatus: 'blocked',
    evidenceHealth: 'db_unavailable',
    options: sanitizeOptions(options),
    summary: {
      totalNpcs: 0,
      bySourceCoverageStatus: {}
    },
    npcs: [],
    error: {
      code: error?.code ?? null,
      message: error?.message ?? String(error)
    }
  };
}

async function writeReport(report, options) {
  const reportPath = options.output
    ? path.resolve(repoRoot, options.output)
    : path.join(repoRoot, 'reports', 'audit', `npc-source-coverage-inventory-${options.dateTag}.json`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function readOptionalJsonFile(filePath, readJson) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function loadExpectedZeroInternalNames(readText) {
  const contractPath = path.join(repoRoot, 'docs', 'contracts', 'npc-domain-expected-zero-contract.md');
  try {
    const text = await readText(contractPath);
    return new Set(parseMarkdownTableRows(text)
      .map((row) => row.npcInternalName)
      .filter(Boolean));
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set();
    throw error;
  }
}

async function loadDomainSeparatedInternalNames(readText) {
  const contractPath = path.join(repoRoot, 'docs', 'contracts', 'npc-domain-separated-not-npc-drop-contract.md');
  try {
    const text = await readText(contractPath);
    return new Set(parseMarkdownTableRows(text)
      .filter((row) => ALLOWED_DOMAIN_SEPARATED_REASONS.has(normalizeText(row.reason)))
      .map((row) => row.npcInternalName)
      .filter(Boolean));
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set();
    throw error;
  }
}

async function loadNoDirectItemLootInternalNames(readText) {
  const contractPath = path.join(repoRoot, 'docs', 'contracts', 'npc-domain-no-direct-item-loot-contract.md');
  try {
    const text = await readText(contractPath);
    return new Set(parseMarkdownTableRows(text)
      .map((row) => row.npcInternalName)
      .filter(Boolean));
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
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? null])));
  }
  return rows.filter((row) => normalizeText(row.npcInternalName) && row.npcInternalName !== '_none yet_');
}

function sanitizeOptions(options) {
  return {
    maintDatabase: options.maintDatabase,
    relationDatabase: options.relationDatabase,
    localDatabase: options.localDatabase,
    crawlerOutputRoot: options.crawlerOutputRoot,
    writeReport: Boolean(options.writeReport),
    output: options.output,
    dateTag: options.dateTag
  };
}

function normalizeSet(value) {
  if (!(value instanceof Set)) return new Set();
  return new Set([...value].map((entry) => normalizeKey(entry)).filter(Boolean));
}

function normalizeKey(value) {
  return normalizeText(value)?.toLowerCase() ?? null;
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const result = await runNpcSourceCoverageInventory(parseArgs());
  console.log(JSON.stringify(result.report, null, 2));
}
