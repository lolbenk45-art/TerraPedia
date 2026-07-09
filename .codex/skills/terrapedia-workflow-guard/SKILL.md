---
name: terrapedia-workflow-guard
description: Enforce the TerraPedia repository workflow for coding, debugging, data backfills, local stack operations, validation, review, and git commits. Use when Codex is asked to fix, modify, implement, investigate, backfill, integrate, test, review, or commit TerraPedia repo work and should follow the project SOP before editing. Not for casual Q&A, translation, or non-repo tasks.
---

# TerraPedia Workflow Guard

Apply the TerraPedia repo workflow before implementation so work does not jump straight into edits, long-running scripts, or commits without checks.

## Workflow

1. Restate the task goal and success criteria.
2. Read `docs/devlog/current.md` when it exists. For non-trivial work, active related entries, workflow, skill, data, crawler, API, UI, validation changes, multi-agent work, handoff, review closeout, commit, or closeout, REQUIRED SUB-SKILL: use `terrapedia-devlog-guard` before implementation, review closeout, handoff, or commit.
3. Inspect the real entrypoints, runtime state, data source chain, and reusable reports or scripts.
4. Lock scope, assumptions, and the minimum validation plan.
5. Implement only after the above is stable.
6. Validate before claiming completion.
7. Check staged scope before commit.

## Source Of Truth

If the current repo contains `project-plan/00_协作开发标准流程.md`, read it first and follow it. That exact file is the repo SOP source of truth.

If that file is missing or unavailable, read:

- `references/terrapedia-workflow.md`

## Required Checkpoints

### Before Editing

Always establish:

- task restatement
- success criteria
- devlog state: git-only, reused entry, or new entry
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
- whether any devlog entry was closed, left active, or not needed
- whether the user must refresh, restart, or rerun anything

### Before Commit

Always run:

```powershell
git status --short
git diff --cached --stat
```

If a devlog entry exists and commit is about to happen, run status/staged-stat checks first, then update result, validation, residual risks, and follow-up. Set the entry to `closed` with `commit SHA pending in final response` only after review gates are clear, remove it from `docs/devlog/current.md` Open Work before commit, and run status/staged-stat checks again after closeout edits and staging. After commit, report the commit SHA in the final response, or make an explicit second devlog-closeout commit if the SHA must be written into the entry. If commit fails after a pending-SHA closeout, reopen the entry or complete the commit before doing other work.

## Parallelism Rules

Allowed:

- independent read-only exploration
- disjoint file edits
- subtasks that do not share a write target
- separate devlog child entries for true parallel devlog writes

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
- shared-entry devlog writes from multiple agents in parallel

If the task writes data, define shard boundaries before parallel work starts.

For multi-agent work that uses devlog, define the coordinator before dispatch. Only the coordinator updates `docs/devlog/current.md`. True parallel devlog writes use separate child entries; shared-entry sections are updated only by the coordinator or by serialized turns.

If a multi-agent conflict appears, stop parallel writes to the conflicting target, record `integration-conflict` in the active devlog entry, assign one owner, and require integrated validation before commit.

## Blocking Rules

Stop and fix the workflow first if any of these is true:

- the task goal and success criteria are not restated
- required devlog state is unknown for non-trivial work
- devlog-required work is proceeding without `terrapedia-devlog-guard` loaded
- multi-agent work has no devlog coordinator or ownership boundary
- multi-agent conflict has no recorded owner, serialization order, or integrated validation plan
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
