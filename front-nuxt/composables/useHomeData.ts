export type HomeStats = {
  totalItems?: number | null
  totalCategories?: number | null
  totalBosses?: number | null
  totalNpcs?: number | null
  totalBuffs?: number | null
  totalBiomes?: number | null
  totalArmorSets?: number | null
  totalProjectiles?: number | null
  totalPublishedArticles?: number | null
}

export type HomeFocusItem = {
  id?: number | string | null
  name?: string | null
  nameZh?: string | null
  internalName?: string | null
  href?: string | null
  image?: string | null
  categoryName?: string | null
  gamePeriod?: string | null
  rarity?: string | null
  damage?: number | null
  knockback?: number | null
  useTime?: number | null
  sell?: number | null
  reasonLabel?: string | null
}

const fallbackHomeStats: HomeStats = {
  totalItems: null,
  totalCategories: null,
  totalBosses: null,
  totalNpcs: null,
  totalBuffs: null,
  totalBiomes: null,
  totalArmorSets: null,
  totalProjectiles: null,
  totalPublishedArticles: null,
}

const fallbackFocusItem: HomeFocusItem = {
  id: 757,
  name: 'Terra Blade',
  nameZh: '泰拉刃',
  internalName: 'TerraBlade',
  href: '/items/757',
  categoryName: '武器',
  gamePeriod: '困难模式后',
  rarity: '浅红色',
  damage: 85,
  knockback: 7,
  useTime: 18,
  reasonLabel: '当前焦点 · 真实物品',
}

const formatCount = (value: number | null | undefined, fallback: string) => {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue.toLocaleString('zh-CN')
    : fallback
}

const optionalText = (value: string | number | null | undefined) => {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

const positiveNumber = (value: number | null | undefined) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null
}

const fetchHomeStats = async (): Promise<HomeStats> => {
  try {
    const response = await usePublicApiFetch<HomeStats>('/statistics/overview')
    return unwrapApiResponse(response) ?? fallbackHomeStats
  } catch {
    return fallbackHomeStats
  }
}

const fetchHomeFocusItem = async (): Promise<HomeFocusItem> => {
  try {
    const response = await usePublicApiFetch<HomeFocusItem>('/public/home/focus-item')
    return unwrapApiResponse(response) ?? fallbackFocusItem
  } catch {
    return fallbackFocusItem
  }
}

export const useHomeData = async () => {
  const homeStatsResult = useAsyncData(
    'home-public-stats',
    fetchHomeStats,
    {
      default: () => fallbackHomeStats,
    },
  )

  const homeFocusItemResult = useAsyncData(
    'home-public-focus-item',
    fetchHomeFocusItem,
    {
      default: () => fallbackFocusItem,
    },
  )

  const [
    { data: homeStats },
    { data: homeFocusItem },
  ] = await Promise.all([homeStatsResult, homeFocusItemResult])

  const itemTotalLabel = computed(() => formatCount(homeStats.value?.totalItems, '图鉴'))
  const categoryTotalLabel = computed(() => formatCount(homeStats.value?.totalCategories, '分类'))
  const bossTotalLabel = computed(() => formatCount(homeStats.value?.totalBosses, '路线'))
  const npcTotalLabel = computed(() => formatCount(homeStats.value?.totalNpcs, '图鉴'))
  const buffTotalLabel = computed(() => formatCount(homeStats.value?.totalBuffs, '状态'))
  const biomeTotalLabel = computed(() => formatCount(homeStats.value?.totalBiomes, '生态'))
  const armorSetTotalLabel = computed(() => formatCount(homeStats.value?.totalArmorSets, '套装'))
  const projectileTotalLabel = computed(() => formatCount(homeStats.value?.totalProjectiles, '射弹'))
  const articleTotalLabel = computed(() => formatCount(homeStats.value?.totalPublishedArticles, '专题'))
  const focusDisplayName = computed(() => (
    optionalText(homeFocusItem.value?.nameZh)
    ?? optionalText(homeFocusItem.value?.name)
    ?? optionalText(fallbackFocusItem.nameZh)
    ?? '泰拉刃'
  ))
  const focusHref = computed(() => {
    const directHref = optionalText(homeFocusItem.value?.href)
    if (directHref) {
      return directHref
    }

    const id = optionalText(homeFocusItem.value?.id) ?? optionalText(fallbackFocusItem.id)
    return id ? `/items/${id}` : '/items/757'
  })
  const focusMeta = computed(() => {
    const parts = [
      optionalText(homeFocusItem.value?.categoryName),
      optionalText(homeFocusItem.value?.gamePeriod),
      optionalText(homeFocusItem.value?.rarity),
    ].filter(Boolean)

    return parts.length > 0 ? parts.join(' / ') : '武器 / 困难模式后 / 浅红色'
  })
  const focusStatLine = computed(() => {
    const stats = [
      ['伤害', positiveNumber(homeFocusItem.value?.damage)],
      ['击退', positiveNumber(homeFocusItem.value?.knockback)],
      ['使用时间', positiveNumber(homeFocusItem.value?.useTime)],
    ]
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .map(([label, value]) => `${label} ${value}`)

    return stats.length > 0 ? stats.join(' · ') : null
  })

  const primaryEntries = computed(() => [
    { label: '物品', href: '/items', icon: 'icon-items', desc: '查装备、材料、掉落', count: itemTotalLabel.value, hex: '255,215,101' },
    { label: 'Boss', href: '/bosses', icon: 'icon-boss', desc: '看前置、阶段、战利品', count: bossTotalLabel.value, hex: '224,126,85' },
    { label: 'NPC', href: '/npcs', icon: 'icon-npc', desc: '找城镇角色和敌怪', count: npcTotalLabel.value, hex: '126,178,120' },
    { label: '攻略', href: '/articles', icon: 'icon-article', desc: '按阶段和机制阅读', count: articleTotalLabel.value, hex: '217,185,91' },
  ])

  const primaryStats = computed(() => [
    { value: itemTotalLabel.value, label: '物品条目', href: '/items' },
    { value: categoryTotalLabel.value, label: '分类总览', href: '/categories' },
  ])

  const atlasOverview = computed(() => ({
    totalLabel: itemTotalLabel.value,
    focus: {
      label: optionalText(homeFocusItem.value?.reasonLabel) ?? '当前焦点 · 真实物品',
      title: focusDisplayName.value,
      href: focusHref.value,
      image: optionalText(homeFocusItem.value?.image),
      meta: focusMeta.value,
      statLine: focusStatLine.value,
    },
    metrics: [
      { label: '物品', href: '/items', desc: '装备 / 材料 / 掉落' },
      { label: 'NPC', href: '/npcs', desc: '城镇 / 敌怪' },
      { label: 'Boss', href: '/bosses', desc: '阶段 / 战利品' },
      { label: '攻略', href: '/articles', desc: '路线 / 事件' },
    ],
    rows: [
      { index: '01', label: '物品图鉴', href: '/items', value: itemTotalLabel.value },
      { index: '02', label: '合成链路', href: '/crafting', value: '合成路线' },
      { index: '03', label: 'Boss 进度', href: '/bosses', value: bossTotalLabel.value },
      { index: '04', label: '已发布文章', href: '/articles', value: articleTotalLabel.value },
    ],
  }))

  const hero = computed(() => ({
      kicker: '公开图鉴 · 世界路线',
      title: '从泰拉刃\n进入整个世界',
      lede: '按物品、Boss、NPC 和攻略路线进入资料，开局、战前、困难模式和月后整理都能直接找到下一步。',
      primaryEntries: primaryEntries.value,
      progressionStages: [
        { label: '新手开荒', href: '/articles?keyword=开荒', tone: 'moss' },
        { label: 'Boss 前置', href: '/articles?keyword=Boss', tone: 'gold' },
        { label: '困难模式', href: '/articles?keyword=困难模式', tone: 'paper' },
        { label: '月后整理', href: '/articles?keyword=月亮领主', tone: 'paper' },
      ],
      secondaryLinks: [
        { label: '分类', href: '/categories', icon: 'icon-category', desc: '类型索引' },
        { label: '制作', href: '/crafting', icon: 'icon-crafting', desc: '合成链路' },
        { label: '生态', href: '/biomes', icon: 'icon-biome', desc: `${biomeTotalLabel.value}资料` },
        { label: 'Buff', href: '/buffs', icon: 'icon-buff', desc: `${buffTotalLabel.value}效果` },
        { label: '套装', href: '/armor-sets', icon: 'icon-armor', desc: `${armorSetTotalLabel.value}路线` },
        { label: '射弹', href: '/projectiles', icon: 'icon-projectile', desc: `${projectileTotalLabel.value}行为` },
      ],
      primaryStats: primaryStats.value,
      trustSignals: [
        { label: '已覆盖版本:Terraria v1.4.4' },
        { label: '资料数据持续校验' },
        { label: '持续维护 · 非官方资料站' },
      ],
      atlas: atlasOverview.value,
  }))

  return {
    itemTotalLabel,
    hero,
    explorationNodes: [
      {
        className: 'one',
        href: '/articles/ac-home-starting-route-2026-06-08',
        image: '/preview-assets/terrapedia-images/items/2026/04/08/3a43bd1521b5418fade0c386891cc047.png',
        title: '开荒入口',
        desc: '生命水晶、向导与护士，整理新档前两小时。',
      },
      {
        className: 'two',
        href: '/articles/ac-home-gear-foundation-route-2026-06-08',
        image: '/preview-assets/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png',
        title: '装备成型',
        desc: '防具选择先看打法，再看防御与材料风险。',
        featured: true,
      },
      {
        className: 'three',
        href: '/articles/ac-home-hardmode-first-hour-mining-2026-06-08',
        image: '/preview-assets/terrapedia-images/items/2026/04/08/c626dfb6e7bc4139b099b81ffc4680d1.png',
        title: '困难模式',
        desc: '三层矿物按工具链推进，不只看颜色。',
      },
      {
        className: 'four',
        href: '/articles/ac-home-biome-exploration-route-2026-06-08',
        image: '/preview-assets/terrapedia-images/items/2026/04/08/179b4aea3cc74ae989a9eb86db6f50ec.png',
        title: '生态探索',
        desc: '按风险、资源和返回点规划群落探索。',
      },
      {
        className: 'five',
        href: '/articles/ac-home-event-workshop-route-2026-06-08',
        image: '/preview-assets/terrapedia-images/items/2026/04/08/6ef1b719169348b595c93654cbf60c1c.png',
        title: '专题路线',
        desc: '把事件、工坊和配件升级整理成路线。',
      },
    ],
    featuredRoute: {
      href: '/articles/ac-home-gear-foundation-route-2026-06-08',
      image: '/preview-assets/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png',
      title: '装备成型不是堆防御：先确定你的打法',
      desc: '按武器距离、材料风险和战斗目标选择防具与配件，把下一步战斗变得可重复。',
      tags: [
        { label: '开荒', tone: 'moss' },
        { label: '装备路线', tone: 'gold' },
        { label: 'Boss 前', tone: 'paper' },
        { label: '职业打法', tone: 'paper' },
      ],
      list: [
        {
          href: '/articles/ac-home-hardmode-first-hour-mining-2026-06-08',
          title: '困难模式开矿顺序',
          desc: '三层矿物 · 工具链推进',
          badge: '采矿',
          image: '/preview-assets/terrapedia-images/items/2026/04/08/cd8d30c0359b4fbda34ffcfba4745145.png',
        },
        {
          href: '/articles/ac-home-boss-prep-route-2026-06-08',
          title: 'Boss 前置准备',
          desc: '场地恢复 · 输出窗口',
          badge: '战前',
          image: '/preview-assets/terrapedia-images/items/2026/04/08/5495725121204ede9da25ddf678ca246.png',
        },
        {
          href: '/articles/ac-home-underworld-checklist-2026-06-08',
          title: '地狱层探索清单',
          desc: '熔岩环境 · 工具优先',
          badge: '探索',
          image: '/preview-assets/terrapedia-images/items/2026/04/08/77203300926f489fb82ae1072a8623d4.png',
        },
      ],
    },
    bossRoute: {
      href: '/bosses',
      title: 'Boss 推进路线',
      desc: '从战前准备、触发条件到关键掉落，按阶段进入 Boss 资料。',
      stages: [
        { index: '01', label: '战前准备' },
        { index: '02', label: '事件触发' },
        { index: '03', label: '关键掉落' },
        { index: '04', label: '下一阶段' },
      ],
      lootImages: [
        '/preview-assets/terrapedia-images/items/2026/04/08/6ef1b719169348b595c93654cbf60c1c.png',
        '/preview-assets/terrapedia-images/items/2026/04/08/6b53bc835cd742dba96053653aac8f4f.png',
        '/preview-assets/terrapedia-images/items/2026/04/08/c626dfb6e7bc4139b099b81ffc4680d1.png',
        '/preview-assets/terrapedia-images/items/2026/04/08/034a248ac37a42049c5ef882098a4eb8.png',
        '/preview-assets/terrapedia-images/items/2026/04/08/572d02498c01441e86ce0e55aa946f5b.png',
        '/preview-assets/terrapedia-images/items/2026/04/08/1c9f832ea4a6424c8bdae1bc843ec02f.png',
      ],
    },
    codex: {
      title: '攻略 · 专题 · 机制文档',
      desc: '按游玩阶段、装备目标和机制解释组织内容，和图鉴数据互相跳转。',
      links: [
        { label: '开荒', href: '/articles/ac-home-starting-route-2026-06-08' },
        { label: '装备', href: '/articles/ac-home-mobility-upgrade-route-2026-06-08' },
        { label: '机制', href: '/articles/ac-home-resource-loop-fishing-2026-06-08' },
      ],
      routes: [
        { index: '01', title: '阶段专题', desc: '新档节奏 / 困难模式开矿 / 地狱探索', href: '/articles/ac-home-starting-route-2026-06-08' },
        { index: '02', title: '装备目标', desc: '防具选择 / 移动升级 / 材料风险', href: '/articles/ac-home-mobility-upgrade-route-2026-06-08' },
        { index: '03', title: '机制解释', desc: '事件入口 / 资源循环 / 探索风险', href: '/articles/ac-home-event-workshop-route-2026-06-08' },
      ],
      notes: [
        { mark: 'A', title: '生态资源', desc: '群落探索按风险和返回点推进', href: '/articles/ac-home-biome-exploration-route-2026-06-08' },
        { mark: 'B', title: '资源循环', desc: '钓鱼药水和目标水域纳入中期规划', href: '/articles/ac-home-resource-loop-fishing-2026-06-08' },
        { mark: 'C', title: '事件规划', desc: '陨石落地后的采集和转化路线', href: '/articles/ac-home-meteorite-planning-2026-06-08' },
      ],
    },
  }
}
