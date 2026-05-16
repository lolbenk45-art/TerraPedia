#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();

export const REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES = [
  'CursedInferno',
  'OnFire',
  'OnFire3',
  'Poisoned',
  'Bleeding',
  'Confused',
  'Frostburn',
  'Frostburn2',
  'Ichor',
  'Venom',
  'ShadowFlame',
  'Shimmer',
  'Hemorrhage',
];

const EVIDENCE_CATEGORIES = [
  'complete',
  'missing_source_items',
  'missing_inflicting_npcs',
  'missing_full_immune_npcs',
  'missing_source_evidence',
  'parse_required',
  'manual_review_required',
];

const HIGH_RISK_DEBUFF_MIN_NPC_COUNTS = new Map([
  ['CursedInferno', 2],
  ['Poisoned', 2],
  ['OnFire', 2],
  ['Frostburn', 1],
  ['Bleeding', 2],
  ['Stoned', 1],
  ['Ichor', 2],
  ['Venom', 1],
  ['Electrified', 1],
  ['Confused', 2],
]);

const RELEVANT_FACT_GROUP_SECTION_KEYS = {
  sourceItems: new Set([
    'from player',
    'from item',
    'from environment',
    '来自玩家',
    '来自物品',
    '来自环境',
  ]),
  inflictingNpcs: new Set([
    'from enemy',
    'from npcs',
    '来自敌怪',
  ]),
};

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) args[body.slice(0, index)] = body.slice(index + 1);
    else args[body] = 'true';
  }
  return args;
}

function toText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasSourceEvidence(buff) {
  return buff?.sourceEvidence != null && typeof buff.sourceEvidence === 'object';
}

function getParseStatus(buff) {
  return toText(buff?.sourceEvidence?.parseStatus);
}

function hasUnresolvedFacts(buff) {
  return toArray(buff?.sourceEvidence?.unresolvedFacts).length > 0;
}

function getFactGroupStatus(buff, group) {
  return toText(buff?.sourceEvidence?.factGroups?.[group]?.status);
}

function hasTrustedEmptyFactGroup(buff, group) {
  if (getFactGroupStatus(buff, group) !== 'section_missing') {
    return false;
  }
  return !hasRelevantSectionEvidenceForFactGroup(buff, group);
}

function hasRelevantSectionEvidenceForFactGroup(buff, group) {
  const relevantKeys = RELEVANT_FACT_GROUP_SECTION_KEYS[group];
  if (!relevantKeys) {
    return false;
  }
  const sectionKeys = [
    ...toArray(buff?.sourceEvidence?.sectionAnchors),
    ...toArray(buff?.sourceEvidence?.sourceSections),
  ].map((value) => normalizeSectionKey(value)).filter(Boolean);
  return sectionKeys.some((key) => relevantKeys.has(key));
}

function normalizeSectionKey(value) {
  const text = toText(value);
  if (!text) {
    return null;
  }
  return text.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getSourceItemCount(buff) {
  return toArray(buff?.sourceItems).length || Number(buff?.sourceItemCount ?? 0);
}

function getInflictingNpcCount(buff) {
  return toArray(buff?.inflictingNpcs).length || Number(buff?.inflictingNpcCount ?? 0);
}

function hasFullImmuneNpcs(buff) {
  const immuneNpcCount = Number(buff?.immuneNpcCount ?? 0);
  if (immuneNpcCount <= 0) return true;
  return toArray(buff?.immuneNpcs).length >= immuneNpcCount;
}

function hasPositiveFullImmuneNpcs(buff) {
  const immuneNpcCount = Number(buff?.immuneNpcCount ?? 0);
  return immuneNpcCount > 0 && toArray(buff?.immuneNpcs).length >= immuneNpcCount;
}

function isOneSampleOnlyRisk(buff) {
  const immuneNpcCount = Number(buff?.immuneNpcCount ?? 0);
  const immuneNpcs = toArray(buff?.immuneNpcs);
  const immuneNpcSample = toArray(buff?.immuneNpcSample);
  return immuneNpcCount > 0 && immuneNpcs.length === 0 && immuneNpcSample.length > 0;
}

function buildBuffSummary(buff, category, inflictingNpcCount, relationInflictingNpcCount = null) {
  return {
    id: buff?.id ?? null,
    internalName: toText(buff?.internalName),
    englishName: toText(buff?.englishName),
    nameZh: toText(buff?.nameZh),
    category,
    sourceItemCount: getSourceItemCount(buff),
    inflictingNpcCount,
    relationInflictingNpcCount,
    relationUnresolvedInflictingIssueCount: null,
    immuneNpcCount: Number(buff?.immuneNpcCount ?? 0),
    immuneNpcFullCount: toArray(buff?.immuneNpcs).length,
    immuneNpcSampleCount: toArray(buff?.immuneNpcSample).length,
    hasSourceEvidence: hasSourceEvidence(buff),
    parseStatus: getParseStatus(buff),
    factGroups: buff?.sourceEvidence?.factGroups ?? null,
    unresolvedFacts: toArray(buff?.sourceEvidence?.unresolvedFacts),
  };
}

function buildBuffSummaryWithRelationAccounting(
  buff,
  category,
  inflictingNpcCount,
  relationInflictingNpcCount,
  relationUnresolvedInflictingIssueCount
) {
  return {
    ...buildBuffSummary(buff, category, inflictingNpcCount, relationInflictingNpcCount),
    relationUnresolvedInflictingIssueCount,
  };
}

export function classifyBuffEvidenceCoverage(buff, {
  inflictingNpcCount = getInflictingNpcCount(buff),
} = {}) {
  if (!hasSourceEvidence(buff)) {
    return 'missing_source_evidence';
  }
  const parseStatus = getParseStatus(buff);
  if (parseStatus && parseStatus !== 'parsed') {
    return 'parse_required';
  }
  if (hasUnresolvedFacts(buff)) {
    return 'manual_review_required';
  }
  if (getSourceItemCount(buff) <= 0 && !hasTrustedEmptyFactGroup(buff, 'sourceItems')) {
    return 'missing_source_items';
  }
  if (inflictingNpcCount <= 0 && !hasTrustedEmptyFactGroup(buff, 'inflictingNpcs')) {
    return 'missing_inflicting_npcs';
  }
  if (!hasFullImmuneNpcs(buff)) {
    return 'missing_full_immune_npcs';
  }
  return 'complete';
}

export function classifySourceCoverageIssue(buff) {
  const internalName = toText(buff?.internalName);
  const sourceItemCount = Number(buff?.sourceItemCount ?? 0);

  if (internalName !== 'CursedInferno') {
    return null;
  }
  if (sourceItemCount <= 0) {
    return 'missingSourceItems';
  }
  return null;
}

export function classifyImmuneCoverageIssue(buff) {
  const immuneNpcCount = Number(buff?.immuneNpcCount ?? 0);
  const immuneNpcSample = toArray(buff?.immuneNpcSample);

  if (immuneNpcCount <= 0) {
    return null;
  }
  if (immuneNpcSample.length === 0) {
    return 'missingSampleForPositiveCount';
  }
  if (immuneNpcCount >= 100 && immuneNpcSample.length < 10) {
    return 'largeCountButNotFullSampleWindow';
  }
  if (immuneNpcCount >= 20 && immuneNpcSample.length < 5) {
    return 'sampleTooSmallForCount';
  }
  if (immuneNpcCount >= 20 && immuneNpcSample.length < 10) {
    return 'sampleWindowLikelyNotRepresentative';
  }
  return null;
}

export function classifyInflictingCoverageIssue(buff) {
  const internalName = toText(buff?.internalName);
  const inflictingNpcCount = Number(buff?.inflictingNpcCount ?? 0);
  const minExpectedCount = internalName ? HIGH_RISK_DEBUFF_MIN_NPC_COUNTS.get(internalName) : null;

  if (minExpectedCount == null) {
    return null;
  }
  if (inflictingNpcCount < minExpectedCount) {
    return 'highRiskDebuffLowInflicts';
  }
  return null;
}

function classifyBridgeCoverageIssue(record) {
  const rows = toArray(record?.wikiCrawler?.buffInflictions);
  return rows.length === 0 ? 'missingBuffInflictions' : null;
}

export function buildBuffDomainCoverageBaseline({
  buffs = [],
  inflictingCountsByBuffInternalName = null,
  relationIssueCountsByBuffInternalName = null,
  npcBridgeRecords = [],
} = {}) {
  const sourceCoverageWarnings = [];
  const immuneCoverageWarnings = [];
  const inflictingCoverageWarnings = [];
  const relationConsistencyWarnings = [];
  const bridgeCoverageWarnings = [];
  const categories = Object.fromEntries(EVIDENCE_CATEGORIES.map((category) => [category, []]));

  const evidenceSummary = {
    total: buffs.length,
    withSourceEvidence: 0,
    withSourceItems: 0,
    withInflictingNpcs: 0,
    withFullImmuneNpcs: 0,
    immunePositiveMissingFull: 0,
    sourceMissingButImmunePositive: 0,
    oneSampleOnlyRisks: 0,
  };

  const recordsByInternalName = new Map();
  const hasRelationInflictingSnapshot = inflictingCountsByBuffInternalName instanceof Map;
  const hasRelationIssueSnapshot = relationIssueCountsByBuffInternalName instanceof Map;

  for (const buff of buffs) {
    const internalName = toText(buff?.internalName) ?? '';
    recordsByInternalName.set(internalName, buff);
    const sourceCoverageIssue = classifySourceCoverageIssue(buff);
    const inflictingNpcCount = getInflictingNpcCount(buff);
    const relationInflictingNpcCount = hasRelationInflictingSnapshot
      ? Number(inflictingCountsByBuffInternalName.get(internalName) ?? 0)
      : null;
    const relationUnresolvedInflictingIssueCount = hasRelationIssueSnapshot
      ? Number(relationIssueCountsByBuffInternalName.get(internalName) ?? 0)
      : 0;
    const enriched = { ...buff, inflictingNpcCount };
    const immuneNpcCount = Number(buff?.immuneNpcCount ?? 0);
    const fullImmuneNpcs = hasFullImmuneNpcs(buff);
    const positiveFullImmuneNpcs = hasPositiveFullImmuneNpcs(buff);
    const category = classifyBuffEvidenceCoverage(buff, { inflictingNpcCount });

    if (hasSourceEvidence(buff)) evidenceSummary.withSourceEvidence += 1;
    if (getSourceItemCount(buff) > 0) evidenceSummary.withSourceItems += 1;
    if (inflictingNpcCount > 0) evidenceSummary.withInflictingNpcs += 1;
    if (positiveFullImmuneNpcs) evidenceSummary.withFullImmuneNpcs += 1;
    if (immuneNpcCount > 0 && !fullImmuneNpcs) evidenceSummary.immunePositiveMissingFull += 1;
    if (immuneNpcCount > 0 && !hasSourceEvidence(buff)) evidenceSummary.sourceMissingButImmunePositive += 1;
    if (isOneSampleOnlyRisk(buff)) evidenceSummary.oneSampleOnlyRisks += 1;

    categories[category].push(buildBuffSummaryWithRelationAccounting(
      buff,
      category,
      inflictingNpcCount,
      relationInflictingNpcCount,
      hasRelationIssueSnapshot ? relationUnresolvedInflictingIssueCount : null
    ));

    if (hasRelationInflictingSnapshot && inflictingNpcCount <= 0 && relationInflictingNpcCount > 0) {
      relationConsistencyWarnings.push({
        id: buff?.id ?? null,
        internalName,
        englishName: toText(buff?.englishName),
        nameZh: toText(buff?.nameZh),
        standardizedInflictingNpcCount: inflictingNpcCount,
        relationInflictingNpcCount,
        issue: 'standardized_missing_relation_present',
      });
    }
    if (
      hasRelationInflictingSnapshot
      && inflictingNpcCount > 0
      && relationInflictingNpcCount + relationUnresolvedInflictingIssueCount < inflictingNpcCount
    ) {
      relationConsistencyWarnings.push({
        id: buff?.id ?? null,
        internalName,
        englishName: toText(buff?.englishName),
        nameZh: toText(buff?.nameZh),
        standardizedInflictingNpcCount: inflictingNpcCount,
        relationInflictingNpcCount,
        relationUnresolvedInflictingIssueCount: hasRelationIssueSnapshot ? relationUnresolvedInflictingIssueCount : null,
        unaccountedInflictingNpcCount: inflictingNpcCount - relationInflictingNpcCount - relationUnresolvedInflictingIssueCount,
        issue: hasRelationIssueSnapshot
          ? 'relation_unaccounted_standardized_present'
          : 'relation_missing_standardized_present',
      });
    }

    if (sourceCoverageIssue) {
      sourceCoverageWarnings.push({
        id: buff?.id ?? null,
        internalName,
        englishName: toText(buff?.englishName),
        nameZh: toText(buff?.nameZh),
        sourceItemCount: Number(buff?.sourceItemCount ?? 0),
        issue: sourceCoverageIssue,
      });
    }

    const immuneIssue = classifyImmuneCoverageIssue(enriched);
    if (immuneIssue) {
      immuneCoverageWarnings.push({
        id: buff?.id ?? null,
        internalName,
        englishName: toText(buff?.englishName),
        nameZh: toText(buff?.nameZh),
        immuneNpcCount: Number(buff?.immuneNpcCount ?? 0),
        immuneNpcSampleCount: toArray(buff?.immuneNpcSample).length,
        issue: immuneIssue,
      });
    }

    const inflictingIssue = classifyInflictingCoverageIssue(enriched);
    if (inflictingIssue) {
      inflictingCoverageWarnings.push({
        id: buff?.id ?? null,
        internalName,
        englishName: toText(buff?.englishName),
        nameZh: toText(buff?.nameZh),
        inflictingNpcCount,
        issue: inflictingIssue,
      });
    }
  }

  for (const record of npcBridgeRecords) {
    const issue = classifyBridgeCoverageIssue(record);
    if (!issue) continue;
    bridgeCoverageWarnings.push({
      internalName: toText(record?.internalName),
      name: toText(record?.name),
      issue,
    });
  }

  const requiredSampleRows = [];
  const requiredSampleMissing = [];
  for (const internalName of REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES) {
    const buff = recordsByInternalName.get(internalName);
    if (!buff) {
      requiredSampleMissing.push(internalName);
      continue;
    }
    const inflictingNpcCount = getInflictingNpcCount(buff);
    const relationInflictingNpcCount = hasRelationInflictingSnapshot
      ? Number(inflictingCountsByBuffInternalName.get(internalName) ?? 0)
      : null;
    const relationUnresolvedInflictingIssueCount = hasRelationIssueSnapshot
      ? Number(relationIssueCountsByBuffInternalName.get(internalName) ?? 0)
      : null;
    const category = classifyBuffEvidenceCoverage(buff, { inflictingNpcCount });
    requiredSampleRows.push(buildBuffSummaryWithRelationAccounting(
      buff,
      category,
      inflictingNpcCount,
      relationInflictingNpcCount,
      relationUnresolvedInflictingIssueCount
    ));
  }

  const fullBuffEvidencePassed = evidenceSummary.total > 0
    && evidenceSummary.withSourceEvidence === evidenceSummary.total
    && evidenceSummary.immunePositiveMissingFull === 0
    && evidenceSummary.sourceMissingButImmunePositive === 0
    && evidenceSummary.oneSampleOnlyRisks === 0
    && categories.missing_source_items.length === 0
    && categories.missing_inflicting_npcs.length === 0
    && categories.missing_full_immune_npcs.length === 0
    && categories.parse_required.length === 0
    && requiredSampleMissing.length === 0
    && requiredSampleRows.every((row) => row.category === 'complete');
  const relationMaterializationPassed = relationConsistencyWarnings.length === 0;
  const categoryReason = EVIDENCE_CATEGORIES
    .filter((category) => category !== 'complete' && categories[category].length > 0)
    .map((category) => `${category}=${categories[category].length}`)
    .join(', ');

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalBuffs: buffs.length,
      evidence: evidenceSummary,
      categories: Object.fromEntries(Object.entries(categories).map(([category, rows]) => [category, rows.length])),
      sourceCoverageWarnings: sourceCoverageWarnings.length,
      immuneCoverageWarnings: immuneCoverageWarnings.length,
      inflictingCoverageWarnings: inflictingCoverageWarnings.length,
      relationConsistencyWarnings: relationConsistencyWarnings.length,
      relationUnresolvedInflictingIssues: hasRelationIssueSnapshot
        ? Array.from(relationIssueCountsByBuffInternalName.values()).reduce((sum, value) => sum + Number(value ?? 0), 0)
        : null,
      bridgeCoverageWarnings: bridgeCoverageWarnings.length,
    },
    gates: {
      fullBuffEvidence: {
        passed: fullBuffEvidencePassed,
        reason: fullBuffEvidencePassed
          ? 'All buff evidence coverage checks passed.'
          : `Only ${evidenceSummary.withSourceEvidence} of ${evidenceSummary.total} buffs have sourceEvidence; ${evidenceSummary.withFullImmuneNpcs} have full immune NPC evidence; ${categoryReason || 'required samples incomplete'}.`,
      },
      relationMaterialization: {
        passed: relationMaterializationPassed,
        reason: relationMaterializationPassed
          ? 'All standardized inflicting NPC facts are materialized or exported as unresolved relation issues.'
          : `Relation materialization has relationConsistencyWarnings=${relationConsistencyWarnings.length}; inspect relationConsistencyWarnings and relation unresolved reports.`,
      },
    },
    categories,
    requiredSamples: {
      expected: REQUIRED_BUFF_EVIDENCE_SAMPLE_INTERNAL_NAMES,
      present: requiredSampleRows,
      missing: requiredSampleMissing,
    },
    sourceCoverageWarnings,
    immuneCoverageWarnings,
    inflictingCoverageWarnings,
    relationConsistencyWarnings,
    bridgeCoverageWarnings,
  };
}

async function loadInflictingCounts(connection) {
  const [rows] = await connection.query(`
    SELECT nbr.buff_internal_name AS internalName, COUNT(nbr.id) AS total
    FROM terria_v1_relation.npc_buff_relations nbr
    WHERE nbr.deleted = 0
      AND nbr.relation_type = 'inflicts'
      AND nbr.buff_internal_name IS NOT NULL
    GROUP BY nbr.buff_internal_name
  `);
  return new Map(rows.map((row) => [String(row.internalName), Number(row.total ?? 0)]));
}

function loadRelationIssueCounts(reportPath) {
  if (!reportPath || !fs.existsSync(reportPath)) {
    return null;
  }
  const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const rows = toArray(payload);
  const counts = new Map();
  for (const row of rows) {
    if (toText(row?.factGroup) !== 'inflictingNpcs') {
      continue;
    }
    if (toText(row?.reason) !== 'buff_inflicting_npc_unresolved') {
      continue;
    }
    const internalName = toText(row?.buffInternalName);
    if (!internalName) {
      continue;
    }
    counts.set(internalName, Number(counts.get(internalName) ?? 0) + 1);
  }
  return counts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(args.output ?? path.join(repoRoot, 'reports', 'buffs', 'buff-evidence-baseline.latest.json'));
  const relationUnresolvedPath = path.resolve(
    args['relation-unresolved'] ?? args.relationUnresolved ?? path.join(repoRoot, 'reports', 'relation', `relation-unresolved-${new Date().toISOString().slice(0, 10)}.json`)
  );
  const buffsPayload = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'standardized', 'buffs.standardized.json'), 'utf8'));
  const bridgePath = path.join(repoRoot, 'data', 'generated', 'wiki-crawler-npc-bridge', 'standardized', 'npcs.standardized.json');
  const bridgePayload = fs.existsSync(bridgePath) ? JSON.parse(fs.readFileSync(bridgePath, 'utf8')) : { records: [] };
  const configPath = resolveLocalStackConfigPath();
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const db = config.database ?? {};
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: db.host ?? '127.0.0.1',
    port: Number(db.port ?? 3306),
    user: db.username ?? 'root',
    password: db.password ?? 'root',
    database: db.name ?? 'terria_v1_local',
  });

  try {
    const inflictingCountsByBuffInternalName = await loadInflictingCounts(connection);
    const relationIssueCountsByBuffInternalName = loadRelationIssueCounts(relationUnresolvedPath);
    const report = buildBuffDomainCoverageBaseline({
      buffs: toArray(buffsPayload?.records),
      inflictingCountsByBuffInternalName,
      relationIssueCountsByBuffInternalName,
      npcBridgeRecords: toArray(bridgePayload?.records),
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify({ ...report, outputPath }, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      ...report.summary,
      gates: report.gates,
      outputPath,
    }, null, 2));
    if (report.gates.fullBuffEvidence.passed === false && args['no-fail-on-gate'] !== 'true') {
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

function resolveLocalStackConfigPath() {
  const directPath = path.join(repoRoot, 'scripts', 'dev', 'config', 'local-stack.config.json');
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const normalizedRoot = repoRoot.replace(/\\/g, '/');
  const marker = '/.worktrees/';
  const markerIndex = normalizedRoot.indexOf(marker);
  if (markerIndex >= 0) {
    const primaryRoot = normalizedRoot.slice(0, markerIndex);
    const primaryConfigPath = path.join(primaryRoot, 'scripts', 'dev', 'config', 'local-stack.config.json');
    if (fs.existsSync(primaryConfigPath)) {
      return primaryConfigPath;
    }
  }

  throw new Error(`Missing local stack config: ${directPath}`);
}

const isMain = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isMain) {
  main().catch((error) => {
    console.error('[audit-buff-domain-coverage-baseline] failed');
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}
