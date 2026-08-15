export const EXPECTED_NPC_T0_SCHEMA_EVIDENCE = Object.freeze([
  ['local', 'source_dataset_landings'],
  ['local', 'items'],
  ['local', 'npcs'],
  ['local', 'buffs'],
  ['local', 'npc_buff_relations'],
  ['local', 'npc_shop_entries'],
  ['local', 'npc_loot_entries'],
  ['maint', 'maint_npc_crawler_facts'],
  ['relation', 'item_source_facts'],
  ['relation', 'item_source_details'],
  ['relation', 'item_npc_shop_relations'],
  ['relation', 'item_npc_loot_relations'],
  ['relation', 'npc_buff_relations'],
]);

export function validateNpcCanonicalT1Snapshot(npcSnapshot) {
  if (npcSnapshot?.requiredTableCount !== EXPECTED_NPC_T0_SCHEMA_EVIDENCE.length
      || !npcSnapshot?.sourceCounts || typeof npcSnapshot.sourceCounts !== 'object'
      || Array.isArray(npcSnapshot.sourceCounts)) {
    throw new Error('NPC T1 snapshot proof is invalid');
  }
  const expectedKeys = EXPECTED_NPC_T0_SCHEMA_EVIDENCE.map(([role, table]) => `${role}.${table}`).sort();
  const actualKeys = Object.keys(npcSnapshot.sourceCounts).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)
      || actualKeys.some((key) => !Number.isSafeInteger(npcSnapshot.sourceCounts[key]) || npcSnapshot.sourceCounts[key] <= 0)) {
    throw new Error('NPC T1 snapshot proof is missing, extra, or non-positive');
  }
  return npcSnapshot;
}
