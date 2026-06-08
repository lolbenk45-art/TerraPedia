# Front Typography Theme Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit and repair TerraPedia frontend typography readability and card/table spacing across dark, morning-paper, and warm-slate themes.

**Architecture:** Keep the fix centralized: semantic typography/spacing tokens live in `tokens.css`, reusable primitive rules live in `primitives.css`, and page-specific article table styles consume those tokens instead of hard-coded cramped values. Theme contrast adjustments stay in `hifi-preview.css` and `light-theme-contrast-fixes.css`, where the existing visual system already defines theme behavior.

**Tech Stack:** Nuxt 4, Vue SFC scoped CSS, CSS custom properties, Chromium DevTools audit scripts.

---

## Findings

- Home focus widgets: light themes still use weak secondary text (`--text-subtle` / `--text-faint`) in focus/metric rows, which makes labels like `当前焦点` and item names feel washed out on paper backgrounds.
- User article queue: `front-nuxt/pages/user/articles/index.vue` uses hard-coded `10px` row padding, `12px` table text, and `--text-faint` for headers/status metadata. This causes the `Submission Queue / 投稿列表` table to look cramped and close to panel edges.
- Global primitives: `tokens.css` has page/container primitives but does not yet expose reusable data-panel/data-table tokens for table padding, row gaps, weak text, and minimum readable metadata size.
- Existing audit coverage: `scripts/check-light-theme-typography.mjs` checks contrast across public/user routes, but it does not check table/card inset or row padding stability.

## Implementation Tasks

### Task 1: Add Shared Readability And Data-Table Tokens

**Files:**
- Modify: `front-nuxt/assets/css/tokens.css`

- [x] **Step 1: Add semantic readable text aliases**

Add tokens for readable muted/subtle/faint text so components do not directly depend on raw theme opacity names.

- [x] **Step 2: Add shared panel/table spacing tokens**

Add `--tp-data-panel-padding`, `--tp-data-row-padding-*`, `--tp-data-table-head-padding-*`, `--tp-data-meta-font-size`, and related gap/min-height tokens.

### Task 2: Strengthen Light Theme Weak Text

**Files:**
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/assets/css/light-theme-contrast-fixes.css`

- [x] **Step 1: Raise morning-paper `--text-subtle` and `--text-faint`**

Morning-paper currently defines `--text-faint` at `rgba(26, 31, 24, 0.46)`, which is visibly too pale for small labels. Raise it to the shared readable floor.

- [x] **Step 2: Ensure focus/index labels use readable muted text**

Add/adjust light theme selectors for `.index-focus`, `.index-metrics`, `.index-row`, and generic weak labels to use `--tp-readable-muted` or `--tp-readable-subtle` instead of raw faint text.

### Task 3: Add Reusable Data Surface Primitives

**Files:**
- Modify: `front-nuxt/assets/css/primitives.css`

- [x] **Step 1: Add generic data panel/table classes**

Create `.tp-data-panel`, `.tp-data-table`, `.tp-data-table-row`, `.tp-data-table-head`, `.tp-data-meta`, and `.tp-readable-muted/subtle/faint` primitives.

- [x] **Step 2: Add mobile spacing rules**

Keep table/card content inset stable on mobile and raise metadata text to at least the mobile readable floor.

### Task 4: Convert User Article Queue To Shared Tokens

**Files:**
- Modify: `front-nuxt/pages/user/articles/index.vue`

- [x] **Step 1: Attach data primitive classes**

Use `tp-data-panel`, `tp-data-table`, `tp-data-table-head`, `tp-data-table-row`, and `tp-data-meta` alongside existing classes.

- [x] **Step 2: Replace hard-coded cramped values**

Replace the page-local table gaps, row padding, header padding, weak text colors, and small metadata sizes with token-backed values.

### Task 5: Add Runtime Spacing Audit

**Files:**
- Create: `front-nuxt/scripts/check-typography-spacing.mjs`
- Modify: `front-nuxt/package.json`

- [x] **Step 1: Audit route/theme table and card inset**

Use Chromium DevTools against `/`, `/articles`, `/items`, `/user`, `/user/articles`, `/user/favorites`, `/user/notifications`, and `/user/settings` across `dark`, `morning-paper`, and `warm-slate`.

- [x] **Step 2: Fail on common regressions**

Fail if visible panel/table row text is too close to its container edge, if metadata text is below the readable floor, or if a page produces horizontal overflow at desktop/mobile widths.

## Validation

- Run `TERRAPEDIA_FRONT_NUXT_URL=http://localhost:5174 pnpm --dir front-nuxt run check:light-theme`.
- Run `TERRAPEDIA_FRONT_NUXT_URL=http://localhost:5174 pnpm --dir front-nuxt run check:typography-spacing`.
- Run `pnpm --dir front-nuxt exec nuxt typecheck`.
- Inspect `/`, `/articles`, and `/user/articles` in `dark`, `morning-paper`, and `warm-slate`.

## Acceptance Criteria

- Text like `当前焦点`, focus item metadata, table headers, row metadata, chips, and secondary labels remain readable in all three themes.
- Data/list panels have stable inset spacing; row text is not visually glued to the card or table edge.
- User article queue no longer owns arbitrary typography/spacing constants that should be globally managed.
- Desktop and mobile audited routes do not introduce horizontal overflow.
