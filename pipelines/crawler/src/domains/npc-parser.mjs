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

function normalizeInfoboxBuffName(value) {
  let text = String(value ?? '').trim();
  if (!text) {
    return '';
  }
  text = text.replace(/\s+\|\s*debuff(?:mode|chance|duration)\d*\s*=\s*[\s\S]*$/i, '').trim();

  const templateMatch = /^\{\{\s*[^|{}]+\|\s*([^|{}]+)(?:\|[^{}]*)?\}\}$/i.exec(text);
  if (templateMatch?.[1]) {
    text = templateMatch[1].trim();
  }

  return text
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/''+/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectInfoboxBuffInflictions(fields, { sourceInfobox } = {}) {
  const entries = Object.entries(fields ?? {})
    .map(([field, value]) => {
      const match = /^debuff(\d*)$/.exec(field);
      if (!match) {
        return null;
      }
      const suffix = match[1] ?? '';
      return {
        field,
        suffix,
        order: suffix ? Number(suffix) : 1,
        value
      };
    })
    .filter(Boolean)
    .filter((entry) => Number.isFinite(entry.order))
    .sort((left, right) => left.order - right.order);

  const results = [];
  for (const entry of entries) {
    const rawBuffText = String(entry.value ?? '').trim();
    const buffName = normalizeInfoboxBuffName(rawBuffText);
    if (!buffName) {
      continue;
    }
    const durationField = `debuffduration${entry.suffix}`;
    const result = {
      buffName,
      durationText: fields[durationField] ?? '',
      rawBuffText,
      sourceField: entry.field,
      durationField: fields[durationField] == null ? '' : durationField,
      sourceSection: 'infobox'
    };
    if (sourceInfobox) {
      result.sourceInfobox = sourceInfobox;
    }
    results.push(result);
  }
  return results;
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

function parseTemplateArgsToFields(value) {
  const fields = {};
  for (const part of splitTopLevelTemplateArgs(value)) {
    const match = /^\s*([^=]+?)\s*=\s*([\s\S]*)$/.exec(part);
    if (!match) {
      continue;
    }
    const key = match[1].toLowerCase().replace(/[\s_]+/g, '');
    fields[key] = match[2].trim();
  }
  return fields;
}

function parseInfoboxFields(revisionText) {
  const block = findInfoboxBlock(revisionText);
  if (!block) {
    return {};
  }

  return parseInfoboxBlockFields(block.text, { closed: block.closed });
}

function parseInfoboxBlockFields(blockText, { closed = true } = {}) {
  const openingMatch = /^\{\{npc infobox\b/i.exec(blockText);
  const prefixLength = openingMatch ? openingMatch[0].length : 0;
  const suffixLength = closed ? 2 : 0;
  const inner = blockText.slice(prefixLength, blockText.length - suffixLength).trim();
  if (!inner.includes('\n')) {
    return parseTemplateArgsToFields(inner.replace(/^\|/, ''));
  }

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

function parseAllInfoboxFields(revisionText) {
  const text = String(revisionText ?? '');
  const firstBlock = findInfoboxBlock(text);
  const balancedBlocks = findBalancedTemplateBlocks(text, 'npc infobox')
    .map((blockText) => ({
      closed: true,
      fields: parseInfoboxBlockFields(blockText, { closed: true })
    }));

  if (firstBlock && !firstBlock.closed) {
    const remainder = text.slice(firstBlock.start + firstBlock.text.length).trimStart();
    const trailingBalancedBlocks = findBalancedTemplateBlocks(remainder, 'npc infobox')
      .map((blockText) => ({
        closed: true,
        fields: parseInfoboxBlockFields(blockText, { closed: true })
      }));

    const trailingFallbackBlock = trailingBalancedBlocks.length === 0
      ? findInfoboxBlock(remainder)
      : null;
    return [
      {
        closed: false,
        fields: parseInfoboxBlockFields(firstBlock.text, { closed: false })
      },
      ...trailingBalancedBlocks,
      ...(trailingFallbackBlock && trailingFallbackBlock.closed
        ? [{
          closed: true,
          fields: parseInfoboxBlockFields(trailingFallbackBlock.text, { closed: true })
        }]
        : [])
    ];
  }

  if (balancedBlocks.length) {
    return balancedBlocks;
  }

  if (!firstBlock) {
    return [];
  }
  return [{
    closed: firstBlock.closed,
    fields: parseInfoboxBlockFields(firstBlock.text, { closed: firstBlock.closed })
  }];
}

function buildInfoboxSource(fields) {
  const image = fields.image || fields.imagecargo || fields.imagealt || '';
  const name = fields.name || inferInfoboxNameFromImage(fields.imagecargo || fields.image || fields.imagealt);
  return {
    autoId: normalizeInfoboxAutoId(fields.auto),
    image,
    name
  };
}

function normalizeInfoboxAutoId(value) {
  return String(value ?? '').replace(/<!--[\s\S]*?-->/g, '').split('<!--')[0].trim();
}

export function extractNpcSourceInfoboxes(revisionText) {
  return parseAllInfoboxFields(revisionText)
    .map((infobox) => buildInfoboxSource(infobox.fields))
    .filter((source) => source.autoId || source.image || source.name);
}

function inferInfoboxNameFromImage(value) {
  const text = String(value ?? '');
  const match = /\[\[File:([^|\]]+?)(?:\.\w+)?(?:\|[^\]]*)?\]\]/i.exec(text);
  if (!match?.[1]) {
    return '';
  }
  return match[1]
    .replace(/\s*\d+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getInfoboxBlockSources(revisionText) {
  const text = String(revisionText ?? '');
  let searchStart = 0;
  return findBalancedTemplateBlocks(text, 'npc infobox')
    .map((blockText) => {
      const index = text.indexOf(blockText, searchStart);
      searchStart = index >= 0 ? index + blockText.length : searchStart;
      return {
        index,
        sourceInfobox: buildInfoboxSource(parseInfoboxBlockFields(blockText, { closed: true }))
      };
    })
    .filter((entry) => entry.index >= 0);
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
  const infoboxes = parseAllInfoboxFields(revisionText);
  const includeSourceInfobox = infoboxes.length > 1;
  const buffInflictions = infoboxes.flatMap((infobox) => collectInfoboxBuffInflictions(
    infobox.fields,
    includeSourceInfobox ? { sourceInfobox: buildInfoboxSource(infobox.fields) } : {}
  ));

  return {
    baseDamageText: fields.damage ?? '',
    buffInflictions,
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
  return normalizeInlineWikiTemplates(String(value ?? ''))
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''+/g, '')
    .replace(/''/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInlineWikiTemplates(value) {
  return String(value ?? '')
    .replace(/\{\{\s*item\s*\|\s*custom\s*\|\s*([^|{}]+)(?:\|[^{}]*)?\}\}/gi, '$1')
    .replace(/\{\{\s*item\s*\|\s*([^|}]+)(?:\|[^{}]*)?\}\}/gi, '$1')
    .replace(/\{\{\s*source code ref\b[^{}]*\}\}/gi, '')
    .replace(/\{\{\s*note\b[^{}]*\}\}/gi, '');
}

function extractWikiNoteCondition(value) {
  const withoutSourceRefs = String(value ?? '').replace(/\{\{\s*source code ref\b[^{}]*\}\}/gi, '');
  const noteMatch = /\{\{\s*note\b[^{}]*\}\}/i.exec(withoutSourceRefs);
  if (!noteMatch) {
    return null;
  }
  const conditionMatch = /During\s+([^{}|]+?)\s+only/i.exec(noteMatch[0]);
  return conditionMatch ? `During ${conditionMatch[1].trim()} only` : null;
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

function extractDropsSections(revisionText) {
  const text = String(revisionText ?? '');
  const headingPattern = /^(={2,})\s*(?:Drops?|Loot)\s*\1\s*$/gim;
  const sections = [];
  let heading;
  let previousDropsHeadingStart = 0;

  while ((heading = headingPattern.exec(text)) !== null) {
    const marker = heading[1];
    const level = marker.length;
    const sectionStart = heading.index + heading[0].length;
    const nextHeadingPattern = /^(={2,})\s*[^=]+?\s*\1\s*$/gim;
    nextHeadingPattern.lastIndex = sectionStart;
    let nextHeading;
    let sectionEnd = text.length;
    while ((nextHeading = nextHeadingPattern.exec(text)) !== null) {
      if (nextHeading[1].length <= level) {
        sectionEnd = nextHeading.index;
        break;
      }
    }
    sections.push({
      start: heading.index,
      scopeStart: Math.max(findNearestNonLootHeadingStart(text, heading.index), previousDropsHeadingStart),
      body: text.slice(sectionStart, sectionEnd)
    });
    previousDropsHeadingStart = heading.index;
  }

  return sections;
}

function findNearestNonLootHeadingStart(text, beforeIndex) {
  const headingPattern = /^(={2,})\s*([^=\n]+?)\s*\1\s*$/gim;
  let heading;
  let selected = 0;
  while ((heading = headingPattern.exec(text)) !== null && heading.index < beforeIndex) {
    if (!/^(?:Drops?|Loot)$/i.test(heading[2].trim())) {
      selected = heading.index + heading[0].length;
    }
  }
  return selected;
}

function findSectionSourceInfobox(infoboxSources, section) {
  const scopedCandidates = infoboxSources.filter((source) =>
    source.index >= section.scopeStart && source.index < section.start
  );
  return scopedCandidates.length === 1 ? scopedCandidates[0].sourceInfobox : null;
}

function extractLootRowsFromSection(section, { sourceInfobox } = {}) {
  const rows = [];
  const lines = String(section ?? '').split(/\r?\n/);
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
      sourceSection: 'drops',
      ...(sourceInfobox ? { sourceInfobox } : {})
    });
  }
  return rows;
}

function normalizeLootRowShape(row) {
  const itemName = cleanWikiCell(row?.itemName);
  const quantityText = cleanWikiCell(row?.quantityText);
  const chanceText = cleanWikiCell(row?.chanceText);
  const conditionText = cleanWikiCell(row?.conditionText) || extractWikiNoteCondition(row?.quantityText);

  if (String(itemName ?? '').startsWith('custom:') && quantityText) {
    return {
      ...row,
      itemName: quantityText,
      quantityText: null,
      chanceText,
      conditionText
    };
  }

  if (String(itemName ?? '').trim().toLowerCase() === 'custom' && quantityText && !looksLikeQuantityText(quantityText)) {
    return {
      ...row,
      itemName: quantityText,
      quantityText: null,
      chanceText,
      conditionText
    };
  }

  return {
    ...row,
    itemName,
    quantityText,
    chanceText,
    conditionText
  };
}

function looksLikeQuantityText(value) {
  const text = String(value ?? '').trim();
  return Boolean(text && /^(?:\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?|\{\{[^{}]*\}\})(?:\s*[x×])?$/i.test(text));
}

export function extractNpcLoot(revisionText, context = {}) {
  const sections = extractDropsSections(revisionText);
  const infoboxRows = extractInfoboxLootRows(revisionText);
  if (!sections.length && !infoboxRows.length) {
    return { items: [] };
  }

  const infoboxSources = getInfoboxBlockSources(revisionText);
  const includeSourceInfobox = infoboxSources.length > 1;
  const rows = sections.flatMap((section) => extractLootRowsFromSection(section.body, {
    sourceInfobox: includeSourceInfobox
      ? findSectionSourceInfobox(infoboxSources, section)
      : null
  })).concat(infoboxRows);

  return {
    items: normalizeNpcLootRows(rows.map((row) => normalizeLootRowShape(row)), context)
  };
}

function extractInfoboxLootRows(revisionText) {
  const rows = [];
  for (const blockText of findBalancedTemplateBlocks(String(revisionText ?? ''), 'npc infobox')) {
    const fields = parseInfoboxBlockFields(blockText, { closed: true });
    const sourceInfobox = buildInfoboxSource(fields);
    const inner = getTemplateInner(blockText, 'npc infobox');
    const lines = inner.split(/\r?\n/);

    for (const line of lines) {
      const row = parseInfoboxLootLine(line, { sourceInfobox });
      if (row) {
        rows.push(row);
      }
    }
  }
  return rows;
}

function parseInfoboxLootLine(line, { sourceInfobox } = {}) {
  const text = String(line ?? '').trim();
  if (!text.startsWith('|') || text.startsWith('|:') || /^\|\s*[a-z0-9_]+\s*=/i.test(text)) {
    return null;
  }

  const rawParts = splitTopLevelTemplateArgs(text.slice(1));
  const parts = rawParts
    .map((part) => cleanWikiCell(part))
    .filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  const noteConditionText = rawParts.map((part) => extractWikiNoteCondition(part)).find(Boolean) ?? null;
  const [itemName, quantityText, chanceText, explicitConditionText = null] = parts;
  const conditionText = explicitConditionText || noteConditionText;
  if (looksLikeTableSeparator(itemName) || looksLikeInfoboxNonLootRow(itemName)) {
    return null;
  }

  return {
    itemName,
    quantityText,
    chanceText,
    conditionText,
    sourceSection: 'drops',
    ...(sourceInfobox ? { sourceInfobox } : {})
  };
}

function looksLikeTableSeparator(value) {
  return /^-+$/.test(String(value ?? '').trim());
}

function looksLikeInfoboxNonLootRow(value) {
  return /^[a-z][a-z0-9_]*\s*=/i.test(String(value ?? '').trim());
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
