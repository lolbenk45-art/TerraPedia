#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildWikiPageUrl,
  ensureDir,
  fetchWikiPagePayload,
  fetchWikiPageSections,
  parseCliArgs,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import {
  decodeHtmlEntities,
  extractIntroParagraphs,
  stripHtml
} from '../lib/wiki-page-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const ZH_WIKI_API_URL = 'https://terraria.wiki.gg/zh/api.php';
const DEFAULT_PAGE_TITLES = ['\u914d\u65b9', '\u914d\u65b9/\u5de5\u4f5c\u53f0'];
const generatedAt = new Date().toISOString();
const dateTag = generatedAt.slice(0, 10);
const VERSION_TITLES = new Set([
  '\u7535\u8111\u7248',
  '\u4e3b\u673a\u7248',
  '\u79fb\u52a8\u7248',
  '\u524d\u4ee3\u4e3b\u673a\u7248',
  '\u4efb\u5929\u58023DS\u7248'
]);

const options = resolveOptions(parseCliArgs(process.argv.slice(2)));
const crawlResult = await crawlPages(options);

const payload = {
  entity: 'wiki_zh_recipe_pages',
  generatedAt,
  sourceApi: ZH_WIKI_API_URL,
  requestedPages: options.pageTitles,
  expandChildPages: options.expandChildPages,
  maxDepth: options.maxDepth,
  summary: buildSummary(crawlResult.records),
  records: crawlResult.records
};

writeJson(options.outputJsonPath, payload);
ensureDir(path.dirname(options.outputMdPath));
fs.writeFileSync(options.outputMdPath, buildMarkdownReport(payload), 'utf8');

console.log(JSON.stringify({
  outputJsonPath: options.outputJsonPath,
  outputMdPath: options.outputMdPath,
  requestedPages: options.pageTitles,
  crawledPages: payload.summary.crawledPages,
  recipePages: payload.summary.recipePages,
  recipeTableCount: payload.summary.recipeTableCount,
  recipeRowCount: payload.summary.recipeRowCount
}, null, 2));

function resolveOptions(rawOptions) {
  const pageTitles = dedupeStrings(
    String(rawOptions.pages ?? rawOptions.pageTitles ?? DEFAULT_PAGE_TITLES.join(','))
      .split(',')
      .map((value) => normalizeText(value))
      .filter(Boolean)
  );

  return {
    pageTitles,
    expandChildPages: booleanOption(rawOptions['expand-child-pages'] ?? rawOptions.expandChildPages, true),
    maxDepth: numericOption(rawOptions['max-depth'] ?? rawOptions.maxDepth, 1),
    outputJsonPath: path.resolve(rawOptions.output ?? path.join(repoRoot, 'data', 'generated', 'wiki-zh-recipe-pages.latest.json')),
    outputMdPath: path.resolve(rawOptions['md-output'] ?? path.join(repoRoot, 'reports', `wiki-zh-recipe-pages-${dateTag}.md`))
  };
}

async function crawlPages(options) {
  const queue = options.pageTitles.map((pageTitle, index) => ({
    pageTitle,
    depth: 0,
    requested: true,
    discoveredFrom: null,
    discoveryIndex: index
  }));
  const visited = new Set();
  const records = [];

  while (queue.length > 0) {
    const task = queue.shift();
    if (!task?.pageTitle) {
      continue;
    }

    const dedupeKey = normalizeLookupKey(task.pageTitle);
    if (!dedupeKey || visited.has(dedupeKey)) {
      continue;
    }
    visited.add(dedupeKey);

    const record = await fetchPageRecord(task.pageTitle, {
      depth: task.depth,
      requested: task.requested,
      discoveredFrom: task.discoveredFrom,
      includeSections: task.depth === 0
    });
    records.push(record);

    if (!options.expandChildPages || task.depth >= options.maxDepth) {
      continue;
    }

    for (const [childIndex, childPage] of record.childPages.entries()) {
      queue.push({
        pageTitle: childPage.pageTitle,
        depth: task.depth + 1,
        requested: false,
        discoveredFrom: record.pageTitle,
        discoveryIndex: childIndex
      });
    }
  }

  return {
    records
  };
}

async function fetchPageRecord(pageTitle, context = {}) {
  const payload = await fetchWikiPagePayload({
    pageTitle,
    apiUrl: ZH_WIKI_API_URL
  });
  const sections = context.includeSections
    ? await fetchWikiPageSections({
      pageTitle: payload.pageTitle,
      apiUrl: ZH_WIKI_API_URL
    })
    : [];
  const childPages = extractAjaxSourcePagesFromHtml(payload.html);
  const recipeTables = parseRecipeTablesFromHtml(payload.html);

  return {
    requestedPageTitle: pageTitle,
    pageTitle: payload.pageTitle,
    crawlDepth: Number(context.depth ?? 0),
    requested: Boolean(context.requested),
    discoveredFrom: context.discoveredFrom ?? null,
    pageId: payload.pageId,
    revisionTimestamp: payload.revisionTimestamp,
    fetchedAt: payload.fetchedAt,
    sourceUrl: buildWikiPageUrl({ pageTitle: payload.pageTitle, lang: 'zh' }),
    introParagraphs: extractIntroParagraphs(payload.html),
    sections: sections.map((section) => ({
      level: Number(section.level ?? 0),
      number: normalizeText(section.number),
      line: normalizeText(section.line),
      anchor: normalizeText(section.anchor)
    })),
    childPages,
    childPageCount: childPages.length,
    recipeTableCount: recipeTables.length,
    recipeRowCount: recipeTables.reduce((sum, table) => sum + table.rowCount, 0),
    recipeTables
  };
}

function buildSummary(records) {
  const allRecords = Array.isArray(records) ? records : [];
  return {
    crawledPages: allRecords.length,
    requestedPages: allRecords.filter((record) => record.requested).length,
    discoveredPages: allRecords.filter((record) => !record.requested).length,
    recipePages: allRecords.filter((record) => Number(record.recipeRowCount ?? 0) > 0).length,
    childPageLinksDiscovered: allRecords.reduce((sum, record) => sum + Number(record.childPageCount ?? 0), 0),
    recipeTableCount: allRecords.reduce((sum, record) => sum + Number(record.recipeTableCount ?? 0), 0),
    recipeRowCount: allRecords.reduce((sum, record) => sum + Number(record.recipeRowCount ?? 0), 0)
  };
}

function extractAjaxSourcePagesFromHtml(html) {
  const pageTitles = dedupeStrings(
    [...String(html ?? '').matchAll(/data-ajax-source-page="([^"]+)"/g)]
      .map((match) => normalizeText(decodeHtmlEntities(match[1])))
      .filter(Boolean)
  );

  return pageTitles.map((pageTitle) => ({
    pageTitle,
    pageUrl: buildWikiPageUrl({ pageTitle, lang: 'zh' })
  }));
}

function parseRecipeTablesFromHtml(html) {
  const tables = [...String(html ?? '').matchAll(/<table[^>]*class="[^"]*recipes[^"]*"[\s\S]*?<\/table>/gi)].map((match) => match[0]);

  return tables.map((tableHtml, tableIndex) => {
    const captionHtml = tableHtml.match(/<caption>([\s\S]*?)<\/caption>/i)?.[1] ?? '';
    const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1);
    const parsedRows = [];
    let previousResultState = null;

    for (const [rowIndex, rowMatch] of rows.entries()) {
      const parsedRow = parseRecipeRow(rowMatch[1], rowIndex, previousResultState);
      if (!parsedRow) {
        continue;
      }
      previousResultState = {
        resultName: parsedRow.resultName,
        resultQuantity: parsedRow.resultQuantity,
        versionScope: parsedRow.versionScope
      };
      parsedRows.push(parsedRow);
    }

    return {
      tableIndex,
      caption: normalizeText(stripHtml(captionHtml)),
      stations: extractLinkedTitlesFromHtml(captionHtml),
      rowCount: parsedRows.length,
      rows: parsedRows
    };
  });
}

function parseRecipeRow(rowHtml, rowIndex, previousResultState) {
  const resultCell = extractHtmlCellByClass(rowHtml, 'result');
  const ingredientsCell = extractHtmlCellByClass(rowHtml, 'ingredients');
  if (!ingredientsCell) {
    return null;
  }

  const resultLinks = resultCell ? extractLinkedTitlesFromHtml(resultCell, { excludeVersionTitles: true }) : [];
  const resultName = resultLinks[0] ?? extractLabelText(resultCell) ?? previousResultState?.resultName ?? null;
  if (!resultName) {
    return null;
  }

  const resultQuantity = parseAmount(extractAmountText(resultCell)) ?? previousResultState?.resultQuantity ?? 1;
  const versionScope = extractVersionScope(resultCell)
    ?? previousResultState?.versionScope
    ?? null;

  const ingredientChunks = [...ingredientsCell.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => match[1]);
  const normalizedIngredientChunks = ingredientChunks.length > 0 ? ingredientChunks : [ingredientsCell];
  const ingredients = normalizedIngredientChunks
    .map((chunk, ingredientIndex) => parseIngredientChunk(chunk, ingredientIndex))
    .filter(Boolean);

  return {
    rowIndex,
    resultName,
    resultQuantity,
    versionScope,
    ingredients,
    ingredientsText: ingredients.map((ingredient) => ingredient.text).join(' + ')
  };
}

function parseIngredientChunk(chunkHtml, ingredientIndex) {
  const linkedTitles = extractLinkedTitlesFromHtml(chunkHtml, { excludeVersionTitles: true });
  const quantity = parseAmount(extractAmountText(chunkHtml));
  const text = linkedTitles[0] ?? extractLabelText(chunkHtml);
  if (!text) {
    return null;
  }

  return {
    ingredientIndex,
    text: quantity && quantity !== 1 ? `${text} x${quantity}` : text,
    quantity,
    linkedTitles
  };
}

function extractHtmlCellByClass(rowHtml, className) {
  const pattern = new RegExp(`<t[dh]\\b[^>]*class="[^"]*${escapeRegExp(className)}[^"]*"[^>]*>([\\s\\S]*?)<\\/t[dh]>`, 'i');
  return rowHtml.match(pattern)?.[1] ?? null;
}

function extractLinkedTitlesFromHtml(html, options = {}) {
  const excludeVersionTitles = Boolean(options.excludeVersionTitles);
  return dedupeStrings(
    [...String(html ?? '').matchAll(/<a\b[^>]*title="([^"]+)"/gi)]
      .map((match) => normalizeText(decodeHtmlEntities(match[1])))
      .filter((title) => {
        if (!title) {
          return false;
        }
        if (title.startsWith('\u6587\u4ef6:') || title.startsWith('\u5206\u7c7b:')) {
          return false;
        }
        if (excludeVersionTitles && VERSION_TITLES.has(title)) {
          return false;
        }
        return true;
      })
  );
}

function extractVersionScope(html) {
  const versionTitles = dedupeStrings(
    [...String(html ?? '').matchAll(/<a\b[^>]*title="([^"]+)"/gi)]
      .map((match) => normalizeText(decodeHtmlEntities(match[1])))
      .filter((title) => title && VERSION_TITLES.has(title))
  );
  if (versionTitles.length > 0) {
    return `${versionTitles.join(' ')} only`;
  }

  const noteText = normalizeText(stripHtml(String(html ?? '').match(/<div class="version-note[^"]*">([\s\S]*?)<\/div>/i)?.[1] ?? ''));
  if (!noteText || noteText === '\u4ec5\u9650 \uff1a' || noteText === '\u4ec5\u9650\uff1a') {
    return null;
  }
  return noteText;
}

function extractAmountText(html) {
  const source = String(html ?? '');
  return normalizeText(stripHtml(source.match(/<span class="am">([\s\S]*?)<\/span>/i)?.[1] ?? ''));
}

function extractLabelText(html) {
  return normalizeText(stripHtml(
    String(html ?? '')
      .replace(/<span class="am">[\s\S]*?<\/span>/gi, ' ')
      .replace(/<div class="version-note[^"]*">[\s\S]*?<\/div>/gi, ' ')
  ));
}

function parseAmount(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  const match = text.match(/^(\d+)$/);
  return match ? Number(match[1]) : null;
}

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function numericOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = decodeHtmlEntities(value)
    .replace(/\s+/g, ' ')
    .trim();

  return normalized === '' ? null : normalized;
}

function normalizeLookupKey(value) {
  const text = normalizeText(value);
  return text ? text.toLowerCase() : '';
}

function dedupeStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMarkdownReport(payload) {
  const lines = [];
  lines.push('# Terraria Wiki.gg zh recipe crawl summary');
  lines.push('');
  lines.push(`- Generated at: \`${payload.generatedAt}\``);
  lines.push(`- Source API: \`${payload.sourceApi}\``);
  lines.push(`- Requested pages: \`${payload.summary.requestedPages}\``);
  lines.push(`- Crawled pages: \`${payload.summary.crawledPages}\``);
  lines.push(`- Discovered child pages: \`${payload.summary.discoveredPages}\``);
  lines.push(`- Recipe pages: \`${payload.summary.recipePages}\``);
  lines.push(`- Recipe tables: \`${payload.summary.recipeTableCount}\``);
  lines.push(`- Recipe rows: \`${payload.summary.recipeRowCount}\``);
  lines.push(`- JSON output: \`${path.relative(repoRoot, options.outputJsonPath).replaceAll('\\', '/')}\``);
  lines.push('');
  lines.push('## Crawl order');
  lines.push('');

  for (const record of payload.records) {
    const sourceLabel = record.requested ? 'requested' : `discovered from ${record.discoveredFrom}`;
    lines.push(`- \`${record.pageTitle}\` | depth=\`${record.crawlDepth}\` | ${sourceLabel} | childPages=\`${record.childPageCount}\` | recipeRows=\`${record.recipeRowCount}\``);
  }

  lines.push('');

  for (const record of payload.records) {
    lines.push(`## ${record.pageTitle}`);
    lines.push('');
    lines.push(`- Source URL: ${record.sourceUrl}`);
    lines.push(`- Page ID: \`${record.pageId}\``);
    lines.push(`- Revision timestamp: \`${record.revisionTimestamp ?? 'unknown'}\``);
    lines.push(`- Crawl depth: \`${record.crawlDepth}\``);
    lines.push(`- Requested: \`${record.requested}\``);
    if (record.discoveredFrom) {
      lines.push(`- Discovered from: \`${record.discoveredFrom}\``);
    }
    lines.push(`- Child pages: \`${record.childPageCount}\``);
    lines.push(`- Recipe tables: \`${record.recipeTableCount}\``);
    lines.push(`- Recipe rows: \`${record.recipeRowCount}\``);
    lines.push('');

    if (record.introParagraphs.length > 0) {
      lines.push('### Intro');
      lines.push('');
      for (const paragraph of record.introParagraphs) {
        lines.push(`- ${paragraph}`);
      }
      lines.push('');
    }

    if (record.sections.length > 0) {
      lines.push('### Sections');
      lines.push('');
      for (const section of record.sections) {
        const indent = '  '.repeat(Math.max(0, section.level - 2));
        const sectionLabel = [section.number, section.line].filter(Boolean).join(' ');
        lines.push(`${indent}- ${sectionLabel}`);
      }
      lines.push('');
    }

    if (record.childPages.length > 0) {
      lines.push('### Child pages');
      lines.push('');
      for (const childPage of record.childPages) {
        lines.push(`- [${childPage.pageTitle}](${childPage.pageUrl})`);
      }
      lines.push('');
    }

    if (record.recipeTables.length > 0) {
      lines.push('### Recipe tables');
      lines.push('');
      for (const table of record.recipeTables) {
        lines.push(`#### ${table.caption ?? `Table ${table.tableIndex + 1}`}`);
        lines.push('');
        lines.push(`- Stations: ${table.stations.length > 0 ? table.stations.map((station) => `\`${station}\``).join(', ') : 'none detected'}`);
        lines.push(`- Rows: \`${table.rowCount}\``);
        lines.push('');

        if (table.rows.length === 0) {
          lines.push('- No parsable recipe rows');
          lines.push('');
          continue;
        }

        for (const row of table.rows) {
          const resultLabel = row.resultQuantity > 1 ? `${row.resultName} x${row.resultQuantity}` : row.resultName;
          const suffix = row.versionScope ? ` | version: ${row.versionScope}` : '';
          lines.push(`${row.rowIndex + 1}. ${resultLabel} <- ${row.ingredientsText}${suffix}`);
        }
        lines.push('');
      }
    }
  }

  return `${lines.join('\n')}\n`;
}
