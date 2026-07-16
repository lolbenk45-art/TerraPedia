# Public Category Child Navigation Design

## Goal

Make every immediate-child card on every maintained public category detail
page a real, image-backed navigation entry. The same contract must cover
weapons, armor, potions, materials, furniture, and tools without page-specific
frontend mappings.

The user journey is:

```text
/categories
→ /categories/:parentSlug
→ /items?category=<stable-category-code>
```

For example:

```text
/categories/materials
→ /items?category=MATERIAL_KEY
→ 钥匙图鉴
```

## Current Failure

`GET /api/categories/navigation` currently exposes each immediate child with
only `id`, `code`, and `name`. The category detail page therefore renders a
non-interactive `<article>` with no route, count, scope, or image.

Passing only the child database ID is rejected for URL-durability and
ownership reasons, not for correctness reasons. The public item service
already expands every requested category to its complete descendant set on
the server (`PublicItemServiceImpl.resolveCategoryIds`), so a bare child ID
returns the correct scope today (verified live: `categoryIds=316` and
`categoryIds=316,342,341` both return 36 items). The binding reasons are:

- numeric IDs are storage details and must not become the durable public URL;
- the frontend must not derive, reconstruct, or partially forward scopes; it
  forwards the backend-supplied `categoryIds` verbatim as the single source
  of truth.

The child `categoryIds` field is therefore contract data for count
reconciliation and verbatim forwarding, not a behavioral requirement of the
item API.

The public item API already proves that managed item images and relation-aware
category filtering exist. The missing boundary is a complete child navigation
contract.

## Chosen Architecture

Extend the existing backend-owned `GET /api/categories/navigation` contract.
Each child becomes a complete navigation object with:

```json
{
  "id": 300,
  "code": "MATERIAL_KEY",
  "name": "钥匙",
  "categoryIds": [300],
  "itemPath": "/items?category=MATERIAL_KEY",
  "itemCount": 15,
  "image": "/terrapedia-images/items/.../golden-key.png"
}
```

`categoryIds` contains the child and all descendants in deterministic category
order. `itemCount` and representative-image selection use the same primary-or-
active-relation predicate as the public item list.

The frontend treats the child DTO as the source of truth. It does not derive
routes, reconstruct descendants, or maintain a second code registry.

## Backend Contract

### Scope

For every immediate child:

1. Resolve the child plus all descendants through
   `CategoryManagementService`.
2. Count matching public items through the shared `countItemsWithSearch`
   predicate.
3. Select the representative image deterministically: among all matching
   public items in that complete scope, ordered by item ID ascending, take
   the **first item that has a usable managed image** under the existing
   managed-image allowlist and demo/placed exclusion rules. Items without a
   usable image are skipped, not treated as terminal.
4. Return that managed image path, or `null` only if **no** item in the
   scope has a usable image.

An empty child remains a valid navigation entry with `itemCount = 0` and
`image = null`; it must not make the six-entry navigation endpoint fail.

A parent with **zero** immediate children is also valid. Potions currently
has no immediate children; `/categories/potions` keeps rendering the
existing "暂无直属分类" empty state with no child cards, and the acceptance
matrix treats its child assertions as vacuously satisfied. Creating child
categories for potions is category administration and stays out of scope.

### Stable URL

The public URL uses the category code:

```text
/items?category=MATERIAL_KEY
```

The numeric `id` remains API metadata. The backend contract supplies
`itemPath`, so consumers never concatenate it independently.

### Performance Budget

The current endpoint issues six count queries and answers in ~120 ms
locally. This design adds per-child work for all 34 current immediate
children (count + representative-image selection, and the image predicate
includes REGEXP-based demo/placed exclusions). Naively looping two queries
per child (~68 extra round trips) is not acceptable for an endpoint consumed
on every `/categories`, `/categories/:slug`, and `/items` page load.

The implementation must satisfy both of:

- child counts and representative images are produced by grouped/aggregated
  queries (one query per concern across all children, or equivalent), not a
  per-child query loop;
- the full navigation response stays under 500 ms locally against the
  current dataset, measured after stack restart.

A short-TTL in-memory cache is an allowed additional optimization but must
not replace the aggregation requirement, and cache failures must degrade to
live queries, never to partial responses.

### Failure Rules

- Existing top-level configured-code failures remain HTTP 503 and fail closed.
- A malformed child scope is a backend contract error and must not be returned
  as an unfiltered route.
- Missing representative images are ordinary nullable data, not endpoint
  failures.
- No database migration, backfill, crawler run, or external image fetch is
  part of this task.

## Frontend Behavior

### Category Detail Cards

Every child card on `/categories/:slug` becomes one semantic anchor whose full
surface is clickable and keyboard reachable. It renders:

- a fixed-size `CommonPreviewImage` using the backend managed image;
- the child name and code;
- the relation-aware item total;
- a visible “查看图鉴” affordance.

The image has meaningful alt text. Missing images use the existing semantic
category fallback icon. Hover, focus-visible, and pressed states reuse current
theme tokens and do not shift layout.

### Item Catalog Resolution

The item page recognizes `route.query.category` before ordinary quick-filter
selection. It looks up the code across all navigation children and uses the
child's complete `categoryIds` scope.

For a resolved child:

- page title is `<child name>图鉴`;
- the category summary names the parent and child;
- item requests forward the backend-supplied child `categoryIds` list
  verbatim;
- search (`q`), page, and page-size updates preserve `category=<code>`
  (the item page's existing search query parameter is `q`, not `search`);
- changing to an ordinary quick filter clears `category`;
- refreshing a deep link reconstructs the same scope from the navigation API.

Code matching is exact and case-sensitive against the codes returned by the
navigation API; the frontend performs no normalization. Any non-exact value
is an unknown code.

An unknown `category` code fails closed: no unfiltered item request or sample
fallback is allowed. The page shows the existing unavailable empty state,
extended with a new recovery link to the complete item catalog (`/items`).
This link is a small addition — the current empty state only offers
"重新加载" and "重置筛选" actions and has no such link today.

### Existing Contract-Check Constraints

Two existing frontend checks conflict with this design and must be updated
in the same change, not worked around:

- `front-nuxt/scripts/check-category-navigation-contract.mjs` currently
  forbids `navigateTo(` in `pages/categories/[id].vue` ("detail must remain
  an intermediate page") and asserts exact source snippets; its assertions
  must be revised to match the new clickable child cards.
- The category detail route file is `pages/categories/[id].vue` (param name
  `id`, used as the slug) — this design's `:slug` notation is descriptive
  only; no route rename is in scope.

New frontend tests for this feature must be behavior tests (against
normalizers, resolution logic, and rendered behavior), not additional
regex-against-source contract scripts.

## Runtime Validation

The acceptance matrix covers all six parent entries and every returned child:

- every child has a stable `itemPath`, non-empty scope, integer count, and
  nullable managed image;
- representative images, when present, use `/terrapedia-images/items/`;
- each child count equals the public item total for its complete scope;
- the full navigation response answers within the 500 ms local budget after
  stack restart;
- `/categories/materials` renders twelve clickable child cards with images or
  semantic fallbacks;
- `/categories/potions` (currently zero children) keeps its existing empty
  state and its child assertions pass vacuously;
- clicking 钥匙 reaches `/items?category=MATERIAL_KEY` and displays `钥匙图鉴`;
- a descendant-bearing child such as `WEAPON_OTHER` forwards its
  backend-supplied `categoryIds` verbatim in the item request (the item API
  would expand descendants server-side either way; this asserts the
  frontend forwards the contract scope unmodified);
- search and page 2 preserve the stable category query and complete scope;
- an unknown category code issues no unfiltered item request and shows the
  recovery link to `/items`;
- keyboard focus, mobile layout, and image fallback remain usable;
- existing top-level `/items?filter=weapon` behavior remains unchanged.

## Scope Boundaries

In scope:

- navigation child DTO/service/mapper support and focused backend tests;
- frontend contract normalization, item-page child resolution, detail-card
  rendering, focused unit/contract tests, and minimal scoped styling;
- API contract and devlog updates;
- local stack restart and browser acceptance.

Out of scope:

- nested category detail routes beyond the immediate-child-to-items jump;
- category administration, database writes, data refresh, or crawler work;
- manual image curation;
- visual redesign of category pages or the item catalog;
- migration of unrelated legacy item filters.

## Known Debt

This design accepts a dual URL scheme: parents use `/items?filter=<key>`
while children use `/items?category=<code>`, with asymmetric failure modes
(an unknown `filter` falls back to the full catalog; an unknown `category`
fails closed). Unifying the two schemes is deliberately out of scope and
recorded here as future work.
