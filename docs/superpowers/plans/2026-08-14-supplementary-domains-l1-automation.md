# Supplementary Domains L1 Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Shimmer, Audio, and Bosses complete monitor-visible changed-only previews and Owner-approved `L1/ACTIVE` database applies without enabling L2 or Boss loot automation.

**Architecture:** Extend the existing V2 scheduler eligibility source, then add a shared immutable L1 bundle/execution contract with one domain adapter per importer. Scheduler work ends at frozen preview; a single-use canonical Owner approval executes the frozen plan through the existing transaction, policy, mutation-generation, and audit fences.

**Tech Stack:** Java 17/Spring Boot/JUnit 5, Node.js ESM/`node:test`, MySQL/InnoDB, Redis-backed Crawler V2, canonical authorization JSON contracts.

---

## Scope And Source Chain

Authoritative chain:

```text
wiki source change
  -> V2 changed-only scheduler
  -> domain source crawler with canonical progress
  -> immutable L1 preview bundle
  -> REQUIRES_OWNER_L1 decision
  -> one-use APPROVED_OWNER_L1 authorization
  -> domain-owned DB adapter
  -> mutation generation + apply/audit/result rows
  -> DB count and monitor terminal readback
```

Owned apply scopes:

- Shimmer: the four existing Shimmer transform/decraft tables only.
- Audio: `audio_assets` and its existing link table only.
- Bosses: existing Boss group/member base-data scope only; no Boss loot tables.

Execution rule: if implementation discovers a missing importer seam, table
ownership mismatch, progress gap, or authorization gap, patch this plan, rerun
the affected plan-audit gates, and continue toward this same goal. Do not stop
at a source-only or preview-only result and call the task complete.

### Task 1: Reopen Traceability And Lock The Baseline

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-08-13-supplementary-domains-readiness-handoff.md`

- [ ] **Step 1: Reopen the existing devlog entry**

Change its single `## Status` value from `closed` to `active`, replace the stale
pending SHA with `6b8d3083`, and record this plan plus the confirmed
`L1/ACTIVE`, no-Boss-loot boundary. Keep `docs/devlog/current.md` pointed at the
same entry with owner, branch, worktree, dependencies, and contract handoff.

- [ ] **Step 2: Record the current eligibility and writer baseline**

Record that the current allowlist has five domains, the three target actions
still end at source work, the worktree is clean except this task, and no active
writer owns the target progress/output families. Do not expand eligibility in
this checkpoint: eligibility and safe preview commands must land atomically in
Task 6.

- [ ] **Step 3: Commit the traceability checkpoint**

```bash
git add docs/devlog/current.md docs/devlog/entries/2026-08-13-supplementary-domains-readiness-handoff.md docs/superpowers/plans/2026-08-14-supplementary-domains-l1-automation.md
git commit -m "docs(devlog): reopen supplementary L1 automation"
```

### Task 2: Shared Immutable L1 Bundle Contract

**Files:**
- Create: `scripts/data/automation/supplementary-domain-l1-contract.mjs`
- Create: `scripts/data/automation/supplementary-domain-l1-contract.test.mjs`

- [ ] **Step 1: Write failing bundle identity tests**

Cover exact accepted domains, `L1/ACTIVE`, `APPROVED_OWNER_L1`, content hashes,
owned tables, source paths inside the repository, baseline fingerprint, logical
diff hash, and rejection of Boss loot ownership.

The expected API is:

```js
const bundle = buildSupplementaryL1Bundle({
  operationId: 'automation-audio-first-l1',
  runId: 'audio_l1_20260814_01',
  domainId: 'audio',
  generatedAt: '2026-08-14T06:00:00.000Z',
  policy: { level: 'L1', operationalState: 'ACTIVE', policyVersion: 1,
    policyHash: HASH_A, policySetHash: HASH_B },
  baseline: { environmentId: 'local', mutationGeneration: 4, projectionHash: HASH_C },
  source: { path: 'data/terraPedia/generated/wiki-audio-assets.latest.json', sha256: HASH_D },
  ownedTables: [{ databaseRole: 'local', table: 'audio_assets' }],
  importPlan: { assets: [{ assetId: 'item-1' }], links: [] },
});
assert.equal(validateSupplementaryL1Bundle(bundle), true);
```

- [ ] **Step 2: Run the contract test and verify RED**

```bash
node --test scripts/data/automation/supplementary-domain-l1-contract.test.mjs
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement canonical hashing and validation**

Export:

```js
export const SUPPLEMENTARY_L1_DOMAINS = Object.freeze(['audio', 'bosses', 'shimmer']);
export function buildSupplementaryL1Bundle(input) { /* canonical immutable body + bundleHash */ }
export function validateSupplementaryL1Bundle(value) { /* fail closed and return true */ }
export function assertSupplementaryOwnedTables(domainId, ownedTables) { /* exact allowlist */ }
```

Use stable key-order JSON hashing. Reject mutable source paths, path traversal,
non-L1 policies, and any table outside the exact domain allowlist.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run the Task 2 command. Expected: PASS.

- [ ] **Step 5: Commit the contract checkpoint**

```bash
git add scripts/data/automation/supplementary-domain-l1-contract.mjs scripts/data/automation/supplementary-domain-l1-contract.test.mjs
git commit -m "feat(automation): define supplementary L1 bundle contract"
```

### Task 3: Make Importers Transaction-Injectable

**Files:**
- Modify: `scripts/data/import/import-wiki-audio-assets-to-db.mjs`
- Modify: `scripts/data/import/import-wiki-audio-assets-to-db.test.mjs`
- Modify: `scripts/data/import/import-wiki-bosses-to-db.mjs`
- Modify: `scripts/data/import/import-wiki-bosses-to-db.test.mjs`
- Modify: `scripts/data/import/import-wiki-shimmer-to-db.mjs`
- Modify: `scripts/data/import/import-wiki-shimmer-to-db.test.mjs`

- [ ] **Step 1: Write failing external-transaction tests**

For each importer, inject a fake connection and assert it does not create,
commit, rollback, or end its own connection when `transactionOwner:'caller'`.
Assert the caller receives the exact summary needed for L1 audit rows.

Expected APIs:

```js
await runAudioAssetImport(options, { connection, transactionOwner: 'caller' });
await runBossImport(options, { connection, transactionOwner: 'caller', imageUploader: null });
await runShimmerImport(options, { connection, transactionOwner: 'caller' });
```

Boss tests must prove `offline:true` and injected `imageUploader:null` prevent
network access and that Boss loot tables are never queried.

- [ ] **Step 2: Run importer tests and verify RED**

```bash
node --test scripts/data/import/import-wiki-audio-assets-to-db.test.mjs scripts/data/import/import-wiki-bosses-to-db.test.mjs scripts/data/import/import-wiki-shimmer-to-db.test.mjs
```

Expected: FAIL because Boss has no exported `runBossImport` and the importers do
not consistently honor caller-owned transactions.

- [ ] **Step 3: Extract minimal caller-owned transaction seams**

Keep existing CLI defaults unchanged. When the caller owns the transaction:

```js
const connection = dependencies.connection;
const ownsTransaction = dependencies.transactionOwner !== 'caller';
if (ownsTransaction) await connection.beginTransaction();
try {
  const summary = await applyWithConnection(connection, frozenInput);
  if (ownsTransaction) await connection.commit();
  return summary;
} catch (error) {
  if (ownsTransaction) await connection.rollback();
  throw error;
} finally {
  if (ownsTransaction) await connection.end();
}
```

Export `runBossImport`; preserve direct CLI behavior. In caller-owned offline
L1 mode, require `generatedNpcMapDirty === false` before commit and reject the
run if the importer would write `npc-standardized-map.json`; no filesystem
write may occur after the L1 database transaction commits.

- [ ] **Step 4: Run importer tests and verify GREEN**

Run the Task 3 command. Expected: PASS.

- [ ] **Step 5: Commit the importer seam checkpoint**

```bash
git add scripts/data/import/import-wiki-audio-assets-to-db.mjs scripts/data/import/import-wiki-audio-assets-to-db.test.mjs scripts/data/import/import-wiki-bosses-to-db.mjs scripts/data/import/import-wiki-bosses-to-db.test.mjs scripts/data/import/import-wiki-shimmer-to-db.mjs scripts/data/import/import-wiki-shimmer-to-db.test.mjs
git commit -m "refactor(data): expose governed supplementary import adapters"
```

### Task 4: Build Preview And Approved Apply Runner

**Files:**
- Create: `scripts/data/automation/run-supplementary-domain-l1-operation.mjs`
- Create: `scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs`
- Create: `scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs`
- Create: `scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs`

- [ ] **Step 1: Write failing preview/progress tests**

For all three domains, prove the preview orchestrator:

- writes `running` before invoking the source runner;
- preserves stable action IDs and canonical progress paths;
- writes heartbeat/current/total during source and bundle phases;
- freezes a content-addressed source copy and bundle;
- ends `completed` with `outputPath` and `reportPath`, or `failed` atomically.

- [ ] **Step 2: Run preview tests and verify RED**

```bash
node --test scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement preview orchestration**

Map exact domain contracts:

```js
const DOMAIN_CONFIG = Object.freeze({
  shimmer: { actionId: 'domain-source-shimmer', progressPath: 'data/generated/domain-source-shimmer-progress.latest.json' },
  audio: { actionId: 'wiki-audio-assets-refresh', progressPath: 'data/generated/wiki-audio-assets-progress.latest.json' },
  bosses: { actionId: 'domain-source-bosses', progressPath: 'data/generated/domain-source-bosses-progress.latest.json' },
});
```

Use `writeJsonFile`/`buildActionProgressPayload`; do not scan arbitrary reports
or consume `*.tmp` files.

- [ ] **Step 4: Run preview tests and verify GREEN**

Run the Task 4 preview command. Expected: PASS.

- [ ] **Step 5: Write failing approved-apply tests**

Prove exact policy/baseline/bundle/approval identity checks, a single caller-
owned transaction, run/evidence/apply/mutation rows, one-time approval
consumption, rollback on drift, and no retry after ambiguous failure.

- [ ] **Step 6: Run apply tests and verify RED**

```bash
node --test scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs
```

Expected: FAIL with module-not-found or missing executor.

- [ ] **Step 7: Implement the shared executor and three adapters**

Dispatch only by validated `domainId`, inject the caller-owned connection into
the Task 3 importer, persist `AUTHORIZED_L1`/`APPROVED_OWNER_L1` records, advance
only the declared mutation generations, and commit once.

- [ ] **Step 8: Run both Task 4 suites and verify GREEN**

Expected: PASS with no network or formal DB use in tests.

- [ ] **Step 9: Commit the runner checkpoint**

```bash
git add scripts/data/automation/prepare-supplementary-domain-l1-preview.mjs scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs scripts/data/automation/run-supplementary-domain-l1-operation.mjs scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs
git commit -m "feat(automation): execute approved supplementary L1 imports"
```

### Task 5: Register Canonical Policy And Apply Operations

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Modify: `scripts/data/automation/run-automation-policy-decision.mjs`
- Modify: `scripts/data/automation/run-automation-policy-decision.test.mjs`

- [ ] **Step 1: Write failing operation catalog and policy tests**

Add exact IDs for each domain:

```text
automation-shimmer-l0-bootstrap
automation-shimmer-l1-policy-promotion
automation-shimmer-first-l1
automation-audio-l0-bootstrap
automation-audio-l1-policy-promotion
automation-audio-first-l1
automation-bosses-l0-bootstrap
automation-bosses-l1-policy-promotion
automation-bosses-first-l1
```

Assert promotions accept only `L0/DISABLED|SHADOW` and produce
`L1/ACTIVE`; no L2 operation exists for these domains.

- [ ] **Step 2: Run canonical tests and verify RED**

```bash
node --test scripts/data/automation/run-automation-policy-decision.test.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs
```

Expected: FAIL for unsupported operation IDs.

- [ ] **Step 3: Add catalog paths and manifest definitions**

Map L0 bootstrap to `bootstrap-automation-policy.mjs`, promotion to
`run-automation-policy-decision.mjs`, and first L1 to
`run-supplementary-domain-l1-operation.mjs`. Bind each operation to its exact
input/bundle/result paths under `reports/authorization/canonical/`.

- [ ] **Step 4: Generalize policy decision definitions by exact operation map**

Do not infer arbitrary domains from strings. Use a frozen allowlist mapping each
new promotion operation to its exact `domainId`, current state, and target
`L1/ACTIVE` state.

- [ ] **Step 5: Run canonical tests and verify GREEN**

Run the Task 5 command. Expected: PASS.

- [ ] **Step 6: Commit the governance checkpoint**

```bash
git add scripts/data/automation/canonical-operation-catalog.mjs scripts/data/automation/canonical-operation-execution-manifest.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs scripts/data/automation/run-automation-policy-decision.mjs scripts/data/automation/run-automation-policy-decision.test.mjs
git commit -m "feat(automation): govern supplementary L1 operations"
```

### Task 6: Wire Scheduler Preview Commands And Preflight

**Files:**
- Modify: `back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`
- Modify: `back/src/test/java/com/terraria/skills/service/impl/CrawlerV2SchedulerActivationPreflightServiceImplTest.java`
- Modify: `scripts/data/automation/crawler-v2-scheduler-activation-preflight.test.mjs`
- Modify: `scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs`

- [ ] **Step 1: Write failing default-command and preflight tests**

Assert the three default operations invoke
`prepare-supplementary-domain-l1-preview.mjs` with `--domain=shimmer`,
`--domain=audio`, or `--domain=bosses` and their exact progress paths. Assert
preflight returns the three action IDs, passing readiness evidence, and excludes
Boss loot. Add the exact final eligibility assertion:

```java
assertEquals(
    Set.of("items", "npcs", "projectiles", "armor_sets", "buffs",
        "shimmer", "audio", "bosses"),
    CrawlerMonitorActionRegistry.AUTO_DISPATCH_DOMAINS
);
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest,CrawlerV2SchedulerActivationPreflightServiceImplTest test
cd .. && node --test scripts/data/automation/crawler-v2-scheduler-activation-preflight.test.mjs scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs
```

Expected: FAIL because current commands end after source generation and the
three domains are absent from the old eligible preflight set.

- [ ] **Step 3: Replace commands and expand eligibility atomically**

Keep stable action IDs, domains, source keys, progress paths, resume semantics,
and queue identity. Change command ownership to the preview orchestrator, then
add exactly `shimmer`, `audio`, and `bosses` to `AUTO_DISPATCH_DOMAINS`. Do not
add `boss_loot`, `npc_loot`, or manual apply actions.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 6 commands. Expected: PASS.

- [ ] **Step 5: Commit the scheduler checkpoint**

```bash
git add back/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java back/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java back/src/test/java/com/terraria/skills/service/impl/CrawlerV2SchedulerActivationPreflightServiceImplTest.java scripts/data/automation/crawler-v2-scheduler-activation-preflight.test.mjs scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs
git commit -m "feat(crawler): schedule supplementary L1 previews"
```

### Task 7: Integrated Validation And Formal L1 Acceptance

**Files:**
- Modify: `docs/devlog/entries/2026-08-13-supplementary-domains-readiness-handoff.md`
- Modify: `docs/devlog/current.md`
- Generate only exact authorization/result artifacts named by the canonical runners.

- [ ] **Step 1: Check runtime and writer safety**

Run `git status --short`, inspect active crawler/backend-refresh processes, and
confirm no process owns the three progress/output families. Start the standard
stack only through `bash ./scripts/dev/start-local-stack.sh` if required.

- [ ] **Step 2: Run the complete focused static gate**

```bash
node --test scripts/data/automation/supplementary-domain-l1-contract.test.mjs scripts/data/automation/prepare-supplementary-domain-l1-preview.test.mjs scripts/data/automation/run-supplementary-domain-l1-operation.test.mjs scripts/data/automation/run-automation-policy-decision.test.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs scripts/data/automation/crawler-v2-scheduler-activation-preflight.test.mjs scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs scripts/data/import/import-wiki-audio-assets-to-db.test.mjs scripts/data/import/import-wiki-bosses-to-db.test.mjs scripts/data/import/import-wiki-shimmer-to-db.test.mjs
cd back && mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest,CrawlerV2SchedulerActivationPreflightServiceImplTest,AdminCrawlerMonitorControllerTest test
```

Expected: all PASS.

- [ ] **Step 3: Generate one real preview per domain**

Run the three preview operations serially, never in parallel, with DB port
`13306`. Verify each canonical progress heartbeat, content-addressed bundle,
decision state, and source report before continuing.

- [ ] **Step 4: Bootstrap/promote each domain to L1/ACTIVE**

For each exact L0 and L1 policy operation, create a canonical request, populate
the Owner fields from the configured active Owner identity with reason
`Enable approved L1 supplementary-domain ingestion`, authorize it, and run it
through `run-authorized-canonical-operation.mjs`. Never edit policy tables
directly.

- [ ] **Step 5: Execute one approved first-L1 apply per domain**

Create and authorize `automation-shimmer-first-l1`,
`automation-audio-first-l1`, and `automation-bosses-first-l1` packets from the
exact frozen bundles. Execute serially. After each run, verify terminal
`COMMITTED`, consumed approval, apply audit row, and mutation generation.

- [ ] **Step 6: Regenerate and authorize scheduler activation**

Disable changed-only automation through the authenticated API if preflight
requires it, prove zero live attempts/claims, generate fresh preflight/proposal/
request, authorize exact eligible set, execute the canonical scheduler
activation, and verify readback includes the three new action IDs. Do not run a
manual sweep as activation evidence.

- [ ] **Step 7: Prove data-visible closure**

Read back:

- Shimmer four-table counts and generation identity;
- Audio `audio_assets` count plus link count;
- Boss group/member counts and exact source generation;
- all three policies as `L1/ACTIVE`;
- all three progress files terminal and monitor-visible;
- no Boss loot table mutation in the run window.

- [ ] **Step 8: Run final broad gate and diff checks**

```bash
bash ./scripts/dev/quality-gate.sh
git diff --check
git status --short
```

If the broad gate has an unrelated baseline failure, record the exact command,
failure, and focused passing evidence; do not weaken tests.

- [ ] **Step 9: Close devlog and commit exact scope**

Record results, validation, residual risks, generated artifacts intentionally
included/excluded, and no L2/Boss-loot change. Run `git status --short` and
`git diff --cached --stat`, stage explicit paths only, then commit with:

```bash
git commit -m "feat(automation): enable supplementary domain L1 ingestion"
```

Keep the branch open and pushed for review; do not merge or delete the worktree
without a separate owner decision.
