import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveMysqlModulePath, loadMysqlModule } from './mysql-module.mjs';

function makeRepo({ withDeps }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-mysql-'));
  fs.mkdirSync(path.join(root, 'data-query-app'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'data-query-app', 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { mysql2: '^3' } }),
    'utf8',
  );
  if (withDeps) {
    const dir = path.join(root, 'data-query-app', 'node_modules', 'mysql2');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'mysql2', main: 'index.js' }), 'utf8');
    fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = { marker: "root" };', 'utf8');
    fs.writeFileSync(path.join(dir, 'promise.js'), 'module.exports = { marker: "promise" };', 'utf8');
  }
  return root;
}

test('resolves mysql2 from the data-query-app package that actually declares it', () => {
  const repoRoot = makeRepo({ withDeps: true });
  const resolved = resolveMysqlModulePath({ repoRoot });
  assert.match(resolved, /data-query-app[/\\]node_modules[/\\]mysql2/);
});

test('loadMysqlModule returns the promise entrypoint', () => {
  const repoRoot = makeRepo({ withDeps: true });
  const mysql = loadMysqlModule({ repoRoot });
  assert.equal(mysql.marker, 'promise');
});

test('a missing dependency fails with an actionable message, not a raw MODULE_NOT_FOUND', () => {
  const repoRoot = makeRepo({ withDeps: false });
  assert.throws(
    () => loadMysqlModule({ repoRoot }),
    (error) => {
      assert.match(error.message, /mysql2\/promise could not be resolved/);
      assert.match(error.message, /data-query-app/);
      assert.doesNotMatch(error.message, /^Cannot find module/);
      return true;
    },
  );
});

test('an injected module is returned untouched, so callers stay testable offline', () => {
  const injected = { marker: 'injected' };
  assert.equal(loadMysqlModule({ repoRoot: '/nonexistent', mysqlModule: injected }), injected);
});

test('resolution never depends on the calling module location', () => {
  // The defect this replaces was createRequire(import.meta.url): resolution from the script's
  // own directory, which cannot reach data-query-app/node_modules and fails on every script.
  const repoRoot = makeRepo({ withDeps: true });
  const fromHere = resolveMysqlModulePath({ repoRoot });
  const fromElsewhere = resolveMysqlModulePath({ repoRoot, callerUrl: 'file:///tmp/somewhere/else.mjs' });
  assert.equal(fromHere, fromElsewhere);
});
