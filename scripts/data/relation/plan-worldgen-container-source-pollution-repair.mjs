#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';

import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, writeJson } from '../lib/wiki-item-utils.mjs';
import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();
const require = createRequire(path.join(repoRoot, 'data-query-app', 'package.json'));
const DEFAULT_AUDIT_REPORT = 'data/reports/item-source-worldgen-container-pollution-2026-06-14.json';

export function parseWorldgenContainerSourcePollutionRepairArgs(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const apply = booleanOption(options.apply, false);
  const confirmLocalCompat = booleanOption(options['confirm-local-compat'] ?? options.confirmLocalCompat, false);
  const allowBulk = booleanOption(options['allow-bulk'] ?? options.allowBulk, false);
  const database = options.database ?? process.env.TERRAPEDIA_DB_NAME ?? 'terria_v1_local';
  if (apply && !confirmLocalCompat) {
    throw new Error('worldgen container source pollution repair apply requires --confirm-local-compat=true');
  }
  if (apply && !allowBulk) {
    throw new Error('worldgen container source pollution repair apply requires --allow-bulk=true');
  }
  if (apply && database !== 'terria_v1_local') {
    throw new Error(`Refusing worldgen container source pollution repair apply to non-local database: ${database}`);
  }
  return {
    apply,
    confirmLocalCompat,
    allowBulk,
    database,
    host: options.host ?? null,
    port: options.port ?? null,
    user: options.user ?? null,
    password: options.password ?? null,
    auditReportPath: options['audit-report'] ?? options.auditReport ?? DEFAULT_AUDIT_REPORT,
    outputPath: options.output ?? null,
    backupDir: options['backup-dir'] ?? options.backupDir ?? path.join(process.cwd(), 'data', 'backups', 'item-source-worldgen-container-pollution-repair'),
    batchId: options['batch-id'] ?? options.batchId ?? null,
    mode: options.mode ?? 'structured-repair',
    allowSourceIds: parseIntegerList(options['allow-source-ids'] ?? options.allowSourceIds)
  };
}

export function buildWorldgenContainerSourcePollutionRepairPlan({
  auditReport = {},
  existingSourceRows = [],
  batchId = 'worldgen-container-source-pollution-repair'
} = {}) {
  const activeExisting = (Array.isArray(existingSourceRows) ? existingSourceRows : [])
    .filter((row) => Number(row.status ?? 1) === 1 && Number(row.deleted ?? 0) === 0);
  const existingByKey = new Map();
  for (const row of activeExisting) {
    const key = structuredKey({
      itemId: row.item_id ?? row.itemId,
      sourceType: row.source_type ?? row.sourceType,
      sourceRefType: row.source_ref_type ?? row.sourceRefType,
      sourceRefId: row.source_ref_id ?? row.sourceRefId
    });
    existingByKey.set(key, row);
  }

  const candidateRows = (Array.isArray(auditReport.rows) ? auditReport.rows : [])
    .filter((row) => row.classification === 'auto_fixable')
    .filter((row) => !hasUnsafeReviewReason(row));
  const disableRows = [];
  const insertRows = [];
  const duplicateRows = [];
  const blockedRows = [];

  for (const row of candidateRows) {
    const matchedSources = Array.isArray(row.matchedSources) ? row.matchedSources : [];
    const plannedForRow = [];
    const duplicateForRow = [];
    const invalid = matchedSources.some((source) =>
      !isPositiveInteger(source.id)
      || !nonEmpty(source.name)
      || !nonEmpty(source.sourceType)
      || !nonEmpty(source.sourceRefType));

    if (!Number.isInteger(Number(row.sourceId)) || !Number.isInteger(Number(row.itemId)) || matchedSources.length === 0 || invalid) {
      blockedRows.push(blockedRow(row, 'incomplete_structured_replacement'));
      continue;
    }

    for (const source of matchedSources) {
      const insert = buildInsertRow(row, source, batchId);
      const key = structuredKey(insert);
      const existing = existingByKey.get(key);
      if (existing) {
        duplicateForRow.push({
          sourceId: Number(row.sourceId),
          itemId: Number(row.itemId),
          existingId: Number(existing.id),
          sourceType: insert.sourceType,
          sourceRefType: insert.sourceRefType,
          sourceRefId: insert.sourceRefId,
          sourceRefName: insert.sourceRefName
        });
      } else {
        plannedForRow.push(insert);
        existingByKey.set(key, {
          id: null,
          item_id: insert.itemId,
          source_type: insert.sourceType,
          source_ref_type: insert.sourceRefType,
          source_ref_id: insert.sourceRefId
        });
      }
    }

    if (plannedForRow.length + duplicateForRow.length !== matchedSources.length) {
      blockedRows.push(blockedRow(row, 'incomplete_structured_replacement'));
      continue;
    }

    insertRows.push(...plannedForRow);
    duplicateRows.push(...duplicateForRow);
    disableRows.push({
      id: Number(row.sourceId),
      itemId: Number(row.itemId),
      sourceType: row.sourceType ?? null,
      sourceRefType: row.sourceRefType ?? null,
      sourceRefName: row.sourceRefName ?? null
    });
  }

  return {
    batchId,
    apply: false,
    summary: {
      candidateRows: candidateRows.length,
      rowsToDisable: disableRows.length,
      rowsToInsert: insertRows.length,
      duplicateStructuredRows: duplicateRows.length,
      blockedRows: blockedRows.length,
      updatedRows: 0,
      insertedRows: 0
    },
    disableRows,
    insertRows,
    duplicateRows,
    blockedRows,
    rollbackSql: null
  };
}

export function buildCoveredWorldgenTextDisablePlan({
  auditReport = {},
  existingSourceRows = [],
  batchId = 'covered-worldgen-text-disable',
  allowSourceIds = []
} = {}) {
  const allow = new Set(allowSourceIds.map(Number).filter(Number.isInteger));
  const rows = (Array.isArray(auditReport.rows) ? auditReport.rows : [])
    .filter((row) => allow.has(Number(row.sourceId)));
  const activeExisting = (Array.isArray(existingSourceRows) ? existingSourceRows : [])
    .filter((row) => Number(row.status ?? 1) === 1 && Number(row.deleted ?? 0) === 0);
  const byItemId = new Map();
  for (const row of activeExisting) {
    const itemId = Number(row.item_id ?? row.itemId);
    if (!Number.isInteger(itemId)) {
      continue;
    }
    if (!byItemId.has(itemId)) {
      byItemId.set(itemId, []);
    }
    byItemId.get(itemId).push(row);
  }

  const disableRows = [];
  const blockedRows = [];

  for (const row of rows) {
    const sourceId = Number(row.sourceId);
    const itemId = Number(row.itemId);
    if (!Number.isInteger(sourceId) || !Number.isInteger(itemId)) {
      blockedRows.push(blockedRow(row, 'invalid_source_identity'));
      continue;
    }
    if (['Paintings', 'Statues', 'Altars'].includes(row.sourcePage)) {
      blockedRows.push(blockedRow(row, 'broad_worldgen_context'));
      continue;
    }
    if ((row.reviewReasons ?? []).includes('self_source_match')) {
      blockedRows.push(blockedRow(row, 'self_source_match'));
      continue;
    }
    const sourceRows = byItemId.get(itemId) ?? [];
    const targetRow = sourceRows.find((sourceRow) =>
      Number(sourceRow.id) === sourceId
      && String(sourceRow.source_type ?? sourceRow.sourceType) === 'worldgen'
      && String(sourceRow.source_ref_type ?? sourceRow.sourceRefType) === 'world'
    );
    if (!targetRow) {
      blockedRows.push(blockedRow(row, 'missing_active_worldgen_row'));
      continue;
    }
    const structuredCoverage = sourceRows.filter((sourceRow) =>
      Number(sourceRow.id) !== sourceId
      && !(String(sourceRow.source_type ?? sourceRow.sourceType) === 'worldgen'
        && String(sourceRow.source_ref_type ?? sourceRow.sourceRefType) === 'world')
    );
    if (structuredCoverage.length === 0) {
      blockedRows.push(blockedRow(row, 'missing_structured_coverage'));
      continue;
    }
    disableRows.push({
      id: sourceId,
      itemId,
      sourceType: row.sourceType ?? null,
      sourceRefType: row.sourceRefType ?? null,
      sourceRefName: row.sourceRefName ?? null,
      reason: 'covered_worldgen_text_duplicate',
      coveredBySourceIds: structuredCoverage.map((sourceRow) => Number(sourceRow.id)).filter(Number.isInteger)
    });
  }

  return {
    batchId,
    apply: false,
    mode: 'covered-text-disable',
    summary: {
      candidateRows: rows.length,
      rowsToDisable: disableRows.length,
      rowsToInsert: 0,
      duplicateStructuredRows: 0,
      blockedRows: blockedRows.length,
      updatedRows: 0,
      insertedRows: 0
    },
    disableRows,
    insertRows: [],
    duplicateRows: [],
    blockedRows,
    rollbackSql: null
  };
}

export function buildBlankWorldgenMarkerCleanupPlan({
  existingSourceRows = [],
  batchId = 'blank-worldgen-marker-cleanup',
  allowSourceIds = []
} = {}) {
  const allow = new Set(allowSourceIds.map(Number).filter(Number.isInteger));
  const activeExisting = (Array.isArray(existingSourceRows) ? existingSourceRows : [])
    .filter((row) => Number(row.status ?? 1) === 1 && Number(row.deleted ?? 0) === 0);
  const rows = activeExisting.filter((row) => allow.has(Number(row.id)));
  const byItemId = new Map();
  for (const row of activeExisting) {
    const itemId = Number(row.item_id ?? row.itemId);
    if (!Number.isInteger(itemId)) continue;
    if (!byItemId.has(itemId)) byItemId.set(itemId, []);
    byItemId.get(itemId).push(row);
  }

  const disableRows = [];
  const blockedRows = [];

  for (const row of rows) {
    const sourceId = Number(row.id);
    const itemId = Number(row.item_id ?? row.itemId);
    if (!Number.isInteger(sourceId) || !Number.isInteger(itemId)) {
      blockedRows.push(blockedRow({ sourceId, itemId }, 'invalid_source_identity'));
      continue;
    }
    if (
      String(row.source_type ?? row.sourceType) !== 'worldgen'
      || String(row.source_ref_type ?? row.sourceRefType) !== 'world'
    ) {
      blockedRows.push(blockedRow({ sourceId, itemId }, 'not_worldgen_world_marker'));
      continue;
    }
    if (nonEmpty(row.conditions) || nonEmpty(row.notes)) {
      blockedRows.push(blockedRow({ sourceId, itemId }, 'non_blank_worldgen_marker'));
      continue;
    }
    const structuredCoverage = (byItemId.get(itemId) ?? []).filter((sourceRow) =>
      Number(sourceRow.id) !== sourceId
      && !(String(sourceRow.source_type ?? sourceRow.sourceType) === 'worldgen'
        && String(sourceRow.source_ref_type ?? sourceRow.sourceRefType) === 'world')
    );
    if (structuredCoverage.length === 0) {
      blockedRows.push(blockedRow({ sourceId, itemId }, 'missing_structured_coverage'));
      continue;
    }
    disableRows.push({
      id: sourceId,
      itemId,
      sourceType: row.source_type ?? row.sourceType ?? null,
      sourceRefType: row.source_ref_type ?? row.sourceRefType ?? null,
      sourceRefName: row.source_ref_name ?? row.sourceRefName ?? null,
      reason: 'blank_worldgen_marker_covered_by_structured_sources',
      coveredBySourceIds: structuredCoverage.map((sourceRow) => Number(sourceRow.id)).filter(Number.isInteger)
    });
  }

  return {
    batchId,
    apply: false,
    mode: 'blank-worldgen-marker-cleanup',
    summary: {
      candidateRows: rows.length,
      rowsToDisable: disableRows.length,
      rowsToInsert: 0,
      duplicateStructuredRows: 0,
      blockedRows: blockedRows.length,
      updatedRows: 0,
      insertedRows: 0
    },
    disableRows,
    insertRows: [],
    duplicateRows: [],
    blockedRows,
    rollbackSql: null
  };
}

export function buildFinalExceptionRepairPlan({
  auditReport = {},
  existingSourceRows = [],
  batchId = 'final-exception-repair'
} = {}) {
  const rows = (Array.isArray(auditReport.rows) ? auditReport.rows : [])
    .filter((row) => isFinalExceptionRow(row));
  const activeExisting = (Array.isArray(existingSourceRows) ? existingSourceRows : [])
    .filter((row) => Number(row.status ?? 1) === 1 && Number(row.deleted ?? 0) === 0);
  const byItemId = new Map();
  for (const row of activeExisting) {
    const itemId = Number(row.item_id ?? row.itemId);
    if (!Number.isInteger(itemId)) {
      continue;
    }
    if (!byItemId.has(itemId)) {
      byItemId.set(itemId, []);
    }
    byItemId.get(itemId).push(row);
  }

  const disableRows = [];
  const insertRows = [];
  const duplicateRows = [];
  const blockedRows = [];

  for (const row of rows) {
    const itemName = String(row.itemName ?? '').trim();
    if (itemName === 'Red Potion') {
      const result = planRedPotionException({ row, sourceRows: byItemId.get(Number(row.itemId)) ?? [], batchId });
      disableRows.push(...result.disableRows);
      insertRows.push(...result.insertRows);
      duplicateRows.push(...result.duplicateRows);
      blockedRows.push(...result.blockedRows);
      continue;
    }
    if (itemName === 'Iron Ore') {
      const result = planIronOreException({ row, sourceRows: byItemId.get(Number(row.itemId)) ?? [] });
      disableRows.push(...result.disableRows);
      blockedRows.push(...result.blockedRows);
      continue;
    }
  }

  return {
    batchId,
    apply: false,
    mode: 'final-exceptions-repair',
    summary: {
      candidateRows: rows.length,
      rowsToDisable: disableRows.length,
      rowsToInsert: insertRows.length,
      duplicateStructuredRows: duplicateRows.length,
      blockedRows: blockedRows.length,
      updatedRows: 0,
      insertedRows: 0
    },
    disableRows,
    insertRows,
    duplicateRows,
    blockedRows,
    rollbackSql: null
  };
}

export async function runWorldgenContainerSourcePollutionRepair(options = {}, dependencies = {}) {
  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const batchId = options.batchId ?? `worldgen-container-source-pollution-repair-${now.toISOString().replace(/[:.]/g, '-')}`;
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
    throw new Error(`Refusing worldgen container source pollution repair apply to non-local database: ${connectionConfig.database}`);
  }

  const auditReport = dependencies.auditReport ?? await readJson(path.resolve(process.cwd(), options.auditReportPath ?? DEFAULT_AUDIT_REPORT));
  const connection = await mysqlModule.createConnection(connectionConfig);
  let existingSourceRows = [];
  let beforeRows = [];
  let insertedRows = 0;
  let updatedRows = 0;
  let insertedIds = [];
  try {
    const affectedItemIds = options.mode === 'blank-worldgen-marker-cleanup'
      ? await affectedItemIdsFromSourceIds(connection, options.allowSourceIds ?? [])
      : affectedIdsFromAudit(auditReport);
    existingSourceRows = await readExistingSourceRows(connection, affectedItemIds);
    const plan = options.mode === 'covered-text-disable'
      ? buildCoveredWorldgenTextDisablePlan({
        auditReport,
        existingSourceRows,
        batchId,
        allowSourceIds: options.allowSourceIds ?? []
      })
      : options.mode === 'blank-worldgen-marker-cleanup'
        ? buildBlankWorldgenMarkerCleanupPlan({
          existingSourceRows,
          batchId,
          allowSourceIds: options.allowSourceIds ?? []
        })
      : options.mode === 'final-exceptions-repair'
        ? buildFinalExceptionRepairPlan({ auditReport, existingSourceRows, batchId })
        : buildWorldgenContainerSourcePollutionRepairPlan({ auditReport, existingSourceRows, batchId });
    beforeRows = plan.disableRows.length ? await readRowsByIds(connection, plan.disableRows.map((row) => row.id)) : [];

    if (options.apply && (plan.insertRows.length || plan.disableRows.length)) {
      await connection.beginTransaction();
      try {
        for (const row of plan.insertRows) {
          const [result] = await connection.execute(
            `INSERT INTO \`item_acquisition_sources\`
(\`item_id\`, \`source_type\`, \`source_ref_type\`, \`source_ref_id\`, \`source_ref_name\`, \`biome_id\`, \`quantity_min\`, \`quantity_max\`, \`quantity_text\`, \`chance_value\`, \`chance_text\`, \`conditions\`, \`notes\`, \`source_provider\`, \`source_page\`, \`source_revision_timestamp\`, \`sort_order\`, \`status\`, \`deleted\`)
VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, 1, 0)`,
            [
              row.itemId,
              row.sourceType,
              row.sourceRefType,
              row.sourceRefId,
              row.sourceRefName,
              row.quantityText,
              row.chanceText,
              row.conditions,
              row.notes,
              row.sourceProvider,
              row.sourcePage,
              row.sortOrder
            ]
          );
          insertedRows += Number(result?.affectedRows ?? 0);
          insertedIds.push(Number(result?.insertId));
        }
        for (const row of plan.disableRows) {
          const [result] = await connection.execute(
            `UPDATE \`item_acquisition_sources\`
SET \`status\` = 0,
    \`updated_at\` = CURRENT_TIMESTAMP
WHERE \`id\` = ?
  AND \`status\` = 1
  AND \`deleted\` = 0
  AND \`source_type\` = 'worldgen'
  AND \`source_ref_type\` = 'world'`,
            [row.id]
          );
          updatedRows += Number(result?.affectedRows ?? 0);
        }
        if (insertedRows !== plan.insertRows.length) {
          throw new Error(`Expected to insert ${plan.insertRows.length} rows, inserted ${insertedRows}`);
        }
        if (updatedRows !== plan.disableRows.length) {
          throw new Error(`Expected to disable ${plan.disableRows.length} rows, updated ${updatedRows}`);
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    const backupPath = path.resolve(process.cwd(), options.backupDir, `${batchId}.before.json`);
    writeJson(backupPath, {
      generatedAt: now.toISOString(),
      batchId,
      connection: { host: connectionConfig.host, port: connectionConfig.port, database: connectionConfig.database },
      rows: beforeRows
    });
    const report = {
      ...plan,
      generatedAt: now.toISOString(),
      apply: Boolean(options.apply),
      connection: { host: connectionConfig.host, port: connectionConfig.port, database: connectionConfig.database, user: connectionConfig.user },
      backupPath,
      summary: {
        ...plan.summary,
        updatedRows,
        insertedRows
      },
      insertedIds,
      rollbackSql: buildRollbackSql({ beforeRows, insertedIds })
    };
    if (options.outputPath) {
      writeJson(path.resolve(process.cwd(), options.outputPath), report);
    }
    return report;
  } finally {
    await connection.end();
  }
}

function buildInsertRow(row, source, batchId) {
  return {
    sourceId: Number(row.sourceId),
    itemId: Number(row.itemId),
    sourceType: source.sourceType,
    sourceRefType: source.sourceRefType,
    sourceRefId: Number(source.id),
    sourceRefName: source.name,
    quantityText: row.quantityText ?? null,
    chanceText: row.chanceText ?? null,
    conditions: row.conditions ?? null,
    notes: row.notes ?? null,
    sourceProvider: 'repair:item-source-worldgen-container-pollution',
    sourcePage: row.sourcePage ?? null,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
    batchId
  };
}

function planRedPotionException({ row, sourceRows, batchId }) {
  const sourceId = Number(row.sourceId);
  const itemId = Number(row.itemId);
  const blockedRows = [];
  if (!hasActiveWorldgenRow(sourceRows, sourceId)) {
    return { disableRows: [], insertRows: [], duplicateRows: [], blockedRows: [blockedRow(row, 'missing_active_worldgen_row')] };
  }
  const duplicate = sourceRows.find((sourceRow) =>
    String(sourceRow.source_type ?? sourceRow.sourceType) === 'container'
    && String(sourceRow.source_ref_type ?? sourceRow.sourceRefType) === 'container'
    && Number(sourceRow.source_ref_id ?? sourceRow.sourceRefId) === 48
  );
  const duplicateRows = duplicate
    ? [{
      sourceId,
      itemId,
      existingId: Number(duplicate.id),
      sourceType: 'container',
      sourceRefType: 'container',
      sourceRefId: 48,
      sourceRefName: 'Chest'
    }]
    : [];
  const insertRows = duplicate
    ? []
    : [{
      sourceId,
      itemId,
      sourceType: 'container',
      sourceRefType: 'container',
      sourceRefId: 48,
      sourceRefName: 'Chest',
      quantityText: null,
      chanceText: '1/30 (3.33%) drunk worlds; 1/10 (10%) For the Worthy worlds; about 13/100 (13%) Zenith worlds',
      conditions: 'Special world seeds only: drunk worlds, For the Worthy worlds, and Zenith/Get fixed boi worlds.',
      notes: row.conditions ?? null,
      sourceProvider: 'repair:item-source-final-exception',
      sourcePage: row.sourcePage ?? 'Red Potion',
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
      batchId
    }];
  return {
    disableRows: [disableRow(row, 'final_exception_red_potion_special_world_chest')],
    insertRows,
    duplicateRows,
    blockedRows
  };
}

function planIronOreException({ row, sourceRows }) {
  const sourceId = Number(row.sourceId);
  if (!hasActiveWorldgenRow(sourceRows, sourceId)) {
    return { disableRows: [], blockedRows: [blockedRow(row, 'missing_active_worldgen_row')] };
  }
  const hasBlankWorldgenMarker = sourceRows.some((sourceRow) =>
    Number(sourceRow.id) !== sourceId
    && String(sourceRow.source_type ?? sourceRow.sourceType) === 'worldgen'
    && String(sourceRow.source_ref_type ?? sourceRow.sourceRefType) === 'world'
    && !nonEmpty(sourceRow.conditions)
    && !nonEmpty(sourceRow.notes)
  );
  if (!hasBlankWorldgenMarker) {
    return { disableRows: [], blockedRows: [blockedRow(row, 'missing_blank_worldgen_marker')] };
  }
  const hasStructuredCoverage = sourceRows.some((sourceRow) =>
    Number(sourceRow.id) !== sourceId
    && !(String(sourceRow.source_type ?? sourceRow.sourceType) === 'worldgen'
      && String(sourceRow.source_ref_type ?? sourceRow.sourceRefType) === 'world')
  );
  if (!hasStructuredCoverage) {
    return { disableRows: [], blockedRows: [blockedRow(row, 'missing_structured_coverage')] };
  }
  return {
    disableRows: [disableRow(row, 'final_exception_iron_ore_mixed_text_duplicate')],
    blockedRows: []
  };
}

function isFinalExceptionRow(row = {}) {
  const itemName = String(row.itemName ?? '').trim();
  return itemName === 'Red Potion' || itemName === 'Iron Ore';
}

function hasActiveWorldgenRow(sourceRows, sourceId) {
  return sourceRows.some((sourceRow) =>
    Number(sourceRow.id) === Number(sourceId)
    && String(sourceRow.source_type ?? sourceRow.sourceType) === 'worldgen'
    && String(sourceRow.source_ref_type ?? sourceRow.sourceRefType) === 'world'
  );
}

function disableRow(row, reason) {
  return {
    id: Number(row.sourceId),
    itemId: Number(row.itemId),
    sourceType: row.sourceType ?? null,
    sourceRefType: row.sourceRefType ?? null,
    sourceRefName: row.sourceRefName ?? null,
    reason
  };
}

function blockedRow(row, reason) {
  return {
    sourceId: Number(row.sourceId),
    itemId: Number(row.itemId),
    itemName: row.itemName ?? null,
    reason
  };
}

function hasUnsafeReviewReason(row) {
  const reasons = new Set(Array.isArray(row.reviewReasons) ? row.reviewReasons : []);
  return reasons.has('self_source_match') || reasons.has('generic_container_reference');
}

function structuredKey(row) {
  return JSON.stringify([
    Number(row.itemId ?? row.item_id),
    normalizeText(row.sourceType ?? row.source_type),
    normalizeText(row.sourceRefType ?? row.source_ref_type),
    Number(row.sourceRefId ?? row.source_ref_id)
  ]);
}

function affectedIdsFromAudit(auditReport) {
  return [...new Set((auditReport.rows ?? [])
    .map((row) => Number(row.itemId))
    .filter(Number.isInteger))];
}

async function readExistingSourceRows(connection, itemIds) {
  if (!itemIds.length) return [];
  const placeholders = itemIds.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT *
FROM \`item_acquisition_sources\`
WHERE \`item_id\` IN (${placeholders})
  AND \`status\` = 1
  AND \`deleted\` = 0
ORDER BY \`item_id\`, \`id\``,
    itemIds
  );
  return Array.isArray(rows) ? rows : [];
}

async function affectedItemIdsFromSourceIds(connection, sourceIds) {
  const ids = (sourceIds ?? []).map(Number).filter(Number.isInteger);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await connection.execute(
    `SELECT DISTINCT \`item_id\` FROM \`item_acquisition_sources\` WHERE \`id\` IN (${placeholders})`,
    ids
  );
  return (Array.isArray(rows) ? rows : [])
    .map((row) => Number(row.item_id ?? row.itemId))
    .filter(Number.isInteger);
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

async function readJson(filePath) {
  const { default: fs } = await import('node:fs/promises');
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function buildRollbackSql({ beforeRows, insertedIds }) {
  const statements = [];
  const validInsertedIds = (insertedIds ?? []).filter(Number.isInteger);
  if (validInsertedIds.length) {
    statements.push(`DELETE FROM \`item_acquisition_sources\` WHERE \`id\` IN (${validInsertedIds.join(', ')});`);
  }
  if (Array.isArray(beforeRows) && beforeRows.length) {
    const ids = beforeRows.map((row) => Number(row.id)).filter(Number.isInteger);
    const statusCases = beforeRows.map((row) => `WHEN ${Number(row.id)} THEN ${Number(row.status)}`).join(' ');
    statements.push(`UPDATE \`item_acquisition_sources\` SET \`status\` = CASE \`id\` ${statusCases} END WHERE \`id\` IN (${ids.join(', ')});`);
  }
  return statements.length ? statements.join('\n') : null;
}

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseIntegerList(value) {
  if (value == null || value === '') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(Number).filter(Number.isInteger);
  }
  return String(value).split(',').map((entry) => Number(entry.trim())).filter(Number.isInteger);
}

function nonEmpty(value) {
  return String(value ?? '').trim() !== '';
}

function isPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWorldgenContainerSourcePollutionRepair(parseWorldgenContainerSourcePollutionRepairArgs())
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
