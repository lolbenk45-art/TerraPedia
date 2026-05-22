#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  booleanOption,
  fetchWikiApiJson,
  parseCliArgs,
  writeJson,
} from '../lib/wiki-item-utils.mjs';
import { decodeHtmlEntities, stripHtml } from '../lib/wiki-page-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import {
  buildActionProgressPayload,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';

const moduleRequire = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();
export const DEFAULT_PROGRESS_PATH = path.join(repoRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');
export const DEFAULT_ACTION_ID = 'entity-zh-descriptions-backfill';
const CELESTIAL_PILLAR_NAME_ZH = new Map([
  ['SOLAR_PILLAR', '日耀柱'],
  ['NEBULA_PILLAR', '星云柱'],
  ['VORTEX_PILLAR', '星旋柱'],
  ['STARDUST_PILLAR', '星尘柱'],
]);
const CELESTIAL_PILLAR_CODES = new Set([...CELESTIAL_PILLAR_NAME_ZH.keys()]);
const BIOME_OVERVIEW_ANCHOR_BY_CODE = new Map([
  ['flower_patch', '小片花地'],
  ['stone_patch', '石嵌块'],
  ['large_ore_vein', '大型矿脉'],
  ['moss_chamber', '苔藓腔'],
  ['gemstone_cave', '宝石洞'],
  ['thin_ice_patch', '薄冰地'],
  ['spike_caves', '尖刺山洞'],
  ['ash_forest', '灰烬森林'],
  ['mosaic', '拼嵌洞'],
  ['campsite', '露营地'],
]);

export function isEnglishOnlyText(value) {
  const text = normalizeText(value);
  return Boolean(text && /[A-Za-z]/.test(text) && !containsChinese(text));
}

export function extractFirstChineseParagraph(html, { minLength = 12 } = {}) {
  const paragraphs = extractParagraphs(html);
  return paragraphs.find((paragraph) => {
    if (!containsChinese(paragraph)) return false;
    if (paragraph.length < minLength) return false;
    if (/^(电脑版|主机版|移动版|该页面|此信息仅适用于)/.test(paragraph)) return false;
    return true;
  }) ?? null;
}

export function extractSectionParagraphByAnchor(html, anchor, { minLength = 6 } = {}) {
  const safeAnchor = normalizeText(anchor);
  if (!safeAnchor || typeof html !== 'string') return null;
  const escaped = escapeRegExp(safeAnchor);
  const headingPattern = new RegExp(
    `<h[23][^>]*>[\\s\\S]*?<span[^>]+class=["'][^"']*mw-headline[^"']*["'][^>]+id=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/h[23]>`,
    'i'
  );
  const headingMatch = html.match(headingPattern);
  if (!headingMatch || headingMatch.index == null) return null;
  const start = headingMatch.index + headingMatch[0].length;
  const rest = html.slice(start);
  const nextHeadingIndex = rest.search(/<h[23]\b/i);
  const sectionHtml = nextHeadingIndex >= 0 ? rest.slice(0, nextHeadingIndex) : rest;
  return extractParagraphs(sectionHtml).find((paragraph) => {
    return containsChinese(paragraph) && paragraph.length >= minLength;
  }) ?? null;
}

export async function buildZhDescriptionPlan({
  bosses = [],
  biomes = [],
  fetchZhPage,
  fetchZhTitle,
  minDescriptionLength = 6,
  generatedAt = new Date().toISOString(),
  onProgress,
} = {}) {
  const pageFetcher = fetchZhPage ?? fetchZhWikiPage;
  const titleFetcher = fetchZhTitle ?? fetchZhTitleForEnglishPage;
  const zhPageCache = new Map();
  const getZhPage = async (title) => {
    const normalized = normalizeText(title);
    if (!normalized) return null;
    if (!zhPageCache.has(normalized)) {
      zhPageCache.set(normalized, await pageFetcher(normalized));
    }
    return zhPageCache.get(normalized);
  };
  const getZhTitle = async (title) => {
    const normalized = normalizeText(title);
    if (!normalized) return null;
    return titleFetcher(normalized);
  };
  const totalCandidates = bosses.length + biomes.length;
  let processedCandidates = 0;
  const notifyProgress = async (scope, row) => {
    processedCandidates += 1;
    if (typeof onProgress === 'function') {
      await onProgress({
        scope,
        code: normalizeText(row?.code),
        current: processedCandidates,
        total: totalCandidates,
      });
    }
  };

  const bossUpdates = [];
  const bossSkipped = [];
  for (const row of bosses) {
    const candidate = await buildBossCandidate(row, { getZhPage, getZhTitle, minDescriptionLength });
    if (candidate.update) bossUpdates.push(candidate.update);
    else bossSkipped.push(candidate.skipped);
    await notifyProgress('bosses', row);
  }

  const biomeUpdates = [];
  const biomeSkipped = [];
  for (const row of biomes) {
    const candidate = await buildBiomeCandidate(row, { getZhPage, getZhTitle, minDescriptionLength });
    if (candidate.update) biomeUpdates.push(candidate.update);
    else biomeSkipped.push(candidate.skipped);
    await notifyProgress('biomes', row);
  }

  return {
    generatedAt,
    summary: {
      bosses: {
        candidates: bosses.length,
        patchable: bossUpdates.length,
        skipped: bossSkipped.length,
      },
      biomes: {
        candidates: biomes.length,
        patchable: biomeUpdates.length,
        skipped: biomeSkipped.length,
      },
    },
    bossUpdates,
    bossSkipped,
    biomeUpdates,
    biomeSkipped,
  };
}

async function buildBossCandidate(row, { getZhPage, getZhTitle, minDescriptionLength }) {
  const code = normalizeText(row.code);
  let zhTitle = normalizeText(row.name_zh);
  let titleSource = zhTitle ? 'db:name_zh' : null;

  if (!zhTitle && CELESTIAL_PILLAR_CODES.has(code)) {
    zhTitle = '天界柱';
    titleSource = 'zh-wiki:celestial-pillars-shared-page';
  }
  if (!zhTitle) {
    zhTitle = await getZhTitle(extractEnglishPageTitle(row.source_page) ?? row.name_en);
    titleSource = zhTitle ? 'wiki-langlink' : null;
  }
  if (!zhTitle) {
    return { skipped: skippedRow(row, 'bosses', 'missing_zh_title') };
  }

  const page = await getZhPage(zhTitle);
  if (!page?.html) {
    return { skipped: skippedRow(row, 'bosses', 'missing_zh_page', { zhTitle }) };
  }

  const notesAfter = extractFirstChineseParagraph(page.html, { minLength: minDescriptionLength });
  if (!notesAfter) {
    return { skipped: skippedRow(row, 'bosses', 'missing_zh_intro', { zhTitle, sourcePageZh: page.pageTitle }) };
  }

  const nameZhAfter = normalizeText(row.name_zh) || CELESTIAL_PILLAR_NAME_ZH.get(code) || null;
  return {
    update: {
      id: Number(row.id),
      code,
      nameEn: normalizeText(row.name_en),
      nameZhBefore: normalizeText(row.name_zh),
      nameZhAfter,
      notesBefore: normalizeText(row.notes),
      notesAfter,
      sourcePageBefore: normalizeText(row.source_page),
      sourcePageZh: page.pageTitle,
      sourceRevisionTimestamp: page.revisionTimestamp ?? null,
      sourceKind: titleSource,
    },
  };
}

async function buildBiomeCandidate(row, { getZhPage, getZhTitle, minDescriptionLength }) {
  const code = normalizeText(row.code);
  const overviewAnchor = resolveBiomeOverviewAnchor(row);
  let page = null;
  let descriptionAfter = null;
  let sourceKind = null;

  if (overviewAnchor) {
    page = await getZhPage('生物群系');
    descriptionAfter = page?.html
      ? extractSectionParagraphByAnchor(page.html, overviewAnchor, { minLength: minDescriptionLength })
      : null;
    sourceKind = 'zh-wiki:biomes-overview-section';
  }

  if (!descriptionAfter) {
    const zhTitle = await getZhTitle(extractEnglishPageTitle(row.source_page) ?? row.name_en);
    if (zhTitle) {
      page = await getZhPage(zhTitle);
      descriptionAfter = page?.html
        ? extractFirstChineseParagraph(page.html, { minLength: minDescriptionLength })
        : null;
      sourceKind = 'wiki-langlink';
    }
  }

  if (!descriptionAfter && normalizeText(row.name_zh)) {
    page = await getZhPage(row.name_zh);
    descriptionAfter = page?.html
      ? extractFirstChineseParagraph(page.html, { minLength: minDescriptionLength })
      : null;
    sourceKind = 'zh-wiki:title-from-db-name_zh';
  }

  if (!descriptionAfter) {
    return { skipped: skippedRow(row, 'biomes', 'missing_zh_description', { overviewAnchor }) };
  }

  return {
    update: {
      id: Number(row.id),
      code,
      nameEn: normalizeText(row.name_en),
      nameZh: normalizeText(row.name_zh),
      descriptionBefore: normalizeText(row.description),
      descriptionAfter,
      sourcePageBefore: normalizeText(row.source_page),
      sourcePageZh: page?.pageTitle ?? null,
      sourceRevisionTimestamp: page?.revisionTimestamp ?? null,
      sourceKind,
      overviewAnchor,
    },
  };
}

async function fetchZhTitleForEnglishPage(title) {
  const normalized = normalizeText(title);
  if (!normalized) return null;
  const url = new URL('https://terraria.wiki.gg/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', normalized);
  url.searchParams.set('prop', 'langlinks');
  url.searchParams.set('lllang', 'zh');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  const payload = await fetchWikiApiJson({
    url,
    profile: 'revision',
    sourceKey: `entity-zh-title:${normalized}`,
  });
  const page = payload?.query?.pages?.[0];
  const zhTitle = page?.langlinks?.find((link) => link?.lang === 'zh')?.title;
  return normalizeText(zhTitle);
}

async function fetchZhWikiPage(title) {
  const normalized = normalizeText(title);
  if (!normalized) return null;
  const url = new URL('https://terraria.wiki.gg/zh/api.php');
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', normalized);
  url.searchParams.set('prop', 'text');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  const parsePayload = await fetchWikiApiJson({
    url,
    profile: 'parse',
    sourceKey: `entity-zh-page:${normalized}`,
  });
  const pageTitle = normalizeText(parsePayload?.parse?.title) ?? normalized;
  const revisionTimestamp = await fetchZhPageRevisionTimestamp(pageTitle);
  return {
    pageTitle,
    revisionTimestamp,
    html: String(parsePayload?.parse?.text ?? ''),
  };
}

async function fetchZhPageRevisionTimestamp(title) {
  const url = new URL('https://terraria.wiki.gg/zh/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', title);
  url.searchParams.set('prop', 'revisions');
  url.searchParams.set('rvprop', 'timestamp');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  const payload = await fetchWikiApiJson({
    url,
    profile: 'revision',
    sourceKey: `entity-zh-revision:${title}`,
  });
  return payload?.query?.pages?.[0]?.revisions?.[0]?.timestamp ?? null;
}

function extractParagraphs(html) {
  if (typeof html !== 'string') return [];
  return [...html.matchAll(/<p>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanWikiText(match[1]))
    .filter(Boolean);
}

function cleanWikiText(value) {
  const text = stripHtml(String(value ?? '')
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<sup\b[\s\S]*?<\/sup>/gi, ' ')
  )
    .replace(/\s+([，。！？；：、）])/g, '$1')
    .replace(/\s+([（])/g, '$1')
    .replace(/([，。！？；：、（])\s+([\u3400-\u9fff])/g, '$1$2')
    .replace(/([（])\s+/g, '$1')
    .replace(CHINESE_INTERIOR_SPACE_PATTERN, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
  return normalizeChineseInteriorSpaces(text);
}

const CHINESE_INTERIOR_SPACE_PATTERN = /([\u3400-\u9fff])\s+([\u3400-\u9fff])/g;

function normalizeChineseInteriorSpaces(value) {
  let previous = null;
  let current = String(value ?? '');
  while (current !== previous) {
    previous = current;
    current = current.replace(CHINESE_INTERIOR_SPACE_PATTERN, '$1$2');
  }
  return current;
}

function resolveBiomeOverviewAnchor(row) {
  const code = normalizeText(row.code);
  if (code && BIOME_OVERVIEW_ANCHOR_BY_CODE.has(code)) {
    return BIOME_OVERVIEW_ANCHOR_BY_CODE.get(code);
  }
  const sourcePage = normalizeText(row.source_page);
  if (sourcePage?.startsWith('Biomes#')) {
    const rawAnchor = decodeHtmlEntities(sourcePage.slice('Biomes#'.length).replaceAll('_', ' '));
    return BIOME_OVERVIEW_ANCHOR_BY_CODE.get(code) ?? normalizeText(row.name_zh) ?? rawAnchor;
  }
  return null;
}

function extractEnglishPageTitle(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) {
    try {
      const parsed = new URL(text);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const title = parts[parts.length - 1] ?? '';
      return decodeURIComponent(title).replaceAll('_', ' ') || null;
    } catch {
      return text;
    }
  }
  return text.split('#')[0].replaceAll('_', ' ');
}

function skippedRow(row, scope, reason, extra = {}) {
  return {
    scope,
    reason,
    id: row.id == null ? null : Number(row.id),
    code: normalizeText(row.code),
    nameEn: normalizeText(row.name_en),
    nameZh: normalizeText(row.name_zh),
    sourcePage: normalizeText(row.source_page),
    ...extra,
  };
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function containsChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value ?? ''));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function csvSet(value, fallback) {
  const text = normalizeText(value);
  if (!text) return new Set(fallback);
  return new Set(text.split(',').map((entry) => entry.trim()).filter(Boolean));
}

function resolveReportPath(value) {
  if (value) return path.resolve(process.cwd(), value);
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  return path.join(repoRoot, 'reports', 'sync', `entity-zh-descriptions-${timestamp}.json`);
}

function resolveDbConfig(options) {
  return {
    host: options['db-host'] ?? process.env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
    port: Number(options['db-port'] ?? process.env.TERRAPEDIA_DB_PORT ?? 13306),
    user: options['db-user'] ?? process.env.TERRAPEDIA_DB_USERNAME ?? 'root',
    password: options['db-password'] ?? process.env.TERRAPEDIA_DB_PASSWORD ?? 'root',
    database: options['db-name'] ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local',
    multipleStatements: true,
  };
}

async function loadBossCandidates(conn, limit = null) {
  const limitSql = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? ` LIMIT ${Math.trunc(Number(limit))}`
    : '';
  const [rows] = await conn.query(`
    SELECT id, code, name_en, name_zh, notes, source_page
      FROM boss_groups
     WHERE COALESCE(deleted, 0) = 0
       AND COALESCE(status, 1) = 1
       AND (
         (notes IS NOT NULL AND notes REGEXP '[A-Za-z]' AND notes NOT REGEXP '[一-龥]')
         OR notes IS NULL
         OR TRIM(notes) = ''
         OR name_zh IS NULL
         OR TRIM(name_zh) = ''
       )
     ORDER BY progression_order, id${limitSql}
  `);
  return rows;
}

async function loadBiomeCandidates(conn, limit = null) {
  const limitSql = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? ` LIMIT ${Math.trunc(Number(limit))}`
    : '';
  const [rows] = await conn.query(`
    SELECT id, code, name_en, name_zh, description, source_page, wiki_section_anchor
      FROM biomes
     WHERE COALESCE(deleted, 0) = 0
       AND COALESCE(status, 1) = 1
       AND (
         (description IS NOT NULL AND description REGEXP '[A-Za-z]' AND description NOT REGEXP '[一-龥]')
         OR description IS NULL
         OR TRIM(description) = ''
       )
     ORDER BY wiki_sort_order, id${limitSql}
  `);
  return rows;
}

async function loadExtraAuditCounts(conn) {
  const [rows] = await conn.query(`
    SELECT 'items_description_zh_missing' AS metric, COUNT(*) AS count
      FROM items
     WHERE COALESCE(deleted,0)=0 AND COALESCE(status,1)=1
       AND description IS NOT NULL AND TRIM(description)<>'' AND description REGEXP '[A-Za-z]'
       AND (description_zh IS NULL OR TRIM(description_zh)='')
    UNION ALL
    SELECT 'buffs_tooltip_zh_missing_or_english', COUNT(*)
      FROM buffs
     WHERE COALESCE(deleted,0)=0 AND COALESCE(status,1)=1
       AND (tooltip_zh IS NULL OR TRIM(tooltip_zh)='' OR (tooltip_zh REGEXP '[A-Za-z]' AND tooltip_zh NOT REGEXP '[一-龥]'))
    UNION ALL
    SELECT 'world_contexts_description_english_or_missing', COUNT(*)
      FROM world_contexts
     WHERE COALESCE(deleted,0)=0 AND COALESCE(status,1)=1
       AND ((description IS NOT NULL AND description REGEXP '[A-Za-z]' AND description NOT REGEXP '[一-龥]') OR description IS NULL OR TRIM(description)='')
  `);
  return Object.fromEntries(rows.map((row) => [row.metric, Number(row.count)]));
}

async function applyPlan(conn, plan, scopes) {
  const summary = {
    bossRowsUpdated: 0,
    biomeRowsUpdated: 0,
  };
  await conn.beginTransaction();
  try {
    if (scopes.has('bosses')) {
      for (const update of plan.bossUpdates) {
        const [result] = await conn.execute(
          `UPDATE boss_groups
              SET name_zh = COALESCE(NULLIF(TRIM(name_zh), ''), ?),
                  notes = ?,
                  updated_at = NOW()
            WHERE id = ?
              AND COALESCE(deleted, 0) = 0`,
          [update.nameZhAfter, update.notesAfter, update.id]
        );
        summary.bossRowsUpdated += Number(result.affectedRows || 0);
      }
    }
    if (scopes.has('biomes')) {
      for (const update of plan.biomeUpdates) {
        const [result] = await conn.execute(
          `UPDATE biomes
              SET description = ?,
                  updated_at = NOW()
            WHERE id = ?
              AND COALESCE(deleted, 0) = 0`,
          [update.descriptionAfter, update.id]
        );
        summary.biomeRowsUpdated += Number(result.affectedRows || 0);
      }
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }
  return summary;
}

export function buildEntityZhDescriptionProgressPayload(progressPath, payload = {}) {
  return buildActionProgressPayload({
    actionId: DEFAULT_ACTION_ID,
    childStatusPath: progressPath,
    ...payload,
  });
}

function writeProgress(progressPath, payload) {
  if (!progressPath) return;
  writeJsonFile(progressPath, buildEntityZhDescriptionProgressPayload(progressPath, payload));
}

export function resolveMysqlRequireCandidates(root = repoRoot) {
  const candidates = [
    import.meta.url,
    path.join(root, 'data-query-app', 'package.json'),
  ];
  const primaryRoot = resolvePrimaryWorktreeRoot(root);
  if (primaryRoot) {
    candidates.push(path.join(primaryRoot, 'data-query-app', 'package.json'));
  }
  return [...new Set(candidates)];
}

function loadMysqlModule() {
  let lastModuleNotFound = null;
  for (const candidate of resolveMysqlRequireCandidates()) {
    try {
      return createRequire(candidate)('mysql2/promise');
    } catch (error) {
      if (error?.code !== 'MODULE_NOT_FOUND') {
        throw error;
      }
      lastModuleNotFound = error;
    }
  }
  try {
    return moduleRequire('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
    throw lastModuleNotFound ?? error;
  }
}

function resolvePrimaryWorktreeRoot(root) {
  const gitFilePath = path.join(path.resolve(root), '.git');
  if (!fs.existsSync(gitFilePath) || fs.statSync(gitFilePath).isDirectory()) {
    return null;
  }
  const content = fs.readFileSync(gitFilePath, 'utf8').trim();
  const match = content.match(/^gitdir:\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const gitDir = path.resolve(root, match[1].trim());
  const segments = gitDir.split(path.sep);
  const worktreesIndex = segments.lastIndexOf('worktrees');
  if (worktreesIndex <= 0) {
    return null;
  }
  const commonGitDir = segments.slice(0, worktreesIndex).join(path.sep) || path.sep;
  const primaryRoot = path.dirname(commonGitDir);
  return fs.existsSync(path.join(primaryRoot, '.git')) ? primaryRoot : null;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const apply = booleanOption(options.apply, false);
  const scopes = csvSet(options.scopes ?? options.scope, ['bosses', 'biomes']);
  const limit = options.limit ?? null;
  const reportPath = resolveReportPath(options.report);
  const progressPath = path.resolve(process.cwd(), options['progress-path'] ?? DEFAULT_PROGRESS_PATH);
  const startedAt = new Date().toISOString();

  writeProgress(progressPath, {
    status: 'running',
    phase: 'load',
    message: 'loading English description candidates',
    current: 0,
    total: 0,
    startedAt,
  });

  const db = resolveDbConfig(options);
  const mysql = loadMysqlModule();
  const conn = await mysql.createConnection(db);
  try {
    await conn.query('SET NAMES utf8mb4');
    const bosses = scopes.has('bosses') ? await loadBossCandidates(conn, limit) : [];
    const biomes = scopes.has('biomes') ? await loadBiomeCandidates(conn, limit) : [];
    const extraAuditCounts = await loadExtraAuditCounts(conn);
    const total = bosses.length + biomes.length;

    writeProgress(progressPath, {
      status: 'running',
      phase: 'fetch',
      message: `fetching zh wiki descriptions for ${total} candidate(s)`,
      current: 0,
      total,
      startedAt,
    });

    const plan = await buildZhDescriptionPlan({
      bosses,
      biomes,
      onProgress: ({ current, total, scope, code }) => {
        writeProgress(progressPath, {
          status: 'running',
          phase: 'fetch',
          message: `fetching zh wiki descriptions (${current}/${total}) ${scope}:${code ?? 'unknown'}`,
          current,
          total,
          startedAt,
        });
      },
    });
    const writeSummary = apply ? await applyPlan(conn, plan, scopes) : { bossRowsUpdated: 0, biomeRowsUpdated: 0 };
    const report = {
      ...plan,
      apply,
      scopes: [...scopes],
      database: {
        host: db.host,
        port: db.port,
        database: db.database,
      },
      extraAuditCounts,
      writeSummary,
      reportPath,
      progressPath,
    };
    writeJson(reportPath, report);
    writeProgress(progressPath, {
      status: 'completed',
      phase: 'write',
      message: `finished zh description backfill; bossUpdates=${writeSummary.bossRowsUpdated}; biomeUpdates=${writeSummary.biomeRowsUpdated}`,
      current: total,
      total,
      startedAt,
      outputPath: reportPath,
    });
    console.log(JSON.stringify({
      apply,
      scopes: [...scopes],
      candidates: { bosses: bosses.length, biomes: biomes.length },
      patchable: {
        bosses: plan.bossUpdates.length,
        biomes: plan.biomeUpdates.length,
      },
      skipped: {
        bosses: plan.bossSkipped.length,
        biomes: plan.biomeSkipped.length,
      },
      writeSummary,
      extraAuditCounts,
      reportPath,
      progressPath,
    }, null, 2));
  } catch (error) {
    writeProgress(progressPath, {
      status: 'failed',
      phase: 'error',
      message: error?.message ?? String(error),
      current: 0,
      total: 0,
      startedAt,
    });
    throw error;
  } finally {
    await conn.end();
  }
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error?.stack ?? error?.message ?? String(error));
    process.exitCode = 1;
  });
}
