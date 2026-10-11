const IMMUNITY_STATUSES = new Set(['parsed', 'section_missing', 'no_rows', 'target_mismatch', 'target_ambiguous', 'target_unverified']);
const APPLICABILITY_EVIDENCE_TYPE = 'source-page-contract/v1';
const PARTIAL_FACT_GROUPS = Object.freeze(['sourceItems', 'inflictingNpcs', 'immuneNpcs']);
const EXPECTED_PRESERVATION_STATUSES = new Set(['section_missing', 'no_rows']);
const COMPLETE_INFLICTING_STATUS = 'complete-exhaustive-npc-page-scope';

export function classifyBuffPageApplicability(record = {}, { pageClassification = null } = {}) {
  const evidence = record?.sourceEvidence;
  if (!evidence || typeof evidence !== 'object') throw new Error('Buff source evidence is required');
  const group = evidence.factGroups?.immuneNpcs;
  if (!group || typeof group !== 'object' || !IMMUNITY_STATUSES.has(group.status)) {
    throw new Error('Buff immunity fact-group status is invalid');
  }
  const completeAlternate = hasCompleteAlternateImmunityEvidence(evidence);
  if (group.status.startsWith('target_')) {
    if (completeAlternate) {
      return { status: 'parsed', reason: 'complete-alternate-immunity-source', evidence: null };
    }
    return { status: 'unknown', reason: group.status.replace('target_', 'immunity-target-'), evidence: null };
  }
  if (group.status === 'parsed') {
    const binding = evidence.immunityTargetBinding;
    if (binding !== undefined && binding?.status !== 'matched') {
      const status = ['mismatch', 'ambiguous'].includes(binding?.status) ? binding.status : 'unverified';
      return { status: 'unknown', reason: `immunity-target-${status}`, evidence: null };
    }
    if (!Array.isArray(group.sections) || group.sections.length === 0) {
      throw new Error('parsed Buff immunity evidence requires sections');
    }
    return { status: 'parsed', reason: 'section-parsed', evidence: null };
  }
  if (completeAlternate) {
    return { status: 'parsed', reason: 'complete-alternate-immunity-source', evidence: null };
  }
  // Category probes and current-page metadata are diagnostic only. They do not
  // prove that a missing immunity section is semantically inapplicable.
  if (pageClassification != null) validatePageClassification(record, pageClassification);
  const applicability = evidence.applicability;
  if (applicability == null) return { status: 'unknown', reason: 'missing-applicability-evidence', evidence: null };
  if (applicability.status !== 'not_applicable'
      || applicability.evidenceType !== APPLICABILITY_EVIDENCE_TYPE
      || typeof applicability.reason !== 'string' || !applicability.reason.trim()
      || String(applicability.sourcePageTitle) !== String(evidence.pageTitle)
      || Number(applicability.revisionId) !== Number(evidence.revisionId)) {
    return { status: 'unknown', reason: 'unverified-applicability-claim', evidence: null };
  }
  return { status: 'not_applicable', reason: applicability.reason, evidence: { ...applicability } };
}

function hasCompleteAlternateImmunityEvidence(sourceEvidence) {
  const wrapper = sourceEvidence?.immuneNpcPositiveEvidence;
  const alternate = wrapper?.immuneNpcPositiveEvidence
    ?? sourceEvidence?.completeImmuneNpcEvidence
    ?? (wrapper && ['complete-npc-scope', 'complete-expanded-npc-scope'].includes(wrapper.status) ? wrapper : null);
  if (!alternate || !['complete-npc-scope', 'complete-expanded-npc-scope'].includes(alternate.status)
      || !Array.isArray(alternate.assertions)) return false;
  if (alternate.status !== 'complete-expanded-npc-scope') return true;
  const semantic = alternate.source?.semanticExpansion ?? alternate.semanticExpansion;
  const requiredTitles = new Set([
    'Module:Npcinfo/doc', 'Module:Npcinfo/datagen',
    'Template:GetBuffInfo', 'Whips',
  ]);
  if (semantic?.schemaVersion !== 'buff-npcinfo-semantic-expansion/v1'
      || !Array.isArray(semantic.whipDebuffBuffIds)
      || !Array.isArray(semantic.sourcePages)
      || semantic.sourcePages.length !== requiredTitles.size) return false;
  const titles = new Set();
  for (const page of semantic.sourcePages) {
    if (!page || !requiredTitles.has(page.pageTitle) || titles.has(page.pageTitle)
        || !Number.isSafeInteger(page.pageId) || page.pageId <= 0
        || !Number.isSafeInteger(page.revisionId) || page.revisionId <= 0
        || typeof page.revisionTimestamp !== 'string' || !Number.isFinite(Date.parse(page.revisionTimestamp))
        || !/^sha256:[a-f0-9]{64}$/.test(String(page.rawSha256 ?? ''))) return false;
    titles.add(page.pageTitle);
  }
  return titles.size === requiredTitles.size;
}

export function buildBuffPartialFactPlan({ record, baseline = null } = {}) {
  if (!record || typeof record !== 'object' || !Number.isSafeInteger(Number(record.id)) || Number(record.id) <= 0
      || typeof record.internalName !== 'string' || !record.internalName.trim()) {
    throw new Error('partial Buff fact plan identity is invalid');
  }
  const source = record.sourceEvidence;
  if (!source || typeof source !== 'object' || source.provider !== 'terraria.wiki.gg'
      || typeof source.pageTitle !== 'string' || !source.pageTitle.trim()
      || typeof source.canonicalPageTitle !== 'string' || !source.canonicalPageTitle.trim()
      || !Number.isSafeInteger(Number(source.revisionId)) || Number(source.revisionId) <= 0
      || typeof source.revisionTimestamp !== 'string' || !Number.isFinite(Date.parse(source.revisionTimestamp))) {
    throw new Error('partial Buff fact plan source identity is invalid');
  }
  const groups = source.factGroups;
  if (!groups || typeof groups !== 'object') throw new Error('partial Buff fact plan groups are missing');
  const alternateEvidence = validateAlternateFactEvidence(source);
  validateExpectedPreservationFacts(source, groups, alternateEvidence);
  const immunityApplicability = groups.immuneNpcs && IMMUNITY_STATUSES.has(groups.immuneNpcs.status)
    ? classifyBuffPageApplicability(record)
    : null;
  const replaceGroups = [];
  const preserveGroups = [];
  const additiveGroups = [];
  const additiveFacts = {};
  const preserved = {};
  for (const groupName of PARTIAL_FACT_GROUPS) {
    const group = groups[groupName];
    if (!group) continue;
    const alternateImmuneReplacement = groupName === 'immuneNpcs'
      && group.status !== 'parsed'
      && immunityApplicability?.status === 'parsed'
      && alternateEvidence?.completeReplacementGroups?.includes('immuneNpcs');
    const alternateInflictingReplacement = groupName === 'inflictingNpcs'
      && group.status !== 'parsed'
      && alternateEvidence?.completeReplacementGroups?.includes('inflictingNpcs');
    if (group.status === 'parsed' || alternateImmuneReplacement || alternateInflictingReplacement) {
      if (groupName === 'immuneNpcs' && immunityApplicability?.status !== 'parsed') {
        throw new Error('partial Buff fact plan immunity target applicability is unresolved');
      }
      if (group.status === 'parsed' && (!Array.isArray(group.sections) || group.sections.length === 0)) {
        throw new Error(`partial Buff fact plan parsed ${groupName} section is invalid`);
      }
      const expectedCount = alternateImmuneReplacement
        ? alternateEvidence.immuneNpcPositiveEvidence.assertions.length
        : alternateInflictingReplacement
          ? alternateEvidence.inflictingNpcPositiveEvidence.facts.length
        : group.count;
      if (!Number.isSafeInteger(Number(expectedCount)) || Number(expectedCount) < 0
          || !Array.isArray(record[groupName]) || Number(expectedCount) !== record[groupName].length) {
        throw new Error(`partial Buff fact plan parsed ${groupName} count is inconsistent`);
      }
      replaceGroups.push(groupName);
      continue;
    }
    if (!EXPECTED_PRESERVATION_STATUSES.has(group.status)) {
      throw new Error(`partial Buff fact plan status is invalid: ${groupName}`);
    }
    if (!baseline || !Object.hasOwn(baseline, groupName)) {
      throw new Error(`partial Buff fact plan baseline is required for ${groupName}`);
    }
    preserved[groupName] = cloneValue(baseline[groupName]);
    if (groupName === 'immuneNpcs') {
      for (const field of ['immuneNpcCount', 'immuneNpcSample']) {
        if (!Object.hasOwn(baseline, field)) throw new Error(`partial Buff fact plan baseline is required for ${field}`);
        preserved[field] = cloneValue(baseline[field]);
      }
    }
    preserveGroups.push(groupName);
  }
  const inflictingEvidence = alternateEvidence?.inflictingNpcPositiveEvidence;
  if (inflictingEvidence?.status === 'positive-infliction-facts-only'
      && preserveGroups.includes('inflictingNpcs')
      && !replaceGroups.includes('inflictingNpcs')
      && !alternateEvidence.completeReplacementGroups.includes('inflictingNpcs')) {
    const additions = normalizeAdditiveInflictingFacts({ evidence: inflictingEvidence, record });
    if (additions.length > 0) {
      additiveGroups.push('inflictingNpcs');
      additiveFacts.inflictingNpcs = additions;
    }
  }
  if (replaceGroups.length === 0 && preserveGroups.length === 0) {
    throw new Error('partial Buff fact plan has no fact groups');
  }
  return {
    schemaVersion: 'buff-partial-fact-plan/v1',
    executable: false,
    executionBlocker: 'partial-fact-contract-review-required',
    buffId: Number(record.id),
    internalName: record.internalName,
    source: {
      provider: source.provider,
      pageTitle: source.pageTitle,
      canonicalPageTitle: source.canonicalPageTitle,
      revisionId: Number(source.revisionId),
      revisionTimestamp: source.revisionTimestamp,
    },
    replaceGroups,
    preserveGroups,
    additiveGroups,
    additiveFacts,
    baseline: preserved,
    ...(alternateEvidence ? { alternateEvidence } : {}),
  };
}

function normalizeAdditiveInflictingFacts({ evidence, record }) {
  if (!evidence || !Array.isArray(evidence.facts)) {
    throw new Error('partial Buff additive infliction evidence is missing');
  }
  const source = evidence.source;
  const sourceProvider = source?.provider;
  if (sourceProvider !== 'terraria.wiki.gg') {
    throw new Error('partial Buff additive infliction source provider is invalid');
  }
  const wrapperSourceKey = sourceProvenanceKey(source);
  if (!wrapperSourceKey) {
    throw new Error('partial Buff additive infliction source identity is invalid');
  }
  const declaredSources = new Set();
  if (source.factSources !== undefined) {
    if (!Array.isArray(source.factSources) || source.factSources.length === 0) {
      throw new Error('partial Buff additive infliction source descriptors are invalid');
    }
    for (const descriptor of source.factSources) {
      const key = sourceProvenanceKey(descriptor);
      if (!key || declaredSources.has(key)) {
        throw new Error('partial Buff additive infliction source descriptor is invalid');
      }
      declaredSources.add(key);
    }
  }
  const seen = new Set();
  return evidence.facts.map((fact) => {
    if (fact?.relationType !== 'inflicts'
        || Number(fact.buffId) !== Number(record.id)
        || fact.buffInternalName !== record.internalName
        || !Number.isSafeInteger(Number(fact.npcSourceId))
        || Number(fact.npcSourceId) === 0
        || typeof fact.npcInternalName !== 'string' || !fact.npcInternalName.trim()) {
      throw new Error('partial Buff additive infliction identity is invalid');
    }
    const npcId = Number(fact.npcSourceId);
    const internalName = fact.npcInternalName.trim();
    const identity = `${npcId}:${internalName}`;
    if (seen.has(identity)) throw new Error('duplicate partial Buff additive infliction fact');
    seen.add(identity);
    const pageTitle = fact.sourcePage ?? source.pageTitle;
    const pageId = fact.sourcePageId ?? source.pageId;
    const revisionId = fact.sourceRevisionId ?? source.revisionId;
    const revisionTimestamp = fact.sourceRevisionTimestamp ?? source.revisionTimestamp;
    if (typeof pageTitle !== 'string' || !pageTitle.trim()
        || !Number.isSafeInteger(Number(pageId)) || Number(pageId) <= 0
        || !Number.isSafeInteger(Number(revisionId)) || Number(revisionId) <= 0
        || typeof revisionTimestamp !== 'string' || !Number.isFinite(Date.parse(revisionTimestamp))) {
      throw new Error('partial Buff additive infliction provenance is invalid');
    }
    const factSourceKey = sourceProvenanceKey({ pageTitle, pageId, revisionId, revisionTimestamp });
    if (declaredSources.size > 0 && !declaredSources.has(factSourceKey)) {
      throw new Error('partial Buff additive inflicting fact provenance is not declared');
    }
    if (declaredSources.size === 0 && factSourceKey !== wrapperSourceKey) {
      throw new Error('partial Buff additive infliction provenance is not declared');
    }
    return {
      npcId,
      internalName,
      name: fact.npcName ?? null,
      relationType: 'inflicts',
      buffId: Number(record.id),
      buffInternalName: record.internalName,
      ...(fact.durationText != null ? { durationText: fact.durationText } : {}),
      ...(fact.chanceText != null ? { chanceText: fact.chanceText } : {}),
      sourcePage: pageTitle,
      sourcePageId: Number(pageId),
      sourceRevisionId: Number(revisionId),
      sourceRevisionTimestamp: revisionTimestamp,
    };
  });
}

function sourceProvenanceKey(source = {}) {
  const pageTitle = String(source.pageTitle ?? '').trim();
  const pageId = Number(source.pageId);
  const revisionId = Number(source.revisionId);
  const revisionTimestamp = String(source.revisionTimestamp ?? '').trim();
  if (!pageTitle || !Number.isSafeInteger(pageId) || pageId <= 0
      || !Number.isSafeInteger(revisionId) || revisionId <= 0
      || !revisionTimestamp || !Number.isFinite(Date.parse(revisionTimestamp))) return '';
  return `${pageTitle}\u0000${pageId}\u0000${revisionId}\u0000${revisionTimestamp}`;
}

function validateExpectedPreservationFacts(source, groups, alternateEvidence) {
  if (!Array.isArray(source.unresolvedFacts)) {
    throw new Error('partial Buff fact plan unresolved parser facts are missing');
  }
  const seenGroups = new Set();
  for (const fact of source.unresolvedFacts) {
    const groupName = fact?.group;
    const status = fact?.status;
    const group = typeof groupName === 'string' ? groups[groupName] : null;
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      throw new Error('partial Buff fact plan has unresolved parser fact outside fact groups');
    }
    const completeAlternateImmune = alternateEvidence?.completeReplacementGroups?.includes('immuneNpcs');
    const completeAlternateInflicting = alternateEvidence?.completeReplacementGroups?.includes('inflictingNpcs');
    const targetMismatchCovered = groupName === 'immuneNpcs'
      && ['target_mismatch', 'target_ambiguous', 'target_unverified'].includes(status)
      && group.status === status && completeAlternateImmune;
    const inflictingCovered = groupName === 'inflictingNpcs' && status === 'section_missing' && completeAlternateInflicting;
    if ((!EXPECTED_PRESERVATION_STATUSES.has(status) && !targetMismatchCovered && !inflictingCovered) || group.status !== status) {
      throw new Error('partial Buff fact plan has unresolved parser errors');
    }
    if (seenGroups.has(groupName)) {
      throw new Error('partial Buff fact plan has duplicate unresolved parser facts');
    }
    seenGroups.add(groupName);
  }
}

export function summarizeBuffSourceApplicability(records = []) {
  if (!Array.isArray(records)) throw new TypeError('Buff source records must be an array');
  const summary = { total: records.length, parsed: 0, notApplicable: 0, unknown: 0 };
  for (const record of records) {
    const status = classifyBuffPageApplicability(record).status;
    if (status === 'parsed') summary.parsed += 1;
    else if (status === 'not_applicable') summary.notApplicable += 1;
    else summary.unknown += 1;
  }
  return summary;
}

function validatePageClassification(record, classification) {
  if (!classification || !Number.isSafeInteger(Number(classification.pageId))
      || !Number.isSafeInteger(Number(classification.revisionId)) || !Array.isArray(classification.categories)) {
    throw new Error('Buff page classification evidence is invalid');
  }
  const source = record.sourceEvidence;
  if (Number(source.revisionId) !== Number(classification.revisionId)
      || String(source.pageTitle) !== String(classification.pageTitle)) {
    throw new Error('Buff page classification revision or title drifted');
  }
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function validateAlternateFactEvidence(source) {
  const composition = source.immuneNpcPositiveEvidence;
  const directInflicting = source.inflictingNpcPositiveEvidence;
  const directImmune = source.completeImmuneNpcEvidence
    ?? (composition && ['positive-assertions-only', 'complete-npc-scope', 'complete-expanded-npc-scope'].includes(composition.status)
      && Array.isArray(composition.assertions) ? composition : null);
  if (!composition && !directInflicting && !directImmune) return null;

  const inflicting = ignoreUnavailableAlternate(composition?.inflictingNpcPositiveEvidence ?? directInflicting ?? null, 'facts');
  const immune = ignoreUnavailableAlternate(composition?.immuneNpcPositiveEvidence ?? directImmune ?? null, 'assertions');
  if (inflicting != null) {
    if (![ 'positive-infliction-facts-only', COMPLETE_INFLICTING_STATUS ].includes(inflicting.status)
        || !Array.isArray(inflicting.facts)
        || inflicting.facts.some(fact => fact?.relationType !== 'inflicts')) {
      throw new Error('partial Buff alternate infliction evidence is invalid');
    }
  }
  if (immune != null) {
    if (!['positive-assertions-only', 'complete-npc-scope', 'complete-expanded-npc-scope'].includes(immune.status)
        || !Array.isArray(immune.assertions)) {
      throw new Error('partial Buff alternate immunity evidence is invalid');
    }
  }
  return {
    schemaVersion: 'buff-directional-positive-evidence/v1',
    executableReplacement: false,
    completeReplacementGroups: [
      ...(['complete-npc-scope', 'complete-expanded-npc-scope'].includes(immune?.status) ? ['immuneNpcs'] : []),
      ...(inflicting?.status === COMPLETE_INFLICTING_STATUS ? ['inflictingNpcs'] : []),
    ],
    inflictingNpcPositiveEvidence: inflicting,
    immuneNpcPositiveEvidence: immune,
    reviewBlocker: 'partial-fact-contract-review-required',
  };
}

function ignoreUnavailableAlternate(value, rowsKey) {
  if (value?.status === 'unavailable' && value.source == null
      && Array.isArray(value[rowsKey]) && value[rowsKey].length === 0) {
    return null;
  }
  return value;
}
