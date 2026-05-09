# NPC Loot Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. Discovery and tests may run in parallel by lane; shared relation processors, landing sync, and DB-writing sync commands are serial. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close NPC loot display gaps by fixing traceable source production and relation resolution, not by hand-editing local runtime tables.

**Architecture:** Treat NPC loot as a chain: `source artifact -> landing -> maint_item_sources -> item_source_facts/source_details -> item_npc_loot_relations -> projection_npcs -> npc_loot_entries/npcs.loot_items_json -> admin/public API`. A new read-only audit classifies each gap before any writer runs. Only classified, traceable rows may be materialized.

**Tech Stack:** Node.js audit/fetch/relation scripts, MySQL `terria_v1_maint` / `terria_v1_relation` / `terria_v1_local`, Nuxt admin UI consumers, Spring Boot admin/public NPC APIs.

---

## Current Findings

### Confirmed runtime symptom

- Admin NPC list displays `row.lootEntryCount` from `/admin/npcs`.
- `lootEntryCount` is counted from `terria_v1_local.npc_loot_entries`.
- The UI also shows `derivedLootEntryCount`, but that is not a substitute for structured loot.

### Confirmed DB state on 2026-05-09

| Check | Result |
| --- | --- |
| Active local NPCs | `762` |
| Local `npc_loot_entries` rows | `1020` |
| Local NPCs with structured loot | `231` |
| Relation `item_npc_loot_relations` rows | `674` |
| Relation NPCs with loot | `206` |
| Projection NPCs with `loot_items_json` | `206` |
| Local NPCs where projection has loot but local compat is zero | `0` |

This means the main missing-data problems are upstream of local compatibility, not a Nuxt rendering-only defect.

### Gap family A: Mimic variants

Affected targets:

- `PresentMimic`
- `BigMimicCorruption`
- `BigMimicCrimson`
- `BigMimicHallow`
- `BigMimicJungle`

Current state:

- Local, relation, and projection structured loot are all zero for those five variants.
- Current source evidence has `Mimics` generic bucket rows, not variant-specific source rows.
- Crawler coverage proves pages exist, but does not currently prove variant-specific loot rows.
- Existing closeout classified all five as `generic_bucket_only`.

Hard conclusion:

- Do not fan out generic `Mimics` rows into five variants unless a reviewed mapping contract says which item belongs to which variant.
- Do not hand-edit `item_npc_loot_relations`, `projection_npcs`, `npc_loot_entries`, or `npcs.loot_items_json`.

### Gap family B: positive ID fallback multi-candidate rows

Examples found in `item_npc_relation_audits`:

- Representative-safe candidates: `Blood Eel`, `Devourer`, `Bone Serpent`, `Wyvern`, `Digger`, `Giant Worm`, `Tomb Crawler`.
- True variant/tier candidates: `Pigron`, `Rusty Armored Bones`, `Dark Mage`, `Ogre`, `Lamia`, `Frozen Zombie`.

Current state:

- `item_npc_relation_audits` has `70` `loot / ambiguous / npc_source_ambiguous` rows.
- Many ambiguous rows already carry raw `sourceRefInternalName` and `sourceRefResolution=positive_id_fallback`.
- `positive_id_fallback` is deterministic upstream, but not always semantically safe.

Hard conclusion:

- Do not accept `positive_id_fallback` globally.
- Accept it only under an explicit representative-family guardrail.

### Gap family C: non-NPC source rows misclassified as NPC source gaps

Examples:

- `Gold Chest`, `Azure Crate`, `Treasure Bag (...)`, `Shaking`, `tree`, `Present`, `Herb Bag`.

Current state:

- `item_npc_relation_audits` has many `loot / unresolved / npc_source_unresolved` rows that are not actually NPC drops.

Hard conclusion:

- These rows must be classified separately as `non_npc_source_misclassified`.
- They must not count as NPC loot closure work.

---

## Non-Goals

- Do not fix this by changing the admin page to show crawler/wiki data directly.
- Do not backfill local `npc_loot_entries` by hand.
- Do not treat `item_acquisition_sources` as enough for structured NPC loot.
- Do not auto-resolve all ambiguous NPC names.
- Do not include a crawler rewrite unless the audit proves there is no traceable local source artifact path.
- Do not run DB-writing `--apply`, import, backfill, or sync commands until the read-only audit has classified the gaps and the dry-run counts are reviewed.

---

## Multi-Agent Work Split

| Lane | Owner scope | Can run in parallel | Serial boundaries |
| --- | --- | --- | --- |
| Agent A | Read-only NPC loot gap audit and classification | Audit script/tests only | Must not write DB or invoke sync/apply |
| Agent B | Guarded `positive_id_fallback` representative resolution | Processor helper/tests only | Shared `item-source-relation-processor.mjs` edits are serial |
| Agent C | Mimic variant source producer and landing path | Fetch/landing tests and source artifact analysis | No DB apply; no generic fan-out without reviewed mapping |
| Agent D | Dry-run sync and closeout verification | Read-only reports and dry-run command plan | DB-writing syncs are serial and require pre-count/post-count |

Allowed parallelism:

- Read-only DB queries.
- Fixture tests that do not write DB.
- Disjoint test files.
- Independent audit report design.

Serial-only work:

- `scripts/data/relation/item-source-relation-processor.mjs`
- `scripts/data/relation/sync-maint-to-relation.mjs`
- `scripts/data/maint/sync-landing-to-maint.mjs`
- `scripts/data/fetch/build-npc-item-relations-bundle.mjs`
- Any command with `--apply`, `--write-db`, `--backfill`, `--load`, `import`, or DB mutation behavior.

---

## Phase 0: Branch And Baseline

**Purpose:** Create an isolated work branch and lock the current counts before changing scripts.

**Files:**

- Read: `docs/audits/2026-05-09_buff-npc-loot-detail-baseline.md`
- Read: `docs/audits/2026-05-09_buff-npc-loot-detail-closeout.md`
- Read: `docs/todo/backlog.md`
- Create: `docs/audits/2026-05-09_npc-loot-gap-closure-baseline.md`

- [ ] Create branch:

```powershell
git switch -c fix/npc-loot-gap-closure
```

Expected: branch created from current `main`.

- [ ] Confirm clean worktree:

```powershell
git status --short --branch
```

Expected: clean except this plan if it is created before branch switch.

- [ ] Run read-only current-state SQL or equivalent script and record:

```sql
SELECT COUNT(*) FROM terria_v1_relation.item_npc_relation_audits
WHERE relation_kind='loot' AND audit_status='ambiguous' AND reason_code='npc_source_ambiguous';
```

Expected baseline: about `70`, unless source data changed.

- [ ] Record Mimic variant counts:

```sql
SELECT n.internal_name,
       COUNT(l.id) AS localLoot,
       COALESCE(JSON_LENGTH(p.loot_items_json), 0) AS projectionLoot
FROM terria_v1_local.npcs n
LEFT JOIN terria_v1_local.npc_loot_entries l ON l.npc_id=n.id AND l.deleted=0
LEFT JOIN terria_v1_relation.projection_npcs p
  ON p.internal_name COLLATE utf8mb4_unicode_ci=n.internal_name COLLATE utf8mb4_unicode_ci
 AND p.deleted=0 AND p.status=1
WHERE n.internal_name IN ('PresentMimic','BigMimicCorruption','BigMimicCrimson','BigMimicHallow','BigMimicJungle')
GROUP BY n.internal_name, p.loot_items_json;
```

Expected before fix: all five are `0`.

**Exit gate:**

- Baseline audit exists.
- No DB writes occurred.

---

## Phase 1: Read-Only NPC Loot Gap Audit

**Purpose:** Build a machine-readable audit that classifies every NPC loot gap before any fix is applied.

**Files:**

- Create: `scripts/data/audit/npc-loot-gap-closure-audit.mjs`
- Create: `scripts/data/audit/npc-loot-gap-closure-audit.test.mjs`
- Read: `scripts/data/audit/audit-missing-mimic-variant-loot.mjs`
- Read: `scripts/data/relation/relation-health-report.mjs`

**Classifications:**

- `generic_bucket`: evidence exists only under generic source such as `Mimics`.
- `positive_id_fallback_resolvable`: raw evidence carries a deterministic internal name and passes representative-family guardrails.
- `true_ambiguous`: multiple real candidate NPCs remain after all safe narrowing.
- `non_npc_source_misclassified`: source is actually chest, crate, treasure bag, tree, shaking, present, etc.
- `missing_source`: no usable source evidence exists.
- `already_materialized`: relation/projection/local structured loot already exists.

- [ ] Add fixture test for generic Mimics.

Expected: `Mimics` evidence for variant targets returns `generic_bucket`, not `already_materialized`.

- [ ] Add fixture test for `positive_id_fallback_resolvable`.

Example: `Blood Eel` raw row with `sourceRefInternalName=BloodEelHead`, candidate set `BloodEelHead/Body/Tail`.

Expected: classification is `positive_id_fallback_resolvable`.

- [ ] Add fixture test for true variants.

Examples: `PigronCorruption/PigronHallow/PigronCrimson`, `DD2DarkMageT1/DD2DarkMageT3`.

Expected: classification is `true_ambiguous`.

- [ ] Add fixture test for non-NPC sources.

Examples: `Gold Chest`, `Azure Crate`, `Treasure Bag (Moon Lord)`, `Shaking`.

Expected: classification is `non_npc_source_misclassified`.

- [ ] Add DB-unavailable test.

Expected: top-level `auditStatus='blocked'` and `evidenceHealth='db_unavailable'`.

- [ ] Implement read-only audit.

Required report fields:

- `auditStatus`
- `evidenceHealth`
- `artifactStatuses[]`
- `scanSummary`
- `summary.byClassification`
- `gaps[]`
- `gaps[].maintCounts`
- `gaps[].relationCounts`
- `gaps[].projectionCounts`
- `gaps[].localCompatCounts`
- `gaps[].resolutionCandidates[]`

- [ ] Run:

```powershell
node --test scripts/data/audit/npc-loot-gap-closure-audit.test.mjs
node scripts/data/audit/npc-loot-gap-closure-audit.mjs --write-report=true --date-tag=2026-05-09
```

Expected:

- Test pass.
- Report written under `reports/audit/`.
- No DB writes.

**Exit gate:**

- Every inspected gap has exactly one classification.
- The report can distinguish upstream source gap from downstream sync drift.

---

## Phase 2: Guarded Positive ID Fallback Resolution

**Purpose:** Resolve safe representative multi-part NPC drops while preserving true ambiguity.

**Files:**

- Modify: `scripts/data/relation/item-source-relation-processor.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.test.mjs`
- Modify if needed: `scripts/data/relation/sync-maint-to-relation.mjs`

**Guardrails:**

Accept `positive_id_fallback` only when all are true:

- Raw row has `sourceRefInternalName`.
- Raw row has `sourceRefResolution='positive_id_fallback'`.
- Candidate set for the normalized source name contains the raw internal name exactly once.
- Candidate set is a representative-safe family, not a true variant split.
- Safe family names are segment-only patterns such as `Head/Body/Tail`, `Body2`, `Body3`, `Legs`, when all candidates share a common root and no biome/tier/weapon/form token is present.
- Reject biome/tier/weapon/form variants such as `PigronCorruption/Hallow/Crimson`, `DD2DarkMageT1/T3`, `DD2OgreT2/T3`, `RustyArmoredBonesAxe/Flail/Sword`, `DesertLamiaLight/Dark`.

- [ ] Add failing tests:

```powershell
node --test scripts/data/relation/item-source-relation-processor.test.mjs
```

Expected new tests fail before implementation.

- [ ] Implement helper functions:

- `isPositiveIdFallbackResolution(value)`
- `isRepresentativeSafeNpcFamily(candidates, rawInternalName)`
- `resolvePositiveIdFallbackRepresentative(candidates, rawInternalName)`

- [ ] Add passing behavior:

Safe examples:

- `BloodEelHead` resolves for `Blood Eel`.
- `DevourerHead` resolves for `Devourer`.
- `BoneSerpentHead` resolves for `Bone Serpent`.

Rejected examples:

- `PigronCorruption` remains ambiguous for `Pigron`.
- `DD2DarkMageT1` remains ambiguous for `Dark Mage`.
- `DD2OgreT2` remains ambiguous for `Ogre`.
- `RustyArmoredBonesAxe` remains ambiguous for `Rusty Armored Bones`.

- [ ] Preserve audit evidence for rejected rows.

Expected:

- `auditStatus='ambiguous'`
- `reasonCode='npc_source_ambiguous'`
- `evidenceJson` includes `sourceRefInternalName`, `sourceRefResolution`, and candidate internal names.

- [ ] Run:

```powershell
node --test scripts/data/relation/item-source-relation-processor.test.mjs
node --test scripts/data/relation/sync-maint-to-relation.test.mjs
```

**Exit gate:**

- Safe representative rows become formal `item_npc_loot_relations` in dry-run output.
- True variant rows remain audits.

---

## Phase 3: Mimic Variant Source Producer

**Purpose:** Produce traceable variant-specific source rows for Mimic variants only when source evidence supports them.

**Files:**

- Modify: `scripts/data/fetch/build-npc-item-relations-bundle.mjs`
- Create if absent: `scripts/data/fetch/build-npc-item-relations-bundle.test.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`
- Modify: `scripts/data/audit/audit-missing-mimic-variant-loot.mjs`
- Modify: `scripts/data/audit/audit-missing-mimic-variant-loot.test.mjs`

**Decision required inside implementation:**

Choose exactly one source strategy and document it in the closeout:

| Option | Allowed only if | Output |
| --- | --- | --- |
| A. Variant-specific crawler loot rows | `wikiCrawler.loot` exists for each variant page | Emit direct variant loot records |
| B. Reviewed generic Mimics fan-out mapping | A checked-in mapping documents each item-to-variant relation | Emit mapped variant loot records |
| C. No materialization | Only generic `Mimics` bucket exists | Keep blocked; audit must fail/block |

Current evidence points to Option C until a real variant loot producer or reviewed mapping is added.

- [ ] Add tests for `build-npc-item-relations-bundle`.

Expected:

- When `wikiCrawler.loot` exists on `BigMimicCorruption`, output record has:
  - `relationType='loot'`
  - `npcInternalName='BigMimicCorruption'`
  - `sourceRefInternalName='BigMimicCorruption'` in raw payload
  - `sourceRefResolution='exact_internal_name'` or `resolved`

- [ ] Add test proving generic `Mimics` rows are not fanned out without mapping.

Expected:

- No variant rows emitted.
- Backfill/audit candidate records explain missing variant-specific loot evidence.

- [ ] Add landing sync test.

Expected:

- `npc_item_relations_bundle_raw.records[]` becomes `maint_item_sources`.
- `maint_item_sources.raw_json` preserves `sourceRefInternalName` and `sourceRefResolution`.
- Landing metadata is preserved.

- [ ] Update `audit-missing-mimic-variant-loot`.

Expected:

- Crawler coverage plus only generic `Mimics` rows returns blocked/warning status, not successful closeout.
- Variant-specific rows return `source_found`.

- [ ] Run:

```powershell
node --test scripts/data/fetch/build-npc-item-relations-bundle.test.mjs
node --test scripts/data/maint/sync-landing-to-maint.test.mjs
node --test scripts/data/audit/audit-missing-mimic-variant-loot.test.mjs
```

**Exit gate:**

- The plan does not produce Mimic variant DB rows unless Option A or B is supported by traceable evidence.

---

## Phase 4: Dry-Run Chain Verification

**Purpose:** Prove script changes would materialize only approved rows.

**Files:**

- Read: `scripts/data/relation/sync-maint-to-relation.mjs`
- Read: `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- Read: `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- Create: `docs/audits/2026-05-09_npc-loot-gap-closure-dry-run.md`

- [ ] Run relation dry-run:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=false --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
```

Expected:

- No DB writes.
- Planned `item_npc_loot_relations` increase only for `positive_id_fallback_resolvable` rows and any valid variant-specific source rows.

- [ ] Run projection-to-local dry-run:

```powershell
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=false --relation-database=terria_v1_relation --local-database=terria_v1_local --domains=npcs
```

Expected:

- No DB writes.
- Planned NPC projection updates are limited to relation-derived fields.

- [ ] Run local compat dry-run:

```powershell
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=false --relation-database=terria_v1_relation --local-database=terria_v1_local
```

Expected:

- No DB writes.
- Planned `npc_loot_entries` rows match relation dry-run approved rows.

- [ ] Run current-state audit and compare it with dry-run reports:

```powershell
node scripts/data/audit/npc-loot-gap-closure-audit.mjs --write-report=true --date-tag=2026-05-09-dry-run
```

Expected:

- Audit still reflects the current DB state because dry-run commands must not mutate DB.
- Dry-run report paths printed by the three sync commands are recorded in `docs/audits/2026-05-09_npc-loot-gap-closure-dry-run.md`.
- The dry-run closeout compares current-state audit gaps against planned relation/projection/local changes from those reports.
- Do not treat this audit as proof that dry-run rows were applied unless the audit implementation explicitly ingests dry-run report paths.

**Exit gate:**

- Dry-run report separates rows that will close from rows that remain blocked.
- No true ambiguous row is promoted.
- No non-NPC source row is promoted.

---

## Phase 5: Serial Apply And Runtime Verification

**Purpose:** Apply only after Phases 1-4 pass and counts are reviewed.

**Prerequisites:**

- Phase 4 dry-run closeout reviewed.
- Active writer check confirms no other DB writer is running.
- Pre-counts recorded.

**Serial commands:**

Run only in this order:

```powershell
node scripts/data/relation/sync-maint-to-relation.mjs --apply=true --maint-database=terria_v1_maint --relation-database=terria_v1_relation --local-database=terria_v1_local
node scripts/data/relation/sync-projection-to-local-core-tables.mjs --apply=true --relation-database=terria_v1_relation --local-database=terria_v1_local --domains=npcs
node scripts/data/relation/sync-relation-to-local-compat-tables.mjs --apply=true --relation-database=terria_v1_relation --local-database=terria_v1_local
```

- [ ] Record post-counts for:
  - `item_npc_loot_relations`
  - `projection_npcs.loot_items_json`
  - `npc_loot_entries`
  - `item_npc_relation_audits`

- [ ] Restart stack:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\verify-local-stack.ps1
```

- [ ] Verify API samples:

```powershell
$login = Invoke-RestMethod -Method Post -Uri "http://localhost:18088/auth/login" -ContentType "application/json" -Body '{"username":"admin","password":"admin123456"}'
$headers = @{ Authorization = "Bearer $($login.data.token)" }
Invoke-RestMethod -Headers $headers "http://localhost:18088/admin/npcs?search=Blood%20Eel&limit=10"
Invoke-RestMethod -Headers $headers "http://localhost:18088/admin/npcs?search=Devourer&limit=10"
Invoke-RestMethod -Headers $headers "http://localhost:18088/admin/npcs?search=Corrupt%20Mimic&limit=10"
```

Expected:

- Representative-safe rows show non-zero structured loot if approved.
- Mimic variants show non-zero structured loot only if Phase 3 produced variant-specific source evidence.
- Otherwise Mimic variants remain explicitly blocked in the audit, not silently faked.

**Exit gate:**

- Admin NPC list and detail align with DB counts.
- Audit report explains every remaining zero.

---

## Phase 6: Closeout

**Files:**

- Create: `docs/audits/2026-05-09_npc-loot-gap-closure-closeout.md`
- Modify: `docs/todo/backlog.md`

- [ ] Write closeout with:
  - branch and commit
  - exact commands run
  - pre/post DB counts
  - report paths and hashes
  - remaining blocked categories
  - manual review needed for true ambiguous rows

- [ ] Update backlog:
  - Remove or mark completed fixed `positive_id_fallback_resolvable` items.
  - Keep `generic_bucket` Mimic work open if no variant-specific source is available.
  - Add follow-up for non-NPC source typing if still unresolved.

- [ ] Run scoped tests:

```powershell
node --test scripts/data/audit/npc-loot-gap-closure-audit.test.mjs
node --test scripts/data/audit/audit-missing-mimic-variant-loot.test.mjs
node --test scripts/data/fetch/build-npc-item-relations-bundle.test.mjs
node --test scripts/data/maint/sync-landing-to-maint.test.mjs
node --test scripts/data/relation/item-source-relation-processor.test.mjs
node --test scripts/data/relation/sync-maint-to-relation.test.mjs
node --test scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs
```

- [ ] Run final git scope check:

```powershell
git status --short
git diff --stat
```

**Exit gate:**

- No unreviewed DB writer output is mixed into the commit.
- Code, tests, plan, and closeout agree on remaining blocked work.

---

## Hard Review Questions

Before implementation is considered acceptable, answer these in the closeout:

- Which exact rows moved from `ambiguous` to formal relation, and why are they representative-safe?
- Which rows stayed ambiguous, and why?
- Did any `Mimics` generic row fan out to variants? If yes, where is the reviewed mapping contract?
- Did any non-NPC source row become an NPC loot relation? Expected answer: no.
- Do `projection_npcs` and `npc_loot_entries` agree for every newly materialized NPC?
- Does the admin API read only local DB/relation-derived state?

---

## Multi-Agent Execution Order

Recommended execution:

1. Agent A implements Phase 1 audit.
2. Agent B implements Phase 2 processor tests and guarded resolver.
3. Agent C implements Phase 3 source producer tests and Mimic audit tightening.
4. Coordinator runs Phase 4 dry-runs serially.
5. Coordinator performs Phase 5 apply only after reviewing dry-run output.
6. Agent D reviews closeout and remaining blocked categories.

Do not run Agents B and C against shared files at the same time. If both need `item-source-relation-processor.mjs` or `sync-landing-to-maint.mjs`, merge one lane first, rerun tests, then start the next.
