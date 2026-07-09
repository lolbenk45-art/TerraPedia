# TerraPedia Agent Guide

This is the first-read guide for agents working in this repository.

## Read First

1. `docs/project-governance/00_CURRENT_SPEC.md`
2. `docs/project-governance/00_WORKFLOW.md`
3. `docs/devlog/current.md`
4. The active task plan, devlog entry, or issue named by the user.

## Source Of Truth

- Current project facts: `docs/project-governance/00_CURRENT_SPEC.md`
- Execution workflow: `docs/project-governance/00_WORKFLOW.md`
- Active handoff state: `docs/devlog/current.md`
- Project governance index: `docs/project-governance/INDEX.md`

If documents conflict, follow the order above. Files under `docs/project-governance/legacy/` and `docs/project-governance/archive/` are historical reference only unless the current spec explicitly promotes them.

## Before Editing

- Restate the user goal and success criteria.
- Read `docs/devlog/current.md` and decide whether to reuse or create a devlog entry.
- Identify true entrypoints, data chain, affected files, and validation plan.
- Keep edits scoped to the task. Do not rewrite historical documents just to make old text modern.

## Before Commit

- Run the task's minimum validation.
- Run `git status --short`.
- Run `git diff --cached --stat`.
- Record spec impact:
  - `Spec updated: docs/project-governance/00_CURRENT_SPEC.md`
  - `Status updated: docs/project-management/current-status.md`
  - `Decision updated: docs/project-management/decision-log.md`
  - or `Spec impact: none`

## Documentation Rules

- Long-term current facts go in `docs/project-governance/00_CURRENT_SPEC.md`.
- Task execution notes go in `docs/devlog/entries/`.
- Current handoff state goes in `docs/devlog/current.md`.
- Task-level execution plans go in `docs/plans/` or `docs/superpowers/plans/`.
- Historical project plans stay under `docs/project-governance/archive/` or `docs/project-governance/legacy/`.
