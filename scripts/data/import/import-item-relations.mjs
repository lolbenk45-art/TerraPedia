import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCliArgs, sharedDataPath } from '../lib/wiki-item-utils.mjs';
import { deriveAuthUrl, resolveImportAuthorization } from './import-items.mjs';

const reportDir = sharedDataPath('reports', 'import');
fs.mkdirSync(reportDir, { recursive: true });

export async function importItemRelations({
  inputPath = sharedDataPath('normalized', 'item-relations.bundle.json'),
  importUrl = process.env.TERRAPEDIA_RELATION_IMPORT_URL ?? 'http://localhost:8888/api/items/import/relations',
  token,
  authUrl,
  username,
  password
} = {}) {
  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const payload = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
  const auth = await resolveImportAuthorization({
    importUrl,
    token,
    authUrl,
    username,
    password
  });

  const requestMeta = {
    input: resolvedInput,
    importUrl,
    source: payload.source ?? null,
    overwriteExisting: payload.overwriteExisting ?? true,
    authMode: auth.mode,
    itemImages: Array.isArray(payload.itemImages) ? payload.itemImages.length : 0,
    recipes: Array.isArray(payload.recipes) ? payload.recipes.length : 0,
    itemSources: Array.isArray(payload.itemSources) ? payload.itemSources.length : 0,
    biomes: Array.isArray(payload.biomes) ? payload.biomes.length : 0,
    itemBiomes: Array.isArray(payload.itemBiomes) ? payload.itemBiomes.length : 0,
    snapshots: Array.isArray(payload.snapshots) ? payload.snapshots.length : 0,
    requestedAt: new Date().toISOString()
  };

  let response;
  let body;
  let parseError = null;

  try {
    response = await fetch(importUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(auth.authorizationHeader ? { Authorization: auth.authorizationHeader } : {})
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    const reportPath = writeReport({
      ok: false,
      request: requestMeta,
      response: null,
      body: null,
      transportError: error.message
    });
    return {
      ok: false,
      reportPath,
      requestMeta,
      response: null,
      body: null,
      parseError: null,
      transportError: error.message
    };
  }

  const responseText = await response.text();
  try {
    body = responseText === '' ? null : JSON.parse(responseText);
  } catch (error) {
    parseError = error.message;
    body = null;
  }

  const reportPath = writeReport({
    ok: response.ok && body?.success !== false,
    request: requestMeta,
    response: {
      status: response.status,
      statusText: response.statusText
    },
    body,
    rawResponseText: parseError ? responseText : undefined,
    parseError
  });

  const importErrors = Array.isArray(body?.data?.errors) ? body.data.errors : [];

  return {
    ok: response.ok && !parseError && body?.success !== false && importErrors.length === 0,
    reportPath,
    requestMeta,
    response,
    body,
    parseError,
    importErrors
  };
}

function writeReport(report) {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const target = path.join(reportDir, `import-item-relations-${timestamp}.json`);
  fs.writeFileSync(target, JSON.stringify(report, null, 2));
  return target;
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectExecution()) {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  const positionalInput = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  const result = await importItemRelations({
    inputPath: positionalInput ?? cliOptions.input ?? sharedDataPath('normalized', 'item-relations.bundle.json'),
    importUrl: cliOptions.url ?? process.env.TERRAPEDIA_RELATION_IMPORT_URL ?? 'http://localhost:8888/api/items/import/relations',
    token: cliOptions.token,
    authUrl: cliOptions['auth-url'] ?? cliOptions.authUrl ?? deriveAuthUrl(cliOptions.url ?? process.env.TERRAPEDIA_RELATION_IMPORT_URL ?? 'http://localhost:8888/api/items/import/relations'),
    username: cliOptions.username,
    password: cliOptions.password
  });

  console.log(`Import URL: ${result.requestMeta.importUrl}`);
  console.log(`Payload: ${result.requestMeta.input}`);
  console.log(`HTTP Status: ${result.response?.status ?? 'transport-error'}`);
  console.log(`Report: ${result.reportPath}`);
  if (result.body?.data) {
    console.log(`Images: ${result.body.data.itemImagesUpserted ?? 0}`);
    console.log(`Recipes: ${result.body.data.recipesUpserted ?? 0}`);
    console.log(`Sources: ${result.body.data.itemSourcesUpserted ?? 0}`);
    console.log(`Biomes: ${result.body.data.biomesUpserted ?? 0}`);
  }

  if (!result.ok) {
    if (result.transportError) {
      console.error(`Transport error: ${result.transportError}`);
    }
    if (result.parseError) {
      console.error(`Response JSON parse failed: ${result.parseError}`);
    }
    if (Array.isArray(result.importErrors) && result.importErrors.length > 0) {
      result.importErrors.slice(0, 20).forEach((error) => console.error(error));
    }
    console.error('Item relation import failed');
    process.exit(1);
  }
}
