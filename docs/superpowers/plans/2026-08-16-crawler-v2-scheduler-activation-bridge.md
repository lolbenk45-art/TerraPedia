# Crawler V2 Scheduler Activation Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the missing formal authorization path for the already-supported global Crawler V2 scheduler activation, then execute one user-authorized local-source Shimmer automatic L1 run without a full Wiki extraction.

**Architecture:** A read-only snapshot command freezes the current local server identity and policy set into three private, no-overwrite artifacts. The governed catalogue then recognizes the existing `automation-crawler-v2-scheduler-activation` policy writer, allowing the existing canonical request/packet flow to bind the exact snapshot. The existing policy writer remains the only component that inserts the activation decision, and the existing automatic runner remains the only component that applies Shimmer data.

**Tech Stack:** Node.js ESM, `node:test`, mysql2, existing canonical authorization, Crawler V2 monitor, and local MySQL.

---

## Scope And Boundaries

- In scope: the missing governed operation registration, a read-only activation
  snapshot command, focused tests, one private activation request/packet, and
  the user-authorized bounded local Shimmer run.
- Out of scope: direct SQL activation insertion, hand-written authorization
  packet substitution, full Wiki extraction, source generation, L2, Boss loot,
  scheduler sweeps, commit, push, merge, stack restart, or changes to protected
  Shimmer data before the automatic runner itself writes its normal output.
- Execute serially in the primary worktree. The final runtime action shares the
  protected Shimmer artifacts and local database, so a second worktree would
  not provide meaningful isolation.

### Task 1: Lock The Authorization Contract With Tests

**Files:**
- Create: `pipelines/automation/capture-crawler-v2-scheduler-activation-input.test.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.test.mjs`
- Modify: `pipelines/automation/build-canonical-cutover-authorization.test.mjs`

- [x] Add a test that expects the stable operation catalogue to contain
  `automation-crawler-v2-scheduler-activation` and its formal policy-decision
  manifest command:

```js
assert.deepEqual(manifest.command, [
  'node', 'pipelines/automation/run-automation-policy-decision.mjs',
  '--operation-id=automation-crawler-v2-scheduler-activation',
  '--input=reports/authorization/canonical/automation-crawler-v2-scheduler-activation.input.json',
  '--output=reports/authorization/canonical/automation-crawler-v2-scheduler-activation.result.json',
  '--apply=true',
]);
```

- [x] Add snapshot-builder tests that accept only the exact `crawler_v2_scheduler`
  policy at `L1`/`ACTIVE`, freeze its version/hash plus the canonical policy-set
  hash, and reject a missing/inactive scheduler policy. Add a no-overwrite
  artifact assertion so an old snapshot cannot be silently replaced.
- [x] Run the two test files before implementation. Expected result: catalogue
  and snapshot-builder assertions fail because the operation and module do not
  exist.

### Task 2: Implement The Read-Only Bridge

**Files:**
- Create: `pipelines/automation/capture-crawler-v2-scheduler-activation-input.mjs`
- Modify: `pipelines/automation/canonical-operation-catalog.mjs`
- Modify: `pipelines/automation/canonical-operation-execution-manifest.mjs`

- [x] Export a pure snapshot builder that accepts normalized policy rows and a
  canonical server fingerprint, returns the exact policy-decision input, policy
  rows, and fingerprint payloads, and rejects drift from `L1`/`ACTIVE`.
- [x] Implement a CLI that reads the local MySQL server UUID and current policy
  rows, then writes all three requested repository-confined outputs with mode
  `0600` and no-overwrite behavior. It must never insert, update, delete, or
  call an HTTP endpoint.
- [x] Add the scheduler operation to `CANONICAL_CUTOVER_OPERATION_IDS`, its
  input path, its policy-decision entrypoint, manifest definition, and exact
  code-bundle paths. Do not alter unrelated policy operations.
- [x] Run the new and updated tests. Expected result: all focused bridge tests
  pass, and a catalog request can now bind the frozen scheduler input.

### Task 3: Create And Execute The Bounded Runtime Authorization

**Files:**
- Create at runtime under `reports/authorization/canonical/`:
  `automation-crawler-v2-scheduler-activation.{input,policy-rows,server-fingerprint,request,owner-input,packet,result}.json`
- Create at runtime: a monitor-visible Shimmer progress JSON under
  `reports/backend-refresh/history/`

- [x] Authenticate to the local admin API, disable only the global scheduler
  with `changed-only` mode and a one-minute interval, and read the authenticated
  preflight. Abort and restore immediately unless there are zero live attempts
  and claims and the reconciler is healthy.
- [x] Run the new read-only snapshot command. Use its exact policy rows and
  server fingerprint to build an `AWAITING_OWNER` request, add the active owner
  identity/reason/reference supplied by this user authorization, and authorize
  one private packet with a fresh decision identity. The authorization command
  must read the canonical `reports/authorization/canonical/used-decisions.json`
  ledger; the policy writer's immutable unique database identity/packet keys
  remain the execution-time replay fence.
- [x] Run the existing policy writer once with that packet, then read back one
  valid `crawler_v2_scheduler` activation decision before starting Shimmer.
- [x] Run exactly one:

```bash
node pipelines/automation/run-supplementary-domain-automatic-operation.mjs \
  --domain=shimmer --source-mode=local --progress-path=<attempt-progress-path>
```

- [x] Verify terminal run/apply/bundle rows, the four Shimmer counts and
  mutation generations, the write fence, and terminal monitor progress. Restore
  scheduler `enabled=true`, `changed-only`, one minute even if the automatic
  operation fails.

### Task 4: Record And Verify

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-08-16-shimmer-evidence-reconciliation.md`

- [x] Record only the resulting activation ID/decision identity, Shimmer run
  and apply/bundle identities, terminal counts, restored scheduler state, test
  results, and residual risks. Keep the task `active` until a commit is
  explicitly requested.
- [x] Run `git diff --check`, the focused Node test set, and the authenticated
  runtime/database evidence queries. Preserve all existing protected dirty
  Shimmer artifacts and do not stage or commit any files.

## Plan Self-Review

- Goal lock: the plan closes the exact missing formal activation path required
  before the user-authorized automatic local Shimmer operation.
- Source chain: local MySQL policy rows and server UUID -> frozen private
  snapshot -> canonical request/packet -> policy decision -> activation gate ->
  automatic Shimmer runner -> run/apply/fence/progress evidence.
- Failure handling: any failed preflight, authorization identity mismatch,
  activation read-back failure, or non-terminal Shimmer run stops the apply
  sequence and restores the scheduler.
- Authorization replay safety: packet construction checks the canonical durable
  decision ledger; the activation table rejects duplicate decision identities
  and packet hashes in the same transaction as the activation write.
- Validation: new unit tests prove the bridge; existing authorization tests,
  monitor preflight, terminal database rows, and progress prove runtime closure.
