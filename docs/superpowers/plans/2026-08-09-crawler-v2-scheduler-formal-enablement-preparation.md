# Crawler V2 Scheduler Formal Enablement Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the isolated Scheduler T1 test round and make a future production Scheduler V2 enablement decision reproducible, current-hash-bound, reversible, and explicitly owner-authorized without enabling it during preparation.

**Architecture:** Treat the passed isolated T1 report as historical runtime proof only. A new read-only production preflight must observe the current V2 control state through the authenticated monitor API and existing read-only monitor/reconciler readers, then freeze those observations together with the exact code bundle into a proposal-only artifact. A later, separately authorized operation may enable automation only through the authenticated loopback `PUT /admin/crawler-monitor/v2/automation`; rollback uses that same API and proves convergence by independent readback.

**Tech Stack:** Node.js ESM, existing canonical authorization and execution-manifest helpers, Spring Boot monitor API, Redis V2 read-only inspection, MySQL read-only checks, Node test runner, Maven focused tests.

---

## Scope And Authority Boundary

**Source chain:** downloaded fixture JSON -> recorded-response importer -> isolated T1 report -> fresh production preflight -> proposal-only artifact -> fresh current-hash ADMIN request -> one-time permit -> authenticated loopback automation API -> V2 Redis/reconciler state -> scheduled importer progress and database outcomes.

The current isolated proof is run `npc-t1-crawler-v2-auto-ingestion-20260809-04`, report `reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json`, SHA-256 `bb3493ea5fb09da518f1d8a6b2db8712a86cf6a9784c17b5241288be5ed5a8d6`. It proves the bounded recorded Recipe path and cleanup, but it is not authority to mutate formal state.

Preparation may create code, tests, documentation, and proposal artifacts only. It must not create or consume a formal permit, enable the production scheduler, write formal databases, modify production Redis or monitor JSON, invoke a manual sweep, start an external daemon, or request Wiki pages. Do not stage `data/generated/wiki-town-npc-maintenance.latest.json` or `data/generated/resume/`; never use `git add .`.

The existing `build-canonical-crawler-v2-scheduler-activation-proposal.mjs` hard-codes a representative production state in its CLI path. It is insufficient for a formal decision until this plan replaces that input with a freshly observed, hash-bound preflight record.

## Files And Responsibilities

| Path | Responsibility |
| --- | --- |
| `scripts/data/automation/crawler-v2-scheduler-activation-preflight.mjs` | Read-only production control-state collector and strict preflight validator. |
| `scripts/data/automation/crawler-v2-scheduler-activation-preflight.test.mjs` | Unit coverage for preflight completeness, stale/mixed state, and no-write behavior. |
| `scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs` | Proposal-only builder consuming the preflight record instead of constants. |
| `scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs` | Hash, drift, forbidden-operation, and rollback contract coverage. |
| `scripts/data/automation/canonical-operation-catalog.mjs` | Frozen data paths for the activation operation. |
| `scripts/data/automation/canonical-operation-execution-manifest.mjs` | Current-hash proposal-only execution definition and declared outputs. |
| `scripts/data/automation/*.test.mjs` | Catalog and manifest regression coverage. |
| `reports/authorization/canonical/` | Generated preflight, proposal, future request/packet/permit evidence; no credentials or bearer tokens. |
| `docs/devlog/entries/2026-08-09-crawler-v2-scheduler-formal-enablement-preparation.md` | This preparation chain, evidence, risks, and explicit owner checkpoint. |

### Task 1: Close The Isolated T1 Test Round Without Expanding Authority

**Files:**
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-08-08-crawler-v2-scheduler-lifecycle.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`
- Test: the exact Scheduler/Recipe and manifest/monitor Node suites already recorded by the T1 entry

- [ ] **Step 1: Re-read the promoted Scheduler T1 report and calculate its SHA-256.** Require `status="passed"`, `scheduledTickObserved=true`, `cleanupPassed=true`, two lease renewals, restart adopt/reject, lease-loss reap, Recipe counts `947/1256/1015`, and unresolved `0/0`. Record a mismatch as a test-round blocker; do not regenerate a production artifact.

  Run:
  ```bash
  sha256sum reports/canonical-migration/canonical-crawler-v2-scheduler-t1-acceptance-npc-t1-crawler-v2-auto-ingestion-20260809-04.json
  ```

  Expected: `bb3493ea5fb09da518f1d8a6b2db8712a86cf6a9784c17b5241288be5ed5a8d6`.

- [ ] **Step 2: Re-run the focused test commands named by the current lifecycle entry and inspect their complete exit status.** Run the Scheduler/Recipe lifecycle suite and the combined manifest/monitor suite from the repository root. If either changes behavior, repair the responsible code and repeat the isolated T1 evidence under a new run ID before continuing.

- [ ] **Step 3: Confirm independent cleanup remains zero using the T1 report fields plus read-only checks for the derived schemas/accounts, Redis DB 14, port 18189, marker root, owned children, and permit path.** Formal schemas, production Redis namespaces, and production automation configuration are read-only during this step.

- [ ] **Step 4: Update the scheduler lifecycle entry as `ready-for-commit` only after the checks above are fresh; keep this preparation entry `active`.** Record that `...admin-06` was consumed by a failed-closed run and `...admin-07` was consumed by the final isolated run. Neither identity can be reused.

- [ ] **Step 5: Prepare a focused test-round commit only after `git diff --check`, `git status --short`, and `git diff --cached --stat` are reviewed.** Stage explicit Scheduler/Recipe/manifest/docs paths only; leave the user-owned generated NPC maintenance file and `data/generated/resume/` unstaged.

### Task 2: Add A Read-Only, Current-State Activation Preflight

**Files:**
- Create: `scripts/data/automation/crawler-v2-scheduler-activation-preflight.mjs`
- Create: `scripts/data/automation/crawler-v2-scheduler-activation-preflight.test.mjs`
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.preflight.json` (generated only when this task is executed)

- [ ] **Step 1: Write failing tests for a preflight result with this complete public shape.** Use injected API/read-only inspectors in tests so the test never contacts a real service:

  ```js
  assert.deepEqual(result.control, {
    enabled: false,
    mode: 'changed-only',
    liveAttempts: 0,
    sweepClaims: 0,
    reconcilerHealthy: true,
  });
  assert.match(result.observedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(result.epoch, /\S/);
  assert.match(result.namespace, /\S/);
  assert.equal(result.databaseWrites, false);
  assert.equal(result.networkAccess, false);
  ```

  Add negative tests for enabled automation, a non-`changed-only` mode, nonzero attempts/claims, missing epoch or namespace, unhealthy reconciler, an ineligible domain, stale T1 hash, a source error, and an inspector that exposes a write method.

- [ ] **Step 2: Run the new test before implementation.**

  Run:
  ```bash
  node --test scripts/data/automation/crawler-v2-scheduler-activation-preflight.test.mjs
  ```

  Expected: failure because the collector module does not yet exist.

- [ ] **Step 3: Implement the collector with only authenticated read operations.** Query the production monitor's automation read endpoint and its V2 status/reconciler view; obtain the durable epoch/namespace and lease/attempt membership from existing read-only monitor/repository APIs, not raw JSON mutation or Redis writes. Read each eligible-domain readiness record and require its authoritative readiness predicate to pass. Hash every source record, record server/endpoint identity without tokens, and reject missing, inconsistent, or older-than-window observations.

  The output must include `operationId`, `observedAt`, API/server identity, the `control` object, epoch, namespace, domain readiness with source hashes, the T1 report path/hash, a `codeBundle` hash list, `databaseWrites:false`, `networkAccess:false`, and a deterministic `preflightHash`. Write the report atomically with mode `0600` only under `reports/authorization/canonical/`.

- [ ] **Step 4: Re-run the preflight tests and the catalog/manifest tests.** Verify tests prove no direct JSON/Redis write, no manual sweep, no external child, and no Wiki request is possible through the preflight entrypoint.

- [ ] **Step 5: Execute the real preflight only in a separately approved production-read-only window.** Its smoke outcome is exactly one preflight record showing disabled changed-only automation, `0` live attempts, `0` sweep claims, a healthy reconciler, durable epoch/namespace, and every proposed domain eligible. Any mismatch stops the plan at the mismatch; repair the operational state through its own authorized incident process, then run a new preflight.

### Task 3: Make The Proposal Strictly Consume Fresh Preflight Evidence

**Files:**
- Modify: `scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.mjs`
- Modify: `scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs`
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.input.json` (generated in the approved preflight window)
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.proposal.json` (proposal-only)

- [ ] **Step 1: Add failing proposal tests that require the exact preflight hash and code-bundle hashes.** The tests must reject a hard-coded epoch, altered T1 bytes, altered code hash, stale `observedAt`, enabled config, nonzero attempt/claim, failed readiness, a wrong endpoint, `proposalOnly:false`, `databaseWrites:true`, or a rollback body other than `{ enabled: false, mode: 'changed-only' }`.

  ```js
  assert.throws(
    () => buildCrawlerV2SchedulerActivationProposal({ t1Report, preflight: { ...preflight, preflightHash: 'sha256:stale' } }),
    /preflight.*hash|current/i,
  );
  assert.deepEqual(proposal.rollback, {
    endpoint: '/admin/crawler-monitor/v2/automation',
    body: { enabled: false, mode: 'changed-only' },
  });
  ```

- [ ] **Step 2: Run the proposal test to establish the failing state.**

  Run:
  ```bash
  node --test scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs
  ```

  Expected: failure until the builder accepts and validates the preflight artifact.

- [ ] **Step 3: Replace the CLI's representative `current` constants with a validated preflight input.** The CLI must require explicit `--preflight`, `--t1-report`, and `--output` paths, hash each before construction, reject paths outside the repository authorization root, emit `authorizationStatus:"AWAITING_OWNER"`, and never invoke the authorization packet builder or permit writer. Preserve these forbidden operations in the proposal: `direct-json-write`, `direct-redis-write`, `manual-sweep`, `external-daemon`, and `formal-permit-consumption`.

- [ ] **Step 4: Freeze the operation manifest inputs and outputs.** Declare the T1 report and new input record as inputs, declare only the proposal JSON as output/report, and retain `executionClass:"formal_activation_proposal_only"`, `databaseWrites:false`, `isolatedResourceWrites:false`, and `networkAccess:false`.

- [ ] **Step 5: Run the proposal, catalog, manifest, and authorization-builder test lanes.** The acceptance condition is a proposal artifact that remains disabled and proposal-only, binds current hashes, contains no secret, and cannot be interpreted as an authorized packet or permit.

### Task 4: Review And Commit The Preparation Change Before Any Formal Request

**Files:**
- Modify: `docs/devlog/entries/2026-08-09-crawler-v2-scheduler-formal-enablement-preparation.md`
- Modify: `docs/devlog/current.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`

- [ ] **Step 1: Perform a source-chain review from preflight sources through proposal output.** Confirm the only future mutation is the authenticated loopback automation `PUT`; the formal DB, V1 queue, production Redis mutation, direct JSON write, manual sweep, daemon, and Wiki network are absent from preparation commands and tests.

- [ ] **Step 2: Re-read the plan against the audit checklist.** Confirm the goal, source chain, authority boundary, all fail-closed branches, production smoke check, rollback postcondition, commit scope, and future owner checkpoint are each present. Patch the plan before proceeding when a critical or important finding appears.

- [ ] **Step 3: Run documentation and implementation gates.**

  Run:
  ```bash
  git diff --check
  node --test scripts/data/automation/crawler-v2-scheduler-activation-preflight.test.mjs scripts/data/automation/build-canonical-crawler-v2-scheduler-activation-proposal.test.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs scripts/data/automation/build-canonical-cutover-authorization.test.mjs
  git status --short
  git diff --cached --stat
  ```

  Expected: all selected tests pass, no whitespace errors, no staged unrelated artifacts, and no proposal/request/packet/permit generated unless an approved preflight window explicitly produced the proposal.

- [ ] **Step 4: Commit the preparation implementation as a focused commit.** Use explicit path staging, keep the test-round commit separate if it contains unrelated Scheduler/Recipe runtime work, and record validation, hashes, residual risks, and the handoff target in the devlog. Do not merge, deploy, or start the scheduler.

### Task 5: Future Fresh ADMIN Authorization Checkpoint

**Files:**
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.request.json` (only after Task 4 is committed and fresh preflight passes)
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.packet.json` (only after ADMIN approval)
- Create: `reports/authorization/canonical/canonical-crawler-v2-scheduler-activation.permit.json` (private and one-time; only after ADMIN approval)

- [ ] **Step 1: Immediately before requesting authorization, re-run the real read-only preflight and proposal build.** Compare every reported hash with the committed code, T1 report, and observation sources. Any byte or state drift invalidates the proposal and requires a new preflight and request.

- [ ] **Step 2: Build the current-hash authorization request through the canonical authorization builder.** Bind operation ID, proposal/preflight/T1/code hashes, exact production target identity, automation endpoint, allowed enable body, rollback body, interval, domain allowlist, observation window, and expiry. Verify the request is `AWAITING_OWNER` and contains no password, token, or permit secret.

- [ ] **Step 3: Stop and present the exact request path/hash and a concise risk summary to the owner.** The required authorization is specifically for one production V2 automation enablement window plus API-only rollback observation. It must not be inferred from any T1, Item, domain, or prior failed/consumed decision. Do not create a packet or permit before that authorization exists.

### Task 6: Later Authorized Enablement, Observation, And Rollback

**Files:**
- Create: a run-specific progress/report artifact under the canonical authorization/report roots declared by the approved manifest
- Modify: `docs/devlog/entries/2026-08-09-crawler-v2-scheduler-formal-enablement-preparation.md`
- Modify: `docs/devlog/current.md`

- [ ] **Step 1: Verify the authorized packet against the current request immediately before creating the private one-time permit.** Reject consumed, expired, cross-operation, cross-hash, cross-target, or reused identities. Record only permit lifecycle state, never the secret.

- [ ] **Step 2: Enable automation through the authenticated loopback API only.** Issue the manifest-bound `PUT /admin/crawler-monitor/v2/automation` enable body, then observe a real scheduled tick without calling a manual sweep or starting an external daemon. Record attempt ID, domain, source mode, progress, lease ownership/renewal, reconciler health, and database/relationship outcomes through the controlled API/read-only readers.

- [ ] **Step 3: Enforce the production observation budget.** Abort on an unapproved domain, source/network-policy violation, missing progress identity, stale heartbeat, lease conflict, failed reconciler, unexpected DB target, or output-count mismatch. Immediately use the same authenticated API to restore `{ enabled:false, mode:'changed-only' }`; do not compensate by direct Redis/JSON/SQL writes.

- [ ] **Step 4: Verify rollback and postconditions independently.** Require disabled changed-only configuration, zero live attempts, zero sweep claims, no retained lease/permit, healthy reconciler, no owned child/daemon, and an immutable result showing the authorized observation outcome. If the scheduler had no approved successful tick, treat this as a failed-closed activation and open an incident; do not retry with the consumed identity.

- [ ] **Step 5: Run final validation and handoff.** Re-run the preflight read-only checks, focused backend/Node suites, `git diff --check`, `git status --short`, and `git diff --cached --stat`. Update devlog/status/risk records with the exact decision, report, rollback state, and any residual production follow-up. Push, merge, release, and broad crawler expansion remain separate decisions.

## Plan Audit

## Verdict

- Status: execution-ready for preparation only; Tasks 5 and 6 are deliberately gated by a future owner decision.
- Main goal: turn isolated Scheduler T1 evidence into a current-state, rollback-safe formal enablement decision path.
- Closure definition: a committed and tested preflight/proposal path proves the production state is disabled/changed-only with zero activity and can produce a fresh request; after separate authorization, API-only enablement and API-only rollback both have independent readback evidence.

## Blocking Plan Defects

- Critical: none in the preparation plan.
- Important: the present proposal CLI uses representative hard-coded production control values. Task 3 removes this before any formal request is possible.

## Plan Repairs

- Change: introduce a hash-bound read-only preflight record.
- Reason: old T1 evidence and constants cannot prove the state at authorization time.
- Validation added: negative tests for state/hash/readiness drift and a real preflight smoke result.

## Execution-Ready Plan

- Scope: closeout, read-only preflight, proposal construction, contract tests, docs, and focused commits.
- Agent split: serialized owner only until a later plan explicitly assigns disjoint read-only review work; production lifecycle and devlog remain single-owner.
- Smoke test: a current preflight record with disabled changed-only state, zero claims/attempts, healthy reconciler, durable epoch/namespace, and eligible domains.
- Final validation: current-hash proposal tests plus catalog/manifest/authorization tests, focused runtime tests, rollback postcondition readback, and explicit staged-scope review.

## Residual Risk

- Risk: a valid proposal can become stale before authorization or enablement.
- Follow-up trigger: any code, input, configuration, epoch, namespace, readiness, attempt, claim, or reconciler drift requires a new preflight and request; consumed decisions are never retried.
