# Public NPC Front Implementation Plan

Date: 2026-04-10
Scope: TerraPedia public site `front` plus dedicated public backend NPC read APIs
Status: Ready to execute

## Goal

Deliver the first complete public NPC slice:

- public backend list API: `GET /npcs`
- public backend aggregate API: `GET /public/npcs/{id}/aggregate`
- public frontend routes: `/npcs` and `/npcs/:id`
- navbar entry for `NPCs`
- NPC list and detail pages that consume only the new public APIs

## Success Criteria

- `front` main navigation exposes `NPCs`
- users can browse the NPC list page
- users can open an NPC detail page
- frontend does not call admin NPC endpoints
- backend returns stable DTOs instead of admin `Map<String, Object>` payloads
- loot, shop, and buff modules render independently and tolerate empty data

## Locked Scope

In scope for this batch:

- public NPC list
- public NPC aggregate detail
- frontend list/detail pages
- responsive adaptation for desktop and mobile

Out of scope for this batch:

- boss public pages
- biome public pages
- SEO slug routing
- admin UI changes
- generic entity abstraction across NPC/Boss/Biome

## Real Entry Points

Backend patterns to follow:

- `back/src/main/java/com/terraria/skills/controller/ItemController.java`
- `back/src/main/java/com/terraria/skills/controller/PublicItemAggregateController.java`
- `back/src/test/java/com/terraria/skills/controller/PublicItemAggregateControllerTest.java`
- `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- `back/src/main/java/com/terraria/skills/controller/AdminNpcRelationController.java`

Frontend entry points to extend:

- `front/src/api/index.ts`
- `front/src/types/index.ts`
- `front/src/router/routes.ts`
- `front/src/components/Navbar.vue`

Frontend pages to create:

- `front/src/views/NpcListView.vue`
- `front/src/views/NpcDetailView.vue`

## Important Codebase Facts

- `Npc` entity has `status`, `isBoss`, `isFriendly`, `isTownNpc`, but no `deleted` field
- backend pagination should use MyBatis `Page<>`, not `PageImpl<>`
- public NPC contracts must be explicit DTOs
- public list should exclude bosses by default
- empty modules should return empty arrays plus module status, not fail the page
- frontend already has `vitest`; add minimal tests for nav and route wiring

## Target Files

Backend:

- create `back/src/main/java/com/terraria/skills/dto/PublicNpcQuery.java`
- create `back/src/main/java/com/terraria/skills/dto/NpcListItemDTO.java`
- create `back/src/main/java/com/terraria/skills/dto/NpcDetailDTO.java`
- create `back/src/main/java/com/terraria/skills/dto/NpcLootEntryDTO.java`
- create `back/src/main/java/com/terraria/skills/dto/NpcShopConditionDTO.java`
- create `back/src/main/java/com/terraria/skills/dto/NpcShopEntryDTO.java`
- create `back/src/main/java/com/terraria/skills/dto/NpcBuffRelationDTO.java`
- create `back/src/main/java/com/terraria/skills/dto/NpcAggregateDTO.java`
- create `back/src/main/java/com/terraria/skills/service/PublicNpcService.java`
- create `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- create `back/src/main/java/com/terraria/skills/controller/NpcController.java`
- create `back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java`
- create `back/src/test/java/com/terraria/skills/controller/NpcControllerTest.java`
- create `back/src/test/java/com/terraria/skills/controller/PublicNpcAggregateControllerTest.java`

Frontend:

- modify `front/src/types/index.ts`
- modify `front/src/api/index.ts`
- modify `front/src/router/routes.ts`
- modify `front/src/components/Navbar.vue`
- create `front/src/views/NpcListView.vue`
- create `front/src/views/NpcDetailView.vue`
- create `front/src/tests/npc-public-shell.spec.ts`

## API Contract

### `GET /npcs`

Supported query params:

- `page`
- `limit`
- `search`
- `categoryId`
- `isTownNpc`

Behavior:

- filter `status = 1`
- filter `isBoss = false`
- stable sort by `isTownNpc DESC, id ASC`
- return `ApiResponse<List<NpcListItemDTO>>` with pagination

Minimum list DTO fields:

- `id`
- `gameId`
- `internalName`
- `name`
- `nameZh`
- `subName`
- `subNameZh`
- `categoryId`
- `categoryName`
- `isBoss`
- `isFriendly`
- `isTownNpc`
- `imageUrl`

### `GET /public/npcs/{id}/aggregate`

Supported query param:

- `include=loot,shop,buffs`

Default:

- all three modules requested

Behavior:

- return `404` with `Npc not found` if NPC missing or is a boss
- always include `npc`, `moduleStatus`, and `aggregatedAt`
- requested empty module => `empty`
- requested populated module => `ok`
- unrequested module => `skipped`

Aggregate payload:

- `npc`
- `loot`
- `shopEntries`
- `buffRelations`
- `moduleStatus`
- `aggregatedAt`

## TDD Execution Order

### Task 1: Backend list API

1. Write `NpcControllerTest` first.
2. Verify it fails because controller/service/DTO do not exist.
3. Add `PublicNpcQuery`, `NpcListItemDTO`, `PublicNpcService`.
4. Implement `NpcController`.
5. Implement `PublicNpcServiceImpl#getPublicNpcs(...)`.
6. Re-run `NpcControllerTest` and confirm green.

Controller test must prove:

- `GET /npcs` returns success payload and pagination
- controller forwards filters to service
- default list path excludes bosses

Implementation notes:

- use `PaginationParams.resolvePage(...)`
- use `PaginationParams.resolveLimit(limit, null, 20, 100)`
- use MyBatis `Page<Npc>`
- use `CategoryMapper.selectBatchIds(...)` for category names
- `imageUrl` may be null when no supplement exists

### Task 2: Backend aggregate API

1. Write `PublicNpcAggregateControllerTest` first.
2. Verify it fails because aggregate controller/DTO do not exist.
3. Add aggregate DTOs.
4. Extend `PublicNpcService` with aggregate method.
5. Implement `PublicNpcAggregateController`.
6. Implement aggregate loading in `PublicNpcServiceImpl`.
7. Re-run aggregate controller test and confirm green.

Controller test must prove:

- aggregate endpoint returns the DTO from service
- default include handling requests all modules
- unknown NPC returns `404`

Implementation notes:

- parse include values with `LinkedHashSet`
- accepted modules are only `loot`, `shop`, `buffs`
- load relation rows from existing NPC relation tables
- shop conditions should be nested under each shop entry
- loot fallback strategy:
  - prefer `npc_loot_entries`
  - if manual loot is empty, fallback to derived loot from `item_acquisition_sources`
- if supplement image data is easy to resolve from `generated/npc-standardized-map.json`, include it; otherwise keep `imageUrl = null`

### Task 3: Frontend shell and API wiring

1. Write `front/src/tests/npc-public-shell.spec.ts` first.
2. Verify it fails because `NPCs` nav entry and routes do not exist yet.
3. Add NPC types to `front/src/types/index.ts`.
4. Add `fetchNpcs` and `fetchNpcAggregateById` to `front/src/api/index.ts`.
5. Add `/npcs` and `/npcs/:id` routes.
6. Add `NPCs` to desktop and mobile navbar.
7. Re-run the frontend shell test and confirm green.

Frontend shell test must prove:

- navbar renders `NPCs`
- router exports `/npcs`
- router exports `/npcs/:id`

### Task 4: Frontend pages

1. Implement `NpcListView.vue`.
2. Implement `NpcDetailView.vue`.
3. Keep pages responsive and aligned with the current public visual language.
4. Use clear loading, error, and empty states.

`NpcListView.vue` requirements:

- searchable list
- town-NPC quick filter
- pagination
- card click to detail page
- portrait fallback when no image is present

`NpcDetailView.vue` requirements:

- hero/basic profile block
- loot section
- shop section
- buff section
- each section renders independently
- empty module renders a section-level empty state

## Multi-Agent Split

Parallel-safe split after this plan is locked:

- backend task writes only `back/` NPC public files
- frontend task writes only `front/` NPC public files

Not parallel-safe:

- two agents editing the same frontend file
- two agents editing the same backend service/controller/test file

## Minimum Validation

Backend:

```powershell
cd back
mvn "-Dtest=NpcControllerTest,PublicNpcAggregateControllerTest" test
```

Frontend:

```powershell
cd front
pnpm vitest run src/tests/npc-public-shell.spec.ts --environment jsdom
pnpm run check
pnpm run build
```

## Risks To Watch

- supplement image data may be unavailable locally; UI must degrade gracefully
- some NPC loot may exist only in derived item acquisition data
- shop conditions may reference biome/world-context names that are absent; UI must show a readable fallback label
- repo worktree is already dirty; do not revert unrelated changes

## Completion Gate

Do not claim completion until all validation above has been run fresh and read for exit status and failures.
