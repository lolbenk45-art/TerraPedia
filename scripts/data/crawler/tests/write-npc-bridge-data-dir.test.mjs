import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeNpcBridgeDataDir } from '../src/bridge/write-npc-bridge-data-dir.mjs';

test('writeNpcBridgeDataDir creates a standardized-compatible bridge data directory', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-bridge-dir-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const outputRoot = path.join(tempRoot, 'generated');

  await fs.mkdir(sourceStandardizedDir, { recursive: true });
  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: [{ id: 480, internalName: 'Medusa', name: 'Medusa', wikiCrawler: { summary: { leadText: 'Medusa is a Hardmode enemy.' } } }]
  }, null, 2));
  for (const entity of ['items', 'buffs', 'projectiles', 'armor_sets']) {
    await fs.writeFile(path.join(sourceStandardizedDir, `${entity}.standardized.json`), JSON.stringify({
      entity,
      records: []
    }, null, 2));
  }
  await fs.writeFile(path.join(sourceStandardizedDir, '_manifest.standardized.json'), JSON.stringify({
    generatedAt: '2026-04-16T00:00:00.000Z',
    datasets: ['npcs', 'items', 'buffs', 'projectiles', 'armor_sets']
  }, null, 2));

  const result = await writeNpcBridgeDataDir({
    sourceStandardizedDir,
    bridgedNpcPayload: {
      entity: 'npcs',
      records: [{ id: 480, internalName: 'Medusa', name: 'Medusa', wikiCrawler: { summary: { leadText: 'Medusa is a Hardmode enemy.' } } }]
    },
    outputRoot
  });

  assert.equal(result.standardizedDir, path.join(outputRoot, 'standardized'));
  const manifest = JSON.parse(await fs.readFile(path.join(result.standardizedDir, '_manifest.standardized.json'), 'utf8'));
  const bridgedNpcs = JSON.parse(await fs.readFile(path.join(result.standardizedDir, 'npcs.standardized.json'), 'utf8'));
  const copiedItems = JSON.parse(await fs.readFile(path.join(result.standardizedDir, 'items.standardized.json'), 'utf8'));

  assert.ok(Array.isArray(manifest.datasets));
  assert.equal(bridgedNpcs.records[0].wikiCrawler.summary.leadText, 'Medusa is a Hardmode enemy.');
  assert.deepEqual(copiedItems.records, []);
});
