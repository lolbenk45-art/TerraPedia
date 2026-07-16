# Public Category Navigation Design

## Goal

Replace the static public category pages with one backend-owned navigation
contract so the following user journey is backed by real category and item
data:

```text
/categories
  -> /categories/weapons
  -> /items?filter=weapon
```

The same contract covers the existing armor, potion, material, furniture, and
tool entry routes.

## Success Criteria

- `/categories` renders six category entries from a public backend response.
- `/categories/:slug` resolves the requested semantic category from that same
  response and presents its real category children.
- The category detail primary action links to the matching item filter, for
  example `/items?filter=weapon`.
- The item page resolves the filter to the category ID scope returned by the
  backend and requests only matching public items.
- Entry item totals use the same category eligibility rules as the public item
  list, including active category relations and descendant categories.
- Missing or unavailable category data never falls back to fabricated counts,
  categories, or an unfiltered item list.

## Confirmed Current State

- `front-nuxt/pages/categories/index.vue` contains six hard-coded category
  cards and hard-coded totals.
- `front-nuxt/pages/categories/[id].vue` is a static template and does not read
  its route parameter.
- `GET /api/categories/items` is live and currently returns the real item
  category tree.
- `/items?filter=weapon` already hydrates the `weapon` filter, but its semantic
  code-to-ID mapping is owned by the frontend.
- The public item service expands requested category IDs to descendants and
  matches both the primary item category and active `item_category_rel`
  records.

## Chosen Architecture

The backend owns a curated public category navigation registry. Each registry
entry binds a stable public slug and item filter key to one or more category
codes. At request time the navigation service resolves those codes against the
real category tree, expands the item category scope, counts matching distinct
items, and returns a frontend-ready contract.

The frontend consumes this contract in all three locations:

1. the category index;
2. the semantic category detail route;
3. the six corresponding filters on the item catalog.

This keeps semantic URLs stable while preventing the index, detail page, and
item page from maintaining three independent mappings.

## Public API Contract

Add an unauthenticated endpoint:

```http
GET /api/categories/navigation
```

It returns the repository-standard `ApiResponse` envelope with an ordered list
of navigation entries in `data`:

```json
{
  "success": true,
  "data": [
    {
      "slug": "weapons",
      "filterKey": "weapon",
      "name": "武器",
      "description": null,
      "icon": null,
      "categoryPath": "/categories/weapons",
      "itemPath": "/items?filter=weapon",
      "categoryCodes": ["WEAPON"],
      "categoryIds": [271, 314, 315, 317, 318],
      "itemCount": 458,
      "children": [
        {
          "id": 315,
          "code": "WEAPON_MELEE",
          "name": "近战武器"
        }
      ]
    }
  ]
}
```

Field rules:

- `slug`, `filterKey`, `categoryPath`, `itemPath`, and `categoryCodes` come
  from the immutable navigation registry.
- `name`, optional `description`, optional `icon`, resolved IDs, and children
  come from current category records.
- `categoryIds` is the complete deduplicated item-filter scope: configured
  category codes plus all of their descendants.
- `itemCount` is the number of distinct public-list-eligible items matching any
  `categoryIds` value through either the primary category or an active category
  relation.
- `children` contains real immediate child category records. The first version
  does not calculate an item total for every child.
- If any configured category code cannot be resolved, the endpoint returns the
  repository-standard error envelope with HTTP `503` and no partial `data`
  list. It never returns an entry with guessed or incomplete IDs.

## Navigation Registry

The first release contains exactly these six ordered entries:

| Slug | Filter key | Category code |
| --- | --- | --- |
| `weapons` | `weapon` | `WEAPON` |
| `armor` | `armor` | `ARMOR` |
| `potions` | `potion` | `CONSUMABLE_POTION` |
| `materials` | `material` | `MATERIAL` |
| `furniture` | `furniture` | `FURNITURE` |
| `tools` | `tool` | `TOOL` |

Registry order is the public display order. Database IDs are never stored in
the registry.

## Backend Components

### Navigation DTOs

Add public response DTOs for the navigation entry and child category. They
must contain only public fields and must not expose administrative metadata.

### Navigation Service

The service:

1. loads the item category tree once;
2. indexes categories by normalized code;
3. resolves every configured code;
4. expands and deduplicates descendant IDs;
5. counts matching distinct items with the same predicates as the public item
   query;
6. returns entries in registry order.

The count implementation may reuse the existing item mapper count semantics,
but it must not use the current primary-category-only aggregate as proof of the
public-filter total.

### Controller

`CategoryController` exposes `GET /categories/navigation` and returns
`ApiResponse<List<CategoryNavigationVO>>`. Existing category CRUD and category
tree endpoints remain unchanged.

## Frontend Data Flow

### Category Index

- Fetch the navigation contract through the existing public API helper.
- Render the six returned entries in the current page structure.
- Use `categoryPath`, real `name`, and real `itemCount` from the response.
- Remove all hard-coded totals and category links.
- Keep the current visual layout; this task is not a redesign.

### Category Detail

- Read the semantic slug from `route.params.id`.
- Resolve the matching navigation entry.
- Render its real name, item total, and real children.
- Use `itemPath` for the primary action.
- Generate title and description metadata from the resolved entry.
- Return a not-found state for an unknown slug.

The route is an intentional intermediate page. It must not automatically
redirect to the item catalog.

### Item Catalog

- Load the navigation contract alongside the real item category data.
- When the query filter is one of the six navigation entries, use the returned
  `categoryIds` as the public item query scope.
- Preserve the semantic query parameter during search and pagination.
- Display the resolved entry name as the selected category label.
- Keep all other existing catalog filters unchanged in this task.
- If a requested navigation filter cannot resolve its category IDs, show an
  unavailable state. Do not silently replace it with all items or fallback
  catalog items.

## Loading, Error, and Empty States

- While navigation is loading, preserve the existing page shell and show
  loading placeholders without static category values.
- If the navigation request fails, show a retryable category-data error.
- If a semantic category slug is unknown, show the Nuxt not-found behavior.
- If a valid category has zero items, show the normal empty catalog state.
- A failure to resolve configured category codes is observable in logs and in
  the public error behavior; it never degrades to fabricated data.

## Validation Design

### Backend

- Service tests cover all six registry entries, stable ordering, unique slugs,
  unique filter keys, and code resolution.
- Count tests cover primary category matches, active relation matches,
  descendant matches, and distinct counting when one item matches more than
  one category in the scope.
- Missing configured codes fail closed.
- Controller tests pin the public response envelope and field contract.

### Frontend

- Contract tests reject the former hard-coded totals and links.
- The category index renders backend navigation entries.
- The detail route resolves `weapons` and produces
  `/items?filter=weapon`.
- The item page resolves `filter=weapon`, selects the weapon label, and sends
  the backend-provided category scope.
- Navigation failure, unknown slug, and valid empty result states are covered.

### Runtime Acceptance

1. Open `/categories` and record the real weapon total.
2. Navigate to `/categories/weapons` and confirm real child categories.
3. Use the primary action to reach `/items?filter=weapon`.
4. Confirm the URL and selected category remain `weapon` during pagination and
   search.
5. Compare the displayed result total with the navigation total and inspect a
   sample of returned items for membership in the weapon scope.

## Scope Boundaries

In scope:

- one public backend navigation endpoint;
- backend registry, service, DTOs, count integration, and focused tests;
- the category index and semantic category detail pages;
- navigation-backed resolution for the six matching item filters;
- frontend contract and runtime acceptance coverage.

Out of scope:

- database migrations or category data backfills;
- admin category editor changes;
- crawler, import, refresh, or data repair work;
- visual redesign of the category or item pages;
- moving every existing item filter into the new endpoint;
- automatic redirects from category details to the item catalog.

## Residual Risks

- The navigation total and item pagination total will diverge if their SQL
  eligibility predicates drift; focused tests must pin their equivalence.
- Missing or renamed category codes can disable a public entry, so the registry
  requires fail-closed startup or request-time diagnostics.
- The item catalog currently has fallback behavior for API failures. The six
  navigation filters must bypass that fallback to avoid showing unrelated
  sample items as real filtered results.
