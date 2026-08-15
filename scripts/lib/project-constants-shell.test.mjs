import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const adapter = path.join(repoRoot, 'scripts', 'lib', 'project-constants.sh');

function runFrom(cwd, expression) {
  return execFileSync('bash', ['-lc', `source ${JSON.stringify(adapter)}; ${expression}`], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, TERRAPEDIA_REPO_ROOT: '' },
  }).trim();
}

test('shell adapter resolves the same root and semantic paths from arbitrary working directories', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shell-adapter-'));
  try {
    const locations = [repoRoot, path.join(repoRoot, 'apps', 'public-web'), temp];
    const roots = locations.map((cwd) => runFrom(cwd, 'tp_project_root'));
    assert.deepEqual(new Set(roots), new Set([repoRoot]));
    const paths = locations.map((cwd) => runFrom(cwd, 'tp_constant_path roots.reports'));
    assert.deepEqual(new Set(paths), new Set([path.join(repoRoot, 'reports')]));
    const app = runFrom(temp, 'tp_application_path publicWeb');
    assert.equal(app, path.join(repoRoot, 'apps', 'public-web'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('shell adapter rejects traversal and supports explicit root override', () => {
  assert.throws(
    () => runFrom(repoRoot, 'tp_resolve_path ../outside'),
    /escapes outside repository root/
  );
  const override = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-shell-root-'));
  try {
    fs.mkdirSync(path.join(override, 'reports'), { recursive: true });
    const result = execFileSync('bash', ['-lc', `source ${JSON.stringify(adapter)}; tp_project_root`], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, TERRAPEDIA_REPO_ROOT: override },
    }).trim();
    assert.equal(result, override);
  } finally {
    fs.rmSync(override, { recursive: true, force: true });
  }
});

test('PowerShell adapter exposes the same semantic contract', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'lib', 'project-constants.ps1'), 'utf8');
  for (const token of ['Get-TerraPediaProjectRoot', 'Get-TerraPediaConstantPath', 'Get-TerraPediaApplicationPath', 'TERRAPEDIA_REPO_ROOT']) {
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('platform common resolver is independent of the caller working directory', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-common-root-'));
  try {
    const common = path.join(repoRoot, 'platform', 'local', 'lib', 'common.sh');
    const result = execFileSync('bash', ['-lc', `source ${JSON.stringify(common)}; resolve_repo_root "$PWD"`], {
      cwd: temp,
      encoding: 'utf8',
    }).trim();
    assert.equal(result, repoRoot);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
