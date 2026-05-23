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
  const categoryTotalLabel = computed(() => formatCount(homeStats.value?.totalCategories, '分类'))

  const primaryEntries = computed(() => [
    { label: '物品', href: '/items', icon: 'icon-items', desc: '装备材料掉落', count: itemTotalLabel.value, hex: '255,215,101' },
    { label: 'Boss', href: '/bosses', icon: 'icon-boss', desc: '阶段战斗路线', count: '路线化', hex: '224,126,85' },
    { label: 'NPC', href: '/npcs', icon: 'icon-npc', desc: '城镇敌怪图鉴', count: '762', hex: '126,178,120' },
    { label: '攻略', href: '/articles', icon: 'icon-article', desc: '专题和机制', count: '精选', hex: '217,185,91' },
  ])

  const primaryStats = computed(() => [
    { value: itemTotalLabel.value, label: '物品条目', href: '/items' },
    { value: categoryTotalLabel.value, label: '分类总览', href: '/categories' },
  ])

  const atlasOverview = computed(() => ({
    totalLabel: itemTotalLabel.value,
    focus: {
      label: '当前焦点',
      title: '泰拉刃',
      href: '/items/757',
    },
    metrics: [
      { label: '物品', href: '/items', desc: '装备 / 材料 / 掉落' },
      { label: 'NPC', href: '/npcs', desc: '城镇 / 敌怪' },
      { label: 'Boss', href: '/bosses', desc: '阶段 / 战利品' },
      { label: '攻略', href: '/articles', desc: '路线 / 事件' },
    ],
    rows: [
      { index: '01', label: '物品图鉴', href: '/items', value: itemTotalLabel.value },
      { index: '02', label: '合成链路', href: '/crafting', value: '14,746' },
      { index: '03', label: 'Boss 进度', href: '/bosses', value: '路线化' },
      { index: '04', label: '攻略专题', href: '/articles', value: '精选' },
    ],
  }))

  const hero = computed(() => ({
      kicker: '公开图鉴 · 世界路线',
      title: '从泰拉刃\n进入整个世界',
      lede: '按物品、Boss、NPC 和攻略路线进入资料，开局、战前、困难模式和月后整理都能直接找到下一步。',
      primaryEntries: primaryEntries.value,
      progressionStages: [
        { label: '新手开荒', href: '/articles?stage=early', tone: 'moss' },
        { label: 'Boss 前置', href: '/articles?stage=boss-prep', tone: 'gold' },
        { label: '困难模式', href: '/articles?stage=hardmode', tone: 'paper' },
        { label: '月后整理', href: '/articles?stage=post-moon', tone: 'paper' },
      ],
      secondaryLinks: [
        { label: '分类', href: '/categories', icon: 'icon-category', desc: '类型索引' },
        { label: '制作', href: '/crafting', icon: 'icon-crafting', desc: '合成路线' },
        { label: '生态', href: '/biomes', icon: 'icon-biome', desc: '群落资源' },
        { label: 'Buff', href: '/buffs', icon: 'icon-buff', desc: '状态效果' },
        { label: '套装', href: '/armor-sets', icon: 'icon-armor', desc: '防具推进' },
        { label: '射弹', href: '/projectiles', icon: 'icon-projectile', desc: '弹道行为' },
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
        href: '/items?gamePeriod=early',
        image: '/preview-assets/terrapedia-images/items/2026/04/08/3a43bd1521b5418fade0c386891cc047.png',
        title: '开荒入口',
        desc: '铜短剑、木弓、火把，形成第一条路径。',
      },
      {
        className: 'two',
        href: '/items',
        image: '/preview-assets/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png',
        title: '物品图鉴',
        desc: '泰拉刃为中心入口，牵出主线路径和合成方向。',
        featured: true,
      },
      {
        className: 'three',
        href: '/items?gamePeriod=hardmode',
        image: '/preview-assets/terrapedia-images/items/2026/04/08/c626dfb6e7bc4139b099b81ffc4680d1.png',
        title: '困难模式',
        desc: '神圣锭、机械 Boss、阶段性推进。',
      },
      {
        className: 'four',
        href: '/biomes',
        image: '/preview-assets/terrapedia-images/items/2026/04/08/179b4aea3cc74ae989a9eb86db6f50ec.png',
        title: '生态地图',
        desc: '群落、资源与地形入口在同一层表达。',
      },
      {
        className: 'five',
        href: '/articles',
        image: '/preview-assets/terrapedia-images/items/2026/04/08/6ef1b719169348b595c93654cbf60c1c.png',
        title: '资料手札',
        desc: '攻略和专题从这里向外分叉。',
      },
    ],
    featuredRoute: {
      href: '/articles/melee-progression',
      image: '/preview-assets/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png',
      title: '从机械 Boss 到月亮领主：近战装备推进路线',
      desc: '按材料、事件和 Boss 顺序整理困难模式后期路线，每一步都能跳回对应图鉴。',
      tags: [
        { label: '开荒', tone: 'moss' },
        { label: 'Boss 前', tone: 'gold' },
        { label: '困难模式', tone: 'paper' },
        { label: '月前装备', tone: 'paper' },
      ],
      list: [
        {
          title: '真永夜刃',
          desc: '合成材料 · 路线主轴',
          badge: '合成',
          image: '/preview-assets/terrapedia-images/items/2026/04/08/cd8d30c0359b4fbda34ffcfba4745145.png',
        },
        {
          title: '真断钢剑',
          desc: '合成材料 · 战前推进',
          badge: '合成',
          image: '/preview-assets/terrapedia-images/items/2026/04/08/5495725121204ede9da25ddf678ca246.png',
        },
        {
          title: '英雄断剑',
          desc: '掉落来源 · 日食事件',
          badge: '来源',
          image: '/preview-assets/terrapedia-images/items/2026/04/08/77203300926f489fb82ae1072a8623d4.png',
        },
      ],
    },
    bossRoute: {
      title: 'Boss 推进路线',
      desc: 'Boss 战前置 · 掉落清单 · 推进路线',
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
        { label: '攻略', href: '/articles?type=guide' },
        { label: '专题', href: '/articles?type=topic' },
        { label: '机制', href: '/articles?type=mechanic' },
      ],
      routes: [
        { index: '01', title: '阶段专题', desc: '开荒 / 困难模式 / 月后整理' },
        { index: '02', title: '装备目标', desc: '近战、射手、法师和召唤路线' },
        { index: '03', title: '机制解释', desc: '事件、生态、掉落与刷新规则' },
      ],
      notes: [
        { mark: 'A', title: '专题索引', desc: '按阶段、职业和事件组织入口' },
        { mark: 'B', title: '路线信号', desc: '把装备和事件拆成可走的流程' },
        { mark: 'C', title: '阅读手札', desc: '文章卡片以专题化摘要呈现' },
      ],
    },
  }
}
