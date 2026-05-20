export type HomeStats = {
  totalItems?: number | null
  totalCategories?: number | null
}

const fallbackHomeStats: HomeStats = {
  totalItems: 6131,
  totalCategories: 0,
}

const formatCount = (value: number | null | undefined, fallback: string) => {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue.toLocaleString('zh-CN')
    : fallback
}

const fetchHomeStats = async (): Promise<HomeStats> => {
  try {
    const response = await usePublicApiFetch<HomeStats>('/statistics/overview')
    return unwrapApiResponse(response) ?? fallbackHomeStats
  } catch {
    return fallbackHomeStats
  }
}

export const useHomeData = async () => {
  const { data: homeStats } = await useAsyncData(
    'home-public-stats',
    fetchHomeStats,
    {
      default: () => fallbackHomeStats,
    },
  )

  const itemTotalLabel = computed(() => formatCount(homeStats.value?.totalItems, '6,131'))

  return {
    itemTotalLabel,
    quickEntries: computed(() => [
      { label: '物品', href: '/items', icon: 'icon-items', count: itemTotalLabel.value },
      { label: 'Boss', href: '/bosses', icon: 'icon-boss', count: '14' },
      { label: 'NPC', href: '/npcs', icon: 'icon-npc', count: '762' },
      { label: 'Buff', href: '/buffs', icon: 'icon-buff', count: '388' },
      { label: '配方', href: '/crafting', icon: 'icon-crafting', count: '14,746' },
      { label: '文章', href: '/articles', icon: 'icon-article', count: '精选' },
    ]),
    recentUpdates: [
      { title: '泰拉刃', meta: '配方与材料入口', href: '/items/757' },
      { title: '神圣锭', meta: '困难模式材料', href: '/items?search=神圣锭' },
      { title: '克苏鲁之眼', meta: 'Boss 路线整理', href: '/bosses' },
      { title: '铁皮药水', meta: '战前增益', href: '/items?search=铁皮药水' },
      { title: '城镇 NPC', meta: '居住与服务入口', href: '/npcs' },
    ],
    hotSearches: [
      { title: '泰拉刃', meta: '合成目标', href: '/search?keyword=泰拉刃' },
      { title: '甲虫套', meta: '近战防具', href: '/search?keyword=甲虫套' },
      { title: '铁皮药水', meta: '防御增益', href: '/search?keyword=铁皮药水' },
      { title: '翅膀', meta: '移动配饰', href: '/search?keyword=翅膀' },
      { title: '月亮领主', meta: '后期 Boss', href: '/search?keyword=月亮领主' },
    ],
    starterGuides: [
      { title: '开荒第一天', meta: '工具、火把、工作台', href: '/articles?tag=入门' },
      { title: 'Boss 顺序', meta: '从史莱姆王到月亮领主', href: '/bosses' },
      { title: '困难模式准备', meta: '祭坛、矿石、机械 Boss', href: '/articles?stage=hardmode' },
      { title: '药水清单', meta: '战前 Buff 速查', href: '/buffs' },
      { title: '合成路线', meta: '材料和制作站', href: '/crafting' },
    ],
  }
}
