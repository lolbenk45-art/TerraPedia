# Session Handoff Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a cross-platform session handoff skill and reusable Markdown template that preserve Git, worktree, branch, task, devlog, and validation state.

**Architecture:** Keep a canonical portable skill under `.codex/skills/session-handoff/` with standard YAML frontmatter and a reference template. Mirror the portable files into Claude Code's skill directory when installing locally; Codex UI metadata remains optional.

**Tech Stack:** Markdown, YAML frontmatter, Git, Python skill validator.

---

### Task 1: Write the portable skill and template

**Files:**
- Create: `.codex/skills/session-handoff/SKILL.md`
- Create: `.codex/skills/session-handoff/references/handoff-template.md`
- Create: `.codex/skills/session-handoff/agents/openai.yaml`

- [x] Replace scaffold placeholders with prepare/resume/audit workflows, safety rules, portability contract, and evidence checklist.
- [x] Add a compact template with repository state, task contract, progress, validation, risks, next action, and Git evidence.

### Task 2: Install the portable mirror for Claude Code

**Files:**
- Create: `.claude/skills/session-handoff/SKILL.md`
- Create: `.claude/skills/session-handoff/references/handoff-template.md`

- [x] Copy the canonical portable files exactly; do not add Claude-only instructions.
- [x] Verify both copies are byte-identical.

### Task 3: Record traceability and validate

**Files:**
- Create: `docs/superpowers/specs/2026-08-15-session-handoff-skill-design.md`
- Create: `docs/superpowers/plans/2026-08-15-session-handoff-skill.md`
- Create: `docs/devlog/entries/2026-08-15-session-handoff-skill.md`
- Modify: `docs/devlog/current.md`

- [x] Record the skill task, current branch/worktree, implementation result, validation, and installation note in devlog.
- [x] Run the skill validator for the canonical and Claude copies, `cmp`, `git diff --check`, and placeholder scans.
