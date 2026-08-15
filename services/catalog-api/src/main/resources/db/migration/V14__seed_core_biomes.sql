INSERT INTO `biomes` (
  `code`,
  `name_en`,
  `name_zh`,
  `alias_en`,
  `alias_zh`,
  `layer_type`,
  `biome_type`,
  `description`,
  `source_provider`,
  `source_page`,
  `status`
) VALUES
  ('forest', 'Forest', NULL, NULL, NULL, 'surface', 'pure', 'Default surface biome and common early-game area.', 'wiki_gg', 'Forest', 1),
  ('jungle', 'Jungle', NULL, NULL, NULL, 'surface', 'jungle', 'Surface jungle biome with Underground Jungle beneath it.', 'wiki_gg', 'Jungle', 1),
  ('desert', 'Desert', NULL, NULL, NULL, 'surface', 'desert', 'Surface desert biome with Underground Desert beneath it.', 'wiki_gg', 'Desert', 1),
  ('snow', 'Snow biome', NULL, 'Tundra', NULL, 'surface', 'snow', 'Surface snow biome that transitions into the Ice biome underground.', 'wiki_gg', 'Snow biome', 1),
  ('crimson', 'The Crimson', NULL, 'Crimson', NULL, 'surface', 'crimson', 'Evil biome with crimson grass, chasms and Crimson Hearts.', 'wiki_gg', 'The Crimson', 1),
  ('corruption', 'The Corruption', NULL, 'Corruption', NULL, 'surface', 'corruption', 'Evil biome counterpart to the Crimson.', 'wiki_gg', 'The Corruption', 1),
  ('hallow', 'Hallow', NULL, NULL, NULL, 'surface', 'hallow', 'Hardmode holy biome with its own enemies and drops.', 'wiki_gg', 'Hallow', 1)
ON DUPLICATE KEY UPDATE
  `name_en` = VALUES(`name_en`),
  `name_zh` = VALUES(`name_zh`),
  `alias_en` = VALUES(`alias_en`),
  `alias_zh` = VALUES(`alias_zh`),
  `layer_type` = VALUES(`layer_type`),
  `biome_type` = VALUES(`biome_type`),
  `description` = VALUES(`description`),
  `source_provider` = VALUES(`source_provider`),
  `source_page` = VALUES(`source_page`),
  `status` = VALUES(`status`);
