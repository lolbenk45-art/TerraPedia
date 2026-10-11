import { createHash } from 'node:crypto';

import { parseIteminfoModulePayload } from '../lib/wiki-item-utils.mjs';

export const ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID = 'canonical-armor-item-lineage-refresh';
export const ARMOR_ITEM_LINEAGE_TARGET_IDS = Object.freeze([1546, 1547, 1548, 1549, 1550]);
export const ARMOR_ITEM_LINEAGE_SOURCE_REVISION_ID = 1023241;
export const ARMOR_ITEM_LINEAGE_SOURCE_REVISION_TIMESTAMP = '2026-08-22T03:26:22Z';
export const ARMOR_ITEM_LINEAGE_SOURCE_KEY = 'wiki.module.iteminfo.armor-shroomite.1023241';
export const ARMOR_ITEM_LINEAGE_SOURCE_PAGE = 'Module:Iteminfo/data#ArmorShroomite/1546-1550';

const TARGETS = Object.freeze({
  1546: { internalName: 'ShroomiteHeadgear', slot: 'headSlot' },
  1547: { internalName: 'ShroomiteMask', slot: 'headSlot' },
  1548: { internalName: 'ShroomiteHelmet', slot: 'headSlot' },
  1549: { internalName: 'ShroomiteBreastplate', slot: 'bodySlot' },
  1550: { internalName: 'ShroomiteLeggings', slot: 'legSlot' },
});
const HASH = /^(?:sha256:)?[a-f0-9]{64}$/;
const GENERATED = new Set(['created_at', 'updated_at']);
const MYSQL_DATETIME_TIME_ZONE = 'Asia/Shanghai';
const DATETIME_COLUMNS = new Set([
  'source_revision_timestamp',
  'landing_fetched_at',
  'landing_parsed_at',
  'module_generated_at',
]);
const SQL_DATETIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function hashText(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value;
}

function positiveId(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function sqlTimestamp(value, label) {
  let input = text(value, label);
  const offsetSuffix = /\s+\(([+-]\d{2}:\d{2})\)$/.exec(input);
  if (offsetSuffix) input = `${input.slice(0, offsetSuffix.index).trim()}${offsetSuffix[1]}`;
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} is invalid`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: MYSQL_DATETIME_TIME_ZONE,
    calendar: 'iso8601',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function active(row) {
  return Number(row?.status) === 1 && Number(row?.deleted) === 0;
}

function slotValue(info, target) {
  const activeSlots = Object.entries({ headSlot: info?.headSlot, bodySlot: info?.bodySlot, legSlot: info?.legSlot })
    .filter(([, value]) => Number(value) > 0);
  if (activeSlots.length !== 1 || activeSlots[0][0] !== target.slot) {
    throw new Error(`Armor Iteminfo slot identity mismatch for ${target.internalName}`);
  }
  return Number(activeSlots[0][1]);
}

function numeric(value) {
  return Number.isFinite(Number(value)) && Number(value) !== 0 ? Number(value) : null;
}

function rawItem(id, info) {
  return JSON.stringify({ id, ...info });
}

function validateSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Armor Iteminfo source is required');
  if (source.pageTitle !== 'Module:Iteminfo/data') throw new Error('Armor Iteminfo source page is invalid');
  if (Number(source.pageId) !== 18021) throw new Error('Armor Iteminfo source page ID is invalid');
  if (Number(source.revisionId) !== ARMOR_ITEM_LINEAGE_SOURCE_REVISION_ID
      || source.revisionTimestamp !== ARMOR_ITEM_LINEAGE_SOURCE_REVISION_TIMESTAMP) {
    throw new Error('Armor Iteminfo source revision is not the frozen revision');
  }
  text(source.wikitext, 'Armor Iteminfo wikitext');
  text(source.fetchedAt, 'Armor Iteminfo fetchedAt');
  return parseIteminfoModulePayload(source.wikitext);
}

function validateBaseline(rows, label) {
  if (!Array.isArray(rows)) throw new Error(`Armor ${label} rows are required`);
  const ids = new Set();
  for (const row of rows) {
    if (!positiveId(row?.id) || ids.has(Number(row.id))) throw new Error(`Armor ${label} IDs are invalid or duplicate`);
    ids.add(Number(row.id));
  }
  return rows;
}

function validateLandingNamespace(rows, label) {
  validateBaseline(rows, label);
  const matches = rows.filter(row => row.source_key === ARMOR_ITEM_LINEAGE_SOURCE_KEY
    && row.source_page === ARMOR_ITEM_LINEAGE_SOURCE_PAGE
    && Number(row.is_current) === 1);
  if (matches.length > 0) throw new Error(`Armor ${label} lineage namespace already exists`);
}

function proposedLanding(source, payloadJson, payloadHash, artifactHash, artifactByteSize) {
  return {
    dataset_type: 'items_raw',
    provider: 'terraria.wiki.gg',
    source_kind: 'module',
    source_key: ARMOR_ITEM_LINEAGE_SOURCE_KEY,
    source_locator: `https://terraria.wiki.gg/wiki/Module:Iteminfo/data?oldid=${ARMOR_ITEM_LINEAGE_SOURCE_REVISION_ID}#ArmorShroomite/1546-1550`,
    source_page: ARMOR_ITEM_LINEAGE_SOURCE_PAGE,
    source_revision_timestamp: sqlTimestamp(source.revisionTimestamp, 'Armor Iteminfo revision timestamp'),
    content_hash: payloadHash,
    payload_json: payloadJson,
    fetched_at: sqlTimestamp(source.fetchedAt, 'Armor Iteminfo fetchedAt'),
    parsed_at: sqlTimestamp(source.fetchedAt, 'Armor Iteminfo parsedAt'),
    parse_status: 'ok',
    artifact_role: 'source_evidence',
    producer_id: 'armor-shroomite-iteminfo-lineage',
    producer_version: '1',
    producer_run_key: payloadHash,
    bootstrap_manifest_hash: null,
    full_file_content_hash: artifactHash,
    full_file_byte_size: artifactByteSize,
    is_current: 1,
    notes: 'Bounded revision evidence for Shroomite item IDs 1546-1550; does not replace the global Iteminfo landing.',
  };
}

function comparable(row) {
  return stable(Object.fromEntries(Object.entries(row)
    .filter(([key]) => !GENERATED.has(key))
    .map(([key, value]) => [key, DATETIME_COLUMNS.has(key) ? comparableDatetime(value) : value])));
}

function comparableDatetime(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return value;
  const input = value.trim();
  const sqlMatch = SQL_DATETIME.exec(input);
  if (sqlMatch) return new Date(`${sqlMatch[1]}T${sqlMatch[2]}+08:00`).toISOString();
  const offsetSuffix = /\s+\(([+-]\d{2}:\d{2})\)$/.exec(input);
  const normalized = offsetSuffix ? `${input.slice(0, offsetSuffix.index).trim()}${offsetSuffix[1]}` : input;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
}

export function buildArmorItemLineageRefreshCandidate({
  source,
  sourceArtifactPath,
  sourceArtifactSha256,
  sourceArtifactByteSize,
  currentLocalLandings,
  currentMaintLandings,
  currentMaintItems,
} = {}) {
  const parsed = validateSource(source);
  const artifactPath = text(sourceArtifactPath, 'Armor Iteminfo source artifact path');
  if (artifactPath.startsWith('/') || artifactPath.includes('\\') || artifactPath.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Armor Iteminfo source artifact path must be repository-relative');
  }
  if (!HASH.test(sourceArtifactSha256 ?? '')) throw new Error('Armor Iteminfo source artifact hash is invalid');
  if (!Number.isSafeInteger(sourceArtifactByteSize) || sourceArtifactByteSize <= 0) throw new Error('Armor Iteminfo source artifact byte size is invalid');
  validateLandingNamespace(currentLocalLandings, 'local landing');
  validateLandingNamespace(currentMaintLandings, 'maint landing');
  validateBaseline(currentMaintItems, 'maint item');

  const byId = new Map(currentMaintItems.map(row => [Number(row.source_id), row]));
  if (byId.size !== ARMOR_ITEM_LINEAGE_TARGET_IDS.length || ARMOR_ITEM_LINEAGE_TARGET_IDS.some(id => !byId.has(id))) {
    throw new Error('Armor Iteminfo lineage requires exactly five active target identities');
  }
  const payloadJson = JSON.stringify(source);
  const payloadHash = hashText(payloadJson);
  const landing = proposedLanding(source, payloadJson, payloadHash, sourceArtifactSha256, sourceArtifactByteSize);
  const moduleGeneratedAt = parsed._generated == null ? null
    : sqlTimestamp(String(parsed._generated), 'Armor Iteminfo generated timestamp');
  const terrariaVersion = parsed._terrariaversion == null ? null : String(parsed._terrariaversion);
  const updates = ARMOR_ITEM_LINEAGE_TARGET_IDS.map(sourceId => {
    const target = TARGETS[sourceId];
    const info = parsed[sourceId];
    if (!info || info.internalName !== target.internalName) throw new Error(`Armor Iteminfo identity mismatch for ${sourceId}`);
    const current = byId.get(sourceId);
    if (!active(current) || Number(current.source_id) !== sourceId) throw new Error(`Armor maint item ${sourceId} is not active`);
    const expectedSlot = slotValue(info, target);
    const after = {
      ...current,
      source_revision_timestamp: landing.source_revision_timestamp,
      landing_source_id: null,
      landing_source_key: landing.source_key,
      landing_source_page: landing.source_page,
      landing_content_hash: landing.content_hash,
      landing_fetched_at: landing.fetched_at,
      landing_parsed_at: landing.parsed_at,
      module_generated_at: moduleGeneratedAt,
      terraria_version: terrariaVersion,
      major_value: numeric(info.value),
      combat_value: numeric(info.damage),
      defense_value: numeric(info.defense),
      use_time: numeric(info.useTime),
      stack_size: numeric(info.maxStack),
      width: numeric(info.width),
      height: numeric(info.height),
      raw_json: rawItem(sourceId, info),
    };
    const raw = JSON.parse(after.raw_json);
    if (Number(raw[target.slot]) !== expectedSlot) throw new Error(`Armor Iteminfo slot readback mismatch for ${sourceId}`);
    return { before: structuredClone(current), after };
  });
  const body = {
    schemaVersion: 'armor-item-lineage-refresh-candidate/v1',
    operationId: ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID,
    executable: false,
    databaseWrites: false,
    applyAllowed: false,
    targetItemSourceIds: [...ARMOR_ITEM_LINEAGE_TARGET_IDS],
    source: {
      artifactPath,
      artifactSha256: sourceArtifactSha256,
      artifactByteSize: sourceArtifactByteSize,
      pageTitle: source.pageTitle,
      pageId: Number(source.pageId),
      revisionId: Number(source.revisionId),
      revisionTimestamp: source.revisionTimestamp,
      payloadHash,
    },
    proposedLanding: landing,
    changes: {
      localLanding: { inserts: [structuredClone(landing)], preserved: currentLocalLandings.map(row => structuredClone(row)) },
      maintLanding: { inserts: [structuredClone(landing)], preserved: currentMaintLandings.map(row => structuredClone(row)) },
      maintItems: { updates, inserts: [], preserved: currentMaintItems.filter(row => !ARMOR_ITEM_LINEAGE_TARGET_IDS.includes(Number(row.source_id))).map(row => structuredClone(row)) },
    },
    acceptance: {
      exactTargetCount: true,
      frozenRevision: true,
      valuesAndSlotsRevisionBound: true,
      globalIteminfoLandingUntouched: true,
      databaseWrites: false,
    },
    blockers: [],
  };
  return { ...body, candidateSha256: `sha256:${hashJson(body)}` };
}

export function validateArmorItemLineageRefreshCandidate(candidate) {
  const { candidateSha256, ...body } = candidate ?? {};
  if (candidate?.schemaVersion !== 'armor-item-lineage-refresh-candidate/v1'
      || candidate.operationId !== ARMOR_ITEM_LINEAGE_REFRESH_OPERATION_ID
      || candidate.executable !== false || candidate.databaseWrites !== false || candidate.applyAllowed !== false
      || !HASH.test(candidateSha256 ?? '')
      || `sha256:${hashJson(body)}` !== candidateSha256) {
    throw new Error('Armor Iteminfo lineage candidate identity or hash is invalid');
  }
  if (JSON.stringify(candidate.targetItemSourceIds) !== JSON.stringify(ARMOR_ITEM_LINEAGE_TARGET_IDS)) {
    throw new Error('Armor Iteminfo lineage candidate target scope drifted');
  }
  if (candidate.source?.revisionId !== ARMOR_ITEM_LINEAGE_SOURCE_REVISION_ID
      || candidate.source?.revisionTimestamp !== ARMOR_ITEM_LINEAGE_SOURCE_REVISION_TIMESTAMP
      || candidate.proposedLanding?.source_key !== ARMOR_ITEM_LINEAGE_SOURCE_KEY) {
    throw new Error('Armor Iteminfo lineage candidate source revision drifted');
  }
  if (candidate.changes?.localLanding?.inserts?.length !== 1
      || candidate.changes?.maintLanding?.inserts?.length !== 1
      || candidate.changes?.maintItems?.updates?.length !== 5
      || candidate.changes?.maintItems?.inserts?.length !== 0) {
    throw new Error('Armor Iteminfo lineage candidate write scope drifted');
  }
  for (const change of candidate.changes.maintItems.updates) {
    if (!positiveId(change.before?.id) || Number(change.before.source_id) !== Number(change.after.source_id)
        || !ARMOR_ITEM_LINEAGE_TARGET_IDS.includes(Number(change.after.source_id))
        || change.after.landing_source_id !== null) {
      throw new Error('Armor Iteminfo lineage maint update scope is invalid');
    }
  }
  if (candidate.acceptance?.globalIteminfoLandingUntouched !== true) throw new Error('Armor global Iteminfo landing scope is not fail-closed');
  return true;
}

export function comparableArmorItemLineageRow(row) {
  return comparable(row);
}
