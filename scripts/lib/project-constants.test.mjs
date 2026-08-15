import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  getProjectConstants,
  resolveConfiguredPath,
  resolveExternalConstantPath,
  resolveProjectConstantPath,
  resolveSharedDataConstantPath
} from './project-constants.mjs';

test('loads the project constants and exposes semantic roots', () => {
  const constants = getProjectConstants();

  assert.equal(constants.project.id, 'terrapedia');
  assert.equal(constants.applications.publicWeb.currentPath, 'apps/public-web');
  assert.equal(constants.applications.publicWeb.legacyPath, 'front-nuxt');
  assert.equal(constants.applications.adminConsole.currentPath, 'apps/admin-console');
  assert.equal(constants.applications.catalogApi.currentPath, 'services/catalog-api');
  assert.equal(constants.dataLayers.standardized, 'data/standardized');
  assert.equal(constants.crawler.monitorProgress, 'generated/wiki-sync-progress.latest.json');
  assert.equal(constants.compatibility.aliases['scripts/data'], 'pipelines');
});

test('resolves relative constants from an explicit repository root', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-project-constants-'));

  assert.equal(
    resolveProjectConstantPath('dataLayers.standardized', { repoRoot }),
    path.join(repoRoot, 'data', 'standardized')
  );
});

test('rejects configured and explicit paths that escape the repository root', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-project-constants-'));

  assert.throws(
    () => resolveConfiguredPath('../outside.json', { repoRoot }),
    /outside repository root/
  );
  assert.throws(
    () => resolveProjectConstantPath('dataLayers.standardized', { repoRoot, suffix: ['..', '..', '..', 'outside'] }),
    /outside repository root/
  );
});

test('allows explicit external paths only when the caller opts in', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terrapedia-project-constants-'));
  const externalPath = path.join(os.tmpdir(), 'terrapedia-shared-data');

  assert.equal(
    resolveConfiguredPath(externalPath, { repoRoot, allowExternal: true }),
    path.resolve(externalPath)
  );
});

test('rejects shared-data suffixes that escape the shared-data root', () => {
  assert.throws(
    () => resolveSharedDataConstantPath('crawler.itemPageRawRoot', { suffix: ['..', '..', '..', '..', 'outside'] }),
    /outside shared-data root/
  );
});

test('resolves portable external defaults without treating them as repository paths', () => {
  const resolved = resolveExternalConstantPath('externalDefaults.minioDataDir', {
    suffix: ['terrapedia-images', 'items']
  });

  assert.match(resolved, /\.local[\\/]share[\\/]terrapedia[\\/]minio[\\/]data[\\/]terrapedia-images[\\/]items$/);
});

test('expands a tilde in an explicitly configured external root', () => {
  const resolved = resolveExternalConstantPath('externalDefaults.minioDataDir', {
    env: { TERRAPEDIA_MINIO_DATA_DIR: '~/custom-minio' },
    suffix: ['objects']
  });

  assert.equal(resolved, path.join(os.homedir(), 'custom-minio', 'objects'));
});

test('rejects external-default suffixes that escape the configured external root', () => {
  assert.throws(
    () => resolveExternalConstantPath('externalDefaults.minioDataDir', { suffix: ['..', '..', 'outside'] }),
    /outside external root/
  );
});
