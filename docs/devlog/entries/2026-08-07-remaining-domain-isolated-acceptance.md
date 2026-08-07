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
- ADMIN decision `canonical-boss-t1-acceptance-20260807-admin-02` was consumed
  once after the 25-row repair. Snapshot provisioning completed, but dependency
  seeding failed because the provisioner correctly has no formal-table SELECT
  grant. Cleanup readback again returned databases/accounts/Redis/processes to
  zero.
- The second repair preserves least privilege: the temporary readonly account
  selects the four exact formal dependency rows, while the temporary
  provisioner writes parameterized copies only to isolated local. No grant is
  widened. Focused validation remains `112/112`.
- ADMIN decision `canonical-boss-t1-acceptance-20260807-admin-03` was consumed
  once and failed closed when relation consolidation attempted schema DDL
  without an effective isolated relation grant. Independent cleanup returned
  databases, accounts, Redis DB 2, and processes to zero.
- ADMIN decision `canonical-boss-t1-acceptance-20260807-admin-04` was consumed
  once after changing provisioning order, but failed closed because the
  temporary provisioner correctly lacks global `CREATE DATABASE`. Cleanup
  again returned all disposable resources to zero.
- The provisioning repair now uses the controlled bootstrap account only to
  create the three disposable schemas, then grants the temporary provisioner
  exact privileges on those existing schemas before migration. A regression
  test freezes this account boundary.
- ADMIN decision `canonical-boss-t1-acceptance-20260807-admin-05` was consumed
  once and reached the domain executor, where consolidation exposed a separate
  formal qualifier in relation/projection schema builders. The formal write was
  denied and cleanup returned all disposable resources to zero.
- Relation and projection schema builders now accept and validate an explicit
  target database. The consolidation path passes the isolated relation name to
  every schema statement, while the default formal behavior remains unchanged.
  The expanded focused suite passes `145/145`.
- Commit `17a659b8 fix(boss): isolate T1 schema bootstrap` records the schema
  creation, grant-order, and explicit relation-target repair.
- ADMIN decision `canonical-boss-t1-acceptance-20260807-admin-06` completed its
  technical process with `cleanupPassed=true`, snapshot verification `129/129`,
  and transaction probes `0/1/0` for all three isolated roles. Independent
  cleanup readback returned databases, accounts, Redis DB 2, and processes to
  zero.
- The `admin-06` domain evidence was rejected as a semantic false positive:
  fixture import and loot were `2/2`, but consolidation reported 25 snapshot
  bosses and zero boss rewards. It therefore does not close Batch 1.
- The corrected executor now routes both actual ownership paths: Boss fixture
  metadata uses the existing `bosses_raw` maint mapper, while boss-owned local
  loot rows feed `boss_item_reward_relations` directly instead of depending on
  the intentionally separated generic NPC-loot lane. The pass gate requires
  exactly two resolved relation bosses and two boss reward relations. Expanded
  validation passes `206`, with one pre-existing skipped shimmer test.
- ADMIN decision `canonical-boss-t1-acceptance-20260807-admin-07` completed with
  exact fixture closure: two maint Boss rows, two Boss imports, two loot rows,
  two resolved relation Bosses, two Boss reward relations, zero unresolved
  Boss/item rows, snapshot verification `129/129`, and three-role transaction
  probes `0/1/0`. Built-in and independent cleanup both returned resources to
  zero. Batch 1 is closed; see
  `docs/devlog/entries/2026-08-07-boss-t1-isolated-acceptance.md`.
- Batch 2 read-only chain audit found two closed projectile/item candidates but
  zero NPC rows with a supported projectile source field. The plan's explicit
  stop condition applies; see
  `docs/devlog/entries/2026-08-07-projectile-t1-source-blocker.md` and
  `reports/canonical-migration/canonical-projectile-t1-blocker.json`.
- Owner approved an item-only Batch 2 amendment after the missing NPC source
  contract and uncovered-risk boundary were explained. The original
  NPC-inclusive blocker is intentionally stopped; implementation continues in
  `docs/devlog/entries/2026-08-07-projectile-item-only-t1-acceptance.md`.
- Batch 2 completed under ADMIN decision
  `canonical-projectile-t1-acceptance-20260807-admin-01`, run ID
  `npc-t1-projectile-20260807-01`, and Redis DB 6. Exact closure was two
  Projectile imports, two maint mappings, two item relations, and two
  projections with NPC `not-covered/0`; snapshot verification was `129/129`,
  transaction probes were `0/1/0`, and independent cleanup returned every B2
  resource to zero. Redis DB 3 was intentionally preserved because runtime
  preflight proved it owns current application/crawler state.
- Batch 3 is active in
  `docs/devlog/entries/2026-08-08-buff-t1-isolated-acceptance.md`. Its fixed
  fixture is `ShadowFlame` plus `Venom`, with eleven source-item relations,
  four resolved inflicting-NPC relations after the existing alias mapping, and
  complete ordered immune-NPC payloads of 30 and 26 rows.

## Validation

- `node --test scripts/data/automation/*acceptance*.test.mjs scripts/data/automation/*manifest*.test.mjs`: passed.
- `bash ./scripts/dev/quality-gate.sh`: blocked in domain acceptance on stale B1 readiness evidence; all preceding contract stages passed.
- Boss import/loot/projection focused tests: `22/22` passed after the mysql2
  module-resolution fix.
- Boss/authorization/relation focused suite: `111/111` passed.
- Projectile expanded authorization/import/relation suite: `273/274` passed,
  with one pre-existing skipped shimmer test and zero failures.
- Projectile exact runtime acceptance: passed with `cleanupPassed=true` and
  independent resource readback all zero.

## Residual Risks

- Projectile item-only T1 does not cover NPC-projectile relations; the missing
  real maintained NPC-projectile source contract remains an explicit risk.
- Boss T1 does not authorize formal Boss/Boss Loot apply or another domain.
- Stale B1 readiness evidence needs a separate refresh and must not be hidden by
  this domain acceptance work.

## Follow-Up

- Open and execute Batch 3 Buff T1 as a separate child with a fresh fixture,
  Redis DB, current-hash authorization, and cleanup evidence.
- Refresh stale B1 evidence in a separate task before claiming a green full gate.
