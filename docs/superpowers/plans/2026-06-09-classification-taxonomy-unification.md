# Classification Taxonomy Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify existing item category, NPC taxonomy, and drop source kind contracts across scripts, backend APIs, admin UI, and public UI without rebuilding data or running data-writing workflows.

**Architecture:** Contract-first execution. One owner writes shared contracts and DTO/API semantics first; UI agents consume those contracts only after backend fixtures and tests exist. Data/script work is limited to pure functions, contract tests, and explicitly read-only audits.

**Tech Stack:** Spring Boot + MyBatis Plus backend, Nuxt 4 admin app (`data-query-app`), Nuxt 4 public app (`front-nuxt`), Node data scripts under `scripts/data`.

---

## Non-Negotiable Boundaries

- Do not run crawler, import, backfill, fetch, pipeline, sync, relation apply/materialize/cutover/rollback/drop scripts.
- Do not execute `--apply=true`, Flyway apply, DB backup/restore, or hand-written SQL write commands.
- Do not mutate `items.category_id`, `item_category_rel`, `npcs.category_id`, `npc_type`, `is_town_npc`, `is_boss`, or `npc_loot_entries.drop_source_kind`.
- Do not rebuild `category`, `items`, `item_category_rel`, `npcs`, or `npc_loot_entries`.
- Do not merge NPC loot taxonomy audit statuses with runtime UI drop source kinds.
- Do not add bulk repair/apply buttons to admin audit pages.
- Do not let multiple agents write the same shared contract file, DTO/type file, endpoint, or page section in parallel.

## Existing Source Facts

- Item classification already exists through `category`, `items.category_id`, `item_category_rel`, `scripts/data/lib/item-category-normalization.mjs`, and `scripts/data/sync/sync-item-categories-from-wiki-pages.mjs`.
- Public item API already supports `categoryIds` and descendant expansion. This plan validates and extends DTO output; it does not rebuild that filter.
- Admin item API currently differs from public item filtering and must be aligned deliberately.
- NPC classification exists through `npcs.category_id`, `npc_type`, `is_town_npc`, `is_boss`, and `is_friendly`, but lacks a centralized runtime taxonomy contract.
- Runtime drop source kinds currently include `npc_drop`, `direct_boss`, and `treasure_bag`.
- NPC loot taxonomy contract under `docs/contracts/npc-loot-source-taxonomy-contract.md` is an audit/materialization contract, not a UI label enum.
- Front public pages still use local hardcoded groups and fallback inference in several places.
- Admin has edit-oriented item/NPC pages; classification audit must be a separate read-only operations surface.

## Agent Ownership

### Agent A: Data And Script Contracts

**Owns:**
- `scripts/data/lib/item-category-normalization.mjs`
- `scripts/data/lib/item-category-inference.mjs`
- `scripts/data/lib/npc-loot-source-taxonomy.mjs`
- New pure utility files under `scripts/data/lib/` only if needed
- Script/audit tests under `scripts/data/**/*.test.mjs`

**Does not own:**
- Database writes
- Import/backfill/fetch/crawler/pipeline/sync scripts
- Backend DTOs or UI files

### Agent B: Backend And API Contracts

**Owns:**
- Backend DTO/query/controller/service changes under `back/src/main/java/com/terraria/skills`
- Backend tests under `back/src/test/java`
- Shared API semantics for category path fields, NPC taxonomy fields, and runtime drop kind labels
- Canonical label/enum fixtures for UI consumption, including runtime `dropSourceKindLabel`

**Does not own:**
- Frontend page implementation
- Admin page implementation
- Data writing scripts

### Agent C: Admin UI

**Owns:**
- `data-query-app/pages/operations/classification-audit.vue`
- `data-query-app/layouts/default.vue`
- Admin stores/composables/types required only for classification audit and display
- Admin tests under `data-query-app/tests`

**Does not own:**
- Public frontend pages
- Backend endpoints
- Existing item/NPC edit flows except display-only alignment explicitly required by backend contract

### Agent D: Public UI

**Owns:**
- `front-nuxt/types/public-api.ts`
- `front-nuxt/composables/usePublicItems.ts`
- `front-nuxt/composables/usePublicNpcs.ts`
- `front-nuxt/composables/usePublicBosses.ts`
- `front-nuxt/pages/items/index.vue`
- `front-nuxt/pages/items/[id].vue`
- `front-nuxt/pages/npcs/index.vue`
- `front-nuxt/pages/npcs/[id].vue`
- `front-nuxt/pages/bosses/index.vue`
- `front-nuxt/pages/bosses/[id].vue`
- Public UI contract checks under `front-nuxt/scripts`

**Does not own:**
- Backend API implementation
- Admin UI
- Data scripts

## Cross-Review Matrix

| Implementer | Required Reviewer | Review Focus |
| --- | --- | --- |
| A | B | Script contract maps cleanly to backend DTO/API semantics; no data-writing command introduced |
| B | A | Backend preserves data source truth and does not reinterpret audit taxonomy as runtime label enum |
| B | C | Admin receives stable fields, labels, null behavior, pagination, and read-only audit data |
| B | D | Public UI receives stable fields, labels, filter behavior, and response fixtures |
| C | B | Admin audit page consumes backend read-only API and does not invent classification rules |
| C | D | Admin labels match public labels for NPC taxonomy, boss type, and drop source kind |
| D | B | Public UI does not rely on regex/text fallback for primary classification or source kind |
| D | C | Public and admin labels, empty states, and route/query behavior stay consistent |
| Final auditor | A/B/C/D | Same item, same NPC, and same boss show consistent category/type/drop labels across scripts, API, admin, and public UI |

---

## Phase 0: Contract Matrix

**Owner:** Agent A
**Reviewers:** Agent B, final plan auditor
**Write Scope:** Documentation only unless a reusable pure read helper already exists.

**Files:**
- Create: `docs/superpowers/specs/2026-06-09-classification-taxonomy-contract-matrix.md`

- [ ] List every authoritative and derived field:
  - `category.code`
  - `items.category_id`
  - `item_category_rel`
  - `npcs.category_id`
  - `npc_type`
  - `is_town_npc`
  - `is_boss`
  - `is_friendly`
  - `npc_loot_entries.drop_source_kind`

- [ ] For each field, record:
  - owner/source of truth
  - allowed values or value source
  - Chinese label source
  - API field names
  - admin consumers
  - public consumers
  - forbidden fallback or inference behavior

- [ ] Add UI consumer inventory:
  - `front-nuxt/pages/items/index.vue`
  - `front-nuxt/pages/items/[id].vue`
  - `front-nuxt/pages/npcs/index.vue`
  - `front-nuxt/pages/npcs/[id].vue`
  - `front-nuxt/pages/bosses/index.vue`
  - `front-nuxt/pages/bosses/[id].vue`
  - `data-query-app/pages/items.vue`
  - `data-query-app/pages/categories.vue`
  - `data-query-app/pages/entities/[type].vue`
  - `data-query-app/pages/entities/town-npcs/index.vue`

- [ ] Review checkpoint:
  - Agent B confirms fields match backend reality.
  - Final auditor confirms no write command or data repair is included.

## Phase 1: Shared Runtime Contracts

**Owner:** Agent B
**Reviewers:** Agent A, Agent C, Agent D
**Write Scope:** One backend/runtime contract owner only. UI agents consume after this phase is merged.

**Files likely involved:**
- Modify: `back/src/main/java/com/terraria/skills/dto/*`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/*`
- Modify or create backend tests under `back/src/test/java`
- If frontend label helpers are needed, Agent B first specifies exact response fields; C/D implement display helpers in their own phases.

- [ ] Define item category response contract:
  - `categoryId`
  - `categoryName`
  - `relatedCategoryIds`
  - `categoryPaths`
  - null behavior for missing categories

- [ ] Define NPC taxonomy response contract:
  - `categoryId`
  - `categoryName`
  - `npcType`
  - `isTownNpc`
  - `isBoss`
  - `isFriendly`
  - standard display label or enough fields for deterministic label

- [ ] Define runtime drop source kind contract:
  - `npc_drop`
  - `direct_boss`
  - `treasure_bag`
  - `unknown`
  - backend-owned `dropSourceKindLabel` next to `dropSourceKind`
  - label behavior for `npc_drop`, `direct_boss`, `treasure_bag`, `unknown`, null, and unrecognized values
  - UI may only display the backend label or a shared typed fallback that matches backend fixtures

- [ ] Define admin classification audit read-only response contract:
  - endpoint path owned by backend, such as `/admin/operations/classification-audit`
  - five top-level sections: `uncategorizedItems`, `uncategorizedNpcs`, `unknownDropSourceKinds`, `missingReferences`, `itemCategoryConflicts`
  - row identity fields, display labels, pagination shape, empty section shape, and null behavior
  - fixture response used by Admin UI tests
  - explicit statement that Admin UI must not assemble audit results from item/NPC edit/list APIs

- [ ] Keep NPC loot taxonomy separate:
  - Do not rename `accepted`, `generic_bucket`, `contract_mismatch`, `non_npc_source_misclassified`, or related audit statuses into UI labels.

- [ ] Add contract tests before implementation changes:
  - `PublicItemControllerTest` for `categoryPaths` and `relatedCategoryIds` fields.
  - `NpcControllerTest` for public NPC list, public NPC detail/aggregate, taxonomy fields, label source, null behavior, and category filtering behavior.
  - `AdminNpcControllerTest` for admin NPC list/detail taxonomy fields, label source, null behavior, and category filtering behavior.
  - `PublicBossControllerTest` for boss type, `dropSourceKind`, and `dropSourceKindLabel` behavior.
  - `AdminBossControllerTest` for `dropSourceKind` and `dropSourceKindLabel` behavior.
  - Admin classification audit controller test for five read-only sections, pagination/null behavior, and absence of write methods.

- [ ] Review checkpoint:
  - Agent A confirms no data mutation or taxonomy conflation.
  - Agent C/D confirm field names are usable for UI without local guessing.

## Phase 2: Backend And API Alignment

**Owner:** Agent B
**Reviewers:** Agent A, Agent C, Agent D
**Write Scope:** Backend only.

**Files likely involved:**
- Modify: `back/src/main/java/com/terraria/skills/controller/PublicItemController.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/ItemController.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/NpcController.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicItemServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/ItemServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicBossServiceImpl.java`
- Modify: relevant DTO/query classes

- [ ] Validate existing public item `categoryIds` and descendant expansion; do not reimplement it.

- [ ] Add `categoryPaths` and `relatedCategoryIds` to both `PublicItemListDTO` and `PublicItemDetailDTO`; update tests that currently exclude `categoryPaths` or `relatedCategoryIds` before implementation.

- [ ] Align admin item category filtering with public semantics, or document intentional public/admin difference in tests.

- [ ] NPC `categoryId` filter semantics are part of the backend contract:
  - choose exact-match or descendant-expanded behavior once
  - record the chosen behavior in the Phase 0 contract matrix
  - assert the chosen behavior separately for public `/npcs` and admin NPC listing

- [ ] Implement NPC category filtering consistently with the recorded contract:
  - public `/npcs`
  - admin NPC listing
  - tests must state whether both behave the same.

- [ ] Add backend-owned canonical `dropSourceKindLabel` next to `dropSourceKind` for NPC and Boss loot DTOs.

- [ ] Cover `npc_drop`, `direct_boss`, `treasure_bag`, `unknown`, null, and unrecognized `dropSourceKind` values in public/admin NPC and Boss tests.

- [ ] Verify Boss `bossType` filter is already supported by backend; do not reimplement query plumbing, and only add/repair label, null, and admin/public parity tests.

- [ ] Add backend read-only admin classification audit endpoint:
  - return only the Phase 1 audit response contract
  - support pagination where sections can grow large
  - return stable empty arrays and counters for zero-result sections
  - expose no `POST`, `PUT`, `PATCH`, `DELETE`, repair, apply, sync, materialize, rollback, or bulk action
  - provide sample fixtures to Agent C before Admin UI implementation starts

- [ ] Review checkpoint:
  - Agent C/D receive sample response fixtures.
  - Agent A confirms backend did not write or require data migration.

## Phase 3: Admin Read-Only Classification Audit

**Owner:** Agent C
**Reviewers:** Agent B, Agent A
**Write Scope:** Admin UI and admin tests only after backend read-only API is available.

**Files:**
- Create: `data-query-app/pages/operations/classification-audit.vue`
- Modify: `data-query-app/layouts/default.vue`
- Create: `data-query-app/tests/classification-audit-page-contract.test.mjs`
- Optional create: `data-query-app/stores/classificationAudit.ts`

- [ ] Add a separate operations page for classification audit.

- [ ] Display these read-only sections:
  - uncategorized items
  - uncategorized NPCs
  - unknown drop source kind
  - missing category/item/NPC references
  - item primary category vs relation conflicts

- [ ] Ensure page has no repair/apply/sync/bulk update commands.

- [ ] Keep normal edit flows in `data-query-app/pages/items.vue` and `data-query-app/pages/entities/[type].vue` unchanged unless a display-only label alignment is explicitly required.

- [ ] Consume only the backend read-only classification audit endpoint from Phase 2; do not assemble audit rows from item/NPC edit flows or local frontend inference.

- [ ] Add empty state behavior for each of the five audit sections when a section returns zero rows.

- [ ] Add contract test assertions:
  - page route exists
  - navigation entry exists
  - page contains read-only wording
  - no `post`, `put`, `delete`, `patch`, `apply`, `sync`, `repair`, `bulk`, `materialize`, or `rollback` action or button text is present in the audit page
  - five audit sections exist
  - five zero-result section empty states exist

- [ ] Review checkpoint:
  - Agent B confirms the page consumes only read-only API.
  - Agent A confirms no data repair behavior is exposed.

## Phase 4: Public UI Contract Consumption

**Owner:** Agent D
**Reviewers:** Agent B, Agent C
**Write Scope:** Public UI only after Phase 2 response fixtures exist.

**Files likely involved:**
- Modify: `front-nuxt/types/public-api.ts`
- Modify: `front-nuxt/composables/usePublicItems.ts`
- Modify: `front-nuxt/composables/usePublicNpcs.ts`
- Modify: `front-nuxt/composables/usePublicBosses.ts`
- Modify: `front-nuxt/pages/items/index.vue`
- Modify: `front-nuxt/pages/items/[id].vue`
- Modify: `front-nuxt/pages/npcs/index.vue`
- Modify: `front-nuxt/pages/npcs/[id].vue`
- Modify: `front-nuxt/pages/bosses/index.vue`
- Modify: `front-nuxt/pages/bosses/[id].vue`
- Modify: `front-nuxt/scripts/check-public-pages.mjs`

- [ ] Update public API types for item category paths, related category ids, NPC taxonomy fields, Boss type, and runtime drop source labels.

- [ ] Update composables first:
  - normalize API fields
  - preserve empty/null behavior
  - keep fallback only for display safety, not as primary classification logic
  - when response source is API data, do not use regex, category text, local terms, or name heuristics to decide item primary category, NPC primary type, boss type, or drop source kind

- [ ] Public item page:
  - keep product filter UX
  - use API category/path fields as classification truth
  - ensure API pagination is not replaced by local filtering
  - stop using local regex/category text as primary category truth
  - keep `categoryIds`, search, and pagination query hydration/cleanup stable

- [ ] Public item detail:
  - group sources by standard source fields or backend labels
  - only use regex fallback for unknown legacy rows
  - define display text for null category, empty category path, unknown source kind, and API unavailable states

- [ ] Public NPC pages:
  - use taxonomy fields for labels and filters
  - avoid using text terms to decide primary NPC type
  - keep `categoryId` or taxonomy filters, `isTownNpc`, `isBoss`, `isFriendly`, search, and pagination query behavior explicit

- [ ] Public Boss pages:
  - add `bossType` filter UI and route query synchronization
  - use standard drop source labels for direct boss and treasure bag groups
  - keep `bossType`, search, and pagination query behavior explicit
  - define label behavior for `npc_drop`, `direct_boss`, `treasure_bag`, `unknown`, null, and unrecognized drop source kinds

- [ ] Add or extend public contract checks:
  - category path fields are consumed
  - `bossType` enters query and route state
  - item `categoryIds` query, NPC taxonomy query, and pagination query state are preserved
  - `dropSourceKind` label mapping covers `npc_drop`, `direct_boss`, `treasure_bag`, `unknown`, null, and unrecognized values
  - fallback inference is not the primary classifier for API-sourced item, NPC, boss, or drop source data
  - DOM or component checks prove visible classification labels come from API fixture values, not local regex/text fallback

- [ ] Review checkpoint:
  - Agent B confirms frontend request/query semantics match API tests.
  - Agent C confirms admin/public labels match.

## Phase 5: Data And Script Safety Verification

**Owner:** Agent A
**Reviewers:** Final auditor, Agent B
**Write Scope:** Tests, pure helpers, and test fixtures only.

- [ ] Run test-only data/script safety checks. These tests must not write real DB data; tests that use mock DB `SELECT` paths or temporary report files are acceptable only inside the test harness:

```bash
node --test scripts/data/lib/item-category-normalization.test.mjs
node --test scripts/data/lib/item-category-inference.test.mjs
node --test scripts/data/lib/npc-loot-source-taxonomy.test.mjs
node --test scripts/data/audit/audit-item-category-taxonomy.test.mjs
node --test scripts/data/audit/npc-domain-loot-chain-audit.test.mjs scripts/data/audit/npc-loot-correctness-gate.test.mjs
```

- [ ] Before any read-only audit script is considered, inspect for writes/network/process execution:

```bash
rg -n "INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE TABLE|writeFile|mkdir|rename|unlink|createConnection|execute\\(|fetch\\(|spawn|execFile|exec\\(" scripts/data
```

- [ ] Do not run read-only DB audits unless the implementer explicitly confirms the script has no write path and the user approves DB reads.

- [ ] If a real audit script defaults to writing reports, disable report writing explicitly or keep it out of the execution set until the user approves the exact read/report command.

## Phase 6: Final Cross-Agent Acceptance

**Owner:** Final auditor
**Reviewers:** A, B, C, D

- [ ] Backend focused validation:

```bash
cd back
mvn -Dtest=PublicItemControllerTest,NpcControllerTest,AdminNpcControllerTest,PublicBossControllerTest,AdminBossControllerTest test
```

- [ ] Admin validation:

```bash
cd data-query-app
pnpm run check
node --test tests/*.test.mjs
```

- [ ] Public validation:

```bash
cd front-nuxt
pnpm run check:public-pages
nuxt typecheck
```

- [ ] Final full frontend validation:

```bash
cd front-nuxt
pnpm run check
```

- [ ] Manual or scripted smoke samples:
  - `GET /public/items?categoryIds=a,b` includes descendants and stable pagination.
  - `GET /public/items/{id}` returns category path and related category fields.
  - `GET /public/npcs?categoryId=parent` behavior is verified for public and admin, or documented as intentionally different.
  - NPC detail returns only ordinary NPC loot in NPC context.
  - Boss detail returns direct boss and treasure bag drops in Boss context.
  - `GET /public/bosses?bossType=...` filters backend results and public route query.
  - Admin classification audit page shows five read-only issue groups and no write action.
  - Public DOM or component smoke confirms visible item/NPC/boss classification labels come from API fixture values.

## Commit Strategy

- Commit after each phase if tests pass and staged scope is focused.
- Do not use `git add .`.
- Before every commit:

```bash
git status --short
git diff --cached --stat
```

- Suggested commit sequence:
  - `docs: record classification taxonomy contract matrix`
  - `test(back): lock classification API contracts`
  - `fix(back): align classification API fields`
  - `feat(admin): add read-only classification audit`
  - `fix(front): consume classification API contracts`
  - `test: verify classification taxonomy alignment`

## Execution Policy

- Use one implementation agent per phase or per disjoint file group.
- Run cross-review before proceeding to the next dependent phase.
- If a review finds a contract mismatch, pause downstream UI work, repair the contract, rerun affected tests, then continue.
- If an implementation requires data writes, crawler, import, backfill, fetch, sync, or migration apply, stop and request explicit user approval with the exact command and risk.
