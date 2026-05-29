# Plan Fixes Summary

## Date

2026-05-29

## Result

The plan was repaired after cross-agent review. It is now scoped to the current user constraint:

- no crawler run
- no wiki fetch
- no default DB write
- use existing standardized data plus explicit manual calibration input
- prove `DrillContainmentUnit -> MOUNT` through audit and sync dry-run evidence

## Blocking Issues Fixed

### 1. Apply safety removed from default validation

The previous plan required `--apply=true` validation and mentioned `--db=test`, but the sync CLI does not support `--db`. The current apply path can also write `category`, `items`, and `item_category_rel`, so a narrow JSON backup would not be enough for rollback.

Fix:

- Removed required apply validation from this plan.
- Removed `--db=test`.
- Documented that standardized inference apply needs a separate operator-approved apply/rollback plan.

### 2. Nonexistent rollback command removed

The previous runbook referenced `scripts/data/sync/restore-from-backup.mjs`, but that tool is not implemented in this plan.

Fix:

- Removed the false rollback command.
- Avoided any automated rollback guarantee in this plan.

### 3. Allowlist source modeled explicitly

The previous plan claimed the fallback used only standardized datasets while also adding `data/config/mount-allowlist.json`.

Fix:

- Source chain now explicitly includes `data/config/mount-allowlist.json` as a manual calibration input.
- The allowlist is no longer hidden inside a supposedly pure inference function.

### 4. Pure inference contract repaired

The previous inference library was described as pure while loading and caching config internally.

Fix:

- `inferCategoryFromStandardizedRecord` receives `mountAllowlist` explicitly.
- Config loading is a separate helper with real validation tests.

### 5. Report counter contract clarified

The previous plan contradicted itself by saying fallback-null rows counted as both `skippedNoWiki` and `skippedInsufficientEvidence`.

Fix:

- `skippedNoWiki`: raw page missing and fallback disabled.
- `skippedInsufficientEvidence`: fallback attempted but inference returned `null`.

### 6. Freshness feature removed from this plan

The previous plan expected `dataFreshness` in both sync and audit, but only described implementation in sync and validated it with destructive timestamp mutation.

Fix:

- Removed `dataFreshness` from this plan.
- Removed `touch -d` and `git checkout` validation steps.
- Left freshness as a separate future plan if needed.

### 7. Report-only taxonomy scope removed

The previous plan listed report-only families without schema, tests, or consumer behavior.

Fix:

- Removed report-only implementation scope.
- Kept this plan focused on high-confidence `MATERIAL -> MOUNT`.

## Execution-Ready Scope

Task split:

- Task 1: config and pure inference library.
- Task 2: sync dry-run fallback and report counters.
- Task 3: audit fallback.
- Task 4: no-crawl runbook.
- Task 5: focused tests plus default/fallback audit and sync dry-run validation.

Acceptance:

- Default audit still blocks on missing raw pages.
- Fallback audit reports `DrillContainmentUnit -> MOUNT`.
- Fallback sync dry-run reports high-confidence inferred changes.
- No crawler is run.
- No DB write is performed during validation.

## Remaining Known Limits

- The fallback repairs only `MATERIAL -> MOUNT`.
- Non-`MATERIAL` miscategorizations need a separate taxonomy plan.
- Standardized data freshness is not solved here.
- Applying inferred changes to a database is outside this plan.
