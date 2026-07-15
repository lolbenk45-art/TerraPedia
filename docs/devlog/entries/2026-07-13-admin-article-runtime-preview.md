# Devlog: admin-article-runtime-preview

## Status

`closed`

## Context

- User goal: make the admin review workspace and editor preview render draft and pending rich article content with public-article-equivalent image, content-reference, and recipe-tree runtime behavior.
- Branch: `review/front-nuxt-visual`
- Worktree: `/home/lolben/TerraPedia`
- Base: `aca2de1`
- Related docs: `docs/superpowers/specs/2026-07-13-admin-article-runtime-preview-design.md`, `docs/superpowers/plans/2026-07-13-admin-article-runtime-preview.md`
- Related prior entries: `docs/devlog/entries/2026-07-12-article-embedded-recipe-tree-light.md` is closed; its renderer is the source contract, not this task's commit scope.

## Direction / Decisions

- Chosen approach: extract the framework-neutral recipe graph model/renderer/root-scoped styles into `shared/article-runtime/`, then create one admin runtime-preview component used by review and editor hosts.
- Reasoning: public-page iframe cannot render unpublished content; host-local `v-html` loses required runtime enhancement; a shared graph core prevents future renderer drift.
- Rejected options: iframe public article; duplicate renderer/CSS in the two admin hosts; a broad shared package migration outside the repository source tree.

## Scope

- Frontend: shared recipe runtime, admin article preview component, review workspace, editor workspace, article editor composable/reference picker, article sanitizer, tests, and compatibility exports/imports needed for the existing public renderer.
- Backend: none; existing admin item-tree and public content-reference read endpoints are consumed only.
- Data: none.
- Docs/process: this entry, `docs/devlog/current.md`, design spec, implementation plan, and closeout evidence.
- Out of scope: review/publish/save behavior, API changes, public article visual redesign, and the existing uncommitted `front-nuxt/components/user/UserArticleRichEditor.vue` hydration fix.

## Validation

- Commands run: initial `git diff --check`; a disposable cross-project import spike followed by `cd front-nuxt && pnpm run check` and `cd data-query-app && pnpm run check`; shared-renderer RED contracts followed by focused and full front checks; local public-page Playwright acceptance at 1440px using system Chromium; after admin integration, `cd data-query-app && pnpm run test:unit`, `pnpm run check`, and `pnpm run build`; and a fresh `cd front-nuxt && pnpm run check`.
- Results: source inspection confirmed both admin hosts previously used sanitizer output followed by plain `v-html`; the runtime component now owns image normalization, item/NPC/boss reference resolution, recipe-tree hydration, local tree failures, bounded deduplicated tree requests, and state preservation across editor preview-tab changes. The final admin unit suite passes 254/254, including RED→GREEN contracts for sanitizer tree canonicalization, no-DOM SSR output, the backend `refs`/`label`/`name` reference contract, themed keyboard popovers, and the three-slot queue. Admin typecheck and production build complete; the generated `.output/server/index.mjs` artifact exists. The fresh full public check passes. Independent review found and the implementation fixed the request DTO field mismatch, response label mismatch, untrusted SSR fallback, and omitted runtime embed-type validation.
- Authenticated acceptance: logged in with the configured local administrator and opened pending article `#54` at `http://127.0.0.1:13004/article-editor/54`. Its fixture contains a cover, four item references, four body images, and one depth-5 tree. Chromium at `1440px` recorded one runtime preview, one shared graph with 10 nodes, four enhanced reference controls, no `/preview-assets/` preview-image URLs, no failed trees, visible preview, graph Enter→body portal and Escape→closed behavior, and a non-navigating reference popover containing the resolved item label. Screenshot: `/tmp/admin-article-runtime-preview-54.png` (ephemeral local evidence). The fixture lacks NPC/boss references and multiple variants, so those two runtime shapes retain unit/contract evidence rather than browser fixture evidence.

## Result

- Completed: written design approved in chat; task scope, commit boundary, and acceptance contract recorded. A subsequent source audit confirmed the existing renderer/class, entity-route, editor-lifecycle, and boss-endpoint facts used by the design, and revised the spec for the public `1–5` embed-depth contract, body-portaled popover theme scope, explicit three-request tree queue, and a concrete Node + happy-dom behavioral-test harness. The user selected two focused commits and non-navigating content-reference popovers. The disposable cross-project alias spike passed in both full Nuxt checks and was removed. The shared neutral renderer/CSS, public compatibility adapter, direct public portal theme, keyboard controls, and permanent aliases are committed at `1af4549`. The second scope adds `AdminArticleRuntimePreview` to both admin hosts, canonical sanitizer support for tree embeds and boss references, a boss picker, and the runnable DOM contract suite. See git for code-level diff details.
- Not completed: none in the implemented scope.

## Residual Risks

- The cross-project import boundary passed a disposable typecheck spike with a direct `#article-runtime` alias in both apps and no `server.fs.allow` exception. Production code retains that alias in shared-renderer commit `1af4549`; public visual acceptance passed, but the admin host still needs its own behavioral and authenticated acceptance.
- This task edits renderer/CSS that `/articles/*` and the public rich editor already ship today (replacing the hardcoded `crafting-screen` class and adding tabindex/keyboard handling). Typecheck/build passing is not sufficient evidence the public side is visually unchanged — validate against a running `/articles/*` page, matching the bar this same renderer was held to by `2026-07-12-article-recipe-preview-parity-design.md` and `2026-07-13-article-recipe-tree-pc-wide-layout-design.md`.
- The local browser fixture covers only item references and one selected tree variant; a later content-fixture task should add NPC, boss, and multiple-variant embeds for browser-level acceptance without modifying production article data in this task.
- Preserving an already-open body-portaled graph popover through a `modelValue` refresh is not covered by the current identity-preservation path; graph selection, zoom, pan, and fetched tree state are preserved, while refresh closes the body portal. Treat this as a follow-up accessibility polish rather than a data/runtime correctness blocker.

## Follow-up

- Owner: Codex.
- Sequencing: after commit, a later fixture-focused task may add a non-production acceptance article spanning item/NPC/boss references and multiple tree variants. Do not modify existing article data solely to manufacture that evidence.
- User decision recorded: use two focused commits — shared runtime first, then admin integration — rather than one mixed commit.
- User decision recorded: content references use accessible non-navigating information popovers in this task; no filtered-list fallback href is emitted.

## Commits

- `1af4549` `refactor(article-runtime): share recipe graph renderer`
- Admin integration: commit SHA pending in final response.
