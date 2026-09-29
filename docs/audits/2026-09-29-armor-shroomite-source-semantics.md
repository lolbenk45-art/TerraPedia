# Shroomite source semantics correction

Status: source audit and tested admission guard; **not ingestion acceptance**.

## Source binding

The preserved English `Shroomite armor` page is page4771, revision1027106,
timestamp `2026-09-02T13:55:25Z`. Raw artifact:
`.local/tmp/a63-20260929-armor-source-01/raw/shroomite-headgear.json`.
Its bytes were rehashed against that run's manifest:
`sha256:e04b55ce891e88059a09b29958f2dafff571afdfee4c7ae51f39290f48eb5176`.
The five item requests redirected to this same page/revision; they are not five
independent per-piece sources. Wikitext statements below are direct evidence;
transcluded infobox values are not independently revision-pinned by the page.

The older Chinese attribute table is revision199734 dated
`2023-10-23T04:15:47Z`. Its230-record parsed artifact is retained in coordinator
namespace `.local/tmp/a63-20260928-04/parsed-v3/`; canonical JSON hash:
`sha256:a4e8186ea73e0c9e358bbf31e64cfa7b2e8987b2369e4a3a8e1f6a23ac5272c8`.
This audit does not modify either source or authorize mixing their values.

## Exact findings

The current page's Notes state:

> The ×1.12 damage boost to the specific ammunition type is applied ''after'' applying damage increases from the rest of the armor set, [[accessories]], and [[buffs]].

The footnote states:

> This is not a typo. The increase is applied multiplicatively, after all other damage increases have been applied.

History under `Desktop 1.4.5.0` states:

> Each piece of Shroomite headgear now applies its damage bonus to ammo as well as weapons.
> Each piece of Shroomite headgear damage bonus has been reduced from 15% to 12%.

These statements correct the previous source-resolution entry/report's claim
that the page supplies only equipped totals and no per-headpiece authority.
They establish current multiplicative semantics, but do not turn the old
`>15%` cells into exact additive15% or current12% facts.

| Owner (Iteminfo identity) | Current multiplicative scope | Old table note |
| --- | --- | --- |
| ShroomiteHeadgear /1546 | bows, repeaters, arrows, Stakes | 额外弓伤害 |
| ShroomiteMask /1547 | guns, bullets, Candy Corn | 额外枪伤害 |
| ShroomiteHelmet /1548 | specialist ranged weapons (non-consumable ranged weapons that are not bows or guns) and their ammunition | 额外其他远程伤害 |

Module identity evidence is retained in source run02: Iteminfo revision1023241
and ArmorSetBonuses revision964993. The latter maps Shroomite's three variants
to body1549/legs1550 and canonical `ArmorSetBonus.Shroomite`, with symbolic
benefit `player.shroomiteStealth = true;`. Its1.4.5.3 content predates the page's
1.4.5.7 stealth change; it does not validate present stealth magnitudes.

## Ownership and version boundaries

- The page introduces13% ranged damage,25% ranged critical chance,20% ammo
  conservation and12% movement speed as effects of the **full equipped set**.
  They must not be added again as independent set bonuses on top of piece stats.
- The headpiece multiplier belongs to the item; the weapon/ammunition condition
  is mandatory. `operation=multiply`, `valueDecimal=1.12`, `unit=multiplier`
  expresses the current magnitude, with explicit source/version applicability.
  This is a model requirement, not an already admitted candidate.
- Stealth belongs to the armor set and is conditional. The current page records
  the1.4.5.7 maximum ranged-damage change from60% to50%, and cites1.4.5.8 source
  code. Old module text cannot establish current values by itself.
- Three old `rangedDamageCritChance='>20%'` cells are summaries. They are not
  three more independently missing effects. Sorting hints15.5/20.5 are not facts.

## Implemented and verified

The relation producer and independently implemented projection rederivation now
reject nonzero ranged-damage cells accompanied by the three observed specialized
notes, even when someone has replaced the qualified text with exact12% or15%.
Ordinary ranged damage with an unrelated note remains accepted. The guard is
deliberately limited to the observed source vocabulary; it is not a general
natural-language parser or a proof of source completeness.

Diagnostics now report summary columns with `cellRole=summary`, without producing
extra effects. Against all230 preserved source records the result is exactly
six diagnostics: three qualified damage cells and three qualified summaries,
at source indices151–153. The diagnostic report uses source indices, not invented
database record keys or inferred item IDs, and is retained at
`.local/tmp/armor-specialized-cell-audit-20260929.json`.

RED:11 new missing-rejection/diagnostic assertions failed as expected.
GREEN:145/145 producer/projection tests; full targeted source/relation regression
273/273, zero failures. Logs: `.local/logs/armor-specialized-{red,green,regression}.log`.

## Remaining acceptance

No existing incorrect relation row was retired, no source was landed and no
database publication occurred. The versioned item-source adapter, complete
candidate, fresh governed packet/application and DB/admin/public readbacks remain
required. API fields expose multiplication/conditions, but public
`utils/armorSetPresentation.ts`'s compact label omits conditions: verify actual
consumer presentation before claiming that specialized scopes are visible.

The executable guard tasks and subsequent closure milestones are tracked in
`docs/superpowers/plans/2026-09-29-armor-specialized-damage-semantics.md`.
