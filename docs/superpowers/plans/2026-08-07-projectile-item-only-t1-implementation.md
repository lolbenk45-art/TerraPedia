# Projectile Item-Only T1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and execute a governed two-row offline Projectile item-only T1 acceptance without writing formal databases or claiming NPC-projectile coverage.

**Architecture:** A new Projectile executor reuses `importProjectiles`, the existing landing-to-maint mapper, and maint-to-relation consolidation inside the already-proven disposable three-database acceptance harness. The fixture binds each projectile to one real formal item row. Pass evidence requires exact fixture counts and records NPC coverage as `not-covered/0`.

**Tech Stack:** Node.js ESM, `node:test`, MySQL isolated acceptance provisioner, Redis V2 authorization state, canonical operation manifests.

---

### Task 1: Freeze The Projectile Item-Only Contract

**Files:**
- Create: `scripts/data/projectile/fixtures/projectile-t1.sample.json`
- Create: `scripts/data/projectile/projectile-canonical-t1-acceptance.test.mjs`
- Create: `scripts/data/projectile/projectile-canonical-t1-acceptance.mjs`

- [ ] **Step 1: Add a failing file/contract test**

The test must require the executor module and fixture, assert exactly two records,
assert the pairs `WoodenBow -> WoodenArrowFriendly` and
`FlamingArrow -> FireArrow`, and assert `npcProjectiles=not-covered`.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test scripts/data/projectile/projectile-canonical-t1-acceptance.test.mjs
```

Expected: FAIL because the executor/fixture contract does not exist.

- [ ] **Step 3: Add the minimal fixture and exported contract helpers**

Export these interfaces:

```js
export function buildProjectileT1LandingRows({ fixture } = {}) {}
export async function seedProjectileFixtureItems(options = {}) {}
export async function seedProjectileFixtureMaintItems(options = {}) {}
export async function runProjectileCanonicalT1Acceptance(options = {}) {}
```

The fixture contains only the two approved standardized projectile records and
their item internal names. It contains no NPC facts.

- [ ] **Step 4: Run the test and verify GREEN**

Run the same focused test. Expected: contract tests pass.

### Task 2: Prove The Isolated Executor With TDD

**Files:**
- Modify: `scripts/data/projectile/projectile-canonical-t1-acceptance.test.mjs`
- Modify: `scripts/data/projectile/projectile-canonical-t1-acceptance.mjs`

- [ ] **Step 1: Add failing executor tests**

Cover these behaviors independently:

```text
reject formal/non-derived database names
copy only WoodenBow and FlamingArrow from formal local to isolated local
copy only the same two maint item rows into isolated maint
delete only fixture projectile rows from isolated local before import
clear isolated maint_projectiles before fixture maint mapping
reuse importProjectiles with exactly two records
run maint sync with scope projectiles
run relation sync against explicit isolated local/maint/relation names
require 2 relation projectiles, 2 projected projectiles, 2 exact item relations
require 0 unresolved fixture item/projectile identities
require NPC coverage not-covered and npc relation count 0
```

- [ ] **Step 2: Run tests and verify RED**

Expected: assertions fail because the executor behavior is incomplete.

- [ ] **Step 3: Implement the minimal executor**

Use the provisioner only for isolated writes and the temporary readonly account
only for exact formal item reads. Call exported `importProjectiles` directly;
do not invoke Wiki fetch/backfill or the independent-entity CLI. Build one
`projectiles_raw` landing row for the real maint mapper and pass explicit
isolated database names to `runSync`.

- [ ] **Step 4: Run tests and verify GREEN**

Expected: all Projectile executor tests pass with no warnings.

### Task 3: Register The Governed Operation

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.mjs`
- Modify: `scripts/data/automation/run-live-automation-acceptance.test.mjs`

- [ ] **Step 1: Add failing operation tests**

Freeze operation ID `canonical-projectile-t1-acceptance`, scope
`projectile-canonical`, fixture path, output report path, `databaseWrites=false`,
`isolatedResourceWrites=true`, `networkAccess=false`, and the current private
config/Redis/run identity.

- [ ] **Step 2: Run automation tests and verify RED**

Run:

```bash
node --test scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs scripts/data/automation/run-live-automation-acceptance.test.mjs
```

Expected: FAIL because the new operation and scope are not registered.

- [ ] **Step 3: Add minimal catalog, manifest, authorization, and runner routing**

Add the new T1 operation to every existing T1 allowlist, route its executor,
require the canonical report path, and pass temporary provisioner/readonly
credentials exactly as Recipe and Boss T1 do.

- [ ] **Step 4: Run automation tests and verify GREEN**

Expected: all focused automation tests pass.

### Task 4: Review And Build Fresh ADMIN Authorization

**Files:**
- Create: current-hash files under `reports/authorization/canonical/`
- Modify: `docs/devlog/entries/2026-08-07-projectile-item-only-t1-acceptance.md`

- [ ] **Step 1: Run the expanded focused suite and `git diff --check`**
- [ ] **Step 2: Review fixture/source ownership, formal target rejection, output semantics, and cleanup flow**
- [ ] **Step 3: Generate a fresh execution manifest for Redis DB 6 and a new run ID**
- [ ] **Step 4: Generate request, owner input, packet, and one-time ADMIN permit from the reviewed current hash**
- [ ] **Step 5: Record identities in devlog before execution**

Do not reuse Boss decisions or generate authorization before focused tests and
review pass.

### Task 5: Execute, Verify Cleanup, And Commit

**Files:**
- Create: `reports/canonical-migration/canonical-projectile-t1-acceptance.json`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-08-07-projectile-item-only-t1-acceptance.md`
- Modify: `docs/devlog/entries/2026-08-07-remaining-domain-isolated-acceptance.md`

- [ ] **Step 1: Execute the one-time authorized operation**
- [ ] **Step 2: Confirm status passed, cleanupPassed true, snapshot verification, probes 0/1/0, exact fixture counts, and NPC not-covered/0**
- [ ] **Step 3: Independently verify disposable databases, accounts, Redis DB 6 keys, and Projectile acceptance processes are zero**
- [ ] **Step 4: Re-run focused tests and `git diff --check`**
- [ ] **Step 5: Review all changes and close the child devlog**
- [ ] **Step 6: Stage explicit Batch 2 paths only; exclude Town NPC data and `data/generated/resume/`**
- [ ] **Step 7: Commit with `test(projectile): add isolated item-only T1 acceptance`**

Do not push, merge, clean the worktree, start Buff, or authorize a formal
Projectile apply in this task.
