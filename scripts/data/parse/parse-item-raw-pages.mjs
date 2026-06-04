#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractItemSellStat } from '../maint/item-page-statistics-parser.mjs';
import { extractItemInfoboxImages } from '../lib/wiki-page-utils.mjs';
import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

const DEFAULT_RAW_DIR = '/home/lolben/data/terraPedia/raw/wiki/item-pages';
const DEFAULT_OUTPUT = 'data/generated/item-raw-pages-parsed.latest.json';
const DEFAULT_REPORT = `reports/item-raw-pages-parse-${new Date().toISOString().slice(0, 10)}.json`;
const DEFAULT_PROGRESS_PATH = 'data/generated/wiki-sync-progress.latest.json';
const ACTION_ID = 'item-raw-pages-parse';

export function buildItemRawPageParseProgressPayload({
  status,
  phase,
  message,
  current,
  total,
  batchOffset = 0,
  batchLimit = total,
  overallCurrent = current,
  overallTotal = total,
  progressPath = DEFAULT_PROGRESS_PATH,
  reportPath = DEFAULT_REPORT,
  outputPath = DEFAULT_OUTPUT,
  startedAt,
  nextStep = 'continue parsing local raw item pages',
  now = new Date().toISOString()
} = {}) {
  const generatedAt = typeof now === 'string' ? now : now.toISOString();
  const percent = overallTotal > 0
    ? Math.min(100, Math.max(0, (overallCurrent / overallTotal) * 100))
    : 0;
  return {
    actionId: process.env.TERRAPEDIA_CRAWLER_ACTION_ID || ACTION_ID,
    status,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath,
    phase,
    message,
    current,
    total,
    batchOffset,
    batchLimit,
    overallCurrent,
    overallTotal,
    percent,
    startedAt,
    dataStage: `raw/wiki/item-pages -> ${outputPath}`,
    nextStep,
    reportPath,
    outputPath
  };
}

export function parseItemRawPagePayload(payload, sourceFile = null) {
  const requestedPageTitle = toText(payload?.requestedPageTitle);
  const pageTitle = toText(payload?.pageTitle);
  const itemInternalName = toText(payload?.itemInternalName);
  const itemName = toText(payload?.itemName);
  const html = typeof payload?.html === 'string' ? payload.html : '';
  const wikitext = typeof payload?.wikitext === 'string' ? payload.wikitext : '';
  const recipesMarkup = typeof payload?.recipesMarkup === 'string' ? payload.recipesMarkup : '';
  const isGroupPage = Boolean(requestedPageTitle && pageTitle && normalizeTitle(requestedPageTitle) !== normalizeTitle(pageTitle));
  const rawImages = extractItemInfoboxImages(html).map((image, index) => ({
    fileTitle: toText(image.fileTitle),
    url: toText(image.url),
    width: toNullableNumber(image.width),
    height: toNullableNumber(image.height),
    contentType: toText(image.contentType),
    alt: toText(image.alt),
    title: toText(image.title),
    isPrimary: index === 0,
    sortOrder: index
  }));
  const rawSell = extractItemSellStat(html);
  const sell = {
    sellText: toText(rawSell?.sellText),
    sellValue: toNullableNumber(rawSell?.sellValue)
  };
  const images = isGroupPage ? [] : rawImages;
  const safeSell = isGroupPage ? { sellText: null, sellValue: null } : sell;
  const safetyWarnings = [];
  if (isGroupPage) {
    safetyWarnings.push('page_title_differs_from_requested_title');
    if (rawImages.length > 0) {
      safetyWarnings.push('group_page_images_quarantined');
    }
    if (sell.sellText || sell.sellValue != null) {
      safetyWarnings.push('group_page_sell_quarantined');
    }
  }
  if (!itemInternalName) {
    safetyWarnings.push('missing_item_internal_name');
  }
  if (!html) {
    safetyWarnings.push('missing_html');
  }
  if (!wikitext) {
    safetyWarnings.push('missing_wikitext');
  }

  return {
    itemInternalName,
    itemName,
    requestedPageTitle,
    pageTitle,
    pageId: toNullableNumber(payload?.pageId),
    revisionTimestamp: toText(payload?.revisionTimestamp),
    fetchedAt: toText(payload?.fetchedAt),
    entityType: toText(payload?.entityType),
    sourceFile,
    isGroupPage,
    hasHtml: html.length > 0,
    hasWikitext: wikitext.length > 0,
    sectionCount: Array.isArray(payload?.sections) ? payload.sections.length : 0,
    recipesMarkupLength: recipesMarkup.length,
    recipeStatus: recipesMarkup.length > 0 ? 'markup_present' : 'empty_markup',
    images,
    sell: safeSell,
    groupPageEvidence: isGroupPage ? {
      images: rawImages,
      sell,
      note: 'Requested item resolved to a group/set page; images and sell value are evidence only and must not be imported as item-specific fields.'
    } : null,
    safeDescription: isGroupPage ? null : null,
    safetyWarnings,
    evidence: {
      sourceProvider: 'terraria.wiki.gg',
      sourcePage: pageTitle,
      requestedPageTitle,
      sourceRevisionTimestamp: toText(payload?.revisionTimestamp)
    }
  };
}

export async function runItemRawPagesParse(rawOptions = {}, dependencies = {}) {
  const options = normalizeOptions(rawOptions);
  const readFile = dependencies.readFile ?? fs.promises.readFile;
  const writeJson = dependencies.writeJson ?? writeJsonFile;
  const listFiles = dependencies.listFiles ?? listRawFiles;
  const startedAt = new Date().toISOString();
  const files = await listFiles(options.rawDir);
  const selectedFiles = files.slice(options.offset, options.limit == null ? undefined : options.offset + options.limit);
  const records = [];
  const errors = [];

  writeProgress(writeJson, options.progressPath, buildItemRawPageParseProgressPayload({
    status: 'running',
    phase: 'parse',
    message: 'starting local item raw page parse',
    current: 0,
    total: selectedFiles.length,
    batchOffset: options.offset,
    batchLimit: selectedFiles.length,
    overallCurrent: options.offset,
    overallTotal: files.length,
    progressPath: options.progressPath,
    reportPath: options.report,
    outputPath: options.output,
    startedAt
  }));

  for (let index = 0; index < selectedFiles.length; index += 1) {
    const fileName = selectedFiles[index];
    const absolutePath = path.join(options.rawDir, fileName);
    try {
      const payload = JSON.parse(await readFile(absolutePath, 'utf8'));
      records.push(parseItemRawPagePayload(payload, fileName));
    } catch (error) {
      errors.push({
        sourceFile: fileName,
        message: error?.message ?? String(error)
      });
    }

    const current = index + 1;
    if (current % options.batchSize === 0 || current === selectedFiles.length) {
      writeProgress(writeJson, options.progressPath, buildItemRawPageParseProgressPayload({
        status: 'running',
        phase: 'parse',
        message: `parsed local item raw pages ${current}/${selectedFiles.length}`,
        current,
        total: selectedFiles.length,
        batchOffset: options.offset,
        batchLimit: selectedFiles.length,
        overallCurrent: options.offset + current,
        overallTotal: files.length,
        progressPath: options.progressPath,
        reportPath: options.report,
        outputPath: options.output,
        startedAt
      }));
    }
  }

  const summary = buildSummary({ files, selectedFiles, records, errors, options });
  const output = {
    entity: 'item_raw_pages_parsed',
    generatedAt: new Date().toISOString(),
    sourceRawDir: options.rawDir,
    summary,
    records,
    errors
  };
  const report = {
    generatedAt: output.generatedAt,
    sourceRawDir: options.rawDir,
    outputPath: options.output,
    summary,
    errors,
    samples: records.slice(0, 20)
  };

  writeJson(path.resolve(options.output), output);
  writeJson(path.resolve(options.report), report);
  writeProgress(writeJson, options.progressPath, buildItemRawPageParseProgressPayload({
    status: errors.length > 0 ? 'failed' : 'completed',
    phase: 'write',
    message: errors.length > 0
      ? `finished item raw page parse with ${errors.length} error(s)`
      : 'finished item raw page parse',
    current: selectedFiles.length,
    total: selectedFiles.length,
    batchOffset: options.offset,
    batchLimit: selectedFiles.length,
    overallCurrent: options.offset + selectedFiles.length,
    overallTotal: files.length,
    progressPath: options.progressPath,
    reportPath: options.report,
    outputPath: options.output,
    startedAt,
    nextStep: errors.length > 0
      ? 'inspect parse errors and rerun failed local item raw pages'
      : 'dry-run item page maint sync'
  }));

  if (errors.length > 0 && options.failOnError) {
    throw new Error(`Item raw page parse failed for ${errors.length} file(s)`);
  }
  return summary;
}

function buildSummary({ files, selectedFiles, records, errors, options }) {
  return {
    totalRawPages: files.length,
    selectedRawPages: selectedFiles.length,
    offset: options.offset,
    limit: options.limit,
    parsedCount: records.length,
    errorCount: errors.length,
    groupPageCount: records.filter((record) => record.isGroupPage).length,
    emptyRecipesMarkupCount: records.filter((record) => record.recipesMarkupLength === 0).length,
    imageCandidateCount: records.reduce((sum, record) => sum + record.images.length, 0),
    sellStatCount: records.filter((record) => record.sell.sellText || record.sell.sellValue != null).length,
    missingInternalNameCount: records.filter((record) => !record.itemInternalName).length,
    missingHtmlCount: records.filter((record) => !record.hasHtml).length,
    missingWikitextCount: records.filter((record) => !record.hasWikitext).length
  };
}

async function listRawFiles(rawDir) {
  return (await fs.promises.readdir(rawDir))
    .filter((name) => name.endsWith('.latest.json'))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeOptions(rawOptions = {}) {
  return {
    rawDir: path.resolve(rawOptions.rawDir ?? rawOptions['raw-dir'] ?? DEFAULT_RAW_DIR),
    output: rawOptions.output ?? DEFAULT_OUTPUT,
    report: rawOptions.report ?? rawOptions['report-path'] ?? DEFAULT_REPORT,
    progressPath: rawOptions.progressPath ?? rawOptions['progress-path'] ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? DEFAULT_PROGRESS_PATH,
    batchSize: Math.max(1, Number(rawOptions.batchSize ?? rawOptions['batch-size'] ?? 250)),
    offset: Math.max(0, Number(rawOptions.offset ?? 0)),
    limit: rawOptions.limit == null ? null : Math.max(0, Number(rawOptions.limit)),
    failOnError: booleanOption(rawOptions.failOnError ?? rawOptions['fail-on-error'], false)
  };
}

function writeProgress(writeJson, progressPath, payload) {
  writeJson(path.resolve(progressPath), payload);
}

function parseArgs(argv) {
  const out = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) out[body.slice(0, index)] = body.slice(index + 1);
    else out[body] = 'true';
  }
  return out;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  if (value === true || value === false) return value;
  return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTitle(value) {
  return String(value ?? '').trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

function isDirectExecution() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectExecution()) {
  runItemRawPagesParse(parseArgs(process.argv.slice(2))).then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  }).catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
