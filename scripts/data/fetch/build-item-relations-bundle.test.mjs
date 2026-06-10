import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildItemRelationsBundle } from './build-item-relations-bundle.mjs';

test('buildItemRelationsBundle preserves MagicMirror source ref types', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'item-relations-bundle-'));
  const inputPath = path.join(root, 'items.json');
  const itemPageDir = path.join(root, 'item-pages');
  const biomeDir = path.join(root, 'biomes');
  const outputPath = path.join(root, 'bundle.json');
  const reportDir = path.join(root, 'reports');
  const npcPath = path.join(root, 'npcs.json');
  const recipeReferencePath = path.join(root, 'recipe-reference.json');
  fs.mkdirSync(itemPageDir, { recursive: true });
  fs.mkdirSync(biomeDir, { recursive: true });

  fs.writeFileSync(inputPath, JSON.stringify({
    items: [{ internalName: 'MagicMirror', name: 'Magic Mirror' }]
  }));
  fs.writeFileSync(npcPath, JSON.stringify({
    npcs: [{ id: 85, internalName: 'Mimic', name: 'Mimic', boss: false }]
  }));
  fs.writeFileSync(recipeReferencePath, JSON.stringify({ sourceType: null, supplementalRecipes: [], groups: [] }));
  fs.writeFileSync(path.join(itemPageDir, 'magicmirror.latest.json'), JSON.stringify({
    itemInternalName: 'MagicMirror',
    itemName: 'Magic Mirror',
    pageTitle: 'Magic Mirrors',
    revisionTimestamp: '2026-04-02T10:40:10Z',
    fetchedAt: '2026-06-10T00:00:00Z',
    wikitext: '',
    recipesMarkup: '',
    html: `
      <p>Magic Mirrors can be found in Chests generated in the Underground and Cavern layers.</p>
      <table class="drop">
        <tr><th>Entity</th><th>Qty</th><th>Chance</th></tr>
        <tr><td><a title="Gold Chest">Gold Chest</a></td><td>1</td><td>1/6 (16.67%)</td></tr>
        <tr><td><a title="Mimic">Mimic</a></td><td>1</td><td>16.67%</td></tr>
        <tr><td><a title="Frozen Chest">Frozen Chest</a></td><td>1</td><td>1/5 (20%)</td></tr>
      </table>
    `
  }));

  const bundle = await buildItemRelationsBundle({
    inputPath,
    itemPageDir,
    biomeDir,
    npcParsedPath: npcPath,
    recipeReferencePath,
    outputPath,
    reportDir
  });

  const itemSources = bundle.itemSources;
  assert.ok(itemSources.some((row) => row.itemInternalName === 'MagicMirror'));
  assert.ok(itemSources.some((row) => row.sourceRefName === 'Gold Chest' && row.sourceRefType !== 'npc'));
  assert.ok(itemSources.some((row) => row.sourceRefName === 'Frozen Chest' && row.sourceRefType !== 'npc'));
  assert.ok(itemSources.some((row) => row.sourceRefName === 'Mimic' && row.sourceRefType === 'npc'));
  assert.ok(itemSources.some((row) => row.sourceType === 'worldgen' && row.sourceRefType === 'world'));
});
