const DEFAULT_SAMPLE_LIMIT = 10;

export function parseBuffPageEvidence({
  buffId,
  buffName,
  pageTitle,
  canonicalPageTitle = null,
  revisionId = null,
  revisionTimestamp = null,
  html,
  wikitext,
  sections = [],
  sampleLimit = DEFAULT_SAMPLE_LIMIT
} = {}) {
  const sectionIndex = buildSectionIndex({ html, wikitext, sections });
  const playerSection = firstSection(sectionIndex, ['来自玩家', 'From player']);
  const enemySection = firstSection(sectionIndex, ['来自敌怪', 'From enemy']);
  const environmentSection = firstSection(sectionIndex, ['来自环境', 'From environment']);
  const immuneSection = firstSection(sectionIndex, ['免疫的 NPC', 'Immune NPCs']);
  const playerSourceItems = parseBuffCauseEntries(playerSection?.html, {
    sourceKind: 'player',
    sourceSection: playerSection?.line ?? null
  });
  const environmentSourceItems = parseBuffCauseEntries(environmentSection?.html, {
    sourceKind: 'environment',
    sourceSection: environmentSection?.line ?? null
  });
  const sourceItems = [
    ...playerSourceItems,
    ...environmentSourceItems
  ];
  const inflictingNpcs = parseBuffCauseEntries(enemySection?.html, {
    sourceKind: 'enemy',
    sourceSection: enemySection?.line ?? null
  });
  const immuneNpcs = extractImmuneNpcEntries(immuneSection?.html ?? extractImmuneNpcSectionHtml(html));
  const immuneNpcSample = immuneNpcs.slice(0, Math.max(0, sampleLimit));
  const factGroups = {
    sourceItems: factGroupStatus({
      sections: [playerSection, environmentSection],
      rows: sourceItems
    }),
    inflictingNpcs: factGroupStatus({
      sections: [enemySection],
      rows: inflictingNpcs
    }),
    immuneNpcs: factGroupStatus({
      sections: [immuneSection],
      rows: immuneNpcs
    })
  };
  const unresolvedFacts = Object.entries(factGroups)
    .filter(([, status]) => status.status === 'no_rows')
    .map(([group, status]) => ({
      group,
      status: status.status,
      sections: status.sections
    }));
  const parseStatus = unresolvedFacts.length === 0 ? 'parsed' : 'parse_incomplete';

  return {
    buffId,
    buffName,
    pageTitle,
    sourceItems,
    inflictingNpcs,
    immuneNpcs,
    immuneNpcCount: immuneNpcs.length,
    immuneNpcSample,
    immuneNpcSource: immuneNpcs.length > 0 ? 'buff-page-immunities' : null,
    immuneNpcSampleSemantics: immuneNpcs.length > 0
      ? `first ${immuneNpcSample.length} entries from the rendered buff page immunities list; immuneNpcCount is the full rendered list size`
      : null,
    sourceEvidence: {
      provider: 'terraria.wiki.gg',
      pageTitle,
      canonicalPageTitle: canonicalPageTitle ?? pageTitle ?? null,
      revisionId,
      revisionTimestamp,
      sectionAnchors: Array.isArray(sections)
        ? sections.map((section) => section?.anchor).filter(Boolean)
        : [],
      sourceSections: [
        playerSection?.line,
        enemySection?.line,
        environmentSection?.line,
        immuneSection?.line
      ].filter(Boolean),
      parseStatus,
      factGroups,
      unresolvedFacts
    }
  };
}

function factGroupStatus({ sections = [], rows = [] } = {}) {
  const presentSections = sections
    .filter(Boolean)
    .map((section) => section.line ?? section.anchor ?? null)
    .filter(Boolean);
  if (rows.length > 0) {
    return {
      status: 'parsed',
      count: rows.length,
      sections: presentSections
    };
  }
  if (presentSections.length > 0) {
    return {
      status: 'no_rows',
      count: 0,
      sections: presentSections
    };
  }
  return {
    status: 'section_missing',
    count: 0,
    sections: []
  };
}

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
    if (!['Immune_NPCs', '免疫的_NPC'].includes(attrs.id) || !className.split(/\s+/).includes('mw-headline')) {
      continue;
    }
    return ['Immune NPCs', '免疫的 NPC'].includes(normalizeWhitespace(stripHtml(match[2])));
  }
  return false;
}

function buildSectionIndex({ html, sections } = {}) {
  const htmlSections = extractHtmlSections(html);
  const index = new Map();

  for (const section of sections ?? []) {
    const line = normalizeWhitespace(section?.line);
    const anchor = normalizeWhitespace(section?.anchor);
    if (!line && !anchor) {
      continue;
    }
    const htmlSection = htmlSections.find((candidate) => {
      return candidate.anchor === anchor || candidate.line === line;
    });
    const entry = {
      line,
      anchor,
      html: htmlSection?.html ?? ''
    };
    if (line) {
      index.set(line, entry);
    }
    if (anchor) {
      index.set(anchor, entry);
    }
  }

  for (const section of htmlSections) {
    if (section.line && !index.has(section.line)) {
      index.set(section.line, section);
    }
    if (section.anchor && !index.has(section.anchor)) {
      index.set(section.anchor, section);
    }
  }

  return index;
}

function extractHtmlSections(html) {
  if (typeof html !== 'string' || html.trim() === '') {
    return [];
  }

  const headingPattern = /<h([2-6])\b[\s\S]*?<\/h\1>/gi;
  const headings = [];
  for (const match of html.matchAll(headingPattern)) {
    const metadata = extractHeadingMetadata(match[0]);
    if (!metadata) {
      continue;
    }
    headings.push({
      ...metadata,
      level: Number(match[1]),
      start: match.index,
      end: match.index + match[0].length
    });
  }

  return headings.map((heading, index) => {
    const next = headings.find((candidate, candidateIndex) => {
      return candidateIndex > index && candidate.level <= heading.level;
    });
    const end = next?.start ?? html.length;
    return {
      line: heading.line,
      anchor: heading.anchor,
      html: html.slice(heading.end, end)
    };
  });
}

function extractHeadingMetadata(markup) {
  const spanPattern = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
  for (const match of markup.matchAll(spanPattern)) {
    const attrs = parseTagAttributes(match[1]);
    const className = String(attrs.class ?? '');
    if (!className.split(/\s+/).includes('mw-headline')) {
      continue;
    }
    const line = normalizeWhitespace(stripHtml(match[2]));
    if (!line) {
      continue;
    }
    return {
      line,
      anchor: attrs.id ?? null
    };
  }
  return null;
}

function firstSection(index, names) {
  for (const name of names) {
    const section = index.get(name);
    if (section) {
      return section;
    }
  }
  return null;
}

function parseBuffCauseEntries(sectionHtml, { sourceKind, sourceSection } = {}) {
  if (typeof sectionHtml !== 'string' || sectionHtml.trim() === '') {
    return [];
  }

  const blocks = [...sectionHtml.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  if (blocks.length === 0) {
    blocks.push(...[...sectionHtml.matchAll(/<li\b[\s\S]*?<\/li>/gi)].map((match) => match[0]));
  }

  const entries = [];
  for (const block of blocks) {
    if (/<th\b/i.test(block)) {
      continue;
    }
    const link = extractPrimaryLinkedTitle(block);
    if (!link) {
      continue;
    }
    entries.push({
      name: link.text,
      pageTitle: link.pageTitle,
      internalName: pageTitleToInternalName(link.pageTitle),
      source: 'buff-page-causes',
      sourceKind,
      sourceSection,
      sourceOrder: entries.length + 1
    });
  }

  return entries;
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
