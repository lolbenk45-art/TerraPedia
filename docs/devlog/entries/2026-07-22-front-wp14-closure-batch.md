# Devlog: Front P2 WP-14 focused closure batch

## Status

`closed`

## Context

- Branch: `feat/front-p2-wp14-closure`
- Worktree: `.claude/worktrees/front-p2-wp14-closure`
- Base: `feat/front-p2-wp13-longpages` at `dac2e786`.

## Direction / Decisions

Three focused commits:

1. **A11y** — skip link to `#main-content`, TerraBreadcrumb `NuxtLink`, dense UI
   12px floor (component bumps + domains public-layout mobile rule), polite live
   regions on settings password status.
2. **Data truthfulness** — extend `usePublicLayoutState` with `publishHomeStats`
   while keeping the WP-11.2 `public-layout-item-total-label` string channel;
   footer `14,746` and search-tool quick-entry counts consume overview stats;
   search-tool labeled `对照原型`; numeric `/categories/:id` → slug HTTP 301.
3. **Account** — password change logs out and redirects to `/user/login`;
   TerraNav skips re-init when `authStore.initialized`.

No V55 SQL seed. Full `pnpm run check` green.

## Residual Risks

- Overview has no dedicated recipe-node total; footer "链路节点" uses
  `totalProjectiles` as the closest public counter (documented).
- Category 301 depends on navigation payload including numeric ids.
- `check-home-j1-index` (off main chain) may still mention legacy 14,746 markers.

## Follow-up

- Build local `feat/front-p2-integration` from WP-11.2→WP-14 and serve
  `PORT=5181` for user acceptance.

## Commits

- `3614f7a7` feat(front): add skip link, NuxtLink breadcrumbs, and 12px type floor
- `106f96fa` feat(front): feed footer and search-tool from statistics overview
- `677a2b08` feat(front): redirect password change to login and guard nav auth init
- docs-close: this commit
