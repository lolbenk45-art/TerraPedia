# Warning Burn-Down Baseline

Date: `2026-05-07`

## Scope

This baseline freezes the current warning inventory for `docs/plans/2026-05-07_warning-burn-down-plan.md` before any burn-down edits. It records the exact panel set, the Phase 0 command evidence, and the Phase 0.5 classification placeholders.

## Commands Run

```powershell
node scripts/data/workflow/domain-acceptance-generate-reports.mjs --write=true
node scripts/data/workflow/domain-acceptance-freshness-audit.mjs
node scripts/data/workflow/domain-acceptance-a-grade-gate.mjs --fail-on-blocked=true
```

## Phase 0 Result

- `generate-reports`: `writtenCount=45`, `warningCount=17`, `blockedCount=0`
- `freshness-audit`: `overallStatus=pass`
- `a-grade-gate`: `overallStatus=warning`
- `a-grade-gate blockingReasons`: `[]`
- `a-grade-gate warningReasons`: `["domain acceptance generation has 17 warning panels"]`

No DB-writing producer was executed in Phase 0. The only write action was domain report baseline generation under `reports/domain/**`.

## Warning Inventory

### Group A: Unresolved Audit Trend Baseline Missing

1. `items/unresolved-audit-trend`
   - reason: `reports/relation/reresolve-candidates-2026-05-07.json: historical baseline is unavailable for unresolved audit trend`
2. `npcs/unresolved-audit-trend`
   - reason: `reports/relation/reresolve-candidates-2026-05-07.json: historical baseline is unavailable for unresolved audit trend`
3. `bosses/unresolved-audit-trend`
   - reason: `reports/relation/reresolve-candidates-2026-05-07.json: historical baseline is unavailable for unresolved audit trend`
4. `buffs/unresolved-audit-trend`
   - reason: `reports/relation/reresolve-candidates-2026-05-07.json: historical baseline is unavailable for unresolved audit trend`
5. `projectiles/unresolved-audit-trend`
   - reason: `reports/relation/reresolve-candidates-2026-05-07.json: historical baseline is unavailable for unresolved audit trend`
6. `armor_sets/unresolved-audit-trend`
   - reason: `reports/relation/reresolve-candidates-2026-05-07.json: historical baseline is unavailable for unresolved audit trend`

### Group B: Missing Optional Evidence

7. `items/source-readiness`
   - missing: `reports/wiki-items-fetch*.json`
8. `items/source-readiness`
   - missing: `reports/wiki-item-pages-fetch*.json`
9. `items/relation-readiness`
   - missing: `reports/relation/item-relations-bundle*.json`
10. `items/image-readiness`
    - missing: `reports/image-sync*.json`
11. `npcs/relation-readiness`
    - missing: `reports/data/npc-buff-relations-backfill*.json`
12. `buffs/relation-readiness`
    - missing: `reports/data/npc-buff-relations-backfill*.json`
13. `projectiles/image-readiness`
    - missing: `data/generated/projectile-zh-map.json`
14. `support.category/source-readiness`
    - missing: `reports/relation/category-local-sync*.json`
15. `support.recipe/source-readiness`
    - missing: `data/generated/wiki-zh-recipe-pages.latest.json`
16. `support.recipe/source-readiness`
    - missing: `reports/wiki-zh-recipe-import*.json`
17. `support.recipe/blocking-gate`
    - missing: `reports/recipe-provider-consolidation*.json`
18. `support.recipe/blocking-gate`
    - missing: `reports/recipe-provider-suppression*.json`
19. `support.recipe/blocking-gate`
    - missing: `reports/wiki-zh-recipe-source-coverage*.json`
20. `support.shimmer/blocking-gate`
    - missing: `reports/wiki-shimmer-db-import*.json`

Panel count contribution from Group B: `10`

### Group C: Armor Image Semantic Warning

21. `armor_sets/image-readiness`
   - reason: `reports/fetch/fetch-armor-set-images-2026-04-27T19-29-52.416Z.json: armor image fetch warningCount=30 has only 10 sampled fallback records`

Panel count contribution from Group C: `1`

## Phase 0.5 Classification Placeholders

### Product Optional Evidence

| Artifact | Consumer panel(s) | Classification | Owner lane | Next action |
| --- | --- | --- | --- | --- |
| `reports/wiki-items-fetch*.json` | `items/source-readiness` | `retire-expectation` | `Lane 2` | Replace stale glob with current fetch evidence contract or remove it from audit expectation. |
| `reports/wiki-item-pages-fetch*.json` | `items/source-readiness` | `retire-expectation` | `Lane 2` | Replace stale glob with current item-page fetch evidence contract or remove it from audit expectation. |
| `reports/relation/item-relations-bundle*.json` | `items/relation-readiness` | `needs-producer` | `Lane 2` | Existing builder does not emit the expected path; add matching report output or retarget audit to the actual output path. |
| `reports/image-sync*.json` | `items/image-readiness` | `retire-expectation` | `Lane 2` | Replace stale glob with `reports/workflow-image-sync*.json`. |
| `reports/data/npc-buff-relations-backfill*.json` | `npcs/relation-readiness`, `buffs/relation-readiness` | `re-generatable` | `Lane 2` | Use `backfill-npc-buff-relations-from-wiki-crawler.mjs --apply=false` in a separate DB-read dry-run lane if needed. |
| `data/generated/projectile-zh-map.json` | `projectiles/image-readiness` | `re-generatable` | `Lane 2` | Use `backfill-projectile-zh-and-images.mjs --apply=false --skipUpload=true` if evidence regeneration is approved. |

### Support Optional Evidence

| Artifact | Consumer panel(s) | Classification | Owner lane | Next action |
| --- | --- | --- | --- | --- |
| `reports/relation/category-local-sync*.json` | `support.category/source-readiness` | `re-generatable` | `Lane 3` | Use `sync-item-categories-from-wiki-pages.mjs --apply=false --report=...` if DB-read dry-run is approved. |
| `data/generated/wiki-zh-recipe-pages.latest.json` | `support.recipe/source-readiness` | `re-generatable` | `Lane 3` | Requires crawler/network fetch; keep expectation and regenerate only in a crawler-approved lane. |
| `reports/wiki-zh-recipe-import*.json` | `support.recipe/source-readiness` | `re-generatable` | `Lane 3` | Use `import-wiki-zh-recipes-to-db.mjs --apply=false` after recipe pages exist. |
| `reports/recipe-provider-consolidation*.json` | `support.recipe/blocking-gate` | `re-generatable` | `Lane 3` | Use `consolidate-recipe-provider-priority.mjs --dry-run=true`. |
| `reports/recipe-provider-suppression*.json` | `support.recipe/blocking-gate` | `re-generatable` | `Lane 3` | Use `audit-recipe-provider-suppression-by-item.mjs`. |
| `reports/wiki-zh-recipe-source-coverage*.json` | `support.recipe/blocking-gate` | `re-generatable` | `Lane 3` | Use `audit-wiki-zh-recipe-source-coverage.mjs` after recipe pages exist. |
| `reports/wiki-shimmer-db-import*.json` | `support.shimmer/blocking-gate` | `re-generatable` | `Lane 3` | Use `import-wiki-shimmer-to-db.mjs --apply=false` if shimmer inputs are present and DB-read dry-run is approved. |

## Exit Check

- Baseline warning inventory matches the plan: `17` warning panels total.
- Gate `blockingReasons` remains `[]`.
