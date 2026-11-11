# Buff Partial Contract Baseline Review

## Scope

This is a read-only coordinator review of the baseline-bound partial Buff
candidate contract in `feat/automation-domain-buff`. It checks that unknown
fact groups are preserved from the active relation baseline, that parsed groups
are replaced only from the revision-bound landing record, and that the partial
disposition cannot reach an executable full-chain envelope.

No crawler, landing, maint, relation, projection, packet, permit, scheduler,
Redis-control, standardized-data, or database write was performed.

## Evidence

- Plan: `docs/superpowers/plans/2026-09-30-buff-relation-no-loss.md`
- Candidate builder: `pipelines/relation/sync-buffs-to-relation.mjs`
- Applicability contract: `pipelines/relation/buff-source-applicability.mjs`
- Full-chain fence: `pipelines/relation/buff-canonical-full-chain.mjs`
- Final replay: `.local/tmp/buff-partial-contract-replay-20261001-v3.json`
- Replay SHA-256: `sha256:d89c5409685fe248fb0e9a5ae0cf845ef97776f3cbabe6851ae1dd5ac57c378d`
- Normalizer diagnostic replay: `.local/tmp/buff-partial-contract-replay-20261001-v6.json`
- Normalizer diagnostic SHA-256: `sha256:75657fe6ae5f7623714612bb4fb9f26e6a3939428ba7107b3c4eba5669a72dfd`

The replay directly selected `source_items_json`, `inflicting_npcs_json`,
`immune_npcs_json`, `immune_npc_count`, and `immune_npc_sample_json` from
`terria_v1_relation.relation_buffs`. The active 388-row baseline comparison
found zero drift between those relation columns and the corresponding facts in
`raw_json`.

The v6 diagnostic groups the 367 strict-normalizer failures into 365
`sourceItems` failures and two combined `immuneNpcs,sourceItems` failures.
Source-item completeness is therefore the current strict gate; an absent
Iteminfo assertion is not converted into an empty source-item list.

## Review findings

1. `buildBuffPartialFactPlan` requires revision-bound source identity,
   parser-error-free unresolved facts, an exact baseline for every preserved
   group, and count equality for every replaced group.
2. The candidate builder revalidates the supplied plan against the landing
   record, source revision, group lists, and exact baseline values before it
   copies preserved facts into relation fields.
3. The candidate records `buff-partial-fact-disposition/v1` with
   `executionBlocker=partial-fact-contract-review-required`.
4. The full-chain envelope rejects candidates carrying that disposition before
   an executable envelope can be created.
5. The corrected replay built 388 plans, preserved 359 `sourceItems` and 360
   `inflictingNpcs` groups, and replaced 388 `immuneNpcs` groups from complete
   expanded Npcinfo evidence. The two target-mismatch records use only that
   independent immunity alternate; their page rows are not consumed.
6. The 12 missing baselines are exactly Buff IDs `389` through `400`:
   `PalworldMinionTrustyCattiva`, `PalworldMinionTrustyFoxsparks`,
   `PalworldMountTrustyChillet`, `PalworldMountTrustyChilletIgnis`,
   `ClayPotMinion`, `ForbiddenMinion`, `PotentAcid`, `ManaHeat`,
   `ChlorophyteSpore`, `AcceleratePoisons`, `BlueLightning`, and
   `RedLightning`. A read-only database check found no rows for these IDs in
   `relation_buffs`, `projection_buffs`, `item_buff_relations`,
   `npc_buff_relations`, or `relation_buff_images`. They are new identities,
   not recoverable historical baselines; an empty baseline would be invented.
7. The two target mismatches are revision-bound parser ownership findings:
   Buff `165` (`DryadsWard`) reads the `Dryad's Blessing` page, whose immunity
   section targets `Dryad's Bane`; Buff `182` (`StardustMinion`) reads the
   `Stardust Cell Staff` page, whose immunity section targets `Celled`. The
   parser therefore correctly refuses to assign those rows to the requested
   Buffs. The partial contract now accepts the complete independent Npcinfo
   immunity replacement while leaving source items and inflicting NPCs
   unresolved.

## Decision

The baseline-binding and no-loss checks are **reviewed and internally
consistent**, but the contract remains **non-executable**. The source gate is
still open because normalizer admission is `33/400`, 367 records remain
incomplete, and 12 records have no active baseline. This review does not
authorize candidate publication or runtime mutation.

## Required follow-up

For IDs `389–400`, use a governed insert-only path only after every fact group
has complete source evidence; do not manufacture baselines. Resolve the
remaining source-item and inflicting-NPC gaps, then rerun the source and
full-chain gates. Only then may the registered executor be considered for
runtime readback.

## NPC-page continuation update — 2026-10-01

The earlier v3/v6 replay counts above are historical checkpoints. The parser
and source-composition continuation was revalidated against the retained v6
NPC capture without a new network request:

- Verified capture: `.local/tmp/buff-npc-infliction-verified-20261001-v2.json`,
  SHA-256 `sha256:6b255f38330213e260e19ae41248e7af3d3ceaf3137bc2455f83c73690453c08`.
  It covers 511 target pages, 443 unique raw pages, 753 page-backed NPC rows,
  and 9 explicit no-page exclusions. It emits 112 positive `inflicts` facts,
  including `WallofFlesh (113) -> Horrified (37)` and `TheTongue (38)`,
  `Slimer2 (-2) -> Darkness (22)`, and `MartianTurret (387) -> Electrified
  (144)`. Raw debuff fields remain available for evidence.
- Shared pages with inflictions but no debuff row scoped to a requested variant
  are reported as 70 unresolved scope gaps. They are not interpreted as empty
  lists, and the capture is therefore positive evidence with exclusions and
  unresolved variants rather than an exhaustive replacement source.
- Parser/source regressions cover numeric debuff suffixes, HTML-comment pipes,
  repeated stable auto IDs, same-display-name distinct NPC IDs, per-fact page
  and revision provenance, and parsed-group count updates after positive merge.
- Latest read-only replay:
  `.local/tmp/buff-partial-contract-replay-20261001-v13.json`, SHA-256
  `sha256:10c7df07c4e5738726180afd917c33699044d50e81e32d9f8df9108b4024aaef`.
  It retains `112/112` verified facts, admits `400/400` records to the strict
  normalizer, builds 388 partial plans, replaces 28 inflicting groups, and
  preserves 360 inflicting groups from the active baseline. Twelve new Buff
  IDs `389–400` still lack historical rows.

The current source gate is improved but remains closed. The unresolved variant
scope, preserved baseline groups, and missing new-ID baselines still prevent an
executable candidate; the full-chain partial-fact fence remains active.

## Review re-run after provenance and reverse-map repair — 2026-10-01

The NPC-page verifier and source-composition changes were re-run against the
retained v6 raw capture. No network request or runtime mutation was performed.

- `.local/tmp/buff-npc-infliction-verified-20261001-v3.json` is the current
  verifier artifact, SHA-256
  `sha256:a470cecc383ef56301ceda3643e68a814c8d034b6ec35f2caaf11d23957e2ccd`.
  It contains 112 positive facts, 70 unresolved shared-page variant gaps,
  511 target pages, 443 unique raw pages, 753 page-backed NPC rows, and 9
  explicit exclusions. Its source includes `factSources` entries for each
  contributing page/revision.
- `.local/tmp/buff-partial-contract-replay-20261001-v14.json` is the pre-additive
  replay artifact, SHA-256
  `sha256:3f718ccb24e28ff7335925f3222e44894a0cbf1fe69040508d5f6991c88e7280`.
  It retains `112/112` facts, admits `400/400` records to the strict
  normalizer, builds 388 plans, replaces 28 inflicting groups, preserves 360
  baseline inflicting groups, and reports no plan errors. The 12 Buff IDs
  `389–400` remain without historical baselines.
- The pre-additive focused Buff suite passes `263/263`, and all touched modules
  pass `node --check`. The forward/reverse identity equality check and the
  per-fact `factSources` provenance binding are covered by the focused tests.

The disposition is unchanged: positive NPC-page evidence is retained, but the
70 unresolved variant gaps and 360 preserved baseline groups prevent an
exhaustive inflicting-NPC replacement. The 12 new IDs still require a governed
insert-only path after complete evidence. Canonical ingestion remains blocked;
no candidate, packet, permit, landing, maint, relation, projection, scheduler,
Redis-control, standardized-data, or database write was performed.

## Scope-gap classification — 2026-10-01

A read-only grouping of the 70 unresolved variants is recorded in
`.local/tmp/buff-npc-infliction-scope-gap-classification-20261001-v1.json`,
SHA-256
`sha256:e7c46726eb70a0344a898ae606b9363992879e59900a8c6f41e34ec40e0183e2`.
It groups the gaps into 25 raw Wiki pages: 7 redirected/shared-page groups and
18 same-page variant groups. Every group has at least one other infobox with a
positive debuff, while the affected variant lacks its own debuff field. The
classifier therefore records `shared-page-infliction-scope-unverified` and
does not promote an empty or copied infliction list. This rules out a blind
recapture as a completeness fix; the next admissible source must bind each
variant's own page/infobox identity or remain preserved from baseline.

## Wiki API variant-page discovery — 2026-10-01

The read-only MediaWiki API discovery artifact
`.local/tmp/buff-npc-variant-page-discovery-20261001-v2.json` has SHA-256
`sha256:01dd761f3d6e64e6fd0e0cf8b75fbaf1344534420c5c1dee26fcf2b631eb0640`.
It used two `query` requests for the 70 gap records and 100 unique internal or
display titles. The API returned 13 redirect pairs; only two exact internal-name
titles (`Golem` and `Slimer`) exist, while the other hits are shared/base
display pages. This confirms that the API is reachable and returns page
metadata, but it does not provide a separate variant infobox or revision-bound
infliction fact for the unresolved records. The existing raw capture remains
the authoritative revision evidence; no new replacement capture, candidate,
packet, permit, landing, maint, relation, projection, scheduler, Redis-control,
standardized-data, or database write was performed.

## New-ID insert-only source continuation — 2026-10-01

A fresh authenticated read-only preflight was recorded before collecting the
missing pages. `.local/tmp/buff-new-id-preflight-20261001T110117Z-v2.json` has
SHA-256
`sha256:6a7be9cadbcbc70add143330ba2ff4be3954b27ce7f975330cd8d070123a7173`;
the scheduler was disabled, live attempts/claims were `0/0`, the reconciler
was healthy, and no Buff writer was active.

The monitor-visible bounded capture
`.local/tmp/buff-new-id-page-capture-20261001-v1/` completed 7 requested pages
across 6 raw revision-bound pages for IDs `389–394` and `396`. Its manifest
SHA-256 is
`sha256:59c4d724837cd899738a4a81d28d68a5c8cf9a221acac776fa1a91936132f336`.
The page revisions are Cattiva `1032467`, Foxparks `1032651`, Chillet
`1029555`, Clay Bud Staff `1028353`, Ruinous Staff `1029515`, and Mana Surge
`1026303`.

The insert-only diagnostic
`.local/tmp/buff-new-id-insert-contract-diagnostic-20261001-v2.json` has
SHA-256
`sha256:65d6f8082591afff76b66322de05433d3ec855fcb7a17c4fc58a5f2106229a72`.
All 12 new IDs now have complete Iteminfo source-item groups and normalize
successfully; five use page immunity evidence and seven use the complete
expanded Npcinfo alternate. Every one of the 12 still has
`inflictingNpcs.status=section_missing`. That group is unresolved, so the
diagnostic is not an executable insert-only candidate and does not certify an
empty infliction list.

No landing, maint, relation, projection, candidate, packet, permit, scheduler,
Redis-control, standardized-data, or database write occurred.

## New-ID NPC infliction scope audit — 2026-10-01

The retained revision-bound NPC-page capture was replayed against only Buff IDs
`389–400`. The audit artifact
`.local/tmp/buff-new-id-infliction-scope-audit-20261001-v1.json` has SHA-256
`sha256:bf6c7288b9b0605d199dae8539ab4972f7147d34f281fb94734d2cd61c006452`.
It covers 511 target pages, 443 unique raw pages, 753 page-backed NPC rows, 9
explicit exclusions, and 70 unresolved shared-page gaps. It finds zero
positive facts for the 12 selected Buff IDs on any page and zero selected hits
inside the unresolved gap records.

The result is deliberately `empty-unproven`: the capture provides no positive
NPC infliction evidence, but its unresolved variant scope cannot certify an
exhaustive empty `inflictingNpcs` group. The 12 new IDs therefore remain
blocked from insert-only publication until an independently complete negative
scope contract or variant-owned evidence exists.

## New-ID database baseline readback — 2026-10-01

The earlier Node readback stopped before connecting because this worktree has no
installed `mysql2/promise` module. That was an execution-environment failure,
not a database result. A second read-only check used the repository's local
MySQL CLI against `127.0.0.1:13306` with the local credentials; the server
identified as MySQL `9.2.0` and exposed the three formal databases.

The exact SELECT batch is retained at
`.local/tmp/buff-new-id-db-readback-20261001.sql` (SHA-256
`sha256:eedfbeb3f880eeede81907dcb640992a0b7ec4aae85fa5f8e091dd36702d5386`).
Its raw tab-separated output is
`.local/tmp/buff-new-id-db-readback-20261001.tsv` (SHA-256
`sha256:85c58d1015693661d6fefc3415351c58a357e82c99e619f19a7cfc56592b4106`).
All nine queried scopes returned zero rows for Buff IDs `389–400` or their
identity-bound internal names:

- `terria_v1_local.buffs`, `terria_v1_local.maint_buffs`,
  `terria_v1_maint.maint_buffs`;
- `terria_v1_relation.relation_buffs` and `projection_buffs`;
- `terria_v1_relation.item_buff_relations` and `npc_buff_relations`;
- `terria_v1_relation.relation_buff_images`; and
- `terria_v1_local.buff_source_items`.

This is a read-only absence finding. It confirms that IDs `389–400` have no
recoverable active relation, projection, secondary-relation, image, local, or
maint baseline. It does not authorize creating empty rows: every new-ID
`inflictingNpcs` group is still `empty-unproven`, and no insert-only candidate,
landing, maint, relation, projection, packet, permit, scheduler, Redis-control,
standardized-data, or database write is allowed.

## Fresh runtime preflight — 2026-10-01

A new authenticated GET preflight was recorded before any further source or
runtime action. Artifact
`.local/tmp/buff-continuation-preflight-20261001T2324Z.json` has SHA-256
`sha256:90c1752d1af7187b9d0d6023e20756542b4cbcf4f62f7e39c8a297a0532eb821`.
At `2026-10-01T15:44:03.124Z`, scheduler control was disabled, live attempts
and sweep claims were `0/0`, the reconciler was healthy, Buff readiness was
`blocked`, and no active Buff writer process was detected. The V2 epoch remained
`epoch-8c1a61e1-c3f4-46bc-98d2-0884ca743346`; the policy-set hash remained
`sha256:eb95d002c83635aaef8b8c0eb4ba8c158fc7e3837865e8df7937ae95a7115e7f`.

The preflight is an observation only. It does not reopen the source gate or
authorize scheduler activation, capture, landing, maint, relation, projection,
packet, permit, or database writes.

## Runtime no-loss sample readback — 2026-10-01

The governed source evidence already proves `Wall of Flesh (NPC 113) --inflicts-->`
`Horrified (Buff 37)` at revision `1032375`, but the current runtime has lost
that relation. Read-only SQL and API evidence is retained as:

- Query `.local/tmp/buff-runtime-readback-20261001.sql`, SHA-256
  `sha256:da8bdb00d831ccb411c025099f95e6d39db355c1d38fccbcfbf145b7c4cb3756`;
- Raw SQL output `.local/tmp/buff-runtime-readback-20261001.tsv`, SHA-256
  `sha256:a375d0fa89e426909990276cbf8b6e8a3a97fb13f987ea55a6556d3129979e97`;
- Authenticated read-only API artifact
  `.local/tmp/buff-runtime-readback-20261001.json`, SHA-256
  `sha256:b362f4324bc9905775c88beebafe76a7b279093900878461620651f3ebcd697d`.

The relation and local tables contain `113 -> 38 (TheTongue, inflicts)` but no
`113 -> 37 (Horrified, inflicts)`. Relation and projection Buff `37` both have
empty `inflicting_npcs_json`; admin and public `/buffs/37` responses report
`inflictingNpcCount: 0` and empty arrays. The API's retained source evidence is
also an older Wall of Flesh snapshot (`2026-04-29T20:29:11Z`) with
`inflictingNpcs.status=section_missing`, so it cannot be treated as current
proof. This is a confirmed runtime relation-loss sample, not permission to
repair it with ad-hoc SQL; the source/full-chain gate and governed executor
remain required.

## Positive infliction additive contract — 2026-10-02

The partial-fact implementation now carries verified positive NPC-page
infliction facts through a preserve-and-add path. When `inflictingNpcs` is
`section_missing` or `no_rows`, the active relation baseline is retained and
revision-bound positive facts are appended by stable NPC identity. An existing
identity is deduplicated; no baseline fact is removed. Complete replacement
groups continue to use replacement semantics and do not receive a redundant
additive disposition. The partial plan remains `executable=false` with the
existing review blocker.

The regression covers plan construction, baseline application, raw/landing
fact binding, secondary relation validation, projection propagation, and
identity deduplication. The complete NPC-page verifier now also compares every
forward fact with its reverse-map fact, including provenance and duration. The
broad Buff/NPC/capture/relation run passed `363/363`.

Read-only replay `.local/tmp/buff-partial-contract-replay-20261002-v17.json`
has SHA-256
`sha256:20e8c4f9265618dae65a4df8adf1b63ab87fd5345a67a80138e94d996c861da0`.
It reports `400/400` strict normalizer admission, 388 baseline-bound plans,
zero plan errors, 360 preserved inflicting groups, six additive groups with
six positive facts, and `112/112` verified NPC facts retained. Buff `37` now
has an additive candidate fact `WallofFlesh (113) -> Horrified (37)` bound to
the `Wall of Flesh` page at revision `1032375`; the current runtime remains
unchanged and still lacks that relation.

The 70 shared-page variant gaps, 360 baseline-preserved groups, and missing
historical baselines for Buff IDs `389–400` still block an executable full-chain
candidate. No landing, maint, relation, projection, packet, permit, scheduler,
Redis-control, standardized-data, or database write was performed.

## Review repair: identity, reverse coverage, and raw provenance — 2026-10-02

The remaining review findings were repaired with RED/GREEN tests in the same
dirty worktree. `mergeFactRows` now treats stable ID and internal name as two
linked identity keys and fails closed on either collision pattern; exact rows
remain idempotent. Partial additive `inflictingNpcs` facts now require exactly
one active candidate `npc_buff_relations` row with matching Buff/NPC identity
and `relation_type=inflicts`, so projection-only facts cannot survive a missing
secondary edge.

The complete NPC-page verifier now emits `source.factSources` from every
resolved capture manifest page, including `rawSha256`. Each forward fact carries
the same raw hash, and the complete normalizer plus source composer require the
fact's page ID, revision ID, timestamp, and raw hash to match a declared
descriptor. Partial additive wrappers reject missing or malformed wrapper and
declared descriptor identities instead of falling back to an unbound fact.

Validation evidence:

- Full Buff/NPC/parser/relation command: `367/367` passed.
- All touched `.mjs` files passed `node --check`; `git diff --check` passed.
- Fresh local verifier replay
  `.local/tmp/buff-npc-infliction-verified-20261002-v4.json` has SHA-256
  `sha256:f8a8b9e7f721b9b976c8c335bd9cbc654a7ea25b65b91bb325b3fe7d96a61923`;
  it contains 112 positive facts, 70 unresolved gaps, 9 exclusions, and
  raw-hash descriptors for all resolved capture pages.
- Read-only replay `.local/tmp/buff-partial-contract-replay-20261002-v19.json`
  has SHA-256
  `sha256:042af9250675b17073bd5a77c7373370dcd93edd16b8be01bec9ba9d5f17debb`.
  It reports 400/400 normalizer admission, 388 baseline-bound plans, zero plan
  errors, 360 preserved inflicting groups, six additive groups/six facts, and
  112/112 retained NPC facts.

The capture still reports 70 unresolved shared-page variant gaps and nine
explicit exclusions. The replay therefore remains diagnostic and non-executable;
canonical landing → maint → relation → projection ingestion is still blocked.
No runtime writer, scheduler, Redis-control, or database mutation was run.

## Unkeyed top-level infobox continuation — 2026-10-03

The NPC-page resolver was tightened and replayed against the retained raw
capture. A page may omit `auto` on its primary/top-level infobox while a later
hidden infobox repeats the primary stable ID. The resolver now accepts that
shape only when there is exactly one unkeyed infobox and its normalized name
matches the requested page/entity; multiple unkeyed candidates remain an
identity error. This avoids both the prior false gap and cross-variant fact
copying.

- RED/GREEN tests cover the Golem-shaped unkeyed row, the hidden repeated
  `auto=245` row, and ambiguous unkeyed ownership.
- `.local/tmp/buff-npc-infliction-verified-20261003-v7.json` has SHA-256
  `sha256:813ce0fb049bf5c1cbbd5d412c1c7e951cb87ae211588278ac4c9af3c1ebadd3`.
  It contains 114 positive facts and 68 unresolved shared-page gaps. The two
  newly bound facts are Golem `245 -> On Fire! (24)` and Moon Lord Head
  `396 -> Moon Bite (145)`; all facts retain page/revision/raw-hash provenance.
- `.local/tmp/buff-partial-contract-replay-20261003-v20.json` has SHA-256
  `sha256:bb515aca5c2cabb07d453f7a876942855d2128ab874e62081cccba78d4a7698f`.
  It reports 400/400 strict normalizer admission, 388 baseline-bound plans,
  zero plan errors, 360 preserved inflicting groups, six additive groups/six
  additive facts, and 114/114 verified facts retained.
- `.local/tmp/buff-wiki-api-schema-discovery-20261003-v1.json` has SHA-256
  `sha256:29cbddad67e589fa44d5a8f98ce98edffb7f9d569839a48719289e82f1e625dc`.
  Read-only Cargo discovery exposes NPC identity/stat/immunity fields only;
  there is no `debuff`/`inflicts` Cargo field and no `NPC infobox` Cargo table.
- `.local/tmp/buff-npc-infliction-scope-gap-classification-20261003-v2.json`
  has SHA-256
  `sha256:0c5cb51838426d626e9312ee352fb571c21983212a43ab5cf2b3108cb104d9b5`;
  the refreshed grouping records 68 gaps across 25 raw pages. Every group has
  at least one positive owner for another infobox, so no group is promoted to
  an empty or replacement set.

The 68 remaining gaps are therefore source-scope gaps, not missing API
transport. They still cannot be promoted to empty or replacement groups. The
12 new Buff IDs remain `empty-unproven` without a baseline, and canonical
ingestion remains blocked with no runtime or database write.
