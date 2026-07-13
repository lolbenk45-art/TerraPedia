# Admin Article Runtime Preview Design

## Goal

Make the admin review workspace and article-editor preview render draft and pending article content with the same runtime article contract as the public article: safe rich HTML, normalized images, interactive content references, and embedded recipe trees.

## Success Criteria

- Both admin hosts render one reusable runtime-preview component instead of host-local `v-html` previews.
- Previewed body and reference images resolve through the admin image-origin policy.
- Valid item, NPC, and boss references retain their safe markup and gain the same information-preview behavior as public articles.
- Each valid recipe-tree embed loads through the authenticated admin item-tree API, renders version/recipe choices, node and station previews, SVG edges, zoom, pan, and popovers, and keeps each embed's selection isolated.
- A loading, missing, or failed embed stays local to that embed and never breaks the article preview.
- No preview path iframes or depends on a public article URL.

## Scope

### Included

- Shared, framework-neutral recipe graph model, renderer, and root-scoped CSS source under `shared/article-runtime/`.
- An admin-only `AdminArticleRuntimePreview.vue` host component.
- Integration into `ArticleReviewWorkspace.vue` and the editor preview panel in `ArticleEditorWorkspace.vue`.
- Admin sanitizer and editor-reference support for the `boss` reference type.
- Contract-first tests, type checks, builds, and authenticated local review-page acceptance when a session is available.

### Excluded

- Review state changes, saving, article publication, backend endpoint changes, and data writes.
- Iframing the public article page.
- A visual redesign of the public article or the existing editor chrome.
- The unrelated `front-nuxt/components/user/UserArticleRichEditor.vue` uncommitted hydration fix; it remains a separate front-end checkpoint.

## Chosen Architecture

### Shared graph runtime

`shared/article-runtime/` contains only browser-DOM and structural model code. It imports neither Nuxt aliases nor public/admin API types.

```text
public recipe response ─┐
                        ├─ host adapter ─→ RecipeGraphModel ─→ shared renderer
admin recipe response  ─┘
```

The model contains only renderer facts: node labels, quantities, image values, stations, alternatives, child nodes, variants, and recipe options. Each host owns API fetches, route links, image URL resolution, and response adaptation. The present public renderer remains a compatibility entry point which delegates to the shared source, so its callers keep their existing import path.

### Shared styles

`recipeGraph.css` uses global selectors rooted at `.tp-article-runtime`; dynamically created nodes cannot use Vue scoped attributes. It references semantic variables such as `--tp-graph-surface`, `--tp-graph-border`, `--tp-graph-text`, and `--tp-graph-accent`, not fixed colors. The public article root and the admin preview root map those variables to their own theme tokens. Geometry, preview sizing, connectors, popover behavior, and interaction affordances therefore remain identical without leaking rules outside the root.

### Admin runtime-preview component

`AdminArticleRuntimePreview.vue` receives `html`, optional title/summary/cover, and a mode (`review` or `editor`). It sanitizes its input, normalizes article image attributes with the existing admin policy, renders the resulting HTML, then after `nextTick` performs two independent enhancement passes:

1. Resolve `.tp-content-ref` elements for `item`, `npc`, and `boss`, preserve image/text presentation, and expose an accessible information popover plus the matching admin-detail link.
2. Resolve `.tp-recipe-tree` elements with `itemsStore.fetchItemRecipeTree`, adapt them to the shared graph model, and render an isolated interactive graph per embed.

An increasing render sequence and cleanup of body-appended popovers prevent stale async responses from a previous article or editor update from modifying current content. A `ResizeObserver` re-renders a graph only when its host width changes; version and recipe-option clicks reuse the fetched tree.

## Host Integration

- `ArticleReviewWorkspace.vue` retains its review actions and metrics, but replaces its preview header/body markup with the component.
- `ArticleEditorWorkspace.vue` retains the inspector tab and editor controls, but replaces its local article-preview markup with the component in editor mode.
- The admin article sanitizer retains the canonical recipe embed attributes and boss references. The editor reference picker gains boss selection so newly created markup matches what preview can render.

## Failure and Accessibility Rules

- Invalid or stripped markup stays inert; runtime code never trusts arbitrary attributes.
- One failed reference or tree displays a local fallback state and does not reject the entire preview.
- Recipe controls use buttons and `aria-pressed`; graph popovers work for keyboard focus as well as pointer hover.
- Images retain meaningful alt text or an explicit decorative/fallback semantic.
- Pan is pointer-based, zoom is wheel-based, and controls remain reachable without relying only on gestures.

## Test-First Plan

Before production code, add a focused admin contract test that fails until it verifies:

- a new runtime component is used by both hosts;
- sanitizer output preserves canonical tree attributes and boss references;
- the component sanitizes and normalizes images before enhancement;
- reference and tree selectors, sequence protection, local failure states, admin tree fetches, and shared renderer imports are present;
- no iframe or public-article URL is used for admin preview.

After the RED run, implement the smallest shared runtime and admin component needed for the test, run the focused test to GREEN, then run admin typecheck/unit/build, public frontend check, and a local authenticated review-page acceptance for a draft or pending article containing images, all three reference types, and a recipe-tree embed.

## Validation and Commit Boundaries

- The admin preview task owns the existing uncommitted `data-query-app/utils/articleEditor.ts` sanitizer change.
- The unrelated user-editor hydration fix is validated and committed separately before or after this task; it is never staged with the admin preview files.
- The shared-runtime extraction, admin preview, tests, and task devlog closeout form the admin-preview commit.
