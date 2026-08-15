import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertReadOnlySql,
  buildRecipeFormalVerification,
} from './recipe-formal-verification.mjs';
import { hashWikiZhRecipeProjection } from './recipe-formal-contract.mjs';

const projection = [{
  resultItemId: 10,
  resultInternalName: 'Torch',
  resultQuantity: 1,
  versionScope: null,
  notes: null,
  sourceProvider: 'wiki_zh',
  sourcePage: 'Recipe/Torch',
  sourceRevisionTimestamp: '2026-07-27 00:00:00',
  sortOrder: 1,
  status: 1,
  deleted: 0,
  ingredients: [],
  stations: [],
}];
const projectionHash = hashWikiZhRecipeProjection(projection);

function validInput() {
  return {
    paths: {
      input: 'data/generated/wiki-zh-recipe-pages.latest.json',
      pipeline: 'reports/wiki-zh-recipe-sync-summary-2026-07-29.json',
      standalone: 'reports/wiki-zh-recipe-import-2026-07-29.json',
    },
    hashes: { input: 'input-hash', pipeline: 'pipeline-hash', standalone: 'standalone-hash' },
    expectedInputHash: 'input-hash',
    expectedFinalProjectionHash: projectionHash,
    input: { records: [{ recipeTables: [{ rows: [{}] }] }] },
    pipeline: {
      apply: true,
      steps: {
        import: {
          apply: true,
          database: 'terria_v1_local',
          inputPath: '/work/data/generated/wiki-zh-recipe-pages.latest.json',
          inputPages: 1,
          inputRecipes: 1,
          insertedRecipes: 1,
          insertedIngredientRows: 0,
          insertedStationRows: 0,
          createdPlaceholderItems: 0,
          createdCraftingStations: 0,
          unresolvedItemRowsAfterImport: 0,
          unresolvedStationRowsAfterImport: 0,
          importedRecipeCountInDb: 1,
          recipeScopeHashTarget: projectionHash,
        },
        providerConsolidation: {
          apply: true,
          dryRun: false,
          after: { recipeRows: 4, activeRecipeRows: 2, resultItems: 1, activeResultItems: 1 },
        },
        zhDisplayBackfill: {
          apply: true,
          dbName: 'terria_v1_local',
          groupIngredients: { updated: 124 },
          stations: { updated: 239 },
          after: {
            groupIngredients: { needsSync: 0 },
            ingredients: { needsSync: 0 },
            stations: { needsSync: 0 },
          },
        },
      },
    },
    standalone: { apply: false, inputRecipes: 2, inputPath: '/tmp/sample.json' },
    formalSnapshot: {
      database: 'terria_v1_local',
      totalRecipes: 4,
      totalIngredients: 0,
      totalStations: 0,
      consolidationRecipeRows: 4,
      activeRecipeRows: 2,
      resultItems: 1,
      activeResultItems: 1,
      wikiZhRecipes: 1,
      wikiZhIngredients: 0,
      wikiZhStations: 0,
      unresolvedItems: 0,
      unresolvedStations: 0,
      projection,
      projectionHash,
    },
    expected: {
      inputPages: 1,
      inputRecipes: 1,
      importedRecipes: 1,
      ingredientRows: 0,
      stationRows: 0,
    },
    generatedAt: '2026-08-08T00:00:00.000Z',
  };
}

test('passes authoritative chain while classifying overwritten standalone report', () => {
  const input = validInput();
  input.pipeline.steps.import.recipeScopeHashTarget = 'f'.repeat(64);
  const report = buildRecipeFormalVerification(input);

  assert.equal(report.status, 'passed');
  assert.equal(report.mode, 'read-only');
  assert.equal(report.standaloneImport.classification, 'superseded-invalid');
  assert.equal(report.formalScope.projectionHash, report.expectedFinalProjectionHash);
  assert.notEqual(report.formalScope.projectionHash, report.appliedPipeline.import.recipeScopeHashTarget);
  assert.equal(report.writesAttempted, false);
  assert.deepEqual(report.blockingReasons, []);
});

test('fails when formal projection drifts from expected post-backfill scope', () => {
  const input = validInput();
  input.formalSnapshot.projectionHash = 'drifted';
  const report = buildRecipeFormalVerification(input);

  assert.equal(report.status, 'failed');
  assert.ok(report.blockingReasons.some((reason) => /projection hash/i.test(reason)));
});

test('fails invalid embedded apply and unresolved formal relations', () => {
  const input = validInput();
  input.pipeline.steps.import.apply = false;
  input.formalSnapshot.unresolvedStations = 1;
  const report = buildRecipeFormalVerification(input);

  assert.equal(report.status, 'failed');
  assert.ok(report.blockingReasons.some((reason) => /embedded import/i.test(reason)));
  assert.ok(report.blockingReasons.some((reason) => /unresolved/i.test(reason)));
});

test('fails when current provider consolidation aggregates drift', () => {
  const input = validInput();
  input.formalSnapshot.activeRecipeRows = 3;
  const report = buildRecipeFormalVerification(input);

  assert.equal(report.status, 'failed');
  assert.ok(report.blockingReasons.some((reason) => /consolidation aggregates/i.test(reason)));
});

test('read-only SQL guard rejects mutation statements', () => {
  assert.doesNotThrow(() => assertReadOnlySql('SELECT id FROM recipes'));
  assert.throws(() => assertReadOnlySql('UPDATE recipes SET status = 0'), /read-only verifier rejected SQL/i);
  assert.throws(() => assertReadOnlySql('WITH selected AS (SELECT id FROM recipes) UPDATE recipes SET status = 0'), /read-only verifier rejected SQL/i);
  assert.throws(() => assertReadOnlySql('SET NAMES utf8mb4'), /read-only verifier rejected SQL/i);
});
