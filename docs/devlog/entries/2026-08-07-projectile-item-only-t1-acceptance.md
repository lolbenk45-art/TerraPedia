# Projectile Item-Only T1 Isolated Acceptance

## Status

`closed`

## Goal

Prove a two-row offline Projectile import, maint mapping, item-projectile
relation, projection, transaction, and cleanup path without writing formal
databases or claiming NPC-projectile coverage.

## Owner Amendment

- Owner approved changing Batch 2 from item/NPC closure to item-only closure
  after the missing NPC source contract was explained.
- NPC-projectile coverage is `not-covered`, expected relation count is `0`,
  and the gap remains a residual risk.

## Scope

- Fixture projectiles: `WoodenArrowFriendly` and `FireArrow`.
- Fixture items: `WoodenBow` and `FlamingArrow`.
- Isolated local/maint/relation databases only.
- Local fixture, forced offline execution, Redis DB 6, temporary accounts, and
  one fresh current-hash ADMIN decision.
- Formal apply, Wiki fetch, scheduler, crawler, V1 queue, NPC source invention,
  push, merge, and worktree cleanup are out of scope.

## Success Criteria

- Exactly two fixture projectiles import and reach maint, relation, and
  projection layers.
- Exactly two fixture item-projectile relations resolve with zero unresolved
  fixture identities.
- NPC-projectile coverage is reported as `not-covered/0` rather than passed.
- Snapshot verification, transaction probes, evidence publication, built-in
  cleanup, and independent cleanup readback pass.

## Current State

- The blocker audit proved the two item-projectile pairs and zero supported NPC
  source rows.
- Reviewed implementation is bound to
  `canonical-projectile-t1-acceptance-20260807-01.execution-manifest.json`.
- ADMIN request hash:
  `sha256:b299fddeafdef99939c9e2d075350841d378ada77e5e90c815210d02a31fda00`.
- ADMIN decision:
  `canonical-projectile-t1-acceptance-20260807-admin-01`; packet hash:
  `sha256:4baab7b760903a6c5403df17a6038fc9d9441132156ca3a5177fe0f3edfd9d38`.
- Authorized run ID: `npc-t1-projectile-20260807-01`; Redis DB 6.
- The one-time decision was consumed once. The retained evidence report is
  `reports/canonical-migration/canonical-projectile-t1-acceptance.json`;
  private authorization artifacts remain ignored and uncommitted.
- Result: `status=passed`, `cleanupPassed=true`, snapshot verification
  `129/129`, and transaction probes `0/1/0` across local/maint/relation.
- Exact closure: two dependency items, two maint dependency items, two
  Projectile imports, two maint mappings, two relation Projectiles, two item
  relations, two projected Projectiles, zero unresolved fixture identities,
  and NPC coverage `not-covered/0`.
- Independent post-process readback: disposable databases `0`, temporary
  accounts `0`, active transactions `0`, Redis DB 6 keys `0`, Projectile
  acceptance processes `0`, and current dispatch permits `0`.
- Commit SHA pending in final response.

## Validation Plan

- New executor unit tests must fail before implementation and freeze isolated
  database rejection, exact fixture counts, offline import arguments, relation
  closure, and explicit NPC non-coverage.
- Automation catalog, execution-manifest, authorization, and live-acceptance
  focused tests must cover the new operation.
- Run the expanded focused suite, `git diff --check`, exact runtime acceptance,
  and independent resource readback before closeout.

## Review Coordination

- Coordinator and sole writer: Codex (`/root`).
- Independent reviewer: read-only Projectile T1 diff review; no file, database,
  Redis, process, authorization, or devlog writes are allowed.
- Review scope: fixture/source ownership, formal-target rejection, exact-count
  semantics, authorization binding, cleanup, and test gaps.
- Expected return: findings ordered by severity with file/line references, or
  an explicit no-material-findings result plus residual risks.
- Runtime authorization remains serialized behind review disposition and fresh
  focused validation.

## Review Findings

- Independent review found one Important exact-closure gap: relation and
  projection Projectile identities were checked only by count, while duplicate
  item relation or promoted-audit rows could be hidden by `Set` de-duplication.
- Disposition: accepted; child remains `active`. Add RED coverage for wrong
  identities and duplicate rows, require exact fixture identities and exactly
  two raw relation/audit rows, then re-review before authorization.
- Resolution: RED reproduced the false-pass path; the executor now requires
  the two exact relation/projection Projectile identities and exactly two raw
  item relation/promoted-audit rows. Focused regression tests pass `6/6`.
- Re-review: prior Important finding resolved with no remaining material
  finding in scope. Expanded authorization/import/relation suite passes
  `273/274` with one pre-existing skipped shimmer test and zero failures.
- Runtime preflight found MySQL disposable databases/accounts/transactions and
  Projectile acceptance processes at zero. Planned Redis DB 3 was not empty:
  its 195 keys belong to current crawler dispatch/V2 monitor and auth refresh
  state, so no key was deleted. The B2 contract is amended to Redis DB 6,
  verified empty immediately before authorization and required to clean to zero.

## Residual Risks

- This batch does not prove or authorize NPC-projectile relations.
- This batch does not authorize a formal Projectile apply or another domain.
- Redis DB 3 remains intentionally untouched because it owns current crawler,
  V2 monitor, and auth state.

## Follow-Up

Continue the parent plan with Buff T1 under a separate fixture, Redis DB,
authorization, and child devlog entry.
