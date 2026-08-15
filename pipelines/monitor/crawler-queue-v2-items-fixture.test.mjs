import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const monitorDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(monitorDir, '..', '..', '..');
const scriptPath = path.join(monitorDir, 'crawler-queue-v2-items-fixture.mjs');
const itemsInput = path.join(repoRoot, 'data', 'standardized', 'items.standardized.json');

test('items fixture reads a bounded real base-domain sample without network or database writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-items-fixture-'));
  const progressPath = path.join(root, 'progress.json');
  const outputPath = path.join(root, 'items-sample.json');
  const result = runFixture([
    `--items-input=${itemsInput}`,
    `--progress-path=${progressPath}`,
    `--output-path=${outputPath}`,
  ]);

  assert.equal(result.status, 0, result.stderr);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  const output = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const source = JSON.parse(fs.readFileSync(itemsInput, 'utf8'));

  assert.equal(progress.actionId, 'crawler-queue-v2-items-fixture');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.childStatusPath, progressPath);
  assert.equal(progress.outputPath, outputPath);
  assert.equal(output.entity, 'items');
  assert.equal(output.sampleCount, 3);
  assert.deepEqual(output.sample, source.records.slice(0, 3).map(({ id, internalName, name }) => ({ id, internalName, name })));
  assert.equal(output.inputSha256, crypto.createHash('sha256').update(fs.readFileSync(itemsInput)).digest('hex'));
  assert.doesNotMatch(result.stdout + result.stderr, /https?:\/\//);
});

test('items fixture requires explicit read-only input and isolated output paths', () => {
  const result = runFixture(['--progress-path=/tmp/items-progress.json']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--items-input is required/);
});

test('items fixture records failed progress when a real input cannot be parsed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-items-invalid-'));
  const invalidInput = path.join(root, 'items.invalid.json');
  const progressPath = path.join(root, 'progress.json');
  fs.writeFileSync(invalidInput, '{not-json', 'utf8');

  const result = runFixture([
    `--items-input=${invalidInput}`,
    `--progress-path=${progressPath}`,
    `--output-path=${path.join(root, 'output.json')}`,
  ]);

  assert.notEqual(result.status, 0);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'crawler-queue-v2-items-fixture');
  assert.equal(progress.status, 'failed');
  assert.equal(progress.phase, 'failed');
  assert.match(progress.message, /items fixture failed/);
});

test('items fixture records failed progress when the read-only input is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crawler-v2-items-missing-'));
  const progressPath = path.join(root, 'progress.json');
  const result = runFixture([
    `--items-input=${path.join(root, 'items.missing.json')}`,
    `--progress-path=${progressPath}`,
    `--output-path=${path.join(root, 'output.json')}`,
  ]);

  assert.notEqual(result.status, 0);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'crawler-queue-v2-items-fixture');
  assert.equal(progress.status, 'failed');
  assert.equal(progress.phase, 'failed');
  assert.match(progress.message, /items fixture failed/);
  assert.match(progress.message, /ENOENT|no such file/i);
});

function runFixture(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    env: {
      ...process.env,
      TERRAPEDIA_CRAWLER_QUEUE_ID: 'queue-items-fixture',
      TERRAPEDIA_CRAWLER_ATTEMPT_ID: 'attempt-items-fixture',
      TERRAPEDIA_CRAWLER_FENCE_TOKEN: '11',
      TERRAPEDIA_CRAWLER_STATE_STORE_EPOCH: 'epoch-items-fixture',
      TERRAPEDIA_CRAWLER_INITIAL_STATE_VERSION: '2',
      TERRAPEDIA_CRAWLER_PROGRESS_SEQUENCE: '0',
    },
    encoding: 'utf8',
  });
}
