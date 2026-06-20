import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  createContentHash,
  loadWikiSourceManifest
} from '../lib/wiki-sync-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-armorsetbonuses.mjs');

test('armorsetbonuses fetch writes progress and finalizes ingestion manifest after successful output writes', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-armorsetbonuses-'));
  const worktreeRoot = path.join(tempDir, 'worktree');
  const sharedDataRoot = path.join(tempDir, 'shared');
  const progressPath = path.join(tempDir, 'progress.json');
  const manifestPath = path.join(tempDir, 'manifest.json');
  const mockApiPath = writeArmorSetBonusesMock(tempDir);

  fs.mkdirSync(worktreeRoot, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--progress-path=${progressPath}`,
    `--manifest-path=${manifestPath}`
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      WORKTREE_ROOT: worktreeRoot,
      TERRAPEDIA_SHARED_DATA_ROOT: sharedDataRoot,
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  assert.equal(progress.actionId, 'domain-source-armor-sets');
  assert.equal(progress.status, 'completed');
  assert.equal(progress.childStatusPath, progressPath);

  const rawPath = path.join(sharedDataRoot, 'raw', 'wiki', 'module__armorsetbonuses.latest.json');
  const manifest = loadWikiSourceManifest(manifestPath);
  const record = manifest.records.find((entry) => entry.sourceKey === 'wiki.module.armorsetbonuses');
  assert.ok(record);
  assert.equal(record.entityFamily, 'armor_sets');
  assert.equal(record.sourceKind, 'module');
  assert.equal(record.pageTitle, 'Module:ArmorSetBonuses');
  assert.equal(record.requestedPageTitle, 'Module:ArmorSetBonuses');
  assert.equal(record.localPath, path.resolve(rawPath).replaceAll('\\', '/'));
  assert.equal(record.revisionTimestamp, '2026-05-21T00:00:00Z');
  assert.equal(record.contentHash, createContentHash('ArmorSetBonuses.Initialize = function()\nArmorSetBonuses.Wood = true;\nend'));
});

function writeArmorSetBonusesMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-api.json');
  fs.writeFileSync(mockPath, JSON.stringify({
    query: {
      pages: [{
        pageid: 777,
        title: 'Module:ArmorSetBonuses',
        revisions: [{
          content: 'ArmorSetBonuses.Initialize = function()\nArmorSetBonuses.Wood = true;\nend',
          timestamp: '2026-05-21T00:00:00Z',
          slots: {
            main: {
              content: 'ArmorSetBonuses.Initialize = function()\nArmorSetBonuses.Wood = true;\nend'
            }
          }
        }]
      }]
    }
  }), 'utf8');
  return mockPath;
}
