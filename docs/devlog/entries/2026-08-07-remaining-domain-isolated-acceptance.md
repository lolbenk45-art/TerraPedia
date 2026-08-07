# Remaining Domain Isolated Acceptance

## Status

`active`

## Goal

Execute the remaining crawler-domain tests in bounded isolated batches, starting
with a joint Boss + Boss Loot T1 acceptance and keeping formal databases,
network fetches, scheduler activation, and V1 queue operations out of scope.

## Current State

- Full batch plan is recorded at
  `docs/superpowers/plans/2026-08-07-remaining-domain-isolated-acceptance.md`.
- Batch 0 automation/manifest contract tests pass.
- Full quality gate reaches domain acceptance but blocks four B1 exemption
  panels because the canonical item-group and NPC readiness reports are 35
  hours old; no code or data write was attempted to repair this unrelated
  evidence freshness issue.
- Batch 1 is now the active implementation lane. See git for code-level diff
  details.
- Existing Boss tests exposed one startup defect: `sync-boss-projection.mjs`
  resolved `mysql2` relative to the script even though the dependency is owned
  by `data-query-app`. The script now uses the shared repository module loader;
  the focused Boss suite passes `22/22`.
- Entry-point audit found that Boss apply currently invokes backend/MinIO image
  upload. Batch 1 cannot truthfully declare `networkAccess=false` until an
  explicit offline image mode is designed and covered by a failing test.
- Batch 1 implementation now adds the explicit offline image boundary, two
  local fixtures, the joint Boss/Boss Loot executor, the governed operation
  manifest, and live-acceptance routing. The executor writes only the isolated
  local/maint/relation database set and reuses the existing maint-to-relation
  consolidation path. No live acceptance has run yet.

## Validation

- `node --test scripts/data/automation/*acceptance*.test.mjs scripts/data/automation/*manifest*.test.mjs`: passed.
- `bash ./scripts/dev/quality-gate.sh`: blocked in domain acceptance on stale B1 readiness evidence; all preceding contract stages passed.
- Boss import/loot/projection focused tests: `22/22` passed after the mysql2
  module-resolution fix.
- Boss/authorization/relation focused suite: `111/111` passed.

## Residual Risks

- Boss T1 must not begin live execution until its local fixture closes all item,
  NPC, and loot relationships offline.
- Boss T1 still needs a post-commit current-hash manifest and request before it
  can move to `awaiting-admin-authorization`; no live resources or ADMIN
  artifacts were created.
- Stale B1 readiness evidence needs a separate refresh and must not be hidden by
  this domain acceptance work.

## Follow-Up

- Commit the validated Batch 1 implementation, then generate the current-hash
  execution manifest and AWAITING_OWNER request for ADMIN review.
- Refresh stale B1 evidence in a separate task before claiming a green full gate.
