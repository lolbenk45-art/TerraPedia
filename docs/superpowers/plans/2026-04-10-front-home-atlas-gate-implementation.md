# Front Home Atlas Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first Atlas Gate redesign batch for `front`, covering shared front-end tokens, navbar, homepage, and footer while preserving the existing homepage data flow.

**Architecture:** Keep the current Vue/Vite structure and data-fetching flow intact, but replace the visual shell with the approved Atlas Gate composition and the Moss Lantern token system. Centralize color and surface changes in shared CSS tokens, then update `Navbar.vue`, `HomePage.vue`, and `AppFooter.vue` to consume the new system and layout language.

**Tech Stack:** Vue 3, Vite, Pinia, Tailwind utility classes, shared CSS tokens in `front/src/assets/main.css`

---

### Task 1: Lock Verification And Minimal Front-End Test Harness

**Files:**
- Modify: `front/package.json`
- Create: `front/vitest.config.ts`
- Create: `front/src/tests/setup.ts`
- Create: `front/src/tests/theme-store.spec.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run the test command to verify failure**
- [ ] **Step 3: Add the minimal unit-test harness and keep scope front-only**
- [ ] **Step 4: Run the unit test again and verify it passes**
- [ ] **Step 5: Keep the harness small and reusable for later front-end batches**

### Task 2: Introduce Moss Lantern Tokens

**Files:**
- Modify: `front/src/assets/main.css`
- Test: `front/src/tests/theme-store.spec.ts`

- [ ] **Step 1: Add/extend a failing assertion for the expected theme class or theme value path if needed**
- [ ] **Step 2: Run the test command to confirm the baseline still fails for the new expectation**
- [ ] **Step 3: Replace the current default front-end token set with the approved Moss Lantern light and dark tokens**
- [ ] **Step 4: Keep existing alternate themes operational unless they directly conflict with the first batch**
- [ ] **Step 5: Add shared utility styles for Atlas Gate surfaces, section framing, focus, and elevation rhythm**
- [ ] **Step 6: Run unit tests and `pnpm run check` to confirm tokens do not break typing/build-time CSS usage**

### Task 3: Redesign Navbar And Footer

**Files:**
- Modify: `front/src/components/Navbar.vue`
- Modify: `front/src/components/AppFooter.vue`
- Modify: `front/src/components/ThemeSwitcher.vue`

- [ ] **Step 1: Add a failing component-level assertion or render expectation for the updated navigation label structure if practical**
- [ ] **Step 2: Run the targeted test to verify failure**
- [ ] **Step 3: Rebuild the navbar shell around Atlas Gate styling: crest, pill navigation, stronger active state, better mobile drawer presentation**
- [ ] **Step 4: Update the theme switcher visuals so it matches the new token system and does not look detached**
- [ ] **Step 5: Rebuild the footer into the calmer “camp exit” treatment from the approved design**
- [ ] **Step 6: Run relevant tests, `pnpm run check`, and a full front-end build**

### Task 4: Rebuild Homepage Hero And Section Language

**Files:**
- Modify: `front/src/views/HomePage.vue`
- Modify: `front/src/assets/main.css`

- [ ] **Step 1: Add a failing render-level test or deterministic assertion for at least one Atlas Gate homepage marker**
- [ ] **Step 2: Run the test to verify failure**
- [ ] **Step 3: Replace the centered landing hero with the approved dual-column Atlas Gate hero while preserving existing search, quick tags, and item data flow**
- [ ] **Step 4: Replace emoji-driven feature/category presentation with a unified vector or glyph-based visual language already available in the codebase**
- [ ] **Step 5: Restyle the stats, feature, category, and footer-adjacent sections to use the shared Atlas Gate system**
- [ ] **Step 6: Keep mobile behavior coherent by stacking the hero and reducing decorative density**
- [ ] **Step 7: Run the targeted tests, `pnpm run check`, and a full front-end build**

### Task 5: Final Front-End Validation

**Files:**
- Verify only: `front/package.json`, `front/src/assets/main.css`, `front/src/components/Navbar.vue`, `front/src/components/AppFooter.vue`, `front/src/components/ThemeSwitcher.vue`, `front/src/views/HomePage.vue`, test files

- [ ] **Step 1: Run the full unit-test command fresh**
- [ ] **Step 2: Run `pnpm run check` fresh**
- [ ] **Step 3: Run `pnpm run build` fresh**
- [ ] **Step 4: Review the changed file set and make sure batch 1 did not bleed into list/detail pages**
- [ ] **Step 5: Summarize residual risks for later list/detail redesign batches**

