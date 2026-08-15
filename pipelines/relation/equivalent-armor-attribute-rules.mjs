export const EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS = [
  {
    id: 'hallowed_ancient_hallowed',
    evidence: 'wiki_interchangeable_identical_stats',
    groups: [
      ['HallowedMask', 'AncientHallowedMask'],
      ['HallowedHelmet', 'AncientHallowedHelmet'],
      ['HallowedHeadgear', 'AncientHallowedHeadgear'],
      ['HallowedHood', 'AncientHallowedHood'],
      ['HallowedPlateMail', 'AncientHallowedPlateMail'],
      ['HallowedGreaves', 'AncientHallowedGreaves']
    ]
  },
  {
    id: 'shadow_ancient_shadow',
    evidence: 'wiki_interchangeable_same_set_bonus',
    groups: [
      ['ShadowHelmet', 'AncientShadowHelmet'],
      ['ShadowScalemail', 'AncientShadowScalemail'],
      ['ShadowGreaves', 'AncientShadowGreaves']
    ]
  },
  {
    id: 'jungle_ancient_cobalt',
    evidence: 'wiki_interchangeable_same_set_bonus',
    groups: [
      ['JungleHat', 'AncientCobaltHelmet'],
      ['JungleShirt', 'AncientCobaltBreastplate'],
      ['JunglePants', 'AncientCobaltLeggings']
    ]
  },
  {
    id: 'snow_pink_snow',
    evidence: 'shared_armor_set_definition',
    groups: [
      ['EskimoHood', 'PinkEskimoHood'],
      ['EskimoCoat', 'PinkEskimoCoat'],
      ['EskimoPants', 'PinkEskimoPants']
    ]
  },
  {
    id: 'necro_ancient_necro',
    evidence: 'shared_armor_set_definition',
    groups: [
      ['NecroHelmet', 'AncientNecroHelmet']
    ]
  }
];

export function flattenEquivalentArmorAttributePairs(groups = EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS) {
  const pairs = [];
  for (const group of groups) {
    for (const itemGroup of group.groups) {
      for (const sourceInternalName of itemGroup) {
        for (const targetInternalName of itemGroup) {
          if (sourceInternalName === targetInternalName) continue;
          pairs.push({
            groupId: group.id,
            evidence: group.evidence,
            sourceInternalName,
            targetInternalName
          });
        }
      }
    }
  }
  return pairs;
}

export function buildEquivalentArmorAttributeLookup(maintItems = [], groups = EQUIVALENT_ARMOR_ATTRIBUTE_ITEM_GROUPS) {
  const byInternalName = new Map();
  for (const item of maintItems) {
    if (item.internal_name) {
      byInternalName.set(String(item.internal_name), item);
    }
  }

  const lookup = new Map();
  for (const pair of flattenEquivalentArmorAttributePairs(groups)) {
    const source = byInternalName.get(pair.sourceInternalName);
    const target = byInternalName.get(pair.targetInternalName);
    if (!source || !target) continue;

    const entries = lookup.get(pair.sourceInternalName) ?? [];
    entries.push({
      ...target,
      equivalentArmorAttributeGroupId: pair.groupId,
      equivalentArmorAttributeEvidence: pair.evidence,
      equivalentArmorAttributeSourceInternalName: pair.sourceInternalName
    });
    lookup.set(pair.sourceInternalName, entries);
  }
  return lookup;
}
