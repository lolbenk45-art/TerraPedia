import { createHash } from 'node:crypto';

import { sharedDataPath } from '../lib/wiki-item-utils.mjs';
import {
  DEFAULT_WIKI_API_URL,
  fetchWikiApiJson,
  fetchWikiPagePayload,
  parseIteminfoModulePayload,
} from '../lib/wiki-item-utils.mjs';
import {
  buildActionProgressPayload,
  createCrawlerProgressHeartbeat,
  writeJsonFile,
} from '../workflow/backend-refresh-runtime-state.mjs';
import {
  parseBaseBuffDatabase,
} from './fetch-wiki-buffs.mjs';
import { parseBuffPageEvidence } from './buff-immunity-page-parser.mjs';

export const SOURCE_REPLAY_ACTION_ID = 'buff-page-immunity-refresh';
export const SOURCE_REPLAY_REDIS_DB = 18;
export const SOURCE_REPLAY_PROGRESS_PATH = sharedDataPath('generated', 'fetch-wiki-buffs-progress.latest.json');
export const BOUNDED_BUFF_SCOPE = Object.freeze([
  Object.freeze({ id: 153, internalName: 'ShadowFlame' }),
  Object.freeze({ id: 70, internalName: 'Venom' }),
]);

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ''), 'utf8');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function requireRevisionBound(value, label) {
  if (!value || !Number.isSafeInteger(Number(value.pageId)) || Number(value.pageId) <= 0
      || !Number.isSafeInteger(Number(value.revisionId)) || Number(value.revisionId) <= 0
      || !String(value.revisionTimestamp ?? '').trim() || !Number.isFinite(Date.parse(value.revisionTimestamp))) {
    throw new Error(`${label} requires page ID, revision ID, and timestamp`);
  }
  return value;
}

function captureDescriptor(value, label, rawValue) {
  const descriptor = requireRevisionBound(value, label);
  const rawSha256 = descriptor.rawSha256 ?? sha256(rawValue);
  if (!HASH_PATTERN.test(rawSha256)) throw new Error(`${label} content hash is invalid`);
  return {
    requestedPageTitle: descriptor.requestedPageTitle ?? descriptor.pageTitle,
    pageTitle: descriptor.pageTitle,
    pageId: Number(descriptor.pageId),
    revisionId: Number(descriptor.revisionId),
    revisionTimestamp: descriptor.revisionTimestamp,
    rawSha256,
  };
}

function sourcePagePayload(page) {
  return {
    requestedPageTitle: page.requestedPageTitle ?? page.pageTitle,
    pageTitle: page.pageTitle,
    pageId: Number(page.pageId),
    revisionId: Number(page.revisionId),
    revisionTimestamp: page.revisionTimestamp,
    wikitext: page.wikitext,
    html: page.html,
    sections: Array.isArray(page.sections) ? page.sections : [],
  };
}

function canonicalSnapshotBytes(value) {
  return Buffer.from(JSON.stringify({
    schemaVersion: value.schemaVersion,
    generatedAt: value.generatedAt,
    testRedisLogicalDb: value.testRedisLogicalDb,
    source: value.source,
    records: value.records,
  }), 'utf8');
}

function normalizeSourceRecord(record, pageDescriptor) {
  const evidence = record?.sourceEvidence ?? {};
  const sourceItems = Array.isArray(record?.sourceItems) ? record.sourceItems : [];
  const itemKeys = sourceItems.map((item) => String(item?.internalName ?? '').trim()).filter(Boolean);
  if (record?.sourceEvidence?.parseStatus !== 'parsed' || sourceItems.length === 0 || itemKeys.length !== sourceItems.length
      || new Set(itemKeys).size !== itemKeys.length) {
    throw new Error(`Buff ${record?.id} source page is incomplete or has duplicate source items`);
  }
  return {
    ...structuredClone(record),
    sourceItemsSource: 'buff-page-causes',
    sourceEvidence: {
      ...evidence,
      provider: 'terraria.wiki.gg',
      pageTitle: pageDescriptor.pageTitle,
      canonicalPageTitle: pageDescriptor.pageTitle,
      pageId: pageDescriptor.pageId,
      revisionId: pageDescriptor.revisionId,
      revisionTimestamp: pageDescriptor.revisionTimestamp,
      rawSha256: pageDescriptor.rawSha256,
      parseStatus: 'parsed',
      unresolvedFacts: [],
    },
  };
}

function bindSourceItemsToIteminfo(record, itemInfoData, itemInfoDescriptor) {
  const byInternalName = new Map();
  for (const [sourceId, item] of Object.entries(itemInfoData)) {
    if (!/^\d+$/.test(sourceId) || !item || typeof item !== 'object') continue;
    const internalName = String(item.internalName ?? '').trim();
    if (!internalName) continue;
    const key = internalName.toLowerCase();
    const matches = byInternalName.get(key) ?? [];
    matches.push({ itemId: Number(sourceId), ...item, internalName });
    byInternalName.set(key, matches);
  }
  const sourceItems = record.sourceItems.map((sourceItem) => {
    const key = String(sourceItem.internalName ?? '').trim().toLowerCase();
    const matches = byInternalName.get(key) ?? [];
    if (matches.length !== 1 || !Number.isSafeInteger(matches[0].itemId) || matches[0].itemId <= 0) {
      throw new Error(`Buff ${record.id} source item does not resolve uniquely in the captured Iteminfo revision: ${sourceItem.name ?? sourceItem.internalName}`);
    }
    const item = matches[0];
    return {
      ...sourceItem,
      internalName: item.internalName,
      itemId: item.itemId,
      itemInfoBuffType: Number.isInteger(Number(item.buffType)) ? Number(item.buffType) : null,
      itemIdentityEvidence: {
        pageTitle: itemInfoDescriptor.pageTitle,
        pageId: itemInfoDescriptor.pageId,
        revisionId: itemInfoDescriptor.revisionId,
        revisionTimestamp: itemInfoDescriptor.revisionTimestamp,
        rawSha256: itemInfoDescriptor.rawSha256,
        sourceField: `[${item.itemId}].internalName`,
      },
    };
  });
  if (new Set(sourceItems.map((item) => item.itemId)).size !== sourceItems.length) {
    throw new Error(`Buff ${record.id} source item identity mapping contains duplicate Iteminfo IDs`);
  }
  return {
    ...record,
    sourceItems,
    sourceEvidence: {
      ...record.sourceEvidence,
      itemIdentitySource: itemInfoDescriptor,
    },
  };
}

export function buildCurrentBuffSourceReplay({
  generatedAt = new Date().toISOString(),
  buffCatalogModule,
  itemInfoModule,
  pages,
  testRedisLogicalDb = SOURCE_REPLAY_REDIS_DB,
} = {}) {
  if (Number(testRedisLogicalDb) !== SOURCE_REPLAY_REDIS_DB) throw new Error('current Buff source replay requires Redis DB18');
  const catalogRaw = buffCatalogModule?.moduleContent;
  const itemInfoRaw = itemInfoModule?.moduleContent;
  const catalog = captureDescriptor(buffCatalogModule, 'Template:GetBuffInfo source', catalogRaw);
  const itemInfo = captureDescriptor(itemInfoModule, 'Module:Iteminfo/data source', itemInfoRaw);
  if (catalog.pageTitle !== 'Template:GetBuffInfo' || itemInfo.pageTitle !== 'Module:Iteminfo/data') {
    throw new Error('current Buff source replay modules are not the required Wiki sources');
  }
  if (!Array.isArray(pages) || pages.length !== BOUNDED_BUFF_SCOPE.length) {
    throw new Error('current Buff source replay requires exactly two Buff pages');
  }
  const itemInfoData = parseIteminfoModulePayload(itemInfoModule.moduleContent);
  const records = pages.map((page) => {
    const scope = BOUNDED_BUFF_SCOPE.find((entry) => entry.id === Number(page?.record?.id));
    if (!scope || page.record.internalName !== scope.internalName) throw new Error('current Buff source replay scope drifted');
    const payload = sourcePagePayload(page);
    const descriptor = captureDescriptor(page, `${scope.internalName} source page`, JSON.stringify(payload));
    const itemBoundRecord = bindSourceItemsToIteminfo(page.record, itemInfoData, itemInfo);
    const record = normalizeSourceRecord(itemBoundRecord, descriptor);
    if (record.id !== scope.id || record.internalName !== scope.internalName) throw new Error('current Buff source record identity drifted');
    return record;
  });
  const byId = new Map(records.map((record) => [record.id, record]));
  if (BOUNDED_BUFF_SCOPE.some((entry) => !byId.has(entry.id))) throw new Error('current Buff source replay is missing a bounded Buff');
  const value = {
    schemaVersion: 'buff-current-source-replay/v1',
    manual_source_replay: true,
    production_source_delta: false,
    databaseWritesToFormalRuntime: false,
    testRedisLogicalDb: SOURCE_REPLAY_REDIS_DB,
    generatedAt,
    source: {
      provider: 'terraria.wiki.gg',
      kind: 'revision_bound_wiki_pages',
      module: { ...catalog, moduleContent: buffCatalogModule.moduleContent },
      itemInfoModule: { ...itemInfo, moduleContent: itemInfoModule.moduleContent },
      pages: pages.map((page) => ({
        ...captureDescriptor(page, `${page.pageTitle} source page`, JSON.stringify(sourcePagePayload(page))),
        ...sourcePagePayload(page),
      })),
    },
    records,
  };
  value.snapshotSha256 = sha256(canonicalSnapshotBytes(value));
  return value;
}

export function assertCurrentBuffSourceReplay(value) {
  if (value?.schemaVersion !== 'buff-current-source-replay/v1' || value.manual_source_replay !== true) {
    throw new Error('current Buff source replay must be marked manual_source_replay');
  }
  if (value.production_source_delta !== false || value.databaseWritesToFormalRuntime !== false) {
    throw new Error('current Buff source replay cannot claim a production source delta or formal runtime write');
  }
  if (Number(value.testRedisLogicalDb) !== SOURCE_REPLAY_REDIS_DB) throw new Error('current Buff source replay requires Redis DB18');
  if (value.source?.provider !== 'terraria.wiki.gg' || value.source?.kind !== 'revision_bound_wiki_pages') {
    throw new Error('current Buff source replay source kind is invalid');
  }
  if (value.source?.module?.pageTitle !== 'Template:GetBuffInfo' || value.source?.itemInfoModule?.pageTitle !== 'Module:Iteminfo/data') {
    throw new Error('current Buff source replay module identity is invalid');
  }
  for (const [label, descriptor] of [['module', value.source.module], ['iteminfo', value.source.itemInfoModule]]) {
    requireRevisionBound(descriptor, `${label} source`);
    if (!HASH_PATTERN.test(descriptor.rawSha256 ?? '') || sha256(descriptor.moduleContent) !== descriptor.rawSha256) {
      throw new Error(`${label} source hash is invalid`);
    }
  }
  const catalogRows = parseBaseBuffDatabase(value.source.module.moduleContent);
  const itemInfoData = parseIteminfoModulePayload(value.source.itemInfoModule.moduleContent);
  for (const scope of BOUNDED_BUFF_SCOPE) {
    const catalog = catalogRows.find((row) => row.id === scope.id);
    const record = value.records.find((candidate) => candidate.id === scope.id);
    if (!catalog || catalog.internalName !== scope.internalName || catalog.englishName !== record?.englishName) {
      throw new Error(`current Template:GetBuffInfo identity drifted for ${scope.id}`);
    }
  }
  if (!Array.isArray(value.records) || value.records.length !== BOUNDED_BUFF_SCOPE.length) {
    throw new Error('current Buff source replay requires exactly two records');
  }
  for (const scope of BOUNDED_BUFF_SCOPE) {
    const record = value.records.find((candidate) => Number(candidate?.id) === scope.id);
    if (!record || record.internalName !== scope.internalName || record.fixtureId != null
        || String(record.sourceKind ?? '').toLowerCase().includes('fixture')) {
      throw new Error(`current Buff source replay scope or fixture identity is invalid for ${scope.internalName}`);
    }
    const evidence = record.sourceEvidence;
    requireRevisionBound(evidence, `${scope.internalName} source page`);
    if (evidence.provider !== 'terraria.wiki.gg' || evidence.parseStatus !== 'parsed' || !HASH_PATTERN.test(evidence.rawSha256 ?? '')) {
      throw new Error(`${scope.internalName} source page revision/hash evidence is invalid`);
    }
    for (const group of ['sourceItems', 'inflictingNpcs', 'immuneNpcs']) {
      if (evidence.factGroups?.[group]?.status !== 'parsed') {
        throw new Error(`${scope.internalName} source page ${group} facts are not fully parsed`);
      }
    }
    const itemIdentitySource = evidence.itemIdentitySource;
    if (itemIdentitySource?.pageTitle !== value.source.itemInfoModule.pageTitle
        || itemIdentitySource?.pageId !== value.source.itemInfoModule.pageId
        || itemIdentitySource?.revisionId !== value.source.itemInfoModule.revisionId
        || itemIdentitySource?.revisionTimestamp !== value.source.itemInfoModule.revisionTimestamp
        || itemIdentitySource?.rawSha256 !== value.source.itemInfoModule.rawSha256) {
      throw new Error(`${scope.internalName} source item identity is not bound to the captured Iteminfo revision`);
    }
    if (evidence.fixtureId != null || evidence.sourceKind === 'offline_fixture') throw new Error(`${scope.internalName} source page cannot carry fixture identity`);
    const page = value.source.pages?.find((candidate) => Number(candidate.pageId) === Number(evidence.pageId));
    if (!page || page.pageTitle !== evidence.pageTitle || Number(page.revisionId) !== Number(evidence.revisionId)
        || page.rawSha256 !== evidence.rawSha256
        || sha256(JSON.stringify(sourcePagePayload(page))) !== page.rawSha256) {
      throw new Error(`${scope.internalName} source page hash or revision binding is invalid`);
    }
    if (!Array.isArray(record.sourceItems) || record.sourceItems.length === 0
        || record.sourceItems.some((item) => !String(item?.internalName ?? '').trim()
          || !Number.isSafeInteger(Number(item?.itemId)) || Number(item.itemId) <= 0
          || item.itemIdentityEvidence?.pageTitle !== value.source.itemInfoModule.pageTitle
          || item.itemIdentityEvidence?.pageId !== value.source.itemInfoModule.pageId
          || item.itemIdentityEvidence?.revisionId !== value.source.itemInfoModule.revisionId
          || item.itemIdentityEvidence?.revisionTimestamp !== value.source.itemInfoModule.revisionTimestamp
          || item.itemIdentityEvidence?.rawSha256 !== value.source.itemInfoModule.rawSha256
          || itemInfoData[String(item.itemId)]?.internalName !== item.internalName)) {
      throw new Error(`${scope.internalName} source item evidence is incomplete`);
    }
  }
  if (!HASH_PATTERN.test(value.snapshotSha256 ?? '')) throw new Error('current Buff source snapshot hash is missing');
  if (sha256(canonicalSnapshotBytes(value)) !== value.snapshotSha256) throw new Error('current Buff source snapshot hash does not match its contents');
  return true;
}

export async function fetchRevisionBoundWikiModule({ moduleTitle, fetchApiJsonImpl = fetchWikiApiJson } = {}) {
  const normalized = String(moduleTitle ?? '').trim();
  if (!['Template:GetBuffInfo', 'Module:Iteminfo/data'].includes(normalized)) {
    throw new Error('current Buff source replay only captures its two registered Wiki modules');
  }
  const url = new URL(DEFAULT_WIKI_API_URL);
  for (const [key, value] of Object.entries({
    action: 'query',
    titles: normalized,
    prop: 'revisions',
    rvprop: 'ids|timestamp|content',
    rvslots: 'main',
    format: 'json',
    formatversion: '2',
  })) url.searchParams.set(key, value);
  const body = await fetchApiJsonImpl({ url, profile: 'revision', sourceKey: normalized });
  const page = body?.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const moduleContent = revision?.slots?.main?.content;
  if (page?.title !== normalized || typeof moduleContent !== 'string' || moduleContent.trim() === '') {
    throw new Error(`current Wiki module content is missing: ${normalized}`);
  }
  return {
    requestedPageTitle: normalized,
    pageTitle: page.title,
    pageId: page.pageid,
    revisionId: revision.revid,
    revisionTimestamp: revision.timestamp,
    moduleContent,
  };
}

function writeProgress(progressPath, progress) {
  writeJsonFile(progressPath, buildActionProgressPayload({
    actionId: SOURCE_REPLAY_ACTION_ID,
    childStatusPath: progressPath,
    ...progress,
  }));
}

export async function captureCurrentBuffSource({
  progressPath = SOURCE_REPLAY_PROGRESS_PATH,
  fetchModuleImpl = fetchRevisionBoundWikiModule,
  fetchPageImpl = fetchWikiPagePayload,
  generatedAt = new Date().toISOString(),
} = {}) {
  const total = 4;
  let current = 0;
  const progress = createCrawlerProgressHeartbeat({
    writeProgress: (value) => writeProgress(progressPath, value),
  });
  progress.publish({ status: 'running', phase: 'module', message: 'capturing bounded current Buff Wiki sources', current, total, overallCurrent: current, overallTotal: total, startedAt: generatedAt });
  try {
    const buffCatalogModule = await fetchModuleImpl({ moduleTitle: 'Template:GetBuffInfo' });
    current += 1;
    progress.publish({ status: 'running', phase: 'module', message: 'captured Template:GetBuffInfo', current, total, overallCurrent: current, overallTotal: total, startedAt: generatedAt });
    const itemInfoModule = await fetchModuleImpl({ moduleTitle: 'Module:Iteminfo/data' });
    parseIteminfoModulePayload(itemInfoModule.moduleContent);
    current += 1;
    progress.publish({ status: 'running', phase: 'module', message: 'captured Module:Iteminfo/data', current, total, overallCurrent: current, overallTotal: total, startedAt: generatedAt });
    const baseBuffs = parseBaseBuffDatabase(buffCatalogModule.moduleContent);
    const pages = [];
    for (const scope of BOUNDED_BUFF_SCOPE) {
      const buff = baseBuffs.find((candidate) => candidate.id === scope.id && candidate.internalName === scope.internalName);
      if (!buff) throw new Error(`current Template:GetBuffInfo is missing ${scope.id}:${scope.internalName}`);
      const payload = await fetchPageImpl({ pageTitle: buff.englishName, requireRevisionBinding: true });
      const record = parseBuffPageEvidence({
        buffId: buff.id,
        buffName: buff.englishName,
        pageTitle: payload.pageTitle,
        canonicalPageTitle: payload.pageTitle,
        revisionId: payload.revisionId,
        revisionTimestamp: payload.revisionTimestamp,
        html: payload.html,
        wikitext: payload.wikitext,
        sections: payload.sections,
      });
      pages.push({ ...payload, record: { ...buff, ...record, localized: { en: { name: buff.englishName, page: payload.pageTitle, tooltip: null, namesub: null } } } });
      current += 1;
      progress.publish({ status: 'running', phase: 'page', message: `captured ${payload.pageTitle}`, current, total, overallCurrent: current, overallTotal: total, startedAt: generatedAt });
    }
    const replay = buildCurrentBuffSourceReplay({ generatedAt, buffCatalogModule, itemInfoModule, pages });
    progress.publish({ status: 'completed', phase: 'write', message: 'captured bounded current Buff source replay', current: total, total, overallCurrent: total, overallTotal: total, startedAt: generatedAt });
    return replay;
  } catch (error) {
    progress.publish({ status: 'failed', phase: 'error', message: `current Buff source replay failed: ${error?.message ?? String(error)}`, current, total, overallCurrent: current, overallTotal: total, startedAt: generatedAt });
    throw error;
  } finally {
    progress.stop();
  }
}
