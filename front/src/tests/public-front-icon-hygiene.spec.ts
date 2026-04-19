import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ErrorState from '@/components/ErrorState.vue'
import OfflineState from '@/components/OfflineState.vue'
import ItemCard from '@/components/ItemCard.vue'
import ItemDetailModal from '@/components/ItemDetailModal.vue'

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')

  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
    }),
  }
})

vi.mock('@/stores', () => ({
  useAppStore: () => ({
    categories: [],
  }),
}))

describe('public front icon hygiene', () => {
  it('removes decorative emoji from shared state components', () => {
    const error = mount(ErrorState, {
      props: {
        title: 'Request failed',
        message: 'Try again later.',
      },
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    })

    const offline = mount(OfflineState, {
      global: {
        stubs: {
          RouterLink: true,
        },
      },
    })

    expect(error.text()).not.toContain('💡')
    expect(offline.text()).not.toContain('💡')
  })

  it('uses deterministic text marks instead of emoji for item fallbacks', () => {
    const item = {
      id: 1,
      name: 'Copper Shortsword',
      category: 'Weapons',
      image: null,
      stackSize: 1,
    }

    const card = mount(ItemCard, {
      props: {
        item,
        index: 0,
      },
    })

    const modal = mount(ItemDetailModal, {
      props: {
        item,
      },
      global: {
        stubs: {
          Teleport: true,
          Transition: false,
        },
      },
    })

    expect(card.text()).toContain('WP')
    expect(modal.text()).toContain('WP')
  })
})
