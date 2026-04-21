import path from 'node:path';

export function resolveBossLootSchemaSqlPath(repoRoot) {
  return path.join(
    repoRoot,
    'back',
    'src',
    'main',
    'resources',
    'db',
    'migration',
    'V35__add_drop_source_kind_to_npc_loot_entries.sql'
  );
}
