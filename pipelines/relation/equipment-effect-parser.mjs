const STAT_LABELS_ZH = {
  defense: '防御',
  damage_bonus: '伤害',
  crit_chance: '暴击率',
  move_speed: '移动速度',
  melee_speed: '近战速度',
  whip_speed: '鞭速度',
  whip_range: '鞭范围',
  summon_damage: '召唤伤害',
  minion_capacity: '仆从容量',
  mana_max: '最大魔力',
  mana_cost: '魔力花费',
  ammo_conservation: '弹药节省',
  mining_speed: '挖矿速度',
  fishing_power: '渔力',
  acceleration: '加速度',
  max_move_speed_multiplier: '最大移动速度倍率',
  damage_flat: '固定伤害',
  knockback: '击退',
  dash_enabled: '猛冲',
  immunity: '免疫',
  special_effect: '特殊效果'
};

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u2212/g, '-')
    .replace(/\uff05/g, '%')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function detectApplyScope(line) {
  if (/^套装奖励[:：]/.test(line)) {
    return 'set_bonus';
  }
  if (/^套装效果[:：]/.test(line)) {
    return 'visual_or_special';
  }
  return null;
}

function stripKnownPrefix(line) {
  const applyScope = detectApplyScope(line);
  if (applyScope) {
    return {
      applyScope,
      variantLabel: null,
      body: normalizeText(line.replace(/^套装(?:奖励|效果)[:：]/, ''))
    };
  }

  const variantMatch = line.match(/^([^:：]+)[:：](.+)$/);
  if (variantMatch && !/[+%]|\d/.test(variantMatch[1])) {
    return {
      applyScope: null,
      variantLabel: normalizeText(variantMatch[1]),
      body: normalizeText(variantMatch[2])
    };
  }

  return {
    applyScope: null,
    variantLabel: null,
    body: line
  };
}

function splitEffectParts(body) {
  return normalizeText(body)
    .split(/[、,，；;]/)
    .map((part) => normalizeText(part))
    .filter(Boolean);
}

function classScopeFor(text) {
  if (/近战/.test(text)) return 'melee';
  if (/远程/.test(text)) return 'ranged';
  if (/魔法/.test(text)) return 'magic';
  if (/召唤/.test(text)) return 'summon';
  return 'all';
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildParsed(statKey, part, overrides = {}) {
  const classScope = Object.hasOwn(overrides, 'classScope') ? overrides.classScope : classScopeFor(part);
  return {
    statKey,
    statLabelZh: STAT_LABELS_ZH[statKey] ?? statKey,
    classScope,
    operation: overrides.operation ?? 'add',
    valueDecimal: overrides.valueDecimal ?? null,
    valueMaxDecimal: overrides.valueMaxDecimal ?? null,
    unit: overrides.unit ?? null,
    conditionText: overrides.conditionText ?? null,
    parseStatus: 'parsed',
    confidence: overrides.confidence ?? 0.9
  };
}

function parseNumericPart(part) {
  const percentMatch = part.match(/^([+-]?\d+(?:\.\d+)?)%\s*(.+)$/);
  if (percentMatch) {
    const value = numeric(percentMatch[1]);
    const label = percentMatch[2];
    if (/的几率不消耗弹药|不消耗弹药/.test(label)) {
      return buildParsed('ammo_conservation', part, { valueDecimal: value, unit: 'percent', classScope: null });
    }
    if (/挖矿速度/.test(label)) {
      return buildParsed('mining_speed', part, { valueDecimal: value, unit: 'percent', classScope: null });
    }
    if (/移动速度/.test(label)) {
      return buildParsed('move_speed', part, { valueDecimal: value, unit: 'percent', classScope: null });
    }
    if (/近战速度/.test(label)) {
      return buildParsed('melee_speed', part, { valueDecimal: value, unit: 'percent', classScope: 'melee' });
    }
    if (/鞭速度/.test(label)) {
      return buildParsed('whip_speed', part, { valueDecimal: value, unit: 'percent', classScope: 'summon' });
    }
    if (/鞭范围/.test(label)) {
      return buildParsed('whip_range', part, { valueDecimal: value, unit: 'percent', classScope: 'summon' });
    }
    if (/暴击率|暴击/.test(label)) {
      return buildParsed('crit_chance', part, { valueDecimal: value, unit: 'percent' });
    }
    if (/召唤伤害/.test(label)) {
      return buildParsed('summon_damage', part, { valueDecimal: value, unit: 'percent', classScope: 'summon' });
    }
    if (/伤害/.test(label)) {
      return buildParsed('damage_bonus', part, { valueDecimal: value, unit: 'percent' });
    }
    if (/魔力花费|魔力消耗/.test(label)) {
      return buildParsed('mana_cost', part, { valueDecimal: value, unit: 'percent', classScope: null });
    }
    if (/加速度|减速度/.test(label)) {
      return buildParsed('acceleration', part, { valueDecimal: value, unit: 'percent', classScope: null });
    }
  }

  const signedCountMatch = part.match(/^([+-]?\d+(?:\.\d+)?)\s*(.+)$/);
  if (signedCountMatch) {
    const value = numeric(signedCountMatch[1]);
    const label = signedCountMatch[2];
    if (/防御/.test(label)) {
      return buildParsed('defense', part, { valueDecimal: value, unit: 'count', classScope: null });
    }
    if (/仆从容量|仆从上限/.test(label)) {
      return buildParsed('minion_capacity', part, { valueDecimal: value, unit: 'count', classScope: null });
    }
    if (/最大魔力/.test(label)) {
      return buildParsed('mana_max', part, { valueDecimal: value, unit: 'count', classScope: 'magic' });
    }
    if (/渔力/.test(label)) {
      return buildParsed('fishing_power', part, { valueDecimal: value, unit: 'count', classScope: null });
    }
    if (/伤害/.test(label)) {
      return buildParsed('damage_flat', part, { valueDecimal: value, unit: 'count' });
    }
    if (/击退/.test(label)) {
      return buildParsed('knockback', part, { valueDecimal: value, unit: 'count', classScope: null });
    }
  }

  const multiplierMatch = part.match(/最大移动速度\s*[×x]\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (multiplierMatch) {
    return buildParsed('max_move_speed_multiplier', part, {
      valueDecimal: numeric(multiplierMatch[1]),
      unit: 'multiplier',
      classScope: null,
      operation: 'multiply'
    });
  }

  return null;
}

function parseFlagPart(part) {
  if (/允许猛冲|可猛冲|启用猛冲/.test(part)) {
    return buildParsed('dash_enabled', part, {
      operation: 'set_flag',
      valueDecimal: null,
      unit: 'boolean',
      classScope: null
    });
  }
  if (/免疫/.test(part)) {
    return buildParsed('immunity', part, {
      operation: 'set_flag',
      valueDecimal: null,
      unit: 'boolean',
      classScope: null
    });
  }
  return null;
}

function parseEffectPart(part) {
  return parseNumericPart(part) ?? parseFlagPart(part);
}

function buildUnparsed(part) {
  return {
    statKey: 'special_effect',
    statLabelZh: STAT_LABELS_ZH.special_effect,
    classScope: null,
    operation: null,
    valueDecimal: null,
    valueMaxDecimal: null,
    unit: null,
    conditionText: null,
    parseStatus: 'unparsed',
    confidence: 0.3
  };
}

function buildBaseRow({ owner, sourceKind, sourceLocale, sourceLineIndex, sourceLine, rawText, prefix, effectIndex }) {
  return {
    ownerKind: owner?.ownerKind ?? null,
    ownerRecordKey: owner?.ownerRecordKey ?? null,
    ownerId: owner?.ownerId ?? null,
    ownerKey: owner?.ownerKey ?? null,
    sourceKind,
    sourceLocale,
    sourceLineIndex,
    sourceLine,
    effectIndex,
    applyScope: prefix.applyScope,
    variantLabel: prefix.variantLabel,
    itemInternalName: null,
    slotType: null,
    rawText,
    sourceProvider: owner?.sourceProvider ?? null,
    sourcePage: owner?.sourcePage ?? null,
    sourceRevisionTimestamp: owner?.sourceRevisionTimestamp ?? null,
    status: 1,
    deleted: 0
  };
}

export function parseEquipmentEffectLines({
  owner = {},
  text = '',
  sourceKind = 'benefit_zh',
  sourceLocale = 'zh'
} = {}) {
  const rows = [];
  const lines = splitLines(text);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const sourceLine = lines[lineIndex];
    const prefix = stripKnownPrefix(sourceLine);
    const parts = splitEffectParts(prefix.body);
    if (parts.length === 0) {
      rows.push({
        ...buildBaseRow({ owner, sourceKind, sourceLocale, sourceLineIndex: lineIndex, sourceLine, rawText: sourceLine, prefix, effectIndex: 0 }),
        ...buildUnparsed(sourceLine)
      });
      continue;
    }
    for (let effectIndex = 0; effectIndex < parts.length; effectIndex += 1) {
      const part = parts[effectIndex];
      rows.push({
        ...buildBaseRow({ owner, sourceKind, sourceLocale, sourceLineIndex: lineIndex, sourceLine, rawText: part, prefix, effectIndex }),
        ...(parseEffectPart(part) ?? buildUnparsed(part))
      });
    }
  }
  return rows;
}
