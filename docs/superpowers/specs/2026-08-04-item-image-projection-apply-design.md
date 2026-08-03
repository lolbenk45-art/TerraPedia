# Item Image Projection Apply Design

Date: 2026-08-04
Status: approved
Branch: `design/crawler-auto-ingestion-readiness`

## Goal

Close the remaining governed item-image projection gap without widening the
already consumed four-layer lineage authorization. The new operation updates
only existing active `terria_v1_relation.projection_items.image` values from
the canonical relation image lineage and produces exact preview, authorization,
transaction, and result evidence.

Closure requires all target projection images to be managed URLs and the image
lineage report to stop reporting projection gaps. This design does not itself
authorize a proposal against the shared database or a formal apply.

## Current Facts

- The completed item-image lineage operation owns landing, maint, relation, and
  local image layers for 6,131 item identities.
- Its consumed packet does not own `projection_items` and must not be widened or
  reused.
- `projection_items.image` currently contains 6,129 dead localhost values and
  two blank values for items with core image evidence.
- The general relation sync rebuilds `projection_items`, fills image values from
  maint, and can then fall back from `local.items.image` when a projection image
  is blank or unmanaged.
- `projection_items` is a derived compatibility surface, not a source-of-truth
  fact layer. Its image source must be `relation_item_images.cached_url`.
- Existing backend and mapper changes in the worktree concern image URL reading
  and public projection. They do not provide governed ownership of this table.

## Approved Scope

The new operation ID is `canonical-item-image-projection-apply`.

It may:

- read the completed four-layer lineage result and bundle;
- read active owned rows from `relation_item_images`;
- read and lock matching active rows from `projection_items`;
- update only `projection_items.image` for the exact frozen identity set;
- write private proposal, input-contract, snapshot, and result artifacts.

It may not:

- insert or delete `projection_items` rows;
- update any other projection column;
- read `local.items.image` as a projection image source;
- write landing, maint, relation-image, local item, or local item-image rows;
- widen or reuse the consumed `canonical-item-image-lineage-apply` packet;
- start a crawler, perform network access, restart services, or trigger another
  canonical operation;
- infer approval from this design or conversational continuation.

## Considered Approaches

### Dedicated Projection Operation - Chosen

Create one operation whose owned database field is exactly
`projection_items.image`. It has an independent read-only proposal, private
input contract, one-time authorization, apply result, and rollback evidence.

This keeps the smallest write surface and preserves the historical four-layer
authorization boundary.

### Extend The Four-Layer Operation - Rejected

Adding projection writes to the completed operation would change the scope of
an already consumed packet and make its historical result ambiguous. A future
versioned replacement would still mix two independently reviewable ownership
surfaces.

### Reuse General Relation Sync - Rejected

The general sync can rewrite many relation and projection tables. Even with the
local image fallback disabled, its transaction and evidence surface is much
larger than the one-field repair and cannot prove exact item-image ownership.

## Components

### Read-Only Proposal Builder

The proposal builder receives the exact completed four-layer lineage result and
bundle paths plus an explicitly configured local database triplet. It opens a
read-only transaction and loads:

- the frozen item identity set from the lineage bundle;
- exactly one active owned primary `relation_item_images` row per identity;
- the matching active `projection_items` row per identity;
- the target database fingerprint.

It rejects missing or extra identities, duplicate owned primary rows, missing
projection rows, blank cached URLs, unmanaged cached URLs, inactive rows, and
lineage result/bundle drift. It produces deterministic before and after rows,
key lists, counts, hashes, and a candidate input contract. It does not accept
apply, packet, permit, raw input, or network options.

### Private Input Contract

The contract materializer accepts only a verified proposal and writes the
canonical private input contract atomically with no overwrite. The contract
binds:

- operation ID and contract version;
- lineage result and bundle paths plus SHA-256 identities;
- proposal path and SHA-256 identity;
- database triplet and target fingerprint;
- exact ordered item key set and its hash;
- selected relation record keys, cached URLs, and row hash;
- projection before rows and hash;
- expected projection after rows and hash;
- expected target and changed row counts;
- managed URL prefix contract;
- generated-at and expiry metadata required by canonical authorization.

Any input, code, proposal, target, or fingerprint change requires a new request.
The contract, proposal, snapshot, and result must use the existing private
ordinary-file and no-symbolic-link confinement helpers.

### Canonical Apply Entrypoint

The canonical execution manifest invokes a dedicated projection apply script.
The generic runner verifies the registered operation, static artifacts, private
paths, declared outputs, code/data bundle, and one-time decision before spawn.

The child then:

1. loads the authorized context and verifies every frozen artifact before a DB
   connection is opened;
2. begins one transaction;
3. selects and locks the exact active relation and projection rows;
4. recomputes the relation source, projection before state, key set, counts, and
   target fingerprint;
5. rolls back without DML if any value differs from the approved contract;
6. consumes the child dispatch permit immediately before the first UPDATE;
7. updates only `projection_items.image` for the exact frozen keys;
8. recomputes the after rows, count, key set, and hash in the same transaction;
9. commits only when all expected values match;
10. writes a private completed result, or a private failed result when an
    authorized child reaches a terminal failure.

The update must be scoped by the frozen internal-name set and active row
predicate. It must not create a projection row when a target is missing.

### General Relation Sync Ownership Repair

The normal relation sync must stop using `local.items.image` to reconcile
`projection_items.image`. Maint/relation-backed image propagation remains, but
the local reverse bridge is removed from this field so a later broad sync cannot
reintroduce non-source-owned values.

Any existing armor-set related-item compatibility behavior remains outside this
change and retains its own current flag and tests.

### Readiness Integration

The image lineage audit continues to inspect projection values independently.
Projection readiness additionally requires a completed exact
`canonical-item-image-projection-apply` result bound to the current lineage
result, proposal, contract, target fingerprint, key set, counts, and after hash.

Dry-run, failed, stale, wrong-bundle, wrong-target, incomplete, unmanaged, or
partially updated evidence remains non-ready.

## Failure Semantics

- Proposal validation failures write no canonical input contract and perform no
  database writes.
- Static input or path validation fails before the apply child opens a DB
  connection.
- Transaction snapshot drift fails before child permit consumption and DML.
- The outer one-time decision may already be consumed by runner dispatch. It is
  never reusable after any dispatched terminal failure.
- SQL errors, affected-row mismatch, key drift, or after-hash mismatch roll back
  the transaction.
- No failure path invokes general relation sync, retries automatically, widens
  scope, or starts shared services.
- A retry requires a fresh proposal, contract, request, decision identity, and
  packet from current bytes and current target state.

## Test Design

### Proposal And Contract

Tests must cover:

- deterministic proposal and candidate contract bytes;
- exact full key-set success;
- missing and extra identities;
- missing projection rows;
- duplicate owned primary relation images;
- inactive, blank, unmanaged, or out-of-scope rows;
- lineage result/bundle mismatch;
- target fingerprint drift;
- private path, ordinary-file, no-overwrite, and symlink-ancestor rejection.

### Apply And Transaction

Tests must prove:

- source and target rows are locked and compared before permit consumption;
- only scoped `projection_items.image` UPDATE statements are executed;
- no projection INSERT, DELETE, or other-column UPDATE is reachable;
- local, landing, maint, and relation image tables are not written;
- stale snapshots, affected-row mismatch, and after-hash mismatch roll back;
- successful apply commits once and emits an exact private result;
- failed dispatched work emits a terminal private failure result;
- consumed decision and permit identities cannot be reused.

### Catalog, Runner, And Readiness

Tests must prove:

- the operation catalog and execution manifest bind the exact entrypoint, input,
  result, snapshot, code files, data files, and declared outputs;
- generic runner confinement and result checks apply to the new operation;
- the general relation sync never copies `local.items.image` into
  `projection_items.image`;
- armor-set compatibility behavior is unchanged;
- readiness fails on missing/stale/partial/non-managed evidence and passes only
  on an exact completed result plus projection rows with managed URLs.

## Validation Stages

The code checkpoint uses only isolated fixtures, temporary directories, and
injected adapters. It runs focused Node tests, syntax checks, targeted ownership
scans, and `git diff --check`. It does not connect to a real database.

After code review and commit, a separate authorization checkpoint may permit a
read-only proposal against the shared local database. The proposal is inspected
before any input contract or apply request is materialized.

Formal apply requires a second exact Owner authorization naming the current
request hash, decision identity, actor, reason, reference, authorization time,
expiry, database targets, expected row counts, and rollback boundary.

Runtime acceptance requires:

- exact key-set, before/after hash, database fingerprint, and changed-row match;
- all target projection values classified as managed URLs;
- no projection lineage gaps in the refreshed audit;
- no active transaction, leaked permit, temporary process, or `.tmp` residue;
- no shared service lifecycle change;
- the consumed decision and result retained as immutable evidence.

## Expected Implementation Surfaces

The implementation plan may add dedicated projection proposal, contract, DB
adapter, apply, and tests under `scripts/data/relation/` or
`scripts/data/automation/`. It will update the canonical operation catalog,
execution manifest, authorization tests, image lineage readiness, and the
general relation sync local-fallback regression.

The implementation must not modify backend mapper or image URL policy files
already dirty in this worktree unless a later focused RED test proves they are
part of this operation's contract.

## Authorization Gates

No authorization is needed for isolated code and test development.

Separate explicit confirmation is required before:

1. opening the shared database to create the real read-only proposal;
2. materializing the real canonical input contract and request if the approved
   operating procedure requires a pre-request Owner checkpoint;
3. creating a packet or permit;
4. executing the formal projection apply;
5. running any source flip, Shimmer operation, L1/L2 action, scheduler action,
   crawler, network request, MinIO write, or service lifecycle command.

At each required checkpoint, the coordinator reports the exact operation ID,
request hash, decision identity, actor, reason, reference, targets, expected
effects, expiry, and rollback or no-write boundary before asking for approval.
