import {
  decodeHtmlEntities,
  extractItemInfoboxImages,
  stripHtml
} from './wiki-page-utils.mjs';

const DECORATIVE_IMAGE_PATTERN = /(?:placed|map|demo|inventory[\s_-]*slot|banner|auto[\s_-]*icon)/i;

export function extractItemImageMemberEvidence({ html, identityTargets } = {}) {
  const targets = new Set(
    (identityTargets ?? [])
      .map((value) => normalizeIdentity(value))
      .filter(Boolean)
  );

  if (typeof html !== 'string' || html.length === 0 || targets.size === 0) {
    return buildResult([], 0);
  }

  const matchingBlocks = extractEvidenceBlocks(html)
    .map((block) => ({
      ...block,
      anchorTitle: block.anchorTitles.find((title) => targets.has(normalizeIdentity(title))) ?? null
    }))
    .filter((block) => block.anchorTitle);

  const candidates = dedupeCandidates(
    matchingBlocks.flatMap((block) => buildBlockCandidates(block, targets))
  );

  return buildResult(candidates, matchingBlocks.length);
}

function buildResult(candidates, matchingBlockCount) {
  return {
    summary: {
      matchingBlockCount,
      candidateCount: candidates.length,
      status: candidates.length === 1
        ? 'verified'
        : candidates.length > 1
          ? 'ambiguous'
          : 'unresolved'
    },
    candidates
  };
}

function extractEvidenceBlocks(html) {
  const blocks = [
    ...extractTagBlocks(html, 'tr', 'table_row'),
    ...extractTagBlocks(html, 'li', 'list_item'),
    ...extractTagBlocks(html, 'div', 'item_block', isExplicitItemBlock)
  ];

  const ordinals = new Map();
  return blocks
    .sort((left, right) => left.start - right.start || left.evidenceKind.localeCompare(right.evidenceKind))
    .map((block) => {
      const blockOrdinal = (ordinals.get(block.evidenceKind) ?? 0) + 1;
      ordinals.set(block.evidenceKind, blockOrdinal);
      return {
        ...block,
        blockOrdinal,
        anchorTitles: extractAnchorTitles(block.html, block.evidenceKind)
      };
    });
}

function extractTagBlocks(html, tagName, evidenceKind, accept = () => true) {
  const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  const stack = [];
  const blocks = [];

  for (const match of html.matchAll(tokenPattern)) {
    const token = match[0];
    const isClosing = token.startsWith('</');
    if (!isClosing) {
      stack.push({
        start: match.index,
        accepted: accept(token)
      });
      continue;
    }

    const opening = stack.pop();
    if (!opening?.accepted) continue;
    const end = match.index + token.length;
    blocks.push({
      evidenceKind,
      start: opening.start,
      html: html.slice(opening.start, end)
    });
  }

  return blocks;
}

function isExplicitItemBlock(openingTag) {
  const className = decodeHtmlEntities(
    openingTag.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''
  );
  const classes = new Set(className.toLowerCase().split(/\s+/).filter(Boolean));
  return (classes.has('infobox') && classes.has('item'))
    || classes.has('item-block')
    || classes.has('item-entry');
}

function extractAnchorTitles(blockHtml, evidenceKind) {
  const titles = [];
  const add = (value) => {
    const title = normalizeText(value);
    if (title && !titles.includes(title)) titles.push(title);
  };

  for (const match of blockHtml.matchAll(/<(?:a|span|div)\b[^>]*\btitle\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    add(match[1]);
  }
  for (const match of blockHtml.matchAll(/\bdata-sort-value\s*=\s*["']([^"']+)["']/gi)) {
    add(match[1]);
  }
  if (evidenceKind === 'item_block') {
    for (const match of blockHtml.matchAll(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)) {
      add(stripHtml(match[1]));
    }
  }

  return titles;
}

function buildBlockCandidates(block, targets) {
  return extractItemInfoboxImages(block.html)
    .filter((image) => imageMatchesIdentity(image, targets))
    .filter((image) => !isDecorativeImage(image))
    .map((image) => ({
      evidenceKind: block.evidenceKind,
      blockOrdinal: block.blockOrdinal,
      anchorTitle: block.anchorTitle,
      fileTitle: image.fileTitle,
      url: image.url,
      width: image.width,
      height: image.height,
      contentType: image.contentType
    }));
}

function imageMatchesIdentity(image, targets) {
  return [image.fileTitle, image.alt, image.title]
    .map((value) => normalizeIdentity(value, { imageLabel: true }))
    .filter(Boolean)
    .some((value) => targets.has(value));
}

function isDecorativeImage(image) {
  return [image.fileTitle, image.url, image.alt, image.title]
    .filter(Boolean)
    .some((value) => DECORATIVE_IMAGE_PATTERN.test(decodeHtmlEntities(String(value))));
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const output = [];
  for (const candidate of candidates) {
    const key = `${normalizeIdentity(candidate.fileTitle, { imageLabel: true })}\0${normalizeImageUrl(candidate.url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output.sort((left, right) => (
    left.blockOrdinal - right.blockOrdinal
    || left.fileTitle.localeCompare(right.fileTitle)
    || left.url.localeCompare(right.url)
  ));
}

function normalizeImageUrl(value) {
  return String(value ?? '').split('?')[0];
}

function normalizeIdentity(value, { imageLabel = false } = {}) {
  let text = normalizeText(value);
  if (!text) return null;
  if (imageLabel) {
    text = text
      .replace(/^(?:File|Image):/i, '')
      .replace(/\.(?:png|gif|jpe?g|webp|svg)$/i, '')
      .replace(/\s+item\s+sprite$/i, '');
  }
  const normalized = text
    .normalize('NFKC')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return normalized || null;
}

function normalizeText(value) {
  const text = decodeHtmlEntities(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}
