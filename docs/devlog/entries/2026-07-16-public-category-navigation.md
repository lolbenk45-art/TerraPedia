# Devlog: Public Category Navigation

## Status

`active`

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
- Not run: implementation tests and runtime acceptance; implementation has not
  started.

## Result

- Completed: design, implementation plan, backend DTO/service/controller
  contract, fail-closed behavior, and focused backend tests.
- Not completed: frontend consumer, integrated review, and runtime acceptance.

## Residual Risks

- Navigation and item-list count predicates must be tested for equivalence.
- Missing category codes must fail closed without unrelated item fallback.

## Follow-up

- Execute `docs/superpowers/plans/2026-07-16-public-category-navigation.md`
  inline with `executing-plans`, beginning with the backend RED tests.

## Commits

- Design checkpoint: `4221724` (`docs(categories): design public navigation contract`).
- Implementation-plan checkpoint: `256cf52` (`docs(categories): plan public navigation implementation`).
- Backend contract checkpoint pending.
