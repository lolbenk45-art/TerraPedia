# Agent Assets

`agent/` contains source-controlled assets shared by the repository's supported
coding-agent entrypoints. It is a long-lived project boundary, not a directory
for local prompts, screenshots, caches, or worktrees.

## Skill Ownership

`agent/skills/` is the only editable source for project skills classified as
`portable`. `platform/tooling/sync-agent-skills.mjs` generates the tool-specific
runtime views:

```text
agent/skills/ -> .codex/skills/
              -> .claude/skills/
```

Use the following command after a clean clone or a source-skill change:

```bash
node platform/tooling/sync-agent-skills.mjs --write
```

Use `node platform/tooling/sync-agent-skills.mjs --check` before handoff or
commit. Runtime copies are generated artifacts; change `agent/skills/` rather
than editing `.codex/skills/` or `.claude/skills/` directly. Tool-specific
metadata remains with its runtime and is not copied into the common source.

## Entrypoints

`AGENTS.md` is the repository-wide entrypoint. `CLAUDE.md` and `GEMINI.md` are
thin adapters that preserve the same source-of-truth order and skill-selection
rules without duplicating the TerraPedia workflow. The current project facts
remain in `docs/project-governance/00_CURRENT_SPEC.md`.

Local state belongs outside this directory. In particular, `.claude/settings.json`,
`.claude/worktrees/`, and `.superpowers/` stay ignored and are never inputs to
the shared skill source.
