# TerraPedia Workflow Reference

This is the skill reference copy of the TerraPedia repo workflow. If the active repo contains the main workflow doc under `project-plan/` with the `00_` prefix, that file is the source of truth.

## Repo Defaults

- Default local DB: `terria_v1_local`
- Default start entrypoint: `scripts/dev/start-local-stack.ps1`
- Default stop entrypoint: `scripts/dev/stop-local-stack.ps1`
- Default local config file: `scripts/dev/local-stack.config.json`

Common commands:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\start-local-stack.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\stop-local-stack.ps1
cd back
mvn "-Dtest=ClassA,ClassB" test
mvn test
cd data-query-app
pnpm run check
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

## Standard Steps

### 1. Task Entry

Required output:

- task restatement
- success criteria
- what is out of scope
- task type

Checklist:

- [ ] I can state the goal in one sentence
- [ ] I know what counts as done
- [ ] I know what is out of scope
- [ ] I know the task type

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

Checklist:

- [ ] Staged files are task-related only
- [ ] Minimum validation is done or blocked with explanation
- [ ] Commit message states the behavior change clearly

## Multi-Agent SOP

Allowed:

- independent read-only exploration
- disjoint file edits

Not allowed:

- same file
- same page section
- same DB table field
- same long-running script
- same process port lifecycle

Before parallel work:

- define each write scope
- define forbidden files
- define result collection
- check for shared write targets

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

- `scripts/dev/local-stack.config.json`
- `scripts/dev/start-local-stack.ps1`

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
- [ ] Minimum validation is done or blocked with explanation
- [ ] Commit message clearly states the behavior change
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
