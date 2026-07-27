import path from 'node:path';

import {
  buildActionProgressPayload,
  createCrawlerProgressHeartbeat,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';

export const RECIPE_CRAWLER_ACTION_ID = 'wiki-zh-recipe-pages-crawl';

export function resolveRecipeCrawlerProgressPaths({
  repoRoot = process.cwd(),
  explicitPath = null,
  env = process.env,
} = {}) {
  const root = path.resolve(repoRoot);
  const canonicalPath = path.join(root, 'data/generated/wiki-sync-progress.latest.json');
  const configured = explicitPath ?? env.TERRAPEDIA_CRAWLER_PROGRESS_PATH;
  const primaryPath = String(configured ?? '').trim()
    ? path.resolve(root, String(configured))
    : canonicalPath;
  return primaryPath === canonicalPath ? [canonicalPath] : [primaryPath, canonicalPath];
}

export async function runRecipeCrawlerWithProgress({
  progressPaths,
  execute,
  total = 1,
  heartbeatIntervalMs,
} = {}) {
  if (!Array.isArray(progressPaths) || progressPaths.length === 0) {
    throw new Error('at least one recipe crawler progress path is required');
  }
  if (typeof execute !== 'function') throw new TypeError('recipe crawler execute function is required');
  const childStatusPath = path.resolve(progressPaths[0]);
  const startedAt = new Date().toISOString();
  const writeProgress = (payload) => {
    for (const progressPath of progressPaths) writeJsonFile(path.resolve(progressPath), payload);
  };
  const heartbeat = createCrawlerProgressHeartbeat({
    writeProgress,
    ...(heartbeatIntervalMs == null ? {} : { intervalMs: heartbeatIntervalMs }),
  });
  const progress = (values = {}) => buildActionProgressPayload({
    actionId: RECIPE_CRAWLER_ACTION_ID,
    status: values.status ?? 'running',
    phase: values.phase ?? 'prepare',
    message: values.message ?? 'preparing recipe page crawl',
    current: values.current ?? 0,
    total: values.total ?? total,
    startedAt,
    childStatusPath,
    outputPath: values.outputPath ?? null,
    reportPath: values.reportPath ?? null,
  });

  heartbeat.publish(progress({ status: 'running' }));
  try {
    const result = await execute({
      publishProgress: (values) => heartbeat.publish(progress(values)),
      childStatusPath,
    });
    const completed = progress({
      ...result,
      status: 'completed',
      phase: result?.phase ?? 'completed',
      message: result?.message ?? 'completed recipe page crawl',
      current: result?.current ?? result?.total ?? total,
      total: result?.total ?? total,
    });
    heartbeat.publish(completed);
    return completed;
  } catch (error) {
    heartbeat.publish(progress({
      status: 'failed',
      phase: 'failed',
      message: error instanceof Error ? error.message : String(error),
      current: 0,
    }));
    throw error;
  } finally {
    heartbeat.stop();
  }
}
