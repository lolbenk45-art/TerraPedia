import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_MODULE_TITLE,
  ensureDir,
  fetchWikiModuleContent,
  parseIteminfoModulePayload,
  parseCliArgs,
  sharedDataPath,
  shouldKeepSnapshot,
  writeJson
} from '../lib/wiki-item-utils.mjs';

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
const snapshotJsonPath = path.join(rawDir, `${baseName}.${timestamp}.json`);
const reportPath = path.join(reportDir, `fetch-${timestamp}.json`);
const itemData = parseIteminfoModulePayload(result.moduleContent);
const totalItems = Object.keys(itemData).filter((key) => /^\d+$/.test(key) && Number(key) > 0).length;

writeJson(latestJsonPath, result);
if (keepSnapshot) {
  writeJson(snapshotJsonPath, result);
}
fs.writeFileSync(latestLuaPath, result.moduleContent);

writeJson(reportPath, {
  moduleTitle: result.moduleTitle,
  sourceApi: result.apiUrl,
  pageTitle: result.pageTitle,
  pageId: result.pageId,
  revisionTimestamp: result.revisionTimestamp,
  fetchedAt: result.fetchedAt,
  terrariaVersion: itemData._terrariaversion ?? null,
  moduleGeneratedAt: itemData._generated ?? null,
  totalItems,
  latestJsonPath,
  latestLuaPath,
  snapshotJsonPath: keepSnapshot ? snapshotJsonPath : null
});

console.log(`Fetched module: ${result.pageTitle}`);
console.log(`Revision timestamp: ${result.revisionTimestamp ?? 'unknown'}`);
console.log(`Terraria version: ${itemData._terrariaversion ?? 'unknown'}`);
console.log(`Total items: ${totalItems}`);
console.log(`Latest JSON: ${latestJsonPath}`);
console.log(`Latest Lua: ${latestLuaPath}`);
console.log(`Report: ${reportPath}`);
