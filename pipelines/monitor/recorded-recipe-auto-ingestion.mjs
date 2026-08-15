import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runRecipeCanonicalT1Acceptance } from '../recipe/recipe-canonical-t1-acceptance.mjs';
import { materializeRecordedResponse } from './recorded-http-fixture-source.mjs';

const DEFAULT_SOURCE = 'data/generated/wiki-zh-recipe-pages.latest.json';

function count(value, label) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) throw new Error(`recorded Recipe ${label} is invalid`);
  return normalized;
}

export function buildRecordedRecipeIngestionEvidence(result = {}) {
  const source = result.source ?? {};
  const summary = result.ingestion?.summary?.steps?.import;
  if (!summary || typeof summary !== 'object') throw new Error('recorded Recipe import summary is required');
  const sourcePath = String(source.path ?? '').trim();
  const sourceHash = String(source.hash ?? '').trim();
  if (!sourcePath || !sourceHash) throw new Error('recorded Recipe source evidence is incomplete');
  return Object.freeze({
    sourcePath,
    sourceHash,
    selectedRecords: count(source.selectedRecords, 'selected record count'),
    inputRecipes: count(summary.inputRecipes, 'input recipe count'),
    recipeRows: count(summary.insertedRecipes, 'recipe count'),
    ingredientRows: count(summary.insertedIngredientRows, 'ingredient relationship count'),
    stationRows: count(summary.insertedStationRows, 'station relationship count'),
    unresolvedItemRows: count(summary.unresolvedItemRowsAfterImport, 'unresolved item count'),
    unresolvedStationRows: count(summary.unresolvedStationRowsAfterImport, 'unresolved station count'),
  });
}

export function runRecordedRecipeAutoIngestion({
  profile,
  runId,
  repoRoot,
  databases,
  mysql,
  markerRoot,
  sourcePath = DEFAULT_SOURCE,
  limit = 2,
  recipeAcceptance = runRecipeCanonicalT1Acceptance,
} = {}) {
  if (profile !== 't1') throw new Error('recorded Recipe auto-ingestion requires T1 profile');
  if (!markerRoot) throw new Error('recorded Recipe auto-ingestion marker root is required');
  const response = materializeRecordedResponse({
    sourcePath,
    repoRoot,
    markerRoot,
    limit,
    requestUrl: '/api.php?action=parse&prop=wikitext&format=json',
  });
  const inputPath = path.relative(repoRoot, response.path).replaceAll('\\', '/');
  const acceptance = recipeAcceptance({ profile, runId, repoRoot, databases, mysql, inputPath });
  const result = {
    status: 'passed',
    source: { path: sourcePath, hash: response.sourceHash, request: response.request, responseStatus: response.response.status, selectedRecords: response.records.length },
    ingestion: acceptance,
  };
  return { ...result, evidence: buildRecordedRecipeIngestionEvidence(result) };
}

export function buildRecordedRecipeMarkerRoot(runId) {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(String(runId ?? ''))) throw new Error('recorded Recipe runId is invalid');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `terrapedia-recorded-recipe-${runId}-`));
  fs.writeFileSync(path.join(root, '.terrapedia-recorded-response-root'), 'terrapedia-recorded-response-root-v1\n', { mode: 0o600 });
  return root;
}
