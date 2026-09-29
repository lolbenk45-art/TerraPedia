# Armor item-effect upstream candidate verification

## Delivered contract

`pipelines/maint/armor-item-effect-maint-candidate.mjs` rederives the Shroomite
source adapter and proposes append-only rows on existing tables:

| Database | Table | Proposed rows with an empty baseline |
| --- | --- | --- |
| local | source_dataset_landings | 1 |
| maint | source_dataset_landings | 1 |
| maint | maint_armor_attribute_rows | 3 |

The proposed dataset is `armor_item_effects_raw`, with immutable namespace
`wiki.armor.item-effects.shroomite.<payload-hash>`. Both landing copies retain
exact bytes and expected identities for the page, Iteminfo and ArmorSetBonuses
artifacts. Each maint row retains a typed effect under
`raw_json.schemaVersion=armor-item-effect-maint/v1`, leaving defense null and
raw table cells empty rather than inventing complete item attributes.

This is a **non-executable candidate contract**. No operation registration,
runtime ownership expansion, DDL, landing insert, maint insert, relation write
or scheduler/control mutation occurred.

## Integrity and compatibility

- New inserts have no generated IDs. Existing exact rows are reused and
  unrelated history is preserved. Source drift or ambiguous identities fail;
  the planner emits no updates, retirements or deletes.
- Local and maint landing plans and readbacks are distinct. Typed effects
  reference the maint landing ID and the matching maint record ID/key.
  Positive IDs alone are insufficient: every non-generated column, source
  hash, revision, condition and owner must match the rederived candidate.
- Supplied readbacks cannot collide with preserved historical IDs. This is
  validation of supplied snapshots, not proof that a database write happened;
  only a registered locked executor may obtain authoritative runtime receipts.
- Source payloads retain full timestamp precision. Database columns use
  DATETIME second precision; Date-shaped driver readbacks are compared without
  introducing false drift.
- Legacy `buildArmorAttributeRelations` rejects this source namespace or typed
  schema explicitly. It does not silently consume sparse effect facts as full
  attribute rows or omit them from acceptance. Ordinary/null-JSON sources keep
  their previous behavior. Future full-chain integration must dispatch the
  typed source through its own reviewed contract.

## Real-source offline evidence

Artifacts: `.local/tmp/armor-item-effect-upstream-20260929-01.candidate.json`
and companion `.report.json`. Both are immutable local files; the report says
`hypothetical-empty-not-live-database` and `readbackPerformed=false`.

- Candidate hash:
  `00d42f8df7202db05c73c999ea900d043fec57f02c8df014d68f3e6f7dc209b5`.
- Source namespace suffix/payload hash:
  `e8db68e45bdf882f7ad62a291030b59fd048fcc69c40484dbc76c3efb1e8443f`.
- Original source manifests are source01/source02 from the preceding adapter
  audit; all bytes/revisions were reverified by the adapter.
- Each landing payload is7,206,903 bytes because it retains all three original
  artifacts. A future writer must check the actual server/transport size limit
  before creating a packet. This session did not validate that runtime limit.

## Validation and remaining gates

The focused upstream suite passes25 cases; the combined upstream, source,
legacy producer, independent projection and secondary-projection suites pass
242/242. RED evidence reproduced legacy misclassification, storage timestamp
precision, invalid current markers and null-JSON regression before fixes.
Syntax and diff-whitespace checks pass. Logs:
`.local/logs/armor-item-effect-*.log`.

Runtime preflight at2026-09-29 23:42 CST again timed out after login. No fresh
database baseline or publication result is claimed.

The remaining blockers are explicit:

1. `registered-item-effect-upstream-executor-required`: complete full-chain
   dispatch, locked snapshots, per-database IDs, fences, exact packet/permit and
   readback integration before allowing writes.
2. `complete-item-and-set-coverage-unverified`: prove compatible-version
   coverage, reconcile the old qualified cells without silent exclusion, and
   validate independent projection plus public/admin consumers and automation.

Neither blocker is solved by the hypothetical empty-baseline report.
