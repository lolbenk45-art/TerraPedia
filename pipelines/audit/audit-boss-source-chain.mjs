#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const DEFAULT_SOURCE = 'data/generated/wiki-bosses.latest.json';

const hashJson = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const text = (value) => value == null ? null : String(value);

function normalizeSourcePillars(records = []) {
  return records
    .filter((row) => ['Solar Pillar', 'Nebula Pillar', 'Vortex Pillar', 'Stardust Pillar'].includes(row.titleEn))
    .map((row) => ({ titleEn: row.titleEn, titleZh: text(row.titleZh), sourceUrlZh: text(row.sourceUrlZh) }))
    .sort((a, b) => a.titleEn.localeCompare(b.titleEn));
}

function sourceMap(sourcePillars) {
  return new Map(sourcePillars.map((row) => [row.titleEn, row]));
}

export function evaluateBossSourceChain({ sourcePillars = [], sourceRecordCount = 33, landingRows = [], maintLandingRows = [], maintRows = [], relationRows = [], projectionRows = [], apiPillars = [] } = {}) {
  const pillars = [...sourcePillars].sort((a, b) => a.titleEn.localeCompare(b.titleEn));
  const byTitle = sourceMap(pillars);
  const relationByTitle = new Map(relationRows.map((row) => [row.titleEn ?? row.bossTitleEn, row]));
  const boundMaint = pillars.map((source) => {
    const relation = relationByTitle.get(source.titleEn);
    return relation ? maintRows.find((row) => row.recordKey === relation.sourceMaintRecordKey) ?? null : null;
  });
  const landingCandidates = [...landingRows, ...maintLandingRows];
  const boundLanding = pillars.map((source, index) => {
    const relation = relationByTitle.get(source.titleEn);
    const maint = boundMaint[index];
    const exact = landingCandidates.find((row) => (
      (relation && Number(row.id) === Number(relation.landingSourceId))
      || (maint && Number(row.id) === Number(maint.landingSourceId))
    ));
    if (exact) return exact;
    return landingCandidates.find((row) => row.sourceKey === `wiki.page.boss:${source.titleEn}`
      && row.payloadTitleZh === source.titleZh) ?? null;
  });
  const relationComplete = pillars.every((source) => {
    const row = relationByTitle.get(source.titleEn);
    return row && row.titleZh === source.titleZh && row.sourceMaintRecordKey;
  });
  const maintComplete = pillars.every((source, index) => {
    const row = boundMaint[index];
    const relation = relationByTitle.get(source.titleEn);
    return row && relation && row.recordKey === relation.sourceMaintRecordKey && row.titleZh === source.titleZh;
  });
  const landingComplete = pillars.every((source, index) => {
    const row = boundLanding[index];
    const relation = relationByTitle.get(source.titleEn);
    return row && relation && Number(row.id) === Number(relation.landingSourceId)
      && row.payloadTitleZh === source.titleZh
      && row.contentHash === relation.landingContentHash;
  });
  const projectionComplete = pillars.every((source) => {
    const row = projectionRows.find((candidate) => (candidate.titleEn ?? candidate.nameEn) === source.titleEn);
    return row && (row.titleZh ?? row.nameZh) === source.titleZh;
  });
  const apiComplete = apiPillars.length === 0 || pillars.every((source) => {
    const row = apiPillars.find((candidate) => (candidate.titleEn ?? candidate.nameEn) === source.titleEn);
    return row && (row.titleZh ?? row.nameZh ?? row.name) === source.titleZh;
  });
  const assertions = {
    source33: sourceRecordCount === 33,
    sourcePillars: pillars.length === 4 && pillars.every((row) => row.titleZh && row.sourceUrlZh),
    landingCurrent: landingComplete,
    maintPillars: maintComplete,
    relationPillars: relationComplete,
    projectionPillars: projectionComplete,
    relationTitlesNonNull: relationComplete,
    projectionTitlesNonNull: projectionComplete,
    apiTitlesNonNull: apiComplete,
    allPillarZhMatch: pillars.every((source) => source.titleZh)
      && [boundMaint, relationRows, projectionRows, apiPillars].every((rows) => rows.length === 0 || rows.every((row) => {
        const title = row.titleEn ?? row.bossTitleEn ?? row.nameEn;
        const expected = byTitle.get(title);
        return !expected || (row.titleZh ?? row.bossTitleZh ?? row.nameZh ?? row.name) === expected.titleZh;
      })),
  };
  const ok = Object.values(assertions).every(Boolean);
  return {
    schemaVersion: 'boss-source-chain-audit-v3',
    sourcePillars: pillars,
    landing: { count: landingRows.length, rows: landingRows },
    maint: { count: boundMaint.length, rows: boundMaint.filter(Boolean) },
    relation: { count: relationRows.length, rows: relationRows },
    projection: { count: projectionRows.length, rows: projectionRows },
    api: { publicPillars: apiPillars },
    boundMaint: boundMaint.filter(Boolean),
    boundLanding: boundLanding.filter(Boolean),
    assertions,
    ok,
    scopeHash: hashJson({ pillars, boundMaint, boundLanding, relationRows, projectionRows, apiPillars }),
  };
}

function parseArgs(argv) {
  const result = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key, ...rest] = token.slice(2).split('=');
    result[key] = rest.join('=') || true;
  }
  return result;
}

async function readRows({ local, maint, relation }) {
  const [landingResult] = await local.query(`SELECT id, source_key AS sourceKey, content_hash AS contentHash,
    artifact_role AS artifactRole, producer_id AS producerId, producer_run_key AS producerRunKey,
    is_current AS isCurrent, JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.titleZh')) AS payloadTitleZh
    FROM source_dataset_landings WHERE dataset_type='bosses_raw' AND is_current=1 ORDER BY id`);
  const [maintResult] = await maint.query(`SELECT id, record_key AS recordKey, title_en AS titleEn, title_zh AS titleZh,
    landing_source_id AS landingSourceId, landing_source_key AS landingSourceKey, landing_content_hash AS landingContentHash,
    source_page AS sourcePage, status, deleted FROM maint_bosses WHERE title_en IN ('Solar Pillar','Nebula Pillar','Vortex Pillar','Stardust Pillar') ORDER BY id`);
  const [maintLandingResult] = await maint.query(`SELECT id, source_key AS sourceKey, content_hash AS contentHash,
    artifact_role AS artifactRole, producer_id AS producerId, producer_run_key AS producerRunKey,
    is_current AS isCurrent, JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.titleZh')) AS payloadTitleZh
    FROM source_dataset_landings WHERE dataset_type='bosses_raw' AND is_current=1 ORDER BY id`);
  const [relationResult] = await relation.query(`SELECT id, record_key AS recordKey, boss_title_en AS titleEn, boss_title_zh AS titleZh,
    source_maint_record_key AS sourceMaintRecordKey, source_maint_id AS sourceMaintId, landing_source_id AS landingSourceId,
    landing_content_hash AS landingContentHash, landing_source_key AS landingSourceKey, source_maint_table AS sourceMaintTable
    FROM relation_bosses WHERE boss_title_en IN ('Solar Pillar','Nebula Pillar','Vortex Pillar','Stardust Pillar') ORDER BY id`);
  const [projectionResult] = await relation.query(`SELECT id, code, name_en AS titleEn, name_zh AS titleZh, relation_record_key AS relationRecordKey
    FROM projection_bosses WHERE name_en IN ('Solar Pillar','Nebula Pillar','Vortex Pillar','Stardust Pillar') ORDER BY id`);
  return { landingRows: [...landingResult, ...maintLandingResult], maintLandingRows: maintLandingResult, maintRows: maintResult, relationRows: relationResult, projectionRows: projectionResult };
}

async function readApiPillars(baseUrl) {
  if (!baseUrl) return [];
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/public/bosses?page=1&limit=100`);
  if (!response.ok) throw new Error(`Boss API returned HTTP ${response.status}`);
  const body = await response.json();
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  return rows.filter((row) => ['Solar Pillar', 'Nebula Pillar', 'Vortex Pillar', 'Stardust Pillar'].includes(row.nameEn));
}

export async function runBossSourceChainAudit({ output, sourcePath = DEFAULT_SOURCE, host, port, user, password, apiBaseUrl = null, mysqlModule = null } = {}) {
  const config = loadLocalStackConfig(repoRoot);
  const db = { host: host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1', port: Number(port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306), user: user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root', password: password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root' };
  const source = JSON.parse(await fs.readFile(path.resolve(repoRoot, sourcePath), 'utf8'));
  const sourcePillars = normalizeSourcePillars(source.records);
  const mysql = loadMysqlModule({ repoRoot, mysqlModule });
  const [local, maint, relation] = await Promise.all([
    mysql.createConnection({ ...db, database: 'terria_v1_local' }),
    mysql.createConnection({ ...db, database: 'terria_v1_maint' }),
    mysql.createConnection({ ...db, database: 'terria_v1_relation' }),
  ]);
  try {
    const rows = await readRows({ local, maint, relation });
    const apiPillars = await readApiPillars(apiBaseUrl);
    const report = evaluateBossSourceChain({ sourcePillars, sourceRecordCount: source.records.length, ...rows, apiPillars });
    report.generatedAt = new Date().toISOString();
    report.readOnly = true;
    report.databaseWrites = false;
    report.sourceSnapshot = { path: sourcePath, sha256: `sha256:${crypto.createHash('sha256').update(await fs.readFile(path.resolve(repoRoot, sourcePath))).digest('hex')}`, recordCount: source.records.length, generatedAt: source.generatedAt };
    if (output) {
      await fs.mkdir(path.dirname(path.resolve(repoRoot, output)), { recursive: true });
      await fs.writeFile(path.resolve(repoRoot, output), `${JSON.stringify(report, null, 2)}\n`);
    }
    return report;
  } finally {
    await Promise.all([local.end(), maint.end(), relation.end()]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const report = await runBossSourceChainAudit({
      output: args.output,
      sourcePath: args.source ?? DEFAULT_SOURCE,
      host: args.host,
      port: args.port,
      user: args.user,
      password: args.password,
      apiBaseUrl: args['api-base-url'] ?? args.apiBaseUrl ?? null,
    });
    console.log(JSON.stringify({ output: args.output ?? null, ok: report.ok, assertions: report.assertions, scopeHash: report.scopeHash }));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  }
}
