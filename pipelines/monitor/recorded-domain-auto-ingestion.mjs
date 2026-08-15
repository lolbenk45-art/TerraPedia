import fs from 'node:fs';
import path from 'node:path';

import { materializeRecordedResponse } from './recorded-http-fixture-source.mjs';

export const RECORDED_DOMAIN_SOURCES = Object.freeze({
  recipe: ['data/generated/wiki-zh-recipe-pages.latest.json'],
  boss: ['data/wiki-crawler/normalized/boss-loot.bundle.json'],
  projectile: ['data/standardized-view/projectiles/part-0001.json'],
  buff: ['data/standardized-view/buffs/part-0001.json'],
  biome: ['data/generated/wiki-biomes.importable.latest.json'],
  npc: ['data/wiki-crawler/canonical/npc/king-slime.latest.json'],
});

export function runRecordedDomainAutoIngestion({
  domain,
  repoRoot,
  markerRoot,
  limit = 2,
  runner,
  sourcePaths = RECORDED_DOMAIN_SOURCES[domain],
} = {}) {
  if (!RECORDED_DOMAIN_SOURCES[domain]) throw new Error(`unsupported recorded ingestion domain: ${domain}`);
  if (typeof runner !== 'function') throw new Error(`recorded ${domain} runner is required`);
  if (!Array.isArray(sourcePaths) || sourcePaths.length < 1) throw new Error(`recorded ${domain} source paths are required`);
  const responses = sourcePaths.map((sourcePath, index) => {
    const responseRoot = path.join(markerRoot, domain, String(index));
    fs.mkdirSync(responseRoot, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(responseRoot, '.terrapedia-recorded-response-root'), 'terrapedia-recorded-response-root-v1\n', { mode: 0o600 });
    return materializeRecordedResponse({
    repoRoot,
    sourcePath,
    markerRoot: responseRoot,
    limit,
    requestUrl: `/api.php?action=${domain}&format=json`,
    });
  });
  const result = runner({
    domain,
    inputPaths: responses.map((response) => response.path),
    selectedRecords: responses.reduce((sum, response) => sum + response.records.length, 0),
    recordedResponses: responses.map(({ request, response, sourceHash, records }) => ({ request, response, sourceHash, records })),
  });
  return { status: 'passed', domain, selectedRecords: responses.reduce((sum, response) => sum + response.records.length, 0), result };
}
