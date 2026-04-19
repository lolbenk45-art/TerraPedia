import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import Navbar from '@/components/Navbar.vue'

const mocks = vi.hoisted(() => ({
  route: {
    path: '/',
    fullPath: '/',
  },
  replace: vi.fn(),
  logout: vi.fn(),
  init: vi.fn(),
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')

  return {
    ...actual,
    useRoute: () => mocks.route,
    useRouter: () => ({
      replace: mocks.replace,
    }),
  }
})

vi.mock('@/stores/userAuth', () => ({
  useUserAuthStore: () => ({
    isAuthenticated: false,
    displayName: 'Atlas User',
    initialized: true,
    init: mocks.init,
    logout: mocks.logout,
  }),
}))

vi.mock('@/components/ThemeSwitcher.vue', () => ({
  default: {
    name: 'ThemeSwitcher',
    template: '<button type="button" class="theme-switcher-stub">Theme</button>',
  },
}))

describe('Navbar home variant', () => {
  beforeEach(() => {
    mocks.route.path = '/'
    mocks.route.fullPath = '/'
    mocks.replace.mockReset()
    mocks.logout.mockReset()
    mocks.init.mockReset()
  })

  it('adds the home visual variant on the homepage route', () => {
    const wrapper = mount(Navbar, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    expect(wrapper.find('header').classes()).toContain('navbar--home')
  })

  it('does not add the home visual variant on non-home routes', () => {
    mocks.route.path = '/items'
    mocks.route.fullPath = '/items'

    const wrapper = mount(Navbar, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    expect(wrapper.find('header').classes()).not.toContain('navbar--home')
  })
})
