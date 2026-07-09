# TerraPedia Devlog

`docs/devlog/` is the durable handoff layer for current development state.
It records engineering intent, decisions, validation, risk, and next steps that
are not obvious from git diffs alone.

## Files

- `current.md`: short current-state index. Read this first when starting work.
- `entries/`: one task-level devlog entry per branch, feature, fix, data run, or review chain.
- `templates/entry.md`: compact entry template for new work; optional multi-agent sections are added only when used.
- `archive/`: optional monthly or milestone summaries. Closed task entries stay in `entries/`; archive files summarize them with source entry paths and commit ranges, but entries remain authoritative.

## Rules

- Keep `current.md` short. It should point to the active entry and next action.
- `current.md` must include last updated time and updater.
- `current.md` timestamp must use exactly `Last updated: YYYY-MM-DD HH:mm CST by <updater>`.
- Do not copy diffs, large logs, or full command output into devlog files.
- Let git store code-level facts. Let devlog store decisions, evidence, risks, and handoff state.
- Create or reuse an entry for non-trivial TerraPedia work.
- Append to an entry only when goal, direction, scope, blocker, validation, commit, risk, or follow-up changes.
- Keep completed but uncommitted work as `ready-for-commit`.
- Close an entry only when work is committed, is being closed immediately before a one-commit closeout with `commit SHA pending in final response`, is no-op, abandoned, or intentionally stopped; validation is recorded; review gates are clear; and `current.md` no longer lists it as open.
- Use stop reasons only for abandoned, no-op, or intentionally stopped work. Do not use "no commit requested" to close completed uncommitted work.
- For one-commit closeout, set the entry to `closed` before commit with `commit SHA pending in final response`, move it out of `current.md` Open Work, and report the actual SHA in the final response.
- Run status and staged-stat checks before closeout edits, then run them again after closeout edits and staging so a failed commit cannot hide a closed pending entry.

## Status Contract

- Every entry must have one top-level `## Status` section.
- The first non-empty line after that heading must be exactly one code-spanned value: `active`, `blocked`, `ready-for-commit`, or `closed`.
- Scanners must parse only that section, not arbitrary status words in history, examples, or review notes.
- Treat `closed` plus `commit SHA pending in final response` as pending commit state until the commit is created or the entry is reopened.
- Before starting or committing, scan all entries for parseable status and also report any `closed` pending-SHA entry whose commit was not created.

## Current Index Contract

Each open entry in `current.md` must include:

- entry path
- owner
- status
- branch
- worktree path
- parent or child relationship
- dependencies or blocked-by
- contract handoff state

When closing one entry, preserve unrelated open entries from other branches or worktrees. Cross-branch open entries are reported as context; they block only when they share files, contracts, data targets, service lifecycle, or follow-up ownership with the current task.

## Git-Only Exceptions

Git-only is allowed only for tiny local changes where no future handoff context is needed and no devlog-required category applies.

Record the exception durably before commit in either the active entry or the commit message body with:

- scope
- changed paths
- why no future handoff is needed
- validation
- why no devlog-required category applies

The final response may summarize the exception, but final-response-only is not a durable record for committed work.

Do not use git-only for workflow, skill, data, crawler, API, UI, validation-gate, or multi-agent work. If the user forbids devlog edits for devlog-required work, stop before commit or closeout and report the traceability conflict.

## Commit Messages

Use `type(scope): action` so branch history is scannable without replacing devlog context.

- Types: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, `data`.
- Scope: short module or workflow name, such as `article`, `auth`, `admin`, `api`, `crawler`, `devlog`, or `workflow`.
- Action: imperative behavior summary, for example `feat(article): support editing existing articles`.
- Do not use `[code]` as the primary convention; it is too broad. Review-driven fixes use the real type, usually `fix`, `test`, or `refactor`.
- If the review source matters, put it in the commit body, not the subject.

## Multi-Agent Rules

- Assign one coordinator before dispatching parallel agents.
- The coordinator owns `docs/devlog/current.md`.
- For true parallel devlog writes, agents must use separate child entries.
- Shared-entry sections may be updated only by the coordinator or by serialized turns.
- Record each agent's owner name, status, task scope, allowed files, forbidden files, dependencies, validation responsibility, blockers, handoff notes, and return format before dispatch.
- When agents use separate entries, designate one coordinator or parent entry. Only that parent entry may represent task-level `ready-for-commit` or `closed`.
- Agents must not edit another agent's devlog section or mark the whole task closed.
- Before appending, re-read `docs/devlog/current.md` and the active entry to avoid stale writes.
- If multiple entries are open, list all of them in `current.md` with owner, status, parent/child relationship, dependencies or blocked-by, and contract handoff state.
- For backend/frontend or producer/consumer split work, the producer must record a final contract version or hash plus API, state, schema, or contract changes before the consumer finalizes dependent work.
- The consumer must acknowledge the current contract version or hash before finalizing dependent work.
- Any later producer contract change invalidates prior consumer acknowledgement and returns dependent consumer work to `active`.
- The coordinator merges agent results, records conflicts or blockers, and performs final closeout.
- Parallel work is not `ready-for-commit` until all child entries are `closed`, or `blocked` with explicit stop reason plus parent follow-up owner and next entry recorded, producer/consumer acknowledgement is current, cross-boundary validation is recorded, and residual risks are consolidated.
- A parent cannot be `ready-for-commit` when a child is merely unresolved `blocked`. `blocked` children are allowed only when intentionally stopped or transferred to a named follow-up owner; otherwise the parent stays `active` or `blocked`.
- If two agents need the same file, page section, database table field, generated contract, status model, fixture, route constant, permission model, long-running script, or service lifecycle, the work is not parallel and must be serialized.

## Conflict Handling

When a multi-agent conflict is detected:

- Stop all parallel writes to the conflicting target.
- Stop dependent consumer work until the coordinator restates the owner and valid contract.
- The coordinator records the entry status as `blocked` or keeps it `active` with an explicit `integration-conflict` note.
- Record conflicting agents, conflicting files or state, last known valid contract, chosen serialization order, and required validation.
- Only the coordinator may reassign ownership or resolve the conflict in the devlog.
- Resume work only after the conflicting target has one owner and the other agents have updated dependencies.
- Do not mark the task `ready-for-commit` or `closed` until conflict resolution and integrated validation are recorded.

## Cross-Review

- Record cross-review owner, scope, findings, disposition, re-review requirement, resolver, and remaining risks.
- If review finds material gaps, move `ready-for-commit` back to `active` until each finding is fixed and re-reviewed, rejected with reason, or explicitly deferred to a new owner and follow-up task.
- The coordinator owns final arbitration when agent reviews disagree.
- `needs-coordinator-decision` blocks `ready-for-commit`, `closed`, commit, PR, push, merge, and cleanup until arbitration decision, decision owner, and rationale are recorded.
- Read-only reviews with material findings must output `COMMIT BLOCKED: required devlog update`. A writing follow-up must record the findings and demote the entry before commit.

## Stale-State Check

At task start and before append or commit, compare:

- current git branch
- current worktree path
- `current.md` open entries and statuses
- each open entry branch and worktree path
- active entry status
- uncommitted git status
- review findings and conflict notes

If `current.md` points to another branch without preserving the current branch's open entry, has a missing/future timestamp, uses anything other than `Last updated: YYYY-MM-DD HH:mm CST by <updater>`, has a `ready-for-commit` entry older than 24 hours without a `Freshness note: still valid as of YYYY-MM-DD HH:mm CST by <updater>` line under that entry in `current.md`, has unresolved review findings, has unresolved conflict notes, or omits branch/worktree identity, treat it as stale. Only the coordinator may update `current.md`; non-coordinators must stop and report the required update.

Before commit, parse `docs/devlog/entries/*.md` status sections for `active`, `blocked`, `ready-for-commit`, and `closed` with pending SHA. If `current.md` omits an open entry for the relevant branch/worktree, or a pending-SHA orphan exists, treat state as stale. The coordinator must either complete the commit immediately or reopen/demote the entry to `active` before any other work.

## Entry Lifecycle

1. `active`: work is in progress, review findings are being repaired, or the next agent must continue here.
2. `blocked`: work cannot continue without a specific external action or decision.
3. `ready-for-commit`: implementation and validation are done, but no final commit is recorded yet.
4. `closed`: review gates are clear; final result, validation, residual risks, follow-up resolution with owner or new entry when applicable, and commit SHA, `commit SHA pending in final response`, or explicit stop reason are recorded; and `docs/devlog/current.md` no longer lists the entry as open.

Child entries may be `active`, `blocked`, or `closed` for their assigned scope. Only a parent entry may represent task-level `ready-for-commit` or `closed`.

## Validation Minimums

- Docs/process-only: `git diff --check` plus targeted consistency scans for changed terms and examples.
- Skill changes: skill validator for each touched skill plus `git diff --check`.
- Workflow or multi-agent rule changes: targeted read-only re-review for material findings before `ready-for-commit`.
- Automation is not required for the first process-only version when the parser contract above is explicit. Add a lightweight checker before CI enforcement, or after repeated stale-state incidents.

## Compaction And Archive

- Split an entry or create a follow-up entry when it exceeds eight substantive review rounds, carries multiple independent feature chains, or stops being readable as a task handoff.
- Archive summaries must name source entry paths and commit ranges. They may summarize closed work but must not replace entry status, validation, risks, or follow-up authority.

## Compact Examples

Normal feature or fix:

```md
# Devlog: article-edit-save
## Status
`ready-for-commit`
## Context
- Goal: allow editing existing articles.
- Branch: `feat/article-edit`
## Scope
- Admin article edit page and update API only.
## Direction / Decisions
- Reuse create form validation; keep publish review out of scope.
## Validation
- `pnpm run check`: passed
- `mvn -Dtest=ArticleServiceTest test`: passed
## Result
- Draft save works; publish review remains follow-up.
## Risks
- Full quality gate not run.
## Follow-up
- New entry: article-publish-review.
## Commits
- `commit SHA pending in final response`
```

Multi-agent parent entry:

```md
# Devlog: article-review-flow
## Status
`active`
## Context
- Goal: add article review workflow.
## Multi-Agent Coordination
- Coordinator: main agent
- Parent entry: this file
- Child entries:
  - backend-review-status: owner Agent A, status active, blocked-by none
  - admin-review-ui: owner Agent B, status active, blocked-by backend contract
- Contract handoff:
  - Producer: Agent A
  - Consumer: Agent B
  - Endpoint/schema/state: `/articles/{id}/submit-review`, status values
  - Version/hash: pending
  - Consumer acknowledgement: pending
## Validation
- Cross-boundary review flow smoke pending.
```

## Not A Replacement For

- Specs and plans in `docs/superpowers/`.
- Project decisions in `docs/project-management/decision-log.md`.
- Quality gates, tests, and runtime verification.
- Git commits and pull request review.
