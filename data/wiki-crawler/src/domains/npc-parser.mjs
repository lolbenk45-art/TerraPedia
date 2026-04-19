const LIFEFORM_PATTERN = /\{\{Lifeform Analyzer note\|([\s\S]*?)\}\}/i;
const SHIMMER_PATTERN = /\{\{NPC shimmered form\|([\s\S]*?)\}\}/i;
const LIVING_PREFERENCES_PATTERN = /\{\{living preferences\|([\s\S]*?)\}\}/i;
const LIFEFORM_REMOVE_PATTERN = /\{\{Lifeform Analyzer note\|[\s\S]*?\}\}/gi;
const SHIMMER_REMOVE_PATTERN = /\{\{NPC shimmered form\|[\s\S]*?\}\}/gi;
const SHOP_ROW_PATTERN = /\{\{shop row\|([\s\S]*?)\}\}/gi;
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
  let match;

  while ((match = SHOP_ROW_PATTERN.exec(text)) !== null) {
    const parts = match[1]
      .split('|')
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
