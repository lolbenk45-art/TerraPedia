# Item Category Standardized Inference Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a no-crawl, dry-run-first fallback that can repair high-confidence item category mistakes such as `DrillContainmentUnit -> MOUNT` using only existing standardized datasets.

**Architecture:** Raw wiki item pages remain authoritative and keep the existing default behavior. When raw pages are missing, an explicit `standardized_inference` mode uses a small shared inference library with strict allowlist/suffix rules, emits confidence/evidence, and keeps uncertain families report-only. Sync and audit both call the same library so their behavior cannot drift.

**Tech Stack:** Node.js ESM scripts, `node:test`, existing item category sync/audit scripts, no crawler execution, no automatic DB writes.

---

## Scope And Boundaries

- In scope:
  - Add reusable standardized inference library.
  - Add explicit `--fallbackMode=standardized_inference` to audit and sync.
  - Produce dry-run evidence for high-confidence category changes.
  - Keep manual apply gated behind existing `--apply=true`.
- Out of scope:
  - Do not run crawler.
  - Do not fetch raw wiki pages.
  - Do not write DB rows during implementation or plan validation.
  - Do not broadly rewrite `MATERIAL`, `FURNITURE`, `CONSUMABLE`, `PET`, or `ACCESSORY` from weak name rules.

## Source Chain

Default authoritative chain remains:

```text
raw/wiki/item-pages/*.latest.json -> wiki item classifier -> category rows -> dry-run/apply sync report
```

No-crawl fallback chain is explicitly weaker:

```text
data/standardized/items.standardized.json
+ data/standardized/item_pages.standardized.json metadata
-> standardized inference library
-> audit/sync dry-run report
-> manual apply only after report review
```

## File Map

- Create: `scripts/data/lib/item-category-inference.mjs`
  - Owns pure no-I/O standardized inference rules.
- Create: `scripts/data/lib/item-category-inference.test.mjs`
  - Verifies high-confidence and false-positive boundary rules.
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`
  - Adds explicit fallback mode and sync report fields.
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs`
  - Verifies default behavior remains raw-only and fallback mode is opt-in.
- Modify: `scripts/data/audit/audit-item-category-taxonomy.mjs`
  - Adds explicit fallback mode for no-crawl audit output.
- Modify: `scripts/data/audit/audit-item-category-taxonomy.test.mjs`
  - Verifies blocked default mode and fallback audit mode.
- Modify: `docs/runbooks/item-category-taxonomy-repair.md`
  - Documents no-crawl fallback commands and manual review gate.

## Inference Contract

Create:

```js
export const STANDARDIZED_INFERENCE_MODE = 'standardized_inference';

export function inferCategoryFromStandardizedRecord({
  item,
  itemPage = null,
} = {}) {
  return {
    categoryCode,
    reason,
    confidence,
    source: 'standardized_inference',
    evidence,
    reportOnly,
  };
}
```

Rules must return `null` when evidence is insufficient.

Required shared evidence for automatic changes:

```js
{
  itemPageMatch: true,
  currentCategoryCode: 'MATERIAL',
  stackSize: 1,
  damage: 0,
  defense: 0
}
```

Automatic high-confidence rules:

- `MOUNT`
  - `currentCategoryCode === 'MATERIAL'`
  - page metadata matches by `itemPage.itemInternalName === item.internalName`
  - stack size is `1`
  - damage and defense are `0`
  - one of:
    - `internalName` ends with `MountItem`
    - `internalName` ends with `MountSaddle`
    - `internalName` is in this allowlist:

```js
[
  'SlimySaddle',
  'HardySaddle',
  'PaintedHorseSaddle',
  'MajesticHorseSaddle',
  'DarkHorseSaddle',
  'FuzzyCarrot',
  'LightningCarrot',
  'CosmicCarKey',
  'WitchBroom',
  'DrillContainmentUnit',
  'RatMountItem',
  'RollerSkatesBlueMountItem',
]
```

Report-only rules:

- `PET` / `LIGHT_PET`
- `ACCESSORY`
- broad `MATERIAL` cleanup
- `FURNITURE` subtypes
- `CONSUMABLE` subtypes
- music boxes as subtype/tag only
- hooks, minecarts, and dyes unless the execution owner explicitly extends taxonomy and tests for those new category codes first

## Task 1: Add Pure Standardized Inference Library

**Files:**
- Create: `scripts/data/lib/item-category-inference.mjs`
- Create: `scripts/data/lib/item-category-inference.test.mjs`

- [ ] **Step 1: Write failing tests for mount inference and false positives**

Create `scripts/data/lib/item-category-inference.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inferCategoryFromStandardizedRecord,
  STANDARDIZED_INFERENCE_MODE,
} from './item-category-inference.mjs';

function item(overrides = {}) {
  return {
    internalName: 'DrillContainmentUnit',
    name: 'Drill Containment Unit',
    categoryCode: 'MATERIAL',
    stack: { stackSize: 1 },
    stats: { damage: 0, defense: 0 },
    ...overrides,
  };
}

function page(overrides = {}) {
  return {
    entityType: 'item',
    itemInternalName: 'DrillContainmentUnit',
    pageTitle: 'Drill Containment Unit',
    hasWikitext: true,
    ...overrides,
  };
}

test('STANDARDIZED_INFERENCE_MODE is explicit', () => {
  assert.equal(STANDARDIZED_INFERENCE_MODE, 'standardized_inference');
});

test('infers DrillContainmentUnit as MOUNT from strict allowlist evidence', () => {
  const actual = inferCategoryFromStandardizedRecord({
    item: item(),
    itemPage: page(),
  });

  assert.deepEqual(actual, {
    categoryCode: 'MOUNT',
    confidence: 'high',
    source: 'standardized_inference',
    reason: 'standardized_inference:mount_allowlist',
    reportOnly: false,
    evidence: {
      internalName: 'DrillContainmentUnit',
      itemPageMatch: true,
      currentCategoryCode: 'MATERIAL',
      stackSize: 1,
      damage: 0,
      defense: 0,
      rule: 'mount_allowlist',
    },
  });
});

test('infers MountItem suffix as MOUNT with strict evidence', () => {
  const actual = inferCategoryFromStandardizedRecord({
    item: item({ internalName: 'RatMountItem', name: 'Cursed Piper Flute' }),
    itemPage: page({ itemInternalName: 'RatMountItem', pageTitle: 'Cursed Piper Flute' }),
  });

  assert.equal(actual.categoryCode, 'MOUNT');
  assert.equal(actual.reason, 'standardized_inference:mount_internal_suffix');
  assert.equal(actual.confidence, 'high');
});

test('does not infer mount from plain carrot or skates names', () => {
  assert.equal(
    inferCategoryFromStandardizedRecord({
      item: item({ internalName: 'Carrot', name: 'Carrot' }),
      itemPage: page({ itemInternalName: 'Carrot', pageTitle: 'Carrot' }),
    }),
    null
  );

  assert.equal(
    inferCategoryFromStandardizedRecord({
      item: item({ internalName: 'IceSkates', name: 'Ice Skates' }),
      itemPage: page({ itemInternalName: 'IceSkates', pageTitle: 'Ice Skates' }),
    }),
    null
  );
});

test('requires matching item page metadata for automatic inference', () => {
  assert.equal(
    inferCategoryFromStandardizedRecord({
      item: item(),
      itemPage: page({ itemInternalName: 'OtherItem' }),
    }),
    null
  );
});

test('requires stack and combat stats evidence for automatic inference', () => {
  assert.equal(
    inferCategoryFromStandardizedRecord({
      item: item({ stack: { stackSize: 99 } }),
      itemPage: page(),
    }),
    null
  );

  assert.equal(
    inferCategoryFromStandardizedRecord({
      item: item({ stats: { damage: 12, defense: 0 } }),
      itemPage: page(),
    }),
    null
  );
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test scripts/data/lib/item-category-inference.test.mjs
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement minimal inference library**

Create `scripts/data/lib/item-category-inference.mjs`:

```js
export const STANDARDIZED_INFERENCE_MODE = 'standardized_inference';

const MOUNT_ALLOWLIST = new Set([
  'SlimySaddle',
  'HardySaddle',
  'PaintedHorseSaddle',
  'MajesticHorseSaddle',
  'DarkHorseSaddle',
  'FuzzyCarrot',
  'LightningCarrot',
  'CosmicCarKey',
  'WitchBroom',
  'DrillContainmentUnit',
  'RatMountItem',
  'RollerSkatesBlueMountItem',
]);

export function inferCategoryFromStandardizedRecord({ item, itemPage = null } = {}) {
  const internalName = text(item?.internalName ?? item?.internal_name);
  if (!internalName || !hasMatchingItemPage(internalName, itemPage)) return null;

  const currentCategoryCode = code(item?.categoryCode ?? item?.category_code);
  const stackSize = Number(item?.stack?.stackSize ?? item?.stack_size ?? 0);
  const damage = Number(item?.stats?.damage ?? item?.damage ?? 0);
  const defense = Number(item?.stats?.defense ?? item?.defense ?? 0);

  const baseEvidence = {
    internalName,
    itemPageMatch: true,
    currentCategoryCode,
    stackSize,
    damage,
    defense,
  };

  if (
    currentCategoryCode === 'MATERIAL'
    && stackSize === 1
    && damage === 0
    && defense === 0
  ) {
    if (MOUNT_ALLOWLIST.has(internalName)) {
      return result('MOUNT', 'mount_allowlist', baseEvidence);
    }
    if (internalName.endsWith('MountItem') || internalName.endsWith('MountSaddle')) {
      return result('MOUNT', 'mount_internal_suffix', baseEvidence);
    }
  }

  return null;
}

function result(categoryCode, rule, evidence) {
  return {
    categoryCode,
    confidence: 'high',
    source: STANDARDIZED_INFERENCE_MODE,
    reason: `standardized_inference:${rule}`,
    reportOnly: false,
    evidence: { ...evidence, rule },
  };
}

function hasMatchingItemPage(internalName, itemPage) {
  if (!itemPage || itemPage.entityType !== 'item') return false;
  return text(itemPage.itemInternalName) === internalName;
}

function text(value) {
  if (value == null) return null;
  const out = String(value).trim();
  return out ? out : null;
}

function code(value) {
  return text(value)?.toUpperCase() || null;
}
```

- [ ] **Step 4: Run inference tests**

Run:

```bash
node --test scripts/data/lib/item-category-inference.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/lib/item-category-inference.mjs scripts/data/lib/item-category-inference.test.mjs
git commit -m "feat(data): add standardized item category inference"
```

## Task 2: Add No-Crawl Fallback To Sync Dry-Run

**Files:**
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs`

- [ ] **Step 1: Write failing sync fallback tests**

Append tests to `scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs`:

```js
test('runItemCategorySync keeps missing wiki pages skipped by default', async () => {
  const categoryRows = [
    { id: 1, parent_id: 0, code: 'MATERIAL', name: '材料' },
    { id: 2, parent_id: 0, code: 'MOUNT', name: '坐骑召唤' },
  ];
  const items = [
    {
      id: 100,
      name: 'Drill Containment Unit',
      internal_name: 'DrillContainmentUnit',
      category_id: 1,
      status: 1,
      current_category_code: 'MATERIAL',
    },
  ];
  const connection = {
    query: async (sql) => {
      if (/FROM\s+category/i.test(sql)) return [categoryRows];
      if (/FROM\s+items/i.test(sql)) return [items];
      throw new Error(`unexpected query: ${sql}`);
    },
    end: async () => {},
  };

  const { report } = await runItemCategorySync(
    { apply: 'false' },
    {
      connection,
      db: { database: 'terria_v1_local' },
      repoRoot: process.cwd(),
      standardizedByInternal: new Map([
        ['DrillContainmentUnit', {
          internalName: 'DrillContainmentUnit',
          name: 'Drill Containment Unit',
          categoryCode: 'MATERIAL',
          stack: { stackSize: 1 },
          stats: { damage: 0, defense: 0 },
        }],
      ]),
      itemPagesMetadataByInternal: new Map([
        ['DrillContainmentUnit', {
          entityType: 'item',
          itemInternalName: 'DrillContainmentUnit',
          pageTitle: 'Drill Containment Unit',
          hasWikitext: true,
        }],
      ]),
      wikiPagesByInternal: new Map(),
      skipWriteReport: true,
    }
  );

  assert.equal(report.skippedNoWiki, 1);
  assert.equal(report.standardizedInferred, 0);
  assert.deepEqual(report.inferenceSamples, []);
});

test('runItemCategorySync fallbackMode standardized_inference dry-runs DrillContainmentUnit to MOUNT without raw wiki page', async () => {
  const categoryRows = [
    { id: 1, parent_id: 0, code: 'MATERIAL', name: '材料' },
    { id: 2, parent_id: 0, code: 'MOUNT', name: '坐骑召唤' },
  ];
  const items = [
    {
      id: 100,
      name: 'Drill Containment Unit',
      internal_name: 'DrillContainmentUnit',
      category_id: 1,
      status: 1,
      current_category_code: 'MATERIAL',
    },
  ];
  const connection = {
    query: async (sql) => {
      if (/FROM\s+category/i.test(sql)) return [categoryRows];
      if (/FROM\s+items/i.test(sql)) return [items];
      throw new Error(`unexpected query: ${sql}`);
    },
    end: async () => {},
  };

  const { report } = await runItemCategorySync(
    { apply: 'false', fallbackMode: 'standardized_inference' },
    {
      connection,
      db: { database: 'terria_v1_local' },
      repoRoot: process.cwd(),
      standardizedByInternal: new Map([
        ['DrillContainmentUnit', {
          internalName: 'DrillContainmentUnit',
          name: 'Drill Containment Unit',
          categoryCode: 'MATERIAL',
          stack: { stackSize: 1 },
          stats: { damage: 0, defense: 0 },
        }],
      ]),
      itemPagesMetadataByInternal: new Map([
        ['DrillContainmentUnit', {
          entityType: 'item',
          itemInternalName: 'DrillContainmentUnit',
          pageTitle: 'Drill Containment Unit',
          hasWikitext: true,
        }],
      ]),
      wikiPagesByInternal: new Map(),
      skipWriteReport: true,
    }
  );

  assert.equal(report.fallbackMode, 'standardized_inference');
  assert.equal(report.skippedNoWiki, 0);
  assert.equal(report.standardizedInferred, 1);
  assert.deepEqual(report.categoryDistribution, { MOUNT: 1 });
  assert.equal(report.changedSamples[0].internalName, 'DrillContainmentUnit');
  assert.equal(report.changedSamples[0].nextCategoryCode, 'MOUNT');
  assert.equal(report.changedSamples[0].source, 'standardized_inference');
  assert.equal(report.inferenceSamples[0].confidence, 'high');
});
```

- [ ] **Step 2: Run sync tests to verify failure**

Run:

```bash
node --test scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs
```

Expected: FAIL because fallback mode and report fields are absent.

- [ ] **Step 3: Implement sync fallback mode**

In `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`:

- Import `inferCategoryFromStandardizedRecord` and `STANDARDIZED_INFERENCE_MODE`.
- Add `fallbackMode` with default `'none'`.
- Load item page metadata from `data/standardized/item_pages.standardized.json` only when fallback is enabled and dependencies did not inject `itemPagesMetadataByInternal`.
- When `wiki` is missing:
  - if fallback mode is disabled, preserve current `skippedNoWiki += 1`.
  - if enabled, call inference using standardized record and item page metadata.
  - if inference returns null, count as `skippedNoWiki`.
  - if inference returns a category, continue through the existing category lookup/update path with `source: 'standardized_inference'`.
- Add report fields:

```js
fallbackMode,
standardizedInferred,
inferenceSamples,
```

Sample objects from inferred rows must include:

```js
{
  id,
  internalName,
  currentCategoryCode,
  nextCategoryCode,
  reason,
  source: 'standardized_inference',
  confidence: 'high',
  evidence,
  willUpdate,
}
```

- [ ] **Step 4: Run sync tests**

Run:

```bash
node --test scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/sync/sync-item-categories-from-wiki-pages.mjs scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs
git commit -m "feat(data): add standardized inference category sync mode"
```

## Task 3: Add No-Crawl Fallback To Audit

**Files:**
- Modify: `scripts/data/audit/audit-item-category-taxonomy.mjs`
- Modify: `scripts/data/audit/audit-item-category-taxonomy.test.mjs`

- [ ] **Step 1: Write failing audit fallback tests**

Append to `scripts/data/audit/audit-item-category-taxonomy.test.mjs`:

```js
test('auditItemCategoryTaxonomy keeps missing raw pages blocked by default', () => {
  const audit = auditItemCategoryTaxonomy({
    rawPagesDir: '/tmp/terrapedia-missing-item-pages-for-test',
    standardizedRecords: [
      {
        name: 'Drill Containment Unit',
        internalName: 'DrillContainmentUnit',
        categoryCode: 'MATERIAL',
        stack: { stackSize: 1 },
        stats: { damage: 0, defense: 0 },
      },
    ],
  });

  assert.equal(audit.status, 'blocked');
  assert.equal(audit.sourceMode, 'raw_wiki');
  assert.deepEqual(audit.blockers, [{ reason: 'raw_item_pages_missing' }]);
});

test('auditItemCategoryTaxonomy fallbackMode standardized_inference reports DrillContainmentUnit without raw pages', () => {
  const audit = auditItemCategoryTaxonomy({
    fallbackMode: 'standardized_inference',
    rawPagesDir: '/tmp/terrapedia-missing-item-pages-for-test',
    standardizedRecords: [
      {
        name: 'Drill Containment Unit',
        internalName: 'DrillContainmentUnit',
        categoryCode: 'MATERIAL',
        stack: { stackSize: 1 },
        stats: { damage: 0, defense: 0 },
      },
    ],
    itemPagesMetadataByInternal: new Map([
      ['DrillContainmentUnit', {
        entityType: 'item',
        itemInternalName: 'DrillContainmentUnit',
        pageTitle: 'Drill Containment Unit',
        hasWikitext: true,
      }],
    ]),
    verifiedInternalNames: ['DrillContainmentUnit'],
  });

  assert.equal(audit.status, 'warning');
  assert.equal(audit.sourceMode, 'standardized_inference');
  assert.equal(audit.summary.classified, 1);
  assert.deepEqual(audit.distribution, { MOUNT: 1 });
  assert.deepEqual(audit.verifiedSamples, [
    {
      internalName: 'DrillContainmentUnit',
      expectedCategoryCode: 'MOUNT',
      currentCategoryCode: 'MATERIAL',
      reason: 'standardized_inference:mount_allowlist',
      source: 'standardized_inference',
      confidence: 'high',
    },
  ]);
});
```

- [ ] **Step 2: Run audit tests to verify failure**

Run:

```bash
node --test scripts/data/audit/audit-item-category-taxonomy.test.mjs
```

Expected: FAIL because fallback mode is absent.

- [ ] **Step 3: Implement audit fallback mode**

In `scripts/data/audit/audit-item-category-taxonomy.mjs`:

- Import inference library.
- Add `fallbackMode = 'none'` and `itemPagesMetadataByInternal`.
- Default behavior remains blocked when raw pages are missing.
- If `fallbackMode === 'standardized_inference'`, missing raw pages do not block the audit.
- Use inference result shape to fill `distribution`, `verifiedSamples`, and `suspiciousMaterials`.
- Add top-level `sourceMode`:
  - `raw_wiki` in default mode.
  - `standardized_inference` in fallback mode.

- [ ] **Step 4: Run audit tests**

Run:

```bash
node --test scripts/data/audit/audit-item-category-taxonomy.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/data/audit/audit-item-category-taxonomy.mjs scripts/data/audit/audit-item-category-taxonomy.test.mjs
git commit -m "feat(data): audit standardized category inference"
```

## Task 4: Update Runbook And Dry-Run Commands

**Files:**
- Modify: `docs/runbooks/item-category-taxonomy-repair.md`

- [ ] **Step 1: Add no-crawl fallback section**

Add a section:

````md
## No-Crawl Fallback

Use this only when raw item pages are unavailable and full crawl risk is unacceptable.

Audit:

```bash
node scripts/data/audit/audit-item-category-taxonomy.mjs \
  --fallbackMode=standardized_inference \
  --format=json
```

Dry run:

```bash
node scripts/data/sync/sync-item-categories-from-wiki-pages.mjs \
  --fallbackMode=standardized_inference \
  --apply=false \
  --report=reports/items-standardized-inference-category-sync-$(date +%F).json
```

Review required fields before any apply:

- `sourceMode` or `fallbackMode` is `standardized_inference`.
- `standardizedInferred` is nonzero.
- `verifiedSamples` includes `DrillContainmentUnit -> MOUNT`.
- `inferenceSamples` include `confidence: "high"` and evidence.
- No low-confidence/report-only rows are included in `changedSamples`.
````

- [ ] **Step 2: Add manual apply warning**

Add:

```md
Do not run `--apply=true` for standardized inference until the dry-run report has been reviewed. This mode is weaker than raw wiki classification and should only apply high-confidence rows.
```

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/item-category-taxonomy-repair.md
git commit -m "docs(data): document no-crawl category inference workflow"
```

## Task 5: Final Validation And Plan Closeout

**Files:**
- No planned code changes.

- [ ] **Step 1: Run all focused tests**

Run:

```bash
node --test \
  scripts/data/lib/item-category-normalization.test.mjs \
  scripts/data/lib/item-category-inference.test.mjs \
  scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs \
  scripts/data/audit/audit-item-category-taxonomy.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run default audit**

Run:

```bash
node scripts/data/audit/audit-item-category-taxonomy.mjs --format=json
```

Expected in current workspace: `status: "blocked"` with `raw_item_pages_missing`.

- [ ] **Step 3: Run no-crawl fallback audit**

Run:

```bash
node scripts/data/audit/audit-item-category-taxonomy.mjs \
  --fallbackMode=standardized_inference \
  --format=json
```

Expected:

- `sourceMode: "standardized_inference"`
- `distribution.MOUNT > 0`
- `verifiedSamples` includes `DrillContainmentUnit` with `expectedCategoryCode: "MOUNT"`

- [ ] **Step 4: Run no-crawl fallback sync dry-run**

Run:

```bash
node scripts/data/sync/sync-item-categories-from-wiki-pages.mjs \
  --fallbackMode=standardized_inference \
  --apply=false \
  --report=reports/items-standardized-inference-category-sync-$(date +%F).json
```

Expected:

- No crawler runs.
- `apply` is `false`.
- `fallbackMode` is `standardized_inference`.
- `standardizedInferred > 0`.
- `changedSamples` contains high-confidence rows only.
- `inferenceSamples` include evidence and confidence.

- [ ] **Step 5: Check git scope**

Run:

```bash
git status --short
git log --oneline --max-count=8
```

Expected: only focused no-crawl inference commits on the plan branch.

## Self-Review

**Spec coverage:** The plan answers the user's current constraint: no crawler, no DB write by default, high-confidence inference only from existing data. It preserves raw wiki as the stronger path.

**Placeholder scan:** No `TBD` or unspecified implementation steps remain. Every task names files, tests, commands, and expected outcomes.

**Risk controls:** Default audit still blocks on missing raw pages; fallback is opt-in. The only automatic first rule is strict `MOUNT` inference, with report-only boundaries for weak domains.

**Residual risk:** Standardized inference cannot prove full taxonomy correctness. It is a pragmatic repair mode for high-confidence rows and must remain weaker than raw wiki classification.
