# Replacement Readiness

Generated At: 2026-07-29T10:50:59.025Z

Switchable Domains: bosses, projectiles
Blocked Domains: items, npcs, buffs

## items
- status: blocked
- local rows: 6159
- projection rows: 6146
- shared rows: 6146
- missing in projection: RoninShirt, TimelessTravelerHood, TVHeadPants, AntlionEggs, BoneWhip
- extra in projection: none
- accepted local-only exceptions: ZH_RECIPE_SPINAL_TAP, ZH_RECIPE_PINK_JELLYFISH_BAIT, ZH_RECIPE_GREEN_JELLYFISH_BAIT, ZH_RECIPE_BLUE_JELLYFISH_BAIT, ZH_RECIPE_ANTLION_EGGS, ZH_RECIPE_TIMELESS_TRAVELER_S_SET, ZH_RECIPE_WANDERING_SET, ZH_RECIPE_TV_HEAD_SET
- blocking fields: image(gap=2)

## npcs
- status: blocked
- local rows: 762
- projection rows: 762
- shared rows: 762
- missing in projection: none
- extra in projection: none
- accepted local-only exceptions: none
- blocking fields: name_zh(gap=613), sub_name_zh(gap=206), life_max(gap=757), knock_back_resist(gap=624), scale(gap=119)

## bosses
- status: switchable
- local rows: 33
- projection rows: 33
- shared rows: 33
- missing in projection: none
- extra in projection: none
- accepted local-only exceptions: none
- blocking fields: none

## projectiles
- status: switchable
- local rows: 1111
- projection rows: 1111
- shared rows: 1111
- missing in projection: none
- extra in projection: none
- accepted local-only exceptions: none
- blocking fields: none

## buffs
- status: blocked
- local rows: 388
- projection rows: 388
- shared rows: 388
- missing in projection: none
- extra in projection: none
- accepted local-only exceptions: none
- blocking fields: image_cached_url<=image(gap=388)
