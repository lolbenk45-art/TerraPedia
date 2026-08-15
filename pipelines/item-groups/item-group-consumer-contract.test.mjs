import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const compatibilityFiles = [
  'recipe-material-reference.json',
  'recipe-group-overrides.json',
  'item-group-overrides.json',
];

const expectedPostCutoverInventory = [
  entry('pipelines/audit/audit-any-item-group-sources.mjs', 'governance'),
  entry('pipelines/audit/canonical-source-contract-registry.mjs', 'governance'),
  entry('pipelines/audit/domain-readiness-audit.mjs', 'governance'),
  entry('pipelines/automation/canonical-operation-catalog.mjs', 'governance'),
  entry('pipelines/automation/canonical-operation-execution-manifest.mjs', 'governance'),
  entry('pipelines/generate/generate-item-group-overrides.mjs', 'compat_export'),
  entry('pipelines/generate/generate-recipe-material-reference.mjs', 'compat_export'),
  entry('pipelines/item-groups/item-group-bootstrap.mjs', 'bootstrap'),
  entry('pipelines/item-groups/item-group-compatibility-publish.mjs', 'compat_export'),
  entry('pipelines/item-groups/item-group-live-acceptance.mjs', 'bootstrap'),
  entry('pipelines/item-groups/item-group-readiness.mjs', 'governance'),
  entry('pipelines/landing/source-dataset-locator.mjs', 'bootstrap'),
  entry('services/catalog-api/src/main/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImpl.java', 'governance'),
];

test('group compatibility inputs have an exact post-cutover production inventory', async () => {
  const actualInventory = await scanProductionInventory();

  assert.deepEqual(actualInventory, expectedPostCutoverInventory);
  assert.equal(actualInventory.every((row) => (
    ['bootstrap', 'compat_export', 'governance'].includes(row.role)
  )), true);
});

async function scanProductionInventory() {
  const files = [
    ...(await walkProductionFiles(path.join(repoRoot, 'services', 'catalog-api', 'src', 'main', 'java'))),
    ...(await walkProductionFiles(path.join(repoRoot, 'pipelines'))),
  ];
  const inventory = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (!compatibilityFiles.some((name) => source.includes(name))) {
      continue;
    }
    const relativePath = normalizePath(path.relative(repoRoot, file));
    inventory.push(entry(relativePath, classifyRole(relativePath)));
  }
  return inventory.sort((left, right) => left.path.localeCompare(right.path));
}

async function walkProductionFiles(directory) {
  const result = [];
  for (const dirent of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, dirent.name);
    if (dirent.isDirectory()) {
      result.push(...await walkProductionFiles(fullPath));
      continue;
    }
    if (/\.(java|mjs)$/.test(dirent.name) && !dirent.name.endsWith('.test.mjs')) {
      result.push(fullPath);
    }
  }
  return result;
}

function classifyRole(relativePath) {
  if (relativePath === 'services/catalog-api/src/main/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImpl.java') {
    return 'governance';
  }
  if (relativePath.startsWith('services/catalog-api/src/main/java/')) {
    return 'runtime_reader';
  }
  if (relativePath.startsWith('pipelines/generate/')) {
    return 'compat_export';
  }
  if (relativePath === 'pipelines/item-groups/item-group-compatibility-publish.mjs') {
    return 'compat_export';
  }
  if (
    relativePath === 'pipelines/item-groups/item-group-bootstrap.mjs'
    || relativePath === 'pipelines/item-groups/item-group-live-acceptance.mjs'
    || relativePath === 'pipelines/landing/source-dataset-locator.mjs'
  ) {
    return 'bootstrap';
  }
  if (relativePath === 'pipelines/audit/reconcile-live-recipe-coverage.mjs') {
    return 'pipeline_input';
  }
  if (
    relativePath.startsWith('pipelines/audit/')
    || relativePath === 'pipelines/automation/canonical-operation-catalog.mjs'
    || relativePath === 'pipelines/automation/canonical-operation-execution-manifest.mjs'
    || relativePath === 'pipelines/item-groups/item-group-readiness.mjs'
    || relativePath === 'pipelines/relation/relation-table-catalog.mjs'
  ) {
    return 'governance';
  }
  return 'pipeline_input';
}

function entry(filePath, role) {
  return { path: filePath, role };
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}
