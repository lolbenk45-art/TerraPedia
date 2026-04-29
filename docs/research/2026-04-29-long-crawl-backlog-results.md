# 2026-04-29 Long Crawl Backlog Results

## Scope

Executed the post M0-M8 long-crawl operations track for a bounded NPC/item relation shard.

Shard items:

- MiningPotion
- HeartreachPotion
- ObsidianSkinPotion
- SpelunkerPotion
- GravitationPotion

## Monitor Result

The admin crawler monitor was verified at:

`http://localhost:3001/operations/crawler-monitor`

During the shard crawl the page showed:

- action: `item_pages-refresh`
- status: `running`
- progress: `2/5`, `40%`
- phase: `fetch`
- message: `fetched 2/5 item page(s); ok=2; failed=0`
- runtime file: `data/generated/wiki-sync-progress.latest.json`

The shard completed with `Fetched pages: 5` and `Failed pages: 0`.

## Data Chain Result

M10 relation health baseline:

- report: `reports/relation/relation-health-m10-long-crawl-backlog-20260429-082100.json`
- blocking checks: 0
- warning checks: 1
- unresolved item/NPC relation audits: 2689

M12 serial replay:

- landing import applied to `terria_v1_maint.source_dataset_landings`
- maint sync applied for `item_pages`
- relation sync applied to `terria_v1_relation`
- projection sync applied to local core tables for `items,npcs,projectiles`
- relation-to-local compatibility sync applied to local compatibility tables

M13 relation health:

- report: `reports/relation/relation-health-m13-post-shard-20260429-090500.json`
- blocking checks: 0
- warning checks: 1
- unresolved item/NPC relation audits: 2689
- shop resolved count: 288
- loot resolved count: 587
- shop orphans: 0
- loot orphans: 0
- missing shop resolution: 0
- missing loot resolution: 0

Projection non-empty counts:

- `projection_items.source_npcs_json`: 518
- `projection_npcs.loot_items_json`: 182
- `projection_npcs.shop_items_json`: 22
- `projection_npcs.source_items_json`: 497

Local compatibility counts:

- `item_acquisition_sources`: 3187
- `npc_loot_entries`: 587
- `npc_shop_entries`: 288
- `npc_shop_conditions`: 211

Replacement readiness:

- report: `reports/relation/replacement-readiness-m13-post-shard-20260429-090500.json`
- switchable domains: items, npcs, projectiles, buffs
- blocked domains: none

## Operational Notes

`sync-landing-to-maint --apply=true` initially failed with MySQL `OS errno 28 - No space left on device`.
Root cause was C drive exhaustion from MySQL binary logs. Cleared old logs with:

```powershell
PURGE BINARY LOGS TO 'DESKTOP-TBK197M-bin.000539'
```

After purge, C drive had about 25.3 GB free and the maint sync retry completed.

The first landing import apply command exceeded the shell timeout, but the process continued and committed. DB verification after it finished showed:

- `source_dataset_landings` total rows: 6518
- `item_pages_raw` current rows: 6131
- `item_pages_raw` all rows: 6131

## Next Shard Recommendation

Backlog did not decrease for this 5-item shard. Continue with shards selected from the unresolved audit breakdown instead of repeating potion pages:

- `npc_source_unresolved`: 1514
- `item_unresolved`: 742
- `source_text_polluted`: 223
- `npc_source_ambiguous`: 210

Prefer pages tied to high-count `npc_source_unresolved` evidence, and keep `--only-changed=false` for monitor-visible forced fetches.
