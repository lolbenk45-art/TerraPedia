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
const scriptPath = path.join(__dirname, 'run-wiki-sync.mjs');

test('item page plan passes explicit only-changed=false to fetch action', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const monitorStatePath = path.join(tempDir, 'monitor-state.json');
    const planPath = path.join(tempDir, 'plan.json');
    const progressPath = path.join(tempDir, 'progress.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
    fs.writeFileSync(monitorStatePath, JSON.stringify({ sources: [{ key: 'seed' }] }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--mode=plan',
      '--entity=item_pages',
      '--items=MiningPotion',
      '--only-changed=false',
      '--with-recipes=true',
      `--manifest-path=${manifestPath}`,
      `--monitor-state=${monitorStatePath}`,
      `--plan-path=${planPath}`,
      `--progress-path=${progressPath}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    assert.equal(plan.actions.length, 1);
    assert.ok(plan.actions[0].args.includes('--only-changed=false'));
    assert.ok(!plan.actions[0].args.includes('--only-changed=true'));
});

test('default wiki sync progress path follows WORKTREE_ROOT when progress path is omitted', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-worktree-'));
    const worktreeRoot = path.join(tempDir, 'feature-worktree');
    const manifestPath = path.join(tempDir, 'manifest.json');
    const monitorStatePath = path.join(tempDir, 'monitor-state.json');
    const planPath = path.join(tempDir, 'plan.json');
    const worktreeProgressPath = path.join(worktreeRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');

    fs.mkdirSync(worktreeRoot, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({ records: [] }), 'utf8');
    fs.writeFileSync(monitorStatePath, JSON.stringify({ sources: [{ key: 'seed' }] }), 'utf8');

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--mode=plan',
      '--entity=item_pages',
      '--items=MiningPotion',
      '--only-changed=false',
      '--with-recipes=true',
      `--manifest-path=${manifestPath}`,
      `--monitor-state=${monitorStatePath}`,
      `--plan-path=${planPath}`
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        WORKTREE_ROOT: worktreeRoot,
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.existsSync(worktreeProgressPath), true);

    const progress = JSON.parse(fs.readFileSync(worktreeProgressPath, 'utf8'));
    assert.equal(progress.status, 'completed');
    assert.equal(path.resolve(progress.childStatusPath), worktreeProgressPath);
});
