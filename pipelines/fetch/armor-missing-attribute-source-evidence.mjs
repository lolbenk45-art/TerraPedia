import { createHash } from 'node:crypto';

import { parseIteminfoModulePayload } from '../lib/wiki-item-utils.mjs';

export const ARMOR_MISSING_ATTRIBUTE_SOURCE_EVIDENCE_SCHEMA =
  'armor-missing-attribute-source-evidence/v1';

export const ARMOR_MISSING_ATTRIBUTE_TARGETS = Object.freeze([
  { itemSourceId: 954, internalName: 'AncientIronHelmet', itemPageTitle: 'Ancient Iron Helmet', setTitle: 'Iron armor', slotGroup: 'head', factType: 'none' },
  { itemSourceId: 955, internalName: 'AncientGoldHelmet', itemPageTitle: 'Ancient Gold Helmet', setTitle: 'Gold armor', slotGroup: 'head', factType: 'none' },
  { itemSourceId: 5524, internalName: 'ChlorophyteVisor', itemPageTitle: 'Chlorophyte Visor', setTitle: 'Chlorophyte armor', slotGroup: 'head', factType: 'chlorophyte-visor' },
  { itemSourceId: 5588, internalName: 'UpgradedMiningHead', itemPageTitle: 'Prospector Helmet', setTitle: 'Prospector armor', slotGroup: 'head', factType: 'prospector' },
  { itemSourceId: 5589, internalName: 'UpgradedMiningBody', itemPageTitle: 'Prospector Shirt', setTitle: 'Prospector armor', slotGroup: 'body', factType: 'prospector' },
  { itemSourceId: 5590, internalName: 'UpgradedMiningLegs', itemPageTitle: 'Prospector Pants', setTitle: 'Prospector armor', slotGroup: 'legs', factType: 'prospector' },
  { itemSourceId: 5591, internalName: 'UpgradedFishingHead', itemPageTitle: 'Captain Hat', setTitle: 'Captain armor', slotGroup: 'head', factType: 'captain' },
  { itemSourceId: 5592, internalName: 'UpgradedFishingBody', itemPageTitle: 'Captain Vest', setTitle: 'Captain armor', slotGroup: 'body', factType: 'captain' },
  { itemSourceId: 5593, internalName: 'UpgradedFishingLegs', itemPageTitle: 'Captain Pants', setTitle: 'Captain armor', slotGroup: 'legs', factType: 'captain' },
]);

const TARGET_BY_ID = new Map(ARMOR_MISSING_ATTRIBUTE_TARGETS.map(target => [target.itemSourceId, target]));
const HASH = /^sha256:[a-f0-9]{64}$/;
const SLOT_FIELDS = Object.freeze({ head: 'headSlot', body: 'bodySlot', legs: 'legSlot' });
const SLOT_INDEX = Object.freeze({ head: 0, body: 1, legs: 2 });

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function hashText(value) {
  return `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value;
}

function requireRevision(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} revisionId is required`);
  return value;
}

function requireTimestamp(value, label) {
  const text = requireText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new Error(`${label} revisionTimestamp is invalid`);
  }
  return text;
}

function sourceIdentity(payload, label) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error(`${label} payload is required`);
  return {
    pageTitle: requireText(payload.pageTitle, `${label} pageTitle`),
    pageId: requireRevision(payload.pageId, `${label} pageId`),
    revisionId: requireRevision(payload.revisionId, `${label}`),
    revisionTimestamp: requireTimestamp(payload.revisionTimestamp, label),
  };
}

function stripMarkup(value) {
  return String(value ?? '')
    .replace(/<!--[^]*?-->/g, '')
    .replace(/'''/g, '')
    .replace(/''/g, '')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitRows(wikitext) {
  return String(wikitext ?? '').split(/\n\|-\s*\n/).filter(row => row.includes('|'));
}

function splitCells(row) {
  return [...String(row).matchAll(/(?:^|\n)\|\s?([\s\S]*?)(?=\n\||$)/g)]
    .map(match => match[1].replace(/^style="[^"]*"\s*\|\s*/, '').replace(/^class="[^"]*"\s*\|\s*/, '').trim());
}

function findOverviewRow(wikitext, target) {
  const marker = `{{item|mode=text|wrap=y|${target.setTitle}}}`;
  const row = splitRows(wikitext).find(candidate => candidate.includes(marker));
  if (!row) throw new Error(`Armor overview row is missing: ${target.setTitle}`);
  const cells = splitCells(row);
  if (cells.length < 7) throw new Error(`Armor overview row is incomplete: ${target.setTitle}`);
  const effectCell = cells[6];
  const effectLines = effectCell.split(/\r?\n/)
    .map(line => line.replace(/^\s*\*+\s*/, '').trim())
    .filter(Boolean);
  return {
    row,
    rowHash: hashText(row),
    cells,
    effectLines,
  };
}

function memberDefense(overview, target) {
  const cells = overview.cells;
  if (target.setTitle === 'Chlorophyte armor') {
    const summonMatch = cells[2].match(/'''Summon:''':?\s*(\d+)/i);
    if (!summonMatch) throw new Error('Chlorophyte summon defense evidence is missing');
    return Number(summonMatch[1]);
  }
  const value = Number(cells[2 + SLOT_INDEX[target.slotGroup]]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Armor overview ${target.setTitle} defense is invalid`);
  return value;
}

function itemFacts(target, lines) {
  if (target.factType === 'none') return { facts: [], sourceLines: [] };
  if (target.factType === 'chlorophyte-visor') {
    const source = lines.find(line => /Chlorophyte Visor:/i.test(line));
    if (!source || !/\+16% summon damage/i.test(source) || !/\+1 minion capacity/i.test(source)) {
      throw new Error('Chlorophyte Visor item-scoped effect evidence is missing');
    }
    return {
      sourceLines: [source],
      facts: [
        { statKey: 'summonDamage', valueDecimal: 16, unit: 'percent', operation: 'add' },
        { statKey: 'minionSlots', valueDecimal: 1, unit: 'points', operation: 'add' },
      ],
    };
  }
  if (target.factType === 'prospector') {
    const source = lines.find(line => /\+20%.*mining speed/i.test(line));
    if (!source) throw new Error('Prospector item-scoped mining-speed evidence is missing');
    return {
      sourceLines: [source],
      facts: [{ statKey: 'miningSpeed', valueDecimal: 20, unit: 'percent', operation: 'add' }],
    };
  }
  if (target.factType === 'captain') {
    const source = lines.find(line => /\+15 Fishing Power/i.test(line));
    if (!source || !/\+5 for each piece/i.test(source)) {
      throw new Error('Captain per-piece fishing-power evidence is missing');
    }
    return {
      sourceLines: [source],
      facts: [{ statKey: 'fishingPower', valueDecimal: 5, unit: 'points', operation: 'add' }],
    };
  }
  throw new Error(`Unsupported Armor missing-attribute fact type: ${target.factType}`);
}

function setFacts(lines, itemSourceLines) {
  const itemSet = new Set(itemSourceLines);
  return lines
    .filter(line => !itemSet.has(line))
    .map(stripMarkup)
    .filter(line => !/^Chlorophyte\s+(?:Headgear|Helmet|Mask|Visor):/i.test(line))
    .filter(line => /bonus|effect|spawn|light|leaf crystal|damage reduction|movement speed|mana|ammo|critical strike|damage/i.test(line))
    .map(line => line.replace(/^(?:Set Bonus|Set Effect|Effect):\s*/i, '').trim())
    .filter(Boolean);
}

function parseSlot(info, target) {
  const field = SLOT_FIELDS[target.slotGroup];
  const active = Object.entries(SLOT_FIELDS).filter(([, key]) => Number(info?.[key]) > 0);
  if (active.length !== 1 || active[0][0] !== target.slotGroup || Number(info?.[field]) <= 0) {
    throw new Error(`Armor Iteminfo slot identity mismatch for ${target.itemSourceId}`);
  }
  return target.slotGroup;
}

function validateItemPage(entry, target) {
  const itemSourceId = entry?.itemSourceId ?? entry?.itemId;
  const requestedPageTitle = entry?.requestedPageTitle ?? entry?.pageTitle;
  if (!entry || itemSourceId !== target.itemSourceId || entry.internalName !== target.internalName
      || requestedPageTitle !== target.itemPageTitle) {
    throw new Error(`Armor missing-attribute item page identity mismatch for ${target.itemSourceId}`);
  }
  const identity = sourceIdentity(entry.payload, `item page ${target.itemSourceId}`);
  if (!new RegExp(`\\bauto\\s*=\\s*${target.itemSourceId}\\b`).test(entry.payload.wikitext ?? '')) {
    throw new Error(`Armor missing-attribute item page does not bind item ${target.itemSourceId}`);
  }
  const wikitext = requireText(entry.payload.wikitext, `item page ${target.itemSourceId} wikitext`);
  const html = requireText(entry.payload.html, `item page ${target.itemSourceId} html`);
  return { ...identity, contentHash: hashText(wikitext), htmlHash: hashText(html) };
}

export function buildArmorMissingAttributeSourceEvidence({
  armorOverview,
  iteminfo,
  itemPages,
  targetIds = ARMOR_MISSING_ATTRIBUTE_TARGETS.map(target => target.itemSourceId),
} = {}) {
  const overviewIdentity = sourceIdentity(armorOverview, 'Armor overview');
  if (overviewIdentity.pageTitle !== 'Armor') throw new Error('Armor overview page identity is invalid');
  const overviewWikitext = requireText(armorOverview.wikitext, 'Armor overview wikitext');
  const iteminfoIdentity = sourceIdentity(iteminfo, 'Iteminfo source');
  if (iteminfoIdentity.pageTitle !== 'Module:Iteminfo/data') throw new Error('Iteminfo source page identity is invalid');
  const iteminfoRows = parseIteminfoModulePayload(requireText(iteminfo.wikitext, 'Iteminfo source wikitext'));
  if (!Array.isArray(itemPages)) throw new Error('Armor missing-attribute item pages are required');
  const targets = targetIds.map(value => TARGET_BY_ID.get(Number(value)));
  if (targets.some(target => !target) || new Set(targets.map(target => target.itemSourceId)).size !== targets.length) {
    throw new Error('Armor missing-attribute target IDs are invalid or duplicated');
  }
  const pageById = new Map(itemPages.map(entry => [entry?.itemSourceId ?? entry?.itemId, entry]));
  const records = targets.map(target => {
    const info = iteminfoRows[target.itemSourceId];
    if (!info || info.internalName !== target.internalName) throw new Error(`Iteminfo identity is missing: ${target.itemSourceId}`);
    const slotGroup = parseSlot(info, target);
    const overview = findOverviewRow(overviewWikitext, target);
    const overviewDefense = memberDefense(overview, target);
    if (Number(info.defense) !== overviewDefense) {
      throw new Error(`Armor defense evidence disagrees for ${target.itemSourceId}`);
    }
    const itemPage = validateItemPage(pageById.get(target.itemSourceId), target);
    const parsedFacts = itemFacts(target, overview.effectLines);
    const itemSourceLines = parsedFacts.sourceLines.map(stripMarkup);
    return {
      identity: {
        itemSourceId: target.itemSourceId,
        internalName: target.internalName,
        itemName: requireText(info.name, `Iteminfo ${target.itemSourceId} name`),
        slotGroup,
        defenseValue: Number(info.defense),
      },
      source: {
        overview: { ...overviewIdentity, contentHash: hashText(overviewWikitext), rowHash: overview.rowHash, setTitle: target.setTitle },
        iteminfo: iteminfoIdentity,
        itemPage,
      },
      effectLines: overview.effectLines.map(stripMarkup),
      itemScopedSourceLines: itemSourceLines,
      itemScopedFacts: parsedFacts.facts,
      setOwnedFacts: setFacts(overview.effectLines, parsedFacts.sourceLines),
      sourceStatus: 'revision-bound',
    };
  });
  const payload = {
    schemaVersion: ARMOR_MISSING_ATTRIBUTE_SOURCE_EVIDENCE_SCHEMA,
    executable: false,
    databaseWrites: false,
    targetGameVersion: '1.4.5.8',
    sourceRevision: {
      armorOverview: overviewIdentity.revisionId,
      iteminfo: iteminfoIdentity.revisionId,
    },
    records,
    acceptance: { status: 'source-evidence-ready', blockers: [] },
  };
  return { ...payload, evidenceSha256: hashJson(payload) };
}

export function validateArmorMissingAttributeSourceEvidence(evidence) {
  if (!evidence || evidence.schemaVersion !== ARMOR_MISSING_ATTRIBUTE_SOURCE_EVIDENCE_SCHEMA
      || evidence.executable !== false || evidence.databaseWrites !== false
      || !HASH.test(evidence.evidenceSha256 ?? '')) throw new Error('Armor missing-attribute source evidence identity is invalid');
  const { evidenceSha256, ...payload } = evidence;
  if (hashJson(payload) !== evidenceSha256) throw new Error('Armor missing-attribute source evidence hash drifted');
  return true;
}
