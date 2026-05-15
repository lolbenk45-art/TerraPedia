import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet, mockCreate, mockIsAxiosError } = vi.hoisted(() => {
  const hoistedGet = vi.fn()
  const hoistedCreate = vi.fn(() => ({
    get: hoistedGet,
    defaults: {},
    interceptors: {
      response: {
        use: vi.fn(),
      },
    },
  }))
  const hoistedIsAxiosError = vi.fn(() => false)

  return {
    mockGet: hoistedGet,
    mockCreate: hoistedCreate,
    mockIsAxiosError: hoistedIsAxiosError,
  }
})

vi.mock('axios', () => ({
  default: {
    create: mockCreate,
    isAxiosError: mockIsAxiosError,
  },
  create: mockCreate,
  isAxiosError: mockIsAxiosError,
}))

import {
  fetchArmorSets,
  fetchBuffs,
  fetchBuffById,
  fetchCategories,
  fetchBosses,
  fetchItemById,
  fetchPublicItemDetailShell,
  fetchItems,
  fetchNpcs,
  fetchProjectiles,
  fetchStatsOverview,
} from '@/api/index'

describe('api/index public query behavior', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockCreate.mockClear()
    mockIsAxiosError.mockReset()
    mockIsAxiosError.mockReturnValue(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fetchItems preserves the lightweight public list shape and query parameters', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 42,
            name: 'Copper Shortsword',
            name_zh: '铜短剑',
            category: 'Weapons',
            rare: 'white',
            description: 'basic starter weapon',
            descriptionEn: 'basic starter weapon',
            tooltip: 'Quick swing',
            tooltipEn: 'Quick swing',
            sourceNpcsJson: '[{"npcId":1}]',
            sourceNpcs: [{ npcId: 1 }],
            originalUrl: 'https://terraria.wiki.gg/images/copper-shortsword.png',
            stackSize: 1,
          },
        ],
        message: 'ok',
        statusCode: 200,
        pagination: {
          total: 1,
          page: 2,
          limit: 15,
          totalPages: 1,
        },
      },
    })

    const result = await fetchItems(2, 15, 'copper', 9, 'white', 'name', 'asc')

    expect(mockGet).toHaveBeenCalledWith(
      '/public/items?page=2&limit=15&search=copper&categoryId=9&rarity=white&sortBy=name&sortDirection=asc'
    )
    expect(result).toMatchObject({
      success: true,
      message: 'ok',
      statusCode: 200,
      pagination: {
        total: 1,
        page: 2,
        limit: 15,
        totalPages: 1,
      },
      data: [
        {
          id: 42,
          name: 'Copper Shortsword',
          nameZh: '铜短剑',
          nameEn: 'Copper Shortsword',
          image: null,
          category: 'Weapons',
          categoryName: 'Weapons',
          rare: 'white',
          rarity: 'white',
          stack: 1,
        },
      ],
    })
    expect(result.data[0]).not.toHaveProperty('sourceNpcs')
    expect(result.data[0]).not.toHaveProperty('sourceNpcsJson')
    expect(result.data[0]).not.toHaveProperty('originalUrl')
    expect(result.data[0]).not.toHaveProperty('description')
    expect(result.data[0]).not.toHaveProperty('descriptionEn')
    expect(result.data[0]).not.toHaveProperty('tooltip')
    expect(result.data[0]).not.toHaveProperty('tooltipEn')
  })

  it('fetchItems returns the current fallback shape when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('network down'))

    const result = await fetchItems(3, 25, 'blade')

    expect(result).toEqual({
      success: false,
      data: [],
      message: 'Failed to fetch items',
      statusCode: 500,
      pagination: {
        total: 0,
        page: 3,
        limit: 25,
        totalPages: 0,
      },
    })
  })

  it('fetchCategories preserves the current success response shape', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            name: 'Weapons',
            children: [
              {
                id: 2,
                name: 'Swords',
              },
            ],
          },
        ],
        message: 'ok',
        statusCode: 200,
      },
    })

    const result = await fetchCategories()

    expect(mockGet).toHaveBeenCalledWith('/categories')
    expect(result).toEqual({
      success: true,
      data: [
        {
          id: 1,
          parentId: null,
          name: 'Weapons',
          children: [
            {
              id: 2,
              parentId: null,
              name: 'Swords',
              children: undefined,
            },
          ],
        },
      ],
      message: 'ok',
      statusCode: 200,
    })
  })

  it('fetchCategories returns the current fallback shape when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('timeout'))

    await expect(fetchCategories()).resolves.toEqual({
      success: false,
      data: [],
      message: 'Failed to fetch categories',
      statusCode: 500,
    })
  })

  it('fetchItemById preserves the current success response shape', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 77,
          name: 'Night Edge',
          name_zh: '永夜之刃',
          categoryName: 'Weapons',
          rare: 'orange',
          description: 'A strong pre-hardmode sword',
          tooltip: 'Forged from darkness',
          stackSize: 1,
        },
        message: 'ok',
        statusCode: 200,
      },
    })

    const result = await fetchItemById(77)

    expect(mockGet).toHaveBeenCalledWith('/items/77')
    expect(result).toMatchObject({
      success: true,
      message: 'ok',
      statusCode: 200,
      data: {
        id: 77,
        name: 'Night Edge',
        nameZh: '永夜之刃',
        nameEn: 'Night Edge',
        category: 'Weapons',
        categoryName: 'Weapons',
        rare: 'orange',
        rarity: 'orange',
        descriptionEn: 'A strong pre-hardmode sword',
        tooltipEn: 'Forged from darkness',
        stack: 1,
      },
    })
  })

  it('fetchPublicItemDetailShell uses the lightweight public detail endpoint', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 77,
          name: 'Night Edge',
          name_zh: '姘稿涔嬪垉',
          categoryName: 'Weapons',
          rarity: 'orange',
          description: 'A strong pre-hardmode sword',
          tooltip: 'Forged from darkness',
          stackSize: 1,
          sourceNpcsJson: '[{"npcId":22}]',
          originalUrl: 'https://terraria.wiki.gg/images/Night_Edge.png',
        },
        message: 'ok',
        statusCode: 200,
      },
    })

    const result = await fetchPublicItemDetailShell(77)

    expect(mockGet).toHaveBeenCalledWith('/public/items/77')
    expect(result).toMatchObject({
      success: true,
      message: 'ok',
      statusCode: 200,
      data: {
        id: 77,
        name: 'Night Edge',
        nameZh: '姘稿涔嬪垉',
        category: 'Weapons',
        categoryName: 'Weapons',
        rarity: 'orange',
        rare: 'orange',
        descriptionEn: 'A strong pre-hardmode sword',
        tooltipEn: 'Forged from darkness',
        stack: 1,
      },
    })
    expect(result.data).not.toHaveProperty('sourceNpcsJson')
    expect(result.data).not.toHaveProperty('sourceNpcs')
    expect(result.data).not.toHaveProperty('originalUrl')
  })

  it('fetchItemById returns the current fallback shape when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('boom'))

    await expect(fetchItemById(91)).resolves.toEqual({
      success: false,
      data: {},
      message: 'Failed to fetch item detail',
      statusCode: 500,
    })
  })

  it('fetchNpcs preserves the current success response shape and query parameters', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: '17',
            game_id: 22,
            internal_name: 'guide',
            displayName: 'Guide',
            name_zh: '向导',
            category_id: 5,
            category_name: 'Town NPCs',
            is_town_npc: true,
            image_url: '/images/guide.png',
          },
        ],
        message: 'ok',
        statusCode: 200,
        pagination: {
          total: 1,
          page: 4,
          limit: 12,
          totalPages: 1,
        },
      },
    })

    const result = await fetchNpcs(4, 12, 'guide', 5, true)

    expect(mockGet).toHaveBeenCalledWith('/npcs?page=4&limit=12&search=guide&categoryId=5&isTownNpc=true')
    expect(result).toMatchObject({
      success: true,
      message: 'ok',
      statusCode: 200,
      pagination: {
        total: 1,
        page: 4,
        limit: 12,
        totalPages: 1,
      },
      data: [
        {
          id: 17,
          gameId: 22,
          internalName: 'guide',
          name: 'Guide',
          nameZh: '向导',
          categoryId: 5,
          categoryName: 'Town NPCs',
          isBoss: false,
          isFriendly: false,
          isTownNpc: true,
          imageUrl: '/images/guide.png',
        },
      ],
    })
  })

  it('fetchNpcs returns the current fallback shape when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('service unavailable'))

    const result = await fetchNpcs(5, 30, 'merchant', 2, false)

    expect(result).toEqual({
      success: false,
      data: [],
      message: 'Failed to fetch npcs',
      statusCode: 500,
      pagination: {
        total: 0,
        page: 5,
        limit: 30,
        totalPages: 0,
      },
    })
  })

  it('fetchBosses preserves the public list shape and query parameters', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 34,
            code: 'KING_SLIME',
            name: 'King Slime',
            nameZh: 'King Slime CN',
            nameEn: 'King Slime',
            bossType: 'PRE_HARDMODE',
            imageUrl: 'http://localhost:9000/terrapedia-images/bosses/king-slime.png',
            progressionOrder: 1,
            summonMethod: 'Use Slime Crown',
            memberCount: 1,
            memberNames: ['King Slime CN'],
            lootEntryCount: 2,
            uniqueLootItemCount: 2,
          },
        ],
        message: 'ok',
        statusCode: 200,
        pagination: {
          total: 1,
          page: 2,
          limit: 12,
          totalPages: 1,
        },
      },
    })

    const result = await fetchBosses(2, 12, 'slime')

    expect(mockGet).toHaveBeenCalledWith('/public/bosses?page=2&limit=12&search=slime')
    expect(result.data[0]).toMatchObject({
      id: 34,
      code: 'KING_SLIME',
      nameZh: 'King Slime CN',
      lootEntryCount: 2,
    })
  })

  it('fetchBuffs preserves the public list shape and query parameters', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 159,
            sourceId: 159,
            internalName: 'Sharpened',
            name: 'Sharpened',
            nameZh: 'Sharpened CN',
            imageUrl: 'http://localhost:9000/terrapedia-images/items/wiki/buffs/ab/sharpened.png',
            buffType: 'station',
            tooltipZh: 'Buff tooltip',
            sourceItemCount: 1,
            immuneNpcCount: 0,
          },
        ],
        message: 'ok',
        statusCode: 200,
        pagination: {
          total: 1,
          page: 1,
          limit: 12,
          totalPages: 1,
        },
      },
    })

    const result = await fetchBuffs(1, 12, 'sharp')

    expect(mockGet).toHaveBeenCalledWith('/public/buffs?page=1&limit=12&search=sharp')
    expect(result.data[0]).toMatchObject({
      id: 159,
      internalName: 'Sharpened',
      imageUrl: 'http://localhost:9000/terrapedia-images/items/wiki/buffs/ab/sharpened.png',
      buffType: 'station',
    })
  })

  it('fetchBuffById preserves the public detail shape and structured evidence', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 39,
          sourceId: 39,
          internalName: 'CursedInferno',
          name: '诅咒狱火',
          nameZh: '诅咒狱火',
          buffType: 'debuff',
          sourceItemCount: 7,
          immuneNpcCount: 25,
          sourceItems: [{ sourceId: 47, internalName: 'CursedArrow', nameZh: '诅咒箭' }],
          inflictingNpcs: [{ sourceId: 214, internalName: 'Clinger', nameZh: '爬藤怪' }],
          immuneNpcs: [{ sourceId: 68, internalName: 'DungeonGuardian', nameZh: '地牢守卫者' }],
          provenance: {
            provider: 'terraria.wiki.gg',
            pageTitle: '诅咒狱火',
            sectionAnchors: ['来自玩家', '来自敌怪', '免疫的_NPC'],
          },
        },
        message: 'ok',
        statusCode: 200,
      },
    })

    const result = await fetchBuffById(39)

    expect(mockGet).toHaveBeenCalledWith('/public/buffs/39')
    expect(result).toMatchObject({
      success: true,
      data: {
        id: 39,
        internalName: 'CursedInferno',
        sourceItemCount: 7,
        immuneNpcCount: 25,
        provenance: {
          provider: 'terraria.wiki.gg',
          pageTitle: '诅咒狱火',
        },
      },
    })
    expect(result.data.sourceItems?.[0]).toMatchObject({ internalName: 'CursedArrow' })
    expect(result.data.inflictingNpcs?.[0]).toMatchObject({ internalName: 'Clinger' })
    expect(result.data.immuneNpcs?.[0]).toMatchObject({ internalName: 'DungeonGuardian' })
  })

  it('fetchProjectiles preserves the public list shape and query parameters', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 1,
            sourceId: 1,
            internalName: 'WoodenArrowFriendly',
            name: 'Wooden Arrow',
            nameZh: 'Wooden Arrow CN',
            imageUrl: 'http://localhost:9000/terrapedia-images/items/wiki/projectiles/wooden-arrow.png',
            aiStyle: 1,
            damage: 5,
            knockBack: 1.5,
            hostile: false,
            friendly: true,
          },
        ],
        message: 'ok',
        statusCode: 200,
        pagination: {
          total: 1,
          page: 3,
          limit: 12,
          totalPages: 1,
        },
      },
    })

    const result = await fetchProjectiles(3, 12, 'arrow')

    expect(mockGet).toHaveBeenCalledWith('/public/projectiles?page=3&limit=12&search=arrow')
    expect(result.data[0]).toMatchObject({
      id: 1,
      internalName: 'WoodenArrowFriendly',
      damage: 5,
      friendly: true,
    })
  })

  it('fetchArmorSets preserves the public list shape and query parameters', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 10,
            textKey: 'ArmorSet.Hallowed',
            sourceKey: 'ArmorSet.Hallowed',
            name: 'Hallowed armor',
            nameZh: 'Hallowed armor CN',
            nameEn: 'Hallowed armor',
            primaryPart: 'head',
            setCount: 3,
            uniqueItemCount: 3,
            maleImages: ['http://localhost:9000/terrapedia-images/wiki/armor-sets/hallowed-male.png'],
            femaleImages: ['http://localhost:9000/terrapedia-images/wiki/armor-sets/hallowed-female.png'],
            specialImages: [],
          },
        ],
        message: 'ok',
        statusCode: 200,
        pagination: {
          total: 1,
          page: 1,
          limit: 12,
          totalPages: 1,
        },
      },
    })

    const result = await fetchArmorSets(1, 12, 'hallowed')

    expect(mockGet).toHaveBeenCalledWith('/public/armor-sets?page=1&limit=12&search=hallowed')
    expect(result.data[0]).toMatchObject({
      id: 10,
      textKey: 'ArmorSet.Hallowed',
      primaryPart: 'head',
      setCount: 3,
    })
  })

  it('fetchStatsOverview preserves the current success response shape', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          totalItems: 5400,
          totalCategories: 62,
          rootCategoryCounts: [
            {
              categoryId: 1,
              name: 'Weapons',
              count: 1800,
            },
          ],
          categoryItemCounts: {
            Weapons: 1800,
          },
        },
        message: 'ok',
        statusCode: 200,
      },
    })

    await expect(fetchStatsOverview()).resolves.toEqual({
      success: true,
      data: {
        totalItems: 5400,
        totalCategories: 62,
        rootCategoryCounts: [
          {
            categoryId: 1,
            name: 'Weapons',
            count: 1800,
          },
        ],
        categoryItemCounts: {
          Weapons: 1800,
        },
      },
      message: 'ok',
      statusCode: 200,
    })
  })

  it('fetchStatsOverview returns the current fallback shape when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('gateway timeout'))

    await expect(fetchStatsOverview()).resolves.toEqual({
      success: false,
      data: {
        totalItems: 0,
        totalCategories: 0,
        rootCategoryCounts: [],
        categoryItemCounts: {},
      },
      message: 'Failed to fetch statistics overview',
      statusCode: 500,
    })
  })
})
