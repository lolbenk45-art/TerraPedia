#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { runLiveAutomationAcceptance } from '../automation/run-live-automation-acceptance.mjs';
import { AUTOMATION_REDIS_DOMAIN_BINDINGS } from '../automation/automation-database-contract.mjs';
import {
  applyBundleChanges,
  loadVerifiedShimmerImportBundle,
} from './import-wiki-shimmer-to-db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRIMARY_ROOT = resolvePrimaryRoot(ROOT);
const GENERATION_ID = '51608db4260fbd3949f188e7bd06e9f68ca20d545eb3aa64b3413b4dd7f9affd';
const MANIFEST_PATH = `data/generated/shimmer/generations/${GENERATION_ID}/wiki-shimmer-manifest.json`;
const RUN_ROOT = path.join(PRIMARY_ROOT, '.local/tmp/full-recrawl-20261014/shimmer/shm_full_canonical_20261014');
const mysql = createRequire(path.join(PRIMARY_ROOT, 'apps/admin-console/package.json'))('mysql2/promise');

function resolvePrimaryRoot(root) {
  const marker = `${path.sep}.worktrees${path.sep}`;
  const index = root.indexOf(marker);
  return index >= 0 ? root.slice(0, index) : root;
}

function readConfig(root) {
  const configPath = path.join(resolvePrimaryRoot(root), 'platform/local/config/local-stack.config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

async function readback(connection) {
  const tables = ['shimmer_item_transforms', 'shimmer_decraft_rules', 'shimmer_entity_transforms', 'shimmer_npc_transforms'];
  const counts = {};
  for (const table of tables) {
    const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\` WHERE status = 1 AND deleted = 0`);
    counts[table] = Number(row.count);
  }
  const [[context]] = await connection.query("SELECT COUNT(*) AS count FROM world_contexts WHERE code = 'SHIMMER'");
  const [[snapshots]] = await connection.query("SELECT COUNT(*) AS count FROM entity_source_snapshots WHERE provider = 'wiki_zh' AND source_page = '微光'");
  return { world_contexts: Number(context.count), entity_source_snapshots: Number(snapshots.count), ...counts };
}

export async function runShimmerFullCanonicalIsolated({
  repoRoot = ROOT,
  runId = `shimmer-full-canonical-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`,
  runRoot = RUN_ROOT,
} = {}) {
  const config = readConfig(repoRoot);
  const privateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shimmer-full-canonical-'));
  const bundle = loadVerifiedShimmerImportBundle({ bundleManifestPath: MANIFEST_PATH, repoRoot, allowUnresolvedReferences: true });
  try {
    const result = await runLiveAutomationAcceptance({
      profile: 't1',
      runId,
      privateDirectory,
      mysql: {
        host: config.database.host,
        port: Number(config.database.port),
        username: process.env.TERRAPEDIA_DB_USERNAME ?? config.database.username,
        password: process.env.TERRAPEDIA_DB_PASSWORD ?? config.database.password,
      },
      redis: {
        host: config.redis.host,
        port: Number(config.redis.port),
        password: config.redis.password,
        logicalDb: AUTOMATION_REDIS_DOMAIN_BINDINGS.shimmer,
      },
      scope: 'shimmer-canonical-isolated',
      acceptanceExecutor: async (context) => {
        const connection = await mysql.createConnection({
          host: context.mysql.host,
          port: context.mysql.port,
          user: context.mysql.username,
          password: context.mysql.password,
          database: context.databases.local,
        });
        try {
          await connection.beginTransaction();
          const summary = await applyBundleChanges({ bundle, connection });
          const counts = await readback(connection);
          await connection.commit();
          return { status: 'passed', database: context.databases.local, generationId: bundle.generationId, summary, counts, formalDatabaseWrites: false };
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          await connection.end();
        }
      },
      onResources: async ({ redis }) => {
        if (Number(redis.logicalDb) !== AUTOMATION_REDIS_DOMAIN_BINDINGS.shimmer) throw new Error('Shimmer isolated run allocated the wrong Redis DB');
      },
    });
    const artifact = {
      schemaVersion: 'shimmer-full-canonical-isolated/v1',
      status: result.status,
      runId,
      source: {
        generationId: bundle.generationId,
        manifestSha256: bundle.manifestSha256,
        dataBundleSha256: bundle.dataBundleSha256,
        unresolvedTitleCount: bundle.titleResolutionPayload.records.filter((record) => record.kind === 'unresolved' || record.hint === 'unresolved').length,
      },
      unresolvedTitleCount: bundle.titleResolutionPayload.records.filter((record) => record.kind === 'unresolved' || record.hint === 'unresolved').length,
      allowUnresolvedReferences: true,
      redisLogicalDb: AUTOMATION_REDIS_DOMAIN_BINDINGS.shimmer,
      formalDatabaseWrites: false,
      databaseWritesToFormalRuntime: false,
      realIsolatedIngestion: result.acceptance,
      cleanup: { passed: result.cleanupPassed === true, acceptanceCleanupPassed: result.cleanupPassed === true },
      acceptance: result,
      cleanupPassed: result.cleanupPassed === true,
    };
    fs.mkdirSync(runRoot, { recursive: true, mode: 0o700 });
    const outputPath = path.join(runRoot, 'isolated-real-ingestion.json');
    fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
    return Object.freeze({ outputPath, ...artifact });
  } finally {
    fs.rmSync(privateDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runShimmerFullCanonicalIsolated()
    .then((result) => {
      process.stdout.write(`${JSON.stringify({ status: result.status, outputPath: result.outputPath, cleanupPassed: result.cleanupPassed }, null, 2)}\n`);
      if (result.status !== 'passed' || result.cleanupPassed !== true) process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(`Shimmer full canonical isolated run failed: ${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
