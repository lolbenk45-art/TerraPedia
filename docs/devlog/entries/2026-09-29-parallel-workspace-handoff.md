# Parallel workspace handoff

## Status

`closed`

## Goal and scope

Owner: Codex coordinator. User requested clean workspaces for concurrent domain development, without waiting for each domain to finish. This entry closes workspace preparation only; ingestion acceptance remains owned by the scheduler coordinator and its existing plan.

Success: root, coordinator and Armor/Buff/Shimmer worktrees have no staged, unstaged or nonignored untracked paths; existing work is retained; each development lane has an explicit entrypoint and shared-write boundary. No branch deletion, history rewrite, push, database publication or service lifecycle change is part of this checkpoint. No current-spec change is required: this records task-local ownership under the existing workflow.

## Verified workspace matrix

Paths below are relative to `/home/lolben/TerraPedia`. HEAD values are the observed pre-handoff-commit checkpoints, not a promise that future HEADs will stay fixed.

| Lane | Branch | Worktree | Observed HEAD | Status |
| --- | --- | --- | --- | --- |
| Root | `feat/supplementary-domains-readiness` | `.` | `a07d51a2` | clean; 22 ahead of cached upstream |
| Coordinator | `feat/automation-scheduler-continuation` | `.worktrees/automation-scheduler-continuation` | `541ddb68` | clean; no upstream |
| Armor | `feat/automation-domain-armor` | `.worktrees/automation-domain-armor` | `1f264540` | clean; no upstream |
| Buff | `feat/automation-domain-buff` | `.worktrees/automation-domain-buff` | `da143e7c` | clean; no upstream |
| Shimmer | `feat/automation-domain-shimmer` | `.worktrees/automation-domain-shimmer` | `1f264540` | clean; no upstream |

The three domain worktrees already exist. Do not recreate them or switch multiple sessions through the root directory. Buff commits are already integrated into the coordinator through `d2096516`; do not replay its landing patches. Armor and Shimmer retain their common base intentionally. Fetch/remote permissions were not checked; ahead counts describe cached local refs only. Existing root checkpoints `36b948ed` and `a07d51a2` are present in Git.

## Concurrent development handoff

Read AGENTS, current spec, workflow and the branch-local devlog first in each directory. The shared parent plan is `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md` in the coordinator worktree. Its index and `docs/devlog/entries/2026-09-29-automation-domain-worktree-matrix.md` remain the integration entrypoints; historical language saying shells still need creation is superseded by the verified matrix above.

| Owner/session | Independent work | First task record | Handoff requirement |
| --- | --- | --- | --- |
| Armor domain developer | Armor source identity/semantic evidence and Armor-specific candidates/tests | `docs/devlog/entries/2026-09-28-armor-source-semantics-continuation.md` | Source hashes/revisions, candidate blockers, focused tests and commit IDs |
| Buff domain developer | Buff typed landing → maint → relation/projection lineage, locked derivation and readback | `docs/devlog/entries/2026-09-29-buff-bounded-landing-contract.md` | Typed ID contract, before-BEGIN containment, source applicability and tests |
| Shimmer domain developer | Shimmer six-scope partition contract and importer/fence gate | Parent plan S1 plus existing matrix | Exact six predicates, owner/policy dependencies, positive/negative tests |
| Coordinator | Shared plan/index, catalog/manifest registration, shared helpers, packet integration, runtime verification and serial merges | Coordinator `docs/devlog/current.md` | Review each commit/contract, run affected cross-domain regressions and record acceptance separately |

- Domain sessions can edit and test their domain-specific files concurrently. Each creates a uniquely named child entry in its own branch at task start; do not concurrently append to the old shared Armor entry. Record actual owner, allowed files, dependencies and test commands there.
- `sync-maint-to-relation.mjs`, `sync-landing-to-maint.mjs`, common wiki helpers, operation catalogs/manifests, shared tests/fixtures, current index and parent plan need coordinator ownership. A domain proposes the exact shared-file change; the coordinator serializes it and records the contract before dependent work completes.
- Worktrees isolate Git files, not databases, Redis, external source gates, shared data roots or ports. Source collections, registered applies and service start/stop/restart remain serialized by the coordinator after fresh runtime/writer checks. Use only isolated temporary fixtures for concurrent tests that write data.
- Return focused commits with file list, contract changes, exact test results, unresolved blockers and next action. The coordinator reviews those diffs and integrates commits serially; a clean domain commit does not imply runtime acceptance.
- Root is preserved as a checkpoint. Its backend fixes are not implicitly present in domain branches; integration must compare actual commits rather than bulk merging unrelated root history.

## Corrected continuation facts

The supplied recap was stale on Armor: the branch-local September26 entry records A6.3 selected-subset publication `.a63-20260927-22` and the slot/class/retirement regressions already exist. Fresh local test execution passed 271/271 across `sync-maint-to-relation`, `armor-semantic-repair`, `armor-canonical-relation-candidate`, `armor-canonical-projection-candidate`, `armor-secondary-projection` and `armor-source-identity`. Do not restart that completed repair or replay consumed decisions.

Remaining Armor evidence includes the Mining Pants identity correction, qualified Shroomite cells, and authoritative set-effect mapping. Source bytes under the coordinator `.local/tmp/a63-20260928-04` and `.local/tmp/a63-20260928-06` are not copied by Git worktree creation. Preserve their paths and hashes; the domain copy of an evidence JSON alone does not imply its local source files exist.

Buff remains blocked on complete downstream lineage and 370 unknown immunity-applicability facts. Shimmer remains blocked on the six-scope owner/policy/fence contract. These block publication, not disjoint code development. No `local.items`, DDL, direct SQL/Redis repair, scheduler activation, H8 expansion or historical evidence replacement is authorized by workspace preparation.

No fresh DB/API/Redis verification was performed in this checkpoint. Prior H8/epoch/server/scheduler values remain recorded evidence requiring fresh verification before runtime work. Bounded Wiki revision metadata/content probes during resume were diagnostic reads only; no new source artifact, landing, packet, permit or crawler run was created or promoted.

## Preserved historical worktrees

A read-only audit covered all 39 registered worktrees. Six outside the five active development directories remain dirty and are intentionally untouched:

| Historical worktree suffix | Staged | Unstaged | Nonignored untracked |
| --- | --- | --- | --- |
| `.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness` | 0 | 4 | 622 |
| `.config/superpowers/worktrees/TerraPedia/crawler-queue-v2-runtime` | 0 | 3 | 4 |
| `.config/superpowers/worktrees/TerraPedia/scheduler-permanent-enablement` | 0 | 0 | 45 |
| `.worktrees/automation-ingestion-continuation` | 0 | 0 | 183 |
| `.worktrees/close-structure-compat-window` | 0 | 0 | 1 |
| `.worktrees/main-merge-20260816` | 0 | 0 | 1 |

The first three suffixes are beneath `/home/lolben`; the last three beneath the repository root. Their unrelated history and artifacts are not cleanup targets. Existing ignore/exclude rules remain unchanged; clean Git status does not mean ignored evidence was deleted or backed up remotely.

## Validation and closeout

- Validation: `git diff --check`; root `git status --short --branch -uall`; explicit status checks for coordinator, Armor, Buff and Shimmer worktrees; a read-only 39-worktree inventory; focused Armor Node22 regression 271/271. The handoff documentation and current index are now ready for one focused commit.
- Residual risks: no remote backup/push in this task; shared runtime is not isolated by worktrees; older branch indexes contain historical runtime claims; six unrelated worktrees remain dirty.
- Follow-up owner: scheduler coordinator, with Armor/Buff/Shimmer sessions proceeding independently inside the boundaries above. No implementation session was launched by this checkpoint.
- Commit: `commit SHA pending in final response`
