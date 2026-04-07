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
  for (const match of value.matchAll(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/g)) {
    const title = match[1].trim();
    if (
      title.startsWith('File:') ||
      title.startsWith('Category:') ||
      title.startsWith('Legacy:')
    ) {
      continue;
    }
    titles.push(title);
  }
  return titles;
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

  const tables = [...html.matchAll(/<table class="drop[^"]*?">([\s\S]*?)<\/table>/gi)];
  const rows = [];

  for (const table of tables) {
    for (const rowMatch of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const rowHtml = rowMatch[1];
      const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1]);
      if (cells.length < 3 || stripHtml(cells[0]) === 'Entity') {
        continue;
      }

      const names = [
        ...new Set(
          [...cells[0].matchAll(/<a\b[^>]*title="([^"]+)"/gi)]
            .map((match) => normalizeText(match[1]))
            .filter(Boolean)
        )
      ];
      const sourceName = names[0] ?? stripHtml(cells[0]);
      const quantity = parseQuantity(stripHtml(cells[1]));
      const chance = parseChance(stripHtml(cells[2]));
      const npcMeta = npcLookup.get(normalizeText(sourceName).toLowerCase()) ?? null;

      rows.push({
        sourceType: 'drop',
        sourceRefType: npcMeta?.boss ? 'boss' : 'npc',
        sourceRefName: sourceName,
        quantityMin: quantity.min,
        quantityMax: quantity.max,
        quantityText: quantity.text,
        chanceValue: chance.value,
        chanceText: chance.text,
        notes: rowHtml.includes('m-normal') ? 'Normal mode row' : null
      });
    }
  }

  return rows;
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
      const purchaseMatch = text.match(/purchased from (?:the )?([A-Z][A-Za-z' ]+)/i);
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

    const resultLinks = extractLinkedTitles(resultCell).filter((title) => !title.startsWith('Desktop ') && !title.startsWith('Console ') && !title.startsWith('Mobile '));
    const resultName = resultLinks.find((title) => title !== 'Crafting station') ?? stripHtml(resultCell);
    const versionScope = humanizeVersionNote(resultCell.match(/<div class="version-note[^"]*">([\s\S]*?)<\/div>/i)?.[1] ?? '');

    const ingredients = [...ingredientsCell.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((ingredientMatch, index) => {
      const ingredientMarkup = ingredientMatch[1];
      const ingredientLinks = extractLinkedTitles(ingredientMarkup);
      const ingredientName = ingredientLinks.find(Boolean) ?? stripHtml(ingredientMarkup);
      const quantity = parseQuantity(stripHtml(ingredientMarkup.match(/<span class="am">([\s\S]*?)<\/span>/i)?.[1] ?? ''));
      return {
        ingredientName,
        ingredientNameRaw: ingredientName,
        quantityMin: quantity.min,
        quantityMax: quantity.max,
        quantityText: quantity.text,
        ingredientGroupType: ingredientName.startsWith('Any ') ? 'group' : 'item',
        sortOrder: index
      };
    });

    const stationMarkup = stationCell ?? previousStationMarkup;
    const stationNames = extractLinkedTitles(stationMarkup).filter((title) => title !== 'Crafting station');
    const stations = stationNames.map((stationName, index) => ({
      stationName,
      stationNameRaw: stationName,
      isAlternative: index > 0,
      sortOrder: index
    }));

    recipes.push({
      resultName,
      resultQuantity: 1,
      versionScope: versionScope ? versionScope.replace(/:\s*$/, '') : null,
      ingredients,
      stations
    });
  }

  return recipes;
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

  const simplified = value.replace(
    /\[\[File:[^\]|]+\|(?:[^|\]]+\|)?([^|\]]+?)(?:\|link=[^\]]+)?\]\]/g,
    '$1'
  );

  return normalizeText(simplified)
    ?.replace(/\s*only:\s*$/i, ' only')
    .replace(/:\s*$/, '') ?? null;
}
