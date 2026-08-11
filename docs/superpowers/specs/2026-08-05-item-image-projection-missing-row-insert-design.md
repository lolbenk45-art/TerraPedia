# Item Image Projection Missing-Row Insert Design

## Goal

Close the governed item-image projection gap without widening the existing
image-only update authority: create the five active `projection_items` rows
that are absent from the formal projection, then use the existing operation to
update `image` for all active projection rows.

## Scope And Boundary

The separate operation is limited to these lineage keys:

- `AntlionEggs`
- `BoneWhip`
- `RoninShirt`
- `TimelessTravelerHood`
- `TVHeadPants`

It may insert exactly one `projection_items` row per listed key, with the
image value copied from the immutable active primary relation image evidence.
It must not update any existing row, delete any row, alter schema, or touch
the 20 active projection-only rows. The existing
`canonical-item-image-projection-apply` operation retains its image-only,
existing-row update contract and cannot acquire INSERT authority.

## Contract

The new insert operation has a distinct operation ID, proposal, input
contract, authorization request, packet, one-time dispatch permit, and result
path. Every artifact is derived from one ADMIN read-only decision and lives in
its decision-derived immutable attempt root.

The read-only proposal opens a read-only transaction and verifies all of the
following before it writes any evidence:

- the current formal target matches the explicit local target;
- the completed `canonical-item-image-lineage-apply` evidence remains bound to
  its input, bundle, snapshot, packet, and dispatch permit;
- the exact key set is the five approved missing keys;
- all five keys have active primary managed relation URLs;
- none of the five keys already exists in active `projection_items`;
- the five rows have all mandatory non-image fields required by the existing
  projection schema, derived only from the relation/projection source
  contract.

The apply command revalidates proposal, snapshot, hashes, target, managed URL
policy, and permit before one transaction. It inserts the five expected rows
only, asserts an insert count of five, and rolls back on any mismatch. A
post-transaction read verifies that the five images equal relation values and
that the 20 pre-existing projection-only rows are unchanged.

## Sequence

1. Add unit contracts and an execution-manifest registration for the bounded
   five-row insert operation.
2. Generate fresh ADMIN read-only authorization, materialize a proposal, and
   generate a second ADMIN apply authorization from the resulting immutable
   input.
3. Execute only the bounded INSERT operation and retain the result evidence.
4. Generate a new read-only proposal for the existing image-only projection
   update, then create and execute its separate ADMIN authorization.
5. Run the image-lineage audit, item-image readiness audit, and cross-database
   quick audit. Continue to shimmer, source flip, L1/L2, and scheduler only
   after the item-image blocker is cleared.

## Failure Handling And Tests

All mismatches fail closed before DML. Tests cover catalog/manifest binding,
attempt-root confinement, the exact five-key allowlist, absent-row preflight,
managed relation image enforcement, SQL parameter scope, rollback behavior,
and rejection of update/delete or an unexpected row count. Existing projection
tests must remain green to prove the image-only update boundary was not
changed.

## Out Of Scope

No crawler run, source flip, scheduler activation, service lifecycle action,
schema migration, projection-only-row cleanup, or shimmer work is included in
this design.
