# Public NPC Front Design

Date: 2026-04-10
Status: Approved in chat
Scope owner: TerraPedia public site `front`

## 1. Goal

Build the first complete public entity slice for NPCs on the public site.

Success criteria:

- The public site exposes an `NPCs` entry in the main navigation.
- Users can open an NPC list page and an NPC detail page on `front`.
- The public site uses public read APIs only. It does not call admin endpoints.
- The backend provides dedicated public NPC read APIs with stable DTOs.
- Existing `items`, `articles`, `about`, and auth flows keep current behavior.

Out of scope for this batch:

- Boss public pages
- Biome public pages
- SEO slug routing for NPCs
- Generic multi-entity abstraction across NPC/Boss/Biome
- Admin UI changes

## 2. Current State

Public site reality:

- `front` currently exposes `Home`, `Items`, `Articles`, `About`, and auth routes.
- `Item` already uses a stable public read pattern, including `/public/items/{id}/aggregate`.
- `Biome` already has public backend read controllers, but no public site pages.
- `NPC` and `Boss` do not have public read controllers today.

Backend reality:

- NPC and Boss data already exist and are maintained through admin controllers.
- NPC relation data already exists in dedicated tables and read logic:
  - loot
  - shop entries
  - buff relations
- Existing admin controllers return `Map<String, Object>` payloads shaped for maintenance work, not for public site contracts.

Implication:

- The correct public-site path is not "reuse admin payloads".
- A new public read layer is required for NPCs.

## 3. Chosen Approach

Use the `Item` public aggregate pattern as the template for NPCs.

### 3.1 Backend

Add a dedicated public NPC read layer:

- `GET /npcs`
- `GET /public/npcs/{id}/aggregate`

This layer will:

- expose stable public DTOs
- assemble read-only aggregate data for the public site
- stay separate from admin maintenance controllers

### 3.2 Frontend

Add a dedicated NPC public flow on `front`:

- `GET /npcs` powers an NPC list page
- `GET /public/npcs/{id}/aggregate` powers an NPC detail page
- add `NPCs` to the top navigation

This keeps the first batch vertically complete:

- discoverability
- browse
- open detail
- read relations

## 4. API Design

### 4.1 NPC List

Endpoint:

- `GET /npcs`

Supported query parameters for batch 1:

- `page`
- `limit`
- `search`
- `categoryId`
- `isTownNpc`

Default behavior:

- return public NPC records only
- exclude bosses by default
- sort in a stable deterministic order

Response shape:

- pagination metadata
- list item DTOs with fields needed by the list page

List item DTO target fields:

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
- `image` or portrait field when available

### 4.2 NPC Aggregate Detail

Endpoint:

- `GET /public/npcs/{id}/aggregate`

Supported query parameter:

- `include=loot,shop,buffs`

Default:

- include all modules

Response shape:

- `npc`
- `loot`
- `shopEntries`
- `buffRelations`
- `moduleStatus`
- `aggregatedAt`

Module behavior:

- If a module is requested and has rows, status is `ok`.
- If a module is requested and has no rows, status is `empty`.
- If a module is not requested, status is `skipped`.

404 behavior:

- If the NPC does not exist, return public 404 with `Npc not found`.

### 4.3 Public DTO Rule

Do not reuse admin `Map<String, Object>` payloads as public contracts.

Public DTOs should be explicit and limited to read-safe fields needed by the public site.

## 5. Frontend Design

### 5.1 Navigation

Add `NPCs` to [Navbar.vue](G:\ClaudeCode\TerraPedia-dev\front\src\components\Navbar.vue).

Placement:

- `Home`
- `Items`
- `NPCs`
- `Articles`
- `About`

### 5.2 Routes

Add routes to [routes.ts](G:\ClaudeCode\TerraPedia-dev\front\src\router\routes.ts):

- `/npcs`
- `/npcs/:id`

### 5.3 NPC List Page

Add `NpcListView.vue`.

Batch 1 goals:

- searchable list
- pagination
- optional town-NPC filter
- click through to detail

List card content:

- portrait or fallback icon
- primary name
- secondary name if present
- category label
- town/friendly tags

Empty states:

- no data yet
- no search results

Error state:

- standard retryable page-level error block

### 5.4 NPC Detail Page

Add `NpcDetailView.vue`.

Batch 1 sections:

- hero/basic profile
- loot
- shop entries
- buff relations

Hero/basic profile includes:

- primary display name
- secondary name
- category
- town/friendly flags
- optional portrait
- core notes/summary fields when present

Section rules:

- render each section independently
- empty module shows a clear empty state
- one empty module must not break the whole page

### 5.5 Frontend Data Layer

Extend:

- [index.ts](G:\ClaudeCode\TerraPedia-dev\front\src\api\index.ts)
- [index.ts](G:\ClaudeCode\TerraPedia-dev\front\src\types\index.ts)

New API functions:

- `fetchNpcs`
- `fetchNpcAggregateById`

New types:

- `Npc`
- `NpcListResponse`
- `NpcLootRelation`
- `NpcShopEntry`
- `NpcBuffRelation`
- `NpcAggregateData`
- `NpcAggregateResponse`

## 6. Backend Structure

Batch 1 backend structure should be explicit, not over-generalized.

Recommended components:

- public NPC controller
- public NPC service
- public NPC DTOs

The service may reuse mapper logic and table reads already proven in admin flows, but must not duplicate large controller-shaped payload assembly inline.

This keeps phase 2 `Boss` work from copying controller-only logic again.

## 7. Error Handling

### 7.1 List Page

- request failure: show retryable error panel
- empty dataset: show public empty state
- empty filtered result: show "no matching NPCs"

### 7.2 Detail Page

- `404`: show NPC not found state
- aggregate module empty: render empty section
- aggregate request failure: show detail error panel with retry

### 7.3 Compatibility

- no breaking change to current item or article flows
- no dependency on admin authentication
- no route rewrite for existing pages

## 8. Validation Plan

### 8.1 Backend

Add tests for public NPC endpoints:

- list success
- list filtering/search baseline
- detail success
- detail 404
- aggregate module empty behavior

### 8.2 Frontend

Minimum validation:

- new routes render
- nav link works
- list loads and paginates
- detail loads from list click
- empty states and error states render

### 8.3 Manual Smoke

Run local stack and verify:

- open `/npcs`
- search for an NPC
- open `/npcs/:id`
- verify loot/shop/buff sections
- verify an NPC without one of those modules still renders correctly

## 9. Delivery Order

Phase 1:

- public NPC backend APIs
- front NPC types and API methods
- navigation entry
- NPC list page
- NPC detail page
- validation

Planned next phases after this spec:

- Phase 2: Boss
- Phase 3: Biome
- Phase 4: recipe/source experience enhancement on existing item flows

## 10. Rejected Alternatives

### 10.1 Reuse admin endpoints directly

Rejected because:

- contract is not public-safe
- payload shape is maintenance-oriented
- it creates future frontend and backend refactor debt

### 10.2 Build a generic entity framework first

Rejected because:

- too much upfront abstraction for the first public NPC slice
- delays visible delivery
- increases scope before the first vertical slice is proven

### 10.3 Build frontend shell first, backfill API later

Rejected because:

- public site would anchor on unstable contracts
- almost guarantees rework in the first real integration pass

## 11. Risks

- There is no current public NPC service layer, so batch 1 will need backend read extraction work.
- NPC portrait/image availability may vary; the UI must tolerate missing media.
- Some NPCs may have sparse relation data; the design must keep partial data readable instead of looking broken.

## 12. Acceptance Summary

The batch is done when:

- users can navigate to `NPCs`
- users can browse and search NPCs
- users can open an NPC detail page
- the detail page reads from a public aggregate API
- the implementation does not depend on admin endpoints
