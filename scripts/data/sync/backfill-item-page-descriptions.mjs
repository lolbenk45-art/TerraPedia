#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { ensureDir, parseCliArgs, sharedDataPath, writeJson } from '../lib/wiki-item-utils.mjs';
import { extractIntroParagraphs } from '../lib/wiki-page-utils.mjs';
import { getRepoRoot, loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const { createClient } = require('redis');

const args = parseCliArgs(process.argv.slice(2));
const apply = booleanOption(args.apply, false);
const clearCache = booleanOption(args['clear-cache'] ?? args.clearCache, true);
const overwriteDescription = booleanOption(args['overwrite-description'] ?? args.overwriteDescription, false);
const limit = numericOption(args.limit, null);
const minIntroLength = Math.max(1, numericOption(args['min-intro-length'] ?? args.minIntroLength, 40));
const sampleLimit = Math.max(1, numericOption(args['sample-limit'] ?? args.sampleLimit, 20));

const repoRoot = getRepoRoot();
const localConfig = loadLocalStackConfig(repoRoot);
const rawDir = path.resolve(process.cwd(), args['raw-dir'] ?? sharedDataPath('raw', 'wiki', 'item-pages'));
const reportDir = path.resolve(process.cwd(), args['report-dir'] ?? sharedDataPath('reports', 'sync'));
const timestamp = new Date().toISOString().replaceAll(':', '-');
const reportPath = path.resolve(process.cwd(), args.report ?? path.join(reportDir, `item-page-description-backfill-${timestamp}.json`));

ensureDir(reportDir);

if (!fs.existsSync(rawDir) || !fs.statSync(rawDir).isDirectory()) {
  throw new Error(`Item page raw directory not found: ${rawDir}`);
}

const db = resolveDbConfig(localConfig, args);
const redis = resolveRedisConfig(localConfig, args);
const connection = await mysql.createConnection(db);

try {
  const [rows] = await connection.query(`
    SELECT id, internal_name, name, name_zh, description, description_zh, tooltip, tooltip_zh
    FROM items
    WHERE deleted = 0
    ORDER BY id ASC
  `);

  const selectedRows = Number.isFinite(limit) && limit > 0
    ? rows.slice(0, limit)
    : rows;

  const summary = {
    apply,
    clearCache,
    overwriteDescription,
    minIntroLength,
    checked: 0,
    matchedPageFiles: 0,
    candidateCount: 0,
    updatedCount: 0,
    skipped: {
      missingInternalName: 0,
      missingPageFile: 0,
      missingHtml: 0,
      missingIntroParagraph: 0,
      redirectLikeIntro: 0,
      shortIntro: 0,
      existingDescription: 0,
    },
    before: {
      descriptionEn: 0,
      descriptionZh: 0,
      tooltipEn: 0,
      tooltipZh: 0,
    },
    estimatedAfter: {
      descriptionEn: 0,
    },
  };

  const samples = {
    candidates: [],
    redirectLikeIntro: [],
    shortIntro: [],
    existingDescription: [],
    missingPageFile: [],
  };

  const candidates = [];

  for (const row of selectedRows) {
    summary.checked += 1;
    if (hasText(row.description)) summary.before.descriptionEn += 1;
    if (hasText(row.description_zh)) summary.before.descriptionZh += 1;
    if (hasText(row.tooltip)) summary.before.tooltipEn += 1;
    if (hasText(row.tooltip_zh)) summary.before.tooltipZh += 1;

    const internalName = toText(row.internal_name);
    if (!internalName) {
      summary.skipped.missingInternalName += 1;
      continue;
    }

    const latestPath = path.join(rawDir, `${sanitizeFileName(internalName)}.latest.json`);
    if (!fs.existsSync(latestPath)) {
      summary.skipped.missingPageFile += 1;
      pushSample(samples.missingPageFile, {
        id: row.id,
        internalName,
        latestPath,
      }, sampleLimit);
      continue;
    }
    summary.matchedPageFiles += 1;

    const payload = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    if (!hasText(payload?.html)) {
      summary.skipped.missingHtml += 1;
      continue;
    }

    const introParagraphs = extractIntroParagraphs(payload.html);
    const firstIntro = toText(introParagraphs[0]);
    if (!firstIntro) {
      summary.skipped.missingIntroParagraph += 1;
      continue;
    }

    if (isRedirectLikeIntro(firstIntro)) {
      summary.skipped.redirectLikeIntro += 1;
      pushSample(samples.redirectLikeIntro, {
        id: row.id,
        internalName,
        itemName: row.name,
        pageTitle: payload.pageTitle ?? null,
        intro: firstIntro,
      }, sampleLimit);
      continue;
    }

    if (firstIntro.length < minIntroLength) {
      summary.skipped.shortIntro += 1;
      pushSample(samples.shortIntro, {
        id: row.id,
        internalName,
        itemName: row.name,
        pageTitle: payload.pageTitle ?? null,
        intro: firstIntro,
        introLength: firstIntro.length,
      }, sampleLimit);
      continue;
    }

    const descriptionBefore = toText(row.description);
    if (descriptionBefore && !overwriteDescription) {
      summary.skipped.existingDescription += 1;
      pushSample(samples.existingDescription, {
        id: row.id,
        internalName,
        itemName: row.name,
        descriptionBefore,
      }, sampleLimit);
      continue;
    }

    const candidate = {
      id: Number(row.id),
      internalName,
      itemNameEn: toText(row.name),
      itemNameZh: toText(row.name_zh),
      latestPath,
      pageTitle: toText(payload.pageTitle),
      revisionTimestamp: toText(payload.revisionTimestamp),
      descriptionBefore,
      descriptionAfter: firstIntro,
      descriptionZh: toText(row.description_zh),
      tooltipEn: toText(row.tooltip),
      tooltipZh: toText(row.tooltip_zh),
    };

    candidates.push(candidate);
    summary.candidateCount += 1;
    pushSample(samples.candidates, candidate, sampleLimit);
  }

  summary.estimatedAfter.descriptionEn = summary.before.descriptionEn + candidates.length;

  if (apply && candidates.length > 0) {
    await connection.beginTransaction();
    try {
      for (const candidate of candidates) {
        const [result] = await connection.execute(
          `
          UPDATE items
          SET description = ?, updated_at = NOW()
          WHERE id = ?
          `,
          [candidate.descriptionAfter, candidate.id]
        );
        summary.updatedCount += Number(result.affectedRows || 0);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  const cache = apply && summary.updatedCount > 0 && clearCache
    ? await clearItemDetailCache(redis)
    : buildSkippedCacheResult(apply, clearCache, summary.updatedCount);

  const report = {
    generatedAt: new Date().toISOString(),
    rawDir,
    reportPath,
    db: {
      host: db.host,
      port: db.port,
      database: db.database,
    },
    redis: {
      host: redis.host,
      port: redis.port,
      database: redis.database,
      enabled: clearCache,
    },
    summary,
    cache,
    samples,
    guidance: buildGuidance(apply, summary.updatedCount, cache),
  };

  writeJson(reportPath, report);

  console.log(JSON.stringify({
    apply,
    checked: summary.checked,
    matchedPageFiles: summary.matchedPageFiles,
    candidateCount: summary.candidateCount,
    updatedCount: summary.updatedCount,
    skipped: summary.skipped,
    cacheStatus: cache.status,
    reportPath,
  }, null, 2));
} finally {
  await connection.end();
}

function resolveDbConfig(localConfig, rawArgs) {
  return {
    host: firstText(rawArgs['db-host'], process.env.TERRAPEDIA_DB_HOST, localConfig?.database?.host, '127.0.0.1'),
    port: Number(firstText(rawArgs['db-port'], process.env.TERRAPEDIA_DB_PORT, localConfig?.database?.port, '3306')),
    user: firstText(rawArgs['db-user'], process.env.TERRAPEDIA_DB_USERNAME, localConfig?.database?.username, 'root'),
    password: firstDefinedText(rawArgs['db-password'], process.env.TERRAPEDIA_DB_PASSWORD, localConfig?.database?.password, 'root'),
    database: firstText(rawArgs['db-name'], process.env.TERRAPEDIA_DB_NAME, localConfig?.database?.name, 'terria_v1_local'),
  };
}

function resolveRedisConfig(localConfig, rawArgs) {
  return {
    host: firstText(rawArgs['redis-host'], process.env.TERRAPEDIA_REDIS_HOST, localConfig?.redis?.host, '127.0.0.1'),
    port: Number(firstText(rawArgs['redis-port'], process.env.TERRAPEDIA_REDIS_PORT, localConfig?.redis?.port, '6379')),
    password: firstDefinedText(rawArgs['redis-password'], process.env.TERRAPEDIA_REDIS_PASSWORD, localConfig?.redis?.password, ''),
    database: Number(firstText(rawArgs['redis-database'], process.env.TERRAPEDIA_REDIS_DATABASE, localConfig?.redis?.database, '0')),
  };
}

async function clearItemDetailCache(redisConfig) {
  const keyPatterns = ['item:detail::*', 'item:public:detail::*'];
  const client = createClient({
    socket: {
      host: redisConfig.host,
      port: redisConfig.port,
      connectTimeout: 3000,
    },
    password: toText(redisConfig.password) || undefined,
    database: redisConfig.database,
  });

  try {
    await client.connect();
    const keys = [];
    for (const pattern of keyPatterns) {
      for await (const key of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keys.push(key);
      }
    }

    if (keys.length === 0) {
      return {
        attempted: true,
        status: 'ok',
        deletedKeys: 0,
        message: 'No item detail cache keys were present.',
        keyPatterns,
      };
    }

    const deletedKeys = await client.del(keys);
    return {
      attempted: true,
      status: 'ok',
      deletedKeys,
      keyPatterns,
    };
  } catch (error) {
    return {
      attempted: true,
      status: 'failed',
      deletedKeys: 0,
      error: error instanceof Error ? error.message : String(error),
      keyPatterns,
    };
  } finally {
    try {
      await client.quit();
    } catch {
      // ignore close errors
    }
  }
}

function buildSkippedCacheResult(applyMode, clearCacheEnabled, updatedCount) {
  if (!applyMode) {
    return {
      attempted: false,
      status: 'skipped',
      deletedKeys: 0,
      reason: 'dry_run',
    };
  }
  if (!clearCacheEnabled) {
    return {
      attempted: false,
      status: 'skipped',
      deletedKeys: 0,
      reason: 'clear_cache_disabled',
    };
  }
  if (updatedCount <= 0) {
    return {
      attempted: false,
      status: 'skipped',
      deletedKeys: 0,
      reason: 'no_rows_updated',
    };
  }
  return {
    attempted: false,
    status: 'skipped',
    deletedKeys: 0,
    reason: 'unknown',
  };
}

function buildGuidance(applyMode, updatedCount, cache) {
  if (!applyMode) {
    return [
      'This was a dry run. Re-run with --apply=true after reviewing the report.',
      'If you apply updates later, item detail and public item detail caches should be cleared or the backend restarted.',
    ];
  }

  if (updatedCount <= 0) {
    return [
      'No rows were updated.',
    ];
  }

  if (cache.status === 'ok') {
    return [
      'Description rows were updated and item detail cache keys were cleared.',
    ];
  }

  return [
    'Description rows were updated, but cache eviction did not complete.',
    'Restart the backend or wait for the item detail cache TTLs to expire before validating the page.',
  ];
}

function sanitizeFileName(value) {
  return String(value ?? 'unknown')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

function booleanOption(value, fallback) {
  if (value == null || value === '') return fallback;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return fallback;
}

function numericOption(value, fallback) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasText(value) {
  return Boolean(toText(value));
}

function toText(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return text;
}

function firstText(...values) {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return '';
}

function firstDefinedText(...values) {
  for (const value of values) {
    if (value == null) continue;
    return String(value);
  }
  return '';
}

function isRedirectLikeIntro(value) {
  const normalized = toText(value).toLowerCase();
  return normalized.startsWith('redirect to:') || normalized === 'redirect to:' || normalized.startsWith('redirect ');
}

function pushSample(collection, value, maxSize) {
  if (collection.length >= maxSize) return;
  collection.push(value);
}
