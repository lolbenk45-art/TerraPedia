# Biome T1 Isolated Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and execute a governed two-biome offline T1 acceptance that proves the current local-owned Biome import, wikitext source relations, consumer filtering, and zero cleanup boundary.

**Architecture:** A Biome executor reuses `importBiomeDataset`, `runMaintSync`, the existing infocard parser, and `applyRows` inside the disposable three-database harness. It clears snapshot pollution, seeds only four items and two NPCs, imports `corruption` and `crimson`, and validates the exact local-owned consumer tables because no Biome relation projection exists.

**Tech Stack:** Node.js ESM, `node:test`, Spring Boot focused tests, MySQL isolated acceptance provisioner, Redis V2 authorization state, canonical operation manifests.

---

### Task 1: Repair The Public Biome Active Filter

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/BiomeServiceImpl.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/BiomeServiceImplTest.java`

- [ ] **Step 1: Write the failing list-filter test**

Capture the `LambdaQueryWrapper` passed to `biomeMapper.selectList` and assert
its SQL segment contains both active predicates:

```java
when(biomeMapper.selectList(any())).thenReturn(List.of());
service.getBiomes();
verify(biomeMapper).selectList(wrapperCaptor.capture());
assertTrue(wrapperCaptor.getValue().getSqlSegment().contains("status"));
assertTrue(wrapperCaptor.getValue().getSqlSegment().contains("deleted"));
```

- [ ] **Step 2: Run the test and verify RED**

Run from `back/`:

```bash
mvn -Dtest=BiomeServiceImplTest test
```

Expected: the list query lacks `deleted=0`.

- [ ] **Step 3: Add the minimal predicate**

Change `getBiomes()` to use:

```java
new LambdaQueryWrapper<Biome>()
    .eq(Biome::getStatus, 1)
    .eq(Biome::getDeleted, 0)
    .orderByAsc(Biome::getId)
```

- [ ] **Step 4: Run the focused backend test and verify GREEN**

Expected: `BiomeServiceImplTest` passes.

### Task 2: Freeze The Offline Fixture And Isolation Contract

**Files:**
- Create: `scripts/data/biome/fixtures/biome-t1.sample.json`
- Create: `scripts/data/biome/biome-canonical-t1-acceptance.mjs`
- Create: `scripts/data/biome/biome-canonical-t1-acceptance.test.mjs`

- [ ] **Step 1: Write failing fixture tests**

Require the fixture and executor, then assert:

```js
assert.deepEqual(fixture.biomes.map(({ code }) => code), ['corruption', 'crimson']);
assert.equal(fixture.expected.biomeRelations, 2);
assert.equal(fixture.expected.itemCandidates, 4);
assert.equal(fixture.expected.npcCandidates, 2);
assert.deepEqual(fixture.dependencies.items, ['Musket', 'Vilethorn', 'TheUndertaker', 'TheRottedFork']);
assert.deepEqual(fixture.dependencies.npcs, ['CorruptGoldfish', 'CrimsonGoldfish']);
```

Also require formal database names and mismatched run-derived names to be
rejected before any connection is created.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test scripts/data/biome/biome-canonical-t1-acceptance.test.mjs
```

Expected: FAIL because the fixture and executor do not exist.

- [ ] **Step 3: Add the two complete fixture records**

Each record contains its core import fields, one reciprocal `counterpart`
relation, and an offline infocard with exactly two unique item templates and
one unique NPC template. The Crimson NPC template uses the current formal
display name `Vicious Goldfish` and must resolve to `CrimsonGoldfish`; do not
derive a display name from the internal identity. Export:

```js
export function buildBiomeT1LandingRows({ fixture } = {}) {}
export async function seedBiomeFixtureItems(options = {}) {}
export async function seedBiomeFixtureNpcs(options = {}) {}
export async function runBiomeCanonicalT1Acceptance(options = {}) {}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Expected: fixture and isolation tests pass.

### Task 3: Prove Core Import, Wikitext Sources, And Consumer Readback

**Files:**
- Modify: `scripts/data/biome/biome-canonical-t1-acceptance.mjs`
- Modify: `scripts/data/biome/biome-canonical-t1-acceptance.test.mjs`
- Test: `scripts/data/import/import-biomes-to-db.test.mjs`
- Test: `scripts/data/import/import-biome-wikitext-resolved-to-db.test.mjs`
- Test: `scripts/data/audit/biome-wikitext-linkage-dry-run.test.mjs`
- Test: `scripts/data/maint/sync-landing-to-maint.test.mjs`

- [ ] **Step 1: Add failing exact-closure tests**

Cover each independent failure:

```text
snapshot Biome-owned rows are not cleared before fixture import
dependency seed differs from four exact items and two exact NPCs
core import differs from two biomes and two counterpart relations
maint mapping differs from two rows
wikitext parsing produces a missing, ambiguous, duplicate, or extra fact
resolved import differs from four resources, four item-biome rows,
four biome-wikitext item sources, or two NPC-biome rows
wrong source_ref_type/provider/status/deleted ownership
inactive or deleted decoy appears in public consumer readback
unexpected unresolved item, NPC, or related biome identity
```

- [ ] **Step 2: Run the focused test and verify RED**

Expected: import/readback gates fail because only the contract exists.

- [ ] **Step 3: Implement the isolated local-owned chain**

In the disposable local database, clear these tables in dependency order:

```text
item_acquisition_sources, npc_biomes, item_biomes, biome_resources,
biome_relations, biomes, items, npcs
```

Copy the six exact dependencies from formal local with the readonly account.
Call `importBiomeDataset` with two fixture biomes and no unrelated `itemBiomes`.
Run `runMaintSync` with `scopes=['biomes']` and two fixture landing rows. Read
the two isolated `maint_biomes` rows, call `buildMaintBiomeWikitextPayloads`,
`parseBiomeInfocardEntries`, `matchBiomeWikitextEntries`, and
`buildResolvedOnlyCandidates`, then call `buildItemInsertRows`,
`buildNpcInsertRows`, and `applyRows` using isolated lookup maps.

Insert inactive/deleted decoys only in the isolated target. Consumer readback
must use the backend predicates:

```sql
WHERE b.status = 1 AND b.deleted = 0
WHERE nb.status = 1 AND nb.deleted = 0
WHERE s.status = 1 AND s.deleted = 0
  AND s.source_ref_type = 'biome_wikitext'
  AND s.source_provider IN ('terraria.wiki.gg', 'wiki_gg')
```

Return compact counts and identities only; never return credentials or the
full wikitext.

- [ ] **Step 4: Run the complete Biome Node suite and verify GREEN**

```bash
node --test \
  scripts/data/biome/biome-canonical-t1-acceptance.test.mjs \
  scripts/data/import/import-biomes-to-db.test.mjs \
  scripts/data/import/import-biome-wikitext-resolved-to-db.test.mjs \
  scripts/data/audit/biome-wikitext-linkage-dry-run.test.mjs \
  scripts/data/maint/sync-landing-to-maint.test.mjs
```

Expected: all selected tests pass with the existing shimmer skip unchanged if
the shared maint suite includes it.

### Task 4: Register The Governed Operation

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.test.mjs`

- [ ] **Step 1: Add failing registration and routing tests**

Freeze:

```text
operationId=canonical-biome-t1-acceptance
scope=biome-canonical
profile=t1
fixture=scripts/data/biome/fixtures/biome-t1.sample.json
output=reports/canonical-migration/canonical-biome-t1-acceptance.json
databaseWrites=false
isolatedResourceWrites=true
networkAccess=false
maxRows=25
```

- [ ] **Step 2: Run automation tests and verify RED**

Expected: operation and scope are unregistered.

- [ ] **Step 3: Add minimal catalog, manifest, authorization, and live routing**

Bind the executor plus `import-biomes-to-db.mjs`,
`import-biome-wikitext-resolved-to-db.mjs`,
`biome-wikitext-linkage-dry-run.mjs`, and `sync-landing-to-maint.mjs` in the
static code bundle. Include the operation in every isolated-T1 technical
identity allowlist and enforce its one fixed evidence path.

- [ ] **Step 4: Run automation tests and verify GREEN**

```bash
node --test \
  scripts/data/automation/canonical-operation-execution-manifest.test.mjs \
  scripts/data/automation/build-canonical-cutover-authorization.test.mjs \
  scripts/data/automation/run-live-automation-acceptance.test.mjs \
  scripts/data/automation/run-authorized-canonical-operation.test.mjs \
  scripts/data/automation/authorized-operation-context.test.mjs
```

Expected: all authorization and dispatch tests pass.

### Task 5: Review, Authorize, Execute, And Close

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-08-07-remaining-domain-isolated-acceptance.md`
- Modify: `docs/devlog/entries/2026-08-08-biome-t1-isolated-acceptance.md`
- Create: `reports/canonical-migration/canonical-biome-t1-acceptance.json`

- [ ] **Step 1: Run focused validation**

Run the complete Node suites above and, from `back/`:

```bash
mvn -Dtest=BiomeServiceImplTest,AdminBiomeControllerTest,PublicBiomeControllerTest test
```

Expected: zero failures.

- [ ] **Step 2: Perform independent preflight**

Verify disposable databases, temporary accounts, active transactions, Biome
acceptance processes, and current dispatch permits are zero. Redis DB 8 is
occupied with 35 unrelated keys and must not be cleared. Use Redis DB 9 only
after rechecking it is still empty immediately before authorization; otherwise
amend the manifest to another empty logical DB.

- [ ] **Step 3: Generate fresh current-hash ADMIN artifacts**

Use run ID `npc-t1-biome-20260808-01` unless a retry requires a new suffix.
Generate a fresh manifest, request, owner input, packet, and one-time decision
for `canonical-biome-t1-acceptance`. Keep private authorization artifacts
ignored and mode `0600`.

- [ ] **Step 4: Execute exactly one authorized operation**

Dispatch through `scripts/data/automation/run-authorized-canonical-operation.mjs`.
Do not invoke the live acceptance child directly.

- [ ] **Step 5: Verify evidence and cleanup independently**

Require `status=passed`, `cleanupPassed=true`, snapshot `129/129`, probes
`0/1/0`, exact fixture counts, exact public readback, and zero databases,
accounts, transactions, Redis DB 9 keys, Biome processes, and permits.

- [ ] **Step 6: Close and commit the batch**

Retain the tracked evidence report, close the child devlog, advance the parent
to the formal Recipe Apply design-only batch, and explicitly stage only Biome
code, tests, fixture, devlog, and report. Exclude Town NPC data and
`data/generated/resume/`.

```bash
git diff --check
git status --short
git diff --cached --stat
git commit -m "test(biome): add isolated T1 acceptance"
```
