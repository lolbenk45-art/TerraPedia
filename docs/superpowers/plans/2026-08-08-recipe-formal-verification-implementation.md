# Recipe Formal Read-Only Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Produce trustworthy read-only evidence for the completed formal Recipe apply and make Recipe readiness reject overwritten or drifted evidence.

**Architecture:** A shared contract owns canonical `wiki_zh` projection normalization and hashing. A verifier binds current input bytes, the embedded applied pipeline result, and formal database readback into one canonical report. Domain readiness validates that report semantically and no longer accepts a standalone import report merely because it exists.

**Tech Stack:** Node.js ESM, `node:test`, `mysql2` through the repository loader, existing domain-readiness helpers, JSON evidence.

---

## File Map

- Create `scripts/data/recipe/recipe-formal-contract.mjs` and its test for pure projection/hash/report helpers.
- Create `scripts/data/recipe/recipe-formal-verification.mjs` and its test for read-only collection and evidence comparison.
- Modify `scripts/data/import/import-wiki-zh-recipes-to-db.mjs` and its test to use the shared projection contract without behavior change.
- Modify `scripts/data/audit/domain-readiness-audit.mjs` and its test to require canonical verification evidence.
- Create `reports/canonical-migration/canonical-recipe-formal-verification.json` as retained live evidence.
- Modify the active Recipe devlog and `docs/devlog/current.md` for closeout.

### Task 1: Freeze The Shared Projection Contract

**Files:**
- Create: `scripts/data/recipe/recipe-formal-contract.mjs`
- Create: `scripts/data/recipe/recipe-formal-contract.test.mjs`
- Modify: `scripts/data/import/import-wiki-zh-recipes-to-db.mjs`
- Modify: `scripts/data/import/import-wiki-zh-recipes-to-db.test.mjs`

- [x] **Step 1: Write failing canonical normalization and hashing tests**

Prove database IDs are excluded, relation ordering is stable, and the existing hash remains unchanged:

```js
assert.equal(
  hashWikiZhRecipeProjection(normalizeWikiZhExistingRecipeProjection(recipes, ingredients, stations)),
  expectedHash,
);
```

- [x] **Step 2: Run RED**

```bash
node --test scripts/data/recipe/recipe-formal-contract.test.mjs scripts/data/import/import-wiki-zh-recipes-to-db.test.mjs
```

Expected: failure because the contract module does not exist.

- [x] **Step 3: Extract the pure contract**

Export `RECIPE_SOURCE_PROVIDER`, `normalizeWikiZhExistingRecipeProjection`, `hashWikiZhRecipeProjection`, and `sha256FileBytes`. Preserve the exact prefix `v1:recipes:wiki_zh:` and nullable coercions. Import them in the importer; do not change SQL or apply behavior.

- [x] **Step 4: Run GREEN**

Run the command from Step 2. Expected: all tests pass.

### Task 2: Implement The Read-Only Verifier Test-First

**Files:**
- Create: `scripts/data/recipe/recipe-formal-verification.mjs`
- Create: `scripts/data/recipe/recipe-formal-verification.test.mjs`

- [x] **Step 1: Write an injected pass fixture**

Build temporary current input, pipeline summary, and overwritten standalone artifacts. Inject a fake connection returning exact total and `wiki_zh` rows. Assert:

```js
assert.equal(report.status, 'passed');
assert.equal(report.mode, 'read-only');
assert.equal(report.standaloneImport.classification, 'superseded-invalid');
assert.equal(report.formalScope.projectionHash, report.appliedPipeline.import.recipeScopeHashTarget);
assert.equal(report.writesAttempted, false);
```

- [x] **Step 2: Write fail-closed cases**

Cover wrong input hash/count, `apply=false` embedded import, wrong database, missing consolidation, formal count/hash drift, unresolved relations, and any mutation SQL passed through the adapter.

- [x] **Step 3: Run RED**

```bash
node --test scripts/data/recipe/recipe-formal-verification.test.mjs
```

Expected: module/function missing.

- [x] **Step 4: Implement comparison and read-only collection**

Export `buildRecipeFormalVerification` for tests and `runRecipeFormalVerification` for the CLI. Query totals plus complete `wiki_zh` recipes, ingredients, and stations for the shared hash. Reject SQL whose first token is not `SELECT`, `SHOW`, or `EXPLAIN`; reject CTE-prefixed mutation statements and allow only the exact read-only session declaration as a safety control.

Required checks are `input-hash-and-counts`, `embedded-applied-import`, `embedded-applied-consolidation`, `formal-database-identity`, `formal-wiki-zh-counts`, `formal-wiki-zh-projection-hash`, and `formal-unresolved-relations`. Standalone mismatch is diagnostic and never replaces authority.

- [x] **Step 5: Add CLI and atomic report publication**

Use repository runtime config/mysql loader, canonical default paths, a temporary sibling plus rename, compact stdout, and nonzero exit when `status !== 'passed'`.

- [x] **Step 6: Run GREEN**

```bash
node --test scripts/data/recipe/recipe-formal-contract.test.mjs scripts/data/recipe/recipe-formal-verification.test.mjs scripts/data/import/import-wiki-zh-recipes-to-db.test.mjs
```

### Task 3: Harden Recipe Source Readiness Test-First

**Files:**
- Modify: `scripts/data/audit/domain-readiness-audit.mjs`
- Modify: `scripts/data/audit/domain-readiness-audit.test.mjs`

- [x] **Step 1: Add canonical evidence fixtures and the original regression**

Assert readiness cannot pass with only a producer-shaped crawler snapshot plus the current two-row standalone report. Add a complete canonical report fixture that does pass.

- [x] **Step 2: Add semantic mutation cases**

Mutate `status`, `mode`, `writesAttempted`, input hash/count, current artifact
bytes, import-stage target hash, final formal projection hash/count, and
unresolved counts. Every mutation must prevent `pass`.

- [x] **Step 3: Run RED**

```bash
node --test scripts/data/audit/domain-readiness-audit.test.mjs
```

- [x] **Step 4: Require and validate canonical evidence**

Replace the optional standalone import evidence with:

```js
requiredJson('reports/canonical-migration/canonical-recipe-formal-verification.json')
```

Route the exact path to `recipeFormalVerificationSemantics`. Require matched hashes/counts, `status=passed`, `mode=read-only`, zero unresolved rows, and `writesAttempted=false`. Keep crawler snapshot validation and blocking/consolidation gates separate.

- [x] **Step 5: Run GREEN**

```bash
node --test scripts/data/audit/domain-readiness-audit.test.mjs scripts/data/recipe/*.test.mjs scripts/data/import/import-wiki-zh-recipes-to-db.test.mjs
```

### Task 4: Run Formal Read-Only Verification

**Files:**
- Create: `reports/canonical-migration/canonical-recipe-formal-verification.json`

- [x] **Step 1: Preflight bytes and target**

Confirm input SHA-256, pipeline applied fields, standalone overwrite, runtime DB target `terria_v1_local`, no concurrent Recipe writer, and no crawler/scheduler. Stop on identity drift.

- [x] **Step 2: Execute only the verifier**

```bash
node scripts/data/recipe/recipe-formal-verification.mjs
```

Expected: `status=passed`, `mode=read-only`, standalone `superseded-invalid`,
valid distinct import-stage and post-backfill hashes, and
`writesAttempted=false`.

Execution finding: display-name backfill changes fields covered by the
projection hash. Freeze the audited final hash separately and require the
embedded 124/239 applied backfill with zero remaining gaps.

- [x] **Step 3: Independently inspect evidence and runtime residue**

Recount exact metrics, verify no Recipe import/backfill/consolidation process, and confirm no active verifier database transaction remains.

- [x] **Step 4: Rerun Recipe readiness**

Run the domain-readiness CLI for `support.recipe` source and blocking panels without report-writing flags. Source must pass from canonical verification; blocking retains its truthful independent status.

### Task 5: Review, Validate, And Commit

**Files:**
- Modify: `docs/devlog/entries/2026-08-08-recipe-formal-read-only-verification.md`
- Modify: `docs/devlog/current.md`

- [x] **Step 1: Run regression validation**

```bash
node --test scripts/data/recipe/*.test.mjs scripts/data/import/import-wiki-zh-recipes-to-db.test.mjs scripts/data/audit/domain-readiness-audit.test.mjs
git diff --check
```

- [x] **Step 2: Review implementation and evidence**

Check for SQL mutations, network calls, secret leakage, absolute machine paths, weak comparisons, report overwrite hazards, and readiness fallback to standalone evidence. Repair Critical/Important findings and rerun affected tests.

- [x] **Step 3: Close devlog**

Record exact hash/count/readiness evidence, standalone rejection, validation, residual risk, and `commit SHA pending in final response`; remove the child entry from Open Work.

- [x] **Step 4: Stage only Recipe verification scope**

Use explicit paths for the files listed in this plan, then run `git status --short` and `git diff --cached --stat`. Exclude `data/generated/wiki-town-npc-maintenance.latest.json` and `data/generated/resume/`.

- [x] **Step 5: Commit**

```bash
git commit -m "test(recipe): verify formal state read only"
```

## Plan Audit

### Verdict

- Status: execution-ready.
- Main goal: repair Recipe formal evidence without replaying a completed apply.
- Closure: canonical evidence and source readiness pass only when current input, embedded apply, and formal `wiki_zh` scope match exactly.

### Blocking Plan Defects

- Critical: none.
- Important: none after adding the shared hash contract, explicit read-only SQL guard, semantic readiness mutations, and independent live readback.

### Execution-Ready Plan

- Scope: verifier, shared contract, Recipe source readiness, tests, retained evidence, and devlog only.
- Agent split: inline single-owner execution because importer and readiness share the same contract.
- Smoke test: the overwritten two-row standalone report is rejected while the matched authoritative chain passes.
- Final validation: focused Node suite, live read-only verifier, readiness rerun, report/process/transaction inspection, and `git diff --check`.

### Residual Risk

- Risk: this freezes the current 2026-07-29 state and says nothing about newer upstream Recipe changes.
- Follow-up trigger: input hash or formal `wiki_zh` scope drift requires a separately authorized refresh plan.
