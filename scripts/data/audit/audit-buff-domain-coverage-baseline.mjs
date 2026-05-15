#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

import { getProjectRoot } from '../lib/project-root.mjs';

const repoRoot = getProjectRoot();

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
  inflictingCountsByBuffInternalName = new Map(),
  npcBridgeRecords = [],
} = {}) {
  const sourceCoverageWarnings = [];
  const immuneCoverageWarnings = [];
  const inflictingCoverageWarnings = [];
  const bridgeCoverageWarnings = [];

  for (const buff of buffs) {
    const internalName = toText(buff?.internalName) ?? '';
    const sourceCoverageIssue = classifySourceCoverageIssue(buff);
    const inflictingNpcCount = Number(inflictingCountsByBuffInternalName.get(internalName) ?? 0);
    const enriched = { ...buff, inflictingNpcCount };

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

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalBuffs: buffs.length,
      sourceCoverageWarnings: sourceCoverageWarnings.length,
      immuneCoverageWarnings: immuneCoverageWarnings.length,
      inflictingCoverageWarnings: inflictingCoverageWarnings.length,
      bridgeCoverageWarnings: bridgeCoverageWarnings.length,
    },
    sourceCoverageWarnings,
    immuneCoverageWarnings,
    inflictingCoverageWarnings,
    bridgeCoverageWarnings,
  };
}

async function loadInflictingCounts(connection) {
  const [rows] = await connection.query(`
    SELECT b.internal_name AS internalName, COUNT(nbr.id) AS total
    FROM buffs b
    LEFT JOIN npc_buff_relations nbr
      ON nbr.buff_id = b.id
     AND nbr.deleted = 0
     AND nbr.relation_type = 'inflicts'
    WHERE b.deleted = 0
    GROUP BY b.internal_name
  `);
  return new Map(rows.map((row) => [String(row.internalName), Number(row.total ?? 0)]));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(args.output ?? path.join(repoRoot, 'reports', 'data', `buff-domain-coverage-baseline-${new Date().toISOString().slice(0, 10)}.json`));
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
    const report = buildBuffDomainCoverageBaseline({
      buffs: toArray(buffsPayload?.records),
      inflictingCountsByBuffInternalName,
      npcBridgeRecords: toArray(bridgePayload?.records),
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify({ ...report, outputPath }, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ...report.summary, outputPath }, null, 2));
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
