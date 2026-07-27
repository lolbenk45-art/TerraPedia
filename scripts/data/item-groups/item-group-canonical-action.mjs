import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMysqlModule } from '../lib/mysql-module.mjs';
import { loadAuthorizedOperationContext } from '../automation/authorized-operation-context.mjs';
import {
  buildActionProgressPayload,
  createCrawlerProgressHeartbeat,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';
import {
  buildItemGroupAcceptanceProjection,
  buildItemGroupFormalBootstrapSql,
  buildItemGroupFormalLandingSql,
  bindItemGroupFormalLandingIds,
  loadItemGroupAcceptanceInputs,
  validateItemGroupAcceptanceProjection,
} from './item-group-live-acceptance.mjs';

export const ITEM_GROUP_CANONICAL_ACTION_IDS = Object.freeze({
  preview: 'item-group-canonical-preview',
  apply: 'item-group-canonical-apply',
});

const ACTION_IDS = new Set(Object.values(ITEM_GROUP_CANONICAL_ACTION_IDS));
const DEFAULT_TOTAL = 3;

export function resolveItemGroupCanonicalProgressPath({
  actionId,
  progressPath = null,
  env = process.env,
} = {}) {
  requireActionId(actionId);
  const configured = progressPath ?? env.TERRAPEDIA_CRAWLER_PROGRESS_PATH;
  if (String(configured ?? '').trim()) {
    return path.resolve(String(configured));
  }
  const worktreeRoot = path.resolve(String(env.WORKTREE_ROOT ?? process.cwd()));
  return path.join(
    worktreeRoot,
    'reports/backend-refresh/history/item-group-canonical.runtime',
    `${actionId}.child-status.json`,
  );
}

export async function runItemGroupCanonicalAction({
  actionId,
  progressPath = null,
  env = process.env,
  execute,
  heartbeatIntervalMs,
} = {}) {
  requireActionId(actionId);
  if (typeof execute !== 'function') {
    throw new TypeError('item-group canonical action requires an injected governed executor');
  }
  const childStatusPath = resolveItemGroupCanonicalProgressPath({ actionId, progressPath, env });
  const startedAt = new Date().toISOString();
  const writeProgress = (payload) => writeJsonFile(childStatusPath, payload);
  const heartbeat = createCrawlerProgressHeartbeat({
    writeProgress,
    ...(heartbeatIntervalMs == null ? {} : { intervalMs: heartbeatIntervalMs }),
  });
  const progress = (values = {}) => buildActionProgressPayload({
    actionId,
    status: values.status ?? 'running',
    phase: values.phase ?? 'prepare',
    message: values.message ?? `preparing ${actionId}`,
    current: values.current ?? 0,
    total: values.total ?? DEFAULT_TOTAL,
    startedAt,
    childStatusPath,
  });

  heartbeat.publish(progress({ status: 'running' }));
  try {
    const result = await execute({
      actionId,
      mode: actionId === ITEM_GROUP_CANONICAL_ACTION_IDS.apply ? 'apply' : 'preview',
      childStatusPath,
      publishProgress: (values) => heartbeat.publish(progress(values)),
    });
    const completed = progress({
      ...result,
      status: 'completed',
      phase: result?.phase ?? 'completed',
      message: result?.message ?? `completed ${actionId}`,
      current: result?.current ?? result?.total ?? DEFAULT_TOTAL,
      total: result?.total ?? DEFAULT_TOTAL,
    });
    heartbeat.publish(completed);
    return completed;
  } catch (error) {
    const failed = progress({
      status: 'failed',
      phase: 'failed',
      message: error instanceof Error ? error.message : String(error),
      current: 0,
      total: DEFAULT_TOTAL,
    });
    heartbeat.publish(failed);
    throw error;
  } finally {
    heartbeat.stop();
  }
}

export function buildItemGroupFormalApplyPlan({ repoRoot = process.cwd(), input = {} } = {}) {
  if (input.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (input.operationId !== 'canonical-item-group-bootstrap') {
    throw new Error('operationId must be canonical-item-group-bootstrap');
  }
  if (!/^[a-z0-9]{1,3}_[0-9a-f]{16}$/.test(input.runKey ?? '')) {
    throw new Error('runKey must use the bounded canonical acceptance identity');
  }
  const databases = {
    local: 'terria_v1_local',
    maint: 'terria_v1_maint',
    relation: 'terria_v1_relation',
  };
  if (JSON.stringify(input.databases) !== JSON.stringify(databases)) {
    throw new Error('formal item-group apply requires terria_v1_local, terria_v1_maint, and terria_v1_relation');
  }
  const projection = validateItemGroupAcceptanceProjection(buildItemGroupAcceptanceProjection({
    ...loadItemGroupAcceptanceInputs(path.resolve(repoRoot)),
    runKey: input.runKey,
  }));
  const plan = {
    schemaVersion: 1,
    operationId: input.operationId,
    runKey: input.runKey,
    databases,
    materializedAt: requireTimestamp(input.materializedAt ?? new Date(0).toISOString(), 'materializedAt'),
    counts: projection.counts,
    runtimeSnapshotHash: projection.runtime.snapshotHash,
    compatibilitySnapshotHash: projection.compatibility.snapshotHash,
    projection,
  };
  if (input.expectedCounts != null
      && JSON.stringify(input.expectedCounts) !== JSON.stringify(plan.counts)) {
    throw new Error('expectedCounts do not match the frozen canonical projection');
  }
  if (input.expectedRuntimeSnapshotHash != null
      && input.expectedRuntimeSnapshotHash !== plan.runtimeSnapshotHash) {
    throw new Error('expectedRuntimeSnapshotHash does not match the frozen canonical projection');
  }
  if (input.expectedCompatibilitySnapshotHash != null
      && input.expectedCompatibilitySnapshotHash !== plan.compatibilitySnapshotHash) {
    throw new Error('expectedCompatibilitySnapshotHash does not match the frozen canonical projection');
  }
  return Object.freeze(plan);
}

export async function runGovernedItemGroupApply({ plan, adapter } = {}) {
  if (!adapter || typeof adapter.begin !== 'function') {
    throw new TypeError('item-group formal apply adapter is required');
  }
  await adapter.begin();
  try {
    const existingState = await adapter.lockProjectionState();
    if (existingState != null) throw new Error('canonical item-group projection is already initialized');
    await adapter.assertSourceScopeEmpty();
    await adapter.applyLandings(plan);
    const landingIds = await adapter.readLandingIds(plan);
    const appliedPlan = {
      ...plan,
      projection: bindItemGroupFormalLandingIds(plan.projection, landingIds),
    };
    await adapter.applyProjection(appliedPlan);
    const verification = await adapter.verifyProjection(plan);
    if (JSON.stringify(verification?.counts) !== JSON.stringify(plan.counts)
        || verification?.snapshotHash !== plan.runtimeSnapshotHash) {
      throw new Error('canonical item-group post-apply verification failed');
    }
    await adapter.commit();
    return Object.freeze({
      schemaVersion: 1,
      operationId: plan.operationId,
      runKey: plan.runKey,
      status: 'completed',
      counts: plan.counts,
      runtimeSnapshotHash: plan.runtimeSnapshotHash,
      compatibilitySnapshotHash: plan.compatibilitySnapshotHash,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    await adapter.rollback();
    throw error;
  }
}

export function createMysqlItemGroupFormalApplyAdapter(connection, plan) {
  if (!connection) throw new TypeError('MySQL connection is required');
  const { local, maint, relation } = plan.databases;
  return {
    begin: () => connection.beginTransaction(),
    async lockProjectionState() {
      const [rows] = await connection.query(
        `SELECT canonical_snapshot_hash AS snapshotHash FROM \`${local}\`.\`item_group_projection_state\``
        + ' WHERE singleton_key = 1 FOR UPDATE',
      );
      return rows?.[0] ?? null;
    },
    async assertSourceScopeEmpty() {
      const [rows] = await connection.query(
        `SELECT (SELECT COUNT(*) FROM \`${local}\`.\`source_dataset_landings\` WHERE dataset_type = 'item_groups_raw') AS landingCount,`
        + ` (SELECT COUNT(*) FROM \`${maint}\`.\`maint_item_groups\` WHERE source_layer IN ('recipe_reference','source_group')) AS maintCount,`
        + ` (SELECT COUNT(*) FROM \`${relation}\`.\`relation_item_groups\` WHERE source_layer IN ('recipe_reference','source_group')) AS relationCount,`
        + ` (SELECT COUNT(*) FROM \`${local}\`.\`item_groups\` WHERE source_layer IN ('recipe_reference','source_group')) AS localCount`,
      );
      const counts = Object.values(rows?.[0] ?? {}).map(Number);
      if (counts.length !== 4 || counts.some((value) => value !== 0)) {
        throw new Error('canonical item-group source scope is not empty');
      }
    },
    async applyLandings() {
      await connection.query(buildItemGroupFormalLandingSql({
        databases: plan.databases,
        projection: plan.projection,
      }));
    },
    async readLandingIds() {
      const predicates = plan.projection.landingRows.map(() => (
        '(dataset_type = ? AND source_key = ? AND source_page = ? AND bootstrap_manifest_hash = ? AND is_current = 1)'
      ));
      const params = plan.projection.landingRows.flatMap((row) => [
        row.datasetType, row.sourceKey, row.sourcePage, row.bootstrapManifestHash,
      ]);
      const [rows] = await connection.query(
        `SELECT id, source_key AS sourceKey FROM \`${local}\`.\`source_dataset_landings\``
        + ` WHERE ${predicates.join(' OR ')}`,
        params,
      );
      const ids = new Map((rows ?? []).map((row) => [row.sourceKey, Number(row.id)]));
      if (ids.size !== plan.projection.landingRows.length) {
        throw new Error('formal item-group landing identity readback is incomplete');
      }
      return ids;
    },
    async applyProjection(appliedPlan) {
      await connection.query(buildItemGroupFormalBootstrapSql({
        databases: appliedPlan.databases,
        projection: appliedPlan.projection,
        materializedAt: appliedPlan.materializedAt,
      }));
    },
    async verifyProjection() {
      const [rows] = await connection.query(
        `SELECT (SELECT COUNT(*) FROM \`${local}\`.\`source_dataset_landings\` WHERE dataset_type = 'item_groups_raw') AS landingSourceCount,`
        + ` (SELECT COUNT(*) FROM \`${maint}\`.\`maint_item_groups\`) AS maintGroupCount,`
        + ` (SELECT COUNT(*) FROM \`${maint}\`.\`maint_item_group_members\`) AS maintMemberCount,`
        + ` (SELECT COUNT(*) FROM \`${maint}\`.\`maint_item_group_aliases\`) AS maintAliasCount,`
        + ` (SELECT COUNT(*) FROM \`${maint}\`.\`maint_item_group_member_exclusions\`) AS maintExclusionCount,`
        + ` (SELECT COUNT(*) FROM \`${relation}\`.\`relation_item_groups\`) AS relationGroupCount,`
        + ` (SELECT COUNT(*) FROM \`${relation}\`.\`relation_item_group_members\`) AS relationMemberCount,`
        + ` (SELECT COUNT(*) FROM \`${relation}\`.\`relation_item_group_aliases\`) AS relationAliasCount,`
        + ` (SELECT COUNT(*) FROM \`${local}\`.\`item_groups\`) AS localGroupCount,`
        + ` (SELECT COUNT(*) FROM \`${local}\`.\`item_group_members\`) AS localMemberCount,`
        + ` (SELECT COUNT(*) FROM \`${local}\`.\`item_group_aliases\`) AS localAliasCount,`
        + ` (SELECT canonical_snapshot_hash FROM \`${local}\`.\`item_group_projection_state\` WHERE singleton_key = 1) AS snapshotHash`,
      );
      const row = rows?.[0] ?? {};
      return {
        counts: {
          landing: { sourceCount: Number(row.landingSourceCount), groupCount: plan.counts.landing.groupCount },
          maint: {
            groupCount: Number(row.maintGroupCount), memberCount: Number(row.maintMemberCount),
            aliasCount: Number(row.maintAliasCount), exclusionCount: Number(row.maintExclusionCount),
          },
          relation: {
            ...plan.counts.relation,
            groupCount: Number(row.relationGroupCount), memberCount: Number(row.relationMemberCount),
            aliasCount: Number(row.relationAliasCount),
          },
          local: {
            groupCount: Number(row.localGroupCount), memberCount: Number(row.localMemberCount),
            aliasCount: Number(row.localAliasCount),
          },
        },
        snapshotHash: row.snapshotHash,
      };
    },
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
  };
}

function requireActionId(actionId) {
  if (!ACTION_IDS.has(actionId)) {
    throw new Error(`unsupported item-group canonical actionId: ${actionId ?? ''}`);
  }
  return actionId;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length === 0 ? true : rest.join('=')];
  }));
}

export async function runItemGroupCanonicalCli({
  argv = process.argv.slice(2),
  env = process.env,
  mysqlModule = null,
  loadAuthorizationContextImpl = loadAuthorizedOperationContext,
  now = new Date().toISOString(),
} = {}) {
  const args = parseArgs(argv);
  const actionId = String(args['action-id'] ?? env.TERRAPEDIA_CRAWLER_ACTION_ID ?? '');
  if (actionId === ITEM_GROUP_CANONICAL_ACTION_IDS.apply) {
    loadAuthorizationContextImpl({ env, operationId: 'canonical-item-group-bootstrap', now });
  }
  const result = await runItemGroupCanonicalAction({
    actionId,
    progressPath: args['progress-path'] ?? null,
    env,
    execute: async ({ publishProgress }) => {
      if (actionId !== ITEM_GROUP_CANONICAL_ACTION_IDS.apply) {
        throw new Error(`${actionId} has no formal execution contract`);
      }
      const inputPath = path.resolve(requireText(args.input, '--input'));
      const outputPath = path.resolve(requireText(args.output, '--output'));
      const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
      requireFrozenExpectation(input.expectedCounts, 'expectedCounts');
      requireText(input.expectedRuntimeSnapshotHash, 'expectedRuntimeSnapshotHash');
      requireText(input.expectedCompatibilitySnapshotHash, 'expectedCompatibilitySnapshotHash');
      const plan = buildItemGroupFormalApplyPlan({
        repoRoot: env.WORKTREE_ROOT ?? process.cwd(),
        input,
      });
      publishProgress({ phase: 'connect', message: 'opening governed three-database transaction', current: 1, total: 3 });
      const mysql = mysqlModule ?? loadMysqlModule();
      const connection = await mysql.createConnection({
        host: requireText(env.TERRAPEDIA_DB_HOST, 'TERRAPEDIA_DB_HOST'),
        port: requirePort(env.TERRAPEDIA_DB_PORT),
        user: requireText(env.TERRAPEDIA_DB_USERNAME, 'TERRAPEDIA_DB_USERNAME'),
        password: requireText(env.TERRAPEDIA_DB_PASSWORD, 'TERRAPEDIA_DB_PASSWORD'),
        database: plan.databases.local,
        multipleStatements: true,
      });
      try {
        publishProgress({ phase: 'apply', message: 'applying frozen canonical item groups', current: 2, total: 3 });
        const applied = await runGovernedItemGroupApply({
          plan,
          adapter: createMysqlItemGroupFormalApplyAdapter(connection, plan),
        });
        writeJsonAtomic(outputPath, applied);
        return { ...applied, phase: 'verify', message: 'canonical item-group bootstrap verified', current: 3, total: 3, reportPath: outputPath };
      } finally {
        await connection.end();
      }
    },
  });
  return result;
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be a valid timestamp`);
  return text;
}

function requirePort(value) {
  const port = Number(requireText(value, 'TERRAPEDIA_DB_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TERRAPEDIA_DB_PORT must be an integer from 1 to 65535');
  }
  return port;
}

function requireFrozenExpectation(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is required`);
  return value;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runItemGroupCanonicalCli().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error) => {
    console.error(`[item-group-canonical-action] ${error.message}`);
    process.exitCode = 1;
  });
}
