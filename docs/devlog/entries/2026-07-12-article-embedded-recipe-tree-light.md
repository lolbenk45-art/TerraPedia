# Devlog: article-embedded-recipe-tree-light

## Status

`closed`

## Context

- User goal: 修复文章详情内嵌合成树在浅色主题下节点近乎空白、难以阅读的问题。
- Branch: `review/front-nuxt-visual`
- Worktree: `/home/lolben/TerraPedia`
- Base: `5738633`
- Related docs: `docs/project-governance/00_CURRENT_SPEC.md`, `docs/project-governance/00_WORKFLOW.md`
- Related prior entries: none; current crawler entry is on an isolated worktree and does not share this task's files.

## Direction / Decisions

- Chosen approach: 在文章内嵌合成树的节点中显示名称与数量，并用文章范围内的样式提高卡片、连线与文字对比度。
- Reasoning: 运行态验证显示 API、图片和 SVG 连线均正常；问题来自文章复用了仅靠图标与 hover popover 解释的紧凑合成页节点。
- Rejected options: 不修改合成页共享样式、不修改富文本编辑器、不改变接口或合成树数据结构。
- Prior correction (superseded): 文章卡片放大与文章范围图片规格不足以解决用户视觉反馈，不能以 DOM 图框尺寸通过为完成标准。
- Current correction: 制作页 `CommonPreviewImage` 会扫描 PNG alpha 可见边界并设置 `--tp-preview-visible-shift-x/y`；文章动态树手写 `img` 遗漏该通用逻辑，且文章范围 `38px` 图像规则会覆盖容器尺寸并裁切较小替代材料。用户确认文章树应套用制作页的通用预览方法。
- New blocking finding: the former acceptance only exercised one root. The real API encodes same-version multiple recipes as `variant.roots`; article `recipeTreeRootNodes` applies `slice(0, 1)` and the old test explicitly forbids non-default roots. The user reproduced this gap. The embed must use the crafting model’s version and recipe selection semantics before it can return to `ready-for-commit`.
- Resolution: article embeds now import `buildCraftingRecipeModel`, the same model used by `/crafting`, and hold version/recipe selection state locally. A version or option button redraws only that embed with its selected raw root; it neither fetches again nor combines independent root recipes into one graph.
- Review regression: `article_recipe_selection_review` found two Important gaps. An empty selected version could fall back to a root from another version, and the runtime fixture did not prove the production model’s variant ordering or two-embed isolation. The entry is demoted until both are test-first repaired and re-reviewed.
- Review regression resolved: the selected raw version now has no cross-version fallback; legacy fallback applies only when the API has no `variants` at all. The contract now models production ranking with a raw base variant preceding desktop, an empty version, three desktop roots, no-refetch assertions, ARIA checks, and two independently selected embeds.
- New visual regression: user confirmed that the article graph still renders intrinsic-size item PNGs inside enlarged preview frames and compresses wide station sprites into a 17px square rail. The active repair must make hierarchy previews fill their assigned frames with `contain`, while giving article-only station previews a full 32×20 frame and preserving graph data, selection, and connectors.
- Acceptance URL confirmed as `/articles/fw`: its `1706px` graph entered a `690px` article frame at the former hard `0.48` minimum scale, leaving an `819px` transformed canvas beneath `overflow: hidden`. A first width-fit repair still used the embed border box rather than its padded content box. The resolved implementation derives scale from the content width and reserves a four-pixel gutter, so no graph node may start outside the visible frame.
- New user screenshot correction: nodes were no longer clipped by the canvas, but the alpha visible-center helper translated each `contain` image inside the already-scaled hierarchy canvas. Fresh loaded-image measurements showed `translateY(-7.73px)` on both a 30×34 item and 30×28 station sprite, leaving only part of the image in the clipped preview root. Hierarchy previews on both article and crafting pages now keep the common preview component and `contain` sizing while explicitly disabling alpha translation.
- Latest editor-vs-article comparison: the remaining article-only defect was not a missing image rule. Its expanded `1706px` FW graph is reduced to `0.386` to show every outer node in a `663px` content frame, shrinking a `48px` item preview to about `18.5px`. The former `0.48` readable-scale floor was rejected because it clipped outer nodes in the article frame; the article therefore starts width-fitted while retaining the enlarged square station source frames.
- User rejection of that correction identified the remaining station-specific root cause: actual station assets include near-square `30×28` sprites, but the article-only `32×20` rail constrained them to a `15.36×9.6px` rendered box after the `0.48` graph scale. This was a layout contract error, not an alpha-centering or loading problem. Article station frames are now square `48×48` with a `52px` rail, and a two-station card reserves `108px` logical height.
- Current root-cause correction: the real `/articles/fw` page applies the generic `.article-content-text img` prose rule to dynamically created hierarchy images. That adds `margin: 20px 0`, a `1px` border, and a `12px` radius after the tree-specific size rule. At 1440px, a `48px` logical preview at base scale `0.3862837` was visibly displaced by `7.73px`. A one-variable temporary-browser reset changed the image/frame delta from `7.73px` to `0px`; this is the direct visual defect to repair first.
- Scope decision: preserve the current width-fit, all-nodes-visible article overview for this repair. Do not bundle a scale-mode redesign or an editor renderer refactor into the confirmed CSS-cascade fix. The independently duplicated editor/article selection and layout pipelines remain a follow-up architecture risk after this focused regression is closed.
- User-approved PC readability redesign: the next correction expands only a recipe-tree embed to the article body panel's measured content width at `960px` and above. It does not touch the `76ch` prose measure, the article grid, the sidebar, or mobile. This raises the FW graph scale without restoring the rejected clipping floor.

## Scope

- Frontend: `front-nuxt/utils/previewImageVisibleCenter.ts`、`front-nuxt/components/common/PreviewImage.vue`、`front-nuxt/components/crafting/RecipeHierarchyTree.vue`、`front-nuxt/pages/articles/[slug].vue`、`front-nuxt/scripts/check-article-content-references.mjs`、`front-nuxt/scripts/check-public-pages.mjs`
- Backend: none.
- Data: none.
- Docs/process: this devlog entry and `docs/devlog/current.md`.
- Out of scope: `RecipeHierarchyTree.vue`、`UserArticleRichEditor.vue`、合成页和先前视觉审查中的其他问题。

## Coordination

- Coordinator: Codex maintains this entry and `docs/devlog/current.md`.
- Execution mode: user-selected subagent-driven development on the existing `review/front-nuxt-visual` worktree; it is the sole write target because it already contains this task's uncommitted changes.
- Serialized ownership: `preview_contract` may edit only `front-nuxt/scripts/check-article-content-references.mjs`; after its review closes, a new implementer may edit only the shared preview utility and `components/common/PreviewImage.vue`; article-page integration begins only after that producer contract is accepted.
- Cross-boundary validation: coordinator runs the complete frontend check plus same-item article/crafting browser comparison after all serialized changes land.
- Final review: `article_recipe_selection_review` is read-only; it may inspect the uncommitted article renderer, crafting model, multi-root contract, and validation evidence. It must not edit files. Codex remains the only writer and will record any finding disposition before handoff.

## Validation

- Prior validation: image-size assertions passed but did not prove the actual pixel content was aligned; user rejected the resulting visual output.
- RED → GREEN: `pnpm run check:article-content-references` first failed on the missing shared-helper import, then passed after the article dynamic-tree load handler called the shared tool. It also covers normal nodes, alternative materials, three recipe-option rows, source markers, and real `load` event wiring.
- Focused: `pnpm run check:preview-images`, `pnpm exec vue-tsc --noEmit`, and `pnpm run check:public-pages` passed.
- Full frontend: `cd front-nuxt && pnpm run check` passed.
- Preview-size regression RED → GREEN: the article contract first failed on the missing full-size station frame, then on the missing article-body image override, and finally on missing absolute in-frame positioning. The completed contract requires main hierarchy images to fill their 48×48 frame with `contain`, and station images to preserve a non-square 32×20 frame with `contain`.
- Runtime browser acceptance: isolated front `15179` loaded `/articles/article` against the live root backend. Chromium measured all three main recipe previews at exactly `48×48` within `48×48` roots and all four iron/lead-anvil previews at exactly `32×20` within `32×20` roots; each uses `object-fit: contain` and absolute in-frame positioning. The prior broken measurements were `48×88` for main previews and `32×32` for a `32×20` station root.
- Multi-recipe RED → GREEN: the article contract first failed because `buildCraftingRecipeModel` was absent. Its fixture now has one desktop variant with three roots plus a console variant; it verifies all three option buttons, selected-root-only rendering, and explicit version switching. It passes after the minimal implementation.
- Review-regression RED → GREEN: selecting the fixture’s empty version first failed because it rendered a root from another variant. After restricting fallback to legacy no-variant payloads, the focused contract and `pnpm exec vue-tsc --noEmit` pass. The same contract now covers model sorting, third-option active state, no extra fetches, empty-version no-graph behavior, and independent duplicate embeds.
- Light theme: `TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:15177 pnpm run check:light-theme` passed.
- Diff: `git diff --check` passed.
- Browser acceptance: Chromium at 1440×1000 waited for client hydration, then compared `/articles/article` and `/crafting?itemId=4731` in `morning-paper`. Both use the same Terra Toilet image source. The article tree had 14 previews, zero horizontal overflow, zero image rectangles outside their own roots, and the Terra Toilet preview had `data-preview-visible-center="shared"`, shift `0px/-20px`, and a `48×48` root/image. The crafting page had 24 previews and its distinct existing large-preview crop behavior; it is not an article failure.
- Real multi-recipe browser acceptance: local API item `55` (附魔回旋镖) returns one `Desktop / Console / Mobile` variant with roots `#61857` and `#59500`. An isolated Chromium article session redirected only its in-memory `4731` request to `55`. The embed exposed both option buttons; initial selection rendered `#61857`, and clicking the second rendered only `#59500` with `x2`. Both states had three graph nodes and zero document horizontal overflow. See git for code-level diff details.
- FW clipping regression RED → GREEN: the article contract first failed without a viewport-fit scale helper, then failed again without padded-content-width accounting. Full frontend check passes after the implementation. A fresh 1440×1000 Chromium audit at `http://localhost:15177/articles/fw` measured the `1706px × 684px` graph at base scale `0.3862837` inside its `663px × 265px` frame, with zero clipped nodes and no document horizontal overflow.
- Preview-translation regression RED → GREEN: the article contract first failed because dynamic article images still called the shared alpha-center helper inside a transformed canvas. It now asserts `contain-only` reset behavior for article dynamic previews and requires all five crafting hierarchy preview kinds to use `auto-center-visible=false`. Fresh 1440×1000 Chromium audits loaded all 60 article and all 4 crafting hierarchy images; every sampled main item and station reported `object-fit: contain`, `translate(0px, 0px)`, and zero visible-center shifts. Full frontend check passes.
- Full-tree width-fit regression RED → GREEN: the article contract first failed after requiring the FW-style `1706px` graph to fit its padded visible frame after the station previews became square. The fixed `0.48` initial floor was removed; manual zoom retains its relative lower bound from the width-fitted base scale. The focused contract, Vue typecheck, and complete frontend check pass. A fresh 1440px Chromium audit of `/articles/fw` measured all 23 nodes inside the `663px × 268px` graph frame (`outsideNodes: 0`) and square, uncropped station preview roots/images at `18.54px × 18.54px` after scale.
- Station-frame regression RED → GREEN: the focused contract first failed because the article stylesheet still exposed the incorrect `32×20` station frame. It now requires a square `48px` frame, a `52px` rail, `contain` fitting, and a two-station layout height of at least `108px`. Fresh Chromium DOM evidence at `/articles/fw` reports `48×48px` computed station roots and `23.04×23.04px` post-scale rendered station/image boxes, replacing the rejected `15.36×9.6px` result. The complete frontend check and `git diff --check` pass.
- New failed-acceptance diagnosis: both focused article and editor checks pass, but they execute generated `file://` fixtures rather than the full served Nuxt CSS cascade. A fresh real-page audit on `/articles/fw` found the generic prose-image margin/border/radius on hierarchy `<img>` elements. The next RED contract must model that cascade and require every graph preview image to reset it; the post-GREEN runtime audit must prove image and preview-frame rectangles share the same origin.
- Cascade repair RED → GREEN: the article-content contract first failed on the missing scoped graph-preview reset, then passed after the article stylesheet added `display: block`, `margin: 0`, `border: 0`, and `border-radius: 0` under `.article-content-text :deep(.article-recipe-tree__graph .tp-preview-image img)`. The source contract rejects partial shorthand resets and bare scoped-style selectors that would miss dynamic nodes.
- Fresh validation: `cd front-nuxt && pnpm run check` and `TERRAPEDIA_FRONT_NUXT_URL=http://127.0.0.1:15177 pnpm run check:light-theme` passed; `git diff --check` passed.
- Fresh served-page acceptance: temporary Chromium at 1440×1000 opened `http://127.0.0.1:15177/articles/fw` and measured 60 graph images, 23 cards, `styleLeakCount: 0`, `maxOffset: 0`, and `outsideCards: 0`. Every sampled image had `margin: 0px`, zero border/radius, `display: block`, and the same frame origin.
- Cascade review: contract spec review, contract quality review, implementation spec review, implementation quality review, and final read-only review all approved the exact scoped reset. No material finding remains.
- PC-wide-frame RED → GREEN: the article contract first failed because `resolveArticleRecipeTreeFrameWidth` and the scoped wide marker did not exist. It now proves that a `663px` prose frame becomes `937px` at a `1440px` PC viewport and remains `663px` at `768px`. The focused contract, Vue typecheck, full frontend check, and `git diff --check` pass.
- Fresh served-page PC acceptance: after starting the local backend on `18191` and front on `15177`, Chromium at `1440×1000` measured FW's tree at `965px` outer / `935px` graph width, base scale `0.5457209848`, 23 nodes, zero outside nodes, no tree/sidebar overlap, and document `scrollWidth` `1425` within the `1440px` viewport. The smallest complete station preview increased from `18.54px` to `26.19px`.

## Result

- Final closeout: public article embeds and article-editor embeds now share `recipeHierarchyGraphRenderer`; ordinary article body images retain their editor/native size; embed shells use aligned thumbnail/stat geometry; and shared recipe-model variant display no longer exposes verbose raw English metadata. Full frontend check and `git diff --check` passed on 2026-07-13. Commit SHA pending in final response.

- The scope resumed on 2026-07-13 after user approval to remove the confirmed article/editor renderer divergence. The two new host contracts are intentionally RED: both require the planned shared `recipeHierarchyGraphRenderer` import and call before implementation begins. See git for code-level diff details.
- Implemented the production shared renderer at `front-nuxt/utils/recipeHierarchyGraphRenderer.ts`. Both `pages/articles/[slug].vue` and `components/user/UserArticleRichEditor.vue` now pass roots, depth, available width, image URL policy, and host popover owner into it. The renderer owns canonical `132×100` cards, `48×48` main/station previews, `32×32` alternatives, full `contain` image fitting, graph normalization/layout, SVG lines, popovers, wheel zoom, and pointer pan. Article-only PC-wide-frame selection and editor-only `contenteditable="false"` behavior remain host responsibilities. See git for code-level diff details.

- Validation after the migration: both new host source contracts turned RED before implementation and are GREEN after it; `cd front-nuxt && pnpm run check` and `git diff --check` pass. A live Chromium DOM dump of `http://localhost:15177/articles/fw` found `data-recipe-hierarchy-renderer="shared"`, shared graph classes, and 32 rendered station-badge nodes after hydration. Screenshot evidence: `front-nuxt/tmp/article-fw-shared-renderer-15177.png`.

- Completed: extracted the crafting page's alpha visible-region centering into `utils/previewImageVisibleCenter.ts`; `CommonPreviewImage` and article dynamic tree previews call that same implementation. Article preview images now carry a source marker and invoke the helper on `load`; error handling resets the shift and exposes the fallback semantics.
- Completed: removed the article graph's stale fixed `38px` image override. Article-only `48px` normal and `32px` alternative containers remain, while the common preview CSS controls image fitting and transforms.
- Completed: enlarged logical graph-card layout reservations to match direct labels and actual preview content (`100px` normal nodes; a semantic three-row recipe-option formula that reserves `139px`). This prevents connector/level geometry from using the former compact heights.
- Completed: moved the public-page static contract's alpha-algorithm markers from `PreviewImage.vue` to the shared utility and retained component-wrapper checks. See git for code-level diff details.
- Completed: article embeds now expose crafting-model-aligned version and recipe-option selectors. The old default-route statistic and first-root truncation were removed; the updated Chromium contract covers multiple same-version roots rather than only nested recipe-option rows.
- Completed: recipe-tree images occupy their assigned preview frame instead of retaining their intrinsic PNG box; `contain` preserves every sprite edge. Article station rails reserve a square `48×48` frame because production station assets are not uniformly wide; this prevents near-square station sprites from being crushed into the former short rail.
- Completed: article graph initial scale now uses the actual padded embed content width rather than a hard minimum or border-box width; the graph retains its interaction model while wide FW-style trees render every outer node within the visible frame.
- Completed: article and crafting hierarchy images now retain the full `contain` frame in their scaled canvases. The common alpha-centering behavior remains available to non-scaled image previews, but cannot crop hierarchy sprites.
- Completed: article detail starts with width-fit scaling so every node in a wide tree is initially inside the padded article frame. The former `0.48` initial floor was removed because it hid outer nodes; enlarged `48×48` square station source frames remain and use full-frame `contain` fitting.
- Completed: article graph preview images now explicitly reset the generic article-body image box styling at the graph boundary, preventing the verified `7.73px` served-page displacement without changing scale, data, editor, or crafting-page behavior. See git for code-level diff details.
- Completed: PC article trees now use their containing article-body panel's inner width rather than the narrower prose measure. A scoped data marker and CSS variable expand only the embed at `960px` and above; the initial width-fit scale and all-node visibility remain intact. See git for code-level diff details.

## Residual Risks

- Dense article trees now fit all nodes initially and use the PC body-panel width, so the FW station source frames measure `26.19px` at 1440px. If that remains too small on a materially narrower desktop, the next solution must be a deliberate layout mode (for example a multi-row or focused/expanded view), not another scale-floor change. User acceptance remains required.
- The embedded tree intentionally presents one chosen root at a time, matching the crafting page’s recipe-option model; the link still opens the full crafting workspace for comparison and route exploration.
- Article and editor still own duplicated tree selection/layout implementations. The current direct defect is isolated to article prose-style leakage, but a later parity task must remove or explicitly contract those divergent renderers before claiming full cross-page visual equivalence.
- The superseded host helper blocks remain temporarily in the two large Vue files to preserve existing extracted-fixture compatibility; production rendering no longer calls them. A focused cleanup can delete those unreachable helpers after the source-fixture contracts are migrated to execute the shared module directly.

## Follow-up

- Await visual acceptance at `http://localhost:15177/articles/fw`; the local backend is `18191`. Compare this page to the article editor preview: graph card/station dimensions and image fitting should now match because both call the shared renderer. Keep the complete uncommitted article-tree scope intact until an explicit commit request.

## Commits

- Pending.

## Optional: Cross-Review

- Reviewer: `/root/article_tree_review`
- Scope: uncommitted article-only tree rendering, scoped CSS, and content-reference contract.
- Reviewers: `/root/article_tree_review`, `preview_contract_spec_review`, `preview_contract_quality_review`, `visible_center_utility_spec_review`, `visible_center_utility_quality_review`, `article_preview_integration_spec_review`, `article_preview_integration_quality_review`, and `article_preview_final_review`.
- Findings/disposition: alternative quantities were added; the stale `38px` rule was removed; the article tree now calls the shared visible-center helper. Two layout-review findings were fixed with contract-first changes: normal labeled cards reserve `100px`, and three recipe-option rows reserve `139px` via named layout constants.
- Re-review: complete. Final review approved the source scope, shared-helper parity, and fresh complete frontend checks.
- Review regression disposition: `article_recipe_selection_review` re-ran the focused contract and approved the empty-version fallback repair plus sorted-model, multi-root, ARIA, no-refetch, and multi-embed coverage. No Critical or Important finding remains.
- Final cascade disposition: `cascade_contract_spec_review`, `cascade_contract_quality_review`, and `cascade_final_review` approved the test-first scoped CSS repair; no Critical or Important finding remains.
