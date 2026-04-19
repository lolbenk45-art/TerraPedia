import {
  DEFAULT_WIKI_API_URL,
  fetchWikiApiJson,
  fetchWikiPagePayload
} from '../../../../scripts/data/lib/wiki-item-utils.mjs';

export async function resolveNpcLiveSource(
  { pageId, pageTitle, apiUrl = DEFAULT_WIKI_API_URL } = {},
  {
    fetchWikiApiJsonImpl = fetchWikiApiJson,
    fetchWikiPagePayloadImpl = fetchWikiPagePayload
  } = {}
) {
  const metadata = await fetchNpcPageMetadata({
    pageId,
    pageTitle,
    apiUrl,
    fetchWikiApiJsonImpl
  });
  const resolvedTitle = metadata.pageTitle;
  const payload = await fetchWikiPagePayloadImpl({
    pageTitle: resolvedTitle,
    apiUrl
  });
  const finalTitle = String(payload?.pageTitle ?? resolvedTitle ?? '').trim();

  return {
    entityId: toEntityId(finalTitle),
    pageTitle: finalTitle,
    pageDescription: metadata.pageDescription ?? '',
    revisionText: String(payload?.wikitext ?? ''),
    relations: {
      relatedNpcs: [],
      relatedItems: [],
      relatedBiomes: []
    },
    sourceMetadata: {
      apiUrl,
      pageId: metadata.pageId ?? payload?.pageId ?? null,
      revisionTimestamp: payload?.revisionTimestamp ?? null
    }
  };
}

async function fetchNpcPageMetadata({
  pageId,
  pageTitle,
  apiUrl,
  fetchWikiApiJsonImpl
}) {
  if (!pageId && !(typeof pageTitle === 'string' && pageTitle.trim())) {
    throw new Error('pageId or pageTitle is required');
  }

  const url = new URL(apiUrl);
  url.searchParams.set('action', 'query');
  url.searchParams.set('prop', 'info|pageprops');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  if (pageId) {
    url.searchParams.set('pageids', String(pageId));
  } else {
    url.searchParams.set('titles', String(pageTitle).trim());
  }

  const body = await fetchWikiApiJsonImpl({
    url,
    profile: 'revision',
    sourceKey: pageId ? String(pageId) : String(pageTitle).trim()
  });
  const page = Array.isArray(body?.query?.pages) ? body.query.pages[0] : null;
  const resolvedTitle = String(page?.title ?? '').trim();

  if (!page || page.missing || !resolvedTitle) {
    throw new Error(`NPC page metadata not found for ${pageId ? `pageId=${pageId}` : `pageTitle=${pageTitle}`}`);
  }

  return {
    pageId: page?.pageid ?? null,
    pageTitle: resolvedTitle,
    pageDescription: String(page?.pageprops?.description ?? '').trim()
  };
}

function toEntityId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
