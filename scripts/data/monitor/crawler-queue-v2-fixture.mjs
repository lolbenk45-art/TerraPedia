import {
  buildActionProgressPayload,
  createCrawlerAttemptProgressSequencer,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';

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
  writeProgress('completed', 'completed');
}

function writeProgress(status, phase, message = `fixture ${phase}`) {
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
  writeJsonFile(progressPath, sequence.next(payload));
}

function parseArgs(args) {
  const result = {
    heartbeats: 20,
    intervalMs: 250,
    progressPath: process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? '',
    stallAfter: null,
    exitCode: 0,
    ignoreTerm: false,
  };
  for (const argument of args) {
    if (argument === '--ignore-term') {
      result.ignoreTerm = true;
      continue;
    }
    const [name, value] = argument.split(/=(.*)/s, 2);
    switch (name) {
      case '--heartbeats':
        result.heartbeats = positiveInteger(value, name);
        break;
      case '--interval-ms':
        result.intervalMs = nonNegativeInteger(value, name);
        break;
      case '--progress-path':
        result.progressPath = String(value ?? '').trim();
        break;
      case '--stall-after':
        result.stallAfter = nonNegativeInteger(value, name);
        break;
      case '--exit-code':
        result.exitCode = nonNegativeInteger(value, name);
        break;
      default:
        throw new Error(`unsupported fixture argument: ${argument}`);
    }
  }
  return result;
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
