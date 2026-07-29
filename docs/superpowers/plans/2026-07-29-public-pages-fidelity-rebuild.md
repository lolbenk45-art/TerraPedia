# Approved Public Pages Fidelity Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` serially. All slices share existing contracts, CSS, and one devlog owner.

**Goal:** Reproduce the approved item/NPC/article information architecture in live Nuxt routes without weakening existing public-page safety contracts or fabricating data.

**Architecture:** Preserve `useDetailLayout`, loading skeletons, preview-image fallback paths, and `RecipeSummaryCard` as compatibility infrastructure. For Item, the approved `hero / layout / card / rail / chain / tally` DOM is the production body rather than a style layer on the legacy detail stack; compatibility classes may remain only as inert contract hooks. New named approved regions are page-specific components in `components/detail/`; contract migration is a ratchet: assertions move/add but never become wider or fewer. Every slice ends with the full and supplemental gates.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, existing public DTOs/crafting models, semantic token CSS, Node tests, tracked `scripts/audit-shoot.mjs`.

---

## Non-negotiable boundaries

- Baselines stay in gitignored `.superpowers/`. The active entry records each confirmed absolute source path, SHA-256, byte size, and mtime; copying mockups into `docs/` needs separate user approval.
- Probe targets are `/items/757` (**泰拉刃**), `/npcs/17` (**商人**), `/npcs/368` (旅商), and `/articles`. Viewports are 1440×1000 and 390×844; CSS uses only frozen whitelist breakpoints, including `max-width: 430px`, never `390px`.
- No API/database/crawler/report work, no fixture content, no unapproved design HTML changes. Missing live information uses a compact explicit state.
- `useDetailLayout.ts`, `usePublicApi.ts`, and `usePublicItemDetail.ts` are read-only protections. The async-boundary regression test **does not exist yet**: Task 0 creates `tests/unit/publicApiFetcher.test.mjs` importing only the injectable `createPublicApiFetcher(config, fetchImplementation, server)` factory (never the `useRuntimeConfig`-bound wrapper), and it runs before and after Item work.
- Pre-existing gate failures on routes outside this plan are **not** repaired here. Task 0 records them; a slice is judged on "no new violation versus that record", and touching an unrelated page to turn a gate green is out of scope.
- `RecipeSummaryCard.vue` is read-only; only a separately approved future task may add an optional prop whose default output stays unchanged.
- `docs/devlog/entries/2026-07-29-approved-public-pages-production.md` is the sole checklist/evidence owner; `current.md` only links to it.
- Item fidelity is body-only: keep the production global navigation and `TerraBreadcrumb`; do not copy the mock top bar, sample strip, mock crumbs, or design note. Keep the existing production container width, but reproduce the approved internal proportions, ordering, density, and material hierarchy.
- Item output stays data-adaptive: Terra Blade defines the common body skeleton; Iron Bar and Flintlock Pistol prove recipe+source and shop-source variants. Existing favorite/history/SEO/loading/error/fallback/expansion behavior remains. No approved-looking control renders unless it invokes an existing real behavior.

## Task 0: Preflight, storage, and existing-work disposition

- [x] Record `git status --short` in the active entry and make a **存量裁定表** for every dirty path: pages, both contract scripts, domain CSS, `detailPagePresentation.ts`, its test, `index.css`, API/item-detail composables, old plan/devlog artifacts, and `.shot.mjs`. Exactly one disposition per path: rebuild-on-top / migrate-then-delete / freeze-read-only / user-owned-untouched.
- [x] Required initial dispositions: pages/contracts/domain CSS rebuild-on-top; `detailPagePresentation.ts` and its test migrate-then-delete after imports move; `usePublicApi.ts` and `usePublicItemDetail.ts` freeze-read-only; unapproved HTML, `reports/`, and the closed `entries/2026-07-29-articles-hifi.md` user-owned-untouched; `front-nuxt/.shot.mjs` delete-after-record — it is **untracked, not gitignored**, and hard-codes machine-specific absolute paths, so leaving it in place permanently dirties `git status`.
- [x] Rule on the widenings the previous attempt already left in `check-detail-layout-contract.mjs` — "rebuild-on-top" must not silently inherit them. Two assertions were relaxed rather than retargeted: `detailLayout\.detailShellClass` / `detailGridClass` gained an optional `(?:, '[^']+')?` tail on both item and NPC, and `evidence-panel dark-card item-coverage-panel` became `dark-card(?: [^']+)* item-coverage-panel(?: [^']+)*`. Task 0 only records the decision and the pre-widening text; the exact class list can only be pinned once the owning slice's markup is final, so the actual restoration happens at that slice's green step. From Task 1 onward the ratchet is measured against the recorded pre-widening text, never against the widened text.
- [x] Record the measured gate baseline in the entry so later reds are attributable: `pnpm run check` **passes** on the current dirty tree (exit 0); `check:visual-blocked-source` passes; `check:loading-skeleton` fails with exactly eight pre-existing `pages/armor-sets/[id].vue` markers and no failure on `items`/`npcs`/`articles`; `check:light-theme`, `check:typography-spacing`, and `check:crafting-wiki-structure` are **runtime probes that require the dev server on `localhost:5176`** and throw a timeout without it.
- [x] Create `tests/unit/publicApiFetcher.test.mjs` covering `createPublicApiFetcher` server/browser base resolution and the pre-`await` capture ordering, and record it green as the Item-slice tripwire.
- [x] Request user authorization before creating a WIP commit, stash, or tag. If declined, the mandatory fallback anchor before each slice is `git diff HEAD > front-nuxt/tmp/rollback/<slice>.patch` plus a copy of the untracked files under the same directory; a slice may not start with no anchor of either kind.
- [x] Mark `2026-07-29-approved-public-pages-production.md` as **SUPERSEDED** by this plan and remove it as an active execution source from `current.md`.
- [x] Reuse tracked `front-nuxt/scripts/audit-shoot.mjs`, but note what it actually has: only `AUDIT_BASE`/`AUDIT_OUT`/`PLAYWRIGHT_CHROMIUM` env inputs, a hard-coded 22-route table, hard-coded 1440×900 and 375×812 viewports, and **no console-error or requestfailed capture** — which this plan's acceptance criteria require. Extend it minimally: env-driven route and viewport overrides plus console/`requestfailed` collection in the emitted JSON, with defaults byte-compatible with the existing R2 baseline invocation so `audit-shoot` keeps its old behavior when the new env vars are unset. Write images only to ignored `front-nuxt/tmp/shots/2026-07-29-public-pages/`; devlog records filename + SHA-256, never binaries.
- [x] **Extract the named-region inventory from the three pinned baselines before any code.** Task 4 judges "missing / reordered named region", so that list must exist as data, not as a reading of the HTML at acceptance time. For each of item v2, NPC merchant v1, and article v22, record in the entry: ordered region name, its one-line purpose, the live DTO fields that feed it, and its degradation path when those fields are absent. A region whose fields do not exist in the live DTO is marked degradation-only **here**, not discovered mid-slice. This table is the sole comparison target in Task 4; the HTML is only its provenance.
- [x] Measure and record the live `/articles` published count. The Task 1 acceptance of 1 feature + 5 reading-list + 6 archive rows needs ≥12 published records; today only `<6` and `≥12` have rulings. Add the missing 6–11 ruling now: feature + up to 5 reading-list, archive rail shows the remainder and is omitted entirely at zero remainder, with no padding and no fabricated rows. If the live count is under 12, the 12-row acceptance is recorded as unreachable-by-data rather than failed.
- [x] Inspect and record reuse mapping for `useCraftingRecipeModel.ts`, `craftingRecipeCompact.ts`, `recipeHierarchyGraphRenderer.ts`, and current NPC condition helpers. New helpers adapt these models; they cannot duplicate their parsing/grouping semantics.
- [x] Centralize the public boundary strings `资料整理中`, `本页阅读数据`, and `当前可用商店资料` as named exports in the existing `utils/publicCopy.ts` — do **not** create an unnamed new "display utility". That file already owns public-facing copy safety (`rawPublicCopyPattern`, `createSafeDisplayText`, from which `safeNpcDisplayText` derives), so the constants inherit its established ownership. Contracts assert the exact promise at each route usage.
- [x] Article decision: set limit to 12 after checking SSR key/page clamp/keyword reset. Backend capacity is already verified — `ArticleController` uses `PaginationParams.resolveLimit(limit, size, 10)` with **no `maxLimit`**, so 12 is honored without any backend change. Page numbers remain deep-linked but boundary drift is accepted (a shared `?page=3` link resolves to different rows at 12/page than at 10/page). `<6` records or a keyword query uses archive-only fold; no topic aggregate means no topic counts and a compact `资料整理中` grid; popular rail derived from current page is labelled `本页阅读数据`.

## Contract-ratchet protocol (before every implementation change)

1. In the active entry, list every affected assertion: file, marker, before-count, destination, and **expected-red reason** (`migration` or `missing implementation`). A red outside this whitelist stops work.
2. Add the destination assertion before removing an old-location assertion. Marker/semantic assertion count may only increase.
3. Regex widening (optional classes, `.*`, wildcard class order) is forbidden. A marker may move page→component/CSS file only with an exact new assertion.
4. Run affected contracts red, then green, and record before/after counts plus retained data/safety markers.
5. Each slice runs `pnpm run check` **and** the static gates it excludes: `check:loading-skeleton` and `check:visual-blocked-source`. `check:loading-skeleton` is judged against the Task 0 record — the eight pre-existing `armor-sets/[id].vue` markers stay red and are not repaired here; any new marker, or any marker on `items`/`npcs`/`articles`, fails the slice.
6. `check:light-theme`, `check:typography-spacing`, and `check:crafting-wiki-structure` are runtime probes needing the dev server on `localhost:5176`; they run in Task 4 with the server up, against a Task 0 baseline captured under the same server. Do not put them in the per-slice loop — without a server they throw a timeout, not a verdict.

## Task 1: Articles first — validate the contract process on the least coupled route

**Production:** `pages/articles/index.vue`, `components/article/ArticleFeatureMeta.vue`, `components/article/ArticleArchiveRail.vue`, `utils/articleArchive.ts`, `utils/publicCopy.ts`. These are list-page regions, so they belong in the existing `components/article/` directory (home of `ArticleComments.vue` et al.), not in `components/detail/`, which holds shared entity-detail parts.

**Contracts:** `check-public-pages.mjs`, `check-front-layout-layering-contract.mjs`.

- [x] Apply the ratchet protocol. Retain the required loading skeleton and canonical shell semantics. **Do not "de-duplicate" the shell classes**: `primitives.css:1` gives `.tp-page-shell` its grid/gap/typography behavior (plus a `max-width: 720px` gap step), while `.tp-public-page-shell` shares one width/margin rule with `.article-layout` at `primitives.css:30` and is therefore already inert on this route. Dropping either class buys no visual change and would force a literal contract marker to be weakened, which the ratchet forbids. Keep the current class set, add none.
- [x] Name the inherited article markers up front, the way the NPC slice does: `article-mast`, `article-featured-story`, `article-featured-story__index`, `article-library-shell`, and `article-archive-row` are already asserted as literals in `check-public-pages.mjs`. Moving that markup into the two components removes those strings from the page file, so each needs an exact destination assertion added **before** the move — expected-red reason `migration`.
- [x] Write red unit tests for 12 rows, six rows, the 6–11 range, `<6`, and keyword-filtered archive partitioning; implement live feature/list/archive/degradation projection.
- [x] Build v22 metadata and rail components with live fields only; use boundary utility for unavailable topic/popular data. Change limit to 12 only after query/SSR/deep-link check.
- [x] Run all gates and `audit-shoot` at desktop, existing 375, and approved 390 probes. Completion record: expected-red list, assertion counts, route screenshot hashes, 1 feature + 5 reading-list + 6 archive rows on unfiltered page one.

## Task 2: NPC second — migrate existing condition semantics, do not reinvent them

**Production:** `pages/npcs/[id].vue`, `components/detail/NpcShopBands.vue`, `utils/npcShopBands.ts`, `utils/publicCopy.ts`.

**Contracts:** `check-detail-layout-contract.mjs`, NPC section of `check-public-pages.mjs`, `check-preview-image-fallback-contract.mjs`.

- [x] Apply protocol and retain exact `entryFallbackIcon` safety marker.
- [x] Move existing `shopConditionsLabel`, `shopConditionSummary`, and `shopConditionGroupKey` semantics into the utility while preserving `safeNpcDisplayText` and stable entry IDs; red-test always/conditional/other ordering. The traveler live-stock wording is route/DOM contract, not a pure test.
- [x] Render approved condition bands through `NpcShopBands.vue` inside retained compatible grid/shell wrappers. Merchant receives residence capability; traveler receives arrival plus `当前可用商店资料`, never complete-pool copy.
- [x] Run all gates and audit `/npcs/17` and `/npcs/368` at all probes; record expected red, assertion counts, hashes, fallback/no-overflow/no-error results.

## Task 3: Item last — transplant the approved body and bind the existing live bundle

**Production:** `pages/items/[id].vue`, `components/detail/ItemRecipeHierarchy.vue`, `utils/itemRecipeHierarchy.ts`, `utils/publicCopy.ts`.

**Contracts:** item sections of `check-detail-layout-contract.mjs`, `check-public-pages.mjs`, `check-loading-skeleton-contract.mjs`, `check-preview-image-fallback-contract.mjs`.

- [x] Run the Task 0 `tests/unit/publicApiFetcher.test.mjs` regression before work and again after recomposition; freeze its composables. Record that this step replaces the current partial Item implementation rather than layering another visual patch on it.
- [x] Apply the ratchet protocol first. Add exact destination assertions for the production body's `item-approved-body`, approved hero `plinth / ident / metrics`, two-column `col / rail`, primary/secondary `card`, and the `chain / band / band-body / tally / usage / facts / anchors / related` regions. Preserve exact primary-preview, skeleton, source/image, coin, safe-copy, SSR, and `RecipeSummaryCard` tripwires. If CSS moves from the page, retarget each CSS assertion to `assets/css/domains/detail-pages-redesign.css` exactly; do not broaden it.
- [x] Keep the existing `buildCraftingRecipeModel` adapter and red-test any additional projection needed by the approved bands, alternatives, stations, procurement tally, stable links, and empty data. `ItemRecipeHierarchy.vue` must render the approved band/fork/tally DOM from that model; it must not duplicate raw recipe traversal.
- [x] Replace the loaded Item template body with the approved structure. Keep production navigation/breadcrumb and outer width; omit mock sample navigation and design notes. Bind hero, prices, stages, sources, usages, equipment/buff/loot/image facts, anchors, and related records to the existing live bundle. Missing core data uses compact `资料整理中`; absent optional capability modules are hidden. Existing long usage lists keep the current six-row preview and real expand/collapse behavior.
- [x] Port the approved dark material hierarchy into `assets/css/domains/detail-pages-redesign.css` under `.item-approved-body`, mapping every color/elevation/control to existing semantic theme tokens. Add exact `morning-paper` and `warm-slate` adaptations without changing DOM or introducing raw page palettes. CSS media queries use the frozen whitelist (`1180 / 900 / 640 / 430` as needed); 390×844 remains a probe viewport, not a breakpoint.
- [x] Audit `/items/757` (泰拉刃), `/items/22` (铁锭), and `/items/95` (燧发枪) at 1440×1000 and 390×844 in all three themes. The only accepted visual differences from the approved files are global nav/breadcrumb, existing production container width, and real data content. Completion record includes expected-red whitelist, assertion counts, screenshot hashes, visible live variants, preserved expansion/favorite behavior, and zero new request/error/overflow/image failures.

## Task 4: Final acceptance and stop rule

- [x] Fresh-restart the front server on `localhost:5176`, then run the full audit, the approved targeted probes, and the three server-dependent gates deferred from the slices (`check:light-theme`, `check:typography-spacing`, `check:crafting-wiki-structure`) against their Task 0 same-server baseline. Compare named sections against the SHA-pinned local approved references.
- [x] A missing/reordered named region, generic-card substitute, lost safety marker, broken image, console/request failure, overflow, unreadable text, invisible focus, or sub-44px primary control returns to its owner task.
- [x] Run `pnpm run check`, both static supplemental gates, the three server-dependent gates, `git diff --check`, `git status --short`, and a path-only scope review. `git status --short` must differ from the Task 0 baseline only by this plan's owned paths plus the deleted `.shot.mjs`; anything else is scope leakage and returns to its owner task. Keep the entry active and the work uncommitted until user acceptance.

The initial three-route technical acceptance is complete. The user authorized the Item result as a focused checkpoint and requested further visual fidelity work on the remaining approved NPC and Articles pages; the entry remains active.

## Task 5: NPC approved-sample fidelity continuation

- [ ] Recompare the live NPC body against merchant, guide, pirate, and traveling-merchant v1 in that order. Preserve the production navigation, breadcrumb, outer container, existing capability logic, and all current interactions.
- [ ] Before production edits, record exact contract reds for approved hero/material/rail/module destinations. Add or retarget exact assertions only; do not widen regexes or remove safety markers.
- [ ] Adapt the approved body by live capability: residence/service/shop/arrival/drop regions render only when supported, and traveler stock remains labelled `当前可用商店资料`.
- [ ] Verify representative NPC routes under all three themes at 1440x1000 and 390x844 with no console/request/image/overflow regression, then run the full and supplemental gates.

## Task 6: Articles v22 fidelity continuation

- [ ] Recompare the production fold and content shell against `articles-story-led-v22.html`, retaining the current 12-row live projection, query/page behavior, production navigation, and real article links.
- [ ] Record exact contract reds before markup or CSS changes. Keep feature, five-entry reading stack, dense archive rows, current-page reading label, and topic-data degradation truthful to available fields.
- [ ] Match v22 material hierarchy, typography, control density, and responsive composition through existing semantic theme tokens; do not add fake topic/popular aggregates.
- [ ] Verify all three themes at 1440x1000 and 390x844 with no console/request/image/overflow regression, then run the full and supplemental gates.

## Task 7: Integrated visual acceptance

- [ ] Run the full frontend gate, supplemental static gates, runtime-baseline comparison, focused unit tests, `git diff --check`, and path-only scope review.
- [ ] Keep the entry active until the user visually accepts NPC and Articles. Do not push or include user-owned design HTML, historical devlogs, or `reports/`.
