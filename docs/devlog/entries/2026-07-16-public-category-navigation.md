# Devlog: Public Category Navigation

## Status

`closed`

## Context

- User goal: replace static category pages with a real backend-owned category
  navigation chain from `/categories` through `/categories/:slug` to the
  correctly filtered `/items?filter=<key>` page.
- Branch: `codex/continue-dev-20260715`
- Worktree: `/home/lolben/.config/superpowers/worktrees/TerraPedia/continue-dev-20260715`
- Base: local `main` at `e2bad1b`
- Related docs:
  - `docs/superpowers/specs/2026-07-16-public-category-navigation-design.md`
  - `docs/superpowers/plans/2026-07-16-public-category-navigation.md`
  - `docs/project-governance/current/CURRENT_API_CONTRACTS.md`
- Related prior entries: none

## Direction / Decisions

- Chosen approach: add a public backend category navigation endpoint that owns
  the six semantic route/filter/category-code mappings and returns real
  category IDs, children, and item totals.
- The user approved the written design and selected inline execution. The
  executable plan uses backend-first RED -> GREEN checkpoints followed by the
  frontend consumer, stack restart, and runtime acceptance.
- Backend producer contract implemented: `GET /api/categories/navigation`
  returns the six ordered entries and fails with the standard HTTP 503 envelope
  before counting anything when a configured category code is missing. See git
  for code-level diff details.
- Frontend consumer contract implemented: category index/detail and the six
  approved catalog filters use the navigation response; navigation filters
  disable item requests while unresolved and never use sample fallback data.
  Existing non-navigation item filters retain their prior behavior. See git for
  code-level diff details.
- Reasoning: the user chose a backend contract so the category index, category
  detail, and item catalog cannot drift into separate mappings.
- Rejected options:
  - frontend-only shared registry;
  - numeric database IDs in public category URLs.

## Scope

- Frontend: category index, semantic category detail, and the six matching item
  catalog filters.
- Backend: public navigation DTOs, registry, service, count integration,
  controller endpoint, and focused tests.
- Data: read-only use of current category and item relations; no migration or
  backfill.
- Docs/process: approved design, implementation plan, validation evidence, and
  task handoff.
- Out of scope: admin category editing, crawler/data refresh work, visual
  redesign, and migration of unrelated item filters.

## Validation

- Commands run:
  - live read-only probes of category tree, statistics, category IDs, and the
    current category/item routes;
  - design self-review and documentation consistency scans before checkpoint.
  - plan header, task, contract-term, placeholder, code-fence, checkbox, and
    `git diff --check` scans.
  - `cd back && mvn '-Dtest=CategoryNavigationServiceImplTest,CategoryControllerTest,ItemMapperPreferredImageSqlTest#categoryScopedCountShouldMatchPrimaryOrActiveRelationWithoutDuplicateRows' test`.
  - `cd front-nuxt && node scripts/check-category-navigation-contract.mjs`.
  - `cd front-nuxt && pnpm run check`.
  - `cd front-nuxt && pnpm run test:unit`.
  - `bash ./scripts/dev/stop-local-stack.sh` followed by
    `bash ./scripts/dev/start-local-stack.sh` and
    `bash ./scripts/dev/smoke-local-stack.sh`.
  - live API comparison between `GET /api/categories/navigation` and
    `GET /api/public/items` using the complete weapon `categoryIds` scope.
  - headless Playwright acceptance with system Chromium across `/categories`,
    `/categories/weapons`, `/items?filter=weapon`, and an unknown category.
- Results:
  - confirmed the category pages are static while the real category and public
    item APIs are available;
  - the user approved the backend contract, frontend behavior, failure rules,
    test design, and scope.
  - implementation plan self-review passed with 7 tasks, 64 balanced fences,
    35 executable checkboxes, no placeholder markers, and no diff errors.
  - backend RED failed on the eight expected missing navigation symbols; GREEN
    passed 6/6 selected assertions with zero failures or errors.
  - the broader existing `ItemMapperPreferredImageSqlTest` still has three
    unrelated image-projection assertion failures against unchanged mapper XML;
    the new category-count characterization passes independently.
  - frontend navigation contract passed after its expected RED report of 27
    static/missing integration markers; the full public frontend check and Nuxt
    typecheck passed. Existing non-failing Chromium DBus/GPU and Node
    deprecation warnings remain unrelated.
  - review-fix RED tests reproduced partial/invalid category-scope acceptance,
    null item-count coercion, missing reused-route handling, and stale refresh
    request gating; final frontend check passed and unit tests passed 15/15.
  - restarted-stack smoke passed 10/10; the fresh report is
    `reports/local-start/smoke-20260716-181157.json`.
  - the navigation API returned six entries in the approved order and the
    weapon scope contained 26 category IDs; navigation `itemCount` and the
    scoped public-item `pagination.total` both returned 488. Five sampled
    public items each matched the weapon primary or relation scope.
  - browser acceptance confirmed the 488 total on `/categories`, the semantic
    `/categories/weapons` intermediate page, five real immediate children,
    the `/items?filter=weapon` action, the `武器图鉴` title and visible `武器`
    filter label, full category scope on initial/search/page-2 requests,
    preserved `filter=weapon` query state, HTTP 404 for an unknown slug, and no
    page errors.
- Cross-review:
  - reviewer: `/root/category_navigation_review`;
  - scope: implementation range `256cf52..2b68aa8`, followed by two targeted
    re-reviews of the uncommitted fixes;
  - findings: one Critical empty/invalid navigation scope could issue an
    unfiltered item request; Important reused-route 404, strict mixed-value
    validation, and failed-refresh request suppression gaps;
  - disposition: all findings fixed with strict runtime normalization,
    non-empty settled/error-free readiness, retry gating, reactive unknown-slug
    handling, accessible error announcements, and four focused unit cases;
  - re-review: no remaining Critical or Important findings; ready for runtime
    acceptance. Reviewer did not run tests, so the coordinator reran them.
- All planned focused, static, restarted-stack, API, and browser acceptance
  checks were run.

## Result

- Completed: design, plan, backend producer, frontend consumer, strict
  fail-closed navigation filtering, durable API contract update, focused
  backend/frontend tests, full frontend checks, cross-review, real stack
  restart, API total equivalence, and browser acceptance.

## Residual Risks

- No remaining task-specific correctness risk was found. Navigation totals are
  live data and can change after a data refresh, so the API documentation marks
  its count and abbreviated IDs as a dated snapshot.
- Existing non-failing Chromium DBus/GPU and Node deprecation warnings remain
  outside this task.

## Follow-up

- None. Keep the local branch/worktree for any later user-requested integration.

## Commits

- Design checkpoint: `4221724` (`docs(categories): design public navigation contract`).
- Implementation-plan checkpoint: `256cf52` (`docs(categories): plan public navigation implementation`).
- Backend contract checkpoint: `adbf9dd` (`feat(categories): expose public navigation contract`).
- Frontend consumer checkpoint: `2b68aa8` (`feat(categories): connect public navigation pages`).
- Review-fix and API-contract checkpoint: `4ce3947` (`fix(categories): enforce fail-closed navigation`).
- Runtime-acceptance closeout: `3fa24d6` (`docs(categories): record navigation acceptance`).
