const DEFAULT_SAMPLE_LIMIT = 10;

export function parseBuffPageImmunityFacts({
  buffId,
  buffName,
  pageTitle,
  html,
  sampleLimit = DEFAULT_SAMPLE_LIMIT
} = {}) {
  const sectionHtml = extractImmuneNpcSectionHtml(html);
  const entries = extractImmuneNpcEntries(sectionHtml);
  if (entries.length === 0) {
    return null;
  }

  const limitedSample = entries.slice(0, Math.max(0, sampleLimit));
  return {
    buffId,
    buffName,
    pageTitle,
    immuneNpcCount: entries.length,
    immuneNpcSample: limitedSample,
    immuneNpcSource: 'buff-page-immunities',
    immuneNpcSampleSemantics: `first ${limitedSample.length} entries from the rendered buff page immunities list; immuneNpcCount is the full rendered list size`
  };
}

export function applyBuffPageImmunityFacts({
  immuneNpcCountByBuffId,
  immuneNpcSampleByBuffId,
  pageFacts
} = {}) {
  for (const [buffId, facts] of pageFacts ?? []) {
    if (!facts || !Number.isInteger(facts.immuneNpcCount) || facts.immuneNpcCount <= 0) {
      continue;
    }
    immuneNpcCountByBuffId.set(buffId, facts.immuneNpcCount);
    immuneNpcSampleByBuffId.set(buffId, facts.immuneNpcSample ?? []);
  }
}

function extractImmuneNpcSectionHtml(html) {
  if (typeof html !== 'string' || html.trim() === '') {
    return '';
  }

  const heading = findImmuneNpcHeading(html);
  if (!heading) {
    return '';
  }

  const remaining = html.slice(heading.end);
  const nextHeading = remaining.search(/<h2\b/i);
  return nextHeading >= 0 ? remaining.slice(0, nextHeading) : remaining;
}

function findImmuneNpcHeading(html) {
  const headingPattern = /<h2\b[\s\S]*?<\/h2>/gi;
  for (const match of html.matchAll(headingPattern)) {
    if (!isImmuneNpcHeading(match[0])) {
      continue;
    }
    return {
      start: match.index,
      end: match.index + match[0].length
    };
  }
  return null;
}

function isImmuneNpcHeading(markup) {
  const spanPattern = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
  for (const match of markup.matchAll(spanPattern)) {
    const attrs = parseTagAttributes(match[1]);
    const className = String(attrs.class ?? '');
    if (attrs.id !== 'Immune_NPCs' || !className.split(/\s+/).includes('mw-headline')) {
      continue;
    }
    return normalizeWhitespace(stripHtml(match[2])) === 'Immune NPCs';
  }
  return false;
}

function extractImmuneNpcEntries(sectionHtml) {
  if (typeof sectionHtml !== 'string' || sectionHtml.trim() === '') {
    return [];
  }

  const entries = [];
  const itemPattern = /<li\b[\s\S]*?<\/li>/gi;
  for (const match of sectionHtml.matchAll(itemPattern)) {
    const itemHtml = match[0];
    const link = extractPrimaryLinkedTitle(itemHtml);
    if (!link) {
      continue;
    }
    entries.push({
      npcId: null,
      name: link.text,
      pageTitle: link.pageTitle,
      internalName: pageTitleToInternalName(link.pageTitle),
      source: 'buff-page-immunities',
      sourceOrder: entries.length + 1
    });
  }
  return entries;
}

function extractPrimaryLinkedTitle(html) {
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const candidates = [];
  for (const match of html.matchAll(linkPattern)) {
    const attrs = parseTagAttributes(match[1]);
    const title = attrs.title;
    if (!title || title.startsWith('File:')) {
      continue;
    }
    const pageTitle = decodeHtmlEntities(stripHtml(title)).trim();
    const text = decodeHtmlEntities(stripHtml(match[2])).trim();
    if (!pageTitle) {
      continue;
    }
    candidates.push({
      pageTitle,
      text,
      primary: isPrimaryNpcLinkCandidate({ pageTitle, text })
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  const selected = candidates.find((candidate) => candidate.primary) ?? candidates[0];
  return {
    pageTitle: selected.pageTitle,
    text: selected.text || selected.pageTitle
  };
}

function isPrimaryNpcLinkCandidate({ pageTitle, text } = {}) {
  const normalizedText = normalizeLinkText(text);
  if (!normalizedText) {
    return false;
  }
  if (/^\([^)]*\)$/.test(normalizedText)) {
    return false;
  }
  if (/version/i.test(normalizedText)) {
    return false;
  }
  return Boolean(pageTitle);
}

function normalizeLinkText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseTagAttributes(markup) {
  const attrs = {};
  const attrPattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const match of markup.matchAll(attrPattern)) {
    attrs[match[1].toLowerCase()] = match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '');
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function pageTitleToInternalName(pageTitle) {
  const compact = String(pageTitle ?? '').replace(/\([^)]*\)/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim();
  if (!compact) {
    return null;
  }
  return compact.split(/\s+/).map((part) => part[0].toUpperCase() + part.slice(1)).join('');
}
