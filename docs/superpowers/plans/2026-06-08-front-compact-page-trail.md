# Front Compact Page Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public frontend full-width breadcrumb bar with a centralized compact page-trail strategy.

**Architecture:** Keep `TerraBreadcrumb` as the shared entrypoint so page templates do not need a broad migration. The component decides whether the current route should render no visible trail or a compact inline trail. CSS moves from old `.breadcrumb-*` full bar selectors to `.page-trail-*` inline selectors, and frontend contracts are updated to enforce the compact trail instead of the old shell.

**Tech Stack:** Nuxt 4, Vue SFC, CSS design tokens, Node contract scripts.

---

### Task 1: Shared Trail Component

**Files:**
- Modify: `front-nuxt/components/TerraBreadcrumb.vue`

- [ ] Add optional compact-trail props: `items`, `mode`, `backHref`, `backLabel`, and `ariaLabel`.
- [ ] Keep route-derived crumbs and the unfinished-account route no-link guard.
- [ ] Add a centralized hidden-route list for index/list/top-level/auth utility pages.
- [ ] Render nothing for hidden routes.
- [ ] Render compact `.page-trail-*` markup with stable `data-page-trail-role` markers for deep routes.

### Task 2: Compact Trail CSS

**Files:**
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/assets/css/mobile-typography-fixes.css`
- Modify: `front-nuxt/assets/css/domains/crafting.css`
- Modify: `front-nuxt/assets/css/light-theme-contrast-fixes.css`

- [ ] Replace old `.breadcrumb-shell`, `.breadcrumb-list`, `.breadcrumb-link`, and `.breadcrumb-current` full-bar rules with compact `.page-trail-*` rules.
- [ ] Keep the compact trail inline, low-height, theme-aware, and wrapping-safe.
- [ ] Remove crafting-specific full-bar sibling selectors and keep only compact trail color integration.
- [ ] Remove stale mobile padding rules for the full-width shell.

### Task 3: Contract Updates

**Files:**
- Modify: `front-nuxt/scripts/check-public-pages.mjs`
- Modify: `front-nuxt/scripts/check-front-layout-layering-contract.mjs`
- Modify: `front-nuxt/scripts/check-crafting-structure-contract.mjs`

- [ ] Keep the shared component existence and page invocation contract.
- [ ] Replace old `.breadcrumb-shell` CSS requirements with compact `.page-trail` requirements.
- [ ] Require stable data-role markers in the component.
- [ ] Forbid the old full-width breadcrumb shell contract from returning.
- [ ] Update crafting and design-route checks to expect the compact trail contract.

### Task 4: Validation

**Commands:**
- `pnpm --dir front-nuxt run check:public-pages`
- `pnpm --dir front-nuxt run check:front-layout-layering`
- `pnpm --dir front-nuxt run check:crafting-structure`
- `pnpm --dir front-nuxt run check:nav-layout`
- `pnpm --dir front-nuxt run check:visual-system`
- `pnpm --dir front-nuxt exec nuxt typecheck`

- [ ] Run `check:public-pages` explicitly because it is not part of aggregate `pnpm run check`.
- [ ] Run targeted contract checks and typecheck before commit.
- [ ] Inspect git diff scope before staging.
