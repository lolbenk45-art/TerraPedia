# Mimic Family Loot Baseline

Date: 2026-05-09
Branch: `fix/mimic-family-npc-loot-correction`

## Baseline

Current DB state observed before implementation:

| NPC | Local loot | Relation loot | Projection loot |
| --- | ---: | ---: | ---: |
| `Mimic` | 7 | 7 | 7 |
| `IceMimic` | 9 | 9 | 9 |
| `WaterBoltMimic` | 1 | 1 | 1 |
| `PresentMimic` | 0 | 0 | 0 |
| `BigMimicCorruption` | 0 | 0 | 0 |
| `BigMimicCrimson` | 0 | 0 | 0 |
| `BigMimicHallow` | 0 | 0 | 0 |
| `BigMimicJungle` | 0 | 0 | 0 |

## Wrong Ordinary Mimic Rows

Current ordinary `Mimic` rows are all contract mismatches:

- `BandofRegeneration`
- `CloudinaBottle`
- `Extractinator`
- `FlareGun`
- `HermesBoots`
- `Mace`
- `ShoeSpikes`

## Required Target

Ordinary `Mimic` must end with exactly six promoted loot rows:

- `DualHook`
- `MagicDagger`
- `PhilosophersStone`
- `TitanGlove`
- `StarCloak`
- `CrossNecklace`
