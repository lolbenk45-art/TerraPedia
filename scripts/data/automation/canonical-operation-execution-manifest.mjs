import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './canonical-operation-catalog.mjs';

const CODE_PATHS = Object.freeze({
  'automation-biomes-l0-bootstrap': Object.freeze([
    'scripts/data/automation/bootstrap-automation-policy.mjs',
    'scripts/data/lib/mysql-module.mjs',
    'scripts/data/lib/project-root.mjs',
  ]),
  'canonical-image-sync': Object.freeze([
    'scripts/data/workflow/run-image-sync.mjs',
    'scripts/data/lib/wiki-item-utils.mjs',
    'scripts/data/lib/minio-image-upload.mjs',
    'scripts/data/relation/managed-image-url-policy.mjs',
    'scripts/data/workflow/backend-refresh-runtime-state.mjs',
  ]),
  'canonical-boss-import': Object.freeze([
    'scripts/data/import/import-wiki-bosses-to-db.mjs',
    'scripts/data/import/boss-import-strict-mode.mjs',
    'scripts/data/import/boss-reference-source.mjs',
    'scripts/data/lib/mysql-module.mjs',
    'scripts/data/lib/minio-image-upload.mjs',
    'scripts/data/lib/project-root.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-boss-loot-import': Object.freeze([
    'scripts/data/import/import-boss-loot-to-db.mjs',
    'scripts/data/import/boss-loot-schema-path.mjs',
    'scripts/data/import/boss-loot-owner.mjs',
    'scripts/data/generate/generate-boss-loot-bundle.mjs',
    'scripts/data/lib/base-domain-row-reconcile.mjs',
    'scripts/data/lib/mysql-module.mjs',
    'scripts/data/lib/project-root.mjs',
    'scripts/data/lib/wiki-item-utils.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-projectile-backfill': Object.freeze([
    'scripts/data/backfill/backfill-projectile-zh-and-images.mjs',
    'scripts/data/lib/projectile-name-resolver.mjs',
    'scripts/data/lib/wiki-item-utils.mjs',
    'scripts/data/workflow/backend-refresh-runtime-state.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-recipe-crawler': Object.freeze([
    'scripts/data/fetch/fetch-wiki-zh-recipe-pages.mjs',
    'scripts/data/fetch/fetch-wiki-zh-recipe-pages-progress.mjs',
    'scripts/data/lib/wiki-item-utils.mjs',
    'scripts/data/lib/wiki-page-utils.mjs',
    'scripts/data/workflow/backend-refresh-runtime-state.mjs',
  ]),
  'canonical-recipe-apply': Object.freeze([
    'scripts/data/pipeline/run-wiki-zh-recipe-sync-pipeline.mjs',
    'scripts/data/import/import-wiki-zh-recipes-to-db.mjs',
    'scripts/data/backfill/backfill-recipe-zh-display-names.mjs',
    'scripts/data/sync/consolidate-recipe-provider-priority.mjs',
    'scripts/data/lib/project-root.mjs',
    'scripts/data/lib/wiki-item-utils.mjs',
  ]),
  'canonical-shimmer-import': Object.freeze([
    'scripts/data/import/import-wiki-shimmer-to-db.mjs',
    'scripts/data/lib/mysql-module.mjs',
    'scripts/data/lib/project-root.mjs',
    'scripts/data/lib/wiki-item-utils.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-npc-crawler': Object.freeze([
    'scripts/data/npc-canonical/npc-crawler-fact-action.mjs',
    'scripts/data/crawler/src/cli.mjs',
    'scripts/data/crawler/src/batch/run-npc-batch.mjs',
    'scripts/data/crawler/src/live/npc-live-source.mjs',
    'scripts/data/crawler/src/output/npc-file-fanout.mjs',
    'scripts/data/crawler/src/domains/npc-domain.mjs',
    'scripts/data/workflow/backend-refresh-runtime-state.mjs',
  ]),
});

export const CANONICAL_EXECUTABLE_OPERATION_IDS = Object.freeze(
  CANONICAL_CUTOVER_OPERATION_IDS.filter((operationId) => (
    CANONICAL_OPERATION_ENTRYPOINTS[operationId] !== null
  )),
);

export function buildCanonicalOperationExecutionManifest({
  repoRoot = process.cwd(),
  operationId,
  artifactDate = new Date().toISOString().slice(0, 10),
  npcLimit = 25,
} = {}) {
  const contract = buildCanonicalOperationExecutionContract({ operationId, artifactDate, npcLimit });
  const root = path.resolve(repoRoot);
  const codeBundleEntries = CODE_PATHS[operationId].map((relativePath) => {
    const fullPath = path.join(root, relativePath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      throw new Error(`operation code file is missing: ${relativePath}`);
    }
    return {
      path: relativePath,
      contentHash: `sha256:${createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex')}`,
    };
  });
  return { ...contract, codeBundleEntries };
}

export function buildCanonicalOperationExecutionContract({
  operationId,
  artifactDate = new Date().toISOString().slice(0, 10),
  npcLimit = 25,
} = {}) {
  if (!CANONICAL_CUTOVER_OPERATION_IDS.includes(operationId)) {
    throw new Error(`unsupported operationId: ${operationId ?? ''}`);
  }
  if (CANONICAL_OPERATION_ENTRYPOINTS[operationId] === null) {
    throw new Error(`no governed executor is registered for operation: ${operationId}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(artifactDate)) {
    throw new Error('artifactDate must use YYYY-MM-DD');
  }
  if (operationId === 'canonical-npc-crawler' && npcLimit !== 25) {
    throw new Error('npcLimit must be exactly 25 for the frozen canonical NPC operation');
  }
  const definition = buildDefinition(operationId, artifactDate, npcLimit);
  return {
    schemaVersion: 1,
    operationId,
    artifactDate,
    ...definition,
  };
}

export function assertCanonicalOperationExecutionManifestContract({ operationId, manifest } = {}) {
  const npcLimit = operationId === 'canonical-npc-crawler'
    ? Number(manifest?.bounds?.targetLimit)
    : 25;
  const expected = buildCanonicalOperationExecutionContract({
    operationId,
    artifactDate: manifest?.artifactDate,
    npcLimit,
  });
  const { codeBundleEntries, ...actualContract } = manifest ?? {};
  if (JSON.stringify(stableValue(actualContract)) !== JSON.stringify(stableValue(expected))) {
    throw new Error(`execution manifest contract drifted for operation: ${operationId}`);
  }
  const actualCodePaths = Array.isArray(codeBundleEntries)
    ? codeBundleEntries.map((entry) => entry?.path)
    : [];
  if (JSON.stringify(actualCodePaths) !== JSON.stringify(CODE_PATHS[operationId])) {
    throw new Error(`execution manifest contract drifted for operation code bundle: ${operationId}`);
  }
  return true;
}

export function writeCanonicalOperationExecutionManifest({ outputPath, ...options } = {}) {
  const output = path.resolve(requireText(outputPath, 'outputPath'));
  const manifest = buildCanonicalOperationExecutionManifest(options);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, output);
    fs.chmodSync(output, 0o600);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return manifest;
}

function buildDefinition(operationId, artifactDate, npcLimit) {
  const definitions = {
    'automation-biomes-l0-bootstrap': {
      executionClass: 'formal_database_bootstrap',
      command: [
        'node',
        CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--input=reports/authorization/canonical/automation-biomes-l0-bootstrap.input.json',
        '--output=reports/authorization/canonical/automation-biomes-l0-bootstrap.result.json',
        '--apply=true',
      ],
      inputPaths: ['reports/authorization/canonical/automation-biomes-l0-bootstrap.input.json'],
      outputPaths: ['reports/authorization/canonical/automation-biomes-l0-bootstrap.result.json'],
      reportPaths: [],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-image-sync': {
      executionClass: 'formal_asset_sync',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--apply=true', '--scopes=items',
        `--output=reports/workflow-image-sync-${artifactDate}.json`,
        '--progress-path=reports/backend-refresh/history/canonical-image-sync.runtime/child-status.json',
      ],
      inputPaths: ['data/standardized/items.standardized.json'],
      outputPaths: ['data/standardized/items.standardized.json'],
      reportPaths: [`reports/workflow-image-sync-${artifactDate}.json`],
      progressPaths: ['reports/backend-refresh/history/canonical-image-sync.runtime/child-status.json'],
      databaseWrites: false,
      networkAccess: true,
    },
    'canonical-boss-import': {
      executionClass: 'formal_database_import',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--input=data/generated/wiki-bosses.latest.json',
        `--report-json=reports/wiki-bosses-import-${artifactDate}.json`,
        '--database=terria_v1_local', '--dry-run=false', '--strict=true',
      ],
      inputPaths: ['data/generated/wiki-bosses.latest.json', 'data/generated/npc-standardized-map.json'],
      outputPaths: ['data/generated/npc-standardized-map.json'],
      reportPaths: [`reports/wiki-bosses-import-${artifactDate}.json`],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: true,
    },
    'canonical-boss-loot-import': {
      executionClass: 'formal_database_import',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--bundle=data/wiki-crawler/normalized/boss-loot.bundle.json',
        `--report-json=reports/boss-loot-import-${artifactDate}.json`,
        '--database=terria_v1_local', '--dry-run=false', '--regenerate-bundle=false',
      ],
      inputPaths: ['data/wiki-crawler/normalized/boss-loot.bundle.json'],
      outputPaths: [],
      reportPaths: [`reports/boss-loot-import-${artifactDate}.json`],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-projectile-backfill': {
      executionClass: 'bounded_network_backfill',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--apply=true', '--limit=0',
        `--output=reports/projectile-zh-image-backfill-${artifactDate}.json`,
        '--progress-path=reports/backend-refresh/history/canonical-projectile-backfill.runtime/child-status.json',
      ],
      inputPaths: ['data/standardized/projectiles.standardized.json'],
      outputPaths: [
        'data/standardized/projectiles.standardized.json',
        'data/generated/projectile-zh-map.json',
      ],
      reportPaths: [`reports/projectile-zh-image-backfill-${artifactDate}.json`],
      progressPaths: ['reports/backend-refresh/history/canonical-projectile-backfill.runtime/child-status.json'],
      bounds: { inputCorpus: 'frozen_projectiles', limit: 0, serial: true },
      databaseWrites: false,
      networkAccess: true,
    },
    'canonical-recipe-crawler': {
      executionClass: 'bounded_network_crawler',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--pages=\u914d\u65b9,\u914d\u65b9/\u5de5\u4f5c\u53f0',
        '--expand-child-pages=true', '--max-depth=1',
        '--output=data/generated/wiki-zh-recipe-pages.latest.json',
        `--md-output=reports/wiki-zh-recipe-pages-${artifactDate}.md`,
        '--progress-path=reports/backend-refresh/history/canonical-recipe-crawler.runtime/child-status.json',
      ],
      inputPaths: [],
      outputPaths: ['data/generated/wiki-zh-recipe-pages.latest.json'],
      reportPaths: [`reports/wiki-zh-recipe-pages-${artifactDate}.md`],
      progressPaths: [
        'reports/backend-refresh/history/canonical-recipe-crawler.runtime/child-status.json',
        'data/generated/wiki-sync-progress.latest.json',
      ],
      sources: ['https://terraria.wiki.gg/zh/api.php'],
      bounds: { seedPageCount: 2, maxDepth: 1, serial: true },
      databaseWrites: false,
      networkAccess: true,
    },
    'canonical-recipe-apply': {
      executionClass: 'formal_database_pipeline',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--apply=true',
        '--input=data/generated/wiki-zh-recipe-pages.latest.json', '--database=terria_v1_local',
        `--import-report=reports/wiki-zh-recipe-import-${artifactDate}.json`,
        `--consolidation-report=reports/recipe-provider-consolidation-${artifactDate}.json`,
        `--output=reports/wiki-zh-recipe-sync-summary-${artifactDate}.json`,
      ],
      inputPaths: ['data/generated/wiki-zh-recipe-pages.latest.json'],
      outputPaths: [],
      reportPaths: [
        `reports/wiki-zh-recipe-import-${artifactDate}.json`,
        `reports/recipe-provider-consolidation-${artifactDate}.json`,
        `reports/wiki-zh-recipe-sync-summary-${artifactDate}.json`,
      ],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-shimmer-import': {
      executionClass: 'formal_database_import',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--apply=true',
        '--raw=data/generated/wiki-shimmer.latest.json', '--input=data/generated/shimmer',
        `--output=reports/wiki-shimmer-db-import-${artifactDate}.json`,
        '--database=terria_v1_local',
      ],
      inputPaths: [
        'data/generated/wiki-shimmer.latest.json',
        'data/generated/shimmer/wiki-shimmer-context.importable.latest.json',
        'data/generated/shimmer/wiki-shimmer-item-transforms.importable.latest.json',
        'data/generated/shimmer/wiki-shimmer-decraft-rules.importable.latest.json',
        'data/generated/shimmer/wiki-shimmer-entity-transforms.importable.latest.json',
        'data/generated/shimmer/wiki-shimmer-npc-transforms.importable.latest.json',
        'data/generated/shimmer/wiki-shimmer-manifest.latest.json',
      ],
      outputPaths: [],
      reportPaths: [`reports/wiki-shimmer-db-import-${artifactDate}.json`],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-npc-crawler': {
      executionClass: 'bounded_network_crawler',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--action-id=npc-crawler-facts-preview',
        '--targets-file=reports/authorization/canonical/canonical-npc-crawler.targets.json',
        `--limit=${npcLimit}`, '--output-root=data/wiki-crawler',
        '--progress-path=reports/backend-refresh/history/canonical-npc-crawler.runtime/child-status.json',
      ],
      inputPaths: ['reports/authorization/canonical/canonical-npc-crawler.targets.json'],
      outputPaths: [
        'data/wiki-crawler/normalized-light/npc',
        'data/wiki-crawler/canonical/npc',
        'data/wiki-crawler/audit/npc',
      ],
      reportPaths: [],
      progressPaths: ['reports/backend-refresh/history/canonical-npc-crawler.runtime/child-status.json'],
      sources: ['https://terraria.wiki.gg/api.php'],
      bounds: { targetLimit: npcLimit, serial: true },
      databaseWrites: false,
      networkAccess: true,
    },
  };
  return definitions[operationId];
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...values] = String(arg).replace(/^--/, '').split('=');
    return [key, values.join('=')];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifest = writeCanonicalOperationExecutionManifest({
      repoRoot: args['repo-root'] ?? process.cwd(),
      operationId: args['operation-id'],
      artifactDate: args['artifact-date'] ?? new Date().toISOString().slice(0, 10),
      npcLimit: args['npc-limit'] == null ? 25 : Number(args['npc-limit']),
      outputPath: args.output,
    });
    process.stdout.write(`${JSON.stringify({
      operationId: manifest.operationId,
      output: path.resolve(args.output),
    })}\n`);
  } catch (error) {
    process.stderr.write(`canonical operation manifest failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
