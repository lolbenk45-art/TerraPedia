# Front Compact Page Head Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make normal public frontend page headers compact and centrally managed so content-heavy pages no longer spend excessive vertical space on oversized intro blocks.

**Architecture:** Keep existing page templates and semantic `h1` structure. Add a later-loaded shared CSS rule for normal `.page-head` headers, excluding explicitly visual headers such as `.biome-environment-hero`, and update the public-page contract check so future oversized normal headers are caught.

**Tech Stack:** Nuxt 4 frontend in `front-nuxt`, Vue SFC templates, shared CSS in `assets/css/primitives.css`, existing guard script `scripts/check-public-pages.mjs`, browser runtime checks against `http://localhost:5174`.

---

## Scope

In scope:
- Normal public page headers using `.page-head` and `.page-head-inner`, including `/articles`, `/items`, `/search`, `/categories`, `/npcs`, `/bosses`, `/buffs`, `/armor-sets`, `/projectiles`, and user-area pages.
- Keep page title semantics and existing primary action links.
- Reduce vertical footprint and visual card weight via a shared CSS rule.
- Add guard markers to `check-public-pages.mjs`.
- Browser-check representative pages in light/dark themes if possible, and at least desktop runtime layout.

Out of scope:
- Homepage `/`.
- Design/prototype pages such as `/home-hero-options` and `/user/*-designs`.
- Special visual header `.biome-environment-hero`.
- Rewriting every page to a new component in this pass.
- Fixing the existing unrelated `CraftingTargetBar.vue searchUnavailable` public-page check blocker.

## Files

- Modify: `front-nuxt/assets/css/primitives.css`
  - Owns the new shared compact normal page-header rules because it loads after `assets/css/hifi-preview.css`.
- Modify: `front-nuxt/scripts/check-public-pages.mjs`
  - Adds contract markers proving compact page-header governance exists and excludes `.biome-environment-hero`.
- No template edits expected unless review finds a page missing semantic structure.

## Acceptance Criteria

- Normal `.page-head` headers no longer render as oversized intro cards.
- `.page-head:not(.biome-environment-hero)` uses the same public page shell width as normal page bodies.
- `.page-head-inner` is compact: no 24px+ panel padding, no oversized rounded card, no large hero-like `h1`.
- Heading and paragraph rules use override-capable selectors, not low-specificity `:where()` wrappers that can lose to legacy `.page-head h1/h2/p` rules.
- Existing action links such as `/articles` “写文章” and `/search` “进入物品” remain visible.
- `.biome-environment-hero` remains visually distinct and is not collapsed by the generic rule.
- `pnpm exec nuxt typecheck` passes.
- Browser runtime measurement confirms normal index, entity, user, redirect, and mobile cases have compact header computed styles and no horizontal overflow.

---

## Task 1: Add Contract For Compact Normal Page Headers

**Files:**
- Modify: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] **Step 1: Add compact header markers to the existing `assets/css/primitives.css` scan block**

Add these required markers to the `if (path === 'assets/css/primitives.css')` marker list:

```js
'.page-head:not(.biome-environment-hero)',
'.page-head:not(.biome-environment-hero) .page-head-inner',
'min-height: 0',
'display: grid',
'border: 1px solid var(--tp-color-border)',
'border-radius: var(--tp-radius-panel)',
'box-shadow: none',
'.page-head:not(.biome-environment-hero) h1',
'.page-head:not(.biome-environment-hero) h2',
'.page-head:not(.biome-environment-hero) p',
'color: var(--tp-color-text-muted)',
'@media (max-width: 720px)',
```

- [ ] **Step 2: Run the focused contract check and verify it fails before CSS implementation**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
```

Expected:
- It may still include the existing unrelated failure:
  `components/crafting/CraftingTargetBar.vue: missing public data layer marker searchUnavailable`
- It must also include missing compact header marker failures for `assets/css/primitives.css`.

## Task 2: Implement Shared Compact Page Header CSS

**Files:**
- Modify: `front-nuxt/assets/css/primitives.css`

- [ ] **Step 1: Add the shared compact header block after the public page shell block**

Add:

```css
.page-head:not(.biome-environment-hero) {
  box-sizing: border-box;
  width: min(calc(100% - var(--tp-container-gutter) - var(--tp-container-gutter)), var(--tp-container-wide));
  min-height: 0;
  margin-inline: auto;
  border-bottom: 0;
  background: transparent;
  padding: var(--tp-space-4) 0 var(--tp-space-3);
}

.page-head:not(.biome-environment-hero) .page-head-inner {
  box-sizing: border-box;
  display: grid;
  width: 100%;
  max-width: none;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--tp-space-3);
  align-items: center;
  border: 1px solid var(--tp-color-border);
  border-radius: var(--tp-radius-panel);
  background: var(--tp-color-surface-soft);
  box-shadow: none;
  padding: var(--tp-space-2) var(--tp-space-4);
}

.page-head:not(.biome-environment-hero) .page-head-inner > * {
  min-width: 0;
}

.page-head:not(.biome-environment-hero) .page-head-inner > :where(a, button, .primary-button, .secondary-button) {
  justify-self: end;
  max-width: 100%;
}

.page-head:not(.biome-environment-hero) h1,
.page-head:not(.biome-environment-hero) h2 {
  margin: var(--tp-space-1) 0 0;
  color: var(--tp-color-text-strong);
  font-family: var(--tp-font-display);
  font-size: var(--tp-font-size-title-sm);
  font-weight: var(--tp-font-weight-heavy);
  line-height: var(--tp-line-height-heading);
  letter-spacing: 0;
}

.page-head:not(.biome-environment-hero) p {
  max-width: 72ch;
  margin: var(--tp-space-2) 0 0;
  color: var(--tp-color-text-muted);
  font-size: var(--tp-font-size-body-sm);
  line-height: var(--tp-line-height-body);
  text-overflow: ellipsis;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
```

- [ ] **Step 2: Add a mobile override that keeps the compact header readable**

Add:

```css
@media (max-width: 720px) {
  .page-head:not(.biome-environment-hero) {
    padding-block: var(--tp-space-3) var(--tp-space-2);
  }

  .page-head:not(.biome-environment-hero) .page-head-inner {
    grid-template-columns: 1fr;
    padding: var(--tp-space-3);
  }

  .page-head:not(.biome-environment-hero) .page-head-inner > :where(a, button, .primary-button, .secondary-button) {
    justify-self: start;
    width: fit-content;
  }
}
```

- [ ] **Step 3: Re-run the focused contract check**

Run:

```bash
cd front-nuxt
pnpm run check:public-pages
```

Expected:
- No missing compact header marker failures.
- The pre-existing `CraftingTargetBar.vue searchUnavailable` failure may remain.

## Task 3: Browser Runtime Validation

**Files:**
- No production files expected.

- [ ] **Step 1: Confirm the local stack is running**

Run:

```bash
ss -ltnp | rg ':(5174|18088)\b'
```

Expected:
- Frontend listens on `5174`.
- Backend listens on `18088`.

- [ ] **Step 2: Measure normal header dimensions**

Use headless Chromium DevTools or an equivalent local browser script to measure these routes:

```txt
/articles
/items
/search
/categories
/npcs
/bosses
/buffs
/armor-sets
/projectiles
/user
/users/1
/user/articles
/user/favorites
/user/settings
/user/notifications
/user/routes
```

For each page, collect:
- `.page-head:not(.biome-environment-hero)` exists when the page uses a normal header.
- `.page-head` width equals the public shell width.
- Desktop viewport `1440x900`: `.page-head-inner` height is materially lower than the old large header; target desktop height should stay under about `128px` for normal pages with short copy.
- Desktop viewport `1440x900`: computed `h1` font size is below the old `36px` on `/articles`, `/items`, and one `.entity-head` page.
- Desktop viewport `1440x900`: computed `.page-head-inner` top/bottom padding is below `24px`, border radius is not the old `24px`, and `box-shadow` is `none`.
- Mobile viewport `390x844`: `.page-head-inner` is one column, action links remain visible, and wrapped text does not create horizontal overflow.
- `padding-left` and `padding-right` do not reintroduce `42px` page-shell drift.
- `document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1`.

For auth-required user routes, do not count a logged-out redirect as coverage for the target page. Record redirected pages separately as guest/login layout checks unless a valid authenticated session is seeded before measurement.

- [ ] **Step 3: Verify the biome hero exception**

Measure:

```txt
/biomes
```

Expected:
- `.biome-environment-hero` remains present.
- It is not governed by `.page-head:not(.biome-environment-hero)`.
- It keeps its existing visual hero structure.

## Task 4: Final Verification And Commit

**Files:**
- No additional production files expected.

- [ ] **Step 1: Run typecheck**

Run:

```bash
cd front-nuxt
pnpm exec nuxt typecheck
```

Expected:
- Exit code `0`.
- Existing Node `DEP0205` warning is acceptable.

- [ ] **Step 2: Run whitespace and staged-scope checks**

Run:

```bash
git diff --check
git status --short
git diff --cached --stat
```

Expected:
- No whitespace errors.
- Only planned files are changed/staged.

- [ ] **Step 3: Commit**

Run:

```bash
git add front-nuxt/assets/css/primitives.css front-nuxt/scripts/check-public-pages.mjs
git commit -m "fix(front): compact public page headers"
```

Expected:
- One focused commit.

---

## Review Notes

- This pass intentionally avoids creating a new component because the immediate issue is a shared visual rule, not missing component behavior.
- If later work needs per-page header modes, introduce a `PublicPageHeader` component after this compact CSS rule has stabilized.
- The plan should be revised if review finds a normal page whose `.page-head` is intentionally visual and should be added to the exception list.
