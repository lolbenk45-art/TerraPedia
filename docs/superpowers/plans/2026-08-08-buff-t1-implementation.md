# Buff T1 Isolated Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and execute a governed two-row offline Buff T1 acceptance with exact item/NPC relations, full immune-NPC payload readback, and zero residual resources.

**Architecture:** A Buff executor reuses `importBuffs`, landing-to-maint sync, and the Buff scope of maint-to-relation consolidation inside the established disposable three-database harness. It seeds only eleven fixture items and four canonical inflicting NPC targets, validates projection rows using the backend consumer column contract, and never converts Buff-page immunity lists into NPC immune relations.

**Tech Stack:** Node.js ESM, `node:test`, Spring Boot focused tests, MySQL isolated acceptance provisioner, Redis V2 authorization state, canonical operation manifests.

---

### Task 1: Freeze The Offline Fixture Contract

**Files:**
- Create: `scripts/data/buff/fixtures/buff-t1.sample.json`
- Create: `scripts/data/buff/buff-canonical-t1-acceptance.test.mjs`
- Create: `scripts/data/buff/buff-canonical-t1-acceptance.mjs`

- [ ] **Step 1: Write the failing fixture test**

Require the executor and fixture, then assert:

```js
assert.deepEqual(fixture.records.map(({ id, internalName }) => ({ id, internalName })), [
  { id: 153, internalName: 'ShadowFlame' },
  { id: 70, internalName: 'Venom' },
]);
assert.deepEqual(fixture.records.map((row) => row.immuneNpcs.length), [30, 26]);
assert.equal(fixture.expected.itemBuffRelations, 11);
assert.equal(fixture.expected.inflictingNpcBuffRelations, 4);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test scripts/data/buff/buff-canonical-t1-acceptance.test.mjs
```

Expected: FAIL because the executor and fixture do not exist.

- [ ] **Step 3: Add the fixture and exported contract helper**

The fixture must contain the two complete standardized records, including all
ordered `sourceItems`, `inflictingNpcs`, `immuneNpcs`, and `sourceEvidence`
objects. Export:

```js
export function buildBuffT1LandingRows({ fixture } = {}) {}
export async function seedBuffFixtureItems(options = {}) {}
export async function seedBuffFixtureNpcs(options = {}) {}
export async function seedBuffFixtureMaintItems(options = {}) {}
export async function seedBuffFixtureMaintNpcs(options = {}) {}
export async function runBuffCanonicalT1Acceptance(options = {}) {}
```

- [ ] **Step 4: Run the test and verify GREEN**

Expected: fixture contract tests pass.

### Task 2: Prove Import And Dependency Isolation With TDD

**Files:**
- Modify: `scripts/data/buff/buff-canonical-t1-acceptance.test.mjs`
- Modify: `scripts/data/buff/buff-canonical-t1-acceptance.mjs`

- [ ] **Step 1: Add failing dependency/import tests**

Cover these exact behaviors:

```text
reject formal or non-derived local/maint/relation names
copy exactly eleven fixture items from formal local to isolated local
copy exactly eleven maint item rows from formal maint to isolated maint
copy exactly Clothier, BlackRecluse, JungleCreeper, DesertScorpionWalk
copy the same four canonical NPC rows into isolated maint
clear snapshot local items before seeding the exact eleven fixture items
clear snapshot maint items/NPCs before seeding the exact eleven/four rows
clear isolated maint_buffs before fixture maint mapping
delete only fixture Buff rows before import
reuse importBuffs with exactly two records
require import stats 2 created, 0 updated, 0 errors
require local buff_source_items exactly eleven with zero unmatched rows
```

- [ ] **Step 2: Run the focused test and verify RED**

Expected: dependency and import assertions fail because the executor is incomplete.

- [ ] **Step 3: Implement minimal isolated import and seeding**

Use the temporary readonly account only for exact formal reads and the
temporary provisioner only for isolated writes. `importBuffs` receives item
lookups built from the eleven seeded local item rows. Do not call the
independent-entity CLI and do not run schema creation against a formal name.
Clear only the isolated target tables; never delete from a formal qualifier.

- [ ] **Step 4: Run the focused test and verify GREEN**

Expected: import and dependency tests pass.

### Task 3: Prove Maint, Relation, Projection, And Consumer Readback

**Files:**
- Modify: `scripts/data/buff/buff-canonical-t1-acceptance.test.mjs`
- Modify: `scripts/data/buff/buff-canonical-t1-acceptance.mjs`
- Test: `scripts/data/maint/sync-landing-to-maint.test.mjs`
- Test: `scripts/data/relation/buff-entity-processor.test.mjs`
- Test: `scripts/data/relation/secondary-relation-processor.test.mjs`
- Test: `scripts/data/relation/projection-sync.test.mjs`
- Test: `scripts/data/relation/sync-maint-to-relation.test.mjs`

- [ ] **Step 1: Add failing exact-consolidation tests**

Require the executor to reject each independent drift:

```text
wrong or duplicate relation Buff identity
wrong or duplicate projection Buff identity
item relation raw count or pair drift from the exact eleven pairs
inflicting NPC relation drift from the exact four canonical pairs
any immune relation derived from the Buff-page immuneNpcs arrays
wrong, truncated, reordered, or count-only immuneNpcs projection payload
sourceItems, inflictingNpcs, or sourceEvidence projection mismatch
unexpected unresolved entity issue or non-entity coercion
consumer readback missing one of the six governed JSON/count columns
```

- [ ] **Step 2: Run the focused test and verify RED**

Expected: exact relation and payload gates fail because they are not implemented.

- [ ] **Step 3: Implement the maint/consolidation/readback path**

Call `runMaintSync` with `apply=true`, `scopes=['buffs']`, the isolated maint
database, and `buildBuffT1LandingRows`. Call `runSync` with:

```js
{
  apply: true,
  createDatabase: false,
  maintDatabase: databases.maint,
  localDatabase: databases.local,
  relationDatabase: databases.relation,
  allowLocalItemImageFallback: false,
  scopes: ['buff'],
}
```

Read back exactly:

```sql
SELECT source_id, internal_name, source_item_count, immune_npc_count,
       source_items_json, inflicting_npcs_json, immune_npcs_json,
       source_evidence_json
FROM `<isolated_relation>`.`projection_buffs`
WHERE source_id IN (153, 70)
ORDER BY source_id
```

Parse and deep-compare every JSON payload to the fixture. Return compact exact
counts and identities in the acceptance result; do not return connection
credentials or large relation internals.

- [ ] **Step 4: Run the Buff and shared relation suites and verify GREEN**

Run:

```bash
node --test \
  scripts/data/buff/buff-canonical-t1-acceptance.test.mjs \
  scripts/data/import/import-independent-entities-to-db.test.mjs \
  scripts/data/maint/sync-landing-to-maint.test.mjs \
  scripts/data/relation/buff-entity-processor.test.mjs \
  scripts/data/relation/secondary-relation-processor.test.mjs \
  scripts/data/relation/projection-sync.test.mjs \
  scripts/data/relation/sync-maint-to-relation.test.mjs
```

Expected: all selected tests pass with the existing shimmer skip unchanged.

### Task 4: Register The Governed Operation

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.test.mjs`

- [ ] **Step 1: Add failing operation/authorization/routing tests**

Freeze this contract:

```text
operationId=canonical-buff-t1-acceptance
scope=buff-canonical
profile=t1
fixture=scripts/data/buff/fixtures/buff-t1.sample.json
output=reports/canonical-migration/canonical-buff-t1-acceptance.json
databaseWrites=false
isolatedResourceWrites=true
networkAccess=false
maxRows=25
Redis DB 7 and a fresh run ID supplied by the manifest
```

- [ ] **Step 2: Run automation tests and verify RED**

Expected: the operation is unregistered.

- [ ] **Step 3: Add minimal catalog, manifest, authorization, and live routing**

Register the operation in the stable catalog, bind every static imported code
path, include it in isolated-T1 technical identity checks, route only
`profile=t1/scope=buff-canonical`, and enforce the one fixed evidence path.

- [ ] **Step 4: Run automation tests and verify GREEN**

Run:

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
- Modify: `docs/devlog/entries/2026-08-08-buff-t1-isolated-acceptance.md`
- Modify: `docs/devlog/entries/2026-08-07-remaining-domain-isolated-acceptance.md`
- Create: ignored current-hash files under `reports/authorization/canonical/`
- Create: `reports/canonical-migration/canonical-buff-t1-acceptance.json`

- [ ] **Step 1: Run expanded validation and independent review**

Run the Task 3 and Task 4 suites, focused backend tests for
`PublicBuffServiceImpl` and `AdminBuffController`, and `git diff --check`.
Review exact fixture ownership, alias resolution, formal-target rejection,
payload equality, result semantics, and cleanup.

Run the backend consumer contract tests from `back/`:

```bash
mvn -Dtest=PublicBuffServiceImplTest,AdminBuffControllerTest,PublicBuffControllerTest test
```

- [ ] **Step 2: Verify runtime preconditions**

Require disposable databases, temporary accounts, active transactions, Buff
acceptance processes, and current dispatch permits to be zero. Require Redis
DB 7 to be empty. If it is not empty, record ownership and amend the plan to a
different empty DB; never clear unrelated keys.

- [ ] **Step 3: Generate fresh ADMIN authorization**

Generate a current-hash execution manifest, request, owner input, packet, and
one-time permit for a fresh run ID. Record manifest path, request hash,
decision identity, packet hash, Redis DB, and run ID before execution.

- [ ] **Step 4: Execute exactly one authorized run**

Dispatch only through `run-authorized-canonical-operation.mjs`. Do not reuse a
decision or invoke the child directly.

- [ ] **Step 5: Verify evidence and cleanup independently**

Require `status=passed`, `cleanupPassed=true`, snapshot verification for all
tables, probes `0/1/0`, exact Buff/item/NPC/projection counts, and full payload
readback. After process exit independently require databases, accounts,
transactions, Redis keys, Buff processes, and current dispatch permits all
equal zero.

- [ ] **Step 6: Run final validation and close devlog**

Re-run the expanded Node suite, focused backend tests, and `git diff --check`.
Resolve review findings, close the Buff child, move the parent handoff to
Biome, and retain the canonical Buff report as tracked evidence.

- [ ] **Step 7: Stage explicit B3 paths and commit**

Exclude `data/generated/wiki-town-npc-maintenance.latest.json`,
`data/generated/resume/`, and private authorization artifacts. Run
`git status --short`, `git diff --cached --stat`, and commit:

```bash
git commit -m "test(buff): add isolated T1 acceptance"
```

Do not push, merge, clean the worktree, start Biome, or authorize formal Buff
apply in this task.
