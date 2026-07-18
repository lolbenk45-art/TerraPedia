# Armor Set Piece Aggregate Design

## Context

The public armor-set detail page currently loads the base armor set and then
issues two client-side request families for every unique related item:

- `GET /api/public/items/{itemId}/equipment-effects`
- `GET /api/public/items/{itemId}/recipe-tree?maxDepth=1`

The user-approved WP-10 goal is to extend the existing armor-set detail route
so one response can carry both families while older backends and clients keep
working.

## Goals

- Support `GET /api/public/armor-sets/{id}?include=piece-effects,recipes`.
- Keep the response without a recognized `include` field-shape compatible:
  no aggregate keys are added.
- Preserve the existing missing-detail behavior: HTTP 200 with a successful
  envelope and no `data` value.
- Return piece equipment effects and public, managed-image-only recipe trees
  grouped by related item ID.
- Let the frontend skip all per-piece HTTP calls when aggregate fields exist.
- Keep the old per-piece frontend path as a field-presence fallback.
- Reduce the armor detail API request count to at most three when the new
  backend contract is available.

## Non-goals

- P2 remediation, CSS migration, or visual redesign.
- Data crawling, import, backfill, schema migration, or database writes.
- A projectile detail endpoint or any other public aggregate endpoint.
- Replacing the recipe-tree model or adding a new frontend test framework.
- Pushing, merging to `main`, or cleaning earlier worktrees.

## Chosen Approach

Add an optional detail subtype and a dedicated aggregation facade. Keep the
list DTO and base armor-set service unchanged. Extract the public recipe-tree
boundary into a reusable facade so both the existing item recipe controller
and the new armor aggregation path apply the same copy-and-sanitize policy.

This is preferred over adding aggregate fields to `PublicArmorSetListDTO`,
which would mix list and optional detail concerns, and over creating a separate
`/aggregate` route, which would not satisfy the registered endpoint contract.

## API Contract

### Request

```http
GET /api/public/armor-sets/{id}?include=piece-effects,recipes
```

`include` is parsed as a comma-separated, case-insensitive set. Tokens are
trimmed, duplicates are removed, and response module order is deterministic.
The only recognized tokens are:

- `piece-effects`
- `recipes`

Unknown tokens are ignored. Missing, blank, or entirely unknown input requests
no aggregate modules and returns the existing base DTO instance. There is no
implicit default-to-all behavior and no new `all` alias.

### Response fields

When requested, the detail data adds:

```json
{
  "pieceEffects": {
    "1327": []
  },
  "pieceRecipes": {
    "1327": {
      "item": {},
      "treeMeta": { "maxDepth": 1 },
      "variants": []
    }
  }
}
```

- `pieceEffects` is `Map<Long, List<PublicItemEquipmentEffectDTO>>`.
- `pieceRecipes` is `Map<Long, RecipeTreeResponseDTO>` using `maxDepth=1`.
- JSON object keys are decimal item-ID strings produced from Java `Long` keys.
- A requested module is present even when its map is empty. Field presence is
  the frontend capability signal.
- An unrequested module remains `null` and is omitted by `NON_NULL` JSON
  serialization.
- Existing base fields stay at the same `data` level; no envelope key changes.

## Backend Architecture

### `PublicArmorSetDetailDTO`

Create a DTO extending `PublicArmorSetListDTO` with nullable `pieceEffects` and
`pieceRecipes` maps. The base list/detail DTO remains untouched. When at least
one aggregate module is requested, copy the base detail properties into this
subtype and set only the requested maps.

### `PublicArmorSetAggregateService`

Create a focused service with these dependencies:

- `PublicArmorSetService` for the current base detail.
- `PublicItemService` for piece equipment effects.
- `PublicRecipeTreeFacade` for public recipe trees.

The service:

1. Loads the base armor-set detail once.
2. Returns `null` unchanged when the base detail is missing.
3. Parses recognized include modules.
4. Returns the original base DTO when no recognized module is requested.
5. Collects positive related `itemId` values in first-seen order and dedupes
   them.
6. Resolves only requested modules and builds `LinkedHashMap` results.

No new aggregate cache is introduced. The existing recipe-tree cache remains
authoritative, and the small bounded armor-piece set does not justify a second
invalidation surface in WP-10.

### `PublicRecipeTreeFacade`

Move the public recipe-tree copy, recursive image filtering, and stripped-image
logging out of `PublicItemRecipeController` into a reusable Spring service.
Its public operation accepts `itemId` and `maxDepth`, calls the existing
`RecipeTreeService`, deep-copies the response, keeps only URLs accepted by
`ManagedImageUrlPolicy`, logs the stripped count, and returns the public copy.

The item recipe controller and armor aggregate service both call this facade.
The cached/internal recipe tree is never mutated and neither public path can
bypass the managed-image boundary.

### Controller

Add an optional `include` request parameter to
`PublicArmorSetController#getPublicArmorSetDetail` and delegate detail reads to
the aggregate service. List requests continue to use `PublicArmorSetService`
directly. The controller preserves the existing successful-null response for a
missing armor set.

## Error Handling

- Failure to load the base armor-set detail keeps the existing exception
  behavior; it is not disguised as a successful partial aggregate.
- A failure for one piece is isolated and logged with armor-set ID, item ID,
  and module, without logging response data.
- Failed equipment-effects lookup produces `pieceEffects[itemId] = []`,
  matching the current frontend catch behavior.
- Failed or missing recipe lookup omits that item from `pieceRecipes`, matching
  the current frontend behavior that filters failed summaries out.
- Other pieces and the base detail still succeed.
- Invalid, null, non-positive, and duplicate related item IDs are never sent to
  downstream services.
- Only ordinary runtime failures are isolated; JVM errors are not swallowed.

## Frontend Data Flow

Extend `PublicArmorSetListItem` with optional aggregate maps and request both
modules from `usePublicArmorSetDetail`:

```text
armor detail request with include
  -> aggregate field exists: normalize it locally, issue no piece request
  -> aggregate field absent: run the existing per-piece request family
```

Presence checks use own-property semantics rather than truthiness, so `{}` is
a valid supported aggregate result. The two modules are detected independently
to support a partially upgraded backend.

The existing `server: false` piece `useAsyncData` boundaries remain in place.
Their handlers return normalized aggregate data immediately when available and
call the legacy endpoints only when the corresponding field is absent. This
preserves the current SSR/hydration shape while eliminating client N+1 calls on
the new backend.

Effects are converted from item-ID map keys to the existing
`armorUniqueItemKey(item)` record expected by `useArmorSetBuilds`. Recipe trees
continue through `armorBuildRecipeSummary`, so display order, visible limits,
materials, stations, empty-state copy, and crafting links do not change.

## Compatibility Rules

- Old client + new backend: no `include`, so the old response and old client
  request flow remain unchanged.
- New client + old backend: the backend ignores or omits aggregate fields; the
  new client detects absence and executes the old per-piece calls.
- New client + new backend: both fields exist, so no per-piece HTTP calls run.
- Partial module support: only the missing module uses its legacy fallback.
- Requested-but-empty maps do not trigger fallback.

## Validation Design

### Backend tests

- Extend `PublicArmorSetControllerTest` for absent, partial, combined, unknown,
  and missing-detail include behavior.
- Add `PublicArmorSetAggregateServiceTest` for first-seen ID ordering,
  deduplication, selective module calls, base-instance preservation when no
  module is recognized, empty requested maps, and per-piece failure isolation.
- Add `PublicRecipeTreeFacadeTest` proving recursive image filtering, deep-copy
  immutability, `maxDepth=1` delegation, and null handling.
- Update `PublicItemRecipeControllerTest` to prove delegation through the
  shared public facade without weakening existing JSON assertions.

Focused backend validation:

```bash
cd back
mvn -Dtest=PublicArmorSetControllerTest,PublicArmorSetAggregateServiceTest,PublicItemRecipeControllerTest,PublicRecipeTreeFacadeTest test
```

### Frontend tests and gates

- Extend the existing armor detail/build contract checks to require the
  aggregate include query, own-property module gates, aggregate normalization,
  and preservation of both legacy endpoint fallbacks.
- Run the complete public frontend gate:

```bash
cd front-nuxt
pnpm run check
```

### Runtime acceptance

On a representative armor set with multiple unique pieces:

- Confirm the detail response contains both aggregate maps.
- Confirm no browser request targets per-piece `equipment-effects` or
  `recipe-tree` endpoints.
- Confirm total armor-detail API requests are at most three.
- Simulate absence of each aggregate field independently and confirm only that
  module falls back.
- Compare the representative page before and after for unchanged rendered
  content and no hydration warnings.

If local service lifecycle work remains outside the authorized session scope,
record runtime acceptance as not run rather than treating static gates as
runtime evidence.

## Scope and Commit Boundaries

Implementation stays on the stacked branch
`feat/front-p1-wp10-armor-aggregate`, based on
`refactor/front-p1-tail` at `cbca943`. Backend contract/sanitizer work and
frontend consumption may use separate focused commits, followed by validation
and devlog closeout. Nothing is pushed or merged without a new user request.
