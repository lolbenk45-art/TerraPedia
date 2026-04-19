import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import type { Category, Item, StatsOverview } from '@/types'
import HomePage from '@/views/HomePage.vue'

const mocks = vi.hoisted(() => ({
  fetchItems: vi.fn(),
  fetchCategories: vi.fn(),
  fetchStatsOverview: vi.fn(),
  routerPush: vi.fn(),
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
      push: mocks.routerPush,
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
  { id: 1, name: 'Copper Shortsword', category: 'Weapons', image: null },
  { id: 2, name: 'Wooden Bow', category: 'Weapons', image: null },
  { id: 3, name: 'Mining Helmet', category: 'Armor', image: null },
  { id: 4, name: 'Lesser Healing Potion', category: 'Potions', image: null },
  { id: 5, name: 'Iron Pickaxe', category: 'Tools', image: null },
  { id: 6, name: 'Torch', category: 'Materials', image: null },
] as Item[]

const sampleCategories: Category[] = [
  { id: 11, name: 'Weapons', parentId: null, children: [] },
  { id: 12, name: 'Tools', parentId: null, children: [] },
  { id: 13, name: 'Armor', parentId: null, children: [] },
  { id: 14, name: 'Materials', parentId: null, children: [] },
] as Category[]

const sampleStats: StatsOverview = {
  totalItems: 6131,
  totalCategories: 4,
  rootCategoryCounts: [
    { categoryId: 11, count: 1240 },
    { categoryId: 12, count: 420 },
    { categoryId: 13, count: 380 },
    { categoryId: 14, count: 980 },
  ],
  categoryItemCounts: {
    11: 1240,
    12: 420,
    13: 380,
    14: 980,
  },
}

describe('Home atlas gate', () => {
  beforeEach(() => {
    mocks.fetchItems.mockReset()
    mocks.fetchCategories.mockReset()
    mocks.fetchStatsOverview.mockReset()
    mocks.routerPush.mockReset()

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

  it('renders the atlas gate scene shell and category routes from fetched data', async () => {
    const wrapper = mount(HomePage, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('冒险图鉴')
    expect(wrapper.text()).toContain('进入泰拉瑞亚世界的物品图鉴入口')
    expect(wrapper.text()).toContain('热门探索路径')
    expect(wrapper.find('.atlas-stage__sky').exists()).toBe(true)
    expect(wrapper.find('.atlas-stage__glow').exists()).toBe(true)
    expect(wrapper.findAll('.atlas-artifact')).toHaveLength(4)
    expect(wrapper.find('.atlas-stage__path').exists()).toBe(true)
    expect(wrapper.find('.atlas-stage__terrain').exists()).toBe(true)
    expect(wrapper.text()).toContain('今日探索入口')
    expect(wrapper.text()).toContain('收藏遗物陈列')
    expect(wrapper.findAll('.atlas-quest-card')).toHaveLength(4)
    expect(wrapper.find('.atlas-feature--primary').exists()).toBe(true)
    expect(wrapper.findAll('.atlas-category')).toHaveLength(4)
  })
})
