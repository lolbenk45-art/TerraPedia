# Canonical Item Image Projection Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a governed `canonical-item-image-projection-apply` operation that updates only existing active `terria_v1_relation.projection_items.image` values from the exact canonical `relation_item_images.cached_url` set, with deterministic proposal evidence, one-time authorization, transactional drift checks, and fail-closed readiness.

**Architecture:** A pure contract module owns canonical hashing, proposal/input/result schemas, private-path confinement, and exact evidence comparison. A read-only proposal entrypoint obtains an injected database snapshot; a dedicated database adapter locks and rechecks the same rows in one transaction; the apply entrypoint consumes the child permit immediately before the only scoped `UPDATE`. Canonical catalog/manifest/runner and image-lineage readiness bind the operation, while general relation sync loses only the reverse `local.items.image -> projection_items.image` bridge.

**Tech Stack:** Node.js ESM, `node:test`, MySQL 8 via `mysql2/promise`, existing canonical authorization/context helpers, existing private repository path helpers.

---

## Scope And Ownership

**Create:**

- `scripts/data/relation/item-image-projection-contract.mjs`: immutable schemas, canonical hashes, private reads/writes, exact evidence validator.
- `scripts/data/relation/item-image-projection-contract.test.mjs`: proposal/input/result and confinement tests.
- `scripts/data/relation/build-item-image-projection-proposal.mjs`: read-only proposal and no-overwrite input materializer.
- `scripts/data/relation/build-item-image-projection-proposal.test.mjs`: deterministic proposal and rejection tests.
- `scripts/data/relation/item-image-projection-db.mjs`: read-only snapshot query and single-transaction apply adapter.
- `scripts/data/relation/item-image-projection-db.test.mjs`: SQL ownership, lock order, rollback, and commit tests.
- `scripts/data/relation/apply-item-image-projection.mjs`: authorized apply orchestration and private terminal result.
- `scripts/data/relation/apply-item-image-projection.test.mjs`: preflight, permit timing, success, and failure tests.
- `docs/devlog/entries/2026-08-04-item-image-projection-apply-implementation.md`: implementation handoff state.

**Modify:**

- `scripts/data/automation/canonical-operation-catalog.mjs`
- `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`
- `scripts/data/automation/run-authorized-canonical-operation.mjs`
- `scripts/data/automation/run-authorized-canonical-operation.test.mjs`
- `scripts/data/relation/sync-maint-to-relation.mjs`
- `scripts/data/relation/sync-maint-to-relation.test.mjs`
- `scripts/data/audit/image-source-lineage-report.mjs`
- `scripts/data/audit/image-source-lineage-report.test.mjs`
- `docs/project-governance/00_CURRENT_SPEC.md`
- `docs/devlog/current.md` through a scoped patch only.

**Out of scope:** backend/frontend changes; changes to `local.items.image`; armor-set compatibility removal; projection INSERT/DELETE; any projection column other than `image`; real DB reads; real proposal/input/request/packet/permit/apply; crawler/network/MinIO/Shimmer/source flip/L1/L2/scheduler/service lifecycle; push/merge/cleanup.

## Frozen Contract Shape

The pure contract uses operation ID `canonical-item-image-projection-apply`, contract version `item-image-projection-apply-v1`, and canonical JSON hashes (`sha256:<hex>`) over recursively key-sorted values. Proposal and input freeze:

```js
{
  operationId,
  contractVersion,
  attemptId,
  attemptRoot,
  generatedAt,
  expiresAt,
  apply: false, // proposal only
  proposalAuthorization: {
    path, sha256, decisionIdentity, authorizationHash
  },
  lineage: {
    inputContractPath, inputContractSha256,
    resultPath, resultSha256, bundlePath, bundleSha256,
    applySnapshotPath, applySnapshotSha256,
    authorizationPacketPath, authorizationPacketSha256,
    decisionIdentity, packetHash, dispatchPermitHash, completedRowCount
  },
  target: {
    host, port, serverUuid,
    databases: {
      local: 'terria_v1_local',
      maint: 'terria_v1_maint',
      relation: 'terria_v1_relation'
    },
    ownedDatabase: 'terria_v1_relation',
    ownedTable: 'projection_items',
    ownedColumn: 'image',
    fingerprintSha256
  },
  snapshotPath, snapshotSha256,
  managedUrlPolicy: {
    sourcePath: 'scripts/data/relation/managed-image-url-policy.mjs',
    sourceSha256, resolvedPrefixesSha256
  },
  managedUrlPrefixes,
  keys, keySetSha256,
  relationRows, relationRowsSha256,
  projectionBeforeRows, projectionBeforeSha256,
  projectionAfterRows, projectionAfterSha256,
  targetRowCount, changedRowCount
}
```

Each relation row is `{ recordKey, internalName, cachedUrl }`; each projection row is `{ id, relationRecordKey, internalName, image }`. Rows and keys are sorted by `internalName`, duplicate identities are rejected, the relation source must be active primary role `icon`, and every cached URL must satisfy the configured item managed-path prefixes. Relation `recordKey` values, projection IDs, and projection `relationRecordKey` values are individually unique. For every `internalName`, the projection row's `relationRecordKey` must equal the matching relation row's `recordKey`; a name-only match is never sufficient.

The lineage input contract is required because the existing lineage completed
result records exact stage counts but does not repeat its bundle hash. The
retained lineage apply snapshot and authorization packet prove the completed
transaction identity, exact bundle/input hashes, packet hash, and consumed
decision identity. Proposal validation proves `lineage input -> bundle bytes`,
`packet -> lineage input/code/data bundle`, `lineage result -> completed exact
four-layer stages/counts/snapshot`, and `lineage input -> target` before
accepting the current relation/projection snapshot.

The proposal builder reads the live used-decisions ledger only during the
separately authorized read-only proposal and validates the historical lineage
entry. The frozen lineage binding stores only that immutable entry's
`decisionIdentity` and `dispatchPermitHash`; it does not store the live ledger
path or whole-file hash. The generic runner may append the new projection
decision before child spawn without invalidating the historical lineage entry.
Tests simulate that append and prove apply preflight still validates.

The proposal freezes the private read-only Owner authorization as
`proposalAuthorization`: its exact attempt-root path, byte SHA-256, decision
identity, and internal authorization hash. The input and completed/failed
results retain this binding; canonical authorization expands the artifact into
the data bundle; apply validates its bytes and exact schema before loading the
formal authorized context or connecting. A later current-time expiry does not
erase its historical role in creating the proposal, but byte, decision, path,
or authorization-hash drift fails closed. Tests mutate each field and the
artifact bytes and assert rejection before authorization/connection.

The proposal snapshot is a separate private immutable artifact with kind
`canonical_item_image_projection_snapshot`, the same operation/contract
version, generated time, target/policy/key identities, normalized relation
rows, normalized projection-before rows, and their hashes. The proposal binds
its path and byte SHA; the input contract and execution manifest carry both.
The materialized input adds `proposalPath` and
`proposalSha256`, sets `apply: true`, and otherwise preserves exact frozen
values. A completed result binds the input/proposal/lineage/target/key/count/before/after identities and has lowercase `status: 'completed'`, `apply: true`. A dispatched terminal failure has lowercase `status: 'failed'`, `apply: true`, the same input identity, and an error string; it never satisfies readiness.

The failed result repeats every common completed-result binding and adds exact
fields `startedAt`, `failedAt`, `transaction`, and `error`. `transaction` is
exactly `{ began, rolledBack, permitConsumed, dmlAttempted }`; `error` is
exactly `{ name, message }`. No extra keys are accepted, `rolledBack` must be
true whenever `began` is true, and `dmlAttempted` cannot be true when
`permitConsumed` is false. Failed evidence is retained after a non-zero child
exit but is never accepted as completion.

Every execution uses one immutable attempt namespace. The read-only Owner
authorization carries a unique `decisionIdentity`; `attemptId` is the lowercase
64-hex SHA-256 digest of that identity's UTF-8 bytes, and `attemptRoot` is
`reports/authorization/canonical/item-image-projection-apply/<attemptId>`.
That root owns `proposal-read.owner-input.json`, `snapshot.json`,
`proposal.json`, `input.json`, the exact execution manifest, the later formal
request/packet/permit artifacts, and `result.json`. Proposal, snapshot, input,
manifest, request, packet, permit, and result are private ordinary files and
no-overwrite. A dispatched failure retains its failed result permanently. Any
retry therefore starts with a fresh read-only Owner decision, a different
attempt ID/root, a fresh database snapshot/proposal/input/manifest, and a full
fresh formal authorization chain; no prior attempt path is reused or
overwritten. Contract assertions require every attempt-owned path to be a
direct child of the exact root and reject cross-attempt path mixing.

### Task 1: Pure Projection Contract And Private Evidence

**Files:**

- Create: `scripts/data/relation/item-image-projection-contract.test.mjs`
- Create: `scripts/data/relation/item-image-projection-contract.mjs`

- [x] **Step 1: Write failing contract tests**

Add `node:test` cases that import the wished-for exports and assert:

```js
assert.equal(ITEM_IMAGE_PROJECTION_OPERATION_ID, 'canonical-item-image-projection-apply');
assert.deepEqual(buildItemImageProjectionProposal(fixture), buildItemImageProjectionProposal(reversedFixture));
assert.equal(proposal.keys.length, proposal.targetRowCount);
assert.equal(proposal.projectionAfterRows[0].image, proposal.relationRows[0].cachedUrl);
assert.throws(() => buildItemImageProjectionProposal(missingKeyFixture), /key set/i);
assert.throws(() => buildItemImageProjectionProposal(duplicatePrimaryFixture), /duplicate.*primary/i);
assert.throws(() => buildItemImageProjectionProposal(unmanagedFixture), /managed/i);
```

Also test `writeItemImageProjectionPrivateJson` rejects overwrite, symlink endpoint, symlink ancestor, directory endpoint, paths outside the repository, and non-private existing modes; `readItemImageProjectionInputContract` rejects unknown keys, expired input at an injected `now`, snapshot drift, policy drift, and hash drift. Add strict attempt tests: the attempt ID is derived from the read-only decision, all attempt-owned paths share its exact root, a failed result blocks reuse of that root, and a fresh decision produces a distinct writable retry root. Add duplicate relation record key, duplicate projection ID/record key, and `projection.relationRecordKey !== relation.recordKey` rejection tests.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/relation/item-image-projection-contract.test.mjs`

Expected: FAIL because `item-image-projection-contract.mjs` or its exports do not exist.

- [x] **Step 3: Implement the minimal pure contract**

Export only the operation/contract/policy constants; attempt-owned artifact
paths are returned by `buildItemImageProjectionAttemptPaths`. Export these exact functions:
`canonicalItemImageProjectionHash(value)`,
`buildItemImageProjectionSnapshot(input)`,
`assertItemImageProjectionSnapshot(value)`,
`readItemImageProjectionSnapshot({ repoRoot, snapshotPath })`,
`buildItemImageProjectionProposal(input)`,
`buildItemImageProjectionInputContract({ proposal, proposalPath,
proposalSha256 })`, `assertItemImageProjectionProposal(value)`,
`assertItemImageProjectionInputContract(value)`,
`buildItemImageProjectionCompletedResult(binding)`,
`assertItemImageProjectionCompletedResult({ result, inputContract })`,
`buildItemImageProjectionFailedResult(binding)`,
`assertItemImageProjectionFailedResult({ result, inputContract })`,
`readItemImageProjectionInputContract({ repoRoot, inputContractPath, now })`, and
`writeItemImageProjectionPrivateJson({ repoRoot, outputPath, value, label })`.
Export `deriveItemImageProjectionAttemptId(decisionIdentity)` and
`buildItemImageProjectionAttemptPaths(decisionIdentity)`; do not export fixed
proposal/input/snapshot/result paths.

`canonicalItemImageProjectionHash` recursively sorts object keys, preserves
array order after the builders have sorted rows by `internalName`, serializes
with `JSON.stringify`, and returns the SHA-256 with the repository's
`sha256:` prefix. Each builder calls its corresponding strict assertion before
returning. Each assertion rejects missing or extra top-level/nested keys,
non-canonical row order, duplicate identities, count/hash disagreement, and
non-managed cached URLs. The completed-result assertion compares every binding
field to the input contract instead of accepting only status/apply flags.

Reuse `assertRepositoryPathConfinement`, `assertRepositoryOrdinaryFile`, and
`assertRepositoryOrdinaryDirectory` from
`scripts/data/lib/private-repository-path.mjs`; do not duplicate lexical
ancestry checks. Private writes create the already-validated parent with mode
`0700`, open a same-directory temporary ordinary file with exclusive mode
`0600`, fsync/close it, rename it without overwrite, and remove the temporary
file on failure.

- [x] **Step 4: Run GREEN**

Run: `node --test scripts/data/relation/item-image-projection-contract.test.mjs`

Expected: all contract/confinement tests PASS.

### Task 2: Deterministic Read-Only Proposal And Input Materializer

**Files:**

- Create: `scripts/data/relation/build-item-image-projection-proposal.test.mjs`
- Create: `scripts/data/relation/build-item-image-projection-proposal.mjs`

- [x] **Step 1: Write failing proposal tests**

Test `runItemImageProjectionProposal(options, dependencies)` with injected
lineage input/result/bundle/apply-snapshot/packet bytes, policy resolver, and DB
adapter. Assert the production-equivalent connection sequence and no DML:

```js
const proposal = await runItemImageProjectionProposal(options, {
  readLineageResultBytes: () => lineageResultBytes,
  readLineageBundleBytes: () => lineageBundleBytes,
  openReadOnlyConnection: async () => connection,
  readDatabaseSnapshot: async () => snapshot,
});
assert.equal(proposal.apply, false);
assert.equal(proposal.keys.length, 2);
assert.deepEqual(dbEvents, ['connect', 'start-read-only', 'read-snapshot', 'rollback', 'end']);
assert.equal(sql.some((text) => /INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER/i.test(text)), false);
```

Add missing/extra key, inactive relation/projection, missing projection,
duplicate primary, lineage result/input/bundle/apply-snapshot/packet/decision
drift, blank/unmanaged URL, fingerprint drift, wrong policy prefix/hash, missing
read-only Owner gate, expired generated/expiry window, and non-proposal option
rejection. Test proposal execution writes the private snapshot before the
proposal, both no-overwrite, and `materializeItemImageProjectionInputContract`
writes once and refuses overwrite.
Assert proposal/input freeze the exact read-only Owner artifact path, byte hash,
decision identity, and authorization hash. A changed artifact after proposal
creation fails apply preflight even if every database row is unchanged.

The lineage decision identity is derived from the retained packet and must
equal the consumed-ledger entry; it is not accepted as an independent CLI
string. Add wrong packet decision, missing ledger decision, and mismatched
result snapshot identity regressions. Serialize snapshot, proposal, and input
with the production canonical JSON writer in two reversed-row fixtures and
assert byte equality, not only object equality. Recompute the retained packet's
canonical `packetHash` from every packet field except `packetHash` (using the
generic packet verifier where its schema applies), rather than validating only
hash shape. Mutating any packet content while retaining the old hash must fail
before connection. Capture the matched historical ledger entry's exact
`dispatchPermitHash`, store that immutable hash in lineage, then append a later
unrelated decision to the live ledger and prove the already-built
proposal/input/apply preflight remain valid without reading or hashing the live
ledger again.

Add attempt retry tests: the proposal, snapshot, input, and result paths are
derived from the read-only decision's `attemptId`; a retained failed result
blocks reuse of that root, while a fresh decision yields a distinct root and
fresh artifact set.

Validate the retained lineage apply snapshot against its actual strict schema:
exact keys `{ operationId, takenAt, rowCount, layers }`, operation ID equality,
result `snapshot.snapshotId` path equality, `takenAt`/`rowCount` equality, and
exact layer keys `landing/maint/relation/local`. Add wrong snapshot path,
operation, count, timestamp, extra-key, and layer-key regressions.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/relation/build-item-image-projection-proposal.test.mjs`

Expected: FAIL because proposal entrypoint does not exist.

- [x] **Step 3: Implement the read-only entrypoint**

The CLI accepts only `--lineage-input-contract`, `--lineage-result`,
`--lineage-bundle`, `--lineage-apply-snapshot`,
`--lineage-authorization-packet`,
`--used-decisions=reports/authorization/canonical/used-decisions.json`, `--attempt-root`,
`--generated-at`, `--expires-at`, and
`--read-only-authorization=<attemptRoot>/proposal-read.owner-input.json`, plus database
identifiers. It verifies the private lineage input bytes bind the bundle path,
bundle SHA, expected identity count, and global three-database server
fingerprint; verifies the lineage result's schema/result kind/uppercase
completed status, all four applied stages/counts, and retained apply snapshot;
and verifies the packet's operation, decision identity, packet hash, input hash,
and consumed registry entry before accepting completion. The private read-only
Owner authorization artifact has exact fields `{ schemaVersion,
authorizationKind, operationId, action, actor, reason, authorizationReference,
decisionIdentity, authorizedAt, expiresAt, targetDatabases, noWrite,
authorizationHash }`. Its action is `read-only-proposal`, `noWrite` is true,
target databases equal the global triplet, the hash covers all preceding
fields, its decision identity derives the exact `attemptId`/`attemptRoot`, and
injected `now` must fall within its validity window. Creating the
real artifact is itself an explicit user authorization checkpoint and is never
done by isolated tests. Reject `--apply`, a
new projection packet/permit, raw input,
network options, and output overwrite. The exported runner receives injected
clock/authorization-reader/connection/snapshot dependencies. It refuses before
connection unless the private authorization artifact validates; then executes
`START TRANSACTION READ ONLY`, queries only the canonical relation database,
rolls back, and closes in `finally`. The global fingerprint remains the same
three formal databases used by generic authorization, while the operation-owned
DML scope is only relation `projection_items.image`. The production connection
configuration's host, numeric port, and exact local/maint/relation database
names must match the frozen target fingerprint before the first query; a
focused fixture proves host, port, or database drift fails before snapshot
reads.
No caller-selected ledger path is accepted: the CLI and exported production
runner require the canonical durable used-decisions path above, resolve it with
ordinary-file confinement, and reject aliases or alternatives before reading
authorization. The retained lineage packet is historical evidence: recompute
and validate its packet hash and original internal timestamp ordering, but do
not reject it merely because its `expiresAt` is earlier than the proposal's
current clock. Current-time expiry still applies to the new read-only Owner
authorization, generated proposal/input, and later formal projection packet.

The separate materializer accepts `{ proposalPath, inputContractPath }`, verifies proposal bytes and schema, and writes the candidate contract atomically as private `0600` evidence with no overwrite.

- [x] **Step 4: Run GREEN**

Run: `node --test scripts/data/relation/item-image-projection-contract.test.mjs scripts/data/relation/build-item-image-projection-proposal.test.mjs`

Expected: both suites PASS with no real DB access.

### Task 3: Database Snapshot And Transaction Adapter

**Files:**

- Create: `scripts/data/relation/item-image-projection-db.test.mjs`
- Create: `scripts/data/relation/item-image-projection-db.mjs`

- [x] **Step 1: Write failing adapter tests**

Use a recording fake connection. Prove `readItemImageProjectionSnapshot` selects only active primary `icon` relation rows and active projection rows for the exact frozen keys. For apply, assert event ordering:

```js
assert.deepEqual(events, [
  'begin', 'lock-relation', 'lock-projection', 'verify-fingerprint',
  'consume-permit', 'update-image-only', 'read-after', 'commit',
]);
```

Assert SQL contains `FOR UPDATE`, `SET \`image\` = CASE`, exact `internal_name IN (...)`, and active predicates. Assert every reachable DML statement excludes `INSERT`, `DELETE`, `local`, `landing`, `maint`, `relation_item_images` writes, and any projection assignment other than `image`. Add stale snapshot, affected-row mismatch, key drift, after-hash mismatch, SQL error, and permit failure rollback cases.

Add wrong `ownedDatabase`, `ownedTable`, and `ownedColumn` contract regressions;
each must fail before connection/permit and prove the only accepted ownership
tuple is `terria_v1_relation.projection_items.image`.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/relation/item-image-projection-db.test.mjs`

Expected: FAIL because the DB adapter does not exist.

- [x] **Step 3: Implement the minimal DB adapter**

Export exactly `readItemImageProjectionSnapshot(connection, contract)` and
`executeItemImageProjectionTransaction({ connection, inputContract,
consumeDispatchPermit })`. The snapshot function issues only the two SELECT
families described below and returns normalized rows plus the server UUID. The
transaction function owns `beginTransaction`, both locking reads, fingerprint
and frozen-contract comparison, the one permit callback, the parameterized
image-only UPDATE, after-state read/comparison, and commit; its catch path calls
rollback once and rethrows the original error.

The relation lock query selects `record_key`, `item_internal_name`, `cached_url`, `role`, `is_primary`, `status`, and `deleted` with `FOR UPDATE`. The projection lock query selects `id`, `relation_record_key`, `internal_name`, `image`, `status`, and `deleted` with `FOR UPDATE`. Rebuild and compare every frozen hash/count/key/fingerprint before permit use. Update through parameterized `CASE internal_name WHEN ? THEN ? ... END`; require affected rows to equal `changedRowCount`; reread under the same transaction and compare exact after rows/hash before commit.

- [x] **Step 4: Run GREEN**

Run: `node --test scripts/data/relation/item-image-projection-db.test.mjs`

Expected: all adapter ownership and transaction tests PASS.

### Task 4: Authorized Apply Entrypoint And Terminal Results

**Files:**

- Create: `scripts/data/relation/apply-item-image-projection.test.mjs`
- Create: `scripts/data/relation/apply-item-image-projection.mjs`

- [x] **Step 1: Write failing apply tests**

Test `runItemImageProjectionApply(options, dependencies)` with injected
filesystem/auth/connect/adapter functions. Assert every input, proposal,
proposal snapshot, proposal-read Owner authorization, lineage input/result/bundle/apply-snapshot/authorization-
packet and managed-policy source byte plus every SHA is verified
before `connect`; expiry is checked with injected `now`; authorized context
matches operation and the fully expanded data bundle; result path is private/
no-overwrite; and `apply !== true` is dry-run with no auth/DB/permit. Assert
success writes exactly one completed result after commit. Assert a dispatched
terminal failure rolls back and writes one strictly validated failed result;
a pre-dispatch/static validation failure writes no result.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/relation/apply-item-image-projection.test.mjs`

Expected: FAIL because the apply entrypoint does not exist.

- [x] **Step 3: Implement the apply orchestration**

CLI command shape:

```text
node scripts/data/relation/apply-item-image-projection.mjs \
  --input-contract=reports/authorization/canonical/item-image-projection-apply/<attemptId>/input.json \
  --apply=true \
  --output=reports/authorization/canonical/item-image-projection-apply/<attemptId>/result.json
```

Validate private input, proposal, proposal snapshot, lineage input/result/
bundle/apply-snapshot/authorization-packet, and managed-policy
source bytes before loading authorization or connecting. Load
`loadAuthorizedOperationContext({ operationId })`, require its data bundle to
bind every expanded artifact byte, and pass its `consumeDispatchPermit`
callback only to the DB adapter. Write a private strictly validated completed
or failed result with no overwrite; never retry automatically. Require manifest
command, its sole technical input root, input contract, and output to name the
same attempt directory. Apply preflight uses only the frozen `decisionIdentity`
and `dispatchPermitHash` of the historical lineage decision; it never reads
the live used-decisions ledger.
The expanded data-bundle validator is mandatory in production: absence of the
validator or any data-bundle hash/entry mismatch fails before connection,
authorization permit consumption, or DML. Isolated tests inject the validator,
and one regression intentionally omits it to prove the fail-closed ordering.
Apply also rebuilds the expected snapshot from the input/proposal fields and
compares every snapshot field and hash, not only the snapshot byte SHA/schema.

- [x] **Step 4: Run GREEN**

Run: `node --test scripts/data/relation/item-image-projection-contract.test.mjs scripts/data/relation/build-item-image-projection-proposal.test.mjs scripts/data/relation/item-image-projection-db.test.mjs scripts/data/relation/apply-item-image-projection.test.mjs`

Expected: all new projection suites PASS.

### Task 5: Canonical Catalog And Exact Execution Manifest

**Files:**

- Modify: `scripts/data/automation/canonical-operation-catalog.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.mjs`
- Modify: `scripts/data/automation/build-canonical-cutover-authorization.test.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.mjs`
- Modify: `scripts/data/automation/canonical-operation-execution-manifest.test.mjs`

- [x] **Step 1: Write failing catalog/manifest tests**

Expect the operation count to increase by one. This operation has no fixed
catalog data path because its immutable input is attempt-specific:

```js
assert.deepEqual(CANONICAL_OPERATION_DATA_PATHS[operationId], []);
assert.equal(CANONICAL_OPERATION_ENTRYPOINTS[operationId],
  'scripts/data/relation/apply-item-image-projection.mjs');
assert.deepEqual(manifest.outputPaths, [
  `${attemptRoot}/result.json`,
]);
assert.equal(manifest.databaseWrites, true);
assert.equal(manifest.networkAccess, false);
```

The verified execution manifest supplies exactly one input path,
`${attemptRoot}/input.json`, and is the only technical-input root for this
operation. Its command contains that input and `${attemptRoot}/result.json`;
manifest input, command input/output, and declared output must share the exact
attempt root. The manifest binds `attemptId` and rejects fixed legacy paths,
multiple roots, parent/descendant aliases, and cross-attempt paths.

Add a projection-specific nested-artifact resolver to
`build-canonical-cutover-authorization.mjs`. It reads the private input contract,
extracts proposal/snapshot/lineage input/result/bundle/apply-snapshot/packet
paths plus the proposal-read Owner authorization and immutable historical
decision/permit hashes, rejects path/hash
drift or duplicates, and appends those ordinary-file entries to `dataEntries`
before `dataBundleSha256` is computed. The live used-decisions ledger is never
part of the frozen projection bundle.
Every nested path is resolved with `assertRepositoryPathConfinement` and
`assertRepositoryOrdinaryFile`; private proposal/snapshot/input/packet
files also reject symbolic-link ancestors/endpoints and group/world modes.
Tests assert `request.dataBundleEntries` contains every bound artifact and
recompute `request.dataBundleSha256`; manifest `inputPaths` alone is not treated
as authorization binding.

Assert code bundle includes contract/proposal/DB/apply/private-path/auth helpers; input binding contains exact proposal, lineage, target, key, counts, and hashes; command contains only input/apply/output options.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/automation/build-canonical-cutover-authorization.test.mjs scripts/data/automation/canonical-operation-execution-manifest.test.mjs`

Expected: FAIL on missing operation/count/manifest branch.

- [x] **Step 3: Register and bind the operation**

Add the ID immediately after `canonical-item-image-lineage-apply`. Import the
projection contract reader/binding in the manifest, add operation-specific
code paths, command, input/output paths, DB write/network flags, and strict
contract assertions. `inputPaths` and authorization `dataBundleEntries` must
contain the private input, proposal,
proposal snapshot, lineage input/result/bundle/apply snapshot/packet, and the
managed policy evidence artifacts bound by the input; `outputPaths`
contains the projection result. The formal request, packet, dispatch permit,
and result paths are also rooted in the attempt directory. Creating a
replacement manifest/request for a retained failed attempt is rejected; the
retry regression builds a second manifest from a second read-only decision and
proves all paths and hashes are disjoint. The request/authorize CLI verifies the
execution manifest first and, before any write, requires request output to equal
`${attemptRoot}/request.json` and packet output to equal
`${attemptRoot}/packet.json`. Outside-root, sibling-attempt, symlinked-parent,
legacy fixed, and arbitrary absolute outputs are rejected before creating a
file; focused CLI fixtures assert no output exists after rejection. The code bundle explicitly includes apply,
contract, DB adapter, proposal builder, managed policy, private-path,
project-root, MySQL loader/runtime config, authorized context, catalog,
manifest, policy-set hash, and runner sources; tests compare the complete
expected set so dynamic imports cannot escape binding. Do not alter existing
NPC uppercase result or Shimmer bindings.

Add a source scan that rejects every dynamic `import()` expression in this
operation's runtime closure, including relative, absolute, package, computed,
and template-specifier forms. Runtime modules use static imports only; package
loading through the existing MySQL/project-root path is explicit in the code
bundle. Regression fixtures with `import('./unbound.mjs')`, `import(specifier)`,
and a template-specifier import must all fail manifest construction rather than
escaping the static dependency set.

- [x] **Step 4: Run GREEN**

Run the same two suites; expected: PASS.

### Task 6: Runner Applied-Completion Semantics

**Files:**

- Modify: `scripts/data/automation/run-authorized-canonical-operation.test.mjs`
- Modify: `scripts/data/automation/run-authorized-canonical-operation.mjs`
- Modify: `scripts/data/automation/authorized-operation-context.mjs`
- Modify: `scripts/data/automation/authorized-operation-context.test.mjs`

- [x] **Step 1: Write failing runner tests**

Add the new operation to the applied-completion matrix. Reject missing output,
wrong operation ID, uppercase `COMPLETED`, lowercase non-completed,
`apply: false`, expired input, and binding drift. Accept only exact lowercase
completed/apply-true projection result. A child that writes an exact private
`status: 'failed', apply: true` terminal result exits non-zero; the runner
retains that file, reports the non-zero operation failure with the result path,
and never converts it into outer `completed`. Retain assertions that existing
NPC uppercase schemas and Shimmer behavior still pass.
For this operation only, assert the authorized packet path, generated dispatch
permit path, manifest input, command input/output, and declared result all
share the exact attempt root. Add packet-from-attempt-A/manifest-B,
permit-from-A/input-B, canonical-root permit, and sibling-attempt output
regressions; each fails before child spawn.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/automation/run-authorized-canonical-operation.test.mjs`

Expected: FAIL because the projection operation is not treated as applied-completion evidence.

- [x] **Step 3: Extend operation-specific validation**

Replace the Shimmer-only boolean with an explicit set or validator dispatch containing `canonical-shimmer-import` and `canonical-item-image-projection-apply`. For the new operation call the contract module's exact completed-result assertion against its input contract; do not impose lowercase status on unrelated operations.
Extend `createAuthorizedOperationDispatchPermit` with an optional confined
exact `outputPath`; the projection runner supplies
`${attemptRoot}/permit.json` with private no-overwrite semantics, while every
existing operation keeps its current random canonical-root behavior. The child
verifies the permit environment path equals the attempt contract before it can
load authorization or connect.

- [x] **Step 4: Run GREEN**

Run the runner suite; expected: PASS.

### Task 7: Remove Only The Local Item Projection Reverse Bridge

**Files:**

- Modify: `scripts/data/relation/sync-maint-to-relation.test.mjs`
- Modify: `scripts/data/relation/sync-maint-to-relation.mjs`
- Modify: `docs/project-governance/00_CURRENT_SPEC.md`

- [x] **Step 1: Change tests first**

Replace expectations for `INNER JOIN local.items` / `SET pi.image = li.image` with assertions that no statement copies local item images into `projection_items.image`. Keep the existing armor-set assertions for `SELECT ... FROM local.items` and `UPDATE projection_armor_sets SET related_items_json = ?`. Assert summary no longer exposes `localItemImageFallbackRows` but retains `localArmorSetRelatedItemImageFallbackRows`.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/relation/sync-maint-to-relation.test.mjs`

Expected: FAIL because the item local fallback SQL is still emitted.

- [x] **Step 3: Remove the item-only fallback**

Delete `reconcileProjectionItemImageFromLocal`, its call, and its summary field. Preserve `reconcileProjectionItemImageFromMaint`, the flag needed by `reconcileProjectionArmorSetRelatedItemImagesFromLocal`, and all armor behavior.
Update the current spec's durable data-ownership facts: active primary
`relation_item_images.cached_url` owns item projection images;
`projection_items.image` is derived; general relation sync must not reverse-copy
`local.items.image`; armor-set local compatibility remains unchanged. This is a
current source-of-truth change, not a historical plan rewrite.

- [x] **Step 4: Run GREEN**

Run the relation sync suite; expected: PASS.

### Task 8: Fail-Closed Image-Lineage Readiness

**Files:**

- Modify: `scripts/data/audit/image-source-lineage-report.test.mjs`
- Modify: `scripts/data/audit/image-source-lineage-report.mjs`

- [x] **Step 1: Write failing readiness tests**

Pass a projection evidence object into `buildImageSourceLineageReport`. Assert item readiness fails with `missing_item_image_projection_apply_evidence` for absent evidence; distinct reasons for failed/dry-run/stale/wrong-lineage/wrong-target/wrong-key/wrong-count/wrong-after-hash/unmanaged/partial evidence; and passes only for exact completed evidence plus projection rows matching every expected after row. Other entity types must remain unchanged.

- [x] **Step 2: Run RED**

Run: `node --test scripts/data/audit/image-source-lineage-report.test.mjs`

Expected: FAIL because item readiness ignores projection apply evidence.

- [x] **Step 3: Implement exact readiness validation**

Add optional `itemImageProjectionEvidence` containing parsed result/input/
proposal/snapshot/lineage/policy bytes and identities. For `items`, call the
projection contract validator and compare the current projection rows to the
expected after rows. CLI `--source=db` requires
`--attempt-root=reports/authorization/canonical/item-image-projection-apply/<attemptId>`,
derives `result.json` and `input.json` from that root, verifies the attempt ID
against the input contract, and resolves every bound artifact without writing
them; it never guesses a latest directory or follows an unauthenticated
pointer. Missing attempt root, malformed ID, legacy fixed path, symlinked root,
and result/input from different attempts are separate fail-closed tests. An injected-loader CLI
fixture test exercises exact path resolution and proves missing/stale evidence
is reported fail-closed. The DB loader executes `START TRANSACTION READ ONLY`,
performs SELECT statements only, rolls back, and closes in `finally`; the
fixture records SQL and rejects any DML. Absent or invalid evidence remains a gap reason, not
an exception that marks ready.

- [x] **Step 4: Run GREEN**

Run the audit suite; expected: PASS.

### Task 9: Integrated Offline Verification, Review, Devlog, And Commit

**Files:** all files listed in this plan plus implementation devlog/current index.

- [x] **Step 1: Run focused integrated tests**

Run:

```bash
node --test \
  scripts/data/relation/item-image-projection-contract.test.mjs \
  scripts/data/relation/build-item-image-projection-proposal.test.mjs \
  scripts/data/relation/item-image-projection-db.test.mjs \
  scripts/data/relation/apply-item-image-projection.test.mjs \
  scripts/data/relation/sync-maint-to-relation.test.mjs \
  scripts/data/automation/build-canonical-cutover-authorization.test.mjs \
  scripts/data/automation/canonical-operation-execution-manifest.test.mjs \
  scripts/data/automation/run-authorized-canonical-operation.test.mjs \
  scripts/data/audit/image-source-lineage-report.test.mjs
```

Expected: all focused tests PASS with no network or DB access.

- [x] **Step 2: Run syntax and ownership gates**

Run `node --check` for each changed `.mjs`; scan the dedicated DB/apply files to prove no projection INSERT/DELETE and no writes to local/landing/maint/relation image tables; scan relation sync to prove `SET pi.image = li.image` is absent while armor compatibility remains; run `git diff --check`.

- [x] **Step 3: Independent review**

Request read-only spec/security review against the approved design. Any Critical/Important finding returns the implementation entry to `active`; add a failing regression, repair, rerun affected gates, and re-review before commit.

- [x] **Step 4: Close devlog and stage explicit paths**

Record test counts, review disposition, residual risk, and the next authorization gate. Set the implementation entry to `closed` with `commit SHA pending in final response`, remove it from `current.md` open work, and stage only the exact plan/devlog/source/test paths. Never use `git add .`.

- [x] **Step 5: Verify staged scope and commit**

Run `git status --short`, `git diff --cached --stat`, and `git diff --cached --check`. Inspect `git diff --cached --name-status` for one-task scope, then commit:

```bash
git commit -m "feat(data): govern item image projection apply"
```

- [x] **Step 6: Stop at the read-only database authorization gate**

Do not create the real proposal or its authorization artifact in this code
checkpoint. Report the exact operation ID and no-write boundary and propose the
read-only Owner artifact fields: decision identity, actor, reason, reference,
global target triplet, zero-write effect, authorization time/expiry, and the
artifact's authorization hash computed only from those proposed fields. The
canonical apply request hash cannot exist until the separately authorized DB
snapshot, proposal, and input bytes exist; label it
`deferred until read-only proposal completion` rather than deriving it from
unread target state. Real proposal materialization, canonical request,
packet/permit, and apply remain separate authorization checkpoints.

- [x] **Step 7: Record CODE_READY rather than data closure**

The focused commit closes only implementation state: `CODE_READY` means all
offline contract/transaction/catalog/runner/relation-sync/readiness tests and
independent review pass. The original data-visible goal remains blocked because
no shared DB proposal or apply has run and current projection rows are not yet
proved managed/gap-free. Name Codex and
`docs/devlog/entries/2026-08-04-item-image-projection-apply-runtime.md` as the
new runtime child entry and owner
of the read-only proposal checkpoint; later formal apply and refreshed lineage
report are separate Owner-authorized tasks. Do not mark automated ingestion or
item-image projection data closure complete at this commit.

## Plan Repair Rule

If implementation exposes a missing contract field, stale-source race, conflicting schema, or readiness gap, patch this plan without changing the main goal, self-review the affected goal/source/boundary/evidence gates, then continue. Do not broaden into backend policy, local image ownership, armor compatibility removal, or shared runtime actions.
