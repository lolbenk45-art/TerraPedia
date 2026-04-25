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

  return base;
}

export function buildBaseEntityRelations({
  maintItems = [],
  maintNpcs = [],
  maintProjectiles = []
} = {}) {
  return {
    relationItems: maintItems.map((row) => buildBaseEntityRecord('maint_items', row)),
    relationNpcs: maintNpcs.map((row) => buildBaseEntityRecord('maint_npcs', row)),
    relationProjectiles: maintProjectiles.map((row) => buildBaseEntityRecord('maint_projectiles', row))
  };
}
