#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  exportItemGroupCompatibility,
  parseItemGroupCompatibilityExports,
} from './export-item-group-compatibility.mjs';
import {
  buildItemGroupAcceptanceProjection,
  loadItemGroupAcceptanceInputs,
  validateItemGroupAcceptanceProjection,
} from './item-group-live-acceptance.mjs';

export const ITEM_GROUP_COMPATIBILITY_PUBLICATION_SCHEMA_VERSION = 1;

const EXPORT_TARGETS = Object.freeze([
  ['recipeMaterialReference', 'recipe-material-reference.json'],
  ['recipeGroupOverrides', 'recipe-group-overrides.json'],
  ['itemGroupOverrides', 'item-group-overrides.json'],
]);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
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

function exactJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} counts do not match the frozen canonical projection`);
  }
}

function validateFormalIdentity({
  canonicalSnapshot,
  priorReadinessEvidence,
  bootstrapResult,
  cutoverReport,
}) {
  if (bootstrapResult?.schemaVersion !== 1
      || bootstrapResult?.operationId !== 'canonical-item-group-bootstrap'
      || bootstrapResult?.status !== 'completed') {
    throw new Error('completed canonical item-group bootstrap result is required');
  }
  if (cutoverReport?.schemaVersion !== 1
      || cutoverReport?.reportKind !== 'canonical_item_group_cutover_verification'
      || cutoverReport?.status !== 'passed'
      || cutoverReport?.writesDatabase !== false
      || cutoverReport?.databaseRole !== 't2-readonly'
      || cutoverReport?.cutoverState !== 'T2_CUTOVER_VERIFIED'
      || !Array.isArray(cutoverReport?.blockingReasons)
      || cutoverReport.blockingReasons.length !== 0) {
    throw new Error('passing read-only T2 item-group cutover report is required');
  }
  if (cutoverReport.bootstrapRunKey !== bootstrapResult.runKey
      || cutoverReport.bootstrapOperationId !== bootstrapResult.operationId) {
    throw new Error('cutover and bootstrap run key identity mismatch');
  }
  exactJson(bootstrapResult.counts, priorReadinessEvidence?.counts, 'bootstrap');
  exactJson(cutoverReport.counts, priorReadinessEvidence?.counts, 'cutover');
  if (bootstrapResult.runtimeSnapshotHash !== priorReadinessEvidence?.hashes?.local
      || cutoverReport.runtimeSnapshotHash !== priorReadinessEvidence?.hashes?.local
      || cutoverReport.api?.snapshotHash !== priorReadinessEvidence?.hashes?.local) {
    throw new Error('runtime snapshot hash does not match cutover/bootstrap evidence');
  }
  if (bootstrapResult.compatibilitySnapshotHash !== priorReadinessEvidence?.hashes?.compatibility
      || bootstrapResult.compatibilitySnapshotHash !== canonicalSnapshot?.snapshotHash) {
    throw new Error('compatibility snapshot hash does not match bootstrap evidence');
  }
  for (const consumer of ['adminItemGroups', 'adminRecipeGroups', 'recipeTree']) {
    if (cutoverReport.shadows?.[consumer]?.status !== 'PASS'
        || (cutoverReport.shadows?.[consumer]?.differences?.length ?? 0) !== 0) {
      throw new Error(`${consumer} cutover shadow must pass`);
    }
  }
  if (cutoverReport.consumerContract?.directJsonReaders !== 0
      || cutoverReport.consumerContract?.fallbackEnabled !== false) {
    throw new Error('cutover consumer contract is not canonical-only');
  }
}

function stageHashes(projection) {
  return {
    landing: sha256(projection.landingRows),
    maint: sha256({
      groups: projection.maint.groups,
      members: projection.maint.members,
      aliases: projection.maint.aliases,
      exclusions: projection.maint.exclusions,
    }),
    relation: sha256({
      groups: projection.relation.groups,
      members: projection.relation.members,
      aliases: projection.relation.aliases,
    }),
    local: projection.runtime.snapshotHash,
    compatibility: projection.compatibility.snapshotHash,
  };
}

export function buildItemGroupCompatibilityPublication({
  projection,
  bootstrapResult,
  cutoverReport,
  exportRunKey,
  generatedAt = new Date().toISOString(),
} = {}) {
  const acceptedProjection = validateItemGroupAcceptanceProjection(projection);
  const canonicalSnapshot = parseItemGroupCompatibilityExports(acceptedProjection.compatibility.exports);
  const priorRecipeArtifact = acceptedProjection.compatibility.exports.recipeMaterialReference;
  const priorReadinessEvidence = {
    counts: acceptedProjection.counts,
    hashes: stageHashes(acceptedProjection),
  };
  return buildItemGroupCompatibilityPublicationFromSnapshot({
    canonicalSnapshot,
    priorReadinessEvidence,
    recipeEvidence: priorRecipeArtifact,
    bootstrapResult,
    cutoverReport,
    exportRunKey,
    generatedAt,
  });
}

export function buildItemGroupCompatibilityPublicationFromSnapshot({
  canonicalSnapshot,
  priorReadinessEvidence,
  recipeEvidence,
  bootstrapResult,
  cutoverReport,
  exportRunKey,
  generatedAt = new Date().toISOString(),
} = {}) {
  validateFormalIdentity({
    canonicalSnapshot,
    priorReadinessEvidence,
    bootstrapResult,
    cutoverReport,
  });
  const runKey = requireText(exportRunKey, 'exportRunKey');
  const generated = requireTimestamp(generatedAt, 'generatedAt');
  const artifacts = exportItemGroupCompatibility({
    snapshot: canonicalSnapshot,
    recipeEvidence: { ...recipeEvidence, landingRevision: canonicalSnapshot.landingRevision },
    exportRunKey: runKey,
  });
  const hashes = structuredClone(priorReadinessEvidence.hashes);
  const exports = EXPORT_TARGETS.map(([key, artifact]) => ({
    artifact,
    path: `data/generated/${artifact}`,
    fresh: true,
    snapshotHash: hashes.compatibility,
    contentHash: sha256(jsonBytes(artifacts[key])),
    exportRunKey: runKey,
  }));
  const shadows = Object.fromEntries(['adminItemGroups', 'adminRecipeGroups', 'recipeTree']
    .map((consumer) => [consumer, { parity: true, snapshotHash: hashes.local }]));
  const readinessEvidence = {
    writesDatabase: false,
    databaseRole: 't2-readonly',
    cutoverIdentity: {
      state: cutoverReport.cutoverState,
      operationId: cutoverReport.operationId,
      bootstrapRunKey: cutoverReport.bootstrapRunKey,
    },
    counts: structuredClone(priorReadinessEvidence.counts),
    hashes,
    shadows,
    consumerContract: structuredClone(cutoverReport.consumerContract),
    api: structuredClone(cutoverReport.api),
    exports: exports.map(({ path: ignored, contentHash, exportRunKey: exportIdentity, ...entry }) => ({
      ...entry,
      contentHash,
      exportRunKey: exportIdentity,
    })),
  };
  return {
    schemaVersion: ITEM_GROUP_COMPATIBILITY_PUBLICATION_SCHEMA_VERSION,
    reportKind: 'canonical_item_group_compatibility_export',
    generatedAt: generated,
    writesDatabase: false,
    databaseRole: 't2-readonly',
    exportRunKey: runKey,
    operationId: cutoverReport.operationId,
    bootstrapRunKey: bootstrapResult.runKey,
    runtimeSnapshotHash: hashes.local,
    compatibilitySnapshotHash: hashes.compatibility,
    canonicalSnapshot,
    exports,
    readinessEvidence,
    artifacts,
    summary: { status: 'pass', blockingCount: 0, warningCount: 0 },
  };
}

async function stageJson(targetPath, value) {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporaryPath, jsonBytes(value), { encoding: 'utf8', mode: 0o600 });
  return temporaryPath;
}

export async function writeItemGroupCompatibilityPublication({ repoRoot, publication } = {}) {
  const root = path.resolve(requireText(repoRoot, 'repoRoot'));
  if (publication?.summary?.status !== 'pass' || publication?.writesDatabase !== false) {
    throw new Error('passing read-only item-group compatibility publication is required');
  }
  const staged = [];
  try {
    for (const [key, artifact] of EXPORT_TARGETS) {
      const targetPath = path.join(root, 'data/generated', artifact);
      staged.push({ targetPath, temporaryPath: await stageJson(targetPath, publication.artifacts?.[key]) });
    }
    const reportPath = path.join(root, 'reports/canonical-migration/item-group-compatibility-export.json');
    const { artifacts: ignoredArtifacts, ...durableReport } = publication;
    staged.push({ targetPath: reportPath, temporaryPath: await stageJson(reportPath, durableReport) });
    for (const entry of staged) await fs.promises.rename(entry.temporaryPath, entry.targetPath);
  } catch (error) {
    await Promise.all(staged.map((entry) => fs.promises.rm(entry.temporaryPath, { force: true }).catch(() => {})));
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
  const bootstrapResult = JSON.parse(fs.readFileSync(path.resolve(
    repoRoot,
    args['bootstrap-result'] || 'reports/authorization/canonical/canonical-item-group-bootstrap.result.json',
  ), 'utf8'));
  const cutoverReport = JSON.parse(fs.readFileSync(path.resolve(
    repoRoot,
    args['cutover-report'] || 'reports/canonical-migration/item-group-cutover-verification.json',
  ), 'utf8'));
  const publicationReportPath = path.resolve(
    repoRoot,
    args['publication-report'] || 'reports/canonical-migration/item-group-compatibility-export.json',
  );
  let publication;
  if (fs.existsSync(publicationReportPath)) {
    const priorPublication = JSON.parse(fs.readFileSync(publicationReportPath, 'utf8'));
    const recipeEvidence = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'data/generated/recipe-material-reference.json'),
      'utf8',
    ));
    publication = buildItemGroupCompatibilityPublicationFromSnapshot({
      canonicalSnapshot: priorPublication.canonicalSnapshot,
      priorReadinessEvidence: priorPublication.readinessEvidence,
      recipeEvidence,
      bootstrapResult,
      cutoverReport,
      exportRunKey: args['export-run-key'],
    });
  } else {
    const projection = validateItemGroupAcceptanceProjection(buildItemGroupAcceptanceProjection({
      ...loadItemGroupAcceptanceInputs(repoRoot),
      runKey: bootstrapResult.runKey,
    }));
    publication = buildItemGroupCompatibilityPublication({
      projection,
      bootstrapResult,
      cutoverReport,
      exportRunKey: args['export-run-key'],
    });
  }
  await writeItemGroupCompatibilityPublication({ repoRoot, publication });
  const { artifacts: ignoredArtifacts, canonicalSnapshot: ignoredSnapshot, ...summary } = publication;
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
