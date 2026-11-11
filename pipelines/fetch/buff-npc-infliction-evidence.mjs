import { createHash } from 'node:crypto';
import { extractNpcInfobox } from '../crawler/src/domains/npc-parser.mjs';
import {
  extractBuffNpcPageInflictionEvidence,
  isNpcInflictionOwnedByIdentity,
  resolveNpcInfoboxIdentity,
} from './buff-npc-page-evidence.mjs';
import { runCaptureBuffPageEvidence } from './capture-buff-page-evidence.mjs';

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const ALLOWED_EXCLUSION_REASONS = new Set([
  'placeholder_or_internal_test_helper_no_loot',
  'no_dedicated_page_source_variant',
]);

export { runCaptureBuffPageEvidence };

export function verifyBuffNpcPageInflictionCapture({ inputBytes, targetsBytes, manifestBytes, standardizedBytes, rawPages } = {}) {
  if (![inputBytes, targetsBytes, manifestBytes, standardizedBytes].every(Buffer.isBuffer) || !Array.isArray(rawPages)) {
    throw new Error('NPC page capture bytes are required');
  }
  const input = parseJson(inputBytes, 'input');
  const targetsPayload = parseJson(targetsBytes, 'targets');
  const manifest = parseJson(manifestBytes, 'manifest');
  if (manifest.schemaVersion !== 'buff-npc-page-infliction-raw-capture/v1'
      || manifest.sourceKind !== 'npc-page-inflictions'
      || manifest.status !== 'completed'
      || manifest.scopeCompleteness !== 'all-npc-page-targets') {
    throw new Error('NPC page capture manifest contract is invalid');
  }
  if (manifest.input?.sha256 !== hash(inputBytes)) throw new Error('NPC page capture input hash drifted');
  if (manifest.targets?.sha256 !== hash(targetsBytes)) throw new Error('NPC page capture target hash drifted');
  if (targetsPayload.sourceSha256 !== hash(standardizedBytes)) throw new Error('NPC target source hash drifted');

  const buffs = input.buffs ?? input.records;
  if (!Array.isArray(buffs) || buffs.length === 0 || buffs.length > 1000) throw new Error('NPC page Buff scope is invalid');
  const buffIds = buffs.map(buff => buff?.id);
  if (buffIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(buffIds).size !== buffIds.length) {
    throw new Error('NPC page Buff scope identity is invalid');
  }
  const buffScope = buffs.map(buff => ({
    id: buff.id,
    internalName: buff.internalName,
    englishName: buff.englishName ?? buff.name,
    name: buff.name,
  }));
  const targets = targetsPayload?.targets;
  if (!Array.isArray(targets) || targets.length === 0
      || targetsPayload.scope !== 'all-standardized-npc-page-targets'
      || !Number.isSafeInteger(targetsPayload.totalTargets)
      || targetsPayload.totalTargets !== targets.length
      || manifest.targets?.scope !== targetsPayload.scope
      || manifest.targets?.totalTargets !== targetsPayload.totalTargets
      || manifest.targets?.pageCount !== targets.length) {
    throw new Error('NPC page target scope is incomplete');
  }
  const targetByTitle = new Map();
  const expectedNpcIds = new Set();
  for (const target of targets) {
    const pageTitle = String(target?.pageTitle ?? '').trim();
    const rows = target?.standardizedRecords;
    if (!pageTitle || targetByTitle.has(pageTitle) || !Array.isArray(rows) || rows.length === 0) {
      throw new Error('NPC page target identity is invalid');
    }
    for (const row of rows) {
      if (!Number.isSafeInteger(row?.id) || row.id === 0 || typeof row.internalName !== 'string' || !row.internalName.trim()) {
        throw new Error('NPC target NPC identity is invalid');
      }
      if (expectedNpcIds.has(row.id)) throw new Error('NPC target NPC identity is duplicated');
      expectedNpcIds.add(row.id);
    }
    targetByTitle.set(pageTitle, target);
  }
  const excludedNpcRecords = Array.isArray(targetsPayload.excludedNpcRecords)
    ? targetsPayload.excludedNpcRecords : [];
  const excludedNpcIds = new Set();
  for (const record of excludedNpcRecords) {
    if (!Number.isSafeInteger(record?.id)
        || typeof record.internalName !== 'string' || !record.internalName.trim()
        || record.exclusionStatus !== 'missing-dedicated-page'
        || !ALLOWED_EXCLUSION_REASONS.has(record.exclusionReason)
        || excludedNpcIds.has(record.id) || expectedNpcIds.has(record.id)) {
      throw new Error('NPC page exclusion identity is invalid');
    }
    excludedNpcIds.add(record.id);
  }
  if (targetsPayload.totalNpcRecords !== undefined
      && (!Number.isSafeInteger(targetsPayload.totalNpcRecords)
        || targetsPayload.totalNpcRecords !== expectedNpcIds.size + excludedNpcIds.size)) {
    throw new Error('NPC page target record scope is incomplete');
  }
  if (targetsPayload.pageNpcRecords !== undefined
      && (!Number.isSafeInteger(targetsPayload.pageNpcRecords) || targetsPayload.pageNpcRecords !== expectedNpcIds.size)) {
    throw new Error('NPC page target page-record scope is incomplete');
  }
  if (!Array.isArray(manifest.pages) || manifest.pages.length !== targets.length
      || rawPages.length === 0 || rawPages.length > targets.length) {
    throw new Error('NPC page capture page scope is incomplete');
  }

  const rawByPath = new Map(rawPages.map(entry => [String(entry?.path ?? ''), entry]));
  if (rawByPath.size !== rawPages.length || [...rawByPath.keys()].some(path => !path)) {
    throw new Error('NPC raw page paths are invalid');
  }
  const facts = [];
  const seenFacts = new Set();
  const seenTargetTitles = new Set();
  const referencedPaths = new Set();
  const unresolvedNpcSourceIds = new Set();
  const scopeGaps = [];
  for (const entry of manifest.pages) {
    const targetTitle = String(entry?.targetPageTitle ?? '').trim();
    const requestedTitle = String(entry?.requestedPageTitle ?? '').trim();
    const resolvedTitle = String(entry?.resolvedPageTitle ?? entry?.pageTitle ?? '').trim();
    const target = targetByTitle.get(targetTitle);
    if (!target || requestedTitle !== targetTitle || seenTargetTitles.has(targetTitle)
        || entry.targetPageTitle !== targetTitle || !resolvedTitle || entry.sha256 == null) {
      throw new Error('NPC page target binding is invalid');
    }
    seenTargetTitles.add(targetTitle);
    const rawEntry = rawByPath.get(String(entry.path));
    if (!rawEntry || !Buffer.isBuffer(rawEntry.bytes)) throw new Error('NPC raw page bytes are missing');
    if (entry.sha256 !== hash(rawEntry.bytes)) throw new Error('NPC raw page hash drifted');
    referencedPaths.add(String(entry.path));
    const page = parseJson(rawEntry.bytes, 'NPC raw page');
    const rawRequestedTitle = String(entry.rawRequestedPageTitle ?? targetTitle).trim();
    if (!rawRequestedTitle || page.pageTitle !== resolvedTitle || page.requestedPageTitle !== rawRequestedTitle
        || page.pageId !== entry.pageId || page.revisionId !== entry.revisionId
        || page.revisionTimestamp !== entry.revisionTimestamp
        || !Number.isSafeInteger(page.pageId) || page.pageId <= 0
        || !Number.isSafeInteger(page.revisionId) || page.revisionId <= 0
        || !Number.isFinite(Date.parse(page.revisionTimestamp))
        || typeof page.wikitext !== 'string' || !page.wikitext.trim()) {
      throw new Error('NPC page revision binding is invalid');
    }
    const pageInflictions = extractNpcInfobox(page.wikitext).buffInflictions;
    for (const npc of target.standardizedRecords) {
      let identity;
      try {
        identity = resolveNpcInfoboxIdentity({
          revisionText: page.wikitext,
          expectedPageTitle: targetTitle,
          npcSourceId: npc.id,
          npcInternalName: npc.internalName,
          npcName: npc.name ?? targetTitle,
        });
      } catch {
        throw new Error('NPC identity is invalid');
      }
      const pagePayload = { ...page, requestedPageTitle: targetTitle };
      const inflictionNames = pageInflictions
        .filter(row => isNpcInflictionOwnedByIdentity(row, identity));
      if (inflictionNames.length === 0) {
        if (pageInflictions.length > 0) {
          unresolvedNpcSourceIds.add(npc.id);
          scopeGaps.push({ npcSourceId: npc.id, npcInternalName: npc.internalName,
            sourcePage: page.pageTitle, sourceRevisionId: page.revisionId,
            sourceRawSha256: entry.sha256, reason: 'shared-page-infliction-scope-unverified' });
        }
        continue;
      }
      const positive = extractBuffNpcPageInflictionEvidence({
        pagePayload,
        expectedPageTitle: targetTitle,
        npcSourceId: npc.id,
        npcInternalName: npc.internalName,
        npcName: npc.name ?? targetTitle,
        buffScope,
      });
      for (const fact of positive.facts) {
        const key = `${fact.npcSourceId}:${fact.buffId}`;
        if (seenFacts.has(key)) throw new Error('duplicate NPC infliction fact');
        seenFacts.add(key);
        facts.push({ ...fact, sourceRawSha256: entry.sha256 });
      }
    }
  }
  if (seenTargetTitles.size !== targets.length || referencedPaths.size !== rawPages.length) {
    throw new Error('NPC page target coverage is incomplete');
  }
  facts.sort((left, right) => left.buffId - right.buffId || left.npcSourceId - right.npcSourceId);
  const factsByBuffId = Object.fromEntries(buffIds.map(id => [String(id), []]));
  for (const fact of facts) factsByBuffId[String(fact.buffId)]?.push(fact);
  const completeness = excludedNpcIds.size > 0 && unresolvedNpcSourceIds.size > 0
    ? 'complete-exhaustive-npc-page-scope-with-exclusions-and-unresolved-variants'
    : excludedNpcIds.size > 0
      ? 'complete-exhaustive-npc-page-scope-with-exclusions'
      : unresolvedNpcSourceIds.size > 0
        ? 'complete-exhaustive-npc-page-scope-with-unresolved-variants'
        : 'complete-exhaustive-npc-page-scope';
  return {
    schemaVersion: 'buff-npc-page-infliction-evidence/v1',
    completeness,
    source: {
      provider: 'terraria.wiki.gg',
      inputSha256: hash(inputBytes),
      targetsSha256: hash(targetsBytes),
      pageCount: targets.length,
      npcCount: expectedNpcIds.size,
      totalNpcCount: expectedNpcIds.size + excludedNpcIds.size,
      excludedNpcCount: excludedNpcIds.size,
      excludedNpcSourceIds: [...excludedNpcIds].sort((left, right) => left - right),
      unresolvedNpcSourceIds: [...unresolvedNpcSourceIds].sort((left, right) => left - right),
      factSources: [...new Map(manifest.pages.map(entry => [
        `${entry.resolvedPageTitle ?? entry.pageTitle}\u0000${entry.pageId}\u0000${entry.revisionId}\u0000${entry.revisionTimestamp}\u0000${entry.sha256}`,
        { pageTitle: entry.resolvedPageTitle ?? entry.pageTitle, pageId: entry.pageId, revisionId: entry.revisionId,
          revisionTimestamp: entry.revisionTimestamp, rawSha256: entry.sha256 },
      ])).values()],
      scopeCompleteness: manifest.scopeCompleteness,
    },
    facts,
    factsByBuffId,
    scopeGaps,
  };
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} JSON is invalid`, { cause: error });
  }
}
