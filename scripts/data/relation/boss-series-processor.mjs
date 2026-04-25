import {
  confidence,
  createRecordKey,
  normalizeText,
  normalizeTrace,
  relationStatus
} from './relation-trace.mjs';

function toNullableNumber(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toCode(value) {
  const text = normalizeText(value);
  if (!text) return null;
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function toJsonOrNull(values = []) {
  const normalized = unique(values);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function buildNpcIndex(relationNpcRows = []) {
  const index = new Map();
  for (const row of relationNpcRows) {
    const key = normalizeText(row.englishName)?.toLowerCase();
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

function parseBossEffects(notes) {
  const text = normalizeText(notes);
  if (!text) return [];

  const effects = [];
  const seen = new Set();

  function push(effect) {
    const key = `${effect.effectType}|${effect.targetType}|${effect.targetKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    effects.push(effect);
  }

  const spawnMatch = text.match(/allows the ([A-Za-z' -]+) NPC to spawn as the ([A-Za-z' -]+)/i);
  if (spawnMatch) {
    push({
      effectType: 'unlock_npc_spawn',
      targetType: 'npc',
      targetKey: toCode(spawnMatch[1]),
      targetName: normalizeText(spawnMatch[1]),
      evidenceText: normalizeText(spawnMatch[0])
    });
  }

  const moveInMatch = text.match(/allows the ([A-Za-z' -]+) NPC to move into an available vacant house/i);
  if (moveInMatch) {
    push({
      effectType: 'unlock_npc_move_in',
      targetType: 'npc',
      targetKey: toCode(moveInMatch[1]),
      targetName: normalizeText(moveInMatch[1]),
      evidenceText: normalizeText(moveInMatch[0])
    });
  }

  if (/meteorites?\s+to\s+land/i.test(text)) {
    push({
      effectType: 'unlock_world_event',
      targetType: 'world_event',
      targetKey: 'meteorite_landings',
      targetName: 'Meteorite landings',
      evidenceText: 'allows meteorites to land'
    });
  }

  if (/grants unlimited access to all Dungeon areas/i.test(text)) {
    push({
      effectType: 'unlock_area_access',
      targetType: 'area',
      targetKey: 'dungeon',
      targetName: 'Dungeon',
      evidenceText: 'grants unlimited access to all Dungeon areas'
    });
  }

  if (/world permanently converts to Hardmode|converts to Hardmode/i.test(text)) {
    push({
      effectType: 'unlock_world_state',
      targetType: 'world_state',
      targetKey: 'hardmode',
      targetName: 'Hardmode',
      evidenceText: 'world permanently converts to Hardmode'
    });
  }

  if (/initiates the Lunar Events|unlocking the Lunar Events/i.test(text)) {
    push({
      effectType: 'unlock_event',
      targetType: 'event',
      targetKey: 'lunar_events',
      targetName: 'Lunar Events',
      evidenceText: 'Lunar Events'
    });
  }

  if (/Martian Madness/i.test(text) && /unlocking|unlocks|triggers/i.test(text)) {
    push({
      effectType: 'unlock_event',
      targetType: 'event',
      targetKey: 'martian_madness',
      targetName: 'Martian Madness',
      evidenceText: 'Martian Madness'
    });
  }

  if (/Tier 3 of the Old One's Army/i.test(text)) {
    push({
      effectType: 'unlock_event_tier',
      targetType: 'event_tier',
      targetKey: 'old_ones_army_tier_3',
      targetName: "Old One's Army Tier 3",
      evidenceText: "Tier 3 of the Old One's Army"
    });
  }

  return effects;
}

export function buildBossSeriesRelations({
  maintBossRows = [],
  relationNpcRows = [],
  itemNpcLootRelations = []
} = {}) {
  const relationBosses = [];
  const bossItemRewardRelations = [];
  const bossEffectRelations = [];
  const issues = [];

  const npcIndex = buildNpcIndex(relationNpcRows);

  for (const row of maintBossRows) {
    const trace = normalizeTrace('maint_bosses', row);
    const titleEn = normalizeText(row.title_en);
    const bossKey = createRecordKey({
      type: 'relation_boss',
      titleEn,
      progressionOrder: row.progression_order ?? null,
      groupType: row.group_type ?? null
    });
    const matchedNpcs = npcIndex.get(titleEn?.toLowerCase() ?? '') ?? [];
    const npcInternalNames = matchedNpcs.map((npc) => normalizeText(npc.internalName)).filter(Boolean);
    const matchStatus = matchedNpcs.length > 0 ? relationStatus.resolved : relationStatus.unresolved;

    relationBosses.push({
      recordKey: bossKey,
      progressionOrder: toNullableNumber(row.progression_order),
      orderWithinGroup: toNullableNumber(row.order_within_group),
      groupNameEn: normalizeText(row.group_name_en),
      groupNameZh: normalizeText(row.group_name_zh),
      groupType: normalizeText(row.group_type),
      bossTitleEn: titleEn,
      bossTitleZh: normalizeText(row.title_zh),
      pageTitleEn: normalizeText(row.page_title_en),
      pageTitleZh: normalizeText(row.page_title_zh),
      imageUrl: normalizeText(row.image_url),
      notes: normalizeText(row.notes),
      npcSourceId: matchedNpcs.length === 1 ? toNullableNumber(matchedNpcs[0].sourceId) : null,
      npcInternalName: matchedNpcs.length === 1 ? normalizeText(matchedNpcs[0].internalName) : null,
      npcEnglishName: matchedNpcs.length === 1 ? normalizeText(matchedNpcs[0].englishName) : null,
      npcMatchStatus: matchStatus,
      npcMatchCount: matchedNpcs.length,
      npcMemberInternalNamesJson: toJsonOrNull(npcInternalNames),
      reviewStatus: matchStatus,
      confidence: matchStatus === relationStatus.resolved ? confidence.high : confidence.none,
      reason: matchStatus === relationStatus.resolved ? 'boss_npc_resolved' : 'boss_npc_unresolved',
      rawJson: row.raw_json ?? null,
      ...trace
    });

    if (matchStatus !== relationStatus.resolved) {
      issues.push({
        issueKey: createRecordKey({ type: 'boss_issue', bossKey, reason: 'boss_npc_unresolved' }),
        bossRecordKey: bossKey,
        bossTitleEn: titleEn,
        reviewStatus: relationStatus.unresolved,
        confidence: confidence.none,
        reason: 'boss_npc_unresolved',
        ...trace
      });
    }

    for (const effect of parseBossEffects(row.notes)) {
      bossEffectRelations.push({
        recordKey: createRecordKey({
          type: 'boss_effect',
          bossKey,
          effectType: effect.effectType,
          targetKey: effect.targetKey
        }),
        bossRecordKey: bossKey,
        bossTitleEn: titleEn,
        effectType: effect.effectType,
        targetType: effect.targetType,
        targetKey: effect.targetKey,
        targetName: effect.targetName,
        evidenceText: effect.evidenceText,
        reviewStatus: relationStatus.resolved,
        confidence: confidence.high,
        reason: 'boss_effect_parsed',
        rawJson: row.raw_json ?? null,
        ...trace
      });
    }

    const rewardGroups = new Map();
    for (const rewardRow of itemNpcLootRelations) {
      if (!npcInternalNames.includes(normalizeText(rewardRow.npcInternalName))) continue;
      const itemInternalName = normalizeText(rewardRow.itemInternalName);
      if (!itemInternalName) continue;
      const key = itemInternalName;
      if (!rewardGroups.has(key)) rewardGroups.set(key, []);
      rewardGroups.get(key).push(rewardRow);
    }

    for (const [itemInternalName, rewardRows] of rewardGroups.entries()) {
      bossItemRewardRelations.push({
        recordKey: createRecordKey({
          type: 'boss_item_reward',
          bossKey,
          itemInternalName,
          rewardSourceType: 'loot'
        }),
        bossRecordKey: bossKey,
        bossTitleEn: titleEn,
        itemInternalName,
        rewardSourceType: 'loot',
        npcMemberCount: unique(rewardRows.map((entry) => entry.npcInternalName)).length,
        npcMemberInternalNamesJson: toJsonOrNull(rewardRows.map((entry) => entry.npcInternalName)),
        rewardSourceFactKeysJson: toJsonOrNull(rewardRows.map((entry) => entry.sourceFactKey)),
        chanceTextsJson: toJsonOrNull(rewardRows.map((entry) => entry.chanceText)),
        quantityTextsJson: toJsonOrNull(rewardRows.map((entry) => entry.quantityText)),
        reviewStatus: relationStatus.resolved,
        confidence: confidence.high,
        reason: 'boss_item_reward_aggregated',
        rawJson: JSON.stringify({ rewardRowCount: rewardRows.length }),
        ...trace
      });
    }
  }

  return {
    relationBosses,
    bossItemRewardRelations,
    bossEffectRelations,
    issues,
    summary: {
      bosses: relationBosses.length,
      matchedBosses: relationBosses.filter((row) => row.npcMatchStatus === relationStatus.resolved).length,
      unmatchedBosses: relationBosses.filter((row) => row.npcMatchStatus !== relationStatus.resolved).length,
      bossItemRewards: bossItemRewardRelations.length,
      bossEffects: bossEffectRelations.length
    }
  };
}
