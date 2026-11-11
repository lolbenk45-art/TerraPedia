import { createHash } from 'node:crypto';

import { extractNpcInfoboxFieldSets } from '../crawler/src/domains/npc-parser.mjs';

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SCHEMA_VERSION = 'buff-npc-variant-empty-scope-evidence/v1';

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

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

function normalizeAutoId(value) {
  return String(value ?? '').replace(/<!--[\s\S]*?-->/g, '').trim();
}

function normalizePages(pages, rawPages) {
  if (!Array.isArray(pages) || pages.length === 0 || !Array.isArray(rawPages) || rawPages.length === 0) {
    throw new Error('NPC variant evidence pages are incomplete');
  }
  const rawByPath = new Map();
  for (const entry of rawPages) {
    const path = String(entry?.path ?? '').trim();
    if (!path || rawByPath.has(path) || !Buffer.isBuffer(entry.bytes)) {
      throw new Error('NPC variant raw page paths are invalid');
    }
    rawByPath.set(path, entry);
  }
  const byTargetTitle = new Map();
  const byResolvedTitle = new Map();
  for (const page of pages) {
    const targetPageTitle = String(page?.targetPageTitle ?? '').trim();
    if (!targetPageTitle || byTargetTitle.has(targetPageTitle) || !String(page.path ?? '').trim()) {
      throw new Error('NPC variant page manifest identity is invalid');
    }
    const rawEntry = rawByPath.get(String(page.path));
    if (!rawEntry) throw new Error('NPC variant raw page is missing');
    const actualHash = hash(rawEntry.bytes);
    if (page.sha256 !== actualHash) throw new Error('NPC variant raw page hash drifted');
    assertHash(page.sha256, 'NPC variant raw page hash');
    const normalized = { descriptor: page, rawEntry, actualHash };
    byTargetTitle.set(targetPageTitle, normalized);
    const resolvedTitle = String(page.resolvedPageTitle ?? page.pageTitle ?? '').trim();
    const resolvedEntries = byResolvedTitle.get(resolvedTitle) ?? [];
    resolvedEntries.push(normalized);
    byResolvedTitle.set(resolvedTitle, resolvedEntries);
  }
  return { byTargetTitle, byResolvedTitle, rawByPath };
}

function normalizeTargets(targets) {
  const rows = Array.isArray(targets) ? targets : targets?.targets;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('NPC variant target scope is incomplete');
  const byTitle = new Map();
  const byId = new Map();
  for (const target of rows) {
    const pageTitle = String(target?.pageTitle ?? '').trim();
    if (!pageTitle || byTitle.has(pageTitle) || !Array.isArray(target.standardizedRecords)
        || target.standardizedRecords.length === 0) {
      throw new Error('NPC variant target identity is invalid');
    }
    for (const record of target.standardizedRecords) {
      assertIdentity(record, 'NPC variant target');
      if (byId.has(record.id)) throw new Error('duplicate stable NPC ID');
      byId.set(record.id, { ...record, pageTitle });
    }
    byTitle.set(pageTitle, target);
  }
  return { byTitle, byId };
}

function expectedHashFor(expectedSourceHashes, id) {
  if (expectedSourceHashes instanceof Map) return expectedSourceHashes.get(id) ?? expectedSourceHashes.get(String(id));
  if (expectedSourceHashes && typeof expectedSourceHashes === 'object') {
    return expectedSourceHashes[id] ?? expectedSourceHashes[String(id)];
  }
  return undefined;
}

function parseRawPage(rawEntry, descriptor) {
  let page;
  try {
    page = JSON.parse(rawEntry.bytes.toString('utf8'));
  } catch (error) {
    throw new Error('NPC variant raw page JSON is invalid', { cause: error });
  }
  const resolvedTitle = String(descriptor.resolvedPageTitle ?? descriptor.pageTitle ?? '').trim();
  const requestedTitle = String(descriptor.rawRequestedPageTitle ?? descriptor.requestedPageTitle ?? '').trim();
  if (!resolvedTitle || !requestedTitle || page.pageTitle !== resolvedTitle
      || page.requestedPageTitle !== requestedTitle || page.pageId !== descriptor.pageId
      || page.revisionId !== descriptor.revisionId || page.revisionTimestamp !== descriptor.revisionTimestamp
      || !Number.isSafeInteger(page.pageId) || page.pageId <= 0
      || !Number.isSafeInteger(page.revisionId) || page.revisionId <= 0
      || !Number.isFinite(Date.parse(page.revisionTimestamp))
      || typeof page.wikitext !== 'string' || !page.wikitext.trim()) {
    throw new Error('NPC variant revision binding is invalid');
  }
  return page;
}

function buildPageWideDiagnostics(fieldSets) {
  return {
    positiveOwners: fieldSets.flatMap(fieldSet => {
      const debuffFieldNames = fieldSet.fieldNames.filter(name => /^debuff\d*$/i.test(name));
      const rawDebuffValues = debuffFieldNames
        .map(fieldName => String(fieldSet.fields[fieldName] ?? '').trim())
        .filter(Boolean);
      if (rawDebuffValues.length === 0) return [];
      return [{
        autoId: fieldSet.source.autoId,
        debuffFieldNames,
        rawDebuffValues,
      }];
    }),
  };
}

function buildRejectedRow(gap, source, reason) {
  return {
    id: gap.npcSourceId,
    internalName: gap.npcInternalName,
    npcSourceId: gap.npcSourceId,
    npcInternalName: gap.npcInternalName,
    source: source ? clone(source) : null,
    reason,
  };
}

export function buildBuffNpcVariantEmptyScopeEvidence({
  pages,
  rawPages,
  targets,
  gapRecords,
  expectedSourceHashes,
  captureSha256,
} = {}) {
  assertHash(captureSha256, 'NPC variant capture');
  const normalizedPages = normalizePages(pages, rawPages);
  const normalizedTargets = normalizeTargets(targets);
  if (!Array.isArray(gapRecords) || gapRecords.length === 0) {
    throw new Error('NPC variant scope gaps are required');
  }
  const seenGapIds = new Set();
  const rows = [];
  const rejections = [];
  for (const gap of gapRecords) {
    if (!Number.isSafeInteger(gap?.npcSourceId) || gap.npcSourceId === 0
        || typeof gap.npcInternalName !== 'string' || !gap.npcInternalName.trim()) {
      throw new Error('NPC variant gap identity is invalid');
    }
    if (seenGapIds.has(gap.npcSourceId)) throw new Error('duplicate NPC variant gap identity');
    seenGapIds.add(gap.npcSourceId);
    const target = normalizedTargets.byId.get(gap.npcSourceId);
    if (!target || target.internalName !== gap.npcInternalName) {
      throw new Error('NPC variant target identity drifted');
    }
    const pageEntry = normalizedPages.byTargetTitle.get(target.pageTitle)
      ?? normalizedPages.byResolvedTitle.get(String(gap.sourcePage ?? '').trim())?.[0];
    if (!pageEntry) throw new Error(`NPC variant source page is missing: ${gap.npcSourceId}`);
    const { descriptor, rawEntry, actualHash } = pageEntry;
    const expectedHash = expectedHashFor(expectedSourceHashes, gap.npcSourceId);
    if (!expectedHash || expectedHash !== actualHash || gap.sourceRawSha256 !== actualHash) {
      throw new Error(`NPC variant raw hash drifted: ${gap.npcSourceId}`);
    }
    if (gap.sourceRevisionId !== descriptor.revisionId) {
      throw new Error(`NPC variant revision drifted: ${gap.npcSourceId}`);
    }
    const page = parseRawPage(rawEntry, descriptor);
    if (page.pageTitle !== String(gap.sourcePage ?? '').trim()) {
      throw new Error(`NPC variant source page drifted: ${gap.npcSourceId}`);
    }
    const fieldSets = extractNpcInfoboxFieldSets(page.wikitext);
    const autoMatches = fieldSets.filter(fieldSet => normalizeAutoId(fieldSet.fields.auto) === String(gap.npcSourceId));
    const source = {
      provider: 'terraria.wiki.gg',
      pageTitle: page.pageTitle,
      pageId: page.pageId,
      revisionId: page.revisionId,
      revisionTimestamp: page.revisionTimestamp,
      rawSha256: actualHash,
      captureSha256,
    };
    const diagnostics = buildPageWideDiagnostics(fieldSets);
    if (autoMatches.length === 0) {
      rejections.push(buildRejectedRow(gap, source, 'target-infobox-missing'));
      continue;
    }
    if (autoMatches.length > 1) {
      const signatures = new Set(autoMatches.map(match => JSON.stringify(
        Object.fromEntries(Object.keys(match.fields).sort().map(key => [key, match.fields[key]])),
      )));
      if (signatures.size !== autoMatches.length) {
        rejections.push(buildRejectedRow(gap, source, 'duplicate-target-infobox'));
        continue;
      }
    }
    if (autoMatches.length === 0) {
      rejections.push(buildRejectedRow(gap, source, 'target-infobox-missing'));
      continue;
    }
    if (autoMatches.some(match => !match.closed || !match.fieldNames.length || !match.fieldNames.includes('auto'))) {
      rejections.push(buildRejectedRow(gap, source, 'target-infobox-incomplete'));
      continue;
    }
    const targetInfoboxes = autoMatches.map(targetInfobox => ({
      autoId: normalizeAutoId(targetInfobox.fields.auto),
      fields: clone(targetInfobox.fields),
      fieldNames: [...targetInfobox.fieldNames],
      debuffFieldNames: targetInfobox.fieldNames.filter(name => /^debuff\d*$/i.test(name)),
    }));
    if (targetInfoboxes.some(targetInfobox => targetInfobox.debuffFieldNames.length > 0)) {
      rejections.push(buildRejectedRow(gap, source, 'target-debuff-fields-present'));
      continue;
    }
    const row = {
      id: gap.npcSourceId,
      internalName: gap.npcInternalName,
      npcSourceId: gap.npcSourceId,
      npcInternalName: gap.npcInternalName,
      completeness: 'complete-exhaustive-npc-page-scope',
      facts: [],
      source,
      identity: { npcSourceId: gap.npcSourceId, npcInternalName: gap.npcInternalName },
      pageWideDiagnostics: diagnostics,
    };
    if (targetInfoboxes.length === 1) {
      row.targetInfobox = targetInfoboxes[0];
    } else {
      row.targetInfoboxes = targetInfoboxes;
      row.selection = 'all-matching-stable-id-blocks';
    }
    rows.push(row);
  }
  rows.sort((left, right) => left.id - right.id);
  rejections.sort((left, right) => left.id - right.id);
  return {
    schemaVersion: SCHEMA_VERSION,
    databaseWrites: false,
    networkRequests: 0,
    executable: false,
    applyAllowed: false,
    source: {
      captureSha256,
      pageCount: normalizedPages.byTargetTitle.size,
      gapCount: gapRecords.length,
      completeEmptyCount: rows.length,
      rejectedCount: rejections.length,
    },
    rows,
    rejections,
  };
}

export const buffNpcVariantEmptyScopeEvidenceSchema = SCHEMA_VERSION;
