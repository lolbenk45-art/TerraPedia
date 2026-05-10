import { describe, expect, it } from 'vitest'
import type { NpcBuffRelation, NpcLootEntry, NpcShopEntry } from '@/types'
import { entrySecondary, entryTitle, isTrustedDirectLoot, lootProvenanceLabel, shopConditionsLabel, shopPriceLabel } from '@/views/npcDetailEntry'

describe('npc detail entry helpers', () => {
  it('prefers localized labels and keeps a stable secondary fallback across entry types', () => {
    const lootEntry: NpcLootEntry = {
      itemName: 'Guide Voodoo Doll',
      itemNameZh: 'Guide CN',
      itemInternalName: 'GuideVoodooDoll',
    }
    const buffEntry: NpcBuffRelation = {
      buffName: 'Well Fed',
      buffNameZh: 'Buff CN',
      buffInternalName: 'WellFed',
    }

    expect(entryTitle(lootEntry)).toBe('Guide CN')
    expect(entrySecondary(lootEntry)).toBe('Guide Voodoo Doll')
    expect(entryTitle(buffEntry)).toBe('Buff CN')
    expect(entrySecondary(buffEntry)).toBe('Well Fed')
  })

  it('renders shop pricing and prefers structured biome/context/game-period labels for public shop conditions', () => {
    const shopEntry: NpcShopEntry = {
      itemName: 'Bug Net',
      priceText: '',
      buyPriceText: '25 silver',
      conditions: [
        { contextNameZh: '\u591c\u665a' } as any,
        { biomeNameZh: '\u4e1b\u6797' } as any,
        { gamePeriodNameZh: '\u56f0\u96be\u6a21\u5f0f' } as any,
        { refItemNameZh: '\u4fe1\u53f7\u67aa' } as any,
        { refNpcNameZh: '\u6d77\u76d7' } as any,
        { notes: 'Player has launcher' } as any,
      ],
    }

    expect(shopPriceLabel(shopEntry)).toBe('25 silver')
    expect(shopConditionsLabel(shopEntry)).toBe('\u591c\u665a, \u4e1b\u6797, \u56f0\u96be\u6a21\u5f0f, \u4fe1\u53f7\u67aa, \u6d77\u76d7, Player has launcher')
  })

  it('labels fallback loot provenance without marking it as trusted structured loot', () => {
    expect(lootProvenanceLabel({ lootSourceMode: 'direct', trustedStructured: true } as any)).toBe('')
    expect(lootProvenanceLabel({ lootSourceMode: 'prototype', trustedStructured: false } as any)).toBe('Prototype fallback')
    expect(lootProvenanceLabel({ lootSourceMode: 'same_name', trustedStructured: false } as any)).toBe('Same-name fallback')
    expect(lootProvenanceLabel({ lootSourceMode: 'derived', trustedStructured: false } as any)).toBe('Raw source fallback')
    expect(lootProvenanceLabel({ lootSourceMode: 'projection_only', trustedStructured: false } as any)).toBe('Projection only')
  })

  it('allows only trusted direct loot into the primary structured list', () => {
    expect(isTrustedDirectLoot({ lootSourceMode: 'direct', trustedStructured: true } as any)).toBe(true)
    expect(isTrustedDirectLoot({ lootSourceMode: 'prototype', trustedStructured: false } as any)).toBe(false)
    expect(isTrustedDirectLoot({ lootSourceMode: 'direct', trustedStructured: false } as any)).toBe(false)
    expect(isTrustedDirectLoot({ lootSourceMode: null, trustedStructured: null } as any)).toBe(false)
  })
})
