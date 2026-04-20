import { describe, expect, it } from 'vitest'
import type { NpcBuffRelation, NpcLootEntry, NpcShopEntry } from '@/types'
import { entrySecondary, entryTitle, shopConditionsLabel, shopPriceLabel } from '@/views/npcDetailEntry'

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

  it('renders shop pricing and prefers structured biome/context labels for public shop conditions', () => {
    const shopEntry: NpcShopEntry = {
      itemName: 'Bug Net',
      priceText: '',
      buyPriceText: '25 silver',
      conditions: [
        { contextNameZh: '夜晚' } as any,
        { biomeNameZh: '丛林' } as any,
        { notes: 'Hardmode only' } as any,
      ],
    }

    expect(shopPriceLabel(shopEntry)).toBe('25 silver')
    expect(shopConditionsLabel(shopEntry)).toBe('夜晚, 丛林, Hardmode only')
  })
})
