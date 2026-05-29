# Item Category Standardized Inference Fallback Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task by task. Use TDD for every code task.

## Goal

Add a no-crawl, dry-run-first fallback that can detect and report high-confidence item category repairs such as:

```text
DrillContainmentUnit: MATERIAL -> MOUNT
```

The fallback must use only data already present in the repository. It must not run the crawler, fetch wiki pages, or write the database during implementation validation.

## Closure Definition

This plan is complete when:

- Default raw-wiki audit behavior is unchanged and still blocks when raw item pages are missing.
- Opt-in `--fallbackMode=standardized_inference` audit works without raw item pages and reports `DrillContainmentUnit -> MOUNT`.
- Opt-in sync dry-run works without raw item pages and reports high-confidence inferred changes without applying them.
- Focused tests prove raw-wiki precedence, opt-in fallback behavior, and report counter semantics.

## Source Chain

Default authoritative chain remains unchanged:

```text
data/raw/wiki/item-pages/*.latest.json
-> wiki item classifier
-> category rows
-> sync/audit report
```

No-crawl fallback chain is explicitly weaker and opt-in:

```text
data/standardized/items.standardized.json
+ data/standardized/item_pages.standardized.json metadata
+ data/config/mount-allowlist.json manual calibration input
-> standardized inference
-> audit/sync dry-run report
-> manual review
```

Conflict rule:

- Raw wiki page data always wins when it exists.
- Standardized inference is used only when the raw wiki page for that item is missing and `fallbackMode=standardized_inference` is set.
- This plan does not compare raw wiki classifications against standardized inference when both are available.

## Boundaries

In scope:

- Add reusable standardized category inference for high-confidence `MATERIAL -> MOUNT`.
- Add explicit `--fallbackMode=standardized_inference` to audit and sync.
- Keep default CLI behavior unchanged.
- Add dry-run report fields that distinguish no fallback attempt from insufficient fallback evidence.
- Document no-crawl commands and review criteria.

Out of scope:

- No crawler run.
- No wiki fetch.
- No DB apply validation in this plan.
- No production/staging database write.
- No automated rollback claim.
- No broad repairs for `FURNITURE`, `CONSUMABLE`, `PET`, `ACCESSORY`, hooks, minecarts, dyes, music boxes, or non-`MATERIAL` miscategorizations.
- No data freshness feature in this plan; freshness requires separate design and non-mutating tests.

## Apply Safety Position

`--apply=true` remains an existing operator-controlled sync mode, but this plan does not validate or recommend applying standardized inference results.

Reason: the current apply path can write `category`, `items`, and `item_category_rel`. A narrow JSON item-category backup is not a complete rollback strategy. Any future apply plan must require a full database backup/restore procedure or a tested dedicated rollback tool.

## File Map

- Create: `data/config/mount-allowlist.json`
  - Manual calibration input for mount-summoning items that do not have a stable `MountItem`/`MountSaddle` suffix.
- Create: `scripts/data/lib/item-category-inference.mjs`
  - Exports a pure inference function.
  - May also export a config loader, but the pure inference function must receive the allowlist explicitly and must not perform hidden file I/O.
- Create: `scripts/data/lib/item-category-inference.test.mjs`
  - Verifies mount inference, false positives, config validation, and boundary rules.
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`
  - Adds fallback mode, missing-raw-page bypass only for fallback mode, and dry-run report fields.
- Modify: `scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs`
  - Verifies default raw-only behavior, fallback dry-run behavior, and report counters.
- Modify: `scripts/data/audit/audit-item-category-taxonomy.mjs`
  - Adds fallback audit mode while preserving blocked default behavior.
- Modify: `scripts/data/audit/audit-item-category-taxonomy.test.mjs`
  - Verifies default block and fallback audit output.
- Modify/Create: `docs/runbooks/item-category-taxonomy-repair.md`
  - Documents no-crawl audit/dry-run commands and manual review criteria.

## Inference Contract

```js
export const STANDARDIZED_INFERENCE_MODE = 'standardized_inference';

export function inferCategoryFromStandardizedRecord({
  item,
  itemPage = null,
  mountAllowlist = new Set(),
} = {}) {
  // Returns null when evidence is insufficient, otherwise:
  return {
    categoryCode,
    reason,
    confidence,
    source: 'standardized_inference',
    evidence,
    reportOnly: false,
  };
}
```

The inference function is pure:

- It does not read files.
- It does not cache process-global config.
- It works with both camelCase standardized records and snake_case DB rows.

Required evidence for automatic changes:

```js
{
  itemPageMatch: true,
  currentCategoryCode: 'MATERIAL',
  stackSize: 1,
  damage: 0,
  defense: 0
}
```

Automatic high-confidence `MOUNT` rule:

- `currentCategoryCode === 'MATERIAL'`.
- `itemPage.entityType === 'item'`.
- `itemPage.itemInternalName` exactly equals `item.internalName`.
- `stackSize === 1`.
- `damage === 0`.
- `defense === 0`.
- And one of:
  - `internalName.endsWith('MountItem')`
  - `internalName.endsWith('MountSaddle')`
  - `mountAllowlist.has(internalName)`

The match is case-sensitive by design. If source casing differs, the result is `null` rather than a risky automatic change.

Mount-summoning items such as `FuzzyCarrot`, `CosmicCarKey`, `WitchBroom`, and `DrillContainmentUnit` are treated as `MOUNT` category items in this project because they function as mount summon items, even if wiki wording describes them as consumable summon items.

## Mount Allowlist Config

Create `data/config/mount-allowlist.json`:

```json
{
  "version": "1.0.0",
  "description": "Manual calibration input for standardized MOUNT inference. Includes mount-summoning items that function as mount items.",
  "items": [
    "SlimySaddle",
    "HardySaddle",
    "PaintedHorseSaddle",
    "MajesticHorseSaddle",
    "DarkHorseSaddle",
    "FuzzyCarrot",
    "LightningCarrot",
    "CosmicCarKey",
    "WitchBroom",
    "DrillContainmentUnit",
    "RatMountItem",
    "RollerSkatesBlueMountItem"
  ]
}
```

Config loader requirements:

- Accept an explicit `configPath` or `repoRoot`.
- Throw a descriptive error if the file is missing.
- Throw a descriptive error for invalid JSON.
- Throw a descriptive error if `items` is missing or contains non-strings.
- Return a `Set`.

## Task 1: Inference Library

**Owner writes only:**

- `data/config/mount-allowlist.json`
- `scripts/data/lib/item-category-inference.mjs`
- `scripts/data/lib/item-category-inference.test.mjs`

Steps:

- [ ] Add failing tests first.
- [ ] Test `STANDARDIZED_INFERENCE_MODE`.
- [ ] Test `DrillContainmentUnit` infers `MOUNT` from allowlist evidence.
- [ ] Test `RatMountItem` infers `MOUNT` from suffix evidence.
- [ ] Test false positives: plain `Carrot`, `IceSkates`, stackable items, damage items, defense items.
- [ ] Test non-`MATERIAL` current category returns `null`.
- [ ] Test page metadata mismatch returns `null`.
- [ ] Test config loader missing file and invalid JSON using temp fixture paths.
- [ ] Implement minimal library.
- [ ] Run:

```bash
node --test scripts/data/lib/item-category-inference.test.mjs
```

Expected: PASS.

## Task 2: Sync Fallback Dry-Run

**Owner writes only:**

- `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`
- `scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs`

Safety constraints:

- Default mode still requires raw item pages.
- Fallback mode may run when `itemPagesDir` is missing.
- Fallback mode must require standardized items and item page metadata.
- Do not add `--db=test`.
- Do not add pre-apply backup.
- Do not run `--apply=true` during implementation validation.

Report fields:

```js
fallbackMode,                    // 'none' by default
standardizedInferred,            // count of accepted fallback inferences
skippedNoWiki,                   // missing raw page and fallback disabled
skippedInsufficientEvidence,     // fallback attempted but returned null
inferenceSamples                 // high-confidence inference sample evidence
```

Counter rule:

- If fallback is disabled and raw page is missing: increment `skippedNoWiki`.
- If fallback is enabled and inference returns `null`: increment `skippedInsufficientEvidence`.
- If fallback is enabled and inference succeeds: do not increment either skip counter.

Changed/inference samples from inferred rows must include:

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
  willUpdate
}
```

Steps:

- [ ] Add failing tests for default missing raw pages behavior.
- [ ] Add failing tests for fallback dry-run `DrillContainmentUnit -> MOUNT` without raw pages.
- [ ] Add failing test for fallback insufficient evidence counter.
- [ ] Add failing test that raw wiki page takes precedence over standardized inference.
- [ ] Implement fallback mode and report fields.
- [ ] Run:

```bash
node --test scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs
```

Expected: PASS.

## Task 3: Audit Fallback

**Owner writes only:**

- `scripts/data/audit/audit-item-category-taxonomy.mjs`
- `scripts/data/audit/audit-item-category-taxonomy.test.mjs`

Behavior:

- Default audit behavior remains blocked when raw pages are missing.
- `fallbackMode=standardized_inference` bypasses the missing raw page blocker.
- Fallback audit uses standardized records plus item page metadata.
- Fallback audit reports `sourceMode: 'standardized_inference'`.
- Verified sample for `DrillContainmentUnit` includes `expectedCategoryCode: 'MOUNT'`.

Steps:

- [ ] Add failing test for default blocked behavior with `sourceMode: 'raw_wiki'`.
- [ ] Add failing test for fallback audit without raw pages.
- [ ] Add failing test for fallback insufficient evidence not being classified.
- [ ] Implement audit fallback.
- [ ] Run:

```bash
node --test scripts/data/audit/audit-item-category-taxonomy.test.mjs
```

Expected: PASS.

## Task 4: Runbook

**Owner writes only:**

- `docs/runbooks/item-category-taxonomy-repair.md`

Add or update a no-crawl fallback section:

- When to use: raw item pages unavailable, full crawl risk is unacceptable, and high-confidence dry-run evidence is needed.
- When not to use: raw pages available, broad taxonomy cleanup needed, non-`MATERIAL` categories need repair, or DB apply is being requested.
- Commands:

```bash
node scripts/data/audit/audit-item-category-taxonomy.mjs \
  --fallbackMode=standardized_inference \
  --format=json

node scripts/data/sync/sync-item-categories-from-wiki-pages.mjs \
  --fallbackMode=standardized_inference \
  --apply=false \
  --report=reports/items-standardized-inference-category-sync-$(date +%F).json
```

Manual review criteria:

- No crawler output appears.
- `sourceMode` or `fallbackMode` is `standardized_inference`.
- `DrillContainmentUnit -> MOUNT` appears in verified or changed samples.
- Inferred rows have `confidence: "high"` and evidence.
- `changedSamples` contains no `reportOnly` or low-confidence rows.
- `skippedNoWiki` and `skippedInsufficientEvidence` match the counter rule.

Apply warning:

- This runbook section must say that `--apply=true` for standardized inference is outside this plan and requires a separate operator-approved apply/rollback plan.

## Task 5: Final Validation

Run focused tests:

```bash
node --test \
  scripts/data/lib/item-category-normalization.test.mjs \
  scripts/data/lib/item-category-inference.test.mjs \
  scripts/data/sync/sync-item-categories-from-wiki-pages.test.mjs \
  scripts/data/audit/audit-item-category-taxonomy.test.mjs
```

Run default audit in the current no-raw-pages workspace:

```bash
node scripts/data/audit/audit-item-category-taxonomy.mjs --format=json
```

Expected:

- `status: "blocked"`
- blocker includes `raw_item_pages_missing`
- `sourceMode: "raw_wiki"`

Run no-crawl fallback audit:

```bash
node scripts/data/audit/audit-item-category-taxonomy.mjs \
  --fallbackMode=standardized_inference \
  --format=json
```

Expected:

- `sourceMode: "standardized_inference"`
- `distribution.MOUNT > 0`
- `verifiedSamples` includes `DrillContainmentUnit -> MOUNT`

Run sync dry-run:

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
- No database rows are written.

Check git scope:

```bash
git status --short
git log --oneline --max-count=8
```

Expected: only focused no-crawl inference changes on this branch.

## Multi-Agent Split

- Agent A: Task 1 only. Owns config and inference library files.
- Agent B: Task 2 only. Owns sync script and sync tests.
- Agent C: Task 3 only. Owns audit script and audit tests.
- Controller or Agent D: Task 4 runbook after A/B/C interfaces are stable.

No two agents may edit the same file.

## Self-Review

Spec coverage:

- The plan closes the user's current constraint: use existing data, do not crawl, do not write DB by default, and prove whether known mount rows are present but misclassified.

Risk controls:

- Raw wiki remains authoritative.
- Fallback is opt-in.
- Automatic inference is limited to high-confidence `MATERIAL -> MOUNT`.
- Apply and rollback are intentionally excluded from this implementation plan.

Known limitations:

- Non-`MATERIAL` miscategorizations are not repaired.
- Case mismatches are rejected.
- Suffix matching is intentionally exact and conservative.
- The mount allowlist is a manual calibration input; changing it changes inference behavior and must be reviewed.
- Standardized data may be stale; this plan reports evidence but does not solve data freshness.
