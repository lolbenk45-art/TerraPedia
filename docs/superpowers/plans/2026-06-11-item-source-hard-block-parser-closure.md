# Item Source Hard Block Parser Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every remaining hard-blocked item source row that has target-specific local raw evidence, and leave every still-blocked row with a concrete, auditable blocker reason.

**Architecture:** Keep the existing read-only report as the source of truth and add narrow parser lanes for hard-block classes. Parser changes live in `scripts/data/lib/wiki-page-utils.mjs` when they are general wiki table/prose helpers; page-specific routing and hard-block downgrades live in `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`.

**Tech Stack:** Node.js ESM, Node test runner, TerraPedia raw wiki item page JSON cache, JSON reports under `data/reports`.

---

## Baseline

Current report:

- `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`

Current hard blocks:

- `requires_page_specific_parser`: 158
- `requires_family_table_parser`: 124
- `missing_raw_page`: 13

Current accepted rows:

- `candidatesWithExtractedSources`: 532
- `hardBlockedRows`: 295
- `unresolvedTotal`: 0

## Closure Definition

This plan is complete when:

- `summary.totalRows = 827`.
- `summary.unresolvedTotal = 0`.
- `candidates.length + hardBlockedRows.length = 827`.
- `summary.hardBlockedRows < 295`.
- Every reduced hard-block row becomes a candidate with `extractedSources.length > 0`.
- Every candidate has target-specific raw evidence through `sourceTargetItemName`, `matchedRecipeResultName`, `sourceRowText`, or a raw sentence in `conditions`.
- Every remaining hard block has `hardBlockLane`, `blockerReason`, `pageTitle`, and a non-generic `specificBlockerReason`.
- The remaining `hardBlockedRows` are only rows where:
  - local raw page cache is missing, or
  - local raw page exists but the acquisition mechanism cannot be represented by the current source taxonomy without a contract change, or
  - local raw page has evidence only in a page structure that remains intentionally unsupported and is named in `pageResolutionSummary`.
- Final report includes `pageResolutionSummary` with per-page `convertedToCandidate`, `remainingHardBlocked`, and `reason` for the high-count pages:
  - `Tombstones`
  - `Angler/Quests`
  - `Masks`
  - `Hooks`
  - `Wings`
  - `Banners (decorative)`
  - `Butterflies`
  - `Legacy:Biome Key Molds`
  - `Sponges`
  - `Bottomless Buckets`
  - furniture families: `Doors`, `Chairs`, `Beds`, `Candles`, `Lamps`, `Chandeliers`, `Candelabras`, `Dressers`, `Sofas`, `Bathtubs`
- Final acceptance script fails if `summary.hardBlockedRows >= 295`, if `pageResolutionSummary` is absent, or if target-evidence assertions fail.
- Raw cache before/after metadata snapshots match exactly.
- Static mutation-surface scan finds no DB/crawler/fetch/import/backfill/sync/pipeline/materialize/Flyway execution surface beyond the existing read-only report writer.
- Row-level bijection assertion passes.
- Focused tests and `git diff --check` pass.

## Hard Boundaries

- Do not run crawler, fetch, import, backfill, sync, pipeline, materialize, Flyway, production refresh, or `--apply=true`.
- Do not write DB.
- Do not write raw cache files.
- Do not create SQL migration/import input/backup/apply artifacts in this task.
- Only MD, JS helper/script/test files, and `data/reports/item-source-raw-page-candidates-2026-06-11-current.json` may be written.
- Do not fabricate source rows for the 13 `missing_raw_page` rows. They can only move out of `missing_raw_page` if an existing local raw page is found by expanded local lookup and the payload identity matches the row via `itemInternalName`, `itemName`, `pageTitle`, exact row id, or exact target item row text.
- Do not map generic family prose to concrete `npc` unless the raw row names a concrete NPC. Use `npc_group`, `boss_group`, `world`, `item`, or hard-block.
- Do not resolve Jellyfish bait rows to enemy Jellyfish pages unless the raw page has bait-specific acquisition evidence.
- Do not turn flavor/trivia text, platform version labels, `Internal Item ID`, or `Item IDs` metadata into sources.

## Files

- Modify: `scripts/data/lib/wiki-page-utils.mjs`
- Modify: `scripts/data/lib/wiki-page-utils.test.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`
- Modify: `data/reports/item-source-raw-page-candidates-2026-06-11-current.json`
- Create: `docs/superpowers/plans/2026-06-11-item-source-hard-block-parser-closure.md`

## Multi-Agent Review Split

- Agent A, safety and source-chain reviewer:
  - Verify the plan remains DB/source-cache/workflow read-only.
  - Verify missing raw pages are not fabricated.
  - Verify no forbidden command appears in execution.
- Agent B, family table reviewer:
  - Review high-count family table pages.
  - Decide which can be parsed safely now and which must remain hard-blocked.
  - Verify `Item IDs` metadata and version labels cannot become candidates.
- Agent C, page-specific prose/template reviewer:
  - Review `Tombstones`, `Angler/Quests`, `Masks`, `Hooks`, `Jellyfish`, dyes, exact one-off pages.
  - Verify page-specific rules do not overclaim broad enemy/world prose.
- Agent D, final acceptance reviewer:
  - Review the regenerated report.
  - Run or inspect row-level bijection.
  - Verify hard-block count decreased and every remaining blocker has an explicit reason.

## Task 0: Preflight And Plan Review

- [ ] Run workspace checks.

```bash
git branch --show-current
git status --short
git diff --name-only
git diff --cached --name-only
find /home/lolben/data/terraPedia/raw/wiki/item-pages -type f -printf '%P\t%s\t%T@\n' | sort > /tmp/terrapedia-item-raw-before.tsv
```

Expected:

- Branch is not `main`.
- Existing dirty worktree is preserved.
- No staged files.
- Raw cache snapshot exists for final before/after proof.

- [x] Dispatch Agent A/B/C/D plan reviewers.
- [x] Patch this MD for Agent A safety/source-chain defects: raw-cache diff proof, alias identity proof, mutation-surface scan, target-backed evidence assertions.
- [x] Patch this MD for Agent B family parser defects: include `Wings`, `Banners (decorative)`, noncraft furniture, `Sponges`, `Bottomless Buckets`, `Butterflies`, and `Legacy:Biome Key Molds` as explicit parser-or-blocker groups.
- [x] Patch this MD for Agent C page-specific defects: real multiline `Angler/Quests` row shape, target-aware extraction, Golden Bug Net, Jellyfish negative, precise one-off conditions.
- [x] Patch this MD for Agent D acceptance defects: final script fails on no hard-block decrease, missing summary, missing target evidence, generic hard-block reasons, or write-safety drift.

## Task 1: Add Page Resolution Summary

**Files:**

- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`

- [ ] Write a failing test that requires `pageResolutionSummary`.

Minimum expected shape:

```js
assert.deepEqual(report.pageResolutionSummary.find((row) => row.pageTitle === 'Tombstones'), {
  pageTitle: 'Tombstones',
  convertedToCandidate: 0,
  remainingHardBlocked: 11,
  hardBlockLanes: { requires_page_specific_parser: 11 },
  reason: 'requires_page_specific_parser'
});
```

- [ ] Run focused test and confirm RED.

```bash
node --test scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs
```

- [ ] Implement `pageResolutionSummary`.

Rules:

- Group by `pageTitle`; missing raw rows group under `missing_raw_page`.
- Count candidates and hard blocks.
- Include `hardBlockLanes`, `reviewLanes`, and up to 10 sample item identities.

- [ ] Run focused test and confirm GREEN.

## Task 2: Expand Local Raw Page Lookup For Missing Cache Rows With Identity Proof

**Files:**

- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`

- [ ] Write failing tests for local alias lookup.

Cases:

- `Pink Jellyfish (bait)` must not resolve to enemy page `pinkjellyfish.latest.json` unless that page contains bait-specific acquisition evidence.
- Internal names with synthetic prefixes such as `ZH_RECIPE_...` must try display-name identity before hard-blocking.
- If neither path exists, keep `missing_raw_page`.
- If alias payload identity is ambiguous, keep `missing_raw_page` with `specificBlockerReason`.

- [ ] Run focused test and confirm RED.

- [ ] Implement lookup order:

1. normalized `internalName`
2. normalized `name`
3. normalized name with parenthetical suffix removed
4. normalized name with punctuation removed

Each non-direct lookup must pass payload identity proof before extraction.

- [ ] Run focused test and confirm GREEN.

## Task 3: Page-Specific Prose Candidates For Exact/Shared Pages

**Files:**

- Modify: `scripts/data/lib/wiki-page-utils.mjs`
- Modify: `scripts/data/lib/wiki-page-utils.test.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`

- [ ] Write failing tests for supported page-specific prose patterns.

Required supported patterns:

- `Tombstones`: raw prose says tombstones drop when a player dies. If current taxonomy cannot model player death cleanly, retain `requires_source_taxonomy_extension` with concrete reason instead of mapping to `worldgen`.
- `Masks`: boss masks are dropped by bosses; use `sourceType = 'drop'`, `sourceRefType = 'boss_group'`, only for target mask rows.
- `Hooks`: hooks/fishing hooks where raw row or sentence names the target and says dropped, found, or awarded.
- Angler reward exact pages such as `Life Preserver`, `Ship's Wheel`, `Treasure Map`, `Seaweed Planter`; use `quest_reward`, `npc`, `Angler`.
- Dyes acquired by giving Strange Plant to Dye Trader; use `quest_reward`, `npc`, `Dye Trader`, preserving gates such as post-Golem/Martian Madness in `conditions`.
- One-off exact pages with explicit phrases:
  - `Bloody Machete`: dropped by weak enemies during Halloween.
  - `Obsidian Swordfish`: obtained via fishing in lava.
  - `Zephyr Fish`: rarely caught from fishing.
  - `Fuzzy Carrot`: obtained from Angler as fishing quest reward.
  - `Golden Bug Net`: `1/80` chance from Angler fishing quest rewards.
  - `Torch God's Favor`: surviving The Torch God event after at least 95 torches have fired.
  - `Joja Cola`: fished up from fishing junk replacement text only; Stardew flavor/trivia must not add a source.
  - `Abigail's Flower`: world/grass growth source text if present.

- [ ] Run helper/audit tests and confirm RED.

- [ ] Implement narrowly scoped prose rules.

Rules:

- Preserve source sentence in `conditions` or `sourceRowText`.
- Pass target row into page-specific extraction: `extractPageSpecificSources(payload, row, npcLookup)`.
- Use `unknown` only when taxonomy lacks a better mechanism.
- Do not interpret disambiguation pages such as `Fish may refer to:` as acquisition evidence; leave them hard-blocked.
- Add negative tests for Jellyfish enemy/history prose and adjacent shared-page rows.

- [ ] Run tests and confirm GREEN.

## Task 4: Angler Quest Template Parser

**Files:**

- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`

- [ ] Write failing test for `Angler/Quests` row templates.

Fixture shape:

```wikitext
{{:Angler/Quests/row|2450
|height=Underground/Cavern
|biome=Any
}}
```

Expected:

- For target item `Batfish`, emit `quest_reward` from `Angler` or `world` condition with source row text.
- Do not emit candidates for non-target rows.

- [ ] Run focused test and confirm RED.

- [ ] Implement parser for `{{:Angler/Quests/row|...}}` templates.

Rules:

- Match target `itemId` first; the real raw template does not contain item display names.
- Preserve template row in `sourceRowText`.
- Use `sourceType = 'quest_reward'`, `sourceRefType = 'npc'`, `sourceRefName = 'Angler'`.
- Put biome/layer text into `conditions`.

- [ ] Run focused test and confirm GREEN.

## Task 5: Family Table Page-Specific Parsers Or Explicit Retain

**Files:**

- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs`
- Modify: `scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs`

- [ ] Write failing tests for family table pages that can be safely parsed or explicitly retained with concrete reasons.

Targets:

- `Wings`: parse exact target rows from list/source cells only when row taxonomy is clear; keep treasure-bag group rows if not target-safe.
- `Banners (decorative)`: parse exact `{{banner|...|id=...|tags=plunder}}` rows or section-aware found rows only.
- Furniture families: parse exact `auto=<itemId>` or exact target row source cells; map Dungeon/Ruined House to `worldgen/world`; Pirates to `drop/npc_group` only if raw row says Pirates.
- `Sponges` and `Bottomless Buckets`: Angler reward rows can become `quest_reward/npc/Angler`; fishing-only rows remain `requires_source_taxonomy_extension` unless taxonomy is extended.
- `Butterflies`: capture rows remain `requires_source_taxonomy_extension` because current source taxonomy has no capture source type.
- `Legacy:Biome Key Molds`: parse biome enemy-drop prose only if exact biome key mold can be tied to its biome; otherwise retain as named unsupported legacy-family prose.

- [ ] Run focused tests and confirm RED.

- [ ] Implement safe row matching or leave explicit hard-block.

Rules:

- Match exact result name only.
- Do not infer item source from family page title alone.
- If item remains hard-blocked, attach `blockerReason` explaining what parser is still required.
- Assert extracted family sources are never created from `Item IDs`, `Internal Item ID`, `Desktop version`, `Console version`, `Mobile version`, or version icons.

- [ ] Run focused tests and confirm GREEN.

## Task 6: Regenerate And Iterate

- [ ] Regenerate report.

```bash
node scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs \
  --closure data/reports/item-source-remaining-closure-2026-06-11-current.json \
  --raw-dir /home/lolben/data/terraPedia/raw/wiki/item-pages \
  --output data/reports/item-source-raw-page-candidates-2026-06-11-current.json
```

Expected:

- `summary.totalRows = 827`
- `summary.unresolvedTotal = 0`
- `summary.hardBlockedRows < 295`
- `pageResolutionSummary` exists.
- `summary.hardBlockedRows < 295`.
- Every remaining hard block has `specificBlockerReason`.

- [ ] If hard-block count does not decrease, inspect top pages and add a focused parser or explicit explanation before finalizing.

Inspection:

```bash
node - <<'NODE'
const fs=require('fs');
const r=JSON.parse(fs.readFileSync('data/reports/item-source-raw-page-candidates-2026-06-11-current.json','utf8'));
console.log(JSON.stringify(r.summary,null,2));
console.log((r.pageResolutionSummary ?? []).slice(0,40));
NODE
```

## Task 7: Final Acceptance Script And Validation

- [ ] Run final acceptance assertion.

```bash
node - <<'NODE'
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('data/reports/item-source-raw-page-candidates-2026-06-11-current.json', 'utf8'));
const requiredPages = ['Tombstones','Angler/Quests','Masks','Hooks','Wings','Banners (decorative)','Butterflies','Legacy:Biome Key Molds','Sponges','Bottomless Buckets','Golden Bug Net','Torch God\\'s Favor','Joja Cola','Abigail\\'s Flower'];
const failures = [];
if (report.summary.totalRows !== 827) failures.push('totalRows must be 827');
if (report.summary.unresolvedTotal !== 0) failures.push('unresolvedTotal must be 0');
if ((report.candidates.length + report.hardBlockedRows.length) !== 827) failures.push('candidate + hardBlock bijection failed');
if (report.summary.hardBlockedRows !== report.hardBlockedRows.length) failures.push('hardBlockedRows summary mismatch');
if (report.summary.hardBlockedRows >= 295) failures.push('hardBlockedRows did not decrease from 295');
if (!Array.isArray(report.pageResolutionSummary)) failures.push('missing pageResolutionSummary');
for (const pageTitle of requiredPages) {
  if (!report.pageResolutionSummary?.some((row) => row.pageTitle === pageTitle)) failures.push(`missing pageResolutionSummary for ${pageTitle}`);
}
for (const candidate of report.candidates) {
  if (!candidate.extractedSources?.length) failures.push(`candidate without sources: ${candidate.internalName}`);
  for (const source of candidate.extractedSources) {
    if (!source.sourceTargetItemName && !source.matchedRecipeResultName && !source.sourceRowText && !source.conditions) {
      failures.push(`source without raw target evidence: ${candidate.internalName}`);
    }
  }
}
for (const row of report.hardBlockedRows) {
  if (!row.hardBlockLane || !row.blockerReason || !row.pageTitle || !row.specificBlockerReason) failures.push(`hard block missing concrete reason: ${row.internalName}`);
  if (/raw page exists but no supported source pattern was extracted|without safe item-specific source extraction/.test(row.specificBlockerReason ?? '')) failures.push(`generic specificBlockerReason: ${row.internalName}`);
}
if (failures.length) {
  console.error(JSON.stringify(failures.slice(0, 50), null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ hardBlockedRows: report.summary.hardBlockedRows, converted: 295 - report.summary.hardBlockedRows }, null, 2));
NODE
```

- [ ] Run row-level bijection assertion.

```bash
node - <<'NODE'
const fs = require('fs');
const closure = JSON.parse(fs.readFileSync('data/reports/item-source-remaining-closure-2026-06-11-current.json', 'utf8'));
const report = JSON.parse(fs.readFileSync('data/reports/item-source-raw-page-candidates-2026-06-11-current.json', 'utf8'));
const closureRows = closure.rowsByLane.needs_external_source_evidence;
const key = (row) => `${row.itemId}:${row.internalName}`;
const inputKeys = new Set(closureRows.map(key));
const accepted = [...(report.candidates ?? []), ...(report.hardBlockedRows ?? [])];
const acceptedKeys = accepted.map(key);
const acceptedKeySet = new Set(acceptedKeys);
const duplicateKeys = acceptedKeys.filter((value, index) => acceptedKeys.indexOf(value) !== index);
const missingKeys = [...inputKeys].filter((value) => !acceptedKeySet.has(value));
const extraKeys = [...acceptedKeySet].filter((value) => !inputKeys.has(value));
if (closureRows.length !== 827 || accepted.length !== 827 || duplicateKeys.length || missingKeys.length || extraKeys.length || report.summary.unresolvedTotal !== 0) {
  console.error(JSON.stringify({ closureRows: closureRows.length, accepted: accepted.length, duplicateKeys, missingKeys, extraKeys, unresolvedTotal: report.summary.unresolvedTotal }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ closureRows: closureRows.length, candidates: report.candidates.length, hardBlockedRows: report.hardBlockedRows.length, unresolvedTotal: report.summary.unresolvedTotal }, null, 2));
NODE
```

- [ ] Run tests.

```bash
node --test \
  scripts/data/lib/wiki-page-utils.test.mjs \
  scripts/data/audit/audit-remaining-source-raw-page-candidates.test.mjs \
  scripts/data/audit/build-item-source-remaining-closure-report.test.mjs \
  scripts/data/audit/audit-item-source-gap-candidates.test.mjs
```

- [ ] Run diff check.

```bash
git diff --check
```

- [ ] Run changed-file scope check.

```bash
git status --short
git diff --name-only
git diff --cached --name-only
find /home/lolben/data/terraPedia/raw/wiki/item-pages -type f -printf '%P\t%s\t%T@\n' | sort > /tmp/terrapedia-item-raw-after.tsv
diff -u /tmp/terrapedia-item-raw-before.tsv /tmp/terrapedia-item-raw-after.tsv
rg -n "writeFile|appendFile|createWriteStream|exec\\(|spawn\\(|crawler|fetch|import|backfill|sync|pipeline|materialize|Flyway|flyway|apply=true|DATABASE_URL|pg\\.|mysql|sqlite" scripts/data/audit/audit-remaining-source-raw-page-candidates.mjs scripts/data/lib/wiki-page-utils.mjs
```

Expected:

- No staged files unless explicitly requested.
- No new DB, SQL migration, raw cache, import input, backup, or apply files from this task.
- Raw cache diff has no output.
- Static mutation-surface scan has no unexpected hit other than the existing report `writeJson(...outputPath...)` call path.

## Final Report

Report:

- Previous hard-block count `295`.
- New hard-block count.
- Count converted to candidates.
- Remaining hard blockers by lane and top page titles.
- Verification commands and outcomes.
- Explicit statement that no DB writes, crawler, fetch, import, backfill, sync, pipeline, materialize, Flyway, production refresh, or `--apply=true` were run.
