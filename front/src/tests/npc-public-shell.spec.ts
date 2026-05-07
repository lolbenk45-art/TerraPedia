import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import type { ApiResponse, ArmorSetListItem, BossListItem, BuffListItem, NpcAggregateData, NpcListItem, ProjectileListItem } from '@/types'
import ArmorSetPublicView from '@/views/ArmorSetPublicView.vue'
import BossPublicView from '@/views/BossPublicView.vue'
import BuffPublicView from '@/views/BuffPublicView.vue'
import Navbar from '@/components/Navbar.vue'
import NpcDetailView from '@/views/NpcDetailView.vue'
import NpcListView from '@/views/NpcListView.vue'
import ProjectilePublicView from '@/views/ProjectilePublicView.vue'
import { routes } from '@/router/routes'

const mocks = vi.hoisted(() => ({
  fetchArmorSets: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  fetchBosses: vi.fn(),
  fetchBuffs: vi.fn(),
  fetchNpcs: vi.fn(),
  fetchNpcAggregateById: vi.fn(),
  fetchProjectiles: vi.fn(),
}))

const routeState = {
  path: '/',
  fullPath: '/',
  params: {} as Record<string, string>,
  query: {} as Record<string, string>,
}

const applyRoute = (path: string, query: Record<string, string> = {}) => {
  routeState.path = path
  routeState.query = query

  const search = new URLSearchParams(query).toString()
  routeState.fullPath = search ? `${path}?${search}` : path
}

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api')

  return {
    ...actual,
    fetchArmorSets: mocks.fetchArmorSets,
    fetchBosses: mocks.fetchBosses,
    fetchBuffs: mocks.fetchBuffs,
    fetchNpcs: mocks.fetchNpcs,
    fetchNpcAggregateById: mocks.fetchNpcAggregateById,
    fetchProjectiles: mocks.fetchProjectiles,
  }
})

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')

  return {
    ...actual,
    useRoute: () => routeState,
    useRouter: () => ({
      replace: mocks.routerReplace,
      push: mocks.routerPush,
    }),
  }
})

vi.mock('@/stores/userAuth', () => ({
  useUserAuthStore: () => ({
    isAuthenticated: false,
    displayName: 'Test User',
    initialized: true,
    init: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('@/components/ThemeSwitcher.vue', () => ({
  default: {
    name: 'ThemeSwitcher',
    template: '<div data-testid="theme-switcher" />',
  },
}))

describe('NPC public shell', () => {
  beforeEach(() => {
    mocks.fetchArmorSets.mockReset()
    mocks.fetchBosses.mockReset()
    mocks.fetchBuffs.mockReset()
    mocks.fetchNpcs.mockReset()
    mocks.fetchNpcAggregateById.mockReset()
    mocks.fetchProjectiles.mockReset()
    mocks.routerPush.mockReset()
    mocks.routerReplace.mockReset()

    mocks.routerPush.mockImplementation(async ({ path, query }: { path: string; query?: Record<string, string> }) => {
      applyRoute(path, (query ?? {}) as Record<string, string>)
    })

    applyRoute('/')
    routeState.params = {}
  })

  it('shows NPCs in the public navbar without rebranding the shared shell', async () => {
    const wrapper = mount(Navbar, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await wrapper.get('button[aria-label="Toggle menu"]').trigger('click')

    const npcLinks = wrapper.findAllComponents(RouterLinkStub).filter(link => link.props('to') === '/npcs')
    const bossLinks = wrapper.findAllComponents(RouterLinkStub).filter(link => link.props('to') === '/bosses')
    const buffLinks = wrapper.findAllComponents(RouterLinkStub).filter(link => link.props('to') === '/buffs')
    const projectileLinks = wrapper.findAllComponents(RouterLinkStub).filter(link => link.props('to') === '/projectiles')
    const armorSetLinks = wrapper.findAllComponents(RouterLinkStub).filter(link => link.props('to') === '/armor-sets')

    expect(npcLinks).toHaveLength(2)
    expect(bossLinks).toHaveLength(2)
    expect(buffLinks).toHaveLength(2)
    expect(projectileLinks).toHaveLength(2)
    expect(armorSetLinks).toHaveLength(2)
    expect(wrapper.text()).toContain('NPCs')
    expect(wrapper.text()).toContain('Bosses')
    expect(wrapper.text()).toContain('Buffs')
    expect(wrapper.text()).toContain('Projectiles')
    expect(wrapper.text()).toContain('Armor Sets')
    expect(wrapper.text()).toContain('冒险图鉴')
    expect(wrapper.text()).not.toContain('Terraria Field Guide')
  })

  it('exports the public npc list and detail routes', () => {
    expect(routes.some(route => route.path === '/npcs')).toBe(true)
    expect(routes.some(route => route.path === '/npcs/:id')).toBe(true)
  })

  it('keeps public route registration scoped to current public list surfaces', () => {
    expect(routes.some(route => route.path === '/items')).toBe(true)
    expect(routes.some(route => route.path === '/items/:id')).toBe(true)
    expect(routes.some(route => route.path === '/bosses')).toBe(true)
    expect(routes.some(route => route.path === '/bosses/:id')).toBe(false)
    expect(routes.some(route => route.path === '/buffs')).toBe(true)
    expect(routes.some(route => route.path === '/buffs/:id')).toBe(false)
    expect(routes.some(route => route.path === '/projectiles')).toBe(true)
    expect(routes.some(route => route.path === '/projectiles/:id')).toBe(false)
    expect(routes.some(route => route.path === '/armor-sets')).toBe(true)
    expect(routes.some(route => route.path === '/armor-sets/:id')).toBe(false)
  })

  it('renders public npc cards with search, town filter, and fallback portraits', async () => {
    applyRoute('/npcs')

    const npcRows: NpcListItem[] = [
      {
        id: 17,
        gameId: 22,
        internalName: 'Guide',
        name: 'Guide',
        nameZh: 'Guide CN',
        subName: 'Helpful starter',
        subNameZh: 'Starter helper',
        categoryId: 4,
        categoryName: 'Town NPC',
        isBoss: false,
        isFriendly: true,
        isTownNpc: true,
        imageUrl: null,
      },
    ]

    mocks.fetchNpcs.mockResolvedValue({
      success: true,
      data: npcRows,
      message: 'ok',
      statusCode: 200,
      pagination: {
        total: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      },
    } satisfies ApiResponse<NpcListItem[]>)

    const wrapper = mount(NpcListView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await flushPromises()

    expect(mocks.fetchNpcs).toHaveBeenCalled()
    expect(wrapper.find('.public-workbench').exists()).toBe(true)
    expect(wrapper.text()).toContain('NPC Directory')
    expect(wrapper.text()).toContain('Guide CN')
    expect(wrapper.text()).toContain('Town NPCs Only')
    expect(wrapper.text()).toContain('No portrait')
  })

  it('pushes filter state into the URL and exposes toggle state accessibly', async () => {
    applyRoute('/npcs')

    mocks.fetchNpcs.mockResolvedValue({
      success: true,
      data: [],
      message: 'ok',
      statusCode: 200,
      pagination: {
        total: 0,
        page: 1,
        limit: 12,
        totalPages: 1,
      },
    } satisfies ApiResponse<NpcListItem[]>)

    const wrapper = mount(NpcListView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })
    await flushPromises()

    const toggle = wrapper.get('button[aria-pressed]')
    expect(toggle.attributes('aria-pressed')).toBe('false')

    await toggle.trigger('click')
    await flushPromises()

    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(mocks.routerPush).toHaveBeenCalledWith({
      path: '/npcs',
      query: {
        isTownNpc: 'true',
      },
    })
  })

  it('renders public boss cards with search and managed-image fallback state', async () => {
    applyRoute('/bosses')

    const bossRows: BossListItem[] = [
      {
        id: 34,
        code: 'KING_SLIME',
        name: 'King Slime',
        nameZh: 'King Slime CN',
        nameEn: 'King Slime',
        bossType: 'PRE_HARDMODE',
        imageUrl: null,
        progressionOrder: 1,
        summonMethod: 'Use Slime Crown',
        memberCount: 1,
        memberNames: ['King Slime CN'],
        lootEntryCount: 2,
        uniqueLootItemCount: 2,
      },
    ]

    mocks.fetchBosses.mockResolvedValue({
      success: true,
      data: bossRows,
      message: 'ok',
      statusCode: 200,
      pagination: {
        total: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      },
    } satisfies ApiResponse<BossListItem[]>)

    const wrapper = mount(BossPublicView)

    await flushPromises()

    expect(mocks.fetchBosses).toHaveBeenCalledWith(1, 12, undefined)
    expect(wrapper.find('.public-workbench').exists()).toBe(true)
    expect(wrapper.text()).toContain('Boss Archive')
    expect(wrapper.text()).toContain('King Slime CN')
    expect(wrapper.text()).toContain('Use Slime Crown')
    expect(wrapper.text()).toContain('No managed portrait')
  })

  it('pushes boss search state into the URL', async () => {
    applyRoute('/bosses')

    mocks.fetchBosses.mockResolvedValue({
      success: true,
      data: [],
      message: 'ok',
      statusCode: 200,
      pagination: {
        total: 0,
        page: 1,
        limit: 12,
        totalPages: 1,
      },
    } satisfies ApiResponse<BossListItem[]>)

    const wrapper = mount(BossPublicView)

    await flushPromises()
    await wrapper.get('input[type="search"]').setValue('slime')
    await wrapper.get('form').trigger('submit.prevent')
    await flushPromises()

    expect(mocks.routerPush).toHaveBeenCalledWith({
      path: '/bosses',
      query: {
        search: 'slime',
      },
    })
  })

  it('renders public buff cards with managed-image fallback state', async () => {
    applyRoute('/buffs')

    const buffRows: BuffListItem[] = [
      {
        id: 159,
        sourceId: 159,
        internalName: 'Sharpened',
        name: 'Sharpened',
        nameZh: 'Sharpened CN',
        imageUrl: null,
        buffType: 'station',
        tooltipZh: 'Buff tooltip',
        sourceItemCount: 1,
        immuneNpcCount: 0,
      },
    ]

    mocks.fetchBuffs.mockResolvedValue({
      success: true,
      data: buffRows,
      message: 'ok',
      statusCode: 200,
      pagination: {
        total: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      },
    } satisfies ApiResponse<BuffListItem[]>)

    const wrapper = mount(BuffPublicView)
    await flushPromises()

    expect(mocks.fetchBuffs).toHaveBeenCalledWith(1, 12, undefined)
    expect(wrapper.text()).toContain('Buff Archive')
    expect(wrapper.text()).toContain('Sharpened CN')
    expect(wrapper.text()).toContain('No managed icon')
  })

  it('renders public projectile cards with managed-image fallback state', async () => {
    applyRoute('/projectiles')

    const projectileRows: ProjectileListItem[] = [
      {
        id: 1,
        sourceId: 1,
        internalName: 'WoodenArrowFriendly',
        name: 'Wooden Arrow',
        nameZh: 'Wooden Arrow CN',
        imageUrl: null,
        aiStyle: 1,
        damage: 5,
        knockBack: 1,
        friendly: true,
        hostile: false,
      },
    ]

    mocks.fetchProjectiles.mockResolvedValue({
      success: true,
      data: projectileRows,
      message: 'ok',
      statusCode: 200,
      pagination: {
        total: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      },
    } satisfies ApiResponse<ProjectileListItem[]>)

    const wrapper = mount(ProjectilePublicView)
    await flushPromises()

    expect(mocks.fetchProjectiles).toHaveBeenCalledWith(1, 12, undefined)
    expect(wrapper.text()).toContain('Projectile Archive')
    expect(wrapper.text()).toContain('Wooden Arrow CN')
    expect(wrapper.text()).toContain('No managed sprite')
  })

  it('renders public armor set cards with managed-image fallback state', async () => {
    applyRoute('/armor-sets')

    const armorSetRows: ArmorSetListItem[] = [
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
        maleImages: [],
        femaleImages: [],
        specialImages: [],
      },
    ]

    mocks.fetchArmorSets.mockResolvedValue({
      success: true,
      data: armorSetRows,
      message: 'ok',
      statusCode: 200,
      pagination: {
        total: 1,
        page: 1,
        limit: 12,
        totalPages: 1,
      },
    } satisfies ApiResponse<ArmorSetListItem[]>)

    const wrapper = mount(ArmorSetPublicView)
    await flushPromises()

    expect(mocks.fetchArmorSets).toHaveBeenCalledWith(1, 12, undefined)
    expect(wrapper.text()).toContain('Armor Set Archive')
    expect(wrapper.text()).toContain('Hallowed armor CN')
    expect(wrapper.text()).toContain('No managed set art')
  })

  it('renders npc aggregate sections independently and keeps empty sections safe', async () => {
    applyRoute('/npcs/17')
    routeState.params = { id: '17' }

    mocks.fetchNpcAggregateById.mockResolvedValue({
      success: true,
      data: {
        npc: {
          id: 17,
          gameId: 22,
          internalName: 'Guide',
          name: 'Guide',
          nameZh: 'Guide CN',
          subName: 'Helpful starter',
          subNameZh: 'Starter helper',
          categoryId: 4,
          categoryName: 'Town NPC',
          isBoss: false,
          isFriendly: true,
          isTownNpc: true,
          behaviorNotes: 'Offers advice to new players.',
          imageUrl: null,
          sourceItemsJson: JSON.stringify([
            {
              itemId: 8,
              itemName: 'Torch',
              itemNameZh: 'Torch CN',
              relationType: 'sold',
              sourceFactKey: 'source-item:torch',
              sourceProvider: 'terraria.wiki.gg',
              sourcePage: 'Guide',
            },
          ]),
          sourceItems: [
            {
              itemId: 8,
              itemName: 'Torch',
              itemNameZh: 'Torch CN',
              relationType: 'sold',
              sourceFactKey: 'source-item:torch',
              sourceProvider: 'terraria.wiki.gg',
              sourcePage: 'Guide',
            },
          ],
        },
        loot: [],
        shopEntries: [],
        buffRelations: [],
        moduleStatus: {
          loot: 'empty',
          shop: 'empty',
          buffs: 'empty',
        },
        aggregatedAt: '2026-04-11T00:00:00Z',
      },
      message: 'ok',
      statusCode: 200,
    } satisfies ApiResponse<NpcAggregateData>)

    const wrapper = mount(NpcDetailView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await flushPromises()

    expect(mocks.fetchNpcAggregateById).toHaveBeenCalledWith(17, 'loot,shop,buffs')
    expect(wrapper.find('.entity-detail-shell').exists()).toBe(true)
    expect(wrapper.find('.entity-detail-shell__sidebar').exists()).toBe(true)
    expect(wrapper.text()).toContain('Guide CN')
    expect(wrapper.text()).toContain('Loot')
    expect(wrapper.text()).toContain('Shop')
    expect(wrapper.text()).toContain('Buffs')
    expect(wrapper.text()).toContain('No loot data yet')
    expect(wrapper.text()).toContain('No shop inventory yet')
    expect(wrapper.text()).toContain('No buff relationships yet')
    expect(wrapper.text()).toContain('Source Items')
    expect(wrapper.text()).toContain('Torch CN')
    expect(wrapper.text()).toContain('source-item:torch')
  })

  it('loads negative npc ids so variant records can consume projection relations', async () => {
    applyRoute('/npcs/-65')
    routeState.params = { id: '-65' }

    mocks.fetchNpcAggregateById.mockResolvedValue({
      success: true,
      data: {
        npc: {
          id: -65,
          gameId: -65,
          internalName: 'BigHornetStingy',
          name: 'Hornet',
          nameZh: '黄蜂',
          subName: null,
          subNameZh: null,
          categoryId: 2,
          categoryName: 'Enemy',
          isBoss: false,
          isFriendly: false,
          isTownNpc: false,
          behaviorNotes: null,
          imageUrl: null,
          sourceItems: [
            {
              itemId: 1661,
              itemName: 'Hornet Banner',
              itemNameZh: '黄蜂旗',
              relationType: 'banner',
              sourceFactKey: 'npc-source-item:banner:BigHornetStingy:1661',
              sourceProvider: 'terrapedia.generated',
              sourcePage: 'npcs.standardized',
            },
          ],
        },
        loot: [],
        shopEntries: [],
        buffRelations: [],
        moduleStatus: {
          loot: 'empty',
          shop: 'empty',
          buffs: 'empty',
        },
        aggregatedAt: '2026-04-30T00:00:00Z',
      },
      message: 'ok',
      statusCode: 200,
    } satisfies ApiResponse<NpcAggregateData>)

    const wrapper = mount(NpcDetailView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await flushPromises()

    expect(mocks.fetchNpcAggregateById).toHaveBeenCalledWith(-65, 'loot,shop,buffs')
    expect(wrapper.text()).toContain('黄蜂')
    expect(wrapper.text()).toContain('黄蜂旗')
    expect(wrapper.text()).toContain('npc-source-item:banner:BigHornetStingy:1661')
    expect(wrapper.text()).not.toContain('Invalid NPC id')
  })

  it('shows the dedicated not-found state for 404 npc aggregates', async () => {
    applyRoute('/npcs/404')
    routeState.params = { id: '404' }

    mocks.fetchNpcAggregateById.mockResolvedValue({
      success: false,
      data: null,
      message: 'Npc not found',
      statusCode: 404,
    })

    const wrapper = mount(NpcDetailView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('NPC not found')
    expect(wrapper.text()).not.toContain('Could not load NPC profile')
  })
})
