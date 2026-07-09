# TerraPedia Workflow Reference

This is the skill reference copy of the TerraPedia repo workflow. If the active repo contains `project-plan/00_协作开发标准流程.md`, that exact file is the source of truth.

## Repo Defaults

- Default local DB: `terria_v1_local`
- Default start entrypoint: `scripts/dev/start-local-stack.sh`
- Default stop entrypoint: `scripts/dev/stop-local-stack.sh`
- Default local config template: `scripts/dev/config/local-stack.config.example.json`
- Bash / WSL is the local automation path. Same-name `.ps1` files are temporary compatibility wrappers only.

Common commands:

```bash
bash ./scripts/dev/start-local-stack.sh
bash ./scripts/dev/stop-local-stack.sh
cd back
mvn -Dtest=ClassA,ClassB test
mvn test
cd data-query-app
pnpm run check
pnpm run test
cd front-nuxt
pnpm run check
bash ./scripts/dev/quality-gate.sh
git status --short
git diff --cached --stat
```

## Task Routing

| Type | Default order | Typical risk |
| --- | --- | --- |
| UI | data chain, template, style | mistaking missing data for a style bug |
| backend | API contract, service, mapper or SQL | changing internals without matching returned shape |
| data | current state, reports, dry run, batched execution | mixed writes or wrong DB |
| integration | startup chain, API, page, DB | testing the wrong process |

## Blocking Rules

Stop if any of these is true:

- goal and success criteria are not restated
- required devlog state is unknown for non-trivial work
- devlog-required work is proceeding without `terrapedia-devlog-guard` loaded
- multi-agent work has no devlog coordinator or ownership boundary
- multi-agent conflict has no recorded owner, serialization order, or integrated validation plan
- environment facts are not verified
- scope and target files are not locked
- validation is undefined
- data write targets are not checked
- another task is writing the same target
- minimum validation is missing but completion or commit is about to happen

Minimum validation means at least one of:

- backend: compile + targeted tests
- frontend: typecheck, build check, or page validation
- data: dry run, DB count check, or sample verification
- docs/process-only: `git diff --check` plus targeted consistency scans
- skill changes: skill validator for each touched skill plus `git diff --check`
- workflow or multi-agent rule changes: targeted re-review for material findings before `ready-for-commit`

## Standard Steps

### 1. Task Entry

Required output:

- task restatement
- success criteria
- what is out of scope
- task type
- devlog state: git-only, reused entry, or new entry

Checklist:

- [ ] I can state the goal in one sentence
- [ ] I know what counts as done
- [ ] I know what is out of scope
- [ ] I know the task type
- [ ] I know whether this task needs `docs/devlog/`

### 2. Environment Verification

Required output:

- true page / API / script entrypoint
- data source chain
- current runtime state
- reusable scripts, reports, or tests

Checklist:

- [ ] I found the real entrypoint
- [ ] I know whether the value comes from frontend, backend, or DB
- [ ] I checked the actual running environment
- [ ] I checked for reusable reports or scripts

### 3. Scoping And Assumptions

Required output:

- impact scope
- compatibility constraints
- key assumptions
- validation plan

Checklist:

- [ ] I know what pages, APIs, tables, or scripts are affected
- [ ] I know what must stay compatible
- [ ] I know the main regression risk
- [ ] Uncertainty is written as explicit assumptions

### 4. Solution

Required output:

- minimum viable solution
- layers to change
- layers not to change
- data source and precedence
- validation order

Checklist:

- [ ] The solution is minimal and implementable
- [ ] The implementer does not need extra decisions
- [ ] Validation order is explicit

### 5. Implementation

Rules:

- lock target files first
- only edit related files
- fix data chain before UI when both are involved
- if blocked by unrelated compile issues, apply the smallest unblock needed

Checklist:

- [ ] Target file scope is locked
- [ ] No unrelated cleanup is mixed in
- [ ] Any unblock fix is minimal

### 6. Validation

Validation order:

1. syntax, type, compile
2. targeted tests
3. runtime API checks
4. page checks
5. DB counts or sample checks

Checklist:

- [ ] Minimum validation is done
- [ ] I know what passed
- [ ] I know what failed and whether it is related
- [ ] I did not present unrun checks as completed

### 7. Review

Required output:

- resolved issues
- remaining risks
- unrelated issues discovered during the task
- whether any devlog entry was closed, left active, or not needed

Checklist:

- [ ] I can state what was fixed
- [ ] I can state what is still risky
- [ ] I know whether the user must refresh, restart, or rerun anything

### 8. Git Commit

Always run:

```powershell
git status --short
git diff --cached --stat
```

Before commit:

- re-evaluate whether devlog is required
- parse `docs/devlog/entries/*.md` status sections for `active`, `blocked`, `ready-for-commit`, and `closed` with pending SHA
- stop if `docs/devlog/current.md` omits an open entry
- stop if material read-only review findings or `COMMIT BLOCKED: required devlog update` are unrecorded or recorded but unresolved
- run status/staged-stat checks before closeout edits and again after closeout edits and staging
- for one-commit devlog closeout, set the entry to `closed` before commit only after review gates are clear, with result, validation, residual risks, follow-up, and `commit SHA pending in final response`; remove it from `current.md` Open Work
- keep completed but uncommitted work as `ready-for-commit`
- use git-only only for tiny local changes where no future handoff is needed and no devlog-required category applies; do not use git-only for workflow, skill, data, crawler, API, UI, validation-gate, or multi-agent work
- use `type(scope): action` commit messages. Allowed types are `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, and `data`. Do not use `[code]` as the primary convention.

Checklist:

- [ ] Staged files are task-related only
- [ ] Minimum validation is done, or this is an abandoned/no-op/intentionally stopped closeout with explicit validation blocker
- [ ] Commit message uses `type(scope): action` and states the behavior change clearly
- [ ] Devlog closeout state is correct, or git-only exception is explicitly justified

## Multi-Agent SOP

Allowed:

- independent read-only exploration
- disjoint file edits

Not allowed:

- same file
- same page section
- same DB table field
- same generated contract
- same status model
- same fixture
- same route constant
- same permission model
- same long-running script
- same service lifecycle

Before parallel work:

- define each write scope
- define forbidden files
- define result collection
- check for shared write targets
- if using devlog, assign one coordinator for `docs/devlog/current.md`
- use separate child entries for true parallel devlog writes
- only the parent entry may represent task-level `ready-for-commit` or `closed`
- parent work cannot become `ready-for-commit` while a child entry is unresolved `blocked`; blocked children need explicit stop reason plus named owner and follow-up entry
- define producer/consumer contract handoff, consumer acknowledgement, and cross-boundary validation

If a multi-agent conflict appears:

- stop parallel writes to the conflicting target
- stop dependent consumer work until the coordinator restates owner and valid contract
- record `integration-conflict` in the active devlog entry
- record conflicting agents, files or state, last known valid contract, serialization order, and required validation
- assign exactly one owner before work resumes

For data tasks:

- [ ] no existing shared writer is still running, or it was explicitly stopped
- [ ] shard boundaries are explicit and non-overlapping
- [ ] write source is singular

## Special Cases

### UI issues

Check:

- does the template render the field
- does CSS suppress or distort the layout
- does the API already return data
- is the field missing or just not displayed

### Data backfills

Check:

- current DB counts
- historical backfill reports
- current script capability
- existing long-running background jobs

Recommended order:

1. reuse reports
2. reuse scripts
3. dry run
4. small batch
5. then expand

### Config and startup

Check first:

- `scripts/dev/config/local-stack.config.json` for local-only config
- `scripts/dev/config/local-stack.config.example.json` for committed template
- `scripts/dev/start-local-stack.sh`

## Emergency Exception Template

```md
## Emergency Fix Exception Record
- Why this is urgent:
- User impact:
- Steps skipped:
- Current risk:
- Minimum validation completed:
- Validation still owed:
- Expected follow-up time:
```

## Common Templates

### Standard Task Template

```md
## Task Restatement
- Goal:
- Success criteria:
- Out of scope:

## Environment Verification
- Page / API entrypoint:
- Data source:
- Current runtime:
- Reusable scripts / reports:

## Assumptions
- Assumption 1:
- Assumption 2:

## Scope
- Frontend:
- Backend:
- Data:

## Validation Plan
- Syntax / compile:
- Targeted tests:
- Runtime checks:
- Data checks:

## Result Summary
- Completed:
- Risks:
- User action if needed:

## Unresolved
- Unrelated issues discovered during this task:
```

### Pre-Commit Checklist

```md
## Pre-Commit Checklist
- [ ] Ran git status --short
- [ ] Ran git diff --cached --stat
- [ ] Staged files are task-related only
- [ ] Re-evaluated whether devlog is required and scanned `docs/devlog/entries/*.md` open state
- [ ] No unrecorded or recorded-but-unresolved material review findings / `needs-coordinator-decision`
- [ ] If closing a devlog entry, review gates are clear and result, validation, risks, follow-up, and `commit SHA pending in final response` are recorded
- [ ] Git-only exception is only for a tiny local change outside workflow / skill / data / crawler / API / UI / validation-gate / multi-agent work, and is recorded before commit in the active entry or commit message body with scope, changed paths, validation, no-handoff reason, and why no devlog-required category applies
- [ ] Minimum validation is done, or this is an abandoned/no-op/intentionally stopped closeout with explicit validation blocker
- [ ] Commit message uses `type(scope): action` and clearly states the behavior change
```

### Pre-Backfill Checklist

```md
## Pre-Backfill Checklist
- [ ] Verified the current database target
- [ ] Counted the current data state
- [ ] Confirmed no shared writer is still running
- [ ] Checked whether historical reports can be reused
- [ ] Decided on dry run, small batch, or partitioned execution first
```
