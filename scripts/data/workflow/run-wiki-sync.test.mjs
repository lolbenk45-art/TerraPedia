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
const defaultProgressPath = path.join(repoRoot, 'data', 'generated', 'wiki-sync-progress.latest.json');

test('item page plan passes explicit only-changed=false to fetch action', () => {
  withPreservedFile(defaultProgressPath, () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-wiki-sync-'));
    const manifestPath = path.join(tempDir, 'manifest.json');
    const monitorStatePath = path.join(tempDir, 'monitor-state.json');
    const planPath = path.join(tempDir, 'plan.json');
    const progressPath = path.join(tempDir, 'progress.json');

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
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    assert.equal(plan.actions.length, 1);
    assert.ok(plan.actions[0].args.includes('--only-changed=false'));
    assert.ok(!plan.actions[0].args.includes('--only-changed=true'));
  });
});

function withPreservedFile(filePath, task) {
  const existed = fs.existsSync(filePath);
  const previous = existed ? fs.readFileSync(filePath) : null;
  try {
    task();
  } finally {
    if (existed) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, previous);
    } else {
      fs.rmSync(filePath, { force: true });
    }
  }
}
