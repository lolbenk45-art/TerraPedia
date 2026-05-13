# NPC Loot Source Taxonomy Contract

Date: 2026-05-09

## Statuses

| Status | Meaning |
| --- | --- |
| `accepted` | Row may materialize into `item_npc_loot_relations`. |
| `contract_mismatch` | Row resolves to an NPC but violates a reviewed contract. |
| `generic_bucket` | Row names a collective bucket and is audit-only without a reviewed item-scoped mapping. |
| `true_ambiguous` | Row has multiple plausible NPC variants and no reviewed mapping. |
| `non_npc_source_misclassified` | Row is not an NPC source and must not materialize as NPC loot. |

## Collective Buckets

These names are collective buckets by default:

- `Mimics`
- `Pigrons`
- `Mummies`
- `Ghouls`
- `Jellyfish`
- `Sand Sharks`
- `Slimes`
- `The Twins`
- `Celestial Pillars`

Unknown plural or group-like source names default to audit-only until reviewed, unless upstream evidence already provides an authoritative NPC resolution such as `exact_internal_name` or a representative-safe `positive_id_fallback`.

## Reviewed Page-Level Shared Loot

`reviewed_page_level_shared_loot` may materialize only when a checked-in review pins one wiki page, one source revision, one explicit target NPC internal-name list, and the exact source loot rows to share.

This resolution is not an infobox exact match. It preserves that the source page row is page-level shared loot while still carrying an explicit target NPC identity. It must not authorize same-name fanout, generic bucket fanout, fuzzy matching, boss/component promotion, or worm/segment inheritance.

Reviewed page-level shared-loot mappings:

| sourcePage | sourceRevisionTimestamp | targetInternalNames | evidenceSource |
| --- | --- | --- | --- |
| Scarecrow | 2026-04-01T07:29:09Z | Scarecrow1; Scarecrow2; Scarecrow3; Scarecrow4; Scarecrow5; Scarecrow6; Scarecrow7; Scarecrow8; Scarecrow9; Scarecrow10 | docs/audits/2026-05-12_npc-r42-scarecrow-page-shared-loot-review.md |
| Zombie Elf | 2025-03-18T07:10:16Z | ZombieElfBeard; ZombieElfGirl | docs/audits/2026-05-12_npc-r43-zombie-elf-page-shared-loot-review.md |
| Zombie | 2026-04-08T00:43:54Z | BaldZombie; FemaleZombie; SwampZombie; TwiggyZombie | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md |
| Skeleton | 2026-05-10T13:23:02Z | HeadacheSkeleton; MisassembledSkeleton; PantlessSkeleton | docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md |

## Non-NPC Sources

Rows under `source_ref_type='npc'` that name chests, crates, treasure bags, lock boxes, trees, presents, hearts, or orbs are `non_npc_source_misclassified`.

## Representative Positive ID Fallback

`positive_id_fallback` may materialize only when all candidates are representative segments of one NPC family, such as `Head`, `Body`, and `Tail`, or when the target internal name is listed as a reviewed exception below. Other biome, tier, weapon, or form variants remain `true_ambiguous`.

Reviewed positive-id fallback exceptions:

- `DesertLamiaLight`
- `DesertScorpionWalk`
- `DD2DarkMageT1`
- `DD2OgreT2`
- `DiabolistRed`
- `PigronCorruption`
- `RustyArmoredBonesAxe`
- `ZombieEskimo`

## Reviewed Boss-Kind Exact NPC Loot Exceptions

Some Old One's Army mini-boss NPC rows are crawler-profiled with `profile.kind=Boss`, but have reviewed exact NPC loot rows in the NPC-domain chain. These rows may materialize only when upstream evidence uses `sourceRefResolution=exact_internal_name` and `sourceRefInternalName` equals the standardized NPC internal name. This exception does not authorize boss reward fanout, boss component loot, or `positive_id_fallback` for new tier variants.

Reviewed exact boss-kind NPC loot exceptions:

- `DD2DarkMageT1`
- `DD2DarkMageT3`
- `DD2OgreT2`
- `DD2OgreT3`

## Machine-Readable Contract

```json
{
  "contractId": "npc-loot-source-taxonomy-contract",
  "version": 1,
  "statuses": [
    "accepted",
    "blocked",
    "needs_review",
    "generic_bucket",
    "contract_mismatch",
    "non_npc_source_misclassified",
    "true_ambiguous"
  ],
  "collectiveBuckets": [
    "Mimics",
    "Pigrons",
    "Mummies",
    "Ghouls",
    "Jellyfish",
    "Sand Sharks",
    "Slimes",
    "The Twins",
    "Celestial Pillars"
  ],
  "nonNpcSourceFamilies": [
    "chests",
    "crates",
    "bags",
    "trees",
    "presents",
    "hearts",
    "orbs",
    "lock boxes"
  ],
  "materializationPolicy": {
    "collectiveBucketDefault": "audit_only",
    "requiresReviewedItemScopedMapping": true,
    "forbidExactNamePromotion": true,
    "forbidSingleCandidatePromotion": true,
    "forbidPluralStrippingPromotion": true
  },
  "reviewedPageLevelSharedLootPolicy": {
    "requiresSourceRefResolution": "reviewed_page_level_shared_loot",
    "requiresSourceRefInternalNameEqualsNpcInternalName": true,
    "forbidGenericFanout": true,
    "reviewedMappings": [
      {
        "sourcePage": "Scarecrow",
        "sourceRevisionTimestamp": "2026-04-01T07:29:09Z",
        "targetInternalNames": [
          "Scarecrow1",
          "Scarecrow2",
          "Scarecrow3",
          "Scarecrow4",
          "Scarecrow5",
          "Scarecrow6",
          "Scarecrow7",
          "Scarecrow8",
          "Scarecrow9",
          "Scarecrow10"
        ],
        "evidenceSource": "docs/audits/2026-05-12_npc-r42-scarecrow-page-shared-loot-review.md"
      },
      {
        "sourcePage": "Zombie Elf",
        "sourceRevisionTimestamp": "2025-03-18T07:10:16Z",
        "targetInternalNames": [
          "ZombieElfBeard",
          "ZombieElfGirl"
        ],
        "evidenceSource": "docs/audits/2026-05-12_npc-r43-zombie-elf-page-shared-loot-review.md"
      },
      {
        "sourcePage": "Zombie",
        "sourceRevisionTimestamp": "2026-04-08T00:43:54Z",
        "targetInternalNames": [
          "BaldZombie",
          "FemaleZombie",
          "SwampZombie",
          "TwiggyZombie"
        ],
        "evidenceSource": "docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md"
      },
      {
        "sourcePage": "Skeleton",
        "sourceRevisionTimestamp": "2026-05-10T13:23:02Z",
        "targetInternalNames": [
          "HeadacheSkeleton",
          "MisassembledSkeleton",
          "PantlessSkeleton"
        ],
        "evidenceSource": "docs/audits/2026-05-12_npc-r51-zombie-skeleton-shared-loot-review.md"
      }
    ]
  },
  "positiveIdFallbackPolicy": {
    "allowedRepresentativeSuffixes": ["Head", "Body", "Tail", "Legs"],
    "forbiddenVariantTokens": ["Corruption", "Crimson", "Hallow", "Hallowed", "Jungle", "T1", "T2", "T3"],
    "reviewedExceptions": [
      "DesertLamiaLight",
      "DesertScorpionWalk",
      "DD2DarkMageT1",
      "DD2OgreT2",
      "DiabolistRed",
      "PigronCorruption",
      "RustyArmoredBonesAxe",
      "ZombieEskimo"
    ]
  },
  "bossKindExactNpcLootPolicy": {
    "requiresSourceRefResolution": "exact_internal_name",
    "requiresSourceRefInternalNameEqualsNpcInternalName": true,
    "reviewedExceptions": [
      "DD2DarkMageT1",
      "DD2DarkMageT3",
      "DD2OgreT2",
      "DD2OgreT3"
    ]
  }
}
```
