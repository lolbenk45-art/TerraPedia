import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.join(__dirname, 'fixtures', 'npc', 'goblin-tinkerer.fixture.json');
const cliPath = path.join(__dirname, '..', 'src', 'cli.mjs');

test('cli fixture runner returns normalized, canonical, and audit payloads', async () => {
  const { stdout } = await execFileAsync('node', [
    cliPath,
    '--fixture',
    fixturePath
  ]);

  const payload = JSON.parse(stdout);
  assert.equal(payload.normalized.display.name, 'Goblin Tinkerer');
  assert.equal(payload.canonical.summary, 'Goblin Tinkerer is a helpful NPC who can reforge items.');
  assert.equal(payload.audit.status, 'pass');
});
