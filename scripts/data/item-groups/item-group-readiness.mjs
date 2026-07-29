#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ITEM_GROUP_READINESS_SCHEMA_VERSION = 1;

const EXPECTED_COUNTS = Object.freeze({
  landing: { sourceCount: 4, groupCount: 64 },
  maint: { groupCount: 35, memberCount: 163, aliasCount: 72, exclusionCount: 2 },
  relation: { groupCount: 35, memberCount: 163, aliasCount: 72, unresolvedCount: 0, ambiguousCount: 0, rejectedCount: 2 },
  local: { groupCount: 34, memberCount: 161, aliasCount: 70 },
});
const EXPECTED_SHADOWS = ['adminItemGroups', 'adminRecipeGroups', 'recipeTree'];
const EXPECTED_EXPORTS = new Set([
  'recipe-material-reference.json',
  'recipe-group-overrides.json',
  'item-group-overrides.json',
]);
const HASH_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/;

export function buildItemGroupReadinessReport({ evidence = {}, generatedAt = new Date().toISOString() } = {}) {
  const report = {
    schemaVersion: ITEM_GROUP_READINESS_SCHEMA_VERSION,
    reportKind: 'canonical_item_group_readiness',
    generatedAt,
    writesDatabase: evidence.writesDatabase,
    databaseRole: evidence.databaseRole,
    cutoverIdentity: evidence.cutoverIdentity ?? null,
    counts: evidence.counts ?? {},
    hashes: evidence.hashes ?? {},
    shadows: evidence.shadows ?? {},
    consumerContract: evidence.consumerContract ?? {},
    api: evidence.api ?? {},
    exports: Array.isArray(evidence.exports) ? evidence.exports : [],
  };
  const result = evaluate(report);
  return {
    ...report,
    checks: result.checks,
    blockingReasons: result.blockingReasons,
    warningReasons: [],
    summary: {
      status: result.valid ? 'pass' : 'blocked',
      blockingCount: result.blockingReasons.length,
      warningCount: 0,
    },
  };
}

export function validateItemGroupReadinessReport(report) {
  const result = evaluate(report ?? {});
  if (report?.summary?.status !== (result.valid ? 'pass' : 'blocked')) {
    result.blockingReasons.push('summary status does not match canonical checks');
  }
  return { ...result, valid: result.blockingReasons.length === 0 };
}

function evaluate(report) {
  const checks = [];
  const blockingReasons = [];
  const check = (id, pass, message) => {
    checks.push({ id, status: pass ? 'pass' : 'blocked', message });
    if (!pass) blockingReasons.push(message);
  };

  check('schema-version', report.schemaVersion === ITEM_GROUP_READINESS_SCHEMA_VERSION, 'canonical item-group schemaVersion must be 1');
  check('report-kind', report.reportKind === 'canonical_item_group_readiness', 'canonical item-group reportKind is invalid');
  check('generated-at', isValidTimestamp(report.generatedAt), 'canonical item-group generatedAt must be a valid timestamp');
  check('read-only', report.writesDatabase === false, 'canonical readiness must declare writesDatabase=false');
  check('database-role', report.databaseRole === 't2-readonly', 'canonical readiness databaseRole must be t2-readonly');
  check('cutover-state', report.cutoverIdentity?.state === 'T2_CUTOVER_VERIFIED', 'canonical item-group cutover is not T2_CUTOVER_VERIFIED');
  check('cutover-operation', Boolean(report.cutoverIdentity?.operationId), 'canonical item-group cutover operationId is missing');

  for (const [stage, expected] of Object.entries(EXPECTED_COUNTS)) {
    for (const [field, value] of Object.entries(expected)) {
      check(`count-${stage}-${field}`, report.counts?.[stage]?.[field] === value, `${stage}.${field} must equal ${value}`);
    }
    check(`hash-${stage}`, HASH_PATTERN.test(String(report.hashes?.[stage] ?? '')), `${stage} hash must be SHA-256`);
  }
  check(
    'hash-compatibility',
    HASH_PATTERN.test(String(report.hashes?.compatibility ?? '')),
    'compatibility hash must be SHA-256',
  );
  for (const consumer of EXPECTED_SHADOWS) {
    check(`shadow-${consumer}`, report.shadows?.[consumer]?.parity === true, `${consumer} shadow parity must pass`);
    check(`shadow-hash-${consumer}`, report.shadows?.[consumer]?.snapshotHash === report.hashes?.local, `${consumer} snapshot hash must match local`);
  }
  check('direct-json-readers', report.consumerContract?.directJsonReaders === 0, 'direct JSON reader count must be zero');
  check('fallback-disabled', report.consumerContract?.fallbackEnabled === false, 'JSON fallback must be disabled');
  check('api-snapshot-hash', report.api?.snapshotHash === report.hashes?.local, 'API snapshot hash must match local');

  const exportsByArtifact = new Map((Array.isArray(report.exports) ? report.exports : []).map((entry) => [entry?.artifact, entry]));
  check(
    'export-count',
    Array.isArray(report.exports)
      && report.exports.length === EXPECTED_EXPORTS.size
      && exportsByArtifact.size === EXPECTED_EXPORTS.size,
    'all three compatibility exports are required',
  );
  for (const artifact of EXPECTED_EXPORTS) {
    const entry = exportsByArtifact.get(artifact);
    check(`export-fresh-${artifact}`, entry?.fresh === true, `${artifact} export must be fresh`);
    check(
      `export-hash-${artifact}`,
      entry?.snapshotHash === report.hashes?.compatibility,
      `${artifact} snapshot hash must match compatibility`,
    );
  }
  return { valid: blockingReasons.length === 0, checks, blockingReasons };
}

function isValidTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

function resolveWithinCanonicalReports(repoRoot, value, fallback, label) {
  const root = path.resolve(repoRoot);
  const reportsRoot = path.join(root, 'reports/canonical-migration');
  const resolved = path.resolve(root, value || fallback);
  if (resolved !== reportsRoot && !resolved.startsWith(`${reportsRoot}${path.sep}`)) {
    throw new Error(`${label} must stay under reports/canonical-migration`);
  }
  return resolved;
}

async function verifyCompatibilityPublicationArtifacts(repoRoot, publication) {
  const exportsByArtifact = new Map((Array.isArray(publication.exports) ? publication.exports : [])
    .map((entry) => [entry?.artifact, entry]));
  if (publication.exports?.length !== EXPECTED_EXPORTS.size
      || exportsByArtifact.size !== EXPECTED_EXPORTS.size) {
    throw new Error('compatibility publication must describe all three exports');
  }
  for (const artifact of EXPECTED_EXPORTS) {
    const entry = exportsByArtifact.get(artifact);
    const expectedPath = `data/generated/${artifact}`;
    if (entry?.path !== expectedPath
        || entry?.exportRunKey !== publication.exportRunKey
        || entry?.snapshotHash !== publication.compatibilitySnapshotHash) {
      throw new Error(`compatibility export ${artifact} identity mismatch`);
    }
    const raw = await fs.promises.readFile(path.join(repoRoot, expectedPath), 'utf8');
    const contentHash = crypto.createHash('sha256').update(raw).digest('hex');
    if (contentHash !== String(entry.contentHash ?? '').replace(/^sha256:/, '')) {
      throw new Error(`compatibility export ${artifact} hash mismatch`);
    }
    const payload = JSON.parse(raw);
    if (payload?.artifactRole !== 'compat_export'
        || payload?.exportRunKey !== publication.exportRunKey
        || payload?.canonicalSnapshotHash !== publication.compatibilitySnapshotHash) {
      throw new Error(`compatibility export ${artifact} payload identity mismatch`);
    }
  }
}

export async function writeItemGroupReadinessReport({
  repoRoot = process.cwd(),
  inputPath = null,
  outputPath = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const root = path.resolve(repoRoot);
  const resolvedInput = resolveWithinCanonicalReports(
    root,
    inputPath,
    'reports/canonical-migration/item-group-compatibility-export.json',
    'readiness input',
  );
  const publication = JSON.parse(await fs.promises.readFile(resolvedInput, 'utf8'));
  if (publication?.schemaVersion !== 1
      || publication?.reportKind !== 'canonical_item_group_compatibility_export'
      || publication?.writesDatabase !== false
      || publication?.summary?.status !== 'pass'
      || !publication?.readinessEvidence) {
    throw new Error('passing read-only compatibility publication is required');
  }
  await verifyCompatibilityPublicationArtifacts(root, publication);
  const report = buildItemGroupReadinessReport({
    evidence: publication.readinessEvidence,
    generatedAt,
  });
  const resolvedOutput = resolveWithinCanonicalReports(
    root,
    outputPath,
    'reports/canonical-migration/canonical-item-group-readiness.json',
    'readiness output',
  );
  await fs.promises.mkdir(path.dirname(resolvedOutput), { recursive: true });
  const temporaryPath = `${resolvedOutput}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.promises.rename(temporaryPath, resolvedOutput);
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(args['repo-root'] || process.cwd());
  const report = await writeItemGroupReadinessReport({
    repoRoot,
    inputPath: args.input || null,
    outputPath: args.output || null,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
