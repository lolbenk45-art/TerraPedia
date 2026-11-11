const DEFAULT_SAMPLE_LIMIT = 10;
const PLAYER_SOURCE_SECTION_NAMES = ['来自玩家', 'From player', 'From_player'];
const ITEM_SOURCE_SECTION_NAMES = ['来自物品', 'From item', 'From_item'];
const ENEMY_SOURCE_SECTION_NAMES = ['来自敌怪', 'From enemy', 'From_enemy', 'From NPCs', 'From_NPCs'];
const ENVIRONMENT_SOURCE_SECTION_NAMES = ['来自环境', 'From environment', 'From_environment'];
const IMMUNE_NPC_SECTION_NAMES = ['免疫的 NPC', '免疫的_NPC', 'Immune NPCs', 'Immune_NPCs'];

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
  const playerSections = findSections(sectionIndex, PLAYER_SOURCE_SECTION_NAMES);
  const itemSections = findSections(sectionIndex, ITEM_SOURCE_SECTION_NAMES);
  const enemySections = findSections(sectionIndex, ENEMY_SOURCE_SECTION_NAMES);
  const environmentSections = findSections(sectionIndex, ENVIRONMENT_SOURCE_SECTION_NAMES);
  const immuneSection = firstSection(sectionIndex, IMMUNE_NPC_SECTION_NAMES);
  const templateBinding = bindImmunityTemplateTarget({ wikitext, buffId, buffName, pageTitle: canonicalPageTitle ?? pageTitle });
  const immunityTargetBinding = bindRenderedImmunityTarget({ templateBinding, html: immuneSection?.html, buffName });
  const targetRejected = ['mismatch', 'ambiguous'].includes(immunityTargetBinding.status)
    || (immunityTargetBinding.status === 'unverified' && Boolean(buffId || buffName) && Boolean(immuneSection));
  const playerSourceItems = parseBuffCauseEntriesFromSections(playerSections, { sourceKind: 'player' });
  const itemSourceItems = parseBuffCauseEntriesFromSections(itemSections, { sourceKind: 'item' });
  const environmentSourceItems = parseBuffCauseEntriesFromSections(environmentSections, { sourceKind: 'environment' });
  const sourceItems = [
    ...playerSourceItems,
    ...itemSourceItems,
    ...environmentSourceItems
  ];
  const inflictingNpcs = parseBuffCauseEntriesFromSections(enemySections, { sourceKind: 'enemy' });
  const rawImmuneNpcs = targetRejected ? [] : extractImmuneNpcEntries(immuneSection?.html ?? extractImmuneNpcSectionHtml(html));
  const immuneNpcs = dedupeImmuneNpcEntries(rawImmuneNpcs);
  const immuneNpcSample = immuneNpcs.slice(0, Math.max(0, sampleLimit));
  const factGroups = {
    sourceItems: factGroupStatus({
      sections: [...playerSections, ...itemSections, ...environmentSections],
      rows: sourceItems
    }),
    inflictingNpcs: factGroupStatus({
      sections: enemySections,
      rows: inflictingNpcs
    }),
    immuneNpcs: factGroupStatus({
      sections: [immuneSection],
      rows: immuneNpcs
    })
  };
  if (targetRejected) {
    factGroups.immuneNpcs.status = `target_${immunityTargetBinding.status}`;
  }
  const unresolvedFacts = Object.entries(factGroups)
    .filter(([, status]) => ['no_rows', 'target_mismatch', 'target_ambiguous', 'target_unverified'].includes(status.status))
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
    immuneNpcRawCount: rawImmuneNpcs.length,
    immuneNpcSample,
    immuneNpcSource: immuneNpcs.length > 0 ? 'buff-page-immunities' : null,
    immuneNpcSampleSemantics: immuneNpcs.length > 0
      ? `first ${immuneNpcSample.length} unique page identities from the rendered buff page immunities list; immuneNpcCount is the unique rendered identity count`
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
        ...playerSections.map((section) => section?.line ?? section?.anchor),
        ...itemSections.map((section) => section?.line ?? section?.anchor),
        ...enemySections.map((section) => section?.line ?? section?.anchor),
        ...environmentSections.map((section) => section?.line ?? section?.anchor),
        immuneSection?.line
      ].filter(Boolean),
      parseStatus,
      factGroups,
      immunityTargetBinding,
      unresolvedFacts
    }
  };
}

function dedupeImmuneNpcEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const identity = String(entry?.pageTitle ?? entry?.internalName ?? '').trim();
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function bindRenderedImmunityTarget({ templateBinding, html, buffName }) {
  if (!buffName || !['matched', 'unverified'].includes(templateBinding.status)) return templateBinding;
  const targets = [];
  for (const match of String(html ?? '').matchAll(/<div\b[^>]*\bclass\s*=\s*(["'])[^"']*\bheading\b[^"']*\1[^>]*>([\s\S]*?)<\/div>/gi)) {
    const label = normalizeWhitespace(decodeHtmlEntities(stripHtml(match[2])));
    const target = /^Enemies immune to (.+)$/i.exec(label)?.[1];
    if (target) targets.push(target);
  }
  if (!targets.length) return templateBinding;
  if (targets.length !== 1) return { status: 'ambiguous', targets };
  if (templateBinding.status === 'matched' && templateBinding.displayName
      && normalizeWhitespace(targets[0]) === normalizeWhitespace(templateBinding.displayName)) {
    return templateBinding;
  }
  const matched = normalizeWhitespace(targets[0]).toLowerCase() === normalizeWhitespace(buffName).toLowerCase();
  return { status: matched ? 'matched' : 'mismatch', targets };
}

function bindImmunityTemplateTarget({ wikitext, buffId, buffName, pageTitle }) {
  const text = String(wikitext ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const headings = [...text.matchAll(/^(={2,6})\s*(.*?)\s*\1\s*$/gm)];
  const normalize = value => String(value ?? '').replaceAll('_', ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const heading = headings.find(match => IMMUNE_NPC_SECTION_NAMES.some(name => normalize(name) === normalize(match[2])));
  if (!heading) return { status: 'unverified', targets: [] };
  const next = headings.find(match => match.index > heading.index && match[1].length <= heading[1].length);
  let section = text.slice(heading.index + heading[0].length, next?.index ?? text.length);
  // This literal magic word is determined by the captured canonical main page;
  // arbitrary nested templates still require separate expansion evidence.
  if (typeof pageTitle === 'string' && !pageTitle.includes(':')) {
    section = section.replace(/\{\{PAGENAME\}\}/g, () => pageTitle);
  }
  const invocations = [...section.matchAll(/\{\{\s*(?:Template:)?immunities\s*\|/gi)];
  const targets = [...section.matchAll(/\{\{\s*(?:Template:)?immunities\s*\|\s*(?:1\s*=\s*)?([^|{}]+?)(?=\||\}\})/gi)]
    .map(match => match[1].trim());
  if (!invocations.length) return { status: 'unverified', targets: [] };
  // A merged rendered list cannot safely be split between multiple invocations.
  if (invocations.length !== 1 || targets.length !== 1 || (!buffName && !buffId)) {
    return { status: 'ambiguous', targets };
  }
  const matched = normalize(targets[0]) === normalize(buffName)
    || (/^[1-9]\d*$/.test(targets[0]) && Number(targets[0]) === Number(buffId));
  const displayName = /\{\{\s*(?:Template:)?immunities\s*\|[^{}]*?\|\s*name\s*=\s*([^|{}]+?)(?=\||\}\})/i.exec(section)?.[1]?.trim();
  return { status: matched ? 'matched' : 'mismatch', targets, ...(displayName ? { displayName } : {}) };
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

function findSections(index, names) {
  const sections = [];
  const seen = new Set();
  for (const name of names) {
    const section = index.get(name);
    if (!section) {
      continue;
    }
    const key = `${section.line ?? ''}\u0000${section.anchor ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    sections.push(section);
  }
  return sections;
}

function parseBuffCauseEntriesFromSections(sections, { sourceKind } = {}) {
  return sections.flatMap((section) => parseBuffCauseEntries(section?.html, {
    sourceKind,
    sourceSection: section?.line ?? section?.anchor ?? null
  }));
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
    if (!isEntityLinkCandidate({ pageTitle, text })) {
      continue;
    }
    candidates.push({
      pageTitle,
      text,
      primary: isPrimaryLinkCandidate({ pageTitle, text })
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

function isEntityLinkCandidate({ pageTitle, text } = {}) {
  const normalizedPageTitle = normalizeLinkText(pageTitle);
  const normalizedText = normalizeLinkText(text);
  if (!normalizedPageTitle) {
    return false;
  }
  if (isNonEntityPageTitle(normalizedPageTitle)) {
    return false;
  }
  if (normalizedText && isNonEntityLinkText(normalizedText)) {
    return false;
  }
  return true;
}

function isPrimaryLinkCandidate({ pageTitle, text } = {}) {
  const normalizedText = normalizeLinkText(text);
  if (/^\([^)]*\)$/.test(normalizedText)) {
    return false;
  }
  if (/version/i.test(normalizedText)) {
    return false;
  }
  return Boolean(pageTitle);
}

function isNonEntityPageTitle(pageTitle) {
  const normalized = normalizeLinkText(pageTitle);
  return /^(classic|expert|master|journey) mode$/i.test(normalized)
    || /^(desktop|console|mobile|old-gen console|3ds|nintendo switch|tmodloader) version(?: history)?$/i.test(normalized)
    || /^version history$/i.test(normalized)
    || /^legacy:.*\bversion\b/i.test(normalized);
}

function isNonEntityLinkText(text) {
  const normalized = normalizeLinkText(text);
  return /^\d+(?:\.\d+)?$/.test(normalized)
    || /^\([^)]*\bversions?\)$/i.test(normalized)
    || /\bversions?\b/i.test(normalized)
    || /^(classic|expert|master|journey) mode$/i.test(normalized);
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
