import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_CUTOVER_OPERATION_IDS,
  CANONICAL_OPERATION_DATA_PATHS,
  CANONICAL_OPERATION_ENTRYPOINTS,
} from './canonical-operation-catalog.mjs';
import { canonicalServerFingerprint } from './automation-database-contract.mjs';
import {
  NPC_APPLY_OWNER_PHASES,
  NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION,
} from '../npc-canonical/npc-apply-ownership-preparation.mjs';

const NPC_OWNER_OPERATION_IDS = Object.freeze([
  'canonical-npc-landing-apply',
  ...NPC_APPLY_OWNER_PHASES.map((phase) => phase.operationId),
  NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION.operationId,
]);
const NPC_BASE_MAINT_OPERATION_IDS = Object.freeze([
  'canonical-npc-base-maint-nontown-apply',
  'canonical-npc-base-maint-town-apply',
]);
const AUTHORIZED_RUNNER_CODE_PATH = 'scripts/data/automation/run-authorized-canonical-operation.mjs';

const AUTHORIZED_CONTEXT_CODE_PATHS = Object.freeze([
  'scripts/data/automation/authorized-operation-context.mjs',
  'scripts/data/automation/build-canonical-cutover-authorization.mjs',
  'scripts/data/automation/canonical-operation-catalog.mjs',
  'scripts/data/automation/canonical-operation-execution-manifest.mjs',
  'scripts/data/automation/policy-set-hash.mjs',
]);

const CODE_PATHS = Object.freeze({
  'automation-biomes-l0-bootstrap': Object.freeze([
    'scripts/data/automation/bootstrap-automation-policy.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'scripts/data/lib/mysql-module.mjs',
    'scripts/data/lib/project-root.mjs',
  ]),
  'canonical-item-image-source-verification': Object.freeze([
    'scripts/data/workflow/run-backend-data-refresh.mjs',
    'scripts/data/fetch/fetch-item-image-source-verification.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
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
    'back/src/main/java/com/terraria/skills/controller/FileStorageController.java',
    'back/src/main/java/com/terraria/skills/service/ObjectStorageService.java',
    'back/src/main/java/com/terraria/skills/service/UserAvatarValidator.java',
    'back/src/main/java/com/terraria/skills/service/impl/MinioObjectStorageServiceImpl.java',
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
  'canonical-npc-t1-acceptance': Object.freeze([
    'scripts/data/automation/run-live-automation-acceptance.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'scripts/data/automation/automation-database-contract.mjs',
    'scripts/data/automation/mysql-automation-acceptance-adapter.mjs',
    'scripts/data/automation/provision-automation-databases.mjs',
    'scripts/data/automation/drop-automation-databases.mjs',
    'scripts/data/lib/mysql-module.mjs',
    'scripts/lib/local-runtime-config.mjs',
  ]),
  'canonical-schema-v56-v58': Object.freeze([
    'scripts/data/automation/run-canonical-schema-migration.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'scripts/data/maint/maint-schema.mjs',
    'scripts/data/relation/relation-schema.mjs',
    'back/src/main/java/com/terraria/skills/tooling/CanonicalFlywayMigrationCli.java',
    'back/pom.xml',
  ]),
  'automation-biomes-l1-policy-promotion': Object.freeze([
    'scripts/data/automation/run-automation-policy-decision.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'scripts/data/lib/mysql-module.mjs',
  ]),
  'automation-biomes-l2-promotion': Object.freeze([
    'scripts/data/automation/run-automation-policy-decision.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'scripts/data/lib/mysql-module.mjs',
  ]),
  'automation-biomes-scheduler-activation': Object.freeze([
    'scripts/data/automation/run-automation-policy-decision.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'scripts/data/lib/mysql-module.mjs',
  ]),
  'canonical-item-group-bootstrap': Object.freeze([
    'scripts/data/item-groups/item-group-canonical-action.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'scripts/data/item-groups/item-group-live-acceptance.mjs',
    'scripts/data/item-groups/item-group-bootstrap.mjs',
    'scripts/data/item-groups/item-group-canonical-sync.mjs',
    'scripts/data/item-groups/export-item-group-compatibility.mjs',
    'scripts/data/workflow/backend-refresh-runtime-state.mjs',
    'scripts/data/lib/mysql-module.mjs',
  ]),
  'automation-biomes-first-l1': Object.freeze([
    'scripts/data/automation/run-biomes-automation-operation.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'scripts/data/import/import-biomes-to-db.mjs',
    'scripts/data/lib/base-domain-row-reconcile.mjs',
    'scripts/data/lib/load-standardized-dataset.mjs',
    'scripts/data/lib/mysql-module.mjs',
    'scripts/data/lib/project-root.mjs',
  ]),
  'automation-biomes-second-l1': Object.freeze([
    'scripts/data/automation/run-biomes-automation-operation.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'scripts/data/import/import-biomes-to-db.mjs',
    'scripts/data/lib/base-domain-row-reconcile.mjs',
    'scripts/data/lib/load-standardized-dataset.mjs',
    'scripts/data/lib/mysql-module.mjs',
    'scripts/data/lib/project-root.mjs',
  ]),
  ...Object.fromEntries(NPC_OWNER_OPERATION_IDS.map((operationId) => [operationId, Object.freeze([
    'scripts/data/npc-canonical/npc-owner-phase-apply.mjs',
    'scripts/data/npc-canonical/npc-apply-ownership-preparation.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'scripts/data/lib/mysql-module.mjs',
  ])])),
  ...Object.fromEntries(NPC_BASE_MAINT_OPERATION_IDS.map((operationId) => [operationId, Object.freeze([
    'scripts/data/npc-canonical/npc-base-maint-apply.mjs',
    ...AUTHORIZED_CONTEXT_CODE_PATHS,
    'scripts/data/lib/mysql-module.mjs',
  ])])),
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
  backendApiBase = null,
  resultLabel = null,
  npcT1ConfigPath = null,
  npcT1RedisDb = null,
  npcT1RunId = null,
} = {}) {
  const contract = buildCanonicalOperationExecutionContract({
    operationId,
    artifactDate,
    npcLimit,
    backendApiBase,
    resultLabel,
    npcT1ConfigPath,
    npcT1RedisDb,
    npcT1RunId,
  });
  const root = path.resolve(repoRoot);
  const codeBundleEntries = expandRepositoryCodePaths(root, operationCodePaths(operationId)).map((relativePath) => {
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
  backendApiBase = null,
  resultLabel = null,
  npcT1ConfigPath = null,
  npcT1RedisDb = null,
  npcT1RunId = null,
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
  const normalizedResultLabel = normalizeResultLabel(resultLabel);
  if (normalizedResultLabel && !NPC_OWNER_OPERATION_IDS.includes(operationId)) {
    throw new Error('result label is supported only for an NPC owner operation');
  }
  const npcT1Acceptance = operationId === 'canonical-npc-t1-acceptance'
    ? buildNpcT1AcceptanceIdentity({
      configPath: npcT1ConfigPath,
      redisLogicalDb: npcT1RedisDb,
      runId: npcT1RunId,
    })
    : null;
  const definition = buildDefinition(
    operationId,
    artifactDate,
    npcLimit,
    backendApiBase,
    npcT1Acceptance,
    normalizedResultLabel,
  );
  return {
    schemaVersion: 1,
    operationId,
    artifactDate,
    ...(normalizedResultLabel ? { resultLabel: normalizedResultLabel } : {}),
    ...definition,
  };
}

export function assertCanonicalOperationExecutionManifestContract({
  repoRoot = process.cwd(),
  operationId,
  manifest,
} = {}) {
  const npcLimit = operationId === 'canonical-npc-crawler'
    ? Number(manifest?.bounds?.targetLimit)
    : 25;
  const backendApiBase = manifest?.command?.find((argument) => (
    typeof argument === 'string' && argument.startsWith('--apiBase=')
  ))?.slice('--apiBase='.length) ?? null;
  const npcT1Acceptance = manifest?.isolatedAcceptance ?? null;
  const expected = buildCanonicalOperationExecutionContract({
    operationId,
    artifactDate: manifest?.artifactDate,
    npcLimit,
    backendApiBase,
    resultLabel: manifest?.resultLabel ?? null,
    npcT1ConfigPath: npcT1Acceptance?.configPath ?? null,
    npcT1RedisDb: npcT1Acceptance?.redisLogicalDb ?? null,
    npcT1RunId: npcT1Acceptance?.runId ?? null,
  });
  if (operationId === 'canonical-npc-t1-acceptance'
      && expected.isolatedAcceptance?.configSha256 !== npcT1Acceptance?.configSha256) {
    throw new Error('NPC T1 config hash drifted from the execution manifest');
  }
  const { codeBundleEntries, ...actualContract } = manifest ?? {};
  if (JSON.stringify(stableValue(actualContract)) !== JSON.stringify(stableValue(expected))) {
    throw new Error(`execution manifest contract drifted for operation: ${operationId}`);
  }
  const actualCodePaths = Array.isArray(codeBundleEntries)
    ? codeBundleEntries.map((entry) => entry?.path)
    : [];
  const expectedCodePaths = expandRepositoryCodePaths(path.resolve(repoRoot), operationCodePaths(operationId));
  if (JSON.stringify(actualCodePaths) !== JSON.stringify(expectedCodePaths)) {
    throw new Error(`execution manifest contract drifted for operation code bundle: ${operationId}`);
  }
  return true;
}

function operationCodePaths(operationId) {
  return [...CODE_PATHS[operationId], AUTHORIZED_RUNNER_CODE_PATH];
}

function expandRepositoryCodePaths(repoRoot, seedPaths) {
  const paths = [];
  const seen = new Set();
  const queue = [...seedPaths];
  while (queue.length > 0) {
    const relativePath = queue.shift();
    if (seen.has(relativePath)) continue;
    const fullPath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      throw new Error(`operation code file is missing: ${relativePath}`);
    }
    seen.add(relativePath);
    paths.push(relativePath);
    if (!relativePath.endsWith('.mjs')) continue;
    const source = fs.readFileSync(fullPath, 'utf8');
    for (const specifier of staticRelativeImports(source)) {
      let importedPath = path.posix.normalize(path.posix.join(
        path.posix.dirname(relativePath),
        specifier,
      ));
      if (!path.posix.extname(importedPath)) importedPath += '.mjs';
      const importedFullPath = path.join(repoRoot, importedPath);
      if (fs.existsSync(importedFullPath) && fs.statSync(importedFullPath).isFile()
          && !seen.has(importedPath)) {
        queue.push(importedPath);
      }
    }
  }
  return paths;
}

function staticRelativeImports(source) {
  const imports = [];
  for (const pattern of [
    /(?:import\s+(?:[^'\"]*?\s+from\s+)?|export\s+[^'\"]*?\s+from\s+)['\"](\.[^'\"]+)['\"]/g,
    /import\s*\(\s*['\"](\.[^'\"]+)['\"]\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }
  return imports;
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

function buildDefinition(
  operationId,
  artifactDate,
  npcLimit,
  backendApiBase,
  npcT1Acceptance,
  resultLabel,
) {
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
    'canonical-item-image-source-verification': {
      executionClass: 'bounded_network_crawler',
      command: [
        'node',
        CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--mode=apply',
        '--steps=item-image-source-verification',
        '--output=reports/backend-refresh/history/canonical-item-image-source-verification.json',
      ],
      inputPaths: [
        'reports/authorization/canonical/canonical-item-image-source-verification.input.json',
      ],
      outputPaths: ['reports/audit/item-image-source-verification.latest.json'],
      reportPaths: [
        'reports/audit/item-image-source-verification.latest.json',
        'reports/backend-refresh/history/canonical-item-image-source-verification.json',
      ],
      progressPaths: [
        'reports/backend-refresh/history/canonical-item-image-source-verification.runtime/item-image-source-verification.child-status.json',
      ],
      sources: ['https://terraria.wiki.gg/api.php'],
      bounds: {
        unresolvedIdentityCount: 877,
        batchSize: 8,
        maxRequests: 877,
        serial: true,
      },
      databaseWrites: false,
      networkAccess: true,
    },
    'canonical-image-sync': {
      executionClass: 'formal_asset_sync',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId], '--apply=true', '--scopes=items',
        `--apiBase=${requireBackendApiBase(operationId, backendApiBase)}`,
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
        `--apiBase=${requireBackendApiBase(operationId, backendApiBase)}`,
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
    ...(operationId === 'canonical-npc-t1-acceptance'
      ? { [operationId]: npcT1AcceptanceDefinition(operationId, npcT1Acceptance) }
      : {}),
    'canonical-schema-v56-v58': {
      executionClass: 'formal_schema_migration',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--output=reports/authorization/canonical/canonical-schema-v56-v58.result.json',
        '--apply=true',
      ],
      inputPaths: [
        'back/src/main/resources/db/migration/V56__extend_source_dataset_landings_for_canonical_inputs.sql',
        'back/src/main/resources/db/migration/V57__create_canonical_item_group_runtime_tables.sql',
        'back/src/main/resources/db/migration/V58__create_crawler_automation_activation_decisions.sql',
      ],
      outputPaths: ['reports/authorization/canonical/canonical-schema-v56-v58.result.json'],
      reportPaths: [],
      progressPaths: [],
      databaseWrites: true,
      networkAccess: false,
    },
    'canonical-item-group-bootstrap': {
      executionClass: 'formal_database_bootstrap',
      command: [
        'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
        '--action-id=item-group-canonical-apply',
        '--input=reports/authorization/canonical/canonical-item-group-bootstrap.input.json',
        '--output=reports/authorization/canonical/canonical-item-group-bootstrap.result.json',
        '--progress-path=reports/backend-refresh/history/canonical-item-group-bootstrap.runtime/child-status.json',
      ],
      inputPaths: [
        'reports/authorization/canonical/canonical-item-group-bootstrap.input.json',
        'data/generated/recipe-material-reference.json',
        'data/generated/recipe-group-overrides.json',
        'data/generated/item-group-overrides.json',
        'data/standardized/items.standardized.json',
      ],
      outputPaths: ['reports/authorization/canonical/canonical-item-group-bootstrap.result.json'],
      reportPaths: [],
      progressPaths: ['reports/backend-refresh/history/canonical-item-group-bootstrap.runtime/child-status.json'],
      databaseWrites: true,
      networkAccess: false,
    },
    'automation-biomes-l1-policy-promotion': policyDecisionDefinition({ operationId }),
    'automation-biomes-first-l1': biomesApplyDefinition({ operationId }),
    'automation-biomes-second-l1': biomesApplyDefinition({ operationId }),
    'automation-biomes-l2-promotion': policyDecisionDefinition({ operationId }),
    'automation-biomes-scheduler-activation': policyDecisionDefinition({ operationId }),
    ...Object.fromEntries(NPC_OWNER_OPERATION_IDS.map((npcOperationId) => [
      npcOperationId,
      npcOwnerDefinition({
        operationId: npcOperationId,
        resultLabel: npcOperationId === operationId ? resultLabel : null,
      }),
    ])),
    ...Object.fromEntries(NPC_BASE_MAINT_OPERATION_IDS.map((npcOperationId) => [
      npcOperationId,
      npcBaseMaintDefinition({ operationId: npcOperationId }),
    ])),
  };
  return definitions[operationId];
}

function buildNpcT1AcceptanceIdentity({ configPath, redisLogicalDb, runId } = {}) {
  const resolvedConfigPath = path.resolve(requireText(configPath, 'NPC T1 config path'));
  const stat = fs.lstatSync(resolvedConfigPath);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error('NPC T1 config must be a private ordinary file');
  }
  const normalizedRedisDb = Number(redisLogicalDb);
  if (!Number.isInteger(normalizedRedisDb) || normalizedRedisDb < 1 || normalizedRedisDb > 14) {
    throw new Error('NPC T1 Redis DB must be an integer from 1 through 14');
  }
  const normalizedRunId = requireText(runId, 'NPC T1 runId');
  if (!/^npc-t1-[a-z0-9-]{3,80}$/.test(normalizedRunId)) {
    throw new Error('NPC T1 runId must use the bounded npc-t1 identity');
  }
  const configBytes = fs.readFileSync(resolvedConfigPath);
  let config;
  try {
    config = JSON.parse(configBytes.toString('utf8'));
  } catch {
    throw new Error('NPC T1 config must be valid JSON');
  }
  const serverFingerprint = canonicalServerFingerprint(config?.npcT1ServerFingerprint);
  if (String(config?.database?.host ?? '').trim() !== serverFingerprint.host
      || Number(config?.database?.port) !== serverFingerprint.port) {
    throw new Error('NPC T1 config database endpoint must match its server fingerprint');
  }
  return {
    configPath: resolvedConfigPath,
    configSha256: `sha256:${createHash('sha256').update(configBytes).digest('hex')}`,
    redisLogicalDb: normalizedRedisDb,
    runId: normalizedRunId,
    serverFingerprint,
  };
}

function npcT1AcceptanceDefinition(operationId, isolatedAcceptance) {
  if (isolatedAcceptance == null) throw new Error('NPC T1 isolated acceptance identity is required');
  return {
    executionClass: 'isolated_read_only_acceptance',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      '--profile=t1',
      '--scope=npc-canonical',
      `--config-path=${isolatedAcceptance.configPath}`,
      `--config-sha256=${isolatedAcceptance.configSha256}`,
      `--redis-db=${isolatedAcceptance.redisLogicalDb}`,
      `--run-id=${isolatedAcceptance.runId}`,
      '--max-rows=2',
      '--output=reports/canonical-migration/canonical-npc-t1-acceptance.json',
    ],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: ['reports/canonical-migration/canonical-npc-t1-acceptance.json'],
    reportPaths: ['reports/canonical-migration/canonical-npc-t1-acceptance.json'],
    progressPaths: [],
    isolatedAcceptance,
    databaseWrites: false,
    isolatedResourceWrites: true,
    networkAccess: false,
  };
}

function npcOwnerDefinition({ operationId, resultLabel = null }) {
  const resultPath = resultLabel
    ? `reports/authorization/canonical/${operationId}.${resultLabel}.result.json`
    : `reports/authorization/canonical/${operationId}.result.json`;
  const phase = NPC_APPLY_OWNER_PHASES.find((candidate) => candidate.operationId === operationId)
    ?? (operationId === NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION.operationId
      ? NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION
      : null);
  const landing = operationId === 'canonical-npc-landing-apply';
  const lineageRepair = operationId === NPC_ITEM_RELATION_LINEAGE_REPAIR_OPERATION.operationId;
  return {
    executionClass: landing
      ? 'formal_npc_landing_apply'
      : lineageRepair
        ? 'formal_npc_relation_lineage_repair'
        : 'formal_npc_owner_phase_apply',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--operation-id=${operationId}`,
      '--input=reports/authorization/canonical/canonical-npc-apply.input.json',
      `--output=${resultPath}`,
      '--apply=true',
    ],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: landing
      ? [
          'local.source_dataset_landings.npcs_base',
          'local.source_dataset_landings.npc_crawler_facts',
        ]
      : [...phase.ownershipKeys],
    requiredOperationIds: landing ? [] : [...phase.requiredOperationIds],
    databaseWrites: true,
    networkAccess: false,
  };
}

function npcBaseMaintDefinition({ operationId }) {
  const resultPath = `reports/authorization/canonical/${operationId}.result.json`;
  const ownershipKey = operationId === 'canonical-npc-base-maint-nontown-apply'
    ? 'maint.maint_npcs.npcs'
    : 'maint.maint_npcs.town';
  return {
    executionClass: 'formal_npc_base_maint_apply',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--operation-id=${operationId}`,
      '--input=reports/authorization/canonical/canonical-npc-apply.input.json',
      `--output=${resultPath}`,
      '--apply=true',
    ],
    inputPaths: [...CANONICAL_OPERATION_DATA_PATHS[operationId]],
    outputPaths: [resultPath],
    reportPaths: [],
    progressPaths: [],
    ownershipKeys: [ownershipKey],
    requiredOperationIds: ['canonical-npc-landing-apply'],
    databaseWrites: true,
    networkAccess: false,
  };
}

function requireBackendApiBase(operationId, value) {
  if (!['canonical-image-sync', 'canonical-boss-import'].includes(operationId)) return '';
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${operationId} backendApiBase is required`);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${operationId} backendApiBase must be an absolute URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${operationId} backendApiBase must use http or https`);
  }
  return text.replace(/\/$/, '');
}

function biomesApplyDefinition({ operationId }) {
  const inputPath = `reports/authorization/canonical/${operationId}.bundle.json`;
  const outputPath = `reports/authorization/canonical/${operationId}.result.json`;
  return {
    executionClass: 'formal_automation_l1_apply',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--operation-id=${operationId}`,
      `--input=${inputPath}`,
      `--output=${outputPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath],
    outputPaths: [outputPath],
    reportPaths: [],
    progressPaths: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function policyDecisionDefinition({ operationId }) {
  const inputPath = `reports/authorization/canonical/${operationId}.input.json`;
  const outputPath = `reports/authorization/canonical/${operationId}.result.json`;
  return {
    executionClass: 'formal_policy_decision',
    command: [
      'node', CANONICAL_OPERATION_ENTRYPOINTS[operationId],
      `--operation-id=${operationId}`,
      `--input=${inputPath}`,
      `--output=${outputPath}`,
      '--apply=true',
    ],
    inputPaths: [inputPath],
    outputPaths: [outputPath],
    reportPaths: [],
    progressPaths: [],
    databaseWrites: true,
    networkAccess: false,
  };
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function normalizeResultLabel(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)) {
    throw new Error('result label must be a lowercase kebab-case token of at most 80 characters');
  }
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
      backendApiBase: args['backend-api-base'] ?? null,
      resultLabel: args['result-label'] ?? null,
      npcT1ConfigPath: args['npc-t1-config-path'] ?? null,
      npcT1RedisDb: args['npc-t1-redis-db'] == null ? null : Number(args['npc-t1-redis-db']),
      npcT1RunId: args['npc-t1-run-id'] ?? null,
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
