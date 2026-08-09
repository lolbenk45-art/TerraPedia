# Devlog: crawler-v2-scheduler-formal-enablement-preparation

## Status

`closed`

## Context

- User goal: close the current Scheduler T1 test round and prepare a plan for formal production enablement.
- Branch: `design/crawler-auto-ingestion-readiness`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-auto-ingestion-readiness`
- Related plan: `docs/superpowers/plans/2026-08-09-crawler-v2-scheduler-formal-enablement-preparation.md`
- Related prior entry: `docs/devlog/entries/2026-08-08-crawler-v2-scheduler-lifecycle.md`

## Direction / Decisions

- The isolated Scheduler T1 is historical runtime evidence, not production-mutation authority.
- Formal enablement preparation stays proposal-only and read-only against production control state.
- A future proposal must bind a fresh observed epoch, namespace, disabled changed-only configuration, zero attempts/claims, reconciler health, domain readiness, T1 report hash, and code hashes. Hard-coded representative control values are not sufficient.
- Rejected: formal permit generation/consumption, scheduler enablement, direct JSON/Redis writes, manual sweep, external daemon, formal database writes, and Wiki network access in this preparation task.

## Scope

- Backend: no production backend mutation in this task.
- Data: no formal database, production Redis, or Wiki writes/requests.
- Docs/process: formal-enablement preparation plan, current devlog routing, project status, and risk synchronization.
- Out of scope: generating a proposal or request, ADMIN authorization, production scheduler enablement, release, deployment, push, merge, and worktree cleanup.

## Validation

- Task 1 evidence recheck: the final isolated Scheduler T1 report remains
  `status=passed` with SHA-256
  `bb3493ea5fb09da518f1d8a6b2db8712a86cf6a9784c17b5241288be5ed5a8d6`; its
  scheduled tick, two renewals, restart adopt/reject, lease-loss reap,
  `947/1256/1015` Recipe counts, unresolved `0/0`, and cleanup-zero fields are
  unchanged. The focused lifecycle/manifest/monitor lane was previously
  recorded as `118/118`.
- Task 2 implementation: backend `GET
  /admin/crawler-monitor/v2/automation/preflight` and the Node preflight
  collector are read-only and hash-bound. Service tests cover a fresh eligible
  domain report, repository path escape rejection, and no-lock sweep claim
  reads. The Node preflight lane passes `7/7`.
- Task 3 implementation: proposal construction requires the exact preflight
  hash, T1 identity, current code bundle bytes, disabled changed-only control,
  zero attempts/claims, healthy reconciler, and no-write flags. The CLI now
  rejects missing/escaped inputs and writes only proposal-only output under the
  canonical authorization root. The proposal/manifest/cutover lane passed
  `76/76` before the final additions; the proposal CLI test now also verifies
  current T1/code bytes in a subprocess.
- Fresh verification in this handoff: Node preflight + proposal tests pass
  `11/11`; backend preflight + monitor implementation tests pass `201/201`,
  and the prior controller-inclusive focused run passed `234/234`.
- `git diff --check` and the T1 `sha256sum` check pass. Protected generated
  data, resume artifacts, and logs remain unstaged.
- Not run by design: no real preflight artifact, proposal, request, packet, or
  permit generation; no production API mutation; no formal database/Redis
  write; no manual sweep, daemon, or Wiki/network request. No backend listener
  was available for a safe read-only GET, and starting one would violate this
  preparation boundary.

## Result

- Completed: Tasks 1-4 preparation code, tests, manifest hardening, and review
  notes. The source chain is proposal-only and current-hash-bound.
- Not completed: Task 5/6 remain intentionally gated. A fresh production
  preflight and owner authorization are still required before any request,
  packet, permit, enablement, or rollback observation.

## Residual Risks

- No real production preflight was observed in this window because the backend
  listener was absent; the code path is tested but not operational evidence.
- Any current-hash or runtime-state drift invalidates a future request.
- The two passed isolated acceptance lanes are not production scheduler authorization.

## Follow-up

- Owner: Codex. Commit the focused Task 1-4 preparation change, then stop before
  Task 5 until the owner authorizes a fresh exact request.

## Commits

- `commit SHA pending in final response`

### 2026-08-10

- Change: completed read-only preflight and proposal hardening through Task 4.
- Decision: production state must be observed through the authenticated
  preflight GET immediately before any future request; representative constants,
  escaped evidence paths, stale T1 bytes, and changed code bundle bytes fail
  closed.
- Evidence: Node `11/11`, backend `201/201` plus controller-inclusive `234/234`,
  T1 report hash, and `git diff --check`; see git for code-level diff details.

### 2026-08-09 19:34

- Change: opened a separate formal-enablement preparation chain after the final isolated Scheduler T1 evidence.
- Reason: preserve the test result while preventing it from being read as authority to mutate production automation.
- Evidence: the plan and current-state inspection above; see git for docs-level diff details.
