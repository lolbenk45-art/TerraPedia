# Item Source Final Closure Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the TerraPedia item acquisition source gap by proving all ordinary item sources are applied to local DB, all missing raw evidence rows are resolved, and the remaining rows are classified as non-ordinary-source closure states.

**Architecture:** Treat the refreshed local DB and read-only reports as the closure source of truth. All DB writes must go through `scripts/data/relation/apply-item-source-candidate-local-compat.mjs` after dry-run gates; crawler, import, backfill, sync, pipeline, Flyway, destructive SQL, and hand-written SQL data mutation stay out of scope. Multi-agent review is used only for read-only cross-checking of evidence, safety boundaries, and delivery readiness.

**Tech Stack:** Node.js audit scripts, MySQL local DB `terria_v1_local` on `127.0.0.1:13306`, wiki.gg MediaWiki API evidence, TerraPedia JSON/Markdown reports, git.

---

## Closure Definition

This task is closed only when these machine-readable states are true in the refreshed reports:

- `missing_required_raw_evidence = 0`
- `family_policy_pending = 0`
- `candidate_import_not_applied = 0`
- `blockedSourceRowsRemaining = 0`
- `blockedSourceCandidatesRemaining = 0`
- `canClaimAllOrdinarySourcesAppliedToDb = true`
- Jellyfish bait local DB check returns `3` active source rows for item IDs `8416`, `8417`, and `8418`
- Identity-corrected set vanity items `8423`, `8424`, and `8425` each have `2` active source rows.
- Stale wrong-identity rows `198875` through `198880` are retired as `status=0/deleted=1`; item IDs `5049`, `5051`, and `5063` do not keep the Wandering/Timeless Traveler/TV Head set source rows.

Remaining non-ordinary rows are allowed only in these already-classified lanes:

- explicit source exemption: `30 rows / 23 candidates`
- NPC/biome public projection: `17 rows`, with `17/17` closed by public contract
- terminal/identity exemption: `19 rows`

## Hard Boundaries

- Do not run crawler, fetch, import, backfill, sync, pipeline, or Flyway.
- Do not run `--apply=true` except through `scripts/data/relation/apply-item-source-candidate-local-compat.mjs` with `--confirm-local-compat=true`.
- Do not hand-write SQL data mutation.
- Do not write production or non-local DB.
- Do not use `git add .`.
- Do not revert unrelated dirty worktree changes.
- Treat `data/reports/item-source-remaining-closure-2026-06-11-current.json` as existing dirty tracked state; do not overwrite or revert it unless explicitly requested.

## Source Of Truth

- Local DB: `terria_v1_local`
- Ordinary source table: `item_acquisition_sources`
- Current evidence report: `data/reports/item-source-existing-evidence-layers-2026-06-12.json`
- Current work-items report: `data/reports/item-source-remaining-work-items-report-2026-06-12.json`
- Current final closure report: `data/reports/item-source-final-closure-status-2026-06-12.json`
- User-readable final summary: `data/reports/item-source-final-closure-status-summary-zh-2026-06-12.md`
- Jellyfish API candidate plan: `data/reports/item-source-candidate-import-plan-jellyfish-bait-2026-06-13.json`
- Jellyfish apply evidence: `data/reports/item-source-candidate-local-compat-apply-jellyfish-bait-2026-06-13.json`
- Family full apply evidence: `data/reports/item-source-candidate-local-compat-apply-family-full-2026-06-13.json`
- Identity correction candidate plan: `data/reports/item-source-candidate-import-plan-identity-correction-2026-06-13.json`
- Identity correction apply evidence: `data/reports/item-source-candidate-local-compat-apply-identity-correction-2026-06-13.json`
- Stale identity retire evidence: `data/reports/item-source-local-compat-retire-stale-identity-apply-2026-06-13.json`

## Multi-Agent Split

### Agent A: Evidence And DB Closure Review

**Ownership:** read-only review of JSON reports and local DB counts.

- [ ] Verify `item-source-existing-evidence-layers-2026-06-12.json` has `missing_required_raw_evidence=0`, `family_policy_pending=0`, `candidate_import_not_applied=0`, and `item_only_no_source_evidence=0`.
- [ ] Verify `item-source-remaining-work-items-report-2026-06-12.json` has no family, blocked source, or missing raw work rows.
- [ ] Verify local DB has active source rows for `8416`, `8417`, `8418`, and identity-corrected rows for `8423`, `8424`, `8425`.
- [ ] Verify stale wrong-identity row IDs `198875`-`198880` are retired.
- [ ] Report any mismatch with exact file path, JSON field, or SQL result.

### Agent B: Safety Boundary Review

**Ownership:** read-only review of command history evidence and plan boundaries.

- [ ] Verify Jellyfish evidence came from wiki.gg MediaWiki API page `Jellyfish (bait)`, revision `938787`, timestamp `2025-06-22T18:27:29Z`.
- [ ] Verify set vanity identity correction uses DB item identity checks and does not trust stale standardized item IDs.
- [ ] Verify DB writes were only via `scripts/data/relation/apply-item-source-candidate-local-compat.mjs`.
- [ ] Verify apply reports contain rollback SQL and local DB connection metadata.
- [ ] Verify no crawler/fetch/import/backfill/sync/pipeline/Flyway step is required for closure.

### Agent C: Delivery And Git Readiness Review

**Ownership:** read-only review of generated artifacts, tests, and commit scope.

- [ ] Verify final Chinese summary says ordinary sources are applied and missing raw rows are `0`.
- [ ] Verify related tests pass or the plan names the exact test command required before commit.
- [ ] Verify `git diff --check` passes.
- [ ] Identify files that should be included in a focused commit, without using `git add .`; block the plan if closure scripts/tests are omitted or unrelated `back/`, `front-nuxt/`, or bulk backup files are included.

## Task 1: Verify Current Closure State

**Files:**

- Read: `data/reports/item-source-existing-evidence-layers-2026-06-12.json`
- Read: `data/reports/item-source-remaining-work-items-report-2026-06-12.json`
- Read: `data/reports/item-source-final-closure-status-2026-06-12.json`

- [x] **Step 1: Read current machine-readable closure summary**

Run:

```bash
node - <<'NODE'
const fs=require('fs');
const layers=JSON.parse(fs.readFileSync('data/reports/item-source-existing-evidence-layers-2026-06-12.json','utf8'));
const work=JSON.parse(fs.readFileSync('data/reports/item-source-remaining-work-items-report-2026-06-12.json','utf8'));
const final=JSON.parse(fs.readFileSync('data/reports/item-source-final-closure-status-2026-06-12.json','utf8'));
console.log(JSON.stringify({layers:layers.summary.layerCounts, work:work.summary, final:final.summary}, null, 2));
NODE
```

Expected:

- `layers.missing_required_raw_evidence = 0`
- `layers.family_policy_pending = 0`
- `layers.candidate_import_not_applied = 0`
- `work.missingRawRequiredRows = 0`
- `work.familyPolicyPendingClosureRows = 0`
- `work.blockedSourceRows = 0`
- `final.canClaimAllOrdinarySourcesAppliedToDb = true`

- [x] **Step 2: Verify local DB active/retired source rows**

Run:

```bash
mysql -h127.0.0.1 -P13306 -uroot -proot terria_v1_local -e "SELECT s.item_id, i.internal_name, i.name, COUNT(*) AS active_sources FROM item_acquisition_sources s JOIN items i ON i.id=s.item_id WHERE s.item_id IN (5049,5051,5063,8416,8417,8418,8423,8424,8425) AND s.status=1 AND s.deleted=0 GROUP BY s.item_id, i.internal_name, i.name ORDER BY s.item_id; SELECT id,item_id,source_page,status,deleted FROM item_acquisition_sources WHERE id BETWEEN 198875 AND 198880 OR id BETWEEN 199766 AND 199771 ORDER BY id;"
```

Expected:

```text
8416 Pink Jellyfish (bait): active_sources=1
8417 Green Jellyfish (bait): active_sources=1
8418 Blue Jellyfish (bait): active_sources=1
8423 Wandering Yukata: active_sources=2
8424 Timeless Traveler's Hood: active_sources=2
8425 Pinstripe Pants: active_sources=2
198875-198880: status=0/deleted=1
199766-199771: status=1/deleted=0
```

## Task 2: Preserve Already-Executed Source Evidence

**Files:**

- Read: `data/reports/item-source-candidate-import-plan-jellyfish-bait-2026-06-13.json`
- Read: `data/reports/item-source-candidate-local-compat-dry-run-jellyfish-bait-2026-06-13.json`
- Read: `data/reports/item-source-candidate-local-compat-apply-jellyfish-bait-2026-06-13.json`
- Read: `data/reports/item-source-candidate-import-plan-identity-correction-2026-06-13.json`
- Read: `data/reports/item-source-candidate-local-compat-dry-run-identity-correction-2026-06-13.json`
- Read: `data/reports/item-source-candidate-local-compat-apply-identity-correction-2026-06-13.json`
- Read: `data/reports/item-source-local-compat-retire-stale-identity-2026-06-13.json`
- Read: `data/reports/item-source-local-compat-retire-stale-identity-apply-2026-06-13.json`

This task records evidence already gathered and applied in the current local DB. Do not re-run wiki fetches or historical apply commands from this section.

- [x] **Step 1: Preserve Jellyfish bait source evidence**

Evidence:

- Source page: `Jellyfish (bait)`
- Revision: `938787`
- Revision timestamp: `2025-06-22T18:27:29Z`
- Blue Jellyfish bait: fishing in Underground or Cavern water.
- Green Jellyfish bait: fishing in Underground or Cavern water, Hardmode only.
- Pink Jellyfish bait: fishing in Ocean biome.
- These bait items are not the Jellyfish enemy items and are not Bug Net captures.

Recorded local-compat evidence:

- Candidate plan: `data/reports/item-source-candidate-import-plan-jellyfish-bait-2026-06-13.json`
- Dry-run before apply: `selectedCandidates=3`, `plannedRows=3`, `blockedRows=0`, `validationErrors=0`, `toInsert=3`
- Apply evidence: `toInsert=3`, `inserted=3`, inserted row IDs `199763`, `199764`, `199765`
- Post-apply dry-run: `duplicates=3`, `toInsert=0`, `blockedRows=0`, `validationErrors=0`

- [x] **Step 2: Preserve identity-correction evidence for set vanity items**

High-review blocker repaired:

- Stale plan IDs mapped `RoninShirt`, `TimelessTravelerHood`, and `TVHeadPants` to wrong current DB item IDs `5049`, `5051`, and `5063`.
- The local-compat script now validates DB item identity before insert, so stale ID rows fail with `item_identity_mismatch`.
- Wrong active source rows `198875` through `198880` were retired only after exact row matching.
- Correct source rows were inserted for current DB item IDs `8423`, `8424`, and `8425`.

Recorded local-compat evidence:

- Corrected candidate plan: `data/reports/item-source-candidate-import-plan-identity-correction-2026-06-13.json`
- Dry-run before insert: `selectedCandidates=3`, `plannedRows=6`, `blockedRows=0`, `validationErrors=0`, `duplicates=0`, `toInsert=6`
- Retire apply evidence: `selectedRows=6`, `validationErrors=0`, `toRetire=6`, `retired=6`
- Correct insert apply evidence: `selectedCandidates=3`, `plannedRows=6`, `blockedRows=0`, `validationErrors=0`, `duplicates=0`, `toInsert=6`, `inserted=6`
- Post-apply insert dry-run: `duplicates=6`, `toInsert=0`, `validationErrors=0`

## Task 3: Refresh Read-Only Closure Reports

**Files:**

- Update: `data/reports/item-source-existing-evidence-layers-2026-06-12.json`
- Update: `data/reports/item-source-existing-evidence-layers-summary-zh-2026-06-12.md`
- Update: `data/reports/item-source-remaining-work-items-report-2026-06-12.json`
- Update: `data/reports/item-source-remaining-work-items-summary-zh-2026-06-12.md`
- Update: `data/reports/item-source-remaining-treatment-report-2026-06-12.json`
- Update: `data/reports/item-source-remaining-treatment-summary-zh-2026-06-12.md`
- Update: `data/reports/item-source-final-closure-status-2026-06-12.json`
- Update: `data/reports/item-source-final-closure-status-summary-zh-2026-06-12.md`

- [x] **Step 1: Refresh evidence layers**

Run:

```bash
node scripts/data/audit/audit-item-source-existing-evidence-layers.mjs \
  --output=data/reports/item-source-existing-evidence-layers-2026-06-12.json \
  --summary-output=data/reports/item-source-existing-evidence-layers-summary-zh-2026-06-12.md
```

Expected:

- `missingRequiredRawEvidence=0`
- `familyPolicyPending=0`
- `candidateImportNotApplied=0`

- [x] **Step 2: Refresh downstream reports in dependency order**

Run:

```bash
node scripts/data/audit/build-item-source-remaining-work-items-report.mjs \
  --output=data/reports/item-source-remaining-work-items-report-2026-06-12.json \
  --summary-output=data/reports/item-source-remaining-work-items-summary-zh-2026-06-12.md

node scripts/data/audit/build-item-source-remaining-treatment-report.mjs \
  --output=data/reports/item-source-remaining-treatment-report-2026-06-12.json \
  --summary-output=data/reports/item-source-remaining-treatment-summary-zh-2026-06-12.md

node scripts/data/audit/build-item-source-final-closure-status-report.mjs \
  --verify-local-db=true \
  --dry-run-report=data/reports/item-source-candidate-local-compat-apply-family-full-2026-06-13.json \
  --output=data/reports/item-source-final-closure-status-2026-06-12.json \
  --summary-output=data/reports/item-source-final-closure-status-summary-zh-2026-06-12.md
```

Expected:

- `missingRawRequiredRows=0`
- `missingRawRows=0`
- `familyPolicyRowsAwaitingParser=0`
- `blockedSourceRowsRemaining=0`
- `canClaimAllOrdinarySourcesAppliedToDb=true`

## Task 4: Validate

**Files:**

- Test: `scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs`
- Test: `scripts/data/audit/build-item-source-remaining-work-items-report.test.mjs`
- Test: `scripts/data/audit/build-item-source-remaining-treatment-report.test.mjs`
- Test: `scripts/data/audit/build-item-source-final-closure-status-report.test.mjs`
- Test: `scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs`
- Test: `back/src/test/java/com/terraria/skills/service/impl/ItemSourceServiceImplTest.java`
- Test: `back/src/test/java/com/terraria/skills/controller/PublicItemRelationControllerTest.java`
- Typecheck: `front-nuxt/pages/items/[id].vue`
- Typecheck: `front-nuxt/types/public-api.ts`

- [x] **Step 1: Run focused tests**

Run:

```bash
node --test \
  scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs \
  scripts/data/audit/build-item-source-remaining-work-items-report.test.mjs \
  scripts/data/audit/build-item-source-remaining-treatment-report.test.mjs \
  scripts/data/audit/build-item-source-final-closure-status-report.test.mjs \
  scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs
```

Expected:

- `39/39 pass`

- [x] **Step 2: Run public projection backend tests**

Run:

```bash
cd back && mvn -Dtest=ItemSourceServiceImplTest,PublicItemRelationControllerTest test
```

Expected:

- `Tests run: 23, Failures: 0, Errors: 0, Skipped: 0`
- `BUILD SUCCESS`

- [x] **Step 3: Run public item page typecheck**

Run:

```bash
cd front-nuxt && pnpm exec nuxt typecheck
```

Expected:

- exit code `0`
- Node `DEP0205` deprecation warning is acceptable; type errors are not.

- [x] **Step 4: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

### Latest Validation Evidence

- Focused Node tests: `39/39 pass`.
- Backend public projection tests: `Tests run: 23, Failures: 0, Errors: 0, Skipped: 0`; `BUILD SUCCESS`.
- Front public item page typecheck: `pnpm exec nuxt typecheck` exited `0`; Node `DEP0205` deprecation warning observed, no type errors.
- DB smoke: `8416`, `8417`, `8418` each have `1` active source; `8423`, `8424`, `8425` each have `2` active sources; `198875`-`198880` are `status=0/deleted=1`; `199766`-`199771` are `status=1/deleted=0`.
- `git diff --check`: exit code `0`.

## Task 5: Commit And Delivery Readiness

**Files:**

- Review: `git status --short`
- Stage only focused files; do not use `git add .`.

- [ ] **Step 1: Inspect worktree**

Run:

```bash
git status --short
```

Expected:

- Worktree is dirty with this task plus prior related files and reports.
- Do not revert unrelated tracked or untracked files.

- [ ] **Step 2: Stage focused closure artifacts**

Use explicit paths only. Candidate scope must include both the generated closure reports and the scripts/tests that make those reports reproducible:

```bash
git add \
  docs/superpowers/plans/2026-06-13-item-source-final-closure-delivery.md \
  docs/superpowers/plans/2026-06-12-item-source-existing-evidence-cross-audit.md \
  docs/superpowers/plans/2026-06-12-item-source-final-closure-all-remaining.md \
  docs/superpowers/plans/2026-06-12-item-source-remaining-evidence-closure-treatment.md \
  docs/superpowers/plans/2026-06-13-item-source-family-full-processing-readiness.md \
  docs/superpowers/plans/2026-06-13-item-source-family-policy-parser-closure.md \
  scripts/data/audit/audit-item-source-existing-evidence-layers.mjs \
  scripts/data/audit/audit-item-source-existing-evidence-layers.test.mjs \
  scripts/data/audit/build-item-source-family-full-processing-readiness-report.mjs \
  scripts/data/audit/build-item-source-family-full-processing-readiness-report.test.mjs \
  scripts/data/audit/build-item-source-final-closure-status-report.mjs \
  scripts/data/audit/build-item-source-final-closure-status-report.test.mjs \
  scripts/data/audit/build-item-source-focused-candidate-plan-from-evidence.mjs \
  scripts/data/audit/build-item-source-focused-candidate-plan-from-evidence.test.mjs \
  scripts/data/audit/build-item-source-remaining-treatment-report.mjs \
  scripts/data/audit/build-item-source-remaining-treatment-report.test.mjs \
  scripts/data/audit/build-item-source-remaining-work-items-report.mjs \
  scripts/data/audit/build-item-source-remaining-work-items-report.test.mjs \
  scripts/data/audit/build-item-source-candidate-import-plan.mjs \
  scripts/data/audit/build-item-source-candidate-import-plan.test.mjs \
  scripts/data/relation/apply-item-source-candidate-local-compat.mjs \
  scripts/data/relation/apply-item-source-candidate-local-compat.test.mjs \
  back/src/main/java/com/terraria/skills/dto/ItemSourceDTO.java \
  back/src/main/java/com/terraria/skills/dto/PublicItemSourceDTO.java \
  back/src/main/java/com/terraria/skills/service/impl/ItemSourceServiceImpl.java \
  back/src/test/java/com/terraria/skills/controller/PublicItemRelationControllerTest.java \
  back/src/test/java/com/terraria/skills/service/impl/ItemSourceServiceImplTest.java \
  front-nuxt/pages/items/[id].vue \
  front-nuxt/types/public-api.ts \
  data/reports/item-source-candidate-import-plan-jellyfish-bait-2026-06-13.json \
  data/reports/item-source-candidate-import-plan-identity-correction-2026-06-13.json \
  data/reports/item-source-candidate-local-compat-dry-run-jellyfish-bait-2026-06-13.json \
  data/reports/item-source-candidate-local-compat-dry-run-identity-correction-2026-06-13.json \
  data/reports/item-source-candidate-local-compat-apply-jellyfish-bait-2026-06-13.json \
  data/reports/item-source-candidate-local-compat-apply-identity-correction-2026-06-13.json \
  data/reports/item-source-local-compat-retire-stale-identity-2026-06-13.json \
  data/reports/item-source-local-compat-retire-stale-identity-apply-2026-06-13.json \
  data/reports/item-source-candidate-import-plan.remaining-2026-06-12.json \
  data/reports/item-source-candidate-local-compat-dry-run-2026-06-12.json \
  data/reports/item-source-candidate-local-compat-apply-family-full-2026-06-13.json \
  data/reports/item-source-existing-evidence-layers-2026-06-12.json \
  data/reports/item-source-existing-evidence-layers-summary-zh-2026-06-12.md \
  data/reports/item-source-family-full-processing-readiness-2026-06-13.json \
  data/reports/item-source-family-full-processing-readiness-summary-zh-2026-06-13.md \
  data/reports/item-source-remaining-work-items-report-2026-06-12.json \
  data/reports/item-source-remaining-work-items-summary-zh-2026-06-12.md \
  data/reports/item-source-remaining-treatment-report-2026-06-12.json \
  data/reports/item-source-remaining-treatment-summary-zh-2026-06-12.md \
  data/reports/item-source-final-closure-status-2026-06-12.json \
  data/reports/item-source-final-closure-status-summary-zh-2026-06-12.md
```

Do not stage these unless a separate user request explicitly expands the commit scope:

- `back/**` outside the seven explicit public projection files listed above
- `front-nuxt/**` outside `front-nuxt/pages/items/[id].vue` and `front-nuxt/types/public-api.ts`
- `data/backups/item-source-candidate-local-compat/**`
- unrelated `data/reports/item-source-candidate-local-compat-apply-*.json` historical batches not referenced by this plan
- `data/reports/item-source-remaining-closure-summary-zh-2026-06-12.md`
- `data/reports/item-source-local-compat-retire-stale-identity-dry-run-2026-06-13.json`
- unrelated tracked dirty files outside item-source closure scripts, plans, and reports

- [ ] **Step 3: Verify staged scope**

Run:

```bash
git diff --cached --stat
git diff --cached --name-only
```

Expected:

- Only item-source closure scripts, tests, plans, reports, and the focused public projection backend/frontend files listed in Step 2 are staged.
- No unrelated files are staged.

- [ ] **Step 4: Commit**

Run:

```bash
git commit -m "chore(data): close item source evidence gaps"
```

Expected:

- Commit succeeds.
- Commit message reflects item source closure, not generic cleanup.

## Multi-Agent Review Record

### Agent A: Evidence And DB Closure Review

- Status: PENDING HIGH RE-REVIEW after identity correction.
- Latest local evidence: `missing_required_raw_evidence=0`, `family_policy_pending=0`, `candidate_import_not_applied=0`, `item_only_no_source_evidence=0`; work-items has `missingRawRequiredRows=0`, `familyPolicyPendingClosureRows=0`, `blockedSourceRows=0`; final summary has `canClaimAllOrdinarySourcesAppliedToDb=true`.
- Latest DB smoke: item IDs `8416`, `8417`, and `8418` each have `1` active source row; item IDs `8423`, `8424`, and `8425` each have `2` active source rows; row IDs `198875`-`198880` are retired.
- Required review: confirm no identity-corrected item remains in `raw_candidate_not_projected`.

### Agent B: Safety Boundary Review

- Status: PENDING HIGH RE-REVIEW after plan repair.
- Latest local evidence: Jellyfish evidence is recorded as wiki.gg API page `Jellyfish (bait)` revision `938787`; Jellyfish, family full, identity correction, and stale identity retire apply reports target `terria_v1_local`, have inserted/retired counts and rollback SQL.
- Plan repair: historical `curl`, `--apply=true`, and rollback SQL snippets were removed from Task 2 and replaced by already-executed evidence records.
- Required review: confirm this MD no longer induces crawler/fetch/import/backfill/sync/pipeline/Flyway, wiki fetch, direct SQL mutation, or re-running historical apply steps.

### Agent C: Delivery And Git Readiness Review

- Status: PENDING HIGH RE-REVIEW after public projection scope repair.
- Initial issue: fixed staging scope omitted closure scripts/tests and could let unrelated dirty files be staged by mistake.
- Second issue: `17/17 public projection` depends on focused backend/frontend projection files, so excluding all `back/**` and `front-nuxt/**` would leave the delivery inconsistent.
- Repair: Task 4 now includes backend projection tests and front typecheck. Task 5 now lists the seven focused backend/frontend projection files while still excluding unrelated `back/**`, `front-nuxt/**`, bulk backup files, stale `item-source-remaining-closure-summary-zh-2026-06-12.md`, and unrelated historical apply batches.
- Required review: confirm identity correction reports, retire evidence, projection code/tests, and report scripts are included in focused commit scope.

## Residual Risk

- The remaining `30` explicit exemption rows, `17` projection rows, and `19` terminal/identity rows are not ordinary source gaps. They must stay visible in reports so future work does not mistake them for missing imports.
- The closure reports are local-DB based. Production or shared environments require their own guarded apply and verification process; this plan does not perform that.
- If future audit scripts change precedence order, rerun Task 1 and Task 4 before claiming closure again.
