# Devlog: Crawler Monitor Operation Semantics

## Status

`closed`

## Context

- User goal: execute the filled crawler-monitor operation-semantics questionnaire so sync, force crawl, preview, apply, pause, retry, and result states are truthful and distinguishable.
- Branch: `fix/crawler-queue-v2-runtime`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/crawler-queue-v2-runtime`
- Parent context: `docs/devlog/entries/2026-07-14-crawler-monitor-registered-idle-domains.md`
- Approved input: `docs/superpowers/specs/2026-07-15-crawler-monitor-operation-semantics-questionnaire.md`

## Goal And Success Criteria

- Replace the single generic start meaning with a backend-owned multi-operation catalog.
- Keep current domain lifecycle separate from latest terminal result.
- Add real preflight plan, runtime counts, result kinds, pause capability, retry wording, and destructive confirmation.
- Implement check/force and preview/apply variants without starting real crawler or database apply work during automated validation.

## Direction / Decisions

- Blank questionnaire answers use their recommended values.
- Explicit overrides: Q12 `B`, Q20 `A`, and Q24 current `A` with future extensibility.
- The action registry owns operation semantics; the frontend never infers commands or database risk.
- The implementation keeps 12 stable domains and adds visible operation variants with stable action IDs.
- Current checkpoint-enabled domains remain Buff, Boss, and Town NPC maintenance; capability projection is metadata-driven.
- Formal design: `docs/superpowers/specs/2026-07-16-crawler-monitor-operation-semantics-design.md`.
- Execution plan: `docs/superpowers/plans/2026-07-16-crawler-monitor-operation-semantics.md`.
- Plan audit verdict: execution-ready after repairing the direct-crawler progress coverage, no-network force fixture, missing runner-test ownership, and explicit current/latest projection seam. The plan locks the registry -> overview -> start -> attempt artifacts/progress -> admin chain and keeps real force/apply manual-only.

## Scope

- Backend registry, V2 start/overview DTOs, attempt plan/result evidence, and focused tests.
- Wiki/backend-refresh operation variants and progress contracts with isolated tests.
- Maintained admin operation grouping, summaries, control wording, state separation, confirmation, and focused tests.
- Out of scope: real crawler execution, shared Redis reset, generated-data rewrite, real DB apply, commit, merge, or worktree cleanup without separate authorization.

## Validation

- RED -> GREEN admin contract coverage now proves domain cards/table show both
  current state and latest terminal result, operation starts are disabled with
  a visible backend-state-derived reason while a domain is not startable, and
  terminal history shows planned/actual/skipped/failed counts without invented
  fallback numbers.
- Admin gate passes: 309/309 unit tests, Nuxt typecheck, and production client,
  server, and Nitro build (`BUILD_EXIT=0`).
- Offline crawler/workflow gate passes 73/73. Focused backend gate passes
  509/509 plus `mvn test-compile`.
- `git diff --check` passes. Process scans found no crawler, import, backfill,
  or Nuxt build process after validation.
- The final idle-control/history-evidence/long-ID repair now has focused
  regression evidence: `node --test tests/crawler-monitor-page-contract.test.mjs
  tests/crawler-monitor-triage-workbench.test.mjs` passes 108/108. The full
  admin gate passes 310/310 unit tests, Nuxt typecheck, and production build.
- Final closure evidence: the expanded focused monitor contract passes 109/109;
  the full admin gate passes 311/311 unit tests, Nuxt typecheck, and production
  build; isolated crawler/workflow tests pass 61/61; the focused V2 backend
  selection runs 527 tests with zero failures/errors (10 isolated Redis
  integration tests skipped); and `mvn test-compile` plus `git diff --check`
  pass.
- Runtime recovery passed without an empty-epoch reset: the preserved 49-key
  DB4 V2 prefix was restored after full source/target backups, the shared Redis
  store was migrated to `~/.local/share/terrapedia/redis/redis-16380`, and DB3's
  185 unrelated keys remained intact. The standard Bash start command then
  passed backend compile, public/admin typecheck, Redis directory verification,
  and all four service reachability checks.
- Fresh authenticated overview reports the original epoch, healthy queue and
  reconciler, 12 idle domains, 19 operations, 12 startable domains, and zero
  live attempts. The recovered paused Buff attempt `...2fe16` converged to
  `cancelled` because its exact recorded PID no longer exists; no crawler was
  restarted. Backend/front/admin return `200`/`200`/expected `302`, logs contain
  no backend/admin runtime errors, and no crawler writer is active.
- Redis lifecycle regression checks pass 3/3, Bash foundation/slot checks pass
  9/9 with the example config, Bash syntax checks pass, and `git diff --check`
  passes. The complete `local-stack.test.mjs` remains 34/35 because an unrelated
  existing assertion expects `quality-gate.sh` to use `$TP_FRONT_PROJECT_DIR`
  while the script currently uses the maintained literal `front-nuxt`.

## Residual Risks

- The worktree already contains the uncommitted V2 runtime implementation and user-generated acceptance data. All edits must preserve and integrate with that scope; destructive Git cleanup is forbidden.
- Real force-crawl and apply behavior will remain runtime-unproven until the user explicitly authorizes a specific operation after offline gates pass.
- Real force-crawl and database apply variants remain intentionally unexecuted;
  the user can now choose a specific operation from the healthy admin page for
  final manual acceptance.
- The pre-existing `local-stack.test.mjs` front quality-gate assertion drift is
  outside this crawler-monitor task. It does not affect the canonical startup,
  which passed the real public/admin typechecks and runtime reachability checks.

## Review Coordination

- Coordinator: Codex. Serialized owner of all shared monitor UI, test, and
  devlog files.
- Read-only specification reviewer: completed. Scope was the complete V2
  operation workflow diff against `0bad80d`, with particular attention to the
  repaired idle terminal-control identity, recorded history evidence, and
  last-five identity rendering. Allowed files: none; the reviewer must not
  edit, stage, run crawlers, mutate Redis/database, or inspect user-generated
  acceptance data.
- Read-only code-quality reviewer: completed after the specification finding
  was repaired and re-approved. No-write review of lease renewal, exact
  controls, preview fencing, confirmation, and compact display found no
  material defect.

## Review Findings

- Reviewer: Codex pre-merge read-only reviewer.
- Scope: staged V2 operation workflow, crawler progress, API start boundary,
  and admin operation catalog.
- Disposition: four Important findings reopen the task. Backend-refresh work
  without child progress does not refresh canonical heartbeat; dedicated first
  start accepts non-`fresh` resume modes; direct crawlers can exceed the V2
  heartbeat deadline while request-gate waits; and the main monitor page does
  not render the approved four-group 19-operation catalog. Shimmer also reports
  three requests while its registry estimate is one.
- Owner/resolver: Codex.
- Re-review required: yes, after RED -> GREEN regressions and integrated gates.
- Reviewer: Codex read-only admin re-review (2026-07-17).
- Scope: final V2 idle-domain recovery controls, task-history evidence, and
  long-ID display across the maintained monitor surfaces.
- Disposition: commit blocked by two Important and one Moderate finding.
  Idle rows borrow `retry`/`cleanup` from the newest actionable terminal attempt
  but still send empty live-attempt identity to controls; history hides real
  `reportPath`/`progressPath`, attempt plan, result kind, and resume outcome;
  queue/attempt/epoch IDs remain fully visible in some table and drawer fields.
- Owner/resolver: Codex. Required repair: preserve a dedicated terminal control
  target without changing idle current state, project the recorded attempt
  evidence and result semantics, then apply the common last-five ID display
  policy. Re-review required after RED -> GREEN frontend gates.
- Reviewer: read-only specification reviewer (2026-07-17).
- Scope: complete V2 operation-semantics diff, with final idle control,
  history evidence, and compact identity requirements.
- Disposition: commit blocked by one Moderate finding. The nav-registered
  `/operations/crawler-monitor-test` page still renders a raw `queueId` in its
  result card and a cancellation-confirmation fallback. This violates the
  common last-five ID display policy even though raw identity must remain
  available internally for control requests.
- Owner/resolver: Codex. Required repair: reuse `shortCrawlerIdentity` for
  visible queue and dispatch IDs in the test workspace, retain raw values for
  payloads, then re-run the focused page contract and repeat review.
- Reviewer: read-only specification reviewer re-review (2026-07-17).
- Disposition: approved after the shared compact identity helper was applied to
  the maintained test workspace and legacy visible fallback text. Raw IDs remain
  only in control payload construction. Focused page and Chinese-copy contracts
  pass 61/61; re-review found no further severity finding.
- Reviewer: read-only code-quality reviewer (2026-07-17).
- Scope: V2 lease renewal, reconciler, exact control identity, report preview
  fencing, start confirmation, and display-versus-payload identity separation.
- Disposition: no material finding. The review confirms that renewal extends
  dedupe and per-domain leases atomically; lease loss uses exact process
  identity; controls validate exact V2 identity; and display compaction does
  not alter payload identities.

## Follow-up

- No code follow-up remains for this commit. Real force-crawl, formal apply,
  live Redis expiry races, and adversarial HTTP preview-path acceptance remain
  manual/runtime concerns and require explicit operation-level authorization.

## Commits

- Commit SHA pending in final response.
