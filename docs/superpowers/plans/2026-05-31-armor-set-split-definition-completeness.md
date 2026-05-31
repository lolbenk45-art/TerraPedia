# Armor Set Split Definition Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix armor-set relation/projection generation so wiki armor pages use complete split maint definitions, exclude nearby non-page armor items, and keep equivalent interchangeable pieces as slot alternatives instead of noisy or incomplete builds.

**Architecture:** Repair the data chain at the relation generator, then prove the projection/API/frontend contracts preserve the corrected shape. Add a read-only full-scan audit so future split-definition and prefix-mixing failures are found beyond Hallowed armor.

**Tech Stack:** Node.js data scripts and `node --test`, MySQL local read-only/dry-run checks, Java Spring public API tests, Nuxt frontend contract scripts.

---

## Current Evidence

Read-only evidence established on 2026-05-31:

- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/main-merge-crafting-graph`
- Branch: `fix/armor-set-detail-dedup-values-2026-05-31`
- Current dirty files before this plan: `front-nuxt/pages/armor-sets/[id].vue`, `front-nuxt/scripts/check-armor-stat-visuals.mjs`, and untracked relation reports. Do not revert them.
- Wiki API evidence:
  - `Hallowed armor` revision `996025`, timestamp `2026-05-02T09:41:58Z`.
  - `Ancient Hallowed armor` revision `997610`, timestamp `2026-05-26T13:15:23Z`.
  - Both pages state normal and ancient pieces can mix, and the page text includes four head variants: mask, helmet, headgear, hood.
- Current generated wiki data already has Hood effect lines for both pages.
- Current projection DB is wrong:
  - Hallowed `2879750981`: `set_count=3`, `related_items_json=18`, missing Hallowed Hood and Ancient Hallowed Hood.
  - Ancient Hallowed `3551390261`: `set_count=5`, `related_items_json=29`, includes Hoods but wrongly includes `HallowedCrown`.
- Maint definitions are split:
  - `ArmorSetBonus.Hallowed` has non-summoner Hallowed variants.
  - `ArmorSetBonus.HallowedSummoner` has Hallowed Hood variants.
  - Wiki page rows for `神圣盔甲` and `远古神圣盔甲` are placeholders, so the relation processor must bundle sibling maint definitions generically.

Agent audits also found non-Hallowed suspects:

- `Shadow armor` projection is using wood-family rows.
- `Gold armor` includes Silver/Lead/Tungsten body/head/legs though wiki evidence only supports Gold and Ancient Gold helmet interchangeability.
- `Iron armor` includes Copper/Tin body/head/legs though wiki evidence only supports Iron and Ancient Iron helmet interchangeability.
- `Mining armor` includes Prospector pieces not present in generated wiki page text.
- Split placeholder families include Cobalt, Mythril, Adamantite, and Chlorophyte; these need an audit/report path, not one-off logic.

## Source Chain

```text
Wiki API / data/generated/wiki-armor-sets.latest.json
  -> data/generated/armor-set-definition-map.json
  -> terria_v1_maint.maint_armor_sets and maint_items
  -> scripts/data/relation/armor-set-processor.mjs
  -> terria_v1_relation.relation_armor_sets / relation_armor_set_items
  -> scripts/data/relation/projection-sync.mjs
  -> terria_v1_relation.projection_armor_sets
  -> back public armor-set API
  -> front-nuxt armor-set detail page
```

## Scope

In scope:

- Generic relation fix for split maint definitions.
- Generic exclusion of nearby slotted items not supported by selected page definitions.
- Tests for Hallowed, Ancient Hallowed, Shadow/Gold/Iron/Mining-style prefix risks, and existing protection samples.
- Projection/API/frontend contract tests for same-slot alternatives.
- Read-only completeness audit script and report.
- Dry-run relation/projection sync and local DB apply only after tests pass.

Out of scope:

- Crawler/import refresh.
- Production DB writes.
- Frontend-only filtering as the main fix.
- Hallowed-only hardcoding.
- Reverting existing frontend layout edits.
- `git add .`.

## Target Files

- Modify: `scripts/data/relation/armor-set-processor.mjs`
- Modify: `scripts/data/relation/armor-set-processor.test.mjs`
- Modify: `scripts/data/relation/projection-sync.test.mjs`
- Modify: `front-nuxt/scripts/check-armor-build-projection-groups.mjs`
- Optional modify: `back/src/test/java/com/terraria/skills/service/impl/PublicArmorSetServiceImplTest.java`
- Create: `scripts/data/audit/audit-armor-set-completeness.mjs`
- Create: `scripts/data/audit/audit-armor-set-completeness.test.mjs`
- Output report after implementation: `reports/domain/armor_sets/completeness-2026-05-31.json`

## Multi-Agent Split

- Agent A owns relation processor behavior: `scripts/data/relation/armor-set-processor.mjs` and `scripts/data/relation/armor-set-processor.test.mjs`.
- Agent B owns projection/API/frontend contracts: `scripts/data/relation/projection-sync.test.mjs`, `front-nuxt/scripts/check-armor-build-projection-groups.mjs`, and optional backend service test only.
- Agent C owns read-only completeness audit: `scripts/data/audit/audit-armor-set-completeness.mjs` and `.test.mjs`.
- Agent D reviews the plan and final patch. Reviewers must be read-only.

No two agents may edit the same file. DB writes are not delegated.

## Task 1: Relation Red Tests For Split Definitions

**Files:**

- Modify: `scripts/data/relation/armor-set-processor.test.mjs`

- [ ] **Step 1: Add Hallowed summoner fixtures**

Add `HallowedHood`, `AncientHallowedHood`, and `HallowedCrown` to the existing Hallowed test fixture:

```js
item(4873, 'HallowedHood', 'Hallowed Hood', { headSlot: 254 }),
item(4899, 'AncientHallowedHood', 'Ancient Hallowed Hood', { headSlot: 258 }),
item(5660, 'HallowedCrown', 'Hallowed Crown', { headSlot: 289 })
```

Add a `hallowedSummonerMaintSet()` fixture with sets containing hood/head alternatives and the shared Hallowed/Ancient body and legs:

```js
function hallowedSummonerMaintSet() {
  return {
    id: 45,
    record_key: 'hallowed-summoner-maint-key',
    text_key: 'ArmorSetBonus.HallowedSummoner',
    benefit_expression: 'ArmorSetBonuses.Benefits.HallowedSummoner',
    primary_part: 'Head',
    set_count: 8,
    unique_item_count: 6,
    sets_json: JSON.stringify([
      [4873, 551, 552], [4873, 551, 4901], [4873, 4900, 552], [4873, 4900, 4901],
      [4899, 551, 552], [4899, 551, 4901], [4899, 4900, 552], [4899, 4900, 4901]
    ]),
    unique_item_ids_json: JSON.stringify([4873, 4899, 551, 552, 4900, 4901]),
    raw_json: '{}',
    ...baseTrace
  };
}
```

- [ ] **Step 2: Add failing Hallowed completeness test**

Create a test whose wiki record has four Hallowed head labels in `effectText`, map placeholders for the page rows, and maint definitions for both `ArmorSetBonus.Hallowed` and `ArmorSetBonus.HallowedSummoner`.

Expected assertions:

```js
assert.equal(actual.relationArmorSets[0].setCount, 4);
assert.deepEqual(JSON.parse(actual.relationArmorSets[0].setsJson), [
  [4873, 4899, 551, 4900, 552, 4901],
  [558, 4898, 551, 4900, 552, 4901],
  [553, 4897, 551, 4900, 552, 4901],
  [559, 4896, 551, 4900, 552, 4901]
]);
assert.equal(actual.relationArmorSetItems.length, 24);
assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 4873));
assert.ok(actual.relationArmorSetItems.some((row) => row.itemSourceId === 4899));
assert.ok(!actual.relationArmorSetItems.some((row) => row.itemSourceId === 5660));
```

- [ ] **Step 3: Add reverse Ancient Hallowed completeness test**

Use page title `Ancient Hallowed armor`, `interchangeableSetTitles: ['Hallowed armor']`, and four Ancient Hallowed head labels. Assert the same four builds, the same 24 related rows, Hood pair included, and `HallowedCrown` excluded.

- [ ] **Step 4: Preserve protection tests**

Keep or add assertions that:

- Mining is not collapsed unless the data model proves alternatives.
- Rich Mahogany / Wood family mapped definitions are not collapsed to one build.
- Snow/Jungle/Ancient Shadow interchangeable families still collapse only when evidence says every slot is interchangeable.

- [ ] **Step 5: Run red test**

Run:

```bash
node --test scripts/data/relation/armor-set-processor.test.mjs
```

Expected before implementation: the new Hallowed/Ancient Hallowed tests fail because Hood definitions are not bundled and/or `HallowedCrown` survives broad prefix matching.

## Task 2: Relation Processor Bundle Implementation

**Files:**

- Modify: `scripts/data/relation/armor-set-processor.mjs`

- [ ] **Step 1: Preserve multiple definitions per lookup key**

Change `buildArmorDefinitionLookup()` so `byBaseTitle`, `byBenefitName`, and `byTextKey` store arrays of definitions. A definition object must include:

```js
{
  textKey,
  sets,
  uniqueItemIds,
  titleKey,
  benefitKey
}
```

- [ ] **Step 2: Add page definition bundle resolver**

Add `findArmorDefinitionBundleForWikiRecord(record, definitionLookup, definitionMapLookup, setItems, itemBySourceId)` that:

- Seeds definitions from direct definition-map matches, title matches, and benefit matches.
- Expands to sibling definitions when they share strong page evidence:
  - same normalized family token, or
  - share at least two body/legs ids with a seed definition, or
  - share a primary head family and all non-head pieces are inside the page/interchangeable family.
- Filters candidate definitions to items inside the page family and `interchangeableSetTitles` family.
- Returns `{ sets, uniqueItemIds, definitions }`, or `null` when no trustworthy definition exists.

- [ ] **Step 3: Constrain set items when a bundle exists**

In `buildWikiArmorSetRelations()`, replace `mappedDefinition` with `mappedDefinitionBundle`. When a bundle exists:

- Build `effectiveSetItems` only from bundled `uniqueItemIds`.
- Do not use prefix fallback rows outside the bundle.
- Use bundled `sets` for `variants`.

This excludes `HallowedCrown` because it is not in `ArmorSetBonus.Hallowed` or `ArmorSetBonus.HallowedSummoner`.

- [ ] **Step 4: Preserve fallback behavior**

When no bundle exists, keep the existing `findWikiArmorItems()` plus cartesian fallback, but emit enough `issues` metadata for the audit script to flag suspicious broad-prefix data later.

- [ ] **Step 5: Run green test**

Run:

```bash
node --test scripts/data/relation/armor-set-processor.test.mjs
```

Expected: all relation tests pass; Hallowed and Ancient Hallowed each produce 4 builds and 24 related rows.

## Task 3: Projection And Frontend Contract Tests

**Files:**

- Modify: `scripts/data/relation/projection-sync.test.mjs`
- Modify: `front-nuxt/scripts/check-armor-build-projection-groups.mjs`
- Optional modify: `back/src/test/java/com/terraria/skills/service/impl/PublicArmorSetServiceImplTest.java`

- [ ] **Step 1: Add projection payload test for same-slot alternatives**

Add a Hallowed-shaped relation fixture where each variant has two rows per `partIndex`. Assert:

```js
assert.equal(actual.projectionArmorSets.length, 1);
assert.deepEqual(JSON.parse(row.setsJson), [
  [4873, 4899, 551, 4900, 552, 4901],
  [558, 4898, 551, 4900, 552, 4901],
  [553, 4897, 551, 4900, 552, 4901],
  [559, 4896, 551, 4900, 552, 4901]
]);
assert.equal(JSON.parse(row.relatedItemsJson).length, 24);
assert.deepEqual(validateProjectionArmorSetConsistency([row]), []);
```

- [ ] **Step 2: Add validator acceptance test**

Add a direct `validateProjectionArmorSetConsistency()` test proving repeated same-slot alternatives are valid when every related item is present in `setsJson`, `uniqueItemIdsJson`, and `currentItemIdsJson`.

- [ ] **Step 3: Add frontend API-shaped grouping fixture**

Update `check-armor-build-projection-groups.mjs` so Hallowed uses four builds and eight head alternatives total. Assert:

```js
assert.equal(hallowedGroups.length, 4);
assert.deepEqual(hallowedGroups.map((group) => group.partGroups[0].alternatives.length), [2, 2, 2, 2]);
assert.equal(hallowedGroups.flatMap((group) => group.partGroups[0].alternatives).length, 8);
```

- [ ] **Step 4: Run contract tests**

Run:

```bash
node --test scripts/data/relation/projection-sync.test.mjs
node front-nuxt/scripts/check-armor-build-projection-groups.mjs
```

If backend DTO behavior changes, also run:

```bash
cd back && mvn -Dtest=PublicArmorSetServiceImplTest test
```

## Task 4: Full Completeness Audit

**Files:**

- Create: `scripts/data/audit/audit-armor-set-completeness.mjs`
- Create: `scripts/data/audit/audit-armor-set-completeness.test.mjs`

- [ ] **Step 1: Implement read-only audit helpers**

The script must read local JSON inputs by default:

- `data/generated/wiki-armor-sets.latest.json`
- `data/standardized/armor_sets.standardized.json`
- `data/generated/armor-set-definition-map.json`
- `data/standardized/items.standardized.json`
- `data/standardized/item_pages.standardized.json`

It must not write DB rows. Optional DB mode may only run read-only `SELECT` queries when explicitly passed `--with-db`.

- [ ] **Step 2: Emit issue codes**

Report these issue codes:

- `split_definition_not_mapped`
- `page_variant_label_missing_from_definition`
- `definition_variant_missing_from_page_labels`
- `unexpected_nearby_armor_item`
- `interchangeable_family_not_collapsed`

- [ ] **Step 3: Add tests for known failures**

Create fixtures that prove the audit flags:

- Hallowed placeholder page missing `ArmorSetBonus.HallowedSummoner`.
- `HallowedCrown` as unexpected nearby armor item.
- Cobalt/Mythril/Adamantite split placeholder family as `split_definition_not_mapped`.

- [ ] **Step 4: Run audit tests and local report**

Run:

```bash
node --test scripts/data/audit/audit-armor-set-completeness.test.mjs
node scripts/data/audit/audit-armor-set-completeness.mjs --date 2026-05-31
```

Expected report path:

```text
reports/domain/armor_sets/completeness-2026-05-31.json
```

## Task 5: Dry-Run, Local Apply Gate, And Runtime Verification

**Files:**

- No code files unless dry-run exposes a contract gap.

- [ ] **Step 1: Run focused tests**

```bash
node --test scripts/data/relation/armor-set-processor.test.mjs
node --test scripts/data/relation/projection-sync.test.mjs
node --test scripts/data/audit/audit-armor-set-completeness.test.mjs
node front-nuxt/scripts/check-armor-build-projection-groups.mjs
pnpm --dir front-nuxt run check
```

- [ ] **Step 2: Run relation sync dry-run**

Locate the current relation sync entrypoint and run dry-run only. The dry-run must target local `127.0.0.1:13306` and must not write until the output is inspected.

Expected checks:

- Hallowed and Ancient Hallowed would become 4 builds and 24 related rows each.
- Hallowed Hood and Ancient Hallowed Hood appear.
- `HallowedCrown` does not appear.
- Shadow/Gold/Iron/Mining suspects are either fixed by generic logic or explicitly reported by completeness audit.

- [ ] **Step 3: Apply only to local DB**

After tests and dry-run pass, apply relation/projection sync only against:

```text
host=127.0.0.1
port=13306
schema terria_v1_relation
```

Do not write production or remote DBs.

- [ ] **Step 4: Verify local DB and public API**

Run read-only DB checks:

```bash
mysql -h127.0.0.1 -P13306 -uroot -proot -N -e "SELECT id,text_key,name_zh,set_count,JSON_LENGTH(related_items_json),JSON_LENGTH(sets_json) FROM terria_v1_relation.projection_armor_sets WHERE id IN (2879750981,3551390261,416147549,1088810409);"
```

Verify public endpoints:

```text
/api/public/armor-sets/2879750981
/api/public/armor-sets/3551390261
/api/public/armor-sets/416147549
/api/public/armor-sets/1088810409
```

## Task 6: Review And Commit

**Files:**

- Stage only files changed for this repair. Do not stage unrelated screenshots, generated old reports, or existing unrelated frontend edits unless they are intentionally part of this task.

- [ ] **Step 1: Run final status checks**

```bash
git status --short
git diff --cached --stat
```

- [ ] **Step 2: Run final reviewer**

Use a read-only review agent to inspect:

- relation algorithm over-merge risk
- projection contract completeness
- audit script false positives
- staged scope

- [ ] **Step 3: Commit**

Only after validation passes:

```bash
git add scripts/data/relation/armor-set-processor.mjs scripts/data/relation/armor-set-processor.test.mjs scripts/data/relation/projection-sync.test.mjs front-nuxt/scripts/check-armor-build-projection-groups.mjs scripts/data/audit/audit-armor-set-completeness.mjs scripts/data/audit/audit-armor-set-completeness.test.mjs docs/superpowers/plans/2026-05-31-armor-set-split-definition-completeness.md
git commit -m "fix: complete armor set split definitions"
```

If existing frontend layout files remain dirty but unrelated to this repair, leave them unstaged and report them.

## Plan Audit

**Verdict:** Execution-ready after plan review.

**Closure definition:**

- Hallowed and Ancient Hallowed each expose 4 meaningful build variants and 24 related rows in relation/projection/API data.
- Hallowed Hood and Ancient Hallowed Hood are included.
- `HallowedCrown` is excluded from Hallowed/Ancient Hallowed pages.
- Non-Hallowed suspect families are either corrected by generic logic or reported by the completeness audit with actionable issue codes.
- Projection and frontend grouping preserve same-slot alternatives.

**Residual risk:**

- Some canonical maint split definitions may be incomplete or intentionally separate. The audit script must report those rather than silently merging everything.
- Broad prefix fallback remains for pages without maint definitions; the audit report is the guardrail for those cases.
