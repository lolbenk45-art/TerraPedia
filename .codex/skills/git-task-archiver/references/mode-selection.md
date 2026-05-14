# Mode Selection

Choose one mode before writing files.

## `git-only`

Use this mode when the task is a small, local code change and no extra artifact deserves reuse later.

All of these should be true:

- no structured data file is created
- no screenshot, HTML export, or attachment is created
- no long probe or validation log needs to be preserved
- no task-level handoff is likely to be useful later

In this mode:

- edit code normally
- rely on git status, diff, and commits for code history
- do not create `task/`

## `git + task`

Use this mode when task context has value beyond the code diff.

Trigger this mode when any of these is true:

- generated `json`, `csv`, `sql`, `yaml`, or similar data
- generated screenshots, HTML files, comparison outputs, or attachments
- investigation, migration, audit, backfill, or reconciliation work
- user explicitly wants task folders or Markdown task records
- later continuation is likely

In this mode:

- create or reuse the task folder
- keep task docs concise
- keep code-level details in git, not in Markdown
