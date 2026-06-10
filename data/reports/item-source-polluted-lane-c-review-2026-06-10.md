# Item Source Polluted Lane C Review - 2026-06-10

## Scope

- Input report: `data/reports/item-source-candidate-import-plan.after-polluted-lane-c.json`
- Batch 01: `data/reports/item-source-polluted-lane-c-batches/batch-01.json`
- Batch 02: `data/reports/item-source-polluted-lane-c-batches/batch-02-mummy-set.json`
- Promotion scope: `polluted`
- Target database: `terria_v1_local`

## Result

- Newly inserted local rows: 16
- Batch 01 inserted rows: 4
- Batch 02 inserted rows: 12
- Blocked rows: 0
- Validation errors: 0
- Duplicates: 0

## Promoted Pages

| Page | Candidates | Rows | Rule |
| --- | ---: | ---: | --- |
| Shucked Oyster | 1 | 1 | `drop/item/Oyster`, page-gated to `Shucked Oyster` |
| Witch set | 3 | 3 | `drop/item/Goodie Bag`; `Vampirism worlds` worldgen text omitted |
| Mummy set | 3 | 12 | `drop/npc/Blood Mummy`, `Dark Mummy`, `Light Mummy`, `Mummy` |

## Inserted IDs

- Batch 01: `198501-198504`
- Batch 02: `198505-198516`

## Remaining Blocked Polluted Pages

| Page | Candidates | Reason |
| --- | ---: | --- |
| Torches | 24 | Page-level source matrix is copied to every torch; needs item-specific row discriminator. |
| Block-placing wands | 6 | Page-level mixed source matrix is copied to every wand; needs item-specific row discriminator. |
| Ropes | 4 | Page-level source matrix is copied to every rope; needs item-specific row discriminator. |

## Validation

- `node --test scripts/data/audit/build-item-source-candidate-import-plan.test.mjs` passed after RED/GREEN updates.
- Dry-runs for both lane C batches reported `blockedRows=0`, `validationErrors=0`, `duplicates=0`.
- Apply reports contain rollback SQL.
- DB check over inserted IDs `198501-198516`: inserted rows `16`, bad item refs `0`, bad item-backed refs `0`, bad NPC-backed refs `0`.
- API smoke:
  - `/api/public/items/4411/sources` returns `drop/item/Oyster`, quantity `1`, chance `100%`.
  - `/api/public/items/1766/sources` returns `drop/item/Goodie Bag`, quantity `1`, chance `3.51%`.
  - `/api/public/items/870/sources` returns the four Mummy NPC drop sources, each chance `1.33%`.

## Notes

- No crawler, fetch, import, backfill, pipeline, sync, or Flyway apply was run.
- No matrix page rows were imported.
- Chromium-based UI DOM smoke is blocked by the existing local snap mount namespace issue; API and static front checks were used instead.
