import {
  confidence,
  createRecordKey,
  normalizeText,
  normalizeTrace,
  relationStatus
} from './relation-trace.mjs';

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseJsonObject(value) {
  if (value == null || value === '') {
    return {};
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildBaseEntityRecord(sourceMaintTable, row) {
  const trace = normalizeTrace(sourceMaintTable, row);
  const raw = parseJsonObject(row.raw_json);
  const base = {
    recordKey: createRecordKey({
      type: sourceMaintTable,
      sourceMaintRecordKey: trace.sourceMaintRecordKey ?? null,
      sourceId: row.source_id ?? null,
      internalName: row.internal_name ?? null
    }),
    sourceId: toNullableNumber(row.source_id),
    internalName: normalizeText(row.internal_name),
    englishName: normalizeText(row.english_name),
    nameZh: normalizeText(row.name_zh),
    moduleGeneratedAt: normalizeText(row.module_generated_at),
    terrariaVersion: normalizeText(row.terraria_version),
    majorValue: toNullableNumber(row.major_value),
    combatValue: toNullableNumber(row.combat_value),
    defenseValue: toNullableNumber(row.defense_value),
    useTime: toNullableNumber(row.use_time),
    stackSize: toNullableNumber(row.stack_size),
    width: toNullableNumber(row.width),
    height: toNullableNumber(row.height),
    flagsJson: row.flags_json ?? null,
    reviewStatus: relationStatus.resolved,
    confidence: confidence.high,
    reason: `${sourceMaintTable}_mirrored`,
    rawJson: row.raw_json ?? null,
    ...trace
  };

  if (sourceMaintTable === 'maint_items') {
    base.rareRaw = toNullableNumber(raw.rare);
    base.valueRaw = toNullableNumber(raw.value);
  }

  if (sourceMaintTable === 'maint_npcs') {
    base.subNameZh = normalizeText(row.sub_name_zh);
  }

  return base;
}

function buildItemPageIndex(maintItemPages = []) {
  const index = new Map();
  for (const row of maintItemPages) {
    const key = normalizeText(row.item_internal_name);
    if (!key) {
      continue;
    }
    const current = index.get(key);
    if (!current) {
      index.set(key, row);
      continue;
    }
    const currentRevision = current.source_revision_timestamp ?? current.updated_at ?? null;
    const nextRevision = row.source_revision_timestamp ?? row.updated_at ?? null;
    if (String(nextRevision ?? '') >= String(currentRevision ?? '')) {
      index.set(key, row);
    }
  }
  return index;
}

export function buildBaseEntityRelations({
  maintItems = [],
  maintItemPages = [],
  maintNpcs = [],
  maintProjectiles = []
} = {}) {
  const itemPagesByInternalName = buildItemPageIndex(maintItemPages);
  return {
    relationItems: maintItems.map((row) => {
      const record = buildBaseEntityRecord('maint_items', row);
      const itemPage = itemPagesByInternalName.get(record.internalName);
      if (itemPage) {
        record.sellTextRaw = normalizeText(itemPage.sell_text);
        record.sellRaw = toNullableNumber(itemPage.sell_value);
      }
      return record;
    }),
    relationNpcs: maintNpcs.map((row) => buildBaseEntityRecord('maint_npcs', row)),
    relationProjectiles: maintProjectiles.map((row) => buildBaseEntityRecord('maint_projectiles', row))
  };
}
