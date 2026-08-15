import crypto from 'node:crypto';

export const CANONICAL_CANDIDATE_VERSION = 'v1';

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function normalizeText(value) {
  return String(value ?? '').trim();
}

function isIsoDateTime(value) {
  const text = normalizeText(value);
  if (!text) {
    return false;
  }
  const date = new Date(text);
  return Number.isFinite(date.getTime()) && date.toISOString() === text;
}

export function createCanonicalContentHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
}

export function buildSourceLandingId({ datasetType, provider, sourceKey, sourcePage }) {
  return [
    'landing',
    normalizeText(datasetType),
    normalizeText(provider),
    normalizeText(sourceKey),
    encodeURIComponent(normalizeText(sourcePage)),
  ].join(':');
}

export function validateCanonicalCandidate(candidate) {
  const errors = [];
  const value = candidate ?? {};

  if (!normalizeText(value.canonical_version)) {
    errors.push('canonical_version is required');
  }
  if (!normalizeText(value.domain)) {
    errors.push('domain is required');
  }
  if (!normalizeText(value.dataset_type)) {
    errors.push('dataset_type is required');
  }
  if (!isIsoDateTime(value.candidate_generated_at)) {
    errors.push('candidate_generated_at must be an ISO datetime');
  }
  if (!normalizeText(value.source_landing_id)) {
    errors.push('source_landing_id is required');
  }
  if (!normalizeText(value.source_provider)) {
    errors.push('source_provider is required');
  }
  if (!normalizeText(value.source_key)) {
    errors.push('source_key is required');
  }
  if (!normalizeText(value.source_page)) {
    errors.push('source_page is required');
  }
  if (!HASH_PATTERN.test(normalizeText(value.source_content_hash))) {
    errors.push('source_content_hash must be a 64-char sha256 hex');
  }
  if (!HASH_PATTERN.test(normalizeText(value.content_hash))) {
    errors.push('content_hash must be a 64-char sha256 hex');
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'payload') || value.payload == null) {
    errors.push('payload is required');
  }

  return errors;
}
