import { createHash } from 'node:crypto';
import { parseIteminfoModulePayload } from '../lib/wiki-item-utils.mjs';

const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const parse = (bytes, label) => { try { return JSON.parse(bytes.toString('utf8')); } catch { throw new Error(`${label} JSON is invalid`); } };

const ITEMINFO_SEMANTIC_PAGES = Object.freeze([
  'Module:Iteminfo/data',
  'Module:Iteminfo/doc',
  'Module:Iteminfo/datagen',
]);

function buildIteminfoScope(input, manifest) {
  const records = input.buffs ?? input.records;
  if (!Array.isArray(records) || records.length === 0 || records.length > 1000) throw new Error('Iteminfo Buff input is invalid');
  const ids = records.map(r => r?.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error('Iteminfo Buff input identity is invalid');
  if (JSON.stringify(manifest.selectedBuffIds) !== JSON.stringify(ids)) throw new Error('Iteminfo selected Buff scope drifted');
  const scope = records.map(r => {
    if (typeof r.internalName !== 'string' || !r.internalName.trim() || r.internalName !== r.internalName.trim()) throw new Error('Iteminfo Buff identity is missing');
    return { id: r.id, internalName: r.internalName };
  });
  if (new Set(scope.map(r => r.internalName)).size !== scope.length) throw new Error('Iteminfo Buff names are duplicated');
  return { ids, scope, byId: new Map(scope.map(r => [r.id, r])) };
}

function extractIteminfoAssertions({ data, scopeById, selectedIds }) {
  const assertions = [];
  const seenItems = new Set();
  for (const [itemId, item] of Object.entries(data)) {
    if (!/^\d+$/.test(itemId) || !item || typeof item !== 'object' || item.buffType == null) continue;
    if (!Number.isSafeInteger(item.buffType) || item.buffType < 0) throw new Error(`Invalid Iteminfo buffType: ${itemId}`);
    if (item.buffType === 0) continue;
    if (!/^[1-9]\d*$/.test(itemId) || !Number.isSafeInteger(Number(itemId)) || seenItems.has(Number(itemId))) throw new Error('Iteminfo item ID is invalid or duplicated');
    seenItems.add(Number(itemId));
    if (!selectedIds.has(item.buffType)) throw new Error(`Iteminfo buffType is outside selected Buff scope: ${itemId}`);
    const buff = scopeById.get(item.buffType);
    if (typeof item.internalName !== 'string' || !item.internalName.trim() || item.internalName !== item.internalName.trim()) throw new Error(`Iteminfo item identity is missing: ${itemId}`);
    if (item.buffTime != null && (!Number.isSafeInteger(item.buffTime) || item.buffTime < 0)) throw new Error('Iteminfo buff duration is invalid');
    assertions.push({ buffId: item.buffType, buffInternalName: buff.internalName, itemId: Number(itemId),
      internalName: item.internalName, name: item.name ?? null, buffTime: Number(item.buffTime ?? 0) || null });
  }
  assertions.sort((left, right) => left.buffId - right.buffId || left.itemId - right.itemId);
  return assertions;
}

export function verifyBuffIteminfoCapture({ inputBytes, rawBytes, manifestBytes } = {}) {
  if (!Buffer.isBuffer(inputBytes) || !Buffer.isBuffer(rawBytes) || !Buffer.isBuffer(manifestBytes)) throw new Error('capture bytes are required');
  const input = parse(inputBytes, 'input');
  const raw = parse(rawBytes, 'raw');
  const manifest = parse(manifestBytes, 'manifest');
  if (manifest.schemaVersion !== 'buff-page-raw-capture/v1' || manifest.sourceKind !== 'iteminfo' || manifest.status !== 'completed') throw new Error('Iteminfo manifest contract is invalid');
  if (manifest.input?.sha256 !== sha256(inputBytes)) throw new Error('Iteminfo input hash drifted');
  const { ids, scope, byId } = buildIteminfoScope(input, manifest);
  if (!Array.isArray(manifest.pages) || manifest.pages.length !== 1) throw new Error('Iteminfo capture must contain one page');
  const page = manifest.pages[0];
  if (page.pageTitle !== 'Module:Iteminfo/data' || page.requestedPageTitle !== page.pageTitle) throw new Error('Iteminfo raw page binding is invalid');
  if (page.sha256 !== sha256(rawBytes)) throw new Error('Iteminfo raw page hash drifted');
  if (raw.pageTitle !== page.pageTitle || !Number.isSafeInteger(raw.pageId) || raw.pageId < 1 || raw.revisionId !== page.revisionId
      || !Number.isSafeInteger(raw.revisionId) || raw.revisionId < 1 || typeof raw.wikitext !== 'string'
      || !Number.isFinite(Date.parse(raw.revisionTimestamp))) throw new Error('Iteminfo revision binding is invalid');
  if (JSON.stringify(page.buffIds) !== JSON.stringify(ids)) throw new Error('Iteminfo page Buff scope drifted');
  const data = parseIteminfoModulePayload(raw.wikitext);
  const assertions = extractIteminfoAssertions({ data, scopeById: byId, selectedIds: new Set(ids) });
  return { source: { provider: 'terraria.wiki.gg', pageTitle: raw.pageTitle, pageId: raw.pageId, revisionId: raw.revisionId, revisionTimestamp: raw.revisionTimestamp,
    rawSha256: sha256(rawBytes), manifestSha256: sha256(manifestBytes), inputSha256: sha256(inputBytes) }, scope,
  assertions, completeness: 'positive-assertions-only' };
}

export function verifyBuffIteminfoSemanticCapture({ inputBytes, manifestBytes, semanticCapture } = {}) {
  if (!Buffer.isBuffer(inputBytes) || !Buffer.isBuffer(manifestBytes)) throw new Error('capture bytes are required');
  const input = parse(inputBytes, 'input');
  const manifest = parse(manifestBytes, 'manifest');
  if (manifest.schemaVersion !== 'buff-semantic-raw-capture/v1'
      || manifest.sourceKind !== 'iteminfo-semantics' || manifest.status !== 'completed') {
    throw new Error('Iteminfo semantic manifest contract is invalid');
  }
  if (manifest.input?.sha256 !== sha256(inputBytes)) throw new Error('Iteminfo input hash drifted');
  const { ids, scope, byId } = buildIteminfoScope(input, manifest);
  const pages = semanticCapture?.pages;
  if (!Array.isArray(pages) || pages.length !== ITEMINFO_SEMANTIC_PAGES.length) {
    throw new Error('Iteminfo semantic source pages are incomplete');
  }
  if (!Array.isArray(manifest.pages) || manifest.pages.length !== ITEMINFO_SEMANTIC_PAGES.length) {
    throw new Error('Iteminfo semantic manifest pages are incomplete');
  }
  const byTitle = new Map();
  for (const page of pages) {
    if (!page || !ITEMINFO_SEMANTIC_PAGES.includes(page.pageTitle) || byTitle.has(page.pageTitle)
        || page.requestedPageTitle !== page.pageTitle || !Number.isSafeInteger(page.pageId) || page.pageId <= 0
        || !Number.isSafeInteger(page.revisionId) || page.revisionId <= 0
        || typeof page.revisionTimestamp !== 'string' || !Number.isFinite(Date.parse(page.revisionTimestamp))
        || typeof page.wikitext !== 'string' || !page.wikitext.trim()
        || !Buffer.isBuffer(page.rawBytes) || page.sha256 !== sha256(page.rawBytes)) {
      throw new Error('Iteminfo semantic source identity is invalid');
    }
    const raw = parse(page.rawBytes, `Iteminfo semantic source ${page.pageTitle}`);
    if (raw.pageTitle !== page.pageTitle || raw.pageId !== page.pageId || raw.revisionId !== page.revisionId
        || raw.revisionTimestamp !== page.revisionTimestamp || raw.wikitext !== page.wikitext) {
      throw new Error(`Iteminfo semantic source drifted: ${page.pageTitle}`);
    }
    const descriptor = manifest.pages.find(candidate => candidate.pageTitle === page.pageTitle);
    if (!descriptor || descriptor.requestedPageTitle !== page.pageTitle || descriptor.pageId !== page.pageId
        || descriptor.revisionId !== page.revisionId || descriptor.revisionTimestamp !== page.revisionTimestamp
        || JSON.stringify(descriptor.buffIds) !== JSON.stringify(ids) || descriptor.sha256 !== page.sha256) {
      throw new Error(`Iteminfo semantic manifest binding drifted: ${page.pageTitle}`);
    }
    byTitle.set(page.pageTitle, page);
  }
  if (byTitle.size !== ITEMINFO_SEMANTIC_PAGES.length) throw new Error('Iteminfo semantic source pages are duplicated');
  const dataPage = byTitle.get('Module:Iteminfo/data');
  const docPage = byTitle.get('Module:Iteminfo/doc');
  const datagenPage = byTitle.get('Module:Iteminfo/datagen');
  if (!/\bbuffType\b/i.test(docPage.wikitext) || !/Buff ID/i.test(docPage.wikitext)) {
    throw new Error('Iteminfo semantic documentation is incomplete');
  }
  if (!/database with the statistics of all items/i.test(dataPage.wikitext)
      || !/generated from Module:Iteminfo\/datagen/i.test(dataPage.wikitext)) {
    throw new Error('Iteminfo semantic data declaration is incomplete');
  }
  if (!/Module:Iteminfo\/data/i.test(datagenPage.wikitext)
      || !/convertToJsonData/i.test(datagenPage.wikitext)) {
    throw new Error('Iteminfo semantic generator contract is incomplete');
  }
  const data = parseIteminfoModulePayload(dataPage.wikitext);
  const assertions = extractIteminfoAssertions({ data, scopeById: byId, selectedIds: new Set(ids) });
  const assertionsByBuffId = Object.fromEntries(ids.map(id => [id, []]));
  for (const assertion of assertions) assertionsByBuffId[assertion.buffId].push(assertion);
  return {
    source: {
      provider: 'terraria.wiki.gg',
      pages: pages.map(page => ({ pageTitle: page.pageTitle, pageId: page.pageId, revisionId: page.revisionId,
        revisionTimestamp: page.revisionTimestamp, rawSha256: sha256(page.rawBytes) }))
        .sort((left, right) => left.pageTitle.localeCompare(right.pageTitle)),
      manifestSha256: sha256(manifestBytes), inputSha256: sha256(inputBytes),
    },
    scope, assertions, assertionsByBuffId,
    completeness: 'complete-exhaustive-item-scope',
    semantic: { schemaVersion: 'buff-iteminfo-semantic/v1', field: 'buffType', sourcePages: ITEMINFO_SEMANTIC_PAGES },
  };
}
