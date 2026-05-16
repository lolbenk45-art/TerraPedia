# Front Nuxt Hifi Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new `front-nuxt` Nuxt frontend and move the approved HTML high-fidelity preview into it as the initial runnable public site.

**Architecture:** Keep the first pass intentionally static so the visual baseline is preserved exactly. Nuxt owns the shell, routing, head metadata, and assets; later tasks can split the large page into components and wire real public APIs.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, CSS extracted from `docs/design/hifi-preview.html`.

---

### Task 1: Scaffold Nuxt App

**Files:**
- Create: `front-nuxt/package.json`
- Create: `front-nuxt/nuxt.config.ts`
- Create: `front-nuxt/tsconfig.json`
- Create: `front-nuxt/app.vue`
- Create: `front-nuxt/pages/index.vue`
- Create: `front-nuxt/assets/css/hifi-preview.css`

- [x] **Step 1: Create minimal Nuxt package**

Use Nuxt with scripts for `dev`, `build`, `preview`, and `check`.

- [x] **Step 2: Configure port and app metadata**

Run Nuxt on port `5176` so it does not collide with the existing Vite front on `5174`, admin Nuxt on `3001`, or HTML preview on `5175`.

- [x] **Step 3: Extract preview CSS**

Copy the `<style>` block from the approved `hifi-preview.html` into `front-nuxt/assets/css/hifi-preview.css`.

- [x] **Step 4: Convert preview body to Vue template**

Copy the preview shell into `pages/index.vue`, remove the side preview navigation, and keep the home page as the actual first screen.

- [x] **Step 5: Validate**

Run `pnpm install`, `pnpm run check`, `pnpm run build`, and start `pnpm run dev -- --host 0.0.0.0`.

Expected: Nuxt page loads at `http://localhost:5176/`.
