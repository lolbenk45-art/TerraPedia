# Armor set source evidence contract

## Status

`closed`

## Scope

- Owner: Armor domain branch `feat/automation-domain-armor`; worktree `/home/lolben/TerraPedia/.worktrees/automation-domain-armor`.
- Goal: fail closed when the Module:ArmorSetBonuses revision or `textKey`/benefit mapping drifts between raw, parsed, standardized and refresh-report artifacts.
- Boundary: source evidence contract and crawler tests only. No database, landing, maint, relation, projection, Redis, scheduler or permit operation ran.

## Result

Added `armor-set-source-evidence/v1`. The Armor set-bonus fetch now validates one positive revision ID and timestamp across all emitted artifacts, exact parsed/standardized set mappings, and a hash of the raw module content before writing outputs. The report retains the resulting evidence envelope.

See git for code-level diff details.

## Validation

- RED observed: missing evidence module failed the new contract test; malformed and drifted cases are covered.
- GREEN: focused Armor source/relation regression passed `228/228`.
- `node --check` passed for both changed source modules.
- `git diff --check` passed.

## Residual risk and follow-up

This is an input gate for the future Armor landing/candidate proposal; it is not a database import. Qualified Shroomite values, authoritative set-effect text capture, fresh runtime authorization, and the governed full-chain apply remain open.

## Commit

`commit SHA pending in final response`

## User stop decision — 2026-11-11

- 用户明确停止全部现有任务；本条因 intentionally stopped 关闭，不代表功能完成或验收通过。
- 保留上文历史问题、验证记录与未完成项；旧的执行、授权和 next-action 指令均不自动恢复。
- 本次未重新验证业务功能；复工须重新确认目标、运行态与授权，并创建新的 active entry。
- 分支交接：`docs/handoffs/2026-11-11-workspace-stop.md`。Stop reason: user-requested cancellation and recoverable branch snapshot.
