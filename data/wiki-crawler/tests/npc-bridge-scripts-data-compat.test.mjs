import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeNpcBridgeDataDir } from '../src/bridge/write-npc-bridge-data-dir.mjs';
import { loadStandardizedDataset } from '../../../scripts/data/lib/load-standardized-dataset.mjs';

test('the generated bridge dir is consumable by loadStandardizedDataset for npcs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-bridge-compat-'));
  const sourceStandardizedDir = path.join(tempRoot, 'source-standardized');
  const outputRoot = path.join(tempRoot, 'generated');

  await fs.mkdir(sourceStandardizedDir, { recursive: true });
  await fs.writeFile(path.join(sourceStandardizedDir, 'npcs.standardized.json'), JSON.stringify({
    entity: 'npcs',
    records: [{ id: 480, internalName: 'Medusa', name: 'Medusa' }]
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
      records: [{ id: 480, internalName: 'Medusa', name: 'Medusa', wikiCrawler: { profile: { kind: 'enemy' } } }]
    },
    outputRoot
  });

  const npcs = loadStandardizedDataset(result.standardizedDir, 'npcs');
  assert.equal(npcs.records[0].internalName, 'Medusa');
  assert.equal(npcs.records[0].wikiCrawler.profile.kind, 'enemy');
});
