# Buff Item Maint Readiness

Date: 2026-10-06. Owner: Codex, Buff continuation.

## Result

The Item dependency check is reproducible and remains non-executable. Fifteen
Buff source-item facts collapse to thirteen unique Item identities: six exact
active maint matches, six missing maint identities, and one source-name drift.
All thirteen identities are independently present in the frozen Iteminfo data.
The six missing maint rows have complete source-derived previews, not insert
receipts or published identities.

| Game Item ID | Source internal name | Dependent Buff IDs |
| --- | --- | --- |
| 6148 | PalworldMinionTrustyCattiva | 389 |
| 6149 | PalworldMinionTrustyFoxsparks | 390 |
| 6155 | LightningStrike | 399, 400 |
| 6161 | ClayPotMinion | 393 |
| 6164 | ForbiddenMinion | 394 |
| 6173 | ArcSurge | 399, 400 |

`FlaskOfVenom` in the Buff page payload differs from both Iteminfo and maint
`FlaskofVenom` at game ID `1340`. The canonical source and maint agree; the
page-derived identity still needs an explicit disposition. No alias or source
replacement was silently introduced.

## Evidence

- Runtime artifact: `.local/tmp/buff-item-maint-readiness-20261006-v3.json`.
- File SHA-256:
  `sha256:3ae55341eb4655fd9387cb642c52e26c9aad65efa8ec983f942e4a5b9941bd8f`.
- Local replay: `.local/tmp/build-buff-item-maint-readiness-20261006-v1.mjs`;
  it uses the pure classifier `pipelines/maint/buff-item-maint-readiness.mjs`
  and existing `extractMaintEntitiesFromLandingRow` without calling sync/apply.
- Frozen Iteminfo capture: `.local/tmp/buff-iteminfo-semantic-capture-20261001-v2/`.
  The existing semantic verifier binds raw bytes, input, manifest, and the
  data/doc/datagen revisions before any source derivation. Iteminfo data
  revision is `1023241`; the source declares Terraria `1.4.5.7`.
- Frozen dependency identity source:
  `.local/tmp/buff-secondary-identity-lineage-audit-20261005-v1.json`, checked
  against its recorded byte hash before use.
- Fresh transaction: MySQL UUID `b4ae6728-4f72-11f1-bcc9-00155d37eadf`, port
  `13306`; `SET TRANSACTION READ ONLY`, complete SELECT snapshots, rollback.
  Snapshot counts are `6146` maint and `6208` active local Item rows. Their
  hashes and both classifier/extractor code hashes are in the runtime artifact.
- Authenticated preflight:
  `.local/tmp/buff-item-maint-readiness-preflight-20261006-v1.json`, HTTP `200`,
  scheduler disabled, live attempts/claims `0/0`, healthy reconciler, unchanged
  H8/epoch. This proves control containment; it is not ingestion acceptance.

## Contracts

The classifier rejects absent Iteminfo evidence, duplicate IDs, invalid maint
primary/source keys, conflicting name/ID joins, inactive or unknown maint
state, and names that collide after case folding. It retains affected Buff
IDs while deduplicating Item dependencies and never mutates input snapshots.

Local `items` has no game `source_id` column. Its auto-increment IDs are
compatibility evidence only. The replay joins them by exact source internal
name only for diagnostic context; it never copies those IDs into a canonical
source identity. This schema difference caused one SELECT to fail before
artifact generation; inspection of `information_schema.columns` established
the cause, and the corrected SELECT completed in a new read-only transaction.

The six previews use the existing maint extractor's numeric/flags/raw source
fields. Their `landingSourceId` and `maintRowId` remain null. The extractor's
unmaterialized zero ID is explicitly removed from the preview; a future
registered executor must supply the actual insert receipt and locked identity
checks. The artifact reports `executable=false`, `applyAllowed=false`, and
`databaseWrites=false`; no authorization packet or business write was produced.

## Remaining Execution Gates

1. Freeze and review a bounded Item-owned landing/maint insert operation for
   exactly these six game IDs. It must preserve existing Item rows, supply
   real landing/maint receipts, lock the source ID/name predicates, rederive
   the source under lock, and perform independent post-commit readback.
2. Resolve the `1340` page/canonical spelling drift explicitly. Current source
   bytes already establish the canonical spelling; that is evidence, not a
   permission to rewrite the Buff page payload.
3. Complete the separate NPC immunity secondary contract. The previous audit's
   `114` display-only facts remain without stable source IDs and were not
   reclassified in this task.
4. Complete the independent `389-400` zero-baseline/full-chain ownership and
   executor gates, rederive the entire Buff candidate from fresh snapshots,
   and obtain its exact operation-bound authorization before publication.

## Validation

New classifier tests passed `11/11` after observed RED assertions. Combined
Iteminfo/maint/Buff candidate/identity/maint-plan regression passed `99`, with
`0` failures and `1` pre-existing skipped Shimmer-page test (`100` total).
New classifier and local replay pass Node syntax checks. Artifact assertions
verify six exact IDs, null generated identities, Terraria version, and current
code hashes; `git diff --check` passes. Final Buff business counts remain
`388/388/388/1290/0` (maint/relation/projection/NPC secondary/Item secondary).
No full quality gate or browser suite was run for this pure diagnostic change.

Scheduler/control, crawler/source requests, packet/permit, and business-table
writes were not performed. Authentication for preflight used the existing
loopback admin login; routine authentication audit state is separate from the
SELECT-only data audit. No commit, push, staging, or cleanup occurred.
