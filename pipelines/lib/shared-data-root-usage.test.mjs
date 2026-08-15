import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getProjectRoot } from './project-root.mjs';

const projectRoot = getProjectRoot();

const executableDataRootScripts = [
  'pipelines/import/import-recipes-from-external-data.mjs',
  'pipelines/backfill/backfill-item-periods-from-wiki.mjs',
  'pipelines/sync/sync-item-rarity-period-to-primary-db.mjs',
  'pipelines/sync/sync-item-categories-from-wiki-pages.mjs',
  'pipelines/workflow/run-image-sync.mjs',
  'pipelines/workflow/armor-set-managed-image-index.mjs',
  'pipelines/fetch/fetch-wiki-armor-set-images.mjs',
  'pipelines/audit/domain-readiness-audit.mjs',
];

test('executable data scripts resolve shared data root through project-root helpers', () => {
  for (const relativePath of executableDataRootScripts) {
    const content = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

    assert.doesNotMatch(
      content,
      /G:\/ClaudeCode\/data\/terraPedia|path\.join\([^)]*['"]data['"],\s*['"]terraPedia['"]|path\.resolve\([^)]*['"]data['"],\s*['"]terraPedia['"]/,
      `${relativePath} still contains a hardcoded data/terraPedia default path`,
    );
    assert.match(
      content,
      /resolveSharedDataRoot|sharedDataPath/,
      `${relativePath} should use resolveSharedDataRoot() or sharedDataPath()`,
    );
  }
});
