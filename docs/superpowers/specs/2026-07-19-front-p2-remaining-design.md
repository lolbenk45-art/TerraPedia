# Front P2 Remaining Work Design

## Goal

Complete WP-11.2, WP-11.3, WP-11.4, WP-12, WP-13, and WP-14 from
`feat/front-p2-wp11-tokens-preview` without pushing or merging into `main`,
then assemble the locally validated results on `feat/front-p2-integration` for
user acceptance.

## Delivery Model

Each work package uses its own branch, worktree, implementation plan, and
devlog entry. The packages form a serial cumulative chain in this order:

1. WP-11.2 default layout
2. WP-11.3 theme selector cleanup
3. WP-11.4 catalog stylesheet promotion
4. WP-12 breakpoint convergence
5. WP-13 long-page governance
6. WP-14 focused closure batch

After a package passes its focused and full gates, its result is integrated
locally into `feat/front-p2-integration`. The integration branch is the only
user-acceptance candidate. It serves the public frontend at
`http://127.0.0.1:5181` by starting the Nuxt server with an explicit
`PORT=5181` override — no repository config defines this port, so the
integration plan must record the exact launch command — and uses the backend
on port `18088` (the local `APP_PORT` convention); package worktrees use
isolated temporary ports.

## WP-11.2: Default Layout

Create `front-nuxt/layouts/default.vue` as the single owner of `TerraNav` and
`TerraFooter`. Remove the copied shell components from all public page files
and from `error.vue` while preserving each page's main landmark, state
branches, and CSS ownership.

The home page publishes its live item total through Nuxt shared state. The
default layout consumes that state and passes the resulting label to
`TerraFooter`; other routes receive the same live value once home data is
available and retain a truthful unavailable or loading fallback rather than a
hard-coded count. Contract checks move their shell assertions from individual
pages to the layout and explicitly verify the shared-state channel.

This package changes ownership only. Route output, keyboard order, responsive
geometry, and authenticated behavior remain equivalent.

## WP-11.3: Theme Selector Cleanup

Remove `[data-theme="light"]` only from selector groups where it is a runtime
theme alias. Preserve the compatibility normalization in the theme store so
old persisted `light` values still become `morning-paper`. Retain explicit
compatibility declarations where they are required before normalization.

The occurrence scale is large (~817 selector hits across six stylesheets,
concentrated in `hifi-preview.css` and `light-theme-contrast-fixes.css`), so
manual per-selector judgment is not acceptable. The implementation plan must
first define one machine-checkable discrimination rule — the default rule: a
`[data-theme="light"]` selector is a removable alias when the same rule block
also targets `[data-theme="morning-paper"]` with identical declarations;
anything not matched by the rule is listed for explicit review — and encode
that rule as a scripted scan before any removal starts.

Update public-page, visual-system, navigation-layout, and typography contracts
in the same package. The typography runtime matrix becomes `morning-paper`
and `warm-slate`; it must no longer force an impossible `light` DOM state.
Dark, morning-paper, and warm-slate screenshots remain visually equivalent.

## WP-11.4: Catalog Stylesheet Promotion

Promote the complete contents of `assets/css/catalog-image-fixes.css` into
`assets/css/domains/catalog.css`, preserving cascade order and selector order.
Update `app.css`, source contracts, visual-regression inventories, loading and
image-fallback contracts, and the CSS ratchet. Remove the retired patch file
and its budget instead of leaving a forwarding import.

This is a file-ownership migration. The seven catalog list pages must remain
pixel-equivalent at the acceptance viewports.

## WP-12: Breakpoint Convergence

Converge width breakpoints in two ordered moves, both preserving the "no
responsive redesign" rule:

1. **Drift merge.** Measured usage shows `720px` (20 hits) and `1180px`
   (11 hits) are the dominant boundaries; around them sit a set of
   near-miss values written by hand (e.g. 1024/1020, 980/960). The
   implementation plan derives the exact merge table from a fresh survey,
   under a hard cap: a value merges into a neighbor only when the shift is
   at most 24px; anything farther (e.g. 760, 780, 820, 900, 1080) is left
   in place and listed for later review, never force-merged. Complement
   pairs are NOT drift: `min-width: 721px` is the correct complement of
   `max-width: 720px` (as is 861 to 860) and must be preserved as pairs,
   not collapsed onto the same number.
2. **Whitelist contract.** After the merge, freeze the surviving set of
   boundaries — expected to include `720`, `1180`, and the genuinely
   independent minor breakpoints `640`, `520`, and `980`, which are NOT
   force-converged because moving them (e.g. 640→720 is an 80px shift)
   would be a responsive redesign. Add a source contract that rejects any
   new min/max width outside the frozen list, where each frozen boundary
   `N` admits both `max-width: Npx` and its complement `min-width: (N+1)px`.
   The final list membership is decided by the measured post-merge survey
   in the implementation plan, not by this spec.

Media features such as hover, reduced motion, orientation, resolution, print,
and container queries are outside the width whitelist and remain valid.
Validate at widths 375, 768, and 1440.

## WP-13: Long-Page Governance

### Biome Index

Paginate complete biome groups using a deterministic content-cost budget,
rather than browser-measured height. The algorithm estimates each group's
rendered cost from its item count and packs groups until the page budget is
reached. A single oversized group is split into stable continuation segments.
Segments keep the original group title and add an accessible continuation
label.

The current page is represented by `?page=N`. Invalid or out-of-range values
resolve to the nearest valid page, and any filter or content-set change resets
to page 1. Server rendering, refresh, sharing, and browser history must restore
the same page. Each rendered page targets a mobile document height below
9000px — a new runtime contract to be created in this package (no such
contract exists today); the implementation plan must record the measured
current mobile height of `/biomes` as the baseline justifying the budget
value before the contract is written.

The biome index currently has no pagination at all (`useCatalogRouteSync`
serializes only `q` and `group`), so this sub-package adds the page
parameter, its interaction with existing filters, SSR restoration, and the
group-packing algorithm from scratch. It is the largest single item in WP-13
and is sequenced first within the package.

### Other Long Pages

- Biome detail renders non-empty drop groups as native `details` elements;
  the first group is open and the remaining groups are closed. Follow the
  existing disclosure pattern already used by NPC and boss detail pages.
- Crafting trees on mobile initially expose the root and first level. Deeper
  levels remain keyboard-operable and expand on demand. Desktop behavior is
  unchanged. Note the current `RecipeCraftingGraph` flattens the recursive
  tree into a linear render list, so this is a structural rework of the
  render model with its own collapse state, not a styling change — plan and
  budget it accordingly.
- The home footer is collapsed by default on mobile and expanded by default
  above the mobile breakpoint. Its control exposes expanded state and remains
  usable without pointer input.

## WP-14: Focused Closure Batch

WP-14 remains one branch and plan, but uses three focused commits:

1. Accessibility: add a skip link, raise governed 9-11px text to at least
   12px, make breadcrumbs data-driven `NuxtLink` navigation (they currently
   render plain `<a>` elements), and add the missing polite live regions.
2. Data truthfulness: feed `TerraFooter` and `search-tool` from the existing
   `/statistics/overview` flow (removing the hard-coded `6,154`, `14,746`,
   and search-tool quick-entry counts), retain the search-tool route with an
   explicit prototype-comparison label, redirect numeric category ids to
   their slug routes with an HTTP 301, and unify search copy and status
   states in Chinese.
3. Account behavior: redirect a successful password change to login and
   converge `TerraNav` visitor initialization so it does not produce duplicate
   failed authentication requests.

Home original-article seeding stays on the existing admin-API path
(`scripts/content/seed-ac-home-articles.mjs` via `/admin/articles`); no
Flyway SQL seed is added. The guard contracts that fail when
`V55__seed_ac_home_original_articles.sql` exists remain authoritative and
untouched.

No crawler action, database migration or backfill, visual redesign, new
endpoint, or data pipeline change belongs to these packages.

## Testing Strategy

Every behavior or contract change follows RED-GREEN-REFACTOR: add the narrowest
failing source/runtime contract, observe the expected failure, implement the
minimum change, and rerun the focused check before the full frontend gate.

Each package records:

- focused contract results;
- `pnpm run check` from `front-nuxt`;
- `git diff --check`;
- runtime screenshots or browser evidence at its affected routes and
  viewports;
- residual warnings and any unrelated baseline failures.

The final integration reruns the 25-route acceptance matrix (the
`requiredRoutes` contract in `check-public-pages.mjs`, matching the WP-11
baseline), dark and both light
family themes, mobile and desktop viewports, SSR and 404 probes, horizontal
overflow checks, and the full public frontend gate. The R3 result is recorded
under `docs/audits/`.

## Acceptance Boundary

Completion means the local integration branch has passed the full evidence
chain and is available at `http://127.0.0.1:5181` with backend
`http://127.0.0.1:18088`. It does not authorize push, merge to `main`, branch
cleanup, crawler execution, or database writes. Those actions remain blocked
until explicit user acceptance.
