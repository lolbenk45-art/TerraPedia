import { createHash } from 'node:crypto';

const HASH = /^sha256:[a-f0-9]{64}$/;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function hash(value) {
  const bytes = typeof value === 'string' ? value : JSON.stringify(stable(value));
  return `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}`;
}

export function computeArmorSetPageEffectEvidenceHash({ modulePayload, imagePayload, pages, owners } = {}) {
  return hash({ module: modulePayload, image: imagePayload, pages, owners });
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}

function revision(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} revisionId is required`);
  return value;
}

function timestamp(value, label) {
  const normalized = text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(normalized)
      || !Number.isFinite(Date.parse(normalized))) throw new Error(`${label} is invalid`);
  return new Date(normalized).toISOString();
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function htmlToText(value) {
  return decodeHtml(value)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function extractEffectTextFromHtml(html) {
  const source = String(html ?? '');
  const marker = /(?:装备全套|穿齐全套|套装效果|set bonus|following effects|full set)/i;
  const markerMatch = marker.exec(htmlToText(source));
  if (!markerMatch) return null;
  const markerIndex = source.toLowerCase().indexOf(markerMatch[0].toLowerCase());
  const afterMarker = markerIndex >= 0 ? source.slice(markerIndex) : source;
  const heading = afterMarker.search(/<h[1-6]\b/i);
  const section = heading >= 0 ? afterMarker.slice(0, heading) : afterMarker;
  const lines = [];
  for (const match of section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const line = htmlToText(match[1]);
    if (line) lines.push(line);
  }
  if (lines.length === 0) {
    const plain = htmlToText(section);
    const markerLine = plain.split('\n').findIndex((line) => marker.test(line));
    if (markerLine >= 0) lines.push(...plain.split('\n').slice(markerLine + 1).filter(Boolean));
  }
  return lines.length ? lines.join('\n') : null;
}

function normalizeModuleRecords(modulePayload) {
  if (!modulePayload || modulePayload.sourcePageTitle !== 'Module:ArmorSetBonuses'
      || !Array.isArray(modulePayload.armorSets) || modulePayload.totalArmorSets !== modulePayload.armorSets.length) {
    throw new Error('Armor page evidence requires the complete Module:ArmorSetBonuses payload');
  }
  const keys = new Set();
  return modulePayload.armorSets.map((record, index) => {
    const textKey = text(record?.textKey, `module armor set ${index} textKey`);
    if (!/^ArmorSetBonus\.[A-Za-z0-9_]+$/.test(textKey) || keys.has(textKey)) {
      throw new Error(`module armor set textKey is invalid or duplicated: ${textKey}`);
    }
    keys.add(textKey);
    return { textKey, benefitExpression: text(record.benefitExpression, `${textKey} benefitExpression`) };
  });
}

function pageTitlesByKey(imagePayload, moduleKeys) {
  if (!imagePayload || !Array.isArray(imagePayload.armorSetImages)
      || imagePayload.totalArmorSets !== moduleKeys.size
      || imagePayload.warnings?.length !== 0) throw new Error('Armor page evidence image denominator is incomplete');
  const map = new Map([...moduleKeys].map((key) => [key, new Set()]));
  for (const [index, image] of imagePayload.armorSetImages.entries()) {
    const key = text(image?.textKey, `image ${index} textKey`);
    const pageTitle = text(image?.pageTitle, `image ${index} pageTitle`);
    if (!map.has(key)) throw new Error(`image page evidence has foreign textKey: ${key}`);
    map.get(key).add(pageTitle);
  }
  if ([...map.values()].some((titles) => titles.size === 0)) throw new Error('image page evidence is missing a module owner');
  return map;
}

function normalizePagePayload(payload, requestedPageTitle, overviewFallback = null) {
  const pageTitle = text(payload?.pageTitle ?? requestedPageTitle, `${requestedPageTitle} pageTitle`);
  const rawWikitext = text(payload?.wikitext, `${requestedPageTitle} wikitext`);
  const html = text(payload?.html, `${requestedPageTitle} html`);
  const revisionId = revision(payload?.revisionId, requestedPageTitle);
  const revisionTimestamp = timestamp(payload?.revisionTimestamp, `${requestedPageTitle} revisionTimestamp`);
  const extractedEffectText = payload?.effectText ?? extractEffectTextFromHtml(html);
  const effectText = typeof extractedEffectText === 'string' && extractedEffectText.trim() !== ''
    ? extractedEffectText.trim() : overviewFallback?.effectText ?? null;
  const effectTextSource = extractedEffectText
    ? {
      kind: 'set_page', pageTitle, revisionId, revisionTimestamp,
      contentHash: hash(rawWikitext),
    }
    : effectText && overviewFallback
      ? { ...overviewFallback.source, kind: 'armor_overview' }
      : null;
  return {
    requestedPageTitle,
    pageTitle,
    pageId: Number.isSafeInteger(payload?.pageId) && payload.pageId > 0 ? payload.pageId : null,
    revisionId,
    revisionTimestamp,
    contentHash: hash(rawWikitext),
    htmlHash: hash(html),
    effectText,
    effectTextHash: effectText ? hash(effectText) : null,
    effectTextStatus: effectText ? 'resolved' : 'unresolved',
    effectTextSource,
    source: 'terraria.wiki.gg',
  };
}

export function buildArmorSetPageEffectEvidence({ modulePayload, imagePayload, pagePayloads, overview = null } = {}) {
  const moduleRecords = normalizeModuleRecords(modulePayload);
  const titles = pageTitlesByKey(imagePayload, new Set(moduleRecords.map((record) => record.textKey)));
  if (!pagePayloads || typeof pagePayloads !== 'object' || Array.isArray(pagePayloads)) {
    throw new Error('Armor page evidence pagePayloads are required');
  }
  const normalizedPages = new Map();
  const overviewRecords = new Map((overview?.records ?? []).map((record) => [record.pageTitle, record]));
  const overviewSource = overview?.pagePayload ? {
    provider: 'terraria.wiki.gg',
    pageTitle: overview.pagePayload.pageTitle,
    revisionId: revision(overview.pagePayload.revisionId, 'armor overview'),
    revisionTimestamp: timestamp(overview.pagePayload.revisionTimestamp, 'armor overview revisionTimestamp'),
    contentHash: hash(text(overview.pagePayload.wikitext, 'armor overview wikitext')),
  } : null;
  for (const [requestedPageTitle, payload] of Object.entries(pagePayloads)) {
    if (normalizedPages.has(requestedPageTitle)) throw new Error(`duplicate page evidence: ${requestedPageTitle}`);
    const overviewRecord = overviewRecords.get(requestedPageTitle);
    const overviewFallback = overviewRecord?.effectText && overviewSource
      ? { effectText: overviewRecord.effectText, source: overviewSource } : null;
    normalizedPages.set(requestedPageTitle, normalizePagePayload(payload, requestedPageTitle, overviewFallback));
  }
  const owners = moduleRecords.map((record) => {
    const pageTitles = [...titles.get(record.textKey)].sort();
    const pages = pageTitles.map((pageTitle) => {
      const page = normalizedPages.get(pageTitle);
      if (!page) throw new Error(`missing page evidence for ${record.textKey}: ${pageTitle}`);
      return page;
    });
    const primaryPage = pages.find((page) => page.effectText) ?? pages[0];
    return {
      textKey: record.textKey,
      benefitExpression: record.benefitExpression,
      pageTitles,
      primaryPage,
      alternatePages: pages.filter((page) => page !== primaryPage),
      effectTextStatus: primaryPage.effectText ? 'resolved' : 'unresolved',
    };
  });
  const allPages = [...normalizedPages.values()].sort((left, right) => left.requestedPageTitle.localeCompare(right.requestedPageTitle));
  return {
    schemaVersion: 'armor-set-page-effect-evidence/v1',
    source: { provider: 'terraria.wiki.gg', locale: 'zh', pageCount: allPages.length },
    module: { sourcePageTitle: modulePayload.sourcePageTitle, sourceRevisionId: modulePayload.sourceRevisionId ?? null,
      sourceRevisionTimestamp: modulePayload.sourceRevisionTimestamp ?? null, setCount: moduleRecords.length },
    pages: allPages,
    owners,
    summary: {
      setCount: owners.length,
      pageCount: allPages.length,
      effectTextCount: owners.filter((owner) => owner.primaryPage.effectText).length,
      unresolvedOwnerCount: owners.filter((owner) => !owner.primaryPage.effectText).length,
      unresolvedPageCount: allPages.filter((page) => !page.effectText).length,
    },
    evidenceHash: computeArmorSetPageEffectEvidenceHash({
      modulePayload,
      imagePayload,
      pages: allPages,
      owners,
    }),
  };
}

export function attachArmorSetPageEffectEvidence(modulePayload, evidence) {
  const records = normalizeModuleRecords(modulePayload);
  if (!evidence || evidence.schemaVersion !== 'armor-set-page-effect-evidence/v1') {
    throw new Error('Armor page evidence schema is invalid');
  }
  const owners = new Map(evidence.owners.map((owner) => [owner.textKey, owner]));
  if (owners.size !== records.length || owners.size !== evidence.summary.setCount) {
    throw new Error('Armor page evidence owner denominator is invalid');
  }
  return {
    ...modulePayload,
    armorSets: records.map((record) => {
      const owner = owners.get(record.textKey);
      if (!owner) throw new Error(`Armor page evidence owner is missing: ${record.textKey}`);
      const page = owner.primaryPage;
      return {
        ...modulePayload.armorSets.find((candidate) => candidate.textKey === record.textKey),
        ...(page.effectText ? {
          effectText: page.effectText,
          effectTextEvidenceHash: evidence.evidenceHash,
          effectTextSource: {
            provider: page.effectTextSource?.provider ?? page.source,
            locale: evidence.source.locale,
            kind: page.effectTextSource?.kind ?? 'set_page',
            pageTitle: page.effectTextSource?.pageTitle ?? page.pageTitle,
            revisionId: page.effectTextSource?.revisionId ?? page.revisionId,
            revisionTimestamp: page.effectTextSource?.revisionTimestamp ?? page.revisionTimestamp,
            contentHash: page.effectTextSource?.contentHash ?? page.contentHash,
            effectTextHash: page.effectTextHash,
          },
        } : {
          effectEvidenceStatus: 'unresolved',
          effectEvidencePages: owner.pageTitles,
        }),
      };
    }),
  };
}

export { extractEffectTextFromHtml };
