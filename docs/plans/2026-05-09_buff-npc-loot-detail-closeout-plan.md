# Buff / NPC Detail Data Closeout Replan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. Parallel work is allowed only for read-only discovery or disjoint test/script files. Shared controller edits and DB writes are serial.

**Goal:** Bring the Buff immune NPC detail and Mimic variant loot detail work to merge quality without fabricating runtime data or hiding local data gaps.

**Pre-replan merge decision:** Do not merge `plan/buff-npc-loot-detail-closeout` yet. The branch has useful work, but two merge blockers remain before this replan is executed:

- Buff alias multi-match rows are currently moved to `unresolvedImmuneNpcSamples` instead of selecting a deterministic local NPC representative.
- The Mimic variant audit script reports the current missing-source conclusion, but it does not yet scan all planned local candidate sources and still hardcodes `hasDirectLocalSourceArtifact = false`.

**Architecture:** Buff detail is a backend contract fix over local `npcs`. Mimic loot is a data-chain audit/materialization decision over local artifacts, maint/relation/projection/local DB, and reports. Runtime APIs must read local DB/relation/projection state only; crawler output and wiki pages are evidence inputs, not runtime payload sources.

**Tech Stack:** Java Spring Boot admin APIs, MySQL `terria_v1_local` and `terria_v1_relation`, Node.js audit scripts, Nuxt admin UI, TerraPedia generated reports.

---

## Confirmed Current State

- Branch: `plan/buff-npc-loot-detail-closeout`
- Branch HEAD: `83e17ab feat: add Buff immune NPC alias resolution and Mimic variant loot audit`
- Local `main`: `c3b947d`
- Working tree before this replan edit: clean relative to branch HEAD
- Branch status before executing this replan: not merge-ready

Implemented on the branch:

- `AdminBuffController` now separates `immuneNpcSamples` and `unresolvedImmuneNpcSamples`.
- Buff tests cover alias resolution and unresolved isolation, but not the intended deterministic multi-match representative behavior.
- `audit-missing-mimic-variant-loot.mjs` exists and can generate a report.
- The real audit run found 5 Mimic variants as `missing_source`, with known-good controls already materialized.

Verified concern:

- Buff sample DB-side check found `242` samples:
  - `133` exact resolved
  - `81` single alias resolved
  - `28` ambiguous alias matches
  - `0` fully unresolved
- Ambiguous examples include `PhantasmDragon` and `LunaticCultist`.
- Current implementation downshifts those 28 ambiguous local matches to unresolved; that is stricter than the intended display behavior and loses usable local NPC data.

---

## Non-Goals

- Do not use live wiki data in runtime APIs.
- Do not fabricate Mimic variant loot rows from screenshots, wiki pages, or raw crawler output.
- Do not broaden into a full crawler rewrite.
- Do not merge a branch whose plan acceptance and implementation behavior disagree.
- Do not apply DB writes from this replan. If source evidence becomes materializable, create and review a separate backfill execution plan before any DB mutation.

---

## Hard Boundaries

- Runtime source of truth is local DB plus relation/projection snapshots.
- Crawler output may be scanned as evidence, but it is not directly returned by admin/public APIs.
- Buff normal card payloads must not contain fake NPC rows with `npcId=null`.
- Buff ambiguous alias rows must not be discarded when a deterministic local representative can be selected.
- Mimic variant loot can be materialized only if traceable local source evidence exists.
- `sync-maint-to-relation.mjs` remains the snapshot writer for relation/projection. A focused script may prepare upstream inputs, but it must not compete with snapshot tables.
- `npcs.loot_items_json` is refreshed through `sync-projection-to-local-core-tables.mjs --domains=npcs`.
- DB writes touching item source facts, details, NPC loot relations, projections, compatibility tables, or `npcs.loot_items_json` must run serially.
- DB reads for audit are allowed only through a read-only code path; any script that accepts `--apply`, `--write-db`, `--backfill`, `--load`, or equivalent mutation flags must be treated as a DB-writing command.
- Shared backend controller edits are serial:
  - `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`
  - `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
  - `back/src/main/java/com/terraria/skills/controller/AdminNpcRelationController.java`
  - `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`

---

## Phase 0: Re-Baseline Before Further Changes

**Purpose:** Prevent fixing against stale assumptions.

**Files:**

- Read: `docs/audits/2026-05-09_buff-npc-loot-detail-baseline.md`
- Read: `docs/audits/2026-05-09_buff-npc-loot-detail-closeout.md`
- Read: `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`
- Read: `scripts/data/audit/audit-missing-mimic-variant-loot.mjs`
- Modify if facts changed: `docs/audits/2026-05-09_buff-npc-loot-detail-closeout.md`

**Prerequisites:**

- Local DB `terria_v1_local` and relation DB `terria_v1_relation` must be reachable for the read-only baseline. If either DB is unavailable, stop and record the baseline as blocked; do not substitute stale reports for current DB counts.

**Steps:**

- [ ] Record current branch, commit, and `git status --short`.
- [ ] Re-run or reproduce Buff immune sample classification:
  - exact resolved
  - single alias resolved
  - ambiguous alias local matches
  - fully unresolved
- [ ] Re-run the Mimic audit script without changing DB state or overwriting the checked-in report:

```powershell
node scripts/data/audit/audit-missing-mimic-variant-loot.mjs --write-report=false --date-tag=2026-05-09
```

- [ ] Record whether the previous audit report remains representative.

**Exit gate:**

- The closeout audit states that the current branch is not merge-ready and lists the two blockers above.
- No DB writes have occurred.

**Stop condition:**

- If Buff ambiguous count is no longer non-zero, still keep deterministic representative tests to prevent recurrence.

---

## Phase 1: Fix Buff Ambiguous Alias Resolution

**Purpose:** Keep `immuneNpcSamples` displayable while still exposing ambiguity metadata for audit.

**Files:**

- Modify: `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminBuffControllerTest.java`

**Required behavior:**

- Exact `internalName` match wins first.
- Exact `game_id` match wins second.
- If exact `internalName` or exact `game_id` returns more than one active local row, stop and document a data-integrity blocker instead of selecting one silently.
- Raw sample fields `npcId`, `sourceId`, and `source_id` are treated as NPC game/source IDs, not local `npcs.id` values. Do not resolve these fields against local DB primary keys.
- Alias match by normalized display name is used only after exact matching fails.
- Alias candidate rows must be deduped by `npcDbId` before scoring.
- Alias lookup must preserve candidate `matchSources` for every row before scoring:
  - `name`
  - `name_zh`
  - `raw.localized.en.name`
  - `raw.localized.zh.name`
- Representative selection must not depend on SQL row order or `Map` insertion order except for the final explicit sort keys below.
- If alias match returns multiple local NPC rows, choose one deterministic representative:
  - prefer exact normalized English display-name equality
  - then prefer exact normalized Chinese display-name equality
  - prefer lowest positive `game_id`
  - then lowest DB `id`
- Preserve ambiguity metadata on the resolved card:
  - `resolutionStatus = "alias_ambiguous_representative"` exactly for multi-match alias representatives
  - `matchCount`
  - `matchedNpcIds`
  - `matchedNpcDbIds`
  - `matchedInternalNames`
- Truly unresolved rows stay outside normal cards in `unresolvedImmuneNpcSamples`.

**Tests to add or update:**

- [ ] `PhantasmDragon` resolves to a deterministic local representative and includes ambiguity metadata.
- [ ] `LunaticCultist` resolves to a deterministic local representative and includes ambiguity metadata.
- [ ] Exact `internalName` still wins when an alias would match a different row.
- [ ] Duplicate exact `game_id` or `internalName` rows are treated as data-integrity blockers, not as ambiguous alias cases.
- [ ] Raw sample `sourceId` resolves through `npcs.game_id`, not through local `npcs.id`.
- [ ] Duplicate candidate keys for the same NPC row do not inflate `matchCount`.
- [ ] `immuneNpcSamples[*].npcId` is never `null`.
- [ ] `unresolvedImmuneNpcSamples` is reserved for rows with no local NPC candidate.

**Validation:**

```powershell
cd back
mvn "-Dtest=AdminBuffControllerTest" test
```

**Exit gate:**

- The Phase 0 ambiguous alias rows are represented as resolved local cards, not unresolved placeholders.
- The API still lets operators see that the row was ambiguous.

---

## Phase 2: Upgrade Mimic Variant Loot Audit To Full Local Source Scan

**Purpose:** Make the audit an actual materializability check, not only a blocker reporter.

**Files:**

- Modify: `scripts/data/audit/audit-missing-mimic-variant-loot.mjs`
- Modify: `scripts/data/audit/audit-missing-mimic-variant-loot.test.mjs`
- Generate when run: `reports/audit/missing-mimic-variant-loot-2026-05-09.json`

**Prerequisites:**

- The audit may write a report file, but it must not write DB rows.
- `terria_v1_local` and `terria_v1_relation` must be reachable for relation/local materialization counts. If DB is unavailable, the audit result must set top-level `auditStatus = "blocked"` and `evidenceHealth = "db_unavailable"`; it cannot be used for a merge decision.

**Candidate sources to scan:**

- `data/wiki-crawler/report/npc/coverage-audit.latest.json`
- `data/wiki-crawler/report/npc/coverage-targets.latest.json`
- `data/wiki-crawler/output/**`
- `data/wiki-crawler/audit/npc/*.latest.json`
- `data/standardized/npcs.standardized.json`
- `data/generated/npc-standardized-map.json`
- `reports/normal-npc-loot-*.json`
- relation DB controls:
  - `terria_v1_relation.item_source_facts`
  - `terria_v1_relation.item_source_details`
  - `terria_v1_relation.item_npc_loot_relations`
  - `terria_v1_relation.projection_npcs`

**Scan bounds:**

- Only parse `.json`, `.jsonl`, and `.ndjson` files unless the test fixture explicitly covers another format.
- Skip files larger than `25 MB` and record them as `artifact_skipped_too_large`.
- Do not scan `node_modules`, `.git`, build output, cache directories, or MinIO object stores.
- For globbed sources such as `data/wiki-crawler/output/**` and `reports/normal-npc-loot-*.json`, record scanned file count, skipped file count, unreadable file count, and matched evidence file count.
- JSON parse failures must produce `artifact_unreadable`; they must not be interpreted as missing source.

**Required audit semantics:**

- Missing directories/files are recorded as `artifact_not_found`, not silently ignored.
- `hasDirectLocalSourceArtifact` must be computed from scanned artifacts, not hardcoded.
- Top-level artifact health must be recorded separately from target source status. A parse failure in one artifact must not make every target `artifact_unreadable` if other valid evidence was scanned.
- Each target `candidateStatus` must be classified as one of:
  - `already_materialized`
  - `source_found`
  - `generic_bucket_only`
  - `missing_source`
- `source_found` requires variant-specific source evidence for that Mimic, not generic `Mimics` bucket evidence.
- If every relevant artifact for a target is missing or unreadable, the target remains `missing_source` and carries `evidenceHealth = "insufficient_artifacts"`.
- If at least one relevant artifact is unreadable, include the unreadable path and error category in `artifactStatuses`; do not silently downgrade it to missing source.
- Existing good controls must remain `already_materialized`:
  - `Mimic`
  - `IceMimic`
  - `WaterBoltMimic`

**Minimum report schema additions:**

- top-level `auditStatus` with `pass`, `warning`, or `blocked`
- `artifactStatuses[]` with `path`, `status`, `fileSizeBytes`, `reason`, and optional `errorCode`
- `scanSummary` with `scannedFileCount`, `skippedFileCount`, `unreadableFileCount`, and `matchedEvidenceFileCount`
- per-target `candidateStatus`, `evidenceHealth`, `sourceArtifacts[]`, `candidateDropCount`, `resolvedItemCount`, and `unresolvedItemCount`

**Targets:**

- `PresentMimic`
- `BigMimicCorruption`
- `BigMimicCrimson`
- `BigMimicHallow`
- `BigMimicJungle`

**Tests to add or update:**

- [ ] CLI parse tests use names that match behavior: default `writeReport=true` is acceptable for report-generation mode, while Phase 0 explicitly uses `--write-report=false` for no-overwrite baseline checks.
- [ ] A fixture with variant-specific local evidence yields `source_found`.
- [ ] A fixture with only generic `Mimics` bucket yields `generic_bucket_only`.
- [ ] Missing source directories are reported in `artifactStatuses`.
- [ ] One unreadable artifact does not force a target to `missing_source` when another readable artifact has variant-specific evidence.
- [ ] The audit no longer contains a hardcoded false source decision.
- [ ] Controls with existing relation/projection/local rows remain `already_materialized`.

**Validation:**

```powershell
node --test scripts/data/audit/audit-missing-mimic-variant-loot.test.mjs
node scripts/data/audit/audit-missing-mimic-variant-loot.mjs --write-report=true --date-tag=2026-05-09
```

**Exit gate:**

- The report can prove either that local source evidence exists or that the current repo only has generic/absent evidence.
- Merge decision can rely on the audit without caveat that source scanning was incomplete.

---

## Phase 3: Decide Materialization Path From Audit Result

**Purpose:** Avoid writing data before proving local source materializability.

### Case A: Audit Finds Variant-Specific Local Source

Do not apply DB writes directly from this plan. If Phase 2 proves variant-specific local source evidence exists, stop and create a separate backfill execution plan with exact script files, dry-run commands, rollback procedure, and table-level pre/post-count SQL. Do not improvise apply steps inside this plan.

**Required write path for the separate backfill plan:**

1. Prepare upstream maint/source input rows with traceable source metadata.
2. Run relation/projection rebuild through the established snapshot writer.
3. Sync projection to local `npcs.loot_items_json`.
4. Sync relation compatibility rows for admin/public detail endpoints.

**Required before any apply command:**

- A dry-run report exists for the exact variant set.
- Target DB name is recorded.
- Pre-count SQL is recorded for every table that will change.
- Rollback or backup table/report names are recorded.
- No other task is writing the same DB tables.
- The new backfill plan is reviewed before any apply command is executed. A runnable script may contain an apply mode only if it is guarded behind an explicit `--apply=true` flag and has a dry-run default.

**Required dry-run fields:**

- target Mimic
- source artifact path
- source evidence key or hash
- item resolution result
- rows planned per table
- backup/report names
- unresolved item count

**Stop conditions:**

- Any item cannot resolve to local `items`.
- Evidence lacks source page/provider/landing metadata.
- The proposed write path direct-writes relation snapshots that would be overwritten by `sync-maint-to-relation.mjs`.

### Case B: Audit Finds Only Generic Bucket Or Missing Source

Do not backfill rows.

**Required closeout:**

- Keep runtime detail truthful: structured loot remains empty for those Mimic variants.
- Record a blocker/TODO for crawler or source import to obtain variant-specific loot evidence.
- Do not merge any code that claims Mimic loot is fixed through data materialization.
- It is acceptable to merge the Buff API fix plus honest Mimic audit only if docs clearly state Mimic variant loot remains blocked by source evidence.

**Exit gate:**

- The branch has a clear merge shape:
  - mergeable as Buff fix + source-gap audit, or
  - blocked until a real source import/backfill exists.

---

## Phase 4: Runtime Contract Review

**Purpose:** Ensure admin UI and APIs present local truth, not stale raw JSON or UI fabrication.

**Files:**

- Read first: `data-query-app/pages/entities/[type].vue`
- Read first: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Read first: `back/src/main/java/com/terraria/skills/controller/AdminNpcRelationController.java`
- Read first: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`

Only modify these files if the read-only contract review proves an existing consumer violates the checks below.

**Checks:**

- [ ] Buff detail renders `immuneNpcSamples` as normal cards only when rows are resolved local NPCs.
- [ ] `unresolvedImmuneNpcSamples` is not rendered as normal NPC cards.
- [ ] NPC detail uses structured local/relation payloads for loot.
- [ ] Missing Mimic variant loot shows a truthful empty/local-data-missing state.
- [ ] No UI path pulls crawler output or wiki data directly to fill runtime detail rows.
- [ ] `/admin/npcs/{id}/loot`, `/admin/npcs/{id}/derived-loot`, and `/public/npcs/{id}/aggregate?include=loot` agree with local DB truth.

**Validation if files change:**

```powershell
cd back
mvn "-Dtest=AdminBuffControllerTest,AdminNpcControllerTest,AdminNpcRelationControllerTest,PublicNpcAggregateControllerTest" test
cd ..\data-query-app
pnpm run check
```

**Exit gate:**

- Screenshots that triggered this work map to either fixed resolved data or a documented source gap.

---

## Phase 5: Closeout Audit, TODO, And Merge Review

**Purpose:** Make final merge decision evidence-based.

**Files:**

- Modify: `docs/audits/2026-05-09_buff-npc-loot-detail-closeout.md`
- Modify: `docs/todo/backlog.md`
- Read: `git status --short`
- Read: `git diff main...HEAD --stat`

**Required closeout contents:**

- Buff exact/single-alias/ambiguous/unresolved counts after fix.
- API contract summary for `immuneNpcSamples` and `unresolvedImmuneNpcSamples`.
- Mimic audit summary by target.
- Mimic report artifact handling:
  - report path
  - whether the report file is git-tracked, untracked, or ignored
  - report hash or stable summary if the file is not committed
- Whether Mimic variant loot is materialized or blocked by missing local source evidence.
- Test commands and results.
- Manual pages or API endpoints checked.
- Remaining TODO entries with explicit owner category:
  - source import gap
  - crawler coverage gap
  - runtime contract gap

**Merge gate:**

- `git status --short` is clean.
- Backend targeted tests pass.
- Node audit tests pass.
- Mimic audit report was regenerated after script changes.
- If the regenerated audit report is not committed, the closeout audit records its path, status, and hash or stable summary.
- The closeout audit does not claim fixed data where only a source gap was proven.
- If Mimic remains blocked, the commit message and docs must describe the branch as Buff fix plus Mimic source-gap audit, not a complete Mimic loot repair.

---

## Multi-Agent Execution Model

Recommended dispatch:

- Agent A: Buff resolver tests and contract review. Read `AdminBuffController` and test file only. Output exact failing tests and expected payload fields.
- Agent B: Mimic audit source scanner design. Read audit script, existing reports, and local artifact structure. Output scan coverage and fixture requirements.
- Agent C: Runtime display review. Read admin page and NPC/Buff controller payloads. Output whether UI changes are required after backend contract settles.

Serial integration:

1. Main agent edits `AdminBuffController` and `AdminBuffControllerTest`.
2. Main agent edits Mimic audit script/tests.
3. Main agent runs tests and regenerates the audit report.
4. Main agent reviews whether Phase 3 is Case A or Case B.
5. Main agent updates closeout audit and TODO.
6. Main agent performs final merge review.

Parallelism limits:

- No two agents edit the same file.
- No DB apply/backfill runs in parallel.
- No agent direct-writes relation/projection/local tables during source scanning.

---

## Final Completion Criteria

This branch can be merged only when all are true:

- `immuneNpcSamples` has no normal card rows with `npcId=null`.
- Alias-resolvable and ambiguous local Buff samples resolve to local NPC representatives with clear metadata.
- `unresolvedImmuneNpcSamples` contains only rows with no local NPC candidate.
- Mimic audit scans all declared local candidate sources and no longer relies on hardcoded missing-source logic.
- Mimic variant loot is either materialized through a separately reviewed backfill execution plan, or documented as blocked by missing variant-specific local source evidence.
- Tests and reports listed in this plan have been rerun after the final code change.
- Closeout docs and TODOs match the actual branch behavior.
