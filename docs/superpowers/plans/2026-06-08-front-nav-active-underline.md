# Front Nav Lightweight Header States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace heavy light-theme header highlight blocks with lightweight active and unread states.

**Architecture:** Keep `components/TerraNav.vue` unchanged. Protect behavior through `front-nuxt/scripts/check-nav-layout-contract.mjs`, update `front-nuxt/assets/css/hifi-preview.css` for primary nav active styling, and update `front-nuxt/assets/css/light-theme-contrast-fixes.css` for unread notification light-theme tokens.

**Tech Stack:** Nuxt 4, Vue 3, CSS contract scripts, pnpm.

---

### Task 1: Contract Check

**Files:**
- Modify: `front-nuxt/scripts/check-nav-layout-contract.mjs`

- [ ] Add assertions that `.site-link.active::after` exists and the light-theme `.site-link.active` rule does not use `background: var(--theme-active-bg);`.
- [ ] Run `pnpm --dir front-nuxt run check:nav-layout`.
- [ ] Confirm it fails before CSS implementation.

### Task 2: CSS Implementation

**Files:**
- Modify: `front-nuxt/assets/css/hifi-preview.css`
- Modify: `front-nuxt/assets/css/light-theme-contrast-fixes.css`

- [ ] Add relative positioning and underline pseudo-element support to `.site-link`.
- [ ] Change active state to stronger text color with transparent background.
- [ ] Change hover state to a light translucent wash.
- [ ] Override light-theme active state so it keeps the underline model.
- [ ] Reduce `--nav-unread-bg`, `--nav-unread-border`, and `--nav-unread-shadow` in light/paper and warm slate themes so unread notification buttons no longer read as filled blocks.
- [ ] Preserve the stronger unread count badge tokens.

### Task 3: Verification

- [ ] Run `pnpm --dir front-nuxt run check:nav-layout`.
- [ ] Run `pnpm --dir front-nuxt run check:visual-system`.
- [ ] Run `pnpm --dir front-nuxt exec nuxt typecheck`.
- [ ] Run `git diff --check`.
