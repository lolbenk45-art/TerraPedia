# Devlog: eight-domain-t1-baseline-closeout

## Status

`closed`

## Context

- User goal: record the completed T1 isolated ingestion results, clean up the execution worktree, and merge the T1 baseline into local `main` before discussing V2.
- Branch: `exec/eight-domain-production-readiness`.
- Worktree: `/home/lolben/TerraPedia/.worktrees/eight-domain-production-readiness`.
- Base: local `main`.
- Related docs: `docs/superpowers/plans/2026-10-16-eight-domain-production-readiness.md` and its eight domain child plans.
- Related prior entries: `docs/devlog/entries/2026-10-16-eight-domain-production-readiness-plan.md` remains active for V2 and production-readiness follow-up.

## Scope

- Data: close out the eight isolated maintained-chain T1 baselines and preserve their runtime evidence.
- Docs/process: index the final evidence and integrate the verified T1 work into local `main`.
- Out of scope: V2 attempts/acknowledgement, scheduler activation, formal writes, current Wiki freshness/parity, and production release.

## Result

- Items passed for the plan-approved 100 selected identities; this is not the full 6,131-item corpus.
- NPCs passed for 762 records; Projectiles for 1,111; Audio for 150 metadata records only; Bosses for 33; Armor Sets for 64; Buffs for 388; Shimmer passed six scopes with counts `1/7/279/248/121/29`.
- Every final report records `status=passed` and `formalDatabaseWrites=false`; isolated readback and run-owned cleanup are recorded per domain. The reports are under `reports/runtime/eight-domain-production-readiness/20261017/` and are indexed in the parent readiness entry.
- Local-offline authorized runs record `wikiUnchanged=false`. This baseline does not establish current Wiki parity, V2 automatic ingestion, or production readiness. Domain-specific unresolved references, media gaps, and ownership blockers remain in the reports and active parent entry.
- See git for code-level diff details.

## Validation

- Node changed/new test files on Node `v26.1.0`: `423 passed`, `1 skipped`, `0 failed`.
- Maven focused backend suites: `403 passed`, `0 failures`.
- Changed `.mjs` syntax checks and `git diff --check` passed.
- All eight final report artifacts were parsed and checked for `status=passed` and `formalDatabaseWrites=false`.

## Residual Risks

- Runtime report files are ignored local evidence and must be preserved outside the execution worktree before that worktree is removed.
- The task branch has no upstream; local merge does not imply a push or remote backup.
- The independent pre-merge review found three V2 blockers, all recorded in the active parent entry: source manifest is passed where the Base runner expects the acceptance manifest; `armor_sets` is missing from the Java isolated runner map; and manifest run/queue/attempt identity is not checked against the live attempt. These findings are deferred from T1 only and must be resolved before any V2 execution.
- V2 code/source binding, real dispatched attempt, exact acknowledgement, error-recovery matrix, Wiki freshness/parity, and release readiness remain open in the parent entry.

## Follow-up

- Owner Codex, local `main`: discuss the V2 automated-ingestion contract after this T1 closeout; do not start a V2 run without separate user direction.

## Commits

- `commit SHA pending in final response`.
