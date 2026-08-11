# Item Canonical Identity Reconciliation Design

## Goal

Reconcile five legacy-page records that were incorrectly admitted to the
canonical item-ID namespace, then restore the five current standardized
entities without using local compatibility data as a source.

## Scope

The immutable key and standardized-ID set is:

- `RoninShirt` / `5049`
- `TimelessTravelerHood` / `5051`
- `TVHeadPants` / `5063`
- `AntlionEggs` / `5067`
- `BoneWhip` / `5074`

The read-only proposal must verify every record in
`data/standardized/items.standardized.json`; the five exact legacy occupants in
`maint_items`, `relation_items`, and `projection_items`; their historical
`legacy` provenance; five corresponding `item_projectile_audits` rows; active
managed primary relation-image evidence for the standardized keys; and no
loot, shop, recipe, or buff references. Local `items` are comparison-only
evidence and may not supply IDs or field values.

## Apply Boundary

A distinct `ADMIN` reconciliation operation first writes an immutable archive
containing all twenty rows scheduled for removal, then in one governed
transaction hard-deletes exactly five historical rows from each of
`maint_items`, `relation_items`, `projection_items`, and
`item_projectile_audits`. It then inserts only the five frozen source-backed
standardized rows into `maint_items`, their canonical relation rows, and their
complete `projection_items` rows. It may not update any existing row, write
local items, use `ON DUPLICATE KEY`, alter schema, or touch the other fifteen
standardized-absent legacy rows.

Every write is bound to a fresh read-only snapshot, a hash-bound input,
execution manifest, request, packet, one-time permit, and terminal result.
The apply preflight locks/rechecks legacy identity, history markers, exact
audit scope, lack of protected consumer references, standardized source, and
image evidence before consuming the permit. It requires exactly `5/5/5/5`
deletions and `5/5/5` inserts and rolls back the whole operation on mismatch.

## Completion

After the five canonical rows are reconciled, generate a new read-only proposal
for the existing image-only projection operation. It must observe all 6131
lineage keys in active `projection_items`, then run its independently
authorized image update. Finish with image-lineage, items readiness, and
cross-DB quick audits.

## Out Of Scope

No reverse copy from local compatibility tables, full maint/relation rebuild,
crawler run, source flip, shimmer work, scheduler activation, schema change,
or cleanup of the other fifteen legacy-only rows is authorized.
