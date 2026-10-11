const POSITIVE_ONLY = 'positive-assertions-only';
const COMPLETE_NPC_SCOPE = 'complete-exhaustive-npc-scope';
const COMPLETE_EXPANDED_NPC_SCOPE = 'complete-expanded-npc-scope';
const COMPLETE_NPC_PAGE_SCOPE = 'complete-exhaustive-npc-page-scope';
const COMPLETE_NPC_STATUSES = new Set([COMPLETE_NPC_SCOPE, COMPLETE_EXPANDED_NPC_SCOPE]);

function requiredBuffId(value) {
  if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
    throw new Error('Buff identity is invalid');
  }
  return Number(value);
}

function normalizedLabel(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.normalize('NFKC').replaceAll('_', ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function pageIdentity(row) {
  const value = row?.pageTitle ?? row?.internalName ?? row?.name;
  if (typeof value !== 'string' || !value.trim()) throw new Error('page immunity identity is missing');
  return value.trim();
}

function pageLabels(row) {
  return [row?.pageTitle, row?.name]
    .map(normalizedLabel)
    .filter(Boolean);
}

function validatePageEvidence({ pageEvidence, buffId }) {
  if (!pageEvidence) {
    return {
      status: 'unavailable',
      rows: [],
      source: null,
      labels: new Set()
    };
  }
  if (pageEvidence.buffId != null && requiredBuffId(pageEvidence.buffId) !== buffId) {
    throw new Error('page immunity evidence is outside Buff scope');
  }
  const sourceEvidence = pageEvidence.sourceEvidence;
  const status = sourceEvidence?.factGroups?.immuneNpcs?.status ?? 'unverified';
  const rows = Array.isArray(pageEvidence.immuneNpcs) ? [...pageEvidence.immuneNpcs] : [];
  const identities = rows.map(pageIdentity);
  const normalizedIdentities = identities.map(normalizedLabel);
  if (new Set(normalizedIdentities).size !== normalizedIdentities.length) {
    throw new Error('duplicate page immunity identity');
  }
  if (status === 'parsed') {
    const count = sourceEvidence?.factGroups?.immuneNpcs?.count;
    const unresolvedImmunityFacts = Array.isArray(sourceEvidence?.unresolvedFacts)
      ? sourceEvidence.unresolvedFacts.filter(fact => fact?.group === 'immuneNpcs')
      : [];
    if (unresolvedImmunityFacts.length > 0
        || !Number.isSafeInteger(count)
        || count !== rows.length
        || pageEvidence.immuneNpcCount !== rows.length) {
      throw new Error('page immunity evidence is incomplete');
    }
  } else if (rows.length > 0) {
    throw new Error('unparsed page immunity evidence contains rows');
  }
  return {
    status,
    rows,
    source: sourceEvidence ? { ...sourceEvidence, status, count: rows.length } : null,
    labels: new Set(rows.flatMap(pageLabels))
  };
}

function validateNpcinfoEvidence({ npcinfoEvidence, buffId, buffInternalName }) {
  if (!npcinfoEvidence) {
    return {
      positiveAssertions: [],
      source: null,
      labels: new Set()
    };
  }
  if (![POSITIVE_ONLY, COMPLETE_NPC_SCOPE, COMPLETE_EXPANDED_NPC_SCOPE].includes(npcinfoEvidence.completeness)) {
    throw new Error('Npcinfo evidence completeness is invalid');
  }
  const scope = npcinfoEvidence.scope?.find(row => row?.id === buffId);
  if (!scope || scope.internalName !== buffInternalName) {
    throw new Error('Npcinfo Buff identity is outside Buff scope');
  }
  if (!Array.isArray(npcinfoEvidence.assertions)) throw new Error('Npcinfo assertions are invalid');
  const scopeIds = new Set((npcinfoEvidence.scope ?? []).map(row => row?.id));
  const assertions = npcinfoEvidence.assertions.filter(assertion => {
    if (!scopeIds.has(assertion?.buffId)) throw new Error('Npcinfo assertion is outside selected scope');
    return assertion.buffId === buffId;
  }).map(assertion => {
    if (!Number.isSafeInteger(assertion?.npcId)
        || assertion.npcId === 0
        || typeof assertion.npcInternalName !== 'string'
        || !assertion.npcInternalName.trim()) {
      throw new Error('Npcinfo NPC identity is invalid');
    }
    return { ...assertion };
  });
  const ids = assertions.map(assertion => assertion.npcId);
  if (new Set(ids).size !== ids.length) throw new Error('duplicate Npcinfo NPC identity');
  if (COMPLETE_NPC_STATUSES.has(npcinfoEvidence.completeness)) {
    const reverse = npcinfoEvidence.assertionsByBuffId;
    if (!reverse || typeof reverse !== 'object' || !Array.isArray(reverse[String(buffId)])) {
      throw new Error('complete Npcinfo reverse assertions are missing');
    }
    const reverseIds = reverse[String(buffId)].map(assertion => assertion?.npcId);
    if (JSON.stringify(reverseIds) !== JSON.stringify(ids)) {
      throw new Error('complete Npcinfo reverse assertions drifted');
    }
  }
  const source = npcinfoEvidence.source;
  const sourceBoundAssertions = assertions.map(assertion => ({
    ...assertion,
    sourceRevisionId: source?.revisionId ?? null,
  }));
  return {
    positiveAssertions: sourceBoundAssertions,
    completeness: npcinfoEvidence.completeness,
    source: { ...npcinfoEvidence.source,
      status: npcinfoEvidence.completeness === COMPLETE_EXPANDED_NPC_SCOPE
        ? COMPLETE_EXPANDED_NPC_SCOPE
        : npcinfoEvidence.completeness === COMPLETE_NPC_SCOPE
          ? 'complete-npc-scope'
          : POSITIVE_ONLY,
      assertionCount: sourceBoundAssertions.length,
      ...(npcinfoEvidence.semanticExpansion
        ? { semanticExpansion: npcinfoEvidence.semanticExpansion }
        : {}) },
    labels: new Set(assertions.map(assertion => normalizedLabel(assertion.npcName)).filter(Boolean))
  };
}

function validateInflictionEvidence({ inflictionEvidence, buffId, buffInternalName }) {
  if (!inflictionEvidence) {
    return { facts: [], source: null, status: 'unavailable' };
  }
  if (![ 'positive-infliction-facts-only', COMPLETE_NPC_PAGE_SCOPE ].includes(inflictionEvidence.completeness)) {
    throw new Error('NPC infliction evidence completeness is invalid');
  }
  const complete = inflictionEvidence.completeness === COMPLETE_NPC_PAGE_SCOPE;
  if (!Array.isArray(inflictionEvidence.facts) || (!complete && inflictionEvidence.facts.length === 0)) {
    throw new Error('NPC infliction evidence facts are missing');
  }
  const source = inflictionEvidence.source;
  const validPositiveSource = source && source.provider === 'terraria.wiki.gg'
      && typeof source.pageTitle === 'string' && source.pageTitle.trim()
      && Number.isSafeInteger(source.pageId) && source.pageId > 0
      && Number.isSafeInteger(source.revisionId) && source.revisionId > 0
      && typeof source.revisionTimestamp === 'string'
      && Number.isFinite(Date.parse(source.revisionTimestamp));
  const validCompleteSource = source && source.provider === 'terraria.wiki.gg'
      && /^sha256:[a-f0-9]{64}$/.test(String(source.inputSha256 ?? ''))
      && /^sha256:[a-f0-9]{64}$/.test(String(source.targetsSha256 ?? ''))
      && Number.isSafeInteger(source.pageCount) && source.pageCount > 0
      && Number.isSafeInteger(source.npcCount) && source.npcCount > 0
      && Array.isArray(source.factSources) && source.factSources.length > 0
      && source.scopeCompleteness === 'all-npc-page-targets';
  if ((!complete && !validPositiveSource) || (complete && !validCompleteSource)) {
    throw new Error('NPC infliction evidence source identity is invalid');
  }
  const wrapperIdentity = sourceIdentityKey(source);
  const declaredFactSources = new Set();
  if (source.factSources !== undefined) {
    if (!Array.isArray(source.factSources) || source.factSources.length === 0) {
      throw new Error('NPC infliction evidence source descriptors are invalid');
    }
    for (const descriptor of source.factSources) {
      const key = complete ? sourceIdentityKeyWithRaw(descriptor) : sourceIdentityKey(descriptor);
      if (!key || declaredFactSources.has(key)) {
        throw new Error('NPC infliction evidence source descriptor is invalid');
      }
      declaredFactSources.add(key);
    }
  }
  const facts = inflictionEvidence.facts.map(fact => {
    if (fact?.relationType !== 'inflicts') throw new Error('NPC infliction relation direction is invalid');
    if (!Number.isSafeInteger(fact.npcSourceId) || fact.npcSourceId === 0
        || typeof fact.npcInternalName !== 'string' || !fact.npcInternalName.trim()
      || Number(fact.buffId) !== buffId || fact.buffInternalName !== buffInternalName) {
      throw new Error('NPC infliction evidence identity is invalid');
    }
    const factIdentity = sourceIdentityKey({
      pageTitle: fact.sourcePage ?? source.pageTitle,
      pageId: fact.sourcePageId ?? source.pageId,
      revisionId: fact.sourceRevisionId ?? source.revisionId,
      revisionTimestamp: fact.sourceRevisionTimestamp ?? source.revisionTimestamp,
    });
    const declaredFactIdentity = complete
      ? sourceIdentityKeyWithRaw({
        pageTitle: fact.sourcePage ?? source.pageTitle,
        pageId: fact.sourcePageId ?? source.pageId,
        revisionId: fact.sourceRevisionId ?? source.revisionId,
        revisionTimestamp: fact.sourceRevisionTimestamp ?? source.revisionTimestamp,
        rawSha256: fact.sourceRawSha256,
      })
      : factIdentity;
    if (!factIdentity || (declaredFactSources.size > 0
      ? !declaredFactSources.has(declaredFactIdentity)
      : factIdentity !== wrapperIdentity)) {
      throw new Error('NPC infliction evidence provenance is invalid');
    }
    if (complete && !declaredFactIdentity) throw new Error('NPC infliction evidence provenance is invalid');
    return {
      ...fact,
      sourcePage: fact.sourcePage ?? source.pageTitle,
      sourcePageId: fact.sourcePageId ?? source.pageId,
      sourceRevisionId: fact.sourceRevisionId ?? source.revisionId,
      sourceRevisionTimestamp: fact.sourceRevisionTimestamp ?? source.revisionTimestamp,
    };
  });
  const identities = facts.map(fact => `${fact.npcSourceId}:${fact.buffId}`);
  if (new Set(identities).size !== identities.length) throw new Error('duplicate NPC infliction fact');
  return { facts, source: { ...source, status: inflictionEvidence.completeness }, status: inflictionEvidence.completeness };
}

function sourceIdentityKey(source = {}) {
  const pageTitle = String(source.pageTitle ?? '').trim();
  const pageId = Number(source.pageId);
  const revisionId = Number(source.revisionId);
  const revisionTimestamp = String(source.revisionTimestamp ?? '').trim();
  if (!pageTitle || !Number.isSafeInteger(pageId) || pageId <= 0
      || !Number.isSafeInteger(revisionId) || revisionId <= 0
      || !revisionTimestamp || !Number.isFinite(Date.parse(revisionTimestamp))) {
    return '';
  }
  return `${pageTitle}\u0000${pageId}\u0000${revisionId}\u0000${revisionTimestamp}`;
}

function sourceIdentityKeyWithRaw(source = {}) {
  const key = sourceIdentityKey(source);
  const rawSha256 = String(source.rawSha256 ?? source.sourceRawSha256 ?? '').trim();
  if (!key || !/^sha256:[a-f0-9]{64}$/.test(rawSha256)) return '';
  return `${key}\u0000${rawSha256}`;
}

export function composeBuffImmunitySourceEvidence({
  buffId,
  buffInternalName,
  pageEvidence = null,
  npcinfoEvidence = null,
  inflictionEvidence = null
} = {}) {
  const id = requiredBuffId(buffId);
  if (typeof buffInternalName !== 'string' || !buffInternalName.trim()) {
    throw new Error('Buff internal name is invalid');
  }
  const page = validatePageEvidence({ pageEvidence, buffId: id });
  const npcinfo = validateNpcinfoEvidence({ npcinfoEvidence, buffId: id, buffInternalName });
  const inflictions = validateInflictionEvidence({ inflictionEvidence, buffId: id, buffInternalName });
  if (page.status === 'unavailable' && npcinfo.source == null) {
    throw new Error('no Buff immunity evidence is available');
  }
  const pageCount = page.status === 'parsed' ? page.rows.length : null;
  const npcinfoCount = npcinfo.positiveAssertions.length;
  const countDelta = pageCount == null ? null : pageCount - npcinfoCount;
  const exactDisplayLabelOverlapCount = [...page.labels].filter(label => npcinfo.labels.has(label)).length;
  const immuneNpcPositiveEvidence = {
    status: npcinfo.source?.status ?? 'unavailable',
    assertions: npcinfo.positiveAssertions,
    source: npcinfo.source
  };
  const inflictingNpcPositiveEvidence = {
    status: inflictions.status,
    facts: inflictions.facts,
    source: inflictions.source
  };
  return {
    status: 'positive_sources_only',
    buffId: id,
    buffInternalName,
    page: { status: page.status, rows: page.rows },
    npcinfo: {
      status: npcinfo.source?.status ?? 'unavailable',
      positiveAssertions: npcinfo.positiveAssertions
    },
    inflictingNpcPositiveEvidence,
    immuneNpcPositiveEvidence,
    sources: {
      page: page.source,
      npcinfo: npcinfo.source
    },
    reconciliation: {
      pageCount,
      npcinfoCount,
      countDelta,
      countDrift: countDelta == null ? null : countDelta !== 0,
      exactDisplayLabelOverlapCount,
      identityBinding: 'unbound_across_sources',
      inflictingNpcCount: inflictions.facts.length,
      directionalCountDrift: null
    }
  };
}
