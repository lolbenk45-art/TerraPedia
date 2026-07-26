import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildNpcBridgeRetirementReport } from './build-npc-bridge-retirement-report.mjs';

function createRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-retire-'));
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
  return root;
}

const BRIDGE = 'data/generated/wiki-crawler-npc-bridge/standardized/npcs.standardized.json';

test('report passes when no scanned file references the bridge path', () => {
  const repoRoot = createRepo({
    'scripts/data/landing/source-dataset-locator.mjs': "const p = 'data/standardized/npcs.standardized.json';\n",
    'docs/audits/canonical-migration-boundary.md': `mentions ${BRIDGE} in prose, which is allowed\n`,
  });

  const report = buildNpcBridgeRetirementReport({ repoRoot, generatedAt: '2026-07-26T00:00:00Z' });

  assert.equal(report.status, 'pass');
  assert.equal(report.referenceCount, 0);
  assert.equal(report.writesDatabase, false);
  assert.equal(report.requiresDatabase, false);
  assert.deepEqual(report.references, []);
});

test('report blocks and names the file when code still references the bridge path', () => {
  const repoRoot = createRepo({
    'scripts/data/landing/source-dataset-locator.mjs': `const p = '${BRIDGE}';\n`,
  });

  const report = buildNpcBridgeRetirementReport({ repoRoot, generatedAt: '2026-07-26T00:00:00Z' });

  assert.equal(report.status, 'blocked');
  assert.equal(report.referenceCount, 1);
  assert.equal(report.references[0].file, 'scripts/data/landing/source-dataset-locator.mjs');
  assert.equal(report.references[0].line, 1);
});

test('documentation and explicit retirement tests are allowed references', () => {
  const repoRoot = createRepo({
    'docs/superpowers/specs/design.md': `the retired path is ${BRIDGE}\n`,
    'scripts/data/audit/build-npc-bridge-retirement-report.test.mjs': `const BRIDGE = '${BRIDGE}';\n`,
  });

  const report = buildNpcBridgeRetirementReport({ repoRoot, generatedAt: '2026-07-26T00:00:00Z' });

  assert.equal(report.status, 'pass');
  assert.equal(report.referenceCount, 0);
  assert.equal(report.allowedReferenceCount, 2);
});

test('report blocks when the scan finds zero scannable files, rather than passing vacuously', () => {
  const repoRoot = createRepo({});

  const report = buildNpcBridgeRetirementReport({ repoRoot, generatedAt: '2026-07-26T00:00:00Z' });

  assert.equal(report.status, 'blocked');
  assert.match(report.blockingReasons[0], /zero scannable files/i);
});
