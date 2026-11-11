# Buff Variant Empty-Scope Candidate — 2026-10-05

## Boundary

This is a read-only replay of the 67 independently complete-empty NPC variant
rows. It does not fetch Wiki pages, write standardized data, create an
authorization packet or permit, change scheduler/Redis state, or write any
database table. The candidate builder is
`pipelines/relation/buff-npc-variant-empty-scope-candidate.mjs`.

The builder accepts only the existing `buff-npc-variant-scope-contract/v1`
read-only contract. It targets exact `(npc_source_id, npc_internal_name)`
identities with `status=variant-owned-complete-empty` and
`preserveBaseline=false`. Unknown rows, positive rows, and the ambiguous
Retinazer `125` row remain unchanged. The `389–400` missing-baseline list is
revalidated exactly before a candidate is returned.

## Frozen Inputs

- Empty-scope evidence report:
  `.local/tmp/buff-npc-variant-empty-scope-evidence-20261005.json`
  — `sha256:3866b8902cca2122afd67cff010b31f5d4fbcd67bd1a4c20120e4cd9b16e3108`.
- Read-only relation baseline TSV (388 active rows):
  `.local/tmp/buff-variant-empty-scope-candidate-20261005/relation.tsv`
  — `sha256:0058eb08c5b0011c06fb6a08555cf66382b22d778d0f2f960db50ba793ff12f3`.
- Read-only projection baseline TSV (388 active rows):
  `.local/tmp/buff-variant-empty-scope-candidate-20261005/projection.tsv`
  — `sha256:214508d36f73e735a5c417229b590aadab5bcb539dfb22e283d4f815da3cf4b1`.
- Read-only NPC-Buff baseline TSV (1,290 active rows):
  `.local/tmp/buff-variant-empty-scope-candidate-20261005/reverse.tsv`
  — `sha256:d31fe3bf524d4ef9736a73d75c6532d0326910cef37451437cc4de32ac4a3ea8`.

The generated candidate is
`.local/tmp/buff-variant-empty-scope-candidate-20261005/candidate.json`
with file SHA-256
`sha256:7f6c092e35e65ac370f54689d5883ad5ba2923b011ed9d54020dd3a7ab55ef3f`.
Its scope, before-set, and after-set hashes are respectively:

- `sha256:fbf2a211275af5299eb36c9e9073469dabd1b7819f7142beab20819f06ea92ab`
- `sha256:ad39733220cd986661005e1d1f9d08e6ab4d750766ae221f47dbd6f48e63b2e5`
- `sha256:3e27a33aafbd2086c1ddaa7e6b86106b1d447ebe2ddf8f10d5d57066d92a680a`

The fresh authenticated preflight is
`.local/tmp/buff-variant-empty-scope-candidate-20261005/preflight.json`
with SHA-256
`sha256:708a0f1213efcac37b9f64d418739578a55eb71b2be4e41d8010d476f93c48cc`.
It returned HTTP `200`, scheduler `disabled`, live attempts/claims `0/0`,
healthy reconciler, and the unchanged V2 epoch
`epoch-29a8486b-b3df-45a7-a496-28286de5a91b`. Redis DB14 returned `PONG` with
authentication; MySQL server UUID/port remained
`b4ae6728-4f72-11f1-bcc9-00155d37eadf:13306` and active relation counts stayed
`388/388/1290`.

## Result

- Complete-empty NPC identities evaluated: `67`.
- Active reverse `inflicts` rows eligible for exact retirement: `10`.
  They are `Slimer (121) -> Darkness (22)` and `Scarecrow2–10
  (306–314) -> Weak (33)`.
- Relation Buff JSON updates: `0`.
- Projection Buff JSON updates: `0`.
- Inserts: `0`; database writes: `0`.
- Unknown scope retained: Retinazer `125`.
- Display-only diagnostic retained: one unkeyed `Slimer` entry on Buff `22`.

The relation and projection JSON representations do not contain stable numeric
IDs for the ten retired variants. The candidate therefore does not remove by
display name; it records the display-only fact and limits its proposed changes
to exact reverse-row lifecycle updates. This prevents a shared display name
from deleting another NPC variant's fact.

The candidate is `executable=false`, `applyAllowed=false`,
`databaseWrites=false`, and `destructiveClear=false`. No executor or
authorization operation consumes this artifact. Canonical landing → maint →
relation → projection publication remains closed pending independent owner
authorization and resolution of the remaining source/baseline gates.

## Validation

- `node --test pipelines/relation/buff-npc-variant-empty-scope-candidate.test.mjs` — `6/6` passed.
- `node --check pipelines/relation/buff-npc-variant-empty-scope-candidate.mjs` — passed.
- Real frozen replay over the three read-only baseline exports — passed with
  the counts and hashes above.
- `git diff --check` — passed.
