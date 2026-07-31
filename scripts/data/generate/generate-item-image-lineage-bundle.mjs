#!/usr/bin/env node

// Combine item image source evidence with managed image results into one
// immutable landing bundle for the `item_image_sources_raw` dataset.
//
// Two URL columns, two different meanings, never the same value: `originalUrl`
// is where the sprite came from, `cachedUrl` is where we serve it. Items whose
// standardized image was already a managed artifact before this lane existed
// have no recorded source original; they carry `originalUrl: null` with an
// explicit `originalUrlStatus`, because writing the managed URL into both
// columns is the fabricated lineage this dataset replaces.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { isManagedImageUrl } from '../relation/managed-image-url-policy.mjs';
import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

const DATASET_TYPE = 'item_image_sources_raw';
const PROVIDER = 'terraria.wiki.gg';

export function buildItemImageLineageBundle({
  promotionBundleBytes,
  promotionResultBytes,
  promotionResultSha256,
  imageSyncResultBytes,
  imageSyncResultSha256,
  datasetType = DATASET_TYPE,
  generatedAt
} = {}) {
  if (datasetType !== DATASET_TYPE) {
    throw new Error(`item image lineage dataset type must be ${DATASET_TYPE}`);
  }
  const promotionBundle = parseJsonBytes(promotionBundleBytes, 'promotionBundleBytes');
  const promotionResult = parseJsonBytes(promotionResultBytes, 'promotionResultBytes');
  const imageSync = parseJsonBytes(imageSyncResultBytes, 'imageSyncResultBytes');

  if (promotionBundle?.entity !== 'item_image_source_promotion_bundle') {
    throw new Error('an item image source promotion bundle is required');
  }
  for (const key of ['unresolved', 'ambiguous', 'duplicate', 'conflict']) {
    if (Number(promotionBundle?.counters?.[key]) !== 0) {
      throw new Error(`promotion bundle counters must be closed: ${key} is ${promotionBundle?.counters?.[key]}`);
    }
  }
  if (promotionResult?.resultKind !== 'canonical_item_image_source_promotion_result'
      || promotionResult?.status !== 'COMPLETED') {
    throw new Error('a completed item image source promotion result is required');
  }
  if (imageSync?.status !== 'completed' || imageSync?.apply !== true) {
    throw new Error('a completed image sync result is required');
  }

  const managedUrlPrefixes = requireRecords(imageSync?.managedUrlPrefixes, 'image sync managed URL prefixes');
  const managedByKey = new Map();
  for (const entry of requireRecords(imageSync?.managedImages, 'image sync managed images')) {
    const key = requireText(entry?.key, 'managed image key');
    if (managedByKey.has(key)) throw new Error(`duplicate managed image for ${key}`);
    managedByKey.set(key, entry);
  }

  const seen = new Set();
  const deferredSecondaryRows = [];
  let wikiSourced = 0;
  let originalUrlNotRecorded = 0;

  const itemImages = requireRecords(promotionBundle?.rows, 'promotion bundle rows').map((row) => {
    const itemInternalName = requireText(row?.itemInternalName, 'promotion row itemInternalName');
    if (seen.has(itemInternalName)) throw new Error(`duplicate lineage identity ${itemInternalName}`);
    seen.add(itemInternalName);

    const source = row?.source;
    if (!source || typeof source !== 'object') {
      throw new Error(`promotion row ${itemInternalName} has no source`);
    }
    const managed = managedByKey.get(itemInternalName);
    if (!managed) throw new Error(`missing managed image for ${itemInternalName}`);
    const cachedUrl = requireText(managed?.managedUrl, `managed URL for ${itemInternalName}`);
    if (!isManagedImageUrl(cachedUrl, managedUrlPrefixes)) {
      throw new Error(`cached URL is not managed for ${itemInternalName}: ${cachedUrl}`);
    }

    const wikiVerified = source.authority === 'raw_wiki_evidence';
    const sourceOriginalUrl = text(source.originalUrl);
    if (wikiVerified) {
      if (!sourceOriginalUrl) throw new Error(`missing source original URL for ${itemInternalName}`);
      if (looksManaged(sourceOriginalUrl, managedUrlPrefixes)) {
        throw new Error(`source original URL is managed for ${itemInternalName}: ${sourceOriginalUrl}`);
      }
      wikiSourced += 1;
    } else {
      originalUrlNotRecorded += 1;
    }

    for (const secondary of Array.isArray(row?.secondarySources) ? row.secondarySources : []) {
      // Managed image sync covers one image per item, so a retained format has
      // no cached URL yet and cannot become a lineage row without inventing one.
      deferredSecondaryRows.push({
        itemId: row.itemId,
        itemInternalName,
        itemName: text(row.itemName),
        sourceFileTitle: text(secondary?.fileTitle),
        originalUrl: text(secondary?.originalUrl),
        sortOrder: Number(secondary?.sortOrder ?? 0),
        reason: 'no_managed_image'
      });
    }

    return {
      itemId: row.itemId,
      itemInternalName,
      itemName: text(row.itemName),
      role: 'icon',
      provider: PROVIDER,
      sourceFileTitle: text(source.fileTitle),
      sourcePage: text(source.sourcePage),
      sourceRevisionTimestamp: text(source.sourceRevisionTimestamp),
      originalUrl: wikiVerified ? sourceOriginalUrl : null,
      originalUrlStatus: wikiVerified ? 'wiki_verified' : 'not_recorded',
      cachedUrl,
      width: nullableNumber(source.width),
      height: nullableNumber(source.height),
      contentType: text(source.contentType),
      isPrimary: true,
      sortOrder: 0
    };
  });

  return {
    schemaVersion: 1,
    entity: 'item_image_lineage_bundle',
    datasetType: DATASET_TYPE,
    provider: PROVIDER,
    generatedAt: requireText(generatedAt, 'generatedAt'),
    descriptor: {
      promotionBundle: {
        generationId: text(promotionBundle.generationId),
        sha256: sha256Bytes(promotionBundleBytes)
      },
      promotionResult: {
        sha256: requireSha256(promotionResultSha256, 'promotionResultSha256'),
        standardizedAfterSha256: text(promotionResult?.after?.sha256)
      },
      imageSyncResult: {
        sha256: requireSha256(imageSyncResultSha256, 'imageSyncResultSha256')
      }
    },
    counters: {
      total: itemImages.length,
      wikiSourced,
      originalUrlNotRecorded,
      deferredSecondaryRows: deferredSecondaryRows.length
    },
    itemImages,
    deferredSecondaryRows
  };
}

function looksManaged(value, managedUrlPrefixes) {
  if (isManagedImageUrl(value, managedUrlPrefixes)) return true;
  // A relative managed path never parses as a URL, so match it structurally.
  return /^\/?terrapedia-images\//.test(String(value).replace(/^\//, '/'))
    || String(value).startsWith('/terrapedia-images/');
}

function parseJsonBytes(value, label) {
  if (value == null) throw new Error(`${label} is required`);
  return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
}

function requireRecords(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return value;
}

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function requireText(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function requireSha256(value, label) {
  const normalized = requireText(value, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) throw new Error(`${label} must be a sha256 hash`);
  return normalized;
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function parseArgs(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    if (separator > 2) options[token.slice(2, separator)] = token.slice(separator + 1);
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const outputPath = path.resolve(requireText(args.output, 'output'));
    if (fs.existsSync(outputPath)) {
      throw new Error(`item image lineage bundle already exists: ${outputPath}`);
    }
    const promotionResultBytes = fs.readFileSync(path.resolve(requireText(args['promotion-result'], 'promotion-result')));
    const imageSyncResultBytes = fs.readFileSync(path.resolve(requireText(args['image-sync-result'], 'image-sync-result')));
    const bundle = buildItemImageLineageBundle({
      promotionBundleBytes: fs.readFileSync(path.resolve(requireText(args['promotion-bundle'], 'promotion-bundle'))),
      promotionResultBytes,
      promotionResultSha256: sha256Bytes(promotionResultBytes),
      imageSyncResultBytes,
      imageSyncResultSha256: sha256Bytes(imageSyncResultBytes),
      generatedAt: args['generated-at'] ?? new Date().toISOString()
    });
    writeJsonFile(outputPath, bundle);
    process.stdout.write(`${JSON.stringify({ output: outputPath, counters: bundle.counters }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.stack || error?.message || error}\n`);
    process.exitCode = 1;
  }
}
