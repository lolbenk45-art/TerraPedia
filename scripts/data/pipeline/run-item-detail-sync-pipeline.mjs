import { importNormalizedItems } from '../import/import-items.mjs';
import { importItemRelations } from '../import/import-item-relations.mjs';
import { parseCliArgs, sharedDataPath } from '../lib/wiki-item-utils.mjs';
import { validateNormalizedItems } from '../normalize/validate-normalized-items.mjs';

const args = process.argv.slice(2);
const options = parseCliArgs(args);
const itemInputPath = options.items ?? sharedDataPath('normalized', 'items.wiki.json');
const relationInputPath = options.relations ?? sharedDataPath('normalized', 'item-relations.bundle.json');

const validation = validateNormalizedItems(itemInputPath);
console.log(`Validated file: ${validation.resolvedInput}`);
console.log(`Items: ${validation.items.length}`);
console.log(`Valid: ${validation.report.valid}`);
console.log(`Report: ${validation.reportPath}`);

if (!validation.report.valid) {
  validation.report.errors.forEach((error) => console.error(error));
  process.exit(1);
}

const itemImportResult = await importNormalizedItems({
  inputPath: itemInputPath,
  importUrl: options.url ?? process.env.TERRAPEDIA_IMPORT_URL ?? 'http://localhost:8888/api/items/import',
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

const relationImportResult = await importItemRelations({
  inputPath: relationInputPath,
  importUrl: options['relation-url'] ?? process.env.TERRAPEDIA_RELATION_IMPORT_URL ?? 'http://localhost:8888/api/items/import/relations',
  token: options.token,
  authUrl: options['auth-url'] ?? options.authUrl,
  username: options.username,
  password: options.password
});

if (!relationImportResult.ok) {
  console.error('Relation import failed');
  process.exit(1);
}

console.log('Item detail sync pipeline finished successfully');
