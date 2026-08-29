#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';
import {
  EXPECTED_TARGETS as OPERATION_TARGETS,
  PROJECTION_GAP_WIKI_GG_VARIANT_RETIREMENT_OPERATION_ID as OPERATION_CONSTANT,
  PROJECTION_GAP_WIKI_GG_VARIANT_SCOPE as OPERATION_SCOPE,
} from '../npc-canonical/npc-projection-gap-wiki-gg-variant-retirement.mjs';

export const OPERATION_ID = OPERATION_CONSTANT;
export const PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260819/post-parent-conflict/npc-projection-gap-wiki-gg-variant-retirement-preview.json';
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
export const TARGETS = OPERATION_TARGETS;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
export function hashScope() { return OPERATION_SCOPE; }
export const SCOPE_SHA256 = OPERATION_SCOPE;

function active(row) { return Number(row?.status) === 1 && Number(row?.deleted) === 0; }
function lineage(row, expected) {
  const fields = {
    sourceProvider: row?.sourceProvider ?? row?.source_provider,
    landingContentHash: row?.landingContentHash ?? row?.landing_content_hash,
    landingSourceKey: row?.landingSourceKey ?? row?.landing_source_key,
    sourceMaintTable: row?.sourceMaintTable ?? row?.source_maint_table,
  };
  return Object.entries(expected).every(([key, value]) => String(fields[key] ?? '') === value);
}
function configFor(repoRoot) {
  const config = loadLocalStackConfig(repoRoot);
  return { host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1', port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306), user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root', password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root' };
}
function placeholders(values) { return values.map(() => '?').join(', '); }

export function buildPreview({ candidateRows = [], survivorRows = [], generatedAt = new Date().toISOString() } = {}) {
  const candidates = new Map(candidateRows.map((row) => [row.record_key, row]));
  const survivors = new Map(survivorRows.map((row) => [row.record_key, row]));
  const rows = TARGETS.map((target) => {
    const candidate = candidates.get(target.candidateRecordKey);
    const survivor = survivors.get(target.survivorRecordKey);
    if (!candidate || !active(candidate) || !lineage(candidate, TARGET_LINEAGE)) throw new Error(`projection gap candidate drifted: ${target.candidateRecordKey}`);
    if (!survivor || !active(survivor) || !lineage(survivor, SURVIVOR_LINEAGE)) throw new Error(`projection gap survivor drifted: ${target.survivorRecordKey}`);
    if (candidate.npc_internal_name !== target.npcInternalName || candidate.item_internal_name !== target.itemInternalName) throw new Error(`projection gap identity drifted: ${target.candidateRecordKey}`);
    if (survivor.npc_internal_name !== target.npcInternalName || survivor.item_internal_name !== target.itemInternalName) throw new Error(`projection gap survivor identity drifted: ${target.survivorRecordKey}`);
    return {
      candidateRecordKey: target.candidateRecordKey,
      survivorRecordKey: target.survivorRecordKey,
      npcInternalName: target.npcInternalName,
      itemInternalName: target.itemInternalName,
      quantityText: candidate.quantity_text,
      chanceText: candidate.chance_text,
      candidateSourceFactKey: candidate.source_fact_key,
      candidateSourceMaintRecordKey: candidate.source_maint_record_key,
      survivorSourceFactKey: survivor.source_fact_key,
      survivorSourceMaintRecordKey: survivor.source_maint_record_key,
      candidateLineage: TARGET_LINEAGE,
      survivorLineage: SURVIVOR_LINEAGE,
      disposition: 'quarantine_projection_gap_wiki_gg_variant',
    };
  });
  return { schemaVersion: 1, reportKind: 'npc_projection_gap_wiki_gg_variant_retirement_preview', operationId: OPERATION_ID, generatedAt, readOnly: true, applyAllowed: false, databaseWrites: false, externalRequests: false, scopeSha256: SCOPE_SHA256, summary: { candidateLootRelations: rows.length, acceptedSurvivors: rows.length, sourceFactsTargeted: 0, sourceDetailsTargeted: 0, projectionRowsTargeted: 0, localRowsTargeted: 0 }, rows };
}

export async function runPreview({ repoRoot = process.cwd(), relationDatabase = 'terria_v1_relation', mysqlModule } = {}) {
  const mysql = await loadMysqlModule({ repoRoot, mysqlModule });
  const connection = await mysql.createConnection(configFor(repoRoot));
  try {
    const keys = TARGETS.flatMap((target) => [target.candidateRecordKey, target.survivorRecordKey]);
    const [rows] = await connection.execute(`SELECT record_key,npc_internal_name,item_internal_name,quantity_text,chance_text,source_fact_key,source_maint_record_key,source_provider,landing_content_hash,landing_source_key,source_maint_table,status,deleted FROM \`${relationDatabase}\`.item_npc_loot_relations WHERE record_key IN (${placeholders(keys)})`, keys);
    return buildPreview({ candidateRows: rows.filter((row) => TARGETS.some((target) => target.candidateRecordKey === row.record_key)), survivorRows: rows.filter((row) => TARGETS.some((target) => target.survivorRecordKey === row.record_key)) });
  } finally { await connection.end(); }
}

async function writeReport(repoRoot, output, report) {
  const absolute = path.resolve(repoRoot, output);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return path.relative(repoRoot, absolute).replaceAll('\\', '/');
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const output = Object.fromEntries(process.argv.slice(2).map((arg) => { const [key, ...parts] = arg.replace(/^--/, '').split('='); return [key, parts.join('=') || 'true']; })).output ?? PREVIEW_PATH;
  runPreview({ repoRoot: process.cwd() }).then(async (report) => { const reportPath = await writeReport(process.cwd(), output, report); console.log(JSON.stringify({ reportPath, scopeSha256: report.scopeSha256, summary: report.summary })); }).catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
}
