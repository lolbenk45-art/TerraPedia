# Item Source Gap Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the item source gap where wiki raw pages and extractors can prove acquisition sources, but `item_acquisition_sources`, `/api/public/items/{id}/sources`, and public item pages still show no sources, using MagicMirror as the first end-to-end sample.

**Architecture:** Evidence-first and gate-first. The default execution phases only change code, tests, contracts, and read-only audit tooling; they do not write the real database. A separately authorized data refresh phase may run after the code gates prove that MagicMirror and related high-confidence samples can flow through raw/extractor -> standardized -> maint -> relation -> local compat -> public API.

**Tech Stack:** Node data scripts under `scripts/data`, Spring Boot + MyBatis Plus backend under `back`, Nuxt public frontend under `front-nuxt`, local MySQL schemas `terria_v1_maint`, `terria_v1_relation`, and `terria_v1_local`.

---

## Planning Review Summary

Three read-only planning reviewers agreed on these constraints:

- Fix the MagicMirror chain as the sample before broadening to the 1488 raw-extracted-but-standardized-zero candidates.
- Do not treat the 1488 candidates as directly importable rows; most are family/shared-page candidates and require taxonomy gates.
- Public frontend does not need a default implementation change. It already renders `rawBundle.sources` from `/api/public/items/{id}/sources`; if API data is empty, the page correctly shows the empty state.
- `sourceType` and `sourceRefType` must be separated:
  - `sourceType` describes how the item is acquired, such as `drop`, `shop`, `container`, `crate`, `treasure_bag`, `worldgen`, or `mining`.
  - `sourceRefType` describes the referenced domain and controls resolver behavior, such as `npc`, `boss`, `item`, `container`, `crate`, `treasure_bag`, or `world`.
- Chest, Crate, Treasure Bag, Lock Box, and similar sources must not be sent through NPC resolution simply because they appear in wiki drop tables.

## Non-Negotiable Boundaries

- Do not run crawler, import, backfill, fetch, pipeline, sync, materialize, cutover, rollback, or DB refresh commands during Phases 0-7.
- Do not execute any command with `--apply=true`.
- Do not run Flyway apply.
- Do not manually execute `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, or `ALTER` against a real database.
- Do not hand-edit generated data under `data/standardized-view/item_relations/itemSources/*.json`.
- Do not run `scripts/data/import/import-standardized-to-db.mjs`, `scripts/data/import/import-item-relations.mjs`, `scripts/data/relation/materialize-relation-core-into-local.mjs`, `scripts/data/relation/sync-projection-to-local-core-tables.mjs`, or any relation/local write script in the default phases.
- Do not make frontend fallback logic invent sources when the API returns `[]`.
- If a task discovers that real DB writes are required to continue, stop, update this plan, and request explicit user approval for the data refresh phase.

## Current Evidence To Preserve

- `MagicMirror` item id: `50`.
- Current public item URL: `http://localhost:5174/items/50` when the existing local front is on port `5174`.
- Current API URL: `http://localhost:18088/api/public/items/50/sources`.
- Raw snapshot: `/home/lolben/data/terraPedia/raw/wiki/item-pages/magicmirror.latest.json`.
- Raw extractor evidence:
  - `Gold Chest`, quantity `1`, chance `1/6 (16.67%) (Underground) 2/15 (13.33%) (Cavern) 19/150 (12.67%) ("lava layer")`
  - `Mimics`, quantity `1`, chance `16.67%`
  - `Mimic`, quantity `1`, chance `16.67%`
  - `Frozen Chest`, quantity `1`, chance `1/5 (20%)`
  - `Magic Mirrors worldgen`
- Current downstream gap:
  - `data/standardized-view/item_relations/itemSources/*.json` has zero `MagicMirror` source rows.
  - `terria_v1_local.item_acquisition_sources WHERE item_id=50` is zero.
  - `terria_v1_maint.maint_item_sources` has historical `record_key=npc-item:mimic:loot:magic-mirror`, but it is `status=0`, `deleted=1`, and `item_internal_name=NULL`.

## Agent Ownership

### Agent A: Raw, Extractor, Standardized, And Read-Only Audit

**Owns:**
- `scripts/data/lib/wiki-page-utils.mjs`
- `scripts/data/lib/wiki-page-utils.test.mjs`
- `scripts/data/fetch/build-item-relations-bundle.mjs`
- `scripts/data/fetch/build-item-relations-bundle.test.mjs`
- New read-only audit script and tests:
  - `scripts/data/audit/audit-item-source-gap-candidates.mjs`
  - `scripts/data/audit/audit-item-source-gap-candidates.test.mjs`
- New contract:
  - `docs/contracts/item-acquisition-source-taxonomy-contract.md`

**Does not own:**
- Maint/relation processor changes.
- Backend Java changes.
- Frontend implementation.
- Any DB write.

### Agent B: Maint, Relation, And Local Compat Gates

**Owns:**
- `scripts/data/maint/sync-landing-to-maint.mjs`
- `scripts/data/maint/sync-landing-to-maint.test.mjs`
- `scripts/data/relation/item-source-relation-processor.mjs`
- `scripts/data/relation/item-source-relation-processor.test.mjs`
- `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- `scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs`
- `scripts/data/lib/npc-loot-source-taxonomy.mjs`
- `scripts/data/lib/npc-loot-source-taxonomy.test.mjs`

**Does not own:**
- Raw extractor code unless Agent A hands over a reviewed contract change.
- Backend Java changes.
- Frontend implementation.
- Any real sync/materialize command.

### Agent C: Backend API And Runtime Smoke

**Owns:**
- `back/src/main/java/com/terraria/skills/service/impl/ItemSourceServiceImpl.java`
- `back/src/test/java/com/terraria/skills/service/impl/ItemSourceServiceImplTest.java`
- `back/src/main/java/com/terraria/skills/controller/PublicItemRelationController.java`
- `back/src/test/java/com/terraria/skills/controller/PublicItemRelationControllerTest.java`
- Optional smoke verifier:
  - `scripts/dev/verify/verify-item-source-gap-smoke.mjs`
  - `scripts/dev/verify/verify-item-source-gap-smoke.test.mjs`

**Does not own:**
- Data scripts outside optional read-only smoke verifier.
- Frontend implementation.
- Any DB write.

### Agent D: Plan And Safety Reviewer

**Owns:**
- Read-only review of diffs, command list, and evidence.
- No write scope unless explicitly asked to patch only this plan document.

**Does not own:**
- Code changes.
- DB operations.

## Cross-Review Matrix

| Implementer | Required Reviewer | Focus |
| --- | --- | --- |
| Agent A | Agent B | Extracted source contract can be consumed by maint/relation without NPC pollution |
| Agent B | Agent A | Relation and local gates preserve raw source facts and do not discard non-NPC acquisition sources |
| Agent C | Agent B | Backend resolver behavior matches `sourceRefType` semantics |
| Agent C | Agent D | Public API smoke proves the user-visible route, not only helper behavior |
| Agent D | All | No forbidden command, DB write, or family-page broad import slips into default phases |

---

## Phase 0: Baseline And Guardrail Check

**Owner:** Agent D
**Reviewers:** Agent A, Agent B, Agent C
**Write Scope:** None.

- [ ] Record branch and worktree.

Run:

```bash
git status --short
git branch -vv
```

Expected:

- Current branch is the active item-source work branch.
- Any existing dirty files are listed before implementation begins.

- [ ] Reproduce the current MagicMirror symptom without writing data.

Run:

```bash
curl -s "http://localhost:18088/api/public/items/50/sources" | jq '{success, count: (.data | length), data}'
```

Expected current baseline before data refresh:

```json
{
  "success": true,
  "count": 0,
  "data": []
}
```

- [ ] Confirm raw evidence exists locally.

Run:

```bash
node --input-type=module -e "import fs from 'node:fs'; const p='/home/lolben/data/terraPedia/raw/wiki/item-pages/magicmirror.latest.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); console.log({itemInternalName:j.itemInternalName,itemName:j.itemName,pageTitle:j.pageTitle,htmlLength:j.html?.length,wikitextLength:j.wikitext?.length,revisionTimestamp:j.revisionTimestamp});"
```

Expected:

```text
{ itemInternalName: 'MagicMirror', itemName: 'Magic Mirror', pageTitle: 'Magic Mirrors', htmlLength: 123791, wikitextLength: 4569, revisionTimestamp: '2026-04-02T10:40:10Z' }
```

- [ ] Confirm the execution boundary.

Do not proceed if the planned command list includes any of:

```text
fetch-wiki-item-pages
run-item-page-crawl-batches
start-detached-item-page-crawl
import-standardized-to-db
import-item-relations
backfill
pipeline
sync-maint-to-relation --apply=true
materialize-relation-core-into-local
sync-projection-to-local-core-tables
--apply=true
```

---

## Phase 1: Source Taxonomy Contract

**Owner:** Agent A
**Reviewers:** Agent B, Agent C, Agent D
**Write Scope:** Documentation and pure tests.

**Files:**
- Create: `docs/contracts/item-acquisition-source-taxonomy-contract.md`

- [ ] Create the contract with these required values.

Required `sourceType` values:

```text
drop
shop
container
crate
treasure_bag
worldgen
mining
quest_reward
craft
unknown
```

Required `sourceRefType` values:

```text
npc
boss
item
container
crate
treasure_bag
world
unknown
```

Required resolver rules:

```text
npc -> NPC resolver only; may generate NPC loot/shop relations.
boss -> boss/domain resolver only; do not treat as generic NPC unless existing boss contract explicitly allows it.
item/container/crate/treasure_bag -> item metadata resolver only; never generate npcLootRelations.
world -> no strong entity id; preserve name, conditions, notes, source page, and revision.
unknown -> preserve as blocked/review candidate unless explicitly accepted.
```

- [ ] Add MagicMirror examples to the contract.

Required examples:

```text
Gold Chest -> sourceType=container, sourceRefType=container or item
Frozen Chest -> sourceType=container, sourceRefType=container or item
Wooden Crate -> sourceType=crate, sourceRefType=crate or item
Treasure Bag (Duke Fishron) -> sourceType=treasure_bag, sourceRefType=treasure_bag or item
Mimic -> sourceType=drop, sourceRefType=npc
Magic Mirrors worldgen -> sourceType=worldgen, sourceRefType=world
```

The exact `container` versus `item` resolver may be chosen by implementation, but the contract must state that these are not `npc`.

- [ ] Add forbidden mapping examples.

Forbidden:

```text
Gold Chest -> sourceRefType=npc
Frozen Chest -> sourceRefType=npc
Wooden Crate -> sourceRefType=npc
Treasure Bag -> sourceRefType=npc
Lock Box -> sourceRefType=npc
```

---

## Phase 2: Raw Extractor And Candidate Audit

**Owner:** Agent A
**Reviewers:** Agent B, Agent D
**Write Scope:** Node helper/tests and read-only audit script.

**Files:**
- Modify: `scripts/data/lib/wiki-page-utils.mjs`
- Modify: `scripts/data/lib/wiki-page-utils.test.mjs`
- Modify: `scripts/data/fetch/build-item-relations-bundle.mjs`
- Modify: `scripts/data/fetch/build-item-relations-bundle.test.mjs`
- Create: `scripts/data/audit/audit-item-source-gap-candidates.mjs`
- Create: `scripts/data/audit/audit-item-source-gap-candidates.test.mjs`

- [ ] Write failing tests for non-NPC wiki drop sources.

Add tests to `scripts/data/lib/wiki-page-utils.test.mjs` that assert:

```js
assert.deepEqual(extracted.find((row) => row.sourceRefName === 'Gold Chest')?.sourceRefType, 'container');
assert.deepEqual(extracted.find((row) => row.sourceRefName === 'Frozen Chest')?.sourceRefType, 'container');
assert.deepEqual(extracted.find((row) => row.sourceRefName === 'Wooden Crate')?.sourceRefType, 'crate');
assert.deepEqual(extracted.find((row) => row.sourceRefName === 'Treasure Bag (Duke Fishron)')?.sourceRefType, 'treasure_bag');
assert.deepEqual(extracted.find((row) => row.sourceRefName === 'Mimic')?.sourceRefType, 'npc');
```

Expected before implementation:

```text
FAIL because current drop extractor defaults unknown drop table sources to npc.
```

- [ ] Implement a pure classifier in `wiki-page-utils.mjs`.

The classifier must be deterministic and not require DB access:

```js
export function classifyDropSourceRefType(sourceName, npcMeta = null) {
  const normalized = normalizeText(sourceName).toLowerCase();
  if (npcMeta) return npcMeta.boss ? 'boss' : 'npc';
  if (/\b(crate|crates)\b/i.test(normalized)) return 'crate';
  if (/\b(treasure bag|treasure bags)\b/i.test(normalized)) return 'treasure_bag';
  if (/\b(chest|chests|lock box|lock boxes|present|presents)\b/i.test(normalized)) return 'container';
  return 'unknown';
}
```

Adjust exact matching if existing local naming requires `item` instead of the more specific values, but keep the no-NPC invariant.

- [ ] Keep MagicMirror worldgen as world source.

Add a test that `extractNarrativeSources` for the Magic Mirrors intro returns:

```js
{
  sourceType: 'worldgen',
  sourceRefType: 'world',
  sourceRefName: 'Magic Mirrors worldgen'
}
```

- [ ] Add a build bundle test for MagicMirror.

In `scripts/data/fetch/build-item-relations-bundle.test.mjs`, create a fixture with:

```text
itemInternalName=MagicMirror
pageTitle=Magic Mirrors
drop table rows for Gold Chest, Mimic, Frozen Chest
intro paragraph with Magic Mirrors can be found in Chests generated in the Underground and Cavern layers
```

Expected assertions:

```js
assert.ok(itemSources.some((row) => row.itemInternalName === 'MagicMirror'));
assert.ok(itemSources.some((row) => row.sourceRefName === 'Gold Chest' && row.sourceRefType !== 'npc'));
assert.ok(itemSources.some((row) => row.sourceRefName === 'Frozen Chest' && row.sourceRefType !== 'npc'));
assert.ok(itemSources.some((row) => row.sourceRefName === 'Mimic' && row.sourceRefType === 'npc'));
assert.ok(itemSources.some((row) => row.sourceType === 'worldgen' && row.sourceRefType === 'world'));
```

- [ ] Create the read-only gap audit script.

`scripts/data/audit/audit-item-source-gap-candidates.mjs` must:

```text
Read raw item page snapshots from /home/lolben/data/terraPedia/raw/wiki/item-pages by default.
Read current items from data/standardized/items.standardized.json.
Read current itemSources from data/standardized-view/item_relations/itemSources/*.json.
Reuse extractor helpers from scripts/data/lib/wiki-page-utils.mjs.
Print JSON summary only; do not write DB and do not write generated data unless --output is explicitly provided.
Mark each candidate as high_confidence, family_page_candidate, or polluted_candidate.
Include MagicMirror in fixtures and expected output.
```

Required CLI behavior:

```bash
node scripts/data/audit/audit-item-source-gap-candidates.mjs --sample MagicMirror
node scripts/data/audit/audit-item-source-gap-candidates.mjs --limit 20
```

The script must reject mutation flags:

```text
--apply
--apply=true
--write-db
--sync
```

---

## Phase 3: Standardized To Maint Dry-Run Contract

**Owner:** Agent B
**Reviewers:** Agent A, Agent D
**Write Scope:** Maint transformation tests and pure helper changes only.

**Files:**
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`

- [ ] Write a failing test for MagicMirror maint rows.

Fixture input:

```js
{
  itemSources: [
    { itemInternalName: 'MagicMirror', itemName: 'Magic Mirror', sourceType: 'container', sourceRefType: 'container', sourceRefName: 'Gold Chest' },
    { itemInternalName: 'MagicMirror', itemName: 'Magic Mirror', sourceType: 'drop', sourceRefType: 'npc', sourceRefName: 'Mimic' },
    { itemInternalName: 'MagicMirror', itemName: 'Magic Mirror', sourceType: 'worldgen', sourceRefType: 'world', sourceRefName: 'Magic Mirrors worldgen' }
  ]
}
```

Expected assertions:

```js
assert.equal(row.item_internal_name, 'MagicMirror');
assert.notEqual(row.item_internal_name, null);
assert.equal(row.deleted, 0);
assert.equal(row.status, 1);
assert.match(row.record_key, /magic-mirror/i);
```

- [ ] Preserve source type fields exactly.

Maint output must not rewrite:

```text
sourceRefType=container -> npc
sourceRefType=crate -> npc
sourceRefType=treasure_bag -> npc
sourceRefType=world -> npc
```

- [ ] Add a disabled-row audit expectation.

If a row similar to existing `npc-item:mimic:loot:magic-mirror` is disabled or missing `item_internal_name`, a read-only report should classify it as:

```text
disabled_or_deleted_maint_row
missing_item_internal_name
```

It must not be silently counted as an active source.

---

## Phase 4: Maint To Relation And Local Compat Gates

**Owner:** Agent B
**Reviewers:** Agent A, Agent C, Agent D
**Write Scope:** Relation processor tests/helpers and SQL generation tests only.

**Files:**
- Modify: `scripts/data/relation/item-source-relation-processor.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.test.mjs`
- Modify: `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- Modify: `scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs`
- Modify if needed: `scripts/data/lib/npc-loot-source-taxonomy.mjs`
- Modify if needed: `scripts/data/lib/npc-loot-source-taxonomy.test.mjs`

- [ ] Write relation processor failing tests.

Required assertions:

```js
assert.equal(result.npcLootRelations.some((row) => row.sourceRefName === 'Gold Chest'), false);
assert.equal(result.npcLootRelations.some((row) => row.sourceRefName === 'Frozen Chest'), false);
assert.equal(result.sourceDetails.some((row) => row.sourceRefName === 'Gold Chest'), true);
assert.equal(result.sourceDetails.some((row) => row.sourceRefName === 'Magic Mirrors worldgen'), true);
```

- [ ] Ensure only real NPC sources use NPC resolution.

Implementation rule:

```js
if (sourceRefType !== 'npc') {
  return nonNpcSourceResolution(source);
}
```

Only `sourceRefType === 'npc'` may call NPC loot taxonomy and NPC resolver logic.

- [ ] Write local compat SQL generation failing tests.

In `scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs`, assert:

```js
assert.match(insertSql, /f\.source_ref_type = 'npc'/);
assert.match(insertSql, /LEFT JOIN `terria_v1_local`\.`npcs`/);
assert.match(insertSql, /LEFT JOIN `terria_v1_local`\.`items`/);
assert.match(insertSql, /f\.source_ref_type IN \('item', 'container', 'crate', 'treasure_bag'\)/);
```

The generated SQL must:

```text
Join local.npcs only for source_ref_type='npc'.
Join local.items for item/container/crate/treasure_bag where a source item can be resolved.
Keep world/worldgen sources without forcing source_ref_id.
Keep review_status filter accepted/resolved/promoted.
Keep status/deleted filters.
```

- [ ] Preserve source facts even when NPC relation is blocked.

If `Gold Chest` is non-NPC, it must still be publishable as an acquisition source detail. It must not disappear just because `npcLootRelations` rejects it.

---

## Phase 5: Backend Service And Public API Contract

**Owner:** Agent C
**Reviewers:** Agent B, Agent D
**Write Scope:** Backend tests/service/controller only.

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/ItemSourceServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/ItemSourceServiceImplTest.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/PublicItemRelationController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/PublicItemRelationControllerTest.java`

- [ ] Write service failing tests for source metadata resolution.

Fixture rows must include:

```text
item_id=50, source_type=container, source_ref_type=container, source_ref_name=Gold Chest
item_id=50, source_type=container, source_ref_type=container, source_ref_name=Frozen Chest
item_id=50, source_type=drop, source_ref_type=npc, source_ref_name=Mimic
item_id=50, source_type=worldgen, source_ref_type=world, source_ref_name=Magic Mirrors worldgen
```

Expected assertions:

```java
assertThat(result).isNotEmpty();
assertThat(goldChest.getSourceRefType()).isEqualTo("container");
assertThat(goldChest.getNpcImageUrl()).isNull();
assertThat(mimic.getSourceRefType()).isEqualTo("npc");
assertThat(worldgen.getSourceRefType()).isEqualTo("world");
```

Use the actual DTO field names in the implementation. If the DTO currently lacks distinct image fields, assert the existing field that backs item source cards.

- [ ] Ensure NPC enrichment only runs for NPC source refs.

Implementation rule:

```java
if ("npc".equals(sourceRefType)) {
    // NPC metadata and NPC image enrichment
} else {
    // item/container/world fallback only
}
```

- [ ] Write public controller test for `/public/items/50/sources`.

Expected response:

```text
HTTP 200
success=true
data.length > 0
at least one row has sourceRefType != npc
no provenance-only raw source fields are leaked
```

- [ ] Do not use deprecated aggregate endpoint for acceptance.

Do not use `/api/public/items/{id}/aggregate` as a passing condition for this work. Public item pages use split endpoints, especially `/api/public/items/{id}/sources`.

---

## Phase 6: Frontend Smoke Only

**Owner:** Agent D or final verifier
**Reviewers:** Agent C
**Write Scope:** None unless API is non-empty but UI still renders empty.

**Files normally not changed:**
- `front-nuxt/pages/items/[id].vue`
- `front-nuxt/composables/usePublicItemDetail.ts`
- `front-nuxt/types/public-api.ts`

- [ ] Verify that frontend code still consumes API sources.

Read-only check:

```bash
rg -n "rawBundle\\.sources|/public/items/\\$\\{normalizedItemId\\}/sources|来源分组|还没有可展示" front-nuxt/pages front-nuxt/composables
```

Expected:

```text
front-nuxt/composables/usePublicItemDetail.ts calls /public/items/{id}/sources.
front-nuxt/pages/items/[id].vue renders rawBundle.sources.
```

- [ ] Add no frontend fallback during default implementation.

The UI must not infer sources from item name, wiki text, category, tooltip, or local hardcoded examples.

- [ ] Runtime smoke after the separately authorized data refresh phase.

Use the actual front port reported by local stack. The latest observed manual port was `5174`; package default is `5176`.

API smoke:

```bash
for id in 50 4819 3037 3096 2428 1360; do
  echo "== item $id =="
  curl -s "http://localhost:18088/api/public/items/$id" | jq '{success, id: .data.id, name: .data.name, internalName: .data.internalName}'
  curl -s "http://localhost:18088/api/public/items/$id/sources" | jq '{success, count: (.data | length), sample: .data[0]}'
done
```

Expected after authorized data refresh:

```text
50 MagicMirror count > 0
4819 DemonConch count > 0
3037 WeatherRadio count > 0
3096 Sextant count > 0
2428 FuzzyCarrot count > 0
1360 EyeofCthulhuTrophy count > 0, if trophy family-page rules are in scope for that authorized refresh
```

Frontend smoke:

```text
Open /items/50.
Confirm "来源分组" shows source cards.
Confirm it no longer shows "还没有可展示的掉落、购买、制作或探索来源记录。"
Open /items/4819, /items/3037, /items/3096, /items/2428.
Record /items/1360 as a family-page candidate unless trophy split rules are implemented in the same authorized phase.
```

---

## Phase 7: Read-Only Full Candidate Report

**Owner:** Agent A
**Reviewers:** Agent B, Agent D
**Write Scope:** Reports only, no DB.

- [ ] Run the new audit script without mutation flags.

Run:

```bash
node scripts/data/audit/audit-item-source-gap-candidates.mjs --limit 0
```

Expected summary keys:

```json
{
  "parsedRawItemPages": 6131,
  "rawPagesWithExtractedSources": 2614,
  "rawExtractedButStandardizedZeroCandidates": 1488,
  "candidateSourceRows": 2664
}
```

Counts may move if source snapshots or standardized files change. If counts move, the report must print the source paths and generated timestamps used for the run.

- [ ] Confirm classification buckets.

The report must include:

```text
high_confidence
family_page_candidate
polluted_candidate
blocked_non_npc_source
disabled_or_deleted_maint_row
missing_item_internal_name
```

- [ ] Confirm MagicMirror appears as high confidence.

Expected MagicMirror report fields:

```text
itemInternalName=MagicMirror
itemId=50
rawExtractedSourceCount >= 5
standardizedItemSourceCount=0 before generated repair output
contains Gold Chest
contains Frozen Chest
contains Mimic or Mimics
contains worldgen
```

---

## Phase 8: Data Refresh Authorization Gate

**Owner:** Final human-approved executor only
**Reviewers:** Agent A, Agent B, Agent C, Agent D
**Write Scope:** Not part of default execution.

This phase is intentionally blocked until the user explicitly approves data writes.

Before requesting approval, produce a dry-run summary with:

```text
Exact commands proposed.
Target schemas.
Expected changed row counts.
Backup/rollback plan.
Sample rows for MagicMirror before and after.
Smoke URLs.
Confirmation that no crawler/fetch/backfill is included unless explicitly approved.
```

Do not execute any write command until approval is received.

---

## Required Test Commands

Run narrow tests first:

```bash
node --test \
  scripts/data/lib/wiki-page-utils.test.mjs \
  scripts/data/fetch/build-item-relations-bundle.test.mjs \
  scripts/data/audit/audit-item-source-gap-candidates.test.mjs
```

Run maint/relation tests:

```bash
node --test \
  scripts/data/maint/sync-landing-to-maint.test.mjs \
  scripts/data/relation/item-source-relation-processor.test.mjs \
  scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs \
  scripts/data/lib/npc-loot-source-taxonomy.test.mjs
```

Run backend tests:

```bash
cd back
./mvnw test -Dtest=ItemSourceServiceImplTest,PublicItemRelationControllerTest
```

Run frontend type/check only if frontend files are touched or runtime smoke finds an API-nonempty/UI-empty mismatch:

```bash
cd front-nuxt
pnpm run check
```

Run repo quality gate before claiming implementation complete:

```bash
bash scripts/dev/quality-gate.sh
```

If quality gate is too broad or blocked by unrelated existing failures, record the blocker and at minimum run every focused command above.

## Completion Criteria

Default no-DB-write implementation is complete when:

- MagicMirror extractor tests pass.
- MagicMirror build bundle tests prove itemSources can be generated.
- Maint dry-run tests prove `item_internal_name=MagicMirror` is preserved.
- Relation tests prove non-NPC sources remain acquisition source facts and do not become NPC loot relations.
- Local compat SQL tests prove non-NPC sources are not filtered out by NPC join gates.
- Backend service/controller tests prove `/public/items/50/sources` can return MagicMirror sources when rows exist.
- Read-only full candidate report classifies high-confidence versus family-page candidates.
- No forbidden commands were run.

User-visible runtime completion requires the separately approved data refresh phase and then:

- `GET http://localhost:18088/api/public/items/50/sources` returns `success=true` and `data.length > 0`.
- `/items/50` shows source cards and no longer shows the empty source state.

## Plan Self-Review

- **Goal lock:** The plan closes the MagicMirror source gap first and treats the 1488 candidates as audited candidates, not directly importable data.
- **Source-chain lock:** The plan maps raw snapshot, extractor, standardized bundle, maint rows, relation facts/details, local compat table, public API, and public UI.
- **Boundary lock:** Phases 0-7 forbid DB writes, crawler/fetch/import/backfill/pipeline/sync/materialize/cutover, and `--apply=true`.
- **Evidence lock:** The plan requires failing tests before helper changes and a final API/UI smoke only after separately approved data refresh.
- **Multi-agent safety:** Agents have disjoint write scopes. Data refresh is single-owner and manually approved only.
- **Residual risk:** Counts may change if raw or standardized snapshots change. Family-page candidates such as Trophies, Wings, Minecarts, Bait, Torches, Paintings, Statues, and Music Boxes must not be treated as bulk-safe until their split rules are implemented and reviewed.
