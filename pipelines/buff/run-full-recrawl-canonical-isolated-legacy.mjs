#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { runLiveAutomationAcceptance } from '../automation/run-live-automation-acceptance.mjs';
import { runBuffCanonicalT1Acceptance } from './buff-canonical-t1-acceptance.mjs';
import { AUTOMATION_REDIS_DOMAIN_BINDINGS } from '../automation/automation-database-contract.mjs';

const BUFF_REDIS_DB = AUTOMATION_REDIS_DOMAIN_BINDINGS.buff;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FULL_CAPTURE = path.join(
  resolvePrimaryRoot(ROOT),
  '.local/tmp/full-recrawl-20261013/buffs/buf_20261013_full/raw/wiki/template__getbuffinfo.parsed.latest.json',
);
const RUN_ROOT = path.join(
  resolvePrimaryRoot(ROOT),
  '.local/tmp/full-recrawl-20261014/buffs/buf_full_canonical_20261014',
);

function resolvePrimaryRoot(root) {
  const marker = `${path.sep}.worktrees${path.sep}`;
  const index = root.indexOf(marker);
  return index >= 0 ? root.slice(0, index) : root;
}

function readConfig(root) {
  const primary = resolvePrimaryRoot(root);
  const candidates = [
    process.env.TP_CONFIG_PATH,
    process.env.TERRAPEDIA_LOCAL_STACK_CONFIG,
    path.join(root, 'platform/local/config/local-stack.config.json'),
    path.join(primary, 'platform/local/config/local-stack.config.json'),
  ].filter(Boolean).map((value) => path.resolve(value));
  const configPath = candidates.find((value) => fs.existsSync(value));
  if (!configPath) throw new Error('local stack config is required');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function readFullCapture(inputPath = FULL_CAPTURE) {
  const capture = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(capture.buffs) || capture.buffs.length !== 400) {
    throw new Error(`full Buff capture must contain 400 records: ${inputPath}`);
  }
  return capture;
}

export async function runFullBuffCanonicalIsolated({
  repoRoot = ROOT,
  inputPath = FULL_CAPTURE,
  runId = `buff-full-canonical-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`,
  runRoot = RUN_ROOT,
} = {}) {
  const config = readConfig(repoRoot);
  const capture = readFullCapture(inputPath);
  fs.mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  const privateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-buff-full-canonical-'));
  const mysql = config.database ?? {};
  const redis = config.redis ?? {};
  try {
    const result = await runLiveAutomationAcceptance({
      profile: 't1',
      runId,
      privateDirectory,
      mysql: {
        host: mysql.host,
        port: Number(mysql.port),
        username: process.env.TERRAPEDIA_DB_USERNAME ?? mysql.username,
        password: process.env.TERRAPEDIA_DB_PASSWORD ?? mysql.password,
      },
      redis: {
        host: redis.host,
        port: Number(redis.port),
        password: redis.password,
        logicalDb: BUFF_REDIS_DB,
      },
      scope: 'buff-canonical',
      acceptanceExecutor: async (context) => runBuffCanonicalT1Acceptance({
        profile: context.profile,
        runId: context.runId,
        repoRoot: resolvePrimaryRoot(repoRoot),
        databases: context.databases,
        mysql: {
          ...context.mysql,
          readonlyUsername: context.mysql.readonlyUsername,
          readonlyPassword: context.mysql.readonlyPassword,
        },
        fullCapture: capture,
        redisLogicalDb: BUFF_REDIS_DB,
      }),
      onResources: async ({ redis: allocated }) => {
        if (Number(allocated.logicalDb) !== BUFF_REDIS_DB) {
          throw new Error('full Buff canonical isolated run allocated the wrong Redis DB');
        }
      },
    });
    const artifact = {
      schemaVersion: 'buff-full-canonical-isolated/v1',
      status: result.status,
      runId,
      source: {
        inputPath,
        totalBuffs: capture.buffs.length,
        sourceRevisionTimestamp: capture.sourceRevisionTimestamp ?? null,
        captureSha256: `sha256:${createHash('sha256').update(fs.readFileSync(inputPath)).digest('hex')}`,
      },
      redisLogicalDb: BUFF_REDIS_DB,
      formalDatabaseWrites: false,
      databaseWritesToFormalRuntime: false,
      realIsolatedIngestion: result.acceptance,
      cleanup: { passed: result.cleanupPassed === true, acceptanceCleanupPassed: result.cleanupPassed === true },
      acceptance: result,
      cleanupPassed: result.cleanupPassed === true,
    };
    const outputPath = path.join(runRoot, 'isolated-real-ingestion.json');
    fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600, flag: 'w' });
    return Object.freeze({ outputPath, ...artifact });
  } finally {
    fs.rmSync(privateDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFullBuffCanonicalIsolated()
    .then((result) => {
      process.stdout.write(`${JSON.stringify({ status: result.status, outputPath: result.outputPath, cleanupPassed: result.cleanupPassed }, null, 2)}\n`);
      if (result.status !== 'passed' || result.cleanupPassed !== true) process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(`Buff full canonical isolated run failed: ${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
