# Item Source Polluted Repair Review - 2026-06-10

## Scope

- Input report: `data/reports/item-source-candidate-import-plan.after-polluted-lane-ab.json`
- Batch: `data/reports/item-source-polluted-lane-ab-batches/batch-01.json`
- Apply report: `data/reports/item-source-polluted-lane-ab-batch-01-apply.json`
- Promotion scope: `polluted`

## Result

- Newly eligible polluted candidates: 47
- Planned rows: 48
- Inserted local rows: 48
- Blocked rows: 0
- Validation errors: 0
- Duplicates: 0

## Promoted Pages

| Page | Candidates | Rule |
| --- | ---: | --- |
| Bride of Frankenstein set | 2 | `drop/item/Goodie Bag` |
| Cat set | 3 | `drop/item/Goodie Bag` |
| Creeper set | 3 | `drop/item/Goodie Bag` |
| Flairon | 1 | `drop/boss/Duke Fishron` + `treasure_bag/Treasure Bag (Duke Fishron)` |
| Fox set | 3 | `drop/item/Goodie Bag` |
| Ghost set | 2 | `drop/item/Goodie Bag` |
| Karate Tortoise set | 3 | `drop/item/Goodie Bag` |
| Leprechaun set | 3 | `drop/item/Goodie Bag` |
| Pixie set | 2 | `drop/item/Goodie Bag` |
| Princess set | 3 | `drop/item/Goodie Bag` |
| Pumpkin set | 3 | `drop/item/Goodie Bag` |
| Reaper set | 2 | `drop/item/Goodie Bag` |
| Robot set | 3 | `drop/item/Goodie Bag` |
| Space Creature set | 3 | `drop/item/Goodie Bag` |
| Treasure Hunter set | 2 | `drop/item/Goodie Bag` |
| Unicorn set | 3 | `drop/item/Goodie Bag` |
| Vampire set | 3 | `drop/item/Goodie Bag` |
| Wolf set | 3 | `drop/item/Goodie Bag` |

## Remaining Blocked Polluted Pages

| Page | Candidates | Reason |
| --- | ---: | --- |
| Torches | 24 | Page-level source matrix is copied to every torch; needs row-to-item mapping. |
| Block-placing wands | 6 | Page-level source matrix is copied to every wand; needs row-to-item mapping. |
| Ropes | 4 | Page-level source matrix is copied to every rope; needs row-to-item mapping. |
| Mummy set | 3 | Source is `drop/unknown/Mummies`; needs NPC group resolution before import. |
| Witch set | 3 | Contains `drop/item/Goodie Bag` plus extra `worldgen/world/Witch set worldgen`; blocked until the extra row is proven item-specific or dropped by fixture. |
| Shucked Oyster | 1 | Source is `drop/unknown/Oyster`; needs item-backed Oyster mapping or source-type correction. |

## Lane C Follow-up

See `data/reports/item-source-polluted-lane-c-review-2026-06-10.md`.

- `Shucked Oyster` was promoted as `drop/item/Oyster`.
- `Witch set` was promoted as `drop/item/Goodie Bag`; the `Vampirism worlds` worldgen text was omitted.
- `Mummy set` was promoted as explicit NPC drop rows for `Blood Mummy`, `Dark Mummy`, `Light Mummy`, and `Mummy`.
- After lane C, remaining polluted blockers are `Torches` 24, `Block-placing wands` 6, and `Ropes` 4.

## Safety Notes

- Goodie Bag normalization is page-gated to allowed vanity set pages.
- Flairon promotion is restricted to exactly Duke Fishron boss and Treasure Bag (Duke Fishron); `Expert Mode` is condition text on the treasure bag row.
- Torches, Ropes, and Block-placing wands remain blocked.
- Rollback SQL is present in `data/reports/item-source-polluted-lane-ab-batch-01-apply.json`.
