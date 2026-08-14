# Current Devlog

Last updated: 2026-08-15 00:44 CST by Codex

Active branch: `feat/supplementary-domains-readiness`

## Recently Closed

- **附加域 L1 自动化入库**（Shimmer、Audio、Bosses）；owner: Codex；status: closed；branch: `feat/supplementary-domains-readiness`；worktree: `/home/lolben/TerraPedia`；parent: none；dependencies: three first-L1 Owner applies, source-only scheduler preflight, and reviewer re-check complete；contract handoff: `docs/superpowers/specs/2026-08-14-supplementary-domains-l1-automation-design.md`；implementation plan: `docs/superpowers/plans/2026-08-14-supplementary-domains-l1-automation.md`；result: three formal applies completed and scheduler is enabled for changed-only default previews；boundary: `L1/ACTIVE`, one Owner approval per apply, no L2 or Boss loot；commit: `c698a034`. Runtime restart and regenerated scheduler preflight are deferred until the unrelated live Buff task is terminal.
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

Supplementary-domain scheduler activation is now **enabled**, `changed-only`,
with a 60-minute interval. The prior Buff task is terminal (`388/388`, zero
failures), and no manual sweep was invoked. The next scheduler preflight must
be collected after the supplementary source-probe follow-on is implemented and
the backend is restarted with the final source-only filter.

The follow-up `Crawler Auto-Domain Consumption And Resume` task is active on
this branch. It repairs source-manifest consumption and three-attempt checkpoint
recovery for `items`, `npcs`, `projectiles`, `armor_sets`, and `buffs`; `shimmer`,
`audio`, and `bosses` are fail-closed pending lightweight source probes. The
user selected the bounded probe design at
`docs/superpowers/specs/2026-08-15-supplementary-domain-source-probes-design.md`;
the written specification is approved and its executable plan is
`docs/superpowers/plans/2026-08-15-supplementary-domain-source-probes.md`.
Implementation is awaiting execution-mode selection and must not add
database/L2/Boss-loot automation.

## Open Work

- **Push/merge `design/crawler-auto-ingestion-readiness`**: independent owner decision.
- Item request: `reports/authorization/canonical/canonical-crawler-v2-items-t1-acceptance-20260809-07.request.json`; packet `...-20260809-07.packet.json`; status: `AUTHORIZED` and consumed under `canonical-crawler-v2-items-t1-acceptance-20260809-admin-07`.
- Scheduler request: `reports/authorization/canonical/canonical-crawler-v2-scheduler-t1-acceptance-20260809-04.request.json`; packet `...-20260809-04.packet.json`; status: `AUTHORIZED` and consumed once under `canonical-crawler-v2-scheduler-t1-acceptance-20260809-admin-07`.

## Current State

- Public-page fidelity rebuild remains active. Item is committed at `8d459fe1`; NPC is committed at `3d9045fa`. The Article split is implemented but uncommitted: `/articles` keeps the production fold with mast search and six non-duplicated latest rows, while `/articles/archive` owns twelve-card search/pagination. Task 7 is now closed: the full static gate, direct-route/SSR-302 proof, the three server-dependent cross-route gates, the twelve-probe three-theme matrix, and the design-system review all pass, and the two compact-card defects found by that review (kicker/date spacing and fallback-cover typography) are repaired under two new contract assertions. Only user visual acceptance remains. No API/data repair is part of it.

- Front P2 merged-result validation passes the full public frontend gate and
  the focused public armor/recipe backend suite (16/16). The source integration
  worktree remains available with two unstaged HTML acceptance auxiliaries.

## Next Agent Start Point

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

- `entries/2026-08-11-scheduler-preflight-domain-mapping-decision.md` - Task 5 preflight domain gap analysis; owner chose Approach C (narrow to 5 auto-dispatch domains); preflight now 10/10 eligible.

- `entries/2026-08-09-crawler-v2-scheduler-formal-enablement-preparation.md` - Tasks 1-4 committed as proposal-only, current-hash-bound preparation; no production preflight artifact or authorization identity generated.

- `entries/2026-08-08-recipe-formal-read-only-verification.md` - formal Recipe
  state verified read-only; overwritten standalone evidence rejected.
- `entries/2026-08-08-biome-t1-isolated-acceptance.md` - exact Biome T1 passed
  and cleaned to zero; formal Biome apply remains unauthorized.
- `entries/2026-08-08-buff-t1-isolated-acceptance.md` - exact Buff T1 passed
  and cleaned to zero; formal Buff apply remains unauthorized.
- `entries/2026-08-07-projectile-item-only-t1-acceptance.md` - exact item-only
  Projectile T1 passed and cleaned to zero; NPC relation coverage remains
  explicitly out of scope.
- `entries/2026-08-07-projectile-t1-source-blocker.md` - original NPC-inclusive
  lane intentionally stopped and transferred to the owner-approved item-only
  child.
- `entries/2026-08-07-boss-t1-isolated-acceptance.md`
- `entries/2026-08-07-npc-t1-isolated-acceptance-refresh.md`
- `entries/2026-08-06-crawler-v2-domain-freshness-card.md`
- `entries/2026-08-06-crawler-v2-items-sample-operation.md`
- `entries/2026-08-06-crawler-v2-automation-controls.md`
- `entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`
- `entries/2026-07-27-crawler-automated-ingestion-closure.md`
- `entries/2026-08-04-item-image-projection-apply-runtime.md`
- `entries/2026-08-06-crawler-v2-monitor-simplification.md`
