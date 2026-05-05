import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import ItemDetailView from '@/views/ItemDetailView.vue'

const mocks = vi.hoisted(() => ({
  fetchCategories: vi.fn(),
  fetchItemImages: vi.fn(),
  fetchItemRecipeTree: vi.fn(),
  fetchItemSources: vi.fn(),
  fetchPublicItemDetailShell: vi.fn(),
}))

const routeState = {
  params: { id: '100' } as Record<string, string>,
}

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api')

  return {
    ...actual,
    fetchCategories: mocks.fetchCategories,
    fetchItemImages: mocks.fetchItemImages,
    fetchItemRecipeTree: mocks.fetchItemRecipeTree,
    fetchItemSources: mocks.fetchItemSources,
    fetchPublicItemDetailShell: mocks.fetchPublicItemDetailShell,
  }
})

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')

  return {
    ...actual,
    useRoute: () => routeState,
  }
})

describe('item public acceptance', () => {
  beforeEach(() => {
    routeState.params = { id: '100' }
    mocks.fetchCategories.mockReset()
    mocks.fetchItemImages.mockReset()
    mocks.fetchItemRecipeTree.mockReset()
    mocks.fetchItemSources.mockReset()
    mocks.fetchPublicItemDetailShell.mockReset()

    mocks.fetchCategories.mockResolvedValue({ success: true, data: [] })
    mocks.fetchItemImages.mockResolvedValue([])
    mocks.fetchItemSources.mockResolvedValue([])
    mocks.fetchItemRecipeTree.mockResolvedValue({ variants: [] })
  })

  it('renders a dedicated 404 state without treating it as a runtime error', async () => {
    mocks.fetchPublicItemDetailShell.mockResolvedValue({
      success: false,
      data: null,
      message: 'Item not found',
      statusCode: 404,
    })

    const wrapper = mountItemDetail()
    await flushPromises()

    expect(wrapper.text()).toContain('Item not found')
    expect(wrapper.text()).toContain('requested public item profile is unavailable')
    expect(wrapper.text()).not.toContain('Could not load item detail')
  })

  it('keeps missing images and source data in stable public empty states', async () => {
    mocks.fetchPublicItemDetailShell.mockResolvedValue({
      success: true,
      data: {
        id: 100,
        name: 'Torch',
        nameZh: '',
        internalName: 'Torch',
        categoryName: '',
        category: '',
        image: null,
      },
      message: 'ok',
      statusCode: 200,
    })

    const wrapper = mountItemDetail()
    await flushPromises()

    expect(wrapper.text()).toContain('Torch')
    expect(wrapper.text()).toContain('No artwork')
    expect(wrapper.text()).toContain('No public source data has been attached to this item yet.')
    expect(wrapper.text()).toContain('No public images have been attached to this item yet.')
    expect(wrapper.text()).toContain('No public description has been published for this item yet.')
    expect(wrapper.text()).not.toContain('undefined')
  })

  it('exposes missing aggregate modules as visible module status instead of crashing', async () => {
    mocks.fetchPublicItemDetailShell.mockResolvedValue({
      success: true,
      data: {
        id: 100,
        name: 'Torch',
        internalName: 'Torch',
        image: null,
      },
      message: 'ok',
      statusCode: 200,
    })
    mocks.fetchItemRecipeTree.mockRejectedValue(new Error('recipe module unavailable'))

    const wrapper = mountItemDetail()
    await flushPromises()

    expect(wrapper.text()).toContain('Metadata')
    expect(wrapper.text()).toContain('Images')
    expect(wrapper.text()).toContain('Sources')
    expect(wrapper.text()).toContain('Recipes')
    expect(wrapper.text()).toContain('error')
    expect(wrapper.text()).not.toContain('recipe module unavailable')
  })
})

function mountItemDetail() {
  return mount(ItemDetailView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
      },
    },
  })
}
