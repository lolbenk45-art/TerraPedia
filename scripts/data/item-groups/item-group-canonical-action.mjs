import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildActionProgressPayload,
  createCrawlerProgressHeartbeat,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';

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

function requireActionId(actionId) {
  if (!ACTION_IDS.has(actionId)) {
    throw new Error(`unsupported item-group canonical actionId: ${actionId ?? ''}`);
  }
  return actionId;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length === 0 ? true : rest.join('=')];
  }));
}

async function runCli() {
  const args = parseArgs(process.argv);
  const actionId = String(args['action-id'] ?? process.env.TERRAPEDIA_CRAWLER_ACTION_ID ?? '');
  await runItemGroupCanonicalAction({
    actionId,
    progressPath: args['progress-path'] ?? null,
    execute: async () => {
      throw new Error(
        `${actionId} requires a frozen bundle and governed database executor; no database mutation was attempted`,
      );
    },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(`[item-group-canonical-action] ${error.message}`);
    process.exitCode = 1;
  });
}
