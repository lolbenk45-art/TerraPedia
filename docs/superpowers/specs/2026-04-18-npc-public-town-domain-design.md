# NPC Public + Town Maintenance Domain Design

## Task

- Goal: before adapting the backend further, freeze a shared NPC domain baseline that covers both the public NPC aggregate surface and the Town NPC maintenance surface.
- Success criteria:
  - define one explicit shared NPC domain vocabulary instead of continuing to grow hidden fields in DTOs, Vue views, and composables
  - separate shared NPC facts from Town NPC maintenance-only fields
  - define milestone order so backend adaptation happens only after the domain baseline is frozen
  - keep the first implementation round scoped to `public NPC + Town NPC maintenance`, not full crawler/admin/public unification
- Out of scope:
  - full `crawler -> standardized -> backend` canonical unification in the same round
  - Boss / Biome / Event domain unification
  - redesigning the public NPC page UI
  - redesigning the Town NPC workbench UI

## Current Context

The repo already contains three partially overlapping NPC surfaces:

1. Public NPC aggregate backend
   - `back/src/main/java/com/terraria/skills/controller/PublicNpcAggregateController.java`
   - `back/src/main/java/com/terraria/skills/service/PublicNpcService.java`
   - DTOs currently centered on:
     - `NpcListItemDTO`
     - `NpcDetailDTO`
     - `NpcAggregateDTO`
     - `NpcLootEntryDTO`
     - `NpcShopEntryDTO`
     - `NpcBuffRelationDTO`

2. Public NPC frontend
   - `front/src/views/NpcListView.vue`
   - `front/src/views/NpcDetailView.vue`
   - `front/src/types/index.ts`

3. Town NPC maintenance frontend
   - `data-query-app/pages/entities/town-npcs/index.vue`
   - `data-query-app/pages/entities/town-npcs/[id]/index.vue`
   - `data-query-app/pages/entities/town-npcs/[id]/edit.vue`
   - `data-query-app/composables/useTownNpcMaintenance.ts`

The current mismatch is structural, not cosmetic:

- public NPC aggregate currently exposes `npc + loot + shopEntries + buffRelations`
- Town NPC maintenance consumes a broader maintenance-oriented shape, including:
  - base stats
  - wiki details and image assets
  - move-in conditions
  - current shop items
  - unmatched shop items
  - game period
  - behavior notes and maintenance coverage signals
- those surfaces overlap heavily, but the overlap is not frozen as a first-class domain model

If backend adaptation continues before this baseline is frozen, the likely result is more duplicated field names, more ad hoc mapping, and more frontends guessing what a field means.

## Domain Decision

This round will use **shared baseline first, backend adaptation second**.

The round is intentionally limited to:

- public NPC aggregate consumers
- Town NPC maintenance consumers

The round explicitly does **not** attempt to solve:

- crawler schema as the single source of truth
- full admin/public/crawler canonical convergence

That larger convergence remains possible later, but it is not the first safe step.

## Design

### 1. Domain Layers

Freeze the NPC model into three layers:

#### 1.1 `NpcBaseDomain`

This is the shared fact layer that both public NPC pages and Town NPC maintenance pages rely on.

It should cover stable identity and classification facts:

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

It may also include shared summary-level facts if both sides consume them with the same semantics:

- `behaviorNotes`
- `status`

This layer must remain intentionally thin. If a field exists only because the maintenance workbench wants to inspect source completeness, it does not belong here.

#### 1.2 `NpcPublicAggregateDomain`

This is the public consumption layer built on top of `NpcBaseDomain`.

It includes:

- `npc`
- `loot`
- `shopEntries`
- `buffRelations`
- `moduleStatus`
- `aggregatedAt`

This layer is public-facing and should not inherit maintenance-only diagnostics.

The public aggregate layer is allowed to reference richer nested modules, but those modules should still be semantically clean:

- `NpcLootEntryDomain`
- `NpcShopEntryDomain`
- `NpcBuffRelationDomain`

Those nested domains should carry business meaning, not source-specific temporary fields.

#### 1.3 `TownNpcMaintenanceDomain`

This is the maintenance layer for the admin workbench. It extends `NpcBaseDomain`, but it is not a superset of the public aggregate. It has a different purpose: maintenance coverage, reconciliation, and editing support.

It should cover:

- maintenance status signals
  - `hasBehaviorNotes`
  - `hasShopEntries`
  - gap flags or equivalent derived status
- progression / maintenance context
  - `gamePeriodId`
  - `gamePeriodLabel`
- maintenance-facing summary text
  - `behaviorNotesPreview`
  - `scrapedFunctionSummary`
- maintenance-facing stat projection
  - `baseStats`
- maintenance-facing wiki projection
  - `wikiDetails`
  - sprite / portrait / map icon assets
- Town NPC specific support data
  - `scrapedMoveInConditions`
  - `currentShopItems`
  - `unmatchedShopItems`
  - import or matching coverage counts

This layer is allowed to contain reconciliation-oriented fields that never appear in the public API.

### 2. Shared Subdomains

The following nested domains should be normalized once and reused where relevant:

#### 2.1 `NpcLootEntryDomain`

Stable fields:

- item identity
- quantity
- chance
- conditions
- notes
- display image

Keep source-provider metadata out unless a consumer truly needs it.

#### 2.2 `NpcShopEntryDomain`

Stable fields:

- item identity
- price text or normalized price display fields
- conditions list
- notes
- display image

Town NPC maintenance may need additional reconciliation details, but those should live in the maintenance layer, not in the public shop entry by default.

#### 2.3 `NpcBuffRelationDomain`

Stable fields:

- buff identity
- relation type
- duration
- chance
- conditions
- notes
- display image

#### 2.4 `NpcWikiAssetDomain`

Town NPC maintenance needs a normalized structure for wiki-facing assets:

- `spriteImage`
- `mapIconImage`
- `dialogPortraitImage`

Do not continue exposing these only as loose object lookups under arbitrary `wikiDetails` keys.

#### 2.5 `NpcStatBlockDomain`

Town NPC maintenance needs a stable stat projection instead of open-ended property probing.

At minimum, normalize:

- `lifeMax`
- `damage`
- `defense`
- `knockBackResist`

Other stats can remain additive later, but the first round should stop relying on free-form key guessing for the core stats already rendered in the UI.

### 3. Naming Rule

This round must stop letting each surface invent field names independently.

Naming rule:

- shared facts use one canonical name everywhere
- public aggregate modules use public-oriented names
- maintenance-only fields stay under maintenance-oriented structures
- do not duplicate the same fact under both top-level and nested ad hoc names without a documented reason

Examples:

- one `imageUrl` for shared NPC portrait identity
- one normalized `wikiAssets` block for maintenance asset cards
- one normalized `baseStats` or `statBlock` shape for maintenance stat rendering

### 4. Adapter Strategy

Backend adaptation will happen only after the domain baseline is frozen.

Use mapping layers, not direct controller growth:

- persistence or source rows
- service-level domain mapping
- controller DTO mapping

This prevents controller methods from becoming the place where the domain is invented.

### 5. Milestones

#### M1. Domain Inventory Freeze

Goal:

- produce an explicit domain inventory for all fields currently used by:
  - public NPC aggregate
  - public NPC detail/list frontend
  - Town NPC maintenance workbench

Required output:

- field matrix with:
  - field name
  - current location
  - source
  - consumer
  - semantic meaning
  - whether it belongs to base / public / maintenance

Success condition:

- no critical NPC field remains implicit in scattered DTOs or Vue access paths

#### M2. Unified Domain Shape

Goal:

- define and introduce the shared domain layer and subdomains in code-facing form

Required output:

- `NpcBaseDomain`
- `NpcPublicAggregateDomain`
- `TownNpcMaintenanceDomain`
- normalized nested domains for loot / shop / buffs / stats / wiki assets as needed

Success condition:

- shared facts and maintenance-only facts are no longer mixed without boundary

#### M3. Backend Adaptation

Goal:

- adapt backend services and DTO mapping to the frozen domain shape

Primary scope:

- `PublicNpcAggregateController`
- `PublicNpcService`
- public NPC mapping
- Town NPC maintenance response mapping

Success condition:

- both public and maintenance endpoints are backed by the same frozen domain vocabulary

#### M4. Frontend and Admin Consumption Alignment

Goal:

- align `front` and `data-query-app` to the adapted backend/domain shape

Primary scope:

- `front/src/views/NpcListView.vue`
- `front/src/views/NpcDetailView.vue`
- `front/src/types/index.ts`
- `data-query-app/composables/useTownNpcMaintenance.ts`
- `data-query-app/pages/entities/town-npcs/*`

Success condition:

- both surfaces render the same NPC facts consistently
- maintenance-only diagnostics no longer leak into public assumptions

## Recommended Execution Scope

The first execution batch should stop at:

- M1
- M2

Reason:

- this matches the user intent: organize the domains first, then adapt the backend
- it creates a stable contract before touching public and admin behavior
- it reduces the chance of spreading the current mismatch deeper into controllers and views

Only after M1 and M2 are complete should the repo move into M3 backend adaptation.

## Validation

Validation for this design should be layered:

### Design validation

- confirm every field currently consumed by public NPC pages and Town NPC maintenance is classified into one layer
- confirm no field is duplicated across layers without an explicit reason

### Backend adaptation validation

- targeted controller and service tests for public NPC aggregate
- targeted controller and service tests for Town NPC maintenance responses
- verification that the same core NPC identity facts are returned consistently across both surfaces

### Frontend validation

- public NPC list/detail still render after type updates
- Town NPC workbench overview, detail, and edit surfaces still render and save against the adapted backend shape

## Risks

### Risk 1: Scope creep into full canonical unification

The repo already has crawler work that could tempt this round into full canonical NPC modeling. That should be rejected in this round.

### Risk 2: Treating maintenance diagnostics as public domain facts

Fields like import coverage, unmatched items, or maintenance gaps are valid admin data, but they should not silently become public aggregate semantics.

### Risk 3: Preserving current naming drift

If M1 only lists fields but does not freeze names, M2 and M3 will inherit the same ambiguity.

### Risk 4: Letting frontend access paths define the domain

Current Vue code contains real consumer knowledge, but that code should not become the canonical schema by accident. The domain must be defined intentionally, then mapped into the views.

## Recommendation

Proceed in this order:

1. freeze the domain inventory
2. freeze the unified domain shape
3. adapt the backend to that shape
4. align public and maintenance consumers

Do not start by editing DTOs field-by-field in place. That is the fastest path to another round of hidden coupling.
