const apply = (operationId, ownedTables) => Object.freeze({
  operationId,
  databaseMode: 'ACTIVATION_GATED_APPLY',
  ownedTables: Object.freeze(ownedTables.map((table) => Object.freeze({ databaseRole: 'local', table }))),
});

export const AUTO_DOMAIN_OPERATION_CONFIG = Object.freeze({
  items: apply('automation-items-l1', ['items']),
  npcs: apply('automation-npcs-l1', ['npcs']),
  projectiles: apply('automation-projectiles-l1', ['projectiles']),
  armor_sets: apply('automation-armor-sets-l1', ['armor_sets', 'armor_set_items']),
  buffs: apply('automation-buffs-l1', ['buffs', 'buff_source_items']),
  audio: apply('automation-audio-first-l1', ['audio_assets', 'audio_asset_links']),
  bosses: apply('automation-bosses-first-l1', ['boss_groups', 'npcs']),
  shimmer: apply('automation-shimmer-first-l1', [
    'shimmer_item_transforms',
    'shimmer_decraft_rules',
    'shimmer_entity_transforms',
    'shimmer_npc_transforms',
  ]),
});

export function requireAutoDomainOperation(domain) {
  const normalized = String(domain ?? '').trim();
  const config = AUTO_DOMAIN_OPERATION_CONFIG[normalized];
  if (!config) throw new Error(`unsupported automatic domain: ${normalized || '<empty>'}`);
  return config;
}
