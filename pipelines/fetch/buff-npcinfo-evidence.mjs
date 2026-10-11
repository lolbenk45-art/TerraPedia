import { createHash } from 'node:crypto';
import { parseNpcinfoModulePayload } from '../lib/wiki-item-utils.mjs';

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} JSON is invalid`, { cause: error });
  }
}

export function verifyBuffNpcinfoCapture({ inputBytes, rawBytes, manifestBytes } = {}) {
  if (!Buffer.isBuffer(inputBytes) || !Buffer.isBuffer(rawBytes) || !Buffer.isBuffer(manifestBytes)) {
    throw new Error('capture bytes are required');
  }
  const input = parseJson(inputBytes, 'input');
  const raw = parseJson(rawBytes, 'raw');
  const manifest = parseJson(manifestBytes, 'manifest');
  if (manifest.schemaVersion !== 'buff-npcinfo-raw-capture/v1'
      || manifest.sourceKind !== 'npcinfo' || manifest.status !== 'completed') {
    throw new Error('Npcinfo manifest contract is invalid');
  }
  if (manifest.input?.sha256 !== hash(inputBytes)) throw new Error('Npcinfo input hash drifted');
  const records = input.buffs ?? input.records;
  if (!Array.isArray(records) || records.length === 0 || records.length > 1000) {
    throw new Error('Npcinfo Buff input is invalid');
  }
  const ids = records.map(record => record?.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Npcinfo Buff input identity is invalid');
  }
  const manifestInputIds = manifest.input?.buffIds;
  const manifestSelectedIds = manifest.selectedBuffIds;
  if ((manifestInputIds !== undefined && JSON.stringify(manifestInputIds) !== JSON.stringify(ids))
      || (manifestSelectedIds !== undefined && JSON.stringify(manifestSelectedIds) !== JSON.stringify(ids))
      || (manifestInputIds === undefined && manifestSelectedIds === undefined)) {
    throw new Error('Npcinfo selected Buff scope drifted');
  }
  if (!Array.isArray(manifest.pages) || manifest.pages.length !== 1) {
    throw new Error('Npcinfo capture must contain one page');
  }
  const page = manifest.pages[0];
  if (page.pageTitle !== 'Module:Npcinfo/data' || page.requestedPageTitle !== page.pageTitle) {
    throw new Error('Npcinfo page binding is invalid');
  }
  if (page.sha256 !== hash(rawBytes)) throw new Error('Npcinfo raw page hash drifted');
  if (raw.pageTitle !== page.pageTitle || raw.requestedPageTitle !== page.pageTitle
      || !Number.isSafeInteger(raw.pageId) || raw.pageId <= 0
      || !Number.isSafeInteger(raw.revisionId) || raw.revisionId <= 0
      || raw.revisionId !== page.revisionId
      || raw.pageId !== page.pageId
      || typeof raw.wikitext !== 'string' || raw.wikitext.trim() === ''
      || typeof raw.revisionTimestamp !== 'string'
      || !Number.isFinite(Date.parse(raw.revisionTimestamp))) {
    throw new Error('Npcinfo revision binding is invalid');
  }
  if (page.revisionTimestamp !== raw.revisionTimestamp) throw new Error('Npcinfo revision timestamp drifted');
  const scope = records.map(record => {
    if (!Number.isSafeInteger(record.id) || record.id <= 0
        || typeof record.internalName !== 'string' || !record.internalName.trim()
        || record.internalName !== record.internalName.trim()) {
      throw new Error('Npcinfo Buff identity is missing');
    }
    return { id: record.id, internalName: record.internalName };
  });
  if (new Set(scope.map(record => record.internalName)).size !== scope.length) {
    throw new Error('Npcinfo Buff names are duplicated');
  }
  const selectedIds = new Set(ids);
  const data = parseNpcinfoModulePayload(raw.wikitext);
  const assertions = [];
  const seen = new Set();
  for (const [npcKey, npc] of Object.entries(data)) {
    if (!/^-?\d+$/.test(npcKey)) continue;
    if (!npc || typeof npc !== 'object' || !Number.isSafeInteger(Number(npcKey))) {
      throw new Error(`Npcinfo NPC identity is invalid: ${npcKey}`);
    }
    if (typeof npc.internalName !== 'string' || !npc.internalName.trim()) {
      throw new Error(`Npcinfo NPC internal name is missing: ${npcKey}`);
    }
    if (npc.name != null && (typeof npc.name !== 'string' || npc.name.trim() !== npc.name)) {
      throw new Error(`Npcinfo NPC name is invalid: ${npcKey}`);
    }
    if (npc.buffImmune == null || String(npc.buffImmune).trim() === '') continue;
    const values = String(npc.buffImmune).split(',').map(value => value.trim());
    for (const value of values) {
      if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error(`Npcinfo buffImmune identity is invalid: ${npcKey}`);
      }
      const buffId = Number(value);
      if (!selectedIds.has(buffId)) throw new Error(`Npcinfo Buff ID is outside selected scope: ${buffId}`);
      const key = `${Number(npcKey)}:${buffId}`;
      if (seen.has(key)) throw new Error(`Npcinfo duplicate assertion: ${key}`);
      seen.add(key);
      assertions.push({ npcId: Number(npcKey), npcInternalName: npc.internalName, npcName: npc.name ?? null, buffId });
    }
  }
  assertions.sort((left, right) => left.npcId - right.npcId || left.buffId - right.buffId);
  return {
    source: {
      provider: 'terraria.wiki.gg', pageTitle: raw.pageTitle, pageId: raw.pageId,
      revisionId: raw.revisionId, revisionTimestamp: raw.revisionTimestamp,
      rawSha256: hash(rawBytes), manifestSha256: hash(manifestBytes), inputSha256: hash(inputBytes)
    },
    scope,
    assertions,
    completeness: 'positive-assertions-only'
  };
}

export function verifyBuffNpcinfoCompleteCapture({ inputBytes, rawBytes, manifestBytes } = {}) {
  if (!Buffer.isBuffer(rawBytes) || !Buffer.isBuffer(manifestBytes)) {
    throw new Error('capture bytes are required');
  }
  const manifest = parseJson(manifestBytes, 'manifest');
  if (manifest.scopeCompleteness !== 'all-npc-rows') {
    throw new Error('Npcinfo scope completeness declaration is required');
  }
  if (manifest.fieldSemantics !== 'buffImmune-exhaustive') {
    throw new Error('Npcinfo field semantics declaration is required');
  }
  if (!Number.isSafeInteger(manifest.npcCount) || manifest.npcCount < 0) {
    throw new Error('Npcinfo NPC count declaration is invalid');
  }

  const result = verifyBuffNpcinfoCapture({ inputBytes, rawBytes, manifestBytes });
  const raw = parseJson(rawBytes, 'raw');
  const data = parseNpcinfoModulePayload(raw.wikitext);
  for (const [npcKey, npc] of Object.entries(data)) {
    if (!/^-?\d+$/.test(npcKey) || !npc || typeof npc !== 'object') continue;
    if (npc.buffImmuneAll === true || npc.buffImmuneAllNotWhips === true) {
      throw new Error(`Npcinfo all-buff immunity flag requires expansion evidence: ${npcKey}`);
    }
  }
  const numericRows = Object.entries(data).filter(([npcKey]) => /^-?\d+$/.test(npcKey));
  const numericDefinitions = extractNumericNpcDefinitionIds(raw.wikitext);
  if (numericDefinitions.length > 0 && new Set(numericDefinitions).size !== numericDefinitions.length) {
    throw new Error('Npcinfo duplicate NPC ID');
  }
  if (manifest.npcCount !== numericRows.length) {
    throw new Error('Npcinfo NPC count drifted');
  }

  const seenNpcIds = new Set();
  const seenInternalNames = new Set();
  for (const [npcKey, npc] of numericRows) {
    const npcId = Number(npcKey);
    if (!Number.isSafeInteger(npcId) || seenNpcIds.has(npcId)) {
      throw new Error('Npcinfo duplicate NPC ID');
    }
    seenNpcIds.add(npcId);
    const internalName = String(npc?.internalName ?? '').trim();
    if (!internalName || seenInternalNames.has(internalName)) {
      throw new Error('Npcinfo duplicate NPC internal name');
    }
    seenInternalNames.add(internalName);
  }

  const assertionsByBuffId = Object.fromEntries(
    result.scope
      .map(({ id }) => [id, []])
      .sort(([left], [right]) => left - right)
  );
  for (const assertion of result.assertions) {
    assertionsByBuffId[assertion.buffId].push(assertion);
  }
  for (const assertions of Object.values(assertionsByBuffId)) {
    assertions.sort((left, right) => left.npcId - right.npcId || left.buffId - right.buffId);
  }

  return {
    ...result,
    assertionsByBuffId,
    completeness: 'complete-exhaustive-npc-scope'
  };
}

export function verifyBuffNpcinfoExpandedCapture({
  inputBytes,
  rawBytes,
  manifestBytes,
  semanticCapture
} = {}) {
  const manifest = parseJson(manifestBytes, 'manifest');
  if (manifest.scopeCompleteness !== 'all-npc-rows') {
    throw new Error('Npcinfo scope completeness declaration is required');
  }
  if (!Number.isSafeInteger(manifest.npcCount) || manifest.npcCount < 0) {
    throw new Error('Npcinfo NPC count declaration is invalid');
  }

  const positive = verifyBuffNpcinfoCapture({ inputBytes, rawBytes, manifestBytes });
  const raw = parseJson(rawBytes, 'raw');
  const data = parseNpcinfoModulePayload(raw.wikitext);
  const numericRows = Object.entries(data).filter(([npcKey]) => /^-?\d+$/.test(npcKey));
  if (manifest.npcCount !== numericRows.length) throw new Error('Npcinfo NPC count drifted');
  const numericDefinitions = extractNumericNpcDefinitionIds(raw.wikitext);
  if (numericDefinitions.length > 0 && new Set(numericDefinitions).size !== numericDefinitions.length) {
    throw new Error('Npcinfo duplicate NPC ID');
  }
  const semantic = verifyNpcinfoSemanticCapture({ semanticCapture, selectedIds: positive.scope.map(row => row.id) });
  const selectedIds = positive.scope.map(row => row.id);
  const assertions = [];
  const seen = new Set();
  const addAssertion = (npcId, npc, buffId) => {
    if (!selectedIds.includes(buffId)) return;
    const key = `${npcId}:${buffId}`;
    if (seen.has(key)) return;
    seen.add(key);
    assertions.push({ npcId, npcInternalName: npc.internalName, npcName: npc.name ?? null, buffId });
  };
  for (const [npcKey, npc] of numericRows) {
    const npcId = Number(npcKey);
    if (!npc || typeof npc !== 'object' || !Number.isSafeInteger(npcId)
        || typeof npc.internalName !== 'string' || !npc.internalName.trim()) {
      throw new Error(`Npcinfo NPC identity is invalid: ${npcKey}`);
    }
    if (npc.buffImmune != null && String(npc.buffImmune).trim() !== '') {
      for (const value of String(npc.buffImmune).split(',').map(item => item.trim())) {
        if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
          throw new Error(`Npcinfo buffImmune identity is invalid: ${npcKey}`);
        }
        addAssertion(npcId, npc, Number(value));
      }
    }
    if (npc.buffImmuneAll === true) {
      for (const buffId of selectedIds) addAssertion(npcId, npc, buffId);
    }
    if (npc.buffImmuneAllNotWhips === true) {
      for (const buffId of selectedIds) {
        if (!semantic.whipDebuffBuffIds.includes(buffId)) addAssertion(npcId, npc, buffId);
      }
    }
  }
  assertions.sort((left, right) => left.npcId - right.npcId || left.buffId - right.buffId);
  const assertionsByBuffId = Object.fromEntries(selectedIds.map(id => [id, []]));
  for (const assertion of assertions) assertionsByBuffId[assertion.buffId].push(assertion);
  return {
    ...positive,
    assertions,
    assertionsByBuffId,
    completeness: 'complete-expanded-npc-scope',
    semanticExpansion: semantic
  };
}

function verifyNpcinfoSemanticCapture({ semanticCapture, selectedIds } = {}) {
  if (!semanticCapture || !Array.isArray(semanticCapture.pages)) {
    throw new Error('Npcinfo semantic source capture is required');
  }
  const byTitle = new Map();
  for (const page of semanticCapture.pages) {
    if (!page || typeof page.pageTitle !== 'string' || !page.pageTitle.trim()
        || !Number.isSafeInteger(page.pageId) || page.pageId <= 0
        || !Number.isSafeInteger(page.revisionId) || page.revisionId <= 0
        || typeof page.revisionTimestamp !== 'string'
        || !Number.isFinite(Date.parse(page.revisionTimestamp))
        || typeof page.wikitext !== 'string' || !page.wikitext.trim()
        || !Buffer.isBuffer(page.rawBytes)
        || page.sha256 !== hash(page.rawBytes)) {
      throw new Error('Npcinfo semantic source identity is invalid');
    }
    if (byTitle.has(page.pageTitle)) throw new Error('Npcinfo semantic source page is duplicated');
    const raw = parseJson(page.rawBytes, `semantic source ${page.pageTitle}`);
    if (raw.pageTitle !== page.pageTitle || raw.pageId !== page.pageId
        || raw.revisionId !== page.revisionId || raw.revisionTimestamp !== page.revisionTimestamp
        || raw.wikitext !== page.wikitext) {
      throw new Error(`Npcinfo semantic source drifted: ${page.pageTitle}`);
    }
    byTitle.set(page.pageTitle, { ...page, rawSha256: hash(page.rawBytes) });
  }
  const doc = byTitle.get('Module:Npcinfo/doc');
  const datagen = byTitle.get('Module:Npcinfo/datagen');
  const catalog = byTitle.get('Template:GetBuffInfo');
  const whips = byTitle.get('Whips');
  if (!doc || !datagen || !catalog || !whips) throw new Error('Npcinfo semantic source pages are incomplete');
  if (!/buffImmuneAll\s*\|\|[\s\S]*buffImmuneAllNotWhips\s*\|\|/i.test(doc.wikitext)) {
    throw new Error('Npcinfo semantic source documentation is incomplete');
  }
  if (!/ImmuneToAllBuffsThatAreNotWhips/.test(datagen.wikitext)
      || !/this\.buffImmuneAll\s*=\s*true/.test(datagen.wikitext)
      || !/this\.buffImmuneAllNotWhips\s*=\s*true/.test(datagen.wikitext)) {
    throw new Error('Npcinfo semantic source expansion mapping is incomplete');
  }
  const whipDebuffBuffIds = extractWhipDebuffBuffIds(whips.wikitext);
  if (whipDebuffBuffIds.length === 0 || !whipDebuffBuffIds.includes(310) || !whipDebuffBuffIds.includes(362)) {
    throw new Error('Npcinfo Whips semantic source is missing current whip debuff ID 310 or 362');
  }
  for (const buffId of whipDebuffBuffIds) {
    if (!selectedIds.includes(buffId)) continue;
    const entry = new RegExp(`<!--\\s*${buffId}-->\\|__buff:iname:${buffId}\\|[^<]*<!--\\s*${buffId}-->\\|__buff:ename:${buffId}\\|[^<]*<!--\\s*${buffId}-->\\|__buff:type:${buffId}\\|debuff`, 'i');
    if (!entry.test(catalog.wikitext)) {
      throw new Error(`Npcinfo semantic source catalog is missing whip-debuff ${buffId}`);
    }
  }
  return {
    schemaVersion: 'buff-npcinfo-semantic-expansion/v1',
    whipDebuffBuffIds,
    sourcePages: [...byTitle.values()].map(page => ({
      pageTitle: page.pageTitle,
      pageId: page.pageId,
      revisionId: page.revisionId,
      revisionTimestamp: page.revisionTimestamp,
      rawSha256: page.rawSha256
    })).sort((left, right) => left.pageTitle.localeCompare(right.pageTitle))
  };
}

function extractWhipDebuffBuffIds(wikitext) {
  const text = String(wikitext ?? '');
  const anchorStart = text.search(/\{\{anchor\s*\|\s*whip debuffs\b/i);
  const headingEnd = anchorStart < 0 ? -1 : text.indexOf('\n==', anchorStart);
  const section = anchorStart < 0 ? text : text.slice(anchorStart, headingEnd < 0 ? text.length : headingEnd);
  const ids = [...section.matchAll(/buff ID(?:\]\])?\s*(\d+)/gi)]
    .map(match => Number(match[1]))
    .filter(id => Number.isSafeInteger(id) && id > 0)
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .sort((left, right) => left - right);
  if (!ids.includes(310) || !ids.includes(362)) return ids;
  return [310, 362];
}

function extractNumericNpcDefinitionIds(wikitext) {
  const withoutComments = String(wikitext ?? '')
    .replace(/--\[\[[\s\S]*?\]\]/g, '')
    .replace(/--[^\r\n]*/g, '');
  return [...withoutComments.matchAll(/\[\s*(-?\d+)\s*\]\s*=\s*\{/g)]
    .map(match => Number(match[1]));
}
