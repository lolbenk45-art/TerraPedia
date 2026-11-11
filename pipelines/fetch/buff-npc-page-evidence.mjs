import {
  extractNpcInfobox,
  extractNpcSourceInfoboxes
} from '../crawler/src/domains/npc-parser.mjs';

function requiredPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} identity is invalid`);
  }
  return value;
}

function requiredNpcSourceId(value) {
  if (!Number.isSafeInteger(value) || value === 0) {
    throw new Error('NPC identity is invalid');
  }
  return value;
}

function normalizeIdentity(value) {
  return String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .normalize('NFKC')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
    .toLowerCase();
}

function requirePageIdentity(pagePayload, expectedPageTitle) {
  if (!pagePayload || typeof pagePayload !== 'object') {
    throw new Error('NPC page payload is required');
  }
  const requestedPageTitle = pagePayload.requestedPageTitle ?? pagePayload.pageTitle;
  if (typeof expectedPageTitle !== 'string' || !expectedPageTitle.trim()
      || requestedPageTitle !== expectedPageTitle
      || typeof pagePayload.pageTitle !== 'string' || !pagePayload.pageTitle.trim()) {
    throw new Error('NPC page identity is invalid');
  }
  const pageId = requiredPositiveInteger(pagePayload.pageId, 'NPC page');
  const revisionId = requiredPositiveInteger(pagePayload.revisionId, 'NPC page revision');
  if (typeof pagePayload.revisionTimestamp !== 'string'
      || !pagePayload.revisionTimestamp.trim()
      || !Number.isFinite(Date.parse(pagePayload.revisionTimestamp))) {
    throw new Error('NPC page revision timestamp is invalid');
  }
  if (typeof pagePayload.wikitext !== 'string' || !pagePayload.wikitext.trim()) {
    throw new Error('NPC page wikitext is missing');
  }
  return { pageId, revisionId };
}

export function resolveNpcInfoboxIdentity({
  revisionText,
  expectedPageTitle,
  npcSourceId,
  npcInternalName,
  npcName = null,
} = {}) {
  const sourceId = requiredNpcSourceId(npcSourceId);
  if (typeof npcInternalName !== 'string' || !npcInternalName.trim()) {
    throw new Error('NPC identity is invalid');
  }
  const sources = extractNpcSourceInfoboxes(revisionText);
  const autoMatches = sources.filter(source => source.autoId === String(sourceId));
  const expectedLabels = new Set([
    normalizeIdentity(expectedPageTitle),
    normalizeIdentity(npcName),
    normalizeIdentity(npcInternalName),
  ].filter(Boolean));
  const unkeyed = sources.filter(source => !source.autoId);
  const namedMatches = unkeyed.filter(source => expectedLabels.has(normalizeIdentity(source.name)));
  if (autoMatches.length > 0 && unkeyed.length === 1 && namedMatches.length === 1) {
    return {
      sourceId,
      matchedBy: 'auto-and-unkeyed-named',
      source: autoMatches[0],
      unkeyedSource: namedMatches[0],
    };
  }
  if (autoMatches.length > 0) {
    return { sourceId, matchedBy: 'auto', source: autoMatches[0] };
  }
  if (unkeyed.length !== 1 || namedMatches.length !== 1) {
    throw new Error('NPC identity is invalid');
  }
  return { sourceId, matchedBy: 'unkeyed-named', source: namedMatches[0] };
}

export function isNpcInflictionOwnedByIdentity(infliction, identity) {
  const source = infliction?.sourceInfobox;
  if (!source) return true;
  if (source.autoId === String(identity?.sourceId)) return true;
  return ['unkeyed-named', 'auto-and-unkeyed-named'].includes(identity?.matchedBy)
    && !source.autoId
    && normalizeIdentity(source.name) === normalizeIdentity(identity.unkeyedSource?.name ?? identity.source?.name);
}

function matchBuffIdentity(buffName, buffScope) {
  const normalized = normalizeIdentity(buffName);
  const matches = (Array.isArray(buffScope) ? buffScope : []).filter(buff => {
    if (!Number.isSafeInteger(buff?.id) || buff.id <= 0) return false;
    return [buff.internalName, buff.englishName, buff.name]
      .map(normalizeIdentity)
      .filter(Boolean)
      .includes(normalized);
  });
  if (matches.length !== 1) {
    throw new Error(`Buff identity is ${matches.length === 0 ? 'missing' : 'ambiguous'}`);
  }
  return matches[0];
}

export function extractBuffNpcPageInflictionEvidence({
  pagePayload,
  expectedPageTitle,
  npcSourceId,
  npcInternalName,
  npcName = null,
  buffScope
} = {}) {
  const { pageId, revisionId } = requirePageIdentity(pagePayload, expectedPageTitle);
  const identity = resolveNpcInfoboxIdentity({
    revisionText: pagePayload.wikitext,
    expectedPageTitle,
    npcSourceId,
    npcInternalName,
    npcName,
  });
  const { sourceId } = identity;
  const inflictions = extractNpcInfobox(pagePayload.wikitext).buffInflictions
    .filter(infliction => isNpcInflictionOwnedByIdentity(infliction, identity));
  if (!inflictions.length) {
    throw new Error('no NPC infliction facts');
  }
  const uniqueInflictions = [];
  const seenRenderedRows = new Set();
  for (const infliction of inflictions) {
    const renderedRowKey = [
      normalizeIdentity(infliction.buffName),
      infliction.sourceField ?? '',
      infliction.durationField ?? '',
    ].join('|');
    if (seenRenderedRows.has(renderedRowKey)) continue;
    seenRenderedRows.add(renderedRowKey);
    uniqueInflictions.push(infliction);
  }

  const facts = uniqueInflictions.map(infliction => {
    const buff = matchBuffIdentity(infliction.buffName, buffScope);
    return {
      relationType: 'inflicts',
      npcSourceId: sourceId,
      npcInternalName,
      npcName: npcName ?? expectedPageTitle,
      buffId: buff.id,
      buffInternalName: buff.internalName,
      buffName: infliction.buffName,
      durationText: infliction.durationText ?? '',
      sourcePage: pagePayload.pageTitle,
      sourcePageId: pageId,
      sourceRevisionId: revisionId,
      sourceRevisionTimestamp: pagePayload.revisionTimestamp,
      sourceField: infliction.sourceField
    };
  });

  const seenBuffIds = new Set();
  for (const fact of facts) {
    if (seenBuffIds.has(fact.buffId)) {
      throw new Error('duplicate Buff infliction');
    }
    seenBuffIds.add(fact.buffId);
  }

  return {
    source: {
      provider: 'terraria.wiki.gg',
      pageTitle: pagePayload.pageTitle,
      pageId,
      revisionId,
      revisionTimestamp: pagePayload.revisionTimestamp,
      npcSourceId: sourceId,
      npcInternalName,
      rawFactGroup: 'npc-page-infobox-debuff'
    },
    facts,
    completeness: 'positive-infliction-facts-only'
  };
}
