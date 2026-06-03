#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensureDir,
  fetchWikiApiJson,
  fetchWikiImageInfo,
  parseCliArgs,
  sharedDataPath,
  shouldKeepSnapshot,
  writeJson
} from '../lib/wiki-item-utils.mjs';
import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

const __filename = fileURLToPath(import.meta.url);
const defaultProgressPath = 'data/generated/wiki-sync-progress.latest.json';
const defaultActionId = 'armor-set-images';

export function buildArmorSetImageProgressPayload({
  status,
  current,
  total,
  message,
  progressPath = defaultProgressPath,
  outputPath = null,
  reportPath = null,
  startedAt,
  now = new Date().toISOString()
} = {}) {
  const generatedAt = typeof now === 'string' ? now : now.toISOString();
  const payload = {
    actionId: process.env.TERRAPEDIA_CRAWLER_ACTION_ID || defaultActionId,
    status,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath,
    phase: 'fetch',
    message,
    current,
    total,
    percent: total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0,
    startedAt
  };
  if (outputPath) {
    payload.outputPath = outputPath;
  }
  if (reportPath) {
    payload.reportPath = reportPath;
  }
  return payload;
}

function writeProgress(progressPath, payload) {
  writeJsonFile(path.resolve(process.cwd(), progressPath), payload);
}

function nullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function stripFilePrefix(value) {
  return String(value ?? '').trim().replace(/^File:/i, '');
}

function normalizeTitleForMatch(value) {
  return stripFilePrefix(value)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitPascalCase(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deriveArmorSetPageTitle(record = {}) {
  const explicit = nullableString(record.pageTitle ?? record.page_title);
  if (explicit) {
    return explicit;
  }

  const textKey = nullableString(record.textKey ?? record.text_key);
  if (!textKey) {
    return null;
  }
  if (/\barmor$/i.test(textKey)) {
    return textKey;
  }
  const lastSegment = textKey.includes('.') ? textKey.slice(textKey.lastIndexOf('.') + 1) : textKey;
  const displayName = splitPascalCase(lastSegment);
  return displayName ? `${displayName} armor` : null;
}

export function classifyArmorSetImage({ fileTitle, pageTitle } = {}) {
  const title = normalizeTitleForMatch(fileTitle);
  const page = normalizeTitleForMatch(pageTitle);
  const pagePrefix = page.replace(/\s+armor$/, '');
  if (!title) {
    return 'other';
  }
  if (/\b(old|pre|legacy|console|mobile|3ds)\b/.test(title)) {
    return 'other';
  }
  if (/\bfemale\b/.test(title)) {
    return 'female';
  }
  if (/\bdemo\b|\banimation\b/.test(title) || /\(demo\)/i.test(String(fileTitle ?? ''))) {
    return 'demo';
  }

  const partWords = /\b(helmet|headgear|mask|hat|hood|breastplate|chestplate|shirt|robe|greaves|leggings|pants|boots)\b/;
  if (pagePrefix && title.startsWith(pagePrefix) && partWords.test(title)) {
    return 'part';
  }

  if (page && title === page) {
    return 'male';
  }
  if (page && title.startsWith(page) && /\barmor\b/.test(title)) {
    return 'male';
  }
  return 'other';
}

function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sortImageTitle(left, right) {
  const roleOrder = new Map([
    ['male', 0],
    ['female', 1],
    ['demo', 2],
    ['part', 3],
    ['other', 4]
  ]);
  return (roleOrder.get(left.role) ?? 99) - (roleOrder.get(right.role) ?? 99)
    || left.fileTitle.localeCompare(right.fileTitle);
}

export function buildArmorSetImageRows({
  armorSets = [],
  pageImageTitlesByPageTitle = new Map(),
  imageInfoByFileTitle = new Map()
} = {}) {
  const rows = [];

  for (const armorSet of armorSets) {
    const textKey = nullableString(armorSet.textKey ?? armorSet.text_key);
    const pageTitle = deriveArmorSetPageTitle(armorSet);
    if (!textKey || !pageTitle) {
      continue;
    }

    const imageTitles = pageImageTitlesByPageTitle.get(pageTitle) ?? [];
    const classified = imageTitles
      .map((fileTitle) => ({
        fileTitle: stripFilePrefix(fileTitle),
        role: classifyArmorSetImage({ fileTitle, pageTitle })
      }))
      .filter((entry) => entry.role !== 'other')
      .sort(sortImageTitle);

    for (let index = 0; index < classified.length; index += 1) {
      const entry = classified[index];
      const info = imageInfoByFileTitle.get(entry.fileTitle)
        ?? imageInfoByFileTitle.get(`File:${entry.fileTitle}`)
        ?? {};
      rows.push({
        textKey,
        pageTitle,
        imageRole: entry.role,
        sourceFileTitle: entry.fileTitle,
        originalUrl: nullableString(info.url),
        cachedUrl: null,
        width: toPositiveNumber(info.width),
        height: toPositiveNumber(info.height),
        contentType: nullableString(info.mime),
        isPrimary: entry.role === 'male' && !rows.some((row) => row.textKey === textKey && row.imageRole === 'male'),
        sortOrder: index,
        sourceRevisionTimestamp: null,
        raw: {
          imageInfo: info
        }
      });
    }
  }

  return rows;
}

function readArmorSets(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(payload.records)) {
    return payload.records;
  }
  if (Array.isArray(payload.armorSets)) {
    return payload.armorSets;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return [];
}

function defaultArmorSetInputPath() {
  const candidates = [
    sharedDataPath('standardized', 'armor_sets.standardized.json'),
    path.resolve(process.cwd(), 'data', 'standardized', 'armor_sets.standardized.json')
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

async function fetchPageImageTitles({ pageTitle, apiUrl }) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', pageTitle);
  url.searchParams.set('prop', 'images');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  const payload = await fetchWikiApiJson({
    url,
    profile: 'parse',
    sourceKey: pageTitle
  });
  return Array.isArray(payload?.parse?.images) ? payload.parse.images : [];
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apiUrl = String(options['api-url'] ?? 'https://terraria.wiki.gg/api.php');
  const inputPath = path.resolve(
    process.cwd(),
    options.input ?? defaultArmorSetInputPath()
  );
  const rawDir = path.resolve(process.cwd(), options['raw-dir'] ?? sharedDataPath('raw', 'wiki'));
  const reportDir = path.resolve(process.cwd(), options['report-dir'] ?? sharedDataPath('reports', 'fetch'));
  const limit = Number(options.limit ?? 0);
  const keepSnapshot = shouldKeepSnapshot(options);
  const progressPath = String(options['progress-path'] ?? process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? defaultProgressPath);
  const startedAt = new Date().toISOString();

  ensureDir(rawDir);
  ensureDir(reportDir);
  const latestParsedPath = path.join(rawDir, 'armor_set_images.parsed.latest.json');
  const reportPathPreview = path.join(reportDir, 'fetch-armor-set-images.latest.json');

  const armorSets = readArmorSets(inputPath)
    .filter((record) => deriveArmorSetPageTitle(record))
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined);

  writeProgress(progressPath, buildArmorSetImageProgressPayload({
    status: 'running',
    current: 0,
    total: armorSets.length,
    message: 'starting armor set image fetch',
    progressPath,
    outputPath: latestParsedPath,
    reportPath: reportPathPreview,
    startedAt
  }));

  const pageImageTitlesByPageTitle = new Map();
  const imageInfoByFileTitle = new Map();
  const warnings = [];

  for (let index = 0; index < armorSets.length; index += 1) {
    const armorSet = armorSets[index];
    const pageTitle = deriveArmorSetPageTitle(armorSet);
    try {
      const imageTitles = await fetchPageImageTitles({ pageTitle, apiUrl });
      pageImageTitlesByPageTitle.set(pageTitle, imageTitles);

      for (const fileTitle of imageTitles) {
        const role = classifyArmorSetImage({ fileTitle, pageTitle });
        if (role === 'other') {
          continue;
        }
        const normalizedFileTitle = stripFilePrefix(fileTitle);
        if (imageInfoByFileTitle.has(normalizedFileTitle)) {
          continue;
        }
        const imageInfo = await fetchWikiImageInfo({ fileTitle: normalizedFileTitle, apiUrl });
        if (imageInfo) {
          imageInfoByFileTitle.set(normalizedFileTitle, imageInfo);
        }
      }
    } catch (error) {
      warnings.push({
        pageTitle,
        message: error instanceof Error ? error.message : String(error)
      });
    }
    writeProgress(progressPath, buildArmorSetImageProgressPayload({
      status: 'running',
      current: index + 1,
      total: armorSets.length,
      message: `fetched armor set image sources ${index + 1}/${armorSets.length}`,
      progressPath,
      outputPath: latestParsedPath,
      reportPath: reportPathPreview,
      startedAt
    }));
  }

  const armorSetImages = buildArmorSetImageRows({
    armorSets,
    pageImageTitlesByPageTitle,
    imageInfoByFileTitle
  });
  const fetchedAt = new Date().toISOString();
  const timestamp = fetchedAt.replaceAll(':', '-');
  const parsedPayload = {
    source: 'terraria.wiki.gg:armor-set-pages:imageinfo',
    sourceApi: apiUrl,
    sourcePageTitle: 'Armor set pages',
    sourceRevisionTimestamp: null,
    fetchedAt,
    totalArmorSets: armorSets.length,
    totalArmorSetImages: armorSetImages.length,
    armorSetImages,
    warnings
  };

  const snapshotParsedPath = path.join(rawDir, `armor_set_images.parsed.${timestamp}.json`);
  const reportPath = path.join(reportDir, `fetch-armor-set-images-${timestamp}.json`);
  writeJson(latestParsedPath, parsedPayload);
  if (keepSnapshot) {
    writeJson(snapshotParsedPath, parsedPayload);
  }
  writeJson(reportPath, {
    inputPath,
    latestParsedPath,
    snapshotParsedPath: keepSnapshot ? snapshotParsedPath : null,
    totalArmorSets: armorSets.length,
    totalArmorSetImages: armorSetImages.length,
    warningCount: warnings.length,
    samples: armorSetImages.slice(0, 10)
  });
  writeProgress(progressPath, buildArmorSetImageProgressPayload({
    status: 'completed',
    current: armorSets.length,
    total: armorSets.length,
    message: `finished armor set image fetch; images=${armorSetImages.length}; warnings=${warnings.length}`,
    progressPath,
    outputPath: latestParsedPath,
    reportPath,
    startedAt
  }));

  console.log(`Armor sets: ${armorSets.length}`);
  console.log(`Armor set images: ${armorSetImages.length}`);
  console.log(`Latest parsed JSON: ${latestParsedPath}`);
  console.log(`Report: ${reportPath}`);
  if (warnings.length > 0) {
    console.warn(`Warnings: ${warnings.length}`);
  }
}

if (process.argv[1] && __filename === path.resolve(process.argv[1])) {
  await main();
}
