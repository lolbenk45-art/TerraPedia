import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parseIteminfoModulePayload } from '../lib/wiki-item-utils.mjs';
import { buildProjectionPayload } from './projection-sync.mjs';

const HEADS = [
  { id: 1546, name: 'Headgear', scope: '[[bows]], [[repeaters]], [[arrows]], and [[Stake]]s' },
  { id: 1547, name: 'Mask', scope: '[[guns]], [[bullets]], and [[Candy Corn]]' },
  { id: 1548, name: 'Helmet', scope: 'specialist ranged weapons (non-consumable ranged weapons that are not bows or guns) and their ammunition' },
];
const MULTIPLICATION = "The ×1.12 damage boost to the specific ammunition type is applied ''after'' applying damage increases from the rest of the armor set, [[accessories]], and [[buffs]].";
const ATTRIBUTION = 'As a result, Shroomite headpieces provide a larger damage bonus than their [[tooltips]] would suggest.';
const HISTORY = '{{history|Desktop 1.4.5.0|\n** Each piece of Shroomite headgear now applies its damage bonus to ammo as well as weapons.\n** Each piece of Shroomite headgear damage bonus has been reduced from 15% to 12%.}}';
const VERSION_REFERENCE = '{{source code ref|v=1.4.5.8|method=Terraria.Player.GetWeaponDamage}}';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function exactKeys(object, keys, label) {
  if (!object || typeof object !== 'object' || Array.isArray(object)
      || !isDeepStrictEqual(Object.keys(object).sort(), [...keys].sort())) {
    throw new Error(`Armor Shroomite ${label} requires exact inputs`);
  }
}

function readSource(source, title, role) {
  exactKeys(source, ['bytes', 'expected'], 'source');
  exactKeys(source.expected, ['sha256', 'pageTitle', 'pageId', 'revisionId', 'revisionTimestamp'], 'source binding');
  if (!Buffer.isBuffer(source.bytes) || !/^sha256:[a-f0-9]{64}$/.test(source.expected.sha256)
      || hash(source.bytes) !== source.expected.sha256) throw new Error('Armor Shroomite source byte hash drift');
  const raw = JSON.parse(source.bytes.toString('utf8'));
  if (raw.apiUrl !== 'https://terraria.wiki.gg/api.php') throw new Error('Armor Shroomite source provider is invalid');
  for (const field of ['pageTitle', 'pageId', 'revisionId', 'revisionTimestamp']) {
    if (raw[field] !== source.expected[field]) throw new Error(`Armor Shroomite source ${field} drift`);
  }
  if (raw.pageTitle !== title) throw new Error('Armor Shroomite source pageTitle is invalid');
  for (const field of ['pageId', 'revisionId']) {
    if (!Number.isSafeInteger(raw[field]) || raw[field] <= 0) throw new Error(`Armor Shroomite source ${field} is invalid`);
  }
  const timestamp = raw.revisionTimestamp;
  if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)
      || !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString().slice(0, 19) !== timestamp.slice(0, 19)) {
    throw new Error('Armor Shroomite source revisionTimestamp is invalid');
  }
  if (typeof raw.wikitext !== 'string' || !raw.wikitext.trim()) throw new Error('Armor Shroomite wikitext is required');
  return { raw, binding: {
    sha256: source.expected.sha256, pageTitle: raw.pageTitle, pageId: raw.pageId,
    revisionId: raw.revisionId, revisionTimestamp: raw.revisionTimestamp, provider: 'terraria.wiki.gg', role,
  } };
}

function once(text, quote, label) {
  const offset = text.indexOf(quote);
  if (offset < 0 || text.indexOf(quote, offset + quote.length) >= 0) {
    throw new Error(`Armor Shroomite ${label} quotation is missing or ambiguous`);
  }
  return offset;
}

function section(wikitext, from, to) {
  const text = `${wikitext}\n`;
  const start = once(text, `\n== ${from} ==\n`, 'section');
  const end = once(text, `\n== ${to} ==\n`, 'section');
  if (end <= start) throw new Error('Armor Shroomite section order is invalid');
  return text.slice(start, end);
}

function validateIdentities(text) {
  const data = parseIteminfoModulePayload(text);
  for (const [id, name, slot] of [
    ...HEADS.map(head => [head.id, head.name, 'headSlot']),
    [1549, 'Breastplate', 'bodySlot'], [1550, 'Leggings', 'legSlot'],
  ]) {
    const matches = Object.entries(data).filter(([, row]) => row?.internalName === `Shroomite${name}`);
    const row = data[id];
    if (matches.length !== 1 || matches[0][0] !== String(id) || row.name !== `Shroomite ${name}`
        || !Number.isSafeInteger(row[slot]) || row[slot] <= 0
        || ['headSlot', 'bodySlot', 'legSlot'].some(other => other !== slot && Number(row[other]) > 0)) {
      throw new Error(`Armor Shroomite Iteminfo identity/slot is invalid for ${id}`);
    }
  }
}

function validateVariants(text) {
  // This intentionally recognizes only the reviewed Shroomite membership statement.
  // Importing the general fetch executable would start network/progress work.
  const original = text;
  const blank = comment => comment.replace(/[^\n]/g, ' ');
  text = text.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, blank).replace(/--[^\n]*/g, blank);
  const start = once(text, 'ArmorSetBonuses.Create(ArmorSetBonuses.Benefits.Shroomite,', 'set variant');
  const end = text.indexOf(';', start);
  const statement = text.slice(start, end + 1);
  const match = statement.match(/^ArmorSetBonuses\.Create\(ArmorSetBonuses\.Benefits\.Shroomite,\s*"ArmorSetBonus\.Shroomite"\)((?:\s*:Set\(\d+,\s*\d+,\s*\d+\)){3})\s*:Add\(\);$/);
  if (!match) throw new Error('Armor Shroomite set variant statement is unsupported');
  const variants = [...match[1].matchAll(/:Set\((\d+),\s*(\d+),\s*(\d+)\)/g)]
    .map(row => row.slice(1).map(Number)).sort((a, b) => a[0] - b[0]);
  if (!isDeepStrictEqual(variants, HEADS.map(head => [head.id, 1549, 1550]))) {
    throw new Error('Armor Shroomite set variant membership drift');
  }
  return original.slice(start, end + 1);
}

/** Derive current item-source facts only; this is not an executable ingestion proposal. */
export function buildArmorShroomiteSourceCandidate(input) {
  exactKeys(input, ['page', 'iteminfo', 'armorSets', 'targetGameVersion'], 'candidate');
  if (input.targetGameVersion !== '1.4.5.8') throw new Error('Armor Shroomite target game version is not evidenced');
  const page = readSource(input.page, 'Shroomite armor', 'item-damage-semantics');
  const iteminfo = readSource(input.iteminfo, 'Module:Iteminfo/data', 'identity-only');
  const armorSets = readSource(input.armorSets, 'Module:ArmorSetBonuses', 'membership-only');
  validateIdentities(iteminfo.raw.wikitext);
  const membership = validateVariants(armorSets.raw.wikitext);
  // Preserve offsets while excluding invisible comments from semantic evidence.
  const wikitext = page.raw.wikitext.replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ' '));
  const notes = section(wikitext, 'Notes', 'Tips');
  once(notes, MULTIPLICATION, 'multiplication');
  once(notes, ATTRIBUTION, 'item attribution');
  once(notes, VERSION_REFERENCE, 'game version');
  once(section(wikitext, 'History', 'References'), HISTORY, 'version history');
  const equippedStart = once(wikitext, 'The full set grants the following effects while equipped:', 'equipped effects');
  const equippedEnd = once(wikitext, '\n== Set ==\n', 'section');
  if (equippedEnd <= equippedStart) throw new Error('Armor Shroomite equipped section order is invalid');
  const equipped = wikitext.slice(equippedStart, equippedEnd);
  const sources = { page: page.binding, iteminfo: iteminfo.binding, armorSets: armorSets.binding };
  const effects = HEADS.map(head => {
    const header = `|-|With ${head.name}=\n`;
    const start = once(equipped, header, 'head variant') + header.length;
    const next = equipped.indexOf('\n|-|', start);
    const end = next >= 0 ? next : equipped.indexOf('\n</tabber>', start);
    if (end < 0) throw new Error('Armor Shroomite head variant boundary is missing');
    const block = equipped.slice(start, end);
    const lines = block.split('\n').filter(line => line.includes('damage of'));
    const quote = `* ×1.12<ref name="multiplicative-increase"/> damage of ${head.scope}`;
    if (lines.length !== 1 || lines[0] !== quote) throw new Error('Armor Shroomite head variant damage scope/magnitude is unsupported');
    const rawJson = JSON.stringify({ targetGameVersion: input.targetGameVersion, changedIn: '1.4.5.0', sources,
      quotes: { damage: quote, multiplication: MULTIPLICATION, attribution: ATTRIBUTION, history: HISTORY,
        versionReference: VERSION_REFERENCE, membership },
      itemIdentity: { itemId: head.id, internalName: `Shroomite${head.name}`, slotType: 'headSlot' } });
    return {
      recordKey: hash(Buffer.from(rawJson)).slice(7), ownerKind: 'item', ownerRecordKey: null,
      ownerId: head.id, ownerKey: `Shroomite${head.name}`, sourceKind: 'armor_item_page', sourceLocale: 'en',
      sourceLineIndex: wikitext.slice(0, equippedStart + start + block.indexOf(quote)).split('\n').length - 1,
      sourceLine: quote, effectIndex: 0, applyScope: 'item_bonus', variantLabel: `Shroomite ${head.name}`,
      itemInternalName: `Shroomite${head.name}`, slotType: 'headSlot', statKey: 'damage_bonus', statLabelZh: '伤害',
      classScope: 'ranged', operation: 'multiply', valueDecimal: 1.12, valueMaxDecimal: null, unit: 'multiplier',
      conditionText: head.scope.replace(/\[\[([^\]]+)\]\]/g, '$1'), rawText: quote, parseStatus: 'parsed',
      sourceMaintTable: null, sourceMaintRecordKey: null, sourceMaintId: null, landingSourceId: null,
      landingSourceKey: null, landingContentHash: null, sourceProvider: 'terraria.wiki.gg',
      sourcePage: page.raw.pageTitle, sourceRevisionTimestamp: page.raw.revisionTimestamp,
      confidence: 1, reviewStatus: 'unresolved', reason: 'versioned_item_source_candidate_requires_upstream_lineage',
      rawJson, status: 1, deleted: 0,
    };
  });
  return {
    schemaVersion: 'armor-shroomite-item-source-candidate/v1', executable: false, databaseWrites: false,
    targetGameVersion: input.targetGameVersion, sources, effects,
    projectionEffects: buildProjectionPayload({ relationEquipmentEffectAttributes: effects }).projectionEquipmentEffectAttributes
      .map(({ id, ...row }) => row)
      .sort((left, right) => left.ownerId - right.ownerId),
    acceptance: { status: 'blocked', runtimeVerified: false, blockers: [
      { code: 'item-source-upstream-lineage-unbound' },
      { code: 'complete-item-and-set-coverage-unverified' },
    ] },
  };
}

export function assertArmorShroomiteSourceCandidate({ candidate, source }) {
  if (!isDeepStrictEqual(candidate, buildArmorShroomiteSourceCandidate(source))) {
    throw new Error('Armor Shroomite source candidate drift');
  }
  return true;
}
