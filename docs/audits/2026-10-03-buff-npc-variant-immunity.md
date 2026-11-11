# Buff NPC Variant Immunity Audit

## Verdict

Variant immunity is identity-safe in the source contract: rows are keyed by
stable numeric NPC ID and `internalName`, so NPCs that share a display name do
not inherit one another's `buffImmune` values. The audit is read-only evidence;
it does not authorize canonical ingestion or database writes.

## Evidence

The revision-bound `Module:Npcinfo/data` capture is revision `1022313`
(`2026-08-20T18:13:10Z`) with raw artifact SHA-256
`sha256:0c3a474f7b0f0034bc62183b2a0ae1b00c13f47527f109f24e8e8a536fec2a3a`.
The complete semantic capture reports `762` numeric NPC rows and expands
specific `buffImmune`, `buffImmuneAll`, and `buffImmuneAllNotWhips` fields only
after binding the revision-pinned Npcinfo documentation, datagen, Buff catalog,
and Whips sources.

The captured rows show the relevant distinction:

| NPC ID | Internal name | Display name | Immune Buff IDs | Names |
| ---: | --- | --- | --- | --- |
| `59` | `LavaSlime` | Slime | `20, 24, 323, 30, 375` | Poisoned, On Fire!, Hellfire, Bleeding, Hemorrhage |
| `-10` | `JungleSlime` | Slime | `30, 375, 20` | Bleeding, Hemorrhage, Poisoned |
| `204` | `SpikedJungleSlime` | Spiked Jungle Slime | `30, 375, 20` | Bleeding, Hemorrhage, Poisoned |
| `121` | `Slimer` | Slimer | `30, 375, 20` | Bleeding, Hemorrhage, Poisoned |
| `-2` | `Slimer2` | Slimer | `30, 375, 20` | Bleeding, Hemorrhage, Poisoned |
| `183` | `Crimslime` | Crimslime | `30, 375, 20` | Bleeding, Hemorrhage, Poisoned |

The important difference is `LavaSlime` ID `59`: its source row includes
`On Fire!` (`24`) and `Hellfire` (`323`), while `JungleSlime` ID `-10` does
not. A display-name keyed merge would lose this distinction; the current
verifier does not perform that merge.

The new regression in
`pipelines/fetch/buff-npcinfo-evidence.test.mjs` uses two synthetic rows with
the same display name and different stable identities. It asserts that both
rows survive and that their immunity sets remain different. The focused
Npcinfo suite passes `9/9`.

## Boundaries

The implementation also rejects duplicate stable IDs and duplicate
`internalName` values in a complete Npcinfo capture. All-buff flags are expanded
only with the separately captured semantic contract. `lavaImmune` is not used
as Buff immunity; it is a different game property.

This proves variant separation at the evidence and normalization boundary. The
latest partial replay remains non-executable, and the runtime relation and
projection tables have not been updated. Canonical ingestion remains blocked
by unresolved shared-page source scope and missing historical Buff baselines.
