# Devlog: crawler-monitor-v2-cutover-and-reclaim

## Status

`closed`

## Context

- User goal: remove V1 from live crawler monitoring, use V2, and repair stale force-reclaim display.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Related docs: `docs/runbooks/crawler-monitor-queue-v2-cutover.md` and `docs/superpowers/plans/2026-08-06-crawler-monitor-v2-cutover-and-reclaim.md`.

## Direction / Decisions

- V1 queue evidence is immutable history; V2 is activated only by the governed cutover endpoint.
- A force reclaim is current released ownership and must supersede stale V1 timeout history in domain state.
- V1 auto dispatch is unavailable in V2; V2-native scheduling is out of scope.

## Scope

- Frontend: hide V1 auto-dispatch controls in V2 mode.
- Backend: repair force-reclaim domain-state precedence.
- Runtime: perform controlled V2 cutover after exact-process and state checks.
- Out of scope: real crawler runs, DB/data writes, V2-native scheduler.

## Validation

- `mvn -Dtest=CrawlerDomainStateReducerTest,CrawlerMonitorServiceImplTest test`: 208/208 passed.
- `node --test tests/crawler-monitor-page-contract.test.mjs tests/crawler-monitor-engine-mode-notice.test.mjs`: 60/60 passed.
- `bash scripts/dev/crawler-v2-cutover.sh`: cutover `crawler-v2-20260806T000353Z`, epoch `epoch-c87fd828-9295-4fc9-b84c-49ab72e1519b`; two overview reads stable.
- Post-restart authenticated overview: `queueContractVersion=2`, same epoch and stream cursor on both reads, `liveCount=0`.
- V2 overview exposes three prior V1 records only under `legacyHistory`; no V1 live queue is reported.
- Normal stack restart passed backend compile, frontend checks, admin typecheck, and local stack verification.

## Residual Risks

- V2-native automatic scheduling remains unavailable; the legacy V1 auto-dispatch controls are hidden and guarded in V2 mode.

## Follow-up

- V2-native scheduler design is a separate follow-up before any automatic crawler dispatch is enabled.

## Commits

- `422ee9f9` (source, tests, plan, spec, and active devlog checkpoint).
- Closeout commit pending.
