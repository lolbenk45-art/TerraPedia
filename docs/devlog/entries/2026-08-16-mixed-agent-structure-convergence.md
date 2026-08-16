# Devlog: mixed-agent-structure-convergence

## Status

`closed`

## Context

- User goal: review and then execute a bilingual plan for a mixed Codex/Claude/other-model project structure, shared skills, deployable boundaries, and local artifact placement.
- Branch: `docs/mixed-agent-structure-convergence`
- Worktree: `/home/lolben/TerraPedia/.worktrees/mixed-agent-structure-convergence`
- Base: `9f386e40`
- Related docs: `docs/superpowers/plans/2026-08-16-mixed-agent-structure-convergence.zh-CN.md`, `docs/superpowers/plans/2026-08-16-mixed-agent-structure-convergence.en-US.md`, `docs/architecture/project-structure-v2.md`
- Related prior entries: `docs/devlog/entries/2026-08-16-project-structure-professionalization.md`

## Direction / Decisions

- Chosen approach: use a common `agent/skills/` source with generated Codex/Claude runtime views, while keeping `apps/` and `services/` physically separate.
- Reasoning: runtime skill discovery is vendor-specific; a common source avoids drift, and ordinary generated files are more portable than symlink contracts across Windows, WSL, and Git worktrees.
- Rejected options: merging the backend into `apps/`; using symlink/junction as the repository contract; tracking `.claude/worktrees/` or `.superpowers/` local state.

## Task 1 Inventory

- The approved plan/devlog handoff was deliberately carried into this dedicated
  worktree from the dirty primary worktree without a commit; all three files
  matched their source SHA-256 values.
- `docs/audits/structure/mixed-agent-skill-inventory-2026-08-16.md` records
  exact tracked/ignored counts, every current skill classification, Claude/Codex
  parity, and the protected staged-scope boundary.
- Inventory result: 28 portable candidates, two Codex-only skills
  (`web-access`, `xlab-image-generation`), and one external/plugin skill
  (`ui-ux-pro-max`). The only current Claude skill copies (`session-handoff`
  and `ui-ux-pro-max`) are byte-identical to their Codex counterparts.
- The inventory confirms the approved `agent/skills/` source/adapter design;
  it found no reason to revise the bilingual plan before Task 2.

## Task 2 Entry Contracts

- Added thin `CLAUDE.md` and `GEMINI.md` entrypoints that preserve the
  repository read order, on-demand skill selection, and common sync command.
- Added `agent/README.md` and `agent/skills/README.md` to declare
  `agent/skills/` as the editable source and `.codex/skills`/`.claude/skills`
  as generated runtime views.
- Updated `AGENTS.md`, `README.md`, and the current spec because agent
  entrypoints and common skill ownership are now current project facts.
- `platform/tooling/agent-entry-contract.test.mjs` was written red first, then
  passed 3/3 after the minimal documentation implementation. It proves the
  source-of-truth references, sync command, source/runtime declarations, and
  vendor-required-language rejection.

## Tasks 3-4 Skill Source And Portability

- Added `agent/skills/skill-manifest.json` with 28 portable skills (79 declared
  files), two Codex-only entries, one external/plugin entry, and a normalized
  SHA-256 hash schema. Portable files were mechanically copied from the
  inventoried `.codex/skills` content without `agents/**` metadata.
- Added `platform/tooling/sync-agent-skills.mjs` with `--write`, `--check`, and
  `--list`. It validates IDs, frontmatter, containment, declared files,
  normalized content hashes, stale runtime files, and preserves Codex
  `agents/**` metadata.
- Added exact `.claude/skills/**` Git exceptions while `.claude/settings.json`
  and `.claude/worktrees/` remain ignored. The current generated views contain
  79 files in both Codex and Claude targets.
- Added `platform/tooling/skill-portability.test.mjs` and normalized portable
  descriptions, provider-tool references, example paths, and external links.
  Shared fallback guidance covers missing subagents, browser tools, and
  PowerShell; no provider-specific tool is a portable runtime dependency.
- Generated views are currently unstaged by design. The final focused commit
  must run `--check` immediately before and after explicitly staging its
  generated file list; no commit or push has been authorized.

## Task 5 Deployable Boundaries

- Added `docs/architecture/deployable-components.md` with component roles,
  lifecycle/validation/write boundaries, dependency direction, forbidden
  alternative homes, and a root allowed-entry table.
- Updated `AGENTS.md`, `README.md`, `docs/architecture/project-structure-v2.md`,
  `docs/architecture/README.md`, and `docs/architecture/file-placement-rules.md`
  so `apps/`, `services/`, `packages/`, `pipelines/`, `platform/`, and `agent/`
  describe the same current boundaries without merging applications and
  services.

## Task 6-8 Coordination

- Coordinator: Codex updates this entry and `docs/devlog/current.md`.
- Task 6 implementer: owns the root-artifact contract, the audited
  `audit-shoot.mjs` output default, `.local/` ignore/readme state, the local
  artifact inventory, placement documentation, and unchanged summary moves.
  It must not edit devlog files, generated skill views, Shimmer data,
  authorization reports, or compatibility symlinks. Its validation duty is the
  red/green contract test and targeted reference scans.
- Task 7 investigator: read-only owner for the complete legacy-alias reference
  inventory and classification. It must not edit any file, move symlinks, or
  run data, crawler, database, Redis, or stack commands. Its handoff is a
  concise path/classification/consumer report for the coordinator.
- Task 8 remains serialized with the coordinator because it updates the shared
  task entry, current devlog index, and acceptance audit after Task 6 and Task
  7 evidence is integrated.

## Task 7 Read-Only Alias Audit

- The full tracked-path audit found all eight compatibility symlinks still
  present and confirmed that CI uses canonical `apps/`, `services/`,
  `platform/`, and `pipelines/` paths. No alias was removed.
- Concrete current executable blockers remain in
  `docs/runbooks/local-acceptance.md`, `docs/runbooks/image-asset-cache.md`,
  `docs/runbooks/item-category-taxonomy-repair.md`,
  `docs/runbooks/npc-item-source-maintenance-chain.md`, and
  `docs/design/terrapedia-detail-redesign-hifi-v1.md`. Three portable skill
  sources also contain legacy commands or examples: the workflow reference,
  crawler progress contract, and token-context summary helper. Their generated
  Codex/Claude views mirror the same source defects.
- Historical, fixture, and compatibility references were classified and left
  unchanged. The three skill defects and current runbook references require a
  follow-up repair and re-scan before any symlink-close commit.
- No crawler, database, Redis, local-stack, or data command was run during the
  audit.

## Scope

- Frontend: no behavior or visual changes; document `apps/public-web` and `apps/admin-console` boundaries only.
- Backend: no behavior changes; document `services/catalog-api` as a deployable service.
- Data: no writes; Shimmer generated data and authorization reports remain user-owned and untouched.
- Docs/process and tooling: record plan, inventory, cross-model entry
  contracts, portable skill source, runtime synchronization, and current
  ownership facts.
- Out of scope: compatibility-symlink removal unless Task 7's full scan proves
  it safe, database/crawler operations, and commits from the dirty primary
  worktree.

## Validation

- Earlier commands: plan file existence/count checks, placeholder scan,
  `git diff --check`, and protected-path status check. Both plans have 8 tasks,
  54 checkboxes, and 16 fenced blocks; no placeholder terms.
- Task 1 commands: `git status --short --branch -uall`,
  `git ls-files .codex/skills .claude/skills`,
  `git check-ignore -v .claude/settings.json .claude/worktrees .superpowers tmp`,
  directory/file counts, targeted tool-reference scans, and SHA-256 plus `cmp`
  parity checks for `session-handoff` and `ui-ux-pro-max`.
- Task 1 result: primary-worktree protected paths remain outside this worktree;
  both parity comparisons pass. `git diff --check` is rerun after the inventory
  documentation edits.
- Task 2 test: `node --test platform/tooling/agent-entry-contract.test.mjs`
  failed 3/3 before the entry/docs implementation and passed 3/3 after it.
- Task 2 docs/process validation: `git diff --check` and targeted source-path
  and vendor-required-language scans pass.
- Task 3: `node --test platform/tooling/sync-agent-skills.test.mjs` passes 6/6;
  actual `--write`/`--check` reports 79 source files in sync and `--list`
  reports portable, Codex-only, Claude-only, and external/plugin classes.
- Task 4: `node --test platform/tooling/skill-portability.test.mjs` passes 3/3;
  generated Codex/Claude `session-handoff` content is byte-identical. The
  entry-contract test remains 3/3, and `git diff --check` passes.
- Task 5: the scoped forbidden-alternative scan has no executable/current
  references after excluding the explicit prohibition clause; the existing
  project-constants usage test passes 1/1 and `git diff --check` passes.
- Not run: implementation tests, skill synchronizer, frontend/backend gates,
  crawler, database, Redis, or local stack.

## Task 6-8 Resume Validation

- Task 6 root-artifact contract tests pass 7/7; the scanner reports no
  unallowlisted root artifact references. `audit-shoot.mjs` now defaults to
  `.local/tmp/audit-shots`, and both root summaries are archived byte-for-byte.
- Task 7 repaired the current runbook, design, contract, and portable-skill
  alias references found by the full scan. Generated Codex/Claude views are
  synchronized at 79 source files. The user authorized the separate focused
  compatibility-window closeout in this session.
- The first post-removal scan exposed a stale machine contract
  (`migrationStatus: compatibility-window` with aliases) and one live E2E
  backend path (`$repo_root/back`). The new closure contract test failed on the
  stale status, then passed after the canonical contract and consumer were
  repaired. Current entrypoint documentation now records the retired roots.
- Task 8 focused validation: structure/skill/root-artifact/closure Node tests
  20/20, project-constants usage 1/1, Shell/PowerShell path contracts 6/6,
  admin typecheck pass, and focused catalog-api config/path Maven suite 17/17.
- The narrow quality gate ran 326 tests with 321 passing and 5 failures caused
  by missing protected authorization fixtures in this isolated worktree:
  `canonical-item-group-bootstrap.result.json`, `canonical-npc-apply.input.json`,
  and their dependent owner-phase contract. No protected report was copied or
  modified to bypass the failure.
- Acceptance evidence is recorded in
  `docs/audits/structure/mixed-agent-structure-acceptance-2026-08-16.md`.
- A post-gate protected-path attribution check confirmed that this worktree has
  separate `data/generated` and `reports/authorization` directories; the
  primary Shimmer/authorization modifications predate the gate and no causal
  write from this task was found.

## Result

- Completed: bilingual execution plans are written and reviewed; the Chinese
  plan translates Task 1-8 bodies instead of leaving them in English, and the
  user reported no material plan-review findings. Tasks 1-5 are complete in the
  dedicated worktree, including the generated portable runtime views.
- Completed: Task 6 temporary-artifact inventory and historical-summary
  archival, Task 7 current-reference repair and evidence scan, and Task 8
  focused acceptance evidence in the dedicated worktree.
- Completed: the eight compatibility symlinks are removed in this worktree and
  the stale compatibility contract and live E2E consumer are repaired. The
  final current-source scan and focused validation pass; the explicit staging/
  commit gate is now the only remaining step.

## Residual Risks

- The current primary worktree contains unrelated Shimmer and authorization
  changes; all future implementation must use this dedicated worktree and
  explicit staging.
- The five quality-gate fixture failures remain environment evidence gaps owned
  by the protected primary worktree. The compatibility-window closeout is
  limited to alias deletion, the related current consumers, and documented
  path-contract evidence.
  Generated skill views must not drift while later structure documentation is
  edited.
- The approved plan and handoff files remain uncommitted. They are present only
  in the primary and dedicated implementation worktrees until a later focused
  documentation commit is explicitly authorized.

## Follow-up

- The user has authorized the focused closeout. The next action is to re-run
  the path/structure contracts after the compatibility-contract repair, stage
  only this task's files, and commit. Do not copy protected authorization
  fixtures or touch Shimmer data to make the quality gate green.

## Optional: Cross-Review

### Chinese Review Correction

- Reviewer: user
- Scope: Chinese plan readability and reviewability
- Findings: the first Chinese file translated the summary but left the concrete Task 1-8 execution sections in English.
- Disposition: fixed
- Re-review required: no
- Resolved by: Codex
- Remaining risks: none for this documentation correction.

### Approved Plan Review

- Reviewer: user
- Scope: bilingual mixed-agent structure plan
- Findings: no material findings; the plan direction is approved for handoff.
- Disposition: accepted
- Re-review required: no
- Resolved by: Codex
- Remaining risks: implementation must begin with Task 1 inventory in an isolated worktree.

## Commits

- User authorization covers this focused structure closeout. Validation and
  review gates are clear; `commit SHA pending in final response`.
