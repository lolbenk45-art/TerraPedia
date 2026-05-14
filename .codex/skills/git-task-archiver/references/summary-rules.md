# Summary Rules

Task Markdown is a handoff layer, not a second source-control system.

## `README.md`

Keep it stable and short. It should answer:

- what the task is
- whether the task is active, blocked, or complete
- whether the task uses `git-only` or `git + task`
- which file to read first when continuing later

## `docs/summary.md`

Append entries with the newest section first.

Each entry should stay compact and cover:

- goal
- work completed
- key findings or decisions
- affected code paths, if any
- verification result
- next steps
- references to large artifacts or reports

When code changed, explicitly write:

`Code-level diff details are tracked in git.`

## Do Not Copy

Do not paste:

- large code blocks
- full diffs
- terminal transcripts
- long logs
- repeated repo history

Prefer short statements plus file paths.
