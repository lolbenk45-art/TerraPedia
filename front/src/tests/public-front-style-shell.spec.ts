import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import HomeView from '@/views/HomeView.vue'
import ItemDetailView from '@/views/ItemDetailView.vue'
import ArticleListView from '@/views/ArticleListView.vue'
import ArticleDetailView from '@/views/ArticleDetailView.vue'
import AboutView from '@/views/AboutView.vue'

const mocks = vi.hoisted(() => ({
  fetchItems: vi.fn(),
  fetchCategories: vi.fn(),
  fetchStatsOverview: vi.fn(),
  fetchItemAggregateById: vi.fn(),
  fetchItemRecipeTree: vi.fn(),
  fetchArticles: vi.fn(),
  fetchArticleById: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
}))

const routeState = {
  path: '/items',
  fullPath: '/items',
  params: {} as Record<string, string>,
  query: {} as Record<string, string>,
}

const applyRoute = (path: string, params: Record<string, string> = {}, query: Record<string, string> = {}) => {
  routeState.path = path
  routeState.params = params
  routeState.query = query

  const search = new URLSearchParams(query).toString()
  routeState.fullPath = search ? `${path}?${search}` : path
}

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api')

  return {
    ...actual,
    fetchItems: mocks.fetchItems,
    fetchCategories: mocks.fetchCategories,
    fetchStatsOverview: mocks.fetchStatsOverview,
    fetchItemAggregateById: mocks.fetchItemAggregateById,
    fetchItemRecipeTree: mocks.fetchItemRecipeTree,
  }
})

vi.mock('@/api/articles', () => ({
  fetchArticles: mocks.fetchArticles,
  fetchArticleById: mocks.fetchArticleById,
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')

  return {
    ...actual,
    useRoute: () => routeState,
    useRouter: () => ({
      push: mocks.routerPush,
      replace: mocks.routerReplace,
    }),
  }
})

describe('public front style shell', () => {
  beforeEach(() => {
    mocks.fetchItems.mockReset()
    mocks.fetchCategories.mockReset()
    mocks.fetchStatsOverview.mockReset()
    mocks.fetchItemAggregateById.mockReset()
    mocks.fetchItemRecipeTree.mockReset()
    mocks.fetchArticles.mockReset()
    mocks.fetchArticleById.mockReset()
    mocks.routerPush.mockReset()
    mocks.routerReplace.mockReset()

    mocks.fetchItems.mockResolvedValue({
      success: true,
      data: [
        { id: 1, name: 'Copper Shortsword', category: 'Weapons', image: null },
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 200,
        totalPages: 1,
      },
    })

    mocks.fetchCategories.mockResolvedValue({
      success: true,
      data: [
        { id: 10, name: 'Weapons', parentId: null, children: [] },
      ],
    })

    mocks.fetchStatsOverview.mockResolvedValue({
      success: true,
      data: {
        totalItems: 6131,
        totalCategories: 1,
        rootCategoryCounts: [{ categoryId: 10, count: 6131 }],
        categoryItemCounts: { 10: 6131 },
      },
    })

    mocks.fetchItemAggregateById.mockResolvedValue({
      success: true,
      data: {
        item: {
          id: 1,
          categoryId: 10,
          categoryName: 'Weapons',
          category: 'Weapons',
          internalName: 'CopperShortsword',
          name: 'Copper Shortsword',
          nameZh: '铜短剑',
          rarity: 'Common',
          image: null,
        },
        images: [],
        sources: [],
        recipes: [],
      },
    })

    mocks.fetchItemRecipeTree.mockResolvedValue({ variants: [] })

    mocks.fetchArticles.mockResolvedValue({
      items: [
        {
          id: 1,
          title: 'Atlas log',
          summary: 'A public article summary.',
          coverImage: null,
          authorDisplayName: 'Guide',
          createdAt: '2026-04-11T00:00:00Z',
          publishedAt: '2026-04-11T00:00:00Z',
          contentHtml: '',
          contentMarkdown: '',
        },
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    })

    mocks.fetchArticleById.mockResolvedValue({
      id: 1,
      title: 'Atlas log',
      summary: 'A public article summary.',
      coverImage: null,
      authorDisplayName: 'Guide',
      createdAt: '2026-04-11T00:00:00Z',
      publishedAt: '2026-04-11T00:00:00Z',
      contentHtml: '<p>Entry body</p>',
      contentMarkdown: '',
    })
  })

  it('renders the item list inside the workbench shell', async () => {
    applyRoute('/items')

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
          ItemCard: { template: '<div class="item-card-stub" />' },
          VirtualItemGrid: { template: '<div class="virtual-grid-stub" />' },
          CategoryTreeItem: { template: '<div class="category-tree-item-stub" />' },
          CategoryDrawer: { template: '<div class="category-drawer-stub" />' },
          ItemSearchInput: {
            props: ['modelValue'],
            emits: ['update:modelValue', 'submit', 'pick'],
            template: '<div class="item-search-input-stub" />',
          },
          ErrorState: { template: '<div class="error-state-stub" />' },
        },
      },
    })

    await flushPromises()

    expect(wrapper.find('.public-workbench').exists()).toBe(true)
    expect(wrapper.find('.item-workbench__summary').exists()).toBe(true)
    expect(wrapper.find('.item-workbench__rail').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('📦')
  })

  it('renders the item detail inside a two-column entity shell', async () => {
    applyRoute('/items/1', { id: '1' })

    const wrapper = mount(ItemDetailView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
          RecipeFlowChart: { template: '<div class="recipe-flow-chart-stub" />' },
          RecipeTreeBranch: { template: '<div class="recipe-tree-branch-stub" />' },
        },
      },
    })

    await flushPromises()

    expect(wrapper.find('.entity-detail-shell').exists()).toBe(true)
    expect(wrapper.find('.entity-detail-shell__sidebar').exists()).toBe(true)
    expect(wrapper.text()).toContain('Recipes')
    expect(wrapper.text()).toContain('Metadata')
  })

  it('renders the article list inside the editorial shell', async () => {
    applyRoute('/articles')

    const wrapper = mount(ArticleListView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await flushPromises()

    expect(wrapper.find('.public-editorial').exists()).toBe(true)
    expect(wrapper.find('.public-editorial-hero').exists()).toBe(true)
  })

  it('renders the article detail inside the editorial reading shell', async () => {
    applyRoute('/articles/1', { id: '1' })

    const wrapper = mount(ArticleDetailView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await flushPromises()

    expect(wrapper.find('.public-editorial').exists()).toBe(true)
    expect(wrapper.find('.article-ledger__body').exists()).toBe(true)
  })

  it('renders the about page as a dossier-style editorial page', async () => {
    applyRoute('/about')

    const wrapper = mount(AboutView)
    await flushPromises()

    expect(wrapper.find('.public-editorial').exists()).toBe(true)
    expect(wrapper.find('.about-dossier__grid').exists()).toBe(true)
  })
})
