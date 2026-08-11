import crypto from 'node:crypto';

import { buildNpcBridgeRetirementReport } from '../audit/build-npc-bridge-retirement-report.mjs';

export const NPC_CANONICAL_LIMITS = Object.freeze({
  basePayloadBytes: 16 * 1024 * 1024,
  factPayloadBytes: 2 * 1024 * 1024,
  factsPerRun: 2048,
  factRunBytes: 64 * 1024 * 1024,
});

export const NPC_CRAWLER_FACT_MATCH_STATUSES = Object.freeze([
  'MATCHED',
  'UNMATCHED',
  'AMBIGUOUS',
  'REJECTED',
]);

export function buildNpcCrawlerFactEvidence({ normalized, audit } = {}) {
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    throw new Error('NPC crawler fact requires normalized evidence');
  }
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    throw new Error('NPC crawler fact requires matching audit evidence');
  }

  const entityId = requiredText(normalized.entityId, 'normalized entityId');
  const sourcePage = requiredText(normalized.source?.pageTitle, 'normalized source page');
  const sourceRevisionTimestamp = requiredTimestamp(
    normalized.sourceMetadata?.revisionTimestamp,
    'normalized source revision timestamp',
  );
  const normalizedContentHash = hashJson(normalized);
  if (audit.status !== 'pass') {
    throw new Error(`NPC crawler audit status must be pass, received: ${audit.status ?? ''}`);
  }
  if (audit.entityId !== entityId || audit.sourcePage !== sourcePage) {
    throw new Error('NPC crawler audit entity identity does not match normalized evidence');
  }
  if (audit.sourceRevisionTimestamp !== sourceRevisionTimestamp) {
    throw new Error('NPC crawler audit source revision identity does not match normalized evidence');
  }
  if (audit.normalizedContentHash !== normalizedContentHash) {
    throw new Error('NPC crawler audit normalized content hash does not match normalized evidence');
  }
  requiredTimestamp(audit.auditedAt, 'NPC crawler audit timestamp');

  const payload = { normalized, audit };
  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (payloadBytes > NPC_CANONICAL_LIMITS.factPayloadBytes) {
    throw new Error(`NPC crawler fact exceeds the provisional 2 MiB per-fact limit: ${payloadBytes}`);
  }
  const auditContentHash = hashJson(audit);
  return {
    entityId,
    sourcePage,
    sourceRevisionTimestamp,
    fetchedAt: normalized.sourceMetadata?.fetchedAt ?? null,
    parsedAt: normalized.sourceMetadata?.parsedAt ?? normalized.sourceMetadata?.fetchedAt ?? null,
    normalizedContentHash,
    auditContentHash,
    recordKey: hashText([entityId, sourcePage, sourceRevisionTimestamp, normalizedContentHash, auditContentHash].join('\n')),
    contentHash: hashJson(payload),
    payloadBytes,
    parseStatus: 'ok',
    payload,
  };
}

export function validateNpcCrawlerFactRunEvidence(evidence = []) {
  if (!Array.isArray(evidence)) {
    throw new TypeError('NPC crawler fact run evidence must be an array');
  }
  if (evidence.length > NPC_CANONICAL_LIMITS.factsPerRun) {
    throw new Error(
      `NPC crawler fact run exceeds the provisional 2,048 facts per run limit: ${evidence.length}`,
    );
  }
  const payloadBytes = evidence.reduce((total, fact) => {
    const bytes = Number(fact?.payloadBytes);
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error('NPC crawler fact run contains an invalid payload byte count');
    }
    return total + bytes;
  }, 0);
  if (payloadBytes > NPC_CANONICAL_LIMITS.factRunBytes) {
    throw new Error(
      `NPC crawler fact run exceeds the provisional 64 MiB per run limit: ${payloadBytes}`,
    );
  }
  return { factCount: evidence.length, payloadBytes };
}

export function verifyNpcBridgeRetirement(options = {}) {
  return buildNpcBridgeRetirementReport(options);
}

export function buildNpcCrawlerFactMaintRow({ landingRow, maintNpcRows = [] } = {}) {
  if (!landingRow || typeof landingRow !== 'object') {
    throw new Error('NPC crawler fact landing row is required');
  }
  const payload = typeof landingRow.payload_json === 'string'
    ? JSON.parse(landingRow.payload_json)
    : landingRow.payload_json;
  const normalized = payload?.normalized;
  const audit = payload?.audit;
  if (!normalized || !audit || audit.status !== 'pass') {
    throw new Error('NPC crawler fact landing requires passing paired evidence');
  }

  const match = matchNpcIdentity(normalized, maintNpcRows);
  const normalizedContentHash = landingRow.normalized_content_hash ?? hashJson(normalized);
  const crawlerAuditHash = landingRow.audit_content_hash ?? hashJson(audit);
  const entityId = requiredText(normalized.entityId, 'NPC crawler fact entityId');
  const sourcePage = requiredText(normalized.source?.pageTitle ?? landingRow.source_page, 'NPC crawler fact source page');
  const sourceRevisionTimestamp = requiredTimestamp(
    normalized.sourceMetadata?.revisionTimestamp
      ?? normalized.source?.revisionTimestamp
      ?? landingRow.source_revision_timestamp,
    'NPC crawler fact source revision timestamp',
  );
  const recordKey = hashText([
    entityId,
    sourcePage,
    sourceRevisionTimestamp,
    normalizedContentHash,
    crawlerAuditHash,
  ].join('\n'));

  return {
    scope: 'npc_crawler_facts',
    tableName: 'maint_npc_crawler_facts',
    recordKey,
    npcIdentityKey: match.internalName ?? entityId,
    npcSourceId: match.sourceId,
    npcInternalName: match.internalName,
    npcName: match.name,
    matchStatus: match.status,
    matchReason: match.reason,
    sourcePage,
    sourceRevisionTimestamp,
    fetchedAt: normalized.sourceMetadata?.fetchedAt ?? normalized.source?.fetchedAt ?? landingRow.fetched_at ?? null,
    parsedAt: normalized.sourceMetadata?.parsedAt ?? normalized.source?.parsedAt ?? landingRow.parsed_at ?? null,
    landingSourceId: Number(landingRow.id),
    landingSourceKey: requiredText(landingRow.source_key, 'NPC crawler fact landing source key'),
    landingSourcePage: landingRow.source_page ?? sourcePage,
    landingContentHash: requiredText(landingRow.content_hash, 'NPC crawler fact landing content hash'),
    normalizedContentHash,
    crawlerAuditHash,
    crawlerAuditStatus: audit.status,
    buffInflictionsJson: JSON.stringify(normalized.buffInflictions ?? []),
    shopFactsJson: JSON.stringify(normalized.shop?.normalizedRows ?? []),
    lootFactsJson: JSON.stringify(normalized.loot ?? []),
    sourceMetadataJson: JSON.stringify(normalized.sourceMetadata ?? {}),
    rawEvidenceJson: JSON.stringify(payload),
    reviewStatus: match.status === 'MATCHED' ? 'accepted' : 'pending',
    status: 1,
    deleted: 0,
  };
}

function matchNpcIdentity(normalized, maintNpcRows) {
  if (String(normalized.identityReview?.status ?? '').toUpperCase() === 'REJECTED') {
    return {
      status: 'REJECTED',
      reason: requiredText(normalized.identityReview?.reason, 'rejected NPC identity reason'),
      sourceId: null,
      internalName: null,
      name: null,
    };
  }
  const hints = new Set([
    normalized.entityId,
    normalized.npcInternalName,
    normalized.display?.name,
    normalized.source?.pageTitle,
  ].map(normalizeLookupText).filter(Boolean));
  const sourceIdHints = new Set([
    normalized.sourceMetadata?.sourceId,
    normalized.sourceId,
    ...(Array.isArray(normalized.sourceInfoboxes)
      ? normalized.sourceInfoboxes.map((infobox) => infobox?.autoId)
      : []),
  ].map(Number).filter((value) => Number.isFinite(value) && value > 0));
  const candidates = (Array.isArray(maintNpcRows) ? maintNpcRows : []).filter((row) => {
    const sourceId = Number(row.source_id ?? row.sourceId);
    if (sourceIdHints.has(sourceId)) {
      return true;
    }
    return [row.internal_name, row.internalName, row.english_name, row.name, row.name_zh]
      .map(normalizeLookupText)
      .some((value) => value && hints.has(value));
  });
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = `${candidate.source_id ?? candidate.sourceId ?? ''}:${candidate.internal_name ?? candidate.internalName ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(candidate);
    }
  }
  if (unique.length === 0) {
    return { status: 'UNMATCHED', reason: 'npc_identity_not_found', sourceId: null, internalName: null, name: null };
  }
  if (unique.length > 1) {
    return { status: 'AMBIGUOUS', reason: 'npc_identity_ambiguous', sourceId: null, internalName: null, name: null };
  }
  const row = unique[0];
  return {
    status: 'MATCHED',
    reason: 'npc_identity_exact',
    sourceId: Number(row.source_id ?? row.sourceId) || null,
    internalName: requiredText(row.internal_name ?? row.internalName, 'matched NPC internal name'),
    name: row.english_name ?? row.name ?? row.name_zh ?? row.internal_name ?? row.internalName,
  };
}

function hashJson(value) {
  return hashText(JSON.stringify(value));
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeLookupText(value) {
  const text = String(value ?? '').trim();
  return text ? text.toLowerCase() : null;
}

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error(`${label} is required`);
  }
  return text;
}

function requiredTimestamp(value, label) {
  const text = requiredText(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw new Error(`${label} is invalid`);
  }
  return text;
}
