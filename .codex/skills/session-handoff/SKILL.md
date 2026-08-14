---
name: session-handoff
description: Use when ending or resuming a coding session, switching worktrees or branches, transferring work to another agent or conversation, recovering after lost context, or when branch, workspace, task progress, devlog, and git state must remain consistent.
---

# Session Handoff

Preserve enough verified state for another session to continue without guessing. Git is the authority for what changed; the devlog is the authority for why it changed, what was verified, and what remains.

## Choose A Mode

- **Prepare handoff**: the current session is pausing, ending, changing worktrees, or transferring ownership.
- **Resume handoff**: a new session is taking over existing work.
- **Audit handoff**: the handoff appears inconsistent, stale, or incomplete.

Use the narrowest mode that matches the request. Do not edit code merely to create a handoff.

## Prepare Handoff

### 1. Establish facts

Run read-only commands from the intended worktree. Use an equivalent command when a shell differs; do not omit the fact.

```sh
pwd
git rev-parse --show-toplevel
git status --short --branch -uall
git branch --show-current
git branch -vv
git worktree list --porcelain
git log -8 --oneline --decorate
git diff --stat
git diff --cached --stat
git ls-files --others --exclude-standard
```

Also inspect the relevant task entry, plan/spec, and `docs/devlog/current.md` when present. For TerraPedia work, the first-read order is `AGENTS.md`, current spec, workflow, current devlog, then the active entry or plan.

Record exact paths, branch names, worktree path, current `HEAD`, upstream state, and whether changes are committed, staged, unstaged, or untracked. Do not infer these from memory.

### 2. Reconcile progress

Write down:

- user goal and measurable success criteria;
- in-scope and explicitly out-of-scope work;
- completed work with evidence (commit, test, or report path);
- current work in progress and the next smallest safe action;
- blockers, dependencies, unresolved review findings, and residual risks;
- validation commands, results, and what was not run;
- the exact devlog entry and plan/spec that the next session must read.

Separate **Observed**, **Recorded**, and **Unknown** facts. Unknown means unknown; never fill a gap with a plausible guess.

### 3. Record durable handoff state

Reuse the active task entry when one exists. Otherwise create a compact entry under `docs/devlog/entries/` using [handoff-template.md](references/handoff-template.md). Update `docs/devlog/current.md` only when the active handoff target, status, branch, worktree, dependency, or next action changes. Keep the entry focused: say `See git for code-level diff details` instead of copying diffs or long logs.

For TerraPedia, a skill/workflow/task handoff is devlog-required. Do not claim a git-only exception for this skill.

### 4. Validate the handoff

At minimum run:

```sh
git diff --check
git status --short --branch -uall
```

Run targeted tests or checks when the task requires them, and record their actual result. If validation is incomplete, keep the entry `active` or `blocked`; do not mark it ready or closed.

### 5. Report the handoff

End with a short, copyable summary containing:

1. repository/worktree and branch;
2. `HEAD` and commit/ahead/behind facts;
3. dirty/staged/untracked state;
4. devlog entry and plan/spec paths;
5. completed work and evidence;
6. next action;
7. blockers and risks;
8. validation status.

The summary is a pointer to durable records, not a replacement for them.

## Resume Handoff

1. Read the supplied handoff entry, `docs/devlog/current.md`, the referenced plan/spec, and the repository's governing instructions.
2. Re-run the fact commands above in the actual worktree.
3. Compare recorded branch, worktree, `HEAD`, dirty paths, devlog status, and next action with reality.
4. If anything differs, stop implementation and classify it as `stale`, `conflict`, or `missing evidence`. Record the discrepancy before proceeding.
5. Confirm the task goal, scope, dependencies, and validation gate. Then take only the recorded next safe action.
6. Append meaningful progress, blocker, validation, or direction changes to the same entry and keep `current.md` pointed at the active handoff.

## Audit And Blocking Rules

Treat any of these as a handoff blocker until recorded and resolved:

- branch or worktree does not match the handoff;
- uncommitted paths are unexplained;
- a commit is claimed but `HEAD` or the log cannot prove it;
- devlog status conflicts with git state (for example, `closed` with uncommitted work or pending SHA);
- validation is claimed without a command/result, or required validation was skipped;
- an active review finding, dependency, or cross-agent contract is missing an owner;
- the next action would require guessing, destructive cleanup, reset, checkout-discard, or an unrequested commit/push.

When blocked, report the evidence and the smallest safe recovery action. Never repair ambiguity by rewriting history or silently changing task scope.

## Portability Contract

- Keep `SKILL.md` standard Markdown with simple YAML frontmatter containing only `name` and `description`.
- Do not require Codex-only MCP tools, Claude-only tools, plugins, hooks, or proprietary APIs.
- Refer to generic shell execution and Git commands; provide an equivalent command for the host shell when needed.
- Use relative links inside the skill directory and repository-relative paths in handoff records.
- `agents/openai.yaml` is optional UI metadata for Codex and must not be required by the workflow.
- The same `SKILL.md` and references should be byte-identical when installed under `.codex/skills/session-handoff/` and `.claude/skills/session-handoff/`.

## Never Do Automatically

Do not run `git reset --hard`, `git checkout -- <path>`, `git clean`, force-push, remote branch deletion, stash, commit, push, merge, or worktree removal as part of handoff preparation or resume unless the user explicitly requests that operation and its safety checks pass.
