# Buff Variant Repeated-ID Empty Scope Review - 2026-10-05

## Decision

The retained `The Twins` revision (`pageId=12908`, `revisionId=1032403`) has
three complete `npc infobox` blocks with `auto=125`: the page summary,
Retinazer's first form, and Retinazer's second form. The empty-scope producer
now accepts repeated stable-ID blocks only when every block is complete, every
block has no `debuff*` field, and duplicate field maps are rejected. It records
the full block set with `selection=all-matching-stable-id-blocks`; it never
selects one block.

The page has positive debuff diagnostics only for stable NPC `126` (Spazmatism).
No fact is assigned to Retinazer `125`.

## Frozen Evidence

- Evidence replay: `.local/tmp/buff-npc-variant-empty-scope-evidence-20261005-v2.json`
  - file SHA-256: `sha256:9831c6201e92d719b3a17c864bb4c2497440889ec1c1b02862152291c19dbff4`
  - 68 gaps inspected, 68 complete-empty rows, 0 rejected rows.
- Scope contract: `.local/tmp/buff-npc-variant-scope-contract-20261005-v3.json`
  - file SHA-256: `sha256:98b396fc62ec039e5c3e1bbfa7280d286356efb13bfc80bf50c8df4c38a735c2`
  - 68 complete-empty rows, 0 unknown rows, `389-400` still missing-baseline.
- Candidate replay: `.local/tmp/buff-variant-empty-scope-candidate-20261005-v4.json`
  - file SHA-256: `sha256:6d38ae21c05b540a89db0dd12d3f427055b3dbe160728103b76b7c92f61cf403`
  - 10 exact reverse `inflicts` retirements, 0 relation JSON updates, 0 projection JSON updates, 0 inserts, and 0 database writes.

The candidate remains `executable=false`, `applyAllowed=false`,
`databaseWrites=false`, and `destructiveClear=false`. The display-only
unkeyed `Slimer` fact remains preserved.

## Runtime Gate

Fresh read-only source reports for all eight scheduler domains were generated
at `2026-10-05T05:34:51.064Z`; all source panels pass with
`writesDatabase=false`. Fresh authenticated preflight was captured from
backend `18104` at `2026-10-05T05:35:43.181Z`:

- preflight payload hash: `sha256:d774d087457e2f7ac9172a93878ff4c794e47a0f71e83f3cd92f013f48c46949`
- artifact file SHA-256: `sha256:8b572abe65f9c7a143d28b10195450f94f3e070bb25ef17482ca8dfbf5505740`
- epoch: `epoch-29a8486b-b3df-45a7-a496-28286de5a91b`
- scheduler disabled, live attempts/claims `0/0`, reconciler healthy, all eight domains eligible.

Retry-48 scheduler proposal and `AWAITING_OWNER` request were created from
this preflight. They do not authorize scheduler activation or Buff ingestion;
owner fields are still null, and no packet, permit, Redis control mutation,
crawler, landing, maint, relation, projection, or database write occurred.

## Validation

- Related evidence/scope/candidate/full-chain/sync suite: `160/160` passed.
- `node --check` passed for changed builders and replay driver.
- `git diff --check` passed.

The remaining independent gates are owner authorization for any execution and
historical Buff baselines `389-400`. The candidate is review evidence only.
