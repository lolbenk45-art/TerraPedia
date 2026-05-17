#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { resolveProjectPath } from '../lib/project-root.mjs';

const require = createRequire(import.meta.url);
const repoRoot = resolveProjectPath();

export function buildNpcFlagBackfillPlan({ standardizedPayload, npcRows } = {}) {
  const standardizedRecords = Array.isArray(standardizedPayload?.records) ? standardizedPayload.records : [];
  const standardizedByInternal = new Map(
    standardizedRecords
      .map((record) => [toText(record?.internalName), record])
      .filter(([internalName, record]) => internalName && record)
  );
  const updates = [];
  const samples = [];

  for (const row of Array.isArray(npcRows) ? npcRows : []) {
    const record = standardizedByInternal.get(toText(row?.internal_name));
    if (!record) continue;

    const next = {
      isBoss: toFlag(record?.flags?.boss),
      isFriendly: toFlag(record?.flags?.friendly),
      isTownNpc: toFlag(record?.extras?.townNPC === true || record?.extras?.townnpc === true),
    };
    const current = {
      isBoss: toFlag(row?.is_boss),
      isFriendly: toFlag(row?.is_friendly),
      isTownNpc: toFlag(row?.is_town_npc),
    };

    if (
      current.isBoss === next.isBoss &&
      current.isFriendly === next.isFriendly &&
      current.isTownNpc === next.isTownNpc
    ) {
      continue;
    }

    const update = {
      id: toInt(row?.id),
      gameId: toInt(row?.game_id),
      internalName: toText(row?.internal_name),
      before: current,
      after: next,
    };
    if (update.id == null) continue;
    updates.push(update);
    if (samples.length < 50) samples.push(update);
  }

  return {
    checked: Array.isArray(npcRows) ? npcRows.length : 0,
    candidateUpdated: updates.length,
    updates,
    samples,
    townNpcAfterCount: updates.reduce((count, update) => count + Number(update.after.isTownNpc === 1), 0),
  };
}

export function resolveOptions(args = {}, { env = process.env, now = new Date() } = {}) {
  const apply = booleanOption(args.apply, false);
  return {
    apply,
    dataPath: path.resolve(
      args['data-path']
        ?? args.dataPath
        ?? path.join(repoRoot, 'data', 'standardized', 'npcs.standardized.json')
    ),
    reportPath: path.resolve(
      args.output
        ?? path.join(repoRoot, 'reports', 'data', `npc-flags-backfill-${formatDateTag(now)}.json`)
    ),
    db: {
      host: args.host ?? env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
      port: Number(args.port ?? env.TERRAPEDIA_DB_PORT ?? 3306),
      user: args.user ?? env.TERRAPEDIA_DB_USERNAME ?? 'root',
      password: args.password ?? env.TERRAPEDIA_DB_PASSWORD ?? 'root',
      database: args.database ?? env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local',
      multipleStatements: true,
    },
    allowNonPrimaryDb: booleanOption(args['allow-non-primary-db'] ?? env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB, false),
  };
}

export async function runNpcFlagBackfill(options, {
  mysqlModule = null,
  readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8')),
  writeReport = (filePath, payload) => writeJson(filePath, payload),
} = {}) {
  assertPrimaryDb(options.db.database, options.apply, options.allowNonPrimaryDb);
  const standardizedPayload = readJson(options.dataPath);
  const mysqlClient = mysqlModule ?? require('mysql2/promise');
  const connection = await mysqlClient.createConnection(options.db);

  try {
    await connection.query('SET NAMES utf8mb4');
    const [npcRows] = await connection.query(`
      SELECT id, game_id, internal_name, is_boss, is_friendly, is_town_npc
      FROM npcs
      WHERE deleted = 0
      ORDER BY id ASC
    `);
    const plan = buildNpcFlagBackfillPlan({ standardizedPayload, npcRows });
    let appliedUpdated = 0;

    if (options.apply) {
      await connection.beginTransaction();
      try {
        appliedUpdated = await applyNpcFlagUpdates(connection, plan.updates);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      apply: options.apply,
      database: options.db.database,
      dataPath: options.dataPath,
      checked: plan.checked,
      candidateUpdated: plan.candidateUpdated,
      appliedUpdated,
      townNpcAfterCountInUpdatedRows: plan.townNpcAfterCount,
      samples: plan.samples,
      reportPath: options.reportPath,
    };
    writeReport(options.reportPath, report);
    return report;
  } finally {
    await connection.end();
  }
}

async function applyNpcFlagUpdates(connection, updates) {
  let applied = 0;
  for (const update of updates) {
    const [result] = await connection.execute(
      `UPDATE npcs
          SET is_boss = ?,
              is_friendly = ?,
              is_town_npc = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [update.after.isBoss, update.after.isFriendly, update.after.isTownNpc, update.id]
    );
    applied += Number(result?.affectedRows || 0);
  }
  return applied;
}

function toFlag(value) {
  if (value === true) return 1;
  if (value === false || value == null || value === '') return 0;
  return Number(value) ? 1 : 0;
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function toInt(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function formatDateTag(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function assertPrimaryDb(database, apply, allowNonPrimaryDb) {
  if (!apply) return;
  if (String(database ?? '').trim() === 'terria_v1_local') return;
  if (allowNonPrimaryDb) return;
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  try {
    const options = resolveOptions(parseCliArgs(process.argv.slice(2)));
    const report = await runNpcFlagBackfill(options);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('[backfill-npc-flags-from-standardized] failed');
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}
