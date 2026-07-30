#!/usr/bin/env node

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { parseItemRawPagePayload } from '../parse/parse-item-raw-pages.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';
import { writeJsonFile } from '../workflow/backend-refresh-runtime-state.mjs';

const DEFAULT_ITEMS_PATH = 'data/standardized/items.standardized.json';
const DEFAULT_ITEM_PAGES_PATH = 'data/standardized/item_pages.standardized.json';
const DEFAULT_RAW_DIR = '/home/lolben/data/terraPedia/raw/wiki/item-pages';
const FORMAL_DATABASES = Object.freeze({
  local: 'terria_v1_local',
  relation: 'terria_v1_relation'
});

export function buildItemImageSourceCandidateReport({
  itemRecords,
  itemPageRecords,
  rawPagePayloadByFile,
  rawPageBytesByFile,
  localComparisonRows = [],
  existingLineageRows = [],
  inputEvidence = {},
  generatedAt = new Date().toISOString()
} = {}) {
  const items = requireRecords(itemRecords, 'itemRecords');
  const itemPages = requireRecords(itemPageRecords, 'itemPageRecords');
  const rawPages = rawPagePayloadByFile instanceof Map
    ? rawPagePayloadByFile
    : new Map(Object.entries(rawPagePayloadByFile ?? {}));
  const rawPageBytes = rawPageBytesByFile instanceof Map
    ? rawPageBytesByFile
    : new Map(Object.entries(rawPageBytesByFile ?? {}));
  const localByInternalName = indexComparisonRows(localComparisonRows, 'localComparisonRows');
  const lineageByInternalName = indexComparisonRows(existingLineageRows, 'existingLineageRows');
  const pageByInternalName = new Map(
    itemPages
      .filter((record) => text(record?.itemInternalName))
      .map((record) => [text(record.itemInternalName), record])
  );
  const missingImageItems = items.filter((item) => !text(item?.imageUrl) && !text(item?.imageFileTitle));
  const existingImageSourceItems = items.length - missingImageItems.length;
  const records = [];
  const candidates = [];
  const quarantine = {
    groupPages: [],
    nonGroupPages: [],
    missingPageMetadata: [],
    missingRawPages: [],
    parseErrors: []
  };
  let groupPages = 0;
  let nonGroupPages = 0;
  const rawFileDescriptors = new Map();

  for (const item of missingImageItems) {
    const itemInternalName = text(item?.internalName);
    const pageMetadata = pageByInternalName.get(itemInternalName);
    if (!pageMetadata) {
      quarantine.missingPageMetadata.push(itemIdentity(item));
      records.push(buildUnresolvedRecord({
        item,
        reason: 'missing_page_metadata',
        localByInternalName,
        lineageByInternalName
      }));
      continue;
    }
    const sourceFile = path.basename(text(pageMetadata.sourceFile));
    if (!sourceFile || !rawPages.has(sourceFile)) {
      quarantine.missingRawPages.push({ ...itemIdentity(item), sourceFile: sourceFile || null });
      records.push(buildUnresolvedRecord({
        item,
        reason: 'missing_raw_page',
        localByInternalName,
        lineageByInternalName
      }));
      continue;
    }
    const rawBytes = rawPageBytes.get(sourceFile);
    if (rawBytes == null) {
      quarantine.parseErrors.push({
        ...itemIdentity(item),
        sourceFile,
        message: 'missing exact raw page bytes'
      });
      records.push(buildUnresolvedRecord({
        item,
        reason: 'missing_raw_page_bytes',
        localByInternalName,
        lineageByInternalName
      }));
      continue;
    }
    const rawFileSha256 = sha256Bytes(rawBytes);
    rawFileDescriptors.set(sourceFile, { path: sourceFile, sha256: rawFileSha256 });
    const rawPayload = rawPages.get(sourceFile);
    if (rawPayload instanceof Error) {
      quarantine.parseErrors.push({
        ...itemIdentity(item),
        sourceFile,
        message: rawPayload.message
      });
      records.push(buildUnresolvedRecord({
        item,
        reason: 'raw_page_parse_error',
        localByInternalName,
        lineageByInternalName
      }));
      continue;
    }

    let parsed;
    try {
      parsed = parseItemRawPagePayload(rawPayload, sourceFile);
    } catch (error) {
      quarantine.parseErrors.push({
        ...itemIdentity(item),
        sourceFile,
        message: error?.message ?? String(error)
      });
      records.push(buildUnresolvedRecord({
        item,
        reason: 'raw_page_parse_error',
        localByInternalName,
        lineageByInternalName
      }));
      continue;
    }

    const evidence = resolveRawMemberEvidence({ item, parsed });
    const classification = evidence.summary.status === 'verified'
      ? 'raw_verified'
      : evidence.summary.status;
    const source = classification === 'raw_verified'
      ? buildRawSource({
          parsed,
          sourceFile,
          rawFileSha256,
          candidate: evidence.candidates[0]
        })
      : null;
    const comparison = buildComparison({
      itemInternalName,
      source,
      localByInternalName,
      lineageByInternalName
    });
    const record = {
      ...itemIdentity(item),
      classification,
      source,
      comparison
    };
    records.push(record);
    if (classification === 'raw_verified') {
      candidates.push(record);
    }

    if (parsed.isGroupPage) {
      groupPages += 1;
      if (classification !== 'raw_verified') {
        quarantine.groupPages.push(buildQuarantineEntry({
          item,
          parsed,
          sourceFile,
          evidence,
          reason: `${classification}_member_image_evidence`
        }));
      }
      continue;
    }

    nonGroupPages += 1;
    if (classification !== 'raw_verified') {
      quarantine.nonGroupPages.push(buildQuarantineEntry({
        item,
        parsed,
        sourceFile,
        evidence,
        reason: `${classification}_item_image_evidence`
      }));
    }
  }

  records.sort(compareItemIdentity);
  candidates.sort(compareItemIdentity);
  quarantine.groupPages.sort(compareInternalName);
  quarantine.nonGroupPages.sort(compareInternalName);
  const rawVerified = records.filter((record) => record.classification === 'raw_verified').length;
  const ambiguous = records.filter((record) => record.classification === 'ambiguous').length;
  const unresolved = records.filter((record) => record.classification === 'unresolved').length;
  const localAgreement = records.filter((record) => record.comparison.local.status === 'agreement').length;
  const localConflict = records.filter((record) => record.comparison.local.status === 'conflict').length;
  const existingLineage = records.filter((record) => record.comparison.lineage.status !== 'missing').length;
  const localOnly = records.filter((record) => (
    record.comparison.local.status !== 'missing'
    && record.comparison.lineage.status === 'missing'
  )).length;

  return {
    schemaVersion: '2.0.0',
    entity: 'item_image_source_candidates',
    generatedAt,
    inputs: {
      ...inputEvidence,
      rawFiles: [...rawFileDescriptors.values()].sort((left, right) => left.path.localeCompare(right.path))
    },
    writeBoundary: {
      candidateOnly: true,
      standardizedDataModified: false,
      databaseWrites: false,
      imageSyncTriggered: false
    },
    summary: {
      totalItems: items.length,
      existingImageSourceItems,
      missingImageSourceItems: missingImageItems.length,
      groupPages,
      nonGroupPages,
      rawVerified,
      ambiguous,
      unresolved,
      candidateCount: candidates.length,
      quarantinedGroupPages: quarantine.groupPages.length,
      missingPageMetadata: quarantine.missingPageMetadata.length,
      missingRawPages: quarantine.missingRawPages.length,
      parseErrors: quarantine.parseErrors.length,
      localAgreement,
      localConflict,
      existingLineage,
      localOnly
    },
    records,
    candidates,
    quarantine
  };
}

export async function runItemImageSourceCandidateAudit(rawOptions = {}, dependencies = {}) {
  const options = normalizeOptions(rawOptions);
  const itemBytes = await fs.promises.readFile(options.itemsPath);
  const itemPageBytes = await fs.promises.readFile(options.itemPagesPath);
  const itemPayload = JSON.parse(itemBytes.toString('utf8'));
  const itemPagePayload = JSON.parse(itemPageBytes.toString('utf8'));
  const itemRecords = requireRecords(itemPayload?.records, options.itemsPath);
  const itemPageRecords = requireRecords(itemPagePayload?.records, options.itemPagesPath);
  const neededInternalNames = new Set(
    itemRecords
      .filter((item) => !text(item?.imageUrl) && !text(item?.imageFileTitle))
      .map((item) => text(item?.internalName))
      .filter(Boolean)
  );
  const rawPagePayloadByFile = new Map();
  const rawPageBytesByFile = new Map();

  for (const pageMetadata of itemPageRecords) {
    if (!neededInternalNames.has(text(pageMetadata?.itemInternalName))) {
      continue;
    }
    const sourceFile = path.basename(text(pageMetadata?.sourceFile));
    if (!sourceFile || rawPagePayloadByFile.has(sourceFile)) {
      continue;
    }
    const rawPath = path.join(options.rawDir, sourceFile);
    try {
      const rawBytes = await fs.promises.readFile(rawPath);
      rawPageBytesByFile.set(sourceFile, rawBytes);
      rawPagePayloadByFile.set(sourceFile, JSON.parse(rawBytes.toString('utf8')));
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        rawPagePayloadByFile.set(sourceFile, error);
      }
    }
  }

  let localComparisonRows = await readOptionalRecords(options.localComparisonPath);
  let existingLineageRows = await readOptionalRecords(options.existingLineagePath);
  let comparisonEvidence = null;
  if (options.databaseComparison) {
    if (options.localComparisonPath || options.existingLineagePath) {
      throw new Error('database comparison cannot be combined with comparison files');
    }
    const repoRoot = dependencies.repoRoot ?? getProjectRoot();
    const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
    const connection = await (dependencies.connectionFactory ?? (async () => (
      loadMysqlModule({ repoRoot }).createConnection({
        host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
        port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 3306),
        user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
        password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
        database: FORMAL_DATABASES.local
      })
    )))();
    try {
      const snapshot = await loadItemImageComparisonSnapshot({ connection });
      localComparisonRows = snapshot.localComparisonRows;
      existingLineageRows = snapshot.existingLineageRows;
      comparisonEvidence = {
        authority: 'formal_database_read_only_snapshot',
        databases: FORMAL_DATABASES,
        localRowsSha256: sha256Canonical(localComparisonRows),
        lineageRowsSha256: sha256Canonical(existingLineageRows)
      };
    } finally {
      await connection.end();
    }
  }

  const report = buildItemImageSourceCandidateReport({
    itemRecords,
    itemPageRecords,
    rawPagePayloadByFile,
    rawPageBytesByFile,
    localComparisonRows,
    existingLineageRows,
    inputEvidence: {
      items: { path: options.itemsPath, sha256: sha256Bytes(itemBytes) },
      itemPages: { path: options.itemPagesPath, sha256: sha256Bytes(itemPageBytes) },
      identitySetSha256: buildIdentitySetSha256(itemRecords),
      comparison: comparisonEvidence
    },
    generatedAt: options.generatedAt
  });
  writeJsonFile(options.outputPath, report);
  return report.summary;
}

export async function loadItemImageComparisonSnapshot({
  connection,
  databases = FORMAL_DATABASES
} = {}) {
  if (!connection || typeof connection.query !== 'function') {
    throw new TypeError('item image comparison requires a query-capable database connection');
  }
  if (JSON.stringify(databases) !== JSON.stringify(FORMAL_DATABASES)) {
    throw new Error('item image comparison only permits the formal local and relation databases');
  }
  const local = quoteIdentifier(databases.local);
  const relation = quoteIdentifier(databases.relation);
  try {
    await connection.query('START TRANSACTION READ ONLY');
    const [localComparisonRows] = await connection.query(`
SELECT itemInternalName, sourceFileTitle, originalUrl, cachedUrl
FROM (
  SELECT
    i.\`internal_name\` AS itemInternalName,
    ii.\`source_file_title\` AS sourceFileTitle,
    ii.\`original_url\` AS originalUrl,
    ii.\`cached_url\` AS cachedUrl,
    ROW_NUMBER() OVER (
      PARTITION BY i.\`internal_name\`
      ORDER BY ii.\`is_primary\` DESC, ii.\`sort_order\` ASC, ii.\`id\` ASC
    ) AS row_rank
  FROM ${local}.\`items\` i
  INNER JOIN ${local}.\`item_images\` ii ON ii.\`item_id\` = i.\`id\`
  WHERE i.\`deleted\` = 0
    AND ii.\`deleted\` = 0
    AND ii.\`status\` = 1
) ranked
WHERE row_rank = 1
ORDER BY itemInternalName
`.trim());
    const [existingLineageRows] = await connection.query(`
SELECT itemInternalName, sourceFileTitle, originalUrl, cachedUrl
FROM (
  SELECT
    rii.\`item_internal_name\` AS itemInternalName,
    rii.\`source_file_title\` AS sourceFileTitle,
    rii.\`original_url\` AS originalUrl,
    rii.\`cached_url\` AS cachedUrl,
    ROW_NUMBER() OVER (
      PARTITION BY rii.\`item_internal_name\`
      ORDER BY rii.\`is_primary\` DESC, rii.\`sort_order\` ASC, rii.\`id\` ASC
    ) AS row_rank
  FROM ${relation}.\`relation_item_images\` rii
  WHERE rii.\`deleted\` = 0
    AND rii.\`status\` = 1
) ranked
WHERE row_rank = 1
ORDER BY itemInternalName
`.trim());
    await connection.query('ROLLBACK');
    return {
      localComparisonRows: Array.isArray(localComparisonRows) ? localComparisonRows : [],
      existingLineageRows: Array.isArray(existingLineageRows) ? existingLineageRows : []
    };
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

function resolveRawMemberEvidence({ item, parsed }) {
  if (parsed.isGroupPage) {
    return parsed.groupPageEvidence?.memberImageEvidence ?? {
      summary: { matchingBlockCount: 0, candidateCount: 0, status: 'unresolved' },
      candidates: []
    };
  }

  const identityTargets = new Set([
    item?.internalName,
    item?.name,
    parsed.itemName,
    parsed.requestedPageTitle
  ].map(normalizeIdentity).filter(Boolean));
  const candidates = parsed.images
    .filter((image) => identityTargets.has(normalizeImageFileIdentity(image?.fileTitle)))
    .map((image) => ({
      evidenceKind: 'page_infobox',
      blockOrdinal: 1,
      anchorTitle: parsed.requestedPageTitle ?? parsed.itemName,
      fileTitle: image.fileTitle,
      url: image.url,
      width: image.width,
      height: image.height,
      contentType: image.contentType
    }));
  return {
    summary: {
      matchingBlockCount: candidates.length > 0 ? 1 : 0,
      candidateCount: candidates.length,
      status: candidates.length === 1 ? 'verified' : candidates.length > 1 ? 'ambiguous' : 'unresolved'
    },
    candidates
  };
}

function buildRawSource({ parsed, sourceFile, rawFileSha256, candidate }) {
  return {
    authority: 'raw_wiki_evidence',
    evidenceKind: candidate.evidenceKind,
    blockOrdinal: candidate.blockOrdinal,
    anchorTitle: candidate.anchorTitle,
    rawSourceFile: sourceFile,
    rawFileSha256,
    pageId: parsed.pageId,
    requestedPageTitle: parsed.requestedPageTitle,
    sourcePage: parsed.pageTitle,
    sourceRevisionTimestamp: parsed.revisionTimestamp,
    fileTitle: candidate.fileTitle,
    originalUrl: candidate.url,
    width: candidate.width,
    height: candidate.height,
    contentType: candidate.contentType
  };
}

function buildQuarantineEntry({ item, parsed, sourceFile, evidence, reason }) {
  return {
    ...itemIdentity(item),
    reason,
    sourceFile,
    requestedPageTitle: parsed.requestedPageTitle,
    pageTitle: parsed.pageTitle,
    matchingBlockCount: evidence.summary.matchingBlockCount,
    candidateCount: evidence.summary.candidateCount,
    candidateFileTitles: evidence.candidates.map((image) => image.fileTitle)
  };
}

function buildUnresolvedRecord({ item, reason, localByInternalName, lineageByInternalName }) {
  const itemInternalName = text(item?.internalName);
  return {
    ...itemIdentity(item),
    classification: 'unresolved',
    source: null,
    reason,
    comparison: buildComparison({
      itemInternalName,
      source: null,
      localByInternalName,
      lineageByInternalName
    })
  };
}

function buildComparison({ itemInternalName, source, localByInternalName, lineageByInternalName }) {
  return {
    local: classifyComparison(localByInternalName.get(itemInternalName), source),
    lineage: classifyComparison(lineageByInternalName.get(itemInternalName), source)
  };
}

function classifyComparison(row, source) {
  if (!row) return { status: 'missing' };
  const sourceFileTitle = text(row.sourceFileTitle ?? row.imageFileTitle ?? row.fileTitle);
  const originalUrl = text(row.originalUrl ?? row.imageUrl ?? row.url);
  const cachedUrl = text(row.cachedUrl ?? row.imageCachedUrl);
  let status = 'comparison_only';
  if (source) {
    const titleMatches = sourceFileTitle && normalizeImageFileIdentity(sourceFileTitle) === normalizeImageFileIdentity(source.fileTitle);
    const urlMatches = originalUrl && normalizeUrl(originalUrl) === normalizeUrl(source.originalUrl);
    status = titleMatches || urlMatches ? 'agreement' : 'conflict';
  }
  return { status, sourceFileTitle, originalUrl, cachedUrl };
}

function indexComparisonRows(rows, label) {
  const output = new Map();
  for (const row of requireRecords(rows, label)) {
    const key = text(row?.itemInternalName ?? row?.internalName ?? row?.item_internal_name);
    if (!key) continue;
    if (output.has(key)) throw new Error(`${label} contains duplicate item identity ${key}`);
    output.set(key, row);
  }
  return output;
}

function itemIdentity(item) {
  return {
    itemId: item?.id ?? null,
    itemInternalName: text(item?.internalName),
    itemName: text(item?.name)
  };
}

function normalizeImageFileIdentity(fileTitle) {
  return normalizeIdentity(String(fileTitle ?? '').replace(/\.[^.]+$/, ''));
}

function normalizeIdentity(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function requireRecords(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function compareInternalName(left, right) {
  return String(left.itemInternalName).localeCompare(String(right.itemInternalName));
}

function compareItemIdentity(left, right) {
  const leftId = Number(left.itemId);
  const rightId = Number(right.itemId);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
    return leftId - rightId;
  }
  return String(left.itemInternalName).localeCompare(String(right.itemInternalName));
}

function normalizeOptions(rawOptions) {
  const generatedAt = rawOptions.generatedAt ?? new Date().toISOString();
  const dateTag = generatedAt.slice(0, 10);
  return {
    itemsPath: path.resolve(rawOptions.itemsPath ?? rawOptions.items ?? DEFAULT_ITEMS_PATH),
    itemPagesPath: path.resolve(
      rawOptions.itemPagesPath ?? rawOptions['item-pages'] ?? DEFAULT_ITEM_PAGES_PATH
    ),
    rawDir: path.resolve(rawOptions.rawDir ?? rawOptions['raw-dir'] ?? DEFAULT_RAW_DIR),
    localComparisonPath: optionalPath(rawOptions.localComparisonPath ?? rawOptions['local-comparison']),
    existingLineagePath: optionalPath(rawOptions.existingLineagePath ?? rawOptions['existing-lineage']),
    databaseComparison: booleanOption(
      rawOptions.databaseComparison ?? rawOptions['database-comparison'],
      false
    ),
    outputPath: path.resolve(
      rawOptions.outputPath
        ?? rawOptions.output
        ?? `reports/audit/item-image-source-candidates-${dateTag}.json`
    ),
    generatedAt
  };
}

async function readOptionalRecords(filePath) {
  if (!filePath) return [];
  const payload = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
  return requireRecords(payload?.records ?? payload, filePath);
}

function optionalPath(value) {
  return text(value) ? path.resolve(value) : null;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  if (value === true || value === false) return value;
  return ['1', 'true', 'yes', 'y'].includes(String(value).toLowerCase());
}

function quoteIdentifier(value) {
  const normalized = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(normalized)) {
    throw new Error(`invalid SQL identifier ${value}`);
  }
  return `\`${normalized}\``;
}

function buildIdentitySetSha256(records) {
  const identities = records.map(itemIdentity).sort(compareItemIdentity);
  return sha256Canonical(identities);
}

function normalizeUrl(value) {
  return String(value ?? '').split('?')[0];
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256Canonical(value) {
  return sha256Bytes(canonicalJson(value));
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
}

function parseArgs(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    if (separator > 2) {
      options[token.slice(2, separator)] = token.slice(separator + 1);
    }
  }
  return options;
}

function isDirectExecution() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectExecution()) {
  runItemImageSourceCandidateAudit(parseArgs(process.argv.slice(2))).then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  }).catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
