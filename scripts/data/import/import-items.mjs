import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAdminAuth } from '../../lib/local-runtime-config.mjs';
import { parseCliArgs, sharedDataPath } from '../lib/wiki-item-utils.mjs';

const reportDir = sharedDataPath('reports', 'import');
fs.mkdirSync(reportDir, { recursive: true });

export async function importNormalizedItems({
  inputPath = sharedDataPath('normalized', 'items.sample.json'),
  importUrl = process.env.TERRAPEDIA_IMPORT_URL ?? 'http://localhost:8888/api/items/import',
  source,
  overwriteExisting,
  token,
  authUrl,
  username,
  password
} = {}) {
  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const rawPayload = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
  const payload = buildPayload(rawPayload, { source, overwriteExisting }, resolvedInput);
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
    overwriteExisting: payload.overwriteExisting,
    source: payload.source ?? null,
    totalItems: Array.isArray(payload.items) ? payload.items.length : 0,
    authMode: auth.mode,
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

export async function resolveImportAuthorization({
  importUrl,
  token,
  authUrl,
  username,
  password
}) {
  const explicitToken = token ?? process.env.TERRAPEDIA_IMPORT_TOKEN;
  if (explicitToken) {
    return {
      mode: 'token',
      authorizationHeader: explicitToken.startsWith('Bearer ') ? explicitToken : `Bearer ${explicitToken}`
    };
  }

  const auth = resolveAdminAuth(
    {
      username,
      password,
    },
    {
      repoRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
    }
  );
  const loginUsername = auth.username;
  const loginPassword = auth.password;
  const resolvedAuthUrl = authUrl ?? process.env.TERRAPEDIA_AUTH_URL ?? deriveAuthUrl(importUrl);

  const response = await fetch(resolvedAuthUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      username: loginUsername,
      password: loginPassword
    })
  });

  const body = await response.json().catch(() => null);
  const issuedToken = body?.data?.token;
  if (!response.ok || typeof issuedToken !== 'string' || issuedToken.trim() === '') {
    throw new Error(
      `Failed to obtain import token from ${resolvedAuthUrl} (status=${response.status})`
    );
  }

  return {
    mode: 'login',
    authorizationHeader: issuedToken.startsWith('Bearer ') ? issuedToken : `Bearer ${issuedToken}`
  };
}

export function deriveAuthUrl(importUrl) {
  const url = new URL(importUrl);
  if (url.pathname.endsWith('/items/import')) {
    url.pathname = url.pathname.replace(/\/items\/import$/, '/auth/login');
    url.search = '';
    return url.toString();
  }

  url.pathname = '/api/auth/login';
  url.search = '';
  return url.toString();
}

function buildPayload(sourcePayload, overrides, resolvedInput) {
  if (typeof sourcePayload !== 'object' || sourcePayload == null || Array.isArray(sourcePayload)) {
    throw new Error(`Input payload root must be an object: ${resolvedInput}`);
  }

  const overwriteExisting = normalizeBoolean(
    overrides.overwriteExisting,
    sourcePayload.overwriteExisting ?? true
  );

  return {
    ...sourcePayload,
    source: overrides.source ?? sourcePayload.source,
    overwriteExisting
  };
}

function normalizeBoolean(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

function writeReport(report) {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const target = path.join(reportDir, `import-${timestamp}.json`);
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
  const inputPath = positionalInput ?? cliOptions.input ?? sharedDataPath('normalized', 'items.sample.json');
  const result = await importNormalizedItems({
    inputPath,
    importUrl: cliOptions.url ?? process.env.TERRAPEDIA_IMPORT_URL ?? 'http://localhost:8888/api/items/import',
    source: cliOptions.source,
    overwriteExisting: cliOptions['overwrite-existing'] ?? cliOptions.overwriteExisting,
    token: cliOptions.token,
    authUrl: cliOptions['auth-url'] ?? cliOptions.authUrl,
    username: cliOptions.username,
    password: cliOptions.password
  });

  console.log(`Import URL: ${result.requestMeta.importUrl}`);
  console.log(`Payload: ${result.requestMeta.input}`);
  console.log(`HTTP Status: ${result.response?.status ?? 'transport-error'}`);
  console.log(`Report: ${result.reportPath}`);
  if (result.body?.data) {
    console.log(`Created: ${result.body.data.created ?? 0}`);
    console.log(`Updated: ${result.body.data.updated ?? 0}`);
    console.log(`Skipped: ${result.body.data.skipped ?? 0}`);
  }

  if (!result.ok) {
    console.error('Import failed');
    if (result.transportError) {
      console.error(`Transport error: ${result.transportError}`);
    }
    if (result.parseError) {
      console.error(`Response JSON parse failed: ${result.parseError}`);
    }
    if (Array.isArray(result.importErrors) && result.importErrors.length > 0) {
      console.error(`Import errors: ${result.importErrors.length}`);
      result.importErrors.slice(0, 10).forEach((error, index) => {
        console.error(`  ${index + 1}. ${error}`);
      });
    }
    process.exit(1);
  }
}
