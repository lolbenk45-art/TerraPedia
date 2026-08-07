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
- Implementation commit: `f2150052 test(boss): prepare isolated T1 acceptance`.
- Current-hash manifest:
  `reports/authorization/canonical/canonical-boss-t1-acceptance-20260807-01.execution-manifest.json`.
- ADMIN request:
  `reports/authorization/canonical/canonical-boss-t1-acceptance-20260807-01.request.json`,
  request hash
  `sha256:138081ffbc9bae74093bd57b20022b20e20710f8bb9faa0e74b3affabe079ccc`,
  status `AWAITING_OWNER`, run ID `npc-t1-boss-20260807-01`, Redis DB 2.
- ADMIN decision `canonical-boss-t1-acceptance-20260807-admin-01` was consumed
  once, but the run failed closed before snapshot copy because the manifest
  requested 100 rows while the provisioner hard cap is 25. Independent readback
  confirmed zero isolated databases, temporary accounts, Redis DB 2 keys, and
  Boss T1 child processes.
- The repair keeps the 25-row cap and copies only the fixture's two real NPCs
  and two real items from formal local via `INSERT ... SELECT` into isolated
  local using the temporary provisioner's formal read-only grants. No placeholder
  identities are created. Focused validation now passes `112/112`.

## Validation

- `node --test scripts/data/automation/*acceptance*.test.mjs scripts/data/automation/*manifest*.test.mjs`: passed.
- `bash ./scripts/dev/quality-gate.sh`: blocked in domain acceptance on stale B1 readiness evidence; all preceding contract stages passed.
- Boss import/loot/projection focused tests: `22/22` passed after the mysql2
  module-resolution fix.
- Boss/authorization/relation focused suite: `111/111` passed.

## Residual Risks

- Boss T1 must not begin live execution until its local fixture closes all item,
  NPC, and loot relationships offline.
- The first ADMIN decision is consumed and cannot be reused. A fresh post-fix
  manifest/request is required; no live resource or acceptance evidence remains.
- Stale B1 readiness evidence needs a separate refresh and must not be hidden by
  this domain acceptance work.

## Follow-Up

- Commit the 25-row dependency-closure repair and generate a fresh manifest and
  AWAITING_OWNER request. Never reuse decision `canonical-boss-t1-acceptance-20260807-admin-01`.
- Refresh stale B1 evidence in a separate task before claiming a green full gate.
