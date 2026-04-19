import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import Navbar from '@/components/Navbar.vue'
import AppFooter from '@/components/AppFooter.vue'
import HomePage from '@/views/HomePage.vue'
import { useAppStore } from '@/stores'

vi.mock('vue-router', () => ({
  useRoute: () => ({
    path: '/',
    fullPath: '/',
  }),
  useRouter: () => ({
    replace: vi.fn(),
  }),
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a :href="typeof to === \'string\' ? to : to?.path || \'/\'"><slot /></a>',
  },
}))

vi.mock('@/stores/userAuth', () => ({
  useUserAuthStore: () => ({
    initialized: true,
    isAuthenticated: false,
    displayName: 'Atlas User',
    init: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('@/api', () => ({
  fetchItems: vi.fn(async () => ({
    success: true,
    data: [
      {
        id: 1,
        name: 'Copper Pickaxe',
        image: null,
        categoryId: 1,
        category: 'Tools',
      },
    ],
    pagination: {
      total: 1,
      page: 1,
      limit: 1,
      totalPages: 1,
    },
  })),
  fetchCategories: vi.fn(async () => ({
    success: true,
    data: [
      {
        id: 1,
        parentId: null,
        name: 'Tools',
        code: 'TOOL',
      },
    ],
  })),
  fetchStatsOverview: vi.fn(async () => ({
    success: true,
    data: {
      totalItems: 6131,
      totalCategories: 80,
      categoryItemCounts: { 1: 120 },
      rootCategoryCounts: [{ categoryId: 1, count: 120 }],
    },
  })),
}))

vi.mock('@/composables/useNetworkStatus', () => ({
  useNetworkStatus: () => ({
    isOnline: { value: true },
  }),
}))

vi.mock('@/utils/categoryTree', () => ({
  flattenCategories: (categories: unknown[]) => categories,
}))

describe('front theme system and shared shell', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('applies the Atlas Gate dark theme class through the app store', () => {
    const store = useAppStore()

    store.setTheme('dark')

    expect(document.documentElement.className).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('renders the Atlas Gate navigation identity copy', () => {
    const wrapper = mount(Navbar, {
      global: {
        stubs: {
          ThemeSwitcher: true,
          Transition: false,
        },
      },
    })

    expect(wrapper.text()).toContain('冒险图鉴')
  })

  it('renders the calmer atlas footer language', () => {
    const wrapper = mount(AppFooter, {
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('冒险图鉴')
    expect(wrapper.find('.app-footer__card').exists()).toBe(true)
    expect(wrapper.findAll('.app-footer__links span')).toHaveLength(4)
  })

  it('renders the Atlas Gate homepage framing after data loads', async () => {
    const wrapper = mount(HomePage, {
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
          ItemSearchInput: {
            template: '<div>Search Input</div>',
          },
          ErrorState: true,
          OfflineState: true,
        },
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.text()).toContain('热门探索路径')
  })
})
