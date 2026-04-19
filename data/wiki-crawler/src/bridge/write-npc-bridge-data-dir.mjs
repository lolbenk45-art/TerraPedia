import fs from 'node:fs/promises';
import path from 'node:path';

import { ensureDir, writeJson } from '../../../../scripts/data/lib/wiki-item-utils.mjs';

const PASSTHROUGH_DATASETS = ['items', 'buffs', 'projectiles', 'armor_sets'];

export async function writeNpcBridgeDataDir({
  sourceStandardizedDir,
  bridgedNpcPayload,
  outputRoot
} = {}) {
  const resolvedSourceDir = path.resolve(sourceStandardizedDir ?? '');
  const resolvedOutputRoot = path.resolve(outputRoot ?? path.join(process.cwd(), 'data', 'generated', 'wiki-crawler-npc-bridge'));
  const standardizedDir = path.join(resolvedOutputRoot, 'standardized');

  ensureDir(standardizedDir);
  writeJson(path.join(standardizedDir, 'npcs.standardized.json'), bridgedNpcPayload ?? { entity: 'npcs', records: [] });

  for (const entity of PASSTHROUGH_DATASETS) {
    const payload = await readJson(path.join(resolvedSourceDir, `${entity}.standardized.json`));
    writeJson(path.join(standardizedDir, `${entity}.standardized.json`), payload);
  }

  const manifestPayload = await readJson(path.join(resolvedSourceDir, '_manifest.standardized.json'));
  writeJson(path.join(standardizedDir, '_manifest.standardized.json'), manifestPayload);

  return {
    outputRoot: resolvedOutputRoot,
    standardizedDir
  };
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}
