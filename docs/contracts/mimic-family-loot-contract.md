# Mimic Family Loot Contract

Date: 2026-05-09
Source: https://terraria.wiki.gg/wiki/Mimics

## Ordinary Mimic

Default ordinary `Mimic` loot may only include:

| Item internal name | Item name | Source bucket | Target NPC |
| --- | --- | --- | --- |
| `DualHook` | Dual Hook | `Mimics` | `Mimic` |
| `MagicDagger` | Magic Dagger | `Mimics` | `Mimic` |
| `PhilosophersStone` | Philosopher's Stone | `Mimics` | `Mimic` |
| `TitanGlove` | Titan Glove | `Mimics` | `Mimic` |
| `StarCloak` | Star Cloak | `Mimics` | `Mimic` |
| `CrossNecklace` | Cross Necklace | `Mimics` | `Mimic` |

## Rejected Exact Mimic Rows

These current exact `source_ref_name='Mimic'` rows are contract mismatches:

| Item internal name | Reason |
| --- | --- |
| `BandofRegeneration` | `ordinary_mimic_contract_mismatch` |
| `CloudinaBottle` | `ordinary_mimic_contract_mismatch` |
| `Extractinator` | `ordinary_mimic_contract_mismatch` |
| `FlareGun` | `ordinary_mimic_contract_mismatch` |
| `HermesBoots` | `ordinary_mimic_contract_mismatch` |
| `Mace` | `ordinary_mimic_contract_mismatch` |
| `ShoeSpikes` | `ordinary_mimic_contract_mismatch` |

## Boundaries

- This is an item-scoped mapping, not a blanket `Mimics -> Mimic` rule.
- Exact `source_ref_name='Mimic'` rows are not a materialization authority for the ordinary contract; the reviewed mapping source is `Mimics -> Mimic`.
- Variant Mimics remain blocked unless a separate reviewed mapping exists.
- Seed-specific rows must be represented as explicit branches and must not merge into the default ordinary `Mimic` set.

## Machine-Readable Contract

```json
{
  "contractId": "mimic-family-loot-contract",
  "version": 1,
  "retrievalDate": "2026-05-09",
  "sourceUrl": "https://terraria.wiki.gg/wiki/Mimics",
  "versionScope": "default_hardmode_non_remix",
  "targetNpcInternalName": "Mimic",
  "gameId": 85,
  "expectedDefaultLootCount": 6,
  "reviewedMappings": [
    { "sourceRefName": "Mimics", "itemInternalName": "DualHook", "targetNpcInternalName": "Mimic", "status": "accepted" },
    { "sourceRefName": "Mimics", "itemInternalName": "MagicDagger", "targetNpcInternalName": "Mimic", "status": "accepted" },
    { "sourceRefName": "Mimics", "itemInternalName": "PhilosophersStone", "targetNpcInternalName": "Mimic", "status": "accepted" },
    { "sourceRefName": "Mimics", "itemInternalName": "TitanGlove", "targetNpcInternalName": "Mimic", "status": "accepted" },
    { "sourceRefName": "Mimics", "itemInternalName": "StarCloak", "targetNpcInternalName": "Mimic", "status": "accepted" },
    { "sourceRefName": "Mimics", "itemInternalName": "CrossNecklace", "targetNpcInternalName": "Mimic", "status": "accepted" }
  ],
  "rejectedRows": [
    { "sourceRefName": "Mimic", "itemInternalName": "BandofRegeneration", "reasonCode": "ordinary_mimic_contract_mismatch" },
    { "sourceRefName": "Mimic", "itemInternalName": "CloudinaBottle", "reasonCode": "ordinary_mimic_contract_mismatch" },
    { "sourceRefName": "Mimic", "itemInternalName": "Extractinator", "reasonCode": "ordinary_mimic_contract_mismatch" },
    { "sourceRefName": "Mimic", "itemInternalName": "FlareGun", "reasonCode": "ordinary_mimic_contract_mismatch" },
    { "sourceRefName": "Mimic", "itemInternalName": "HermesBoots", "reasonCode": "ordinary_mimic_contract_mismatch" },
    { "sourceRefName": "Mimic", "itemInternalName": "Mace", "reasonCode": "ordinary_mimic_contract_mismatch" },
    { "sourceRefName": "Mimic", "itemInternalName": "ShoeSpikes", "reasonCode": "ordinary_mimic_contract_mismatch" }
  ],
  "blockedVariants": [
    "PresentMimic",
    "BigMimicCorruption",
    "BigMimicCrimson",
    "BigMimicHallow",
    "BigMimicJungle"
  ],
  "branchRules": [
    { "branch": "remix_seed", "policy": "explicit_branch_required" },
    { "branch": "variant_sections", "policy": "separate_reviewed_mapping_required" }
  ]
}
```
