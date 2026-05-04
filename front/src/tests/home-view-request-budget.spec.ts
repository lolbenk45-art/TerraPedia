import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import type { Category, Item, StatsOverview } from '@/types'
import HomeView from '@/views/HomeView.vue'

const mocks = vi.hoisted(() => ({
  fetchItems: vi.fn(),
  fetchCategories: vi.fn(),
  fetchStatsOverview: vi.fn(),
}))

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api')

  return {
    ...actual,
    fetchItems: mocks.fetchItems,
    fetchCategories: mocks.fetchCategories,
    fetchStatsOverview: mocks.fetchStatsOverview,
  }
})

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')

  return {
    ...actual,
    useRoute: () => ({
      query: {},
    }),
    useRouter: () => ({
      push: vi.fn(),
    }),
  }
})

vi.mock('@/composables/useNetworkStatus', () => ({
  useNetworkStatus: () => ({
    isOnline: true,
  }),
}))

vi.mock('@/components/ItemSearchInput.vue', () => ({
  default: {
    name: 'ItemSearchInput',
    props: ['modelValue'],
    emits: ['update:modelValue', 'submit', 'pick'],
    template: '<div class="item-search-input-stub" />',
  },
}))

const sampleItems: Item[] = [
  { id: 1, name: 'Copper Shortsword', category: 'Weapons', image: null },
  { id: 2, name: 'Wooden Bow', category: 'Weapons', image: null },
] as Item[]

const sampleCategories: Category[] = [
  { id: 11, name: 'Weapons', parentId: null, children: [] },
] as Category[]

const sampleStats: StatsOverview = {
  totalItems: 6131,
  totalCategories: 1,
  rootCategoryCounts: [{ categoryId: 11, count: 1240 }],
  categoryItemCounts: { 11: 1240 },
}

describe('HomeView request budget', () => {
  beforeEach(() => {
    mocks.fetchItems.mockReset()
    mocks.fetchCategories.mockReset()
    mocks.fetchStatsOverview.mockReset()

    mocks.fetchItems.mockResolvedValue({
      success: true,
      data: sampleItems,
      message: 'ok',
      statusCode: 200,
      pagination: {
        total: 36,
        page: 1,
        limit: 36,
        totalPages: 1,
      },
    })

    mocks.fetchCategories.mockResolvedValue({
      success: true,
      data: sampleCategories,
      message: 'ok',
      statusCode: 200,
    })

    mocks.fetchStatsOverview.mockResolvedValue({
      success: true,
      data: sampleStats,
      message: 'ok',
      statusCode: 200,
    })
  })

  it('uses stats overview for the total and makes one initial item request at the lighter page size', async () => {
    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await flushPromises()

    expect(mocks.fetchItems).toHaveBeenCalledTimes(1)
    expect(mocks.fetchItems).toHaveBeenCalledWith(1, 36, undefined, undefined, undefined, undefined, undefined)
    expect(mocks.fetchCategories).toHaveBeenCalledTimes(1)
    expect(mocks.fetchStatsOverview).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('6131')
    expect(wrapper.text()).not.toContain('Indexed36')
  })
})
