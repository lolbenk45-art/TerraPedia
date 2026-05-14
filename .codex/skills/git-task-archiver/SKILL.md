---
name: git-task-archiver
description: Route work between git-only execution and lightweight task archiving under a project's `task/` directory. Use when Codex needs to create per-task folders, keep compact Markdown handoff files, classify structured data and non-code artifacts, reduce token waste on repeated follow-up work, or preserve task context without copying code diffs into reports.
---

# Git Task Archiver

Keep task context small and reusable. Let git track code. Let `task/` store only the minimum task-level handoff that future work actually needs.

## Workflow

1. Identify the project root.
2. Decide whether the task is `git-only` or `git + task`.
3. If `git + task`, create or reuse the task folder under `<project-root>/task/`.
4. Route generated files into the fixed subdirectories.
5. Write or update compact Markdown summaries without copying code or long logs.

## Identify The Project Root

Use this order:

1. If `git rev-parse --show-toplevel` succeeds, use that directory.
2. Otherwise use the current working directory.

Create or reuse `task/` only under that root.

## Decide The Mode

Read [mode-selection.md](./references/mode-selection.md) before creating folders.

Use `git-only` only when all of these are true:

- the work is only code changes
- there is no structured data output
- there are no screenshots, HTML exports, or other attachments
- there is no long log worth preserving
- the task is unlikely to need a later continuation summary

Use `git + task` immediately when any of these is true:

- generated `json`, `csv`, `sql`, `yaml`, or similar structured data
- screenshots, HTML exports, diff artifacts, attachments, or generated media
- audit, investigation, migration, backfill, or validation output
- a user asks for task folders, task records, summaries, or handoff notes
- the work will likely continue in another turn or session

If uncertain, prefer `git + task`.

## Create Or Reuse The Task Folder

Read [task-layout.md](./references/task-layout.md) before creating directories.

Name the task folder as `YYYY-MM-DD_<normalized-task-name>`.

Normalize the task name by:

- trimming leading and trailing whitespace
- removing Windows-invalid path characters `< > : " / \ | ? *`
- collapsing internal whitespace to `-`
- keeping Chinese characters, letters, and digits

Reuse an existing folder when the current request is a continuation of the same task. If the normalized name collides on the same day but the work is a different task, append `-02`, `-03`, and so on.

## Route Files

Use the fixed structure from [task-layout.md](./references/task-layout.md):

- `README.md`
- `docs/README.md`
- `docs/summary.md`
- `data/README.md`
- `artifacts/README.md`
- `logs/README.md`

Route files by type:

- `data/`: structured data such as `json`, `csv`, `sql`, `yaml`
- `artifacts/`: screenshots, HTML exports, rendered outputs, comparison attachments
- `logs/`: long command output, probes, validation logs, backfill logs
- `docs/`: human-facing summaries and task notes only

Do not create extra taxonomy unless the task truly needs it. Keep the first version flat.

## Write Compact Markdown

Read [summary-rules.md](./references/summary-rules.md) before writing task docs.

Required behavior:

- keep `README.md` short and stable
- append new work to `docs/summary.md` with the newest section first
- mention affected code paths only as references, not copied code
- say "See git for code-level diff details" whenever code changed
- summarize verification results, not full transcripts
- link or point to large artifacts instead of pasting them

Never store these in task Markdown:

- copied code blocks unless a tiny snippet is required for comprehension
- full diffs
- long command output
- repeated project background
- full test logs that already exist as files

## Use The Templates

Use these files as starting points when creating the task structure:

- `assets/root-readme-template.md`
- `assets/dir-readme-template.md`
- `assets/summary-template.md`

Adjust wording to the current task, but keep the sections compact.
