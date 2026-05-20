import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scriptPath = path.join(__dirname, 'fetch-wiki-iteminfo.mjs');

test('iteminfo fetch defaults to latest raw files without timestamp snapshots', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-iteminfo-no-snapshot-'));
  const rawDir = path.join(tempDir, 'raw');
  const sharedDataRoot = path.join(tempDir, 'shared');
  const mockApiPath = writeIteminfoMock(tempDir);

  for (let index = 0; index < 2; index += 1) {
    const result = spawnSync(process.execPath, [
      scriptPath,
      `--raw-dir=${rawDir}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TERRAPEDIA_SHARED_DATA_ROOT: sharedDataRoot,
        TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
      }
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }

  assert.deepEqual(fs.readdirSync(rawDir).sort(), [
    'module__iteminfo__data.latest.json',
    'module__iteminfo__data.latest.lua'
  ]);
});

test('iteminfo fetch keeps timestamp snapshots only when requested', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-iteminfo-keep-snapshot-'));
  const rawDir = path.join(tempDir, 'raw');
  const sharedDataRoot = path.join(tempDir, 'shared');
  const mockApiPath = writeIteminfoMock(tempDir);

  const result = spawnSync(process.execPath, [
    scriptPath,
    `--raw-dir=${rawDir}`,
    '--keep-snapshot=true'
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TERRAPEDIA_SHARED_DATA_ROOT: sharedDataRoot,
      TERRAPEDIA_WIKI_MOCK_API_RESPONSE: mockApiPath
    }
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const files = fs.readdirSync(rawDir).sort();
  assert.equal(files.includes('module__iteminfo__data.latest.json'), true);
  assert.equal(files.includes('module__iteminfo__data.latest.lua'), true);
  assert.equal(files.filter((entry) => /^module__iteminfo__data\.\d{4}-\d{2}-\d{2}T.*\.json$/.test(entry)).length, 1);
});

function writeIteminfoMock(tempDir) {
  const mockPath = path.join(tempDir, 'mock-api.json');
  fs.writeFileSync(mockPath, JSON.stringify({
    query: {
      pages: [{
        pageid: 123,
        title: 'Module:Iteminfo/data',
        revisions: [{
          timestamp: '2026-05-20T00:00:00Z',
          slots: {
            main: {
              content: 'return { ["data"] = [[{"_terrariaversion":"1.4.4.9","_generated":"2026-05-20","1":{"name":"Wood"}}]] }'
            }
          }
        }]
      }]
    }
  }), 'utf8');
  return mockPath;
}
