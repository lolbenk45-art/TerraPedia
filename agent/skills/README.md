# Common Project Skills

Each directory below `agent/skills/` is a source-controlled project skill. A
portable skill has a `SKILL.md` with YAML frontmatter containing only:

```yaml
name: example-skill
description: Use when the task needs the documented workflow.
```

The `description` states when to load the skill. It does not replace the skill
body, and agents read only skills relevant to the current task.

## Classes

- `portable`: copied from this source into supported runtime views.
- `codex-only`: remains in the Codex runtime because it requires a Codex tool or
  local Codex configuration.
- `external/plugin`: remains outside the shared source because it requires an
  optional external plugin or integration.

Portable source content uses repository-relative links and generic actions. If
an optional tool is unavailable, it states a safe fallback. Runtime-specific
metadata, such as `.codex/skills/<skill>/agents/openai.yaml`, is not source
content and is retained by the destination runtime.

Do not add an unlisted file to a generated runtime skill directory. The manifest
and synchronizer define the source files and destinations.

## Fallbacks

- If subagents are unavailable, execute the same scoped task serially and keep
  the review checkpoints in the task tracker.
- If browser automation is unavailable, use direct HTTP/API checks or a
  documented read-only manual check; never claim a browser gate passed.
- If PowerShell is unavailable, use the maintained Bash/WSL command and record
  the skipped shell-specific check.
