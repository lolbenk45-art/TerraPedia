# Automation domain worktree matrix

## Status

`closed`

## Scope and handoff

- Owner/coordinator: Codex. The coordinator branch owns shared plan, runtime preflight, authorization/packet integration, `docs/devlog/current.md`, and cross-domain validation.
- User goal: keep the workspace clean and make the governed source → landing → maint → relation → projection/API chain executable through isolated domain branches, with one focused commit per domain.
- Worktree base: `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`; coordinator branch `feat/automation-scheduler-continuation`; the domain shells will branch from this matrix commit, whose parent is clean checkpoint `b01033e6`.
- Shared boundaries: no branch may write another domain's files, shared current-state index, database, Redis control keys, `local.items`, DDL, H8, or scheduler state. Only the coordinator updates `docs/devlog/current.md` and integrates domain results.

## Domain matrix

| Domain | Branch | Worktree | Owned next slice | Forbidden overlap | Status |
| --- | --- | --- | --- | --- | --- |
| Armor | `feat/automation-domain-armor` | `.worktrees/automation-domain-armor` | source semantic guards, fresh landing/maint/relation candidate, exact retirement/new-key contract | Buff, Shimmer, scheduler control, shared current index | reserved |
| Buff | `feat/automation-domain-buff` | `.worktrees/automation-domain-buff` | bounded landing insertion contract, real landing identity binding, then maint → relation/projection envelope | Armor, Shimmer, generic landing importer, scheduler control | ready to start after RED tests |
| Shimmer | `feat/automation-domain-shimmer` | `.worktrees/automation-domain-shimmer` | six-scope owner/fence bundle and importer gate | Armor, Buff, scheduler control, whole-table expansion | blocked by policy/fence approval |
| Coordinator | `feat/automation-scheduler-continuation` | `.worktrees/automation-scheduler-continuation` | runtime read-only gates, packet/authorization integration, serial merge and final acceptance | domain implementation files while a domain branch owns them | active |

The domain worktrees are clean branch shells to be created from this matrix commit. They are not evidence of implementation or authorization. A branch becomes executable only after its RED/GREEN tests, fresh evidence, packet, permit, locked transaction and readback gates are recorded in its child entry and acknowledged by the coordinator.

## Validation and continuation

- Before each domain branch: `git status --short --branch -uall`, `git diff --check`, source/runtime preflight, and a focused plan audit.
- Implementation follows RED → failing test → minimal GREEN change → focused regression. No business-table DML, decision consumption, Redis control write, DDL, H8 expansion, scheduler activation, or historical landing overwrite is allowed in the domain setup slice.
- Coordinator integrates only clean, focused commits after cross-domain contract and readback validation. Existing historical branches/worktrees remain untouched.

## Residual risks

- Buff remains blocked until revision-bound applicability evidence reaches zero unknowns and a new landing namespace can be inserted without schema preparation or historical retirement.
- Armor still has unresolved source semantics and must not reuse the consumed secondary projection decision.
- Shimmer's positive six-scope path is not constructible under the persisted four-table policy.

## Closeout

- Result: workspace facts and disjoint domain ownership are recorded; existing historical worktrees remain untouched.
- Validation: `git diff --check`; `git status --short --branch -uall`; focused path/term review of the current plan and active Armor entry.
- Follow-up owner: coordinator creates the three clean domain shells from this commit and resumes Buff RED tests first.
- Commit: `commit SHA pending in final response`.
