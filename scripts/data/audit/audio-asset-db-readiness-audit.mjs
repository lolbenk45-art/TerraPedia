#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { getProjectRoot } from '../lib/project-root.mjs';

const require = createRequire(import.meta.url);
const repoRoot = getProjectRoot();
const DEFAULT_INPUT_JSON = '/home/lolben/data/terraPedia/generated/wiki-audio-assets.latest.json';
let mysqlModule = null;

export function buildAudioAssetDbAudit(metadata, dbState = {}, options = {}) {
  if (!Array.isArray(metadata?.assets)) {
    throw new Error('audio metadata must contain an assets array');
  }
  const assetRows = Array.isArray(dbState.assetRows) ? dbState.assetRows : [];
  const linkRows = Array.isArray(dbState.linkRows) ? dbState.linkRows : [];
  const assetById = new Map(assetRows.map((row) => [String(row.asset_id), row]));
  const failures = [];
  let missingDbAssets = 0;
  let missingLocalFiles = 0;
  let sizeMismatch = 0;
  let hashMismatch = 0;

  for (const asset of metadata.assets) {
    const assetId = String(asset.assetId ?? '');
    const dbAsset = assetById.get(assetId);
    if (!dbAsset) {
      missingDbAssets += 1;
      failures.push({ assetId, reason: 'missing db asset' });
    } else {
      if (Number(dbAsset.size_bytes) !== Number(asset.size)) {
        sizeMismatch += 1;
        failures.push({ assetId, reason: 'size mismatch' });
      }
      if (String(dbAsset.sha256 ?? '') !== String(asset.sha256 ?? '')) {
        hashMismatch += 1;
        failures.push({ assetId, reason: 'hash mismatch' });
      }
    }
    if (!asset.absoluteLocalPath || !fs.existsSync(asset.absoluteLocalPath)) {
      missingLocalFiles += 1;
      failures.push({ assetId, reason: 'missing local file' });
    }
  }

  const matchedLinks = linkRows.filter((row) => row.match_status === 'matched').length;
  const unmatchedLinks = linkRows.filter((row) => row.match_status === 'unmatched').length;
  const ambiguousLinks = linkRows.filter((row) => row.match_status === 'ambiguous').length;
  const summary = {
    metadataAssets: metadata.assets.length,
    dbAssets: assetRows.length,
    dbLinks: linkRows.length,
    missingDbAssets,
    missingLocalFiles,
    sizeMismatch,
    hashMismatch,
    matchedLinks,
    unmatchedLinks,
    ambiguousLinks
  };
  return {
    status: failures.length > 0 ? 'fail' : 'pass',
    generatedAt: new Date().toISOString(),
    sourceMetadata: options.inputJsonPath ?? DEFAULT_INPUT_JSON,
    database: options.database ?? 'terria_v1_local',
    summary,
    failures,
    warnings: unmatchedLinks > 0 ? [{ reason: 'unmatched links remain for first milestone', count: unmatchedLinks }] : []
  };
}

export function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) args[body.slice(0, eq)] = body.slice(eq + 1);
    else args[body] = 'true';
  }
  return args;
}

export function resolveAuditOptions(rawArgs = {}, options = {}) {
  const root = path.resolve(options.repoRoot ?? repoRoot);
  const env = options.env ?? process.env;
  const dateTag = formatDateTag(options.now ?? new Date());
  return {
    inputJsonPath: path.resolve(rawArgs['input-json'] ?? rawArgs.inputJson ?? DEFAULT_INPUT_JSON),
    reportPath: path.resolve(root, rawArgs['report-json'] ?? path.join('reports/audit', `audio-asset-db-readiness-${dateTag}.json`)),
    db: {
      host: rawArgs.host ?? env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
      port: Number(rawArgs.port ?? env.TERRAPEDIA_DB_PORT ?? 3306),
      user: rawArgs.user ?? env.TERRAPEDIA_DB_USERNAME ?? 'root',
      password: rawArgs.password ?? env.TERRAPEDIA_DB_PASSWORD ?? 'root',
      database: rawArgs.database ?? env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local'
    }
  };
}

function formatDateTag(value) {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function loadMysqlModule() {
  if (mysqlModule) return mysqlModule;
  try {
    mysqlModule = require('mysql2/promise');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    mysqlModule = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
  }
  return mysqlModule;
}

async function queryDbState(connection) {
  const [assetRows] = await connection.execute(
    `SELECT asset_id, size_bytes, sha256
     FROM audio_assets
     WHERE deleted = 0`
  );
  const [linkRows] = await connection.execute(
    `SELECT aa.asset_id, aal.match_status
     FROM audio_asset_links aal
     JOIN audio_assets aa ON aa.id = aal.audio_asset_id
     WHERE aal.deleted = 0
       AND aa.deleted = 0`
  );
  return { assetRows, linkRows };
}

async function writeReport(reportPath, audit) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2));
}

export async function runAudioAssetDbAudit(options = {}, dependencies = {}) {
  const metadata = JSON.parse(fs.readFileSync(options.inputJsonPath, 'utf8'));
  const mysql = dependencies.mysqlModule ?? loadMysqlModule();
  const connection = await mysql.createConnection(options.db);
  try {
    const dbState = dependencies.dbState ?? await queryDbState(connection);
    const audit = buildAudioAssetDbAudit(metadata, dbState, {
      inputJsonPath: options.inputJsonPath,
      database: options.db?.database
    });
    if (options.reportPath) {
      await writeReport(options.reportPath, audit);
    }
    return audit;
  } finally {
    if (typeof connection.end === 'function') await connection.end();
  }
}

async function main() {
  const options = resolveAuditOptions(parseArgs(process.argv.slice(2)));
  const audit = await runAudioAssetDbAudit(options);
  console.log(JSON.stringify(audit, null, 2));
  if (audit.status !== 'pass') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
