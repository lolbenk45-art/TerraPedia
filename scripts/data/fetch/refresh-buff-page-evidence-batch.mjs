#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fetchWikiPagePayload,
  parseCliArgs,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { parseBuffPageEvidence } from './buff-immunity-page-parser.mjs';
import { applyBuffPageEvidenceToStandardizedPayload } from './refresh-target-buff-page-evidence.mjs';

const repoRoot = getProjectRoot();
const CATEGORY_NAMES = [
  'fetched',
  'cache_hit',
  'redirected',
  'missing_page',
  'parse_incomplete',
  'fetch_failed',
  'not_modified',
  'patched',
  'skipped_existing'
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function booleanOption(value, fallback = false) {
  if (value == null) return fallback;
  if (value === true || value === false) return value;
  return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
}

function csvSet(value, mapper = (entry) => entry) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  return new Set(value.split(',').map((entry) => mapper(entry.trim())).filter((entry) => entry != null && entry !== ''));
}

function resolvePath(value, fallback) {
  return path.resolve(process.cwd(), value ?? fallback);
}

function pickBuffPageTitle(record) {
  return firstNonEmptyText(
    record?.localized?.en?.page,
    record?.localized?.en?.title,
    record?.englishName,
    record?.localized?.zh?.page,
    record?.localized?.zh?.title,
    record?.internalName
  );
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return null;
}

function safeCacheSegment(value, fallback = 'buff') {
  const text = String(value ?? fallback)
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return text || fallback;
}

function cachePathForRecord(cacheDir, record) {
  const canonicalPageTitle = record?.sourceEvidence?.canonicalPageTitle ?? record?.sourceEvidence?.pageTitle ?? null;
  const revisionId = toNullableInteger(record?.sourceEvidence?.revisionId);
  if (canonicalPageTitle && revisionId != null) {
    return path.join(cacheDir, `${safeCacheSegment(canonicalPageTitle)}__${revisionId}.json`);
  }
  const internalName = safeCacheSegment(record?.internalName ?? record?.id);
  return path.join(cacheDir, `${record.id}-${internalName}.json`);
}

function createCategoryCounts() {
  return Object.fromEntries(CATEGORY_NAMES.map((name) => [name, 0]));
}

function bump(categories, name) {
  if (!(name in categories)) categories[name] = 0;
  categories[name] += 1;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectRecords(records, options) {
  const ids = csvSet(options.ids, (entry) => toNullableInteger(entry));
  const internalNames = csvSet(options['internal-names'] ?? options.internalNames);
  const offset = Math.max(0, toNullableInteger(options.offset) ?? 0);
  const limit = toNullableInteger(options.limit);
  const filtered = records.filter((record) => {
    if (ids && !ids.has(toNullableInteger(record?.id))) return false;
    if (internalNames && !internalNames.has(record?.internalName)) return false;
    return true;
  });
  return filtered.slice(offset, limit == null ? undefined : offset + Math.max(0, limit));
}

function readResumeProgress({ progressPath, readJsonImpl, fileExists }) {
  if (!fileExists(progressPath)) {
    return null;
  }
  try {
    return readJsonImpl(progressPath);
  } catch {
    return null;
  }
}

function resumeSelectedRecords(selectedRecords, progress) {
  if (!progress || progress.status !== 'running') {
    return { records: selectedRecords, resumeFromIndex: 0 };
  }
  const lastBuffId = toNullableInteger(progress.lastBuffId);
  if (lastBuffId == null) {
    return { records: selectedRecords, resumeFromIndex: 0 };
  }
  const lastIndex = selectedRecords.findIndex((record) => toNullableInteger(record?.id) === lastBuffId);
  if (lastIndex < 0) {
    return { records: selectedRecords, resumeFromIndex: 0 };
  }
  return {
    records: selectedRecords.slice(lastIndex + 1),
    resumeFromIndex: lastIndex + 1
  };
}

function hasExistingEvidence(record) {
  if (record?.sourceEvidence?.parseStatus !== 'parsed') return false;
  if (Array.isArray(record?.sourceEvidence?.unresolvedFacts) && record.sourceEvidence.unresolvedFacts.length > 0) {
    return false;
  }
  return true;
}

export async function runRefreshBuffPageEvidenceBatch(rawOptions = {}, dependencies = {}) {
  const inputPath = resolvePath(rawOptions.input, path.join(repoRoot, 'data', 'standardized', 'buffs.standardized.json'));
  const itemsPath = resolvePath(rawOptions.items, path.join(repoRoot, 'data', 'standardized', 'items.standardized.json'));
  const outputPath = resolvePath(rawOptions.output, inputPath);
  const reportPath = resolvePath(
    rawOptions['report-path'] ?? rawOptions.reportPath,
    path.join(repoRoot, 'reports', 'buffs', 'buff-evidence-refresh.latest.json')
  );
  const progressPath = resolvePath(
    rawOptions['progress-path'] ?? rawOptions.progressPath,
    path.join(repoRoot, 'data', 'generated', 'buff-evidence-refresh-progress.latest.json')
  );
  const cacheDir = rawOptions['cache-dir'] || rawOptions.cacheDir
    ? resolvePath(rawOptions['cache-dir'] ?? rawOptions.cacheDir)
    : null;
  const dryRun = booleanOption(rawOptions['dry-run'] ?? rawOptions.dryRun, false);
  const onlyMissing = booleanOption(rawOptions['only-missing'] ?? rawOptions.onlyMissing, false);
  const force = booleanOption(rawOptions.force, false);
  const resume = booleanOption(rawOptions.resume, false);
  const sampleLimit = toNullableInteger(rawOptions['sample-limit'] ?? rawOptions.sampleLimit) ?? 10;
  const requestDelayMs = Math.max(0, toNullableInteger(rawOptions['request-delay-ms'] ?? rawOptions.requestDelayMs) ?? 5000);
  const readJsonImpl = dependencies.readJson ?? readJson;
  const writeJsonImpl = dependencies.writeJson ?? writeJson;
  const fileExists = dependencies.fileExists ?? fs.existsSync;
  const fetchPagePayload = dependencies.fetchPagePayload ?? fetchWikiPagePayload;
  const standardizedPayload = readJsonImpl(inputPath);
  const itemPayload = readJsonImpl(itemsPath);
  const initialSelectedRecords = selectRecords(standardizedPayload.records ?? [], rawOptions);
  const resumeProgress = resume
    ? readResumeProgress({ progressPath, readJsonImpl, fileExists })
    : null;
  const { records: selectedRecords, resumeFromIndex } = resumeSelectedRecords(initialSelectedRecords, resumeProgress);
  const categories = createCategoryCounts();
  const entries = [];
  let patchedPayload = standardizedPayload;
  const startedAt = new Date().toISOString();

  writeJsonImpl(progressPath, {
    status: 'running',
    current: resumeFromIndex,
    total: initialSelectedRecords.length,
    startedAt
  });

  for (let index = 0; index < selectedRecords.length; index += 1) {
    const record = selectedRecords[index];
    const entry = {
      buffId: record.id,
      internalName: record.internalName,
      pageTitle: pickBuffPageTitle(record),
      categories: []
    };

    if (onlyMissing && !force && hasExistingEvidence(record)) {
      bump(categories, 'skipped_existing');
      entry.categories.push('skipped_existing');
      entries.push(entry);
      continue;
    }

    try {
      let pagePayload = null;
      const cachePath = cacheDir ? cachePathForRecord(cacheDir, record) : null;
	      if (cachePath && fileExists(cachePath)) {
        pagePayload = readJsonImpl(cachePath);
        bump(categories, 'cache_hit');
        entry.categories.push('cache_hit');
      } else {
        if (index > 0 && requestDelayMs > 0) {
          await sleep(requestDelayMs);
        }
        pagePayload = await fetchPagePayload({ pageTitle: entry.pageTitle });
        bump(categories, 'fetched');
        entry.categories.push('fetched');
        if (cachePath && !dryRun) {
	          writeJsonImpl(cachePath, pagePayload);
	        }
      }
      const resolvedPageTitle = pagePayload.canonicalPageTitle ?? pagePayload.pageTitle ?? entry.pageTitle;
      if (resolvedPageTitle && entry.pageTitle && resolvedPageTitle !== entry.pageTitle) {
        bump(categories, 'redirected');
        entry.categories.push('redirected');
        entry.resolvedPageTitle = resolvedPageTitle;
      }

      const evidence = parseBuffPageEvidence({
        buffId: toNullableInteger(record.id),
        buffName: record.englishName ?? record.internalName,
        pageTitle: pagePayload.pageTitle ?? entry.pageTitle,
        canonicalPageTitle: pagePayload.canonicalPageTitle ?? pagePayload.pageTitle ?? entry.pageTitle,
        revisionId: pagePayload.revisionId ?? null,
        revisionTimestamp: pagePayload.revisionTimestamp ?? null,
        html: pagePayload.html,
        wikitext: pagePayload.wikitext,
        sections: pagePayload.sections,
        sampleLimit
      });
      if (evidence.sourceEvidence?.parseStatus !== 'parsed') {
        bump(categories, 'parse_incomplete');
        entry.categories.push('parse_incomplete');
        entry.unresolvedFacts = evidence.sourceEvidence?.unresolvedFacts ?? [];
      }
      patchedPayload = applyBuffPageEvidenceToStandardizedPayload({
        standardizedPayload: patchedPayload,
        evidence,
        itemRecords: itemPayload.records ?? [],
        buffId: toNullableInteger(record.id),
        internalName: record.internalName
      });
      if (hasExistingEvidence(record) && JSON.stringify(patchedPayload.records.find((row) => row.id === record.id)) === JSON.stringify(record)) {
        bump(categories, 'not_modified');
        entry.categories.push('not_modified');
      } else {
        bump(categories, 'patched');
        entry.categories.push('patched');
      }
    } catch (error) {
      const message = error?.message ?? String(error);
      const category = /missing|not found/i.test(message) ? 'missing_page' : 'fetch_failed';
      bump(categories, category);
      entry.categories.push(category);
      entry.error = message;
    }

    entries.push(entry);
    writeJsonImpl(progressPath, {
      status: 'running',
	      current: resumeFromIndex + index + 1,
	      total: initialSelectedRecords.length,
      startedAt,
      lastBuffId: record.id
    });
  }

  if (!dryRun) {
    writeJsonImpl(outputPath, patchedPayload);
  }

	  const summary = {
    dryRun,
    inputPath,
    outputPath,
    reportPath,
	    totalSelected: selectedRecords.length,
	    totalInitialSelected: initialSelectedRecords.length,
	    resumeFromIndex,
    categories
  };
  const report = {
    ...summary,
    generatedAt: new Date().toISOString(),
    entries
  };
  writeJsonImpl(reportPath, report);
  writeJsonImpl(progressPath, {
    status: 'completed',
    current: initialSelectedRecords.length,
    total: initialSelectedRecords.length,
    startedAt,
    reportPath,
    outputPath: dryRun ? null : outputPath
  });
  return summary;
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectExecution()) {
  runRefreshBuffPageEvidenceBatch(parseCliArgs(process.argv.slice(2))).then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  }).catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
