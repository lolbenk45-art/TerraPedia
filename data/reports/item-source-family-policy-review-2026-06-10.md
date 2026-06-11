# Item Source Family Policy Review - 2026-06-10

## Scope

- Input report: `data/reports/item-source-candidate-import-plan.after-family-policy.json`
- Batch: `data/reports/item-source-family-policy-batches/batch-01.json`
- Apply report: `data/reports/item-source-family-policy-batch-01-apply.json`
- Promotion scope: `family`

## Result

- Newly eligible family candidates: 327
- Planned rows: 327
- Inserted local rows: 327
- Blocked rows: 0
- Validation errors: 0
- Duplicates: 0

## Promoted Pages

| Page | Candidates | Source contract |
| --- | ---: | --- |
| Bookcases | 64 | `worldgen/world` |
| Grandfather Clocks | 65 | `worldgen/world` |
| Pianos | 64 | `worldgen/world` |
| Tables | 69 | `worldgen/world` |
| Work Benches | 65 | `worldgen/world` |

## Explicitly Not Promoted

- Paintings
- Statues
- Music Boxes
- Torches
- Ropes
- Block-placing wands

## Safety Notes

- The candidate planner now supports `--promotion-scope=family|polluted|all`; Phase 2 was regenerated with `--promotion-scope=family`.
- The family apply input was a filtered delta batch, not the full candidate report.
- All inserted family rows are additive local rows in `terria_v1_local.item_acquisition_sources`.
- Rollback SQL is present in `data/reports/item-source-family-policy-batch-01-apply.json`.
