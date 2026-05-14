---
name: token-context-optimizer
description: Reduce token waste and context bloat for coding, data, audit, and summary tasks by forcing scoped reads, summary reuse, and staged context compression. Use when Codex is working in long or repeated threads, when a repo contains many reports/logs/generated artifacts, when the user asks to save tokens or optimize context, or when the task risks repeated full-repo or full-log scanning.
---

# Token Context Optimizer

Keep context narrow. Reuse existing summaries before reading raw material. Prefer staged artifacts over repeated rediscovery.

## Workflow

1. Classify the task.
2. Build the minimum working set.
3. Reuse existing summaries and reports.
4. Read only the missing local source fragments.
5. Execute the task.
6. If the task will continue later, write a compact stage summary.

## Classify The Task

Choose one primary mode before reading files:

- Code change
- Bug/debug
- Data repair or backfill
- Audit or review
- Report or summary
- Git or release hygiene

Do not mix modes unless the user explicitly asks for a combined task. If a request contains multiple modes, finish the current mode first and defer the rest in the final summary.

## Build The Minimum Working Set

Before broad exploration, define:

- Target files: usually 1 to 5 files
- Allowed directories: usually 1 to 3 directories
- Excluded directories and artifacts
- Existing reports that may already answer part of the question

Default exclusions unless clearly required:

- `node_modules/`
- `target/`
- large exports and backups
- screenshots and binary assets
- generated JSON dumps
- old logs outside the active task window

If the user did not provide scope, infer the smallest reasonable scope from the task and start there.

## Reuse Summaries Before Raw Inputs

Prefer this read order:

1. Recent task summary `.md`
2. Structured report `.json`
3. Small code fragment from the target file
4. Tail of the relevant log
5. Full raw file

Do not reread full reports or full logs when a prior summary is already sufficient.

Read [task-routing.md](./references/task-routing.md) when deciding what source type to inspect first.

If the repository already has many `reports/*.md` or `reports/*.json` artifacts, use `scripts/find_relevant_reports.py` first to narrow the candidate set before opening files.

## Compression Rules

Treat input tokens as the main budget.

- Prefer `rg` over broad recursive reads
- Read file slices, not full files, unless the file is small and central
- Summarize findings once and reuse that summary
- Avoid repeating project background that is already established
- Avoid mixing code, data, report-writing, and git cleanup in one long rolling context
- If a command can produce a compact artifact, prefer the artifact over keeping raw command output in the thread

Read [context-compression-rules.md](./references/context-compression-rules.md) for the concrete rules and thresholds.

## Stage Summaries

For long-running or repeated tasks, create a compact summary artifact that can replace prior conversational context.

A stage summary should contain only:

- Goal
- Scope
- Facts established
- Changes made
- Validation status
- Remaining work
- File whitelist for the next round

Do not include:

- Long command transcripts
- Full logs
- Large copied code blocks
- Repeated history

Use [summary-templates.md](./references/summary-templates.md) to choose a format. If a reusable file is needed, base it on `assets/summary-template.md`.

If a task needs a reusable handoff file, use `scripts/build_context_summary.py` to generate a compact markdown skeleton and then fill only confirmed facts.

## Repo Patterns

In report-heavy repositories, assume the cheapest useful source is often an existing artifact rather than raw inputs.

Read [project-patterns.md](./references/project-patterns.md) when the repo contains:

- a large `reports/` directory
- generated JSON outputs
- screenshots or binary evidence
- backups or runtime log folders

Treat those repos as summary-first environments.

For `terraPedia-db-redesign`-like repositories, also read [terrapedia-profile.md](./references/terrapedia-profile.md) before broad exploration.

## Response Style

Keep progress updates short. Report decisions, findings, and next actions, not repeated background.

When the task is clear:

- execute first
- explain only what affects decisions
- keep summaries compact

When the task is ambiguous or risky:

- ask one precise clarification if needed
- otherwise make the smallest safe assumption and proceed

## Trigger Heuristics

Apply this skill aggressively when any of these are true:

- the user asks to save tokens, optimize context, or reduce unnecessary scanning
- the repo has many reports, logs, generated files, or backup artifacts
- the task is a repeated follow-up on the same topic
- the task spans multiple phases and would benefit from a stage summary
- the request mentions recent audits, summaries, history, or prior outputs

## References

- For source selection rules: [task-routing.md](./references/task-routing.md)
- For compression rules: [context-compression-rules.md](./references/context-compression-rules.md)
- For summary layouts: [summary-templates.md](./references/summary-templates.md)
- For report-heavy repo defaults: [project-patterns.md](./references/project-patterns.md)
- For the TerraPedia repo profile: [terrapedia-profile.md](./references/terrapedia-profile.md)
