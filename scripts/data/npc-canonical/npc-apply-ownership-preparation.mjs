#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TABLE_OWNERSHIP_MATRIX } from '../automation/table-ownership-matrix.mjs';

export const NPC_APPLY_OWNERSHIP_PREPARATION_SCHEMA_VERSION = 1;

const NPC_LANDING_OPERATION_ID = 'canonical-npc-landing-apply';

function phase(phaseIndex, operationId, capability, ownershipKeys, previousPhases) {
  return Object.freeze({
    phaseIndex,
    operationId,
    capability,
    ownershipKeys: Object.freeze([...ownershipKeys]),
    requiredOperationIds: Object.freeze([
      NPC_LANDING_OPERATION_ID,
      ...previousPhases,
    ]),
  });
}

export const NPC_APPLY_OWNER_PHASES = Object.freeze([
  phase(1, 'canonical-npc-facts-maint-apply', 'npc_crawler_facts', [
    'maint.maint_npc_crawler_facts.canonical',
  ], []),
  phase(2, 'canonical-npc-item-relations-apply', 'items', [
    'relation.item_source_facts.items',
    'relation.item_source_details.items',
    'relation.item_npc_shop_relations.items',
    'relation.item_npc_loot_relations.items',
  ], ['canonical-npc-facts-maint-apply']),
  phase(3, 'canonical-npc-buff-relations-apply', 'buffs', [
    'relation.npc_buff_relations.buffs',
  ], ['canonical-npc-facts-maint-apply', 'canonical-npc-item-relations-apply']),
  phase(4, 'canonical-npc-town-shop-projection-apply', 'town_npc_maintenance', [
    'local.npc_shop_entries',
    'local.npc_shop_conditions',
  ], ['canonical-npc-facts-maint-apply', 'canonical-npc-item-relations-apply', 'canonical-npc-buff-relations-apply']),
  phase(5, 'canonical-npc-buff-projection-apply', 'buffs', [
    'local.npc_buff_relations.buffs',
  ], ['canonical-npc-facts-maint-apply', 'canonical-npc-item-relations-apply', 'canonical-npc-buff-relations-apply', 'canonical-npc-town-shop-projection-apply']),
  phase(6, 'canonical-npc-nonboss-loot-projection-apply', 'npc_loot', [
    'local.npc_loot_entries.non_boss',
  ], ['canonical-npc-facts-maint-apply', 'canonical-npc-item-relations-apply', 'canonical-npc-buff-relations-apply', 'canonical-npc-town-shop-projection-apply', 'canonical-npc-buff-projection-apply']),
  phase(7, 'canonical-npc-boss-loot-projection-apply', 'boss_loot', [
    'local.npc_loot_entries.boss',
  ], ['canonical-npc-facts-maint-apply', 'canonical-npc-item-relations-apply', 'canonical-npc-buff-relations-apply', 'canonical-npc-town-shop-projection-apply', 'canonical-npc-buff-projection-apply', 'canonical-npc-nonboss-loot-projection-apply']),
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sha256(value) {
  const bytes = typeof value === 'string' ? value : JSON.stringify(stableValue(value));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function requireText(value, label) {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

function requireTimestamp(value, label) {
  const result = requireText(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} must be a valid timestamp`);
  return result;
}

function resolveRepoArtifact(repoRoot, value, label) {
  const root = path.resolve(repoRoot);
  const relative = requireText(value, label);
  const resolved = path.resolve(root, relative);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} must stay inside the repository`);
  }
  return resolved;
}

function readVerifiedArtifact(repoRoot, descriptor, label) {
  if (!descriptor || typeof descriptor !== 'object') throw new Error(`${label} descriptor is required`);
  const resolved = resolveRepoArtifact(repoRoot, descriptor.path, `${label} path`);
  const raw = fs.readFileSync(resolved, 'utf8');
  if (sha256(raw) !== String(descriptor.contentHash ?? '').replace(/^sha256:/, '')) {
    throw new Error(`${label} hash mismatch`);
  }
  if (Buffer.byteLength(raw, 'utf8') !== Number(descriptor.sizeBytes)) {
    throw new Error(`${label} size mismatch`);
  }
  const payload = JSON.parse(raw);
  return { payload, raw, logicalHash: sha256(JSON.stringify(payload)) };
}

function validatePhases(phases, ownershipRows) {
  if (!Array.isArray(phases) || phases.length === 0) throw new Error('NPC owner phases are required');
  const ownershipByKey = new Map(ownershipRows.map((row) => [row.key, row]));
  const claimedKeys = new Set();
  return phases.map((candidate) => {
    const operationId = requireText(candidate.operationId, 'NPC owner phase operationId');
    const capability = requireText(candidate.capability, `${operationId} capability`);
    if (!Array.isArray(candidate.ownershipKeys) || candidate.ownershipKeys.length === 0) {
      throw new Error(`${operationId} ownership keys are required`);
    }
    const owners = new Set();
    const targets = candidate.ownershipKeys.map((key) => {
      if (claimedKeys.has(key)) throw new Error(`duplicate NPC ownership target ${key}`);
      claimedKeys.add(key);
      const row = ownershipByKey.get(key);
      if (!row || row.writeMode !== 'write') throw new Error(`missing write ownership row ${key}`);
      owners.add(row.capability);
      return structuredClone(row);
    });
    if (owners.size !== 1 || !owners.has(capability)) {
      throw new Error(`${operationId} must have a single capability owner`);
    }
    return {
      phaseIndex: Number(candidate.phaseIndex),
      operationId,
      capability,
      ownershipKeys: [...candidate.ownershipKeys],
      requiredOperationIds: [...candidate.requiredOperationIds],
      targets,
      ownerValid: true,
      authorizationRequiredForFormal: true,
      formalExecutorRegistered: true,
    };
  });
}

function shopRows(record) {
  if (Array.isArray(record?.shop)) return record.shop;
  return Array.isArray(record?.shop?.items) ? record.shop.items : [];
}

function lootRows(record) {
  if (Array.isArray(record?.loot)) return record.loot;
  return Array.isArray(record?.loot?.items) ? record.loot.items : [];
}

function buffRows(record) {
  return Array.isArray(record?.buffInflictions) ? record.buffInflictions : [];
}

export async function buildNpcApplyOwnershipPreparation({
  repoRoot = process.cwd(),
  input,
  phases = NPC_APPLY_OWNER_PHASES,
  ownershipRows = TABLE_OWNERSHIP_MATRIX,
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  if (input?.schemaVersion !== 1 || input?.operationId !== 'canonical-npc-apply') {
    throw new Error('canonical-npc-apply input schema is required');
  }
  if (!Array.isArray(input.evidencePairs)
      || input.evidencePairs.length !== Number(input.pairCount)
      || input.evidencePairs.length === 0) {
    throw new Error('canonical NPC evidence pairCount is invalid');
  }
  const targetArtifact = readVerifiedArtifact(root, input.targetManifest, 'NPC target manifest');
  const targets = Array.isArray(targetArtifact.payload?.targets) ? targetArtifact.payload.targets : [];
  const targetByEntityId = new Map(targets.map((target) => [target.entityId, target]));
  if (targetByEntityId.size !== input.evidencePairs.length) {
    throw new Error('NPC target manifest does not match the frozen evidence pair count');
  }
  let buffFactCount = 0;
  let shopFactCount = 0;
  let lootFactCount = 0;
  let bossLootFactCount = 0;
  let nonBossLootFactCount = 0;
  let payloadBytes = 0;
  const pairHashes = [];
  for (const pair of input.evidencePairs) {
    const normalized = readVerifiedArtifact(root, pair.normalized, `normalized ${pair.entityId}`);
    const audit = readVerifiedArtifact(root, pair.audit, `audit ${pair.entityId}`);
    if (normalized.payload?.entityId !== pair.entityId) {
      throw new Error(`normalized entity identity mismatch for ${pair.entityId}`);
    }
    if (audit.payload?.status !== 'pass'
        || audit.payload?.entityId !== pair.entityId
        || audit.payload?.sourcePage !== pair.sourcePage
        || audit.payload?.sourceRevisionTimestamp !== pair.sourceRevisionTimestamp
        || audit.payload?.normalizedContentHash !== pair.normalizedContentHash
        || pair.normalizedContentHash !== normalized.logicalHash
        || pair.auditContentHash !== audit.logicalHash) {
      throw new Error(`paired audit identity mismatch for ${pair.entityId}`);
    }
    const buffs = buffRows(normalized.payload).length;
    const shop = shopRows(normalized.payload).length;
    const loot = lootRows(normalized.payload).length;
    const target = targetByEntityId.get(pair.targetEntityId ?? pair.entityId);
    if (!target) throw new Error(`missing frozen target identity for ${pair.entityId}`);
    const boss = String(target.priority ?? '').includes('boss');
    buffFactCount += buffs;
    shopFactCount += shop;
    lootFactCount += loot;
    if (boss) bossLootFactCount += loot;
    else nonBossLootFactCount += loot;
    payloadBytes += Number(pair.payloadBytes ?? 0);
    pairHashes.push({
      entityId: pair.entityId,
      normalizedContentHash: pair.normalizedContentHash,
      auditContentHash: pair.auditContentHash,
    });
  }
  if (payloadBytes !== Number(input.payloadBytes)) throw new Error('NPC input payloadBytes mismatch');
  if (buffFactCount === 0 || shopFactCount === 0 || lootFactCount === 0
      || bossLootFactCount === 0 || nonBossLootFactCount === 0) {
    throw new Error('NPC T1 preparation requires positive buff, shop, boss-loot, and non-boss-loot facts');
  }
  const ownerPhases = validatePhases(phases, ownershipRows);
  return {
    schemaVersion: NPC_APPLY_OWNERSHIP_PREPARATION_SCHEMA_VERSION,
    reportKind: 'canonical_npc_apply_ownership_preparation',
    generatedAt: requireTimestamp(generatedAt, 'generatedAt'),
    writesDatabase: false,
    sourceOperationId: input.operationId,
    state: 'T1_PREPARED',
    formalApplyReady: false,
    formalBlocker: 'the landing prerequisite and seven owner-specific phases still require independent exact authorizations and formal execution',
    evidence: {
      inputHash: sha256(input),
      targetManifestHash: input.targetManifest.contentHash,
      pairSetHash: sha256(pairHashes),
      pairCount: input.evidencePairs.length,
      payloadBytes,
      buffFactCount,
      shopFactCount,
      lootFactCount,
      bossLootFactCount,
      nonBossLootFactCount,
    },
    phases: ownerPhases,
    summary: { status: 'pass', blockingCount: 0, warningCount: 0 },
  };
}

export async function writeNpcApplyOwnershipPreparation({ repoRoot = process.cwd(), report } = {}) {
  if (report?.summary?.status !== 'pass' || report?.writesDatabase !== false) {
    throw new Error('passing read-only NPC ownership preparation is required');
  }
  const root = path.resolve(repoRoot);
  const outputPath = path.join(
    root,
    'reports/canonical-migration/canonical-npc-ownership-preparation.json',
  );
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.promises.rename(temporaryPath, outputPath);
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...rest] = String(arg).replace(/^--/, '').split('=');
    return [key, rest.join('=')];
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args['repo-root'] || process.cwd());
  const input = JSON.parse(fs.readFileSync(path.resolve(
    repoRoot,
    args.input || 'reports/authorization/canonical/canonical-npc-apply.input.json',
  ), 'utf8'));
  const report = await buildNpcApplyOwnershipPreparation({ repoRoot, input });
  await writeNpcApplyOwnershipPreparation({ repoRoot, report });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
