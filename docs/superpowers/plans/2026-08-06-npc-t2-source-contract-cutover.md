# NPC T2 Source Contract Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an authorization-bound, read-only NPC T2 cutover result, promote the four remaining canonical source contracts, and close Tasks 13 and 16.

**Architecture:** A new NPC T2 verifier reconstructs all immutable predecessors, reuses the existing formal read-only snapshot/API probes, and publishes a deterministic cutover identity only after exact evidence validation. The canonical operation catalog and execution manifest bind that verifier to a one-time ADMIN packet. Source contracts are edited only after fresh T2 and item-group reports pass the existing canonical registry.

**Tech Stack:** Node.js ESM, `node:test`, MySQL read-only transactions, canonical authorization manifests, Markdown source-contract registry, existing domain acceptance and quality-gate scripts.

---

## File Map

- Create `scripts/data/npc-canonical/npc-canonical-t2-cutover.mjs`: pure T2 identity validation plus authorized read-only CLI.
- Create `scripts/data/npc-canonical/npc-canonical-t2-cutover.test.mjs`: RED/GREEN verifier, stale evidence, no-write, and publication tests.
- Modify `scripts/data/npc-canonical/npc-canonical-readiness.mjs`: accept a validated T2 result when generating the maintained report.
- Modify `scripts/data/npc-canonical/npc-canonical-readiness.test.mjs`: formal T2 report and failed-publication coverage.
- Modify `scripts/data/automation/canonical-operation-catalog.mjs`: register operation 37 and its frozen inputs/entrypoint.
- Modify `scripts/data/automation/canonical-operation-execution-manifest.mjs`: bind the verifier command, code bundle, input paths, private attempt output, databases, and API origin.
- Modify `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`: exact manifest contract.
- Modify `scripts/data/automation/build-canonical-cutover-authorization.mjs`: accept the T2 operation's no-write technical identity.
- Modify `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`: request/packet binding and operation-count coverage.
- Modify `scripts/data/automation/run-authorized-canonical-operation.test.mjs`: prove the generic runner consumes the decision once and dispatches only the manifest command.
- Modify `scripts/data/audit/canonical-source-contract-registry.test.mjs`: lock all four canonical rows and the unchanged retired bridge.
- Modify `docs/audits/canonical-migration-boundary.md`: promote the four passing contracts.
- Modify `docs/project-governance/00_CURRENT_SPEC.md`: record canonical group/NPC source ownership after the flip.
- Modify `docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md`: complete Task 13 Step 7 and Task 16 Steps 3-4.
- Modify `docs/devlog/current.md` and related entries: final evidence and closeout.

### Task 1: Build The Pure NPC T2 Verifier

**Files:**
- Create: `scripts/data/npc-canonical/npc-canonical-t2-cutover.mjs`
- Create: `scripts/data/npc-canonical/npc-canonical-t2-cutover.test.mjs`
- Modify: `scripts/data/npc-canonical/npc-canonical-readiness.mjs`
- Modify: `scripts/data/npc-canonical/npc-canonical-readiness.test.mjs`

- [x] **Step 1: Write failing verifier tests**

Add fixtures that bind an ADMIN authorization context, owner completion, base completion, T1 evidence, formal snapshot, and API evidence. Require the result shape:

```js
{
  schemaVersion: 1,
  resultKind: 'canonical_npc_t2_cutover_result',
  operationId: 'canonical-npc-t2-cutover-verification',
  status: 'completed',
  noWrite: true,
  cutoverState: 'T2_CUTOVER_VERIFIED',
  decisionIdentity,
  packetHash,
  runId,
  inputHash,
  ownerCompletionHash,
  baseCompletionHash,
  databaseSnapshotHash,
  apiEvidenceHash,
  verifiedAt,
  resultHash,
}
```

Test exact rejection of predecessor hash drift, incomplete T1 cleanup, database/API mismatch, non-read-only adapters, reused output paths, and an authorization context for another operation.

- [x] **Step 2: Run RED**

Run:

```bash
node --test scripts/data/npc-canonical/npc-canonical-t2-cutover.test.mjs \
  scripts/data/npc-canonical/npc-canonical-readiness.test.mjs
```

Expected: FAIL because the T2 module/export and formal T2 publication path do not exist.

- [x] **Step 3: Implement deterministic verification**

Export focused functions:

```js
export function buildNpcT2CutoverResult({
  authorizationContext,
  ownerCompletionContext,
  baseCompletionContext,
  t1Evidence,
  snapshot,
  api,
  verifiedAt,
}) {}

export async function runNpcT2CutoverVerification(options = {}, dependencies = {}) {}
```

Reuse `readCanonicalNpcOwnerPhaseCompletion`,
`readCanonicalNpcBaseMaintCompletion`, `loadNpcCanonicalReadinessSnapshot`, and
`probeNpcCanonicalReadinessApis`. Hash stable normalized evidence, require
`authorizationContext.operationId === 'canonical-npc-t2-cutover-verification'`,
and atomically create a private result without overwrite.

Extend `writeNpcCanonicalReadinessReport` with an optional validated T2 result.
Only a completed matching result may set `evidenceScope: 'formal-t2'` and
`cutoverIdentity`; otherwise retain the T1 report behavior.

- [x] **Step 4: Run GREEN**

Run the Task 1 command again.

Expected: all tests pass with zero failures.

- [x] **Step 5: Commit Task 1**

```bash
git add scripts/data/npc-canonical/npc-canonical-t2-cutover.mjs \
  scripts/data/npc-canonical/npc-canonical-t2-cutover.test.mjs \
  scripts/data/npc-canonical/npc-canonical-readiness.mjs \
  scripts/data/npc-canonical/npc-canonical-readiness.test.mjs
git diff --cached --stat
git commit -m "feat(npc): verify canonical t2 cutover"
```

### Task 2: Register The Governed Read-Only Operation

**Files:**
- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Modify: `scripts/data/automation/run-authorized-canonical-operation.test.mjs`

- [x] **Step 1: Write failing operation-contract tests**

Require operation 37 with frozen inputs:

```js
[
  'reports/authorization/canonical/canonical-npc-apply.input.json',
  'reports/authorization/canonical/canonical-npc-apply.completion.json',
  'reports/authorization/canonical/canonical-npc-base-maint.completion.json',
  'reports/canonical-migration/canonical-npc-t1-acceptance.json',
]
```

Require the manifest command to invoke only
`scripts/data/npc-canonical/npc-canonical-t2-cutover.mjs`, pass the packet-bound
attempt output, formal database names, backend API origin, and `--no-write=true`.
Require the generic runner to reject command, code, input, output, or API drift
before consuming the decision.

- [x] **Step 2: Run RED**

```bash
node --test \
  scripts/data/automation/canonical-operation-execution-manifest.test.mjs \
  scripts/data/automation/build-canonical-cutover-authorization.test.mjs \
  scripts/data/automation/run-authorized-canonical-operation.test.mjs
```

Expected: FAIL on the missing operation and manifest.

- [x] **Step 3: Implement catalog, manifest, and authorization binding**

Add `canonical-npc-t2-cutover-verification` to the catalog and manifest maps.
Bind the verifier plus all static imports in the code bundle. Declare no
owned-table mutation scope, no network fetch, no crawler permit, and one private
result/report path under the decision-derived attempt directory.

The authorization builder must require `noWrite: true`, the exact formal
database triplet, backend API origin, and the manifest hash. Do not add a second
runner; use `run-authorized-canonical-operation.mjs`.

- [x] **Step 4: Run GREEN and syntax checks**

Run the Task 2 test command, then:

```bash
node --check scripts/data/npc-canonical/npc-canonical-t2-cutover.mjs
node --check scripts/data/automation/canonical-operation-execution-manifest.mjs
node --check scripts/data/automation/build-canonical-cutover-authorization.mjs
```

Expected: all commands exit zero.

- [x] **Step 5: Commit Task 2**

```bash
git add scripts/data/automation/canonical-operation-catalog.mjs \
  scripts/data/automation/canonical-operation-execution-manifest.mjs \
  scripts/data/automation/canonical-operation-execution-manifest.test.mjs \
  scripts/data/automation/build-canonical-cutover-authorization.mjs \
  scripts/data/automation/build-canonical-cutover-authorization.test.mjs \
  scripts/data/automation/run-authorized-canonical-operation.test.mjs
git diff --cached --stat
git commit -m "feat(automation): govern npc t2 verification"
```

### Task 3: Generate And Execute The Exact ADMIN Decision

**Files:**
- Generate private ignored artifacts under: `reports/authorization/canonical/canonical-npc-t2-cutover-verification/`
- Update after success: `reports/canonical-migration/canonical-npc-crawler-facts-readiness.json`

- [x] **Step 1: Run preflight read-only checks**

Verify the current owner/base completions, T1 evidence, database triplet, API
origin, zero active crawler attempts/reservations, and no stale T2 attempt.

- [x] **Step 2: Generate the execution manifest and ADMIN request**

Use a fresh identity of the form
`canonical-npc-t2-cutover-verification-20260806-admin-01`. Print the decision
identity, request hash, request path, `0600` owner-input path, and manifest hash.

- [x] **Step 3: Stop for explicit Owner confirmation**

Do not create a packet or dispatch the verifier until the user confirms the
exact decision identity and request hash.

- [x] **Step 4: Build and independently inspect the packet**

After confirmation, verify actor `admin`, expiry, request hash, manifest hash,
no-write flag, database triplet, API origin, and all frozen input/code hashes.

- [x] **Step 5: Execute once and read back independently**

Dispatch through `run-authorized-canonical-operation.mjs`. Require a completed
T2 result, no retained permit, no database mutation, and a maintained NPC report
with `status: pass`, `readinessLevel: T2_CUTOVER_VERIFIED`, and fresh API-backed
evidence.

- [x] **Step 6: Commit maintained T2 evidence**

```bash
git add reports/canonical-migration/canonical-npc-crawler-facts-readiness.json
git diff --cached --stat
git commit -m "data(npc): record canonical t2 cutover"
```

Completed in `0ad73c20`. ADMIN-02 published the maintained
`pass/formal-t2/T2_CUTOVER_VERIFIED` report without changing the database.

### Task 4: Promote The Four Source Contracts

**Files:**
- Modify: `scripts/data/audit/canonical-source-contract-registry.test.mjs`
- Modify: `docs/audits/canonical-migration-boundary.md`
- Modify: `docs/project-governance/00_CURRENT_SPEC.md`

- [x] **Step 1: Write the failing registry contract**

Require three item-group rows in `canonical` mode to reference
`reports/canonical-migration/canonical-item-group-readiness.json`, the NPC row
to reference the maintained NPC readiness report, and the bridge row to remain
`retired`.

- [x] **Step 2: Run RED**

```bash
node --test scripts/data/audit/canonical-source-contract-registry.test.mjs
```

Expected: FAIL because the four rows remain `b1_migrating`.

- [x] **Step 3: Change only the four registry rows and current fact sheet**

Use exact row forms:

```markdown
| `<input>` | `canonical` | report: `<readiness-report>` | — |
```

Update the current spec to state that canonical item-group and NPC runtime
ownership is verified and the JSON/standardized inputs are compatibility and
governance evidence, not steady-state runtime readers.

- [x] **Step 4: Run GREEN and acceptance gates**

```bash
node --test scripts/data/audit/canonical-source-contract-registry.test.mjs \
  scripts/data/audit/domain-readiness-audit.test.mjs
node scripts/data/workflow/domain-acceptance-generate-reports.mjs \
  --fail-on-blocked=true --fail-on-warning=true
node scripts/data/audit/cross-db-referential-integrity.mjs --mode=quick
```

Expected: source contracts pass, domain acceptance is `45/45`, and cross-DB is
`10/10`.

- [x] **Step 5: Commit the source flip**

```bash
git add scripts/data/audit/canonical-source-contract-registry.test.mjs \
  docs/audits/canonical-migration-boundary.md \
  docs/project-governance/00_CURRENT_SPEC.md
git diff --cached --stat
git commit -m "docs(data): promote canonical source contracts"
```

Completed in `9c3dfbf0`. The three item-group contracts and the standardized
NPC contract are canonical; the generated NPC bridge remains retired.

### Task 5: Full Verification And Closeout

**Files:**
- Modify: `docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md`
- Modify: `docs/superpowers/plans/2026-08-06-npc-t2-source-contract-cutover.md`
- Modify: `docs/devlog/current.md`
- Modify: `docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md`
- Modify: `docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md`
- Modify: `docs/devlog/entries/2026-08-04-item-image-projection-apply-runtime.md`
- Modify: `docs/project-management/current-status.md`
- Modify: `docs/project-management/risk-register.md`

- [x] **Step 1: Run the full gate with explicit isolated E2E credentials**

```bash
TERRAPEDIA_E2E_ENABLED=1 \
TERRAPEDIA_E2E_MYSQL_HOST=127.0.0.1 \
TERRAPEDIA_E2E_MYSQL_PORT=13306 \
TERRAPEDIA_E2E_MYSQL_USERNAME=root \
TERRAPEDIA_E2E_MYSQL_PASSWORD=root \
TERRAPEDIA_E2E_REDIS_HOST=127.0.0.1 \
TERRAPEDIA_E2E_REDIS_PORT=6380 \
TERRAPEDIA_E2E_REDIS_DATABASE=15 \
TERRAPEDIA_E2E_REDIS_PASSWORD=root \
TERRAPEDIA_E2E_BACKEND_PORT=18122 \
TERRAPEDIA_E2E_FRONTEND_PORT=13022 \
TERRAPEDIA_E2E_CHROMIUM_EXECUTABLE=/snap/bin/chromium \
bash ./scripts/dev/quality-gate.sh
```

Expected: exit zero and isolated E2E cleanup passes.

- [x] **Step 2: Verify cleanup and immutable runtime state**

Require ports 18122/13022 unbound, zero disposable E2E databases, Redis DB 15
empty, zero active attempts/reservations/permits, policy still `biomes v1
L2/ACTIVE`, and no scheduler daemon/crawler process started.

- [x] **Step 3: Close plan and devlog entries**

Mark Task 13 Step 7 and Task 16 Steps 3-4 complete. Record exact T2 decision,
packet, result, readiness report, source flip, validation, residual risks, and
commit SHAs. Remove the closed branch entries from `docs/devlog/current.md`
Open Work and retain only relevant historical links.

- [x] **Step 4: Commit closeout**

```bash
git add docs/superpowers/plans/2026-07-27-crawler-automated-ingestion-closure.md \
  docs/superpowers/plans/2026-08-06-npc-t2-source-contract-cutover.md \
  docs/devlog/current.md \
  docs/devlog/entries/2026-07-23-crawler-auto-ingestion-readiness-design.md \
  docs/devlog/entries/2026-07-27-crawler-automated-ingestion-closure.md \
  docs/devlog/entries/2026-08-04-item-image-projection-apply-runtime.md \
  docs/project-management/current-status.md \
  docs/project-management/risk-register.md
git diff --cached --stat
git commit -m "docs(devlog): close automated ingestion readiness"
```

- [x] **Step 5: Final branch checks**

```bash
git status --short --branch -uall
git branch -vv
git worktree list --porcelain
```

Expected: the task worktree is clean and the branch remains unpushed unless the
user separately requests push/integration.
