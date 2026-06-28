#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const moduleRequire = createRequire(import.meta.url);

const DEFAULT_LOCAL_DATABASE = 'terria_v1_local';
const DEFAULT_MANAGED_URL_PREFIXES = ['http://localhost:9000/terrapedia-images'];
const DEFAULT_SAMPLE_LIMIT = 50;
const MUTATION_FLAGS = new Set([
  'apply',
  'write-db',
  'sync',
  'import',
  'materialize',
  'backfill',
  'refresh',
  'pipeline',
  'crawler',
  'fetch',
  'flyway',
  'delete',
  'truncate',
  'drop',
  'alter',
  'write'
]);

const CONTAINER_TERM_PATTERN = /\b(chests?|crates?|treasure\s+bags?|lock\s*boxes?|presents?|goodie\s+bags?)\b/i;
const GENERIC_CONTAINER_NAMES = new Set(['chest', 'crate', 'treasure bag', 'lock box', 'present', 'goodie bag']);
const BROAD_WORLDGEN_CONTEXT_PAGES = new Set(['Paintings', 'Statues', 'Altars']);

export function parseAuditWorldgenContainerSourcePollutionArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only worldgen container source pollution audit refuses mutation flag: --${key}`);
    }
  }

  return {
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? null,
    port: options.port ?? process.env.TERRAPEDIA_DB_PORT ?? null,
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? null,
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? null,
    database: options.database ?? options['local-database'] ?? process.env.TERRAPEDIA_DB_NAME ?? DEFAULT_LOCAL_DATABASE,
    managedUrlPrefixes: parseList(options['managed-url-prefixes'] ?? options.managedUrlPrefixes, DEFAULT_MANAGED_URL_PREFIXES),
    sampleLimit: positiveInteger(options['sample-limit'] ?? options.sampleLimit, DEFAULT_SAMPLE_LIMIT),
    outputPath: options.output ?? null,
    markdownOutputPath: options['markdown-output'] ?? options.markdownOutput ?? null,
    failOnPollution: booleanOption(options['fail-on-pollution'] ?? options.failOnPollution, false),
    generatedAt: options['generated-at'] ?? options.generatedAt ?? null
  };
}

export function buildWorldgenContainerSourcePollutionQueries({ database = DEFAULT_LOCAL_DATABASE } = {}) {
  return {
    sourceRows: `
SELECT
  s.\`id\` AS sourceId,
  s.\`item_id\` AS itemId,
  i.\`name\` AS itemName,
  i.\`name_zh\` AS itemNameZh,
  i.\`internal_name\` AS itemInternalName,
  s.\`source_type\` AS sourceType,
  s.\`source_ref_type\` AS sourceRefType,
  s.\`source_ref_id\` AS sourceRefId,
  s.\`source_ref_name\` AS sourceRefName,
  s.\`quantity_text\` AS quantityText,
  s.\`chance_text\` AS chanceText,
  s.\`conditions\`,
  s.\`notes\`,
  s.\`source_page\` AS sourcePage,
  s.\`sort_order\` AS sortOrder
FROM ${qualified(database, 'item_acquisition_sources')} s
JOIN ${qualified(database, 'items')} i ON i.\`id\` = s.\`item_id\`
WHERE s.\`deleted\` = 0
  AND s.\`status\` = 1
  AND s.\`source_type\` = 'worldgen'
  AND s.\`source_ref_type\` = 'world'
ORDER BY s.\`item_id\` ASC, s.\`sort_order\` ASC, s.\`id\` ASC
`.trim(),
    itemBackedSources: `
SELECT
  i.\`id\`,
  i.\`name\`,
  i.\`name_zh\` AS nameZh,
  i.\`internal_name\` AS internalName,
  i.\`image\`
FROM ${qualified(database, 'items')} i
WHERE i.\`deleted\` = 0
  AND i.\`status\` = 1
  AND (
    LOWER(i.\`name\`) REGEXP 'chest|crate|treasure[[:space:]]+bag|lock[[:space:]]*box|present|goodie[[:space:]]+bag'
    OR LOWER(COALESCE(i.\`internal_name\`, '')) REGEXP 'chest|crate|treasurebag|lockbox|present|goodiebag'
  )
ORDER BY CHAR_LENGTH(i.\`name\`) DESC, i.\`id\` ASC
`.trim()
  };
}

export function buildWorldgenContainerSourcePollutionGate(report = {}) {
  const summary = report.summary ?? {};
  const metrics = ['pollutedRows', 'autoFixableRows', 'needsReviewRows', 'blockedRows'];
  const blockers = metrics
    .map((metric) => ({ metric, count: numberOrZero(summary[metric]) }))
    .filter((entry) => entry.count > 0);
  return {
    passed: blockers.length === 0,
    blockers,
    allowedExcludedRows: numberOrZero(summary.excludedRows)
  };
}

export function auditWorldgenContainerSourcePollution({
  generatedAt = new Date().toISOString(),
  sourceRows = [],
  itemBackedSources = [],
  sourceEvidence = {},
  managedUrlPrefixes = DEFAULT_MANAGED_URL_PREFIXES,
  sampleLimit = DEFAULT_SAMPLE_LIMIT
} = {}) {
  const candidates = buildMatchableItemBackedSources(itemBackedSources);
  const rows = [];
  const excludedRows = [];

  for (const sourceRow of sourceRows) {
    if (!isActiveWorldgenWorldRow(sourceRow)) {
      continue;
    }
    const evidenceText = buildEvidenceText(sourceRow);
    if (!CONTAINER_TERM_PATTERN.test(evidenceText)) {
      continue;
    }

    const matchedSources = matchItemBackedSources(evidenceText, candidates, managedUrlPrefixes);
    const sourceItemId = numberOrNull(sourceRow.itemId ?? sourceRow.item_id);
    const exclusionReason = classifySourceExclusion({ sourceRow, matchedSources });
    if (exclusionReason) {
      excludedRows.push(buildExcludedRow(sourceRow, matchedSources, exclusionReason));
      continue;
    }

    const reviewReasons = [];
    if (matchedSources.length === 0) {
      reviewReasons.push('no_item_backed_source_match');
    }
    if (matchedSources.some((source) => source.id === sourceItemId)) {
      reviewReasons.push('self_source_match');
    }
    if (
      matchedSources.some((source) => source.isGenericContainer)
      && !isProvenGenericChestSource({ row: sourceRow, matchedSources, sourceEvidence })
    ) {
      reviewReasons.push('generic_container_reference');
    }
    if (matchedSources.some((source) => !source.hasManagedImage)) {
      reviewReasons.push('matched_source_missing_managed_image');
    }

    const classification = classifyPollutedRow(matchedSources, reviewReasons);
    rows.push({
      sourceId: numberOrNull(sourceRow.sourceId ?? sourceRow.id),
      itemId: sourceItemId,
      itemName: textOrNull(sourceRow.itemName ?? sourceRow.item_name),
      itemNameZh: textOrNull(sourceRow.itemNameZh ?? sourceRow.item_name_zh),
      itemInternalName: textOrNull(sourceRow.itemInternalName ?? sourceRow.item_internal_name),
      sourceType: textOrNull(sourceRow.sourceType ?? sourceRow.source_type),
      sourceRefType: textOrNull(sourceRow.sourceRefType ?? sourceRow.source_ref_type),
      sourceRefName: textOrNull(sourceRow.sourceRefName ?? sourceRow.source_ref_name),
      sourcePage: textOrNull(sourceRow.sourcePage ?? sourceRow.source_page),
      conditions: textOrNull(sourceRow.conditions),
      notes: textOrNull(sourceRow.notes),
      classification,
      reviewReasons,
      matchedSources
    });
  }

  const summary = {
    scannedWorldgenWorldRows: sourceRows.filter(isActiveWorldgenWorldRow).length,
    pollutedRows: rows.length,
    autoFixableRows: rows.filter((row) => row.classification === 'auto_fixable').length,
    needsReviewRows: rows.filter((row) => row.classification === 'needs_review').length,
    blockedRows: rows.filter((row) => row.classification === 'blocked').length,
    excludedRows: excludedRows.length,
    matchedSourceRows: rows.reduce((total, row) => total + row.matchedSources.length, 0)
  };

  return {
    generatedAt,
    readOnly: true,
    entity: 'item_source_worldgen_container_pollution',
    status: summary.pollutedRows > 0 ? 'warning' : 'ok',
    summary,
    rows,
    excludedRows,
    samples: {
      autoFixable: rows.filter((row) => row.classification === 'auto_fixable').slice(0, sampleLimit),
      needsReview: rows.filter((row) => row.classification === 'needs_review').slice(0, sampleLimit),
      blocked: rows.filter((row) => row.classification === 'blocked').slice(0, sampleLimit),
      excluded: excludedRows.slice(0, sampleLimit)
    }
  };
}

export function classifyItemBackedSourceType(item = {}) {
  const name = normalizeForMatching(item.name ?? item.nameZh ?? item.internalName ?? '');
  const internalName = normalizeForMatching(item.internalName ?? '');
  const combined = `${name} ${internalName}`;
  if (/\bcrate\b/.test(combined)) {
    return { sourceType: 'crate', sourceRefType: 'crate' };
  }
  if (/\btreasure bag\b/.test(combined) || /\bbossbag\b/.test(combined)) {
    return { sourceType: 'treasure_bag', sourceRefType: 'treasure_bag' };
  }
  if (/\bchest\b|\block box\b|\bgoodie bag\b/.test(combined)) {
    return { sourceType: 'container', sourceRefType: 'container' };
  }
  return { sourceType: 'item', sourceRefType: 'item' };
}

export function renderWorldgenContainerSourcePollutionMarkdown(report) {
  const lines = [];
  const summary = report.summary ?? {};
  lines.push('# Worldgen Container Source Pollution Audit');
  lines.push('');
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| Scanned active worldgen/world rows | ${summary.scannedWorldgenWorldRows ?? 0} |`);
  lines.push(`| Polluted rows | ${summary.pollutedRows ?? 0} |`);
  lines.push(`| Auto-fixable rows | ${summary.autoFixableRows ?? 0} |`);
  lines.push(`| Needs review rows | ${summary.needsReviewRows ?? 0} |`);
  lines.push(`| Blocked rows | ${summary.blockedRows ?? 0} |`);
  lines.push(`| Excluded rows | ${summary.excludedRows ?? 0} |`);
  lines.push('');
  lines.push('## Auto-Fixable Samples');
  lines.push('');
  for (const row of report.samples?.autoFixable ?? []) {
    lines.push(`- source ${row.sourceId}, item ${row.itemId} ${row.itemName}: ${row.matchedSources.map((source) => `${source.id} ${source.name}`).join(', ')}`);
  }
  if ((report.samples?.autoFixable ?? []).length === 0) {
    lines.push('- None');
  }
  lines.push('');
  lines.push('## Review / Blocked Samples');
  lines.push('');
  for (const row of [...(report.samples?.needsReview ?? []), ...(report.samples?.blocked ?? [])]) {
    lines.push(`- source ${row.sourceId}, item ${row.itemId} ${row.itemName}: ${row.reviewReasons.join(', ')}`);
  }
  if (((report.samples?.needsReview ?? []).length + (report.samples?.blocked ?? []).length) === 0) {
    lines.push('- None');
  }
  lines.push('');
  lines.push('## Excluded Samples');
  lines.push('');
  for (const row of report.samples?.excluded ?? []) {
    lines.push(`- source ${row.sourceId}, item ${row.itemId} ${row.itemName}: ${row.exclusionReason}`);
  }
  if ((report.samples?.excluded ?? []).length === 0) {
    lines.push('- None');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseAuditWorldgenContainerSourcePollutionArgs();
  const config = loadLocalStackConfig(repoRoot);
  const mysql = loadMysqlModule();
  const db = {
    host: options.host ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? config.database?.port ?? 3306),
    user: options.user ?? config.database?.username ?? 'root',
    password: options.password ?? config.database?.password ?? 'root',
    database: options.database
  };
  const queries = buildWorldgenContainerSourcePollutionQueries({ database: db.database });
  const connection = await mysql.createConnection(db);
  try {
    const [sourceRows] = await connection.query(queries.sourceRows);
    const [itemBackedSources] = await connection.query(queries.itemBackedSources);
    const report = auditWorldgenContainerSourcePollution({
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      sourceRows,
      itemBackedSources,
      sourceEvidence: loadSourceEvidence(),
      managedUrlPrefixes: options.managedUrlPrefixes,
      sampleLimit: options.sampleLimit
    });
    if (options.outputPath) {
      writeJson(path.resolve(repoRoot, options.outputPath), report);
    } else {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
    if (options.markdownOutputPath) {
      await fs.mkdir(path.dirname(path.resolve(repoRoot, options.markdownOutputPath)), { recursive: true });
      await fs.writeFile(path.resolve(repoRoot, options.markdownOutputPath), renderWorldgenContainerSourcePollutionMarkdown(report), 'utf8');
    }
    const gate = buildWorldgenContainerSourcePollutionGate(report);
    if (options.failOnPollution && !gate.passed) {
      console.error(`Worldgen container source pollution gate failed: ${gate.blockers.map((entry) => `${entry.metric}=${entry.count}`).join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

function loadMysqlModule() {
  try {
    return moduleRequire('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
    return createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
  }
}

export function loadSourceEvidence({
  chestRawPath = '/home/lolben/data/terraPedia/raw/wiki/item-pages/chest.latest.json'
} = {}) {
  return {
    chestPage: loadChestPageEvidence(chestRawPath)
  };
}

export function loadChestPageEvidence(chestRawPath) {
  if (!fsSync.existsSync(chestRawPath)) {
    return null;
  }
  try {
    const payload = JSON.parse(fsSync.readFileSync(chestRawPath, 'utf8'));
    const wikitext = String(payload.wikitext ?? '');
    return {
      itemId: 48,
      requestedPageTitle: textOrNull(payload.requestedPageTitle),
      pageTitle: textOrNull(payload.pageTitle),
      itemInternalName: textOrNull(payload.itemInternalName),
      hasAuto48: /auto\s*=\s*48\b/.test(wikitext),
      hasLootItemChest: /\{\{loot\|item=Chest\b/i.test(wikitext),
      lootTargetNames: extractChestLootTargetNames(wikitext)
    };
  } catch {
    return null;
  }
}

export function extractChestLootTargetNames(wikitext) {
  const surfaceLoot = sectionText(wikitext, '== Surface loot ==', '== Underground loot ==');
  const targets = [];
  for (const line of surfaceLoot.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      continue;
    }
    if (trimmed.startsWith('|:')) {
      continue;
    }
    const rawName = trimmed.slice(1).split('|')[0].trim();
    const itemName = normalizeLootTargetName(rawName);
    if (itemName) {
      targets.push(itemName);
    }
  }
  return [...new Set(targets)];
}

function isProvenGenericChestSource({ row, matchedSources, sourceEvidence }) {
  if (matchedSources.length !== 1) return false;
  const only = matchedSources[0];
  const chestPage = sourceEvidence?.chestPage ?? {};
  const itemName = normalizeForMatching(row.itemName ?? row.item_name);
  const lootTargetNames = new Set((chestPage?.lootTargetNames ?? []).map(normalizeForMatching));
  return Number(only.id) === 48
    && only.name === 'Chest'
    && chestPage?.requestedPageTitle === 'Chest'
    && chestPage?.pageTitle === 'Chests'
    && chestPage?.itemInternalName === 'Chest'
    && chestPage?.hasAuto48 === true
    && chestPage?.hasLootItemChest === true
    && lootTargetNames.has(itemName);
}

function classifySourceExclusion({ sourceRow, matchedSources }) {
  const sourcePage = textOrNull(sourceRow.sourcePage ?? sourceRow.source_page);
  if (BROAD_WORLDGEN_CONTEXT_PAGES.has(sourcePage)) {
    return 'broad_worldgen_context';
  }
  const sourceItemId = numberOrNull(sourceRow.itemId ?? sourceRow.item_id);
  if (matchedSources.some((source) => source.id === sourceItemId)) {
    return 'self_source_match';
  }
  const itemName = normalizeForMatching(sourceRow.itemName ?? sourceRow.item_name);
  const evidenceText = normalizeForMatching(buildEvidenceText(sourceRow));
  if (
    (itemName === 'key of night' || itemName === 'key of light')
    && /\bplaced\b/.test(evidenceText)
    && /\bempty chest\b/.test(evidenceText)
    && /\bspawn/.test(evidenceText)
  ) {
    return 'trigger_usage_not_acquisition';
  }
  return null;
}

function buildExcludedRow(sourceRow, matchedSources, exclusionReason) {
  return {
    sourceId: numberOrNull(sourceRow.sourceId ?? sourceRow.id),
    itemId: numberOrNull(sourceRow.itemId ?? sourceRow.item_id),
    itemName: textOrNull(sourceRow.itemName ?? sourceRow.item_name),
    itemNameZh: textOrNull(sourceRow.itemNameZh ?? sourceRow.item_name_zh),
    itemInternalName: textOrNull(sourceRow.itemInternalName ?? sourceRow.item_internal_name),
    sourceType: textOrNull(sourceRow.sourceType ?? sourceRow.source_type),
    sourceRefType: textOrNull(sourceRow.sourceRefType ?? sourceRow.source_ref_type),
    sourceRefName: textOrNull(sourceRow.sourceRefName ?? sourceRow.source_ref_name),
    sourcePage: textOrNull(sourceRow.sourcePage ?? sourceRow.source_page),
    conditions: textOrNull(sourceRow.conditions),
    notes: textOrNull(sourceRow.notes),
    exclusionReason,
    matchedSources
  };
}

function buildMatchableItemBackedSources(items) {
  return items
    .map((item) => {
      const name = textOrNull(item.name);
      const sourceTypes = classifyItemBackedSourceType(item);
      return {
        id: numberOrNull(item.id),
        name,
        nameZh: textOrNull(item.nameZh ?? item.name_zh),
        internalName: textOrNull(item.internalName ?? item.internal_name),
        image: textOrNull(item.image),
        normalizedName: normalizeForMatching(name),
        singularName: singularizeContainerPhrase(normalizeForMatching(name)),
        sourceType: sourceTypes.sourceType,
        sourceRefType: sourceTypes.sourceRefType,
        isGenericContainer: GENERIC_CONTAINER_NAMES.has(singularizeContainerPhrase(normalizeForMatching(name))),
        hasManagedImage: hasManagedUrl(item.image, DEFAULT_MANAGED_URL_PREFIXES)
      };
    })
    .filter((item) => item.id != null && item.name && item.singularName)
    .sort((left, right) => right.singularName.length - left.singularName.length || left.id - right.id);
}

function matchItemBackedSources(text, candidates, managedUrlPrefixes) {
  const normalizedText = singularizeContainerPhrase(normalizeForMatching(text));
  const matches = [];
  const occupiedNames = new Set();
  for (const candidate of candidates) {
    const matchIndex = normalizedText.indexOf(candidate.singularName);
    if (!candidate.singularName || matchIndex === -1) {
      continue;
    }
    if ([...occupiedNames].some((name) => name.includes(candidate.singularName))) {
      continue;
    }
    occupiedNames.add(candidate.singularName);
    matches.push({
      matchIndex,
      id: candidate.id,
      name: candidate.name,
      nameZh: candidate.nameZh,
      internalName: candidate.internalName,
      image: candidate.image,
      sourceType: candidate.sourceType,
      sourceRefType: candidate.sourceRefType,
      hasManagedImage: hasManagedUrl(candidate.image, managedUrlPrefixes),
      isGenericContainer: candidate.isGenericContainer
    });
  }
  return matches
    .sort((left, right) => left.matchIndex - right.matchIndex || left.id - right.id)
    .map(({ matchIndex, ...match }) => match);
}

function classifyPollutedRow(matchedSources, reviewReasons) {
  if (matchedSources.length === 0) {
    return 'blocked';
  }
  if (reviewReasons.length > 0) {
    return 'needs_review';
  }
  return 'auto_fixable';
}

function isActiveWorldgenWorldRow(row = {}) {
  const deleted = Number(row.deleted ?? 0);
  const status = Number(row.status ?? 1);
  return status === 1
    && deleted === 0
    && String(row.sourceType ?? row.source_type ?? '').toLowerCase() === 'worldgen'
    && String(row.sourceRefType ?? row.source_ref_type ?? '').toLowerCase() === 'world';
}

function buildEvidenceText(row = {}) {
  return [
    row.sourceRefName ?? row.source_ref_name,
    row.conditions,
    row.notes,
    row.sourcePage ?? row.source_page
  ].filter((value) => value != null).join(' ');
}

function hasManagedUrl(value, prefixes) {
  const text = textOrNull(value);
  if (!text) return false;
  return prefixes.some((prefix) => text.toLowerCase().startsWith(String(prefix).toLowerCase()));
}

function normalizeForMatching(value) {
  return String(value ?? '')
    .replace(/[()]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function singularizeContainerPhrase(value) {
  return String(value ?? '')
    .replace(/\bchests\b/g, 'chest')
    .replace(/\bcrates\b/g, 'crate')
    .replace(/\btreasure bags\b/g, 'treasure bag')
    .replace(/\block boxes\b/g, 'lock box')
    .replace(/\bpresents\b/g, 'present')
    .replace(/\bgoodie bags\b/g, 'goodie bag');
}

function sectionText(wikitext, startMarker, endMarker) {
  const start = String(wikitext ?? '').indexOf(startMarker);
  if (start === -1) return '';
  const contentStart = start + startMarker.length;
  const end = String(wikitext ?? '').indexOf(endMarker, contentStart);
  return String(wikitext ?? '').slice(contentStart, end === -1 ? undefined : end);
}

function normalizeLootTargetName(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.startsWith(':group:')) return null;
  if (text.startsWith(':custom:')) {
    const match = text.match(/\{\{item\|([^|}]+)/i);
    return textOrNull(match?.[1]);
  }
  return textOrNull(text.replace(/\{\{[^}]+}}/g, '').trim());
}

function parseList(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanOption(value, fallback) {
  if (value == null || value === '') return fallback;
  if (value === true || value === 'true' || value === '1' || value === 'yes') return true;
  if (value === false || value === 'false' || value === '0' || value === 'no') return false;
  return fallback;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textOrNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function qualified(database, table) {
  return `\`${String(database).replace(/`/g, '``')}\`.\`${String(table).replace(/`/g, '``')}\``;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
