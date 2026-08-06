import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildActionProgressPayload,
  createCrawlerAttemptProgressSequencer,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';

const options = parseArgs(process.argv.slice(2));
const inputPath = requireExistingFile(options.itemsInput, '--items-input');
const progressPath = requirePath(options.progressPath, '--progress-path');
const outputPath = requirePath(options.outputPath, '--output-path');
if (path.resolve(inputPath) === path.resolve(outputPath)) {
  throw new Error('--output-path must not replace --items-input');
}

const startedAt = new Date().toISOString();
const sequence = createCrawlerAttemptProgressSequencer();
writeProgress('running', 'read_input', 'reading read-only items input', 0, 3);

try {
  const sourceBytes = fs.readFileSync(inputPath);
  const source = JSON.parse(sourceBytes.toString('utf8'));
  if (source?.entity !== 'items' || !Array.isArray(source.records)) {
    throw new Error('--items-input must be an items standardized payload with records');
  }
  const sample = source.records.slice(0, 3).map((record) => ({
    id: record.id,
    internalName: record.internalName,
    name: record.name,
  }));
  if (sample.length === 0) {
    throw new Error('--items-input contains no records');
  }

  writeJsonFile(outputPath, {
    entity: 'items',
    generatedAt: new Date().toISOString(),
    inputPath,
    inputSha256: crypto.createHash('sha256').update(sourceBytes).digest('hex'),
    readOnly: true,
    sampleCount: sample.length,
    sample,
  });
  writeProgress('completed', 'completed', `read ${sample.length} real items without network or database writes`, sample.length, sample.length);
} catch (error) {
  writeProgress('failed', 'failed', `items fixture failed: ${error instanceof Error ? error.message : String(error)}`, 0, 3);
  throw error;
}

function writeProgress(status, phase, message, current, total) {
  const generatedAt = new Date().toISOString();
  writeJsonFile(progressPath, sequence.next(buildActionProgressPayload({
    actionId: 'crawler-queue-v2-items-fixture',
    status,
    phase,
    message,
    current,
    total,
    startedAt,
    generatedAt,
    lastHeartbeatAt: generatedAt,
    childStatusPath: progressPath,
    outputPath,
  })));
}

function parseArgs(args) {
  const result = {
    itemsInput: '',
    outputPath: '',
    progressPath: process.env.TERRAPEDIA_CRAWLER_PROGRESS_PATH ?? '',
  };
  for (const argument of args) {
    const [name, value] = argument.split(/=(.*)/s, 2);
    switch (name) {
      case '--items-input': result.itemsInput = String(value ?? '').trim(); break;
      case '--output-path': result.outputPath = String(value ?? '').trim(); break;
      case '--progress-path': result.progressPath = String(value ?? '').trim(); break;
      default: throw new Error(`unsupported items fixture argument: ${argument}`);
    }
  }
  return result;
}

function requirePath(value, option) {
  if (!value) throw new Error(`${option} is required`);
  return path.resolve(value);
}

function requireExistingFile(value, option) {
  const resolved = requirePath(value, option);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`${option} must reference an existing file`);
  }
  return resolved;
}
