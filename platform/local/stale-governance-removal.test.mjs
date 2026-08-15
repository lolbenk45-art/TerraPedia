import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const stalePaths = [
  'docs/project-governance/03_TECH_STACK.md',
  'docs/project-governance/04_ARCHITECTURE.md',
  'docs/project-governance/07_TESTING_STRATEGY.md',
  'docs/project-governance/08_CICD_DEPLOYMENT.md',
  'docs/project-governance/09_SECURITY.md',
  'docs/project-governance/10_OPERATIONS.md',
  'docs/project-governance/11_DOCUMENTATION_SYSTEM.md',
  'docs/project-governance/12_RELEASE_CHECKLIST.md',
];

const preservedPaths = [
  'docs/project-governance/01_OVERVIEW.md',
  'docs/project-governance/02_REQUIREMENTS.md',
  'docs/project-governance/06_UI_UX_GUIDELINES.md',
];

const historicalDevlogPaths = [
  'docs/devlog/entries/2026-07-09-old-governance-doc-refresh.md',
  'docs/devlog/entries/2026-07-09-project-status-risk-sync.md',
];

function readText(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function pathEntryExists(relativePath) {
  return (
    lstatSync(resolve(repoRoot, relativePath), { throwIfNoEntry: false }) !==
    undefined
  );
}

test('approved stale root governance files are absent', () => {
  for (const relativePath of stalePaths) {
    assert.equal(
      pathEntryExists(relativePath),
      false,
      `stale path remains: ${relativePath}`,
    );
  }
});

test('approved reference and historical evidence files are preserved', () => {
  for (const relativePath of [...preservedPaths, ...historicalDevlogPaths]) {
    assert.equal(
      pathEntryExists(relativePath),
      true,
      `preserved path missing: ${relativePath}`,
    );
  }
});

test('live governance surfaces record removal without routing deleted files', () => {
  const index = readText('docs/project-governance/INDEX.md');
  const control = readText(
    'docs/project-governance/current/PROJECT_CONTROL.md',
  );
  const status = readText('docs/project-management/current-status.md');
  const risk = readText('docs/project-management/risk-register.md');
  const currentDevlog = readText('docs/devlog/current.md');
  const taskEntry = readText(
    'docs/devlog/entries/2026-07-10-remove-stale-governance-docs.md',
  );
  const currentTechStack = readText(
    'docs/project-governance/current/CURRENT_TECH_STACK.md',
  );
  const liveSurfaces = {
    index,
    control,
    status,
    risk,
    currentDevlog,
    currentTechStack,
  };

  assert.match(
    index,
    /^## Removed Stale Root Documents$/m,
    'INDEX missing removal heading',
  );
  assert.match(
    index,
    /removed from the current\s+tree on 2026-07-10/,
    'INDEX missing removal date',
  );
  assert.doesNotMatch(
    index,
    /^## Stale Or Historical Root Files$/m,
    'INDEX retains obsolete stale-root heading',
  );
  assert.match(
    currentTechStack,
    /Removed root governance files `03`, `04`, and `07-12` are available only\s+through Git history for audit or rollback/,
    'CURRENT_TECH_STACK removal boundary',
  );
  assert.doesNotMatch(
    currentTechStack,
    /Use old root governance files only through their status banners and\s+routing/,
    'CURRENT_TECH_STACK retains obsolete status-banner routing',
  );
  assert.match(
    control,
    /Removed root `03`, `04`, and `07-12`/,
    'PROJECT_CONTROL missing removal row',
  );
  assert.doesNotMatch(
    control,
    /Root governance files reviewed .* carry status banners/,
    'PROJECT_CONTROL retains obsolete status-banner row',
  );
  assert.match(
    status,
    /were removed from the current tree on 2026-07-10/,
    'current status missing removal date',
  );
  assert.doesNotMatch(
    status,
    /remain in place as reference\/history/,
    'current status retains obsolete preservation state',
  );
  assert.match(
    currentDevlog,
    /were removed from the current tree/,
    'current devlog missing removal state',
  );
  assert.doesNotMatch(
    currentDevlog,
    /Old root governance documents now carry status banners/,
    'current devlog retains obsolete status-banner state',
  );
  assert.match(
    currentDevlog,
    /Do not recreate removed root governance files `03`, `04`, or `07-12`;\s+use Git history only for audit or rollback/,
    'current devlog missing Git-only audit and rollback boundary',
  );
  const activeReviewState = /complete\s+final-review repair and re-review before closeout/.test(
    currentDevlog,
  );
  const closedTaskState = /^## Status\n\n`closed`$/m.test(taskEntry);
  assert.equal(
    activeReviewState || closedTaskState,
    true,
    'task missing active-review or closed state',
  );
  if (closedTaskState) {
    assert.equal(
      activeReviewState,
      false,
      'current devlog retains active final-review handoff after closeout',
    );
  }
  assert.doesNotMatch(
    currentDevlog,
    /execute\s+the audited removal plan from its focused red-state test/,
    'current devlog retains preimplementation red-state handoff',
  );
  assert.doesNotMatch(
    currentDevlog,
    /Root governance files `03`, `04`, and `07-12`\s+contain\s+old\s+planning-era\s+assumptions\s+and\s+should\s+not\s+be\s+used\s+as\s+current\s+execution\s+authority\s+without\s+revalidation/,
    'current devlog retains obsolete revalidation route',
  );

  const riskRows = risk
    .split('\n')
    .filter((line) => line.startsWith('| R-2026-07-09-01 |'));
  assert.equal(riskRows.length, 1, 'expected exactly one stale-root risk row');

  const [riskRow] = riskRows;
  assert.match(riskRow, /\| mitigated \|/, 'stale-root risk is not mitigated');
  assert.match(
    riskRow,
    /were removed from the current tree on 2026-07-10/,
    'stale-root risk lacks removal evidence',
  );

  for (const relativePath of stalePaths) {
    const basename = relativePath.split('/').at(-1);
    for (const [surfaceName, surfaceText] of Object.entries(liveSurfaces)) {
      assert.equal(
        surfaceText.includes(basename),
        false,
        `${surfaceName} routes ${basename}`,
      );
    }
  }
});
