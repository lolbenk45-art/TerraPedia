# Devlog: crawler-v2-runtime-acceptance

## Status

`closed`

## Context

- User goal: continue the crawler V2 handoff by running the isolated fixture-stack smoke, then perform bounded `town_npc_maintenance` runtime and page acceptance.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Base: `944bc0a0`
- Related docs: `docs/runbooks/crawler-monitor-queue-v2-cutover.md`
- Related prior entries: `2026-08-06-crawler-v2-monitor-simplification.md`, `2026-08-06-crawler-v2-automation-controls.md`

## Direction / Decisions

- Chosen approach: start a second backend on an unused loopback port with fixture mode, an exact test-only V2/V1 namespace pair, temporary fixture root, Redis DB 14, and ephemeral administrator credentials; keep the existing legacy stack running.
- Reasoning: this isolates API, Redis, SSE, progress, and attempt artifacts without pointing the smoke at the normal V2 namespace or modifying the existing stack lifecycle.
- Rejected options: do not restart the current legacy backend, use the normal V2 namespace, use Redis DB 15 reserved by user-auth E2E, run a real crawler, or enable recurring automation.

## Scope

- Frontend: runtime acceptance of the existing crawler monitor only; code changes only if acceptance exposes a defect.
- Backend: isolated fixture runtime and authenticated API acceptance; code changes only if acceptance exposes a defect.
- Data: no database writes or generated-data repair; preserve existing Town NPC and resume artifacts.
- Docs/process: record runtime evidence and handoff state.
- Out of scope: V1 restoration, scheduler daemon design or enablement, real automatic dispatch, force crawl, apply, push, merge, and worktree cleanup.

## Validation

- Commands run: environment, branch, worktree, process, port, and Redis logical-DB checks.
- Results: branch and dirty artifacts match handoff; Redis endpoint is `127.0.0.1:16380`; DB 14 was empty before and after the isolated run; candidate backend port 18100 was unused.
- Runtime smoke: first run passed checks 1-9 and exposed that the items sample was sent to the default-only `/dispatch` route; the operation is registered as non-default. The smoke now uses `/admin/crawler-monitor/domains/items/start` with `operationId=sample`.
- Post-hardening runtime smoke rerun: all 15 checks passed, including authenticated SSE, exact attempt logs, cancellation fallback, items sample, epoch-loss maintenance, explicit reset, old-epoch isolation, new-attempt admission, and the hardened cleanup path. The fixture backend was stopped; fixture root, exact test prefixes, and DB 14 keys were cleaned.
- Review hardening: the smoke now requires a fixture-root ownership marker, rejects unowned top-level files, requires non-shared namespace suffixes, and refuses a prefix that already contains Redis keys before arming cleanup. Guard regressions prove pre-existing files survive rejection.
- Review disposition: the cleanup-safety findings were fixed and re-reviewed; the endpoint correction and explicit `15/15` numbering are covered by the smoke source contract and post-hardening runtime result. The remaining same-suffix concurrency race is accepted as an operational residual risk and does not block this checkpoint.
- Town NPC API readback: V2 live queue count `0`; `town_npc_maintenance` domain status `idle`; history retained a `cancelled` attempt and a separate completed attempt with `39/39`, recent success time, and attempt-scoped log paths.
- Town NPC page readback: the admin card showed `空闲正常`, last result `已取消`, and `39 / 39` recent data; no horizontal overflow, console errors, or request failures were observed in the final browser pass.
- Final focused gates: smoke/items fixture tests `5/5`, admin V2 event/control/state/catalog tests `40/40`, backend `CrawlerMonitorServiceImplTest` plus `CrawlerMonitorActionRegistryTest` `207/207`, shell syntax, and `git diff --check` all passed.

## Result

- Completed: isolated fixture-stack smoke, bounded Town NPC API/page acceptance, and the smoke route correction for non-default items operation.
- Not completed: scheduler daemon design/authorization, real automatic dispatch, force crawl, or apply.

## Residual Risks

- The normal admin frontend login proxy did not complete a redirect in the first browser attempt; the final page readback used a backend-issued token injected into the same-origin admin cookie and had no request failures.
- Existing generated Town NPC running progress and resume artifacts remain user-owned and were not modified.
- Runtime setup must create `.terrapedia-crawler-v2-fixture-root` with value `terrapedia-crawler-v2-fixture-root-v1` before starting the fixture backend; the smoke will not claim or delete an unmarked root.
- Namespace emptiness checks are not an atomic lease. Concurrent smoke runs must use distinct generated suffixes; deliberately reusing one suffix at the same instant could race before either run creates its first key.

## Follow-up

- Design and separately authorize a V2 scheduler daemon before any recurring crawl; scheduler eligibility remains informational.

## Commits

- Focused checkpoint: `commit SHA pending in final response`.
