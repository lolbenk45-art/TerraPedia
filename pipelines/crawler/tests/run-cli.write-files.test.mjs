import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '../src/cli.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.join(__dirname, 'fixtures', 'npc', 'goblin-tinkerer.fixture.json');

test('runCli writes fanout files when --write-files is provided', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-cli-write-'));
  const payload = await runCli([
    '--fixture',
    fixturePath,
    '--write-files',
    `--output-root=${tempRoot}`
  ]);

  assert.equal(payload.normalized.display.name, 'Goblin Tinkerer');
  assert.ok(payload.writtenFiles);
  assert.equal(
    payload.writtenFiles.normalizedPath,
    path.join(tempRoot, 'normalized-light', 'npc', 'goblin-tinkerer.latest.json')
  );

  const normalized = JSON.parse(await fs.readFile(payload.writtenFiles.normalizedPath, 'utf8'));
  const canonical = JSON.parse(await fs.readFile(payload.writtenFiles.canonicalPath, 'utf8'));
  const audit = JSON.parse(await fs.readFile(payload.writtenFiles.auditPath, 'utf8'));

  assert.equal(normalized.display.name, 'Goblin Tinkerer');
  assert.equal(canonical.summary, 'Goblin Tinkerer is a helpful NPC who can reforge items.');
  assert.equal(audit.status, 'pass');
});
