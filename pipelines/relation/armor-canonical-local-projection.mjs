import { createHash } from 'node:crypto';

const PARENT_COLUMNS = Object.freeze([
  'source_key', 'text_key', 'benefit_expression', 'primary_part', 'set_count', 'unique_item_count',
  'sets_json', 'unique_item_ids_json', 'male_images', 'female_images', 'special_images', 'status', 'deleted',
]);
const MEMBER_COLUMNS = Object.freeze([
  'armor_set_id', 'set_variant_index', 'part_index', 'source_item_id', 'item_id', 'item_internal_name', 'item_name',
]);
const IMAGE_COLUMNS = Object.freeze(['male_images', 'female_images', 'special_images']);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Armor local ${label} is required`);
  return value;
}

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`Armor local ${label} ID is invalid`);
  return id;
}

function optionalPositiveId(value, label) {
  if (value == null || value === '' || Number(value) === 0) return null;
  return positiveId(value, label);
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || value !== value.trim()) {
    throw new Error(`Armor local ${label} is required`);
  }
  return value;
}

function optionalText(value) {
  if (value == null || value === '') return null;
  return text(value, 'text');
}

function parseArray(value, label) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); }
    catch { throw new Error(`Armor local ${label} JSON is malformed`); }
  }
  if (!Array.isArray(parsed)) throw new Error(`Armor local ${label} must be an array`);
  return parsed;
}

function compareValue(value, column) {
  if (column.endsWith('_json') && value != null) return JSON.stringify(parseArray(value, column));
  if (['set_count', 'unique_item_count', 'status', 'deleted', 'armor_set_id', 'set_variant_index', 'part_index', 'source_item_id', 'item_id'].includes(column)) {
    return value == null ? null : Number(value);
  }
  return value ?? null;
}

function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function hash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex')}`;
}

function keyBy(rows, keyOf, label) {
  if (!Array.isArray(rows)) throw new Error(`Armor local ${label} rows are required`);
  const result = new Map();
  for (const row of rows) {
    object(row, `${label} row`);
    const key = keyOf(row);
    if (result.has(key)) throw new Error(`Armor local ${label} identity is duplicate: ${key}`);
    result.set(key, row);
  }
  return result;
}

function diffRows({ currentRows, candidateRows, keyOf, columns, label }) {
  const currentByKey = keyBy(currentRows, keyOf, `${label} baseline`);
  const candidateByKey = keyBy(candidateRows, keyOf, `${label} candidate`);
  const inserts = [];
  const updates = [];
  const unchanged = [];
  const preserved = [];
  const expectedRows = new Map(currentByKey);

  for (const [key, candidate] of candidateByKey) {
    const before = currentByKey.get(key);
    if (!before) {
      inserts.push(candidate);
      expectedRows.set(key, candidate);
      continue;
    }
    if (Number(before.status ?? 1) !== 1 || Number(before.deleted ?? 0) !== 0) {
      throw new Error(`Armor local ${label} candidate cannot reactivate an inactive identity: ${key}`);
    }
    const changedColumns = columns.filter(column => (
      JSON.stringify(compareValue(before[column], column)) !== JSON.stringify(compareValue(candidate[column], column))
    ));
    if (changedColumns.length === 0) {
      unchanged.push(before);
      expectedRows.set(key, before);
      continue;
    }
    const after = { ...before, ...candidate, id: positiveId(before.id, `${label} baseline`) };
    updates.push({ key, before, after, changedColumns: [...changedColumns].sort() });
    expectedRows.set(key, after);
  }

  for (const [key, row] of currentByKey) {
    if (!candidateByKey.has(key)) preserved.push(row);
  }
  return { inserts, updates, unchanged, preserved, deletes: [], expectedRows: [...expectedRows.values()] };
}

function setSourceKey(record, index) {
  return optionalText(record.textKey)
    ?? optionalText(record.benefitExpression)
    ?? `armor_set_${index + 1}`;
}

function sourceItemNames(maintItems) {
  const bySourceId = new Map();
  for (const row of maintItems) {
    if (Number(row.status ?? 1) !== 1 || Number(row.deleted ?? 0) !== 0) continue;
    const id = positiveId(row.source_id, 'maint Item source');
    const internalName = text(row.internal_name, 'maint Item internal_name');
    if (bySourceId.has(id)) throw new Error(`Armor maint Item source ID is duplicate: ${id}`);
    bySourceId.set(id, internalName);
  }
  return bySourceId;
}

function localItemsByInternalName(localItems) {
  const byName = new Map();
  for (const row of localItems) {
    if (Number(row.status ?? 1) !== 1 || Number(row.deleted ?? 0) !== 0) continue;
    const name = text(row.internal_name, 'local Item internal_name');
    const key = name.toLocaleLowerCase('en-US');
    if (byName.has(key)) throw new Error(`Armor local Item identity is duplicate or ambiguous: ${name}`);
    byName.set(key, {
      id: positiveId(row.id, 'local Item'),
      internalName: name,
      name: optionalText(row.name),
    });
  }
  return byName;
}

function buildParentRows(sourceArmorSets, projectionArmorSets, currentArmorSets) {
  if (!Array.isArray(sourceArmorSets) || sourceArmorSets.length === 0) throw new Error('Armor local source records are required');
  const projections = keyBy(projectionArmorSets, row => text(row.text_key, 'projection text_key'), 'projection by text_key');
  const currentBySourceKey = keyBy(currentArmorSets, row => text(row.source_key, 'parent source_key'), 'parent source_key');
  const candidates = sourceArmorSets.map((record, index) => {
    object(record, 'source record');
    const sourceKey = setSourceKey(record, index);
    const textKey = text(record.textKey, 'source textKey');
    const projectionRow = projections.get(textKey);
    if (!projectionRow) throw new Error(`Armor local projection row is missing: ${textKey}`);
    const existing = currentBySourceKey.get(sourceKey);
    const candidate = {
      source_key: sourceKey,
      text_key: textKey,
      benefit_expression: optionalText(record.benefitExpression),
      primary_part: optionalText(record.primaryPart),
      set_count: Number(record.setCount),
      unique_item_count: parseArray(record.uniqueItemIds, 'unique_item_ids').length,
      sets_json: JSON.stringify(parseArray(record.sets, 'sets')),
      unique_item_ids_json: JSON.stringify(parseArray(record.uniqueItemIds, 'unique_item_ids')),
      status: 1,
      deleted: 0,
    };
    for (const column of IMAGE_COLUMNS) candidate[column] = projectionRow[column] ?? existing?.[column] ?? null;
    if (!Number.isSafeInteger(candidate.set_count) || candidate.set_count < 1) {
      throw new Error(`Armor local source set_count is invalid: ${textKey}`);
    }
    return candidate;
  });
  const changes = diffRows({
    currentRows: currentArmorSets,
    candidateRows: candidates,
    keyOf: row => text(row.source_key, 'parent source_key'),
    columns: PARENT_COLUMNS,
    label: 'Armor parent',
  });
  return { candidates, changes, currentBySourceKey };
}

function memberSlotKey(armorSetId, variantIndex, partIndex) {
  return `${armorSetId}:${variantIndex}:${partIndex}`;
}

function memberIdentity(row) {
  return memberSlotKey(
    positiveId(row.armor_set_id, 'member parent'),
    Number(row.set_variant_index),
    Number(row.part_index),
  );
}

function buildMemberRows({ sourceArmorSets, parentState, currentArmorSetItems, maintItems, localItems }) {
  const bySourceItem = sourceItemNames(maintItems);
  const byLocalName = localItemsByInternalName(localItems);
  const currentParents = parentState.currentBySourceKey;
  const insertedParentKeys = new Set(parentState.changes.inserts.map(row => text(row.source_key, 'inserted Armor parent source_key')));
  const candidates = [];
  const candidateKeys = new Set();
  const identityEdges = [];

  sourceArmorSets.forEach((record, recordIndex) => {
    const sourceKey = setSourceKey(record, recordIndex);
    const currentParent = currentParents.get(sourceKey);
    if (!currentParent && !insertedParentKeys.has(sourceKey)) {
      throw new Error(`Armor local source set has no current or inserted local Armor parent: ${sourceKey}`);
    }
    const variants = parseArray(record.sets, 'sets');
    variants.forEach((parts, variantIndex) => {
      if (!Array.isArray(parts)) throw new Error(`Armor local set variant is invalid: ${sourceKey}`);
      parts.forEach((rawSourceItemId, partIndex) => {
        const sourceItemId = optionalPositiveId(rawSourceItemId, 'source Item');
        let itemInternalName = null;
        let localItem = null;
        if (sourceItemId != null) {
          itemInternalName = bySourceItem.get(sourceItemId) ?? null;
          if (!itemInternalName) throw new Error(`Armor source item identity is missing from Maint: ${sourceItemId}`);
          localItem = byLocalName.get(itemInternalName.toLocaleLowerCase('en-US')) ?? null;
          if (!localItem || localItem.internalName !== itemInternalName) {
            throw new Error(`Armor local Item identity is unresolved: ${sourceItemId}/${itemInternalName}`);
          }
          identityEdges.push({
            armorSetSourceKey: sourceKey,
            setVariantIndex: variantIndex,
            partIndex,
            sourceItemId,
            itemInternalName,
            localItemId: localItem.id,
          });
        }
        const row = {
          ...(currentParent ? { armor_set_id: positiveId(currentParent.id, 'parent') } : {}),
          set_variant_index: variantIndex,
          part_index: partIndex,
          source_item_id: sourceItemId,
          item_id: localItem?.id ?? null,
          item_internal_name: itemInternalName,
          item_name: localItem?.name ?? null,
        };
        const identity = currentParent ? memberIdentity(row) : `${sourceKey}:${variantIndex}:${partIndex}`;
        if (candidateKeys.has(identity)) throw new Error(`Armor local member candidate is duplicate: ${identity}`);
        candidateKeys.add(identity);
        candidates.push({ sourceKey, row });
      });
    });
  });

  const existingBySlot = new Map();
  for (const row of currentArmorSetItems) {
    const slot = memberIdentity(row);
    if (existingBySlot.has(slot)) throw new Error(`Armor local member slot is duplicate: ${slot}`);
    existingBySlot.set(slot, row);
  }
  const inserts = [];
  const updates = [];
  const unchanged = [];
  const preserved = [];
  const candidateSlotKeys = new Set();
  const expectedRows = new Map(currentArmorSetItems.map(row => [Number(row.id), row]));
  for (const candidate of candidates) {
    const currentParent = currentParents.get(candidate.sourceKey);
    if (!currentParent) {
      const slot = `${candidate.sourceKey}:${candidate.row.set_variant_index}:${candidate.row.part_index}`;
      candidateSlotKeys.add(slot);
      inserts.push({ ...candidate, row: { ...candidate.row } });
      continue;
    }
    const slot = memberIdentity(candidate.row);
    candidateSlotKeys.add(slot);
    const before = existingBySlot.get(slot);
    if (!before) {
      inserts.push({ ...candidate, row: { ...candidate.row } });
      continue;
    }
    const changedColumns = MEMBER_COLUMNS.filter(column => (
      JSON.stringify(compareValue(before[column], column)) !== JSON.stringify(compareValue(candidate.row[column], column))
    ));
    if (!changedColumns.length) unchanged.push(before);
    else {
      const after = { ...before, ...candidate.row, id: positiveId(before.id, 'member') };
      updates.push({ sourceKey: candidate.sourceKey, before, after, changedColumns: [...changedColumns].sort() });
      expectedRows.set(Number(after.id), after);
    }
  }
  for (const row of currentArmorSetItems) {
    if (candidateSlotKeys.has(memberIdentity(row))) continue;
    const parentSourceKey = [...currentParents].find(([, parent]) => Number(parent.id) === Number(row.armor_set_id))?.[0];
    if (parentSourceKey && sourceArmorSets.some((record, index) => setSourceKey(record, index) === parentSourceKey)) {
      preserved.push(row);
      continue;
    }
    preserved.push(row);
  }
  for (const candidate of inserts) expectedRows.set(`new:${candidate.sourceKey}:${candidate.row.set_variant_index}:${candidate.row.part_index}`, candidate);
  return { inserts, updates, unchanged, preserved, deletes: [], expectedRows: [...expectedRows.values()], identityEdges };
}

export function buildArmorCanonicalLocalProjectionCandidate({
  sourceArmorSets,
  projectionArmorSets,
  maintItems,
  localItems,
  currentArmorSets,
  currentArmorSetItems,
} = {}) {
  for (const [value, label] of [
    [projectionArmorSets, 'projection Armor sets'], [maintItems, 'Maint Items'], [localItems, 'local Items'],
    [currentArmorSets, 'current Armor sets'], [currentArmorSetItems, 'current Armor set items'],
  ]) {
    if (!Array.isArray(value)) throw new Error(`Armor local ${label} are required`);
  }
  const parents = buildParentRows(sourceArmorSets, projectionArmorSets, currentArmorSets);
  const itemChanges = buildMemberRows({
    sourceArmorSets,
    parentState: parents,
    currentArmorSetItems,
    maintItems,
    localItems,
  });
  const inputSnapshots = { sourceArmorSets, projectionArmorSets, maintItems, localItems, currentArmorSets, currentArmorSetItems };
  const body = {
    schemaVersion: 'armor-canonical-local-projection/v1',
    executable: false,
    databaseWrites: false,
    sourceKeys: parents.candidates.map(row => row.source_key),
    parentChanges: parents.changes,
    itemChanges,
    identityEdges: itemChanges.identityEdges,
    expectedRows: {
      armor_sets: parents.changes.expectedRows,
      armor_set_items: itemChanges.expectedRows,
    },
    inputSnapshots,
  };
  return Object.freeze({ ...body, candidateSha256: hash(body) });
}

export function validateArmorCanonicalLocalProjectionCandidate(candidate) {
  object(candidate, 'local projection candidate');
  if (candidate.schemaVersion !== 'armor-canonical-local-projection/v1'
      || candidate.executable !== false || candidate.databaseWrites !== false
      || !candidate.inputSnapshots || !/^sha256:[a-f0-9]{64}$/.test(candidate.candidateSha256 ?? '')) {
    throw new Error('Armor local projection candidate identity is invalid');
  }
  const { candidateSha256, ...body } = candidate;
  if (hash(body) !== candidateSha256) throw new Error('Armor local projection candidate hash drifted');
  const rebuilt = buildArmorCanonicalLocalProjectionCandidate(candidate.inputSnapshots);
  if (hash(rebuilt) !== hash(candidate)) throw new Error('Armor local projection candidate rederivation drifted');
  return true;
}
