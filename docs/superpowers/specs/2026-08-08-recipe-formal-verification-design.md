# Recipe Formal Read-Only Verification Design

## Goal

Repair the Recipe formal evidence chain without replaying the completed
2026-07-29 apply. Bind the current 3,663-row input, the original applied
pipeline result, and the current formal `wiki_zh` database scope into one
fresh read-only verification report, then make Recipe readiness reject the
later overwritten two-row standalone import report.

## Confirmed State

`canonical-recipe-apply-20260729-03` already completed successfully. The
pipeline summary retains the applied import result: 41 pages, 3,663 raw rows,
3,571 imported recipes, 5,965 ingredient rows, 4,337 station rows, and zero
placeholder or unresolved item/station rows. Formal readback currently reports
11,658 recipes, 19,601 ingredients, 15,195 stations, including 3,571
`wiki_zh` recipes.

The standalone `reports/wiki-zh-recipe-import-2026-07-29.json` was overwritten
later by an `apply=false` temporary two-row sample. Existing Recipe source
readiness checks only its presence, so the malformed evidence can pass.

## Authority And Chain

The verifier uses three independent read-only facts:

```text
current crawler snapshot bytes -> SHA-256 + page/raw-row counts
historical pipeline summary    -> embedded applied import and consolidation
formal recipe tables           -> wiki_zh projection hash + exact scope counts
```

The current input hash must equal
`3503bdd42c623d8ec919aa3d4bc3c8e77d217f4cacb85a5bfd9d4c869752aefc`.
The embedded import must be `apply=true`, target `terria_v1_local`, reference
the canonical input filename, report 3,663 raw and 3,571 imported recipes,
match the expected row counts, contain no placeholders/unresolved relations,
and expose the import-stage target scope hash.

Execution-time investigation confirmed that the subsequent applied
display-name backfill changes `ingredient_name_raw` and `station_name_raw`,
both of which participate in the projection hash. The import-stage target
`b14dc414734cd3cac11f364039482eaa89594bae8277bfcae787955b0bdd2ee3`
therefore cannot equal the final database hash. The verifier separately binds
the applied backfill result (124 group ingredients, 239 station names, and zero
remaining sync gaps) and freezes the audited post-backfill formal hash
`582c4152aa4fe770bce41c431420230e82586d8322424edf877387e184ecf20e`.

The standalone report is checked separately. It is valid only when its
applied semantics and key counts match the embedded result. The known two-row
dry-run is classified `superseded-invalid`; it can never satisfy readiness.

## Verifier Contract

Add `scripts/data/recipe/recipe-formal-verification.mjs` with an injectable
connection for tests and a CLI that defaults to the canonical input, historical
pipeline summary, standalone report, formal local database, and
`reports/canonical-migration/canonical-recipe-formal-verification.json`.

The database connection is explicitly read-only. The verifier runs no DDL,
DML, transaction probe, importer, backfill, consolidation, Wiki request, or
automation operation. It queries Recipe scope and relationship rows only,
normalizes them with the importer's shared projection contract, and closes the
connection before publishing evidence.

The report contains:

- `schemaVersion`, `generatedAt`, `status`, and `mode=read-only`;
- canonical relative paths and SHA-256 hashes for all three input artifacts;
- input page/raw-row counts;
- embedded formal decision identity and applied import/backfill/consolidation
  metrics;
- formal total and `wiki_zh` scope counts, unresolved counts, and projection
  hash;
- standalone classification and mismatch reasons;
- named checks, blocking reasons, and `writesAttempted=false`.

No report is published with `status=passed` unless every authoritative check
passes. A failed run may emit a failed report for diagnosis but exits nonzero.

## Readiness Repair

`support.recipe/sourceReadiness` requires the new canonical verification report
instead of treating the latest standalone import report as optional presence
evidence. Semantic validation requires `status=passed`, `mode=read-only`,
hashes that match the current artifact bytes, valid import-stage and frozen
post-backfill scope hashes, expected counts, zero unresolved relations, and
`writesAttempted=false`.

The crawler snapshot producer-shape validation remains. Recipe blocking
consolidation/coverage checks remain separate. This change does not weaken any
existing threshold.

## Failure Boundaries

Fail closed on input hash/count drift, missing or non-applied pipeline evidence,
wrong database identity, formal scope hash/count drift, unresolved relations,
malformed report paths, or query/write ambiguity. The known standalone
overwrite is reported but does not require replaying the apply because the
authoritative embedded result and current formal state are independently
matched.

## Validation

- Verifier unit tests cover pass, input drift, missing/invalid pipeline result,
  formal scope drift, unresolved relations, and standalone overwrite.
- Readiness tests prove the two-row standalone report cannot pass and only a
  semantically complete canonical verification report can close source
  readiness.
- Run the verifier once against the formal database using read-only behavior,
  inspect the generated report, rerun Recipe source/blocking readiness, and run
  `git diff --check`.

## Boundaries And Residual Risk

No Wiki fetch, Recipe import, display-name backfill, provider consolidation,
formal database write, new write authorization, crawler, scheduler, V1 queue,
push, merge, or worktree cleanup is authorized. This verifies the frozen
2026-07-29 Recipe state; it does not prove a newer upstream recipe snapshot or
authorize a future refresh.
