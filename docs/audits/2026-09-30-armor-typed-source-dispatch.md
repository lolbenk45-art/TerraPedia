# Armor typed-source dispatch verification

## Implemented chain

`armor-item-effect-source-reader.mjs` validates the persisted maint-side
contract directly from embedded Wiki artifact bytes. It rederives the upstream
candidate, requires the complete three-row maint group with real-shaped
positive IDs, verifies every source/lineage field, and joins the expected item
IDs/names/head slots. Missing/extra/inactive rows, duplicate IDs, conflicting
current sources and mutated cached effects are rejected. It does not invent
a local landing readback or establish database persistence by itself.

`buildArmorAttributeDispatch` routes typed rows into item-owned
`armor_item_page` effects while ordinary rows retain the existing attribute
and additive-cell conversion. Sparse typed rows do not create armor attribute
or defense projections. Historical qualified Shroomite cells still fail the
exact-value gate; the new path does not silently omit or reinterpret them.

General sync dry-run loads only referenced landing IDs, constrained by the
expected provider/dataset. An apply request encountering typed rows is rejected
before reports or relation execution. Existing secondary-projection admission
also continues to reject typed sources; no registered write scope was widened.

The independent full projection candidate accepts optional `itemEffectSources`
snapshots, binds them into the input/candidate hashes and a separate
`itemEffectSourceSnapshotSha256`, then assembles expectations from validated
source facts and maint IDs without consuming dispatch-produced effects.
Missing conditions, wrong operations/magnitudes, ownership and lineage drift
are rejected even when relation and consumer projection agree with each other.

Typed evidence always retains `complete-item-and-set-coverage-unverified`.
The existing intent builder rejects that blocker, so this read-only extension
cannot authorize a full-chain write or certify version completeness.

## Evidence

At `2026-09-29T16:59:17.315Z` (September30 CST), a read-only query confirmed the
current maint identities for1546/1547/1548. It rolled back and closed. The
archived real-source proposal from the preceding checkpoint was then used in
an **offline simulation**, with explicitly hypothetical landing/maint IDs.
There was no source insertion or relation/projection write.

Report: `.local/tmp/armor-typed-dispatch-20260930-01.report.json`.
Input: `.local/tmp/armor-item-source-20260930-01.proposal.json`, logical hash
`sha256:b469266370627eda6ba8de6f6f069543d9b39dd232ffffb82dc4eb20f3505616`.

| Item | Derived effect | Condition retained in projection |
| --- | --- | --- |
| 1546 Shroomite Headgear | multiply1.12, multiplier | bows, repeaters, arrows, Stakes |
| 1547 Shroomite Mask | multiply1.12, multiplier | guns, bullets, Candy Corn |
| 1548 Shroomite Helmet | multiply1.12, multiplier | specialist non-consumable ranged weapons other than bows/guns and their ammunition |

The simulation produced0 complete attribute rows,3 relation effect candidates
and3 projection effect candidates. Source revision remains
`2026-09-02T13:55:25Z`; game applicability remains the evidenced1.4.5.8.
The report explicitly records `simulatedLineageIds=true`,
`databaseWrites=false` and blocked acceptance.

## Verification and review

- RED-first source reader, dispatch and independent typed-source expectation
  tests preceded implementation. Focused integrated suites passed170/170.
- Serial current-model review found that different item owners could reuse a
  physical maint item ID in a supplied snapshot. A RED case reproduced that
  gap; the reader now rejects it. A distinct-source fixture also verifies
  rejection of multiple current sources for the same owners.
- Affected regression passed **590/590**, exit0:
  `.local/logs/armor-typed-regression.log`. Scope includes upstream/source
  transaction and runner, sync, canonical candidate/intent/executor/recovery,
  existing secondary projection and shared manifest/Armor registration.
- No unresolved material finding remains in this bounded conversion change.
  Real SQL write acceptance, full API readback and automatic retry were not run.

## Next work

1. Resolve complete compatible-version per-item/set coverage and Mining411
   identity. The current source only establishes the three specialized damage
   facts; it cannot replace all historical attributes or set stealth evidence.
2. Build a reviewed downstream publication contract for typed effects and the
   exact retirement of incorrect generic effects. Bind relation/secondary
   ownership explicitly rather than removing the general-sync/secondary guard.
3. Refresh runtime/baselines, prepare fresh packets and publish serially with
   readback, then verify DB/admin/public API conditions and automatic retry.
   Coordinator retains scheduler/H8 activation.

No additional user information or local restart is required for the next step.
