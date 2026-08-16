# Mixed-Agent and Project-Structure Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge TerraPedia into a project structure that Codex, Claude Code, and other models can use together without damaging existing business code, data, or local worktrees, while making skill ownership, runtime adapters, application/service boundaries, and temporary-artifact ownership explicit.

**Architecture:** `agent/skills/` is the single editable source for cross-model skills; `.codex/skills/` and `.claude/skills/` are runtime copies generated according to each tool's discovery rules and protected by hash parity checks. `apps/` and `services/` remain separate, with a deployable-components index explaining the relationship; ignored `.local/` holds local temporary files and logs, while durable conclusions move to `docs/audits/` or governance archives.

**Tech Stack:** Markdown, Node.js ESM, Node `node:test`, Git, Bash/PowerShell, and the existing TerraPedia path resolver and quality gates.

---

## Review Gate 0: Confirm the Design Boundary

Before user review, this plan permits changes only to plan documents. It must not create `agent/` or `.local/`, synchronize skills, or move/delete runtime files.

Before Task 1 starts, the user must confirm these defaults:

- `agent/skills/` is the common skill source; if rejected, replace it with the user-selected path everywhere in both plans.
- Symlinks/junctions are not the project contract; runtime directories are generated as ordinary files.
- `apps/` and `services/` are not physically merged; a deployable-components index explains their relationship.
- `.claude/settings.json`, `.claude/worktrees/`, and `.superpowers/` remain local state and are not committed.
- Reusable project skills under `.claude/skills/` become tracked; Claude plugin configuration remains local.

If any decision is rejected, revise both language versions and rerun the plan audit before implementation.

## Goal Lock

This plan closes these concrete problems:

1. Claude Code currently sees only two ignored skill copies, so a clean clone cannot reuse most TerraPedia governance skills.
2. `.codex/skills`, `.claude/skills`, `docs/superpowers`, and `.superpowers` lack a verifiable ownership hierarchy.
3. The deployment relationship between `apps/` and `services/` is not explicit enough.
4. Root `tmp/`, `logs/`, `reports/tmp/`, and root `*_SUMMARY.md` files have inconsistent lifecycle and placement rules.
5. The compatibility symlinks cannot be closed safely until the skill adapters, temporary artifacts, historical summaries, and old-path references have one acceptance gate.

Completion means:

- After one documented sync command on a clean clone, Codex and Claude Code discover every project skill marked `portable`.
- Ownership of common skills, runtime copies, and vendor-specific metadata is clear, and `--check` blocks drift.
- The responsibilities of `apps/`, `services/`, `pipelines/`, `platform/`, and `packages/` agree across architecture docs, README, and agent entrypoints.
- Temporary directories, report directories, and historical archives have explicit rules; the root no longer receives temporary files or task summaries.
- Full reference scans, runtime smoke checks, structure tests, and focused quality gates pass before legacy aliases are closed.

## Scope and Safety Boundary

### In scope

- Common `agent/skills/` source, manifest, synchronizer, parity tests, and usage documentation.
- Trackable project skills under `.claude/skills/`; preserve ignored `.claude/settings.json` and `.claude/worktrees/`.
- Thin Codex, Claude Code, and Gemini entry files that point to the shared governance rules without copying them.
- `docs/architecture/deployable-components.md`, structure baseline, placement rules, README, `AGENTS.md`, and current-spec consistency updates.
- Reference inventory, classification, migration, or archival of `tmp/`, `logs/`, `reports/tmp/`, and root summaries.
- Full reference scan and final validation before closing compatibility symlinks.

### Out of scope

- No API semantics, database schema, business data, crawler strategy, Shimmer generated data, or authorization report changes.
- No crawler `apply/force`, database writes, Redis reset, external refresh, or production deployment.
- No commit of `.claude/worktrees/`, `.superpowers/`, secrets, plugin caches, or local settings.
- No move of the backend into `apps/`, and no additional `products/` or `workspaces/` path layer.

### No-write boundary

Until Task 6, these paths are read-only:

```text
data/generated/shimmer/
reports/authorization/
data/canonical/
data/legacy/
data/backups/
.claude/worktrees/
.superpowers/
```

All structure operations must run in a dedicated worktree. Existing uncommitted paths in the primary worktree must remain unchanged before and after every checkpoint.

## Source and Consumer Chain

```text
agent/skills/<skill>/SKILL.md
  -> sync-agent-skills.mjs
  -> .codex/skills/<skill>/SKILL.md       -> Codex skill discovery
  -> .claude/skills/<skill>/SKILL.md      -> Claude Code project discovery
  -> AGENTS.md / CLAUDE.md / GEMINI.md     -> project governance and selection rules
```

Long-lived workflow and execution history does not enter the runtime skill source:

```text
docs/superpowers/specs/  -> approved designs
docs/superpowers/plans/  -> executable plans
docs/devlog/             -> state, validation, and handoff
.superpowers/             -> ignored local brainstorm and screenshot output
```

## File Map Before Implementation

### New files

- `agent/README.md`: ownership, discovery, and synchronization rules for project agent assets.
- `agent/skills/README.md`: skill naming, frontmatter, and portable/Codex-only classification rules.
- `agent/skills/skill-manifest.json`: skill IDs, source class, runtime targets, and hash schema.
- `platform/tooling/sync-agent-skills.mjs`: `--write`, `--check`, and `--list` synchronizer.
- `platform/tooling/sync-agent-skills.test.mjs`: temporary fixtures, hash parity, traversal, unknown-skill, and runtime-metadata tests.
- `CLAUDE.md`: thin Claude Code entrypoint pointing to `AGENTS.md` and the current spec.
- `GEMINI.md`: thin Gemini CLI entrypoint pointing to `AGENTS.md` and the current spec without claiming unavailable tool capabilities.
- `docs/architecture/deployable-components.md`: deployment and dependency index for apps, services, and packages.
- `docs/audits/structure/mixed-agent-structure-acceptance-2026-08-16.md`: final structure and skill-chain evidence.

### Modified files

- `.gitignore`: precise exceptions for trackable `.claude/skills/`, while continuing to ignore settings, worktrees, and caches; add `.local/` rules.
- `AGENTS.md`: cross-model entry, skill selection, synchronization, and generated-copy editing rules.
- `README.md`: deployable-component, agent-skill, temporary-file, and historical-summary placement rules.
- `docs/architecture/project-structure-v2.md`: agent layer, runtime adapters, and `.local` rules.
- `docs/architecture/file-placement-rules.md`: add the approved `agent/` top-level responsibility and root allowlist.
- `docs/architecture/README.md`: add deployable-component and mixed-agent structure entries.
- `docs/project-governance/00_CURRENT_SPEC.md`: update only if maintained boundaries, entrypoints, or documentation placement facts change.
- `docs/project-governance/INDEX.md`: index common skills and archived summaries.
- `docs/devlog/current.md` and new `docs/devlog/entries/2026-08-16-mixed-agent-structure-convergence.md`: execution state and validation evidence.
- `PLAN_FIXES_SUMMARY.md`, `REFACTORING_SUMMARY.md`: do not rewrite; after reference scanning, move to `docs/project-governance/archive/` and preserve historical titles.

## Task 1: Freeze Inventory and Choose the Canonical Skill Source

**Files:**
- Create: `docs/audits/structure/mixed-agent-skill-inventory-2026-08-16.md`
- Modify: `docs/devlog/current.md` and the new task entry
- Read-only: `.codex/skills/`, `.claude/skills/`, `.claude/settings.json`, `.claude/worktrees/`, `.superpowers/`, `docs/superpowers/`

- [x] Record exact tracked/ignored status and file counts for `.codex`, `.claude`, `.superpowers`, `.worktrees`, `docs/superpowers`, `tmp`, `logs`, `reports/tmp`, and `task`.
- [x] Classify every current `.codex/skills/*` entry as `portable`, `codex-only`, or `external/plugin`, using frontmatter and referenced tools as evidence rather than directory names.
- [x] Confirm `session-handoff` and `ui-ux-pro-max` parity between `.codex/skills` and `.claude/skills` before changing ignore rules.
- [x] Record current dirty paths and assert that Shimmer data and authorization reports are excluded from every later staged scope.
- [x] Obtain user approval for `agent/skills/` as the canonical source before creating the directory.

Validation:

```bash
git status --short --branch -uall
git ls-files .codex/skills .claude/skills
git check-ignore -v .claude/settings.json .claude/worktrees .superpowers tmp
git diff --check
```

## Task 2: Establish Cross-Model Entry Contracts

**Files:**
- Create: `CLAUDE.md`, `GEMINI.md`, `agent/README.md`, `agent/skills/README.md`
- Modify: `AGENTS.md`, `README.md`, `docs/project-governance/00_CURRENT_SPEC.md` only where current facts change
- Test: `platform/tooling/agent-entry-contract.test.mjs`

- [x] Write each entry as a thin adapter: read order, source-of-truth documents, skill-selection rule, and sync command; do not copy the full workflow.
- [x] State that `agent/skills` is the source and `.codex/skills`/`.claude/skills` are generated runtime views.
- [x] State that skills are read on demand from their `description`; agents must not load every skill into context.
- [x] Add tests asserting that each entry references `AGENTS.md`, `docs/project-governance/00_CURRENT_SPEC.md`, `docs/project-governance/00_WORKFLOW.md`, and the sync command.
- [x] Add a negative test rejecting instructions that make a vendor-only tool a mandatory project dependency.

## Task 3: Build the Common Skill Source and Synchronizer

**Files:**
- Create: `agent/skills/skill-manifest.json`, `platform/tooling/sync-agent-skills.mjs`, `platform/tooling/sync-agent-skills.test.mjs`
- Modify: `.gitignore`
- Migrate: portable skill directories from `.codex/skills/` into `agent/skills/`
- Generate: corresponding `.codex/skills/` and `.claude/skills/` runtime copies

Synchronizer contract:

```text
--write  validate the manifest, copy portable SKILL.md/references, preserve runtime metadata
--check  compare source and generated copies, exit 1 with exact drift paths
--list   print portable, Codex-only, Claude-only, and external/plugin entries
```

- [x] Validate skill names against `[a-z0-9-]+`, required `name`/`description` frontmatter, and repository containment.
- [x] Copy only files listed by the manifest; reject undeclared generated files and traversal.
- [x] Preserve `.codex/skills/*/agents/openai.yaml` and other Codex-only metadata without copying it into the common source.
- [x] Create tracked `.claude/skills/` exceptions while leaving `.claude/settings.json`, `.claude/worktrees/`, and other local state ignored.
- [x] Make synchronization deterministic: stable ordering, normalized line endings, no timestamps, and no machine paths.
- [x] Test a new skill, changed skill, deleted skill, malformed frontmatter, outside-root reference, and stale runtime copy.
- [x] Run `node platform/tooling/sync-agent-skills.mjs --check` before and after generated files are staged; commit authority is granted and the current result is 79 source files in sync.

## Task 4: Normalize Skill Content for Mixed Models

**Files:**
- Modify: portable `agent/skills/*/SKILL.md` and directly referenced references
- Keep vendor-specific: `.codex/skills/*/agents/`, Codex tool mapping, Claude plugin settings
- Test: `platform/tooling/skill-portability.test.mjs`

- [x] Replace mandatory Claude-only or Codex-only tool names in portable skills with generic actions and a tool-mapping reference.
- [x] Keep TerraPedia workflow rules in `terrapedia-*` skills and generic superpowers workflow skills portable.
- [x] Ensure every portable skill uses only `name` and `description` frontmatter plus repository-relative references.
- [x] Add explicit fallbacks for environments without subagents, browser tools, or PowerShell.
- [x] Verify `session-handoff` remains byte-identical across generated Codex and Claude copies.
- [x] Verify descriptions identify trigger conditions without embedding a shortened workflow that makes models skip the body.

## Task 5: Clarify Deployable Boundaries Without Merging Apps and Services

**Files:**
- Create: `docs/architecture/deployable-components.md`
- Modify: `AGENTS.md`, `README.md`, `docs/architecture/project-structure-v2.md`, `docs/architecture/README.md`, `docs/architecture/file-placement-rules.md`

- [x] Document `apps/public-web` and `apps/admin-console` as browser-facing Nuxt deployables.
- [x] Document `services/catalog-api` as a Spring Boot deployable with database/API lifecycle.
- [x] Document `packages/content-runtime` as a library, not a deployable.
- [x] Document `pipelines` and `platform` as operational code with separate validation and write boundaries.
- [x] Add a dependency table: public web/admin console -> catalog API -> canonical DB/data; pipelines -> canonical data/import contracts; packages -> consuming apps/services.
- [x] Explicitly forbid creating `apps/catalog-api`, `products/`, or `workspaces/` as alternative homes.
- [x] Add a root allowed-entry table so the top level feels intentional without another nesting layer.

Validation:

```bash
rg -n 'apps/catalog-api|products/|workspaces/' AGENTS.md README.md docs/architecture docs/project-governance | rg -v 'Forbidden Alternative Homes|禁止创建|Do not create|不应创建|alternative homes|替代目录'
node scripts/lib/project-constants-usage.test.mjs
git diff --check
```

## Task 6: Consolidate Temporary Output and Historical Summaries

**Files:**
- Create: `.local/README.md` (ignored), `docs/audits/structure/local-artifact-inventory-2026-08-16.md`
- Modify: `.gitignore`, `docs/architecture/file-placement-rules.md`, `README.md`, `AGENTS.md`
- Move after reference scan: `PLAN_FIXES_SUMMARY.md`, `REFACTORING_SUMMARY.md` to `docs/project-governance/archive/`
- Inspect before moving: `tmp/`, `logs/`, `reports/tmp/`, `task/`

- [x] Scan production scripts, tests, docs, and local wrappers for writes to root `tmp/`, root `logs/`, and `reports/tmp/`.
- [x] Classify every consumer as ephemeral local state, reproducible runtime report, durable audit evidence, or compatibility input.
- [x] Change only audited local-output consumers to `.local/tmp/` or `.local/logs/`; keep report consumers under `reports/runtime/<operation>/`.
- [x] Do not delete existing ignored files during this task; record them and require explicit user approval for cleanup.
- [x] Move the two root summaries without rewriting historical content; update only references that would break.
- [x] Add a scanner rejecting new root `*_SUMMARY.md`, root `tmp/`, and root `logs/` references outside an allowlist.
- [x] Keep `task/` as local task context and state clearly that it is not a source of project facts.

Validation:

```bash
rg -n --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' '(\./)?tmp/|(^|/)logs/|reports/tmp|^[^/]+_SUMMARY\.md' .
git diff --check
```

## Task 7: Close Compatibility Symlinks Only After the Full Scan

**Files:**
- Read-only scan: all tracked source, docs, CI, scripts, tests, and runbooks
- Modify only after a clean scan: references to `front-nuxt`, `data-query-app`, `back`, `shared/article-runtime`, `scripts/dev`, `scripts/ops`, `scripts/tooling`, `scripts/data`
- Create: `docs/audits/structure/mixed-agent-structure-acceptance-2026-08-16.md`

- [x] Run a full old-path reference scan and classify every match as canonical, historical, compatibility, fixture, or defect.
- [x] Prove all current executable consumers use `apps/`, `services/`, `packages/`, `platform/`, and `pipelines/` paths; repair the discovered runbook, design, and portable-skill references and rescan.
- [x] Verify generated skill copies and `.local` rules do not reintroduce old paths or ignored worktree content.
- [x] Run all path/structure contracts before removing any symlink.
- [x] User authorization was obtained and the eight symlinks were removed; the result is committed only after the focused path/structure validation gate.
- [x] Re-run the scan and assert that no current executable or governance reference requires a removed path.
- [x] Preserve historical references in archive/audit documents with an explicit classification as historical, fixture, or compatibility.

## Task 8: Integrated Validation and Handoff

**Files:**
- Modify: `docs/devlog/entries/2026-08-16-mixed-agent-structure-convergence.md`, `docs/devlog/current.md`
- Create/update: `docs/audits/structure/mixed-agent-structure-acceptance-2026-08-16.md`

- [x] Run `node platform/tooling/sync-agent-skills.mjs --check`.
- [x] Run all new Node tests and existing structure/path tests.
- [x] Run Shell/PowerShell path contracts.
- [x] Run `cd apps/admin-console && pnpm run check`.
- [x] Run focused backend path/acceptance Maven tests from `services/catalog-api/`.
- [x] Run `git diff --check` and targeted term/path scans.
- [x] Run the narrow local quality gate that excludes unrelated public sitemap and fixture variances; record exact counts: 321/326 passed, with 5 failures caused by missing authorization fixtures in the isolated worktree.
- [x] Verify `git status --short` and confirm Shimmer and authorization paths remain untouched and unstaged.
- [x] Record residual risks, unrun crawler/database operations, branch/worktree, validation output, and next action in the devlog.

## Commit Boundaries

Use separate focused commits:

1. `docs(structure): add mixed-agent structure plan and inventory`
2. `feat(tooling): add portable skill source and runtime synchronizer`
3. `docs(structure): clarify deployable and local artifact boundaries`
4. `refactor(structure): close legacy aliases after reference audit`

Before each commit:

```bash
git status --short
git diff --cached --stat
git diff --check
```

Never stage with `git add .`; explicitly stage only the task's files. Do not stage existing user changes under `data/generated/shimmer/` or `reports/authorization/`.

## Failure Handling

- If a skill cannot satisfy portable frontmatter or generic-tool constraints, classify it `codex-only` and leave it in `.codex/skills`; never silently copy a broken skill to Claude.
- If `.claude/skills` cannot be tracked without capturing local state, repair `.gitignore` with exact negation rules and rerun `git check-ignore`; never broadly unignore `.claude/*`.
- If an output consumer still needs root `tmp/` or `logs/`, keep a documented compatibility alias until a focused replacement exists; do not mass-rewrite all `process.cwd()` consumers.
- If an old-path scan finds an executable consumer, stop symlink removal, repair that consumer, rerun the affected test, and repeat the scan.
- If validation depends on missing local fixtures, record the exact missing fixture and keep the task `active`; do not regenerate or overwrite user data to make the gate green.

## Final Acceptance

The task is complete only when:

- The `agent/skills` source and runtime adapters pass parity checks.
- Claude, Codex, and Gemini entry files point to the same current project facts.
- `apps` and `services` remain distinct and are explained by a deployable-components index.
- Root temporary files and summaries have documented owners and no new uncontrolled consumers.
- Legacy symlinks are removed only after the scan proves they are unnecessary.
- The acceptance audit, devlog, focused tests, and residual risks are recorded.
