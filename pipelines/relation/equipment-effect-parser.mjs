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
  ammo_conservation: '弹药节约',
  aggro: '仇恨',
  damage_reduction: '伤害减免',
  health_regen: '生命再生',
  mana_regen: '魔力再生',
  enemy_spawn_rate: '敌怪生成速度',
  enemy_max_count: '最大敌怪数量',
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
  const normalized = normalizeText(body);
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '(' || character === '（' || character === '[') {
      depth += 1;
      continue;
    }
    if (character === ')' || character === '）' || character === ']') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && /[、,，；;]/.test(character)) {
      const part = normalizeText(normalized.slice(start, index));
      if (part) parts.push(part);
      start = index + 1;
    }
  }
  const finalPart = normalizeText(normalized.slice(start));
  if (finalPart) parts.push(finalPart);
  return parts;
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
  const qualifiedNumericMatch = part.match(/^\(([^()]*)\)\s*([+-]?\d+(?:\.\d+)?%?)\s*(.+)$/);
  if (qualifiedNumericMatch) {
    const parsed = parseNumericPart(`${qualifiedNumericMatch[2]} ${qualifiedNumericMatch[3]}`);
    return parsed ? { ...parsed, conditionText: qualifiedNumericMatch[1].trim() } : null;
  }
  const minionCapacityMatch = part.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:仆从位|仆从栏位|仆从容量)$/);
  if (minionCapacityMatch) {
    return buildParsed('minion_capacity', part, { valueDecimal: numeric(minionCapacityMatch[1]), unit: 'count', classScope: null });
  }
  const sentryCapacityMatch = part.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:哨兵栏|哨兵容量|额外哨兵容量)(?:（总计[^）]+）)?$/);
  if (sentryCapacityMatch) {
    return buildParsed('sentry_capacity', part, { valueDecimal: numeric(sentryCapacityMatch[1]), unit: 'count', classScope: null });
  }
  const aggroMatch = part.match(/^([+-]?\d+(?:\.\d+)?)\s*仇恨(?:（总计[^）]+）)?$/);
  if (aggroMatch) {
    return buildParsed('aggro', part, { valueDecimal: numeric(aggroMatch[1]), unit: 'count', classScope: null });
  }
  const healthRegenMatch = part.match(/^(?:提高)?生命再生速度（每秒\s*(?:大约\s*)?([+-]?\d+(?:\.\d+)?)/);
  if (healthRegenMatch) {
    return buildParsed('health_regen', part, { valueDecimal: numeric(healthRegenMatch[1]), unit: 'count', classScope: null });
  }
  const providedHealthRegenMatch = part.match(/^提供\s*([+-]?\d+(?:\.\d+)?)\s*生命(?:\/秒|每秒)/);
  if (providedHealthRegenMatch) {
    return buildParsed('health_regen', part, { valueDecimal: numeric(providedHealthRegenMatch[1]), unit: 'count', classScope: null });
  }
  const inlineHealthRegenMatch = part.match(/^([+-]?\d+(?:\.\d+)?)\s*生命\/秒(?:的)?生命再生$/);
  if (inlineHealthRegenMatch) {
    return buildParsed('health_regen', part, { valueDecimal: numeric(inlineHealthRegenMatch[1]), unit: 'count', classScope: null });
  }
  const manaRegenMatch = part.match(/^(?:提高)?魔力再生速度（每秒\s*(?:大约\s*)?([+-]?\d+(?:\.\d+)?)/);
  if (manaRegenMatch) {
    return buildParsed('mana_regen', part, { valueDecimal: numeric(manaRegenMatch[1]), unit: 'count', classScope: 'magic' });
  }
  const damageReductionMatch = part.match(/^每级提供\s*([+-]?\d+(?:\.\d+)?)%\s*伤害减免/);
  if (damageReductionMatch) {
    return buildParsed('damage_reduction', part, { valueDecimal: numeric(damageReductionMatch[1]), unit: 'percent', classScope: null, conditionText: '每级' });
  }
  const maxDamageReductionMatch = part.match(/^最高\s*([+-]?\d+(?:\.\d+)?)%\s*伤害减免/);
  if (maxDamageReductionMatch) {
    return buildParsed('damage_reduction', part, { valueDecimal: numeric(maxDamageReductionMatch[1]), unit: 'percent', classScope: null, conditionText: '最高' });
  }
  const providedDamageReductionMatch = part.match(/提供\s*([+-]?\d+(?:\.\d+)?)%\s*(?:的)?(?:基础)?伤害减免/);
  if (providedDamageReductionMatch) {
    return buildParsed('damage_reduction', part, { valueDecimal: numeric(providedDamageReductionMatch[1]), unit: 'percent', classScope: null });
  }
  const percentMatch = part.match(/^([+-]?\d+(?:\.\d+)?)%\s*(.+)$/);
  if (percentMatch) {
    const value = numeric(percentMatch[1]);
    const label = percentMatch[2];
    if (/伤害减免/.test(label)) {
      return buildParsed('damage_reduction', part, { valueDecimal: value, unit: 'percent', classScope: null });
    }
    if (/的几率不消耗弹药|不消耗弹药|弹药节约|减少弹药消耗/.test(label)) {
      return buildParsed('ammo_conservation', part, { valueDecimal: value, unit: 'percent', classScope: null });
    }
    if (/挖矿速度/.test(label)) {
      return buildParsed('mining_speed', part, { valueDecimal: value, unit: 'percent', classScope: null });
    }
    if (/移动速度/.test(label)) {
      return buildParsed('move_speed', part, { valueDecimal: value, unit: 'percent', classScope: null });
    }
    if (/击退/.test(label)) {
      return buildParsed('knockback', part, { valueDecimal: value, unit: 'percent', classScope: classScopeFor(label) });
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
    if (/敌怪生成速度/.test(label)) {
      return buildParsed('enemy_spawn_rate', part, { valueDecimal: value, unit: 'percent', classScope: null });
    }
    if (/最大敌怪数量/.test(label)) {
      return buildParsed('enemy_max_count', part, { valueDecimal: value, unit: 'percent', classScope: null });
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

function parseWholeEffectPart(part) {
  const multiplierMatch = part.match(/^(.+?)的伤害\s*[×x]\s*([0-9]+(?:\.\d+)?)(?:\[[^\]]+\])?$/i);
  if (multiplierMatch) {
    return buildParsed('damage_bonus', part, {
      operation: 'multiply', valueDecimal: numeric(multiplierMatch[2]), unit: 'multiplier',
      classScope: 'ranged', conditionText: multiplierMatch[1]
    });
  }
  const movementMultiplierMatch = part.match(/(?:额外施加\s*)?([0-9]+(?:\.\d+)?)\s*倍的移动速度倍率/);
  if (movementMultiplierMatch) {
    return buildParsed('max_move_speed_multiplier', part, {
      operation: 'multiply', valueDecimal: numeric(movementMultiplierMatch[1]), unit: 'multiplier', classScope: null
    });
  }
  const damageIncreaseMatch = part.match(/^伤害提高\s*([+-]?\d+(?:\.\d+)?)%/);
  if (damageIncreaseMatch) {
    return buildParsed('damage_bonus', part, {
      valueDecimal: numeric(damageIncreaseMatch[1]), unit: 'percent', classScope: 'all'
    });
  }
  const increasedCritMatch = part.match(/^魔法暴击率增加\s*([+-]?\d+(?:\.\d+)?)%/);
  if (increasedCritMatch) {
    return buildParsed('crit_chance', part, {
      valueDecimal: numeric(increasedCritMatch[1]), unit: 'percent', classScope: 'magic'
    });
  }
  return null;
}

function parseFlagPart(part) {
  if (/允许猛冲|可猛冲|启用猛冲|能够猛冲|激活一次特殊猛冲/.test(part)) {
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

function parseAccelerationMovementEffects(part) {
  const match = part.match(/^([+-]?\d+(?:\.\d+)?)%\s*加速度与减速度(?:和)?\s*[×x]\s*([0-9]+(?:\.\d+)?)\s*最大移动速度$/i);
  if (!match) return null;
  return [
    buildParsed('acceleration', part, { valueDecimal: numeric(match[1]), unit: 'percent', classScope: null }),
    buildParsed('max_move_speed_multiplier', part, {
      valueDecimal: numeric(match[2]), unit: 'multiplier', classScope: null, operation: 'multiply',
    }),
  ];
}

function parseFixedCriticalChance(part) {
  const match = part.match(/(?:具有|有)\s*(?:\d+\/\d+\s*)?(?:\(([+-]?\d+(?:\.\d+)?)%\)|([+-]?\d+(?:\.\d+)?)%)\s*的固定暴击率/);
  if (!match) return null;
  return buildParsed('crit_chance', part, {
    valueDecimal: numeric(match[1] ?? match[2]), unit: 'percent', classScope: 'all',
  });
}

function parseEffectPart(part) {
  return parseWholeEffectPart(part) ?? parseFixedCriticalChance(part) ?? parseNumericPart(part) ?? parseFlagPart(part);
}

function parseTieredMeleeEffects(part) {
  const match = part.match(/^(每级|最高)\s*(?:提供\s*)?([+-]?\d+(?:\.\d+)?)%\s*(近战伤害|近战速度)(?:和|及)(近战伤害|近战速度)$/);
  if (!match) return null;
  const valueDecimal = numeric(match[2]);
  const conditionText = match[1];
  const statKeys = [match[3], match[4]].map(label => label === '近战伤害' ? 'damage_bonus' : 'melee_speed');
  return statKeys.map(statKey => buildParsed(statKey, part, {
    valueDecimal,
    unit: 'percent',
    classScope: 'melee',
    conditionText,
  }));
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

function isNonEffectLabel(line) {
  const normalized = normalizeText(line).replace(/^\([^)]*\)\s*/, '');
  return normalized === ''
    || /^(?:套装奖励|套装效果|物品|给予增益|增益描述|伤害星云|生命星云|魔力星云|套装奖励：)$/.test(normalized);
}

function buildNonEffectLabel(part) {
  return {
    statKey: 'special_effect',
    statLabelZh: STAT_LABELS_ZH.special_effect,
    classScope: null,
    operation: null,
    valueDecimal: null,
    valueMaxDecimal: null,
    unit: null,
    conditionText: null,
    parseStatus: 'non_effect',
    confidence: 1,
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
    if (isNonEffectLabel(sourceLine)) {
      rows.push({
        ...buildBaseRow({ owner, sourceKind, sourceLocale, sourceLineIndex: lineIndex, sourceLine, rawText: sourceLine, prefix, effectIndex: 0 }),
        ...buildNonEffectLabel(sourceLine),
      });
      continue;
    }
    const whole = parseWholeEffectPart(prefix.body);
    if (whole) {
      rows.push({
        ...buildBaseRow({ owner, sourceKind, sourceLocale, sourceLineIndex: lineIndex, sourceLine, rawText: prefix.body, prefix, effectIndex: 0 }),
        ...whole
      });
      continue;
    }
    const parts = splitEffectParts(prefix.body);
    const accelerationMovement = parts.length === 1 ? parseAccelerationMovementEffects(parts[0]) : null;
    if (accelerationMovement) {
      accelerationMovement.forEach((parsed, effectIndex) => rows.push({
        ...buildBaseRow({ owner, sourceKind, sourceLocale, sourceLineIndex: lineIndex, sourceLine, rawText: prefix.body, prefix, effectIndex }),
        ...parsed,
      }));
      continue;
    }
    const directCompound = parts.length === 1 ? parseTieredMeleeEffects(parts[0]) : null;
    if (directCompound) {
      directCompound.forEach((parsed, effectIndex) => rows.push({
        ...buildBaseRow({ owner, sourceKind, sourceLocale, sourceLineIndex: lineIndex, sourceLine, rawText: prefix.body, prefix, effectIndex }),
        ...parsed,
      }));
      continue;
    }
    const direct = parts.length === 1 ? parseEffectPart(parts[0]) : null;
    if (direct) {
      rows.push({
        ...buildBaseRow({ owner, sourceKind, sourceLocale, sourceLineIndex: lineIndex, sourceLine, rawText: prefix.body, prefix, effectIndex: 0 }),
        ...direct
      });
      continue;
    }
    if (parts.length === 0) {
      rows.push({
        ...buildBaseRow({ owner, sourceKind, sourceLocale, sourceLineIndex: lineIndex, sourceLine, rawText: sourceLine, prefix, effectIndex: 0 }),
        ...buildUnparsed(sourceLine)
      });
      continue;
    }
    let nextEffectIndex = 0;
    for (const part of parts) {
      const compound = parseTieredMeleeEffects(part);
      if (compound) {
        compound.forEach((parsed, offset) => rows.push({
          ...buildBaseRow({ owner, sourceKind, sourceLocale, sourceLineIndex: lineIndex, sourceLine, rawText: part, prefix, effectIndex: nextEffectIndex + offset }),
          ...parsed,
        }));
        nextEffectIndex += compound.length;
      } else {
        rows.push({
          ...buildBaseRow({ owner, sourceKind, sourceLocale, sourceLineIndex: lineIndex, sourceLine, rawText: part, prefix, effectIndex: nextEffectIndex }),
          ...(parseEffectPart(part) ?? buildUnparsed(part))
        });
        nextEffectIndex += 1;
      }
    }
  }
  return rows;
}
