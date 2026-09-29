import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { buildArmorShroomiteSourceCandidate } from '../relation/armor-shroomite-source-candidate.mjs';
import { buildProjectionPayload } from '../relation/projection-sync.mjs';

const PREFIX = 'wiki.armor.item-effects.shroomite.';
const GENERATED = new Set(['id', 'created_at', 'updated_at', 'current_slot']);
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const canonical = value => value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const json = value => JSON.stringify(canonical(value));
const digest = value => createHash('sha256').update(value).digest('hex');

function time(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new Error('Armor item-effect timestamp is invalid');
  }
  return new Date(value).toISOString();
}

const storageTime = value => time(value).replace(/\.\d{3}Z$/, '.000Z');

function comparable(row, ignored = GENERATED) {
  return canonical(Object.fromEntries(Object.entries(row).filter(([key]) => !ignored.has(key)).map(([key, value]) => {
    if (value != null && /(?:_at|_timestamp)$/.test(key)) value = time(value instanceof Date ? value.toISOString() : value);
    if (typeof value === 'string' && key.endsWith('_json')) value = JSON.parse(value);
    return [key, value];
  })));
}

function baseline(rows, label, keyField) {
  if (!Array.isArray(rows)) throw new Error(`Armor item-effect ${label} input must be an array`);
  const ids = new Set(); const keys = new Set();
  for (const row of rows) {
    if (!positiveId(row?.id) || ids.has(row.id)) throw new Error(`Armor item-effect ${label} ID is invalid or duplicate`);
    ids.add(row.id);
    if (keyField) {
      if (!/^[a-f0-9]{64}$/.test(row[keyField] ?? '') || keys.has(row[keyField])) throw new Error(`Armor item-effect ${label} key is invalid or duplicate`);
      keys.add(row[keyField]);
    }
  }
}

/** A proposed append-only namespace on existing tables; no writer or runtime authority. */
export function buildArmorItemEffectMaintCandidate(input) {
  if (!input || !isDeepStrictEqual(Object.keys(input).sort(), ['source', 'parsedAt', 'currentLocalLandings', 'currentMaintLandings', 'currentMaintRows'].sort())) {
    throw new Error('Armor item-effect candidate requires exact inputs');
  }
  const sourceCandidate = buildArmorShroomiteSourceCandidate(input.source);
  baseline(input.currentLocalLandings, 'local landing');
  baseline(input.currentMaintLandings, 'maint landing');
  baseline(input.currentMaintRows, 'maint', 'record_key');
  const parsedAt = time(input.parsedAt);
  const fetched = Object.values(input.source).filter(value => value?.bytes).map(value => {
    const raw = JSON.parse(value.bytes);
    const fetchedAt = time(raw.fetchedAt);
    if (fetchedAt < time(raw.revisionTimestamp)) throw new Error('Armor item-effect fetch time predates revision');
    return fetchedAt;
  }).sort().at(-1);
  if (parsedAt < fetched) throw new Error('Armor item-effect parse time predates fetch');
  const artifacts = Object.fromEntries(['page', 'iteminfo', 'armorSets'].map(key => [key, {
    bytesBase64: input.source[key].bytes.toString('base64'), expected: input.source[key].expected,
  }]));
  const payload = { schemaVersion: 'armor-item-effect-source/v1', targetGameVersion: input.source.targetGameVersion, artifacts };
  const payloadJson = json(payload);
  const contentHash = digest(payloadJson);
  const sourceKey = `${PREFIX}${contentHash}`;
  const proposedLanding = {
    dataset_type: 'armor_item_effects_raw', provider: 'terraria.wiki.gg', source_kind: 'wiki_page',
    source_key: sourceKey, source_locator: `https://terraria.wiki.gg/wiki/Shroomite_armor?oldid=${sourceCandidate.sources.page.revisionId}`,
    source_page: 'Shroomite armor', source_revision_timestamp: sourceCandidate.sources.page.revisionTimestamp,
    content_hash: contentHash, payload_json: payloadJson, fetched_at: storageTime(fetched), parsed_at: storageTime(parsedAt),
    parse_status: 'ok', artifact_role: 'source_evidence', producer_id: 'armor-versioned-item-source',
    producer_version: '1', producer_run_key: contentHash, bootstrap_manifest_hash: null,
    full_file_content_hash: contentHash, full_file_byte_size: Buffer.byteLength(payloadJson), is_current: 1,
    notes: 'Partial versioned item-effect evidence; complete Armor acceptance is separate.',
  };
  const planLanding = (rows, role) => {
    const matches = rows.filter(row => row.source_key === sourceKey);
    if (matches.length > 1) throw new Error(`Armor item-effect ${role} landing namespace is duplicate`);
    const existing = matches[0];
    const ignoreParse = new Set([...GENERATED, 'parsed_at']);
    if (existing && (!isDeepStrictEqual(comparable(existing, ignoreParse), comparable(proposedLanding, ignoreParse))
        || time(existing.parsed_at instanceof Date ? existing.parsed_at.toISOString() : existing.parsed_at) < storageTime(fetched)
        || Object.hasOwn(existing, 'current_slot') && existing.current_slot !== 1)) {
      throw new Error(`Armor item-effect immutable ${role} landing drift`);
    }
    const row = structuredClone(existing ?? proposedLanding);
    return { row, changes: { inserts: existing ? [] : [row], reused: existing ? [row] : [],
      preserved: rows.filter(item => item !== existing).map(item => structuredClone(item)) } };
  };
  const local = planLanding(input.currentLocalLandings, 'local');
  const maint = planLanding(input.currentMaintLandings, 'maint');
  const landingRow = maint.row;
  const existing = positiveId(landingRow.id) ? landingRow : null;
  const changes = { localLanding: local.changes, maintLanding: maint.changes,
    maint: { inserts: [], reused: [], preserved: [] } };
  const maintRows = sourceCandidate.effects.map(effect => {
    const recordKey = digest(json(['armor-item-effect-maint/v1', sourceKey, effect.ownerId]));
    const row = {
      record_key: recordKey, section_code: null, slot_group: 'head', item_page_title: effect.variantLabel,
      item_href: `/wiki/${effect.variantLabel.replaceAll(' ', '_')}`, item_name_zh: null, defense_value: null,
      raw_cells_json: '{}', source_provider: effect.sourceProvider, source_page: effect.sourcePage,
      source_revision_timestamp: effect.sourceRevisionTimestamp, landing_source_id: existing?.id ?? null,
      landing_source_key: sourceKey, landing_source_page: landingRow.source_page,
      landing_content_hash: contentHash, landing_fetched_at: landingRow.fetched_at, landing_parsed_at: landingRow.parsed_at,
      raw_json: json({ schemaVersion: 'armor-item-effect-maint/v1', targetGameVersion: sourceCandidate.targetGameVersion, effect }),
      status: 1, deleted: 0,
    };
    const before = input.currentMaintRows.find(item => item.record_key === recordKey);
    if (before && !existing) throw new Error('Armor item-effect maint orphan has no matching landing');
    if (before && !isDeepStrictEqual(comparable(before), comparable(row))) throw new Error('Armor item-effect immutable maint drift');
    const result = structuredClone(before ?? row);
    changes.maint[before ? 'reused' : 'inserts'].push(result);
    return result;
  });
  const proposedKeys = new Set(maintRows.map(row => row.record_key));
  for (const row of input.currentMaintRows) {
    if (proposedKeys.has(row.record_key)) continue;
    if (row.landing_source_key === sourceKey) throw new Error('Armor item-effect owned maint namespace drift');
    changes.maint.preserved.push(structuredClone(row));
  }
  return { schemaVersion: 'armor-item-effect-maint-candidate/v1', executable: false, databaseWrites: false,
    sourceCandidate, localLandingRow: local.row, maintLandingRow: landingRow, maintRows, changes, updates: [], deletes: [],
    acceptance: { status: 'blocked', blockers: [
      { code: 'registered-item-effect-upstream-executor-required' },
      { code: 'complete-item-and-set-coverage-unverified' },
    ] } };
}

function assertReadback(expected, actual, label) {
  if (!actual || !positiveId(actual.id) || expected.id != null && actual.id !== expected.id
      || Object.hasOwn(expected, 'is_current') && Object.hasOwn(actual, 'current_slot') && actual.current_slot !== 1
      || !isDeepStrictEqual(comparable(expected), comparable(actual))) {
    throw new Error(`Armor item-effect ${label} readback/ID drift`);
  }
}

/** Validates supplied receipts; a future registered executor must obtain them under lock. */
export function bindArmorItemEffectMaintReadback({ input, candidate, localLandingReadback, maintLandingReadback, maintReadback }) {
  const derived = buildArmorItemEffectMaintCandidate(input);
  if (!isDeepStrictEqual(canonical(derived), canonical(candidate))) throw new Error('Armor item-effect candidate drift');
  const checkCollision = (expected, actual, rows) => {
    if (rows.some(row => row.id === actual?.id && row.id !== expected.id)) {
      throw new Error('Armor item-effect readback ID collision with preserved history');
    }
  };
  checkCollision(derived.localLandingRow, localLandingReadback, input.currentLocalLandings);
  checkCollision(derived.maintLandingRow, maintLandingReadback, input.currentMaintLandings);
  assertReadback(derived.localLandingRow, localLandingReadback, 'local landing');
  assertReadback(derived.maintLandingRow, maintLandingReadback, 'maint landing');
  if (!Array.isArray(maintReadback) || maintReadback.length !== derived.maintRows.length) throw new Error('Armor item-effect maint readback is incomplete');
  baseline(maintReadback, 'readback maint', 'record_key');
  const effects = derived.maintRows.map((row, i) => {
    const receipt = maintReadback.find(item => item.record_key === row.record_key);
    checkCollision(row, receipt, input.currentMaintRows);
    assertReadback({ ...row, landing_source_id: maintLandingReadback.id }, receipt, 'maint');
    return { ...derived.sourceCandidate.effects[i], ownerRecordKey: row.record_key,
      sourceMaintTable: 'maint_armor_attribute_rows', sourceMaintRecordKey: row.record_key, sourceMaintId: receipt.id,
      landingSourceId: maintLandingReadback.id, landingSourceKey: maintLandingReadback.source_key,
      landingContentHash: maintLandingReadback.content_hash, reviewStatus: 'accepted', reason: 'derived_from_versioned_item_source' };
  });
  return { schemaVersion: 'armor-item-effect-bound-candidate/v1', executable: false, databaseWrites: false,
    effects, projectionEffects: buildProjectionPayload({ relationEquipmentEffectAttributes: effects }).projectionEquipmentEffectAttributes
      .map(({ id, ...row }) => row).sort((a, b) => a.ownerId - b.ownerId),
    acceptance: structuredClone(derived.acceptance) };
}
