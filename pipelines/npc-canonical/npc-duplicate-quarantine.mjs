#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  assertAuthorizedOperationDataBundle,
  loadAuthorizedOperationContext,
  consumeAuthorizedOperationDispatchPermit,
} from '../automation/authorized-operation-context.mjs';
import { loadMysqlModule } from '../lib/mysql-module.mjs';

export const DUPLICATE_QUARANTINE_OPERATION_ID = 'canonical-npc-duplicate-quarantine';
const DATABASES = Object.freeze({
  maint: 'terria_v1_maint',
  relation: 'terria_v1_relation',
  local: 'terria_v1_local',
});

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function integer(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function indexBy(rows, key) {
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row?.[key] ?? ''), row]));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function hashDuplicateQuarantineScope(input) {
  const scope = {
    operationId: input?.operationId,
    contractVersion: input?.contractVersion,
    disposition: input?.disposition,
    expectedCounts: input?.expectedCounts,
    targets: input?.targets,
  };
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(scope)), 'utf8').digest('hex')}`;
}

function assertTargetRow(row, target, label) {
  if (!row) throw new Error(`${label} is missing`);
  if (!active(row)) throw new Error(`${label} must be active`);
  if (label === 'relation loot row' && row.source_maint_table !== 'maint_npc_crawler_facts') {
    throw new Error('duplicate target must use crawler lineage');
  }
  const checks = label === 'relation loot row'
    ? [
        ['id', target.relationId],
        ['record_key', target.relationRecordKey],
        ['source_fact_key', target.sourceFactKey],
        ['npc_internal_name', target.npcInternalName],
        ['item_internal_name', target.itemInternalName],
      ]
    : label === 'local loot row'
      ? [
          ['id', target.localId],
          ['npc_id', target.npcId],
          ['item_id', target.itemId],
          ['source_item_id', target.itemId],
          ['drop_source_kind', 'npc_drop'],
          ['quantity_text', target.quantityText],
          ['chance_text', target.chanceText],
        ]
      : label === 'source fact row'
        ? [
            ['record_key', target.sourceFactKey],
            ['item_internal_name', target.itemInternalName],
            ['source_ref_name', target.sourceRefName],
          ]
        : [
            ['record_key', target.sourceDetailRecordKey],
            ['source_fact_key', target.sourceFactKey],
            ['source_ref_name', target.sourceRefName],
          ];
  for (const [field, expected] of checks) {
    if ((row[field] ?? null) !== (expected ?? null)) {
      throw new Error(`${label} stable identity drifted at ${field}`);
    }
  }
}

export function buildDuplicateQuarantinePlan({ rows, targets } = {}) {
  if (!Array.isArray(targets) || targets.length !== 2) {
    throw new Error('duplicate quarantine requires exactly two targets');
  }
  const relationLoot = indexBy(rows?.relationLootRows, 'id');
  const sourceFacts = indexBy(rows?.sourceFactRows, 'record_key');
  const sourceDetails = indexBy(rows?.sourceDetailRows, 'record_key');
  const localLoot = indexBy(rows?.localLootRows, 'id');
  const normalizedTargets = targets.map((raw) => {
    const target = {
      npcInternalName: required(raw.npcInternalName, 'target npcInternalName'),
      sourceRefName: required(raw.sourceRefName ?? raw.npcInternalName, 'target sourceRefName'),
      itemInternalName: required(raw.itemInternalName, 'target itemInternalName'),
      relationId: integer(raw.relationId, 'target relationId'),
      relationRecordKey: required(raw.relationRecordKey, 'target relationRecordKey'),
      sourceFactKey: required(raw.sourceFactKey, 'target sourceFactKey'),
      sourceDetailRecordKey: required(raw.sourceDetailRecordKey, 'target sourceDetailRecordKey'),
      localId: integer(raw.localId, 'target localId'),
      npcId: integer(raw.npcId, 'target npcId'),
      itemId: integer(raw.itemId, 'target itemId'),
      quantityText: raw.quantityText ?? null,
      chanceText: raw.chanceText ?? null,
      sourceMaint: raw.sourceMaint,
      survivor: raw.survivor,
    };
    assertTargetRow(relationLoot.get(String(target.relationId)), target, 'relation loot row');
    assertTargetRow(sourceFacts.get(target.sourceFactKey), target, 'source fact row');
    assertTargetRow(sourceDetails.get(target.sourceDetailRecordKey), target, 'source detail row');
    assertTargetRow(localLoot.get(String(target.localId)), target, 'local loot row');
    return target;
  }).sort((left, right) => left.relationId - right.relationId);

  return {
    schemaVersion: 1,
    operationId: DUPLICATE_QUARANTINE_OPERATION_ID,
    applyAllowed: false,
    targets: normalizedTargets,
    summary: {
      relationLoot: normalizedTargets.length,
      sourceFacts: normalizedTargets.length,
      sourceDetails: normalizedTargets.length,
      localLoot: normalizedTargets.length,
      total: normalizedTargets.length * 4,
    },
    ownershipKeys: [
      'relation.item_source_facts.items',
      'relation.item_source_details.items',
      'relation.item_npc_loot_relations.items',
      'local.npc_loot_entries.non_boss',
    ],
  };
}

function assertInputContract(input) {
  if (input?.contractVersion !== 2) throw new Error('duplicate quarantine input contract version 2 is required');
  if (input?.scopeSha256 !== hashDuplicateQuarantineScope(input)) {
    throw new Error('duplicate quarantine scope hash drifted');
  }
  if (input?.disposition?.status !== 0 || input?.disposition?.deleted !== 1) {
    throw new Error('duplicate quarantine disposition must soft-disable rows');
  }
  if (JSON.stringify(input?.expectedCounts) !== JSON.stringify({ facts: 2, details: 2, relations: 2, local: 2, survivors: 4 })) {
    throw new Error('duplicate quarantine expected counts are invalid');
  }
  for (const target of input.targets ?? []) {
    if (!target.sourceMaint || target.sourceMaint.table !== 'maint_npc_crawler_facts'
        || target.sourceMaint.status !== 1 || target.sourceMaint.deleted !== 0) {
      throw new Error('duplicate quarantine target source maint identity is invalid');
    }
    if (!target.survivor || target.survivor.status !== 1 || target.survivor.deleted !== 0) {
      throw new Error('duplicate quarantine survivor identity is invalid');
    }
  }
}

function assertSurvivorRows(rows, targets) {
  const relationById = indexBy(rows?.survivorRelationRows, 'id');
  const localById = indexBy(rows?.survivorLocalRows, 'id');
  for (const target of targets) {
    const survivor = target.survivor;
    const relation = relationById.get(String(survivor.relationId));
    const local = localById.get(String(survivor.localId));
    if (!relation || !active(relation) || !local || !active(local)) {
      throw new Error('canonical survivor must remain active');
    }
    for (const [field, expected] of [
      ['record_key', survivor.relationRecordKey],
      ['source_fact_key', survivor.sourceFactKey],
      ['npc_internal_name', survivor.npcInternalName],
      ['item_internal_name', survivor.itemInternalName],
    ]) {
      if ((relation[field] ?? null) !== (expected ?? null)) throw new Error('canonical survivor identity drifted');
    }
    for (const [field, expected] of [
      ['npc_id', target.npcId],
      ['item_id', target.itemId],
      ['source_item_id', target.itemId],
      ['quantity_text', survivor.quantityText],
      ['chance_text', survivor.chanceText],
      ['drop_source_kind', 'npc_drop'],
    ]) {
      if ((local[field] ?? null) !== (expected ?? null)) throw new Error('canonical survivor local identity drifted');
    }
  }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.length ? values.join('=') : 'true'];
  }));
}

function readInput(repoRoot, inputPath) {
  const resolved = path.resolve(repoRoot, inputPath);
  const input = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (input?.operationId !== DUPLICATE_QUARANTINE_OPERATION_ID || input?.schemaVersion !== 1) {
    throw new Error('duplicate quarantine input contract is invalid');
  }
  return input;
}

function configFor(repoRoot) {
  const configPath = path.join(repoRoot, 'platform', 'local', 'config', 'local-stack.config.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  const database = config.database ?? {};
  return {
    host: process.env.TERRAPEDIA_DB_HOST ?? database.host ?? '127.0.0.1',
    port: Number(process.env.TERRAPEDIA_DB_PORT ?? database.port ?? 13306),
    user: process.env.TERRAPEDIA_DB_USERNAME ?? database.username ?? 'root',
    password: process.env.TERRAPEDIA_DB_PASSWORD ?? database.password ?? 'root',
  };
}

async function readRows(connection, input, { forUpdate = false } = {}) {
  const relationIds = input.targets.map((target) => target.relationId);
  const localIds = input.targets.map((target) => target.localId);
  const factKeys = input.targets.map((target) => target.sourceFactKey);
  const detailKeys = input.targets.map((target) => target.sourceDetailRecordKey);
  const survivorRelationIds = input.targets.map((target) => target.survivor.relationId);
  const survivorLocalIds = input.targets.map((target) => target.survivor.localId);
  const params = (values) => values.map(() => '?').join(', ');
  const lock = forUpdate ? ' FOR UPDATE' : '';
  const [relationLootRows] = await connection.execute(
    `SELECT * FROM \`${DATABASES.relation}\`.\`item_npc_loot_relations\` WHERE id IN (${params(relationIds)})${lock}`,
    relationIds,
  );
  const [sourceFactRows] = await connection.execute(
    `SELECT * FROM \`${DATABASES.relation}\`.\`item_source_facts\` WHERE record_key IN (${params(factKeys)})${lock}`,
    factKeys,
  );
  const [sourceDetailRows] = await connection.execute(
    `SELECT * FROM \`${DATABASES.relation}\`.\`item_source_details\` WHERE record_key IN (${params(detailKeys)})${lock}`,
    detailKeys,
  );
  const [localLootRows] = await connection.execute(
    `SELECT * FROM \`${DATABASES.local}\`.\`npc_loot_entries\` WHERE id IN (${params(localIds)})${lock}`,
    localIds,
  );
  const [survivorRelationRows] = await connection.execute(
    `SELECT * FROM \`${DATABASES.relation}\`.\`item_npc_loot_relations\` WHERE id IN (${params(survivorRelationIds)})${lock}`,
    survivorRelationIds,
  );
  const [survivorLocalRows] = await connection.execute(
    `SELECT * FROM \`${DATABASES.local}\`.\`npc_loot_entries\` WHERE id IN (${params(survivorLocalIds)})${lock}`,
    survivorLocalIds,
  );
  return { relationLootRows, sourceFactRows, sourceDetailRows, localLootRows, survivorRelationRows, survivorLocalRows };
}

async function applyPlan(connection, plan) {
  const relationIds = plan.targets.map((target) => target.relationId);
  const localIds = plan.targets.map((target) => target.localId);
  const factKeys = plan.targets.map((target) => target.sourceFactKey);
  const detailKeys = plan.targets.map((target) => target.sourceDetailRecordKey);
  const params = (values) => values.map(() => '?').join(', ');
  const statements = plan.targets.flatMap((target) => [
    [`UPDATE \`${DATABASES.relation}\`.\`item_source_facts\` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE record_key = ? AND item_internal_name = ? AND source_ref_type = 'npc' AND source_ref_name = ? AND source_maint_table = ? AND source_maint_record_key = ? AND source_maint_id = ? AND status = 1 AND deleted = 0`, [target.sourceFactKey, target.itemInternalName, target.sourceRefName, target.sourceMaint.table, target.sourceMaint.recordKey, target.sourceMaint.id]],
    [`UPDATE \`${DATABASES.relation}\`.\`item_source_details\` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE record_key = ? AND source_fact_key = ? AND source_ref_name = ? AND source_maint_table = ? AND source_maint_record_key = ? AND source_maint_id = ? AND status = 1 AND deleted = 0`, [target.sourceDetailRecordKey, target.sourceFactKey, target.sourceRefName, target.sourceMaint.table, target.sourceMaint.recordKey, target.sourceMaint.id]],
    [`UPDATE \`${DATABASES.relation}\`.\`item_npc_loot_relations\` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND record_key = ? AND source_fact_key = ? AND item_internal_name = ? AND npc_internal_name = ? AND source_maint_table = ? AND source_maint_record_key = ? AND source_maint_id = ? AND quantity_text <=> ? AND chance_text <=> ? AND status = 1 AND deleted = 0`, [target.relationId, target.relationRecordKey, target.sourceFactKey, target.itemInternalName, target.npcInternalName, target.sourceMaint.table, target.sourceMaint.recordKey, target.sourceMaint.id, target.quantityText, target.chanceText]],
    [`UPDATE \`${DATABASES.local}\`.\`npc_loot_entries\` SET status = 0, deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND npc_id = ? AND item_id = ? AND source_item_id = ? AND drop_source_kind = 'npc_drop' AND quantity_text <=> ? AND chance_text <=> ? AND status = 1 AND deleted = 0`, [target.localId, target.npcId, target.itemId, target.itemId, target.quantityText, target.chanceText]],
  ]);
  const affected = [];
  for (const [sql, values] of statements) {
    const [result] = await connection.execute(sql, values);
    affected.push(Number(result?.affectedRows ?? 0));
  }
  if (affected.some((count) => count !== 1)) {
    throw new Error(`duplicate quarantine affected row counts drifted: ${affected.join(',')}`);
  }
  return affected;
}

export async function runDuplicateQuarantine({ repoRoot = process.cwd(), inputPath, outputPath, apply = false, mysqlModule } = {}) {
  const input = readInput(repoRoot, inputPath);
  assertInputContract(input);
  const connection = await loadMysqlModule({ repoRoot, mysqlModule }).createConnection(configFor(repoRoot));
  try {
    if (!apply) {
      const beforeRows = await readRows(connection, input);
      const plan = buildDuplicateQuarantinePlan({ rows: beforeRows, targets: input.targets });
      assertSurvivorRows(beforeRows, input.targets);
      return { ...plan, apply: false, beforeRows };
    }
    const authorizedContext = loadAuthorizedOperationContext({ operationId: DUPLICATE_QUARANTINE_OPERATION_ID });
    assertAuthorizedOperationDataBundle({ repoRoot, authorizedContext });
    consumeAuthorizedOperationDispatchPermit({
      authorizedContext,
      decisionLedgerPath: path.join(repoRoot, 'reports/authorization/canonical/used-decisions.json'),
    });
    await connection.beginTransaction();
    let affected;
    try {
      const beforeRows = await readRows(connection, input, { forUpdate: true });
      const plan = buildDuplicateQuarantinePlan({ rows: beforeRows, targets: input.targets });
      assertSurvivorRows(beforeRows, input.targets);
      affected = await applyPlan(connection, plan);
      const afterRows = await readRows(connection, input, { forUpdate: true });
      if (afterRows.relationLootRows.some(active)
          || afterRows.sourceFactRows.some(active)
          || afterRows.sourceDetailRows.some(active)
          || afterRows.localLootRows.some(active)) {
        throw new Error('duplicate quarantine readback found an active target row');
      }
      assertSurvivorRows(afterRows, input.targets);
      await connection.commit();
      return {
        ...plan,
        apply: true,
        authorization: {
          decisionIdentity: authorizedContext.decisionIdentity,
          packetHash: authorizedContext.packetHash,
        },
        affected,
        beforeRows,
        afterRows,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args['repo-root'] ?? process.cwd());
  const inputPath = args.input ?? 'reports/authorization/canonical/canonical-npc-duplicate-quarantine.input.json';
  const outputPath = path.resolve(repoRoot, args.output ?? 'reports/authorization/canonical/canonical-npc-duplicate-quarantine.result.json');
  const report = await runDuplicateQuarantine({
    repoRoot,
    inputPath,
    outputPath,
    apply: args.apply === 'true',
  });
  if (args.apply === 'true') {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
