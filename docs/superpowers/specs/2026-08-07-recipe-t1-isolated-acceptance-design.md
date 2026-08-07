# Recipe T1 Isolated Acceptance Design

## Goal

Add a governed `canonical-recipe-t1-acceptance` operation that proves the
recipe crawler output can pass through import and relation consolidation in a
disposable three-database environment without writing the formal databases.

## Boundary

- Reuse the existing T1 database provisioner, restricted accounts, run-key
  registry, Redis reservation, snapshot verification, and cleanup path.
- Copy the current formal `local`, `maint`, and `relation` schemas and bounded
  source rows into unique `terria_v1_automation_acceptance_<runKey>_*`
  databases.
- Run the existing recipe sync pipeline against the isolated local database.
- Keep `canonical-recipe-apply` unchanged as the separately governed formal
  operation.
- Do not crawl items, enable a scheduler, or write any formal database.

## Operation Contract

The new operation uses `run-live-automation-acceptance.mjs` with
`--profile=t1 --scope=recipe-canonical`. Its execution manifest freezes the
private config path and hash, Redis DB, run ID, recipe input hash, code bundle,
server fingerprint, and exact evidence output path. The manifest declares
`databaseWrites=false`, `isolatedResourceWrites=true`, and `networkAccess=false`.

The child process requires an authorized packet and one-time dispatch permit
before it creates any resource. Config, data bundle, execution manifest, live
server fingerprint, Redis DB, and run ID drift fail closed.

## Acceptance Flow

1. Provision and verify the isolated three-database snapshot.
2. Record formal recipe-table counts and hashes through the read-only source
   connection.
3. Execute the recipe import and consolidation pipeline against the isolated
   local database only.
4. Verify non-empty recipe heads, ingredient/station relations, and referential
   integrity; record before/after counts and hashes.
5. Exercise the shared rollback/commit/restore probe.
6. Drop isolated databases and accounts, release Redis, and verify cleanup.
7. Re-read formal recipe-table counts and hashes and require exact equality.

## Evidence

Write private evidence to
`reports/canonical-migration/canonical-recipe-t1-acceptance.json`. Evidence
binds the request, packet, manifest, source snapshot, verification hash,
isolated before/after counts, formal before/after hashes, transaction probes,
and cleanup result.

## Failure Handling

Any target-name mismatch, formal database argument, missing recipe input,
packet drift, failed pipeline stage, relation-integrity error, formal snapshot
change, or incomplete cleanup fails the operation. Cleanup runs in `finally`
and evidence is published only after cleanup succeeds.

## Validation

- Contract tests for catalog, manifest, request, and authorized CLI preflight.
- Acceptance tests proving exact isolated database arguments and formal-target
  rejection.
- Live ADMIN-authorized T1 run with independent database/account/Redis cleanup
  readback.
- `git diff --check` and the focused automation/recipe test set.
