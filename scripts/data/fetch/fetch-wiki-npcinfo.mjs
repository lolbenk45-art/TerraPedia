import fs from 'node:fs';
import path from 'node:path';

import {
  ensureDir,
  fetchWikiModuleContent,
  parseCliArgs,
  parseNpcinfoModulePayload,
  sharedDataPath,
  shouldKeepSnapshot,
  writeJson
} from '../lib/wiki-item-utils.mjs';

const DEFAULT_MODULE_TITLE = 'Module:Npcinfo/data';

const options = parseCliArgs(process.argv.slice(2));
const moduleTitle = options.module ?? DEFAULT_MODULE_TITLE;
const rawDir = path.resolve(process.cwd(), options['raw-dir'] ?? sharedDataPath('raw', 'wiki'));
const reportDir = sharedDataPath('reports', 'fetch');
const keepSnapshot = shouldKeepSnapshot(options);

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

const npcData = parseNpcinfoModulePayload(result.moduleContent);
const npcs = Object.entries(npcData)
  .filter(([key, value]) => /^-?\d+$/.test(key) && value && typeof value === 'object')
  .map(([key, value]) => ({
    id: Number(key),
    ...value
  }))
  .sort((left, right) => left.id - right.id);

const parsedPayload = {
  source: 'terraria.wiki.gg:Module:Npcinfo/data',
  sourceApi: result.apiUrl,
  sourcePageTitle: result.pageTitle,
  sourceRevisionTimestamp: result.revisionTimestamp,
  fetchedAt: result.fetchedAt,
  wikiVersion: npcData._terrariaversion ?? null,
  moduleGeneratedAt: npcData._generated ?? null,
  totalNpcs: npcs.length,
  npcs
};

writeJson(latestJsonPath, result);
if (keepSnapshot) {
  writeJson(snapshotJsonPath, result);
}
fs.writeFileSync(latestLuaPath, result.moduleContent);
writeJson(latestParsedPath, parsedPayload);
if (keepSnapshot) {
  writeJson(snapshotParsedPath, parsedPayload);
}

const friendlyCount = npcs.filter((npc) => npc.friendly === true || npc.friendly === 1).length;
const townNpcCount = npcs.filter((npc) => npc.townNPC === true || npc.townNPC === 1).length;
const bossCount = npcs.filter((npc) => npc.boss === true || npc.boss === 1).length;

writeJson(reportPath, {
  moduleTitle: result.moduleTitle,
  sourceApi: result.apiUrl,
  pageTitle: result.pageTitle,
  pageId: result.pageId,
  revisionTimestamp: result.revisionTimestamp,
  fetchedAt: result.fetchedAt,
  terrariaVersion: npcData._terrariaversion ?? null,
  moduleGeneratedAt: npcData._generated ?? null,
  totalNpcs: npcs.length,
  friendlyCount,
  townNpcCount,
  bossCount,
  latestJsonPath,
  latestLuaPath,
  latestParsedPath,
  snapshotJsonPath: keepSnapshot ? snapshotJsonPath : null,
  snapshotParsedPath: keepSnapshot ? snapshotParsedPath : null
});

console.log(`Fetched module: ${result.pageTitle}`);
console.log(`Revision timestamp: ${result.revisionTimestamp ?? 'unknown'}`);
console.log(`Terraria version: ${npcData._terrariaversion ?? 'unknown'}`);
console.log(`Total NPCs: ${npcs.length}`);
console.log(`Friendly NPCs: ${friendlyCount}`);
console.log(`Town NPCs: ${townNpcCount}`);
console.log(`Boss NPCs: ${bossCount}`);
console.log(`Latest JSON: ${latestJsonPath}`);
console.log(`Latest parsed JSON: ${latestParsedPath}`);
console.log(`Latest Lua: ${latestLuaPath}`);
console.log(`Report: ${reportPath}`);
