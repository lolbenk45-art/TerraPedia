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
- Recipe-tree and content-reference resolution is bounded: embed attribute values are validated (not just allow-listed) before use, and the number of concurrent tree fetches triggered by one preview render is capped.

## Scope

### Included

- Shared, framework-neutral recipe graph model, renderer, and root-scoped CSS source under `shared/article-runtime/`.
- An admin-local content-reference enhancement that follows the public article's visible contract without refactoring the public page's existing resolver/popover in this task.
- An admin-only `AdminArticleRuntimePreview.vue` host component.
- Integration into `ArticleReviewWorkspace.vue` and the editor preview panel in `ArticleEditorWorkspace.vue`.
- Admin sanitizer and editor-reference support for the `boss` reference type, including widening `useArticleEditor.ts`'s `SUPPORTED_REFERENCE_TYPES` allow-list.
- Value validation (not just attribute-name allow-listing) for the new recipe-tree embed attributes (`data-tp-item-id`, `data-tp-max-depth`, `data-tp-embed-type`), matching the rigor already applied to `.tp-content-ref`.
- Real keyboard-focus support for recipe graph nodes and popovers in the shared renderer (see Failure and Accessibility Rules).
- Accessible non-navigating content-reference information popovers; no reduced entity-list link, since no per-entity deep-linkable detail route exists yet.
- Keeping `ArticleEditorWorkspace.vue`'s preview panel mounted (not `v-if`-unmounted) across inspector-tab switches, so the per-embed identity diff actually persists across a reference-panel round trip.
- Contract-first tests, type checks, builds, and authenticated local review-page acceptance when a session is available.

### Excluded

- Review state changes, saving, article publication, backend endpoint changes, and data writes.
- Iframing the public article page.
- A visual redesign of the public article or the existing editor chrome.
- The unrelated `front-nuxt/components/user/UserArticleRichEditor.vue` uncommitted hydration fix; it remains a separate front-end checkpoint.

## Chosen Architecture

### Cross-project import boundary

Neither app has a configured alias or workspace boundary for a new root `shared/` directory: there is no root workspace manifest tying `data-query-app/` and `front-nuxt/` together, and neither `nuxt.config.ts` defines an alias/extends entry today. Before any shared-runtime code is written, a throwaway spike proves the boundary: add a trivial exported constant under `shared/article-runtime/`, wire an alias (for example `#article-runtime`) and matching TypeScript resolution in both apps, import it from one file in each app, and confirm dev server, `vue-tsc`, and production build all resolve it. Add `server.fs.allow` only if the dev server rejects the outside-root path. The spike is not committed and its temporary import/configuration is removed before the RED contract. If it fails or is unexpectedly costly, revisit the `shared/article-runtime/` premise before implementation.

### Shared graph runtime

`shared/article-runtime/` contains only browser-DOM and structural model code. It imports neither Nuxt aliases nor public/admin API types.

```text
public recipe response ─┐
                        ├─ host adapter ─→ RecipeGraphModel ─→ shared renderer
admin recipe response  ─┘
```

The model contains only renderer facts: node labels, quantities, image values, stations, alternatives, child nodes, variants, and recipe options. Each host owns API fetches, route links, image URL resolution, and response adaptation. The present public renderer remains a compatibility entry point which delegates to the shared source, so its callers keep their existing import path.

Today's renderer (`front-nuxt/utils/recipeHierarchyGraphRenderer.ts`) also hardcodes the literal class `crafting-screen` onto the graph root and every popover, and wires `focusin`/`focusout` popover triggers onto a plain, non-`tabindex`ed `<div>` — neither fact is compatible with a framework-neutral, keyboard-accessible shared module, so both are fixed during extraction, not carried over as-is:

- The graph root stops hardcoding `crafting-screen`. Each body-portaled popover receives both `tp-article-runtime-popover` and a host theme class such as `tp-article-runtime-popover--public` or `tp-article-runtime-popover--admin`; it cannot rely on being a descendant of `.tp-article-runtime` (see Shared styles below).
- Each node `holder` gains `tabindex="0"` and an appropriate `role`, plus `Enter`/`Escape` keyboard handling for its popover, alongside the existing hover/`focusin`/`focusout` wiring. Without this, "keyboard focus" support does not exist today in either host and would not appear simply by reusing the renderer unchanged.

### Content-reference enhancement

The admin component resolves `.tp-content-ref` with the already available `POST /public/content-references/resolve` contract, deduping by `type:id` and retaining item, NPC, and boss information-popover behavior. This task deliberately does not refactor the public article's existing resolver/popover into `shared/article-runtime/`; that extraction would enlarge the public-page regression surface without being necessary to repair the two admin hosts. A future dedicated task may extract it after the admin behavior is proven.

Admin has no per-record deep-linkable item/NPC/boss route: `data-query-app/pages/entities/[type].vue` opens details in an in-page modal and supports a plural list route with `?search=`. The user chose accessible non-navigating information popovers for this task; no filtered-list fallback href is emitted. A future deep-linkable admin detail route remains outside this scope.

### Shared styles

`recipeGraph.css` uses global selectors rooted at `.tp-article-runtime`; dynamically created nodes cannot use Vue scoped attributes. It references semantic variables such as `--tp-graph-surface`, `--tp-graph-border`, `--tp-graph-text`, and `--tp-graph-accent`, not fixed colors. The public article root and the admin preview root map those variables to their own theme tokens. Geometry, preview sizing, connectors, and interaction affordances therefore remain identical without leaking rules outside the root.

This variable contract replaces the renderer's current `crafting-screen` class, whose colors resolve through `--crafting-*` → `--tp-color-*` (defined only in `front-nuxt/assets/css/tokens.css`; `data-query-app` defines none of these tokens today). `front-nuxt` keeps its current look by mapping `--tp-graph-*` to its existing `--tp-color-*`/`--crafting-*` tokens in both `.tp-article-runtime--public` and `.tp-article-runtime-popover--public`; the admin maps the same names to `--color-*` in `.tp-article-runtime--admin` and `.tp-article-runtime-popover--admin`. The shared popover CSS selects its direct portal class, not a descendant selector, so body-portaled popovers retain theme variables and styles.

### Admin runtime-preview component

`AdminArticleRuntimePreview.vue` receives `html`, optional title/summary/cover, and a mode (`review` or `editor`). It sanitizes its input, normalizes article image attributes with the existing admin policy, renders the resulting HTML, then after `nextTick` performs two independent enhancement passes. "The existing admin policy" is the `/terrapedia-images/` / `/preview-assets/terrapedia-images/` path allow-list already duplicated across `isSafeUrl`/`isSafeContentReferenceImageUrl` in `articleEditor.ts` and again in `useArticleEditor.ts` — there is no separate URL-rewriting step beyond it. The recipe graph's `resolveImageUrl` callback reuses this same allow-list rather than adding a fourth copy.

1. Resolve `.tp-content-ref` elements for `item`, `npc`, and `boss`, preserve image/text presentation, and expose an accessible information popover. Add a reduced filtered entity-list link only if the explicit navigation decision above is approved.
2. Resolve `.tp-recipe-tree` elements with `itemsStore.fetchItemRecipeTree`, adapt them to the shared graph model, and render an isolated interactive graph per embed.

An increasing render sequence and cleanup of body-appended popovers prevent stale async responses from a previous article or editor update from modifying current content. A `ResizeObserver` re-renders a graph only when its host width changes; version and recipe-option clicks reuse the fetched tree.

Each enhancement pass diffs by embed identity (the content-reference `type:id` key, or the recipe-tree embed's `data-tp-item-id`/`data-tp-max-depth`/`data-tp-label`) before re-running: an embed whose identity is unchanged keeps its already-rendered graph, pan/zoom, selection, and popover state instead of being torn down and refetched. New recipe-tree keys are deduplicated by `itemId:maxDepth` and fetched through a per-component queue with at most three active requests. This matters specifically in editor mode: `useArticleEditor.ts`'s `previewHtml` recomputes on every keystroke with no debounce, so without this diff, typing anywhere in the article would repeatedly refetch and rebuild every embed on the page.

## Host Integration

- `ArticleReviewWorkspace.vue` retains its review actions and metrics, but replaces its preview header/body markup with the component.
- `ArticleEditorWorkspace.vue` retains the inspector tab and editor controls, but replaces its local article-preview markup with the component in editor mode. Its inspector tabs (`preview`/`outline`/`quality`/`references`) currently switch on a `v-if`/`v-else-if` chain that fully unmounts whichever branch is inactive; the `preview` branch changes to an always-mounted, `v-show`-hidden approach instead, because `openReferencePanel`/`closeReferencePanel` — a routine step every time a content reference is inserted — toggle `sidePanel` away from and back to `'preview'`, which today would tear down and refetch every embed on each round trip regardless of the per-embed identity diff described above. Collapsing the whole inspector (`sidePanelCollapsed`) still unmounts everything including the preview; that path is coarser and rarer, and is left as-is.
- The admin article sanitizer retains the canonical recipe embed attributes and boss references. The editor reference picker gains boss selection: `ArticleEditorWorkspace.vue`'s `reference-controls` button group currently has exactly three buttons (`全部`/`物品`/`NPC`, wired to `editor.referenceSearchType`); a fourth `Boss` button is added there, mirroring the existing NPC button, so `SUPPORTED_REFERENCE_TYPES` being widened actually has a UI affordance instead of only being reachable through inserted-markup validation.

## Failure and Accessibility Rules

- Invalid or stripped markup stays inert; runtime code never trusts arbitrary attributes.
- Recipe-tree embed `div`s get a `normalizeRecipeTreeEmbedElement` pass mirroring `normalizeContentReferenceElement`: `class` is forced to exactly `tp-recipe-tree` (extra classes stripped, same as span reference normalization already does), `data-tp-item-id` must match `/^\d{1,12}$/`, `data-tp-max-depth` must be an integer from `1` through `5` (the public-article contract), and `data-tp-embed-type` must equal `recipe-tree` today. Any invalid value strips the embed markers and leaves inert content rather than silently changing requested depth. New valid tree requests use the three-request queue defined above.
- One failed reference or tree displays a local fallback state and does not reject the entire preview.
- Recipe controls use buttons and `aria-pressed`. Graph nodes gain real keyboard-focus support (`tabindex="0"`, an appropriate `role`, and `Enter`/`Escape` handling) as part of this task's renderer changes — today's shared renderer wires `focusin`/`focusout` to a plain non-focusable `<div>`, so keyboard access does not already work and must not be assumed to transfer for free from reuse.
- Images retain meaningful alt text or an explicit decorative/fallback semantic.
- Pan is pointer-based, zoom is wheel-based, and controls remain reachable without relying only on gestures.

## Test-First Plan

Before production code, add a focused admin contract test that fails until it verifies:

- a new runtime component is used by both hosts;
- sanitizer output preserves canonical tree attributes and boss references;
- the component sanitizes and normalizes images before enhancement;
- reference and tree selectors, sequence protection, local failure states, admin tree fetches, and shared renderer imports are present;
- no iframe or public-article URL is used for admin preview.

The current admin test command is Node's built-in test runner and has neither a browser DOM nor a TypeScript loader. Before writing production runtime code, add `happy-dom` and `tsx` as `data-query-app` development dependencies; change the unit-test command to `node --import tsx --test tests/*.test.mjs`; and write the focused behavioral test by importing the shared TypeScript renderer into a happy-dom fixture. Simulate Tab focus and `Escape`; assert a body-portaled popover has its direct portal theme class; and simulate an unrelated prop change to prove an unchanged embed is not fetched or torn down. In the editor host, assert an open/close reference-panel round trip preserves the mounted preview. The approved non-navigating reference-popover decision means no navigational href is emitted.

After the RED run, implement the smallest shared runtime and admin component needed for the test, run the focused test to GREEN, then run admin typecheck/unit/build, public frontend check, and a local authenticated review-page acceptance for a draft or pending article containing images, all three reference types, and a recipe-tree embed.

Because this task edits the renderer and CSS that `/articles/*` and the public rich editor already ship in production today, typecheck/build passing is not sufficient evidence the public side is unchanged: sibling tasks that touched this same renderer for smaller reasons (`2026-07-12-article-recipe-preview-parity-design.md`, `2026-07-13-article-recipe-tree-pc-wide-layout-design.md`) both required a real running-page check (light-theme runtime check or Chromium audit) before calling the change done, and this task's removal of the hardcoded `crafting-screen` class is a larger structural change to that renderer than either of those. The same class of check — open `/articles/<a recipe-tree article>` on the running public frontend and confirm it is visually unchanged from before this task, not just that it builds — belongs in this task's validation for the same reason.

## Validation and Commit Boundaries

- The admin preview task owns the existing uncommitted `data-query-app/utils/articleEditor.ts` sanitizer change.
- The pre-existing user-editor hydration fix is validated and committed as a standalone checkpoint before shared-runtime extraction, because that extraction also changes `UserArticleRichEditor.vue`; it is never staged with the admin preview files.
- Commit 1 is the shared-runtime extraction, cross-project alias configuration, public compatibility wrapper, renderer tests, and public runtime validation. Commit 2 is the admin preview component, admin test harness, sanitizer/boss-picker updates, host integration, and task devlog closeout.
