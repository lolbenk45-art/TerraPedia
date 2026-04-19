import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import type { Category, Item, StatsOverview } from '@/types'
import HomePage from '@/views/HomePage.vue'

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
    template: `
      <div class="item-search-input-stub">
        <input
          :value="modelValue"
          @input="$emit('update:modelValue', $event.target.value)"
        />
        <button type="button" @click="$emit('submit')">Search</button>
      </div>
    `,
  },
}))

const sampleItems: Item[] = [
  {
    id: 1,
    name: 'The Unnecessarily Long Relic Display Name That Should Not Spill Outside The Card',
    category: 'Super Rare Decorative Materials',
    image: null,
  },
  { id: 2, name: 'Wooden Bow', category: 'Weapons', image: null },
  { id: 3, name: 'Mining Helmet', category: 'Armor', image: null },
  { id: 4, name: 'Lesser Healing Potion', category: 'Potions', image: null },
  { id: 5, name: 'Iron Pickaxe', category: 'Tools', image: null },
  { id: 6, name: 'Torch', category: 'Materials', image: null },
] as Item[]

const sampleCategories: Category[] = [
  { id: 11, name: 'Weapons', parentId: null, children: [] },
  { id: 12, name: 'Tools', parentId: null, children: [] },
] as Category[]

const sampleStats: StatsOverview = {
  totalItems: 6131,
  totalCategories: 2,
  rootCategoryCounts: [
    { categoryId: 11, count: 1240 },
    { categoryId: 12, count: 420 },
  ],
  categoryItemCounts: {
    11: 1240,
    12: 420,
  },
}

describe('Home atlas relic display', () => {
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
        total: sampleItems.length,
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

  it('clamps relic item text and keeps the full label accessible', async () => {
    const wrapper = mount(HomePage, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await flushPromises()

    const relicButton = wrapper.find('.atlas-item')
    const relicName = wrapper.find('.atlas-item__name')
    const relicMeta = wrapper.find('.atlas-item__meta')

    expect(relicButton.attributes('title')).toBe(sampleItems[0].name)
    expect(relicName.attributes('title')).toBe(sampleItems[0].name)
    expect(relicName.classes()).toContain('line-clamp-2')
    expect(relicMeta.attributes('title')).toBe(sampleItems[0].category)
    expect(relicMeta.classes()).toContain('line-clamp-1')
  })
})
