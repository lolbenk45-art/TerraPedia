# Devlog: user-article-editor-hydration

## Status

`closed`

## Context

- User goal: prevent ordinary rich-editor model synchronization from needlessly rehydrating embedded recipe trees.
- Branch: `review/front-nuxt-visual`
- Worktree: `/home/lolben/TerraPedia`
- Base: `78620ad`
- Related docs: `docs/superpowers/plans/2026-07-13-admin-article-runtime-preview.md` Task 0.
- Related prior entries: `docs/devlog/entries/2026-07-13-admin-article-runtime-preview.md` remains the parent implementation task.

## Direction / Decisions

- Chosen approach: remove the two unconditional `loadEditorRecipeTreeEmbeds()` calls from no-change branches in `syncEditorFromModel`.
- Reasoning: those branches run for ordinary text model updates but have neither inserted nor replaced recipe-tree embed HTML, so hydration needlessly refreshes already-mounted graphs.
- Rejected options: changing recipe-tree insertion or initial-render hydration; neither is part of this regression fix.

## Scope

- Frontend: `front-nuxt/components/user/UserArticleRichEditor.vue` only.
- Backend: none.
- Data: none.
- Docs/process: this entry and `docs/devlog/current.md`.
- Out of scope: admin runtime preview, sanitizer changes, shared renderer extraction, and recipe-tree graph behavior.

## Validation

- Commands run: `git diff --check`; `cd front-nuxt && pnpm run check:user-article-editor && pnpm exec vue-tsc --noEmit`.
- Results: diff check passed; the editor DOM contract reported success and TypeScript completed with exit code `0` and no diagnostics. The working diff remains exactly the two removed no-change hydration calls.
- Not run: public runtime visual acceptance; it is unrelated to this isolated checkpoint and remains required by the parent shared-renderer task.

## Result

- Completed: removed redundant hydration from ordinary no-change model synchronization and validated the isolated regression fix.
- Not completed: none.

## Residual Risks

- The focused checks must prove the normal editor contract still holds; public runtime visual validation belongs to the parent shared-renderer task.

## Follow-up

- Owner: Codex. After this checkpoint commit, continue the parent admin runtime-preview task with its disposable cross-project alias spike.

## Commits

- `commit SHA pending in final response`.
