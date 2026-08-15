import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildActionProgressPayload,
  createCrawlerProgressHeartbeat,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';
import { runCli as runNpcCrawlerCli } from '../crawler/src/cli.mjs';

export const NPC_CRAWLER_FACT_ACTION_IDS = Object.freeze({
  preview: 'npc-crawler-facts-preview',
  apply: 'npc-crawler-facts-apply',
});

const ACTION_IDS = new Set(Object.values(NPC_CRAWLER_FACT_ACTION_IDS));
const DEFAULT_TOTAL = 4;

export function resolveNpcCrawlerFactProgressPath({
  actionId,
  progressPath = null,
  env = process.env,
} = {}) {
  requireActionId(actionId);
  const configured = progressPath ?? env.TERRAPEDIA_CRAWLER_PROGRESS_PATH;
  if (String(configured ?? '').trim()) return path.resolve(String(configured));
  const worktreeRoot = path.resolve(String(env.WORKTREE_ROOT ?? process.cwd()));
  return path.join(
    worktreeRoot,
    'reports/backend-refresh/history/npc-crawler-facts.runtime',
    `${actionId}.child-status.json`,
  );
}

export async function runNpcCrawlerFactAction({
  actionId,
  progressPath = null,
  env = process.env,
  execute,
  heartbeatIntervalMs,
} = {}) {
  requireActionId(actionId);
  if (typeof execute !== 'function') {
    throw new TypeError('NPC crawler-fact action requires an injected governed executor');
  }
  const childStatusPath = resolveNpcCrawlerFactProgressPath({ actionId, progressPath, env });
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
      mode: actionId === NPC_CRAWLER_FACT_ACTION_IDS.apply ? 'apply' : 'preview',
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
    heartbeat.publish(progress({
      status: 'failed',
      phase: 'failed',
      message: error instanceof Error ? error.message : String(error),
      current: 0,
      total: DEFAULT_TOTAL,
    }));
    throw error;
  } finally {
    heartbeat.stop();
  }
}

export async function runGovernedNpcCrawlerPreview({
  repoRoot = process.cwd(),
  targetsFile,
  targetPriority = null,
  limit,
  outputRoot = null,
  publishProgress = () => {},
  runCliImpl = runNpcCrawlerCli,
} = {}) {
  const resolvedTargetsFile = path.resolve(String(targetsFile ?? ''));
  if (!String(targetsFile ?? '').trim() || !fs.existsSync(resolvedTargetsFile)
      || !fs.statSync(resolvedTargetsFile).isFile()) {
    throw new Error('governed NPC crawler preview requires an existing targets file');
  }
  const boundedLimit = Number(limit);
  if (!Number.isInteger(boundedLimit) || boundedLimit < 1 || boundedLimit > 500) {
    throw new Error('governed NPC crawler preview requires a positive bounded limit of at most 500');
  }
  if (typeof runCliImpl !== 'function') throw new TypeError('NPC crawler CLI implementation is required');
  const resolvedOutputRoot = path.resolve(outputRoot ?? path.join(repoRoot, 'data', 'wiki-crawler'));
  const args = [
    'batch',
    '--domain=npc',
    `--targets-file=${resolvedTargetsFile}`,
  ];
  if (String(targetPriority ?? '').trim()) args.push(`--target-priority=${String(targetPriority).trim()}`);
  args.push(
    `--limit=${boundedLimit}`,
    '--write-files',
    `--output-root=${resolvedOutputRoot}`,
  );
  publishProgress({
    phase: 'crawl',
    message: `starting bounded NPC crawl limit=${boundedLimit}`,
    current: 0,
    total: boundedLimit,
  });
  const result = await runCliImpl(args);
  const actual = Number(result?.summary?.total ?? 0);
  return {
    phase: 'verify',
    message: `completed bounded NPC crawl total=${actual}`,
    current: actual,
    total: actual,
    outputPath: resolvedOutputRoot,
    reportPath: result?.reportPath ?? null,
    result,
  };
}

function requireActionId(actionId) {
  if (!ACTION_IDS.has(actionId)) {
    throw new Error(`unsupported NPC crawler-fact actionId: ${actionId ?? ''}`);
  }
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
  await runNpcCrawlerFactAction({
    actionId,
    progressPath: args['progress-path'] ?? null,
    execute: async ({ publishProgress }) => {
      if (actionId === NPC_CRAWLER_FACT_ACTION_IDS.preview) {
        return runGovernedNpcCrawlerPreview({
          repoRoot: process.env.WORKTREE_ROOT ?? process.cwd(),
          targetsFile: args['targets-file'],
          targetPriority: args['target-priority'] ?? null,
          limit: args.limit,
          outputRoot: args['output-root'] ?? null,
          publishProgress,
        });
      }
      throw new Error(
        `${actionId} requires frozen crawler evidence and a governed executor; no crawler or database mutation was attempted`,
      );
    },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(`[npc-crawler-fact-action] ${error.message}`);
    process.exitCode = 1;
  });
}
