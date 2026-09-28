# Current Devlog

Last updated: 2026-09-28 08:02 CST by Codex

Active branch: `feat/automation-scheduler-continuation`
Active focus: complete governed source → landing → maint → relation → projection/API ingestion; overall active.

## Open work

- Owner: Codex, serial implementation and current-model spec/quality review; no subagents.
- Worktree: `/home/lolben/TerraPedia/.worktrees/automation-scheduler-continuation`.
- Active child: [Armor source semantics](entries/2026-09-28-armor-source-semantics-continuation.md), `active`; same owner/branch/worktree, dependent on parser/source evidence and fresh runtime gates.
- Parent: [Armor image continuation](entries/2026-09-27-armor-image-cache-continuation.md), `active` for remaining source/full-chain gates.
- Parent: [Armor secondary projections](entries/2026-09-26-armor-secondary-projection-continuation.md), `active` for remaining full-chain gates.
- Ancestors: [Armor frozen candidate](entries/2026-09-24-armor-frozen-candidate-continuation.md), [canonical ownership](entries/2026-09-24-canonical-ownership-execution.md), [plan repair](entries/2026-09-22-automation-ingestion-plan-repair.md), [scheduler activation](entries/2026-08-31-automation-scheduler-activation-handoff.md); all retain the same owner, branch/worktree and active dependencies.
- Authority: [standing register](entries/2026-09-19-automation-scheduler-authorization-list.md); approved scoped implementation/registration and fresh serial execution, subject to technical gates.
- Plan: `docs/superpowers/plans/2026-08-31-automation-ingestion-scheduler-activation.md` (A2–A6, B1, S1, then M/D/S acceptance).
- Contract handoff: H8 `sha256:e425764ed673f1d16bdbc7b3511cff10f1f090f8276dbfdf7aaf04f9a5ae4df0`, V2 epoch `epoch-8c1a61e1-c3f4-46bc-98d2-0884ca743346`, Redis DB14.

## Verified checkpoint and next action

- Local workspace checkpoint: implementation `bf0df600`; evidence/closeout follows in Git. [Workspace checkpoint](entries/2026-09-28-automation-workspace-checkpoint.md) is closed with validation and the retained-artifact inventory. No push requested; overall ingestion remains active.
- Source parser/capture checkpoint: real 18/19-column headers now determine attribute semantics; raw HTML/wikitext can be frozen with revision IDs and immutable hashes;49/49 Node22 tests pass. Mining Helmet's legs-table link is wrong in the Wiki source itself. Collection `.a63-20260928-02` remains alive in the request gate's403 cooldown until08:16 CST; poll its progress before another crawler or DB writer. Details and next source/proposal gates are in the active child.
- Resource effects now preserve mana/capacity/movement units and reject qualified numeric cells; independent candidate and relation regressions are 168/168. Revision-bound collection `.a63-20260928-02` failed at 08:16 CST with Wiki HTTP403 and produced no authority; do not promote `.01` or start DB writes until a fresh source succeeds.
- A6.3 selected subset has recorded committed projection repair `.a63-20260927-22`: 223 active attribute members and 290 active effects, public/admin Ninja parity. Consumed decisions must not be replayed; ten missing-source members remain excluded.
- Image source `.a63-20260927-23` contains 419 rows (315 distinct file titles), all with individual revisions and original URLs; all cached URLs are null. Existing maint has 175 rows, all revisions missing and one cache missing. Raw source remains immutable.
- Current candidate code rejected producer `part` images. Two RED tests reproduced it; minimal allowlist fixes now pass maint/relation tests 138/138 while preserving stable IDs/keys.
- Candidate crit labels, retired-row/member scope and secondary retirement rederivation are corrected;214 Node22 integration tests pass. Next resolve two active MiningHelmet/item88 attribute sources (`sentrySlots`1/2), then revision-bound set-effect sources and their owned repair path. Both candidate and secondary proposal now reject ambiguous active member attributes. Experimental legacy-text dry-run counts are not authoritative source findings. Both `.32` and `.33` image results are completed/consumed; do not upload again.
- Standard local stack recovery completed with scheduling/Flyway disabled. Fresh07:25 CST preflight confirms disabled,0/0,healthy,fences0 and unchanged H8/epoch/server. DB after-set still matches `.22`; public/admin Ninja256/257/258 readback matches DB. [Fresh readback summary](../audits/2026-09-28-armor-validator-readback.json). Buff full-chain executor and Shimmer six-scope fences remain implementation dependencies.
- No local.items writes, DDL, direct SQL/Redis repair, H8 expansion, manual sweep or scheduler activation in this slice.

## History

- Previous detailed state, including superseded blockers: [September27 history](archive/2026-09-27-armor-image-current-history.md).
