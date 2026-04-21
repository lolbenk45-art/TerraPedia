import { importNormalizedItems } from '../import/import-items.mjs';
import { importItemRelations } from '../import/import-item-relations.mjs';
import { resolveBackendApiBase } from '../../lib/local-runtime-config.mjs';
import { resolveItemDetailSyncMode } from './item-detail-sync-mode.mjs';
import { parseCliArgs, sharedDataPath } from '../lib/wiki-item-utils.mjs';
import { validateNormalizedItems } from '../normalize/validate-normalized-items.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const options = parseCliArgs(args);
const itemInputPath = options.items ?? sharedDataPath('normalized', 'items.wiki.json');
const relationInputPath = options.relations ?? sharedDataPath('normalized', 'item-relations.bundle.json');
const mode = resolveItemDetailSyncMode(options);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const validation = validateNormalizedItems(itemInputPath);
console.log(`Validated file: ${validation.resolvedInput}`);
console.log(`Items: ${validation.items.length}`);
console.log(`Valid: ${validation.report.valid}`);
console.log(`Report: ${validation.reportPath}`);

if (!validation.report.valid) {
  validation.report.errors.forEach((error) => console.error(error));
  process.exit(1);
}

if (!mode.skipItemImport) {
  const itemImportResult = await importNormalizedItems({
    inputPath: itemInputPath,
    importUrl: options.url ?? process.env.TERRAPEDIA_IMPORT_URL ?? `${resolveBackendApiBase()}/items/import`,
    source: options.source,
    overwriteExisting: options['overwrite-existing'] ?? options.overwriteExisting,
    token: options.token,
    authUrl: options['auth-url'] ?? options.authUrl,
    username: options.username,
    password: options.password
  });

  if (!itemImportResult.ok) {
    console.error('Base item import failed');
    process.exit(1);
  }
} else {
  console.log('Item import skipped due to dry-run mode');
}

if (!mode.skipRelationImport) {
  const relationImportResult = await importItemRelations({
    inputPath: relationInputPath,
    importUrl: options['relation-url'] ?? process.env.TERRAPEDIA_RELATION_IMPORT_URL ?? `${resolveBackendApiBase()}/items/import/relations`,
    token: options.token,
    authUrl: options['auth-url'] ?? options.authUrl,
    username: options.username,
    password: options.password
  });

  if (!relationImportResult.ok) {
    console.error('Relation import failed');
    process.exit(1);
  }
} else {
  console.log('Relation import skipped due to dry-run mode');
}

const withBossLoot = booleanOption(options['with-boss-loot'] ?? options.withBossLoot, false);
if (withBossLoot) {
  const bossLootScriptPath = path.join(repoRoot, 'scripts', 'data', 'pipeline', 'run-boss-loot-sync-pipeline.mjs');
  const bossLootArgs = [
    `--relations=${relationInputPath}`
  ];
  if (typeof options.npcs === 'string' && options.npcs.trim() !== '') {
    bossLootArgs.push(`--npcs=${options.npcs.trim()}`);
  }
  if (mode.bossLootDryRun) {
    bossLootArgs.push('--dry-run=true');
  }
  const hasBossLootRegenerateOption = Object.prototype.hasOwnProperty.call(options, 'boss-loot-regenerate-bundle')
    || Object.prototype.hasOwnProperty.call(options, 'bossLootRegenerateBundle');
  if (hasBossLootRegenerateOption) {
    const regenerateValue = booleanOption(
      options['boss-loot-regenerate-bundle'] ?? options.bossLootRegenerateBundle,
      true
    );
    bossLootArgs.push(`--regenerate-bundle=${regenerateValue ? 'true' : 'false'}`);
  }
  if (booleanOption(options['allow-non-primary-db'] ?? options.allowNonPrimaryDb, false)) {
    bossLootArgs.push('--allow-non-primary-db=true');
  }
  const bossLootResult = spawnSync(process.execPath, [bossLootScriptPath, ...bossLootArgs], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (bossLootResult.status !== 0) {
    console.error('Boss loot sync failed');
    process.exit(bossLootResult.status ?? 1);
  }
}

console.log('Item detail sync pipeline finished successfully');

function booleanOption(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (value === true || value === 'true' || value === '1' || value === 'yes') {
    return true;
  }
  if (value === false || value === 'false' || value === '0' || value === 'no') {
    return false;
  }
  return fallback;
}
