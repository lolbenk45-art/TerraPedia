import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildRecordedRecipeIngestionEvidence, buildRecordedRecipeMarkerRoot, runRecordedRecipeAutoIngestion } from './recorded-recipe-auto-ingestion.mjs';

test('recorded Recipe executor materializes two response records before invoking the real T1 pipeline', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-recorded-recipe-repo-'));
  const source = path.join(repoRoot, 'data/generated/wiki-zh-recipe-pages.latest.json');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, JSON.stringify({ records: [{ id: 1 }, { id: 2 }, { id: 3 }] }));
  const markerRoot = path.join(repoRoot, 'marker'); fs.mkdirSync(markerRoot); fs.writeFileSync(path.join(markerRoot, '.terrapedia-recorded-response-root'), 'terrapedia-recorded-response-root-v1\n');
  let received;
  const result = runRecordedRecipeAutoIngestion({
    profile: 't1', runId: 'recipe-recorded-01', repoRoot, markerRoot,
    databases: { local: 'terria_v1_automation_acceptance_a_0123456789abcdef_local' },
    mysql: { host: '127.0.0.1', port: 13306, username: 'runner', password: 'secret' },
    recipeAcceptance: (options) => {
      received = options;
      return { status: 'passed', summary: { steps: { import: {
        inputRecipes: 2, insertedRecipes: 2, insertedIngredientRows: 4, insertedStationRows: 3,
        unresolvedItemRowsAfterImport: 0, unresolvedStationRowsAfterImport: 0,
      } } } };
    },
    sourcePath: 'data/generated/wiki-zh-recipe-pages.latest.json', limit: 2,
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.source.selectedRecords, 2);
  assert.equal(result.evidence.recipeRows, 2);
  assert.equal(received.inputPath, 'marker/recorded-http-response.json');
});

test('recorded Recipe marker roots are private and run-derived', () => {
  const root = buildRecordedRecipeMarkerRoot('recipe-recorded-02');
  assert.equal(fs.statSync(root).mode & 0o077, 0);
  assert.match(root, /terrapedia-recorded-recipe-recipe-recorded-02-/);
  fs.rmSync(root, { recursive: true, force: true });
  assert.throws(() => buildRecordedRecipeMarkerRoot('../escape'), /invalid/);
});

test('recorded Recipe evidence retains bounded source and relationship counts without temporary paths', () => {
  const evidence = buildRecordedRecipeIngestionEvidence({
    source: { path: 'data/generated/wiki-zh-recipe-pages.latest.json', hash: 'sha256:source', selectedRecords: 2 },
    ingestion: {
      summary: {
        steps: {
          import: {
            inputRecipes: 2,
            insertedRecipes: 2,
            insertedIngredientRows: 4,
            insertedStationRows: 3,
            unresolvedItemRowsAfterImport: 0,
            unresolvedStationRowsAfterImport: 0,
          },
        },
      },
    },
  });
  assert.deepEqual(evidence, {
    sourcePath: 'data/generated/wiki-zh-recipe-pages.latest.json', sourceHash: 'sha256:source', selectedRecords: 2,
    inputRecipes: 2, recipeRows: 2, ingredientRows: 4, stationRows: 3,
    unresolvedItemRows: 0, unresolvedStationRows: 0,
  });
  assert.throws(() => buildRecordedRecipeIngestionEvidence({ source: {}, ingestion: { summary: {} } }), /summary/i);
});
