# Buff Iteminfo Semantic Capture Audit

## Scope

This audit records the read-only source evidence used to close the Buff
`sourceItems` evidence gap. It does not authorize landing, maint, relation,
projection, packet, permit, scheduler, Redis-control, standardized-data, or
database writes.

## Capture and monitor evidence

- Capture directory:
  `.local/tmp/buff-iteminfo-semantic-capture-20261001-v2/`
- Capture manifest SHA-256:
  `sha256:03e592ad63b922f78b9e69794721c25e6770088c901cf31f68f8e64c076534e2`
- Terminal progress path:
  `.local/tmp/buff-iteminfo-semantic-capture-20261001-v2-progress.json`
- Terminal progress SHA-256:
  `sha256:8896ef6e6cf253d57be1c8c40e1c8be3f9125c9d079f5f7fafcc050833afa29c`
- Action ID: `buff-page-immunity-refresh`
- Terminal status: `completed`, `3/3` pages, selected Buff scope `1–400`
- Data page: `Module:Iteminfo/data`, page `18021`, revision `1023241`,
  revision timestamp `2026-08-22T03:26:22Z`, raw SHA
  `sha256:d2d02f055ceec3deb57e44ddba3905b6047db6d7d1e212efe2d8c82907fe6388`
- Documentation page: `Module:Iteminfo/doc`, page `18096`, revision `966449`,
  revision timestamp `2026-02-02T14:49:38Z`, raw SHA
  `sha256:daf444b36ee0cd20dedf45d2a6bc780555a30fd4ccc5116eee2f6f00de73b82f`
- Generator page: `Module:Iteminfo/datagen`, page `18070`, revision `1023234`,
  revision timestamp `2026-08-22T03:03:08Z`, raw SHA
  `sha256:da4dc88e3577f6e7e2693b53a5ab3f09fc8bc84604156ed2b4cca3da93c0a75d`

The capture wrote monitor-visible progress before the first request and ended
with a terminal `completed` payload. The three pages were captured through the
bounded capture entrypoint; no direct fetch helper was invoked by the replay.

## Semantic contract

`verifyBuffIteminfoSemanticCapture` requires:

1. Exact input Buff IDs and internal names bound to the capture manifest.
2. Three distinct page identities, each bound to page ID, revision ID,
   revision timestamp, raw bytes, and manifest hash.
3. The generated data module declaration that it contains the database for all
   items and was generated from `Module:Iteminfo/datagen`.
4. The documentation declaration for `buffType` and its Buff ID meaning.
5. The generator declaration that maps the data output through
   `convertToJsonData`.

Only after those checks pass does an absent numeric `buffType` assertion become
a verified empty source-item group. A positive-only `Module:Iteminfo/data`
capture continues to provide individual assertions without proving emptiness.

## Verified result

- Completeness: `complete-exhaustive-item-scope`
- Positive item→Buff assertions: `249`
- Buffs with positive assertions: `167`
- Buffs verified empty within the complete Iteminfo scope: `233`
- Semantic schema: `buff-iteminfo-semantic/v1`

The builder now labels complete Iteminfo source rows as
`iteminfo-revision-bound`, carries the three-page semantic provenance, and
removes only the `sourceItems` unresolved fact. It does not remove unresolved
NPC infliction facts and does not copy Iteminfo facts into `immuneNpcs`.

## Offline replay

Replay: `.local/tmp/buff-partial-contract-replay-20261001-v9.json`

Replay SHA-256:
`sha256:2328ce558139529454492f97df7db327de227c549b0e59ecb74e94d834e8e204`

The replay is read-only and uses the actual source verifier, expanded Npcinfo
evidence, the revision-bound Wall of Flesh page, and direct relation fact
columns for the active baseline.

- Records: `400`
- Baseline-bound partial plans: `388`
- Missing historical baselines: `12` (Buff IDs `389–400`)
- `sourceItems` replacements: `388`
- `immuneNpcs` replacements: `388`
- `inflictingNpcs` preserved from baseline: `360`
- Strict normalizer admission: `400/400`
- Strict normalizer rejections: `0`
- Immunity alternate correction: target-mismatched page groups now pass only
  with a complete independently bound Npcinfo alternate; the mismatched page
  rows are still excluded.

The two page ownership mismatches are now covered for the immunity group by the
independent Npcinfo alternate. Iteminfo still cannot certify NPC infliction
direction. The twelve new Buff identities have no relation, projection,
secondary relation, or image baseline; empty baselines remain forbidden.

## Decision

The Iteminfo source-item bottleneck and the two target-mismatch immunity gates
are resolved for the read-only partial contract. The full-chain execution gate
remains closed because twelve baseline-free identities and 360 preserved
inflicting-NPC groups still require separate governed evidence. No runtime
mutation was attempted.
