import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runRecipeCanonicalT1Acceptance } from './recipe-canonical-t1-acceptance.mjs';

test('recipe T1 rejects formal database targets before reading input', () => {
  assert.throws(() => runRecipeCanonicalT1Acceptance({
    profile: 't1', runId: 'recipe-t1-test', repoRoot: process.cwd(),
    databases: { local: 'terria_v1_local' }, mysql: {},
  }), /isolated local database/);
});

test('recipe T1 accepts only a run-derived isolated local database', () => {
  for (const database of [
    'terria_v1_maint',
    'terria_v1_relation',
    'terria_v1_automation_acceptance_npc_deadbeef_maint',
    'unrelated_test_local',
  ]) {
    assert.throws(() => runRecipeCanonicalT1Acceptance({
      profile: 't1',
      runId: 'recipe-t1-test',
      repoRoot: process.cwd(),
      databases: { local: database },
      mysql: {},
    }), /isolated local database/, database);
  }
});

test('recipe T1 rejects non-T1 profiles', () => {
  assert.throws(() => runRecipeCanonicalT1Acceptance({ profile: 't0' }), /T1 profile/);
});

test('recipe T1 runs the bounded local fixture with network metadata disabled', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recipe-t1-test-'));
  const fixturePath = 'scripts/data/recipe/fixtures/recipe-t1.sample.json';
  fs.mkdirSync(path.join(repoRoot, path.dirname(fixturePath)), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, fixturePath), '{"records":[]}\n');
  let invocation;

  try {
    const result = runRecipeCanonicalT1Acceptance({
      profile: 't1',
      runId: 'recipe-t1-test',
      repoRoot,
      databases: { local: 'terria_v1_automation_acceptance_npc_0123456789abcdef_local' },
      mysql: { host: '127.0.0.1', port: 13306, username: 'root', password: 'root' },
      spawnSyncImpl(_command, args) {
        invocation = args;
        const outputArg = args.find((arg) => arg.startsWith('--output='));
        fs.writeFileSync(outputArg.slice('--output='.length), JSON.stringify({ status: 'passed' }));
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    assert.ok(invocation.includes(`--input=${path.join(repoRoot, fixturePath)}`));
    assert.ok(invocation.includes('--offline=true'));
    assert.equal(result.inputPath, fixturePath);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
