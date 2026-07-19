# Admin Acceptance Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Git-authoritative login design and add a non-destructive public-effect preview to the admin article editor.

**Architecture:** The login fix restores only the historical scoped CSS while preserving current behavior and SVG icon markup. The article fix adds a view-mode boundary around the existing editable DOM and reuses `AdminArticleRuntimePreview`; only the editable DOM remains serializable.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, node:test, shared article runtime renderer

---

### Task 1: Lock Git-authoritative login styling

**Files:**
- Modify: `data-query-app/tests/admin-layout-layering-contract.test.mjs`
- Modify: `data-query-app/pages/login.vue`

- [x] Add a test that requires the exact pre-`3a1d178` login background, card, logo, input, and submit styles and rejects the later tokenized deep gradient.
- [x] Run `node --test tests/admin-layout-layering-contract.test.mjs` and confirm the new test fails against current `HEAD`.
- [x] Replace only the scoped style block with `git show 3a1d178^:data-query-app/pages/login.vue` while keeping current template/script content.
- [x] Rerun the focused test and confirm it passes.

### Task 2: Add editor/public-effect view switch

**Files:**
- Modify: `data-query-app/tests/admin-articles-page-contract.test.mjs`
- Modify: `data-query-app/components/article/ArticleEditorWorkspace.vue`

- [x] Add a contract requiring `编辑` / `前台效果` controls, `AdminArticleRuntimePreview`, and `editor.previewHtml`, while proving the editable `rich-editor` remains the save surface.
- [x] Run `node --test tests/admin-articles-page-contract.test.mjs` and confirm the new test fails because the switch is absent.
- [x] Add local `viewMode`, keep the editable DOM mounted only for `edit`, and render `AdminArticleRuntimePreview` for `preview` using `editor.previewHtml`.
- [x] Rerun the focused article contract and confirm it passes.

### Task 3: Validate and hand off

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-18-admin-p1-p2-batch.md`

- [x] Run both focused contracts and `pnpm run check` from `data-query-app/`.
- [x] Run browser checks for restored login visuals and article `31` preview rendering without mutating stored HTML.
- [x] Update devlog with acceptance findings, root cause, validation, and user re-acceptance URLs.
- [x] Run `git diff --check`, stage explicit files, and checkpoint with `fix(admin): address acceptance findings`; report the resulting SHA in the final response.
- [x] Verify the existing three service processes expose the new frontend code, restarting only if hot reload is insufficient.
