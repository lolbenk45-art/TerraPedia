import { createHash } from 'node:crypto';
import {
  buildArmorCanonicalRelationCandidate,
  buildArmorCanonicalRelationIdIndependentCandidate,
} from './armor-canonical-relation-candidate.mjs';
import { buildProjectionPayload, validateProjectionArmorSetConsistency } from './projection-sync.mjs';
import {
  DEFAULT_MANAGED_IMAGE_URL_PREFIXES,
  isManagedImagePath,
  normalizeManagedImageUrlPrefixes,
} from './managed-image-url-policy.mjs';
import { parseEquipmentEffectLines } from './equipment-effect-parser.mjs';
import { ARMOR_SET_PROJECTION_COLUMNS } from './armor-set-projection-restoration.mjs';
import { inspectArmorCanonicalLandingLineage } from './armor-canonical-landing-lineage.mjs';
import { readArmorItemEffectMaintSources } from '../maint/armor-item-effect-source-reader.mjs';

const TABLE = 'projection_armor_sets';
const RELATION_TABLES = ['relation_armor_sets', 'relation_armor_set_items', 'relation_armor_set_images'];
const DEPENDENCY_TABLES = ['relation_items', 'relation_item_images', 'relation_armor_attribute_rows', 'relation_equipment_effect_attributes'];
const CONSUMER_TABLES = ['items', 'item_images', 'projection_item_armor_attributes', 'projection_equipment_effect_attributes'];
const active = row => row.status === 1 && row.deleted === 0;
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const text = value => typeof value === 'string' && value.trim() !== '' && value.trim() === value;
const recordKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const camelName = name => name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const camel = row => Object.fromEntries(Object.entries(row).map(([name, value]) => [camelName(name), value]));
const snake = row => Object.fromEntries(Object.entries(row).map(([name, value]) => [name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), value]));

function canonical(value, sortKeys = true) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(child => canonical(child, sortKeys));
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (sortKeys) keys.sort();
    return Object.fromEntries(keys.map(key => [key, canonical(value[key], sortKeys)]));
  }
  return value;
}
const stable = value => JSON.stringify(canonical(value));
const hash = value => `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || stable(Object.keys(value).sort()) !== stable([...keys].sort())) throw new Error(`Armor ${label} requires exact complete inputs/tables`);
}

function requireJson(value, ancestors = new Set()) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Armor snapshot Date is invalid');
    return;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
      || typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || ancestors.has(value)
      || !Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Armor snapshot must contain exact JSON values');
  ancestors.add(value);
  for (const child of Object.values(value)) requireJson(child, ancestors);
  if (Array.isArray(value) && Object.keys(value).length !== value.length) throw new Error('Armor snapshot sparse arrays are invalid JSON');
  ancestors.delete(value);
}

function utcTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
      || !Number.isFinite(Date.parse(value))) throw new Error('Armor dependency timestamp is malformed');
  const normalized = new Date(value).toISOString();
  if (normalized.slice(0, 19) !== value.slice(0, 19)) throw new Error('Armor dependency timestamp has an invalid UTC calendar date');
  return normalized;
}

function json(value, kind, label) {
  let parsed;
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value; } catch { /* Rejected below. */ }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) !== (kind === 'array')) throw new Error(`Armor ${label} JSON is malformed`);
  return parsed;
}

function imageUrls(value, prefixes) {
  if (value == null || value === '') return [];
  const urls = Array.isArray(value) ? value : typeof value === 'string' && value.startsWith('[') ? json(value, 'array', 'image') : [value];
  for (const url of urls) {
    let valid = text(url) && !/[?#\\\u0000-\u0020\u007f]/.test(url) && !/%(?:25|2f|5c)/i.test(url);
    try {
      const decoded = decodeURIComponent(url);
      valid &&= !/[\\\u0000-\u001f\u007f]/.test(decoded) && !decoded.split('/').some(part => part === '.' || part === '..');
      if (url.startsWith('/')) valid &&= new URL(url, 'https://managed.invalid').pathname === url;
      valid &&= isManagedImagePath(url, prefixes);
    } catch { valid = false; }
    if (!valid) throw new Error('Armor dependency image is unsafe or unmanaged');
  }
  return urls;
}

function managedImageUrls(value, prefixes) {
  try {
    return imageUrls(value, prefixes);
  } catch {
    return [];
  }
}

function policyPrefixes(snapshot) {
  const normalize = values => {
    if (!Array.isArray(values) || !values.length || values.some(value => !text(value))) throw new Error('Armor runtime managed image prefixes are required');
    const normalized = normalizeManagedImageUrlPrefixes(values).sort();
    for (const value of values) {
      if (normalizeManagedImageUrlPrefixes([value]).length !== 1) throw new Error('Armor managed image prefix policy is invalid');
      imageUrls(value.endsWith('/') ? value : `${value}/`, normalized);
    }
    return normalized;
  };
  const runtime = normalize(snapshot.managedImageUrlPrefixes);
  if (stable(runtime) !== stable(normalize(snapshot.relationInput?.maintInput?.managedImageUrlPrefixes))) throw new Error('Armor runtime managed image prefix policy drifted from source policy');
  return runtime;
}

function validateRows(rows, table, prefixes) {
  if (!Array.isArray(rows)) throw new Error(`Armor ${table} complete snapshot is required`);
  const ids = new Set();
  const keys = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(column => !/^[a-z][a-z0-9_]*$/.test(column))) {
      throw new Error(`Armor ${table} requires unambiguous SQL column identities`);
    }
    if (!positiveId(row.id) || ids.has(row.id) || ![0, 1].includes(row.status) || ![0, 1].includes(row.deleted)) throw new Error(`Armor ${table} identity/state is invalid or duplicate`);
    ids.add(row.id);
    const keyColumn = table.startsWith('relation_') ? 'record_key' : table.startsWith('projection_') ? 'relation_record_key' : null;
    if (keyColumn) {
      if (!recordKey(row[keyColumn]) || keys.has(row[keyColumn])) throw new Error(`Armor ${table} record identity is invalid or duplicate`);
      keys.add(row[keyColumn]);
    }
    for (const [column, value] of Object.entries(row)) {
      if (value != null && /_(?:at|timestamp)$/.test(column) && column !== 'module_generated_at') utcTime(value);
      if (column.endsWith('_json') && value != null) {
        try { if (typeof value === 'string') JSON.parse(value); } catch { throw new Error(`Armor ${table} JSON is malformed`); }
      }
    }
    if (row.module_generated_at != null && (!text(row.module_generated_at) || row.module_generated_at.length > 64
        || /[\u0000-\u001f\u007f]/.test(row.module_generated_at))) throw new Error('Armor module generation producer text is malformed');
    // Existing read-only item-image rows may still carry the previous loopback
    // MinIO endpoint. Keep that historical managed identity readable while the
    // current packet remains bound to the active runtime prefixes; this path
    // never authorizes a new upload or rewrites the legacy URL.
    if (active(row) && table === 'relation_item_images') {
      imageUrls(row.cached_url, [...prefixes, ...DEFAULT_MANAGED_IMAGE_URL_PREFIXES]);
    }
    if (table === TABLE) {
      exactKeys(row, ARMOR_SET_PROJECTION_COLUMNS, 'complete projection columns');
      if (!text(row.text_key) || !text(row.source_key) || row.entity_type !== 'armor_set') throw new Error('Armor projection owner identity is invalid');
      for (const column of ['sets_json', 'unique_item_ids_json', 'current_item_ids_json', 'related_items_json']) json(row[column], 'array', column);
      if (active(row)) {
        for (const column of ['male_images', 'female_images', 'special_images']) imageUrls(row[column], prefixes);
        for (const part of json(row.related_items_json, 'array', 'related items')) imageUrls(part.image, prefixes);
      }
    }
  }
}

function uniqueIndex(rows, column, label, validate = text) {
  const result = new Map();
  for (const row of rows) {
    if (!validate(row[column]) || result.has(row[column])) throw new Error(`Armor ${label} identity is invalid or ambiguous/duplicate`);
    result.set(row[column], row);
  }
  return result;
}

function validateItemJoins(snapshot) {
  const items = snapshot.dependencyRows.relation_items;
  const bySource = uniqueIndex(items, 'source_id', 'relation item source', positiveId);
  uniqueIndex(items, 'internal_name', 'relation item name');
  const maint = new Map(snapshot.relationInput.maintItems.map(row => [row.source_id, row]));
  // Relation-item lineage is a separate repair boundary; keep the candidate
  // diagnostic while preserving hard failures for owner identity conflicts.
  const staleLineage = [];
  for (const item of items.filter(active)) {
    const source = maint.get(item.source_id);
    if (!source || !active(source) || item.internal_name !== source.internal_name) throw new Error('Armor relation item join identity is missing or conflicting');
    if (item.source_maint_table !== 'maint_items' || item.source_maint_id !== source.id) throw new Error('Armor relation item lineage join is stale or foreign');
    for (const column of ['source_provider', 'landing_source_id', 'landing_source_key', 'landing_content_hash']) {
      if (item[column] !== source[column]) staleLineage.push({
        itemSourceId: item.source_id,
        column,
        expected: source[column] ?? null,
        actual: item[column] ?? null,
      });
    }
  }
  return { bySource, staleLineage };
}

function sourcePresent(candidate, table) {
  const changes = candidate.changes[table];
  return [...changes.inserts, ...changes.updates.map(change => change.after), ...changes.unchanged];
}

function comparable(value, column) {
  if (column.endsWith('_json') && typeof value === 'string') return canonical(JSON.parse(value));
  if (value != null && /_(?:at|timestamp)$/.test(column)) return utcTime(value);
  if (value != null && ['value_decimal', 'value_max_decimal', 'confidence', 'defense_value', 'defense'].includes(column)) {
    if (!(typeof value === 'number' || typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value))
        || !Number.isFinite(Number(value))) throw new Error('Armor numeric dependency value is malformed');
    return Number(value);
  }
  return canonical(value);
}

function equalFields(expected, actual) {
  return Object.entries(expected).every(([column, value]) => stable(comparable(value, column)) === stable(comparable(actual[column], column)));
}

function checkProjectionParts(row, maintItems, { allowSemanticMismatch = false } = {}) {
  const parts = json(row.related_items_json, 'array', 'projection parts');
  const sets = json(row.sets_json, 'array', 'projection sets');
  const slots = new Set();
  for (const part of parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) throw new Error('Armor projection part identity is invalid');
    if (Object.keys(part).some(column => column.includes('_'))) throw new Error('Armor projection part identity has ambiguous aliases');
    const item = maintItems.get(part.sourceId);
    const slot = stable([part.setVariantIndex, part.partIndex]);
    const semanticMismatch = part.partRole !== ['head', 'body', 'legs'][part.partIndex];
    if (!positiveId(part.sourceId) || part.id !== part.sourceId || part.itemId !== part.sourceId
        || !item || item.internal_name !== part.internalName || slots.has(slot)
        || !Number.isSafeInteger(part.setVariantIndex) || !Number.isSafeInteger(part.partIndex)
        || part.setVariantIndex < 0 || part.partIndex < 0 || part.partIndex > 2
        || sets[part.setVariantIndex]?.[part.partIndex] !== part.sourceId
        || (!allowSemanticMismatch && semanticMismatch)) throw new Error('Armor projection part identity/slot is ambiguous or conflicting');
    slots.add(slot);
  }
  if (!allowSemanticMismatch && validateProjectionArmorSetConsistency([camel(row)]).length) throw new Error('Armor projection part consistency failed');
}

function preserveImages(before, after, prefixes, block) {
  for (const column of ['male_images', 'female_images', 'special_images']) {
    if (imageUrls(before[column], prefixes).some(url => !imageUrls(after[column], prefixes).includes(url))) {
      block('armor-image-removal-review-required', { textKey: after.text_key, column });
      after[column] = before[column];
    }
  }
  const oldParts = new Map(json(before.related_items_json, 'array', 'related items')
    .map(part => [stable([part.setVariantIndex, part.partIndex, part.sourceId]), part]));
  const newParts = json(after.related_items_json, 'array', 'related items');
  let preserved = false;
  for (const part of newParts) {
    const previous = oldParts.get(stable([part.setVariantIndex, part.partIndex, part.sourceId]));
    if (previous && imageUrls(previous.image, prefixes).some(url => !imageUrls(part.image, prefixes).includes(url))) {
      block('part-image-removal-review-required', { textKey: after.text_key, itemSourceId: part.sourceId });
      part.image = previous.image;
      preserved = true;
    }
  }
  if (preserved) after.related_items_json = JSON.stringify(newParts);
}

function checkSourceEffects(sources, dependencies, block, {
  unresolvedSourceEffects = null,
  allowPartialApply = false,
  unresolvedRowsMustRemainUntouched = false,
} = {}) {
  const quarantineUnresolved = unresolvedSourceEffects === 'quarantine'
    && allowPartialApply === true
    && unresolvedRowsMustRemainUntouched === true;
  const owners = new Map(sources.relation_armor_sets.map(row => [row.record_key, row]));
  const accepted = [];
  const quarantined = [];
  const quarantine = (code, details) => quarantined.push({ code, ...details });
  const sourceRows = dependencies.relation_equipment_effect_attributes.filter(active);
  for (const row of sourceRows) {
    if (row.owner_kind !== 'armor_set') continue;
    const owner = owners.get(row.owner_record_key);
    if (!owner || row.owner_key !== owner.text_key || (row.owner_id ?? null) !== (owner.id ?? null)) {
      block('source-effect-owner-foreign', { recordKey: row.record_key });
    }
  }
  for (const owner of owners.values()) {
    const raw = json(owner.raw_json, 'object', 'canonical armor effect source');
    const effectSource = raw.effectTextSource && typeof raw.effectTextSource === 'object'
      ? raw.effectTextSource : null;
    const rows = sourceRows.filter(row => row.owner_kind === 'armor_set' && row.owner_record_key === owner.record_key
      && row.owner_key === owner.text_key && (row.owner_id ?? null) === (owner.id ?? null));
    // The actual effect producer only parses raw.effectText. A Module expression
    // is not interchangeable with that page/translation evidence.
    if (!text(raw.effectText)) {
      if (quarantineUnresolved) quarantine('source-effect-evidence-unresolved', { textKey: owner.text_key });
      else block('source-effect-evidence-unresolved', { textKey: owner.text_key });
      continue;
    }
    const parsed = parseEquipmentEffectLines({ owner: {
      ownerKind: 'armor_set', ownerRecordKey: owner.record_key, ownerId: owner.id ?? null, ownerKey: owner.text_key,
      sourceProvider: effectSource?.provider ?? owner.source_provider,
      sourcePage: effectSource?.pageTitle ?? owner.source_page,
      sourceRevisionTimestamp: effectSource?.revisionTimestamp ?? owner.source_revision_timestamp,
    }, text: raw.effectText, sourceKind: 'benefit_zh', sourceLocale: effectSource?.locale ?? 'zh' })
      .filter((row) => !isItemScopedArmorMultiplier(row)).map(snake);
    const used = new Set();
    for (const expectation of parsed) {
      const matches = rows.filter(row => row.source_kind === expectation.source_kind
        && row.source_line_index === expectation.source_line_index && row.effect_index === expectation.effect_index);
      if (expectation.parse_status === 'non_effect') {
        if (matches.length) block('source-effect-stale', { textKey: owner.text_key, recordKey: matches[0].record_key });
        for (const row of matches) used.add(row.record_key);
        continue;
      }
      if (expectation.parse_status !== 'parsed') {
        if (quarantineUnresolved) quarantine('source-effect-parse-unresolved', {
          textKey: owner.text_key, sourceLineIndex: expectation.source_line_index,
        });
        else block('source-effect-parse-unresolved', { textKey: owner.text_key, sourceLineIndex: expectation.source_line_index });
      }
      if (!matches.length) {
        if (quarantineUnresolved) quarantine('source-effect-missing', {
          textKey: owner.text_key, sourceLineIndex: expectation.source_line_index,
          effectIndex: expectation.effect_index,
        });
        else block('source-effect-missing', { textKey: owner.text_key, sourceLineIndex: expectation.source_line_index, effectIndex: expectation.effect_index });
      }
      else if (expectation.parse_status !== 'parsed' && quarantineUnresolved) {
        // Preserve unresolved rows without treating them as accepted semantics.
      }
      else if (matches.length !== 1 || !equalFields(expectation, matches[0])) block('source-effect-stale', { textKey: owner.text_key, recordKey: matches[0].record_key });
      else accepted.push(matches[0]);
      for (const row of matches) used.add(row.record_key);
    }
    for (const row of rows) if (!used.has(row.record_key)) block('source-effect-stale', { textKey: owner.text_key, recordKey: row.record_key });
  }
  return { accepted, quarantined };
}

function isItemScopedArmorMultiplier(row) {
  return row?.ownerKind === 'armor_set'
    && row.statKey === 'damage_bonus'
    && row.operation === 'multiply'
    && /弓|连弩|箭|枪|子弹|玉米糖|特定远程武器|非消耗品远程武器/.test(row.conditionText ?? '');
}

const ITEM_EFFECT_SPECS = [
  ['meleeDamage', 'damage_bonus', 'melee'],
  ['rangedDamage', 'damage_bonus', 'ranged'],
  ['magicDamage', 'damage_bonus', 'magic'],
  ['summonDamage', 'damage_bonus', 'summon'],
  ['meleeCritChance', 'crit_chance', 'melee'],
  ['rangedCritChance', 'crit_chance', 'ranged'],
  ['magicCritChance', 'crit_chance', 'magic'],
  ['classSpecific', 'melee_speed', 'melee'],
  ['maxMana', 'mana_max', 'magic', 'count'],
  ['manaCost', 'mana_cost', null],
  ['minionSlots', 'minion_capacity', null, 'count'],
  ['sentrySlots', 'sentry_capacity', null, 'count'],
  ['movementSpeed', 'move_speed', null],
];

const NESTED_ITEM_EFFECT_STAT_KEYS = Object.freeze({
  summonDamage: 'summon_damage',
  minionSlots: 'minion_slots',
  miningSpeed: 'mining_speed',
  fishingPower: 'fishing_power',
});

function armorCellValue(value, unit, cellKey) {
  const text = String(value ?? '').trim().replace(/\u2212/g, '-').replace(/\uff05/g, '%');
  if (!text || text === '—' || text === '-') return null;
  const pattern = unit === 'percent' ? /^[+-]?\d+(?:\.\d+)?%$/ : /^[+-]?\d+$/;
  if (!pattern.test(text)) throw new Error(`Armor effect cell ${cellKey} requires an exact ${unit} numeric value`);
  return Number(text.replace(/%$/, ''));
}

function nestedItemEffects(attribute) {
  if (attribute.raw_json == null) return null;
  const raw = json(attribute.raw_json, 'object', 'nested armor attribute source');
  const record = raw.record;
  if (record?.identity?.itemSourceId == null) return null;
  if (Number(record.identity.itemSourceId) !== Number(attribute.item_id)
      || record.identity.internalName !== attribute.item_internal_name) {
    throw new Error('Armor nested item effect source identity is conflicting');
  }
  const facts = Array.isArray(record.itemScopedFacts) ? record.itemScopedFacts : null;
  const sourceLines = Array.isArray(record.itemScopedSourceLines) ? record.itemScopedSourceLines : [];
  const effectLines = Array.isArray(record.effectLines) ? record.effectLines : [];
  if (!facts || facts.some(fact => !NESTED_ITEM_EFFECT_STAT_KEYS[fact?.statKey]
      || !['add', 'multiply'].includes(fact.operation)
      || !['percent', 'points'].includes(fact.unit)
      || typeof fact.valueDecimal !== 'number' || !Number.isFinite(fact.valueDecimal))) {
    throw new Error('Armor nested item effect facts are malformed');
  }
  const slotType = attribute.slot_group === 'head' ? 'headSlot'
    : attribute.slot_group === 'body' ? 'bodySlot'
      : attribute.slot_group === 'legs' ? 'legSlot' : null;
  const identity = record.identity;
  return facts.map((fact, effectIndex) => {
    const sourceLine = sourceLines[effectIndex] ?? sourceLines[0] ?? null;
    const sourceLineIndex = sourceLine == null ? null : effectLines.indexOf(sourceLine);
    if (sourceLine != null && sourceLineIndex < 0) throw new Error('Armor nested item effect source line is missing');
    const factPayload = {
      statKey: fact.statKey, operation: fact.operation, unit: fact.unit, valueDecimal: fact.valueDecimal,
    };
    return {
      ownerKind: 'item', ownerRecordKey: attribute.record_key, ownerId: Number(attribute.item_id),
      ownerKey: attribute.item_internal_name, sourceKind: 'armor_attribute_cell', sourceLocale: 'en',
      sourceLineIndex, sourceLine, effectIndex, applyScope: 'item_bonus', variantLabel: identity.itemName ?? null,
      itemInternalName: attribute.item_internal_name, slotType,
      statKey: NESTED_ITEM_EFFECT_STAT_KEYS[fact.statKey], statLabelZh: null, classScope: null,
      operation: fact.operation, valueDecimal: fact.valueDecimal, valueMaxDecimal: null, unit: fact.unit,
      conditionText: null, rawText: sourceLine, parseStatus: 'parsed',
      sourceMaintTable: attribute.source_maint_table ?? 'maint_armor_attribute_rows',
      sourceMaintRecordKey: attribute.source_maint_record_key ?? attribute.record_key,
      sourceMaintId: attribute.source_maint_id ?? null, landingSourceId: attribute.landing_source_id ?? null,
      landingSourceKey: attribute.landing_source_key ?? null, landingContentHash: attribute.landing_content_hash ?? null,
      sourceProvider: attribute.source_provider ?? null, sourcePage: attribute.source_page ?? null,
      sourceRevisionTimestamp: attribute.source_revision_timestamp ?? null, confidence: 1,
      reviewStatus: 'accepted', reason: 'derived_from_revision_bound_armor_source_evidence',
      rawJson: JSON.stringify({ schemaVersion: 'armor-missing-attribute-item-effect/v1',
        evidenceHash: raw.sourceEvidenceHash ?? null, fact: factPayload }),
    };
  });
}

function expectedItemEffects(attribute, { skipRangedDamage = false } = {}) {
  const nested = nestedItemEffects(attribute);
  if (nested) return nested;
  const raw = json(attribute.raw_cells_json, 'object', 'armor attribute cells');
  return ITEM_EFFECT_SPECS.flatMap(([cellKey, statKey, classScope, unit = 'percent'], effectIndex) => {
    if (skipRangedDamage && cellKey === 'rangedDamage') return [];
    const value = armorCellValue(raw[cellKey], unit, cellKey);
    if (value == null || value === 0) return [];
    // Independently reject source scopes that the additive cell contract cannot express.
    if (cellKey === 'rangedDamage' && /额外(?:弓|枪|其他远程)伤害/.test(String(raw.otherBonus ?? ''))) {
      throw new Error('Armor effect cell rangedDamage has unresolved specialized damage semantics');
    }
    const itemLabel = attribute.item_name_zh ?? attribute.item_page_title ?? attribute.item_internal_name ?? null;
    const slotType = attribute.slot_group === 'head' ? 'headSlot'
      : attribute.slot_group === 'body' ? 'bodySlot'
        : attribute.slot_group === 'legs' ? 'legSlot' : null;
    return [{ ownerKind: 'item', ownerRecordKey: attribute.record_key, ownerId: Number(attribute.item_id),
      ownerKey: attribute.item_internal_name, sourceKind: 'armor_attribute_cell', sourceLocale: 'zh', sourceLineIndex: 0,
      sourceLine: `${itemLabel} ${cellKey}: ${raw[cellKey]}`, effectIndex, applyScope: 'item_bonus',
      variantLabel: attribute.item_name_zh ?? attribute.item_page_title ?? null,
      itemInternalName: attribute.item_internal_name, slotType, statKey,
      statLabelZh: ({ meleeDamage: '近战伤害', rangedDamage: '远程伤害', magicDamage: '魔法伤害',
        summonDamage: '召唤伤害', meleeCritChance: '近战暴击率', rangedCritChance: '远程暴击率',
        magicCritChance: '魔法暴击率', classSpecific: '近战速度', maxMana: '最大魔力',
        manaCost: '魔力花费', minionSlots: '仆从容量', sentrySlots: '哨兵容量',
        movementSpeed: '移动速度' })[cellKey], classScope,
      operation: 'add', valueDecimal: value, valueMaxDecimal: null, unit, conditionText: null,
      rawText: String(raw[cellKey]), parseStatus: 'parsed',
      sourceMaintTable: attribute.source_maint_table ?? null,
      sourceMaintRecordKey: attribute.source_maint_record_key ?? null,
      sourceMaintId: attribute.source_maint_id ?? null,
      landingSourceId: attribute.landing_source_id ?? null,
      landingSourceKey: attribute.landing_source_key ?? null,
      landingContentHash: attribute.landing_content_hash ?? null,
      sourceProvider: attribute.source_provider ?? null,
      sourcePage: attribute.source_page ?? null,
      sourceRevisionTimestamp: attribute.source_revision_timestamp ?? null,
      confidence: 1, reviewStatus: 'accepted', reason: 'parsed_from_armor_attribute_cell',
      rawJson: JSON.stringify({ cellKey, cellValue: raw[cellKey], armorAttributeRecordKey: attribute.record_key }) }];
  });
}

function supersededTypedLegacyEffect(row, typedOwnerIds) {
  return row?.owner_kind === 'item' && typedOwnerIds.has(Number(row.owner_id))
    && row?.source_kind === 'armor_attribute_cell'
    && /(?:^|\s)rangedDamage\s*:/.test(String(row.source_line ?? ''));
}

function checkItemEffects(sources, dependencies, block, typedSources = [], {
  unresolvedSourceEffects = null,
  allowPartialApply = false,
  unresolvedRowsMustRemainUntouched = false,
} = {}) {
  const quarantineUnresolved = unresolvedSourceEffects === 'quarantine'
    && allowPartialApply === true
    && unresolvedRowsMustRemainUntouched === true;
  const members = new Map();
  for (const row of sources.relation_armor_set_items.filter(active)) {
    const previous = members.get(row.item_source_id) ?? { itemInternalName: row.item_internal_name, partRoles: new Set() };
    previous.partRoles.add(row.part_role);
    members.set(row.item_source_id, previous);
  }
  const attributes = dependencies.relation_armor_attribute_rows;
  const activeAttributes = attributes.filter(active);
  const sourceRows = dependencies.relation_equipment_effect_attributes.filter(active);
  const accepted = [];
  const quarantined = [];
  const unresolved = (code, details) => {
    if (quarantineUnresolved) quarantined.push({ code, ...details });
    else block(code, details);
  };
  const expectedKeys = new Set();
  const typedKeys = new Set();
  const typedOwnerIds = new Set();
  // Independently assemble expectations from validated raw sources and maint IDs.
  // Do not consume the dispatch producer's effects or its projection output.
  for (const group of typedSources) for (const fact of group.sourceCandidate.effects) {
    const maint = group.maintRows.find(row => JSON.parse(row.raw_json).effect.ownerId === fact.ownerId);
    const member = members.get(fact.ownerId);
    if (!member || member.itemInternalName !== fact.itemInternalName
        || member.partRoles.size !== 1 || !member.partRoles.has('head')) {
      block('typed-item-effect-owner-mismatch', { itemSourceId: fact.ownerId });
      continue;
    }
    typedOwnerIds.add(fact.ownerId);
    const expected = snake({ ...fact, ownerRecordKey: maint.record_key,
      sourceMaintTable: 'maint_armor_attribute_rows', sourceMaintRecordKey: maint.record_key, sourceMaintId: maint.id,
      landingSourceId: group.landing.id, landingSourceKey: group.landing.source_key,
      landingContentHash: group.landing.content_hash, reviewStatus: 'accepted', reason: 'derived_from_versioned_item_source' });
    typedKeys.add(expected.record_key);
    const matches = sourceRows.filter(row => row.record_key === expected.record_key);
    if (matches.length !== 1 || !equalFields(expected, matches[0])) {
      unresolved('typed-item-effect-source-stale', { itemSourceId: fact.ownerId, recordKey: expected.record_key });
    } else accepted.push(matches[0]);
  }
  for (const [itemSourceId, member] of members) {
    const { itemInternalName, partRoles } = member;
    const matching = activeAttributes.filter(row => row.item_id === itemSourceId && row.item_internal_name === itemInternalName);
    if (!matching.length) {
      block('armor-attribute-source-missing', { itemSourceId, itemInternalName });
      block('item-effect-evidence-unresolved', { itemSourceId, itemInternalName });
      continue;
    }
    if (matching.length > 1) {
      block('armor-attribute-source-ambiguous', { itemSourceId, recordKeys: matching.map(row => row.record_key) });
      continue;
    }
    for (const attribute of matching) {
      if (attribute.slot_group != null && (partRoles.size !== 1 || !partRoles.has(attribute.slot_group))) {
        block('armor-attribute-slot-mismatch', { itemSourceId, recordKey: attribute.record_key, slotGroup: attribute.slot_group, partRoles: [...partRoles].sort() });
      }
      if (attribute.review_status != null && attribute.review_status !== 'accepted') {
        block('armor-attribute-source-unresolved', { itemSourceId, recordKey: attribute.record_key });
      }
      if (attribute.raw_cells_json == null) {
      unresolved('item-effect-evidence-unresolved', { itemSourceId, recordKey: attribute.record_key });
        continue;
      }
      const expected = expectedItemEffects(attribute, { skipRangedDamage: typedOwnerIds.has(itemSourceId) });
      for (const expectation of expected) {
        const expectedFields = snake(expectation);
        const matches = sourceRows.filter(row => row.owner_kind === 'item' && row.owner_record_key === attribute.record_key
          && Number(row.owner_id) === itemSourceId && row.source_kind === expectedFields.source_kind
          && row.source_line_index === expectedFields.source_line_index && row.effect_index === expectedFields.effect_index);
        const key = `${attribute.record_key}:${expectation.effectIndex}`;
        expectedKeys.add(key);
        if (matches.length !== 1 || !active(matches[0])) {
          unresolved('item-effect-evidence-unresolved', { itemSourceId, recordKey: matches[0]?.record_key ?? attribute.record_key, effectIndex: expectation.effectIndex });
        } else if (!equalFields(expectedFields, matches[0])) {
          unresolved('item-effect-source-stale', { itemSourceId, recordKey: matches[0].record_key });
        } else {
          accepted.push(matches[0]);
        }
      }
    }
  }
  for (const row of sourceRows) {
    if (row.owner_kind !== 'item' || !members.has(Number(row.owner_id))) continue;
    if (supersededTypedLegacyEffect(row, typedOwnerIds)) continue;
    if (typedKeys.has(row.record_key)) continue;
    const matches = [...expectedKeys].some(key => key.startsWith(`${row.owner_record_key}:`)
      && Number(key.slice(key.lastIndexOf(':') + 1)) === row.effect_index);
    if (!matches) unresolved('item-effect-evidence-unresolved', { recordKey: row.record_key });
  }
  return { accepted, typedOwnerIds, quarantined };
}

function auditDependencies(snapshot, sources, payload, projections, expectations, prefixes, block, typedOwnerIds = new Set(), defenseAuthority = null) {
  const maint = new Map(snapshot.relationInput.maintItems.map(row => [row.source_id, row]));
  const relationItems = new Map(snapshot.dependencyRows.relation_items.filter(active).map(row => [row.source_id, row]));
  const requiredIds = new Set(sources.relation_armor_set_items.map(row => row.item_source_id));
  const locals = new Map(snapshot.consumerRows.items.filter(row => row.deleted === 0).map(row => [row.id, row]));
  const expectedItems = new Map(payload.projectionItems.map(row => [row.id, row]));
  const activeAttributes = snapshot.dependencyRows.relation_armor_attribute_rows.filter(active);
  const expectedAttributes = expectations.projection_item_armor_attributes;
  for (const row of snapshot.dependencyRows.relation_item_images.filter(active)) {
    if (![...relationItems.values()].some(item => item.internal_name === row.item_internal_name)) block('item-image-owner-foreign', { recordKey: row.record_key });
  }
  for (const row of activeAttributes) {
    const item = maint.get(row.item_id);
    if (!item || item.internal_name !== row.item_internal_name) block('armor-attribute-owner-foreign', { recordKey: row.record_key });
  }
  for (const sourceId of requiredIds) {
    const item = relationItems.get(sourceId);
    const source = maint.get(sourceId);
    if (!item) block('relation-item-missing', { itemSourceId: sourceId });
    else {
      for (const column of ['defense_value', 'raw_json', 'source_revision_timestamp']) {
        if (stable(comparable(item[column] ?? null, column)) !== stable(comparable(source[column] ?? null, column))) {
          block('relation-item-stale', { itemSourceId: sourceId, column });
        }
      }
    }
    const local = locals.get(sourceId);
    if (local && local.internal_name !== source.internal_name) block('local-item-identity-mismatch', { itemSourceId: sourceId });
    const fallback = snapshot.consumerRows.projection_item_armor_attributes.filter(row => row.deleted === 0 && row.item_id === sourceId && row.defense_value != null).sort((a, b) => a.id - b.id)[0];
    const rawExpectedDefense = expectedItems.get(sourceId)?.defense;
    const expectedDefense = defenseAuthority === 'armor_attribute_zero'
      && (rawExpectedDefense == null || comparable(rawExpectedDefense, 'defense') === 0)
      ? 0
      : rawExpectedDefense;
    if (expectedDefense == null) block('defense-source-unresolved', { itemSourceId: sourceId });
    if (local?.defense == null) block(fallback ? 'defense-fallback-only' : 'defense-missing', { itemSourceId: sourceId });
    else if (comparable(local.defense, 'defense') !== expectedDefense) block('local-defense-stale', { itemSourceId: sourceId });
    if (!activeAttributes.some(row => row.item_id === sourceId && row.item_internal_name === source.internal_name)) {
      block('armor-attribute-projection-missing', { itemSourceId: sourceId });
    } else if (!expectedAttributes.some(row => row.item_id === sourceId)) {
      block('armor-attribute-projection-missing', { itemSourceId: sourceId });
    }
  }
  const projectionByKey = new Map(projections.map(row => [row.text_key, row]));
  for (const raw of payload.projectionArmorSets.map(snake)) {
    const parts = json(raw.related_items_json, 'array', 'derived related items');
    for (const part of parts) if (!imageUrls(part.image, prefixes).length) block('part-image-missing', { textKey: raw.text_key, itemSourceId: part.sourceId });
    if (!['male_images', 'female_images', 'special_images'].some(column => imageUrls(raw[column], prefixes).length)) {
      const hasFallback = snapshot.consumerRows.item_images.some(row => active(row) && parts.some(part => part.sourceId === row.item_id) && managedImageUrls(row.cached_url, prefixes).length);
      block(hasFallback ? 'armor-image-fallback-only' : 'armor-image-missing', { textKey: raw.text_key });
    }
  }
  for (const [table, code] of [['projection_item_armor_attributes', 'armor-attribute-projection'], ['projection_equipment_effect_attributes', 'effect-projection']]) {
    const expectedKeys = new Set();
    const rows = snapshot.consumerRows[table];
    for (const expected of expectations[table]) {
      expectedKeys.add(expected.relation_record_key);
      const actual = rows.find(row => row.relation_record_key === expected.relation_record_key);
      if (!actual) block(`${code}-missing`, { recordKey: expected.relation_record_key });
      else if (!equalFields(expected, actual)) block(`${code}-stale`, { recordKey: expected.relation_record_key });
    }
    for (const actual of rows) {
      if (supersededTypedLegacyEffect(actual, typedOwnerIds)) continue;
      // Armor admin attributes/item effects and set defense fallback read
      // nondeleted rows even when inactive. Fully retired rows are excluded.
      if (actual.deleted !== 0) continue;
      const consumed = table === 'projection_item_armor_attributes'
        ? requiredIds.has(actual.item_id)
        : (actual.owner_kind === 'item' && requiredIds.has(actual.owner_id))
          || (active(actual) && actual.owner_kind === 'armor_set' && [...projectionByKey.values()].some(owner => positiveId(owner.id) && owner.id === actual.owner_id));
      if (consumed && !expectedKeys.has(actual.relation_record_key)) block(`${code}-foreign`, { recordKey: actual.relation_record_key });
    }
  }
  for (const row of [...snapshot.dependencyRows.relation_equipment_effect_attributes.filter(active),
    ...snapshot.consumerRows.projection_equipment_effect_attributes.filter(row => row.deleted === 0)]) {
    if (supersededTypedLegacyEffect(row, typedOwnerIds)) continue;
    if (row.owner_kind === 'item' && requiredIds.has(row.owner_id)) {
      const rowKey = row.relation_record_key ?? row.record_key;
      const expected = expectations.projection_equipment_effect_attributes.some(effect => effect.owner_kind === 'item'
        && effect.owner_id === row.owner_id && effect.relation_record_key === rowKey);
      if (!expected || row.status !== 1 || row.deleted !== 0) block('item-effect-evidence-unresolved', { itemSourceId: row.owner_id, recordKey: rowKey });
    }
  }
}

function withoutStorageIdentity(row) {
  const { id, created_at, updated_at, ...fields } = row;
  return fields;
}

// Pure composition only. Dependency expectations are read contracts, never
// writes, an executable packet, runtime policy authority or allocated DB IDs.
async function buildArmorCanonicalProjectionCandidateInternal(input = {}, { idIndependent = false } = {}) {
  const hasTypedSources = Object.hasOwn(input, 'itemEffectSources');
  exactKeys(input, ['relationInput', 'currentRows', 'dependencyRows', 'consumerRows', 'managedImageUrlPrefixes',
    ...(hasTypedSources ? ['itemEffectSources'] : []),
    ...(Object.hasOwn(input, 'defenseAuthority') ? ['defenseAuthority'] : []),
    ...(Object.hasOwn(input, 'unresolvedSourceEffects') ? ['unresolvedSourceEffects'] : []),
    ...(Object.hasOwn(input, 'allowPartialApply') ? ['allowPartialApply'] : []),
    ...(Object.hasOwn(input, 'unresolvedRowsMustRemainUntouched') ? ['unresolvedRowsMustRemainUntouched'] : [])], 'projection candidate');
  requireJson(input);
  const snapshot = canonical(structuredClone(input), false);
  if (snapshot.defenseAuthority != null && snapshot.defenseAuthority !== 'armor_attribute_zero') {
    throw new Error('Armor defense authority is invalid');
  }
  const partialPolicyFields = [snapshot.unresolvedSourceEffects, snapshot.allowPartialApply,
    snapshot.unresolvedRowsMustRemainUntouched];
  if (partialPolicyFields.some(value => value !== undefined)
      && (snapshot.unresolvedSourceEffects !== 'quarantine'
        || snapshot.allowPartialApply !== true
        || snapshot.unresolvedRowsMustRemainUntouched !== true)) {
    throw new Error('Armor unresolved source-effect partial policy is incomplete');
  }
  exactKeys(snapshot.currentRows, [TABLE], 'projection baseline');
  exactKeys(snapshot.dependencyRows, DEPENDENCY_TABLES, 'derivation dependencies');
  exactKeys(snapshot.consumerRows, CONSUMER_TABLES, 'consumer dependencies');
  const prefixes = policyPrefixes(snapshot);
  for (const section of ['currentRows', 'dependencyRows', 'consumerRows']) {
    for (const [table, rows] of Object.entries(snapshot[section])) validateRows(rows, table, prefixes);
  }
  uniqueIndex(snapshot.currentRows[TABLE], 'text_key', 'projection text');
  uniqueIndex(snapshot.consumerRows.items.filter(row => row.internal_name != null), 'internal_name', 'local item name');
  freeze(snapshot);
  const relationCandidate = await (idIndependent
    ? buildArmorCanonicalRelationIdIndependentCandidate(snapshot.relationInput)
    : buildArmorCanonicalRelationCandidate(snapshot.relationInput));
  for (const [table, rows] of Object.entries({ ...snapshot.relationInput.currentRows, ...snapshot.relationInput.maintInput.currentRows, maint_items: snapshot.relationInput.maintItems })) {
    validateRows(rows, table, prefixes);
  }
  const itemJoinValidation = validateItemJoins(snapshot);
  const maintItems = new Map(snapshot.relationInput.maintItems.map(row => [row.source_id, row]));
  // The current projection can contain the previously published slot-role
  // interpretation. Validate its identity and IDs while allowing the new
  // relation candidate to repair that semantic mapping in the same packet.
  for (const row of snapshot.currentRows[TABLE].filter(active)) checkProjectionParts(row, maintItems, { allowSemanticMismatch: true });
  const sources = Object.fromEntries(RELATION_TABLES.map(table => [table, sourcePresent(relationCandidate, table)]));
  const blockers = [];
  const block = (code, details = {}) => blockers.push({ code, ...details });
  for (const issue of itemJoinValidation.staleLineage) block('relation-item-lineage-stale', issue);
  for (const issue of inspectArmorCanonicalLandingLineage({
    relationCandidate,
    landingCurrentRows: snapshot.relationInput.landingCurrentRows,
  })) block('relation-landing-lineage-mismatch', issue);
  let typedSources = [];
  if (hasTypedSources) {
    exactKeys(snapshot.itemEffectSources, ['maintLandings', 'maintArmorAttributeRows'], 'typed item source snapshots');
    typedSources = readArmorItemEffectMaintSources({ ...snapshot.itemEffectSources, maintItems: snapshot.relationInput.maintItems });
    if (typedSources.length) {
      if (snapshot.unresolvedSourceEffects === 'quarantine'
          && snapshot.allowPartialApply === true
          && snapshot.unresolvedRowsMustRemainUntouched === true) {
        // The typed item rows are independently frozen and may be applied in a
        // bounded partial run while missing set/member coverage remains outside
        // the accepted source-effect set.
      } else block('complete-item-and-set-coverage-unverified');
    }
  }
  const itemEffects = checkItemEffects(sources, snapshot.dependencyRows, block, typedSources, snapshot);
  const sourceEffects = checkSourceEffects(sources, snapshot.dependencyRows, block, snapshot);
  const acceptedEffects = [...sourceEffects.accepted, ...itemEffects.accepted];
  const payload = buildProjectionPayload({
    ...Object.fromEntries(Object.entries({ ...sources, ...snapshot.dependencyRows, relation_equipment_effect_attributes: acceptedEffects })
      .map(([table, rows]) => [camelName(table), rows.filter(active).map(camel)])),
    managedImageUrlPrefixes: prefixes,
  });
  const baseline = new Map(snapshot.currentRows[TABLE].map(row => [row.text_key, row]));
  const expected = new Map(baseline);
  const changes = { inserts: [], updates: [], unchanged: [], preserved: [] };
  const unresolvedGeneratedIds = [];
  const unresolvedDependencies = [...relationCandidate.unresolvedDependencies];
  const seen = new Set();
  for (const derived of payload.projectionArmorSets.map(snake)) {
    seen.add(derived.text_key);
    const before = baseline.get(derived.text_key);
    if (before) {
      if (!active(before)) throw new Error('Armor projection cannot reactivate an inactive identity');
      for (const column of ['relation_record_key', 'source_key', 'entity_type']) {
        if (derived[column] !== before[column]) throw new Error('Armor projection key/owner identity drifted');
      }
      const after = { ...before, ...derived, id: before.id, created_at: before.created_at, updated_at: before.updated_at };
      preserveImages(before, after, prefixes, block);
      const changedColumns = Object.keys(after).filter(column => stable(comparable(after[column], column)) !== stable(comparable(before[column], column))).sort();
      if (changedColumns.length) changes.updates.push({ key: before.text_key, before, after, changedColumns });
      else changes.unchanged.push(before);
      expected.set(derived.text_key, changedColumns.length ? after : before);
    } else {
      const parent = sources.relation_armor_sets.find(row => row.record_key === derived.relation_record_key);
      if (!positiveId(parent.id)) {
        // The generic library's deterministic hash is not a materialized DB ID.
        delete derived.id;
        unresolvedGeneratedIds.push({ table: TABLE, textKey: derived.text_key, column: 'id',
          referencedTable: 'relation_armor_sets', recordKey: derived.relation_record_key });
      } else derived.id = parent.id;
      changes.inserts.push(derived);
      expected.set(derived.text_key, derived);
    }
  }
  for (const [name, row] of baseline) if (!seen.has(name)) changes.preserved.push(row);
  const expectedRows = [...expected.values()];
  uniqueIndex(expectedRows.filter(row => positiveId(row.id)), 'id', 'projection ID', positiveId);
  const owners = new Map(expectedRows.map(row => [row.text_key, row.id]));
  const memberIds = new Set(sources.relation_armor_set_items.filter(active).map(row => row.item_source_id));
  const dependencyExpectations = {
    projection_item_armor_attributes: payload.projectionItemArmorAttributes
      .filter(row => memberIds.has(row.itemId)).map(snake).map(withoutStorageIdentity),
    projection_equipment_effect_attributes: payload.projectionEquipmentEffectAttributes.map(snake)
      .map(row => withoutStorageIdentity({ ...row,
        owner_id: row.owner_kind === 'armor_set' ? owners.get(row.owner_key) ?? null : row.owner_id })),
  };
  auditDependencies(snapshot, sources, payload, expectedRows, dependencyExpectations, prefixes, block,
    itemEffects.typedOwnerIds, snapshot.defenseAuthority ?? null);
  for (const row of dependencyExpectations.projection_equipment_effect_attributes) if (!positiveId(row.owner_id)) {
    unresolvedDependencies.push({ table: 'projection_equipment_effect_attributes', recordKey: row.relation_record_key,
      column: 'owner_id', referencedTable: TABLE, textKey: row.owner_key });
  }
  const removedIdentities = { [TABLE]: changes.preserved.filter(active).map(row => row.text_key) };
  const requiresRemovalReview = relationCandidate.requiresRemovalReview || removedIdentities[TABLE].length > 0
    || blockers.some(row => row.code.endsWith('removal-review-required'));
  if (requiresRemovalReview) blockers.push({ code: 'source-removal-review-required' });
  if (unresolvedGeneratedIds.length || unresolvedDependencies.length || relationCandidate.unresolvedGeneratedIds.length) blockers.push({ code: 'generated-identities-unresolved' });
  const result = {
    schemaVersion: 'armor-canonical-projection-candidate/v1', executable: false,
    executionBlocker: 'registered-full-chain-executor-required', tables: [TABLE],
    changes: { [TABLE]: changes }, expectedRows: { [TABLE]: expectedRows },
    summary: Object.fromEntries(Object.entries(changes).map(([name, rows]) => [name, rows.length])),
    deletes: [], removedIdentities, requiresRemovalReview, unresolvedGeneratedIds, unresolvedDependencies,
    relationCandidate, dependencyExpectations,
    partialPolicy: {
      unresolvedSourceEffects: snapshot.unresolvedSourceEffects ?? null,
      allowPartialApply: snapshot.allowPartialApply ?? false,
      unresolvedRowsMustRemainUntouched: snapshot.unresolvedRowsMustRemainUntouched ?? false,
    },
    quarantinedSourceEffects: [...sourceEffects.quarantined, ...itemEffects.quarantined],
    acceptance: { status: blockers.length ? 'blocked' : 'dependencies-satisfied', runtimeVerified: false, blockers },
    inputSnapshots: snapshot, inputSha256: hash(snapshot), baselineSha256: hash(snapshot.currentRows),
    dependencySnapshotSha256: hash(snapshot.dependencyRows), consumerSnapshotSha256: hash(snapshot.consumerRows),
    ...(hasTypedSources ? { itemEffectSourceSnapshotSha256: hash(snapshot.itemEffectSources) } : {}),
    managedImageUrlPrefixes: prefixes, managedImagePolicySha256: hash(snapshot.managedImageUrlPrefixes),
  };
  return freeze({ ...result, candidateSha256: hash(result) });
}

export async function buildArmorCanonicalProjectionCandidate(input = {}) {
  return buildArmorCanonicalProjectionCandidateInternal(input);
}

export async function buildArmorCanonicalProjectionIdIndependentCandidate(input = {}) {
  return buildArmorCanonicalProjectionCandidateInternal(input, { idIndependent: true });
}
