# Crawler Automated Ingestion Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the canonical data prerequisites and prove one real approval-gated automated ingestion end to end, while leaving every later L2 or scheduler activation bound to an explicit System Owner decision.

**Architecture:** Complete the source chain in dependency order: immutable landing evidence, maint facts, per-layer relation resolution, local published projections, backend/admin consumers, one-way compatibility exports, readiness evidence, isolated T0/T1, then separately authorized T2 cutovers. Group and NPC chains keep independent bundles and migration states; no formal mutation, L1/L2 promotion, crawler execution, or scheduler activation is inferred from code completion.

**Tech Stack:** Node.js `node:test`, Spring Boot/MyBatis/JUnit, Nuxt contract tests, MySQL 8, Flyway, Redis V2 crawler attempts, Bash quality gates.

---

## Goal Lock And Closure Levels

This plan implements the approved design at
`docs/superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md`.
It does not reopen the resolved source-layer, admin-approval, bridge-retirement,
or compatibility-output decisions.

Closure is reached in four monotonic levels:

1. `CODE_READY`: group production code and the NPC fixture-level schema, parsers,
   processors, consumers, readiness reports, progress contracts, and gates pass
   without formal writes or a real crawler artifact.
2. `T1_VERIFIED`: the group chain passes in a runKey-scoped three-database
   acceptance environment. The NPC chain can reach this level only after the
   separately authorized crawler produces normalized records plus matching audit
   records; fixture-only NPC acceptance remains `CODE_READY` and is never labeled T1.
3. `T2_CUTOVER_VERIFIED`: exact separately authorized schema/data bundles are
   applied to formal databases and read-only runtime/API evidence is fresh.
4. `AUTOMATION_PROVEN`: the full repository gate passes and one independently
   authorized L1 capability completes preview, apply, verification, and audit.

`L2` and scheduler activation are operational governance decisions after
`AUTOMATION_PROVEN`. The implementation can make them available and test their
guards, but it cannot manufacture the required System Owner approval.

## Authorization Boundary

The following are safe to execute without another formal-write authorization:

- source inspection, contract tests, unit tests, compilation, typecheck;
- query-plan and injected-adapter tests;
- dry-run/domain-acceptance generation with `write=false`;
- disposable T0/T1 databases created by the existing automation provisioner;
- filesystem-only artifact creation when it does not crawl the network.

Each of the following is a separate hard checkpoint and cannot share approval.
The stable operation IDs and dependency order are:

1. `automation-biomes-l0-bootstrap`: create the singleton Owner plus exact
   `biomes` L0/DISABLED policy without requiring a policy-set hash that cannot
   exist before bootstrap;
2. `canonical-image-sync`: formal image sync;
3. `canonical-boss-import`: boss entity import;
4. `canonical-boss-loot-import`: boss-loot import;
5. `canonical-projectile-backfill`: projectile localization/image backfill;
6. `canonical-recipe-crawler`: bounded recipe network crawl;
7. `canonical-recipe-apply`: formal recipe write pipeline;
8. `canonical-shimmer-import`: shimmer import;
9. `canonical-schema-v56-v58`: formal V56/V57/V58 schema application;
10. `canonical-item-group-bootstrap`: frozen group bootstrap apply;
11. `canonical-npc-crawler`: real bounded NPC crawler;
12. `canonical-npc-apply`: retired cross-owner umbrella; permanently
    non-executable and retained only as the completion identity;
13. `canonical-npc-landing-apply`: frozen NPC base/crawler landing apply;
14. `canonical-npc-facts-maint-apply`: maint crawler-fact apply;
15. `canonical-npc-item-relations-apply`: item relation apply;
16. `canonical-npc-buff-relations-apply`: Buff relation apply;
17. `canonical-npc-town-shop-projection-apply`: town/shop projection apply;
18. `canonical-npc-buff-projection-apply`: Buff projection apply;
19. `canonical-npc-nonboss-loot-projection-apply`: non-boss loot projection;
20. `canonical-npc-boss-loot-projection-apply`: boss-loot projection;
21. `automation-biomes-l1-policy-promotion`: exact L1 policy promotion;
22. `automation-biomes-first-l1`: first frozen L1 apply;
23. `automation-biomes-second-l1`: second independently frozen L1 apply;
24. `automation-biomes-l2-promotion`: L2 promotion; and
25. `automation-biomes-scheduler-activation`: bounded scheduler activation;
26. `canonical-npc-base-maint-nontown-apply`: migrate only the non-town
    `maint.maint_npcs.npcs` partition to the current `npcs_base_raw` landing; and
27. `canonical-npc-base-maint-town-apply`: migrate only the town
    `maint.maint_npcs.town` partition to the same current base landing; and
28. `canonical-npc-item-relation-lineage-repair`: recompute only the NPC
    crawler-derived `item_source_facts` and `item_source_details` rows from the
    frozen maint facts, replacing their stale `maint_item_sources` trace with
    exact `maint_npc_crawler_facts` lineage without overwriting the consumed
    phase-2 result artifact; and
29. `canonical-item-image-source-verification`: query only the frozen 877
    ambiguous/unresolved item identities through the monitor-visible bounded
    Wiki verifier, with one actual HTTP attempt per identity and no database
    write.

Operations 2-8 are independent after operation 1. Operations 9-11 may continue
independently where their inputs are complete. Operations 13-20 form one strict
landing-plus-seven dependency chain after operation 11 has produced the frozen
input; each still has its own transaction and exact authorization. A failure in
one lane remains fail-closed and does not authorize, roll back, or suppress an
unrelated lane. Operation 12 never dispatches.

Operations 26-27 were added after the complete 2026-07-30 acceptance sweep
proved that all 762 active `maint_npcs` rows still referenced the retired
`generated.wiki_crawler_npc_bridge` landing while the current canonical base
landing was `standardized.npcs`. They form a separate two-owner base migration
after operation 13's landing result. Both bind the same frozen NPC input and
landing-result bytes, preserve stable NPC identity fields, and update only their
certified `maint_npcs` row partition plus landing/source lineage. A read-only
base completion binds both results. Existing consumed landing, crawler-fact,
owner-phase, completion, and isolated-T1 identities cannot authorize these new
writes and remain historical evidence only for their original scope.

Operation 28 was added after the complete acceptance sweep found exactly 329
relation facts created by the consumed NPC phase-2 result with pre-repair
lineage metadata. It binds the frozen NPC input plus the committed landing,
maint-fact, and original phase-2 result bytes; owns only the two NPC-derived
relation partitions; upserts the same deterministic record keys; and verifies
inside one transaction that every repaired row joins an active
`maint_npc_crawler_facts.record_key`. It must publish a distinct private result
and must not replace or edit the historical phase-2 result. A new exact Owner
decision is required before execution.

Operation 29 was added by the item-image closure subplan after candidate schema
v2 left 142 ambiguous and 735 unresolved identities. Its private frozen input,
execution manifest, and `AWAITING_OWNER` request are complete, but it has no
packet or result. It does not authorize the later standardized promotion,
managed-image sync, database lineage apply, or any source-contract flip.

Before any formal checkpoint, generate an authorization packet containing:

```json
{
  "operationId": "stable-operation-id",
  "targetDatabases": ["terria_v1_local", "terria_v1_maint", "terria_v1_relation"],
  "serverFingerprint": "sha256 generated by preflight",
  "schemaBundleSha256": "sha256 generated from exact ordered DDL bytes",
  "dataBundleSha256": "sha256 generated from exact frozen artifact bytes",
  "executionManifestHash": "sha256 generated from command/code/source/limit/output/progress/config identity",
  "policySetHash": "sha256 generated from persisted policy rows",
  "actor": "non-empty authenticated System Owner identity",
  "reason": "non-empty operation-specific reason",
  "authorizationReference": "non-empty durable external or project decision reference",
  "expiresAt": "future bounded timestamp"
}
```

Crawler requests bind an exact pre-run execution manifest, not future output
bytes. The manifest freezes command and code identity, source endpoints or
target list, bounds, output paths, monitor-visible progress path, and relevant
non-secret config fingerprint. The later apply request binds the crawler's
frozen normalized/audit output bytes. A crawler without a real governed executor
or the required progress contract remains non-executable.

The formal runner, not a human convention, must consume and verify the packet
immediately before execution. It rejects empty fields, expired packets, hash
drift, database fingerprint drift, execution-manifest drift, operation mismatch,
reused decision identity, or approval issued for another bundle. A conversational
or blanket statement of intent never supplies exact `actor`, operation-specific
`reason`, durable `authorizationReference`, one-time `decisionIdentity`, or
unchanged request/packet hashes.

## Source And Consumer Chain

```text
tracked/bootstrap files or immutable crawler evidence
  -> source_dataset_landings (local, immutable history)
  -> maint canonical facts (maint)
  -> per-layer resolved facts (relation)
  -> published runtime projection (local)
  -> backend repositories -> admin/public consumers
  -> deterministic one-way compatibility exports
  -> canonical readiness reports -> acceptance API/UI -> quality gate
```

Admin-authored item-group changes enter at maint as `central_override` through
`admin_item_group_writer`; they never fabricate landing evidence. The deferred
NPC crawler-fact chain uses real crawler evidence and cannot be satisfied by the
retired bridge path.

## Planned File Map

### Shared schema and ownership

- `back/src/main/resources/db/migration/V58__create_crawler_automation_activation_decisions.sql`
- `back/src/main/resources/db/migration/V57__create_canonical_item_group_runtime_tables.sql`
- `scripts/data/maint/maint-schema.mjs`
- `scripts/data/maint/maint-schema.test.mjs`
- `scripts/data/relation/relation-schema.mjs`
- `scripts/data/relation/relation-schema.test.mjs`
- `scripts/data/automation/table-ownership-matrix.mjs`
- `scripts/data/automation/table-ownership-matrix.test.mjs`

V57 contains four runtime tables plus one append-only admin audit table. The
audit table is not a fifth runtime projection and is owned only by
`admin_item_group_writer`.

### Group canonical pipeline

- `scripts/data/item-groups/item-group-contract.mjs`
- `scripts/data/item-groups/item-group-contract.test.mjs`
- `scripts/data/item-groups/item-group-bootstrap.mjs`
- `scripts/data/item-groups/item-group-bootstrap.test.mjs`
- `scripts/data/item-groups/item-group-canonical-sync.mjs`
- `scripts/data/item-groups/item-group-canonical-sync.test.mjs`
- `scripts/data/item-groups/item-group-shadow.mjs`
- `scripts/data/item-groups/item-group-shadow.test.mjs`
- `scripts/data/item-groups/export-item-group-compatibility.mjs`
- `scripts/data/item-groups/export-item-group-compatibility.test.mjs`
- `scripts/data/item-groups/item-group-canonical-action.mjs`
- `scripts/data/item-groups/item-group-canonical-action.test.mjs`
- `scripts/data/item-groups/item-group-readiness.mjs`
- `scripts/data/item-groups/item-group-readiness.test.mjs`

### Backend and admin cutover

- `back/src/main/java/com/terraria/skills/mapper/ItemGroupCanonicalMapper.java`
- `back/src/main/java/com/terraria/skills/service/ItemGroupCanonicalService.java`
- `back/src/main/java/com/terraria/skills/service/impl/ItemGroupCanonicalServiceImpl.java`
- `back/src/main/java/com/terraria/skills/controller/AdminItemGroupController.java`
- `back/src/main/java/com/terraria/skills/controller/AdminRecipeGroupController.java`
- `back/src/main/java/com/terraria/skills/service/impl/RecipeTreeServiceImpl.java`
- `back/src/test/java/com/terraria/skills/controller/AdminItemGroupControllerTest.java`
- `back/src/test/java/com/terraria/skills/controller/AdminRecipeGroupControllerTest.java`
- `back/src/test/java/com/terraria/skills/service/impl/RecipeTreeServiceImplTest.java`
- `back/src/test/java/com/terraria/skills/service/impl/ItemGroupCanonicalServiceImplTest.java`
- `data-query-app/pages/item-groups.vue`
- `data-query-app/tests/item-groups-page-contract.test.mjs`

### Capability, evidence, and governance

- `scripts/data/automation/fixtures/crawler-automation-capabilities.json`
- `scripts/data/automation/capability-manifest.test.mjs`
- `scripts/data/automation/run-automation-acceptance.mjs`
- `scripts/data/automation/run-automation-acceptance.test.mjs`
- `scripts/data/automation/run-live-automation-acceptance.mjs`
- `scripts/data/automation/run-live-automation-acceptance.test.mjs`
- `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- `back/src/main/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImpl.java`
- `back/src/test/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImplTest.java`
- `back/src/main/java/com/terraria/skills/service/impl/DomainAcceptanceServiceImpl.java`
- `back/src/test/java/com/terraria/skills/service/impl/DomainAcceptanceServiceImplTest.java`
- `back/src/main/java/com/terraria/skills/controller/AdminDomainAcceptanceController.java`
- `back/src/test/java/com/terraria/skills/controller/AdminDomainAcceptanceControllerTest.java`
- `back/src/main/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImpl.java`
- `back/src/test/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImplTest.java`
- `back/src/main/java/com/terraria/skills/controller/AdminDataSourceAcceptanceController.java`
- `back/src/test/java/com/terraria/skills/controller/AdminDataSourceAcceptanceControllerTest.java`
- `data-query-app/pages/operations/crawler-automation.contract.test.mjs`
- `data-query-app/pages/operations/data-source-acceptance.vue`
- `data-query-app/tests/data-source-acceptance-page-contract.test.mjs`
- `scripts/data/workflow/data-source-acceptance-report-manifest.mjs`
- `scripts/data/workflow/data-source-acceptance-report-manifest.test.mjs`
- `scripts/data/workflow/data-source-acceptance-freshness-audit.mjs`
- `scripts/data/workflow/data-source-acceptance-freshness-audit.test.mjs`
- `scripts/data/workflow/data-source-acceptance-refresh-plan.mjs`
- `scripts/data/workflow/data-source-acceptance-refresh-plan.test.mjs`
- `scripts/dev/quality-gate.sh`
- `scripts/dev/quality-gate-ci.sh`
- `scripts/dev/quality-gate.test.mjs`

### NPC canonical closure

- `scripts/data/landing/source-dataset-landing-schema.mjs`
- `scripts/data/landing/source-dataset-landing-schema.test.mjs`
- `scripts/data/landing/source-dataset-locator.mjs`
- `scripts/data/landing/source-dataset-locator.test.mjs`
- `scripts/data/maint/maint-schema.mjs`
- `scripts/data/maint/maint-schema.test.mjs`
- `scripts/data/maint/sync-landing-to-maint.mjs`
- `scripts/data/maint/sync-landing-to-maint.test.mjs`
- `scripts/data/relation/relation-schema.mjs`
- `scripts/data/relation/relation-schema.test.mjs`
- `scripts/data/relation/relation-table-catalog.mjs`
- `scripts/data/relation/relation-table-catalog.test.mjs`
- `scripts/data/relation/item-source-relation-processor.mjs`
- `scripts/data/relation/item-source-relation-processor.test.mjs`
- `scripts/data/relation/sync-maint-to-relation.mjs`
- `scripts/data/relation/sync-maint-to-relation.test.mjs`
- `scripts/data/relation/sync-buffs-to-relation.mjs`
- `scripts/data/relation/sync-buffs-to-relation.test.mjs`
- `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- `scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs`
- `scripts/data/crawler/src/domains/npc-domain.mjs`
- `scripts/data/crawler/tests/npc-parser.test.mjs`
- `scripts/data/npc-canonical/npc-canonical-contract.mjs`
- `scripts/data/npc-canonical/npc-canonical-contract.test.mjs`
- `scripts/data/npc-canonical/npc-crawler-fact-action.mjs`
- `scripts/data/npc-canonical/npc-crawler-fact-action.test.mjs`
- `scripts/data/npc-canonical/npc-canonical-readiness.mjs`
- `scripts/data/npc-canonical/npc-canonical-readiness.test.mjs`
- `scripts/data/npc-canonical/npc-canonical-t0-acceptance.mjs`
- `scripts/data/npc-canonical/npc-canonical-t0-acceptance.test.mjs`
- `scripts/data/automation/fixtures/crawler-automation-capabilities.json`
- `scripts/data/automation/capability-manifest.test.mjs`
- `scripts/data/automation/capability-owned-table-contract.test.mjs`
- `scripts/data/automation/table-ownership-matrix.mjs`
- `scripts/data/automation/table-ownership-matrix.test.mjs`
- `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- `back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java`
- `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- `back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java`

### Durable records

- `docs/project-governance/00_CURRENT_SPEC.md`
- `docs/audits/canonical-migration-boundary.md`
- `docs/audits/generated-data-consumer-map.md`
- `docs/devlog/current.md`
- `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`

## Task 0: Checkpoint The Closure Contract

**Files:**
- Create: `docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md`
- Create: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`
- Modify: `docs/devlog/current.md`

- [x] **Step 1: Record the parent/child devlog relationship and authorization boundary**

The child entry remains `active`, names the existing crawler-readiness entry as
parent, and records that only the coordinator edits `current.md`.

- [x] **Step 2: Validate plan/document consistency**

Run:

```bash
git diff --check
rg -n "CODE_READY|T1_VERIFIED|T2_CUTOVER_VERIFIED|AUTOMATION_PROVEN|Phase 1B|Phase 2|Phase 3|NPC|exact.*authorization" \
  docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md \
  docs/superpowers/specs/2026-07-26-b1-canonical-source-migration-design.md
```

Expected: no whitespace errors; all four closure levels, both canonical chains,
and the formal authorization boundary are explicit.

- [x] **Step 3: Commit the planning checkpoint**

```bash
git add \
  docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md \
  docs/devlog/current.md \
  docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md
git status --short
git diff --cached --stat
git diff --cached --check
git commit -m "docs(plan): define automated ingestion closure"
```

## Task 1: Freeze The Fresh Baseline And Direct-Consumer Inventory

**Files:**
- Create: `scripts/data/item-groups/item-group-consumer-contract.test.mjs`
- Modify: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`

- [x] **Step 1: Add a passing exact inventory test for all three group compatibility inputs**

The test scans non-test production files for `recipe-material-reference.json`,
`recipe-group-overrides.json`, and `item-group-overrides.json`. It snapshots each
current reader/writer with one of `runtime_reader`, `pipeline_input`,
`bootstrap`, `compat_export`, or `governance`; unknown references fail. The
current Java controllers, `RecipeTreeServiceImpl`, `sync-maint-to-relation.mjs`,
pipeline helpers, audit modules, and relation catalog lineage must all appear so
later cutover cannot silently omit a consumer.

```js
assert.deepEqual(actualInventory, EXPECTED_PRE_CUTOVER_INVENTORY);
assert.equal(actualInventory.some((row) => row.role === 'runtime_reader'), true);
```

- [x] **Step 2: Capture the no-write baseline**

Run:

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=false
node --test \
  scripts/data/landing/source-dataset-landing-schema.test.mjs \
  scripts/data/landing/import-source-dataset-landings.test.mjs \
  scripts/data/landing/audit-source-dataset-landings.test.mjs \
  scripts/data/landing/source-dataset-landing-migration-contract.test.mjs
```

Expected baseline: 45 panels, 35 pass, 10 warning, 0 blocked; landing suite
passes. Record any drift before implementation.

- [x] **Step 3: Commit the inventory test**

```bash
git add scripts/data/item-groups/item-group-consumer-contract.test.mjs \
  docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md
git commit -m "test(data): lock canonical group consumers"
```

## Task 2: Define Canonical Group Schemas And Ownership

**Files:**
- Create: `back/src/main/resources/db/migration/V57__create_canonical_item_group_runtime_tables.sql`
- Modify: `scripts/data/maint/maint-schema.mjs`
- Modify: `scripts/data/maint/maint-schema.test.mjs`
- Modify: `scripts/data/relation/relation-schema.mjs`
- Modify: `scripts/data/relation/relation-schema.test.mjs`
- Modify: `scripts/data/automation/table-ownership-matrix.mjs`
- Modify: `scripts/data/automation/table-ownership-matrix.test.mjs`
- Create: `scripts/data/item-groups/item-group-contract.mjs`
- Create: `scripts/data/item-groups/item-group-contract.test.mjs`

- [x] **Step 1: Write RED schema contracts**

Assert the exact four maint tables, three relation tables, four local tables,
logical unique keys including local `(canonical_key, source_layer)`, restrictive
same-database child keys, record-key lineage, published singleton state, and
required source-layer fields. Source-derived versus admin rows use certified
disjoint partitions; both writers use one identical serialized predicate for the
singleton projection state so the runtime fence serializes them.
Local aliases retain `(normalized_alias, canonical_key, source_layer)`; collisions
across different canonical keys remain a processor-level blocking condition.

```js
assert.deepEqual(ITEM_GROUP_SOURCE_LAYERS, [
  'recipe_reference', 'source_group', 'central_override',
]);
assert.deepEqual(ITEM_GROUP_ALLOWED_LAYERS.recipe_expansion, ['recipe_reference']);
assert.match(localSql, /UNIQUE KEY `uk_item_group_projection_state_singleton`/);
```

- [x] **Step 2: Verify RED**

```bash
node --test \
  scripts/data/item-groups/item-group-contract.test.mjs \
  scripts/data/maint/maint-schema.test.mjs \
  scripts/data/relation/relation-schema.test.mjs \
  scripts/data/automation/table-ownership-matrix.test.mjs
```

Expected: failures naming missing group tables, source-layer predicates, and
projection-state contract.

- [x] **Step 3: Implement schema and ownership catalogs**

Add `admin_item_group_writer` ownership restricted to
`source_layer = 'central_override'`; add `item_group_canonical` ownership for
`recipe_reference` and `source_group`. The ownership validator must certify
these row predicates as disjoint, allow only an identical serialized singleton
predicate for shared projection-state ownership, and reject any other overlap.

- [x] **Step 4: Verify GREEN and migration bytes without applying them**

```bash
node --test \
  scripts/data/item-groups/item-group-contract.test.mjs \
  scripts/data/maint/maint-schema.test.mjs \
  scripts/data/relation/relation-schema.test.mjs \
  scripts/data/automation/table-ownership-matrix.test.mjs \
  scripts/data/automation/crawler-automation-migration-contract.test.mjs
```

- [x] **Step 5: Commit**

```bash
git add back/src/main/resources/db/migration/V57__create_canonical_item_group_runtime_tables.sql \
  scripts/data/maint/maint-schema.mjs scripts/data/maint/maint-schema.test.mjs \
  scripts/data/relation/relation-schema.mjs scripts/data/relation/relation-schema.test.mjs \
  scripts/data/automation/table-ownership-matrix.mjs scripts/data/automation/table-ownership-matrix.test.mjs \
  scripts/data/item-groups/item-group-contract.mjs scripts/data/item-groups/item-group-contract.test.mjs
git commit -m "feat(data): define canonical item group schemas"
```

## Task 3: Parse And Reconcile The Frozen Group Bootstrap

**Files:**
- Create: `scripts/data/item-groups/item-group-bootstrap.mjs`
- Create: `scripts/data/item-groups/item-group-bootstrap.test.mjs`
- Modify: `scripts/data/item-groups/item-group-consumer-contract.test.mjs`
- Modify: `scripts/data/landing/source-dataset-locator.mjs`
- Modify: `scripts/data/landing/source-dataset-locator.test.mjs`

- [x] **Step 1: Write RED parser/reconciliation tests**

Fixtures must prove:

- 33 recipe-reference groups deduplicate by `internalName` and retain non-null
  `nameZh`;
- 27 override rows are redundant evidence;
- 2 omissions become explicit exclusions;
- added override members, orphan override groups, unknown `sourceKind`, duplicate
  aliases, empty active groups, and full-file payload retention are blocking;
- `Recorded Music Boxes` remains `BLOCKED` and `Any Pylon` is `source_group`;
- full-file hash/byte-size remain in lineage while only group payload is landed.

```js
assert.equal(result.reconciliation.redundantOverrideCount, 27);
assert.equal(result.exclusions.length, 2);
assert.equal(result.unresolvedCount, 0);
assert.equal(result.ambiguousCount, 0);
```

- [x] **Step 2: Verify RED, implement pure parser, verify GREEN**

```bash
node --test scripts/data/item-groups/item-group-bootstrap.test.mjs \
  scripts/data/landing/source-dataset-locator.test.mjs
```

The module must be pure: no DB connection, network access, compatibility-file
write, or implicit current-working-directory dependency.

- [x] **Step 3: Commit**

```bash
git add scripts/data/item-groups/item-group-bootstrap.mjs \
  scripts/data/item-groups/item-group-bootstrap.test.mjs \
  scripts/data/landing/source-dataset-locator.mjs \
  scripts/data/landing/source-dataset-locator.test.mjs
git commit -m "feat(data): reconcile item group bootstrap"
```

## Task 4: Build Maint, Relation, And Local Group Projection

**Files:**
- Create: `scripts/data/item-groups/item-group-canonical-sync.mjs`
- Create: `scripts/data/item-groups/item-group-canonical-sync.test.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
- Modify: `scripts/data/relation/recipe-expansion-processor.mjs`
- Modify: `scripts/data/relation/recipe-expansion-processor.test.mjs`

- [x] **Step 1: Write RED fake-adapter tests**

Test source rotation, exclusion application, alias collision, protected recipe
identity, zero resolved members, per-consumer layer selection, immutable record
keys, counts/hashes, and same-transaction runtime rows plus `PUBLISHED` state.

```js
assert.deepEqual(selectWinner(rows, ['recipe_reference']).sourceLayer,
  'recipe_reference');
assert.deepEqual(selectWinner(rows, ['recipe_reference', 'central_override']).sourceLayer,
  'central_override');
```

- [x] **Step 2: Verify RED, implement minimal processors, verify GREEN**

```bash
node --test \
  scripts/data/item-groups/item-group-canonical-sync.test.mjs \
  scripts/data/maint/sync-landing-to-maint.test.mjs \
  scripts/data/relation/sync-maint-to-relation.test.mjs \
  scripts/data/relation/recipe-expansion-processor.test.mjs
```

No test may reference formal database names or connect without an injected
adapter.

- [x] **Step 3: Commit**

```bash
git add scripts/data/item-groups/item-group-canonical-sync.mjs \
  scripts/data/item-groups/item-group-canonical-sync.test.mjs \
  scripts/data/maint/sync-landing-to-maint.mjs scripts/data/maint/sync-landing-to-maint.test.mjs \
  scripts/data/relation/sync-maint-to-relation.mjs scripts/data/relation/sync-maint-to-relation.test.mjs \
  scripts/data/relation/recipe-expansion-processor.mjs scripts/data/relation/recipe-expansion-processor.test.mjs
git commit -m "feat(data): project canonical item groups"
```

## Task 5: Prove Shadow Parity And One-Way Compatibility Exports

**Files:**
- Create: `scripts/data/item-groups/item-group-shadow.mjs`
- Create: `scripts/data/item-groups/item-group-shadow.test.mjs`
- Create: `scripts/data/item-groups/export-item-group-compatibility.mjs`
- Create: `scripts/data/item-groups/export-item-group-compatibility.test.mjs`
- Modify: `scripts/data/generate/generate-item-group-overrides.mjs`
- Modify: `scripts/data/generate/generate-item-group-overrides.test.mjs`

- [x] **Step 1: Write RED parity and round-trip tests**

The only allowed normalizations are duplicate-member collapse and null-to-value
`memberNameZh` enrichment. Genuine member loss and value-to-different-value name
changes must fail. Export then reparse must reproduce groups, aliases, members,
blocked groups, exclusions, source metadata, and snapshot hash exactly.

- [x] **Step 2: Verify RED, implement deterministic comparison/export, verify GREEN**

```bash
node --test \
  scripts/data/item-groups/item-group-shadow.test.mjs \
  scripts/data/item-groups/export-item-group-compatibility.test.mjs \
  scripts/data/generate/generate-item-group-overrides.test.mjs
```

Exporters receive read-only canonical snapshots, never DB writer credentials;
landing rejects their `compat_export` role.

- [x] **Step 3: Commit**

```bash
git add scripts/data/item-groups/item-group-shadow.mjs \
  scripts/data/item-groups/item-group-shadow.test.mjs \
  scripts/data/item-groups/export-item-group-compatibility.mjs \
  scripts/data/item-groups/export-item-group-compatibility.test.mjs \
  scripts/data/generate/generate-item-group-overrides.mjs \
  scripts/data/generate/generate-item-group-overrides.test.mjs
git commit -m "feat(data): export canonical item group compatibility"
```

## Task 6: Cut Backend And Admin Consumers To Canonical Repositories

**Files:**
- Create: `back/src/main/java/com/terraria/skills/mapper/ItemGroupCanonicalMapper.java`
- Create: `back/src/main/java/com/terraria/skills/service/ItemGroupCanonicalService.java`
- Create: `back/src/main/java/com/terraria/skills/service/impl/ItemGroupCanonicalServiceImpl.java`
- Create: `back/src/test/java/com/terraria/skills/service/impl/ItemGroupCanonicalServiceImplTest.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminItemGroupController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminItemGroupControllerTest.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminRecipeGroupController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminRecipeGroupControllerTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/RecipeTreeServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/RecipeTreeServiceImplTest.java`
- Modify: `data-query-app/pages/item-groups.vue`
- Modify: `data-query-app/tests/item-groups-page-contract.test.mjs`
- Modify: `back/src/main/resources/db/migration/V57__create_canonical_item_group_runtime_tables.sql`
- Modify: `scripts/data/item-groups/item-group-contract.test.mjs`
- Modify: `scripts/data/automation/table-ownership-matrix.mjs`
- Modify: `scripts/data/automation/table-ownership-matrix.test.mjs`
- Modify: `scripts/data/item-groups/item-group-canonical-sync.mjs`
- Modify: `scripts/data/item-groups/item-group-canonical-sync.test.mjs`
- Modify: `scripts/data/item-groups/item-group-consumer-contract.test.mjs`
- Modify: `scripts/data/relation/recipe-expansion-processor.mjs`
- Modify: `scripts/data/relation/recipe-expansion-processor.test.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/relation-table-catalog.mjs`
- Modify: `scripts/data/fetch/build-item-relations-bundle.mjs`
- Modify: `scripts/data/pipeline/run-recipe-reference-sync-pipeline.mjs`
- Modify: `scripts/data/audit/reconcile-live-recipe-coverage.mjs`
- Modify: `scripts/data/generate/generate-recipe-material-reference.mjs`

Task 6 plan repair: the original file map required append-only admin audit
evidence but provided no physical table for `admin_audit_record_key`. Add one
local append-only audit table, immutable update/delete triggers, and exclusive
admin-writer ownership before implementing the service.

- [x] **Step 1: Write RED repository and controller contracts**

Tests prove that reads never open the three JSON source files, each consumer uses
its exact layer allowlist, admin writes create append-only audit evidence and
commit maint/relation/local/state atomically, and cross-server topology disables
writes while reads remain available.

Extend `item-group-consumer-contract.test.mjs` from the Task 1 inventory to the
post-cutover allowlist and run it before implementation:

```js
assert.deepEqual(unapprovedConsumers, []);
assert.ok(approvedConsumers.every((row) =>
  ['bootstrap', 'compat_export', 'governance'].includes(row.role)));
```

```bash
node --test scripts/data/item-groups/item-group-consumer-contract.test.mjs
cd back && mvn -Dtest=AdminItemGroupControllerTest,AdminRecipeGroupControllerTest,RecipeTreeServiceImplTest,ItemGroupCanonicalServiceImplTest test
```

Expected RED: the three Java consumers and remaining pipeline/relation JSON
readers are reported as unapproved or the new canonical service is missing.

- [x] **Step 2: Implement repository/service boundary**

Controllers depend on `ItemGroupCanonicalService`; they do not parse files or
build SQL. `RecipeTreeServiceImpl` and recipe expansion use canonical readers.
Admin mutations use `admin_item_group_writer` and never enter the crawler approval
queue.

- [x] **Step 3: Run focused backend/admin GREEN**

```bash
cd back && mvn -Dtest=AdminItemGroupControllerTest,AdminRecipeGroupControllerTest,RecipeTreeServiceImplTest,ItemGroupCanonicalServiceImplTest test
cd ../data-query-app && node --test tests/item-groups-page-contract.test.mjs
pnpm run check
```

- [x] **Step 4: Commit**

```bash
git add \
  back/src/main/java/com/terraria/skills/mapper/ItemGroupCanonicalMapper.java \
  back/src/main/java/com/terraria/skills/service/ItemGroupCanonicalService.java \
  back/src/main/java/com/terraria/skills/service/impl/ItemGroupCanonicalServiceImpl.java \
  back/src/test/java/com/terraria/skills/service/impl/ItemGroupCanonicalServiceImplTest.java \
  back/src/main/java/com/terraria/skills/controller/AdminItemGroupController.java \
  back/src/test/java/com/terraria/skills/controller/AdminItemGroupControllerTest.java \
  back/src/main/java/com/terraria/skills/controller/AdminRecipeGroupController.java \
  back/src/test/java/com/terraria/skills/controller/AdminRecipeGroupControllerTest.java \
  back/src/main/java/com/terraria/skills/service/impl/RecipeTreeServiceImpl.java \
  back/src/test/java/com/terraria/skills/service/impl/RecipeTreeServiceImplTest.java \
  data-query-app/pages/item-groups.vue data-query-app/tests/item-groups-page-contract.test.mjs \
  scripts/data/item-groups/item-group-consumer-contract.test.mjs
git commit -m "feat(item-groups): use canonical repositories"
```

## Task 7: Register The Group Preview/Apply Pair With Progress Ownership

**Files:**
- Create: `scripts/data/item-groups/item-group-canonical-action.mjs`
- Create: `scripts/data/item-groups/item-group-canonical-action.test.mjs`
- Modify: `scripts/data/automation/fixtures/crawler-automation-capabilities.json`
- Modify: `scripts/data/automation/capability-manifest.test.mjs`
- Modify: `scripts/data/automation/capability-owned-table-contract.test.mjs`
- Modify: `scripts/data/automation/run-automation-acceptance.mjs`
- Modify: `scripts/data/automation/run-automation-acceptance.test.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerAutomationControllerTest.java`
- Modify: `data-query-app/pages/operations/crawler-automation.contract.test.mjs`

- [x] **Step 1: Write RED 19-to-21 catalog tests**

Add exact action IDs `item-group-canonical-preview` and
`item-group-canonical-apply`. Both start `L0 + DISABLED`; pairing is symmetric;
apply owns only `recipe_reference`/`source_group` rows and projection state.

- [x] **Step 2: Add monitor-visible progress before work**

Use the canonical backend child-status path and payload fields `actionId`,
`status`, `generatedAt`, `lastHeartbeatAt`, `childStatusPath`, `phase`, `message`,
`current`, and `total`. Tests isolate `WORKTREE_ROOT`, prove initial write before
the first long step, heartbeats, and completed/failed terminal writes.

- [x] **Step 3: Verify all catalog surfaces atomically**

```bash
node --test \
  scripts/data/item-groups/item-group-canonical-action.test.mjs \
  scripts/data/automation/capability-manifest.test.mjs \
  scripts/data/automation/capability-owned-table-contract.test.mjs \
  scripts/data/automation/run-automation-acceptance.test.mjs \
  scripts/data/workflow/backend-data-refresh-plan.test.mjs \
  data-query-app/pages/operations/crawler-automation.contract.test.mjs
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerAutomationServiceImplTest,AdminCrawlerAutomationControllerTest test
```

- [x] **Step 4: Commit**

```bash
git add scripts/data/item-groups/item-group-canonical-action.mjs \
  scripts/data/item-groups/item-group-canonical-action.test.mjs \
  scripts/data/automation/fixtures/crawler-automation-capabilities.json \
  scripts/data/automation/capability-manifest.test.mjs \
  scripts/data/automation/capability-owned-table-contract.test.mjs \
  scripts/data/automation/run-automation-acceptance.mjs \
  scripts/data/automation/run-automation-acceptance.test.mjs \
  scripts/data/workflow/backend-data-refresh-plan.mjs \
  scripts/data/workflow/backend-data-refresh-plan.test.mjs \
  back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java \
  back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java \
  back/src/main/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImpl.java \
  back/src/test/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImplTest.java \
  back/src/test/java/com/terraria/skills/controller/AdminCrawlerAutomationControllerTest.java \
  data-query-app/pages/operations/crawler-automation.contract.test.mjs
git commit -m "feat(automation): register canonical item group actions"
```

## Task 8: Add Canonical Readiness Evidence To Every Acceptance Surface

**Files:**
- Create: `scripts/data/item-groups/item-group-readiness.mjs`
- Create: `scripts/data/item-groups/item-group-readiness.test.mjs`
- Modify: `scripts/data/workflow/data-source-acceptance-report-manifest.mjs`
- Modify: `scripts/data/workflow/data-source-acceptance-report-manifest.test.mjs`
- Modify: `scripts/data/workflow/data-source-acceptance-freshness-audit.mjs`
- Modify: `scripts/data/workflow/data-source-acceptance-freshness-audit.test.mjs`
- Modify: `scripts/data/workflow/data-source-acceptance-refresh-plan.mjs`
- Modify: `scripts/data/workflow/data-source-acceptance-refresh-plan.test.mjs`
- Modify: `scripts/dev/quality-gate.sh`
- Modify: `scripts/dev/quality-gate.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminDataSourceAcceptanceControllerTest.java`
- Modify: `data-query-app/pages/operations/data-source-acceptance.vue`
- Modify: `data-query-app/tests/data-source-acceptance-page-contract.test.mjs`

- [x] **Step 1: Write RED report-contract tests**

Require exact schema version, landing/maint/relation/local counts and hashes,
zero unresolved/ambiguous members, per-consumer shadow parity, zero direct JSON
readers, disabled fallback, API snapshot hash, export freshness, database role,
cutover identity, and `writesDatabase=false`.

- [x] **Step 2: Add report generation and fail-closed freshness routing**

Missing, malformed, stale (>24 h), unknown-risk, database-writing, wrong-T2, or
hash-mismatched evidence is blocking. The refresh plan displays commands with
`executeMode: "manual"` and never runs them.

- [x] **Step 3: Verify Node, backend, admin, and quality-gate contracts**

```bash
node --test \
  scripts/data/item-groups/item-group-readiness.test.mjs \
  scripts/data/workflow/data-source-acceptance-report-manifest.test.mjs \
  scripts/data/workflow/data-source-acceptance-freshness-audit.test.mjs \
  scripts/data/workflow/data-source-acceptance-refresh-plan.test.mjs \
  scripts/dev/quality-gate.test.mjs
cd back && mvn -Dtest=DataSourceAcceptanceServiceImplTest,AdminDataSourceAcceptanceControllerTest test
cd ../data-query-app && node --test tests/data-source-acceptance-page-contract.test.mjs
```

- [x] **Step 4: Commit**

```bash
git commit -m "feat(audit): gate canonical item group readiness"
```

## Task 9: Reach Group CODE_READY And T1_VERIFIED

**Files:**
- Create: `scripts/data/item-groups/item-group-live-acceptance.mjs`
- Create: `scripts/data/item-groups/item-group-live-acceptance.test.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.test.mjs`
- Modify: `scripts/data/automation/mysql-automation-acceptance-adapter.mjs`
- Modify: `scripts/data/automation/mysql-automation-acceptance-adapter.test.mjs`
- Modify: `scripts/data/item-groups/item-group-consumer-contract.test.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`
- Modify: active child devlog and `docs/devlog/current.md`.

- [x] **Step 1: Run complete no-formal-write group suite**

Run all Task 2-8 tests plus the Phase 1A 41-test suite. Repair any failure at
its owning module; do not weaken assertions or add allowlists for unexplained
diffs.

- [x] **Step 2: Run disposable T0 schema smoke**

Provision `terria_v1_automation_test_<runKey>_{local,maint,relation}`, apply the
exact V56/V57 and maint/relation schema bundle there, assert all group tables,
indexes, predicates, rollback, and cleanup. Formal database names are a hard
failure.

- [x] **Step 3: Run isolated T1 group chain**

Provision `terria_v1_automation_acceptance_<runKey>_{local,maint,relation}`;
freeze the three tracked bootstrap files; execute landing→maint→relation→local;
assert 34 active canonical groups, one blocked group, two exclusions, zero
unresolved/ambiguous members, per-consumer parity, round-trip exports, restore,
and zero leaked databases/accounts/Redis reservations.

- [x] **Step 4: Persist T1 evidence and commit**

```bash
git commit -m "test(data): verify canonical item groups in T1"
```

## Task 10: Lock And Close The Ten Existing Domain Warnings

**Files:**
- Modify: `scripts/data/audit/domain-readiness-audit.mjs`
- Modify: `scripts/data/audit/domain-readiness-audit.test.mjs`
- Create for the separately approved read-only image-source review:
  `scripts/data/audit/item-image-source-candidate-audit.mjs`
- Create:
  `scripts/data/audit/item-image-source-candidate-audit.test.mjs`
- Generate as candidate-only evidence:
  `reports/audit/item-image-source-candidates-2026-07-30.json`
- Modify only if its focused RED proves a producer defect:
  `scripts/data/workflow/run-image-sync.mjs`,
  `scripts/data/import/import-wiki-bosses-to-db.mjs`,
  `scripts/data/import/import-boss-loot-to-db.mjs`,
  `scripts/data/audit/image-source-lineage-report.mjs`,
  `scripts/data/backfill/backfill-projectile-zh-and-images.mjs`,
  `scripts/data/generate/generate-armor-set-definition-map.mjs`,
  `scripts/data/fetch/fetch-wiki-zh-recipe-pages.mjs`,
  `scripts/data/pipeline/run-wiki-zh-recipe-sync-pipeline.mjs`,
  `scripts/data/sync/consolidate-recipe-provider-priority.mjs`,
  `scripts/data/audit/audit-recipe-provider-suppression-by-item.mjs`,
  `scripts/data/audit/audit-wiki-zh-recipe-source-coverage.mjs`,
  `scripts/data/import/import-wiki-shimmer-to-db.mjs` and their same-basename
  `.test.mjs` files.

The warning-to-producer map is locked before execution:

| Panel | Exact current warning | Owning producer | Authorization class |
| --- | --- | --- | --- |
| `items/imageReadiness` | missing `reports/workflow-image-sync*.json` | `scripts/data/workflow/run-image-sync.mjs` | formal image sync; separate write authorization |
| `bosses/sourceReadiness` | missing `reports/wiki-bosses-import*.json` | `scripts/data/import/import-wiki-bosses-to-db.mjs` | formal import authorization |
| `bosses/relationReadiness` | missing `reports/boss-loot-import*.json` | `scripts/data/import/import-boss-loot-to-db.mjs` | formal import authorization |
| `bosses/imageReadiness` | `missing_relation_image_rows`, `missing_projection_rows` | `scripts/data/audit/image-source-lineage-report.mjs` plus image sync | read-only diagnosis, then authorized image sync if data differs |
| `projectiles/relationReadiness` | missing `reports/projectile-zh-image-backfill*.json` | `scripts/data/backfill/backfill-projectile-zh-and-images.mjs` | formal backfill authorization |
| `projectiles/imageReadiness` | same missing projectile report | same producer and exact same authorized run | no second run or fabricated report |
| `armor_sets/sourceReadiness` | 36 unaccepted definition placeholders | `scripts/data/generate/generate-armor-set-definition-map.mjs` | filesystem generator; no DB write |
| `support.recipe/sourceReadiness` | missing `data/generated/wiki-zh-recipe-pages.latest.json` | `scripts/data/fetch/fetch-wiki-zh-recipe-pages.mjs` | real crawler/network authorization |
| `support.recipe/blockingGate` | missing consolidation, suppression, coverage reports | `scripts/data/pipeline/run-wiki-zh-recipe-sync-pipeline.mjs` and the three named producer/audit scripts | crawler plus formal recipe-write authorization |
| `support.shimmer/blockingGate` | missing `reports/wiki-shimmer-db-import*.json` | `scripts/data/import/import-wiki-shimmer-to-db.mjs` | formal import authorization |

- [x] **Step 1: Reproduce exact baseline without writes**

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=false
```

Expected warning panels:

- image: `items`, `bosses`, `projectiles`;
- source: `bosses`, `armor_sets`, `support.recipe`;
- relation: `bosses`, `projectiles`;
- blocking gate: `support.recipe`, `support.shimmer`.

- [x] **Step 2: Add exact warning/producer contract tests**

Add fixtures in `domain-readiness-audit.test.mjs` that prove each missing or
semantically incomplete artifact produces the warning above and each truthful
producer-shaped artifact passes. This is CODE_READY evidence only. Do not create
an import/backfill report without its real operation, change `warning` to `pass`,
lower thresholds, extend deadlines, or mark missing data as accepted.

- [x] **Step 3: Repair only reproduced producer defects**

For a producer whose focused test fails for code reasons, follow RED -> GREEN in
the exact owning module and rerun its test plus `domain-readiness-audit.test.mjs`.
Absence of a real operation artifact is an authorization checkpoint, not a code
defect.

- [x] **Step 4: Execute the filesystem-only armor definition repair**

Resolve all 36 entries through explicit source-backed definitions or explicit
reviewed expected-placeholder records. Run:

```bash
node --test scripts/data/generate/armor-set-definition-source.test.mjs \
  scripts/data/audit/domain-readiness-audit.test.mjs
node scripts/data/generate/generate-armor-set-definition-map.mjs
node scripts/data/audit/domain-readiness-audit.mjs --domain=armor_sets --panel=source
```

Expected: `armor_sets/sourceReadiness` is `pass`; no threshold or warning rule changed.

- [x] **Step 5: Run each separately authorized producer and verify its real artifact**

Use only the exact command and hashes emitted by Task 12 for image, boss import,
boss loot, projectile backfill, recipe crawl/import/audits, and shimmer import.
The read-only boss image audit runs before and after its authorized repair.
Each operation is independently dispatched; a failed operation records its
failure and remains closed while the coordinator continues every lane whose
packet and prerequisites are still valid.

The 2026-07-30 complete-result sweep still leaves this step open on item images
and shimmer. The approved candidate-only item-image audit proves 695 group
pages have one exact normalized identity filename and 7 non-group pages have
one safe exact image, for 702 review candidates. It writes only
`reports/audit/item-image-source-candidates-2026-07-30.json`; standardized input
hashes are unchanged and image sync is not rerun. A later read-only database/raw
cross-check found all 6,131 standardized identities have local image rows, but
only 2,906 have maint/relation lineage. Of the remaining 3,225 local-only rows,
613 existing `source_file_title` values are independently supported by one
identity-, page-, and URL-aligned parsed raw-page image; 2,612 cannot be promoted
from that evidence. The 702 candidate report intersects 637 local-only rows:
613 agree with the existing local title and 24 select different raw-backed
files, so reverse DB-to-standardized copying remains prohibited.

The item-image closure subplan has now completed Tasks 1-7 and Task 8 Steps
1-6. The approved four-layer result is `COMPLETED` under decision
`canonical-item-image-lineage-apply-20260801-02`, packet
`sha256:0f67aa00568fe355760f892654d013c4c325ab1c8842f1bc96b2b94adabf3d2c`,
with snapshot row count `21997`, landing ID `18630`, and exact
`6131/6131/6131/6131` landing/maint/relation/local parity. The content-addressed
lineage bundle hashes to
`sha256:2c55c37a0fadaaafcaba3cb1fc4a0323fe6fbf76bc0cb9cf73ded8e6e0072f83`.
The post-apply lineage report
`reports/audit/image-source-lineage-2026-08-01.json` hashes to
`sha256:49f095abc55ad39f1ebf07002fc89eef1297c85625e89dd2cf391dfee851613a`.
The four applied layers are clean, and the items image readiness panel passes;
the separate lineage report remains not contract-ready only because
`projection_items.image` still has `6129` dead `http://localhost:9000/...`
values and `2` blank rows with a core image. `projection_items` has no
item-owned governed operation, preview, owned scope, or Owner decision, so its
repair is a separate follow-up and is not covered by the consumed packet.
Task 10 Step 5 remains open for Shimmer and the other non-green producer gates,
not for the approved four-layer item-image scope.

Boss loot no longer waits for authorization. Decision
`canonical-boss-loot-import-20260730-01` consumed packet
`sha256:ae0bc6de83fd290a3a780b441f85efb22287bf69aa3081a02ab86343e15edc1f`
once and processed the frozen 33-boss/347-drop bundle. Report
`reports/boss-loot-import-2026-07-30.json` hashes to
`sha256:96c23c7a0f25a876db93cf60b1a20cf18245987c176dab2208a980c576dd0449`
with no unresolved boss or item. Shimmer remains fail-closed because no
byte-equivalent May raw snapshot exists locally; a July refetch has the same
revision ID but a different rendered HTML length and cannot impersonate or mix
with the missing May source generation.

- [x] **Step 6: Prove 45/45 pass after all required operation evidence exists**

```bash
node scripts/data/workflow/domain-acceptance-generate-reports.mjs \
  --write=false --fail-on-blocked=true --fail-on-warning=true
```

- [x] **Step 7: Commit focused batches by domain**

Use one commit per independent domain, e.g.
`fix(data): close projectile readiness warnings`.

## Task 11: Implement The Deferred NPC Base/Crawler-Fact Chain

**Files:**
- Modify: `scripts/data/landing/source-dataset-landing-schema.mjs`
- Modify: `scripts/data/landing/source-dataset-landing-schema.test.mjs`
- Modify: `scripts/data/landing/source-dataset-locator.mjs`
- Modify: `scripts/data/landing/source-dataset-locator.test.mjs`
- Modify: `scripts/data/maint/maint-schema.mjs`
- Modify: `scripts/data/maint/maint-schema.test.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`
- Modify: `scripts/data/relation/relation-schema.mjs`
- Modify: `scripts/data/relation/relation-schema.test.mjs`
- Modify: `scripts/data/relation/relation-table-catalog.mjs`
- Modify: `scripts/data/relation/relation-table-catalog.test.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.mjs`
- Modify: `scripts/data/relation/item-source-relation-processor.test.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
- Modify: `scripts/data/relation/sync-buffs-to-relation.mjs`
- Modify: `scripts/data/relation/sync-buffs-to-relation.test.mjs`
- Modify: `scripts/data/relation/sync-relation-to-local-compat-tables.mjs`
- Modify: `scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs`
- Modify: `scripts/data/crawler/src/domains/npc-domain.mjs`
- Modify: `scripts/data/crawler/tests/npc-parser.test.mjs`
- Create: `scripts/data/npc-canonical/npc-canonical-contract.mjs`
- Create: `scripts/data/npc-canonical/npc-canonical-contract.test.mjs`
- Create: `scripts/data/npc-canonical/npc-crawler-fact-action.mjs`
- Create: `scripts/data/npc-canonical/npc-crawler-fact-action.test.mjs`
- Create: `scripts/data/npc-canonical/npc-canonical-readiness.mjs`
- Create: `scripts/data/npc-canonical/npc-canonical-readiness.test.mjs`
- Create: `scripts/data/npc-canonical/npc-canonical-t0-acceptance.mjs`
- Create: `scripts/data/npc-canonical/npc-canonical-t0-acceptance.test.mjs`
- Modify: `scripts/data/automation/fixtures/crawler-automation-capabilities.json`
- Modify: `scripts/data/automation/capability-manifest.test.mjs`
- Modify: `scripts/data/automation/capability-owned-table-contract.test.mjs`
- Modify: `scripts/data/automation/table-ownership-matrix.mjs`
- Modify: `scripts/data/automation/table-ownership-matrix.test.mjs`
- Modify: `scripts/data/automation/run-automation-acceptance.mjs`
- Modify: `scripts/data/automation/run-automation-acceptance.test.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.test.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.mjs`
- Modify: `scripts/data/workflow/backend-data-refresh-plan.test.mjs`
- Modify: `scripts/data/workflow/data-source-acceptance-report-manifest.mjs`
- Modify: `scripts/data/workflow/data-source-acceptance-report-manifest.test.mjs`
- Modify: `scripts/data/workflow/data-source-acceptance-freshness-audit.mjs`
- Modify: `scripts/data/workflow/data-source-acceptance-freshness-audit.test.mjs`
- Modify: `scripts/data/workflow/data-source-acceptance-refresh-plan.test.mjs`
- Modify: `scripts/dev/quality-gate.sh`
- Modify: `scripts/dev/quality-gate-ci.sh`
- Modify: `scripts/dev/quality-gate.test.mjs`
- Modify: `back/src/main/java/com/terraria/skills/dto/DataSourceAcceptanceOverviewDTO.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/DataSourceAcceptanceServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminDataSourceAcceptanceControllerTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationServiceTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminCrawlerAutomationControllerTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/PublicNpcServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/PublicNpcServiceImplImageTest.java`
- Modify: `back/src/main/java/com/terraria/skills/controller/AdminNpcController.java`
- Modify: `back/src/test/java/com/terraria/skills/controller/AdminNpcControllerTest.java`
- Modify: `data-query-app/pages/operations/crawler-automation.contract.test.mjs`
- Modify: `data-query-app/pages/operations/data-source-acceptance.vue`
- Modify: `data-query-app/tests/data-source-acceptance-page-contract.test.mjs`
- Modify: `data-query-app/types/dataSourceAcceptance.ts`

No bridge generator or bridge compatibility exporter is added.

- [x] **Step 1: Write RED source-split contracts**

Register `npcs_base_raw` and `npc_crawler_facts_raw`; base resolves only to the
tracked standardized file; crawler facts require immutable crawler evidence.
The retired bridge path must have zero production references. Missing crawler
evidence blocks rather than falling back to base or bridge data.

```bash
node --test \
  scripts/data/npc-canonical/npc-canonical-contract.test.mjs \
  scripts/data/landing/source-dataset-landing-schema.test.mjs \
  scripts/data/landing/source-dataset-locator.test.mjs
```

Expected RED: both new dataset types, paired normalized/audit identity, and
bridge-free source selection are missing.

- [x] **Step 2: Add maint crawler facts and relation joins**

Add `maint_npc_crawler_facts` with exact landing lineage. Existing canonical NPC,
NPC-Buff, shop, and loot relations consume it without introducing a second NPC
identity model. T0 fixtures prove non-empty relationship reconstruction.

```bash
node --test \
  scripts/data/npc-canonical/npc-canonical-contract.test.mjs \
  scripts/data/maint/maint-schema.test.mjs \
  scripts/data/maint/sync-landing-to-maint.test.mjs \
  scripts/data/relation/relation-schema.test.mjs \
  scripts/data/relation/relation-table-catalog.test.mjs \
  scripts/data/relation/item-source-relation-processor.test.mjs \
  scripts/data/relation/sync-maint-to-relation.test.mjs \
  scripts/data/relation/sync-buffs-to-relation.test.mjs \
  scripts/data/relation/sync-relation-to-local-compat-tables.test.mjs
```

- [x] **Step 3: Register preview/apply at 21-to-23**

Add `npc-crawler-facts-preview` and `npc-crawler-facts-apply`, both `L0 +
DISABLED`, with symmetric pairing, ownership, snapshots, rollback, and the same
progress contract used by Task 7.

```bash
node --test \
  scripts/data/npc-canonical/npc-crawler-fact-action.test.mjs \
  scripts/data/automation/capability-manifest.test.mjs \
  scripts/data/automation/capability-owned-table-contract.test.mjs \
  scripts/data/automation/run-automation-acceptance.test.mjs \
  data-query-app/pages/operations/crawler-automation.contract.test.mjs
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerAutomationServiceImplTest,AdminCrawlerAutomationControllerTest test
```

- [x] **Step 4: Add readiness evidence and fixture-level T0**

Require base/crawler landing freshness, maint match counts, NPC-Buff/shop/loot
relation/local hashes, positive API/runtime samples, and zero bridge references.
Run disposable T0 with paired normalized/audit fixtures. Record only NPC
`CODE_READY`; do not label fixture evidence `T1_VERIFIED`.

```bash
node --test \
  scripts/data/npc-canonical/npc-canonical-t0-acceptance.test.mjs \
  scripts/data/npc-canonical/npc-canonical-readiness.test.mjs \
  scripts/data/workflow/data-source-acceptance-report-manifest.test.mjs \
  scripts/data/workflow/data-source-acceptance-freshness-audit.test.mjs \
  scripts/data/workflow/data-source-acceptance-refresh-plan.test.mjs \
  scripts/dev/quality-gate.test.mjs
TERRAPEDIA_AUTOMATION_ACCEPTANCE_ENABLED=1 node \
  scripts/data/automation/run-live-automation-acceptance.mjs \
  --profile=t0 --scope=npc-canonical --config-path=<ignored-local-config> \
  --redis-db=<explicit-empty-db> --run-id=<unique-run-id>
```

- [x] **Step 5: Cross the real-data checkpoint only after crawler authorization**

Run the separately authorized crawler, freeze its normalized records and matching
audit records, then run the isolated three-database T1. Require non-empty Buff,
shop, and loot samples, exact landing/maint/relation/local hashes, rollback,
restore, and zero leaked databases/accounts/Redis reservations. Only this step may
record NPC `T1_VERIFIED`.

The bounded repair plan
`docs/superpowers/plans/2026-07-30-npc-t1-executor-repair.md` now supplies an
NPC-specific T1 executor and private evidence input. It pre-reads the complete
owner-phase chain before creating any temporary resource, binds that generation
to the copied snapshot and verification hashes, checks the same completion again
after cleanup, and keeps the shared 13-table contract in a cycle-free leaf
module. The separately authorized isolated run now produced fresh private
evidence and completed this parent step; the repair preserved its authorization
boundary and did not permit a formal data write.

The bounded request-path plan
`docs/superpowers/plans/2026-07-30-npc-t1-operation-request.md` now also
registers `canonical-npc-t1-acceptance`. It freezes a private config plus its
normalized server fingerprint, Redis DB, run ID, current NPC data bundle, and
code bundle; the child revalidates them and the current completion before it
can consume a one-time permit. The freshly generated private request
`sha256:4c8c760c78e8feeaa93c3028d11b08bfd390eb39a0d99a986ad5c2183752d1f5`
was explicitly confirmed and produced private authorized packet
`sha256:2ac59552d8b9346c92623c072596063f71a2b6ff12ff721491f4d9b9f27aacd3`.
The explicitly authorized runner consumed its one-time decision and completed
the isolated run `npc-t1-20260730-01` with private evidence
`canonical_npc_isolated_t1_acceptance: passed`; its 13-table snapshot binding,
rollback/commit/restore `0/1/0`, and cleanup proof passed. Independent readback
found zero isolated databases, temporary accounts, Redis DB 14 keys, and active
transactions. Task 11 Step 5 is complete; no formal data write occurred.

- [x] **Step 6: Commit in schema, pipeline, capability, and evidence checkpoints**

Use `feat(npc): ...` / `test(npc): ...` focused commits and record exact counts in
the child devlog.

## Task 12: Generate Exact Formal Cutover Packets

**Files:**
- Create: `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- Create: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Create: `scripts/data/automation/run-authorized-canonical-operation.mjs`
- Create: `scripts/data/automation/run-authorized-canonical-operation.test.mjs`
- Reuse: `scripts/data/automation/frozen-apply-bundle.mjs`
- Reuse: `scripts/data/automation/policy-set-hash.mjs`
- Modify: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`
  with request/packet hashes only, never credentials or reauthentication secrets.

- [x] **Step 1: Write RED fail-closed packet tests**

Prove ordered DDL bytes, artifact bytes, database fingerprints, policy hash,
actor, reason, reference, expiry, operation ID, and one-time decision identity
are required and hash-bound.

- [x] **Step 2: Build complete read-only authorization requests**

Generate one non-executable request for each of the 17 stable IDs. Each request
freezes the operation-specific required technical identity: available ordered
schema/input/output bytes, database fingerprint, current policy-set hash, exact
execution manifest, operation ID, and expiry. Bootstrap omits the not-yet-created
policy-set hash but binds the proposed Owner/domain/L0/DISABLED policy input.
Crawler requests bind the execution manifest and an empty pre-run output bundle;
their later apply requests bind frozen output bytes. Every incomplete request
lists its missing technical and Owner fields and carries
`authorizationStatus: "AWAITING_OWNER"`. Request generation may read formal
schema/fingerprints but must not mutate databases or crawl the network.

```bash
node --test scripts/data/automation/build-canonical-cutover-authorization.test.mjs
node scripts/data/automation/build-canonical-cutover-authorization.mjs \
  --mode=request --operation-id=canonical-schema-v56-v58 \
  --output=reports/authorization/canonical/canonical-schema-v56-v58.request.json
```

Every request file is `<operationId>.request.json` under
`reports/authorization/canonical/`. No packet is generated for an operation
whose request still reports missing technical or Owner fields.

- [x] **Step 3: Convert one request to an executable packet only with exact Owner fields**

`--mode=authorize` requires the unchanged request hash plus non-empty actor,
operation-specific reason, durable authorization reference, one-time decision
identity, and a future bounded expiry. It rejects any request/bundle/fingerprint
drift and emits `authorizationStatus: "AUTHORIZED"`.

- [x] **Step 4: Require the packet-consuming formal runner**

The runner re-resolves current operation inputs, server fingerprint, policy set,
schema/data bytes, and execution manifest, verifies the unchanged packet, checks
one-time decision use, then dispatches only the packet's exact operation. Direct
invocation of a formal producer/bootstrap/apply remains outside the accepted
closure path even if a packet file exists.

- [x] **Step 5: Hard stop until each packet is explicitly authorized**

Do not reuse an approval or interpret blanket implementation authorization as
the missing actor/reason/reference/decision/exact-hash packet identity.

## Task 12A: Replace Placeholder Dispatch With Real Governed Executors

The continuation audit found that eight original operation IDs had no executable
entrypoint. Seven now have packet-consuming formal executors. The remaining
legacy `canonical-npc-apply` operation cannot legally use one cross-capability writer:
`npc_crawler_facts` owns only `maint.maint_npc_crawler_facts`, while its
relation/local consumers are owned by other capabilities. It stays explicitly
non-executable until the operation is split by owner or a cross-capability
orchestration decision is added.

The formal execution architecture is Node-owned. The packet runner revalidates
current bytes and dispatches the exact domain executor, which owns its database
transaction. The unused backend
`FailClosedCrawlerAutomationApplyContextProvider` remains fail-closed; enabling
it would create a second apply protocol and would violate the existing
same-transaction/no-independent-connection contract.

**Files:**
- Create: `scripts/data/automation/run-canonical-schema-migration.mjs`
- Create: `back/src/main/java/com/terraria/skills/tooling/CanonicalFlywayMigrationCli.java`
- Modify: `scripts/data/item-groups/item-group-canonical-action.mjs`
- Modify: `scripts/data/npc-canonical/npc-crawler-fact-action.mjs`
- Create: `scripts/data/automation/run-automation-policy-decision.mjs`
- Create: `scripts/data/automation/run-biomes-automation-operation.mjs`
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Create: `scripts/data/npc-canonical/npc-owner-phase-apply.mjs`
- Modify: `scripts/data/npc-canonical/npc-apply-ownership-preparation.mjs`
- Modify: `scripts/data/npc-canonical/npc-canonical-readiness.mjs`
- Modify: `scripts/data/automation/table-ownership-matrix.mjs`
- Modify: `scripts/data/landing/import-source-dataset-landings.mjs`
- Modify: `scripts/dev/quality-gate.sh`
- Modify: `scripts/dev/quality-gate-ci.sh`
- Modify/add exact same-basename tests for every entrypoint above.

- [x] **Step 1: Add RED contracts for the seven eligible executors and one explicit ownership blocker**

Require a real default implementation for schema migration, group apply, L1
policy promotion, first and second L1 apply, L2 promotion, and scheduler
activation. Require `canonical-npc-apply` to remain `null` while its writes
cross capability owners. Injected test adapters are allowed, but a production
CLI whose default behavior only throws `no governed executor` is not executable.

- [x] **Step 2: Implement the formal schema entrypoint through Flyway**

The Node wrapper may dispatch a dedicated Java CLI without a shell. The Java CLI
must use Flyway, require the exact formal local database and environment-only
credentials, migrate only the frozen V56-V58 range on top of registered V55,
write a private result, and close all resources. It must never synthesize rows in
`flyway_schema_history`.

- [x] **Step 3A: Implement the group frozen apply entrypoint**

The group path consumes its exact frozen projection, uses one same-server
three-database transaction, serializes through the projection-state fence,
publishes backend child progress, and verifies counts and hashes.

- [x] **Step 3B: Implement an ownership-valid NPC frozen apply entrypoint**

NPC apply must first resolve the capability-owner split. It then consumes paired
normalized/audit crawler bytes; it cannot crawl, renormalize, or fall back to
the retired bridge. Missing real crawler evidence is a separate input blocker.

Batch 05 readiness preparation resolves the split without claiming an executor:
maint facts (`npc_crawler_facts`), item relation facts/shop/loot (`items`), Buff
relation and local projection (`buffs`), local shop projection
(`town_npc_maintenance`), and boss/non-boss local loot partitions
(`boss_loot` / `npc_loot`) are seven independent owner phases. The read-only
preparation report proves 25 paired inputs and positive Buff/shop/loot facts.
Step 3B code is complete only when the landing prerequisite and all seven
phases have governed executors and independent exact authorization contracts;
the old cross-owner operation stays non-executable. Formal execution remains a
later Task 13 checkpoint.

Execute the phases as one fail-closed dependency chain, while preserving eight
independent authorization and transaction boundaries:

0. `canonical-npc-landing-apply` is an independently authorized prerequisite
   owned by `landing`. It writes only the `npcs_base_raw` and
   `npc_crawler_facts_raw` logical partitions of
   `local.source_dataset_landings`, consuming the standardized NPC base plus the
   same frozen 25 evidence pairs. It must complete before phase 1.

1. `canonical-npc-facts-maint-apply` owns only
   `maint.maint_npc_crawler_facts.canonical` and requires the exact successful
   landing-prerequisite result.
2. `canonical-npc-item-relations-apply` owns only the four `items` relation
   ownership keys and requires the exact successful phase-1 result.
3. `canonical-npc-buff-relations-apply` owns only
   `relation.npc_buff_relations.buffs` and requires phases 1-2.
4. `canonical-npc-town-shop-projection-apply` owns only the two
   `town_npc_maintenance` local shop keys and requires phases 1-3.
5. `canonical-npc-buff-projection-apply` owns only
   `local.npc_buff_relations.buffs` and requires phases 1-4.
6. `canonical-npc-nonboss-loot-projection-apply` owns only the non-boss
   partition of `local.npc_loot_entries` and requires phases 1-5.
7. `canonical-npc-boss-loot-projection-apply` owns only the boss partition of
   `local.npc_loot_entries` and requires phases 1-6.

The prerequisite and all seven authorization data bundles must include the same exact raw SHA-256 of
`reports/authorization/canonical/canonical-npc-apply.input.json`. Each phase
binds every required upstream result file by path,
byte length, raw SHA-256, operation ID, ownership keys, committed status, and
that same input hash. Manifests declare no crawler or network access and expose
only the phase's exact ownership keys; they must not wrap the broad landing,
relation, or compatibility sync CLIs.

Each executor revalidates the paired normalized/audit bytes from the frozen
input without crawling or normalization, starts one transaction, writes only
its owned rows or partition, verifies exact affected/readback counts, commits,
and atomically publishes a private schema-v1
`canonical_npc_owner_phase_result`. A result records the phase index,
operation/capability, frozen input hash, bound upstream result hashes, exact
ownership keys, committed status, row counts, deterministic output hash, and
completion time. On failure it rolls back only the current phase and does not
publish a successful result. Earlier committed phases remain durable and may be
referenced by later independently authorized packets; the failed phase needs a
new exact authorization before retry.

A read-only final aggregator must reject a missing or mismatched landing result,
or any missing, failed, duplicated,
out-of-order, stale-input, ownership-drifted, or hash-mismatched phase result.
Only the landing prerequisite plus all seven successful phase results for one frozen input may produce
`canonical-npc-apply.completion.json`. NPC T1/readiness must bind that completion
artifact and independently revalidate all seven results before it can pass.
Partial completion never unlocks T1, T2, a source flip, L1/L2, or scheduler
eligibility. `canonical-npc-apply` remains in the catalog with `executor: null`
as the retired cross-owner umbrella; the landing prerequisite and seven owner
operations are added as separate governed IDs.

- [x] **Step 4: Implement automation preview, persistence, and apply ownership**

The `biomes` preview must create an immutable bundle and persist the exact
run/policy/evidence/bundle/decision chain. L1 apply must load and revalidate that
chain, consume the one-time approval in the apply transaction, apply only frozen
content without network access, and persist apply/fence/generation evidence.
The packet-consuming Node executor is the only formal write path. Keep the
backend provider fail-closed because it has no production caller and cannot
participate in the Node importer's transaction without opening a second
connection/protocol.

- [x] **Step 5: Implement L1/L2/scheduler policy-decision entrypoints**

Policy promotion and activation decisions use one transaction, bind the exact
packet/decision identity, preserve append-only policy/activation history, and
re-read current policy identity plus successful committed L1 count immediately
before commit. Scheduler activation records eligibility only; it does not start
an unbounded scheduler run.

- [x] **Step 6: Regenerate manifests and requests from current bytes**

Sixteen original operations plus the landing prerequisite and seven NPC owner
phases have real governed manifests; `canonical-npc-apply` has the explicit
ownership blocker. The generated request artifacts remain `AWAITING_OWNER`
and retain their operation-specific input blockers. The packet runner's
no-shell, current-hash, transitive-code-hash, and one-time decision tests pass.

## Task 13: Perform Separately Authorized T2 Cutovers

**Files:**
- Create after successful exact operations:
  `reports/canonical-migration/canonical-item-group-readiness.json`
- Create after successful exact operations:
  `reports/canonical-migration/canonical-npc-crawler-facts-readiness.json`
- Create after successful exact operations:
  `reports/canonical-migration/npc-bridge-retirement.json`
- Modify only after matching report passes:
  `docs/audits/canonical-migration-boundary.md`
- Modify only after facts become true:
  `docs/project-governance/00_CURRENT_SPEC.md`
- Modify: `scripts/data/maint/sync-landing-to-maint.mjs`
- Modify: `scripts/data/maint/sync-landing-to-maint.test.mjs`
- Modify: `scripts/data/npc-canonical/npc-canonical-t0-acceptance.mjs`
- Modify: `scripts/data/npc-canonical/npc-canonical-t0-acceptance.test.mjs`
- Create: `scripts/data/npc-canonical/npc-base-maint-apply.mjs`
- Create: `scripts/data/npc-canonical/npc-base-maint-apply.test.mjs`
- Modify: `scripts/data/npc-canonical/npc-canonical-readiness.mjs`
- Modify: `scripts/data/npc-canonical/npc-canonical-readiness.test.mjs`
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Modify: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`

- [x] **Step 1: Apply authorized V56/V57/V58 schema packet**
- [x] **Step 2: Re-read schema and verify exact table/index fingerprints**
- [x] **Step 3: Apply authorized frozen group bootstrap once**
- [x] **Step 4: Run shadow parity, disable group JSON fallback, restart through standard scripts, and run read-only API/runtime smoke**
- [x] **Step 5: Execute separately authorized real NPC crawler and frozen NPC apply**
- [x] **Step 6: Generate fresh canonical group, canonical NPC, and bridge-retirement reports**

  The NPC generator must re-read the private frozen input, one landing result,
  seven ordered owner-result bytes, and `canonical-npc-apply.completion.json`,
  then independently reconstruct the completion before it trusts any database
  observation. It opens only `START TRANSACTION READ ONLY` against the exact
  formal local/maint/relation database triplet, freezes landing/maint/relation/
  local/runtime hashes, and probes one local-projection-backed admin and public
  NPC sample. It atomically writes a private report even when evidence is
  blocked, naming the exact missing T1 rollback/restore/cleanup, API, or T2
  identity condition. It must never infer T1/T2 from completion alone, start a
  backend, or execute crawler/import/apply work.
- [ ] **Step 7: Flip each source contract only after its exact report passes**

The refreshed private 2026-07-30 NPC readiness report is `T1_VERIFIED` and
passes its native 65/65 checks after both base partitions completed. Its admin
and public GET probes match local snapshot
`sha256:58545f6cd8d2f40f30ca5f6d74ee5654f1c41deece8e217849ad9dbeacafdb37`.
The offline freshness audit classifies the report as fresh at age zero, but
correctly keeps the acceptance panel blocked because that surface requires
`T2_CUTOVER_VERIFIED`, not T1 evidence. Cross-DB quick is 10/10 pass; full is
8 pass plus two warnings for one relation-loot row without local output and
4,316 legacy local acquisition rows. Relation health is 21 pass / 6 info / 0
blocked / 1 warning for 287 unresolved NPC audits. The latest read-only domain
rerun is 43 pass / 1 warning / 1 blocked: only shimmer remains warning and item
image readiness remains blocked. Source-contract flips stay closed because the
full gate is non-green and the NPC acceptance surface has not reached T2.

The separately authorized lineage retry is also complete. Decision
`canonical-npc-item-relation-lineage-repair-20260730-02` consumed packet
`sha256:f429552a9a8c4752eee5d5bbcaf68c1c52ac82b26184a297b1dc3cde8ce5b662`
once. Its private 1,684-byte result hashes to
`sha256:09930216cab4b834b2d67f6bb647bca9d023f47aae94d4e48e08888dd528a7fc`,
reports `COMPLETED`, commits 329 source facts plus 329 details, and binds output
`sha256:e6debec3292385315b3c683c1c3adb974765d624bf15acec8ace520e26444f84`.
The retry-01 zero-byte result remains historical evidence only; neither
decision identity may be reused. This closes the lineage evidence gap but does
not grant NPC T2 or a source-contract flip.

The complete acceptance sweep added a base-lineage prerequisite to this step.
Before any NPC source flip, the readiness snapshot must prove that every active
`maint_npcs` row binds the one current `npcs_base_raw` landing by exact landing
ID, source key, and content hash, and that its active count matches the local NPC
projection count. Formal repair requires independently authorized operations 26
and 27 plus their two-result base completion. The already consumed 1+7 owner
completion and `canonical-npc-t1-acceptance-20260730-01` do not cover this
missing base-maint ownership surface and must not be reused.

The code-only repair for that prerequisite is executed before another source
flip or formal request is considered:

1. Add a RED standardized-NPC extraction contract proving
   `record.extras.townNPC` is projected to `flagsJson.townNpc`; fix only that
   source-field lookup and preserve the legacy `flags` and top-level inputs.
2. Extend the disposable NPC T0 fixture with one `maint_npcs` base row carrying
   the exact base landing ID, source key, and content hash. Include that row in
   rollback/commit/restore counts, restore cleanup, and `maint.base` readiness
   evidence without changing the established isolated-T1 table snapshot.
3. Add two governed executors and contracts for
   `canonical-npc-base-maint-nontown-apply` and
   `canonical-npc-base-maint-town-apply`. Each binds the same frozen NPC input,
   current standardized base bytes, and committed landing-result bytes; writes
   only its certified `maint_npcs` predicate; verifies transaction-local counts,
   identity, and lineage; and publishes one private committed result.
4. Add a read-only base completion that reconstructs both result files and
   rejects missing, duplicate, stale-input, stale-landing, ownership-drifted,
   or hash-drifted results. NPC readiness must reconstruct this completion
   before trusting the formal base snapshot.
5. Run the focused extraction, T0, base executor/completion, readiness,
   operation-catalog, manifest, authorization, and formal-runner contracts.
   Then regenerate only current-byte `AWAITING_OWNER` requests. Do not create a
   packet or execute either formal write without new exact Owner fields and
   decision identities.
6. Repair the independently discovered 329-row relation-lineage drift only
   through `canonical-npc-item-relation-lineage-repair`. Its RED contracts must
   prove exact predecessor binding, two-table ownership, deterministic record
   keys, transaction-local `maint_npc_crawler_facts` joins, rollback on readback
   mismatch, and a distinct result path. Generate only an `AWAITING_OWNER`
   request from current bytes; do not reuse the consumed phase-2 identity or
   overwrite its result.

The bounded real NPC crawler produced the 25 immutable normalized/audit pairs
bound by `canonical-npc-apply.input.json`; the independently authorized landing
and all seven single-owner phases then completed. The read-only completion
aggregator is `COMPLETED` for `canonical-npc-apply`, binds one input hash, the
landing result, and exactly seven ordered phase results, with completion hash
`sha256:9252a6563b90d71d9868eb63875debbe13af58bdc0b9411f32140390b78ac79a`.
This completes Task 13 Step 5 without re-running the crawler or any owner
phase. The separate Task 11 isolated three-database T1 and the Task 13 Step 6
report generation have since completed; neither result permits a source-contract
flip without a passing API-backed readiness report.

Batch 05 completed the group slice of Step 6: the three deterministic
compatibility exports and `canonical-item-group-readiness.json` pass under export
run `ig_export_20260729_01`. The refreshed private NPC report now reaches
`T1_VERIFIED` and has all non-API checks passing, but its admin/public API probes
remain blocked while the shared backend is absent. Step 6 is complete because the
required reports are fresh; Step 7 remains fail-closed, and no source contract
may flip while API evidence or the complete repository gate is non-green.

The first authorized landing-prerequisite attempt consumed decision identity
`canonical-npc-landing-apply-20260729-01` and stopped before its first row write:
the strict importer rejected generic NPC descriptors that lacked governed
`source_evidence` producer metadata. Formal counts remained zero and the
transaction rolled back. The repaired executor binds all 26 selected descriptors
to the frozen input hash and governed full-file identity; formal retry requires
the replacement exact request rather than reusing the consumed decision.

### Authorized Wave 1: independent landing retry and biomes policy promotion

The System Owner approved a single serialized execution window on 2026-07-29
for exactly two current-byte packets: landing retry decision
`canonical-npc-landing-apply-20260729-02` binds request
`sha256:6395b6031dc5bc4e8c0b08357a855163fe09ad93ec5e90aa367c0a4e5ce8ff19`,
and biomes L1 policy-promotion decision
`automation-biomes-l1-policy-promotion-20260729-01` binds request
`sha256:df50664e72b2ff475c7e839c7e1129a7a77b8ed953353d6b98547f109431282a`.
Both use actor `admin`, separate one-time packets, current-code verification,
and transaction-local readback. Execute landing first, then execute the biomes
policy lane independently even if landing fails; no shared transaction or
identity exists between them.

This window writes only (1) the `npcs_base_raw` and
`npc_crawler_facts_raw` logical partitions of `local.source_dataset_landings`,
and (2) the current `biomes` policy from L0/DISABLED to L1/ACTIVE. It does not
authorize any NPC owner phase, crawler/network access, L1 apply, L2 promotion,
scheduler activation, source-contract flip, or stack restart. The seven NPC
owner-phase requests must be regenerated after their exact predecessor result
files exist; their future hashes and decision identities cannot be authorized in
advance.

Wave 1 outcome: landing packet
`sha256:9f8bee4fde0374deae2d666b76460beba895dafce7fff2eb4dd9f9441e51922d`
completed and its committed result proves 1 base plus 25 crawler landing rows.
The biomes packet was rejected before identity consumption because its original
manifest bound an older shared authorization-builder code hash. The unused
`automation-biomes-l1-policy-promotion-20260729-01` identity cannot cover its
replacement request. The new independent requests are NPC phase 1
`sha256:120f0eb65cfb77ebd4133999a8d8e828ba1b1fd99ae9c27dd033140f64cd7f57`
and biomes retry
`sha256:70be837132b37c1b3f1c22c9728e83de110ccf42a95ffef329bb3e92bce4a47b`.

Wave 2 outcome: the biomes retry consumed packet
`sha256:c9104874389c553617ff24c7a7c5be9ac0d0fd2b9a19c7d0d1a7208a7b43ca5c`
and completed `biomes` v1 `L0/DISABLED` -> `L1/ACTIVE`. The first NPC phase-1
packet consumed its one-time identity, then rolled back before writing because
the generic SQL mapper attempted to persist the row-contract metadata fields
`scope` and `table_name`. The smallest owner-module repair excludes those two
non-column fields; its focused adapter regression and related Node suites pass
67 with one existing skip. The failed identity cannot be reused. Current retry
request `sha256:86a2650dce0c145e430414ff830dd7e1ddbf49516b9e4e1fbe5a81260f8add52`
is `AWAITING_OWNER`; it remains limited to
`maint.maint_npc_crawler_facts.canonical`, and phase 2 stays unavailable until
its committed result bytes exist.

Any failure keeps pre-cutover readers active or triggers the existing
latest-writer rollback/circuit-breaker. Never silently re-enable JSON after a
successful canonical cutover.

## Task 14: Prove The First Real L1 Automated Ingestion

**State targets:** `crawler_automation_owner`, `crawler_automation_policy`,
`crawler_automation_policy_version`, `crawler_automation_run`,
`crawler_automation_run_policy`, `crawler_automation_evidence`,
`crawler_automation_evidence_set`, `crawler_automation_apply_bundle`,
`crawler_automation_decision`, `crawler_automation_approval`,
`crawler_automation_snapshot`, `crawler_automation_apply`,
`crawler_automation_write_fence`, and `crawler_automation_mutation_generation`.
Task 12A must first complete the Node-owned preview/apply persistence path with
RED-to-GREEN tests and keep the unused backend path fail-closed. After that
prerequisite is green, no further code changes are allowed unless the run
exposes a reproducible defect with a RED regression test.

- [x] **Step 1: Request and execute the L1 policy-promotion decision for the fixed `biomes` candidate**

`biomes` is the request candidate because the existing bootstrap contract and
preview/apply pair already exercise it. The Owner must still approve its exact
policy, actor, reason, reference, and hash. If the Owner selects another domain,
patch and re-audit this plan before executing; do not substitute dynamically.

The independent retry decision `automation-biomes-l1-policy-promotion-20260729-02`
completed on 2026-07-29 with policy v1 at `L1/ACTIVE`. It does not authorize a
preview, apply, L2 promotion, scheduler activation, or network activity.

- [x] **Step 2: Bootstrap exact `biomes` policy under that separately authorized decision**
- [x] **Step 3: Run full repository quality gate from the beginning**
- [x] **Step 4: Freeze and approve the first exact `biomes` preview bundle**
- [x] **Step 5: Execute first `biomes` L1 apply under its independent approval**
- [x] **Step 6: Verify latest-writer identity, table hashes, downstream API state, audit rows, and rollback eligibility**
- [x] **Step 7: Re-run full gate and record `AUTOMATION_PROVEN`**
- [x] **Step 8: Freeze a later independent preview and execute the second L1 apply only under a new request, decision identity, and packet**
- [x] **Step 9: Verify both committed L1 applies remain independently hash-bound before any L2 request is authorized**

Batch 05 reran Step 3 from the beginning. Data workflow passed 295/295 and
automation contracts passed 177/177, but the gate stopped at the read-only
domain stage with 40 pass / 4 warning / 1 blocked. The Step 3 checkbox remains
open because an expected fail-close is not a passing full repository gate.

The latest 2026-07-30 rerun started from the beginning and passed the data
workflow and automation stages, then stopped at the improved but still
non-green domain result of 43 pass / 1 warning / 1 blocked. The sole blocker is
item image readiness and the sole warning is shimmer. Formal state remains
`biomes` policy v1 `L1/ACTIVE`, zero automation runs, zero committed L1 applies,
no open circuit, and zero L2/scheduler decisions. Step 3 remains unchecked:
fail-close exit 1 is correct behavior, not a passing full gate. Steps 4-9 stay
unavailable by dependency, and the technically complete first-L1 request is
not authorization to bypass Step 3.

## Task 15: Gate L2 And Scheduler Availability

**Files:**
- Create: `back/src/main/resources/db/migration/V58__create_crawler_automation_activation_decisions.sql`
- Modify: `scripts/data/automation/crawler-automation-migration-contract.test.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Create: `back/src/main/java/com/terraria/skills/mapper/CrawlerAutomationActivationDecisionMapper.java`
- Modify: `back/src/main/java/com/terraria/skills/service/CrawlerAutomationPolicyService.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerAutomationPolicyServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerAutomationPolicyServiceImplTest.java`
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerAutomationServiceImplTest.java`
- Modify only when dispatch guards require it:
  `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`
- Modify only when dispatch guards require it:
  `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Modify: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`

V58 stores append-only `L2_PROMOTION` and `SCHEDULER_ACTIVATION` decisions with
the exact domain, policy version/hash, policy-set hash, minimum successful L1
count, actor, reason, authorization reference, one-time decision identity,
packet hash, authorization time, and expiry. The schema enforces at least two
successful L1 applies for promotion and immutable update/delete triggers. V58
is an unapplied artifact until the replacement `canonical-schema-v56-v58`
request receives exact Owner authorization.

- [x] **Step 1: Add tests requiring at least two successful L1 applies, no open circuit breaker, exact current policy version/hash/set, and a fresh explicit promotion decision**
- [x] **Step 2: Verify scheduler refuses all L0/L1/disabled/stale domains**

The scheduler eligibility check also requires a fresh exact
`SCHEDULER_ACTIVATION` decision. Neither eligibility check may infer approval
from `crawler_automation_policy_version.approved_by` or `reason`. The existing
V1 changed-only wiki crawler scheduler is not the automated-ingestion scheduler
and remains untouched.

```bash
cd back && mvn -Dtest=CrawlerAutomationPolicyServiceImplTest,CrawlerAutomationServiceImplTest,CrawlerMonitorServiceImplTest test
```

- [x] **Step 3: Promote only `biomes` if its exact L2 packet is separately authorized**
- [x] **Step 4: Enable only the bounded `biomes` schedule if its scheduler packet is separately authorized**
- [x] **Step 5: Prove change detection, dedupe, heartbeat, terminal state, failure downgrade, and notification behavior**

On 2026-08-05, the separately authorized `biomes` L2 promotion completed
under packet
`sha256:0bd56e9035bc9b98c6ea5bd6afeba894e33c969f738a1e6b9048ff441777efbf`,
followed by bounded scheduler eligibility under packet
`sha256:81c2e4ee6b51304ed4bfb3e8e08a1ef70df070726c251b5974da4fdf07713aa8`.
Readback finds exactly one append-only decision of each kind, policy v1 remains
`L2/ACTIVE`, successful L1 count remains 2, and no active attempt, reservation,
permit, crawler process, or scheduler daemon was created. The focused backend
suite passes `224/224`; activation records eligibility only and does not claim
that an unbounded or recurring scheduler runtime was started.

Absence of an L2/scheduler authorization does not invalidate
`AUTOMATION_PROVEN`; it leaves the domain safely approval-gated.

## Task 16: Final Repository And Devlog Closeout

**Files:**
- Modify if current facts changed: `docs/project-governance/00_CURRENT_SPEC.md`
- Modify: `docs/audits/canonical-migration-boundary.md`
- Modify: `docs/audits/generated-data-consumer-map.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`
- Modify only for a durable new decision: `docs/project-management/decision-log.md`
- Modify: `docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`
- Modify: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`
- Modify: `docs/devlog/current.md`

- [x] **Step 1: Run full verification**

```bash
bash ./scripts/dev/quality-gate.sh
git diff --check
git status --short
```

Also verify no temporary services, databases, accounts, Redis reservations,
progress temp files, or unpublished projections remain.

- [x] **Step 2: Update durable facts only from fresh evidence**

Record actual migration versions, report hashes, cutover IDs, capability count,
policy state, first L1 result, remaining L2 decisions, and rollback evidence.

The 2026-08-05 durable-audit delta records V56-V58, the 24-action monitor
baseline and 36-operation formal catalog, completed item-image/Shimmer chains,
both L1 runs, the independent L2/scheduler decisions, fresh report hashes, and
the no-daemon/no-crawler boundary. No L2 decision remains pending for `biomes`.

- [ ] **Step 3: Close child and parent entries only when closure criteria pass**

If authorization is the only remaining condition, keep entries `active` with
the exact packet and named owner; do not call the project complete.

- [ ] **Step 4: Commit closeout**

```bash
git commit -m "docs(devlog): close automated ingestion readiness"
```

No push, merge, or worktree cleanup occurs unless separately requested.

## Failure Repair Rule

During Tasks 1-16:

1. Reproduce every unexpected failure with the narrowest command.
2. Trace the failing value to its source; do not patch downstream symptoms.
3. Add or preserve a failing regression test before changing behavior.
4. Patch the smallest owning module and rerun focused plus dependent suites.
5. If the finding changes tables, source ownership, authorization semantics, or
   closure criteria, patch this plan and re-run the affected plan-audit gates.
6. Continue automatically after repair.

Stop only when continuing would require missing formal authorization, unavailable
external source evidence, destructive action outside the frozen bundle, unknown
credentials/identity, or a conflict with another active writer.

## Final Acceptance Matrix

| Gate | Required result |
| --- | --- |
| Group CODE_READY | all schema/parser/pipeline/consumer/export/evidence tests pass |
| Group T1 | isolated three-database import, parity, export, rollback, cleanup pass |
| NPC CODE_READY | fixture source split, zero bridge fallback, relation/local contract tests pass |
| NPC T1 | separately authorized real crawler evidence produces non-empty Buff/shop/loot chain with rollback/restore/cleanup pass |
| Domain panels | 45 pass, 0 warning, 0 blocked |
| Capability catalog | exact monitor action count: 21 after group, 23 after NPC, 24 after the item-image verifier; new pairs L0+DISABLED before activation |
| Formal schema/data | separately authorized, exact hashes/fingerprints, verified after apply |
| B1 closure | every identity canonical or retired with fresh T2 evidence |
| Runtime | JSON fallback disabled; read-only API/admin/public smoke non-empty and hash-bound |
| First L1 | preview/apply/post-verify/audit/rollback eligibility all pass |
| Full gate | `bash ./scripts/dev/quality-gate.sh` exits 0 from the beginning |
| L2/scheduler | enabled only for exact domains carrying explicit fresh decisions |
