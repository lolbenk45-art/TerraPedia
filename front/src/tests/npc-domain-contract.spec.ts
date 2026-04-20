import { describe, expect, it } from 'vitest'
import {
  normalizeNpcBase,
  normalizeNpcPublicAggregate,
  normalizeNpcShopEntry,
} from '@/api/npcDomain'

describe('npc domain contracts', () => {
  it('normalizes shared NPC base fields into one contract', () => {
    const result = normalizeNpcBase({
      id: '7',
      game_id: 22,
      internal_name: 'Guide',
      name_zh: 'Guide CN',
      is_town_npc: true,
      image_url: '/img/guide.png',
    } as any)

    expect(result).toMatchObject({
      id: 7,
      gameId: 22,
      internalName: 'Guide',
      nameZh: 'Guide CN',
      isTownNpc: true,
      imageUrl: '/img/guide.png',
    })
  })

  it('normalizes public NPC shop entry conditions', () => {
    const result = normalizeNpcShopEntry({
      item_id: 5,
      item_name_zh: 'Torch CN',
      price_text: '5 gold',
      conditions: [
        { ref_type: 'WORLD_CONTEXT', ref_id: 3, condition_role: 'unlock', label: 'Goblin Army' },
        { ref_type: 'GAME_PERIOD', ref_id: 2, game_period_code: 'hardmode', game_period_name_zh: '\u56f0\u96be\u6a21\u5f0f' },
        { ref_type: 'ITEM', ref_id: 930, ref_item_name: 'Flare Gun', ref_item_name_zh: '\u4fe1\u53f7\u67aa', ref_item_internal_name: 'FlareGun' },
        { ref_type: 'NPC', ref_id: 207, ref_npc_name: 'Pirate', ref_npc_name_zh: '\u6d77\u76d7', ref_npc_internal_name: 'Pirate' },
      ],
    } as any)

    expect(result.conditions?.[0]).toMatchObject({
      refType: 'WORLD_CONTEXT',
      refId: 3,
      conditionRole: 'unlock',
      label: 'Goblin Army',
    })
    expect(result.conditions?.[1]).toMatchObject({
      refType: 'GAME_PERIOD',
      refId: 2,
      gamePeriodCode: 'hardmode',
      gamePeriodNameZh: '\u56f0\u96be\u6a21\u5f0f',
      label: '\u56f0\u96be\u6a21\u5f0f',
    })
    expect(result.conditions?.[2]).toMatchObject({
      refType: 'ITEM',
      refId: 930,
      refItemNameZh: '\u4fe1\u53f7\u67aa',
      refItemInternalName: 'FlareGun',
      label: '\u4fe1\u53f7\u67aa',
    })
    expect(result.conditions?.[3]).toMatchObject({
      refType: 'NPC',
      refId: 207,
      refNpcNameZh: '\u6d77\u76d7',
      refNpcInternalName: 'Pirate',
      label: '\u6d77\u76d7',
    })
  })

  it('normalizes the aggregate payload through the frozen public domain shape', () => {
    const result = normalizeNpcPublicAggregate({
      npc: { id: 1, name: 'Guide', name_zh: 'Guide CN', is_town_npc: true },
      loot: [],
      shopEntries: [{ item_id: 5, item_name: 'Rocket Boots', price_text: '5 gold', conditions: [] }],
      buffRelations: [],
      moduleStatus: { shop: 'ok' },
      aggregatedAt: '2026-04-18T12:00:00',
    } as any)

    expect(result.npc.nameZh).toBe('Guide CN')
    expect(result.shopEntries[0].priceText).toBe('5 gold')
    expect(result.moduleStatus.shop).toBe('ok')
  })
})
