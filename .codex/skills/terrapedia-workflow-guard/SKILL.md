---
name: terrapedia-workflow-guard
description: Enforce the TerraPedia repository workflow for coding, debugging, data backfills, local stack operations, validation, review, and git commits. Use when Codex is asked to fix, modify, implement, investigate, backfill, integrate, test, review, or commit TerraPedia repo work and should follow the project SOP before editing. Not for casual Q&A, translation, or non-repo tasks.
---

# TerraPedia Workflow Guard

Apply the TerraPedia repo workflow before implementation so work does not jump straight into edits, long-running scripts, or commits without checks.

## Workflow

1. Restate the task goal and success criteria.
2. Inspect the real entrypoints, runtime state, data source chain, and reusable reports or scripts.
3. Lock scope, assumptions, and the minimum validation plan.
4. Implement only after the above is stable.
5. Validate before claiming completion.
6. Check staged scope before commit.

## Source Of Truth

If the current repo contains the main workflow doc under `project-plan/` with the `00_` prefix, read it first and follow it.

If that file is missing or unavailable, read:

- `references/terrapedia-workflow.md`

## Required Checkpoints

### Before Editing

Always establish:

- task restatement
- success criteria
- true entry file or endpoint
- current runtime state
- impact scope
- minimum validation plan

### Before Data Writes

For data tasks, always establish:

- target database
- current DB counts or state
- reusable reports or prior backfills
- whether another task is already writing the same target

### Before Finishing

Always report:

- what is finished
- what is still risky
- what was blocked and whether it is related
- whether the user must refresh, restart, or rerun anything

### Before Commit

Always run:

```powershell
git status --short
git diff --cached --stat
```

## Parallelism Rules

Allowed:

- independent read-only exploration
- disjoint file edits
- subtasks that do not share a write target

Not allowed:

- same file
- same page section
- same DB table field
- same long-running script
- same service port lifecycle

If the task writes data, define shard boundaries before parallel work starts.

## Blocking Rules

Stop and fix the workflow first if any of these is true:

- the task goal and success criteria are not restated
- the environment has not been verified
- the target files and impact scope are not locked
- validation is undefined
- another task is already writing the same target
- minimum validation is incomplete but completion or commit is about to happen

## Task-Type Routing

Default ordering by task type:

- UI: data chain, then template, then styling
- backend: API contract, then service, then mapper or SQL
- data: current state, then historical reports, then dry run, then batched execution
- integration: startup chain, then API, then page, then DB

## Reference Usage

Read `references/terrapedia-workflow.md` for:

- repo defaults and commands
- blocking rules
- execution checklists
- multi-agent rules
- emergency exception template
- pre-commit checklist
- pre-backfill checklist
