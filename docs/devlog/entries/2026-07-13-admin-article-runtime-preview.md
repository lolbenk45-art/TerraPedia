# Devlog: admin-article-runtime-preview

## Status

`active`

## Context

- User goal: make the admin review workspace and editor preview render draft and pending rich article content with public-article-equivalent image, content-reference, and recipe-tree runtime behavior.
- Branch: `review/front-nuxt-visual`
- Worktree: `/home/lolben/TerraPedia`
- Base: `aca2de1`
- Related docs: `docs/superpowers/specs/2026-07-13-admin-article-runtime-preview-design.md`
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

- Commands run: initial `git diff --check` passed; local admin server responded with its expected login redirect, public frontend responded `200`, and the backend port responded although `/actuator/health` is not exposed.
- Results: source inspection confirmed both admin hosts currently use sanitizer output followed by plain `v-html`; the public article adds image handling, content-reference resolution, and recipe-tree hydration afterwards.
- Not run: focused RED contract, admin build/test, public frontend check after shared-runtime extraction, and authenticated review-page acceptance.

## Result

- Completed: written design approved in chat; task scope, commit boundary, and acceptance contract recorded. A subsequent source audit confirmed the existing renderer/class, entity-route, editor-lifecycle, and boss-endpoint facts used by the design, and revised the spec for the public `1–5` embed-depth contract, body-portaled popover theme scope, explicit three-request tree queue, and a concrete Node + happy-dom behavioral-test harness. The current documents enumerate nine prior review topics, but no independent review artifact records their round count; treat the source-audited rules in the current spec as authority.
- Not completed: the import-boundary spike, dependency/test-harness addition, implementation, and RED→GREEN validation.

## Residual Risks

- The cross-project import boundary is unverified: neither `data-query-app` nor `front-nuxt` has a workspace file, root `package.json`, or `nuxt.config.ts` alias/extends today, so nothing currently lets either app import from a new `shared/` directory. The spec's "Cross-project import boundary" section requires a throwaway spike (trivial exported constant, alias + tsconfig path in both apps, dev/typecheck/build all resolving it, `server.fs.allow` widened if needed) before any real shared-runtime code is written. If the spike fails or is materially costly, stop and revisit the premise rather than pushing through.
- This task edits renderer/CSS that `/articles/*` and the public rich editor already ship today (replacing the hardcoded `crafting-screen` class and adding tabindex/keyboard handling). Typecheck/build passing is not sufficient evidence the public side is visually unchanged — validate against a running `/articles/*` page, matching the bar this same renderer was held to by `2026-07-12-article-recipe-preview-parity-design.md` and `2026-07-13-article-recipe-tree-pc-wide-layout-design.md`.
- Admin page acceptance needs an authorized local admin session and an article containing the required embed/reference examples.

## Follow-up

- Owner: Codex.
- Sequencing: (1) run the cross-project-import spike first, before writing any real shared-runtime code — if it fails or is unexpectedly costly, stop and revisit the `shared/article-runtime/` premise instead of pushing through; (2) add the specified happy-dom harness and write/run the focused RED contract; (3) implement to GREEN; (4) run the public-article visual check called out in the spec's Test-First Plan before calling the shared-runtime extraction done.
- Open decision, deferred by the user to whoever implements — do not decide silently, surface it back to the user: land this as the single admin-preview commit currently described in "Validation and Commit Boundaries," or stage it as spike (no commit) → shared-runtime extraction (verified against the public site, its own commit) → admin-specific pieces (component, host integration, sanitizer, boss UI, tests). The user's stated reasoning for preferring staged commits, if chosen: easier to isolate where things break given how many independent pieces this now touches.
- Open decision, chosen as a pragmatic default during review but not yet user-approved — confirm before shipping: admin's content-reference detail link resolves to a filtered `/entities/{items|npcs|bosses}?search=` list page instead of a true per-record deep link, because no per-record admin detail route exists today. This is a deliberate reduced-parity substitute for the public site's one-click `/items/:id`-style links, decided as the lowest-scope option during review — the user asked for this to be surfaced as a judgment call for Codex to bring back to them, not treated as settled.

## Commits

- Pending.
