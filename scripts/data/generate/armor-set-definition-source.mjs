export function extractArmorSetCurrentItemIds(row) {
  const uniqueItemIds = parseNumberArray(row?.unique_item_ids_json);
  if (uniqueItemIds.length > 0) {
    return uniqueItemIds;
  }

  const sets = parseJson(row?.sets_json);
  if (Array.isArray(sets) && Array.isArray(sets[0])) {
    return sets[0].map(Number).filter(Number.isFinite);
  }
  return [];
}

export function toArmorSetDefinitionSeedRow(row) {
  return {
    armorSetId: Number(row?.id),
    name: toText(row?.source_key),
    internalCode: toText(row?.source_key),
    itemIds: extractArmorSetCurrentItemIds(row),
    textKey: toText(row?.text_key),
    setsJson: toText(row?.sets_json),
  };
}

function parseNumberArray(value) {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map(Number).filter(Number.isFinite);
}

function parseJson(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toText(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}
