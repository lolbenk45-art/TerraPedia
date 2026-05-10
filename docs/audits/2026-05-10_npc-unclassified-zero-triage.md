# NPC Unclassified Zero Triage

Date: 2026-05-10
Branch: `fix/npc-domain-loot-closure`

## Inputs

- `reports/audit/npc-domain-loot-chain-2026-05-10-closure-baseline.json`
- `reports/audit/npc-source-coverage-inventory-2026-05-10-closure-baseline.json`

This triage is read-only. It does not authorize contract writes by itself.

## Summary

`unclassifiedZero = 319`.

| Triage group | Count | Meaning |
| --- | ---: | --- |
| `source_present_materialization_defect` | `172` | Source coverage reports loot evidence, but relation/projection/local/API rows are zero. |
| `expected_zero_candidate` | `147` | Source coverage reports no loot and all current row counts are zero. |
| `inheritance_candidate` | `0` safely proven | Some names look like segment/body/prototype variants, but current reports do not provide reviewed source NPC mappings. |
| `source_missing_or_group_variant_gap` | `0` in this 319 set | Source-gap rows are represented outside the strict `unclassifiedZero` subset. |
| `parser_or_identity_defect` | `0` safely proven | Suspected patterns exist, but current reports do not attach enough parser/identity evidence to promote them. |
| `needs_human_review` | `0` as a top-level routing bucket | All rows can route to the two report-supported lanes above, but final promotion still needs reviewed evidence. |

## Representative Samples

`source_present_materialization_defect` examples:

- `AngryBonesBig`
- `ArmedZombie`
- `ArmsDealer`
- `BloodEelBody`
- `BoneSerpentTail`
- `CataractEye`
- `WyvernBody`
- `WyvernTail`

`expected_zero_candidate` examples:

- `AncientCultistSquidhead`
- `AncientDoom`
- `Angler`
- `AnomuraFungus`
- `BoundTownSlimeOld`
- `Bunny`
- `Firefly`
- `GoldWorm`

## Contract Boundary

No expected-zero contract row may be added from current DB absence alone. Required fields remain:

```text
npcInternalName | npcType | reason | evidenceSource | reviewedBy | reviewedAt
```

No inheritance contract row may be added from display name or segment-looking names alone. Required fields remain:

```text
targetNpcInternalName | sourceNpcInternalName | inheritanceKind | evidenceSource | reviewedBy | reviewedAt
```

## Missing Evidence

The current reports are not enough to safely promote candidates into final contract rows. Missing evidence includes:

- reviewed expected-zero reason
- NPC role class such as town, bound, critter, helper, effect, hostile, or killable
- inheritance source NPC
- inheritance kind
- segment/prototype parent
- reviewed evidence source

For the 172 materialization-defect rows, the current domain `sourceRows` output does not expose exact failing item/source-row identities for the `unclassifiedZero` subset. The next implementation step must improve source-row traceability or use downstream source coverage/materialization diagnostics before applying data writes.

## Exit Decision

Phase 1 triage is complete as a routing artifact, but Phase 1 is not closed. `unclassifiedZero` must reach `0` before Phase 5 dry-run and Phase 6 apply.
