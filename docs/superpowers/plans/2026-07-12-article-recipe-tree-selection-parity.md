# Article Recipe Tree Selection Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each article recipe-tree embed expose the same version and recipe-option choice semantics as the crafting page, including every root recipe in a selected variant.

**Architecture:** The article DOM renderer imports `buildCraftingRecipeModel` and keeps selection state local to each hydrated embed. It resolves one raw root from the selected model option, then replaces only that embed’s child DOM when a version or recipe button is pressed. The backend API remains unchanged.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, existing crafting recipe model, native DOM, Chromium contract check.

---

### Task 1: Establish a failing multi-recipe article contract

**Files:**
- Modify: `front-nuxt/scripts/check-article-content-references.mjs:220-725`
- Test: `front-nuxt/scripts/check-article-content-references.mjs`

- [ ] **Step 1: Replace the single-route fixture assertions with a desktop variant that has three roots and a second version**

Give the desktop fixture `recipeCount: 3` and three `roots` with distinct `recipeId`, item names and material image URLs. Retain a second console variant. Add browser assertions for the article renderer’s public DOM contract:

```js
assert(recipeEmbed.querySelectorAll('[data-article-recipe-role="recipe-option-selector"] button').length === 3,
  'article recipe tree must expose every recipe root in the selected variant')
assert(recipeGraph.textContent.includes('配方一材料'), 'first recipe is initially rendered')
recipeEmbed.querySelector('[data-article-recipe-option-key="recipe-2"]').click()
assert(recipeEmbed.querySelector('.article-recipe-tree__graph')?.textContent.includes('配方二材料'),
  'selecting the second recipe must redraw its root tree')
assert(!recipeEmbed.querySelector('.article-recipe-tree__graph')?.textContent.includes('配方一材料'),
  'selected recipe graph must not merge another root into its relations')
```

Then add a version-button click assertion that verifies the console root appears only after that version is explicitly selected. Delete the current assertions that call non-default roots forbidden or describe the embed as `默认路线`.

- [ ] **Step 2: Run RED**

Run: `cd front-nuxt && pnpm run check:article-content-references`

Expected: FAIL because the current article renderer keeps only `slice(0, 1)` and has no selectable recipe buttons.

### Task 2: Reuse the crafting model and render local selectors

**Files:**
- Modify: `front-nuxt/pages/articles/[slug].vue:1-15, 503-530, 1216-1340, 2894-2910`
- Test: `front-nuxt/scripts/check-article-content-references.mjs`

- [ ] **Step 1: Add a raw-root resolver tied to the crafting model**

Import `buildCraftingRecipeModel`. Add an article-only resolver with this contract:

```ts
const resolveArticleRecipeTreeSelection = (tree, variantKey = '', recipeKey = '') => {
  const model = buildCraftingRecipeModel(tree, variantKey, recipeKey)
  const variantIndex = model.variants.findIndex(variant => variant.key === model.activeVariant?.key)
  const rawVariant = (Array.isArray(tree?.variants) ? tree.variants : [])[variantIndex] ?? null
  const rawRoots = Array.isArray(rawVariant?.roots) ? rawVariant.roots : []
  const root = rawRoots.find(candidate => String(candidate.recipeId ?? '') === model.activeRecipe?.recipeId) ?? rawRoots[0] ?? null
  return { model, root }
}
```

Do not use `slice(0, 1)` in article root selection. Preserve the legacy top-level fallback only when `tree.variants` is empty.

- [ ] **Step 2: Create controls and rerender only the affected embed**

Extend `renderArticleRecipeTreeResult` with local `variantKey` and `recipeKey` closure state. After `renderArticleRecipeTreeShell`, append a `.article-recipe-tree__selectors` container:

```ts
button.dataset.articleRecipeRole = 'recipe-option-selector'
button.dataset.articleRecipeOptionKey = option.key
button.setAttribute('aria-pressed', String(option.key === selection.model.activeRecipe?.key))
button.addEventListener('click', () => renderSelection(variantKey, option.key))
```

Render version buttons only for `model.variants.length > 1`, option buttons only for `activeVariant.options.length > 1`, and call `appendArticleRecipeTreeGraph(node, selection.root ? [selection.root] : [], maxDepth)`. Version selection resets the option key so the crafting model chooses the first option in the selected version. Keep the complete-tree link unchanged.

- [ ] **Step 3: Add scoped selector styling**

Make selectors horizontally scrollable within the embed, use the existing `tp-control recipe-selector-button` styling vocabulary, and provide an `active` class that meets the current light-theme contrast. Do not change shared crafting styles.

- [ ] **Step 4: Run GREEN**

Run: `cd front-nuxt && pnpm run check:article-content-references`

Expected: `article content reference checks passed` with the three-option and two-version fixture.

### Task 3: Integrated validation and handoff

**Files:**
- Modify: `docs/devlog/entries/2026-07-12-article-embedded-recipe-tree-light.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Run project checks**

Run:

```bash
cd front-nuxt && pnpm run check
git diff --check
```

Expected: exit code `0`.

- [ ] **Step 2: Run a real multiple-recipe browser comparison**

Query the local API until a `variant.recipeCount >= 2` result is found. Open its article embed and `/crafting?itemId=<id>`, select each visible article recipe option, and record matching version label, option label/recipe ID, unique materials, no cropped images, and zero document horizontal overflow.

- [ ] **Step 3: Update the devlog**

Demote the prior `ready-for-commit` entry to `active`, record the prior false acceptance (`slice(0, 1)`), RED/GREEN evidence, exact real item ID, browser results, and residual risk. Leave changes uncommitted unless the user explicitly requests a commit.
