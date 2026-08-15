export function normalizeNpcLootRows(rows, context = {}) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => {
      const itemName = row.itemName ?? row.item ?? row.name ?? null;
      return {
        relationType: 'loot',
        itemName,
        chanceText: row.chanceText ?? row.chance ?? null,
        quantityText: row.quantityText ?? row.quantity ?? null,
        conditionText: row.conditionText ?? row.condition ?? null,
        npcInternalName: context.npcInternalName ?? null,
        npcName: context.npcName ?? null,
        sourceSection: row.sourceSection ?? 'drops',
        sourceRowIndex: index,
        ...(row.sourceInfobox ? { sourceInfobox: row.sourceInfobox } : {}),
        raw: row
      };
    })
    .filter((row) => String(row.itemName ?? '').trim());
}
