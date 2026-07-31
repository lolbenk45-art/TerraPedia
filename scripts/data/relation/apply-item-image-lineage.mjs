#!/usr/bin/env node

// Staged governed apply for the item image lineage lane.
//
// Four layers in a fixed order — landing, maint, relation, local — each in its
// own transaction, behind one owned-scope snapshot taken before the first
// mutation. Nothing reports completion until every layer verifies the same
// identity set, so a later-layer mismatch leaves the snapshot and the stage
// markers as the recovery path instead of a half-truth.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const OPERATION_ID = 'canonical-item-image-lineage-apply';
const STAGE_NAMES = Object.freeze(['landing', 'maint', 'relation', 'local']);

export function buildItemImageLineagePlan({
  contract,
  lineageBundleBytes,
  previews
} = {}) {
  if (contract?.operationId !== OPERATION_ID) {
    throw new Error(`contract operationId must be ${OPERATION_ID}`);
  }
  const bundleSha256 = sha256Bytes(requireValue(lineageBundleBytes, 'lineageBundleBytes'));
  const declared = requireSha256(contract?.lineageBundle?.sha256, 'contract lineageBundle sha256');
  if (declared !== bundleSha256) {
    throw new Error(`lineage bundle SHA-256 mismatch: expected ${declared}, found ${bundleSha256}`);
  }
  const bundle = parseJsonBytes(lineageBundleBytes, 'lineageBundleBytes');
  if (bundle?.entity !== 'item_image_lineage_bundle' || bundle?.datasetType !== 'item_image_sources_raw') {
    throw new Error('an item image lineage bundle for item_image_sources_raw is required');
  }

  const rows = requireRecords(bundle?.itemImages, 'lineage bundle itemImages');
  const targetKeys = [];
  const seen = new Set();
  for (const row of rows) {
    const key = requireText(row?.itemInternalName, 'lineage row itemInternalName');
    if (seen.has(key)) throw new Error(`duplicate lineage identity ${key}`);
    seen.add(key);
    targetKeys.push(key);
  }
  targetKeys.sort();
  if (Number(bundle?.counters?.total) !== targetKeys.length) {
    throw new Error('lineage bundle counters do not match its rows');
  }

  // Every layer must be projecting the same identities, and no layer may
  // propose deleting anything the lane does not own.
  for (const name of STAGE_NAMES) {
    const preview = previews?.[name];
    if (!preview) throw new Error(`${name} preview is required`);
    const previewKeys = [...requireRecords(preview?.targetKeys, `${name} preview targetKeys`)].sort();
    if (previewKeys.length !== targetKeys.length
        || previewKeys.some((key, index) => key !== targetKeys[index])) {
      throw new Error(`${name} preview identity set differs from the lineage bundle`);
    }
    for (const key of preview?.deleteCandidateKeys ?? []) {
      if (!seen.has(key)) {
        throw new Error(`${name} preview proposes a delete candidate outside the owned scope: ${key}`);
      }
    }
  }

  return {
    operationId: OPERATION_ID,
    expectedIdentityCount: targetKeys.length,
    targetKeys,
    lineageBundle: { path: contract?.lineageBundle?.path ?? null, sha256: bundleSha256 },
    rows,
    stages: STAGE_NAMES.map((name) => ({ name, targetKeys }))
  };
}

export async function executeItemImageLineageApply({ plan, adapter, generatedAt } = {}) {
  requireValue(plan, 'plan');
  requireValue(adapter, 'adapter');

  const snapshot = await adapter.snapshotOwnedScope(plan);
  const stages = plan.stages.map((stage) => ({ name: stage.name, status: 'pending' }));
  const failure = (message) => ({
    schemaVersion: 1,
    resultKind: 'canonical_item_image_lineage_apply_result',
    operationId: plan.operationId,
    status: 'FAILED',
    generatedAt: generatedAt ?? null,
    snapshot,
    stages,
    message,
    nextStep: `restore the owned scope from snapshot ${snapshot?.snapshotId ?? 'unknown'} `
      + 'and re-run this operation with a fresh packet'
  });

  for (const [index, stage] of plan.stages.entries()) {
    try {
      const outcome = await adapter.applyStage(stage, plan);
      stages[index] = { name: stage.name, status: 'applied', ...outcome };
    } catch (error) {
      stages[index] = { name: stage.name, status: 'failed', message: error?.message ?? String(error) };
      for (let rest = index + 1; rest < stages.length; rest += 1) {
        stages[rest] = { name: plan.stages[rest].name, status: 'skipped' };
      }
      return failure(`${stage.name} stage failed: ${error?.message ?? String(error)}`);
    }
  }

  const parity = await adapter.verifyParity(plan);
  for (const name of STAGE_NAMES) {
    const actual = Number(parity?.counts?.[name]);
    if (actual !== plan.expectedIdentityCount) {
      return failure(
        `${name} layer parity is ${actual}, expected ${plan.expectedIdentityCount}`
      );
    }
  }

  return {
    schemaVersion: 1,
    resultKind: 'canonical_item_image_lineage_apply_result',
    operationId: plan.operationId,
    status: 'COMPLETED',
    generatedAt: generatedAt ?? null,
    snapshot,
    stages,
    counts: parity.counts,
    preservedLocalRoles: parity.preservedLocalRoles ?? [],
    expectedIdentityCount: plan.expectedIdentityCount
  };
}

function parseJsonBytes(value, label) {
  if (value == null) throw new Error(`${label} is required`);
  return JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : String(value));
}

function requireRecords(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return value;
}

function requireValue(value, label) {
  if (value == null) throw new Error(`${label} is required`);
  return value;
}

function requireText(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function requireSha256(value, label) {
  const normalized = requireText(value, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) throw new Error(`${label} must be a sha256 hash`);
  return normalized;
}

function sha256Bytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function parseArgs(argv) {
  const options = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const separator = token.indexOf('=');
    if (separator > 2) options[token.slice(2, separator)] = token.slice(separator + 1);
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const contractPath = path.resolve(requireText(args['input-contract'], 'input-contract'));
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    const plan = buildItemImageLineagePlan({
      contract,
      lineageBundleBytes: fs.readFileSync(path.resolve(requireText(contract?.lineageBundle?.path, 'lineage bundle path'))),
      previews: contract?.previews
    });
    if (args.apply !== 'true') {
      process.stdout.write(`${JSON.stringify({
        applied: false,
        operationId: plan.operationId,
        expectedIdentityCount: plan.expectedIdentityCount,
        stages: plan.stages.map((stage) => stage.name)
      }, null, 2)}\n`);
    } else {
      throw new Error('apply requires the governed adapter, which is not wired to a database yet');
    }
  } catch (error) {
    process.stderr.write(`${error?.stack || error?.message || error}\n`);
    process.exitCode = 1;
  }
}
