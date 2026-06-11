#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const CONTAINER_LIKE = /\b(chest|crate|treasure\s+bag|lock\s*box|present|goodie\s+bag)\b/i;
const REVIEWED_POSITIVE_ID_FALLBACKS = new Map([
  ['darkmage', 'DD2DarkMageT1'],
  ['diabolist', 'DiabolistRed'],
  ['frozenzombie', 'ZombieEskimo'],
  ['lamia', 'DesertLamiaLight'],
  ['ogre', 'DD2OgreT2'],
  ['pigron', 'PigronCorruption'],
  ['rustyarmoredbones', 'RustyArmoredBonesAxe']
]);

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseItemSourceRefIdResolutionArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apply = booleanOption(options.apply, false);
  const confirmLocalCompat = booleanOption(options['confirm-local-compat'] ?? options.confirmLocalCompat, false);
  const allowBulk = booleanOption(options['allow-bulk'] ?? options.allowBulk, false);
  if (apply && !confirmLocalCompat) {
    throw new Error('item source ref id resolution apply requires --confirm-local-compat=true');
  }
  if (apply && !allowBulk) {
    throw new Error('item source ref id resolution apply requires --allow-bulk=true');
  }
  return {
    outputPath: options.output ?? null,
    backupDir: options['backup-dir'] ?? options.backupDir ?? path.join(process.cwd(), 'data', 'backups', 'item-source-ref-id-resolution'),
    batchId: options['batch-id'] ?? options.batchId ?? null,
    apply,
    confirmLocalCompat,
    allowBulk,
    database: options.database ?? 'terria_v1_local',
    host: options.host ?? null,
    port: options.port ?? null,
    user: options.user ?? null,
    password: options.password ?? null
  };
}

export function buildItemSourceRefIdResolutionPlan({ sourceRows = [], npcRows = [] } = {}) {
  const activeSourceRows = (Array.isArray(sourceRows) ? sourceRows : [])
    .filter((row) => Number(row.status) === 1 && Number(row.deleted) === 0)
    .filter((row) => ['npc', 'boss'].includes(normalizeText(row.source_ref_type)));
  const npcLookup = buildNpcLookup(npcRows);
  const updates = [];
  const blocked = [];

  for (const row of activeSourceRows) {
    const sourceRefType = normalizeText(row.source_ref_type);
    const sourceRefName = normalizeDisplayText(row.source_ref_name);
    const existingRefId = toNullableInteger(row.source_ref_id);
    if (existingRefId != null) {
      blocked.push(blockedRow(row, 'existing_ref_id_not_null'));
      continue;
    }
    if (!sourceRefName) {
      blocked.push(blockedRow(row, 'missing_source_ref_name'));
      continue;
    }
    if (CONTAINER_LIKE.test(sourceRefName)) {
      blocked.push(blockedRow(row, 'container_like_source_name'));
      continue;
    }
    const matchName = normalizeSourceRefMatchName(sourceRefName);
    let matches = (npcLookup.get(normalizeIdentity(matchName)) ?? [])
      .filter((npc) => sourceRefType === 'boss' ? npc.isBoss : !npc.isBoss);
    matches = choosePreferredMatches({ matches, sourceRow: row, sourceRefType, matchName });
    if (matches.length === 0) {
      blocked.push(blockedRow(row, sourceRefType === 'boss' ? 'boss_name_not_found' : 'npc_name_not_found'));
      continue;
    }
    if (matches.length > 1) {
      blocked.push(blockedRow(row, sourceRefType === 'boss' ? 'ambiguous_boss_name' : 'ambiguous_npc_name', matches));
      continue;
    }
    const target = matches[0];
    updates.push({
      id: Number(row.id),
      itemId: toNullableInteger(row.item_id),
      sourceRefType,
      sourceRefName,
      matchName,
      oldSourceRefId: existingRefId,
      newSourceRefId: target.id,
      targetInternalName: target.internalName,
      targetName: target.name
    });
  }

  updates.sort((a, b) => a.id - b.id);
  blocked.sort((a, b) => a.id - b.id);
  return {
    summary: {
      inputRows: activeSourceRows.length,
      npcRowsMissingRefId: activeSourceRows.filter((row) => normalizeText(row.source_ref_type) === 'npc' && toNullableInteger(row.source_ref_id) == null).length,
      bossRowsMissingRefId: activeSourceRows.filter((row) => normalizeText(row.source_ref_type) === 'boss' && toNullableInteger(row.source_ref_id) == null).length,
      rowsToUpdate: updates.length,
      blockedRows: blocked.length,
      ambiguousRows: blocked.filter((row) => row.reason.startsWith('ambiguous_')).length,
      validationErrors: 0
    },
    updates,
    blocked
  };
}

export async function runItemSourceRefIdResolution(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const batchId = options.batchId ?? `item-source-ref-id-resolution-${now.toISOString().replace(/[:.]/g, '-')}`;
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlModule = dependencies.mysqlModule ?? require('mysql2/promise');
  const connectionConfig = {
    host: options.host ?? process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1',
    port: Number(options.port ?? process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306),
    user: options.user ?? process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root',
    password: options.password ?? process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root',
    database: options.database ?? process.env.TERRAPEDIA_DB_NAME ?? config.database?.name ?? 'terria_v1_local'
  };
  if (options.apply && connectionConfig.database !== 'terria_v1_local') {
    throw new Error(`Refusing item source ref id resolution apply to non-local database: ${connectionConfig.database}`);
  }

  const connection = await mysqlModule.createConnection(connectionConfig);
  let plan;
  let beforeRows = [];
  let updatedRows = 0;
  try {
    const [sourceRows, npcRows] = await Promise.all([
      readCandidateSourceRows(connection),
      readNpcs(connection)
    ]);
    plan = buildItemSourceRefIdResolutionPlan({ sourceRows, npcRows });
    const ids = plan.updates.map((row) => row.id);
    beforeRows = ids.length ? await readRowsByIds(connection, ids) : [];
    if (options.apply && ids.length) {
      await connection.beginTransaction();
      for (const update of plan.updates) {
        const [result] = await connection.execute(
          `UPDATE \`item_acquisition_sources\`
SET \`source_ref_id\` = ?,
    \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`id\` = ?
  AND \`status\` = 1
  AND \`deleted\` = 0
  AND \`source_ref_id\` IS NULL`,
          [update.newSourceRefId, update.id]
        );
        updatedRows += Number(result?.affectedRows ?? 0);
      }
      if (updatedRows !== plan.updates.length) {
        throw new Error(`Expected to update ${plan.updates.length} source_ref_id rows, affected ${updatedRows}`);
      }
      await connection.commit();
    }
  } catch (error) {
    if (options.apply) await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }

  const backupPath = path.resolve(process.cwd(), options.backupDir, `${batchId}.before.json`);
  writeJson(backupPath, {
    generatedAt: now.toISOString(),
    batchId,
    connection: { host: connectionConfig.host, port: connectionConfig.port, database: connectionConfig.database },
    rows: beforeRows
  });

  const report = {
    generatedAt: now.toISOString(),
    batchId,
    apply: Boolean(options.apply),
    connection: { host: connectionConfig.host, port: connectionConfig.port, database: connectionConfig.database, user: connectionConfig.user },
    backupPath,
    summary: {
      ...plan.summary,
      updatedRows
    },
    updates: plan.updates,
    blocked: plan.blocked,
    rollbackSql: buildRollbackSql(beforeRows)
  };
  if (options.outputPath) {
    writeJson(path.resolve(process.cwd(), options.outputPath), report);
  }
  return report;
}

async function readCandidateSourceRows(connection) {
  const [rows] = await connection.execute(
    `SELECT *
FROM \`item_acquisition_sources\`
WHERE \`status\` = 1
  AND \`deleted\` = 0
  AND \`source_ref_type\` IN ('npc', 'boss')
ORDER BY \`id\``
  );
  return Array.isArray(rows) ? rows : [];
}

async function readNpcs(connection) {
  const [rows] = await connection.execute(
    `SELECT id, name, internal_name, is_boss, boss_group_id, is_town_npc, status, deleted
FROM \`npcs\`
WHERE \`status\` = 1
  AND \`deleted\` = 0
  AND TRIM(COALESCE(\`name\`, '')) <> ''
ORDER BY \`id\``
  );
  return Array.isArray(rows) ? rows : [];
}

async function readRowsByIds(connection, ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT * FROM \`item_acquisition_sources\` WHERE \`id\` IN (${placeholders}) ORDER BY \`id\``,
    ids
  );
  return Array.isArray(rows) ? rows : [];
}

function buildNpcLookup(rows) {
  const lookup = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (Number(row.status) !== 1 || Number(row.deleted) !== 0) continue;
    const name = normalizeDisplayText(row.name);
    if (!name) continue;
    const npc = {
      id: Number(row.id),
      name,
      internalName: normalizeDisplayText(row.internal_name),
      isBoss: Number(row.is_boss) === 1,
      isTownNpc: Number(row.is_town_npc) === 1
    };
    const key = normalizeIdentity(name);
    const list = lookup.get(key) ?? [];
    list.push(npc);
    lookup.set(key, list);
  }
  return lookup;
}

function blockedRow(row, reason, matches = []) {
  return {
    id: Number(row.id),
    itemId: toNullableInteger(row.item_id),
    sourceRefType: normalizeText(row.source_ref_type),
    sourceRefName: normalizeDisplayText(row.source_ref_name),
    oldSourceRefId: toNullableInteger(row.source_ref_id),
    reason,
    matchIds: matches.map((match) => match.id)
  };
}

function buildRollbackSql(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const refIdCases = rows
    .map((row) => `WHEN ${Number(row.id)} THEN ${row.source_ref_id == null ? 'NULL' : Number(row.source_ref_id)}`)
    .join(' ');
  const ids = rows.map((row) => Number(row.id)).filter(Number.isInteger);
  return `UPDATE \`item_acquisition_sources\` SET \`source_ref_id\` = CASE \`id\` ${refIdCases} END WHERE \`id\` IN (${ids.join(', ')});`;
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase();
  return text || null;
}

function normalizeDisplayText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeSourceRefMatchName(value) {
  let text = normalizeDisplayText(value);
  if (!text) return null;
  text = text.replace(/\bTravelling Merchant\b/gi, 'Traveling Merchant');
  text = text.replace(/\s+for$/i, '').trim();
  const conditionMatch = text.match(/^(.+?)\s+(?:during|after|at|in|while|when)\s+.+$/i);
  if (conditionMatch) text = conditionMatch[1].trim();
  return text || null;
}

function choosePreferredMatches({ matches, sourceRow, sourceRefType, matchName }) {
  if (!Array.isArray(matches) || matches.length <= 1) return matches;
  if (sourceRefType === 'npc' && normalizeText(sourceRow.source_type) === 'shop') {
    const townMatches = matches.filter((match) => match.isTownNpc);
    if (townMatches.length === 1) return townMatches;
  }
  const fallbackInternalName = REVIEWED_POSITIVE_ID_FALLBACKS.get(normalizeIdentity(matchName));
  if (fallbackInternalName) {
    const reviewedMatches = matches.filter((match) => match.internalName === fallbackInternalName);
    if (reviewedMatches.length === 1) return reviewedMatches;
  }
  const segmentHeadMatch = chooseSegmentHeadMatch(matches);
  return segmentHeadMatch ? [segmentHeadMatch] : matches;
}

function chooseSegmentHeadMatch(matches) {
  const segmentRows = matches
    .map((match) => {
      const parsed = String(match.internalName ?? '').match(/^(.*?)(Head|Body|Tail)$/);
      return parsed ? { match, base: parsed[1], role: parsed[2] } : null;
    })
    .filter(Boolean);
  if (segmentRows.length !== matches.length) return null;
  if (new Set(segmentRows.map((row) => row.base)).size !== 1) return null;
  const headRows = segmentRows.filter((row) => row.role === 'Head');
  return headRows.length === 1 ? headRows[0].match : null;
}

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function toNullableInteger(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runItemSourceRefIdResolution(parseItemSourceRefIdResolutionArgs())
    .then((report) => {
      console.log(JSON.stringify(report.summary, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
