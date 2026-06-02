#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const moduleRequire = createRequire(import.meta.url);
const repoRoot = getProjectRoot();
const DEFAULT_REPORT_PATH = path.join(repoRoot, 'reports', 'biome-wikitext-linkage-dry-run-2026-06-02.json');
const DEFAULT_OUTPUT_REPORT_PATH = path.join(repoRoot, 'reports', 'biome-wikitext-resolved-import-plan-2026-06-02.json');
const DEFAULT_DB_NAME = 'terria_v1_local';
const SOURCE_PROVIDER = 'terraria.wiki.gg';

export function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const separatorIndex = body.indexOf('=');
    if (separatorIndex >= 0) {
      args[body.slice(0, separatorIndex)] = body.slice(separatorIndex + 1);
    } else {
      args[body] = 'true';
    }
  }
  return args;
}

export function buildBiomeWikitextResolvedImportPlan({ report }) {
  const itemCandidates = Array.isArray(report?.resolvedOnly?.itemBiomeCandidates)
    ? report.resolvedOnly.itemBiomeCandidates
    : [];
  const npcCandidates = Array.isArray(report?.resolvedOnly?.npcBiomeCandidates)
    ? report.resolvedOnly.npcBiomeCandidates
    : [];
  return {
    generatedAt: new Date().toISOString(),
    itemCandidates,
    npcCandidates,
    summary: {
      itemCandidates: makePlanStats(itemCandidates.length),
      npcCandidates: makePlanStats(npcCandidates.length),
    },
  };
}

export function buildItemInsertRows({ candidates, biomeByCode, itemByInternalName }) {
  const valid = [];
  const skipped = [];
  for (const [index, candidate] of (Array.isArray(candidates) ? candidates : []).entries()) {
    const biomeId = biomeByCode.get(normalizeKey(candidate?.biomeCode));
    if (!biomeId) {
      skipped.push({ candidate, reason: 'missing_biome' });
      continue;
    }
    const itemId = itemByInternalName.get(normalizeKey(candidate?.itemInternalName));
    if (!itemId) {
      skipped.push({ candidate, reason: 'missing_item' });
      continue;
    }
    valid.push({
      candidate,
      biomeId,
      itemId,
      itemName: toNullableText(candidate?.itemName),
      relationType: toNullableText(candidate?.relationType) ?? 'relevant_to',
      source: toNullableText(candidate?.source),
      notes: joinNotes(candidate?.source, candidate?.note),
      noteOnly: toNullableText(candidate?.note),
      sourcePage: toNullableText(candidate?.sourcePage),
      sortOrder: index + 1,
    });
  }
  return { valid, skipped };
}

export function buildNpcInsertRows({ candidates, biomeByCode, npcByInternalName }) {
  const valid = [];
  const skipped = [];
  for (const [index, candidate] of (Array.isArray(candidates) ? candidates : []).entries()) {
    const biomeId = biomeByCode.get(normalizeKey(candidate?.biomeCode));
    if (!biomeId) {
      skipped.push({ candidate, reason: 'missing_biome' });
      continue;
    }
    const npcId = npcByInternalName.get(normalizeKey(candidate?.npcInternalName));
    if (!npcId) {
      skipped.push({ candidate, reason: 'missing_npc' });
      continue;
    }
    valid.push({
      candidate,
      biomeId,
      npcId,
      npcName: toNullableText(candidate?.npcName),
      spawnContext: toNullableText(candidate?.source) ?? '',
      notes: toNullableText(candidate?.note),
      sourcePage: toNullableText(candidate?.sourcePage),
      sortOrder: index + 1,
    });
  }
  return { valid, skipped };
}

export function assertPrimaryDb(database, allowNonPrimaryDb) {
  if (String(database || '').trim() === DEFAULT_DB_NAME) return;
  if (allowNonPrimaryDb) return;
  throw new Error(`Refusing to write to non-primary database '${database}'. Set TERRAPEDIA_DB_NAME=${DEFAULT_DB_NAME} or pass --allow-non-primary-db=true explicitly.`);
}

export function normalizeKey(value) {
  return toNullableText(value)?.toLowerCase() ?? null;
}

export function joinNotes(source, note) {
  return [toNullableText(source), toNullableText(note)].filter(Boolean).join(' | ') || null;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const apply = String(options.apply ?? 'false').toLowerCase() === 'true';
  const allowNonPrimaryDb = String(options['allow-non-primary-db'] ?? 'false').toLowerCase() === 'true';
  const reportPath = path.resolve(process.cwd(), options.report ?? DEFAULT_REPORT_PATH);
  const outputReportPath = path.resolve(process.cwd(), options['output-report'] ?? DEFAULT_OUTPUT_REPORT_PATH);
  const database = process.env.TERRAPEDIA_DB_NAME || DEFAULT_DB_NAME;
  assertPrimaryDb(database, allowNonPrimaryDb);

  const sourceReport = loadJson(reportPath);
  const plan = buildBiomeWikitextResolvedImportPlan({ report: sourceReport });
  const mysql = resolveMysql();
  const connection = await mysql.createConnection(buildConnectionConfig(database));

  try {
    const lookups = await loadDbLookups(connection);
    const itemRows = buildItemInsertRows({
      candidates: plan.itemCandidates,
      biomeByCode: lookups.biomeByCode,
      itemByInternalName: lookups.itemByInternalName,
    });
    const npcRows = buildNpcInsertRows({
      candidates: plan.npcCandidates,
      biomeByCode: lookups.biomeByCode,
      npcByInternalName: lookups.npcByInternalName,
    });

    const summary = {
      itemCandidates: {
        ...plan.summary.itemCandidates,
        valid: itemRows.valid.length,
        skipped: itemRows.skipped.length,
      },
      npcCandidates: {
        ...plan.summary.npcCandidates,
        valid: npcRows.valid.length,
        skipped: npcRows.skipped.length,
      },
      writes: makeWriteSummary(),
    };

    if (apply) {
      await connection.beginTransaction();
      try {
        summary.writes = await applyRows(connection, { itemRows: itemRows.valid, npcRows: npcRows.valid });
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    const output = {
      entity: 'biome_wikitext_resolved_import_plan',
      generatedAt: new Date().toISOString(),
      mode: apply ? 'apply' : 'dry-run',
      sourceReportPath: reportPath,
      database,
      summary,
      skipped: {
        items: itemRows.skipped,
        npcs: npcRows.skipped,
      },
      sample: {
        itemRows: itemRows.valid.slice(0, 10),
        npcRows: npcRows.valid.slice(0, 10),
      },
    };
    fs.mkdirSync(path.dirname(outputReportPath), { recursive: true });
    fs.writeFileSync(outputReportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      outputReportPath,
      mode: output.mode,
      summary: output.summary,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

async function applyRows(connection, { itemRows, npcRows }) {
  const summary = makeWriteSummary();
  for (const row of itemRows) {
    await upsertBiomeResource(connection, row, summary.biomeResources);
    await upsertItemBiome(connection, row, summary.itemBiomes);
    await upsertItemAcquisitionSource(connection, row, summary.itemAcquisitionSources);
  }
  for (const row of npcRows) {
    await upsertNpcBiome(connection, row, summary.npcBiomes);
  }
  return summary;
}

async function upsertBiomeResource(connection, row, stats) {
  const [existingRows] = await connection.execute(
    `SELECT id
       FROM biome_resources
      WHERE biome_id = ?
        AND COALESCE(item_id, 0) = ?
        AND COALESCE(resource_name_raw, '') = ?
        AND resource_type = ?
      LIMIT 1`,
    [row.biomeId, row.itemId ?? 0, row.itemName ?? '', row.relationType]
  );
  if (existingRows.length > 0) {
    await connection.execute(
      `UPDATE biome_resources
          SET notes = ?,
              sort_order = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [row.notes, row.sortOrder, Number(existingRows[0].id)]
    );
    stats.updated += 1;
    return;
  }
  await connection.execute(
    `INSERT INTO biome_resources (biome_id, item_id, resource_name_raw, resource_type, notes, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.biomeId, row.itemId, row.itemName, row.relationType, row.notes, row.sortOrder]
  );
  stats.created += 1;
}

async function upsertItemBiome(connection, row, stats) {
  const [result] = await connection.execute(
    `INSERT INTO item_biomes (item_id, biome_id, relation_type, notes, sort_order)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE notes = VALUES(notes), sort_order = VALUES(sort_order), updated_at = NOW()`,
    [row.itemId, row.biomeId, row.relationType, row.notes, row.sortOrder]
  );
  addUpsertStats(stats, result);
}

async function upsertItemAcquisitionSource(connection, row, stats) {
  const sourceRefType = 'biome_wikitext';
  const [existingRows] = await connection.execute(
    `SELECT id
       FROM item_acquisition_sources
      WHERE item_id = ?
        AND source_type = ?
        AND source_ref_type = ?
        AND COALESCE(source_ref_name, '') = ?
        AND COALESCE(biome_id, 0) = ?
        AND COALESCE(source_page, '') = ?
      LIMIT 1`,
    [row.itemId, row.relationType, sourceRefType, row.source ?? '', row.biomeId ?? 0, row.sourcePage ?? '']
  );
  if (existingRows.length > 0) {
    await connection.execute(
      `UPDATE item_acquisition_sources
          SET notes = ?,
              sort_order = ?,
              source_provider = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [row.noteOnly, row.sortOrder, SOURCE_PROVIDER, Number(existingRows[0].id)]
    );
    stats.updated += 1;
    return;
  }
  await connection.execute(
    `INSERT INTO item_acquisition_sources
      (item_id, source_type, source_ref_type, source_ref_name, biome_id, notes, source_provider, source_page, sort_order, status, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
    [row.itemId, row.relationType, sourceRefType, row.source, row.biomeId, row.noteOnly, SOURCE_PROVIDER, row.sourcePage, row.sortOrder]
  );
  stats.created += 1;
}

async function upsertNpcBiome(connection, row, stats) {
  const [result] = await connection.execute(
    `INSERT INTO npc_biomes
      (npc_id, biome_id, relation_type, spawn_context, notes, source_provider, source_page, sort_order, status, deleted)
     VALUES (?, ?, 'appears_in', ?, ?, ?, ?, ?, 1, 0)
     ON DUPLICATE KEY UPDATE notes = VALUES(notes), sort_order = VALUES(sort_order), status = 1, deleted = 0, updated_at = NOW()`,
    [row.npcId, row.biomeId, row.spawnContext, row.notes, SOURCE_PROVIDER, row.sourcePage, row.sortOrder]
  );
  addUpsertStats(stats, result);
}

function addUpsertStats(stats, result) {
  const affectedRows = Number(result?.affectedRows ?? 0);
  if (affectedRows === 1) {
    stats.created += 1;
  } else if (affectedRows > 1) {
    stats.updated += 1;
  }
}

async function loadDbLookups(connection) {
  const [biomeRows] = await connection.query('SELECT id, code FROM biomes WHERE deleted = 0');
  const [itemRows] = await connection.query('SELECT id, internal_name FROM items WHERE deleted = 0 AND status = 1');
  const [npcRows] = await connection.query('SELECT id, internal_name FROM npcs WHERE status = 1');
  return {
    biomeByCode: buildLookupMap(biomeRows, 'code'),
    itemByInternalName: buildLookupMap(itemRows, 'internal_name'),
    npcByInternalName: buildLookupMap(npcRows, 'internal_name'),
  };
}

function buildLookupMap(rows, keyField) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = normalizeKey(row?.[keyField]);
    if (key) map.set(key, Number(row.id));
  }
  return map;
}

function makePlanStats(input = 0) {
  return { input, valid: 0, skipped: 0 };
}

function makeWriteSummary() {
  return {
    biomeResources: { created: 0, updated: 0 },
    itemBiomes: { created: 0, updated: 0 },
    itemAcquisitionSources: { created: 0, updated: 0 },
    npcBiomes: { created: 0, updated: 0 },
  };
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveMysql() {
  const candidates = [
    'mysql2/promise',
    path.join(repoRoot, 'back', 'node_modules', 'mysql2', 'promise'),
  ];
  for (const candidate of candidates) {
    try {
      return moduleRequire(candidate);
    } catch {
      // try next candidate
    }
  }
  try {
    return createRequire(path.join(repoRoot, 'data-query-app', 'package.json'))('mysql2/promise');
  } catch {
    // fall through to clear error
  }
  throw new Error('Unable to resolve mysql2/promise. Install dependencies before running this importer.');
}

export function buildConnectionConfig(database, env = process.env) {
  const config = {
    host: process.env.TERRAPEDIA_DB_HOST || '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT || 3306),
    user: env.TERRAPEDIA_DB_USER || env.TERRAPEDIA_DB_USERNAME || 'root',
    password: env.TERRAPEDIA_DB_PASSWORD || env.MYSQL_PWD || '',
    database,
    charset: 'utf8mb4',
    multipleStatements: false,
  };
  const socketPath = toNullableText(env.TERRAPEDIA_DB_SOCKET || env.MYSQL_SOCKET);
  if (socketPath) {
    delete config.host;
    delete config.port;
    config.socketPath = socketPath;
  } else {
    config.host = env.TERRAPEDIA_DB_HOST || '127.0.0.1';
    config.port = Number(env.TERRAPEDIA_DB_PORT || 3306);
  }
  return config;
}

function toNullableText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error('[import-biome-wikitext-resolved-to-db] failed');
    console.error(error);
    process.exitCode = 1;
  });
}
