# Devlog: workspace-storage-cleanup-2026-10-12

## Status

`closed`

## Context

- User goal: remove obsolete sessions, worktrees, rebuildable caches, duplicate Armor/Buff evidence copies, and nonessential Comic artifacts while preserving current work and important data.
- Branch: `feat/supplementary-domains-readiness`
- Worktree: `/home/lolben/TerraPedia`
- Related docs: `AGENTS.md`, `docs/project-governance/00_CURRENT_SPEC.md`, `docs/devlog/current.md`

## Scope

- Cleanup only; no application behavior or source data was changed.
- Preserved Armor/Buff dirty worktrees, reports, `.local` evidence, raw/normalized/media data, current Codex databases, and the only large SQL backup.

## Validation

- Codex session index contains 18 entries, all updated on or after 2026-09-30.
- All retained Git bundles verify successfully.
- `main`, `origin/main`, and current `HEAD` remain `4481cae3`.
- `git diff --check` was run; existing trailing whitespace remains in the pre-existing typography plan.
- MySQL backup restore was not attempted because the running server requires credentials; the 4.3G backup remains untouched.

## Result

- Removed 35 obsolete Codex sessions through the official `codex delete --force` command.
- Removed 13 clean worktrees and saved 13 recovery bundles under `.local/tmp/worktree-bundles/`; retained dirty or unmerged worktrees.
- Pruned pip/npm caches, pnpm's old store, and superseded Playwright browser binaries.
- Converted 156 duplicate Armor/Buff report paths to hardlinks, preserving every path and report while releasing about 2.62 GiB of physical storage.
- Removed Comic's rebuildable `mangavid/node_modules`, Python bytecode caches, logs, incomplete model part, and two archives whose extracted sources remain; preserved models, virtual environments, source, PDFs, videos, images, and test outputs.

## Residual Risks

- The 4.3G `pre-item-image-lineage-2026-08-01.sql` backup remains pending restore verification.
- Dirty Armor/Buff/automation worktrees still contain intentional untracked evidence and modified source; they were not deleted.
- Current Codex SQLite logs and daemon state remain in use and were not compacted.

## Follow-up

- After obtaining database credentials and confirming a newer recoverable backup, reassess compression or removal of the old SQL dump.
- When each dirty worktree is closed, remove it through the normal Git cleanup workflow.

## Commits

- Pending; cleanup artifacts are local operational state and were not committed.

## User stop decision — 2026-11-11

- 用户明确停止全部现有任务；本条因 intentionally stopped 关闭，不代表功能完成或验收通过。
- 保留上文历史问题、验证记录与未完成项；旧的执行、授权和 next-action 指令均不自动恢复。
- 本次未重新验证业务功能；复工须重新确认目标、运行态与授权，并创建新的 active entry。
- 分支交接：`docs/handoffs/2026-11-11-workspace-stop.md`。Stop reason: user-requested cancellation and recoverable branch snapshot.
