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

- Completed: written design approved in chat; task scope, commit boundary, and acceptance contract recorded.
- Not completed: implementation and RED→GREEN validation.

## Residual Risks

- Both Nuxt apps must resolve the root shared source and CSS consistently; typecheck/build prove the alias boundary before the task can be ready for commit.
- Admin page acceptance needs an authorized local admin session and an article containing the required embed/reference examples.

## Follow-up

- Owner: Codex. Write and run the focused RED contract before implementation.

## Commits

- Pending.
