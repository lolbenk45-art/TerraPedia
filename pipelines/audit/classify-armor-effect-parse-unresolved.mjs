import { createHash } from 'node:crypto';

export const ARMOR_EFFECT_PARSE_UNRESOLVED_CLASSIFICATION_SCHEMA =
  'armor-effect-parse-unresolved-classification/v1';

const HASH = /^sha256:[a-f0-9]{64}$/;
const CATEGORIES = Object.freeze([
  'behavior-trigger',
  'compound-numeric',
  'non-effect-label',
  'numeric-simple',
  'unknown-prose',
  'visual-behavior',
]);

function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}
function hashJson(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex')}`;
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is required`);
  return value;
}

function numericCount(line) {
  return [...line.matchAll(/[+\-−]?\d+(?:\.\d+)?/g)].length;
}

function normalizedLine(line) {
  return line.trim().replace(/^\([^)]*\)\s*/, '').replace(/\s+/g, ' ');
}

function classifyLine(rawLine) {
  const line = normalizedLine(rawLine);
  if (line === '' || /^(?:套装奖励|套装效果|物品|给予增益|增益描述|伤害星云|生命星云|魔力星云|套装奖励：)$/.test(line)) {
    return 'non-effect-label';
  }
  if (/^[+\-−]?\d+(?:\.\d+)?%\s*(?:魔力消耗|移动速度)$/.test(line)
      || /^[+\-−]?\d+(?:\.\d+)?\s*生命\/秒(?:的)?生命再生$/.test(line)) {
    return 'numeric-simple';
  }
  if (numericCount(line) > 0 && /(?:每|最高|持续|伤害|击退|暴击|冷却|速度|范围|魔力|生命|再生|减免|倍|秒|图格|DPS)/i.test(line)) {
    return 'compound-numeric';
  }
  if (/(?:残影|拖影|粒子|发光|光亮|外观|轮廓|树晶|水晶)/.test(line)) return 'visual-behavior';
  if (/(?:双击|召唤|受到|击中|攻击|增益|隐形|移动时|玩家|敌怪|减益|哨兵|花瓣|仆从)/.test(line)) return 'behavior-trigger';
  return 'unknown-prose';
}

function moduleOwners(modulePayload) {
  if (!modulePayload || !Array.isArray(modulePayload.armorSets)) throw new Error('Armor effect module payload is required');
  const byKey = new Map();
  for (const record of modulePayload.armorSets) {
    const textKey = requireText(record?.textKey, 'Armor effect text key');
    if (byKey.has(textKey)) throw new Error(`Armor effect text key is duplicate: ${textKey}`);
    if (!Array.isArray(record.uniqueItemIds) || record.uniqueItemIds.some(id => !Number.isSafeInteger(id) || id < 0)) {
      throw new Error(`Armor effect owner IDs are invalid: ${textKey}`);
    }
    if (typeof record.effectText !== 'string') throw new Error(`Armor effect text is missing: ${textKey}`);
    byKey.set(textKey, record);
  }
  return byKey;
}

export function buildArmorEffectParseUnresolvedClassification({ evidenceHash, blockers, modulePayload } = {}) {
  if (!HASH.test(evidenceHash ?? '')) throw new Error('Armor effect classification evidence hash is required');
  if (!Array.isArray(blockers)) throw new Error('Armor effect classification blockers are required');
  const byKey = moduleOwners(modulePayload);
  const occurrences = new Map();
  for (const blocker of blockers) {
    if (blocker?.code !== 'source-effect-parse-unresolved') continue;
    const textKey = requireText(blocker.textKey, 'Armor unresolved effect text key');
    const sourceLineIndex = blocker.sourceLineIndex;
    if (!Number.isSafeInteger(sourceLineIndex) || sourceLineIndex < 0) throw new Error('Armor unresolved effect line index is invalid');
    const record = byKey.get(textKey);
    if (!record) throw new Error(`Armor unresolved effect owner is missing: ${textKey}`);
    const lines = record.effectText.split(/\r?\n/);
    const rawLine = lines[sourceLineIndex];
    if (rawLine == null) throw new Error(`Armor unresolved effect line is missing: ${textKey}:${sourceLineIndex}`);
    const key = `${textKey}\u0000${sourceLineIndex}`;
    const current = occurrences.get(key) ?? {
      textKey,
      sourceLineIndex,
      line: rawLine,
      category: classifyLine(rawLine),
      occurrences: 0,
      owners: [...record.uniqueItemIds],
      sourcePage: record.effectTextSource?.pageTitle ?? null,
    };
    current.occurrences += 1;
    occurrences.set(key, current);
  }
  const entries = [...occurrences.values()].sort((left, right) => left.textKey.localeCompare(right.textKey) || left.sourceLineIndex - right.sourceLineIndex);
  const byCategory = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
  for (const entry of entries) byCategory[entry.category] += entry.occurrences;
  const body = {
    schemaVersion: ARMOR_EFFECT_PARSE_UNRESOLVED_CLASSIFICATION_SCHEMA,
    executable: false,
    databaseWrites: false,
    applyAllowed: false,
    sourceEvidenceHash: evidenceHash,
    summary: {
      totalOccurrences: entries.reduce((total, entry) => total + entry.occurrences, 0),
      uniqueLines: entries.length,
      byCategory,
    },
    entries,
  };
  return { ...body, classificationSha256: hashJson(body) };
}

export function validateArmorEffectParseUnresolvedClassification(value) {
  if (!value || value.schemaVersion !== ARMOR_EFFECT_PARSE_UNRESOLVED_CLASSIFICATION_SCHEMA
      || value.executable !== false || value.databaseWrites !== false || value.applyAllowed !== false
      || !HASH.test(value.sourceEvidenceHash ?? '') || !Array.isArray(value.entries)) {
    throw new Error('Armor effect classification identity is invalid');
  }
  const { classificationSha256, ...body } = value;
  if (!HASH.test(classificationSha256 ?? '') || hashJson(body) !== classificationSha256) {
    throw new Error('Armor effect classification hash drifted');
  }
  const total = value.entries.reduce((sum, entry) => sum + Number(entry.occurrences), 0);
  if (value.summary?.totalOccurrences !== total || value.summary?.uniqueLines !== value.entries.length) {
    throw new Error('Armor effect classification summary drifted');
  }
  return true;
}
