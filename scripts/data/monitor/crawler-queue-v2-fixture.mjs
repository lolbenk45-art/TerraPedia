import {
  buildActionProgressPayload,
  createCrawlerAttemptProgressSequencer,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';
import { resolveRecordedItemConfig, resolveRecordedRecipeConfig } from './crawler-queue-v2-recorded-config.mjs';

const options = parseArgs(process.argv.slice(2));
const progressPath = requiredProgressPath(options);
const startedAt = new Date().toISOString();
const sequence = createCrawlerAttemptProgressSequencer();
let heartbeat = 0;
let stopped = false;

if (options.ignoreTerm) {
  process.on('SIGTERM', () => {
    process.stdout.write('WARN fixture ignored SIGTERM\n');
  });
} else {
  process.on('SIGTERM', () => {
    stopped = true;
  });
}

writeProgress('running', 'starting');

while (!stopped && (options.stallAfter != null || heartbeat < options.heartbeats)) {
  await wait(options.intervalMs);
  if (stopped) break;
  if (options.stallAfter != null && heartbeat >= options.stallAfter) {
    continue;
  }
  heartbeat += 1;
  writeProgress('running', 'heartbeat');
  process.stdout.write(`INFO fixture heartbeat ${heartbeat}/${options.heartbeats}\n`);
}

if (stopped) {
  writeProgress('failed', 'terminated', 'fixture received SIGTERM');
  process.exitCode = 143;
} else if (options.exitCode !== 0) {
  writeProgress('failed', 'failed', `fixture exit code ${options.exitCode}`);
  process.exitCode = options.exitCode;
} else {
  try {
    const recordedItem = resolveRecordedItemConfig();
    const recordedRecipe = recordedItem ? null : resolveRecordedRecipeConfig();
    let terminalEvidence = {};
    if (recordedItem) {
      const { runRecordedItemAutoIngestion } = await import('./recorded-item-auto-ingestion.mjs');
      await runRecordedItemAutoIngestion({
        profile: 't1',
        runId: process.env.TERRAPEDIA_CRAWLER_RUN_ID ?? `fixture-${process.pid}`,
        repoRoot: recordedItem.repoRoot,
        databases: recordedItem.databases,
        mysql: recordedItem.mysql,
        markerRoot: recordedItem.markerRoot,
        limit: recordedItem.limit,
        progressPath,
      });
    } else if (recordedRecipe) {
      const { runRecordedRecipeAutoIngestion } = await import('./recorded-recipe-auto-ingestion.mjs');
      const result = runRecordedRecipeAutoIngestion({
        profile: 't1',
        runId: process.env.TERRAPEDIA_CRAWLER_RUN_ID ?? `fixture-${process.pid}`,
        repoRoot: recordedRecipe.repoRoot,
        databases: { local: recordedRecipe.database },
        mysql: recordedRecipe.mysql,
        markerRoot: recordedRecipe.markerRoot,
        limit: recordedRecipe.limit,
      });
      terminalEvidence = { recordedRecipeIngestion: result.evidence };
    }
    writeProgress(
      'completed',
      recordedItem ? 'recorded-item-ingested' : (recordedRecipe ? 'recorded-recipe-ingested' : 'completed'),
      recordedRecipe ? 'fixture recorded Recipe ingestion completed' : undefined,
      terminalEvidence,
    );
  } catch (error) {
    writeProgress('failed', 'recorded-ingestion-failed', error.message);
    process.exitCode = 1;
  }
}

function writeProgress(status, phase, message = `fixture ${phase}`, evidence = {}) {
  const generatedAt = new Date().toISOString();
  const payload = buildActionProgressPayload({
    actionId: 'crawler-queue-v2-fixture',
    status,
    phase,
    message,
    current: heartbeat,
    total: options.heartbeats,
    startedAt,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath,
  });
  writeJsonFile(progressPath, sequence.next({ ...payload, ...evidence }));
}

function parseArgs(args) {
  const result = {
    heartbeats: envInteger('TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_HEARTBEATS', 20, 1),
    intervalMs: envInteger('TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_INTERVAL_MS', 250, 0),
    progressPath: process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? '',
    stallAfter: envIntegerOrNull('TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_STALL_AFTER'),
    exitCode: envInteger('TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_EXIT_CODE', 0, 0),
    ignoreTerm: process.env.TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_IGNORE_TERM === 'true',
  };
  for (const argument of args) {
    if (argument === '--ignore-term') {
      result.ignoreTerm = true;
      continue;
    }
    const [name, value] = argument.split(/=(.*)/s, 2);
    switch (name) {
      case '--heartbeats':
        if (process.env.TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_HEARTBEATS == null) result.heartbeats = positiveInteger(value, name);
        break;
      case '--interval-ms':
        if (process.env.TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_INTERVAL_MS == null) result.intervalMs = nonNegativeInteger(value, name);
        break;
      case '--progress-path':
        result.progressPath = String(value ?? '').trim();
        break;
      case '--stall-after':
        if (process.env.TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_STALL_AFTER == null) result.stallAfter = nonNegativeInteger(value, name);
        break;
      case '--exit-code':
        if (process.env.TERRAPEDIA_CRAWLER_QUEUE_V2_FIXTURE_EXIT_CODE == null) result.exitCode = nonNegativeInteger(value, name);
        break;
      default:
        throw new Error(`unsupported fixture argument: ${argument}`);
    }
  }
  return result;
}

function envInteger(name, fallback, minimum) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return value;
}

function envIntegerOrNull(name) {
  const raw = process.env[name];
  if (raw == null || raw === '') return null;
  return envInteger(name, 0, 0);
}

function requiredProgressPath(options) {
  if (!options.progressPath) {
    throw new Error('TERRAPEDIA_CRAWLER_PROGRESS_PATH or --progress-path is required');
  }
  return options.progressPath;
}

function positiveInteger(value, name) {
  const parsed = nonNegativeInteger(value, name);
  if (parsed < 1) {
    throw new Error(`${name} must be at least 1`);
  }
  return parsed;
}

function nonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
