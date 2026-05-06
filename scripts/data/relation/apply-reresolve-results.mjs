#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { getProjectRoot } from '../lib/project-root.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = getProjectRoot();

const DEFAULTS = {
  relationDatabase: 'terria_v1_relation',
};

export function resolveMysqlRequirePath(root = repoRoot) {
  return path.join(root, 'data-query-app', 'package.json');
}

const require = createRequire(resolveMysqlRequirePath());
const mysql = require('mysql2/promise');

export function parseArgs(argv = process.argv.slice(2)) {
  const raw = {};
  for (const arg of argv) {
    const match = String(arg).match(/^--([^=]+)=(.*)$/);
    if (match) {
      raw[match[1]] = match[2];
    } else if (String(arg) === '--apply') {
      raw.apply = 'true';
    }
  }
  return {
    relationDatabase: nonEmptyText(raw['relation-database']) ?? DEFAULTS.relationDatabase,
    apply: raw.apply === 'true',
    generatedAt: nonEmptyText(raw['generated-at']) ?? null,
    confirmedCandidatesPath: nonEmptyText(raw['confirmed-candidates']) ?? null,
  };
}

export function loadConfirmedCandidatesPayload(payloadOrPath) {
  const payload = typeof payloadOrPath === 'string'
    ? JSON.parse(fs.readFileSync(payloadOrPath, 'utf8'))
    : payloadOrPath;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Confirmed candidates payload must be an object.');
  }
  if (payload.manualConfirmation?.confirmed !== true) {
    throw new Error('Confirmed candidates payload must declare manualConfirmation.confirmed=true.');
  }
  if (payload.activeWriterCheck?.confirmedClear !== true) {
    throw new Error('Confirmed candidates payload must declare activeWriterCheck.confirmedClear=true.');
  }
  if (!Array.isArray(payload.candidates)) {
    throw new Error('Confirmed candidates payload must declare candidates array.');
  }
  return payload;
}

export function buildApplyPlan({
  apply = false,
  generatedAt = new Date().toISOString(),
  confirmedCandidates = null,
  resolvedAtColumnPresent = false,
} = {}) {
  if (apply && !confirmedCandidates) {
    throw new Error('apply-reresolve-results requires --confirmed-candidates with explicit manual confirmation.');
  }
  const payload = confirmedCandidates ?? { candidates: [] };
  const approved = payload.candidates.filter((candidate) => candidate?.approved === true);
  return {
    generatedAt,
    apply,
    sourceReportPath: nonEmptyText(payload.sourceReportPath),
    summary: {
      approvedCandidateCount: approved.length,
      skippedCandidateCount: payload.candidates.length - approved.length,
      requiresManualConfirmation: true,
      resolvedAtColumnPresent: resolvedAtColumnPresent === true,
    },
    updates: approved.map((candidate) => ({
      auditId: String(candidate.auditId),
      nextAuditStatus: 'resolved_manual_confirmed',
      nextReasonCode: 'resolved_manual_confirmed',
      candidateNpcInternalName: nonEmptyText(candidate.proposedMatch?.npcInternalName),
      candidateNpcSourceId: toNullableNumber(candidate.proposedMatch?.npcSourceId),
      resolvedAt: generatedAt,
      manualConfirmation: {
        confirmedBy: payload.manualConfirmation.confirmedBy,
        confirmedAt: payload.manualConfirmation.confirmedAt,
      },
      activeWriterCheck: {
        checkedBy: payload.activeWriterCheck.checkedBy,
        checkedAt: payload.activeWriterCheck.checkedAt,
      },
      evidence: {
        ...(candidate.evidence ?? {}),
        appliedByScript: 'apply-reresolve-results',
        resolvedAt: generatedAt,
      },
    })),
  };
}

export async function runApplyReresolveResults({
  relationDatabase = DEFAULTS.relationDatabase,
  apply = false,
  generatedAt = new Date().toISOString(),
  confirmedCandidatesPath = null,
  connection = null,
} = {}) {
  const confirmedCandidates = confirmedCandidatesPath
    ? loadConfirmedCandidatesPayload(path.resolve(repoRoot, confirmedCandidatesPath))
    : null;
  const ownedConnection = connection ?? await mysql.createConnection({ database: relationDatabase });
  try {
    const resolvedAtColumnPresent = await hasResolvedAtColumn(ownedConnection, relationDatabase);
    const plan = buildApplyPlan({
      apply,
      generatedAt,
      confirmedCandidates,
      resolvedAtColumnPresent,
    });
    if (apply) {
      for (const update of plan.updates) {
        await ownedConnection.query(buildUpdateSql(relationDatabase, resolvedAtColumnPresent), buildUpdateParams(update, resolvedAtColumnPresent));
      }
    }
    return plan;
  } finally {
    if (!connection) {
      await ownedConnection.end();
    }
  }
}

async function hasResolvedAtColumn(connection, relationDatabase) {
  const [rows] = await connection.query(`
SELECT COUNT(*) AS count
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = ?
  AND TABLE_NAME = 'item_npc_relation_audits'
  AND COLUMN_NAME = 'resolved_at'
`, [relationDatabase]);
  return Number(rows?.[0]?.count ?? 0) > 0;
}

function buildUpdateSql(relationDatabase, resolvedAtColumnPresent) {
  return resolvedAtColumnPresent
    ? `UPDATE \`${relationDatabase}\`.\`item_npc_relation_audits\`
SET audit_status = ?, reason_code = ?, candidate_npc_internal_name = ?, evidence_json = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP
WHERE audit_key = ?`
    : `UPDATE \`${relationDatabase}\`.\`item_npc_relation_audits\`
SET audit_status = ?, reason_code = ?, candidate_npc_internal_name = ?, evidence_json = ?, updated_at = CURRENT_TIMESTAMP
WHERE audit_key = ?`;
}

function buildUpdateParams(update, resolvedAtColumnPresent) {
  const params = [
    update.nextAuditStatus,
    update.nextReasonCode,
    update.candidateNpcInternalName,
    JSON.stringify(update.evidence),
  ];
  if (resolvedAtColumnPresent) {
    params.push(update.resolvedAt);
  }
  params.push(update.auditId);
  return params;
}

function nonEmptyText(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await runApplyReresolveResults({
    relationDatabase: args.relationDatabase,
    apply: args.apply,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    confirmedCandidatesPath: args.confirmedCandidatesPath,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
