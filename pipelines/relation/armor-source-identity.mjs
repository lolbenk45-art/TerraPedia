const MATCH_FIELDS = Object.freeze([
  'sectionCode', 'slotGroup', 'itemPageTitle', 'itemHref', 'itemNameZh', 'defenseValue', 'imageFileTitle',
]);

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value.trim();
}

function requiredRevision(value) {
  if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new Error('identity evidence revisionId is required');
  return Number(value);
}

function exactMatch(row, match) {
  return MATCH_FIELDS.every((field) => Object.hasOwn(match, field) && row[field] === match[field]);
}

export function applyArmorSourceIdentityCorrections({ records = [], corrections = [] } = {}) {
  if (!Array.isArray(records) || !Array.isArray(corrections)) throw new Error('Armor identity records and corrections must be arrays');
  const result = records.map((row) => ({ ...row }));
  const correctedIndexes = new Set();
  for (const [index, correction] of corrections.entries()) {
    if (!correction || typeof correction !== 'object' || !correction.match || !correction.replacement || !correction.evidence) {
      throw new Error(`Armor identity correction ${index} is incomplete`);
    }
    for (const field of MATCH_FIELDS) {
      if (!Object.hasOwn(correction.match, field)) throw new Error(`Armor identity correction ${index} match.${field} is required`);
    }
    const evidence = correction.evidence;
    requiredText(evidence.artifactPath, 'identity evidence artifactPath');
    requiredText(evidence.artifactHash, 'identity evidence artifactHash');
    requiredText(evidence.requestedPageTitle, 'identity evidence requestedPageTitle');
    requiredText(evidence.canonicalPageTitle, 'identity evidence canonicalPageTitle');
    requiredRevision(evidence.revisionId);
    const matches = result.map((row, rowIndex) => ({ row, rowIndex })).filter(({ row }) => exactMatch(row, correction.match));
    if (matches.length !== 1) throw new Error(`Armor identity correction ${index} must match exactly one source row; found ${matches.length}`);
    const [{ row, rowIndex }] = matches;
    if (correctedIndexes.has(rowIndex)) throw new Error(`Armor identity correction ${index} targets an already corrected source row`);
    const replacement = correction.replacement;
    for (const field of ['itemPageTitle', 'itemHref', 'itemNameZh']) {
      if (!Object.hasOwn(replacement, field)) throw new Error(`Armor identity correction ${index} replacement.${field} is required`);
    }
    if (replacement.itemPageTitle === row.itemPageTitle && replacement.itemHref === row.itemHref && replacement.itemNameZh === row.itemNameZh) {
      throw new Error(`Armor identity correction ${index} does not change source identity`);
    }
    result[rowIndex] = {
      ...row,
      ...replacement,
      sourceIdentityCorrection: {
        before: Object.fromEntries(MATCH_FIELDS.map((field) => [field, row[field]])),
        after: { itemPageTitle: replacement.itemPageTitle, itemHref: replacement.itemHref, itemNameZh: replacement.itemNameZh },
        evidence: { ...evidence, revisionId: Number(evidence.revisionId) },
      },
    };
    correctedIndexes.add(rowIndex);
  }
  return result;
}

