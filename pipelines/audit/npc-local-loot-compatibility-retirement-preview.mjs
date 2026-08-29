#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';

export const OPERATION_ID = 'canonical-npc-local-loot-compatibility-retirement';
export const PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260819/post-final/npc-local-loot-compatibility-retirement-preview.json';
export const TARGET_LINEAGE = Object.freeze({
  sourceProvider: 'wiki_gg',
  landingContentHash: 'bc037276bafe2c0df0f2526301140580cd1894a11167d6bf534044c164aa5818',
  landingSourceKey: 'generated.item_relations_bundle:chunk:0001',
  sourceMaintTable: 'maint_item_sources',
});
export const SURVIVOR_LINEAGE = Object.freeze({
  sourceProvider: 'terraria.wiki.gg',
  landingContentHash: 'febde906014e59a8cbbcec8d04bf6083c1562d94b9fdcca5cc0a29c61bde6f05',
  landingSourceKey: 'generated.npc_item_relations_bundle',
  sourceMaintTable: 'maint_item_sources',
});

// These are the four relation candidates whose relation rows were retired. Their
// legacy local tuples have no relation key, so they are bound by exact text and
// the already accepted survivor relation key.
export const LOCAL_VARIANT_TARGETS = Object.freeze([
  Object.freeze({ npcInternalName: 'CursedSkull', npcId: 34, itemInternalName: 'Nazar', itemId: 891, candidateQuantityText: '1', candidateChanceText: '1% 1.99%', survivorQuantityText: '1', survivorChanceText: '{{modes|1%|1.99%}}', survivorRecordKey: '814335bd87bcb75ab728f4f56816634812689774307c691d6bf700e27c978167' }),
  Object.freeze({ npcInternalName: 'Hornet', npcId: 42, itemInternalName: 'Stinger', itemId: 209, candidateQuantityText: '1', candidateChanceText: '66% 100%', survivorQuantityText: '1', survivorChanceText: '{{modes|66%|100%}}', survivorRecordKey: 'f99572374ca1e34a2b5b3ab2a050850d97ef8c34e6974002b965acb56778d2d5' }),
  Object.freeze({ npcInternalName: 'JungleSlime', npcId: -10, itemInternalName: 'SlimeStaff', itemId: 1309, candidateQuantityText: '1', candidateChanceText: '0.01% 0.014%', survivorQuantityText: '1', survivorChanceText: '{{modes|0.01%|0.014%}}', survivorRecordKey: '54b14274bcd308be48a8102729d3d23912050c9bbfbae5b22ee7338dd8e83b96' }),
  Object.freeze({ npcInternalName: 'ManEater', npcId: 43, itemInternalName: 'Vine', itemId: 210, candidateQuantityText: '1', candidateChanceText: '50% 100%', survivorQuantityText: '1', survivorChanceText: '{{modes|50%|100%}}', survivorRecordKey: '7df5ffebb5b67f4efaad13527d5cebd00975d163cb83043c554054a9fd006f99' }),
]);

function value(row, camel, snake = camel) { return row?.[camel] ?? row?.[snake] ?? null; }
function active(row) { return Number(value(row, 'status')) === 1 && Number(value(row, 'deleted')) === 0; }
function text(value_) { const result = String(value_ ?? '').trim(); return result || null; }
function stable(value_) {
  if (Array.isArray(value_)) return value_.map(stable);
  if (!value_ || typeof value_ !== 'object') return value_;
  return Object.fromEntries(Object.keys(value_).sort().map((key) => [key, stable(value_[key])]));
}
function hashScope(value_) { return `sha256:${createHash('sha256').update(JSON.stringify(stable(value_)), 'utf8').digest('hex')}`; }
function localIdentity(row) {
  return JSON.stringify([
    Number(value(row, 'npcId', 'npc_id')),
    Number(value(row, 'itemId', 'item_id')),
    Number(value(row, 'sourceItemId', 'source_item_id')),
    text(value(row, 'dropSourceKind', 'drop_source_kind')),
    text(value(row, 'quantityText', 'quantity_text')),
    text(value(row, 'chanceText', 'chance_text')),
    text(value(row, 'conditions')),
  ]);
}
function tuple(row) {
  return {
    localId: Number(value(row, 'id', 'localId')),
    npcId: Number(value(row, 'npcId', 'npc_id')),
    npcInternalName: text(value(row, 'npcInternalName', 'npc_internal_name')),
    itemId: Number(value(row, 'itemId', 'item_id')),
    itemInternalName: text(value(row, 'itemInternalName', 'item_internal_name')),
    sourceItemId: Number(value(row, 'sourceItemId', 'source_item_id')),
    dropSourceKind: text(value(row, 'dropSourceKind', 'drop_source_kind')),
    quantityText: text(value(row, 'quantityText', 'quantity_text')),
    chanceText: text(value(row, 'chanceText', 'chance_text')),
    quantityMin: value(row, 'quantityMin', 'quantity_min'),
    quantityMax: value(row, 'quantityMax', 'quantity_max'),
    chanceValue: value(row, 'chanceValue', 'chance_value'),
    conditions: text(value(row, 'conditions')),
  };
}
function relationIdentity(row) {
  return [text(value(row, 'npcInternalName', 'npc_internal_name')), text(value(row, 'itemInternalName', 'item_internal_name')), text(value(row, 'quantityText', 'quantity_text')), text(value(row, 'chanceText', 'chance_text'))].join('\u0000');
}

export function buildNpcLocalLootCompatibilityRetirementPreview({ localRows = [], relationRows = [], variantTargets = LOCAL_VARIANT_TARGETS, generatedAt = new Date().toISOString() } = {}) {
  const activeLocal = localRows.filter((row) => active(row) && text(value(row, 'dropSourceKind', 'drop_source_kind')) === 'npc_drop').map(tuple);
  const activeRelations = relationRows.filter(active);
  const targets = [];
  const duplicateGroups = [];
  const quarantined = { variantMissingSurvivor: [], variantMissingLocalSurvivor: [], unsupportedLocalRows: [] };
  const seen = new Set();
  const byIdentity = new Map();
  for (const row of activeLocal) {
    const key = localIdentity(row);
    const rows = byIdentity.get(key) ?? [];
    rows.push(row);
    byIdentity.set(key, rows);
  }
  for (const [identity, rows] of byIdentity.entries()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a, b) => a.localId - b.localId);
    duplicateGroups.push({ identity, survivorLocalId: sorted[0].localId, targetLocalIds: sorted.slice(1).map((row) => row.localId) });
    for (const row of sorted.slice(1)) {
      targets.push({ ...row, disposition: 'retire_exact_duplicate_local_tuple', survivorLocalId: sorted[0].localId, reason: 'same persisted local tuple has a lower-id active survivor' });
      seen.add(row.localId);
    }
  }
  for (const target of variantTargets) {
    const survivor = activeRelations.filter((row) => text(value(row, 'recordKey', 'record_key')) === target.survivorRecordKey && relationIdentity(row) === [target.npcInternalName, target.itemInternalName, target.survivorQuantityText, target.survivorChanceText].join('\u0000'));
    if (survivor.length !== 1) {
      quarantined.variantMissingSurvivor.push({ ...target, reason: 'accepted survivor relation is missing or ambiguous' });
      continue;
    }
    const candidateRows = activeLocal.filter((row) => row.npcId === target.npcId && row.itemId === target.itemId && row.sourceItemId === target.itemId && row.quantityText === target.candidateQuantityText && row.chanceText === target.candidateChanceText);
    const survivorRows = activeLocal.filter((row) => row.npcId === target.npcId && row.itemId === target.itemId && row.sourceItemId === target.itemId && row.quantityText === target.survivorQuantityText && row.chanceText === target.survivorChanceText);
    if (candidateRows.length === 0) continue;
    if (survivorRows.length !== 1) {
      quarantined.variantMissingLocalSurvivor.push({ ...target, localIds: candidateRows.map((row) => row.localId), reason: 'accepted local tuple is missing or ambiguous' });
      continue;
    }
    for (const row of candidateRows) {
      if (seen.has(row.localId)) continue;
      targets.push({ ...row, disposition: 'retire_orphaned_wiki_gg_variant_local_tuple', survivorLocalId: survivorRows[0].localId, survivorRecordKey: target.survivorRecordKey, reason: 'retired wiki_gg relation tuple with one accepted local survivor' });
      seen.add(row.localId);
    }
  }
  duplicateGroups.sort((a, b) => a.survivorLocalId - b.survivorLocalId);
  targets.sort((a, b) => a.localId - b.localId);
  const scope = { operationId: OPERATION_ID, writeTargets: ['local.npc_loot_entries.non_boss'], targets: targets.map((row) => ({ localId: row.localId, survivorLocalId: row.survivorLocalId, disposition: row.disposition, npcInternalName: row.npcInternalName, itemInternalName: row.itemInternalName, quantityText: row.quantityText, chanceText: row.chanceText })) };
  return {
    schemaVersion: 1,
    reportKind: 'npc_local_loot_compatibility_retirement_preview',
    generatedAt,
    operationId: OPERATION_ID,
    readOnly: true,
    applyAllowed: false,
    databaseWrites: false,
    externalRequests: false,
    scopeSha256: hashScope(scope),
    summary: { targetLocalRows: targets.length, duplicateTargetLocalRows: targets.filter((row) => row.disposition === 'retire_exact_duplicate_local_tuple').length, variantTargetLocalRows: targets.filter((row) => row.disposition === 'retire_orphaned_wiki_gg_variant_local_tuple').length, duplicateGroups: duplicateGroups.length, quarantined: Object.fromEntries(Object.entries(quarantined).map(([key, rows]) => [key, rows.length])) },
    duplicateGroups,
    variantTargets: targets.filter((row) => row.disposition === 'retire_orphaned_wiki_gg_variant_local_tuple'),
    targets,
    quarantine: quarantined,
  };
}

function configFor(repoRoot) {
  const config = loadLocalStackConfig(repoRoot);
  return { host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1', port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306), user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root', password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root' };
}
function placeholders(rows) { return rows.map(() => '?').join(', '); }
export async function runPreview({ repoRoot = process.cwd(), output = PREVIEW_PATH, mysqlModule } = {}) {
  const mysql = await loadMysqlModule({ repoRoot, mysqlModule });
  const connection = await mysql.createConnection(configFor(repoRoot));
  try {
    const [localRows] = await connection.execute('SELECT le.*, n.internal_name AS npc_internal_name, i.internal_name AS item_internal_name FROM `terria_v1_local`.`npc_loot_entries` le JOIN `terria_v1_local`.`npcs` n ON n.id = le.npc_id JOIN `terria_v1_local`.`items` i ON i.id = le.item_id WHERE le.status = 1 AND le.deleted = 0');
    const [relationRows] = await connection.execute('SELECT record_key,npc_internal_name,item_internal_name,quantity_text,chance_text,source_provider,landing_content_hash,landing_source_key,source_maint_table,status,deleted FROM `terria_v1_relation`.`item_npc_loot_relations` WHERE status = 1 AND deleted = 0');
    const report = buildNpcLocalLootCompatibilityRetirementPreview({ localRows, relationRows });
    const absolute = path.resolve(repoRoot, output);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    return report;
  } finally { await connection.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  runPreview({ repoRoot: process.cwd(), output: Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...parts] = arg.replace(/^--/, '').split('='); return [key, parts.join('=') || 'true']; })).output ?? PREVIEW_PATH }).then((report) => console.log(JSON.stringify({ output: PREVIEW_PATH, scopeSha256: report.scopeSha256, summary: report.summary }))).catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
}
