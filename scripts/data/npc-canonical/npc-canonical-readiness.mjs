#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NPC_CANONICAL_READINESS_SCHEMA_VERSION = 1;

const HASH_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/;
const MATCH_STATUSES = ['MATCHED', 'UNMATCHED', 'AMBIGUOUS', 'REJECTED'];
const RELATION_LANES = ['npcBuff', 'npcShop', 'npcLoot'];
const LEVEL_BY_SCOPE = Object.freeze({
  fixture: 'CODE_READY',
  't1-real-crawler': 'T1_VERIFIED',
  'formal-t2': 'T2_CUTOVER_VERIFIED',
});
const LEVEL_RANK = Object.freeze({
  CODE_READY: 1,
  T1_VERIFIED: 2,
  T2_CUTOVER_VERIFIED: 3,
});

export function buildNpcCanonicalReadinessReport({
  evidence = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const evidenceScope = evidence.evidenceScope ?? null;
  const report = {
    schemaVersion: NPC_CANONICAL_READINESS_SCHEMA_VERSION,
    reportKind: 'canonical_npc_crawler_facts_readiness',
    generatedAt,
    readinessLevel: LEVEL_BY_SCOPE[evidenceScope] ?? null,
    evidenceScope,
    writesDatabase: evidence.writesDatabase,
    databaseRole: evidence.databaseRole,
    crawlerRunIdentity: evidence.crawlerRunIdentity ?? null,
    t1Evidence: evidence.t1Evidence ?? null,
    cutoverIdentity: evidence.cutoverIdentity ?? null,
    landing: evidence.landing ?? {},
    maint: evidence.maint ?? {},
    relation: evidence.relation ?? {},
    local: evidence.local ?? {},
    runtime: evidence.runtime ?? {},
    api: evidence.api ?? {},
    bridgeRetirement: evidence.bridgeRetirement ?? {},
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

export function validateNpcCanonicalReadinessReport(report, { requiredLevel = null } = {}) {
  const result = evaluate(report ?? {}, { requiredLevel });
  const expectedStatus = result.valid ? 'pass' : 'blocked';
  if (report?.summary?.status !== expectedStatus) {
    result.blockingReasons.push('summary status does not match NPC canonical checks');
  }
  return { ...result, valid: result.blockingReasons.length === 0 };
}

function evaluate(report, { requiredLevel = null } = {}) {
  const checks = [];
  const blockingReasons = [];
  const check = (id, pass, message) => {
    checks.push({ id, status: pass ? 'pass' : 'blocked', message });
    if (!pass) blockingReasons.push(message);
  };

  check('schema-version', report.schemaVersion === 1, 'NPC canonical schemaVersion must be 1');
  check('report-kind', report.reportKind === 'canonical_npc_crawler_facts_readiness', 'NPC canonical reportKind is invalid');
  check('generated-at', isValidTimestamp(report.generatedAt), 'NPC canonical generatedAt must be a valid timestamp');
  check('evidence-scope', Object.hasOwn(LEVEL_BY_SCOPE, report.evidenceScope), 'NPC canonical evidence scope is invalid');
  check('readiness-level', report.readinessLevel === LEVEL_BY_SCOPE[report.evidenceScope], 'NPC canonical readiness level does not match evidence scope');
  check('read-only', report.writesDatabase === false, 'NPC canonical readiness must declare writesDatabase=false');

  if (report.evidenceScope === 'fixture') {
    check('database-role', report.databaseRole === 't0-fixture', 'NPC fixture readiness databaseRole must be t0-fixture');
    check('fixture-no-crawler-run', report.crawlerRunIdentity == null, 'NPC fixture readiness cannot carry a real crawler run identity');
    check('fixture-no-cutover', report.cutoverIdentity == null, 'NPC fixture readiness cannot carry a formal cutover identity');
  } else if (report.evidenceScope === 't1-real-crawler') {
    check('database-role', report.databaseRole === 't1-readonly', 'NPC T1 readiness databaseRole must be t1-readonly');
    check('crawler-run-id', hasText(report.crawlerRunIdentity?.runId), 'NPC T1 requires a real crawler run identity');
    check('crawler-normalized-hash', isHash(report.crawlerRunIdentity?.normalizedArtifactHash), 'NPC T1 normalized crawler artifact hash is missing');
    check('crawler-audit-hash', isHash(report.crawlerRunIdentity?.auditArtifactHash), 'NPC T1 crawler audit artifact hash is missing');
    check('t1-rollback', report.t1Evidence?.rollbackPassed === true, 'NPC T1 rollback evidence must pass');
    check('t1-restore', report.t1Evidence?.restorePassed === true, 'NPC T1 restore evidence must pass');
    check('t1-cleanup', report.t1Evidence?.cleanupPassed === true, 'NPC T1 zero-leak cleanup evidence must pass');
  } else if (report.evidenceScope === 'formal-t2') {
    check('database-role', report.databaseRole === 't2-readonly', 'NPC T2 readiness databaseRole must be t2-readonly');
    check('cutover-state', report.cutoverIdentity?.state === 'T2_CUTOVER_VERIFIED', 'NPC canonical cutover is not T2_CUTOVER_VERIFIED');
    check('cutover-operation', hasText(report.cutoverIdentity?.operationId), 'NPC canonical cutover operationId is missing');
    check('cutover-run', hasText(report.cutoverIdentity?.runId), 'NPC canonical cutover runId is missing');
    check('cutover-decision', hasText(report.cutoverIdentity?.decisionIdentity), 'NPC canonical cutover decision identity is missing');
    for (const [field, label] of [
      ['schemaBundleSha256', 'schema bundle hash'],
      ['dataBundleSha256', 'data bundle hash'],
      ['serverFingerprint', 'server fingerprint'],
      ['policySetHash', 'policy set hash'],
    ]) {
      check(`cutover-${field}`, isHash(report.cutoverIdentity?.[field]), `NPC canonical ${label} must be SHA-256`);
    }
  }

  if (requiredLevel) {
    check(
      'required-level',
      Number(LEVEL_RANK[report.readinessLevel] ?? 0) >= Number(LEVEL_RANK[requiredLevel] ?? Number.POSITIVE_INFINITY),
      `NPC canonical readiness must reach ${requiredLevel}`,
    );
  }

  checkLanding(report, check);
  checkMaint(report, check);
  checkProjection('relation', report.relation, check);
  checkProjection('local', report.local, check);
  check('runtime-positive', positiveInteger(report.runtime?.sampleCount), 'NPC runtime requires a positive sample');
  check('runtime-hash', report.runtime?.snapshotHash === report.local?.snapshotHash, 'NPC runtime snapshot hash must match local');
  for (const apiName of ['admin', 'public']) {
    check(`api-${apiName}-positive`, positiveInteger(report.api?.[apiName]?.sampleCount), `NPC ${apiName} API requires a positive sample`);
    check(`api-${apiName}-hash`, report.api?.[apiName]?.snapshotHash === report.local?.snapshotHash, `NPC ${apiName} API snapshot hash must match local`);
  }
  check('bridge-reference-count', report.bridgeRetirement?.referenceCount === 0, 'NPC bridge production reference count must be zero');
  check('bridge-hash', isHash(report.bridgeRetirement?.snapshotHash), 'NPC bridge retirement snapshot hash must be SHA-256');

  return { valid: blockingReasons.length === 0, checks, blockingReasons };
}

function checkLanding(report, check) {
  const base = report.landing?.base;
  const crawler = report.landing?.crawlerFacts;
  check('landing-base-fresh', base?.fresh === true, 'NPC base landing must be fresh');
  check('landing-base-count', base?.currentCount === 1, 'NPC base landing must have exactly one current row');
  check('landing-base-hash', isHash(base?.snapshotHash), 'NPC base landing snapshot hash must be SHA-256');
  check('landing-crawler-fresh', crawler?.fresh === true, 'NPC crawler-fact landing must be fresh');
  check('landing-crawler-count', positiveInteger(crawler?.currentCount), 'NPC crawler-fact landing must be non-empty');
  check(
    'landing-crawler-paired',
    crawler?.normalizedCount === crawler?.currentCount && crawler?.auditCount === crawler?.currentCount,
    'NPC crawler normalized and audit evidence counts must match current landing facts',
  );
  check('landing-crawler-hash', isHash(crawler?.snapshotHash), 'NPC crawler-fact landing snapshot hash must be SHA-256');
}

function checkMaint(report, check) {
  const factCount = report.maint?.factCount;
  const matchCounts = report.maint?.matchCounts ?? {};
  const counts = MATCH_STATUSES.map((status) => matchCounts[status]);
  check('maint-fact-count', positiveInteger(factCount), 'NPC maint crawler facts must be non-empty');
  for (let index = 0; index < MATCH_STATUSES.length; index += 1) {
    check(
      `maint-${MATCH_STATUSES[index].toLowerCase()}-count`,
      nonNegativeInteger(counts[index]),
      `NPC maint ${MATCH_STATUSES[index]} count must be a non-negative integer`,
    );
  }
  check('maint-matched-positive', positiveInteger(matchCounts.MATCHED), 'NPC maint requires at least one MATCHED crawler fact');
  check(
    'maint-four-state-total',
    counts.every(nonNegativeInteger) && counts.reduce((total, count) => total + count, 0) === factCount,
    'NPC maint four-state counts must equal the total fact count',
  );
  check('maint-hash', isHash(report.maint?.snapshotHash), 'NPC maint snapshot hash must be SHA-256');
}

function checkProjection(stage, projection, check) {
  for (const lane of RELATION_LANES) {
    check(`${stage}-${lane}-count`, positiveInteger(projection?.[lane]?.count), `NPC ${stage} ${lane} rows must be non-empty`);
    check(`${stage}-${lane}-hash`, isHash(projection?.[lane]?.snapshotHash), `NPC ${stage} ${lane} hash must be SHA-256`);
  }
  check(`${stage}-hash`, isHash(projection?.snapshotHash), `NPC ${stage} snapshot hash must be SHA-256`);
}

function isHash(value) {
  return HASH_PATTERN.test(String(value ?? ''));
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidence = args.input ? JSON.parse(fs.readFileSync(path.resolve(args.input), 'utf8')) : {};
  process.stdout.write(`${JSON.stringify(buildNpcCanonicalReadinessReport({ evidence }), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
