# Item Source Final Closure Status Under Non-Apply Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and validate a concrete closure status for every remaining item source work item under the current non-apply boundary, moving rows to active-source-ready, dedicated projection, explicit exemption, or missing raw-evidence lanes without guessing data.

**Architecture:** Treat current reports as the source-of-truth queue. First apply only already dry-run-valid local compat source rows after explicit user approval, then shrink family and blocked-source queues with tested parser/policy rules, then close NPC/biome evidence through API/UI projection instead of fake generic source rows. Terminal/internal rows remain explicit exemptions, and missing raw rows require a separate raw evidence acquisition lane.

**Tech Stack:** Node.js ESM audit/relation scripts, MySQL local DB `terria_v1_local`, Java Spring public API, Nuxt public item detail UI, generated reports under `data/reports`.

---

## Current State

Source reports:

- `data/reports/item-source-remaining-treatment-report-2026-06-12.json`
- `data/reports/item-source-remaining-work-items-report-2026-06-12.json`
- `data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json`
- `data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json`
- `data/reports/item-source-final-closure-status-2026-06-12.json`
- `data/reports/item-source-final-closure-status-summary-zh-2026-06-12.md`

### 2026-06-12 Latest Execution Snapshot

This section supersedes older counts below when they differ.

Latest refreshed reports after the raw-family-mechanism, remaining-family, Twins, and banner-alias applies show:

| Lane | Count | Current state |
| --- | ---: | --- |
| Active source present | 786 rows | Already has active `item_acquisition_sources` coverage. |
| Recipe/shimmer dedicated structure | 2600 rows | Covered by dedicated recipe/shimmer evidence; do not duplicate as generic sources. |
| Raw candidate not projected | 27 candidates / 31 source rows | Only 3 candidates dry-run selected, all 6 rows are duplicates; no new insertable ordinary source rows remain. |
| Dry-run ready local source rows | 0 rows / 3 duplicate candidates | `validationErrors=0`, `duplicates=6`, `toInsert=0`; no DB write needed for this batch. |
| Family/parser pending | 285 rows | Main remaining actionable queue; must use page-specific parser/policy or dedicated projection, not global allowlists. |
| Blocked source remaining | 0 candidates / 0 rows | Cleared from ordinary blocked-source lane. |
| Explicit source exemptions | 17 candidates / 18 rows | Unobtainable/unimplemented source rows; keep as non-importable evidence, do not insert ordinary sources. |
| NPC/biome projection | 17 rows | `17/17` closed by public source projection contract with local evidence. |
| Terminal/identity exemptions | 19 rows | Explicit non-import lane. |
| Missing raw evidence | 3 rows | Pink/Green/Blue Jellyfish bait recipe placeholders; cannot be guessed. |

Latest command facts:

- Applied with controlled local-only script:
  - Output: `data/reports/item-source-candidate-local-compat-apply-raw-family-mechanism-2026-06-12.json`
  - Target: `127.0.0.1:13306/terria_v1_local`
  - `selectedCandidates=19`, `plannedRows=22`, `validationErrors=0`, `duplicates=6`, `toInsert=16`, `inserted=16`.
  - Backup: `data/backups/item-source-candidate-local-compat/item-source-local-2026-06-12T15-13-57-857Z.before.json`.
- Applied with controlled local-only script:
  - Output: `data/reports/item-source-candidate-local-compat-apply-remaining-raw-family-2026-06-12.json`
  - `selectedCandidates=9`, `plannedRows=12`, `validationErrors=0`, `duplicates=6`, `toInsert=6`, `inserted=6`.
  - Covered: `GoldenSink`, 5 Chippy/Skeletron Red Hat variant rows.
- Applied with controlled local-only script:
  - Output: `data/reports/item-source-candidate-local-compat-apply-twins-family-2026-06-12.json`
  - `selectedCandidates=6`, `plannedRows=9`, `validationErrors=0`, `duplicates=6`, `toInsert=3`, `inserted=3`.
  - Covered: `TwinMask`, `TwinsBossBag`, `TwinsMasterTrophy` through `drop/boss_group The Twins` text contract.
- Applied with controlled local-only script:
  - Output: `data/reports/item-source-candidate-local-compat-apply-banner-aliases-2026-06-12.json`
  - `selectedCandidates=10`, `plannedRows=13`, `validationErrors=0`, `duplicates=6`, `toInsert=7`, `inserted=7`.
  - Covered: 6 Martian banner NPC aliases and `PresentMimicBanner`.
- `data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json`: `totalCandidates=27`, `eligibleCandidates=3`, `blockedCandidates=7`, `explicitSourceExemptionCandidates=17`, `plannedSourceRows=6`, `blockedSourceRows=13`, `explicitSourceExemptionRows=18`.
- `data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json`: `selectedCandidates=3`, `plannedRows=6`, `validationErrors=0`, `duplicates=6`, `toInsert=0`.
- `data/reports/item-source-final-closure-status-2026-06-12.json`: `familyPolicyRowsAwaitingParser=285`, `blockedSourceRowsRemaining=0`, `explicitSourceExemptionRows=18`, `projectionRowsClosedByPublicContract=17`, `missingRawRows=3`.

Next execution focus:

1. Keep the duplicate dry-run rows closed as no-op.
2. Add tested high-confidence parser rules only where source refs can resolve to existing item/NPC/text group contracts.
3. Promote the next safe raw-family block only when it has a precise contract:
   - `GoldenSink`: normalize `drop/npc Pirate Invasion` to `drop/npc Pirates`, mirroring Golden Toilet.
   - `TwinMask`, `TwinsBossBag`, `TwinsMasterTrophy`: represent The Twins as `boss_group` text contract because there is no aggregate NPC row; do not invent a boss id.
   - `Chippy's set` and `Chippy's Cloak (Inactive)`: keep `drop/boss_group Skeletron's Red Hat variant` text contract.
   - Enemy banners with unresolved NPC aliases or mixed `unobtainable` source rows stay pending until an explicit alias/exemption split is tested. Current remaining blocked banners are `BlueCultistArcherBanner`, `BlueCultistFighterBanner`, `WhiteCultistArcherBanner`, `WhiteCultistCasterBanner`, `WhiteCultistFighterBanner`, `SeveredHandBanner`, `PoisonousSporeBanner`.

Current counts:

| Lane | Count | Current state |
| --- | ---: | --- |
| Dry-run ready local source rows | 260 rows / 199 candidates | `--apply=false` passed; needs explicit user approval before DB write |
| Family policy blocked candidates | 603 candidates | Needs page-specific/family policy parser |
| Closure family pending rows | 278 rows | Needs family policy/parser or dedicated projection |
| Family parser/policy total | 881 rows | Must stay queued until item-specific parser/policy is added |
| Blocked source rows | 8 candidates / 10 source rows | 5 explicit exemption candidates, 3 dedicated projection candidates |
| NPC/biome projection rows | 17 rows | Closed by public source projection contract; verified with local read-only evidence |
| Terminal/identity exemptions | 19 rows | Should remain non-importable explicit exemptions |
| Missing raw evidence | 3 rows | Needs raw evidence acquisition; cannot guess source |

Latest final closure summary:

- DB writes performed: no.
- Crawler/fetch/import/backfill performed: no.
- Dry-run validation errors: `0`; duplicates: `0`.
- NPC/biome projection evidence: `17/17` rows have local DB evidence and are projected through public item sources.
- Ordinary source DB application is not complete because `--apply=true` has not been explicitly approved.

Important distinction:

- `items` row exists: item entity exists.
- Dedicated evidence exists: recipe/shimmer/NPC/biome/raw candidate evidence exists somewhere.
- Active source closed: active row exists in `item_acquisition_sources` or public contract explicitly projects a dedicated source.

## Hard Boundaries

- Do not write DB unless the user explicitly approves `--apply=true` for Task 1.
- Do not run crawler/fetch/import/backfill/sync/pipeline/materialize/Flyway without a separate explicit approval.
- Do not hand-write SQL data changes.
- Do not batch-update category or source fields manually.
- Do not turn recipe/shimmer/biome/NPC dedicated evidence into fake generic source rows.
- Do not import terminal/internal or missing raw evidence rows.
- Preserve existing dirty tracked file `data/reports/item-source-remaining-closure-2026-06-11-current.json`; do not revert or rewrite it unless explicitly requested.

## Multi-Agent Review Status

New subagents could not be spawned in this session because the environment returned `agent thread limit reached`. Existing prior agent reviews were reused:

- DB/evidence review: confirmed evidence-layer approach and fixed relation fact join risks.
- Test/safety review: required complete mutation guard and terminal/missing raw precedence.
- Chinese report review: required three-layer explanation and concrete samples.
- API/UI review: confirmed public item detail has generic `/sources` and recipe tree, but lacks dedicated recipe/shimmer/NPC/biome evidence fields.

When agent capacity is available, split execution as:

- Agent A: family policy/parser, files under `scripts/data/audit/*family*` and related tests.
- Agent B: blocked source resolver/normalizer, files under `scripts/data/audit/build-item-source-candidate-import-plan.mjs` and tests.
- Agent C: backend/API/UI projection, files under `back/src/main/java/...PublicItem*`, `front-nuxt/pages/items/[id].vue`, public API types/tests.
- Agent D: apply safety/reports, files under `scripts/data/relation/apply-item-source-candidate-local-compat.mjs`, generated reports, rollback validation.

Parallel rule: no two agents write the same file, same DB table, same report path, or same UI section.

---

## Task 1: Apply Dry-Run Ready Local Sources

**Purpose:** Insert the 260 already validated source rows into `terria_v1_local.item_acquisition_sources` after explicit user approval.

**Current status:** Not executed. The latest safe dry-run is ready, but this task is intentionally blocked on explicit user approval for `--apply=true`.

**Files:**

- Input: `data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json`
- Dry-run report: `data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json`
- Script: `scripts/data/relation/apply-item-source-candidate-local-compat.mjs`
- Backup output: `data/backups/item-source-candidate-local-compat/*.before.json`
- After report: `data/reports/item-source-candidate-local-compat-apply-2026-06-12.json`

**Pre-approval checks:**

- [ ] Confirm user explicitly approved DB write with `--apply=true`.
- [ ] Confirm target DB is `terria_v1_local`.
- [ ] Confirm latest dry-run summary is:
  - `selectedCandidates = 199`
  - `plannedRows = 260`
  - `toInsert = 260`
  - `validationErrors = 0`
  - `duplicates = 0`
  - `inserted = 0`
- [ ] Confirm backup directory is writable.
- [ ] Confirm no other task is writing `item_acquisition_sources`.

**Execution command after explicit approval only:**

```bash
node scripts/data/relation/apply-item-source-candidate-local-compat.mjs \
  --input=data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json \
  --output=data/reports/item-source-candidate-local-compat-apply-2026-06-12.json \
  --allow-bulk=true \
  --confirm-local-compat=true \
  --apply=true
```

**Post-apply validation:**

- [ ] Apply report has `inserted = 260`.
- [ ] Apply report includes non-empty `rollbackSql`.
- [ ] Backup path exists and is included in report.
- [ ] Re-run existing evidence audit and remaining work report.
- [ ] Confirm dry-run ready rows drop to `0` or become active-source-present / removed from active-source-lacking closure.

**Rollback command only if user explicitly requests rollback:**

Use `rollbackSql` from the apply report. Do not manually invent rollback SQL.

---

## Task 2: Family Policy Blocked Candidates

**Purpose:** Reduce 603 family-policy blocked candidates by adding tested, page-specific rules. This must not blindly allow entire family pages.

**Current status:** Partially executed. Safe shared rules for Tombstones, Butterflies, Angler quests, developer treasure bags, special edition/fishing/cooking rows were promoted to dry-run-ready candidates. The remaining 603 family candidates still require item-specific family parser work.

**Files:**

- Modify: `data/config/item-source-family-page-policy.json`
- Modify: `scripts/data/audit/item-source-family-page-policy.mjs`
- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.mjs`
- Test: `scripts/data/audit/build-item-source-candidate-import-plan.test.mjs`
- Report: `data/reports/item-source-family-policy-resolution-2026-06-12.json`

**Current top pages:**

| Page | Count | Initial treatment |
| --- | ---: | --- |
| `Banners (enemy)` | 287 | Needs banner-specific NPC/group source parser or dedicated banner evidence projection |
| `Wings` | 21 | Split developer/treasure-bag/group rules; avoid broad allow |
| `Trophies` | 20 | Boss trophy parser or boss drop relation projection |
| `Treasure Bag` | 15 | Treasure bag source rule with item ref resolution |
| `Relics` | 14 | Master-mode boss relic parser/projection |
| `Banners (decorative)` | 12 | Likely decorative/family source; needs item-specific validation |
| `Masks` | 8 | Boss drop parser/projection |

**Steps:**

- [ ] Add report builder that groups family candidates by `pageTitle`, `sourceType/sourceRefType`, and candidate item list.
- [x] Write tests and implement already-reviewed safe batch:
  - `Tombstones` shared `drop/world player death`.
  - `Angler/Quests` `quest_reward/npc Angler`.
  - `Butterflies` `capture/world Bug Net capture`.
- [ ] Implement only next safe page rules after item-specific tests exist.
- [ ] Rebuild focused candidate plan.
- [ ] Re-run local compat dry-run with `--apply=false`.
- [ ] Record how many of the 603 moved to dry-run ready.
- [ ] Repeat for next safe page group only after tests exist.

**Unsafe until item-specific parser exists:**

- `Banners (enemy)` because source ownership must map item banner to NPC/enemy identity.
- `Wings` because developer wings and treasure bags have mixed rules.
- `Trophies`, `Masks`, `Relics` because boss mapping must be explicit.
- Generic furniture families unless the row proves all variants share the exact source.

**Validation:**

```bash
node --test scripts/data/audit/build-item-source-candidate-import-plan.test.mjs
node scripts/data/audit/build-item-source-focused-candidate-plan-from-evidence.mjs \
  --output=data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json
node scripts/data/relation/apply-item-source-candidate-local-compat.mjs \
  --input=data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json \
  --output=data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json \
  --allow-bulk=true \
  --apply=false
```

---

## Task 3: Closure Family Pending Rows

**Purpose:** Resolve the 278 closure family pending rows that do not overlap with the 603 raw family blocked candidates.

**Files:**

- Report input: `data/reports/item-source-existing-evidence-layers-2026-06-12.json`
- Report output: `data/reports/item-source-family-pending-resolution-2026-06-12.json`
- Modify as needed: `scripts/data/audit/item-source-family-page-policy.mjs`
- Test: new or existing family policy tests.

**Current groups:**

| Group | Count | Treatment |
| --- | ---: | --- |
| Music Boxes | 95 | Needs dedicated music-box acquisition rule; likely shop/NPC or recording mechanics, not shared worldgen |
| Statues | 52 | Needs statue-specific parser; do not globally allow |
| Blocks/Team Blocks | 6 | Shop/NPC or crafting-specific rule |
| Altars | 4 | Mixed worldgen/drop/boss references; requires item-specific parser |
| Moss | 4 | Biome/location projection may apply |
| Vases | 4 | Mining/world rule if exact |
| Other | 113 | Must be grouped by exact names/page evidence before promotion |

**Steps:**

- [ ] Build `item-source-family-pending-resolution` report from evidence rows.
- [ ] Add tests for grouping by suffix/page evidence.
- [ ] For each group, classify rows into:
  - `promotable_candidate_plan`
  - `dedicated_projection_required`
  - `explicit_exemption`
  - `needs_item_specific_parser`
- [ ] Feed only `promotable_candidate_plan` rows into candidate plan via tested helper.
- [ ] Keep all unresolved rows listed with `nextAction`.

**Validation:**

- [ ] No row disappears from the 278 queue without a resolution lane.
- [ ] Any promoted row has source evidence and source page trace.
- [ ] Statues/Music Boxes are not globally allowlisted without item-specific evidence.

---

## Task 4: Blocked Source Rows

**Purpose:** Resolve the remaining 8 candidates / 10 source rows by converting safe unknown/ref cases or marking non-importable exemptions.

**Current status:** Partially executed. Safe normalizations were promoted into the 199-candidate dry-run plan. Remaining rows are deliberately not imported as generic sources.

**Files:**

- Modify: `scripts/data/audit/build-item-source-candidate-import-plan.mjs`
- Test: `scripts/data/audit/build-item-source-candidate-import-plan.test.mjs`
- Report: `data/reports/item-source-blocked-source-resolution-2026-06-12.json`

**Current exact rows:**

| Item | Reason | Treatment |
| --- | --- | --- |
| Bone Block | `unknown/world unobtainable as item` | Explicit unobtainable exemption, do not import |
| Phasic Warp Ejector | `unknown/world unimplemented` | Explicit unimplemented exemption |
| Apple Pie Slice | `unknown/world unimplemented` | Explicit unimplemented exemption |
| SkeletonBow | `unknown/world unobtainable` | Explicit unobtainable exemption |
| Garden Gnome | `unknown/npc Gnome sunlight transformation` | Dedicated transformation rule |
| TorchGodsFavor | `fishing/world` and `unknown/world The Torch God event` | Event reward rule; block fishing noise |
| JunimoPetItem | `unknown/npc Dryad` | Shop/gift/event rule; needs exact source semantics |
| SoundGun | `unknown/world unimplemented/unobtainable` | Explicit unimplemented exemption |

**Steps:**

- [ ] Write tests for explicit non-importable statuses: `unimplemented`, `unobtainable`, `unobtainable as item`.
- [ ] Write tests for `Hardmode Treasure Bag (except Queen Slime)` as text-only group source if accepted by local compat, otherwise keep blocked with explicit rule.
- [ ] Write tests for transformation/event/fishing-junk rows before changing normalizer.
- [ ] Implement the smallest safe normalizer/exemption rules.
- [ ] Rebuild candidate plan and dry-run.

**Validation:**

- [x] `blocked_source_rows` decreases from `17 candidates / 23 rows` to `8 candidates / 10 rows`.
- [ ] Non-importable rows are listed as explicit exemption, not silently dropped.
- [ ] Dry-run remains `validationErrors=0`, `duplicates=0`.

---

## Task 5: NPC And Biome Projection Contract

**Purpose:** Close 2 NPC relation rows and 15 biome rows through dedicated projection/API/UI, not fake source rows.

**Current status:** Backend/API contract implemented and frontend type/template path updated. Final closure status report verified `17/17` projection rows have local evidence and are closed by the public source contract. Browser/DOM runtime smoke remains a separate UI verification step.

**Files:**

- Backend:
  - `back/src/main/java/com/terraria/skills/dto/ItemSourceDTO.java`
  - `back/src/main/java/com/terraria/skills/dto/PublicItemSourceDTO.java`
  - `back/src/main/java/com/terraria/skills/service/impl/ItemSourceServiceImpl.java`
  - `back/src/test/java/com/terraria/skills/controller/PublicItemRelationControllerTest.java`
  - `back/src/test/java/com/terraria/skills/service/impl/ItemSourceServiceImplTest.java`
- Frontend:
  - `front-nuxt/types/public-api.ts`
  - `front-nuxt/pages/items/[id].vue`
- Reports:
  - `data/reports/item-source-final-closure-status-2026-06-12.json`
  - `data/reports/item-source-final-closure-status-summary-zh-2026-06-12.md`

**Rows:**

- NPC: `CenxsWings`, `CorruptPlanterBox`
- Biome: `BladedGlove`, `FlarefinKoi`, `Rockfish`, `InfernalWispDye`, `ReflectiveGoldDye`, `BlueAcidDye`, `BombFish`, `KryptonMoss`, `ArgonMoss`, `MeowmereMinecart`, `PirateMinecart`, `GoblinSharkBanner`, `PumpkingMasterTrophy`, `SporeSkeletonBanner`, `HardenedSandWallUnsafe`

**Steps:**

- [x] Define public source contract fields:
  - `evidenceKind`
  - `sourceFactKey`
  - `npcDetailPath`
  - `lootEntryId`
  - `shopEntryId`
  - `dropSourceKind`
  - `biomeDetailPath`
- [x] Add backend tests for public sources projection on NPC and biome samples.
- [x] Implement service projection from existing `npc_loot_entries` / `npc_shop_entries` and biome evidence.
- [x] Update Nuxt public API type.
- [x] Update item detail UI to link projected NPC/biome evidence.
- [ ] Add DOM smoke or component test for one NPC and one biome sample.

**Validation:**

- [x] `CenxsWings` has local `npc_shop_entries` evidence and public projection fields.
- [x] `BladedGlove` has local `item_biomes` evidence and public projection fields.
- [x] Report marks 17 projection rows as closed by dedicated public contract.

---

## Task 6: Terminal And Missing Raw Evidence

**Purpose:** Keep 19 terminal/identity rows and 3 missing raw rows explicit and out of normal import.

**Files:**

- Input: `data/reports/item-source-terminal-exemption-plan-2026-06-11.json`
- Existing evidence report: `data/reports/item-source-existing-evidence-layers-2026-06-12.json`
- Output: `data/reports/item-source-terminal-and-missing-raw-closure-2026-06-12.json`
- Summary: `data/reports/item-source-terminal-and-missing-raw-closure-summary-zh-2026-06-12.md`

**Steps:**

- [ ] Generate a stable terminal/missing raw closure report.
- [ ] List all 19 terminal/identity rows with status and next action.
- [ ] List all 3 missing raw rows:
  - `ZH_RECIPE_PINK_JELLYFISH_BAIT`
  - `ZH_RECIPE_GREEN_JELLYFISH_BAIT`
  - `ZH_RECIPE_BLUE_JELLYFISH_BAIT`
- [ ] Verify none of these rows appear in candidate import plan eligible candidates.
- [ ] If user later approves raw acquisition, create a separate raw-cache/fetch plan.

**Validation:**

- [ ] Terminal rows are not imported.
- [ ] Missing raw rows are not guessed from similar Jellyfish pages.
- [ ] Summary clearly says these are closed as exemption/task, not active source rows.

---

## Task 7: Final Closure Regeneration And User-Facing Verification

**Purpose:** Recompute all reports after Tasks 1-6 and prove the user can inspect the final state.

**Current status:** Final status report has been generated for the current non-apply boundary. It is the data/API closure snapshot for this round; UI runtime smoke is still listed as residual verification.

**Files:**

- Regenerate:
  - `data/reports/item-source-existing-evidence-layers-2026-06-12.json`
  - `data/reports/item-source-remaining-work-items-report-2026-06-12.json`
  - `data/reports/item-source-remaining-treatment-report-2026-06-12.json`
  - `data/reports/item-source-final-closure-status-2026-06-12.json`
  - `data/reports/item-source-final-closure-status-summary-zh-2026-06-12.md`

**Steps:**

- [ ] Re-run evidence audit.
- [ ] Re-run focused candidate plan.
- [ ] Re-run local compat dry-run.
- [ ] Re-run work items report.
- [ ] Re-run treatment summary.
- [x] Generate final closure status report with local DB projection verification.
- [ ] If services were changed, restart local backend/frontend and test item pages.
- [ ] Produce a final Chinese summary:
  - how many were applied,
  - how many became family/parser rules,
  - how many became projection,
  - how many are explicit exemptions,
  - how many remain missing raw.

**Validation commands:**

```bash
node --test \
  scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs \
  scripts/data/audit/build-item-source-focused-candidate-plan-from-evidence.test.mjs \
  scripts/data/audit/build-item-source-remaining-treatment-report.test.mjs \
  scripts/data/audit/build-item-source-remaining-work-items-report.test.mjs \
  scripts/data/audit/build-item-source-candidate-import-plan.test.mjs \
  scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs \
  scripts/data/audit/build-item-source-gap-coverage-plan.test.mjs \
  scripts/data/audit/build-item-source-remaining-closure-report.test.mjs \
  scripts/data/audit/build-item-source-final-closure-status-report.test.mjs

mvn -f back/pom.xml -Dtest=ItemSourceServiceImplTest,PublicItemRelationControllerTest test

(cd front-nuxt && pnpm exec nuxt typecheck)

git diff --check
git status --short --branch -uall
```

**Final acceptance target:**

- Dry-run ready rows are either applied or explicitly waiting for apply approval.
- Family blocked and pending rows have per-page resolution lanes.
- Blocked source rows are either promoted, projected, or explicit exemption.
- NPC/biome rows show in public API/UI or have a dedicated projection report.
- Terminal/missing raw rows are explicit and not counted as ordinary source import work.

**Current acceptance result:**

- Dry-run-ready rows are explicitly waiting for apply approval: `260 rows / 199 candidates`.
- Family blocked and pending rows have a counted lane but not full parser closure: `881 rows`.
- Blocked source rows are no longer broad unknown candidates; remaining exact set is `8 candidates / 10 rows`.
- NPC/biome rows are closed by read-only API projection: `17/17`; browser/DOM smoke remains pending.
- Terminal and missing raw rows are explicit non-import lanes: `19 + 3`.

---

## Self-Review

**Goal lock:** The plan covers all current counts from `item-source-remaining-work-items-report-2026-06-12.json` and `item-source-final-closure-status-2026-06-12.json`.

**Boundary lock:** DB write is isolated to Task 1 and requires explicit `--apply=true` approval. Fetch/backfill/import/crawler remain separate approvals.

**Evidence lock:** Each task names source reports, output reports, tests, and acceptance metrics. Final status is summarized in `data/reports/item-source-final-closure-status-summary-zh-2026-06-12.md`.

**Multi-agent lock:** Ownership is split by file/report/API surface. Current session could not spawn new agents due `agent thread limit reached`; prior agent reviews were incorporated.

**Known risk:** Task 1 cannot be completed without user-approved DB write. The 881 family/parser rows require item-specific parser work and should not be globally allowlisted. Missing raw evidence cannot be completed without a separate raw evidence acquisition/fetch approval.
