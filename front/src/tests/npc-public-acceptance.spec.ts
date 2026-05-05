import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import NpcDetailView from '@/views/NpcDetailView.vue'

const mocks = vi.hoisted(() => ({
  fetchNpcAggregateById: vi.fn(),
}))

const routeState = {
  params: { id: '17' } as Record<string, string>,
}

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api')

  return {
    ...actual,
    fetchNpcAggregateById: mocks.fetchNpcAggregateById,
  }
})

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')

  return {
    ...actual,
    useRoute: () => routeState,
  }
})

describe('npc public acceptance', () => {
  beforeEach(() => {
    routeState.params = { id: '17' }
    mocks.fetchNpcAggregateById.mockReset()
  })

  it('renders a dedicated 404 state without treating it as a runtime error', async () => {
    mocks.fetchNpcAggregateById.mockResolvedValue({
      success: false,
      data: null,
      message: 'Npc not found',
      statusCode: 404,
    })

    const wrapper = mountNpcDetail()
    await flushPromises()

    expect(wrapper.text()).toContain('NPC not found')
    expect(wrapper.text()).toContain('requested public NPC profile is unavailable')
    expect(wrapper.text()).not.toContain('Could not load NPC profile')
  })

  it('keeps empty loot, shop, buffs, warning status, and missing image fallback visible', async () => {
    mocks.fetchNpcAggregateById.mockResolvedValue({
      success: true,
      data: {
        npc: {
          id: 17,
          gameId: 22,
          internalName: 'Guide',
          name: 'Guide',
          nameZh: 'Guide CN',
          categoryName: 'Town NPC',
          isBoss: false,
          isFriendly: true,
          isTownNpc: true,
          imageUrl: null,
          behaviorNotes: null,
        },
        loot: [],
        shopEntries: [],
        buffRelations: [],
        moduleStatus: {
          loot: 'warning',
          shop: 'empty',
          buffs: 'warning',
        },
        aggregatedAt: null,
      },
      message: 'ok',
      statusCode: 200,
    })

    const wrapper = mountNpcDetail()
    await flushPromises()

    expect(mocks.fetchNpcAggregateById).toHaveBeenCalledWith(17, 'loot,shop,buffs')
    expect(wrapper.text()).toContain('Guide CN')
    expect(wrapper.text()).toContain('No portrait')
    expect(wrapper.text()).toContain('No loot data yet')
    expect(wrapper.text()).toContain('No shop inventory yet')
    expect(wrapper.text()).toContain('No buff relationships yet')
    expect(wrapper.text()).toContain('Aggregate Modules')
    expect(wrapper.text()).toContain('warning')
    expect(wrapper.text()).not.toContain('undefined')
  })
})

function mountNpcDetail() {
  return mount(NpcDetailView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
      },
    },
  })
}
