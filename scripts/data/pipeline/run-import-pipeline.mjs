import { importNormalizedItems } from '../import/import-items.mjs';
import { resolveBackendApiBase } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, sharedDataPath } from '../lib/wiki-item-utils.mjs';
import { validateNormalizedItems } from '../normalize/validate-normalized-items.mjs';

const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith('--')) ?? sharedDataPath('normalized', 'items.sample.json');
const options = parseCliArgs(args);
const dryRun = booleanOption(options['dry-run'] ?? options.dryRun, false);

const validation = validateNormalizedItems(inputPath);
console.log(`Validated file: ${validation.resolvedInput}`);
console.log(`Items: ${validation.items.length}`);
console.log(`Valid: ${validation.report.valid}`);
console.log(`Report: ${validation.reportPath}`);

if (!validation.report.valid) {
  validation.report.errors.forEach((error) => {
    console.error(error);
  });
  console.error('Validation failed');
  process.exit(1);
}

const importResult = await importNormalizedItems({
  inputPath,
  importUrl: options.url ?? process.env.TERRAPEDIA_IMPORT_URL ?? `${resolveBackendApiBase()}/items/import`,
  source: options.source,
  overwriteExisting: options['overwrite-existing'] ?? options.overwriteExisting,
  dryRun,
  token: options.token,
  authUrl: options['auth-url'] ?? options.authUrl,
  username: options.username,
  password: options.password
});

console.log(`Import URL: ${importResult.requestMeta.importUrl}`);
console.log(`Payload: ${importResult.requestMeta.input}`);
console.log(`Dry run: ${importResult.dryRun === true}`);
console.log(`HTTP Status: ${importResult.response?.status ?? 'transport-error'}`);
console.log(`Report: ${importResult.reportPath}`);
if (importResult.body?.data) {
  console.log(`Created: ${importResult.body.data.created ?? 0}`);
  console.log(`Updated: ${importResult.body.data.updated ?? 0}`);
  console.log(`Skipped: ${importResult.body.data.skipped ?? 0}`);
}

if (!importResult.ok) {
  if (importResult.transportError) {
    console.error(`Transport error: ${importResult.transportError}`);
  }
  if (importResult.parseError) {
    console.error(`Response JSON parse failed: ${importResult.parseError}`);
  }
  if (Array.isArray(importResult.importErrors) && importResult.importErrors.length > 0) {
    importResult.importErrors.forEach((error) => {
      console.error(error);
    });
  }
  console.error('Import failed');
  process.exit(1);
}

console.log('Pipeline finished successfully');

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
