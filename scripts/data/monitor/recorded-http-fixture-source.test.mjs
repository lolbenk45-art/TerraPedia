import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { materializeRecordedResponse, readRecordedResponse } from './recorded-http-fixture-source.mjs';

test('recorded response selects a bounded slice and exposes HTTP-shaped metadata', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recorded-response-'));
  const source = path.join(root, 'data', 'generated', 'source.json');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, JSON.stringify({ records: [{ id: 1 }, { id: 2 }, { id: 3 }] }));
  const previous = process.cwd(); process.chdir(root);
  const result = readRecordedResponse({ sourcePath: 'data/generated/source.json', limit: 2, requestUrl: '/wiki/recipe?page=1' });
  process.chdir(previous);
  assert.equal(result.request.method, 'GET');
  assert.equal(result.request.networkAccess, false);
  assert.equal(result.response.status, 200);
  assert.equal(result.records.length, 2);
  assert.match(result.response.headers['content-type'], /json/);
});

test('recorded response materialization is marker-owned and private', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recorded-response-'));
  const source = path.join(root, 'data', 'generated', 'source.json');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  const marker = path.join(root, 'marker');
  fs.mkdirSync(marker, { mode: 0o700 });
  fs.writeFileSync(path.join(marker, '.terrapedia-recorded-response-root'), 'terrapedia-recorded-response-root-v1\n');
  fs.writeFileSync(source, JSON.stringify({ records: [{ id: 1 }] }));
  const previous = process.cwd(); process.chdir(root);
  const output = materializeRecordedResponse({ sourcePath: 'data/generated/source.json', markerRoot: marker, limit: 1 });
  process.chdir(previous);
  assert.equal(output.records.length, 1);
  assert.equal(fs.statSync(output.path).mode & 0o077, 0);
  process.chdir(root);
  assert.throws(
    () => materializeRecordedResponse({ sourcePath: 'data/generated/source.json', markerRoot: path.join(root, 'other'), limit: 1 }),
    /marker-owned/i,
  );
  process.chdir(previous);
});

test('recorded response rejects network-shaped inputs and unbounded reads', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recorded-response-'));
  const source = path.join(root, 'data', 'generated', 'source.json');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, JSON.stringify({ records: [{ id: 1 }] }));
  assert.throws(() => readRecordedResponse({ sourcePath: 'https://terraria.wiki.gg/a', limit: 1 }), /downloaded JSON path/i);
  const previous = process.cwd(); process.chdir(root);
  assert.throws(() => readRecordedResponse({ sourcePath: 'data/generated/source.json', limit: 0 }), /limit/i);
  process.chdir(previous);
});

test('recorded response permits the explicit Item bounded cap without changing the default cap', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recorded-item-cap-'));
  const source = path.join(root, 'data', 'standardized', 'items.json');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, JSON.stringify({ entity: 'items', records: Array.from({ length: 100 }, (_, id) => ({ id: id + 1, internalName: `Item${id + 1}` })) }));
  assert.throws(() => readRecordedResponse({ repoRoot: root, sourcePath: 'data/standardized/items.json', limit: 100 }), /between 1 and 5/);
  const result = readRecordedResponse({ repoRoot: root, sourcePath: 'data/standardized/items.json', limit: 100, maxLimit: 100 });
  assert.equal(result.records.length, 100);
});
