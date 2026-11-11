# Buff Runtime State After NPC Secondary Applies

Date: 2026-10-07

## Scope

This audit rechecks the current Buff publication state after the approved NPC
secondary immune applies. It performs SELECT-only reads in an explicit MySQL
read-only transaction. It does not modify database rows, scheduler state,
Redis, source artifacts, or authorization records.

## Runtime State

The snapshot is from MySQL server
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306`, database
`terria_v1_local`. After reading an InnoDB table, the session's
`information_schema.innodb_trx.trx_is_read_only` value was `1`; the transaction
was rolled back after the reads.

| Surface | Active rows |
| --- | ---: |
| `maint_buffs` | 400 |
| `relation_buffs` | 400 |
| `projection_buffs` | 400 |
| `item_buff_relations` | 14 |
| `npc_buff_relations` | 1,708 |
| `npc_buff_relations` `immune` | 1,559 |
| `npc_buff_relations` `inflicts` | 149 |

Buff IDs `389-400` each have one active row in maint, relation, and projection
(`12/12/12`). All `1,559` immune rows have distinct
`(npc_source_id, buff_source_id, relation_type)` keys. The Item-Buff pair
`(1340,395)` remains absent. Active write fences were `0` at snapshot time.

## Legacy Infliction Duplicates

The `149` active `inflicts` rows represent `144` distinct
`(npc_source_id, buff_source_id, relation_type)` combinations. Five pairs have
two active rows with different `record_key` values but otherwise identical
relation and lineage fields:

| Buff | NPC | Active rows | Current maint source entries |
| --- | --- | ---: | ---: |
| `20` Poisoned | `222` Queen Bee | 2 | 2 |
| `30` Bleeding | `370` Duke Fishron | 2 | 1 |
| `32` Slow | `668` Deerclops | 2 | 1 |
| `47` Frozen | `668` Deerclops | 2 | 1 |
| `148` Rabies | `370` Duke Fishron | 2 | 1 |

All ten rows carry legacy lineage `terrapedia.generated` /
`buffs.standardized`, landing `18627`, with no source revision timestamp and
null `raw_json`. Four duplicated pairs exceed the current maint fact list; the
Poisoned/Queen Bee pair is also repeated in that list. The public Buff service
returns relation rows without `DISTINCT` and sets `inflictingNpcCount` from the
returned list size, so these pairs produce duplicate fact entries and the row
count is five higher than the distinct identity count.

No database row deduplication or deletion was authorized or performed during
this audit. Any repair needs a separate source disposition and an exact
governed operation; the existing no-loss apply path must continue preserving
the current rows.

## Relation Generation Follow-up

The relation processor now collapses repeated `inflictingNpcs` facts when the
canonical NPC/Buff identity, relation type, duration, chance, and conditions
are identical. Distinct effects remain separate, and the existing
source-order-based `record_key` format is preserved for stable sync matching.
A focused test first reproduced the duplicate and now covers deduplication and
key stability. This changes future generated relation payloads only; the five
existing duplicate row pairs above remain unchanged and still need a separate
source/data disposition before any governed database cleanup.

Validation after the code change:

- `node --test pipelines/relation/secondary-relation-processor.test.mjs` —
  `13/13` passed.
- Buff fetch/relation/authorization regression — `403/403` passed.
- Node syntax checks and `git diff --check` passed.
- No MySQL, Redis, authorization, packet, fence, or runtime write occurred.

## Validation

- Buff fetch, relation, and authorization regression: `403/403` passed.
- `git diff --check` passed.
- MySQL counts and duplicate inspection ran under verified read-only
  transaction; no database or control-plane write occurred.
- Full quality gate and API runtime smoke were not run.
