import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '../src/cli.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.join(__dirname, 'fixtures', 'npc', 'goblin-tinkerer.fixture.json');

test('runCli supports entity npc mode by page-id', async () => {
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  const payload = await runCli(
    ['entity', '--domain=npc', '--page-id=107'],
    {
      resolveNpcLiveSourceImpl: async ({ pageId }) => {
        assert.equal(pageId, 107);
        return fixture;
      }
    }
  );

  assert.equal(payload.normalized.display.name, 'Goblin Tinkerer');
  assert.equal(payload.audit.status, 'pass');
});

test('runCli supports entity npc mode by page-title', async () => {
  const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  const payload = await runCli(
    ['entity', '--domain=npc', '--page-title=Goblin Tinkerer', '--api-url=https://terraria.wiki.gg/zh/api.php'],
    {
      resolveNpcLiveSourceImpl: async ({ pageTitle, apiUrl }) => {
        assert.equal(pageTitle, 'Goblin Tinkerer');
        assert.equal(apiUrl, 'https://terraria.wiki.gg/zh/api.php');
        return fixture;
      }
    }
  );

  assert.equal(payload.canonical.summary, 'Goblin Tinkerer is a helpful NPC who can reforge items.');
});
