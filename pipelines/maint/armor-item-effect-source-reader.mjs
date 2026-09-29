import { isDeepStrictEqual } from 'node:util';
import { buildArmorItemEffectMaintCandidate } from './armor-item-effect-maint-candidate.mjs';

const positiveId = value => Number.isSafeInteger(value) && value > 0;
const active = row => row.status === 1 && row.deleted === 0;

export function isArmorItemEffectMaintRow(row) {
  if (String(row?.landing_source_key ?? '').startsWith('wiki.armor.item-effects.')) return true;
  try {
    const raw = typeof row?.raw_json === 'string' ? JSON.parse(row.raw_json) : row?.raw_json;
    return String(raw?.schemaVersion ?? '').startsWith('armor-item-effect-maint/');
  } catch { return false; }
}

/** Validates maint evidence only; local persistence and write authority are separate contracts. */
export function readArmorItemEffectMaintSources(input) {
  if (!input || !isDeepStrictEqual(Object.keys(input).sort(), ['maintArmorAttributeRows', 'maintItems', 'maintLandings'])
      || Object.values(input).some(rows => !Array.isArray(rows))) throw new Error('Armor typed source reader requires exact snapshots');
  const { maintArmorAttributeRows: rows, maintItems, maintLandings } = input;
  const rowIds = new Set(); const rowKeys = new Set(); const landingIds = new Set(); const owners = new Set();
  const itemIds = new Set();
  for (const row of rows) {
    if (!isArmorItemEffectMaintRow(row) || !active(row) || !positiveId(row.id) || rowIds.has(row.id)
        || rowKeys.has(row.record_key)) throw new Error('Armor typed maint identity/state is invalid or duplicate');
    rowIds.add(row.id); rowKeys.add(row.record_key);
  }
  const result = [];
  for (const landing of maintLandings) {
    if (!positiveId(landing.id) || landingIds.has(landing.id)) throw new Error('Armor typed landing identity is invalid or duplicate');
    landingIds.add(landing.id);
    const payload = JSON.parse(landing.payload_json);
    if (payload.schemaVersion !== 'armor-item-effect-source/v1') throw new Error('Armor typed landing schema is invalid');
    const source = { targetGameVersion: payload.targetGameVersion };
    for (const key of ['page', 'iteminfo', 'armorSets']) {
      const artifact = payload.artifacts[key];
      const bytes = Buffer.from(artifact.bytesBase64, 'base64');
      if (bytes.toString('base64') !== artifact.bytesBase64) throw new Error('Armor typed artifact encoding drift');
      source[key] = { bytes, expected: artifact.expected };
    }
    const group = rows.filter(row => row.landing_source_id === landing.id);
    const candidate = buildArmorItemEffectMaintCandidate({ source,
      parsedAt: landing.parsed_at instanceof Date ? landing.parsed_at.toISOString() : landing.parsed_at,
      currentLocalLandings: [], currentMaintLandings: [landing], currentMaintRows: group });
    if (candidate.changes.maintLanding.inserts.length || candidate.changes.maint.inserts.length
        || candidate.changes.maint.preserved.length) throw new Error('Armor typed persisted maint source is incomplete or foreign');
    for (const effect of candidate.sourceCandidate.effects) {
      const matches = maintItems.filter(item => item.source_id === effect.ownerId || item.internal_name === effect.itemInternalName);
      if (matches.length !== 1 || !active(matches[0]) || !positiveId(matches[0].id)
          || matches[0].source_id !== effect.ownerId || matches[0].internal_name !== effect.itemInternalName
          || owners.has(effect.ownerId)) throw new Error('Armor typed item owner is missing, ambiguous or has multiple current sources');
      if (itemIds.has(matches[0].id)) throw new Error('Armor typed item identity has duplicate physical IDs');
      const raw = typeof matches[0].raw_json === 'string' ? JSON.parse(matches[0].raw_json) : matches[0].raw_json;
      if (!raw || !positiveId(raw.headSlot) || Number(raw.bodySlot) > 0 || Number(raw.legSlot) > 0
          || raw.internalName != null && raw.internalName !== effect.itemInternalName) throw new Error('Armor typed item slot/name drift');
      owners.add(effect.ownerId);
      itemIds.add(matches[0].id);
    }
    result.push({ landing: structuredClone(landing), maintRows: candidate.maintRows, sourceCandidate: candidate.sourceCandidate });
  }
  if (rows.some(row => !landingIds.has(row.landing_source_id))) throw new Error('Armor typed maint source has no landing');
  return result.sort((left, right) => left.landing.source_key.localeCompare(right.landing.source_key));
}
