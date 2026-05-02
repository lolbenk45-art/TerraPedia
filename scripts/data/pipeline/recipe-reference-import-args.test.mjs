import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecipeReferenceImportArgs } from './recipe-reference-import-args.mjs';
import { buildRecipeReferencePipelineImportArgs } from './run-recipe-reference-sync-pipeline.mjs';

test('buildRecipeReferenceImportArgs defaults to import script dry-run mode', () => {
  assert.deepEqual(
    buildRecipeReferencePipelineImportArgs({}, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json', '--apply=false']
  );
});

test('buildRecipeReferencePipelineImportArgs only enables writes for apply=true', () => {
  assert.deepEqual(
    buildRecipeReferencePipelineImportArgs({ apply: 'true' }, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json', '--apply=true']
  );
});

test('buildRecipeReferencePipelineImportArgs lets dry-run override apply', () => {
  assert.deepEqual(
    buildRecipeReferencePipelineImportArgs({ apply: 'true', 'dry-run': 'true' }, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json', '--apply=false']
  );
});

test('buildRecipeReferencePipelineImportArgs preserves import dry-run override', () => {
  assert.deepEqual(
    buildRecipeReferencePipelineImportArgs({ apply: 'true', importDryRun: 'true' }, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json', '--apply=false']
  );
});

test('buildRecipeReferenceImportArgs keeps legacy helper default output', () => {
  assert.deepEqual(
    buildRecipeReferenceImportArgs({}, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json']
  );
});

test('buildRecipeReferenceImportArgs passes apply=false for import dry-run mode', () => {
  assert.deepEqual(
    buildRecipeReferenceImportArgs({ importDryRun: 'true' }, 'C:/tmp/recipe-material-reference.json'),
    ['--input=C:/tmp/recipe-material-reference.json', '--apply=false']
  );
});
