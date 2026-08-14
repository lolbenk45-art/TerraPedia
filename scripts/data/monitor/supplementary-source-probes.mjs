import crypto from 'node:crypto';

import { fetchAudioCatalogMetadata } from '../fetch/fetch-wiki-audio-assets.mjs';
import {
  DEFAULT_WIKI_API_URL,
  fetchWikiApiJson,
  fetchWikiPageMetadataBatch
} from '../lib/wiki-item-utils.mjs';
import {
  CELESTIAL_PILLAR_SHARED_ZH_PAGE,
  resolveCelestialPillarNameZhByEnglishTitle
} from '../lib/celestial-pillar-zh.mjs';
import { collectShimmerCandidateTitles } from '../transform/shimmer-generation-builder.mjs';

const DEFAULT_ZH_WIKI_API_URL = DEFAULT_WIKI_API_URL.replace('/api.php', '/zh/api.php');
const METADATA_BATCH_SIZE = 50;
const SHIMMER_METADATA_BATCH_SIZE = 8;
const MAX_BOSS_CATALOG_ENTRIES = 200;
const MAX_SHIMMER_CANDIDATE_TITLES = 5_000;
const BOSS_GROUP_CONFIG = Object.freeze({
  'Pre-Hardmode bosses': { groupType: 'PRE_HARDMODE', groupNameZh: '困难模式之前的 Boss' },
  'Hardmode bosses': { groupType: 'HARDMODE', groupNameZh: '困难模式 Boss' },
  'Event bosses': { groupType: 'EVENT', groupNameZh: '事件 Boss' },
  'Special world seed-exclusive boss': { groupType: 'SPECIAL_SEED', groupNameZh: '特殊世界种子专属 Boss' }
});

export const SUPPLEMENTARY_SOURCE_DEFINITIONS = Object.freeze({
  audio: Object.freeze({
    sourceKey: 'wiki.audio_assets.catalog',
    locator: 'Music|NPC_Hit|NPC_Killed|Item_',
    entityFamily: 'audio',
    sourceKind: 'media_catalog'
  }),
  bosses: Object.freeze({
    sourceKey: 'wiki.bosses.catalog',
    locator: 'Bosses',
    entityFamily: 'bosses',
    sourceKind: 'page_catalog'
  }),
  shimmer: Object.freeze({
    sourceKey: 'wiki.shimmer.page_and_langlinks',
    locator: '微光',
    entityFamily: 'shimmer',
    sourceKind: 'page_and_langlinks'
  })
});

export async function probeSupplementarySource(
  { domainId, wikiApiUrl = DEFAULT_WIKI_API_URL, zhWikiApiUrl = DEFAULT_ZH_WIKI_API_URL } = {},
  dependencies = {}
) {
  const definition = SUPPLEMENTARY_SOURCE_DEFINITIONS[domainId];
  if (!definition) {
    throw new Error(`unsupported supplementary source domain: ${String(domainId ?? '')}`);
  }

  const probe = PROBE_BY_DOMAIN[domainId];
  const result = await probe({ definition, wikiApiUrl, zhWikiApiUrl, dependencies });
  const snapshot = normalizeSnapshot(result.snapshot);
  return {
    ...definition,
    ...result.identity,
    snapshot,
    contentHash: createContentHash(canonicalJson(snapshot)),
    checkedAt: new Date().toISOString()
  };
}

const PROBE_BY_DOMAIN = Object.freeze({
  audio: probeAudioSource,
  bosses: probeBossSource,
  shimmer: probeShimmerSource
});

async function probeAudioSource({ wikiApiUrl, zhWikiApiUrl, dependencies }) {
  const metadata = await resolvePageMetadata({
    titles: ['音乐'],
    apiUrl: zhWikiApiUrl,
    includeLanglinks: false,
    batchSize: METADATA_BATCH_SIZE,
    dependencies
  });
  const musicPage = requirePageMetadata(metadata[0], '音乐');
  const catalog = await (dependencies.fetchAudioCatalogMetadata ?? fetchAudioCatalogMetadata)(
    {
      apiUrl: wikiApiUrl,
      ...(dependencies.audioCatalogMaxPagesPerPrefix == null
        ? {}
        : { maxPagesPerPrefix: dependencies.audioCatalogMaxPagesPerPrefix })
    },
    { fetchJson: dependencies.fetchJson ?? fetchWikiApiJson }
  );
  if (!Array.isArray(catalog)) {
    throw new Error('audio catalog probe requires a metadata record array');
  }
  const files = catalog.map((record) => normalizeAudioRecord(record));
  if (files.length === 0) {
    throw new Error('audio catalog probe returned no metadata records');
  }
  return {
    identity: {
      revisionId: musicPage.revisionId,
      revisionTimestamp: musicPage.revisionTimestamp
    },
    snapshot: {
      files: files.sort(compareByCanonicalJson),
      musicPage
    }
  };
}

async function probeBossSource({ wikiApiUrl, zhWikiApiUrl, dependencies }) {
  const overview = await fetchBossOverviewSections({ wikiApiUrl, dependencies });
  const entries = discoverBossEntries(overview.sections);
  if (entries.length === 0) {
    throw new Error('Bosses overview did not yield any governed boss entries');
  }
  const bossLimit = positiveInteger(dependencies.bossCatalogMaxEntries, MAX_BOSS_CATALOG_ENTRIES);
  if (entries.length > bossLimit) {
    throw new Error(`Bosses overview exceeds governed boss entry limit ${bossLimit}`);
  }
  const englishMetadata = await resolvePageMetadata({
    titles: ['Bosses', ...entries.map((entry) => entry.pageTitleEn)],
    apiUrl: wikiApiUrl,
    includeLanglinks: true,
    langlinksLanguage: 'zh',
    batchSize: METADATA_BATCH_SIZE,
    dependencies
  });
  const englishByRequestedTitle = metadataByRequestedTitle(englishMetadata, 'boss English metadata');
  const overviewMetadata = requirePageMetadata(englishByRequestedTitle.get('Bosses'), 'Bosses');
  const bossRecords = entries.map((entry) => {
    const english = requirePageMetadata(englishByRequestedTitle.get(entry.pageTitleEn), entry.pageTitleEn);
    const target = resolveBossZhTarget(entry.titleEn, english.langlinkTitle);
    return {
      ...entry,
      english,
      target
    };
  });
  const zhTargets = uniqueSorted(bossRecords.map((record) => record.target.pageTitleZh).filter(Boolean));
  const zhMetadata = zhTargets.length === 0
    ? []
    : await resolvePageMetadata({
      titles: zhTargets,
      apiUrl: zhWikiApiUrl,
      includeLanglinks: false,
      batchSize: METADATA_BATCH_SIZE,
      dependencies
    });
  const zhByRequestedTitle = metadataByRequestedTitle(zhMetadata, 'boss Chinese metadata');

  return {
    identity: {
      revisionId: overviewMetadata.revisionId,
      revisionTimestamp: overviewMetadata.revisionTimestamp
    },
    snapshot: {
      overview: {
        page: overviewMetadata,
        sections: normalizeBossSections(overview.sections)
      },
      bosses: bossRecords.map((record) => ({
        progressionOrder: record.progressionOrder,
        orderWithinGroup: record.orderWithinGroup,
        groupNameEn: record.groupNameEn,
        groupNameZh: record.groupNameZh,
        groupType: record.groupType,
        titleEn: record.titleEn,
        english: record.english,
        titleZh: record.target.titleZh,
        chinese: record.target.pageTitleZh
          ? requirePageMetadata(zhByRequestedTitle.get(record.target.pageTitleZh), record.target.pageTitleZh)
          : null
      })).sort(compareByCanonicalJson)
    }
  };
}

async function probeShimmerSource({ zhWikiApiUrl, dependencies }) {
  const source = await fetchShimmerSourcePage({ zhWikiApiUrl, dependencies });
  const titles = uniqueSorted((dependencies.collectShimmerCandidateTitles ?? collectShimmerCandidateTitles)(source));
  if (titles.length === 0) {
    throw new Error('微光 source page did not yield any candidate titles');
  }
  const candidateLimit = positiveInteger(dependencies.shimmerCandidateMaxTitles, MAX_SHIMMER_CANDIDATE_TITLES);
  if (titles.length > candidateLimit) {
    throw new Error(`微光 source page exceeds governed candidate title limit ${candidateLimit}`);
  }
  const candidates = await resolvePageMetadata({
    titles,
    apiUrl: zhWikiApiUrl,
    includeLanglinks: true,
    langlinksLanguage: 'en',
    batchSize: SHIMMER_METADATA_BATCH_SIZE,
    dependencies
  });
  const normalizedCandidates = candidates
    .map((candidate) => requirePageMetadata(candidate, candidate?.requestedTitle ?? '微光 candidate'))
    .sort(compareByCanonicalJson);
  return {
    identity: {
      revisionId: source.revisionId,
      revisionTimestamp: source.revisionTimestamp
    },
    snapshot: {
      source: {
        pageId: source.pageId,
        pageTitle: source.pageTitle,
        requestedTitle: '微光',
        revisionId: source.revisionId,
        revisionTimestamp: source.revisionTimestamp,
        htmlHash: createContentHash(source.html)
      },
      candidates: normalizedCandidates
    }
  };
}

async function fetchBossOverviewSections({ wikiApiUrl, dependencies }) {
  const url = new URL(wikiApiUrl);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', 'Bosses');
  url.searchParams.set('prop', 'sections');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('format', 'json');
  const payload = await (dependencies.fetchJson ?? fetchWikiApiJson)({
    url,
    profile: 'parse',
    sourceKey: 'Bosses:sections'
  });
  const sections = Array.isArray(payload?.parse?.sections) ? payload.parse.sections : [];
  if (sections.length === 0) {
    throw new Error('Bosses overview sections are missing');
  }
  return { sections };
}

async function fetchShimmerSourcePage({ zhWikiApiUrl, dependencies }) {
  const fetchJson = dependencies.fetchJson ?? fetchWikiApiJson;
  const revisionUrl = new URL(zhWikiApiUrl);
  revisionUrl.searchParams.set('action', 'query');
  revisionUrl.searchParams.set('titles', '微光');
  revisionUrl.searchParams.set('prop', 'revisions');
  revisionUrl.searchParams.set('rvprop', 'timestamp|ids');
  revisionUrl.searchParams.set('redirects', '1');
  revisionUrl.searchParams.set('formatversion', '2');
  revisionUrl.searchParams.set('format', 'json');
  const revisionPayload = await fetchJson({
    url: revisionUrl,
    profile: 'revision',
    sourceKey: '微光'
  });
  const page = revisionPayload?.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  if (!page || page.missing || page.pageid == null || revision?.revid == null || !revision?.timestamp) {
    throw new Error('微光 source page revision is missing or revisionless');
  }

  const htmlUrl = new URL(zhWikiApiUrl);
  htmlUrl.searchParams.set('action', 'parse');
  htmlUrl.searchParams.set('page', '微光');
  htmlUrl.searchParams.set('prop', 'text');
  htmlUrl.searchParams.set('redirects', '1');
  htmlUrl.searchParams.set('formatversion', '2');
  htmlUrl.searchParams.set('format', 'json');
  const htmlPayload = await fetchJson({
    url: htmlUrl,
    profile: 'parse',
    sourceKey: '微光:html'
  });
  const html = htmlPayload?.parse?.text;
  if (typeof html !== 'string' || html.trim() === '') {
    throw new Error('微光 source page rendered HTML is missing');
  }
  return {
    pageId: page.pageid,
    pageTitle: normalizeText(page.title) ?? '微光',
    revisionId: revision.revid,
    revisionTimestamp: revision.timestamp,
    html
  };
}

async function resolvePageMetadata({
  titles,
  apiUrl,
  includeLanglinks,
  langlinksLanguage = 'zh',
  batchSize,
  dependencies
}) {
  return (dependencies.fetchPageMetadataBatch ?? fetchWikiPageMetadataBatch)({
    titles,
    apiUrl,
    includeLanglinks,
    langlinksLanguage,
    batchSize,
    fetchWikiApiJsonImpl: dependencies.fetchJson ?? fetchWikiApiJson
  });
}

function discoverBossEntries(sections) {
  const entries = [];
  let currentGroup = null;
  let progressionOrder = 1;
  let orderWithinGroup = 0;
  for (const section of sections) {
    const level = Number(section?.level ?? 0);
    const line = normalizeText(section?.line);
    if (!line) continue;
    if (level === 2) {
      currentGroup = BOSS_GROUP_CONFIG[line] ? { line, ...BOSS_GROUP_CONFIG[line] } : null;
      orderWithinGroup = 0;
      continue;
    }
    if (level === 3 && currentGroup) {
      orderWithinGroup += 1;
      entries.push({
        progressionOrder: progressionOrder++,
        orderWithinGroup,
        groupNameEn: currentGroup.line,
        groupNameZh: currentGroup.groupNameZh,
        groupType: currentGroup.groupType,
        titleEn: line,
        pageTitleEn: line
      });
    }
  }
  return entries;
}

function resolveBossZhTarget(titleEn, langlinkTitle) {
  const pillarNameZh = resolveCelestialPillarNameZhByEnglishTitle(titleEn);
  if (!langlinkTitle && pillarNameZh) {
    return { titleZh: pillarNameZh, pageTitleZh: CELESTIAL_PILLAR_SHARED_ZH_PAGE };
  }
  const normalized = normalizeText(langlinkTitle);
  return { titleZh: normalized, pageTitleZh: normalized };
}

function normalizeBossSections(sections) {
  return sections.map((section) => ({
    level: Number(section?.level ?? 0),
    line: normalizeText(section?.line),
    number: normalizeText(section?.number)
  }));
}

function normalizeAudioRecord(record) {
  const prefix = normalizeText(record?.prefix);
  const name = normalizeText(record?.name);
  const sha1 = normalizeText(record?.sha1);
  const timestamp = normalizeText(record?.timestamp);
  const mime = normalizeText(record?.mime)?.toLowerCase() ?? null;
  const size = Number(record?.size);
  if (!prefix || !name || !sha1 || !timestamp || !mime || !Number.isFinite(size) || size < 0) {
    throw new Error(`audio catalog metadata is missing for ${name ?? prefix ?? 'unknown file'}`);
  }
  return { prefix, name, sha1, timestamp, mime, size };
}

function requirePageMetadata(metadata, context) {
  const requestedTitle = normalizeText(metadata?.requestedTitle) ?? normalizeText(context);
  const pageTitle = normalizeText(metadata?.pageTitle);
  const pageId = metadata?.pageId;
  const revisionId = metadata?.revisionId;
  const revisionTimestamp = normalizeText(metadata?.revisionTimestamp);
  if (metadata?.missing || !requestedTitle || !pageTitle || pageId == null || revisionId == null || !revisionTimestamp) {
    throw new Error(`wiki page metadata is missing or revisionless for ${context}`);
  }
  return {
    requestedTitle,
    pageTitle,
    pageId,
    revisionId,
    revisionTimestamp,
    langlinkTitle: normalizeText(metadata?.zhTitle ?? metadata?.langlinkTitle)
  };
}

function metadataByRequestedTitle(metadata, context) {
  const map = new Map();
  for (const row of metadata) {
    const normalized = requirePageMetadata(row, context);
    if (map.has(normalized.requestedTitle)) {
      throw new Error(`duplicate wiki page metadata for ${normalized.requestedTitle}`);
    }
    map.set(normalized.requestedTitle, normalized);
  }
  return map;
}

function normalizeSnapshot(snapshot) {
  return JSON.parse(canonicalJson(snapshot));
}

function uniqueSorted(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))].sort(compareText);
}

function normalizeText(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function compareText(left, right) {
  return left === right ? 0 : (left < right ? -1 : 1);
}

function compareByCanonicalJson(left, right) {
  return compareText(canonicalJson(left), canonicalJson(right));
}

function createContentHash(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
