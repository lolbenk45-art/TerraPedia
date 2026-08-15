const REFERENCE_ONLY_BOSS_CODES = new Set(['MECHDUSA']);

export function resolveBossLootOwnerContext(bossGroup) {
  const members = Array.isArray(bossGroup?.members) ? bossGroup.members : [];
  const ownerNpc = members.find((member) => normalizeRole(member?.bossRole) === 'primary') ?? null;
  if (ownerNpc) {
    return {
      ownerNpc,
      ownerMode: 'assigned',
      skipReason: null,
    };
  }

  if (REFERENCE_ONLY_BOSS_CODES.has(normalizeCode(bossGroup?.code))) {
    return {
      ownerNpc: null,
      ownerMode: 'reference_only_composite_without_npc_owner',
      skipReason: 'reference_only_composite_boss_without_npc_owner',
    };
  }

  return {
    ownerNpc: null,
    ownerMode: 'unresolved',
    skipReason: 'primary_owner_npc_not_found',
  };
}

function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeRole(value) {
  return String(value ?? '').trim().toLowerCase();
}
