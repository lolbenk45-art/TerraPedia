# Armor qualified cell diagnostics

## Status

`closed`

## Scope

- Owner: Armor domain branch `feat/automation-domain-armor`; worktree `/home/lolben/TerraPedia/.worktrees/automation-domain-armor`.
- Goal: retain complete diagnostics for Armor attribute cells rejected by the exact numeric parser, especially qualified Shroomite values.
- Boundary: source semantic diagnostics and relation tests only. No database, landing, maint, projection, Redis, scheduler or permit operation ran.

## Result

Added `collectArmorAttributeCellDiagnostics()`, which reports every invalid cell with its record key, item identity, field, raw source text and expected unit. The existing producer remains fail-closed and still refuses to publish qualified values.

See git for code-level diff details.

## Validation

- RED observed: the new diagnostic export was initially missing.
- GREEN: Armor source/relation regression passed `262/262`.
- `node --check pipelines/relation/sync-maint-to-relation.mjs` passed.
- `git diff --check` passed.

## Residual risk and follow-up

Diagnostics do not authorize a value or perform an import. A fresh authoritative source must still resolve the six Shroomite qualified cells before the Armor candidate can proceed to governed landing and database execution.

## Commit

`commit SHA pending in final response`

## User stop decision — 2026-11-11

- 用户明确停止全部现有任务；本条因 intentionally stopped 关闭，不代表功能完成或验收通过。
- 保留上文历史问题、验证记录与未完成项；旧的执行、授权和 next-action 指令均不自动恢复。
- 本次未重新验证业务功能；复工须重新确认目标、运行态与授权，并创建新的 active entry。
- 分支交接：`docs/handoffs/2026-11-11-workspace-stop.md`。Stop reason: user-requested cancellation and recoverable branch snapshot.
