# TerraPedia Gemini CLI Entry

Read these files in order before working in this repository:

1. `AGENTS.md`
2. `docs/project-governance/00_CURRENT_SPEC.md`
3. `docs/project-governance/00_WORKFLOW.md`
4. `docs/devlog/current.md`
5. The task plan, devlog entry, issue, or file named by the user

Use a project skill only when its `description` matches the task. Read that
skill before acting; do not load every skill into context.

`agent/skills/` is the editable common project skill source. Generate local
runtime views with:

```bash
node platform/tooling/sync-agent-skills.mjs --write
```

The generated `.codex/skills/` and `.claude/skills/` views are not edited
directly. Verify them with `node platform/tooling/sync-agent-skills.mjs --check`.
Tool availability differs by environment; follow the selected skill's fallback
instructions and the repository safety boundaries.
