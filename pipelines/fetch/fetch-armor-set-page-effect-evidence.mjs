#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  fetchWikiPagePayload,
  parseCliArgs,
  writeJson,
} from '../lib/wiki-item-utils.mjs';
import { parseWikiArmorSetRows } from './fetch-wiki-armor-sets.mjs';
import { attachArmorSetPageEffectEvidence, buildArmorSetPageEffectEvidence } from './armor-set-page-effect-evidence.mjs';

function readJson(filePath, datasetType = null) {
  const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  if (payload?.payload_json) return JSON.parse(payload.payload_json);
  const landing = payload?.incomingLandingRows?.find((row) => row.dataset_type === datasetType);
  if (landing?.payload_json) return JSON.parse(landing.payload_json);
  return payload;
}

function requiredPath(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return path.resolve(value);
}

const options = parseCliArgs(process.argv.slice(2));
const moduleInput = requiredPath(options.module, 'module input');
const imageInput = requiredPath(options.images, 'image input');
const output = requiredPath(options.output, 'output');
const checkpoint = options.checkpoint ? requiredPath(options.checkpoint) : null;
const apiUrl = String(options['api-url'] ?? 'https://terraria.wiki.gg/zh/api.php');
const modulePayload = readJson(moduleInput, 'armor_sets_raw');
const imagePayload = readJson(imageInput, 'armor_set_images_raw');
const pageTitles = [...new Set(imagePayload.armorSetImages.map((row) => row.pageTitle))].sort();
const checkpointPayload = checkpoint && fs.existsSync(checkpoint) ? readJson(checkpoint) : null;
const pagePayloads = checkpointPayload?.pagePayloads && typeof checkpointPayload.pagePayloads === 'object'
  ? { ...checkpointPayload.pagePayloads } : {};

for (const [index, pageTitle] of pageTitles.entries()) {
  if (pagePayloads[pageTitle]) {
    process.stderr.write(`using checkpoint ${index + 1}/${pageTitles.length}: ${pageTitle}\n`);
    continue;
  }
  process.stderr.write(`fetching armor set page evidence ${index + 1}/${pageTitles.length}: ${pageTitle}\n`);
  pagePayloads[pageTitle] = await fetchWikiPagePayload({
    pageTitle,
    apiUrl,
    requireRevisionBinding: true,
  });
  if (checkpoint) writeJson(checkpoint, { schemaVersion: 'armor-set-page-effect-evidence-fetch/v1', generatedAt: new Date().toISOString(), pagePayloads });
}

const overviewPagePayload = await fetchWikiPagePayload({
  pageTitle: '盔甲', apiUrl, requireRevisionBinding: true,
});
const overviewRecords = parseWikiArmorSetRows({
  wikitext: overviewPagePayload.wikitext,
  html: overviewPagePayload.html,
  sourceRevisionTimestamp: overviewPagePayload.revisionTimestamp,
});
const evidence = buildArmorSetPageEffectEvidence({
  modulePayload, imagePayload, pagePayloads,
  overview: { pagePayload: overviewPagePayload, records: overviewRecords },
});
const enrichedModulePayload = attachArmorSetPageEffectEvidence(modulePayload, evidence);
const rawPages = Object.fromEntries(pageTitles.map((pageTitle) => {
  const page = pagePayloads[pageTitle];
  return [pageTitle, {
    requestedPageTitle: page.requestedPageTitle,
    pageTitle: page.pageTitle,
    pageId: page.pageId,
    revisionId: page.revisionId,
    revisionTimestamp: page.revisionTimestamp,
    fetchedAt: page.fetchedAt,
    wikitext: page.wikitext,
    html: page.html,
  }];
}));

writeJson(output, {
  ...evidence,
  enrichedModulePayload,
  generatedAt: new Date().toISOString(),
  databaseWrites: false,
  executable: false,
  applyAllowed: false,
  input: {
    modulePath: moduleInput,
    imagePath: imageInput,
    modulePayloadHash: evidence.module.sourceRevisionId,
    imageSetCount: imagePayload.totalArmorSets,
  },
  rawPages,
  overview: { pagePayload: overviewPagePayload, records: overviewRecords },
});
console.log(JSON.stringify({
  output,
  setCount: evidence.summary.setCount,
  pageCount: evidence.summary.pageCount,
  effectTextCount: evidence.summary.effectTextCount,
  unresolvedOwnerCount: evidence.summary.unresolvedOwnerCount,
  unresolvedPageCount: evidence.summary.unresolvedPageCount,
  evidenceHash: evidence.evidenceHash,
}, null, 2));
