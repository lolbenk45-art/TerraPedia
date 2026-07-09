---
name: terrapedia-devlog-guard
description: Use when starting, continuing, handing off, closing, committing, or reviewing TerraPedia feature, fix, data, crawler, workflow, documentation, skill, API, UI, validation-gate, multi-agent, or multi-step work.
---

# TerraPedia Devlog Guard

## Overview

Keep TerraPedia work in a handoff-ready state. Use `docs/devlog/` to preserve the current task chain, engineering decisions, validation evidence, residual risks, and next action that git diffs do not explain.

## Core Rule

Git records what changed. Devlog records why it changed, what was verified, what remains risky, and where the next agent should continue.

Do not use devlog as a full diary, copied diff, command transcript, or replacement for tests, specs, plans, decisions, or commits.

## Required Files

- `docs/devlog/current.md`: first-read current-state index.
- `docs/devlog/entries/*.md`: one task-level entry per branch, feature, fix, data run, review chain, or workflow change.
- `docs/devlog/templates/entry.md`: template for new entries.
- `docs/devlog/archive/`: optional monthly or milestone summaries.

## Workflow

1. At task start, read `docs/devlog/current.md` if it exists.
2. Compare current git branch, open entry status, active entry status, git status, review findings, and conflict notes. Treat mismatches or unresolved findings as stale state.
3. Decide whether the task needs a devlog entry.
4. Create or reuse an entry for non-trivial work.
5. Keep `current.md` short and pointed at open entries.
6. Append to the entry only for meaningful state changes.
7. Keep completed but uncommitted work as `ready-for-commit`.
8. For one-commit closeout, run status/staged-stat checks first, then set the entry to `closed` before commit only after review gates are clear, with result, validation, residual risks, follow-up, and `commit SHA pending in final response`; move it out of `current.md` Open Work. Run status/staged-stat checks again after closeout edits and staging. If commit fails after pending-SHA closeout, complete the commit immediately or reopen/demote the entry to `active` before any other work.
9. After commit, do not edit devlog solely to backfill SHA unless making an explicit second devlog-closeout commit. Report the commit SHA in the final response.
10. Use stop reasons only for abandoned, no-op, or intentionally stopped work. If completed work remains uncommitted, keep `ready-for-commit`; if validation is incomplete, keep `active` or `blocked`.

If the user requests read-only or no-edit review, read `current.md` and active entries but do not create or update devlog files. Report the devlog updates a writing agent should make.

If a read-only review finds material gaps, output `COMMIT BLOCKED: required devlog update` and list the required demotion or entry updates. A later writing follow-up must record those findings before commit.

## Multi-Agent Work

Before dispatching parallel agents:

- name one coordinator
- record each agent's owner, status, task scope, allowed files, forbidden files, dependencies, validation duty, blockers, handoff notes, and expected return format
- use separate child entries for true parallel devlog writes
- use shared-entry sections only when the coordinator updates them or turns are serialized
- when agents use separate entries, designate one coordinator or parent entry; only that parent entry may represent task-level `ready-for-commit` or `closed`
- record shared state and serialization rules
- record how multiple open entries should appear in `docs/devlog/current.md`

During parallel work:

- only the coordinator edits `docs/devlog/current.md`
- each agent edits only its assigned entry or section
- before appending, re-read `docs/devlog/current.md` and the active entry
- agents must not mark the whole task closed
- agents must report blockers, validation, and follow-up in their assigned area
- producer agents must record final contract version or hash plus API, state, schema, or contract changes before consumer agents finalize dependent work
- consumer agents must acknowledge the current contract version or hash before finalizing dependent work
- later producer contract changes invalidate prior consumer acknowledgement and return dependent consumer work to `active`

After agents return:

- the coordinator merges results into the parent or active entry
- record conflicts, skipped validation, or unresolved scope
- parallel work is not `ready-for-commit` until all child entries are `closed`, or `blocked` with explicit stop reason plus parent follow-up owner and next entry, producer/consumer acknowledgement is current, cross-boundary validation is recorded, and residual risks are consolidated
- a parent cannot be `ready-for-commit` while a child is unresolved `blocked`; blocked children must be intentionally stopped or transferred to a named follow-up owner
- close the entry only after cross-boundary validation, consolidated residual risks, and commit or stop reason are recorded

Do not run parallel devlog writes when agents share the same file, page section, database table field, generated contract, status model, fixture, route constant, permission model, long-running script, or service lifecycle. Serialize those tasks.

## Conflict Handling

When a multi-agent conflict is detected:

1. Stop all parallel writes to the conflicting target.
2. Stop dependent consumer work until the coordinator restates the owner and valid contract.
3. Have the coordinator record `integration-conflict` in the active entry.
4. Record conflicting agents, files or state, last known valid contract, chosen serialization order, and required validation.
5. Assign exactly one owner to the conflicting target before work resumes.
6. Update dependent agent sections or entries with the new dependency.
7. Do not mark work `ready-for-commit` or `closed` until conflict resolution and integrated validation are recorded.

Conflicts include overlapping files, page sections, database table fields, generated contracts, status models, fixtures, route constants, permissions, service lifecycles, or long-running scripts.

## Cross-Review

Record reviewer, scope, findings, disposition, re-review requirement, resolver, and remaining risks.

If external or subagent review finds material gaps, move `ready-for-commit` back to `active` until each finding is fixed and re-reviewed, rejected with reason, or explicitly deferred to a new owner and follow-up task. The coordinator owns final arbitration when reviews disagree.

Record arbitration decision, decision owner, and rationale. `needs-coordinator-decision` blocks `ready-for-commit`, `closed`, commit, PR, push, merge, and cleanup.

## Entry Decision

Use git-only when all are true:

- The change is tiny and local.
- No future agent needs handoff context.
- No plan, data, crawler, workflow, or multi-step follow-up is involved.
- The final chat response and git commit message are enough.

Use devlog when any are true:

- The user asks for devlog, traceability, consistency, handoff, or current-state recording.
- Work spans multiple steps, agents, days, branches, domains, or commits.
- The task creates or changes project workflow, skill behavior, data chain, crawler behavior, scripts, API contract, UI flow, or validation gates.
- There is a non-obvious decision, rejected approach, blocker, validation gap, residual risk, or follow-up.
- A later task is expected to continue from this task.

If uncertain, create a compact entry.

For commit closeout, re-evaluate this decision even when no entry exists. If devlog is required and missing, stop.

Git-only exceptions are allowed only for tiny local changes where no devlog-required category applies. For committed work, record the exception durably before commit in the active entry or commit message body with scope, changed paths, why no future handoff is needed, validation, and why no devlog-required category applies. Final-response-only exceptions are not durable for committed work. Do not use git-only for workflow, skill, data, crawler, API, UI, validation-gate, or multi-agent work. If the user forbids devlog edits for devlog-required work, stop before commit or closeout and report the traceability conflict.

## What To Record

Record only these state changes:

- goal or success criteria changed
- implementation direction changed
- affected scope changed
- blocker appeared or cleared
- validation command/result changed
- residual risk or follow-up was discovered
- review finding or disposition changed
- conflict status, owner, or serialization order changed
- commit was created or task was intentionally stopped
- `current.md` handoff target changed

For code changes, name affected paths or modules and write: `See git for code-level diff details.`

## What Not To Record

- Do not log every small edit.
- Do not paste diffs.
- Do not paste long command output.
- Do not duplicate specs, plans, audits, or decision-log entries.
- Do not mark committed work closed without validation evidence.
- Do not leave `current.md` pointing to a closed entry as active work.

## Closeout Standard

An entry can be `closed` only when:

- result is recorded
- validation is recorded when the entry is closing for a commit or ready-for-commit handoff
- explicit validation blocker replaces validation only when the entry is closed due to abandoned, no-op, or intentionally stopped work with a stop reason
- residual risks are recorded
- follow-up is empty, or points to a new task or owner
- commit SHA, `commit SHA pending in final response`, or explicit stop reason is recorded
- `docs/devlog/current.md` is updated

Use `ready-for-commit` when the work is complete but the final commit SHA is not available yet.

Use `closed` with `commit SHA pending in final response` only as part of a commit closeout where the commit is about to be created.

## Current.md Standard

`current.md` must stay short:

- last updated time and updater, formatted exactly as `Last updated: YYYY-MM-DD HH:mm CST by <updater>`
- active branch
- active focus
- open entries with owner, status, and parent/child relationship
- current state
- next agent start point
- current risks
- recently closed entries

If it starts becoming a full report, move detail into an entry.

Every entry must have one top-level `## Status` section whose first non-empty line is exactly one code-spanned value: `active`, `blocked`, `ready-for-commit`, or `closed`. Scanners must parse that section only, not historical text or examples.

When `current.md` is missing, empty, points to another branch without preserving this branch, has a missing/future timestamp, uses anything other than `Last updated: YYYY-MM-DD HH:mm CST by <updater>`, has a `ready-for-commit` entry older than 24 hours without a `Freshness note: still valid as of YYYY-MM-DD HH:mm CST by <updater>` line under that entry in `current.md`, or before commit, parse `docs/devlog/entries/*.md` for `active`, `blocked`, `ready-for-commit`, and `closed` with `commit SHA pending in final response` entries and repair/report stale current-state before continuing. If a pending-SHA closed entry exists, complete the commit immediately or reopen/demote the entry to `active` before any other work.

Open entries in `current.md` must include owner, status, branch, worktree path, parent/child relationship, dependencies or blocked-by, and contract handoff. Cross-branch open entries block only when they share files, contracts, data targets, service lifecycle, or follow-up ownership with the current task; otherwise report them as context and preserve them.

Minimum validation for docs/process-only work is `git diff --check` plus targeted consistency scans. Skill changes also require the skill validator for each touched skill. Workflow or multi-agent rule changes require targeted re-review for material findings before `ready-for-commit`.

Split or follow up an entry when it exceeds eight substantive review rounds or mixes independent feature chains. Archive summaries must cite source entry paths and commit ranges; they never replace entries as authority.

## Common Mistakes

| Mistake | Correction |
| --- | --- |
| Treating devlog as a diary | Record only state changes that affect handoff. |
| Copying code diffs | Refer to paths and git commit. |
| Keeping one endless entry | Close finished work and open a new entry for follow-up. |
| Leaving stale active state | Update `current.md` during closeout. |
| Replacing tests with prose | Run validation or record why it was blocked. |
| Letting every agent edit `current.md` | Assign one coordinator to update the current-state index. |
| Finalizing UI before backend contract is recorded | Producer records contract changes before consumer closeout. |
| Marking parallel work ready while another section is active | Coordinator waits for all sections to complete or stop explicitly. |
| Continuing parallel edits after a conflict appears | Stop conflicting writes and serialize ownership through the coordinator. |
| Backfilling SHA after a one-commit closeout | Report SHA in final response, or make an explicit second devlog-closeout commit. |
| Ignoring material review findings | Demote to active until each finding is fixed and re-reviewed, rejected with reason, or deferred with owner and follow-up. |
