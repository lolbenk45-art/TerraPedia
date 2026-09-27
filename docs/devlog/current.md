# Current Devlog

Last updated: 2026-09-28 07:12 CST by Codex

Active branch: `feat/automation-scheduler-continuation`
Active focus: complete governed source → landing → maint → relation → projection/API ingestion; overall active.

## Open work

- Owner: Codex, serial implementation and current-model spec/quality review; no subagents.
- Worktree: `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`.
- Active child: [Armor image continuation](entries/2026-09-27-armor-image-cache-continuation.md), `active`.
- Parent: [Armor secondary projections](entries/2026-09-26-armor-secondary-projection-continuation.md), `active` for remaining full-chain gates.
- Ancestors: [Armor frozen candidate](entries/2026-09-24-armor-frozen-candidate-continuation.md), [canonical ownership](entries/2026-09-24-canonical-ownership-execution.md), [plan repair](entries/2026-09-22-automation-ingestion-plan-repair.md), [scheduler activation](entries/2026-08-31-automation-scheduler-activation-handoff.md); all retain the same owner, branch/worktree and active dependencies.
- Authority: [standing register](entries/2026-09-19-automation-scheduler-authorization-list.md); approved scoped implementation/registration and fresh serial execution, subject to technical gates.
- Plan: `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md` (A2–A6, B1, S1, then M/D/S acceptance).
- Contract handoff: H8 `sha256:e425764ed673f1d16bdbc7b3511cff10f1f090f8276dbfdf7aaf04f9a5ae4df0`, V2 epoch `epoch-8c1a61e1-c3f4-46bc-98d2-0884ca743346`, Redis DB14.

## Verified checkpoint and next action

- User requested a verified local checkpoint before continuation. Baseline HEAD `0f871e94`; checkpoint scope, validation and retained-artifact inventory: [workspace checkpoint](entries/2026-09-28-automation-workspace-checkpoint.md). Read Git for the resulting commit identities; no push requested.
- A6.3 selected subset has recorded committed projection repair `.a63-20260927-22`: 223 active attribute members and 290 active effects, public/admin Ninja parity. Consumed decisions must not be replayed; ten missing-source members remain excluded.
- Image source `.a63-20260927-23` contains 419 rows (315 distinct file titles), all with individual revisions and original URLs; all cached URLs are null. Existing maint has 175 rows, all revisions missing and one cache missing. Raw source remains immutable.
- Current candidate code rejected producer `part` images. Two RED tests reproduced it; minimal allowlist fixes now pass maint/relation tests 138/138 while preserving stable IDs/keys.
- Next after checkpoint: RED/GREEN reconciliation of candidate crit labels, retired-row filters and member scope with the real producer/API consumer; then revision-bound set-effect sources and their owned repair path. Experimental dry-run counts are not authoritative source findings. Both `.32` and `.33` image results are completed/consumed; do not upload again.
- Latest preflight is recorded in the active child; scheduler stays disabled until independent gates pass. Backend is healthy again with the existing local credential/config boundary. Fresh image-cache `.33` completed 315/315 uploads and verified byte readbacks; no database or Redis writes occurred. Buff full-chain executor and Shimmer six-scope fences remain implementation dependencies.
- No local.items writes, DDL, direct SQL/Redis repair, H8 expansion, manual sweep or scheduler activation in this slice.

## History

- Previous detailed state, including superseded blockers: [September27 history](archive/2026-09-27-armor-image-current-history.md).
