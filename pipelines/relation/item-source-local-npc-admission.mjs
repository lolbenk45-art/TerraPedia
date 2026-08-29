import { createHash } from 'node:crypto';

import {
  buildNpcCrawlerFactEvidence,
  buildNpcCrawlerFactMaintRow,
} from '../npc-canonical/npc-canonical-contract.mjs';
import {
  buildItemSourceRelations,
  buildNpcCrawlerFactItemSourceRows,
} from './item-source-relation-processor.mjs';

export function selectLocalNpcAdmissions({
  candidateRows = [],
  snapshots = [],
  items = [],
  npcs = [],
  existingLocalSourceRows = [],
} = {}) {
  const snapshotIndex = buildSnapshotIndex(snapshots);
  const itemById = indexByPositiveId(items, 'item');
  const npcById = indexByPositiveId(npcs, 'NPC');
  const duplicateCandidateKeys = duplicateKeys(candidateRows.map(candidateSelectorIdentity));
  const acceptedRows = [];
  const duplicateRows = [];
  const quarantineRows = [];
  const blockedRows = [];
  const reconciliationRows = [];

  for (const candidate of candidateRows) {
    const source = candidate?.sourceIdentity ?? {};
    const selectorIdentity = candidateSelectorIdentity(candidate);
    const base = {
      itemInternalName: text(candidate?.itemInternalName),
      candidateSourcePage: text(source.sourcePage),
      candidateIdentityHash: sha256(selectorIdentity),
      sourceIdentity: normalizeCandidateSourceIdentity(source),
    };
    if (duplicateCandidateKeys.has(selectorIdentity)) {
      blockedRows.push({ ...base, reason: 'duplicate_selector_identity' });
      continue;
    }
    if (source.sourceRefType !== 'npc' || !['shop', 'drop'].includes(source.sourceType)) {
      quarantineRows.push({ ...base, reason: 'unsupported_candidate_source_kind' });
      continue;
    }
    const itemId = positiveId(source.itemId);
    const npcId = positiveId(source.sourceRefId);
    const item = itemById.get(itemId);
    const npc = npcById.get(npcId);
    if (!item || text(item.internal_name ?? item.internalName) !== base.itemInternalName) {
      quarantineRows.push({ ...base, reason: 'item_identity_mismatch' });
      continue;
    }
    if (!npc || text(npc.internal_name ?? npc.internalName) !== text(source.sourceRefInternalName)) {
      quarantineRows.push({ ...base, reason: 'npc_identity_mismatch' });
      continue;
    }
    const snapshotMatches = snapshotIndex.get(npcId) ?? [];
    if (snapshotMatches.length !== 1) {
      quarantineRows.push({
        ...base,
        reason: snapshotMatches.length === 0 ? 'audited_snapshot_not_found' : 'audited_snapshot_ambiguous',
      });
      continue;
    }
    const snapshot = snapshotMatches[0];
    const sourceMatches = findSnapshotFacts({ snapshot, sourceType: source.sourceType, item });
    const matchingFacts = sourceMatches.filter((fact) => payloadMatchesCandidate(fact, source));
    if (matchingFacts.length !== 1) {
      quarantineRows.push({
        ...base,
        reason: source.sourceType === 'drop' ? 'drop_payload_mismatch' : 'shop_conditions_mismatch',
      });
      continue;
    }
    const sourceFact = matchingFacts[0];
    const admitted = buildAcceptedRow({ candidate: base, source, item, npc, snapshot, sourceFact });
    const currentRows = activeLocalRowsForIdentity(existingLocalSourceRows, admitted.sourceIdentity);
    if (currentRows.length > 0) {
      if (currentRows.every((row) => localSourceEqualsAdmission(row, admitted.sourceIdentity))) {
        duplicateRows.push({ ...base, reason: 'existing_local_source_identical', sourceIdentity: admitted.sourceIdentity });
      } else {
        const reconciliation = buildFrozenLocalSourceReconciliation({
          existingRows: existingLocalSourceRows,
          admitted,
          activeRows: currentRows,
        });
        if (reconciliation == null) {
          blockedRows.push({ ...base, reason: 'existing_local_source_conflict', sourceIdentity: admitted.sourceIdentity });
        } else {
          acceptedRows.push(admitted);
          reconciliationRows.push(...reconciliation);
        }
      }
      continue;
    }
    acceptedRows.push(admitted);
  }

  return {
    acceptedRows,
    duplicateRows,
    quarantineRows,
    blockedRows,
    reconciliationRows,
    summary: {
      candidates: candidateRows.length,
      accepted: acceptedRows.length,
      duplicates: duplicateRows.length,
      quarantine: quarantineRows.length,
      blocked: blockedRows.length,
      unclassified: 0,
    },
  };
}

function buildFrozenLocalSourceReconciliation({ existingRows, admitted, activeRows }) {
  const identity = admitted.sourceIdentity;
  const allRows = localRowsForIdentity(existingRows, identity);
  if (activeRows.length === 1
      && allRows.length === 1
      && localSourceEqualsAdmissionIgnoringRevision(activeRows[0], identity)
      && text(activeRows[0]?.source_revision_timestamp ?? activeRows[0]?.sourceRevisionTimestamp) == null) {
    const before = requireLocalSourcePrimaryKey(activeRows[0]);
    return [{
      kind: 'set_missing_source_revision_timestamp',
      rowId: before.id,
      sourceIdentityHash: admitted.sourceIdentityHash,
      before,
      after: {
        ...before,
        source_revision_timestamp: toMysqlDateTime(identity.sourceRevisionTimestamp),
      },
    }];
  }
  const archivedExactRows = allRows.filter((row) => Number(row?.status ?? 1) === 0
    && Number(row?.deleted ?? 0) === 1
    && localSourceMatchesArchivedReconciliation(row, identity));
  if (activeRows.length !== 2 || allRows.length !== 3 || archivedExactRows.length !== 1
      || activeRows.some((row) => localSourceMatchesArchivedReconciliation(row, identity))) {
    return null;
  }
  const archived = requireLocalSourcePrimaryKey(archivedExactRows[0]);
  const staleRows = activeRows.map(requireLocalSourcePrimaryKey).sort((left, right) => left.id - right.id);
  return [
    {
      kind: 'restore_archived_exact_source',
      rowId: archived.id,
      sourceIdentityHash: admitted.sourceIdentityHash,
      before: archived,
      after: {
        ...archived,
        source_page: identity.sourcePage,
        source_revision_timestamp: toMysqlDateTime(identity.sourceRevisionTimestamp),
        status: 1,
        deleted: 0,
      },
    },
    ...staleRows.map((before) => ({
      kind: 'soft_delete_stale_active_duplicate',
      rowId: before.id,
      sourceIdentityHash: admitted.sourceIdentityHash,
      before,
      after: { ...before, status: 0, deleted: 1 },
    })),
  ];
}

export function sha256(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function buildLocalNpcAdmissionRowPlan({
  acceptedRows = [],
  snapshots = [],
  items = [],
  npcs = [],
} = {}) {
  const snapshotByContentHash = new Map();
  for (const snapshot of snapshots) {
    const evidence = buildNpcCrawlerFactEvidence(snapshot);
    snapshotByContentHash.set(`sha256:${evidence.contentHash}`, { ...snapshot, evidence });
  }
  const selectedSnapshots = new Map();
  for (const admission of acceptedRows) {
    const contentHash = admission?.snapshotEvidence?.contentHash;
    const snapshot = snapshotByContentHash.get(contentHash);
    if (!snapshot) throw new Error('accepted admission snapshot evidence is missing');
    selectedSnapshots.set(snapshot.evidence.recordKey, snapshot);
  }
  const landingRows = [...selectedSnapshots.values()].map(buildLandingRow);
  const landingByFactKey = new Map(landingRows.map((row) => [row.record_key, row]));
  const maintTemplates = [...selectedSnapshots.values()].map((snapshot) => {
    const landing = landingByFactKey.get(snapshot.evidence.recordKey);
    return buildNpcCrawlerFactMaintRow({
      landingRow: {
        id: 0,
        source_key: landing.source_key,
        source_page: landing.source_page,
        content_hash: landing.content_hash,
        normalized_content_hash: snapshot.evidence.normalizedContentHash,
        audit_content_hash: snapshot.evidence.auditContentHash,
        source_revision_timestamp: landing.source_revision_timestamp,
        fetched_at: landing.fetched_at,
        parsed_at: landing.parsed_at,
        payload_json: landing.payload_json,
      },
      maintNpcRows: npcs,
    });
  });
  const itemSourceRows = buildNpcCrawlerFactItemSourceRows(maintTemplates);
  const relationProjection = buildItemSourceRelations({
    itemSourceRows,
    itemIndex: buildLookupIndex(items, ['source_id', 'internal_name', 'english_name', 'name']),
    npcIndex: buildLookupIndex(npcs, ['source_id', 'internal_name', 'english_name', 'name']),
  });
  const relationRows = selectRelationRows({ relationProjection, acceptedRows });
  const localSourceRows = acceptedRows.map((admission, index) => buildLocalSourceRow(admission, index));
  return {
    allowedTables: [
      'terria_v1_local.source_dataset_landings',
      'terria_v1_maint.maint_npc_crawler_facts',
      'terria_v1_relation.item_source_facts',
      'terria_v1_relation.item_source_details',
      'terria_v1_relation.item_npc_shop_relations',
      'terria_v1_relation.item_npc_loot_relations',
      'terria_v1_local.item_acquisition_sources',
    ],
    landingRows,
    maintTemplates,
    relationRows,
    localSourceRows,
  };
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function buildSnapshotIndex(snapshots) {
  const index = new Map();
  for (const snapshot of snapshots) {
    const normalized = snapshot?.normalized;
    const audit = snapshot?.audit;
    const evidence = buildNpcCrawlerFactEvidence({ normalized, audit });
    const sourceIds = new Set([
      normalized?.sourceMetadata?.sourceId,
      normalized?.sourceId,
      ...(Array.isArray(normalized?.sourceInfoboxes)
        ? normalized.sourceInfoboxes.map((entry) => entry?.autoId)
        : []),
    ].map(positiveId).filter(Boolean));
    for (const sourceId of sourceIds) {
      const values = index.get(sourceId) ?? [];
      values.push({ normalized, audit, evidence });
      index.set(sourceId, values);
    }
  }
  return index;
}

function buildLandingRow(snapshot) {
  const { normalized, audit, evidence } = snapshot;
  const entityId = text(normalized?.entityId);
  if (!entityId) throw new Error('audited NPC snapshot entityId is required');
  return {
    record_key: evidence.recordKey,
    dataset_type: 'npc_crawler_facts_raw',
    provider: 'terraria.wiki.gg',
    source_kind: 'local_audited_npc_snapshot',
    source_key: `local-npc-admission:${evidence.recordKey}`,
    source_locator: `repo://data/wiki-crawler/normalized-light/npc/${entityId}.latest.json`,
    source_page: evidence.sourcePage,
    source_revision_timestamp: toMysqlDateTime(evidence.sourceRevisionTimestamp),
    content_hash: evidence.contentHash,
    payload_json: JSON.stringify({ normalized, audit }),
    fetched_at: toMysqlDateTime(evidence.fetchedAt),
    parsed_at: toMysqlDateTime(evidence.parsedAt),
    parse_status: evidence.parseStatus,
    artifact_role: 'source_evidence',
    producer_id: 'terrapedia.item-source-local-npc-admission',
    producer_version: 'v1',
    producer_run_key: `local-npc-admission:${evidence.recordKey}`,
    bootstrap_manifest_hash: null,
    full_file_content_hash: evidence.contentHash,
    full_file_byte_size: evidence.payloadBytes,
    is_current: 1,
    notes: 'local audited NPC snapshot admitted for Item source closure',
    normalized_content_hash: evidence.normalizedContentHash,
    audit_content_hash: evidence.auditContentHash,
  };
}

function buildLookupIndex(rows, fields) {
  const index = new Map();
  for (const row of rows) {
    for (const field of fields) {
      const value = row?.[field];
      const key = text(value);
      if (!key) continue;
      if (index.has(key) && index.get(key) !== row) {
        index.set(key, [index.get(key), row].flat());
      } else {
        index.set(key, row);
      }
      const lower = key.toLowerCase();
      if (!index.has(lower)) index.set(lower, row);
    }
  }
  return index;
}

function selectRelationRows({ relationProjection, acceptedRows }) {
  const detailsByFact = new Map(relationProjection.sourceDetails.map((row) => [row.sourceFactKey, row]));
  const acceptedByRelationKey = new Set();
  for (const sourceFact of relationProjection.sourceFacts) {
    const detail = detailsByFact.get(sourceFact.recordKey);
    const raw = parseJson(sourceFact.rawJson);
    if (acceptedRows.some((admission) => relationFactMatchesAdmission({ sourceFact, detail, raw, admission }))) {
      acceptedByRelationKey.add(sourceFact.recordKey);
    }
  }
  return {
    sourceFacts: relationProjection.sourceFacts.filter((row) => acceptedByRelationKey.has(row.recordKey)),
    sourceDetails: relationProjection.sourceDetails.filter((row) => acceptedByRelationKey.has(row.sourceFactKey)),
    npcShopRelations: relationProjection.npcShopRelations.filter((row) => acceptedByRelationKey.has(row.sourceFactKey)),
    npcLootRelations: relationProjection.npcLootRelations.filter((row) => acceptedByRelationKey.has(row.sourceFactKey)),
  };
}

function relationFactMatchesAdmission({ sourceFact, detail, raw, admission }) {
  const identity = admission.sourceIdentity;
  return sourceFact.sourceMaintRecordKey === admission.snapshotEvidence.recordKey
    && sourceFact.itemInternalName === identity.itemInternalName
    && sourceFact.sourceType === identity.sourceType
    && sourceFact.sourceRefType === 'npc'
    && text(raw.sourceRefInternalName) === identity.sourceRefInternalName
    && text(detail?.chanceText) === identity.chanceText
    && text(detail?.quantityText) === identity.quantityText
    && text(raw.conditions) === identity.conditions;
}

function buildLocalSourceRow(admission, index) {
  const identity = admission.sourceIdentity;
  const raw = admission.rawSnapshotFact ?? {};
  const quantity = parseQuantity(identity.quantityText);
  return {
    item_id: identity.itemId,
    source_type: identity.sourceType,
    source_ref_type: 'npc',
    source_ref_id: identity.sourceRefId,
    source_ref_name: identity.sourceRefName,
    biome_id: null,
    quantity_min: quantity.min,
    quantity_max: quantity.max,
    quantity_text: identity.quantityText,
    chance_value: parseChance(identity.chanceText),
    chance_text: identity.chanceText,
    conditions: identity.conditions,
    notes: null,
    source_provider: 'terraria.wiki.gg',
    source_page: identity.sourcePage,
    source_revision_timestamp: toMysqlDateTime(identity.sourceRevisionTimestamp),
    sort_order: Number.isInteger(Number(raw.sourceRowIndex)) ? Number(raw.sourceRowIndex) : index,
    status: 1,
    deleted: 0,
  };
}

function parseQuantity(value) {
  const normalized = text(value);
  if (!normalized) return { min: null, max: null };
  const exact = /^(\d+)$/.exec(normalized);
  if (exact) return { min: Number(exact[1]), max: Number(exact[1]) };
  const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(normalized);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  return { min: null, max: null };
}

function parseChance(value) {
  const normalized = text(value);
  const match = /^(\d+(?:\.\d+)?)%$/.exec(normalized ?? '');
  return match ? Number(match[1]) / 100 : null;
}

function toMysqlDateTime(value) {
  const normalized = text(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw new Error('source timestamp is invalid');
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function parseJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    return JSON.parse(String(value ?? '{}'));
  } catch {
    return {};
  }
}

function indexByPositiveId(rows, label) {
  const index = new Map();
  for (const row of rows) {
    const id = positiveId(row?.source_id ?? row?.sourceId ?? row?.id);
    if (!id) continue;
    if (index.has(id)) throw new Error(`${label} source identity is ambiguous: ${id}`);
    index.set(id, row);
  }
  return index;
}

function findSnapshotFacts({ snapshot, sourceType, item }) {
  const itemName = text(item.english_name ?? item.englishName ?? item.name);
  const entries = sourceType === 'shop'
    ? snapshot.normalized?.shop?.normalizedRows ?? []
    : snapshot.normalized?.loot ?? [];
  return entries
    .filter((entry) => text(entry?.itemName ?? entry?.item_name ?? entry?.name) === itemName)
    .map((entry) => ({
      itemName,
      sourceType,
      priceText: text(entry?.priceText ?? entry?.price_text),
      chanceText: text(entry?.chanceText ?? entry?.chance_text),
      quantityText: text(entry?.quantityText ?? entry?.quantity_text),
      conditions: text(entry?.conditionText ?? entry?.conditions),
      raw: entry,
    }));
}

function payloadMatchesCandidate(fact, source) {
  if (fact.sourceType === 'shop') {
    return fact.conditions === text(source.conditions);
  }
  return fact.chanceText === text(source.chanceText)
    && fact.quantityText === text(source.quantityText)
    && fact.conditions === text(source.conditions);
}

function buildAcceptedRow({ candidate, source, item, npc, snapshot, sourceFact }) {
  const sourceIdentity = {
    itemId: positiveId(item.source_id ?? item.sourceId ?? item.id),
    itemInternalName: text(item.internal_name ?? item.internalName),
    sourceType: source.sourceType,
    sourceRefType: 'npc',
    sourceRefId: positiveId(npc.source_id ?? npc.sourceId ?? npc.id),
    sourceRefInternalName: text(npc.internal_name ?? npc.internalName),
    sourceRefName: text(npc.english_name ?? npc.englishName ?? npc.name),
    sourcePage: text(snapshot.normalized?.source?.pageTitle),
    sourceRevisionTimestamp: text(snapshot.normalized?.sourceMetadata?.revisionTimestamp),
    chanceText: sourceFact.chanceText,
    quantityText: sourceFact.quantityText,
    conditions: sourceFact.conditions,
  };
  return {
    ...candidate,
    sourceIdentity,
    sourceIdentityHash: sha256(sourceIdentity),
    sourcePage: sourceIdentity.sourcePage,
    sourceRevisionTimestamp: sourceIdentity.sourceRevisionTimestamp,
    priceText: sourceFact.priceText,
    snapshotEvidence: {
      entityId: snapshot.evidence.entityId,
      normalizedContentHash: `sha256:${snapshot.evidence.normalizedContentHash}`,
      auditContentHash: `sha256:${snapshot.evidence.auditContentHash}`,
      recordKey: snapshot.evidence.recordKey,
      contentHash: `sha256:${snapshot.evidence.contentHash}`,
      sourcePage: snapshot.evidence.sourcePage,
      sourceRevisionTimestamp: snapshot.evidence.sourceRevisionTimestamp,
    },
    rawSnapshotFact: sourceFact.raw,
  };
}

function activeLocalRowsForIdentity(rows, identity) {
  return localRowsForIdentity(rows, identity)
    .filter((row) => Number(row?.status ?? 1) === 1 && Number(row?.deleted ?? 0) === 0);
}

function localRowsForIdentity(rows, identity) {
  return rows
    .filter((row) => positiveId(row.item_id ?? row.itemId) === identity.itemId)
    .filter((row) => text(row.source_type ?? row.sourceType) === identity.sourceType)
    .filter((row) => text(row.source_ref_type ?? row.sourceRefType) === 'npc')
    .filter((row) => positiveId(row.source_ref_id ?? row.sourceRefId) === identity.sourceRefId);
}

function localSourceEqualsAdmission(row, identity) {
  return localSourceEqualsAdmissionIgnoringRevision(row, identity)
    && sameSourceRevisionTimestamp(
      row.source_revision_timestamp ?? row.sourceRevisionTimestamp,
      identity.sourceRevisionTimestamp,
    );
}

function localSourceEqualsAdmissionIgnoringRevision(row, identity) {
  return text(row.source_ref_name ?? row.sourceRefName) === identity.sourceRefName
    && text(row.chance_text ?? row.chanceText) === identity.chanceText
    && text(row.quantity_text ?? row.quantityText) === identity.quantityText
    && text(row.conditions) === identity.conditions
    && text(row.source_page ?? row.sourcePage) === identity.sourcePage;
}

function localSourceMatchesArchivedReconciliation(row, identity) {
  return text(row.source_ref_name ?? row.sourceRefName) === identity.sourceRefName
    && text(row.chance_text ?? row.chanceText) === identity.chanceText
    && text(row.quantity_text ?? row.quantityText) === identity.quantityText
    && text(row.conditions) === identity.conditions;
}

function requireLocalSourcePrimaryKey(row) {
  const id = positiveId(row?.id);
  if (!id) throw new Error('frozen local source reconciliation row requires a positive primary key');
  return { ...row, id };
}

function sameSourceRevisionTimestamp(left, right) {
  const normalize = (value) => {
    const normalized = text(value);
    if (!normalized) return null;
    const candidate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)
      ? `${normalized.replace(' ', 'T')}Z`
      : normalized;
    const milliseconds = Date.parse(candidate);
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : normalized;
  };
  return normalize(left) === normalize(right);
}

function candidateSelectorIdentity(candidate) {
  const source = candidate?.sourceIdentity ?? {};
  return canonicalJson({
    itemInternalName: text(candidate?.itemInternalName),
    itemId: positiveId(source.itemId),
    sourceType: text(source.sourceType),
    sourceRefType: text(source.sourceRefType),
    sourceRefId: positiveId(source.sourceRefId),
    sourceRefInternalName: text(source.sourceRefInternalName),
    chanceText: text(source.chanceText),
    quantityText: text(source.quantityText),
    conditions: text(source.conditions),
  });
}

function normalizeCandidateSourceIdentity(source) {
  return {
    itemId: positiveId(source.itemId),
    sourceType: text(source.sourceType),
    sourceRefType: text(source.sourceRefType),
    sourceRefId: positiveId(source.sourceRefId),
    sourceRefInternalName: text(source.sourceRefInternalName),
    sourceRefName: text(source.sourceRefName),
    sourcePage: text(source.sourcePage),
    chanceText: text(source.chanceText),
    quantityText: text(source.quantityText),
    conditions: text(source.conditions),
  };
}

function duplicateKeys(keys) {
  const counts = new Map();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

function positiveId(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function text(value) {
  const normalized = String(value ?? '').normalize('NFKC').trim().replaceAll(/\s+/g, ' ');
  return normalized || null;
}

function sortValue(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('canonical Item-source value cannot contain an invalid Date');
    return value.toISOString();
  }
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }
  return value;
}
