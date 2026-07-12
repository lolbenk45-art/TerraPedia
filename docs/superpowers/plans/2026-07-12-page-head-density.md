# Page Head Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved thin desktop header and mobile command header for item and NPC catalogs.

**Architecture:** Keep `page-head-inner` as the responsive layout primitive. Change its ordinary visual treatment in `primitives.css`, then opt item and NPC templates into a mobile-only command modifier. The frontend contract scripts prove selector and template coverage before runtime browser evidence.

**Tech Stack:** Nuxt 4, Vue SFC templates, CSS, Node contract scripts, Playwright browser screenshots.

---

### Task 1: Define the failing visual contract

**Files:**
- Modify: `front-nuxt/scripts/check-visual-system-contract.mjs`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`

- [x] **Step 1: Add failing marker assertions**

Require all of the following strings before implementation:

```js
'border: 0',
'background: transparent',
'.page-head--command:not(.biome-environment-hero)',
'.page-head--command .page-head-inner > div',
'.page-head--command .page-head-inner p',
'page-head--command'
```

Require `page-head--command` in both `pages/items/index.vue` and `pages/npcs/index.vue`.

- [x] **Step 2: Run the focused RED checks**

Run:

```bash
cd front-nuxt
node scripts/check-visual-system-contract.mjs
node scripts/check-public-pages.mjs
```

Expected: failure because the command modifier and transparent header-shell contract do not yet exist.

### Task 2: Implement the responsive header treatment

**Files:**
- Modify: `front-nuxt/assets/css/primitives.css`
- Modify: `front-nuxt/pages/items/index.vue`
- Modify: `front-nuxt/pages/npcs/index.vue`

- [x] **Step 1: Add the two opt-in template classes**

Change each catalog heading from:

```vue
<div class="page-head">
```

or:

```vue
<div class="page-head entity-head">
```

to a class list containing `page-head--command` while preserving existing page classes.

- [x] **Step 2: Make ordinary headers thin**

In `primitives.css`, preserve the desktop grid but reduce outer spacing and set the normal inner shell to transparent with no border, radius, or padding. Keep title, paragraph, and CTA selectors unchanged.

- [x] **Step 3: Add mobile command-mode CSS**

Within the existing 720px media query, make `.page-head--command` keep a two-column layout, render its copy container as a title/meta row, hide the paragraph, and retain a 44px CTA target. Do not target `.biome-environment-hero`.

- [x] **Step 4: Run the focused GREEN checks**

Run:

```bash
cd front-nuxt
node scripts/check-visual-system-contract.mjs
node scripts/check-public-pages.mjs
```

Expected: both commands exit 0.

### Task 3: Verify the rendered contract

**Files:**
- No production file changes expected.
- Generated evidence: `reports/page-head-inner-design-previews/`

- [x] **Step 1: Capture item and NPC at desktop and mobile sizes**

Use the running frontend at port `15179` and Playwright to capture `/items` and `/npcs` at `1440x900` and `390x844`.

- [x] **Step 2: Inspect the screenshots**

Confirm desktop keeps contextual copy and right-aligned CTA, mobile command mode keeps title/count/action in one row, and item/NPC content begins materially higher than the prior card layout.

- [x] **Step 3: Run the shared frontend gate**

Run:

```bash
cd front-nuxt
pnpm run check
```

Expected: exit 0. Record any environment-only browser warnings separately from test failures.

### Task 4: Update handoff state

**Files:**
- Modify: `docs/devlog/entries/2026-07-12-page-head-density.md`
- Modify: `docs/devlog/current.md`

- [x] **Step 1: Record result and validation evidence**

Record affected frontend paths, focused checks, browser screenshot verification, full frontend check, and any remaining route-expansion risk.

- [x] **Step 2: Leave the task ready for commit**

Set the entry to `ready-for-commit` unless the user explicitly requests a commit in the same turn.
