import {
  canonicalizeRecipeGroupName,
  hasFiniteAlternativeSeparator,
  isRecipeGroupName,
  normalizeRecipeMaterialLabel
} from './recipe-material-reference.mjs';

const HTML_ENTITY_MAP = {
  '&nbsp;': ' ',
  '&thinsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#8201;': ' ',
  '&#8211;': '–',
  '&ndash;': '–',
  '&mdash;': '—'
};

export function decodeHtmlEntities(value) {
  if (typeof value !== 'string') {
    return '';
  }

  let decoded = value;
  for (const [entity, replacement] of Object.entries(HTML_ENTITY_MAP)) {
    decoded = decoded.replaceAll(entity, replacement);
  }

  return decoded.replace(/&#(\d+);/g, (_match, code) => {
    return String.fromCodePoint(Number(code));
  });
}

export function stripHtml(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractLinkedTitles(value) {
  if (typeof value !== 'string') {
    return [];
  }

  const titles = [];
  for (const match of value.matchAll(/<a\b[^>]*\btitle="([^"]+)"/gi)) {
    const title = normalizeText(match[1]);
    if (!title || isIgnoredLinkedTitle(title)) {
      continue;
    }
    titles.push(title);
  }
  for (const match of value.matchAll(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/g)) {
    const title = match[1].trim();
    if (isIgnoredLinkedTitle(title)) {
      continue;
    }
    titles.push(title);
  }
  return [...new Set(titles)];
}

function isIgnoredLinkedTitle(title) {
  return title.startsWith('File:')
    || title.startsWith('Category:')
    || title.startsWith('Legacy:');
}

export function parseQuantity(value) {
  const text = normalizeText(value);
  if (!text) {
    return { min: null, max: null, text: null };
  }

  const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1]),
      max: Number(rangeMatch[2]),
      text
    };
  }

  const singleMatch = text.match(/^(\d+(?:\.\d+)?)$/);
  if (singleMatch) {
    const amount = Number(singleMatch[1]);
    return { min: amount, max: amount, text };
  }

  return { min: null, max: null, text };
}

export function parseChance(value) {
  const text = normalizeText(value);
  if (!text) {
    return { value: null, text: null };
  }

  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!percentMatch) {
    return { value: null, text };
  }

  return {
    value: Number(percentMatch[1]) / 100,
    text
  };
}

export function extractIntroParagraphs(html) {
  if (typeof html !== 'string') {
    return [];
  }

  const paragraphs = [];
  for (const match of html.matchAll(/<p>([\s\S]*?)<\/p>/gi)) {
    const text = stripHtml(match[1]);
    if (text) {
      paragraphs.push(text);
    }
  }
  return paragraphs;
}

export function extractItemInfoboxImages(html) {
  if (typeof html !== 'string') {
    return [];
  }

  const sectionMatch = html.match(/<div class="section images">([\s\S]*?)<\/div><div class="section statistics">/i);
  const sectionHtml = sectionMatch?.[1] ?? html;
  const images = [];

  for (const match of sectionHtml.matchAll(/<img\b([^>]*?)>/gi)) {
    const attrs = parseTagAttributes(match[1]);
    const src = attrs.src;
    if (!src || src.includes('Auto_icon') || src.includes('Stack_digit_')) {
      continue;
    }

    const url = src.startsWith('http') ? src : `https://terraria.wiki.gg${src}`;
    const fileTitle = guessFileTitleFromSrc(src);
    images.push({
      fileTitle,
      url,
      width: toNullableNumber(attrs['data-file-width'] ?? attrs.width),
      height: toNullableNumber(attrs['data-file-height'] ?? attrs.height),
      contentType: inferMimeType(fileTitle),
      alt: normalizeText(attrs.alt),
      title: normalizeText(attrs.title)
    });
  }

  return dedupeBy(images, (image) => image.fileTitle ?? image.url);
}

export function extractVendorSourcesFromWikitext(wikitext) {
  if (typeof wikitext !== 'string') {
    return [];
  }

  const tagsMatch = wikitext.match(/^\|\s*tags\s*=\s*(.+)$/m);
  const tags = tagsMatch?.[1]
    ?.split('/')
    .map((part) => part.trim())
    .filter(Boolean) ?? [];

  return tags
    .filter((tag) => tag.toLowerCase().startsWith('vendor:'))
    .map((tag, index) => ({
      sourceType: 'shop',
      sourceRefType: 'npc',
      sourceRefName: tag.slice('vendor:'.length).trim(),
      sortOrder: index
    }));
}

export function extractDropSourcesFromHtml(html, npcLookup = new Map()) {
  if (typeof html !== 'string') {
    return [];
  }

  const rows = [];
  const tokens = [...html.matchAll(/<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>|<table class="drop[^"]*?">([\s\S]*?)<\/table>/gi)];
  let sourceSectionTitle = null;

  for (const token of tokens) {
    if (token[1]) {
      sourceSectionTitle = normalizeHeadingTitle(stripHtml(token[2]));
      continue;
    }

    const tableHtml = token[3];
    for (const rowMatch of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const rowHtml = rowMatch[1];
      const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]);
      if (cells.length < 3 || stripHtml(cells[0]) === 'Entity') {
        continue;
      }

      const sourceRowText = normalizeText(cells.map((cell) => stripHtml(cell)).join(' '));
      const quantity = parseQuantity(stripHtml(cells[1]));
      const chance = parseChance(stripHtml(cells[2]));
      const sourceNames = extractDropSourceNames(cells[0]);

      for (const sourceName of sourceNames) {
        const normalizedName = normalizeText(sourceName);
        const npcMeta = normalizedName ? npcLookup.get(normalizedName.toLowerCase()) ?? null : null;
        const sourceRefType = classifyDropSourceRefType(sourceName, npcMeta);

        rows.push({
          sourceType: classifyDropSourceType(sourceRefType),
          sourceRefType,
          sourceRefName: sourceName,
          quantityMin: quantity.min,
          quantityMax: quantity.max,
          quantityText: quantity.text,
          chanceValue: chance.value,
          chanceText: chance.text,
          sourceSectionTitle,
          sourceRowText,
          notes: rowHtml.includes('m-normal') ? 'Normal mode row' : null
        });
      }
    }
  }

  return rows;
}

export function extractTypeRowSourcesFromHtml(html) {
  if (typeof html !== 'string') {
    return [];
  }

  const sources = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1];
    if (!/\bid="type(?:_|&#95;)/i.test(rowHtml)) {
      continue;
    }

    const itemName = normalizeText(rowHtml.match(/<span title="([^"]+)">[^<]*<\/span><span class="id">Internal/i)?.[1]);
    if (!itemName) {
      continue;
    }

    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
    const noteHtml = cells.at(-1) ?? '';
    const noteText = normalizeText(stripHtml(noteHtml));
    if (!noteText || !/\bsold\b/i.test(noteText)) {
      continue;
    }

    const vendors = extractLinkedTitles(noteHtml).filter((title) => /\bMerchant\b/i.test(title));
    for (const vendor of vendors) {
      sources.push({
        sourceType: 'shop',
        sourceRefType: 'npc',
        sourceRefName: vendor,
        sourceTargetItemName: itemName,
        conditions: inferShopCondition(noteText),
        notes: noteText
      });
    }
  }

  return dedupeBy(sources, (source) => [
    source.sourceType,
    source.sourceRefType,
    source.sourceRefName,
    source.sourceTargetItemName,
    source.conditions ?? '',
    source.notes ?? ''
  ].join('|'));
}

function inferShopCondition(noteText) {
  if (/\brandom(?:ly)?\b/i.test(noteText)) return 'random shop stock';
  const firstHalfMatch = noteText.match(/during the first half of every second/i);
  if (firstHalfMatch) return 'first half of every second';
  return null;
}

function normalizeHeadingTitle(value) {
  return normalizeText(value)
    ?.replace(/\s*\[\s*edit\s*\]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

export function classifyDropSourceRefType(sourceName, npcMeta = null) {
  if (npcMeta) {
    return npcMeta.boss ? 'boss' : 'npc';
  }

  const normalized = normalizeText(sourceName)?.toLowerCase() ?? '';
  if (/\bcrates?\b/i.test(normalized)) return 'crate';
  if (/\btreasure bags?\b/i.test(normalized)) return 'treasure_bag';
  if (/\b(?:chests?|lock boxes?|lock box|presents?)\b/i.test(normalized)) return 'container';
  return 'unknown';
}

function classifyDropSourceType(sourceRefType) {
  if (sourceRefType === 'crate') return 'crate';
  if (sourceRefType === 'treasure_bag') return 'treasure_bag';
  if (sourceRefType === 'container') return 'container';
  return 'drop';
}

export function extractNarrativeSources(introParagraphs, pageTitle) {
  const sources = [];
  const normalizedTitle = normalizeText(pageTitle);

  for (const paragraph of introParagraphs) {
    const text = normalizeText(paragraph);
    if (!text) {
      continue;
    }

    if (/purchased from/i.test(text)) {
      const purchaseMatch = text.match(/purchased from (?:the )?([A-Z][A-Za-z' ]+?)(?:\s+for\b|[,.]|$)/i);
      if (purchaseMatch) {
        sources.push({
          sourceType: 'shop',
          sourceRefType: 'npc',
          sourceRefName: purchaseMatch[1].trim(),
          notes: text
        });
      }
    }

    if (/can be purchased from/i.test(text)) {
      const purchaseMatch = text.match(/can be purchased from (?:the )?([A-Z][A-Za-z' ]+?)(?:\s+for\b|[,.]|$)/i);
      if (purchaseMatch) {
        sources.push({
          sourceType: 'shop',
          sourceRefType: 'npc',
          sourceRefName: purchaseMatch[1].trim(),
          notes: text
        });
      }
    }

    if (/(found|spawns|generated|occurring naturally|appears naturally)/i.test(text) && /(underground|surface|vein|desert|jungle|snow|crimson|corruption|hallow|cavern)/i.test(text)) {
      sources.push({
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: `${normalizedTitle} worldgen`,
        conditions: text
      });
    }

    if (/\bfalls?\s+from\s+the\s+sky\b/i.test(text)) {
      sources.push({
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: `${normalizedTitle} sky fall`,
        conditions: text
      });
    }

    if (/\bgenerates?\s+in\b/i.test(text) && /(underground|surface|vein|desert|jungle|snow|crimson|corruption|hallow|cavern|sky|space|ocean|dungeon|underworld)/i.test(text)) {
      sources.push({
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: `${normalizedTitle} worldgen`,
        conditions: text
      });
    }

    if (/\bavailable during\b/i.test(text) && /\bseasonal event\b/i.test(text)) {
      const eventMatch = text.match(/available during (?:the )?(.+? seasonal event)\b/i);
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'world',
        sourceRefName: normalizeText(eventMatch?.[1]) ?? `${normalizedTitle} seasonal event`,
        conditions: text
      });
    }

    if (/\bobtained\b/i.test(text) && /\bas a reward for defeating bosses\b/i.test(text)) {
      sources.push({
        sourceType: 'treasure_bag',
        sourceRefType: 'boss_group',
        sourceRefName: 'defeating bosses',
        conditions: text
      });
    }

    if (/\bdropped from most bosses\b/i.test(text)) {
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'boss_group',
        sourceRefName: 'most bosses',
        chanceText: extractFirstChanceText(text),
        conditions: text
      });
    }

    if (/\bdropped by bosses and mini-bosses\b/i.test(text)) {
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'boss_group',
        sourceRefName: 'bosses and mini-bosses',
        conditions: text
      });
    }

    if (/\bobtained\b/i.test(text) && /\bfrom Treasure Bags dropped from Hardmode bosses\b/i.test(text)) {
      sources.push({
        sourceType: 'treasure_bag',
        sourceRefType: 'treasure_bag',
        sourceRefName: 'Treasure Bags dropped from Hardmode bosses',
        chanceText: extractFirstChanceText(text),
        conditions: text
      });
    }

    if (/\brewarded randomly by the Angler NPC\b/i.test(text) && /\bcompleting (?:fishing )?quests\b/i.test(text)) {
      sources.push({
        sourceType: 'quest_reward',
        sourceRefType: 'npc',
        sourceRefName: 'Angler',
        conditions: text
      });
    }

    if (/\b(?:can be received|has a base .* chance of being obtained) as\b/i.test(text) && /\bAngler\b/i.test(text) && /\b(?:fishing )?quests?\b/i.test(text)) {
      sources.push({
        sourceType: 'quest_reward',
        sourceRefType: 'npc',
        sourceRefName: 'Angler',
        chanceText: extractFirstChanceText(text),
        conditions: text
      });
    }

    if (/\bis given by the Angler\b/i.test(text) && /\bcompleting\b/i.test(text)) {
      sources.push({
        sourceType: 'quest_reward',
        sourceRefType: 'npc',
        sourceRefName: 'Angler',
        conditions: text
      });
    }

    if (/\brewards the player\b/i.test(text) && /\brandom special exclusive dye\b/i.test(text)) {
      sources.push({
        sourceType: 'quest_reward',
        sourceRefType: 'npc',
        sourceRefName: 'Dye Trader',
        conditions: text
      });
    }

    if (/\bobtained by fishing\b/i.test(text)) {
      const fishingMatch = text.match(/obtained by (fishing .+?)(?:[,.]|$)/i);
      sources.push({
        sourceType: 'crate',
        sourceRefType: 'world',
        sourceRefName: normalizeText(fishingMatch?.[1]) ?? 'fishing',
        conditions: text
      });
    }

    if (/\bcan be caught with any Bug Net\b/i.test(text)) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: 'caught with any Bug Net',
        conditions: text
      });
    }

    if (/\bare obtained in the Old One's Army event\b/i.test(text)) {
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'world',
        sourceRefName: "Old One's Army event",
        conditions: text
      });
    }

    if (/\bnaturally-generated Chest\b/i.test(text)) {
      sources.push({
        sourceType: 'worldgen',
        sourceRefType: 'world',
        sourceRefName: `${normalizedTitle} worldgen`,
        conditions: text
      });
    }

    if (/\bformed when a Gnome touches sunlight\b/i.test(text)) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'npc',
        sourceRefName: 'Gnome sunlight transformation',
        conditions: text
      });
    }

    if (/\bonly available to players in the Terraria Collector's Edition\b/i.test(text)) {
      sources.push({
        sourceType: 'unknown',
        sourceRefType: 'world',
        sourceRefName: "Terraria Collector's Edition",
        conditions: text
      });
    }

    if (/\bobtained by killing\b/i.test(text) && /\b(enemies|critters)\b/i.test(text)) {
      const killMatch = text.match(/obtained by (killing .+?)(?:\.|$)/i);
      sources.push({
        sourceType: 'drop',
        sourceRefType: 'npc_group',
        sourceRefName: normalizeText(killMatch?.[1]) ?? 'killing enemies',
        conditions: text
      });
    }

    if (/(can be mined|required to mine|needed to mine|harvested)/i.test(text)) {
      sources.push({
        sourceType: 'mining',
        sourceRefType: 'world',
        sourceRefName: `${normalizedTitle} vein`,
        conditions: text
      });
    }
  }

  return dedupeBy(sources, (source) => `${source.sourceType}|${source.sourceRefType}|${source.sourceRefName}|${source.conditions ?? ''}|${source.notes ?? ''}`);
}

function extractFirstChanceText(text) {
  return normalizeText(text.match(/(?:\d+\s*\/\s*\d+\s*)?\(\s*\d+(?:\.\d+)?%\s*\)|\d+(?:\.\d+)?%/i)?.[0]) ?? null;
}

export function parseRecipeTable(expandedMarkup) {
  if (typeof expandedMarkup !== 'string' || !expandedMarkup.includes('class="terraria cellborder recipes')) {
    return [];
  }

  const rows = [...expandedMarkup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1);
  const recipes = [];
  let previousStationMarkup = '';

  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1];
    const resultCell = extractCellByClass(rowHtml, 'result');
    const ingredientsCell = extractCellByClass(rowHtml, 'ingredients');
    const stationCell = extractCellByClass(rowHtml, 'station');

    if (!resultCell || !ingredientsCell) {
      continue;
    }

    if (stationCell) {
      previousStationMarkup = stationCell;
    }

    const resultName = extractRecipeResultName(resultCell);
    const resultQuantity = parseQuantity(resultCell.match(/<span class="am">([\s\S]*?)<\/span>/i)?.[1] ?? '');
    const versionScope = humanizeVersionNote(resultCell.match(/<div class="version-note[^"]*">([\s\S]*?)<\/div>/i)?.[1] ?? '');

    const ingredientOptionSets = [...ingredientsCell.matchAll(/<li>([\s\S]*?)<\/li>/gi)]
      .map((ingredientMatch, index) => parseIngredientOptions(ingredientMatch[1], index))
      .filter((options) => options.length > 0);
    const ingredientVariants = expandIngredientOptionSets(ingredientOptionSets);

    const stationMarkup = stationCell ?? previousStationMarkup;
    const stationNames = extractLinkedTitles(stationMarkup)
      .map((title) => normalizeRecipeMaterialLabel(title))
      .filter((title) => title && title !== 'Crafting station');
    const stationRequirementMode = inferStationRequirementMode(stationMarkup, stationNames);
    const stations = stationNames.map((stationName, index) => ({
      stationName,
      stationNameRaw: stationName,
      isAlternative: stationRequirementMode === 'alternative' && index > 0,
      sortOrder: index
    }));

    for (const ingredients of ingredientVariants) {
      recipes.push({
        resultName,
        resultQuantity: resultQuantity.min ?? 1,
        versionScope: versionScope ? versionScope.replace(/:\s*$/, '') : null,
        ingredients,
        stations
      });
    }
  }

  return dedupeBy(recipes, (recipe) => JSON.stringify({
    resultName: recipe.resultName,
    versionScope: recipe.versionScope ?? null,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ingredientNameRaw: ingredient.ingredientNameRaw,
      ingredientGroupType: ingredient.ingredientGroupType,
      quantityText: ingredient.quantityText ?? null,
      quantityMin: ingredient.quantityMin ?? null,
      quantityMax: ingredient.quantityMax ?? null
    })),
    stations: recipe.stations.map((station) => ({
      stationNameRaw: station.stationNameRaw,
      isAlternative: Boolean(station.isAlternative)
    }))
  }));
}

function extractRecipeResultName(resultCell) {
  const sortValueMatch = resultCell.match(/\bdata-sort-value="([^"]+)"/i);
  const sortValue = normalizeRecipeResultCandidate(sortValueMatch?.[1]);
  if (sortValue) {
    return sortValue;
  }

  for (const imageMatch of resultCell.matchAll(/<img\b([^>]*?)>/gi)) {
    const attrs = parseTagAttributes(imageMatch[1]);
    const imageName = normalizeRecipeResultCandidate(attrs.alt ?? attrs.title);
    if (imageName) {
      return imageName;
    }
  }

  const resultLinks = extractLinkedTitles(resultCell)
    .map((title) => normalizeRecipeResultCandidate(title))
    .filter(Boolean);
  const linkedTitle = resultLinks.find((title) => title !== 'Crafting station');
  return linkedTitle ?? normalizeText(stripHtml(resultCell));
}

function normalizeRecipeResultCandidate(value) {
  const text = normalizeText(value)
    ?.replace(/\.(?:gif|png|jpe?g|webp)$/i, '')
    .trim();
  if (!text) return null;
  if (text === 'Item IDs' || text === 'Crafting station') return null;
  if (/^(?:Desktop|Console|Mobile|Old-gen console|Nintendo 3DS)(?: version)?$/i.test(text)) return null;
  if (/^Internal (?:Item|Tile|Projectile) ID/i.test(text)) return null;
  return text;
}

function inferStationRequirementMode(markup, stationNames) {
  if (!Array.isArray(stationNames) || stationNames.length <= 1) {
    return 'single';
  }

  const text = normalizeText(stripHtml(markup))?.toLowerCase() ?? '';
  if (!text) {
    return 'alternative';
  }

  if (
    /(^|[\s(])and([\s):]|$)/i.test(text)
    || text.includes('同时')
    || text.includes('并且')
    || text.includes('以及')
    || text.includes('且')
    || text.includes('和')
  ) {
    return 'combination';
  }

  return 'alternative';
}

export function normalizeText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = decodeHtmlEntities(value)
    .replace(/\[\[|\]\]/g, '')
    .replace(/''+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized === '' ? null : normalized;
}

function extractCellByClass(rowHtml, className) {
  const pattern = new RegExp(`<td\\b[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
  const match = rowHtml.match(pattern);
  return match?.[1] ?? null;
}

function parseIngredientOptions(ingredientMarkup, sortOrder) {
  const quantity = parseQuantity(stripHtml(ingredientMarkup.match(/<span class="am">([\s\S]*?)<\/span>/i)?.[1] ?? ''));
  const linkedTitles = [...new Set(extractLinkedTitles(ingredientMarkup).map((title) => normalizeRecipeMaterialLabel(title)).filter(Boolean))];
  const rawText = normalizeRecipeMaterialLabel(stripHtml(ingredientMarkup));
  const hasAlternative = hasFiniteAlternativeSeparator(rawText);

  if (linkedTitles.length > 1 && hasAlternative && linkedTitles.every((title) => !isRecipeGroupName(title))) {
    return linkedTitles.map((title) => buildIngredientEntry(title, quantity, sortOrder));
  }

  const primaryName = canonicalizeIngredientName(linkedTitles[0] ?? rawText);
  if (!primaryName) {
    return [];
  }
  return [buildIngredientEntry(primaryName, quantity, sortOrder)];
}

function canonicalizeIngredientName(value) {
  const text = normalizeRecipeMaterialLabel(value);
  if (!text) {
    return null;
  }
  if (isRecipeGroupName(text)) {
    return canonicalizeRecipeGroupName(text);
  }
  return text;
}

function buildIngredientEntry(name, quantity, sortOrder) {
  const canonicalName = canonicalizeIngredientName(name);
  return {
    ingredientName: canonicalName,
    ingredientNameRaw: canonicalName,
    quantityMin: quantity.min,
    quantityMax: quantity.max,
    quantityText: quantity.text,
    ingredientGroupType: isRecipeGroupName(canonicalName) ? 'group' : 'item',
    sortOrder
  };
}

function expandIngredientOptionSets(optionSets) {
  if (!Array.isArray(optionSets) || optionSets.length === 0) {
    return [];
  }

  let variants = [[]];
  for (const [ingredientIndex, options] of optionSets.entries()) {
    const nextVariants = [];
    for (const variant of variants) {
      for (const option of options) {
        nextVariants.push([
          ...variant,
          {
            ...option,
            sortOrder: ingredientIndex
          }
        ]);
      }
    }
    variants = nextVariants;
  }
  return variants;
}

function extractDropSourceNames(cellHtml) {
  if (typeof cellHtml !== 'string') {
    return [];
  }

  const imageAltNames = [
    ...new Set(
      [...cellHtml.matchAll(/<img\b[^>]*\balt="([^"]+)"/gi)]
        .map((match) => normalizeImageAltEntityName(match[1]))
        .filter((title) => isDropSourceTitle(title))
    )
  ];

  if (imageAltNames.length > 0) {
    return imageAltNames;
  }

  const linkedTitles = [
    ...new Set(
      [...cellHtml.matchAll(/<a\b[^>]*title="([^"]+)"/gi)]
        .map((match) => normalizeText(match[1]))
        .filter((title) => isDropSourceTitle(title))
    )
  ];

  if (linkedTitles.length > 0) {
    return linkedTitles;
  }

  const stripped = stripHtml(cellHtml);
  return stripped ? [stripped] : [];
}

function normalizeImageAltEntityName(value) {
  return normalizeText(value)
    ?.replace(/\.(?:gif|png|jpe?g|webp)$/i, '')
    .trim() ?? '';
}

function isDropSourceTitle(title) {
  if (typeof title !== 'string' || title.trim() === '') {
    return false;
  }

  return !(
    title.startsWith('File:') ||
    title.startsWith('Category:') ||
    title.startsWith('Legacy:')
  );
}

function parseTagAttributes(markup) {
  const attrs = {};
  for (const match of markup.matchAll(/([A-Za-z0-9:-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function guessFileTitleFromSrc(src) {
  if (typeof src !== 'string' || src.trim() === '') {
    return null;
  }

  const pathname = src.split('?')[0];
  const basename = pathname.split('/').pop();
  if (!basename) {
    return null;
  }

  return decodeURIComponent(basename).replaceAll('_', ' ');
}

function inferMimeType(fileTitle) {
  if (typeof fileTitle !== 'string') {
    return null;
  }
  const normalized = fileTitle.toLowerCase();
  if (normalized.endsWith('.png')) {
    return 'image/png';
  }
  if (normalized.endsWith('.gif')) {
    return 'image/gif';
  }
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (normalized.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  return null;
}

function toNullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dedupeBy(values, keySelector) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keySelector(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function humanizeVersionNote(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const simplified = value.replace(/\[\[File:([^\]]+)\]\]/g, (_match, inner) => {
    const parts = String(inner)
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    const label = parts.find((part) => (
      !/^\d+x\d+px$/i.test(part)
      && !/^link=/i.test(part)
      && !/\.(png|svg|gif|jpe?g|webp)$/i.test(part)
    ));
    return label ?? '';
  });

  return normalizeText(simplified)
    ?.replace(/\s*only:\s*$/i, ' only')
    .replace(/:\s*$/, '') ?? null;
}
