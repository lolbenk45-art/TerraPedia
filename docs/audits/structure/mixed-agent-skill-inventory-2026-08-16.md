# Mixed-Agent Skill Inventory

Date: 2026-08-16

Status: Task 1 baseline. No skill, ignore-rule, runtime-directory, data, or
service change has been made.

## Scope And Method

This is a frozen read-only snapshot of the primary worktree at
`/home/lolben/TerraPedia` before migration work. The implementation worktree
is `docs/mixed-agent-structure-convergence` at
`/home/lolben/TerraPedia/.worktrees/mixed-agent-structure-convergence`, based
on `9f386e40`.

The approved plan and devlog handoff were intentionally carried into the
implementation worktree as exact patches instead of being committed from the
dirty primary worktree. Their SHA-256 values matched before Task 1 began.

File counts are regular-file counts from the primary worktree. Git counts are
separate because nested worktrees are independent repositories and do not
appear as ordinary ignored entries to the outer repository.

## Directory State

| Path | Files | Git state | Ignore evidence | Inventory conclusion |
| --- | ---: | --- | --- | --- |
| `.codex` | 106 | 106 tracked; 0 ignored; 0 untracked | not ignored | Current tracked project skill source; it is not yet an explicitly owned common source. |
| `.claude` | 364516 | 0 tracked; 23 ignored; 0 untracked | `.gitignore:95` `.claude/` | Local state, including nested worktrees and two ignored runtime skill copies. |
| `.superpowers` | 518 | 0 tracked; 518 ignored; 0 untracked | `.gitignore:111` `.superpowers/` | Local brainstorm and screenshot state; not a source of project facts. |
| `.worktrees` | 74285 | 0 tracked; 3 ignored; 0 untracked | `.gitignore:94` `.worktrees/` | Ignored project-local linked worktrees; nested repository content explains the difference between file and Git counts. |
| `docs/superpowers` | 313 | 311 tracked; 0 ignored; 2 untracked | not ignored | Tracked plans/specs; the two untracked files are the approved bilingual mixed-agent plans. |
| `tmp` | 64 | 14 tracked; 50 ignored; 0 untracked | `.gitignore:15` `tmp/` for ignored descendants | Mixed historical tracked visual specimens and local temporary output; no blanket move is safe. |
| `logs` | 2 | 0 tracked; 2 ignored; 0 untracked | `.gitignore:35` `*.log` | Local runtime logs. |
| `reports/tmp` | 2 | 0 tracked; 2 ignored; 0 untracked | `.gitignore:46` `reports/*` | Ignored temporary reports. |
| `task` | 30 | 0 tracked; 30 ignored; 0 untracked | `.gitignore:104` `task/` | Local task context only, not a project authority. |

The implementation worktree deliberately has no checked-out `.claude/`,
`.superpowers/`, `.worktrees/`, `logs/`, `reports/tmp`, or `task` directory.
That confirms that these are local state rather than clean-clone inputs.

## Current Runtime Parity

The primary worktree contains only two ignored Claude runtime skill copies.
Both match their tracked Codex counterparts byte-for-byte:

| Skill | SHA-256 | `cmp` |
| --- | --- | --- |
| `session-handoff` | `1a7c1ddf79aa0f848b382960e03dac3870bc17231047024a7a46e09b1b8bce3b` | pass |
| `ui-ux-pro-max` | `9bd26c52dfd10dfd613dd3cc85df217dc25a172e380bde41fdfa6fedda288b2a` | pass |

The missing `.claude/skills` directory in the clean implementation worktree is
therefore a missing generated view, not current parity drift.

## Skill Classification

`portable` means a common-source candidate whose workflow can be expressed
with generic shell, Git, documents, and declared fallbacks. Tool names in
examples, such as `TodoWrite` or a Claude Code sample, require Task 4 wording
normalization but are not a required provider runtime. `codex-only` has a
hard-coded Codex tool or local Codex path. `external/plugin` depends on an
optional non-project integration.

| Skill | Class | Inventory evidence |
| --- | --- | --- |
| `brainstorming` | `portable` | Generic elicitation flow; `mcp-builder` appears only as an excluded follow-on. |
| `dispatching-parallel-agents` | `portable` | Claude Code is an example label for a generic subagent workflow. |
| `error-fast-locator` | `portable` | Uses repository-local shell/Python diagnostics. |
| `executing-plans` | `portable` | Generic plan workflow; `TodoWrite` needs a tool-neutral tracker mapping. |
| `finishing-a-development-branch` | `portable` | Git closeout process only. |
| `git-hygiene-guard` | `portable` | Git workflow guard only. |
| `git-task-archiver` | `portable` | Repository-local task-context convention. |
| `receiving-code-review` | `portable` | Generic review evaluation procedure. |
| `requesting-code-review` | `portable` | Generic reviewer dispatch with a no-subagent fallback required later. |
| `session-handoff` | `portable` | Contains an explicit cross-runtime portability contract and matched current Claude copy. |
| `subagent-driven-development` | `portable` | Generic subagent procedure; its `TodoWrite` step needs a neutral mapping. |
| `systematic-debugging` | `portable` | Tool-independent debugging method. |
| `terrapedia-chain-auditor` | `portable` | Repository governance and read-only audit rules. |
| `terrapedia-crawler-progress-contract` | `portable` | Repository crawler contract, not a provider API. |
| `terrapedia-crawler-workflow-guard` | `portable` | Repository crawler safety rules. |
| `terrapedia-daily-project-summary` | `portable` | Repository management workflow. |
| `terrapedia-data-refresh-stack-restart` | `portable` | Repository-local Bash workflow. |
| `terrapedia-devlog-guard` | `portable` | Repository devlog contract. |
| `terrapedia-plan-auditor` | `portable` | Repository plan audit method. |
| `terrapedia-task-commit` | `portable` | Git/devlog commit closeout. |
| `terrapedia-workflow-guard` | `portable` | Repository workflow guard; `Codex` in the trigger wording is not a runtime dependency. |
| `test-driven-development` | `portable` | Tool-independent test-first method. |
| `token-context-optimizer` | `portable` | Repository-local search and summary process. |
| `ui-ux-pro-max` | `external/plugin` | Frontmatter declares the optional shadcn/ui MCP integration. |
| `using-git-worktrees` | `portable` | Git worktree procedure only. |
| `using-superpowers` | `portable` | Explicitly provides Codex, Claude Code, Copilot, and Gemini tool mappings. |
| `verification-before-completion` | `portable` | Evidence-first validation process. |
| `web-access` | `codex-only` | Requires Codex `web`/`chrome_devtools` routing and hard-coded `.codex` paths. |
| `writing-plans` | `portable` | Generic planning guidance. |
| `writing-skills` | `portable` | Claude/Codex discovery and `TodoWrite` references need neutral wording, not a provider runtime. |
| `xlab-image-generation` | `codex-only` | Frontmatter targets Codex and requires the local XLab secret configuration. |

This produces 28 `portable`, 2 `codex-only`, and 1 `external/plugin` current
entries. No runtime files were copied or reclassified on disk.

## Dirty-Path And Staging Boundary

The primary worktree had an empty index. Its user-owned changes were:

- modified `data/generated/shimmer/wiki-shimmer-current-generation.json`;
- modified `reports/authorization/canonical/automation-shimmer-first-l1.bundle.json`;
- modified `reports/authorization/canonical/automation-shimmer-first-l1.source.json`;
- 24 untracked generated files below three `data/generated/shimmer/generations/` hashes;
- the approved mixed-agent devlog and bilingual plan handoff files.

Every later staged scope for this task must exclude
`data/generated/shimmer/**` and `reports/authorization/**`. No Task 1 command
staged or modified those primary-worktree paths.

## Decision

The approved plan review, recorded in
`docs/devlog/entries/2026-08-16-mixed-agent-structure-convergence.md`, confirms
`agent/skills/` as the intended common source. The inventory found no
contradiction in that decision: the existing source is Codex-only by location,
while clean clones have no Claude runtime view. Task 2 may create thin entry
contracts; Task 3 must make the runtime views generated and verifiable before
any compatibility alias is removed.

## Validation

Executed from the primary or implementation worktree as appropriate:

- `git status --short --branch -uall` confirmed the branch/worktree separation
  and no staging.
- `git ls-files .codex/skills .claude/skills` found 106 tracked Codex skill
  files and no tracked Claude skill file.
- `git check-ignore -v .claude/settings.json .claude/worktrees .superpowers tmp`
  confirmed the local-state rules; the tracked `tmp` directory required a
  descendant check to show its ignored files.
- SHA-256 and `cmp` checks passed for both existing Claude runtime copies.
- `git diff --check` passed before Task 1 documentation edits; it is rerun as
  part of the Task 1 closeout.
