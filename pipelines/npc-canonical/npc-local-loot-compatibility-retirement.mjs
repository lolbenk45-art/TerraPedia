#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertAuthorizedOperationDataBundle,
  consumeAuthorizedOperationDispatchPermit,
  loadAuthorizedOperationContext,
} from '../automation/authorized-operation-context.mjs';
import { loadLocalStackConfig } from '../../scripts/lib/local-runtime-config.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';

export const OPERATION_ID = 'canonical-npc-local-loot-compatibility-retirement';
export const INPUT_PATH = 'reports/authorization/canonical/canonical-npc-local-loot-compatibility-retirement.input.json';
export const PREVIEW_PATH = 'reports/runtime/local-data-chain-closure/20260819/post-final/npc-local-loot-compatibility-retirement-preview.json';
export const RESULT_PATH = 'reports/authorization/canonical/canonical-npc-local-loot-compatibility-retirement.result.json';
export const WRITE_TARGET = 'local.npc_loot_entries.non_boss';
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function text(value) { const result = String(value ?? '').trim(); return result || null; }
function active(row) { return Number(row?.status) === 1 && Number(row?.deleted) === 0; }
function hashFile(repoRoot, relativePath) { return `sha256:${createHash('sha256').update(fs.readFileSync(path.resolve(repoRoot, relativePath))).digest('hex')}`; }

export function validateLocalLootCompatibilityInput({ input, preview, previewSha256 } = {}) {
  if (input?.schemaVersion !== 1 || input.operationId !== OPERATION_ID || preview?.schemaVersion !== 1 || preview.operationId !== OPERATION_ID) throw new Error('local compatibility retirement contract is invalid');
  if (input.apply !== true || input.databaseWrites !== true || input.externalRequests !== false) throw new Error('local compatibility retirement flags are invalid');
  if (preview.applyAllowed !== false || preview.databaseWrites !== false || preview.externalRequests !== false) throw new Error('local compatibility preview must remain read-only');
  if (!HASH_PATTERN.test(input.scopeSha256) || input.scopeSha256 !== preview.scopeSha256) throw new Error('local compatibility scope hash drifted');
  if (!HASH_PATTERN.test(input.previewSha256) || input.previewSha256 !== previewSha256) throw new Error('local compatibility preview hash drifted');
  const expected = Number(input.expectedCounts?.targetLocalRows);
  if (!Number.isSafeInteger(expected) || expected < 0 || Number(preview.summary?.targetLocalRows) !== expected || preview.targets?.length !== expected) throw new Error('local compatibility target count drifted');
  if (JSON.stringify(input.writeTargets) !== JSON.stringify([WRITE_TARGET])) throw new Error('local compatibility write targets are invalid');
  return true;
}

export function buildLocalLootCompatibilityMutationPlan(preview) {
  if (!preview || preview.operationId !== OPERATION_ID || !Array.isArray(preview.targets)) throw new Error('local compatibility preview targets are invalid');
  const localIds = [];
  const survivorLocalIds = [];
  const seen = new Set();
  for (const row of preview.targets) {
    const localId = Number(row.localId);
    const survivorLocalId = Number(row.survivorLocalId);
    if (!Number.isSafeInteger(localId) || localId < 1 || seen.has(localId)) throw new Error('local compatibility target local id is invalid');
    if (!Number.isSafeInteger(survivorLocalId) || survivorLocalId < 1 || localId === survivorLocalId) throw new Error('local compatibility survivor local id is invalid');
    if (!['retire_exact_duplicate_local_tuple', 'retire_orphaned_wiki_gg_variant_local_tuple'].includes(row.disposition)) throw new Error('local compatibility target disposition is invalid');
    localIds.push(localId); survivorLocalIds.push(survivorLocalId); seen.add(localId);
  }
  return { localIds, survivorLocalIds, counts: { targetLocalRows: localIds.length } };
}

function configFor(repoRoot) {
  const config = loadLocalStackConfig(repoRoot);
  return { host: process.env.TERRAPEDIA_DB_HOST ?? config.database?.host ?? '127.0.0.1', port: Number(process.env.TERRAPEDIA_DB_PORT ?? config.database?.port ?? 13306), user: process.env.TERRAPEDIA_DB_USERNAME ?? config.database?.username ?? 'root', password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database?.password ?? 'root' };
}
function placeholders(values) { return values.map(() => '?').join(', '); }
async function selectRows(connection, ids, { forUpdate = false } = {}) {
  if (ids.length === 0) return [];
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.execute(`SELECT * FROM \`terria_v1_local\`.\`npc_loot_entries\` WHERE id IN (${placeholders(ids)})${lock}`, ids);
  return rows;
}
function assertTargetRows(rows, preview) {
  const expected = new Map(preview.targets.map((row) => [Number(row.localId), row]));
  if (rows.length !== expected.size) throw new Error('local compatibility target set drifted');
  for (const row of rows) {
    const wanted = expected.get(Number(row.id));
    if (!wanted || !active(row)) throw new Error(`local compatibility target missing or inactive: ${row.id}`);
    for (const [field, expectedValue] of [['npc_id', wanted.npcId], ['item_id', wanted.itemId], ['source_item_id', wanted.sourceItemId], ['drop_source_kind', wanted.dropSourceKind], ['quantity_text', wanted.quantityText], ['chance_text', wanted.chanceText]]) {
      if ((row[field] ?? null) !== (expectedValue ?? null)) throw new Error(`local compatibility target ${row.id} drifted at ${field}`);
    }
  }
}
function assertSurvivors(rows, preview) {
  const expected = new Set(preview.targets.map((row) => Number(row.survivorLocalId)));
  if (rows.length !== expected.size || rows.some((row) => !expected.has(Number(row.id)) || !active(row))) throw new Error('local compatibility survivor readback drifted');
}
async function updateTargets(connection, preview) {
  for (const row of preview.targets) {
    const [result] = await connection.execute(
      'UPDATE `terria_v1_local`.`npc_loot_entries` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND npc_id = ? AND item_id = ? AND source_item_id = ? AND drop_source_kind = ? AND quantity_text <=> ? AND chance_text <=> ? AND status = 1 AND deleted = 0',
      [row.localId, row.npcId, row.itemId, row.sourceItemId, row.dropSourceKind, row.quantityText, row.chanceText],
    );
    if (Number(result?.affectedRows) !== 1) throw new Error(`local compatibility affected row count drifted: ${row.localId}`);
  }
}

export async function runLocalLootCompatibilityRetirement({ repoRoot = process.cwd(), inputPath = INPUT_PATH, previewPath = PREVIEW_PATH, apply = false, mysqlModule } = {}) {
  const input = JSON.parse(fs.readFileSync(path.resolve(repoRoot, inputPath), 'utf8'));
  const preview = JSON.parse(fs.readFileSync(path.resolve(repoRoot, previewPath), 'utf8'));
  validateLocalLootCompatibilityInput({ input, preview, previewSha256: hashFile(repoRoot, previewPath) });
  const plan = buildLocalLootCompatibilityMutationPlan(preview);
  if (!apply) return { operationId: OPERATION_ID, apply: false, scopeSha256: input.scopeSha256, counts: plan.counts, writeTargets: [WRITE_TARGET] };
  const authorizedContext = loadAuthorizedOperationContext({ operationId: OPERATION_ID });
  assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext });
  consumeAuthorizedOperationDispatchPermit({ authorizedContext, decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json') });
  const connection = await loadMysqlModule({ repoRoot, mysqlModule }).createConnection(configFor(repoRoot));
  try {
    await connection.beginTransaction();
    try {
      const before = await selectRows(connection, plan.localIds, { forUpdate: true });
      const survivors = await selectRows(connection, plan.survivorLocalIds, { forUpdate: true });
      assertTargetRows(before, preview); assertSurvivors(survivors, preview);
      await updateTargets(connection, preview);
      const after = await selectRows(connection, plan.localIds);
      const survivorReadback = await selectRows(connection, plan.survivorLocalIds);
      const activeTargets = after.filter(active).length;
      if (activeTargets !== 0) throw new Error('local compatibility target readback found active rows');
      assertSurvivors(survivorReadback, preview);
      const readback = { localRows: after.length, activeTargets, activeSurvivors: survivorReadback.filter(active).length };
      await connection.commit();
      return { schemaVersion: 1, resultKind: 'canonical_npc_local_loot_compatibility_retirement_result', operationId: OPERATION_ID, status: 'COMPLETED', transactionCommitted: true, scopeSha256: input.scopeSha256, authorization: { decisionIdentity: authorizedContext.decisionIdentity, packetHash: authorizedContext.packetHash }, affected: plan.counts, readback, preserved: { relationRows: true, projectionRows: true, sourceFacts: true, sourceDetails: true }, completedAt: new Date().toISOString() };
    } catch (error) { await connection.rollback(); throw error; }
  } finally { await connection.end(); }
}

function parseArgs(argv) { return Object.fromEntries(argv.map((arg) => { const [key, ...parts] = String(arg).replace(/^--/, '').split('='); return [key, parts.join('=') || 'true']; })); }
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = parseArgs(process.argv.slice(2));
  runLocalLootCompatibilityRetirement({ repoRoot: process.cwd(), inputPath: args.input ?? INPUT_PATH, previewPath: args.preview ?? PREVIEW_PATH, apply: args.apply === 'true' }).then((result) => { if (args.apply === 'true') fs.writeFileSync(path.resolve(process.cwd(), args.output ?? RESULT_PATH), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 }); console.log(JSON.stringify(result)); }).catch((error) => { console.error(error.stack ?? error); process.exitCode = 1; });
}
