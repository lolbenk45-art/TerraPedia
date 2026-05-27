# Public UI Visual System V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop one-off public UI fixes and rebuild TerraPedia public pages around one visual system, one crafting information model, one detail-page shell, one catalog/search contract, and enforceable visual gates.

**Architecture:** Freeze a small CSS and layout foundation first, then migrate page families through disjoint ownership. Crafting, detail pages, catalog/search/nav, automation, and legacy CSS migration are separate workstreams with explicit file ownership and cross-check gates.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, CSS, existing TerraPedia public API DTOs, existing front-nuxt runtime visual scripts.

---

## Source Of Decision

This v1 plan merges the multi-agent cross review completed on 2026-05-27.

- Crafting plan owner reviewed recipe semantics, route samples, and component boundaries.
- Detail/catalog plan owner reviewed entity detail structure, search/query contract, and navigation migration.
- Visual-system plan owner reviewed CSS layering, hard visual rules, check scripts, and multi-agent file boundaries.

The shared verdict was: the direction is correct, but implementation must start only after the P0 foundation is frozen. Without that gate, agents will keep adding local fixes and the UI will remain inconsistent.

## Repair Loop

Each execution phase follows this cycle:

1. Execute only the files owned by that phase.
2. Run the phase checks listed in this plan.
3. Run a review focused on spec compliance, then a review focused on code quality.
4. If either review finds a critical or important defect, patch this plan or the implementation, re-run the affected checks, and repeat.
5. Continue to the next phase only after the current phase has no blocking review findings.

Do not skip from a failed phase into a later phase. Do not broaden scope to unrelated pages to make a check pass.

## Non-Goals

- Do not write database rows.
- Do not run crawler/import/backfill work.
- Do not change data source chains.
- Do not redesign the brand into wiki.gg or generic SaaS styling.
- Do not use backend changes for layout-only problems.
- Only open a backend/API task if the UI cannot truthfully express recipe semantics with current DTO fields.

## P0 Foundation Gate

P0 must finish before Crafting, Detail, or Catalog/Nav agents start broad page migration.

### Task 1: Freeze CSS Layers And Imports

**Files:**
- Modify: `front-nuxt/assets/css/app.css`
- Modify: `front-nuxt/nuxt.config.ts`
- Create: `front-nuxt/assets/css/tokens.css`
- Create: `front-nuxt/assets/css/primitives.css`
- Create directory as needed: `front-nuxt/assets/css/domains/`
- Create directory as needed: `front-nuxt/assets/css/pages/`

- [ ] Define CSS load order as `legacy -> tokens -> primitives -> domains -> page exceptions`, or an equivalent cascade-layer order.
- [ ] Ensure Nuxt global CSS entries do not load legacy page-family CSS after page exceptions.
- [ ] Keep existing legacy CSS available during migration, but new work must depend on tokens/primitives/domain CSS instead of extending old graph/detail/catalog selectors.
- [ ] Document the exact import order in `app.css`.
- [ ] Do not let page-family agents modify `hifi-preview.css` during this task.

### Task 2: Freeze Primitive Contracts

**Files:**
- Create/modify: `front-nuxt/assets/css/tokens.css`
- Create/modify: `front-nuxt/assets/css/primitives.css`

- [ ] Define tokens for color, typography, spacing, radius, shadow, z-index, container widths, and motion duration.
- [ ] Define primitives for `tp-page-shell`, `tp-container`, `tp-page-head`, `tp-panel`, `tp-card`, `tp-toolbar`, `tp-relation-grid`, `tp-scroll-region`, and `tp-subsection`.
- [ ] Define that `tp-panel` is a page module and `tp-card` is a repeated item; `tp-panel .tp-panel` and `tp-card .tp-card` are blocked unless explicitly whitelisted.
- [ ] Define local dense tokens inside recipe sheets and relation rows as tokens/chips, not cards.

### Task 3: Freeze Hard Visual Rules

**Files:**
- Create/modify: `front-nuxt/assets/css/tokens.css`
- Create/modify: `front-nuxt/assets/css/primitives.css`

- [ ] Ordinary cards use `8px` radius; large panels use at most `10px`.
- [ ] Visible body text, data fields, buttons, labels, tables, and relation rows must be at least `12px`.
- [ ] Mobile core reading text must be at least `14px`.
- [ ] `10px` or `11px` text is allowed only for non-core decoration and must be whitelisted in the visual-system check.
- [ ] Touch targets must be at least `44x44`.
- [ ] The page root must not horizontally scroll.
- [ ] Internal horizontal scroll is allowed only for whitelisted containers such as table/detail comparison areas, not for the primary reading path.
- [ ] `overflow-x: hidden` on `html`, `body`, `main`, or page shells is blocked when it masks layout overflow.

### Task 4: Create Page Exception Registry

**Files:**
- Create: `front-nuxt/assets/css/pages/README.md`

- [ ] Record every page-level CSS exception with page, reason, owner, allowed selector scope, and deletion condition.
- [ ] Block unregistered page exceptions from becoming a new style island.

## P1 Crafting Page Rebuild

Crafting is the first user-facing migration because it is the current pain point.

### Task 5: Define Crafting View Model

**Files:**
- Create: `front-nuxt/composables/useCraftingRecipeModel.ts`
- Modify: `front-nuxt/types/public-api.ts`

- [ ] Normalize API recipe tree into one page model consumed by all crafting components.
- [ ] Keep route URL contract as `itemId` and `maxDepth`; do not force catalog `q/pageSize` into `/crafting`.
- [ ] Preserve existing API fields for group members, stations, quantities, and children.
- [ ] If `expandable`, `cycleDetected`, `isReference`, or `referenceKey` are available from backend DTOs, expose them in front-end types and model state.
- [ ] Do not invent AND/OR station semantics in the front end.

### Task 6: Replace Crafting Information Architecture

**Files:**
- Modify: `front-nuxt/pages/crafting/index.vue`
- Create/modify: `front-nuxt/components/crafting/CraftingTargetBar.vue`
- Create/modify: `front-nuxt/components/crafting/RecipeVariantSelector.vue`
- Create/modify: `front-nuxt/components/crafting/RecipeOptionSelector.vue`
- Create/modify: `front-nuxt/components/crafting/RecipeSheet.vue`
- Create/modify: `front-nuxt/components/crafting/MaterialExpansionList.vue`
- Create/modify: `front-nuxt/components/crafting/RecipeCompareTable.vue`
- Create/modify: `front-nuxt/components/crafting/CraftingLegend.vue`
- Create/modify: `front-nuxt/assets/css/domains/crafting.css`

- [ ] Page path becomes: target bar -> recipe variant selector -> recipe option selector -> primary RecipeSheet -> material expansion list -> compare table -> legend/data note.
- [ ] Remove first-screen duplicate interpretation: no simultaneous `RecipeSummaryCard`, full tree, and root-node rail.
- [ ] Keep one active root recipe in the main content at a time.
- [ ] Item detail pages may later embed only a compact recipe summary or link to `/crafting`; full recipe switching stays on `/crafting`.

### Task 7: Lock RecipeSheet Rules

**Files:**
- Create/modify: `front-nuxt/components/crafting/RecipeSheet.vue`
- Create/modify: `front-nuxt/components/crafting/MaterialSlot.vue`
- Create/modify: `front-nuxt/components/crafting/AnyMaterialGroupDisclosure.vue`
- Create/modify: `front-nuxt/components/crafting/StationRequirementGroup.vue`
- Create/modify: `front-nuxt/assets/css/domains/crafting.css`

- [ ] RecipeSheet is semantically `materials -> stations/conditions -> output`.
- [ ] Desktop may use three columns.
- [ ] Tablet may use two columns or flowing sections.
- [ ] Mobile must stack into one column without primary-path horizontal scroll.
- [ ] Any-material group renders as one material slot with visible `任选其一`.
- [ ] Group members use slash or option tokens, never `+` as if all are required.
- [ ] A group node without item id must not link to `/items`; only members link to concrete item pages.
- [ ] Multiple stations render as icon+name options separated by `/`, without standalone `或`.
- [ ] If current API does not expose station operator, label the area as station options and do not claim AND/OR semantics.
- [ ] Conditions render separately from crafting stations.
- [ ] Nested RecipeSheets use `tp-subsection` or recipe-specific nested styling, not `tp-panel` or `tp-card`.

### Task 8: Lock Crafting Route Samples

**Routes:**
- `/crafting?itemId=556&maxDepth=3`
- `/crafting?itemId=8&maxDepth=3`
- `/crafting?itemId=675&maxDepth=3`
- `/crafting?itemId=757&maxDepth=3`
- `/crafting?itemId=5000&maxDepth=5`

- [ ] Mechanical Worm must show two recipe options clearly and one active RecipeSheet.
- [ ] Torch must show Any Wood as `任选其一 x1`; members must not look all required.
- [ ] True Night's Edge must show direct top materials clearly; child recipe default collapsed.
- [ ] Terra Blade must not unfold the whole chain by default.
- [ ] Terraspark Boots must keep child alternative recipes local to the expanded material.

## P2 Detail Pages

### Task 9: Define Detail Shell

**Files:**
- Modify: `front-nuxt/composables/useDetailLayout.ts`
- Create/modify: `front-nuxt/components/detail/EntityDetailShell.vue`
- Create/modify: `front-nuxt/components/detail/EntityHero.vue`
- Create/modify: `front-nuxt/components/detail/SummaryStrip.vue`
- Create/modify: `front-nuxt/components/detail/DetailContentGrid.vue`
- Create/modify: `front-nuxt/components/detail/EvidencePanel.vue`
- Create/modify: `front-nuxt/assets/css/domains/detail.css`

- [ ] Extend detail kind to `item | npc | boss | buff | biome`.
- [ ] Detail structure is `DetailShell -> DetailHero -> SummaryStrip -> ContentGrid -> EvidencePanel`.
- [ ] On mobile, EvidencePanel appears after main content.
- [ ] On desktop, EvidencePanel may be right rail or grid tail, but must use the same component contract.

### Task 10: Lock Detail Module Order

**Files:**
- Modify: `front-nuxt/pages/items/[id].vue`
- Modify: `front-nuxt/pages/npcs/[id].vue`
- Modify: `front-nuxt/pages/bosses/[id].vue`
- Modify: `front-nuxt/pages/buffs/[id].vue`
- Modify: `front-nuxt/pages/biomes/[id].vue`

- [ ] Item order: recipe summary, sources, buff/effect relations, images, evidence.
- [ ] NPC order: core stats, loot, shop, buff/effect relations, living preferences, related items, evidence.
- [ ] Boss order: summon, members, loot, mechanics, rewards, evidence.
- [ ] Buff order: sources, inflicting entities/items, immune targets, evidence.
- [ ] Biome order: resources, related biomes/entities, source sync, evidence.
- [ ] Buff/Biome must stop using `search-suggestion-band` as detail relation layout.

### Task 11: Lock EvidencePanel Fields

**Files:**
- Create/modify: `front-nuxt/components/detail/EvidencePanel.vue`

- [ ] Data status.
- [ ] Source provider/page when available.
- [ ] Sync or aggregate time when available.
- [ ] Relation counts.
- [ ] Missing-data explanation.
- [ ] Return or retry action.

## P3 Catalog, Search, Navigation

### Task 12: Freeze Query Contract

**Files:**
- Create/modify: `front-nuxt/composables/useCatalogQueryState.ts`
- Modify relevant list/search pages.

- [ ] Canonical query keys: `q`, `page`, `pageSize`, `filter`, `sortBy`, `sortDirection`, `view`.
- [ ] Alias read map: `keyword -> q`, `search -> q`, `isTownNpc/town -> filter=town`.
- [ ] After user interaction, write only canonical keys.
- [ ] Default values are not written to URL.
- [ ] Existing old links must still load.

### Task 13: Define Catalog Shell

**Files:**
- Create/modify: `front-nuxt/components/catalog/CatalogPageShell.vue`
- Create/modify: `front-nuxt/components/catalog/CatalogControlBar.vue`
- Create/modify: `front-nuxt/components/catalog/CatalogFilterRail.vue`
- Create/modify: `front-nuxt/components/catalog/CatalogFilterSheet.vue`
- Create/modify: `front-nuxt/components/catalog/EntityResultGrid.vue`
- Create/modify: `front-nuxt/components/catalog/EntityResultCard.vue`
- Create/modify: `front-nuxt/assets/css/domains/catalog.css`
- Create/modify: `front-nuxt/assets/css/domains/entity.css`

- [ ] List structure is `PageHead -> CatalogShell(ControlBar + FilterRail/Sheet + ResultStage + PaginationDock)`.
- [ ] ResultStage includes loading, error, empty, and result states.
- [ ] Whole-card link semantics are consistent for clickable result cards.
- [ ] Page size lives in PaginationDock or one shared control contract, not scattered per page.

### Task 14: Migrate Catalog/Search/Nav Pages

**Files:**
- Modify: `front-nuxt/pages/items/index.vue`
- Modify: `front-nuxt/pages/npcs/index.vue`
- Modify: `front-nuxt/pages/bosses/index.vue`
- Modify: `front-nuxt/pages/buffs/index.vue`
- Modify: `front-nuxt/pages/armor-sets/index.vue`
- Modify: `front-nuxt/pages/projectiles/index.vue`
- Modify: `front-nuxt/pages/search.vue`
- Modify: `front-nuxt/pages/search-tool.vue`
- Modify: `front-nuxt/components/TerraNav.vue`
- Modify: `front-nuxt/components/TerraBreadcrumb.vue`
- Create/modify: `front-nuxt/assets/css/domains/nav.css`

- [ ] `/search` is the public search page.
- [ ] `/search-tool` redirects to `/search` or is moved out of public navigation as an experiment page.
- [ ] TerraNav top-level entries max out at `首页 / 搜索 / 物品 / NPC / Boss / 合成`.
- [ ] Resource menu entries point to Buff, Biome, Projectiles, Armor, Categories, Articles, About.
- [ ] Resource-menu search entry points only to `/search`.

## P4 Automation And Runtime Gates

Automation owns scripts and package scripts. Foundation does not edit check scripts.

### Task 15: Static Visual System Contract

**Files:**
- Create/modify: `front-nuxt/scripts/check-visual-system-contract.mjs`
- Modify: `front-nuxt/package.json`

- [ ] Block core visible text below `12px` unless whitelisted.
- [ ] Block `10px/11px` core text.
- [ ] Block page-root horizontal scrolling fixes such as `overflow-x:hidden` on root shells.
- [ ] Block unregistered card-in-card selectors.
- [ ] Block new business selectors appended to `hifi-preview.css` beyond the migration baseline.
- [ ] Allow internal horizontal scroll only on registered `tp-scroll-region` or domain-specific whitelist containers.

### Task 16: Runtime Visual Regression Expansion

**Files:**
- Modify: `front-nuxt/scripts/check-visual-regression.mjs`
- Modify: `front-nuxt/scripts/check-crafting-wiki-structure-runtime.mjs`

- [ ] Use stable `data-crafting-role`, `data-detail-role`, and `data-catalog-role` markers instead of fragile CSS class assumptions.
- [ ] Check `document.documentElement.scrollWidth <= window.innerWidth + 1`.
- [ ] Check touch targets are at least `44x44`.
- [ ] Check primary container center deviation is no more than `24px`.
- [ ] Check visible core text computed font size meets the rule.
- [ ] Check image slots are nonblank and not overflowing.
- [ ] Keep failure reports and screenshots under `reports/front-nuxt/visual-quality/`.

### Task 17: Runtime Route Matrix

**Viewports:**
- `390x900`
- `768x1024`
- `1440x1000`
- `1728x1050`

**Routes:**
- `/`
- `/search`
- `/items`
- `/npcs`
- `/bosses`
- `/buffs`
- `/biomes`
- `/armor-sets`
- `/projectiles`
- `/items/1`
- `/npcs/22`
- `/bosses/35`
- `/buffs/5`
- `/biomes/2`
- `/crafting`
- `/crafting?itemId=556&maxDepth=3`
- `/crafting?itemId=8&maxDepth=3`
- `/crafting?itemId=675&maxDepth=3`
- `/crafting?itemId=757&maxDepth=3`
- `/crafting?itemId=5000&maxDepth=5`

- [ ] Validate no page-root horizontal scroll.
- [ ] Validate no incoherent overlap.
- [ ] Validate loading, empty, error, and result states where feasible.
- [ ] Validate crafting station options do not render standalone `或`.
- [ ] Validate any-material groups are labeled as optional choice.

## Multi-Agent Ownership

- Foundation agent: `tokens.css`, `primitives.css`, `app.css` import contract, CSS layer/readme files only.
- Crafting agent: `front-nuxt/pages/crafting/index.vue`, `front-nuxt/components/crafting/*`, `front-nuxt/composables/useCraftingRecipeModel.ts`, `front-nuxt/assets/css/domains/crafting.css`.
- Detail agent: `front-nuxt/components/detail/*`, `front-nuxt/composables/useDetailLayout.ts`, five detail pages, `front-nuxt/assets/css/domains/detail.css`.
- Catalog/Nav agent: catalog components, list pages, search pages, `TerraNav`, `TerraBreadcrumb`, query composables, `domains/catalog.css`, `domains/entity.css`, `domains/nav.css`.
- Automation agent: `front-nuxt/scripts/check-*.mjs`, `front-nuxt/package.json`.
- Integration/Migration agent: `front-nuxt/assets/css/hifi-preview.css` cleanup and final cross-domain CSS conflict resolution.

No two agents may write the same CSS domain file, page family, check script, or legacy CSS migration file in the same execution phase.

## Execution Order

1. P0 Foundation.
2. P4 static check skeleton, with only foundation-safe assertions enabled.
3. P1 Crafting and matching crafting runtime checks.
4. P2 Detail pages.
5. P3 Catalog/Search/Nav.
6. P4 full route matrix.
7. Integration/Migration removes legacy CSS conflicts and re-runs all gates.

## Completion Gates

- `cd front-nuxt && pnpm run check`
- Crafting runtime checks include the five required crafting routes.
- Visual regression route matrix includes mobile, tablet, desktop, and wide viewports.
- Manual screenshot review confirms the original complaint is resolved on `/crafting?itemId=556&maxDepth=3`.
- `git status --short` is reviewed before any commit, and unrelated dirty files are not included.
