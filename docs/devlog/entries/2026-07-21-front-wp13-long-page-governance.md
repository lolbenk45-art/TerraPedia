# Devlog: Front P2 WP-13 long-page governance

## Status

`closed`

## Context

- Branch: `feat/front-p2-wp13-longpages`
- Worktree: `.claude/worktrees/front-p2-wp13-longpages`
- Base: `feat/front-p2-wp12-breakpoints` at `d48481c8`.
- Spec / plan: remaining-design WP-13; `docs/superpowers/plans/2026-07-21-front-wp13-long-page-governance.md`.

## Direction / Decisions

- Baseline mobile `/biomes` height **25350px** / 47 tiles → content-cost budget
  **10 items/page** (page1 also hosts 3 featured cards; measured after: all pages
  under 9000px — p1 7304, p2 5754, p3 7380, p4 6760).
- Pack parent groups; split oversized groups with continuation labels.
- `?page=N` via `useCatalogRouteSync`; search/group resets to page 1; clamp OOR.
- Biome detail source groups → `<details>` first open.
- Crafting graph: CSS-hide level>1 on mobile until "展开更深层配方".
- Footer: mobile-collapsed panels + aria-expanded toggle; desktop `display:contents`.

## Validation

- Packer unit probe + long-page source contract green.
- `pnpm run check` green (incl. new `check:biome-pagination`).
- Runtime heights on candidate 15188 recorded above.

## Result

- Biome index paginated; detail disclosures; crafting deep collapse; footer
  mobile collapse shipped.

## Residual Risks

- Height contract is evidence-based not automated runtime gate (env-heavy).
- Featured strip only on page1 default browse; filtered views list all page
  segments without featured.
- Footer `14,746` hardcode remains for WP-14 data-truthfulness.

## Follow-up

- WP-14 focused closure batch next.
- Integrate WP-11.2..WP-13 into `feat/front-p2-integration`.

## Commits

- plan + implementation + docs-close SHAs at close
