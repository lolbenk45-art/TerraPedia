#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { resolveProjectPath } from '../lib/project-root.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const repoRoot = resolveProjectPath();

export const AUTO_NOTE_PREFIX = '[auto:wiki-crawler-npc-infobox]';

export function normalizeLookupKey(value) {
  const cleaned = cleanWikiDisplayText(value)
    .replace(/\((?:de)?buff\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function extractNpcBuffRelationCandidates(standardizedPayload) {
  const records = Array.isArray(standardizedPayload?.records) ? standardizedPayload.records : [];
  const candidates = [];

  for (const record of records) {
    const inflictions = Array.isArray(record?.wikiCrawler?.buffInflictions)
      ? record.wikiCrawler.buffInflictions
      : [];
    for (const infliction of inflictions) {
      const buffName = cleanWikiDisplayText(infliction?.buffName);
      if (!buffName) {
        continue;
      }
      candidates.push({
        npcSourceId: toNullableInteger(record?.id),
        npcInternalName: toNullableString(record?.internalName) ?? '',
        npcName: toNullableString(record?.name) ?? '',
        pageTitle: toNullableString(record?.wikiCrawler?.pageTitle) ?? '',
        sourceRevisionTimestamp: toNullableString(record?.wikiCrawler?.sourceMetadata?.revisionTimestamp) ?? null,
        buffName,
        durationText: toNullableString(infliction?.durationText) ?? '',
        sourceField: toNullableString(infliction?.sourceField) ?? '',
        sourceSection: toNullableString(infliction?.sourceSection) ?? 'infobox'
      });
    }
  }

  return candidates;
}

export function buildNpcBuffRelationPlan({
  standardizedPayload,
  npcRows,
  buffRows
} = {}) {
  const candidates = extractNpcBuffRelationCandidates(standardizedPayload);
  const npcLookup = buildNpcLookup(npcRows);
  const buffLookup = buildBuffLookup(buffRows);
  const affectedNpcIds = resolveAffectedNpcIds(standardizedPayload, npcLookup);
  const resolvedRows = [];
  const unmatchedRows = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const npc = resolveNpc(candidate, npcLookup);
    const buff = resolveBuff(candidate, buffLookup);
    if (!npc || !buff) {
      unmatchedRows.push({
        reason: !npc ? 'npc_not_found' : 'buff_not_found',
        npcSourceId: candidate.npcSourceId,
        npcInternalName: candidate.npcInternalName,
        npcName: candidate.npcName,
        buffName: candidate.buffName,
        pageTitle: candidate.pageTitle
      });
      continue;
    }

    const key = `${npc.id}:${buff.id}:${candidate.durationText}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    resolvedRows.push({
      npcId: npc.id,
      npcSourceId: candidate.npcSourceId,
      npcInternalName: npc.internalName,
      buffId: buff.id,
      buffSourceId: buff.sourceId,
      buffInternalName: buff.internalName,
      buffName: buff.englishName,
      relationType: 'inflicts',
      durationTicks: null,
      chanceValue: null,
      chanceText: null,
      conditions: null,
      notes: buildAutoNotes(candidate),
      sortOrder: resolvedRows.length
    });
  }

  return {
    candidates: candidates.length,
    affectedNpcIds,
    resolvedRows,
    unmatchedRows
  };
}

export function resolveOptions(args = {}, {
  env = process.env,
  now = new Date()
} = {}) {
  const apply = booleanOption(args.apply, false);
  const dataPath = path.resolve(
    args['data-path']
      ?? args.dataPath
      ?? path.join(repoRoot, 'data', 'generated', 'wiki-crawler-npc-bridge', 'standardized', 'npcs.standardized.json')
  );
  const reportPath = path.resolve(
    args.output
      ?? path.join(repoRoot, 'reports', 'data', `npc-buff-relations-backfill-${formatDateTag(now)}.json`)
  );

  return {
    apply,
    dataPath,
    reportPath,
    db: {
      host: args.host ?? env.TERRAPEDIA_DB_HOST ?? '127.0.0.1',
      port: Number(args.port ?? env.TERRAPEDIA_DB_PORT ?? 3306),
      user: args.user ?? env.TERRAPEDIA_DB_USERNAME ?? 'root',
      password: args.password ?? env.TERRAPEDIA_DB_PASSWORD ?? 'root',
      database: args.database ?? env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local',
      multipleStatements: true
    },
    allowNonPrimaryDb: booleanOption(args['allow-non-primary-db'] ?? env.TERRAPEDIA_ALLOW_NON_PRIMARY_DB, false)
  };
}

export async function runNpcBuffRelationBackfill(options, {
  mysqlModule = mysql,
  readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8')),
  writeReport = (filePath, payload) => writeJson(filePath, payload)
} = {}) {
  assertPrimaryDb(options.db.database, options.apply, options.allowNonPrimaryDb);
  const standardizedPayload = readJson(options.dataPath);
  const connection = await mysqlModule.createConnection(options.db);

  try {
    await connection.query('SET NAMES utf8mb4');
    const [npcRows] = await connection.query('SELECT id, source_id, internal_name, name FROM npcs WHERE deleted = 0');
    const [buffRows] = await connection.query('SELECT id, source_id, internal_name, english_name, name_zh, buff_type FROM buffs WHERE deleted = 0');
    const [existingRows] = await connection.query('SELECT COUNT(*) AS total FROM npc_buff_relations WHERE deleted = 0');
    const plan = buildNpcBuffRelationPlan({ standardizedPayload, npcRows, buffRows });

    if (options.apply) {
      await connection.beginTransaction();
      try {
        await applyNpcBuffRelationRows(connection, {
          affectedNpcIds: plan.affectedNpcIds,
          rows: plan.resolvedRows
        });
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
      beforeCount: Number(existingRows?.[0]?.total ?? 0),
      candidates: plan.candidates,
      resolved: plan.resolvedRows.length,
      unmatched: plan.unmatchedRows.length,
      unmatchedSamples: plan.unmatchedRows.slice(0, 50),
      resolvedSamples: plan.resolvedRows.slice(0, 50),
      reportPath: options.reportPath
    };
    writeReport(options.reportPath, report);
    return report;
  } finally {
    await connection.end();
  }
}

async function applyNpcBuffRelationRows(connection, { affectedNpcIds, rows }) {
  await replaceNpcBuffRelationRows(connection, { affectedNpcIds, rows });
}

async function replaceNpcBuffRelationRows(connection, { affectedNpcIds, rows }) {
  const npcIds = [...new Set((affectedNpcIds ?? []).filter((id) => id != null))];
  for (const npcId of npcIds) {
    await connection.execute(
      'DELETE FROM npc_buff_relations WHERE npc_id = ? AND notes LIKE ?',
      [npcId, `${AUTO_NOTE_PREFIX}%`]
    );
  }
  for (const row of rows) {
    await connection.execute(
      `INSERT INTO npc_buff_relations
        (npc_id, buff_id, buff_source_id, relation_type, duration_ticks, chance_value, chance_text, conditions, notes, sort_order, status, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        row.npcId,
        row.buffId,
        row.buffSourceId,
        row.relationType,
        row.durationTicks,
        row.chanceValue,
        row.chanceText,
        row.conditions,
        row.notes,
        row.sortOrder
      ]
    );
  }
}

function resolveAffectedNpcIds(standardizedPayload, npcLookup) {
  const records = Array.isArray(standardizedPayload?.records) ? standardizedPayload.records : [];
  const ids = [];
  const seen = new Set();
  for (const record of records) {
    if (!record?.wikiCrawler) {
      continue;
    }
    const npc = resolveNpc({
      npcSourceId: toNullableInteger(record?.id),
      npcInternalName: toNullableString(record?.internalName) ?? '',
      npcName: toNullableString(record?.name) ?? '',
      pageTitle: toNullableString(record?.wikiCrawler?.pageTitle) ?? ''
    }, npcLookup);
    if (!npc || seen.has(npc.id)) {
      continue;
    }
    seen.add(npc.id);
    ids.push(npc.id);
  }
  return ids;
}

function buildNpcLookup(rows) {
  const lookup = {
    bySourceId: new Map(),
    byInternal: new Map(),
    byName: new Map()
  };
  for (const row of Array.isArray(rows) ? rows : []) {
    const npc = {
      id: toNullableInteger(row?.id),
      sourceId: toNullableInteger(row?.source_id),
      internalName: toNullableString(row?.internal_name) ?? '',
      name: toNullableString(row?.name) ?? ''
    };
    if (npc.id == null) {
      continue;
    }
    if (npc.sourceId != null) {
      lookup.bySourceId.set(String(npc.sourceId), npc);
    }
    const internalKey = normalizeLookupKey(npc.internalName);
    if (internalKey && !lookup.byInternal.has(internalKey)) {
      lookup.byInternal.set(internalKey, npc);
    }
    const nameKey = normalizeLookupKey(npc.name);
    if (nameKey && !lookup.byName.has(nameKey)) {
      lookup.byName.set(nameKey, npc);
    }
  }
  return lookup;
}

function buildBuffLookup(rows) {
  const lookup = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const buff = {
      id: toNullableInteger(row?.id),
      sourceId: toNullableInteger(row?.source_id),
      internalName: toNullableString(row?.internal_name) ?? '',
      englishName: toNullableString(row?.english_name) ?? toNullableString(row?.internal_name) ?? '',
      nameZh: toNullableString(row?.name_zh) ?? '',
      buffType: toNullableString(row?.buff_type) ?? ''
    };
    if (buff.id == null) {
      continue;
    }
    for (const value of [buff.internalName, buff.englishName, buff.nameZh]) {
      const key = normalizeLookupKey(value);
      if (key && !lookup.has(key)) {
        lookup.set(key, buff);
      }
    }
  }
  return lookup;
}

function resolveNpc(candidate, lookup) {
  if (candidate.npcSourceId != null) {
    const bySource = lookup.bySourceId.get(String(candidate.npcSourceId));
    if (bySource) {
      return bySource;
    }
  }
  return lookup.byInternal.get(normalizeLookupKey(candidate.npcInternalName))
    ?? lookup.byName.get(normalizeLookupKey(candidate.npcName))
    ?? lookup.byName.get(normalizeLookupKey(candidate.pageTitle))
    ?? null;
}

function resolveBuff(candidate, lookup) {
  return lookup.get(normalizeLookupKey(candidate.buffName)) ?? null;
}

function buildAutoNotes(candidate) {
  const parts = [`${AUTO_NOTE_PREFIX} page=${candidate.pageTitle || candidate.npcName || candidate.npcInternalName}`];
  if (candidate.durationText) {
    parts.push(`duration=${candidate.durationText}`);
  }
  if (candidate.sourceRevisionTimestamp) {
    parts.push(`revision=${candidate.sourceRevisionTimestamp}`);
  }
  return parts.join('; ');
}

function cleanWikiDisplayText(value) {
  let text = String(value ?? '').trim();
  if (!text) {
    return '';
  }
  text = text.replace(/\{\{\s*[^|{}]+\|\s*([^|{}]+)(?:\|[^{}]*)?\}\}/g, '$1');
  return text
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/''+/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNullableString(value) {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}

function toNullableInteger(value) {
  if (value == null || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function formatDateTag(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function assertPrimaryDb(database, apply, allowNonPrimaryDb) {
  if (!apply) {
    return;
  }
  if (String(database ?? '').trim() === 'terria_v1_local') {
    return;
  }
  if (allowNonPrimaryDb) {
    return;
  }
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=terria_v1_local or pass --allow-non-primary-db=true explicitly.`);
}

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  try {
    const options = resolveOptions(parseCliArgs(process.argv.slice(2)));
    const report = await runNpcBuffRelationBackfill(options);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('[backfill-npc-buff-relations-from-wiki-crawler] failed');
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}
