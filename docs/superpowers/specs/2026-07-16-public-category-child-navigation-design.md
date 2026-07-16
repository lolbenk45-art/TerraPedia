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

This cannot be fixed safely by passing only the child database ID:

- nine current immediate children have deeper descendants;
- public item membership includes primary category and active
  `item_category_rel` membership;
- numeric IDs are storage details and must not become the durable public URL.

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
3. Select one deterministic representative public item from that complete
   scope, ordered by item ID ascending, using the existing managed-image
   allowlist and demo/placed exclusion rules.
4. Return its managed image path, or `null` if no matching item has a usable
   image.

An empty child remains a valid navigation entry with `itemCount = 0` and
`image = null`; it must not make the six-entry navigation endpoint fail.

### Stable URL

The public URL uses the category code:

```text
/items?category=MATERIAL_KEY
```

The numeric `id` remains API metadata. The backend contract supplies
`itemPath`, so consumers never concatenate it independently.

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
- item requests send the complete child `categoryIds` list;
- search, page, and page-size updates preserve `category=<code>`;
- changing to an ordinary quick filter clears `category`;
- refreshing a deep link reconstructs the same scope from the navigation API.

An unknown `category` code fails closed: no unfiltered item request or sample
fallback is allowed. The page shows the existing unavailable state with a
recovery path to the complete item catalog.

## Runtime Validation

The acceptance matrix covers all six parent entries and every returned child:

- every child has a stable `itemPath`, non-empty scope, integer count, and
  nullable managed image;
- representative images, when present, use `/terrapedia-images/items/`;
- each child count equals the public item total for its complete scope;
- `/categories/materials` renders twelve clickable child cards with images or
  semantic fallbacks;
- clicking 钥匙 reaches `/items?category=MATERIAL_KEY` and displays `钥匙图鉴`;
- a descendant-bearing child such as `WEAPON_OTHER` sends its full child plus
  descendant scope;
- search and page 2 preserve the stable category query and complete scope;
- an unknown category code issues no unfiltered item request;
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
