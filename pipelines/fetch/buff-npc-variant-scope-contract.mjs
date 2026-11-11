import { createHash } from 'node:crypto';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SCHEMA_VERSION = 'buff-npc-variant-scope-contract/v1';
const ALLOWED_STATUSES = new Set([
  'variant-owned-positive',
  'variant-owned-complete-empty',
  'unknown',
]);

const hashJson = value => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertHash(value, label) {
  if (!HASH_PATTERN.test(String(value ?? ''))) throw new Error(`${label} must be a sha256 hash`);
}

function assertIdentity(row, label) {
  if (!Number.isSafeInteger(row?.id) || row.id === 0
      || typeof row.internalName !== 'string' || !row.internalName.trim()) {
    throw new Error(`${label} stable identity is invalid`);
  }
}

function assertPositiveFact(fact, expected, label) {
  if (!Number.isSafeInteger(fact?.npcSourceId) || fact.npcSourceId !== expected.id
      || fact.npcInternalName !== expected.internalName) {
    throw new Error(`${label} stable identity drifted`);
  }
  if (!String(fact.sourcePage ?? '').trim() || !Number.isSafeInteger(fact.sourcePageId)
      || fact.sourcePageId <= 0 || !Number.isSafeInteger(fact.sourceRevisionId)
      || fact.sourceRevisionId <= 0 || !Number.isFinite(Date.parse(fact.sourceRevisionTimestamp ?? ''))) {
    throw new Error(`${label} revision provenance is invalid`);
  }
  assertHash(fact.sourceRawSha256, `${label} raw provenance`);
}

function indexFacts(evidence) {
  const facts = Array.isArray(evidence?.facts) ? evidence.facts : [];
  const byNpcId = new Map();
  for (const fact of facts) {
    if (!Number.isSafeInteger(fact?.npcSourceId)) throw new Error('NPC fact stable ID is invalid');
    const list = byNpcId.get(fact.npcSourceId) ?? [];
    list.push(fact);
    byNpcId.set(fact.npcSourceId, list);
  }
  return byNpcId;
}

function indexCompleteEmptyEvidence(rows) {
  const byId = new Map();
  for (const row of rows ?? []) {
    assertIdentity(row, 'complete-empty evidence');
    if (byId.has(row.id)) throw new Error('complete-empty evidence has duplicate stable ID');
    if (row.completeness !== 'complete-exhaustive-npc-page-scope') {
      throw new Error('complete-empty evidence is not exhaustive');
    }
    if (!Array.isArray(row.facts) || row.facts.length !== 0) {
      throw new Error('complete-empty evidence must contain no positive facts');
    }
    const targetInfoboxes = Array.isArray(row.targetInfoboxes)
      ? row.targetInfoboxes
      : row.targetInfobox && typeof row.targetInfobox === 'object'
        ? [row.targetInfobox]
        : [];
    if (!row.identity || row.identity.npcSourceId !== row.id
        || row.identity.npcInternalName !== row.internalName
        || targetInfoboxes.length === 0) {
      throw new Error('complete-empty evidence field completeness is invalid');
    }
    if (targetInfoboxes.length > 1 && row.selection !== 'all-matching-stable-id-blocks') {
      throw new Error('complete-empty evidence repeated blocks are not explicitly selected');
    }
    if (!row.pageWideDiagnostics || !Array.isArray(row.pageWideDiagnostics.positiveOwners)) {
      throw new Error('complete-empty evidence diagnostics are invalid');
    }
    for (const targetInfobox of targetInfoboxes) {
      if (!targetInfobox || typeof targetInfobox !== 'object'
          || !Array.isArray(targetInfobox.fieldNames)
          || !Array.isArray(targetInfobox.debuffFieldNames)
          || targetInfobox.autoId !== String(row.id)
          || !targetInfobox.fields || typeof targetInfobox.fields !== 'object') {
        throw new Error('complete-empty evidence field completeness is invalid');
      }
      if (targetInfobox.debuffFieldNames.length !== 0) {
        throw new Error('complete-empty evidence target debuff fields are present');
      }
      const fieldNames = [...targetInfobox.fieldNames];
      const normalizedFieldNames = [...new Set(fieldNames)].sort();
      if (fieldNames.some(field => typeof field !== 'string' || !field.trim())
          || JSON.stringify(fieldNames) !== JSON.stringify(normalizedFieldNames)
          || JSON.stringify(Object.keys(targetInfobox.fields).sort()) !== JSON.stringify(normalizedFieldNames)
          || Object.keys(targetInfobox.fields).some(field => /^debuff\d*$/i.test(field))) {
        throw new Error('complete-empty evidence field completeness is invalid');
      }
    }
    if (!row.source || !String(row.source.pageTitle ?? '').trim()
        || !Number.isSafeInteger(row.source.pageId) || row.source.pageId <= 0
        || !Number.isSafeInteger(row.source.revisionId) || row.source.revisionId <= 0
        || !Number.isFinite(Date.parse(row.source.revisionTimestamp ?? ''))) {
      throw new Error('complete-empty evidence revision provenance is invalid');
    }
    assertHash(row.source.rawSha256, 'complete-empty evidence raw provenance');
    assertHash(row.source.captureSha256, 'complete-empty evidence capture hash');
    byId.set(row.id, row);
  }
  return byId;
}

function validateReplay(replay, expectedIds) {
  if (!replay || replay.databaseWrites !== false || !replay.partial || !Array.isArray(replay.rows)) {
    throw new Error('partial replay safety contract is invalid');
  }
  if (replay.partial.normalizerAccepted !== replay.partial.total
      || replay.partial.normalizerRejected !== 0
      || replay.partial.errors && Object.keys(replay.partial.errors).length !== 0
      || replay.inflictionRetention?.missingFacts?.length !== 0) {
    throw new Error('partial replay did not retain a clean source contract');
  }
  const byId = new Map(replay.rows.map(row => [Number(row.id), row]));
  for (const id of expectedIds) {
    const row = byId.get(id);
    if (!row || row.status !== 'missing-baseline') {
      throw new Error(`Buff ${id} unexpectedly has a historical baseline`);
    }
  }
  return {
    total: replay.partial.total,
    baselineMissing: replay.partial.baselineMissing,
    preservedInflictingGroups: replay.partial.preserveGroups?.inflictingNpcs ?? 0,
    additiveFacts: replay.partial.additiveFacts ?? 0,
    retainedFacts: replay.inflictionRetention?.retainedFacts ?? 0,
    missingBaselineIds: [...expectedIds].sort((left, right) => left - right),
  };
}

export function buildBuffNpcVariantScopeContract({
  verifiedEvidence,
  classification,
  partialReplay,
  verifiedArtifactSha256,
  classificationArtifactSha256,
  partialReplayArtifactSha256,
  completeEmptyEvidence = [],
} = {}) {
  if (!verifiedEvidence || verifiedEvidence.schemaVersion !== 'buff-npc-page-infliction-evidence/v1') {
    throw new Error('verified NPC evidence schema is invalid');
  }
  if (verifiedEvidence.completeness !== 'complete-exhaustive-npc-page-scope-with-exclusions-and-unresolved-variants') {
    throw new Error('verified NPC evidence is not the expected unresolved-variant capture');
  }
  if (!Array.isArray(verifiedEvidence.scopeGaps)) throw new Error('verified NPC scope gaps are missing');
  if (!classification || classification.schemaVersion !== 'buff-npc-infliction-scope-gap-classification/v1'
      || classification.databaseWrites !== false || classification.networkRequests !== 0
      || !Array.isArray(classification.groups)) {
    throw new Error('scope classification contract is invalid');
  }
  assertHash(verifiedArtifactSha256, 'verified artifact');
  assertHash(classificationArtifactSha256, 'classification artifact');
  assertHash(partialReplayArtifactSha256, 'partial replay artifact');
  if (classification.input?.verifiedSha256 !== verifiedArtifactSha256) {
    throw new Error('scope classification is bound to a different verified artifact');
  }

  const gapRecords = verifiedEvidence.scopeGaps.map(gap => ({
    id: gap.npcSourceId,
    internalName: gap.npcInternalName,
    name: gap.npcName ?? gap.name,
    reason: gap.reason,
  }));
  const gapsById = new Map();
  for (const gap of gapRecords) {
    assertIdentity({ id: gap.id, internalName: gap.internalName }, 'scope gap');
    if (gapsById.has(gap.id)) throw new Error(`scope gap ${gap.id} is duplicated`);
    gapsById.set(gap.id, gap);
  }
  const classifiedById = new Map();
  for (const group of classification.groups) {
    if (!String(group.sourcePage ?? '').trim() || !Number.isSafeInteger(group.pageId)
        || group.pageId <= 0 || !Number.isSafeInteger(group.revisionId) || group.revisionId <= 0) {
      throw new Error('scope classification page identity is invalid');
    }
    assertHash(group.rawSha256, 'scope classification raw provenance');
    for (const gap of group.gapRecords ?? []) {
      const normalizedGap = {
        ...gap,
        id: gap.id ?? gap.npcSourceId,
        internalName: gap.internalName ?? gap.npcInternalName,
        name: gap.name ?? gap.npcName,
      };
      assertIdentity(normalizedGap, 'classified scope gap');
      if (classifiedById.has(normalizedGap.id)) throw new Error(`classified scope gap ${normalizedGap.id} is duplicated`);
      classifiedById.set(normalizedGap.id, { ...normalizedGap, source: {
        pageTitle: group.resolvedPageTitle ?? group.sourcePage,
        pageId: group.pageId,
        revisionId: group.revisionId,
        revisionTimestamp: group.revisionTimestamp,
        rawSha256: group.rawSha256,
      }, classification: group.classification,
      owners: clone(group.inflictionOwners ?? group.owners ?? []) });
    }
  }
  if (classifiedById.size !== gapsById.size || [...gapsById.keys()].some(id => !classifiedById.has(id))) {
    throw new Error('scope classification does not cover every verified gap');
  }

  const factsByNpcId = indexFacts(verifiedEvidence);
  const completeEmptyById = indexCompleteEmptyEvidence(completeEmptyEvidence);
  const statuses = [];
  for (const [id, gap] of [...gapsById.entries()].sort(([left], [right]) => left - right)) {
    const classified = classifiedById.get(id);
    const facts = factsByNpcId.get(id) ?? [];
    const identity = { id, internalName: gap.internalName, name: gap.name };
    for (const fact of facts) assertPositiveFact(fact, identity, `NPC ${id}`);
    if (facts.length > 0) {
      statuses.push({
        npcId: id,
        internalName: gap.internalName,
        name: gap.name,
        status: 'variant-owned-positive',
        reason: 'revision-bound positive fact owns the requested stable NPC identity',
        facts: clone(facts),
        source: clone(classified.source),
        preserveBaseline: true,
        publication: 'additive-positive-only',
      });
      continue;
    }
    const completeEmpty = completeEmptyById.get(id);
    if (completeEmpty) {
      const expectedSource = classified.source;
      const actualSource = completeEmpty.source;
      if (actualSource.pageTitle !== expectedSource.pageTitle
          || actualSource.pageId !== expectedSource.pageId
          || actualSource.revisionId !== expectedSource.revisionId
          || actualSource.revisionTimestamp !== expectedSource.revisionTimestamp
          || actualSource.rawSha256 !== expectedSource.rawSha256) {
        throw new Error(`complete-empty evidence source drifted for NPC ${id}`);
      }
      statuses.push({
        npcId: id,
        internalName: gap.internalName,
        name: gap.name,
        status: 'variant-owned-complete-empty',
        reason: 'independent exhaustive revision-bound page has no infliction facts',
        facts: [],
        source: clone(completeEmpty.source),
        preserveBaseline: false,
        publication: 'replacement-eligible-after-full-chain-review',
      });
      continue;
    }
    const positiveOwners = (classified.owners ?? []).filter(owner => owner.hasInfliction
      && String(owner.autoId ?? '') !== String(id));
    statuses.push({
      npcId: id,
      internalName: gap.internalName,
      name: gap.name,
      status: 'unknown',
      reason: positiveOwners.length > 0
        ? 'shared-page-positive-fact-belongs-to-another-stable-NPC-identity'
        : 'variant-owned-infliction-scope-is-unproven',
      facts: [],
      source: clone(classified.source),
      positiveOwnerIds: [...new Set(positiveOwners.map(owner => Number(owner.autoId))
        .filter(value => Number.isSafeInteger(value) && value !== 0))]
        .sort((left, right) => left - right),
      preserveBaseline: true,
      publication: 'preserve-baseline',
    });
  }

  const expectedNewBuffIds = Array.from({ length: 12 }, (_, index) => 389 + index);
  const replay = validateReplay(partialReplay, expectedNewBuffIds);
  const summary = {
    total: statuses.length,
    variantOwnedPositive: statuses.filter(row => row.status === 'variant-owned-positive').length,
    variantOwnedCompleteEmpty: statuses.filter(row => row.status === 'variant-owned-complete-empty').length,
    unknown: statuses.filter(row => row.status === 'unknown').length,
    preserveBaseline: statuses.filter(row => row.preserveBaseline).length,
    positiveFacts: statuses.reduce((total, row) => total + row.facts.length, 0),
  };
  if (summary.total !== verifiedEvidence.scopeGaps.length || summary.unknown + summary.variantOwnedPositive + summary.variantOwnedCompleteEmpty !== summary.total) {
    throw new Error('variant scope status counts drifted');
  }
  const contract = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    databaseWrites: false,
    networkRequests: 0,
    executable: false,
    applyAllowed: false,
    source: {
      verifiedArtifactSha256: verifiedArtifactSha256,
      classificationArtifactSha256: classificationArtifactSha256,
      partialReplayArtifactSha256: partialReplayArtifactSha256,
      verifiedCompleteness: verifiedEvidence.completeness,
    },
    summary,
    replay,
    statuses,
    blockedBy: [
      ...(summary.unknown > 0
        ? [`${summary.unknown} shared-page variant scope groups remain unknown unless independently proven`]
        : []),
      'Buff IDs 389-400 have no historical baseline',
      'canonical landing/maint/relation/projection publication remains disabled',
    ],
  };
  contract.contractSha256 = hashJson({ ...contract, contractSha256: undefined });
  return contract;
}

export const buffNpcVariantScopeContractSchema = SCHEMA_VERSION;
