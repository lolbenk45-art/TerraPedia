# Backend Relation Four-Domain Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend safely consume relation-backed compatible data for `items`, `npcs`, `projectiles`, and `buffs`, with scripts that refresh and verify the local-compatible layer.

**Architecture:** Keep `terria_v1_local` as the backend's main database for this milestone so existing joins, CRUD, users, recipes, and support tables remain stable. Treat `terria_v1_relation.projection_*` as the source for the four core read domains, add backend readiness checks that compare local core tables to relation projections, and provide scripts to refresh local core tables from relation projections with backup and validation.

**Tech Stack:** Spring Boot, MyBatis Plus, JdbcTemplate, Node.js, MySQL, PowerShell local stack scripts.

---

## Scope

- Included: `items`, `npcs`, `projectiles`, `buffs` read compatibility, backend readiness visibility, startup guard, local-compatible refresh script, readiness report refresh, targeted backend/script tests.
- Not included: moving all backend writes to `terria_v1_relation`, rewriting every import/backfill script default database, replacing recipe/category/user/article tables.

## Milestones

### M1: Freeze Backend Cutover Contract

**Files:**
- Create: `docs/superpowers/plans/2026-04-26-backend-relation-four-domain-cutover.md`

- [x] Define the four-domain contract.
- [x] Keep backend DB URL on `terria_v1_local`.
- [x] Require local core tables to match `terria_v1_relation.projection_*`.
- [x] Require a backend readiness API and optional startup guard.

### M2: Backend Readiness Contract

**Files:**
- Create: `back/src/main/java/com/terraria/skills/config/RelationCompatibilityProperties.java`
- Create: `back/src/main/java/com/terraria/skills/dto/RelationCompatibilityDomainStatusDTO.java`
- Create: `back/src/main/java/com/terraria/skills/dto/RelationCompatibilityStatusDTO.java`
- Create: `back/src/main/java/com/terraria/skills/service/RelationCompatibilityService.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/RelationCompatibilityServiceImpl.java`
- Create: `back/src/main/java/com/terraria/skills/config/RelationCompatibilityStartupVerifier.java`
- Create: `back/src/main/java/com/terraria/skills/controller/AdminRelationCompatibilityController.java`
- Test: `back/src/test/java/com/terraria/skills/service/impl/RelationCompatibilityServiceImplTest.java`
- Test: `back/src/test/java/com/terraria/skills/controller/AdminRelationCompatibilityControllerTest.java`

- [x] Write failing service tests for aligned and blocked domains.
- [x] Implement readiness comparison for row counts, shared keys, missing/extra keys, and blocking fields.
- [x] Add an admin endpoint at `/admin/relation/compatibility`.
- [x] Add startup verifier controlled by `terraria.relation.compatibility.startup-check-enabled`.
- [x] Register properties in `WebConfig`.

### M3: Script Refresh And Smoke Checks

**Files:**
- Create: `scripts/data/relation/sync-projection-to-local-core-tables.mjs`
- Create: `scripts/data/relation/sync-projection-to-local-core-tables.test.mjs`
- Create: `scripts/data/relation/local-core-compat-smoke-check.mjs`
- Create: `scripts/data/relation/local-core-compat-smoke-check.test.mjs`
- Modify: `scripts/data/relation/replacement-readiness-audit.mjs`
- Modify: `scripts/data/relation/replacement-readiness-audit.test.mjs`

- [x] Add dry-run first refresh plan generation.
- [x] Add `--apply` refresh that backs up local core tables, replaces only the four local core tables from projection tables, and writes a JSON report.
- [x] Add smoke check that fails when any four-domain local table diverges from projection.
- [x] Refresh readiness output with current DB state.

### M4: Backend Test Repair And Regression Verification

**Files:**
- Modify: `back/src/test/java/com/terraria/skills/controller/PublicItemAggregateControllerTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminBuffControllerTest.java`

- [x] Update public item aggregate controller tests to mock the current aggregate service.
- [x] Stabilize buff image enrichment expectations around current image priority.
- [x] Run focused backend tests for four-domain consumers and new readiness endpoint.
- [x] Run script tests for relation refresh/smoke/readiness.

### M5: Runtime Verification

**Commands:**
- `node --test scripts/data/relation/*.test.mjs`
- `mvn "-Dtest=RelationCompatibilityServiceImplTest,AdminRelationCompatibilityControllerTest,PublicItemAggregateControllerTest,AdminBuffControllerTest,ItemControllerPaginationCompatibilityTest,NpcControllerTest,PublicNpcAggregateControllerTest" test`
- `node scripts/data/relation/local-core-compat-smoke-check.mjs`

- [x] Confirm tests pass or record unrelated blockers.
- [x] Confirm current DB four-domain smoke check passes.
- [x] Report what is complete and what remains a later write-path migration.
