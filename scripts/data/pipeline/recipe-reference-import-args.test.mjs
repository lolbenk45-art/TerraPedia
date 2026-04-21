import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecipeReferenceImportArgs } from './recipe-reference-import-args.mjs';

test('buildRecipeReferenceImportArgs defaults to apply mode', () => {
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
