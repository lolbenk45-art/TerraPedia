import fs from 'node:fs';
import path from 'node:path';

import {
  ensureDir,
  fetchWikiModuleContent,
  parseCliArgs,
  parseLuaDataTable,
  sharedDataPath,
  writeJson
} from '../lib/wiki-item-utils.mjs';

const DEFAULT_MODULE_TITLE = 'Module:Projectileinfo/data';

const options = parseCliArgs(process.argv.slice(2));
const moduleTitle = options.module ?? DEFAULT_MODULE_TITLE;
const rawDir = path.resolve(process.cwd(), options['raw-dir'] ?? sharedDataPath('raw', 'wiki'));
const reportDir = sharedDataPath('reports', 'fetch');

ensureDir(rawDir);
ensureDir(reportDir);

const result = await fetchWikiModuleContent({ moduleTitle });
const timestamp = new Date().toISOString().replaceAll(':', '-');
const baseName = moduleTitle.replaceAll(':', '__').replaceAll('/', '__').toLowerCase();
const latestJsonPath = path.join(rawDir, `${baseName}.latest.json`);
const latestLuaPath = path.join(rawDir, `${baseName}.latest.lua`);
const latestParsedPath = path.join(rawDir, `${baseName}.parsed.latest.json`);
const snapshotJsonPath = path.join(rawDir, `${baseName}.${timestamp}.json`);
const snapshotParsedPath = path.join(rawDir, `${baseName}.parsed.${timestamp}.json`);
const reportPath = path.join(reportDir, `fetch-${baseName}-${timestamp}.json`);

const projectileData = parseLuaDataTable(result.moduleContent);
const projectiles = Object.entries(projectileData)
  .filter(([key, value]) => /^\d+$/.test(key) && value && typeof value === 'object')
  .map(([key, value]) => ({
    id: Number(key),
    ...value
  }))
  .sort((left, right) => left.id - right.id);

const metadata = extractProjectileMetadata(result.moduleContent);
const parsedPayload = {
  source: 'terraria.wiki.gg:Module:Projectileinfo/data',
  sourceApi: result.apiUrl,
  sourcePageTitle: result.pageTitle,
  sourceRevisionTimestamp: result.revisionTimestamp,
  fetchedAt: result.fetchedAt,
  moduleGeneratedAt: metadata.generatedAt,
  moduleGeneratedFrom: metadata.generatedFrom,
  totalProjectiles: projectiles.length,
  projectiles
};

writeJson(latestJsonPath, result);
writeJson(snapshotJsonPath, result);
fs.writeFileSync(latestLuaPath, result.moduleContent);
writeJson(latestParsedPath, parsedPayload);
writeJson(snapshotParsedPath, parsedPayload);

const friendlyCount = projectiles.filter((projectile) => projectile.friendly === true).length;
const hostileCount = projectiles.filter((projectile) => projectile.hostile === true).length;
const minionCount = projectiles.filter((projectile) => projectile.minion === true).length;
const arrowCount = projectiles.filter((projectile) => projectile.arrow === true).length;

writeJson(reportPath, {
  moduleTitle: result.moduleTitle,
  sourceApi: result.apiUrl,
  pageTitle: result.pageTitle,
  pageId: result.pageId,
  revisionTimestamp: result.revisionTimestamp,
  fetchedAt: result.fetchedAt,
  moduleGeneratedAt: metadata.generatedAt,
  moduleGeneratedFrom: metadata.generatedFrom,
  totalProjectiles: projectiles.length,
  friendlyCount,
  hostileCount,
  minionCount,
  arrowCount,
  latestJsonPath,
  latestLuaPath,
  latestParsedPath,
  snapshotJsonPath,
  snapshotParsedPath
});

console.log(`Fetched module: ${result.pageTitle}`);
console.log(`Revision timestamp: ${result.revisionTimestamp ?? 'unknown'}`);
console.log(`Module generated: ${metadata.generatedAt ?? 'unknown'}`);
console.log(`Total projectiles: ${projectiles.length}`);
console.log(`Friendly: ${friendlyCount}`);
console.log(`Hostile: ${hostileCount}`);
console.log(`Minion: ${minionCount}`);
console.log(`Arrow: ${arrowCount}`);
console.log(`Latest JSON: ${latestJsonPath}`);
console.log(`Latest parsed JSON: ${latestParsedPath}`);
console.log(`Latest Lua: ${latestLuaPath}`);
console.log(`Report: ${reportPath}`);

function extractProjectileMetadata(moduleContent) {
  const generatedAtMatch = moduleContent.match(/^\s*--\s*generated at:\s*(.+)$/m);
  const generatedFromMatch = moduleContent.match(/^\s*--\s*from\s+(.+)$/m);

  return {
    generatedAt: generatedAtMatch?.[1]?.trim() ?? null,
    generatedFrom: generatedFromMatch?.[1]?.trim() ?? null
  };
}
