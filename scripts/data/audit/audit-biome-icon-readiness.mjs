#!/usr/bin/env node

import fs from 'node:fs/promises';
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
const KNOWN_NO_REPRESENTATIVE_IMAGE_BIOMES = new Map([
  ['spike_caves', {
    reason: 'official_no_representative_image',
    sourcePage: 'Biomes#Spike_Caves'
  }]
]);
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

export function parseAuditBiomeIconReadinessArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  for (const [key, value] of Object.entries(options)) {
    if (MUTATION_FLAGS.has(key.toLowerCase()) && value !== false && value !== 'false') {
      throw new Error(`read-only biome icon readiness audit refuses mutation flag: --${key}`);
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
    generatedAt: options['generated-at'] ?? options.generatedAt ?? null
  };
}

export function buildBiomeIconReadinessQueries({ database = DEFAULT_LOCAL_DATABASE } = {}) {
  return {
    biomes: `
SELECT
  b.\`id\`,
  b.\`code\`,
  b.\`name_en\` AS nameEn,
  b.\`name_zh\` AS nameZh,
  b.\`icon_url\` AS iconUrl,
  b.\`source_provider\` AS sourceProvider,
  b.\`source_page\` AS sourcePage
FROM ${qualified(database, 'biomes')} b
WHERE b.\`deleted\` = 0
  AND b.\`status\` = 1
ORDER BY b.\`id\` ASC
`.trim()
  };
}

export function auditBiomeIconReadiness({
  generatedAt = new Date().toISOString(),
  biomes = [],
  managedUrlPrefixes = DEFAULT_MANAGED_URL_PREFIXES,
  sampleLimit = DEFAULT_SAMPLE_LIMIT
} = {}) {
  const managedIconBiomes = [];
  const wikiFallbackBiomes = [];
  const invalidUrlBiomes = [];
  const missingIconBiomes = [];
  const knownNoRepresentativeImageBiomes = [];

  for (const biome of biomes) {
    const normalized = normalizeBiomeRow(biome);
    if (!normalized.iconUrl) {
      const exception = knownNoRepresentativeImageException(normalized);
      if (exception) {
        knownNoRepresentativeImageBiomes.push({
          ...identity(normalized),
          reason: exception.reason,
          sourcePage: exception.sourcePage
        });
        continue;
      }
      missingIconBiomes.push({ ...identity(normalized), reason: 'missing_icon_url' });
      continue;
    }
    if (!isValidHttpUrl(normalized.iconUrl)) {
      invalidUrlBiomes.push({ ...identity(normalized), iconUrl: normalized.iconUrl, reason: 'invalid_icon_url' });
      continue;
    }
    if (isManagedUrl(normalized.iconUrl, managedUrlPrefixes)) {
      managedIconBiomes.push({ ...identity(normalized), iconUrl: normalized.iconUrl });
      continue;
    }
    wikiFallbackBiomes.push({ ...identity(normalized), iconUrl: normalized.iconUrl, reason: 'unmanaged_or_wiki_fallback_icon_url' });
  }

  const summary = {
    totalRows: biomes.length,
    managedIconRows: managedIconBiomes.length,
    wikiFallbackRows: wikiFallbackBiomes.length,
    invalidUrlRows: invalidUrlBiomes.length,
    missingIconRows: missingIconBiomes.length,
    knownNoRepresentativeImageRows: knownNoRepresentativeImageBiomes.length
  };
  const status = summary.missingIconRows > 0 || summary.invalidUrlRows > 0 || summary.wikiFallbackRows > 0
    ? 'warning'
    : 'ok';

  return {
    generatedAt,
    readOnly: true,
    entity: 'biome_icon_readiness',
    status,
    summary,
    managedIconBiomes: managedIconBiomes.slice(0, sampleLimit),
    wikiFallbackBiomes: wikiFallbackBiomes.slice(0, sampleLimit),
    invalidUrlBiomes: invalidUrlBiomes.slice(0, sampleLimit),
    missingIconBiomes: missingIconBiomes.slice(0, sampleLimit),
    knownNoRepresentativeImageBiomes: knownNoRepresentativeImageBiomes.slice(0, sampleLimit)
  };
}

export function renderBiomeIconReadinessMarkdown(report) {
  const summary = report.summary ?? {};
  const lines = [];
  lines.push('# Biome Icon Readiness Audit');
  lines.push('');
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| Active biomes | ${summary.totalRows ?? 0} |`);
  lines.push(`| Managed icon rows | ${summary.managedIconRows ?? 0} |`);
  lines.push(`| Wiki/unmanaged fallback rows | ${summary.wikiFallbackRows ?? 0} |`);
  lines.push(`| Invalid icon URL rows | ${summary.invalidUrlRows ?? 0} |`);
  lines.push(`| Missing icon rows | ${summary.missingIconRows ?? 0} |`);
  lines.push(`| Known no representative image rows | ${summary.knownNoRepresentativeImageRows ?? 0} |`);
  lines.push('');
  lines.push('## Missing Icons');
  lines.push('');
  for (const biome of report.missingIconBiomes ?? []) {
    lines.push(`- ${biome.id} ${biome.code} / ${biome.nameEn} / ${biome.nameZh ?? ''}`);
  }
  if ((report.missingIconBiomes ?? []).length === 0) {
    lines.push('- None');
  }
  lines.push('');
  lines.push('## Known No Representative Image');
  lines.push('');
  for (const biome of report.knownNoRepresentativeImageBiomes ?? []) {
    lines.push(`- ${biome.id} ${biome.code} / ${biome.nameEn} / ${biome.nameZh ?? ''}: ${biome.reason} (${biome.sourcePage ?? ''})`);
  }
  if ((report.knownNoRepresentativeImageBiomes ?? []).length === 0) {
    lines.push('- None');
  }
  lines.push('');
  lines.push('## Unmanaged Or Invalid Samples');
  lines.push('');
  for (const biome of [...(report.wikiFallbackBiomes ?? []), ...(report.invalidUrlBiomes ?? [])]) {
    lines.push(`- ${biome.id} ${biome.code}: ${biome.reason} ${biome.iconUrl ?? ''}`.trim());
  }
  if (((report.wikiFallbackBiomes ?? []).length + (report.invalidUrlBiomes ?? []).length) === 0) {
    lines.push('- None');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseAuditBiomeIconReadinessArgs();
  const config = loadLocalStackConfig(repoRoot);
  const mysql = loadMysqlModule();
  const db = {
    host: options.host ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? config.database?.port ?? 3306),
    user: options.user ?? config.database?.username ?? 'root',
    password: options.password ?? config.database?.password ?? 'root',
    database: options.database
  };
  const queries = buildBiomeIconReadinessQueries({ database: db.database });
  const connection = await mysql.createConnection(db);
  try {
    const [biomes] = await connection.query(queries.biomes);
    const report = auditBiomeIconReadiness({
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      biomes,
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
      await fs.writeFile(path.resolve(repoRoot, options.markdownOutputPath), renderBiomeIconReadinessMarkdown(report), 'utf8');
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

function normalizeBiomeRow(row = {}) {
  return {
    id: numberOrNull(row.id),
    code: textOrNull(row.code),
    nameEn: textOrNull(row.nameEn ?? row.name_en),
    nameZh: textOrNull(row.nameZh ?? row.name_zh),
    iconUrl: textOrNull(row.iconUrl ?? row.icon_url),
    sourcePage: textOrNull(row.sourcePage ?? row.source_page)
  };
}

function knownNoRepresentativeImageException(row) {
  const code = String(row.code ?? '').toLowerCase();
  const exception = KNOWN_NO_REPRESENTATIVE_IMAGE_BIOMES.get(code);
  if (!exception) return null;
  const sourcePage = textOrNull(row.sourcePage ?? row.source_page);
  if (exception.sourcePage && sourcePage && sourcePage !== exception.sourcePage) {
    return null;
  }
  return exception;
}

function identity(row) {
  return {
    id: row.id,
    code: row.code,
    nameEn: row.nameEn,
    nameZh: row.nameZh
  };
}

function isManagedUrl(value, prefixes) {
  const lower = String(value ?? '').toLowerCase();
  return prefixes.some((prefix) => lower.startsWith(String(prefix).toLowerCase()));
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
