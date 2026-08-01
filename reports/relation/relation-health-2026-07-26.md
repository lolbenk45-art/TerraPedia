# Relation Health Report

Generated At: 2026-07-26T23:16:53.332Z
Status: blocked
Blocking Checks: 1
Warning Checks: 1

| Check | Status | Message |
| --- | --- | --- |
| maint_item_sources_vs_item_source_facts | pass | delta is 0 |
| maint_item_sources_missing_in_relation | pass | count is 0 |
| item_source_facts_missing_in_maint | pass | count is 0 |
| maint_item_sources_by_type | info | 5 row(s) |
| maint_backfill_candidates_open_count | info | 1 row(s) |
| maint_backfill_candidates_breakdown | info | 2 row(s) |
| item_source_facts_by_type_review | info | 10 row(s) |
| shop_relation_resolved_count | pass | count is 938 |
| loot_relation_resolved_count | pass | count is 1542 |
| shop_relation_orphans | pass | count is 0 |
| loot_relation_orphans | pass | count is 0 |
| shop_relation_missing_resolution | pass | count is 0 |
| loot_relation_missing_resolution | pass | count is 0 |
| unresolved_item_npc_relation_audits | warn | count is 287 |
| open_item_npc_loot_relation_audits | pass | count is 0 |
| item_npc_relation_audit_breakdown | info | 23 row(s) |
| relation_exportable_reports_latest | info | 4 row(s) |
| relation_unresolved_export_report_count | pass | count is 1 |
| projection_items_source_npcs_nonempty | pass | count is 1196 |
| projection_npcs_loot_items_nonempty | pass | count is 418 |
| projection_npcs_shop_items_nonempty | pass | count is 30 |
| projection_npcs_source_items_nonempty | pass | count is 497 |
| projection_projectiles_source_items_nonempty | pass | count is 624 |
| projection_projectiles_source_npcs_nonempty | pass | count is 30 |
| local_compat_item_acquisition_sources_count | pass | count is 8857 |
| local_compat_npc_loot_entries_count | pass | count is 1888 |
| local_compat_npc_shop_entries_count | pass | count is 762 |
| local_compat_npc_shop_conditions_count | fail | expected delta 0, got -306 |
