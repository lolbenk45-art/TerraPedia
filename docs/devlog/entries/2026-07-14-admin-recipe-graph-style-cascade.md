# Devlog: admin-recipe-graph-style-cascade

## Status

`closed`

## Context

- User goal: 修复管理端文章预览中合成树节点的图片、文本与制作站轨道错位。
- Branch: `review/front-nuxt-visual`
- Worktree: `/home/lolben/TerraPedia`
- Base: `512dee6`
- Related docs: `docs/devlog/current.md`
- Related prior entries: article runtime preview commits `31f657f`, `1af4549`, and `512dee6`.

## Direction / Decisions

- Chosen approach: Make each shared graph preview image frame a self-contained positioned and clipped box, while retaining the admin component's later graph-image dimensions override.
- Reasoning: Fresh article `#54` evidence shows that image dimensions alone do not solve the overlap. The shared renderer creates `item-art tp-preview-image` frames and absolutely positions their images, but the shared stylesheet omitted the frame positioning rule that the public frontend happens to supply privately. Images therefore position against graph nodes in the admin host.
- Rejected options: Copying `front-nuxt/assets/css/domains/crafting.css` or its private preview base into the admin app would duplicate host-specific styling instead of repairing the shared runtime contract.

## Scope

- Frontend: `shared/article-runtime/recipeHierarchyGraph.css`, `data-query-app/components/article/AdminArticleRuntimePreview.vue`, and the focused runtime-preview contract.
- Backend: none.
- Data: none.
- Docs/process: this devlog entry and the current-devlog index.
- Out of scope: recipe graph coordinates/algorithms, article data, backend APIs, and host-specific public frontend presentation.

## Validation

- Commands run: root-cause inspection of running admin assets, shared runtime styles, public preview base styles, and the screenshot of article `#54`; fresh `cd data-query-app && pnpm run test`; fresh `cd front-nuxt && pnpm run check`; offline Chromium geometry validation using the shared graph stylesheet; and `git diff --check`.
- Results: The screenshot invalidated the earlier ready-for-commit state and exposed the missing preview-frame contract. The final admin gate passes typecheck, 282/282 tests, and production build. The public frontend check passes. The offline Chromium geometry contract confirms ordinary and station images are each fully contained by their own `48px` preview frames. The running `:13004` host hot-serves the shared corrected stylesheet. The public check emitted pre-existing non-failing DBus and Node deprecation warnings. The user completed the authenticated visual acceptance and requested commit/merge on 2026-07-15.
- Not run: none.

## Result

- Completed: generic-image cascade correction, host-neutral preview-frame correction, focused regression contracts, automated dual-host validation, offline browser geometry validation, and authenticated visual acceptance of article `#54`.
- Not completed: none.

## Residual Risks

- The shared rule affects both public and admin article hosts; both frontend gates passed after the change.

## Follow-up

- none.

## Commits

- `commit SHA pending in final response`.

## Closeout Checklist

- [x] Result recorded.
- [x] Validation recorded.
- [x] Residual risks recorded.
- [x] Follow-up is `none` or points to a new task.
- [x] All child entries are `closed`, or `blocked` with stop reason and parent follow-up.
- [x] Conflict status is none or resolved.
- [x] Cross-review findings are fixed and re-reviewed, rejected with reason, or deferred with owner and follow-up.
- [x] Producer/consumer contract acknowledgement is current, if applicable.
- [x] Cross-boundary validation is recorded. If blocked, status is `blocked` or intentionally stopped, not `ready-for-commit`.
- [x] Commit SHA, `commit SHA pending in final response`, or stop reason recorded.
- [x] `docs/devlog/current.md` updated.
