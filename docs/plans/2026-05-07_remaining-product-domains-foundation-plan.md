# Remaining Product Domains Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. Split work by domain and keep shared files serial. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `bosses`, `buffs`, `projectiles`, and `armor_sets` from `planned-public + publicRoute=null` to public-route-ready foundations, then open public routes one domain at a time.

**Architecture:** Keep domain acceptance as the release gate, but do not treat domain acceptance alone as sufficient where cross-domain image lineage contracts are missing. Foundation work comes before public UI/API exposure; public route promotion is a separate serial phase.

**Tech Stack:** Node.js audit/workflow scripts, Java Spring Boot backend, Flyway SQL migrations, Vue/Nuxt admin app, Vue public front app, MySQL-backed local/maint/relation schemas.

---

## Current State

Items/NPCs are already public:

| Domain | publicExposure | publicRoute |
| --- | --- | --- |
| `items` | `public` | `/items` |
| `npcs` | `public` | `/npcs` |

Remaining product domains stay closed:

| Domain | publicExposure | publicRoute | Current priority |
| --- | --- | --- | --- |
| `bosses` | `planned-public` | `null` | First |
| `buffs` | `planned-public` | `null` | After Bosses foundation proof |
| `projectiles` | `planned-public` | `null` | After Buffs, same image lineage class |
| `armor_sets` | `planned-public` | `null` | Last |

Baseline facts from 2026-05-07 local reports:

| Evidence | Result | Planning impact |
| --- | --- | --- |
| `node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true` | Exit 0, overall `warning`, no blocked checks | Remaining domains are closed by route warnings, not blocked |
| `reports/domain/{bosses,buffs,projectiles,armor_sets}/*-2026-05-07.json` | Five product panels pass for each remaining domain | Domain panels are usable as baseline evidence |
| `reports/audit/image-source-lineage-2026-05-07.json` | `buffs.contractReady=false`, `projectiles.contractReady=false`, `biomes.contractReady=false` | Buffs/Projectiles cannot be opened on domain acceptance alone |
| `scripts/data/audit/image-source-lineage-report.mjs` | Covers `items`, `buffs`, `npcs`, `projectiles`, `biomes`; does not cover `bosses` or `armor_sets` | Bosses/ArmorSets need explicit audit coverage decision before public route |
| Bosses public consumption | Admin API and management UI exist, but no `projection_bosses`, no public Boss API, no public front route, no Boss image contract | Bosses is the first foundation target, not a direct route toggle |
| Buffs relation image chain | `relation_buff_images` and projection code exist, but `projection_buffs.image` is `0/388` in lineage evidence | Do not create schema blindly; first connect audit and fix managed-image projection |
| Projectiles relation image chain | `relation_projectile_images` and projection code exist; `projection_projectiles.image_url` is `1110/1111` and managed for populated rows | Main gap is audit contract wiring, not necessarily new schema |
| ArmorSets relation/projection chain | relation/projection code exists, but domain reports prove file evidence more than DB projection/managed image consistency | ArmorSets stays last and needs explicit DB-backed image/projection audit |
| Dry-run domain report generation | 3 warnings from Items optional evidence: `reports/wiki-items-fetch*.json`, `reports/wiki-item-pages-fetch*.json`, `reports/relation/item-relations-bundle*.json`, `reports/image-sync*.json` | Known issue outside this plan; record it, but do not block remaining-domain foundation work on it |

## Non-Goals

- Do not batch-promote the four remaining domains to `public`.
- Do not add public front routes before the target domain foundation passes.
- Do not use `acceptedWarnings` to force public exposure.
- Do not run crawler/import/backfill/load/apply commands as part of planning.
- Do not write DB rows without a pre-count, post-count, rollback path, and tracked audit closeout.

## Multi-Agent Work Split

Use four lanes, but keep shared files serial:

| Lane | Owner scope | Can run in parallel | Must be serial |
| --- | --- | --- | --- |
| Agent A | Bosses readiness proof and public-route candidate design | Read-only audits, backend/admin tests, Boss-only backend files | Shared projection/audit/contract files, public routes, registry |
| Agent B | Buffs image lineage parity | Buff-specific tests and schema design | Flyway migration number, shared projection/audit/contract files |
| Agent C | Projectiles image lineage parity | Projectile-specific tests and schema design | Flyway migration number, shared projection/audit/contract files |
| Agent D | ArmorSets audit coverage and final route readiness | ArmorSet-specific tests and read-only audit design | Shared projection/audit/contract files, public routes, registry |

Parallel work is allowed only while each lane is read-only or owns disjoint files. Public route promotion is always one domain at a time.

Shared files that must not be edited by multiple agents in parallel:

- `scripts/data/relation/projection-schema.mjs`
- `scripts/data/relation/projection-sync.mjs`
- `scripts/data/audit/domain-readiness-audit.mjs`
- `scripts/data/audit/image-source-lineage-report.mjs`
- `scripts/data/workflow/domain-acceptance-registry.json`
- `docs/contracts/image-source-contract.md`
- `front/src/router/routes.ts`
- shared tests for the files above

## Phase 0: Baseline And Gate Hygiene

**Purpose:** Lock the real baseline before adding foundation work.

**Files:**

- Read: `scripts/data/workflow/domain-acceptance-registry.json`
- Read: `scripts/data/workflow/domain-acceptance-report-manifest.mjs`
- Read: `scripts/data/workflow/domain-acceptance-a-grade-gate.mjs`
- Read: `scripts/data/audit/image-source-lineage-report.mjs`
- Create: `docs/audits/2026-05-07_remaining-product-domains-baseline.md`

- [ ] Run worktree check:

```powershell
git status --short --branch
```

Expected: no unrelated dirty changes before implementation begins.

- [ ] Generate fresh domain evidence files:

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
```

Expected: `write=true`, reports are written under `reports/domain/**`, and no DB writes occur. This step is mandatory on a clean machine or clean worktree before running the gate.

- [ ] Verify evidence freshness:

```powershell
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
```

Expected: generated domain reports are `fresh`; missing or stale target-domain evidence must be fixed before using the baseline.

- [ ] Run current domain gate:

```powershell
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

Expected: exit 0; no blocked checks. Remaining 4 domains may show `public.plannedRouteMissing` because they are still `planned-public + publicRoute=null`.

- [ ] Run dry-run report generation:

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs
```

Expected: `write=false`. If warning panels are not limited to already-known optional evidence or target-domain planned route state, stop and classify the warning before domain work.

- [ ] Run image lineage snapshot:

```powershell
node scripts/data/audit/image-source-lineage-report.mjs --source=db
```

Expected: DB must be reachable. Record `contractReady` and `gapReasons` for `items`, `buffs`, `npcs`, `projectiles`, and `biomes`.

- [ ] Write baseline audit:

```text
docs/audits/2026-05-07_remaining-product-domains-baseline.md
```

The audit must state which warnings are target-domain blockers, which are planned-route closure warnings, and which are unrelated optional-evidence warnings from already-public domains. The Items optional-evidence warnings are independent of this plan and do not block Bosses/Buffs/Projectiles/ArmorSets foundation work unless they become blocked checks or affect the target domain.

**Exit gate:** Fresh evidence exists for all target domains and there are no `blocked` checks. If global warnings include Items optional evidence, do not use `overallStatus=warning` alone as a failure signal for remaining-domain foundation work; use domain-scoped checks plus the image lineage contract.

## Phase 1: Bosses Foundation Proof

**Purpose:** Build the missing Boss public-consumption foundation. Bosses is still first priority, but direct `/bosses` route promotion is not allowed until projection, public API, image contract, and readiness evidence are real.

**Files:**

- Inspect: `scripts/data/workflow/domain-acceptance-registry.json`
- Inspect: `scripts/data/workflow/run-wiki-sync.mjs`
- Inspect: `scripts/data/workflow/seed-wiki-source-manifest.mjs`
- Modify: `scripts/data/audit/domain-readiness-audit.mjs`
- Modify: `scripts/data/relation/projection-schema.mjs`
- Modify: `scripts/data/relation/projection-schema.test.mjs`
- Modify: `scripts/data/relation/projection-sync.mjs`
- Modify: `scripts/data/relation/projection-sync.test.mjs`
- Modify: `scripts/data/audit/image-source-lineage-report.mjs`
- Modify: `scripts/data/audit/image-source-lineage-report.test.mjs`
- Modify: `docs/contracts/image-source-contract.md`
- Inspect: `back/src/main/java/com/terraria/skills/controller/AdminBossController.java`
- Inspect: `back/src/test/java/com/terraria/skills/controller/AdminBossControllerTest.java`
- Create: `back/src/main/java/com/terraria/skills/controller/PublicBossController.java`
- Create or modify: `back/src/main/java/com/terraria/skills/service/PublicBossService.java`
- Create or modify: `back/src/main/java/com/terraria/skills/service/impl/PublicBossServiceImpl.java`
- Create: `back/src/test/java/com/terraria/skills/controller/PublicBossControllerTest.java`
- Inspect: `data-query-app/pages/entities/[type].vue`
- Inspect: `front/src/tests/npc-public-shell.spec.ts`

- [ ] Verify source chain:

```powershell
node scripts/data/audit/domain-readiness-audit.mjs --domain=bosses --panel=source
```

Expected: `status=pass`; source evidence includes `data/generated/wiki-bosses.latest.json`, boss fetch report, and boss import report.

- [ ] Verify relation/projection chain:

```powershell
node scripts/data/audit/domain-readiness-audit.mjs --domain=bosses --panel=relation
```

Expected: `status=pass`; evidence includes boss loot import and relation entity coverage.

- [ ] Verify image/public panels:

```powershell
node scripts/data/audit/domain-readiness-audit.mjs --domain=bosses --panel=image
node scripts/data/audit/domain-readiness-audit.mjs --domain=bosses --panel=public
```

Expected: both pass. If Boss image evidence is only inherited from NPC-standardized data, record that as a public-route risk unless the public UI explicitly does not depend on boss portraits.

- [ ] Tighten Boss public readiness evidence:

```text
Current weak evidence: publicReadiness checks AdminBossController.java, front/src/router/routes.ts, and front/src/views existence.
Required evidence before route promotion: PublicBossController or equivalent public API, route scope/spec evidence, and DB projection or documented read model.
```

Expected: `domain-readiness-audit.mjs --domain=bosses --panel=public` cannot pass merely because admin controller and generic front files exist.

- [ ] Add Boss projection contract or documented replacement:

```text
Preferred: projection_bosses with fields needed by public API/list view.
Minimum fields: id, code/internal key, display name, image URL or documented null image policy, members/loot summary fields needed by public UI, deleted flag.
Alternative: if using boss_groups as read model, document why projection_bosses is not needed and add a public-readiness check for that read model.
```

Expected: public Boss API does not read from admin-only controller behavior and does not rely on undocumented legacy fallback.

- [ ] Add Boss image lineage coverage:

```text
ENTITY_ORDER includes bosses or a separate Boss image contract exists.
Boss public images must be managed URLs, or the public UI must explicitly use a no-image fallback and the audit must state this.
```

Expected: Boss image behavior is auditable before `/bosses` appears in public routes.

- [ ] Add public Boss API:

```text
Required endpoint class: PublicBossController.java
Allowed endpoints for first route slice:
GET /public/bosses or existing public prefix equivalent for list
GET /public/bosses/{id} only if detail route is included
Forbidden: exposing /admin/bosses directly to the public front app
```

Expected: public API tests cover list payload shape and do not require admin auth or admin endpoint paths.

- [ ] Run backend controller test:

```powershell
Push-Location back
mvn "-Dtest=AdminBossControllerTest,PublicBossControllerTest" test
Pop-Location
```

Expected: pass.

- [ ] Re-run strengthened Boss readiness panels:

```powershell
node scripts/data/audit/domain-readiness-audit.mjs --domain=bosses --panel=image
node scripts/data/audit/domain-readiness-audit.mjs --domain=bosses --panel=public
```

Expected: both pass after the public readiness evidence is strengthened. `publicReadiness` must pass from PublicBoss API, public route scope/spec evidence, and projection or documented read-model evidence; `AdminBossController` alone is not sufficient.

- [ ] Decide Bosses route scope:

```text
Allowed route scope: /bosses list first.
Detail route /bosses/:id is allowed only if backend public detail payload and tests exist in the same execution slice.
```

Expected: choose one route scope before touching `front/src/router/routes.ts`. `/bosses` list first is preferred; `/bosses/:id` requires public detail API and tests in the same slice.

**Exit gate:** Bosses can enter public-route implementation only if the five domain panels pass with strengthened public evidence, public Boss API tests pass, Boss projection/read model is explicit, and Boss image semantics are auditable. If any of these are missing, registry promotion to `public` is blocked.

## Phase 2: Buffs Image Lineage Parity

**Purpose:** Make Buff image lineage match the unified image contract before any public Buff route. Current evidence indicates relation image infrastructure exists, so the first assumption is audit/projection repair, not new-table creation.

**Files:**

- Modify: `docs/contracts/image-source-contract.md`
- Modify: `scripts/data/audit/image-source-lineage-report.mjs`
- Modify: `scripts/data/audit/image-source-lineage-report.test.mjs`
- Modify only if schema audit proves a missing DB object: `back/src/main/resources/db/migration/V*_*.sql`
- Inspect: `scripts/data/relation/image-processor.mjs`
- Inspect: `scripts/data/relation/projection-sync.mjs`
- Inspect: `back/src/main/java/com/terraria/skills/service/impl/WikiImageSyncServiceImpl.java`
- Inspect: `back/src/test/java/com/terraria/skills/service/impl/WikiImageSyncServiceImplTest.java`
- Inspect: `back/src/main/java/com/terraria/skills/controller/AdminBuffController.java`
- Inspect: `back/src/test/java/com/terraria/skills/controller/AdminBuffControllerTest.java`

- [ ] Add tests first for Buff lineage:

```powershell
node --test scripts/data/audit/image-source-lineage-report.test.mjs
```

Expected before implementation: a new Buff fixture fails because the audit contract is not wired to the existing Buff maint/relation image chain, and `projection_buffs.image` remains empty or unmanaged.

- [ ] Verify existing Buff lineage objects before migration:

```powershell
rg -n "maint_buffs|relation_buff_images|projection_buffs|buffImages|cachedUrl" scripts/data/relation back/src/main/resources/db/migration scripts/data/audit/image-source-lineage-report.mjs
```

Expected: identify whether the current source of truth is `maint_buffs` plus `relation_buff_images`, or whether a dedicated `maint_buff_images` table is truly required. If the relation table already exists, do not add a duplicate table.

- [ ] Wire Buff lineage audit:

```text
Buff contractReady requires:
core image exists in buffs.image or equivalent cached image field
maint-stage image source exists from the canonical maint table or a dedicated maint image table
relation_buff_images rows exist
projection_buffs.image exists
projection image values are managed URLs
```

Expected: `entities.buffs.contractReady === true`, `entities.buffs.gapReasons === []`, `projection_buffs.image` is non-empty for image-bearing Buff rows, and projection managed image count equals projection image count.

- [ ] Fix Buff managed-image projection if audit shows `projection_buffs.image` remains empty:

```text
Likely target: relation image cachedUrl selection or projection-sync managed URL policy.
Do not loosen managed URL validation to accept wiki source URLs.
```

Expected: managed cached URLs flow into `projection_buffs.image`; raw wiki URLs still fail managed-image checks.

- [ ] Run validation:

```powershell
node --test scripts/data/audit/image-source-lineage-report.test.mjs
node --test scripts/data/relation/image-processor.test.mjs scripts/data/relation/projection-sync.test.mjs
Push-Location back
mvn "-Dtest=WikiImageSyncServiceImplTest,AdminBuffControllerTest" test
Pop-Location
```

Expected: pass.

**Exit gate:** Buffs remain `planned-public + publicRoute=null` until `image-source-lineage-report.mjs --source=db` reports Buff `contractReady=true` with empty gaps.

## Phase 3: Projectiles Image Lineage Parity

**Purpose:** Bring Projectile image lineage to the same level as Buffs before any public Projectile route. Current projection image coverage is mostly usable; the first gap is audit contract wiring.

**Files:**

- Modify: `docs/contracts/image-source-contract.md`
- Modify: `scripts/data/audit/image-source-lineage-report.mjs`
- Modify: `scripts/data/audit/image-source-lineage-report.test.mjs`
- Modify only if schema audit proves a missing DB object: `back/src/main/resources/db/migration/V*_*.sql`
- Inspect: `scripts/data/relation/image-processor.mjs`
- Inspect: `scripts/data/relation/projection-sync.mjs`
- Inspect: `back/src/main/java/com/terraria/skills/service/impl/WikiImageSyncServiceImpl.java`
- Inspect: `back/src/test/java/com/terraria/skills/service/impl/WikiImageSyncServiceImplTest.java`
- Inspect: `back/src/main/java/com/terraria/skills/controller/AdminProjectileController.java`
- Inspect: `back/src/test/java/com/terraria/skills/controller/AdminProjectileControllerTest.java`

- [ ] Add tests first for Projectile lineage:

```powershell
node --test scripts/data/audit/image-source-lineage-report.test.mjs
```

Expected before implementation: a new Projectile fixture fails because the audit contract is not wired to the existing Projectile maint/relation image chain.

- [ ] Verify existing Projectile lineage objects before migration:

```powershell
rg -n "maint_projectiles|relation_projectile_images|projection_projectiles|projectileImages|cachedUrl" scripts/data/relation back/src/main/resources/db/migration scripts/data/audit/image-source-lineage-report.mjs
```

Expected: identify whether the current source of truth is `maint_projectiles` plus `relation_projectile_images`, or whether a dedicated `maint_projectile_images` table is truly required. If the relation table already exists, do not add a duplicate table.

- [ ] Wire Projectile lineage audit:

```text
Projectile contractReady requires:
core image exists in projectiles.image_url or raw_json.imageUrl
maint-stage image source exists from the canonical maint table or a dedicated maint image table
relation_projectile_images rows exist
projection_projectiles.image_url exists
projection image values are managed URLs
```

Expected: `entities.projectiles.contractReady === true`, `entities.projectiles.gapReasons === []`, and projection managed image count equals projection image count.

- [ ] Run validation:

```powershell
node --test scripts/data/audit/image-source-lineage-report.test.mjs
node --test scripts/data/relation/image-processor.test.mjs scripts/data/relation/projection-sync.test.mjs
Push-Location back
mvn "-Dtest=WikiImageSyncServiceImplTest,AdminProjectileControllerTest" test
Pop-Location
```

Expected: pass.

**Exit gate:** Projectiles remain `planned-public + publicRoute=null` until `image-source-lineage-report.mjs --source=db` reports Projectile `contractReady=true` with empty gaps.

## Phase 4: ArmorSets Audit Coverage

**Purpose:** Make ArmorSets auditable before public exposure. ArmorSets are last because their image model is multi-role, current parsed image evidence has wiki source URLs with empty `cachedUrl`, and the current domain pass does not prove `projection_armor_sets` managed image consistency.

**Files:**

- Modify: `docs/contracts/image-source-contract.md`
- Modify: `scripts/data/audit/image-source-lineage-report.mjs`
- Modify: `scripts/data/audit/image-source-lineage-report.test.mjs`
- Inspect: `back/src/main/java/com/terraria/skills/controller/AdminArmorSetController.java`
- Inspect: `back/src/test/java/com/terraria/skills/controller/AdminArmorSetControllerTest.java`
- Inspect: `back/src/main/java/com/terraria/skills/service/impl/WikiImageSyncServiceImpl.java`
- Inspect: `back/src/test/java/com/terraria/skills/service/impl/WikiImageSyncServiceImplTest.java`
- Inspect: `scripts/data/relation/armor-set-processor.mjs`
- Inspect: `scripts/data/relation/projection-sync.mjs`

- [ ] Define ArmorSets image contract:

```text
Entity: armor_sets
Core fields: male_images, female_images, special_images, or the canonical image field selected by the audit
Projection table: projection_armor_sets
Image roles: male, female, special
Managed URL rule: every public-consumed image URL must use the managed-image URL policy
```

Expected: contract explains whether ArmorSets require maint/relation image tables or use a documented multi-image exception.

- [ ] Tighten ArmorSets domain readiness evidence:

```text
Current risk: relation-readiness can pass from reports/relation/entity-coverage-baseline-2026-04-28.json even if that report does not include armor_sets.
Required: either entity coverage includes armor_sets explicitly or ArmorSets relation/public readiness uses a DB-backed projection evidence report.
```

Expected: ArmorSets readiness cannot pass solely from a relation baseline that omits ArmorSets.

- [ ] Add ArmorSets to lineage audit:

```text
ENTITY_ORDER includes armor_sets.
deriveProjectionTableName('armor_sets') returns projection_armor_sets.
gapReasons identify missing core images, missing projection rows, missing projection image values, and unmanaged projection images.
```

Expected: `reports/audit/image-source-lineage-YYYY-MM-DD.json` contains `entities.armor_sets`.

- [ ] Prove managed image URLs:

```text
Do not use data/terraPedia/raw/wiki/armor_set_images.parsed.latest.json source URLs as public image URLs.
Every image consumed by projection_armor_sets must resolve from managed cached URLs or be treated as missing.
```

Expected: source wiki URLs remain provenance only; public-consumed `maleImages`, `femaleImages`, and `specialImages` are managed or null.

- [ ] Run validation:

```powershell
node --test scripts/data/audit/image-source-lineage-report.test.mjs
Push-Location back
mvn "-Dtest=WikiImageSyncServiceImplTest,AdminArmorSetControllerTest" test
Pop-Location
```

Expected: pass.

**Exit gate:** ArmorSets stay closed until the lineage report contains explicit ArmorSet evidence and no public-consumed ArmorSet image uses unmanaged source URLs.

## Phase 5: Single-Domain Public Route Rollout

**Purpose:** Promote one foundation-ready domain to public route.

Allowed order:

1. `bosses`
2. `buffs`
3. `projectiles`
4. `armor_sets`

Each domain uses the same route rollout sequence.

**Shared files, serial only:**

- Modify: `scripts/data/workflow/domain-acceptance-registry.json`
- Modify: `front/src/router/routes.ts`
- Modify: `front/src/tests/npc-public-shell.spec.ts` or create a domain-specific public shell test
- Create: `front/src/views/<Domain>PublicView.vue`
- Create: `docs/audits/2026-05-07_<domain>-public-route-closeout.md`

- [ ] Write public route test before registry promotion:

```text
Update or create the target domain public route spec first.
For the target domain only, change the route expectation from absent to present.
Example for Bosses list route: expect(routes.some(route => route.path === '/bosses')).toBe(true)
Keep non-target remaining domains absent.
```

```powershell
Push-Location front
pnpm run test -- --run
Pop-Location
```

Expected before implementation: target domain route expectations fail because the route does not exist yet.

- [ ] Add public route and view:

```text
Bosses route: /bosses
Buffs route: /buffs
Projectiles route: /projectiles
ArmorSets route: /armor-sets
```

Expected: route renders without depending on admin-only endpoints.

- [ ] Promote exactly one registry domain:

```text
publicExposure: "planned-public" -> "public"
publicRoute: null -> target route
```

Expected: no other domain changes in `scripts/data/workflow/domain-acceptance-registry.json`.

- [ ] Regenerate domain evidence:

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

Expected: target domain `publicGateStatus=public_route_configured`, `routeReady=true`, no target-domain blocked checks. Global warning may remain if other domains are still `planned-public`.

- [ ] Run targeted tests:

```powershell
node --test scripts/data/workflow/domain-acceptance-report-manifest.test.mjs scripts/data/workflow/domain-acceptance-a-grade-gate.test.mjs scripts/data/workflow/domain-acceptance-freshness-audit.test.mjs scripts/data/workflow/domain-acceptance-generate-reports.test.mjs
Push-Location front
pnpm run test -- --run
Pop-Location
```

Expected: pass.

- [ ] Write closeout audit:

```text
docs/audits/2026-05-07_<domain>-public-route-closeout.md
```

The closeout must include exact commands, target domain gate fields, remaining warnings, and rollback steps.

## Rollback Template

For any single-domain route rollout:

- [ ] Revert only the target domain registry fields to `planned-public + publicRoute=null`.
- [ ] Remove only the target domain public routes and public view files.
- [ ] Keep previously public domains unchanged.
- [ ] Re-run domain evidence generation and A-grade gate.
- [ ] Confirm target domain returns to `publicGateStatus=planned_public_no_route`.
- [ ] Confirm Items/NPCs remain `public_route_configured`.
- [ ] Record rollback in the target closeout audit.

## Hard Boundaries

- A domain with `acceptedWarningActive=true` is not eligible for public route.
- A domain with image lineage `contractReady=false` is not eligible if the public UI consumes that domain's images.
- Bosses are not eligible until public API and projection/read-model evidence exist; `AdminBossController` does not count as public API.
- Buffs and Projectiles are not eligible until existing relation image chains are connected to the image lineage audit and managed projection image coverage is verified.
- ArmorSets are not eligible until `image-source-lineage-report.mjs` emits explicit ArmorSet evidence and readiness reports prove `projection_armor_sets` managed image consistency.
- Bosses are not eligible if the public UI needs boss portraits and Boss image lineage cannot be proven.
- `domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true` is mandatory; `--fail-on-warning=true` is allowed only after unrelated optional-evidence warnings are resolved.
- Public route promotion is serial; no two product domains can be promoted in the same commit.
- DB schema changes must use Flyway migrations; DB data writes require pre-count, post-count, rollback, and audit closeout.

## Recommended First Execution Batch

Start with Phase 0 and Phase 1 only.

Reason: Bosses may already be the safest next public candidate, but that is only true if its current pass evidence is not hiding an image/projection ambiguity. Buffs/Projectiles require schema and lineage work, and ArmorSets needs audit coverage design first.
