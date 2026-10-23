import { resolvePcVersionWikiTitle } from './pc-version-update-identity-catalog.mjs';

export const PC_VERSION_UPDATE_MAPPING_RULES = Object.freeze([]);

const GENERIC_BULLETIN = /^(?:fixed\s+)?(?:a certain exploit|an exploit|an issue|something|a bug|the issue|the problem)[.!?]*$/i;
const GENERIC_ALIASES = new Set([
  'a certain exploit', 'certain exploit', 'an exploit', 'the exploit', 'exploit', 'an issue', 'issue', 'something',
  'a bug', 'bug', 'the issue', 'the problem', 'item', 'items', 'weapon', 'weapons',
  'enemy', 'enemies', 'npc', 'npcs', 'crash', 'bug fixes'
]);

export function mapPcVersionBulletin({
  sectionTitle = '',
  rawText = null,
  text = '',
  rules = PC_VERSION_UPDATE_MAPPING_RULES,
  catalog = null
} = {}) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('PC version bulletin text is required');
  }
  if (!Array.isArray(rules)) throw new TypeError('PC version mapping rules must be an array');
  for (const [ruleIndex, rule] of rules.entries()) validateRule(rule, ruleIndex);
  const category = classifyPcChangeSection(sectionTitle);
  const bulletin = text.normalize('NFKC').trim();
  if (GENERIC_BULLETIN.test(bulletin)) {
    return { category, mappingStatus: 'unmapped', mappingReason: 'generic-bulletin', targets: [] };
  }

  const linkedTitles = extractWikiLinkTitles(rawText);
  if (catalog && linkedTitles.length > 0) {
    const resolveTitle = typeof catalog.resolve === 'function'
      ? (title) => catalog.resolve(title)
      : (title) => resolvePcVersionWikiTitle(catalog, title);
    const resolved = linkedTitles.map((title) => ({ title, result: resolveTitle(title) }));
    const ambiguous = resolved.find((entry) => entry.result.status === 'ambiguous');
    if (ambiguous) {
      return { category, mappingStatus: 'unmapped', mappingReason: 'ambiguous-wiki-title', ambiguousTitle: ambiguous.title, targets: [] };
    }
    const targets = resolved.flatMap((entry) => entry.result.status === 'unique' ? entry.result.targets : []);
    if (targets.length > 0 && targets.length === resolved.length) {
      return {
        category,
        mappingStatus: 'mapped',
        mappingReason: null,
        impactStatus: 'unspecified_by_release_note',
        targets: dedupeCatalogTargets(targets)
      };
    }
    return { category, mappingStatus: 'unmapped', mappingReason: 'unknown-wiki-title', targets: [] };
  }

  const candidates = [];
  for (const rule of rules) {
    for (const alias of rule.aliases) {
      const normalizedAlias = alias.normalize('NFKC').trim();
      if (GENERIC_ALIASES.has(normalizedAlias.toLowerCase())) {
        throw new Error(`mapping rule ${rule.id} uses a generic alias: ${alias}`);
      }
      const expression = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(normalizedAlias)}(?![\\p{L}\\p{N}])`, 'giu');
      for (const match of bulletin.matchAll(expression)) {
        candidates.push({
          start: match.index,
          end: match.index + match[0].length,
          alias,
          rule
        });
      }
    }
  }

  const matches = removeOverlappingShorterAliases(candidates);
  if (matches.length === 0) {
    return { category, mappingStatus: 'unmapped', mappingReason: 'no-reviewed-rule', targets: [] };
  }

  const ambiguousAlias = findAmbiguousAlias(matches);
  if (ambiguousAlias) {
    return {
      category,
      mappingStatus: 'unmapped',
      mappingReason: 'ambiguous-alias',
      ambiguousAlias,
      targets: []
    };
  }

  const targetsByIdentity = new Map();
  for (const match of matches) {
    const target = match.rule.target;
    const identityKey = [target.domain, target.entityType, target.stableIdentity.kind, target.stableIdentity.value].join('|');
    const existing = targetsByIdentity.get(identityKey);
    if (existing) {
      existing.impactFields = [...new Set([...existing.impactFields, ...target.impactFields])].sort();
      existing.mappingRuleIds = [...new Set([...existing.mappingRuleIds, match.rule.id])].sort();
      if (!existing.matchedAliases.includes(match.alias)) existing.matchedAliases.push(match.alias);
      continue;
    }
    targetsByIdentity.set(identityKey, {
      domain: target.domain,
      entityType: target.entityType,
      stableIdentity: { ...target.stableIdentity },
      displayName: target.displayName,
      impactFields: [...target.impactFields].sort(),
      mappingRuleIds: [match.rule.id],
      matchedAliases: [match.alias],
      firstMatchAt: match.start
    });
  }

  const targets = [...targetsByIdentity.values()]
    .sort((left, right) => left.firstMatchAt - right.firstMatchAt || left.domain.localeCompare(right.domain)
      || left.stableIdentity.value.localeCompare(right.stableIdentity.value))
    .map(({ firstMatchAt: _firstMatchAt, ...target }) => ({
      ...target,
      mappingRuleIds: target.mappingRuleIds.sort(),
      matchedAliases: target.matchedAliases.sort()
    }));

  return { category, mappingStatus: 'mapped', mappingReason: null, targets };
}

function extractWikiLinkTitles(value) {
  if (typeof value !== 'string') return [];
  const visibleText = value
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<ref\b[^>]*\/\s*>/gi, ' ')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref\s*>/gi, ' ')
    .replace(/<nowiki\b[^>]*>[\s\S]*?<\/nowiki\s*>/gi, ' ');
  return [...visibleText.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function dedupeCatalogTargets(targets) {
  const byIdentity = new Map();
  for (const target of targets) {
    const key = [target.domain, target.entityType, target.stableIdentity.kind, target.stableIdentity.value].join('|');
    if (!byIdentity.has(key)) {
      byIdentity.set(key, {
        ...target,
        impactFields: [],
        impactStatus: 'unspecified_by_release_note'
      });
    }
  }
  return [...byIdentity.values()];
}

export function classifyPcChangeSection(sectionTitle) {
  const section = String(sectionTitle ?? '').normalize('NFKC').trim().toLowerCase();
  if (/bug\s*fix|fixes/.test(section)) return 'bug_fix';
  if (/content|addition|change|balance|adjust/.test(section)) return 'content_change';
  return 'informational';
}

function validateRule(rule, index) {
  const label = `mapping rule at index ${index}`;
  if (!rule || typeof rule !== 'object' || typeof rule.id !== 'string' || !rule.id.trim()) {
    throw new Error(`${label} requires a stable rule id`);
  }
  if (!Array.isArray(rule.aliases) || rule.aliases.length === 0
      || rule.aliases.some((alias) => typeof alias !== 'string' || !alias.trim())) {
    throw new Error(`mapping rule ${rule.id} requires explicit aliases`);
  }
  const target = rule.target;
  if (!target || typeof target.domain !== 'string' || !target.domain.trim()
      || typeof target.entityType !== 'string' || !target.entityType.trim()
      || typeof target.displayName !== 'string' || !target.displayName.trim()
      || typeof target.stableIdentity?.kind !== 'string' || !target.stableIdentity.kind.trim()
      || typeof target.stableIdentity?.value !== 'string' || !target.stableIdentity.value.trim()) {
    throw new Error(`mapping rule ${rule.id} requires a stable identity and display name`);
  }
  if (!Array.isArray(target.impactFields) || target.impactFields.length === 0
      || target.impactFields.some((field) => typeof field !== 'string' || !field.trim())) {
    throw new Error(`mapping rule ${rule.id} requires explicit impact fields`);
  }
  if (new Set(target.impactFields).size !== target.impactFields.length) {
    throw new Error(`mapping rule ${rule.id} has duplicate impact fields`);
  }
}

function removeOverlappingShorterAliases(candidates) {
  const ordered = [...candidates].sort((left, right) => left.start - right.start
    || (right.end - right.start) - (left.end - left.start)
    || left.rule.id.localeCompare(right.rule.id));
  const kept = [];
  for (const candidate of ordered) {
    if (kept.some((existing) => candidate.start < existing.end && existing.start < candidate.end
        && (existing.end - existing.start) > (candidate.end - candidate.start))) {
      continue;
    }
    if (!kept.some((existing) => existing.start === candidate.start && existing.end === candidate.end
        && existing.rule.id === candidate.rule.id && existing.alias === candidate.alias)) {
      kept.push(candidate);
    }
  }
  return kept;
}

function findAmbiguousAlias(matches) {
  const rulesByAlias = new Map();
  for (const match of matches) {
    const key = match.alias.normalize('NFKC').toLowerCase();
    const identities = rulesByAlias.get(key) ?? new Set();
    const target = match.rule.target;
    identities.add([target.domain, target.entityType, target.stableIdentity.kind, target.stableIdentity.value].join('|'));
    rulesByAlias.set(key, identities);
  }
  const ambiguous = [...rulesByAlias.entries()].find(([, identities]) => identities.size > 1);
  return ambiguous?.[0] ?? null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
