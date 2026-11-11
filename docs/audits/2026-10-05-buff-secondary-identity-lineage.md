# Buff Secondary Identity Lineage Audit

Date: 2026-10-05

## Scope

This audit compares the bounded Buff `389-400` source payload with the
revision-bound Iteminfo capture and current read-only `maint_items`, local
`items`, and `maint_npcs` snapshots. It is diagnostic only. It does not
authorize item/NPC ingestion, landing, maint, relation, projection, Redis,
scheduler, or database writes.

## Evidence

- Artifact:
  `.local/tmp/buff-secondary-identity-lineage-audit-20261005-v1.json`
- Artifact SHA-256:
  `sha256:4282ef4723d06812867918458ef2bc7793d3a944294f66156be0ce578e6d9a99`
- Candidate contract:
  `.local/tmp/buff-insert-only-candidate-20261005-v1.json`
- Iteminfo source:
  `.local/tmp/buff-iteminfo-semantic-capture-20261001-v2/page-001.json`,
  revision `1023241`
- Database readback was SELECT-only against MySQL `13306`; the artifact binds
  the server identity and hashes all three identity snapshots.

## Findings

### Item secondary facts

- 15 source-item facts were inspected and all 15 now have stable source IDs.
- Four Iteminfo IDs `6148`, `6149`, `6161`, and `6164` map to local
  compatibility rows `8429`, `8430`, `8442`, and `8445`, respectively, but no
  corresponding `maint_items` rows exist. The local IDs are evidence only and
  must not be written into relation `item_source_id` columns.
- `LightningStrike` and `ArcSurge` are independently resolved as Iteminfo IDs
  `6155` and `6173`; both also have local compatibility rows (`8436`, `8454`)
  but no `maint_items` identity.
- `FlaskOfVenom` resolves to Iteminfo/maint source ID `1340`, while the
  canonical maint internal name is `FlaskofVenom`. The source-name drift is
  retained as an owner-review blocker.
- The remaining six source-item facts are exact source-ID/maint matches and
  are promotable within the existing secondary relation rules. The missing
  maint identities and the spelling drift keep the complete candidate blocked.

### NPC secondary facts

- The new Buff immunity payload contains 373 facts. Npcinfo provides stable
  IDs for 259 facts across the rows that carry expanded Npcinfo evidence.
- 114 facts remain display-only page identities with no stable NPC source ID.
  Exact or display-name matches in `maint_npcs` are not promoted from those
  rows because a page display identity does not prove the variant/source ID.
- The current insert-only candidate has no NPC secondary insert path; these
  counts therefore remain diagnostic and do not alter the candidate's
  `npc_buff_relations.inserts = 0` contract.

## Decision

The identity diagnosis narrows the item blocker but does not clear it. A
separate governed item ingestion must establish `maint_items` rows for source
IDs `6148`, `6149`, `6155`, `6161`, `6164`, and `6173`, and an owner decision
must resolve the `FlaskOfVenom`/`FlaskofVenom` drift. NPC immunity needs a
dedicated secondary relation plan that preserves the 114 source-ID gaps. The
Buff insert-only candidate remains `blocked`, `executable=false`,
`applyAllowed=false`, and `databaseWrites=false`.

## Validation

- `node --test pipelines/relation/buff-secondary-identity-lineage.test.mjs`
  (`4/4`)
- Read-only lineage builder completed with verdict `blocked`.
- No crawler, scheduler, Redis, landing, maint, relation, projection, or
  business-table write was performed.
