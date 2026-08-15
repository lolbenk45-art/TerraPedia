import crypto from 'node:crypto';

export const confidence = Object.freeze({
  high: 1.0,
  medium: 0.75,
  low: 0.4,
  none: 0.0
});

export const relationStatus = Object.freeze({
  resolved: 'resolved',
  candidateLowConfidence: 'candidate_low_confidence',
  unresolved: 'unresolved'
});

export function createRecordKey(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeTrace(sourceMaintTable, row = {}) {
  return {
    sourceMaintTable: normalizeText(sourceMaintTable),
    sourceMaintRecordKey: normalizeText(row.record_key),
    sourceMaintId: toNullableNumber(row.id),
    landingSourceId: toNullableNumber(row.landing_source_id),
    landingSourceKey: normalizeText(row.landing_source_key),
    landingContentHash: normalizeText(row.landing_content_hash),
    sourceProvider: normalizeText(row.source_provider),
    sourcePage: normalizeText(row.source_page),
    sourceRevisionTimestamp: row.source_revision_timestamp ?? null
  };
}

function buildIdentityResult(status, match, reason, level) {
  return {
    status,
    itemSourceId: match?.source_id ?? null,
    itemInternalName: match?.internal_name ?? null,
    reason,
    confidence: level
  };
}

export function resolveItemIdentity(candidate = {}, bySourceId = new Map(), byInternalName = new Map()) {
  const sourceId = toNullableNumber(candidate.source_id);
  const internalName = normalizeText(candidate.internal_name);

  const sourceMatch = sourceId == null ? null : bySourceId.get(sourceId) ?? null;
  const internalMatch = internalName == null ? null : byInternalName.get(internalName) ?? null;

  if (sourceMatch && internalMatch && normalizeText(sourceMatch.internal_name) === normalizeText(internalMatch.internal_name)) {
    return buildIdentityResult(relationStatus.resolved, sourceMatch, 'source_id_internal_name_match', confidence.high);
  }

  if (sourceMatch && !internalName) {
    return buildIdentityResult(
      relationStatus.candidateLowConfidence,
      sourceMatch,
      'internal_name_missing_source_id_match',
      confidence.medium
    );
  }

  if (sourceMatch && internalName && normalizeText(sourceMatch.internal_name) === internalName) {
    return buildIdentityResult(relationStatus.resolved, sourceMatch, 'source_id_internal_name_match', confidence.high);
  }

  if (sourceMatch && internalName && normalizeText(sourceMatch.internal_name) !== internalName) {
    return {
      status: relationStatus.unresolved,
      itemSourceId: sourceId,
      itemInternalName: internalName,
      reason: 'source_id_internal_name_conflict',
      confidence: confidence.none
    };
  }

  if (internalMatch) {
    return buildIdentityResult(
      relationStatus.candidateLowConfidence,
      internalMatch,
      sourceId == null ? 'source_id_missing_internal_name_match' : 'source_id_mismatch_internal_name_match',
      confidence.low
    );
  }

  return {
    status: relationStatus.unresolved,
    itemSourceId: sourceId,
    itemInternalName: internalName,
    reason: 'item_identity_unresolved',
    confidence: confidence.none
  };
}
