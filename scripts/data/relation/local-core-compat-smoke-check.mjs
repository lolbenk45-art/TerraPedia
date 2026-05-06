#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { getProjectRoot } from '../lib/project-root.mjs';
import { loadLocalStackConfig } from '../../lib/local-runtime-config.mjs';
import {
  buildReplacementReadinessAudit,
  loadFourDomainData
} from './replacement-readiness-audit.mjs';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = getProjectRoot();

function booleanOption(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function parseArgs(argv) {
  const raw = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const index = body.indexOf('=');
    if (index >= 0) raw[body.slice(0, index)] = body.slice(index + 1);
    else raw[body] = 'true';
  }

  return {
    localDatabase: raw['local-database'] ?? raw.localDatabase ?? 'terria_v1_local',
    relationDatabase: raw['relation-database'] ?? raw.relationDatabase ?? 'terria_v1_relation',
    dateTag: raw['date-tag'] ?? raw.dateTag ?? null,
    throwOnFailure: booleanOption(raw['throw-on-failure'] ?? raw.throwOnFailure, true)
  };
}

function toDateTag(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

export function buildLocalCoreCompatSmokeCheck({ localData = {}, projectionData = {} } = {}) {
  const audit = buildReplacementReadinessAudit({ localData, projectionData });
  const domainResults = {};
  const failedDomains = [];

  for (const [domain, entry] of Object.entries(audit.domainResults)) {
    const rowCountMismatch = entry.localRowCount !== entry.projectionRowCount;
    const keyMismatch = entry.missingInProjectionCount > 0 || entry.extraInProjectionCount > 0;
    const fieldMismatch = entry.blockingFields.length > 0;
    const ok = !rowCountMismatch && !keyMismatch && !fieldMismatch;
    domainResults[domain] = {
      ...entry,
      ok,
      rowCountMismatch,
      keyMismatch,
      fieldMismatch
    };
    if (!ok) {
      failedDomains.push(domain);
    }
  }

  return {
    generatedAt: audit.generatedAt,
    ok: failedDomains.length === 0,
    failedDomains,
    domainResults
  };
}

async function defaultLoadData({ localDatabase, relationDatabase }, dependencies) {
  const config = dependencies.config ?? loadLocalStackConfig(repoRoot);
  const mysqlOptions = {
    host: config.database?.host ?? '127.0.0.1',
    port: Number(config.database?.port ?? 3306),
    user: config.database?.username ?? 'root',
    password: config.database?.password ?? 'root'
  };
  const localConn = await mysql.createConnection({ ...mysqlOptions, database: localDatabase });
  const relationConn = await mysql.createConnection({ ...mysqlOptions, database: relationDatabase });
  try {
    return await loadFourDomainData({ localConn, relationConn });
  } finally {
    await localConn.end();
    await relationConn.end();
  }
}

async function defaultWriteReport(report, dateTag) {
  const reportsDir = path.join(repoRoot, 'reports', 'relation');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `local-core-compat-smoke-${dateTag}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

export async function runLocalCoreCompatSmokeCheck(options = {}, dependencies = {}) {
  const now = dependencies.now ?? new Date();
  const normalized = {
    localDatabase: options.localDatabase ?? 'terria_v1_local',
    relationDatabase: options.relationDatabase ?? 'terria_v1_relation',
    dateTag: options.dateTag ?? toDateTag(now),
    throwOnFailure: options.throwOnFailure !== false
  };
  const loadData = dependencies.loadData ?? (() => defaultLoadData(normalized, dependencies));
  const writeReport = dependencies.writeReport ?? ((report) => defaultWriteReport(report, normalized.dateTag));
  const { localData, projectionData } = await loadData();
  const report = {
    ...buildLocalCoreCompatSmokeCheck({ localData, projectionData }),
    localDatabase: normalized.localDatabase,
    relationDatabase: normalized.relationDatabase
  };
  const reportPath = await writeReport(report);

  if (!report.ok && normalized.throwOnFailure) {
    const error = new Error(`Local core compatibility smoke check failed: ${report.failedDomains.join(', ')}`);
    error.report = report;
    error.reportPath = reportPath;
    throw error;
  }

  return { report, reportPath };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const result = await runLocalCoreCompatSmokeCheck(parseArgs(process.argv.slice(2)));
    console.log(`OK: ${result.report.ok}`);
    console.log(`Report: ${result.reportPath}`);
    if (!result.report.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error?.message ?? error);
    if (error?.reportPath) {
      console.error(`Report: ${error.reportPath}`);
    }
    process.exitCode = 1;
  }
}
