# Current Devlog

Last updated: 2026-07-31 18:23 CST by Codex

Active branch: `ux/detail-pages-redesign`

## Open Work

- 已确认的物品、NPC 与文章高保真稿正在正式接入；Item 已在 `8d459fe1` 建立检查点，NPC 已在 `3d9045fa` 建立检查点。Article 最终裁决保留正式 `/articles` 舞台，将搜索上移到 mast、首页最新投稿收敛为 6 篇，并新增无侧栏的四列 `/articles/archive` 承担 12 篇分页与搜索。owner: Codex；status: active；branch: `ux/detail-pages-redesign`；worktree: `/home/lolben/TerraPedia`；parent: none；dependencies: 书面设计复核、实施计划、合同优先实现与用户视觉验收；contract handoff: `docs/superpowers/specs/2026-07-30-article-discovery-archive-split-design.md`，只消费真实 DTO 或明确标注的展示派生值。
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

- Front P2 WP-11.2..WP-14, its closed P1-tail/WP10 dependencies,
  post-acceptance repairs, and the approved Mist Workbench/Linen Paper button
  systems are locally integrated into `main`. Focused contracts, the full
  frontend gate, both preview copies, and the 16-case runtime matrix passed for
  button scope. The blocked data-audit compatibility commits remain excluded;
  no push or local worktree cleanup was performed.

- Admin/backend P1+P2 batch is closed and locally integrated into `main` at
  `b778e57f`. The task branch and worktree are intentionally preserved; no push
  or cleanup has been performed.

- V2 queue engine activated on this worktree
  (cutoverId `crawler-v2-20260717T034735Z`). buffs re-dispatched and resumed
  from checkpoint 147/388 after a V1-era stuck-domain incident.
- V1 code deletion is deferred until V2 survives several full crawl cycles;
  boundary audit recorded in the entry above.

## Current State

- Public-page fidelity rebuild remains active. Item is committed at `8d459fe1`; NPC is committed at `3d9045fa`. The Article split is implemented but uncommitted: `/articles` keeps the production fold with mast search and six non-duplicated latest rows, while `/articles/archive` owns twelve-card search/pagination. Task 7 is now closed: the full static gate, direct-route/SSR-302 proof, the three server-dependent cross-route gates, the twelve-probe three-theme matrix, and the design-system review all pass, and the two compact-card defects found by that review (kicker/date spacing and fallback-cover typography) are repaired under two new contract assertions. Only user visual acceptance remains. No API/data repair is part of it.

- Front P2 merged-result validation passes the full public frontend gate and
  the focused public armor/recipe backend suite (16/16). The source integration
  worktree remains available with two unstaged HTML acceptance auxiliaries.

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

- C5 final repair `2e101c9` preserves the default array contract while exposing
  strict null-on-error only to the edit page. Failed loads remain write-blocked,
  legitimate empty recipes remain savable, stale requests cannot change current
  state, and production-body contracts pass 28/28. Final fresh specification and
  quality reviews report no findings.

- D1 initial commit `a801455` consolidates 35 local trim helpers with focused
  5/5 and seven compiling checkpoints. Specification review found two blockers:
  five original Unicode-blank helpers are not equivalent to `String.trim()`, and
  seven `firstNonBlank` bodies were textually changed by qualification.

- D1 repair `d2a8782` adds the narrowly-scoped Unicode-blank variant for exactly
  five owners and restores seven firstNonBlank bodies with static import. Focused
  tests pass 10/10, compilation passes, and fresh specification/quality review
  reports no findings.

- D2 commits `4ab211e7`, `7d6457fc`, and `c86ddcd1` remove all eight naive
  controller IP parsers, inject `ClientIpResolver`, and prove seven previously
  weak paths with exact fixed-IP propagation plus URI/unique-header request
  identity. Final specification and quality reviews report no findings; the
  coordinator reran 151 targeted backend tests and compilation successfully.

- D3 commit `c13ce117` replaces the category-null envelope with an exact global
  404 and lets six local catches surface through existing 400/500 handlers.
  MockMvc 404/400/500 coverage, final specification review, final quality review,
  and coordinator test/compile validation all pass.

- D4 commit `c7835ee7` preserves no-filter blank reviewStatus semantics, adds the
  parameterized mapper filter, and removes frontend count refreshes. Backend 62/62,
  admin contracts 33/33, typecheck, and final reviews all pass.

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

- The dark discovery page was repaired after acceptance was withheld: all four `--article-approved-*` surfaces were transparent tints of `--tp-color-page` and therefore resolved back to the ground in dark, and the latest-submission rows now use the user-selected G3 two-column card grid at the darkest L0 fill. Details, the one-for-one contract migration, and byte-level light-theme non-regression proof are in `entries/2026-07-29-approved-public-pages-production.md`.

- The Article discovery/archive work is committed on `ux/detail-pages-redesign` at the user's explicit instruction; the plan's Task 9 acceptance gate was satisfied by that instruction rather than by a formal visual sign-off. Nothing was pushed or merged. The next open item is the fold vertical-rhythm repair: it is fully analysed with measurements in `entries/2026-07-29-approved-public-pages-production.md` under "Commit state", but not implemented, and it needs the user to choose between capping the stage height plus fluid inner spacing, or dropping the `calc(100svh - 203px)` viewport lock outright. The standard stack is live on `15177/18191/13004`; if it is down, note that a torn Redis AOF tail can block backend startup and that the authorized repair plus its verified backup are documented in that entry. Preserve every unrelated design/report path.

- Front P2 and the light-theme button adaptation require no further merge
  action. Read `entries/2026-07-22-front-p2-local-integration.md` for the
  curated-history boundary and excluded data-audit work, and
  `entries/2026-07-22-light-theme-button-system.md` for button validation and
  residual-risk boundaries.

- Admin P1+P2 requires no further action. Read
  `entries/2026-07-18-admin-p1-p2-batch.md` only for historical context. The
  local task branch/worktree remain available for acceptance follow-up.

- Read `entries/2026-07-17-crawler-v2-per-env-activation-guard.md` before any
  crawler-monitor work. This environment routes V2; other worktrees still
  route V1 until they run `scripts/dev/crawler-v2-cutover.sh`.
- Do not run real crawler force/apply actions, Redis reset, or database writes
  without explicit operation-level authorization.

## Current Risks

- Article archive implementation is awaiting final visual acceptance. The flagged fallback-cover typography and kicker/date spacing were inspected, found genuinely defective because both classes take their base styling from the `pages/articles/index.vue` scoped block, and repaired in `assets/css/domains/detail-pages-redesign.css` under two new layering-contract assertions. A second user-directed round then repaired the dark discovery page: the four `--article-approved-*` surfaces were transparent tints of the page colour and composited back to it, so the fold and archive collapsed to one flat black mass. They are now token-derived real surfaces at the user-selected L0 level, and the archive rows became a two-column card grid (G3). The v22 band element was intentionally not reintroduced; only its closing rule was implemented, at content width rather than full bleed. The Task 7.4 interaction probe passed before the handoff but its post-repair hash was never captured; recreate it from the repaired Task 7.4 plan if durable probe hashing is required.

- Acceptance follow-up browser checks observed intermittent failed Nuxt
  prefetches for unvisited crawler-monitor modules. The login and article
  targets had zero console errors, zero target request failures, and zero
  non-auth/non-resolver writes; the prefetch noise is unrelated to this scope.

- D6 is committed at `513ab4db` with test repair `fda1484c`; final admin gates
  pass 400/400. Runtime screenshots pass at six 1280px routes with stable-state
  zero console/network errors and no page overflow. C4's focused CSS evaluator intentionally supports only the
  repository's current syntax subset and does not model future decorative
  background layering.

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

- `docs/devlog/entries/2026-07-29-public-ui-design-system.md`
  - branch: `ux/detail-pages-redesign`
  - status: `closed`
  - commit: `52a83c59`; mandatory public UI baseline and three-theme specimen

- `docs/devlog/entries/2026-07-29-articles-hifi.md`
  - branch: `ux/detail-pages-redesign`
  - status: `closed`; user-approved high fidelity; production implementation is tracked by `entries/2026-07-29-approved-public-pages-production.md`

- `docs/devlog/entries/2026-07-22-light-theme-button-system.md`
  - branch: `main` from `feat/front-p2-integration`
  - status: `closed`
  - commit: `466146c1`; two approved light button systems and byte-identical
    interactive previews complete

- `docs/devlog/entries/2026-07-22-front-p2-local-integration.md`
  - branch: `main` from `feat/front-p2-integration`
  - status: `closed`
  - commit: `8dedd321`; curated local integration complete

- `docs/devlog/entries/2026-07-18-admin-p1-p2-batch.md`
  - branch: `fix/admin-p1-p2-batch`
  - status: `closed`
  - commit: `b778e57f`; integrated into local `main`

- `docs/devlog/entries/2026-07-18-front-p1-tail-refactor.md`
  - branch: `refactor/front-p1-tail`
  - status: `closed`
  - integration commit: `8dedd321`

- `docs/devlog/entries/2026-07-17-admin-p0-security-batch.md`
  - branch: `dev/post-merge-acceptance`
  - status: `closed`
  - commits: `e6cda9c` `f750425` `4db4df8` `462e483` `7a0a82e` `f8f9b3a` `cc287de` `ad8e9bd`

- `docs/devlog/entries/2026-07-17-v2-main-merge-integration.md`
  - branch: `main`
  - status: `closed`
  - commit: `518d9a04`

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
