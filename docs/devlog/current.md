# Current Devlog

Last updated: 2026-07-18 23:36 CST by Codex

Active branch: `fix/admin-p1-p2-batch`

## Open Work

- Admin P1+P2 audit follow-up is active on branch `fix/admin-p1-p2-batch`
  in worktree `/home/lolben/.config/superpowers/worktrees/TerraPedia/admin-p1-p2-batch`.
  Owner/coordinator: `/root`; parent entry:
  `entries/2026-07-18-admin-p1-p2-batch.md`; status: `active`; dependencies:
  P0 B already merged, A1 verified and skipped; contract handoff: execute A2-D6
  serially with per-task spec and quality review.

- Post-merge acceptance in progress on branch `dev/post-merge-acceptance`
  (from local `main` @ `518d9a0`, 31 commits ahead of origin, unpushed).
- Uncommitted work pending user acceptance: triage-board layout fixes,
  V1-engine warning banner, one-shot V2 cutover script. See
  `entries/2026-07-17-crawler-v2-per-env-activation-guard.md`.
- Admin P0 audit batch is complete (8/8, commits `e6cda9c`..`ad8e9bd`); see
  `entries/2026-07-17-admin-p0-security-batch.md` for verification evidence
  and the three explicit follow-ups (backend @Profile for test-state,
  ItemMapperPreferredImageSqlTest baseline reds, P1 dead-code sweep).

## Active Focus

- Continue the admin/backend P1+P2 batch from current local `main@218dfc0`.
  Do not take code from archived branch `fix/admin-p0-batch`; A2 through C1
  are approved. C2 is now specification- and quality-approved after the readable
  responsive layout, brace-bounded contract, and 44px control-height repair.
  C3 is now specification- and quality-approved after transactional page-state,
  retry, and contraction-clamp behavior coverage. C4 is specification- and
  quality-approved after accessible token contrast, semantic KPI gradients, and
  executable light/dark color contracts. C5 implementation is specification-
  approved. Its first repair clears pending submit, stale-request, and executable
  whitelist findings, but C5 remains active because recipe fetch failure is still
  indistinguishable from a legitimate empty result; do not begin D1 yet.

- V2 queue engine activated on this worktree
  (cutoverId `crawler-v2-20260717T034735Z`). buffs re-dispatched and resumed
  from checkpoint 147/388 after a V1-era stuck-domain incident.
- V1 code deletion is deferred until V2 survives several full crawl cycles;
  boundary audit recorded in the entry above.

## Current State

- C2 commits `b825ecc`, `02ee0a7`, `635f5ba`, and `fd3689e` keep table overflow
  local, action buttons on one row, and article filters readable across widths.
  Focused contracts pass 11/11 and admin typecheck passes. Fresh browser geometry
  at 1280/1130/1024/900/800/761/760 confirms every toolbar control has computed
  and actual height 44px, stays inside its toolbar, and causes no document,
  command-bar, or toolbar overflow. Specification and quality re-review have no
  findings; temporary ports 3010/9223/18088 are closed.

- C3 commits `c20d7b2` and `dcf214c` repair all seven classification-audit tokens
  and add a transactional shared five-section pager. The final behavior suite
  passes 13/13 and admin typecheck passes; it executes aggregation, deferred
  commit, failed-target retry, contraction/zero-result clamp, and waiting-state
  preservation. Specification and quality re-review report no remaining findings.

- C4 commits `3a1d178` and `06d655b` migrate login/dashboard theme colors,
  delegate category controls to global styles, restore >=4.5:1 light/dark normal
  text contrast, and keep KPI gradients within their semantic domains. Focused
  contracts pass 21/21, admin typecheck passes, runtime geometry has no layout
  regression, and fresh specification/quality re-review has no blocking findings.

- C5 commit `630ddb5` exports the shared cookie key, reuses `resolveApiUrl`, makes
  audio match status token-exact, and maps items through a 24-field whitelist.
  Focused contracts pass 23/23 and admin typecheck passes. Quality review found
  two Important issues: recipe loading can race submission or a later edit, and
  the whitelist contract does not execute the actual `handleEdit` behavior.

- C5 repair commit `02df27b` adds template/function submission gates, generation
  identity, and executable deferred handler tests; focused contracts pass 25/25.
  Fresh quality re-review confirmed those two findings are resolved, then found
  the remaining failure-path ambiguity: `fetchItemRecipes` catches errors as `[]`,
  so the page can still unlock and later write an empty recipe set.

- Public category child navigation is closed at `4a744dc`: six parent routes
  expose 34 image-backed child categories with verified scope, count, and
  fail-closed behavior.
- V2 crawler operation workflow is integrated from `3234cc0` pending the local
  merge commit. It adds the backend-owned 19-operation catalog, truthful
  attempt plan/result evidence, lease renewal, exact controls, and compact ID
  presentation. Fresh branch gates passed admin 311/311 plus typecheck/build,
  crawler/workflow 61/61, and focused V2 backend 527 with zero failures/errors.
- The local merge initially regressed the main notification source by treating
  missing legacy `domain.state` as V2 idle. The fallback was removed; merged
  gates now pass admin 345/345 plus typecheck/build, focused V2 backend 538/538,
  and backend test compilation.

## Next Agent Should Start Here

- For admin P1+P2 work, read
  `entries/2026-07-18-admin-p1-p2-batch.md` and the rebased plan, then give the C5
  edit path a failure-aware recipe fetch contract while preserving every other
  caller's existing array fallback. Failed edit recipe loads must keep recipe
  writes blocked; preserve exact-token audio behavior and the three form transforms.

- Read `entries/2026-07-17-crawler-v2-per-env-activation-guard.md` before any
  crawler-monitor work. This environment routes V2; other worktrees still
  route V1 until they run `scripts/dev/crawler-v2-cutover.sh`.
- Do not run real crawler force/apply actions, Redis reset, or database writes
  without explicit operation-level authorization.

## Current Risks

- The admin batch has an open C5 quality-review blocker. D1-D6 remain
  unimplemented, and their scout line numbers must be relocated on the current
  branch. C4's focused CSS evaluator intentionally supports only the repository's
  current syntax subset and does not model future decorative background layering.

- Broad Maven/full quality-gate baseline failures are outside the V2 scope.
- 6/8 local worktrees still silently route V1 until cut over; the new banner
  only appears after they merge this change.
- V1 defects (fake exit 0 on recovered processes, reducer contradiction
  swallow) remain in code but are unreachable under V2 routing.
- Real force-crawl, formal apply, live Redis expiry races, and adversarial HTTP
  preview-path acceptance remain manual/runtime concerns.
- Public category totals and representative images depend on current local
  data; their route and fail-closed contracts remain the acceptance boundary.

## Recently Closed

- `docs/devlog/entries/2026-07-17-admin-p0-security-batch.md`
  - branch: `dev/post-merge-acceptance`
  - status: `closed`
  - commits: `e6cda9c` `f750425` `4db4df8` `462e483` `7a0a82e` `f8f9b3a` `cc287de` `ad8e9bd`

- `docs/devlog/entries/2026-07-17-v2-main-merge-integration.md`
  - branch: `main`
  - status: `closed`
  - commit: pending in final response

- `docs/devlog/entries/2026-07-16-crawler-monitor-operation-semantics.md`
  - branch: `fix/crawler-queue-v2-runtime`
  - status: `closed`
  - commit: `3234cc0`

- `docs/devlog/entries/2026-07-14-crawler-monitor-registered-idle-domains.md`
  - branch: `fix/crawler-queue-v2-runtime`
  - status: `closed`
  - commit: `3234cc0`

- `docs/devlog/entries/2026-07-16-public-category-navigation.md`
  - branch: `codex/continue-dev-20260715`
  - status: `closed`
  - commit: `4a744dc`

- `docs/devlog/entries/2026-07-12-crawler-queue-v2-runtime.md`
  - branch: `fix/crawler-queue-v2-runtime`
  - status: `closed`
  - commit: `0bad80d`
