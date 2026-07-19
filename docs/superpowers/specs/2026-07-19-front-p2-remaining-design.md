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
user-acceptance candidate. It serves the public frontend on port `5181` and
uses the backend on port `18088`; package worktrees use isolated temporary
ports. Port `13012` is not an acceptance endpoint.

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

Converge width breakpoints to `430px`, `720px`, `860px`, and `1180px`. Media
features such as hover, reduced motion, orientation, resolution, print, and
container queries are outside the width whitelist and remain valid.

Add a source contract that rejects any new min/max width outside the four
approved values. Equivalent replacements may differ by at most one pixel at a
boundary and must not introduce a responsive redesign. Validate at widths
375, 768, and 1440.

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
9000px.

### Other Long Pages

- Biome detail renders non-empty drop groups as native `details` elements;
  the first group is open and the remaining groups are closed.
- Crafting trees on mobile initially expose the root and first level. Deeper
  levels remain keyboard-operable and expand on demand. Desktop behavior is
  unchanged.
- The home footer is collapsed by default on mobile and expanded by default
  above the mobile breakpoint. Its control exposes expanded state and remains
  usable without pointer input.

## WP-14: Focused Closure Batch

WP-14 remains one branch and plan, but uses four focused commits:

1. Accessibility: add a skip link, raise governed 9-11px text to at least
   12px, make breadcrumbs data-driven `NuxtLink` navigation, replace biome
   detail internal anchors, and add the missing polite live regions.
2. Data truthfulness: feed `TerraFooter` and `search-tool` from the existing
   `/statistics/overview` flow, retain the search-tool route with an explicit
   prototype-comparison label, use category id `301`, and unify search copy
   and status states in Chinese.
3. Account behavior: redirect a successful password change to login and
   converge `TerraNav` visitor initialization so it does not produce duplicate
   failed authentication requests.
4. Seed migration: add
   `back/db/migration/V55__seed_ac_home_original_articles.sql` as an explicit
   cross-boundary commit and validate the backend migration chain.

No crawler action, database backfill, visual redesign, new endpoint, or data
pipeline change belongs to these packages.

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

WP-14's migration commit also runs focused backend migration validation. The
final integration reruns the 26-route acceptance matrix, dark and both light
family themes, mobile and desktop viewports, SSR and 404 probes, horizontal
overflow checks, and the full public frontend gate. The R3 result is recorded
under `docs/audits/`.

## Acceptance Boundary

Completion means the local integration branch has passed the full evidence
chain and is available at `http://127.0.0.1:5181` with backend
`http://127.0.0.1:18088`. It does not authorize push, merge to `main`, branch
cleanup, crawler execution, or database writes. Those actions remain blocked
until explicit user acceptance.
