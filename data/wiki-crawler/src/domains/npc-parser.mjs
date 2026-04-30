import { normalizeNpcLootRows } from './npc-loot-parser.mjs';

const LIFEFORM_PATTERN = /\{\{Lifeform Analyzer note\|([\s\S]*?)\}\}/i;
const SHIMMER_PATTERN = /\{\{NPC shimmered form\|([\s\S]*?)\}\}/i;
const LIVING_PREFERENCES_PATTERN = /\{\{living preferences\|([\s\S]*?)\}\}/i;
const LIFEFORM_REMOVE_PATTERN = /\{\{Lifeform Analyzer note\|[\s\S]*?\}\}/gi;
const SHIMMER_REMOVE_PATTERN = /\{\{NPC shimmered form\|[\s\S]*?\}\}/gi;
const SECTION_HEADING_REGEX = /^\s*={2,}\s*[^=]+?\s*={2,}/m;
const FILE_BLOCK_PATTERN = /\[\[File:[\s\S]*?\]\]\s*/gi;
const DABLINK_PATTERN = /\{\{dablink\|[\s\S]*?\}\}\s*/gi;
const PRONOUN_ONLY_BOUND_VARIANTS = new Set(['he', 'she', 'it', 'they']);

function cleanParagraph(text) {
  return text
    .replace(/'''+/g, '')
    .replace(/''/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldSkipParagraph(text) {
  const normalized = text.trim();
  return !normalized || normalized.startsWith('{{') || normalized.startsWith('==');
}

function limitToIntroText(text) {
  const match = SECTION_HEADING_REGEX.exec(text);
  if (!match) {
    return text;
  }
  return text.slice(0, match.index);
}

function stripLeadNoiseBlocks(text) {
  return String(text ?? '')
    .replace(FILE_BLOCK_PATTERN, '')
    .replace(DABLINK_PATTERN, '');
}

function findFirstReadableParagraph(text) {
  const intro = stripLeadNoiseBlocks(limitToIntroText(String(text ?? '')));
  const chunks = intro.split(/\r?\n\r?\n/);
  for (const chunk of chunks) {
    const withoutList = chunk
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('*'))
      .join(' ');
    const normalized = withoutList.replace(/\r?\n/g, ' ').trim();
    if (shouldSkipParagraph(normalized)) {
      continue;
    }
    return cleanParagraph(normalized);
  }
  return '';
}

function splitList(value) {
  if (!value) {
    return [];
  }
  return value
    .split('/')
    .map((element) => element.trim())
    .filter(Boolean);
}

function findBalancedTemplateBlocks(text, templateName) {
  const escapedName = templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startPattern = new RegExp(`\\{\\{\\s*${escapedName}(?=\\s*(?:\\||\\}\\}))`, 'gi');
  const blocks = [];
  let match;

  while ((match = startPattern.exec(text)) !== null) {
    let depth = 0;
    let end = -1;

    for (let index = match.index; index < text.length - 1; index += 1) {
      if (text[index] === '{' && text[index + 1] === '{') {
        depth += 1;
        index += 1;
        continue;
      }

      if (text[index] === '}' && text[index + 1] === '}') {
        depth -= 1;
        index += 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }

    if (end < 0) {
      break;
    }

    blocks.push(text.slice(match.index, end));
    startPattern.lastIndex = end;
  }

  return blocks;
}

function getTemplateInner(block, templateName) {
  const escapedName = templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openPattern = new RegExp(`^\\{\\{\\s*${escapedName}\\s*(?:\\|)?`, 'i');
  const openMatch = openPattern.exec(block);
  if (!openMatch) {
    return '';
  }
  return block.slice(openMatch[0].length, -2);
}

function splitTopLevelTemplateArgs(value) {
  const text = String(value ?? '');
  const parts = [];
  let start = 0;
  let templateDepth = 0;
  let linkDepth = 0;

  for (let index = 0; index < text.length; index += 1) {
    const pair = text.slice(index, index + 2);
    if (pair === '{{') {
      templateDepth += 1;
      index += 1;
      continue;
    }
    if (pair === '}}' && templateDepth > 0) {
      templateDepth -= 1;
      index += 1;
      continue;
    }
    if (pair === '[[') {
      linkDepth += 1;
      index += 1;
      continue;
    }
    if (pair === ']]' && linkDepth > 0) {
      linkDepth -= 1;
      index += 1;
      continue;
    }
    if (text[index] === '|' && templateDepth === 0 && linkDepth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(text.slice(start));
  return parts;
}

function parseInfoboxFields(revisionText) {
  const block = findInfoboxBlock(revisionText);
  if (!block) {
    return {};
  }

  const openingMatch = /^\{\{npc infobox\b/i.exec(block.text);
  const prefixLength = openingMatch ? openingMatch[0].length : 0;
  const suffixLength = block.closed ? 2 : 0;
  const inner = block.text.slice(prefixLength, block.text.length - suffixLength).trim();
  const lines = inner.split(/\r?\n/);
  const fields = {};
  let currentKey;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('|')) {
      const fieldMatch = /^\|\s*([^=]+?)\s*=\s*(.*)$/.exec(trimmed);
      if (!fieldMatch) {
        currentKey = undefined;
        continue;
      }
      const key = fieldMatch[1].toLowerCase().replace(/[\s_]+/g, '');
      fields[key] = fieldMatch[2].trim();
      currentKey = key;
      continue;
    }

    if (currentKey) {
      fields[currentKey] = `${fields[currentKey]} ${trimmed}`.trim();
    }
  }

  return fields;
}

function stripSpecialForms(text) {
  return text.replace(LIFEFORM_REMOVE_PATTERN, '').replace(SHIMMER_REMOVE_PATTERN, '');
}

function findInfoboxBlock(revisionText) {
  const text = String(revisionText ?? '');
  const startMatch = /\{\{npc infobox\b/i.exec(text);
  if (!startMatch) {
    return null;
  }

  let depth = 0;
  let closingIndex = text.length;
  let closed = false;

  for (let i = startMatch.index; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') {
      depth++;
      i++;
      continue;
    }

    if (text[i] === '}' && text[i + 1] === '}') {
      depth--;
      i++;
      if (depth === 0) {
        closed = true;
        closingIndex = i + 1;
        break;
      }
    }
  }

  if (!closed) {
    const remainder = text.slice(startMatch.index);
    const blankMatch = /\r?\n\r?\n/.exec(remainder);
    const fallbackEnd = blankMatch ? startMatch.index + blankMatch.index : text.length;
    return {
      start: startMatch.index,
      end: startMatch.index,
      closed: false,
      text: text.slice(startMatch.index, fallbackEnd)
    };
  }

  return {
    start: startMatch.index,
    end: closingIndex,
    closed: true,
    text: text.slice(startMatch.index, closingIndex)
  };
}

function removeInfoboxBlock(revisionText) {
  const block = findInfoboxBlock(revisionText);
  if (!block || !block.closed) {
    return String(revisionText ?? '');
  }
  const text = String(revisionText ?? '');
  return `${text.slice(0, block.start)}${text.slice(block.end)}`;
}

export function extractNpcLeadSummary({ pageDescription = '', revisionText = '' } = {}) {
  const cleaned = removeInfoboxBlock(revisionText);
  const lead = findFirstReadableParagraph(cleaned);
  if (lead) {
    return lead;
  }
  return cleanParagraph(String(pageDescription ?? ''));
}

export function extractNpcInfobox(revisionText) {
  const fields = parseInfoboxFields(revisionText);
  return {
    baseDamageText: fields.damage ?? '',
    environment: splitList(fields.environment),
    extraDamageText: fields.damage2 ?? '',
    kind: fields.type ?? '',
    projectileId: fields.idprojectile ?? '',
    subtypes: splitList(fields.type2)
  };
}

export function extractNpcSpecialForms(revisionText) {
  const lifeformMatch = LIFEFORM_PATTERN.exec(String(revisionText ?? ''));
  const shimmerMatch = SHIMMER_PATTERN.exec(String(revisionText ?? ''));
  const shimmerArgs = shimmerMatch
    ? shimmerMatch[1]
        .split('|')
        .map((arg) => arg.trim())
        .filter(Boolean)
    : [];

  const candidateBoundVariantName = lifeformMatch ? lifeformMatch[1].split('|')[0].trim() : undefined;
  const normalizedBoundVariant = String(candidateBoundVariantName ?? '').trim().toLowerCase();

  return {
    boundVariantName: candidateBoundVariantName && !PRONOUN_ONLY_BOUND_VARIANTS.has(normalizedBoundVariant)
      ? candidateBoundVariantName
      : undefined,
    shimmerForm: {
      args: shimmerArgs,
      present: Boolean(shimmerMatch)
    }
  };
}

export function extractNpcShop(revisionText) {
  const text = String(revisionText ?? '');
  const items = [];

  for (const block of findBalancedTemplateBlocks(text, 'shop row')) {
    const parts = splitTopLevelTemplateArgs(getTemplateInner(block, 'shop row'))
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) {
      continue;
    }

    const name = parts[0];
    let valueText = '';
    const freeText = [];

    for (const part of parts.slice(1)) {
      if (part.startsWith('value=')) {
        valueText = part.slice('value='.length).trim();
        continue;
      }
      freeText.push(part);
    }

    items.push({
      name,
      valueText,
      availabilityNote: freeText.join(' ').trim()
    });
  }

  return { items };
}

function cleanWikiCell(value) {
  return String(value ?? '')
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''+/g, '')
    .replace(/''/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDropsSection(revisionText) {
  const text = String(revisionText ?? '');
  const headingPattern = /^==\s*(?:Drops?|Loot)\s*==\s*$/gim;
  const heading = headingPattern.exec(text);
  if (!heading) {
    return '';
  }
  const sectionStart = heading.index + heading[0].length;
  const nextHeadingPattern = /^==\s*[^=]+?\s*==\s*$/gim;
  nextHeadingPattern.lastIndex = sectionStart;
  const nextHeading = nextHeadingPattern.exec(text);
  return text.slice(sectionStart, nextHeading?.index ?? text.length);
}

export function extractNpcLoot(revisionText, context = {}) {
  const section = extractDropsSection(revisionText);
  if (!section) {
    return { items: [] };
  }

  const rows = [];
  const lines = section.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.startsWith('|-') || trimmed.startsWith('|}')) {
      continue;
    }
    const cells = trimmed
      .replace(/^\|+/, '')
      .split('||')
      .map((cell) => cleanWikiCell(cell))
      .filter(Boolean);
    if (cells.length < 3) {
      continue;
    }
    const [itemName, quantityText, chanceText, conditionText = null] = cells;
    rows.push({
      itemName,
      quantityText,
      chanceText,
      conditionText,
      sourceSection: 'drops'
    });
  }

  return {
    items: normalizeNpcLootRows(rows, context)
  };
}

export function extractNpcHappiness(revisionText) {
  const text = String(revisionText ?? '');
  const match = LIVING_PREFERENCES_PATTERN.exec(text);
  if (!match) {
    return {
      sourceTemplatePresent: false,
      notes: []
    };
  }

  return {
    sourceTemplatePresent: true,
    notes: match[1]
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
  };
}

export function extractNpcSectionBlocks(revisionText) {
  const cleaned = stripSpecialForms(String(revisionText ?? ''));
  const sections = {};
  const sectionRegex = /^==\s*([^=]+?)\s*==\s*([\s\S]*?)(?=(?:^==\s*[^=]+?\s*==)|$)/gim;

  let match;
  while ((match = sectionRegex.exec(cleaned)) !== null) {
    const sectionName = match[1].trim().toLowerCase();
    const body = match[2].trim();
    if (!body) {
      continue;
    }
    if (['dialogue', 'history', 'tips'].includes(sectionName)) {
      sections[sectionName] = body;
    }
  }

  return sections;
}
