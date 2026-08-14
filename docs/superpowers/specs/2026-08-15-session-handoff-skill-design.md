# Session Handoff Skill Design

## Goal

Provide a portable skill that transfers repository, worktree, branch, task progress, devlog state, and Git evidence between coding sessions without context-based guessing.

## Design

The canonical implementation lives in `.codex/skills/session-handoff/` and contains a standard `SKILL.md` plus a compact handoff template under `references/`. The same files may be copied to `.claude/skills/session-handoff/` or a user's global Claude skills directory; no platform-specific tool is required. Codex-only `agents/openai.yaml` remains optional metadata.

The skill has prepare, resume, and audit modes. Prepare collects read-only Git/worktree facts, reconciles them with the current devlog and plan/spec, records observed/recorded/unknown facts, validates the handoff, and reports a pointer-rich summary. Resume repeats the fact collection and blocks implementation when recorded state differs from reality. Audit classifies stale state, conflicts, and missing evidence.

## Safety And Compatibility

The skill prohibits destructive Git operations and unrequested commit/push/merge/cleanup. TerraPedia workflow/skill work always uses devlog traceability. Markdown/YAML frontmatter, relative links, repository-relative paths, and generic shell/Git commands are the portability contract for Codex, Claude Code, and other agents.

## Verification

Validate both installed copies with the skill validator, compare their portable files byte-for-byte, run `git diff --check`, and scan for scaffold placeholders.
