#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { runLandingImport } from '../landing/import-source-dataset-landings.mjs';
import { runMaintSync } from '../maint/sync-landing-to-maint.mjs';
import { buildBossSeriesRelations } from './boss-series-processor.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';

export const BOSS_SOURCE_REFRESH_OPERATION_ID = 'canonical-boss-source-refresh-offline';
export const BOSS_SOURCE_REFRESH_ALLOW_LIST = Object.freeze([
  'local.source_dataset_landings.bosses_raw',
  'maint.maint_bosses',
  'relation.relation_bosses',
  'relation.projection_bosses.name_zh',
]);

export function buildBossSourceRefreshPlan({
  inputPath,
  inputSha256,
  actualSha256,
  recordCount,
} = {}) {
  if (inputSha256 !== actualSha256) throw new Error('Boss source snapshot hash drift');
  if (!/^sha256:[a-f0-9]{64}$/.test(String(inputSha256 ?? ''))) {
    throw new Error('Boss source snapshot hash must be sha256');
  }
  if (Number(recordCount) !== 33) throw new Error('Boss source snapshot must contain 33 Boss records');
  return {
    operationId: BOSS_SOURCE_REFRESH_OPERATION_ID,
    inputPath: path.normalize(String(inputPath ?? '')),
    inputSha256,
    datasets: ['bosses_raw'],
    allowList: [...BOSS_SOURCE_REFRESH_ALLOW_LIST],
    databaseWrites: true,
    networkAccess: false,
  };
}

export function sha256File(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

export async function runBossSourceRefreshOffline({
  inputPath = 'data/generated/wiki-bosses.latest.json',
  expectedSha256,
  reportRoot = 'reports/runtime/local-data-chain-closure/boss-source-refresh-offline',
  db = {},
  dependencies = {},
} = {}) {
  const resolvedInput = path.resolve(inputPath);
  const payload = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
  const plan = buildBossSourceRefreshPlan({
    inputPath: resolvedInput,
    inputSha256: expectedSha256,
    actualSha256: sha256File(resolvedInput),
    recordCount: payload.records?.length,
  });
  fs.mkdirSync(path.resolve(reportRoot), { recursive: true });
  const dbOptions = {
    host: '127.0.0.1',
    port: 13306,
    user: 'root',
    password: 'root',
    database: 'terria_v1_local',
    ...db,
  };
  const runLanding = dependencies.runLandingImport ?? runLandingImport;
  const loadLocalLandingRows = dependencies.loadLocalLandingRows
    ?? ((options) => loadCurrentBossLandingRows(options, dependencies));
  const landingLocal = await runLanding({
    apply: true,
    datasets: ['bosses_raw'],
    repoRoot: process.cwd(),
    db: dbOptions,
    reportPath: path.resolve(reportRoot, 'landing-local.json'),
  });
  const localLandingRows = await loadLocalLandingRows(dbOptions);
  const maint = await (dependencies.runMaintSync ?? runMaintSync)({
    apply: true,
    scopes: ['bosses'],
    ...dbOptions,
    database: 'terria_v1_maint',
  }, {
    loadLandingRows: async () => localLandingRows,
  });
  const relation = dependencies.runRelationSync
    ? await dependencies.runRelationSync({
      apply: true, scopes: ['boss'], createDatabase: false,
      localDatabase: dbOptions.database, maintDatabase: 'terria_v1_maint', relationDatabase: 'terria_v1_relation',
    })
    : await runBossRelationRefresh({ db: dbOptions });
  return { ...plan, landing: { local: landingLocal }, maint, relation };
}

async function loadCurrentBossLandingRows(dbOptions, dependencies = {}) {
  const mysql = dependencies.mysqlModule ?? loadMysqlModule();
  const connection = await mysql.createConnection({ ...dbOptions, database: dbOptions.database });
  try {
    const [rows] = await connection.query(
      'SELECT id, dataset_type, provider, source_key, source_page, source_revision_timestamp, content_hash, payload_json, fetched_at, parsed_at FROM `source_dataset_landings` WHERE is_current = 1 AND dataset_type = ? ORDER BY id',
      ['bosses_raw'],
    );
    return rows;
  } finally {
    await connection.end();
  }
}

async function runBossRelationRefresh({ db }) {
  const mysql = (await import('../lib/mysql-module.mjs')).loadMysqlModule();
  const maintConnection = await mysql.createConnection({ ...db, database: 'terria_v1_maint' });
  const relationConnection = await mysql.createConnection({ ...db, database: 'terria_v1_relation' });
  try {
    const [maintBossRows] = await maintConnection.query('SELECT * FROM `maint_bosses` WHERE deleted = 0');
    const [relationNpcRows] = await relationConnection.query('SELECT * FROM `relation_npcs` WHERE deleted = 0');
    const normalizedNpcRows = relationNpcRows.map((row) => ({
      internalName: row.npc_internal_name,
      englishName: row.npc_english_name,
      sourceId: row.npc_source_id,
    }));
    const built = buildBossSeriesRelations({ maintBossRows, relationNpcRows: normalizedNpcRows });
    await relationConnection.beginTransaction();
    try {
      for (const row of built.relationBosses) {
        await updateBossRelationRow(relationConnection, row);
        await updateBossProjectionRow(relationConnection, row);
      }
      await relationConnection.commit();
    } catch (error) {
      await relationConnection.rollback();
      throw error;
    }
    return { apply: true, relationBossRows: built.relationBosses.length, projectionBossRows: built.relationBosses.length, writes: ['relation_bosses.boss_title_zh', 'relation_bosses.page_title_zh', 'projection_bosses.name_zh'] };
  } finally {
    await Promise.all([maintConnection.end(), relationConnection.end()]);
  }
}

async function updateBossRelationRow(connection, row) {
  await connection.execute(
    'UPDATE `relation_bosses` SET `boss_title_zh` = ?, `page_title_zh` = ? WHERE `boss_title_en` = ?',
    [row.bossTitleZh, row.pageTitleZh, row.bossTitleEn],
  );
}

async function updateBossProjectionRow(connection, row) {
  await connection.execute(
    'UPDATE `projection_bosses` SET `name_zh` = ? WHERE `name_en` = ?',
    [row.bossTitleZh, row.bossTitleEn],
  );
}


if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  }));
  runBossSourceRefreshOffline({
    inputPath: args.input,
    expectedSha256: args['expected-sha256'],
    reportRoot: args['report-root'],
    db: {
      ...(args.host ? { host: args.host } : {}),
      ...(args.port ? { port: Number(args.port) } : {}),
      ...(args.user ? { user: args.user } : {}),
      ...(args.password ? { password: args.password } : {}),
      ...(args.database ? { database: args.database } : {}),
    },
  }).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
