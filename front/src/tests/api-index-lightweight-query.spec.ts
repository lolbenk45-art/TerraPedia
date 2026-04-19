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
  fetchItemImages,
  fetchItemRecipeTree,
  fetchItemRecipes,
  fetchItemSources,
  fetchItemSuggestions,
} from '@/api/index'

describe('api/index lightweight query behavior', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockCreate.mockClear()
    mockIsAxiosError.mockReset()
    mockIsAxiosError.mockReturnValue(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fetchItemSuggestions short-circuits empty keywords without sending a request', async () => {
    await expect(fetchItemSuggestions('   ', 6)).resolves.toEqual([])
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('fetchItemSuggestions preserves the current normalized return shape on success', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 12,
            name: 'Wooden Arrow',
            name_zh: '木箭',
            category: 'Ammo',
            rare: 'white',
            description: 'Basic ranged ammo',
            tooltip: 'Works with bows',
            stackSize: 999,
          },
        ],
      },
    })

    await expect(fetchItemSuggestions('  wood  ', 5)).resolves.toEqual([
      {
        id: 12,
        name: 'Wooden Arrow',
        name_zh: '木箭',
        nameZh: '木箭',
        nameEn: 'Wooden Arrow',
        image: null,
        category: 'Ammo',
        categoryName: 'Ammo',
        rare: 'white',
        rarity: 'white',
        description: 'Basic ranged ammo',
        descriptionZh: null,
        descriptionEn: 'Basic ranged ammo',
        tooltip: 'Works with bows',
        tooltipZh: null,
        tooltipEn: 'Works with bows',
        stackSize: 999,
        stack: 999,
      },
    ])

    expect(mockGet).toHaveBeenCalledWith('/items/suggestions', {
      params: {
        keyword: 'wood',
        limit: 5,
      },
    })
  })

  it('fetchItemSuggestions falls back to an empty array when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('network down'))

    await expect(fetchItemSuggestions('wood')).resolves.toEqual([])
  })

  it('fetchItemImages preserves the current normalized return shape on success', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            originalUrl: 'https://cdn.example.com/items/12.png',
          },
        ],
      },
    })

    await expect(fetchItemImages(12)).resolves.toEqual([
      {
        originalUrl: 'https://cdn.example.com/items/12.png',
        itemId: undefined,
        imageUrl: 'https://cdn.example.com/items/12.png',
        cachedUrl: 'https://cdn.example.com/items/12.png',
        isPrimary: false,
        sortOrder: 0,
      },
    ])

    expect(mockGet).toHaveBeenCalledWith('/items/12/images')
  })

  it('fetchItemImages falls back to an empty array when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('boom'))

    await expect(fetchItemImages(12)).resolves.toEqual([])
  })

  it('fetchItemSources preserves the current normalized return shape on success', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 3,
            sourceType: 'drop',
            biomeNameEn: 'Corruption',
          },
        ],
      },
    })

    await expect(fetchItemSources(88)).resolves.toEqual([
      {
        id: 3,
        sourceType: 'drop',
        biomeNameEn: 'Corruption',
        quantityText: null,
        chanceText: null,
        biomeNameZh: 'Corruption',
      },
    ])

    expect(mockGet).toHaveBeenCalledWith('/items/88/sources')
  })

  it('fetchItemSources falls back to an empty array when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('timeout'))

    await expect(fetchItemSources(88)).resolves.toEqual([])
  })

  it('fetchItemRecipes preserves the current normalized return shape on success', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 5,
            result_item_name_zh: '魔光剑',
            result_item_name: 'Lights Bane',
          },
        ],
      },
    })

    await expect(fetchItemRecipes(120)).resolves.toEqual([
      {
        id: 5,
        result_item_name_zh: '魔光剑',
        result_item_name: 'Lights Bane',
        resultItemNameZh: '魔光剑',
        resultItemName: 'Lights Bane',
        resultItemInternalName: null,
        resultItemImage: null,
        ingredients: [],
        stations: [],
      },
    ])

    expect(mockGet).toHaveBeenCalledWith('/items/120/recipes')
  })

  it('fetchItemRecipes falls back to an empty array when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('gateway timeout'))

    await expect(fetchItemRecipes(120)).resolves.toEqual([])
  })

  it('fetchItemRecipeTree preserves the current normalized return shape on success', async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          item: {
            id: 44,
            name: 'Molten Fury',
          },
          treeMeta: {
            hasCycles: false,
          },
          variants: [
            {
              id: 'default',
              roots: [
                {
                  itemId: 44,
                  name: 'Molten Fury',
                  groupMembers: [
                    {
                      item_id: 101,
                      internal_name: 'hellstone_bar',
                      name_zh: '狱石锭',
                      image_url: '/images/hellstone-bar.png',
                    },
                  ],
                  stations: [
                    {
                      name: 'Anvil',
                    },
                  ],
                  children: [
                    {
                      itemId: 101,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    })

    await expect(fetchItemRecipeTree(44, 4)).resolves.toEqual({
      item: {
        id: 44,
        name: 'Molten Fury',
      },
      treeMeta: {
        hasCycles: false,
      },
      variants: [
        {
          id: 'default',
          roots: [
            {
              itemId: 44,
              name: 'Molten Fury',
              groupMembers: [
                {
                  item_id: 101,
                  internal_name: 'hellstone_bar',
                  name_zh: '狱石锭',
                  image_url: '/images/hellstone-bar.png',
                  itemId: 101,
                  internalName: 'hellstone_bar',
                  name: null,
                  nameZh: '狱石锭',
                  image: '/images/hellstone-bar.png',
                  imageUrl: '/images/hellstone-bar.png',
                },
              ],
              stations: [
                {
                  name: 'Anvil',
                  isAlternative: false,
                },
              ],
              children: [
                {
                  itemId: 101,
                  groupMembers: [],
                  stations: [],
                  children: [],
                  expandable: false,
                  cycleDetected: false,
                  isReference: false,
                },
              ],
              expandable: false,
              cycleDetected: false,
              isReference: false,
            },
          ],
        },
      ],
    })

    expect(mockGet).toHaveBeenCalledWith('/items/44/recipe-tree', {
      params: {
        maxDepth: 4,
      },
    })
  })

  it('fetchItemRecipeTree falls back to null when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('service unavailable'))

    await expect(fetchItemRecipeTree(44)).resolves.toBeNull()
  })
})
