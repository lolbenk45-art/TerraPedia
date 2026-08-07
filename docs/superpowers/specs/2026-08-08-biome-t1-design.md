# Biome T1 Isolated Acceptance Design

## Goal

Prove a two-biome offline acceptance for the current local-owned Biome chain,
including core import, counterpart relations, wikitext-derived item and NPC
sources, public consumer filtering, transaction probes, and cleanup without
writing formal databases or fetching Wiki data.

## Approved Boundary

- Fixture biomes: `corruption` and `crimson`.
- Formal `terria_v1_local`, `terria_v1_maint`, and
  `terria_v1_relation` remain read-only.
- Writes target only one run-derived disposable three-database set.
- The fixture is local and complete; network access is forbidden.
- Scheduler, crawler, V1 queue, formal Biome apply, full dataset import, push,
  merge, and worktree cleanup are out of scope.

## Chain Audit Decision

Biome production ownership is different from Buff and Projectile. There is no
`relation_biomes` or `projection_biomes`; the maintained backend reads the
local-owned tables directly:

```text
offline biome records -> importBiomeDataset -> biomes / biome_relations
                                         -> biome_resources / item_biomes

offline wikitext -> maint_biomes -> infocard parser -> resolved candidates
                                                   -> biome_resources
                                                   -> item_biomes
                                                   -> item_acquisition_sources
                                                   -> npc_biomes

local-owned tables -> BiomeServiceImpl -> PublicBiomeController/AdminBiomeController
```

The acceptance will validate this real chain. It will not invent a new
relation/projection layer merely to resemble another domain.

## Fixture Contract

The fixture contains exactly two biome records with a closed counterpart
relationship in both directions:

- `corruption` -> `crimson`, `counterpart`
- `crimson` -> `corruption`, `counterpart`

Each record carries an offline wikitext infocard. The resolved-only contract is:

- item candidates: `Musket`, `Vilethorn`, `TheUndertaker`, `TheRottedFork`
- NPC candidates: `CorruptGoldfish`, `CrimsonGoldfish`
- exact counts: 2 biomes, 2 biome relations, 4 item candidates, 2 NPC
  candidates, 4 biome resources, 4 item-biome rows, 4 public biome-wikitext
  item sources, and 2 public NPC-biome rows

All six item/NPC identities must be copied exactly from the formal local
database through the temporary readonly account. Missing, ambiguous, duplicate,
or extra candidates fail closed.

## Isolated Execution

The executor reuses `importBiomeDataset`, `runMaintSync`, the Biome infocard
parser, `buildResolvedOnlyCandidates`, and the resolved-row importer. Before
fixture writes it clears only the disposable target's Biome-owned rows and
exact dependency rows, preventing the 25-row snapshot sample from polluting
closure.

`runMaintSync` receives two in-memory `biomes_raw` landing rows. The executor
reads the resulting two `maint_biomes` rows, parses their wikitext with exact
isolated item/NPC lookups, applies only resolved candidates, and rejects any
missing or ambiguous fixture fact.

The operation is `canonical-biome-t1-acceptance`, `scope=biome-canonical`,
`profile=t1`, `maxRows=25`, `databaseWrites=false`,
`isolatedResourceWrites=true`, and `networkAccess=false`.

## Consumer Contract

The backend is local-table owned, so acceptance readback queries the isolated
tables using the same active predicates and ownership types as
`BiomeServiceImpl`; focused backend tests cover DTO/controller behavior. The
readback must return the two exact active biomes and all exact relation arrays.

The executor also inserts isolated inactive/deleted decoys for a biome,
NPC-biome row, and item source. Neither direct consumer-contract readback nor
backend behavior may expose them. The current missing `deleted=0` filter in
`BiomeServiceImpl.getBiomes()` is repaired test-first as part of this batch.

## Failure And Cleanup

Any formal target, external URL access, fixture identity drift, unresolved
candidate, duplicate relationship, consumer-filter leak, snapshot mismatch, or
cleanup residue fails the run. Evidence is retained only after the built-in
cleanup passes. Independent readback must report zero disposable databases,
accounts, active transactions, selected Redis keys, child processes, and
current permits.

## Validation

- Biome fixture/executor unit tests.
- Import, maint, wikitext parser, and resolved-import focused Node tests.
- Canonical operation manifest, authorization, and dispatch tests.
- `BiomeServiceImplTest`, `AdminBiomeControllerTest`, and
  `PublicBiomeControllerTest`.
- One fresh current-hash ADMIN run, report verification, independent cleanup,
  and `git diff --check`.

## Residual Risk

This proves only two mutually related evil biomes and six resolved source
facts. It does not prove all 48 biomes, every resource/source type, a new
relation projection, or a formal Biome apply.
