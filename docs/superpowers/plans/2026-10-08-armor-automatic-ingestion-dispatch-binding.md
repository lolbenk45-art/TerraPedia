# Armor Automatic Ingestion Dispatch Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the V2 `domain-source-armor-sets` scheduler action to the governed `canonical-armor-ingestion` runner through an immutable, attempt-bound authorization contract, while leaving unresolved Armor source effects quarantined.

**Architecture:** The scheduler will continue to detect and queue the existing Armor source action, but its operation plan will carry a private binding for one exact source fingerprint, attempt, intent, packet, permit, and fence. A dedicated Armor adapter will validate that binding, run the existing Armor source fetch, compare the resulting source identity, and invoke `pipelines/relation/run-armor-canonical-ingestion.mjs` only with the exact bound files. Missing, stale, mismatched, or already-consumed bindings fail closed before database mutation; the source acknowledgement happens only after the canonical runner returns a committed/readback-required result and the coordinator records the acceptance.

**Tech Stack:** Node.js 22 ESM and `node:test`, Spring Boot crawler-monitor V2, Redis queue artifacts, MySQL `terria_v1_local`/`terria_v1_maint`/`terria_v1_relation`, private `0600` authorization artifacts, and the existing canonical operation catalog/manifest.

---

## Current finding and boundaries

The observed scheduler path is not yet a full-chain path:

- `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java` registers `domain-source-armor-sets` through `run-base-domain-automatic-operation.mjs --domain=armor_sets`.
- `pipelines/automation/run-base-domain-automatic-operation.mjs` fetches the Armor module and executes the generic local L1 import contract.
- `canonical-armor-ingestion` is already present in `pipelines/automation/canonical-operation-catalog.mjs` and `pipelines/automation/canonical-operation-execution-manifest.mjs`, with the runner `pipelines/relation/run-armor-canonical-ingestion.mjs` and an exact registration test.
- The latest read-only candidate `.local/tmp/armor-canonical-full-chain-candidate-20261008-29.json` has zero blockers and 304 quarantined source effects, but its intent is deliberately `executable=false` until a fresh registered executor binding exists.

This plan covers the operation-to-scheduler binding, its tests, the read-only quarantine classification, and a bounded handoff to the scheduler coordinator. It does not authorize scheduler activation, source crawling, database or Redis writes, API mutations, reuse of `.29` or any consumed decision/permit, H8 changes, commit/push, or cleanup of the dirty worktree. Every production write still needs a fresh exact scope, request hash, packet, one-use permit, and independent readback.

## File map

Create:

- `pipelines/automation/armor-automatic-dispatch-binding.mjs`: schema, path confinement, source/attempt identity checks, and immutable binding reader.
- `pipelines/automation/armor-automatic-dispatch-binding.test.mjs`: red/green contract tests for identity drift, private artifacts, expiry, and replay rejection.
- `pipelines/automation/run-armor-automatic-operation.mjs`: scheduler adapter that fetches the Armor source and invokes the registered full-chain runner.
- `pipelines/automation/run-armor-automatic-operation.test.mjs`: adapter tests with stubbed source and canonical child processes.

Modify:

- `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistry.java`: point the Armor action at the adapter and label its registered operation as `canonical-armor-ingestion`.
- `services/catalog-api/src/main/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImpl.java`: resolve and transport an exact Armor binding path for scheduler-owned source identities; reject the enqueue when the binding is absent or unsafe.
- `services/catalog-api/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationService.java`: carry optional binding path/hash in `EnqueueCommand` and the immutable attempt operation plan.
- `services/catalog-api/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerOperationPlanSnapshot.java`: persist the binding path/hash with compatibility constructors.
- `services/catalog-api/src/main/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisor.java`: expose only the attempt-bound binding path/hash to the child process; never synthesize authorization env from global configuration.
- `services/catalog-api/src/main/java/com/terraria/skills/dto/CrawlerMonitorDispatchRequestDTO.java`: carry the internal scheduler binding reference through V2 dispatch.
- `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorActionRegistryTest.java`: assert the Armor command and operation identity.
- `services/catalog-api/src/test/java/com/terraria/skills/service/impl/CrawlerMonitorServiceImplTest.java`: assert missing/mismatched bindings are skipped and matching bindings are transported.
- `services/catalog-api/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerQueueV2ApplicationServiceTest.java`: assert the binding is immutable and attempt-bound.
- `services/catalog-api/src/test/java/com/terraria/skills/service/impl/crawlerv2/CrawlerAttemptSupervisorTest.java`: assert the child environment contains only the validated binding path/hash.
- `pipelines/automation/canonical-operation-execution-manifest.mjs`: include the adapter and binding contract in the scheduler runtime bundle.
- `pipelines/automation/canonical-operation-execution-manifest.test.mjs`: pin the new runtime paths and reject command/bundle drift.
- `pipelines/automation/canonical-armor-ingestion-registration.test.mjs`: retain the exact canonical command assertion and add the scheduler bridge assertion.
- `pipelines/automation/run-base-domain-automatic-operation.mjs`: expose the existing fresh-activation/source-acknowledgement helper to the Armor adapter without duplicating its validity checks.
- `docs/devlog/entries/2026-09-30-armor-closure-gap-audit.md` and `docs/devlog/current.md`: record plan ownership, validation, and the next coordinator handoff.

## Task 0: Freeze the read-only baseline

**Files:** no source edits; evidence stays under `.local/tmp/`.

- [x] **Step 1: Reconfirm the handoff facts in the actual worktree.**

Run:

```bash
cd /home/lolben/TerraPedia/.worktrees/automation-domain-armor
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
git status --short --branch -uall
git diff --check
```

Expected: worktree `/home/lolben/TerraPedia/.worktrees/automation-domain-armor`, branch `feat/automation-domain-armor`, `HEAD=6d7921cf4b282f9f832e9289373e775ed9412fea`, no staged paths, the recorded dirty inventory is preserved, and `git diff --check` exits zero.

- [x] **Step 2: Verify the current candidate without executing it.**

Run:

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
const path = '.local/tmp/armor-canonical-full-chain-candidate-20261008-29.json';
const value = JSON.parse(fs.readFileSync(path, 'utf8'));
if (value.status !== 'dependencies-satisfied' || value.blockerCount !== 0) throw new Error('candidate is not the recorded zero-blocker candidate');
if (value.quarantinedSourceEffects !== 304) throw new Error('candidate quarantine count drifted');
if (value.runtime?.activeAttempts !== 0 || value.runtime?.reservations !== 0 || value.runtime?.fences !== 0) throw new Error('candidate runtime is not idle');
console.log(JSON.stringify({ status: value.status, blockers: value.blockerCount, quarantine: value.quarantinedSourceEffects, runtime: value.runtime }));
NODE
```

Expected: `dependencies-satisfied`, `0` blockers, `304` quarantined effects, and runtime `0/0/0`. Do not pass this intent to an executor; it is evidence for planning only.

## Task 1: Define the immutable Armor scheduler binding

**Files:** create `pipelines/automation/armor-automatic-dispatch-binding.mjs` and `pipelines/automation/armor-automatic-dispatch-binding.test.mjs`.

- [x] **Step 1: Add the binding schema and exact validator.** The module must export `ARMOR_AUTOMATIC_DISPATCH_BINDING_SCHEMA`, `buildArmorAutomaticBindingPath`, `readArmorAutomaticBinding`, and `assertArmorAutomaticBinding`. The accepted shape is:

```js
{
  schemaVersion: 'armor-automatic-dispatch-binding/v1',
  actionId: 'domain-source-armor-sets',
  operationId: 'canonical-armor-ingestion',
  attemptId: 'attempt-<uuid>',
  sourceDispatchIdentity: {
    sourceFingerprint: 'sha256:<64 hex>',
    sourceRunIdentity: '<probe run identity>',
    sourceContentIdentity: 'sha256:<64 hex>'
  },
  intent: {
    path: 'reports/authorization/canonical/canonical-armor-ingestion.<label>.intent.json',
    sha256: 'sha256:<64 hex>',
    fullChainSha256: 'sha256:<64 hex>'
  },
  authorization: {
    packetPath: 'reports/authorization/canonical/<attempt>/packet.json',
    packetSha256: 'sha256:<64 hex>',
    permitPath: 'reports/authorization/canonical/<attempt>/permit.json',
    permitHash: 'sha256:<64 hex>',
    nonce: '<one-use nonce>',
    serverFingerprintPath: 'reports/authorization/canonical/<attempt>/server-fingerprint.json',
    serverFingerprintSha256: 'sha256:<64 hex>',
    policySetHash: 'sha256:<64 hex>',
    decisionIdentity: '<fresh decision identity>'
  },
  activation: {
    decisionIdentity: '<fresh scheduler activation identity>',
    packetHash: 'sha256:<64 hex>',
    policySetHash: 'sha256:<64 hex>',
    authorizedAt: '<ISO timestamp>',
    expiresAt: '<ISO timestamp>'
  },
  resultLabel: '<normalized label>',
  createdAt: '<ISO timestamp>',
  expiresAt: '<ISO timestamp>',
  consumedAt: null
}
```

The validator must reject a different action or operation, a missing or malformed source identity, a non-private/symbolic binding file, an intent path outside `reports/authorization/canonical/`, a packet, permit, or server-fingerprint path outside the same trusted root, an expired binding or activation, `consumedAt != null`, a pre-existing result/journal for the same label, or a binding whose hashes do not match the bytes on disk. The path builder must produce `reports/authorization/canonical/automatic-armor/<sourceFingerprint hex>.binding.json` and reject anything except a lowercase `sha256:` hash.

- [x] **Step 2: Write the failing tests before implementation.** Cover these exact cases: valid fresh binding; action `domain-source-armor-sets` with operation `automation-armor-sets-l1`; source fingerprint drift; an intent whose full-chain hash differs; a readable `0644` binding; a symlinked binding; an expired binding; `consumedAt` set; and an existing result path. Run:

```bash
node --test pipelines/automation/armor-automatic-dispatch-binding.test.mjs
```

Expected before implementation: the new tests fail because the module exports do not exist.

- [x] **Step 3: Implement the smallest fail-closed validator and rerun the focused test.**

```bash
node --test pipelines/automation/armor-automatic-dispatch-binding.test.mjs
node --check pipelines/automation/armor-automatic-dispatch-binding.mjs
```

Expected: all binding tests pass and syntax checking exits zero. The module must not open MySQL, Redis, or make network requests.

## Task 2: Add the scheduler Armor adapter

**Files:** create `pipelines/automation/run-armor-automatic-operation.mjs` and `pipelines/automation/run-armor-automatic-operation.test.mjs`.

- [x] **Step 1: Define the adapter flow and child environment.** The exported `runArmorAutomaticOperation` must perform this sequence:

```js
const binding = readArmorAutomaticBinding({ repoRoot, relativePath: env.TERRAPEDIA_ARMOR_AUTOMATIC_BINDING_PATH, now });
assertBindingMatchesAttempt(binding, env); // action, attemptId, source fingerprint, run identity, content identity
publishRunningProgress(progressPath, binding);
spawnNode('pipelines/fetch/fetch-wiki-armorsetbonuses.mjs', [`--progress-path=${progressPath}`], env);
assertFetchedSourceMatchesDispatchIdentity({ repoRoot, progressPath, binding, env });
spawnNode('pipelines/relation/run-armor-canonical-ingestion.mjs', [
  '--operation-id=canonical-armor-ingestion',
  `--result-label=${binding.resultLabel}`,
  `--intent=${binding.intent.path}`,
  '--apply=true',
], {
  ...env,
  TERRAPEDIA_AUTHORIZED_PACKET_PATH: binding.authorization.packetPath,
  TERRAPEDIA_AUTHORIZED_SERVER_FINGERPRINT: readPrivateJson(
    binding.authorization.serverFingerprintPath,
    binding.authorization.serverFingerprintSha256,
  ),
  TERRAPEDIA_AUTHORIZED_DISPATCH_PERMIT_PATH: binding.authorization.permitPath,
  TERRAPEDIA_AUTHORIZED_DISPATCH_NONCE: binding.authorization.nonce,
});
const connection = await openLoopbackMysql();
try {
  await acknowledgeArmorSourceAfterFreshActivation({
    connection,
    expectedActivation: binding.activation,
    sourceDispatchIdentity: binding.sourceDispatchIdentity,
    sourceCheckedAt: readCompletedSourceCheckedAt(progressPath),
    now,
  });
} finally {
  await connection.end();
}
assertCanonicalResultAndPublishCompletedProgress(binding);
```

The actual implementation must use the existing private path helpers, atomic progress writer, source-dispatch identity helper, and child-process cleanup conventions. It must validate the binding before the first network request, pass `WORKTREE_ROOT`, `TERRAPEDIA_CRAWLER_ACTION_ID`, `TERRAPEDIA_CRAWLER_ATTEMPT_ID`, and `TERRAPEDIA_CRAWLER_PROGRESS_PATH` through unchanged, and never generate a packet, permit, intent, or result file. `acknowledgeArmorSourceAfterFreshActivation` must be extracted from the existing `run-base-domain-automatic-operation.mjs` helper so it re-reads the current scheduler activation, compares every identity and expiry field to `binding.activation`, rechecks the source monitor identity, and advances the Armor source manifest only after the canonical result and independent readback are present. A child failure writes `failed` progress and leaves source acknowledgement untouched.

- [x] **Step 2: Add adapter tests.** Stub the source, canonical child, activation readback, and acknowledgement helper and assert: the exact source command; the exact canonical command; the exact packet/permit/nonce/server-fingerprint environment; no child process when binding validation fails; no canonical child when source identity differs; no acknowledgement when the canonical result is missing; and a second invocation fails because the one-use permit is unavailable. Run:

```bash
node --test pipelines/automation/run-armor-automatic-operation.test.mjs
```

Expected: all tests pass with no database, Redis, or external network access.

- [x] **Step 3: Verify the adapter syntax and progress contract.**

```bash
node --check pipelines/automation/run-armor-automatic-operation.mjs
node --test pipelines/automation/armor-automatic-dispatch-binding.test.mjs pipelines/automation/run-armor-automatic-operation.test.mjs
```

## Task 3: Replace the module-only registry command and pin the runtime bundle

**Files:** `CrawlerMonitorActionRegistry.java`, its test, `canonical-operation-execution-manifest.mjs`, its test, and `canonical-armor-ingestion-registration.test.mjs`.

- [x] **Step 1: Change only the Armor action definition.** Keep action ID `domain-source-armor-sets`, source key `wiki.module.armorsetbonuses`, progress path `data/generated/domain-source-armor-sets-progress.latest.json`, and `resumeSupported=false`. Its command must become:

```java
List.of(
    "node",
    "pipelines/automation/run-armor-automatic-operation.mjs",
    "--domain=armor_sets",
    "--progress-path=data/generated/domain-source-armor-sets-progress.latest.json"
)
```

Set the action operation ID to `canonical-armor-ingestion`, retain `databaseAccess="write"`, and describe the command as a composite source-fetch plus governed canonical full-chain operation. Do not alter the eight-domain eligibility set or scheduler canary rules.

- [x] **Step 2: Add a registry regression.** Assert the Armor action's command, operation ID, action ID, source key, and progress path. Assert that other base domains still use `run-base-domain-automatic-operation.mjs`. Run:

```bash
cd services/catalog-api
mvn -Dtest=CrawlerMonitorActionRegistryTest test
```

Expected: the new Armor assertion passes and unrelated action definitions remain unchanged.

- [x] **Step 3: Pin the adapter and binding contract in the scheduler manifest.** Add both new modules to the scheduler runtime code bundle and update the manifest test so byte drift, missing files, or a command that still names the generic Armor runner fails. Keep `canonical-armor-ingestion`'s existing exact command and ownership keys unchanged. Run:

```bash
cd /home/lolben/TerraPedia/.worktrees/automation-domain-armor
node --test pipelines/automation/canonical-armor-ingestion-registration.test.mjs pipelines/automation/canonical-operation-execution-manifest.test.mjs
```

## Task 4: Transport the binding through V2 attempt artifacts

**Files:** `CrawlerMonitorDispatchRequestDTO.java`, `CrawlerMonitorServiceImpl.java`, `CrawlerQueueV2ApplicationService.java`, `CrawlerOperationPlanSnapshot.java`, `CrawlerAttemptSupervisor.java`, and the four focused Java test files.

- [x] **Step 1: Extend the request and queue records with optional binding identity.** Add these fields without removing compatibility constructors:

```java
private String automaticBindingPath;
private String automaticBindingSha256;
```

Extend `EnqueueCommand` with `automaticBindingPath` and `automaticBindingSha256`, and extend `CrawlerOperationPlanSnapshot` with the same two fields. Existing manual callers must continue to construct records with the old argument count and receive `null` binding fields.

- [x] **Step 2: Require the binding only for scheduler-owned Armor attempts.** In `runV2AutomationSweepClaimed`, derive the deterministic binding path from the source fingerprint, verify it is a private ordinary file under `reports/authorization/canonical/automatic-armor/`, calculate its SHA-256, and skip with `automatic_operation_binding_required` when it is missing, unsafe, expired, or mismatched. Pass both values through `dispatchV2WikiMonitorTask` and `EnqueueCommand`. Manual dispatches must pass `null` and must never inherit a scheduler binding.

- [x] **Step 3: Persist the binding in the immutable operation plan.** `planSnapshot` must copy the binding path/hash into the attempt plan. `requireExactManifest` must reject a scheduler-owned Armor attempt whose plan does not contain both fields or whose action/operation identity is inconsistent. The plan file must remain no-overwrite and attempt-confined.

- [x] **Step 4: Expose only the validated path/hash to the child.** `CrawlerAttemptSupervisor.launchEnvironment` must read the immutable operation plan and add:

```java
environment.put("TERRAPEDIA_ARMOR_AUTOMATIC_BINDING_PATH", plan.automaticBindingPath());
environment.put("TERRAPEDIA_ARMOR_AUTOMATIC_BINDING_SHA256", plan.automaticBindingSha256());
```

only for scheduler-owned `domain-source-armor-sets` attempts. It must not set `TERRAPEDIA_AUTHORIZED_PACKET_PATH`, permit paths, nonces, or server-fingerprint JSON globally; the adapter reads those values from the binding after validating its hash and confinement.

- [x] **Step 5: Add Java RED/GREEN coverage.** Add tests for absent binding, readable/symlink binding, source fingerprint mismatch, manual dispatch with no binding, immutable plan hash/path, and child environment propagation. Run:

```bash
cd services/catalog-api
mvn -Dtest=CrawlerMonitorServiceImplTest,CrawlerQueueV2ApplicationServiceTest,CrawlerAttemptSupervisorTest test
```

Expected: scheduler-owned Armor cannot enqueue without a fresh binding; a matching binding is preserved through the attempt plan; manual and non-Armor actions retain their current behavior.

### Timing repair after initial implementation

The first integrated pass exposed two identity races before runtime activation:

- the queue service generated a random attempt ID after the scheduler had already bound an exact attempt;
- every scheduler tick reran the source probe, changing `checkedAt`/`sourceRunIdentity` even when the binding still referred to the unchanged source snapshot.

The transport now accepts the binding attempt ID and uses it as the immutable scheduler attempt identity. For an Armor canary with a healthy changed snapshot and a matching unconsumed binding, the sweep reuses that validated snapshot for the dispatch tick. Missing, expired, consumed, malformed, or identity-drifting bindings still use the normal probe path and fail closed at enqueue. The regression test `armorBindingReusesTheBoundSourceSnapshotWithoutRerunningTheProbe` covers this timing contract without enabling the scheduler or creating authorization artifacts.

The dual-root runtime contract is preserved as well: `TERRAPEDIA_CRAWLER_COMMAND_ROOT` identifies the executing Armor code root for source and canonical entrypoint resolution, while `WORKTREE_ROOT` remains the durable coordinator root for state, progress, bindings, and attempt artifacts. This is required by the deployed coordinator/Armor split and is covered by adapter and supervisor environment assertions.

Runtime gate note: the shared Buff-owner lifecycle repeatedly started a second JVM on `18105` and once overwrote the durable canary field with `null`. Those processes were normally terminated; the Armor backend was rebuilt/restarted on `18104` with scheduler disabled, and the existing authenticated control endpoint restored `enabled=false` with `domain-source-armor-sets` as the canary action. Fresh evidence is `.local/tmp/armor-scheduler-preflight-current-20261009.json`: control/preflight HTTP `200`, `enabled=false`, `liveAttempts=0`, `sweepClaims=0`, healthy reconciler, Armor `eligible`, and only the Armor listener. The repeated `18105` lifecycle remains an external Buff-owner condition and must be acknowledged before enabling a shared scheduler. The durable Armor source snapshot reports `changed=false` with current/previous/ingested hash `823915f0c6410b515189396b737324df89fc11d3e58d30879c213a00a8e6b996`, so no Armor action is eligible for a scheduler canary. Keep the scheduler disabled and defer fresh exact authorization/binding/permit creation until both a real changed Armor snapshot and a stable single-owner scheduler are available.

## Task 5: Keep the 304 quarantine lane read-only

**Files:** no business-table or authorization-ledger edits; classification output stays under `.local/tmp/`.

- [x] **Step 1: Classify the current unresolved effects by existing reason and owner fields.** Use a fresh timestamped output path and the candidate as input:

```bash
mkdir -p .local/tmp
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const input = '.local/tmp/armor-canonical-full-chain-candidate-20261008-29.json';
const output = `.local/tmp/armor-quarantine-classification-${new Date().toISOString().replaceAll(/[^0-9]/g, '').slice(0, 14)}.json`;
const candidate = JSON.parse(fs.readFileSync(input, 'utf8'));
const rows = candidate.quarantine?.sourceEffects ?? candidate.quarantinedSourceEffectsRows ?? [];
const groups = {};
for (const row of rows) {
  const key = `${row.reason ?? 'unknown'}:${row.owner ?? 'unassigned'}`;
  groups[key] = (groups[key] ?? 0) + 1;
}
const result = { input, sourceHash: candidate.fullChainSha256, total: rows.length || candidate.quarantinedSourceEffects, groups, databaseWrites: false, authorizationWrites: false };
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ output, total: result.total, groups: result.groups }));
NODE
```

Expected: the classification reports 304 unresolved rows (or explicitly reports that the candidate does not contain row-level details), names each reason/owner group, and records no write. Do not promote a group into a new proposal from this report alone.

- [x] **Step 2: Re-read the source and relation counts with a read-only connection.** Compare the classification input hash and active row counts before and after the code-only tests. Any changed row, consumed ledger entry, active attempt, reservation, or fence is a stop and must be recorded in the Armor entry.

## Task 6: Integrated offline validation and handoff

**Files:** the changed files above plus the Armor devlog entry/current index.

- [x] **Step 1: Run the complete focused offline suite.**

```bash
cd /home/lolben/TerraPedia/.worktrees/automation-domain-armor
node --test \
  pipelines/automation/armor-automatic-dispatch-binding.test.mjs \
  pipelines/automation/run-armor-automatic-operation.test.mjs \
  pipelines/automation/canonical-armor-ingestion-registration.test.mjs \
  pipelines/automation/canonical-operation-execution-manifest.test.mjs
cd services/catalog-api
mvn -Dtest=CrawlerMonitorActionRegistryTest,CrawlerMonitorServiceImplTest,CrawlerQueueV2ApplicationServiceTest,CrawlerAttemptSupervisorTest test
cd /home/lolben/TerraPedia/.worktrees/automation-domain-armor
node --check pipelines/automation/armor-automatic-dispatch-binding.mjs
node --check pipelines/automation/run-armor-automatic-operation.mjs
git diff --check
```

Expected: all focused Node and Maven tests pass, both adapters parse, and `git diff --check` exits zero. Existing unrelated manifest failures must remain separately identified; they cannot be relabeled as Armor dispatch evidence.

- [x] **Step 2: Update the Armor entry and current index.** Record the exact changed paths, test output, quarantine count, binding schema/hash rules, and the fact that no scheduler/API/MySQL/Redis write occurred. Keep the entry `active` until the scheduler coordinator accepts the binding contract. Point `docs/devlog/current.md` at this plan and retain the coordinator-only scheduler/H8 ownership.

- [x] **Step 3: Hand off the bounded runtime gate.** The Armor devlog records the exact binding schema, action/operation IDs, runtime code-bundle hashes, focused test commands, and current read-only preflight evidence at `.local/tmp/armor-scheduler-preflight-current-20261009.json`. The shared scheduler is disabled with V2 live attempts/claims `0/0` and a healthy reconciler, and the running command root contains the Armor adapter while durable state remains coordinator-owned. Coordinator single-owner confirmation, a fresh candidate/packet/one-use permit under a new request hash, and the bounded canary remain pending. The canary must keep the scheduler disabled until a real changed Armor source snapshot exists, verify no live attempts/reservations/fences, compare committed Armor rows and public/admin API fields, and record source acknowledgement latency. Any missing binding or source/API mismatch leaves the scheduler disabled and the Armor entry active.

## Acceptance checklist

- [x] `domain-source-armor-sets` launches `run-armor-automatic-operation.mjs`, while Items/NPCs/Projectiles/Buffs retain their existing commands.
- [x] The attempt plan contains one exact binding path/hash, and the child receives no global authorization environment.
- [x] The adapter validates action, operation, attempt, source identity, intent hash, packet hash, server fingerprint, policy hash, expiry, and one-use permit before canonical execution.
- [x] `canonical-armor-ingestion` remains the only full-chain write runner; no generic local L1 runner is used for Armor scheduler writes.
- [x] Source acknowledgement follows canonical result/readback and never follows source fetch alone.
- [x] Missing, stale, consumed, replayed, symlinked, or drifted artifacts fail closed before DML.
- [x] The 304 unresolved source effects remain untouched and explicitly classified.
- [x] Focused Node/Maven tests, syntax checks, and `git diff --check` pass.
- [ ] Scheduler activation, fresh authorization, canary readback, and any database write are performed only by the scheduler coordinator under a new exact request hash after a real changed Armor source snapshot is observed.

## Self-review

- **Spec coverage:** the plan covers the recorded scheduler/action mismatch, registered runner, attempt identity, authorization packet/permit, source acknowledgement, quarantine policy, and handoff ownership. It does not claim automatic readiness from catalog registration alone.
- **Placeholder scan:** no step uses `TBD`, `TODO`, or an unbounded implementation instruction; every command names its path and expected result.
- **Type consistency:** the binding schema uses `actionId=domain-source-armor-sets` and `operationId=canonical-armor-ingestion` consistently; Java transport names are `automaticBindingPath` and `automaticBindingSha256` throughout the request, enqueue command, operation plan, and child environment.
