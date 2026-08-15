export function normalizeNpcShopRows(rows, context = {}) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => {
      const itemName = row.itemName ?? row.item ?? row.name ?? null;
      return {
        relationType: 'shop',
        itemName,
        priceText: row.priceText ?? row.price ?? row.valueText ?? null,
        conditionText: row.conditionText ?? row.condition ?? row.availabilityNote ?? null,
        npcInternalName: context.npcInternalName ?? null,
        npcName: context.npcName ?? null,
        sourceSection: row.sourceSection ?? 'shop',
        sourceRowIndex: index,
        raw: row
      };
    })
    .filter((row) => String(row.itemName ?? '').trim());
}
