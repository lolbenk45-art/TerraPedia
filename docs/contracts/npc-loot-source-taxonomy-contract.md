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

## Non-NPC Sources

Rows under `source_ref_type='npc'` that name chests, crates, treasure bags, lock boxes, trees, presents, hearts, or orbs are `non_npc_source_misclassified`.

## Representative Positive ID Fallback

`positive_id_fallback` may materialize only when all candidates are representative segments of one NPC family, such as `Head`, `Body`, and `Tail`. Biome, tier, weapon, or form variants remain `true_ambiguous`.

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
  "positiveIdFallbackPolicy": {
    "allowedRepresentativeSuffixes": ["Head", "Body", "Tail", "Legs"],
    "forbiddenVariantTokens": ["Corruption", "Crimson", "Hallow", "Hallowed", "Jungle", "T1", "T2", "T3"]
  }
}
```
