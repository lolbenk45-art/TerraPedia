<script setup lang="ts">
import { defineComponent, h, type PropType } from 'vue'
import '../assets/css/home-hero-options.css'

type SvgRole = {
  key: string
  label: string
  meta: string
  visualRole: string
  alias: string
  weight?: string
  tone?: string
  tags?: string[]
  name?: string
  sheet?: string
}

const svgRoleCatalog = [
  { key: 'search', label: '搜索', meta: '全站检索', visualRole: 'search', alias: '' },
  { key: 'items', label: '物品', meta: '图鉴主体', visualRole: 'item', alias: '' },
  { key: 'category', label: '分类', meta: '抽象分组', visualRole: 'category', alias: '' },
  { key: 'biome', label: '生态', meta: '世界区域', visualRole: 'biome', alias: '' },
  { key: 'boss', label: 'Boss', meta: '事件节点', visualRole: 'boss', alias: '' },
  { key: 'buff', label: 'Buff', meta: '状态效果', visualRole: 'buff', alias: '' },
  { key: 'armor', label: '套装', meta: '职业路线', visualRole: 'armor', alias: '' },
  { key: 'projectile', label: '射弹', meta: '弹道行为', visualRole: 'projectile', alias: '' },
  { key: 'npc', label: 'NPC', meta: '关系索引', visualRole: 'npc', alias: '用户同格' },
  { key: 'article', label: '攻略', meta: '专题资料', visualRole: 'article', alias: '' },
  { key: 'material', label: '材料 / 制作', meta: '配方链路', visualRole: 'material', alias: '制作同格' },
  { key: 'edit', label: '编辑', meta: '投稿动作', visualRole: 'edit', alias: '' },
  { key: 'favorites', label: '收藏', meta: '个人书签', visualRole: 'favorite', alias: '' },
  { key: 'settings', label: '设置', meta: '偏好控制', visualRole: 'settings', alias: '' },
  { key: 'codex', label: '图鉴', meta: '资料库', visualRole: 'codex', alias: '' },
  { key: 'notification', label: '通知', meta: '状态提醒', visualRole: 'notice', alias: '' },
] as const satisfies readonly SvgRole[]

type SvgRoleKey = typeof svgRoleCatalog[number]['key']

const svgRoleMap = Object.fromEntries(
  svgRoleCatalog.map((role) => [role.key, role]),
) as Record<SvgRoleKey, SvgRole>

const roleEntry = (key: SvgRoleKey, extra: Partial<SvgRole> = {}): SvgRole => ({
  ...svgRoleMap[key],
  ...extra,
}) as SvgRole

const pickRoles = (keys: SvgRoleKey[], sheet = 'svg'): SvgRole[] => keys.map((key) => roleEntry(key, { sheet }))

const roleIconHref = (role: SvgRole): string => `#home-role-${role.visualRole}`

const homeRoleSvgSymbols = [
  'home-role-search',
  'home-role-item',
  'home-role-category',
  'home-role-biome',
  'home-role-boss',
  'home-role-buff',
  'home-role-armor',
  'home-role-projectile',
  'home-role-npc',
  'home-role-user',
  'home-role-article',
  'home-role-material',
  'home-role-crafting',
  'home-role-edit',
  'home-role-favorite',
  'home-role-settings',
  'home-role-codex',
  'home-role-notice',
] as const

const RoleSvgIcon = defineComponent({
  name: 'RoleSvgIcon',
  inheritAttrs: false,
  props: {
    role: {
      type: Object as PropType<SvgRole>,
      required: true,
    },
  },
  setup(props, { attrs }) {
    return () => {
      const { class: className, ...restAttrs } = attrs

      return h(
        'span',
        {
          ...restAttrs,
          class: ['svg-icon-token', `role-${props.role.visualRole}`, className],
          'aria-hidden': restAttrs['aria-hidden'] ?? 'true',
        },
        [
          h('svg', {
            class: 'role-svg-icon',
            viewBox: '0 0 24 24',
            focusable: 'false',
          }, [
            h('use', {
              href: roleIconHref(props.role),
            }),
          ]),
        ],
      )
    }
  },
})

const abstractSvgEntries = [
  roleEntry('category', { label: '分类入口', meta: '武器 / 材料 / 工具' }),
  roleEntry('projectile', { label: '射弹行为', meta: '弹道 / 来源 / 命中' }),
  roleEntry('npc', { label: 'NPC 关系', meta: '入住 / 事件 / 掉落' }),
  roleEntry('biome', { label: '生态索引', meta: '地形 / 资源 / 生成' }),
]

const simpleSvgGlyphs: SvgRole[] = [
  ...pickRoles(['search', 'category', 'biome', 'projectile', 'npc', 'material', 'favorites', 'codex'], 'relic'),
  ...pickRoles(['boss', 'buff', 'armor', 'items'], 'craft'),
  ...pickRoles(['article', 'edit', 'settings', 'notification'], 'manual'),
]

const svgCategoryMosaic = [
  roleEntry('search', { sheet: 'relic', weight: 'wide' }),
  roleEntry('items', { sheet: 'relic', weight: 'tall' }),
  roleEntry('category', { sheet: 'relic', weight: 'normal' }),
  roleEntry('biome', { sheet: 'relic', weight: 'normal' }),
  roleEntry('boss', { sheet: 'relic', weight: 'wide' }),
  roleEntry('buff', { sheet: 'relic', weight: 'normal' }),
  roleEntry('armor', { sheet: 'relic', weight: 'normal' }),
  roleEntry('projectile', { sheet: 'relic', weight: 'normal' }),
  roleEntry('npc', { sheet: 'relic', weight: 'wide' }),
  roleEntry('article', { sheet: 'relic', weight: 'normal' }),
  roleEntry('material', { sheet: 'relic', label: '制作', visualRole: 'crafting', weight: 'normal' }),
  roleEntry('favorites', { sheet: 'relic', weight: 'normal' }),
]

const svgIconWall: SvgRole[] = pickRoles(svgRoleCatalog.map((role) => role.key))

const svgTileWallKeys = [
  'items',
  'material',
  'category',
  'boss',
  'npc',
  'buff',
  'biome',
  'projectile',
  'article',
  'favorites',
  'codex',
  'search',
] as const satisfies readonly SvgRoleKey[]

const svgTileWall = Array.from({ length: 48 }, (_, index) => {
  const key = svgTileWallKeys[index % svgTileWallKeys.length] ?? 'items'
  return roleEntry(key, { sheet: 'svg-tile' })
})

const craftRouteStages = [
  roleEntry('material', { sheet: 'craft', name: '材料层', meta: '同类材料先归组', visualRole: 'material' }),
  roleEntry('boss', { sheet: 'craft', name: '事件层', meta: '掉落与触发来源' }),
  roleEntry('material', { sheet: 'craft', name: '制作层', meta: '配方与工作站', visualRole: 'crafting' }),
  roleEntry('items', { sheet: 'craft', name: '结果层', meta: '路线终点与分支' }),
]

const craftRouteBoard = [
  roleEntry('search', { sheet: 'craft', label: '搜索配方', meta: '入口' }),
  roleEntry('material', { sheet: 'craft', label: '材料归组', meta: '材料', visualRole: 'material' }),
  roleEntry('boss', { sheet: 'craft', label: 'Boss 阶段', meta: '事件' }),
  roleEntry('buff', { sheet: 'craft', label: 'Buff 准备', meta: '战前' }),
  roleEntry('armor', { sheet: 'craft', label: '套装路线', meta: '职业' }),
  roleEntry('projectile', { sheet: 'craft', label: '射弹行为', meta: '结果' }),
]

const craftComboLane = [
  { label: '战前准备', roles: pickRoles(['search', 'buff', 'armor', 'boss'], 'craft') },
  { label: '材料处理', roles: [roleEntry('material', { sheet: 'craft', visualRole: 'material' }), roleEntry('material', { sheet: 'craft', label: '制作', visualRole: 'crafting' }), roleEntry('items', { sheet: 'craft' }), roleEntry('projectile', { sheet: 'craft' })] },
  { label: '用户动作', roles: [roleEntry('favorites', { sheet: 'craft' }), roleEntry('edit', { sheet: 'craft' }), roleEntry('npc', { sheet: 'craft', label: '用户', visualRole: 'user' }), roleEntry('notification', { sheet: 'craft' })] },
  { label: '事件掉落', roles: [roleEntry('boss', { sheet: 'craft' }), roleEntry('npc', { sheet: 'craft' }), roleEntry('projectile', { sheet: 'craft' }), roleEntry('material', { sheet: 'craft', visualRole: 'material' })] },
  { label: '图鉴分流', roles: pickRoles(['category', 'biome', 'search', 'article'], 'craft') },
  { label: '路线记录', roles: [roleEntry('codex', { sheet: 'craft' }), roleEntry('settings', { sheet: 'craft' }), roleEntry('favorites', { sheet: 'craft' }), roleEntry('material', { sheet: 'craft', label: '制作', visualRole: 'crafting' })] },
]

const craftNodes = [
  { name: '永夜刃', meta: '材料', lane: 'left' },
  { name: '断钢剑', meta: '材料', lane: 'left' },
  { name: '英雄断剑', meta: '日食', lane: 'center' },
  { name: '真永夜刃', meta: '合成', lane: 'right' },
  { name: '真断钢剑', meta: '合成', lane: 'right' },
  { name: '泰拉刃', meta: '成品', lane: 'result' },
]

const manualRows = [
  { label: '伤害', value: '115' },
  { label: '使用时间', value: '14' },
  { label: '击退', value: '6.5' },
  { label: '稀有度', value: '黄色' },
]

const manualIndex = [
  roleEntry('items', { sheet: 'manual', label: '武器' }),
  roleEntry('material', { sheet: 'manual', label: '材料', visualRole: 'material' }),
  roleEntry('material', { sheet: 'manual', label: '合成', visualRole: 'crafting' }),
  roleEntry('boss', { sheet: 'manual', label: '来源' }),
  roleEntry('article', { sheet: 'manual', label: '路线' }),
]

const manualChapterGrid = [
  roleEntry('search', { sheet: 'manual', label: '速查', meta: '全站搜索' }),
  roleEntry('items', { sheet: 'manual', label: '物品', meta: '图鉴入口' }),
  roleEntry('category', { sheet: 'manual', label: '分类', meta: '抽象分组' }),
  roleEntry('biome', { sheet: 'manual', label: '生态', meta: '世界区域' }),
  roleEntry('npc', { sheet: 'manual', label: 'NPC', meta: '关系索引' }),
  roleEntry('favorites', { sheet: 'manual', label: '收藏', meta: '个人书签' }),
]

const manualIconShelf = [
  { label: '资料书签', roles: pickRoles(['article', 'favorites', 'codex'], 'manual') },
  { label: '编辑入口', roles: [roleEntry('npc', { sheet: 'manual', label: '用户', visualRole: 'user' }), roleEntry('edit', { sheet: 'manual' }), roleEntry('settings', { sheet: 'manual' })] },
  { label: '状态提醒', roles: pickRoles(['search', 'notification', 'buff'], 'manual') },
  { label: '分类目录', roles: pickRoles(['category', 'items', 'biome'], 'manual') },
  { label: '掉落页签', roles: pickRoles(['boss', 'npc', 'projectile'], 'manual') },
  { label: '制作页签', roles: [roleEntry('material', { sheet: 'manual', visualRole: 'material' }), roleEntry('material', { sheet: 'manual', label: '制作', visualRole: 'crafting' }), roleEntry('armor', { sheet: 'manual' })] },
]

const previewSvgIcons: SvgRole[] = simpleSvgGlyphs

const iconComboSets = [
  {
    label: '探索入口',
    meta: '搜索、生态、NPC、射弹',
    tone: 'green',
    roles: pickRoles(['search', 'biome', 'npc', 'projectile'], 'relic'),
  },
  {
    label: '战斗路线',
    meta: 'Boss、Buff、套装、物品',
    tone: 'gold',
    roles: pickRoles(['boss', 'buff', 'armor', 'items'], 'craft'),
  },
  {
    label: '资料操作',
    meta: '攻略、收藏、编辑、设置',
    tone: 'blue',
    roles: pickRoles(['article', 'favorites', 'edit', 'settings'], 'manual'),
  },
  {
    label: '制作链路',
    meta: '材料、制作、图鉴、通知',
    tone: 'paper',
    roles: [roleEntry('material', { sheet: 'craft', visualRole: 'material' }), roleEntry('material', { sheet: 'craft', label: '制作', visualRole: 'crafting' }), roleEntry('codex', { sheet: 'craft' }), roleEntry('notification', { sheet: 'craft' })],
  },
  {
    label: '图鉴筛选',
    meta: '分类、物品、搜索、收藏',
    tone: 'green',
    roles: pickRoles(['category', 'items', 'search', 'favorites'], 'relic'),
  },
  {
    label: '事件识别',
    meta: 'Boss、NPC、生态、通知',
    tone: 'gold',
    roles: pickRoles(['boss', 'npc', 'biome', 'notification'], 'craft'),
  },
  {
    label: '掉落关系',
    meta: '射弹、材料、Boss、制作',
    tone: 'blue',
    roles: [roleEntry('projectile', { sheet: 'craft' }), roleEntry('material', { sheet: 'craft', visualRole: 'material' }), roleEntry('boss', { sheet: 'craft' }), roleEntry('material', { sheet: 'craft', label: '制作', visualRole: 'crafting' })],
  },
  {
    label: '个人记录',
    meta: '用户、编辑、收藏、图鉴',
    tone: 'paper',
    roles: [roleEntry('npc', { sheet: 'manual', label: '用户', visualRole: 'user' }), roleEntry('edit', { sheet: 'manual' }), roleEntry('favorites', { sheet: 'manual' }), roleEntry('codex', { sheet: 'manual' })],
  },
]

const heroIconDirections = [
  {
    id: 'pixel-gallery-icons',
    label: 'A',
    name: '林地 SVG 资料入口',
    target: 'Pixel Gallery',
    roles: pickRoles(['search', 'items', 'category', 'biome', 'npc', 'projectile', 'favorites', 'codex'], 'relic'),
    summary: '用线性 SVG 做大面积轮廓差异，分类、射弹、NPC、生态入口能一眼分辨。',
    notes: ['抽象 SVG 符号', '轮廓清楚', '不替代物品图'],
  },
  {
    id: 'craft-tree-icons',
    label: 'B',
    name: '工匠 SVG 路线',
    target: 'Craft Tree',
    roles: [roleEntry('material', { sheet: 'craft', visualRole: 'material' }), roleEntry('boss', { sheet: 'craft' }), roleEntry('buff', { sheet: 'craft' }), roleEntry('armor', { sheet: 'craft' }), roleEntry('material', { sheet: 'craft', label: '制作', visualRole: 'crafting' }), roleEntry('projectile', { sheet: 'craft' }), roleEntry('items', { sheet: 'craft' }), roleEntry('notification', { sheet: 'craft' })],
    summary: '把合成、材料、事件、结果做成更明确的路线 SVG 符号，不再依赖低辨识度小图块。',
    notes: ['路线符号', '清晰轮廓', '不伪装掉落图'],
  },
  {
    id: 'manual-icons',
    label: 'C',
    name: '手册 SVG 章节',
    target: 'In-game Manual',
    roles: [roleEntry('items', { sheet: 'manual' }), roleEntry('category', { sheet: 'manual' }), roleEntry('material', { sheet: 'manual', visualRole: 'material' }), roleEntry('boss', { sheet: 'manual' }), roleEntry('article', { sheet: 'manual' }), roleEntry('settings', { sheet: 'manual' }), roleEntry('codex', { sheet: 'manual' }), roleEntry('search', { sheet: 'manual' })],
    summary: '更像游戏手册里的章节索引符号，用于资料操作，识别优先于装饰。',
    notes: ['章节符号', 'SVG 线稿', '不做实体插图'],
  },
]

const itemLayoutOptions = [
  {
    id: 'pixel-gallery',
    className: 'layout-pixel-gallery',
    label: 'A',
    name: 'Pixel Gallery',
    cnName: 'SVG 图鉴墙',
    summary: 'SVG 图标承担分类和入口差异，具体物品墙保留真实资源占位。',
  },
  {
    id: 'craft-tree',
    className: 'layout-craft-tree',
    label: 'B',
    name: 'Craft Tree',
    cnName: '合成树工作台',
    summary: '把 SVG 轮廓符号放到路线层级上，具体材料、事件、成品节点只展示结构和文字。',
  },
  {
    id: 'in-game-manual',
    className: 'layout-in-game-manual',
    label: 'C',
    name: 'In-game Manual',
    cnName: '游戏内百科',
    summary: 'SVG 图标只放在手册章节索引，泰拉刃正文区域不使用插图替代真实物品图。',
  },
]

const homeHeroDensityMetrics = [
  { value: '6,159', label: '物品条目', note: '公开图鉴' },
  { value: '106', label: '分类索引', note: '类型和阶段' },
  { value: '14,746', label: '合成链路', note: '材料关系' },
  { value: '762', label: 'NPC 条目', note: '城镇和敌怪' },
]

const homeHeroHifiOptions = [
  {
    label: 'A',
    title: '世界封面首页',
    meta: '首页 A · 世界封面入口',
    className: 'home-hifi-live-command',
    roles: pickRoles(['search', 'items', 'material', 'boss', 'npc', 'category', 'article', 'favorites'], 'hifi'),
    summary: '用一张世界封面承接搜索、地图、资料入口和近期内容，保留密度，但更像玩家打开资料站看到的首屏。',
  },
  {
    label: 'B',
    title: '图鉴书廊首页',
    meta: '首页 B · 资料书廊入口',
    className: 'home-hifi-live-category-wall',
    roles: pickRoles(['items', 'material', 'armor', 'boss', 'npc', 'biome', 'buff', 'article', 'category', 'codex'], 'hifi'),
    summary: '把分类墙改成可逛的图鉴书廊，让高密度条目像公共百科资料馆，而不是后台模块集合。',
  },
  {
    label: 'C',
    title: '冒险手册首页',
    meta: '首页 C · 玩家路线手册',
    className: 'home-hifi-live-route-explorer',
    roles: [roleEntry('search', { sheet: 'hifi' }), roleEntry('items', { sheet: 'hifi' }), roleEntry('material', { sheet: 'hifi', visualRole: 'crafting' }), roleEntry('boss', { sheet: 'hifi' }), roleEntry('buff', { sheet: 'hifi' }), roleEntry('favorites', { sheet: 'hifi' })],
    summary: '把路线做成冒险手册和地图页，信息仍然密集，但从任务面板改成玩家可直接阅读的路线导览。',
  },
]

const homeHeroRecentUpdates = [
  { type: '物品', title: '泰拉刃', meta: '合成链路更新', href: '/items/757' },
  { type: '路线', title: '近战后期推进', meta: '机械 Boss 后', href: '/articles/melee-progression' },
  { type: '分类', title: '材料索引', meta: '材料 1,913 条', href: '/categories' },
  { type: '攻略', title: '困难模式准备', meta: '阶段入口', href: '/articles?stage=hardmode' },
]

const homeHeroSpotlightItems = [
  { label: '泰拉刃', meta: '当前焦点', role: roleEntry('items', { sheet: 'relic' }) },
  { label: '真永夜刃', meta: '合成材料', role: roleEntry('material', { sheet: 'craft', visualRole: 'material' }) },
  { label: '英雄断剑', meta: '日食来源', role: roleEntry('boss', { sheet: 'craft' }) },
]

const homeHeroDensityEntries = [
  roleEntry('items', { sheet: 'relic', label: '物品', meta: '装备 / 材料 / 掉落', weight: '6,159', tone: 'gold', tags: ['武器', '工具', '饰品'] }),
  roleEntry('boss', { sheet: 'craft', label: 'Boss', meta: '阶段 / 战利品', weight: '路线化', tone: 'ember', tags: ['召唤', '掉落', '前置'] }),
  roleEntry('npc', { sheet: 'relic', label: 'NPC', meta: '城镇 / 敌怪', weight: '762', tone: 'sage', tags: ['入住', '敌怪', '事件'] }),
  roleEntry('article', { sheet: 'manual', label: '攻略', meta: '路线 / 事件', weight: '精选', tone: 'paper', tags: ['阶段', '配装', '专题'] }),
  roleEntry('category', { sheet: 'relic', label: '分类', meta: '类型索引', weight: '106', tone: 'lime', tags: ['战斗', '家具', '消耗'] }),
  roleEntry('material', { sheet: 'craft', label: '制作', meta: '合成路线', weight: '14,746', visualRole: 'crafting', tone: 'moss', tags: ['材料', '工作站', '链路'] }),
  roleEntry('biome', { sheet: 'relic', label: '生态', meta: '群落资源', weight: '地图', tone: 'aqua', tags: ['地表', '地下', '事件'] }),
  roleEntry('buff', { sheet: 'craft', label: 'Buff', meta: '状态效果', weight: '战前', tone: 'blue', tags: ['药水', '增益', '免疫'] }),
]

const homeHeroCommandSignals = [
  { label: '当前焦点', value: '泰拉刃', meta: '物品页 / 合成 / 路线' },
  { label: '推荐路径', value: '近战后期', meta: '困难模式后半段' },
  { label: '高频入口', value: '材料索引', meta: '1,913 条材料' },
  { label: '更新提示', value: '链路校对', meta: '机械 Boss 后' },
]

const homeHeroCommandRunes = [
  roleEntry('search', { sheet: 'relic', label: '速查' }),
  roleEntry('material', { sheet: 'craft', label: '材料', visualRole: 'material' }),
  roleEntry('boss', { sheet: 'craft', label: '事件' }),
  roleEntry('favorites', { sheet: 'manual', label: '收藏' }),
]

const homeHeroWorldTiles = [
  { label: '地表', meta: '初始探索 / NPC', role: roleEntry('biome', { sheet: 'relic' }) },
  { label: '洞穴', meta: '矿物 / 宝箱', role: roleEntry('material', { sheet: 'craft', visualRole: 'material' }) },
  { label: '猩红', meta: 'Boss / 掉落', role: roleEntry('boss', { sheet: 'craft' }) },
  { label: '神圣', meta: '困难模式', role: roleEntry('buff', { sheet: 'craft' }) },
  { label: '天空', meta: '岛屿 / 饰品', role: roleEntry('items', { sheet: 'relic' }) },
  { label: '地狱', meta: '熔岩 / 前置', role: roleEntry('article', { sheet: 'manual' }) },
]

const homeHeroReaderLinks = [
  { label: '泰拉刃路线', meta: '从材料到成品', role: roleEntry('items', { sheet: 'relic' }) },
  { label: 'Boss 前准备', meta: '召唤物 / 药水 / 防具', role: roleEntry('boss', { sheet: 'craft' }) },
  { label: '材料速查', meta: '矿物 / 掉落 / 合成', role: roleEntry('material', { sheet: 'craft', visualRole: 'material' }) },
  { label: 'NPC 入住', meta: '城镇条件和喜好', role: roleEntry('npc', { sheet: 'relic' }) },
]

const homeHeroDensityStages = [
  { label: '开荒', meta: '基础装备 / 火把 / 工作台', active: true },
  { label: 'Boss 前', meta: '召唤物 / 药水 / 防具', active: false },
  { label: '困难模式', meta: '机械 Boss / 神圣锭', active: false },
  { label: '月后整理', meta: '最终武器 / 收藏补全', active: false },
]

const homeHeroRouteSteps = [
  { index: '01', title: '真永夜刃', meta: '材料主轴', tag: '材料', role: roleEntry('material', { sheet: 'craft', visualRole: 'material' }) },
  { index: '02', title: '真断钢剑', meta: '合成分支', tag: '制作', role: roleEntry('material', { sheet: 'craft', visualRole: 'crafting' }) },
  { index: '03', title: '英雄断剑', meta: '日食事件', tag: '事件', role: roleEntry('boss', { sheet: 'craft' }) },
  { index: '04', title: '泰拉刃', meta: '路线终点', tag: '条目', role: roleEntry('items', { sheet: 'relic' }) },
]

const homeHeroWallGroups = [
  { label: '战斗', value: '458', meta: '武器条目' },
  { label: '家具', value: '2,671', meta: '建筑装饰' },
  { label: '材料', value: '1,913', meta: '制作核心' },
  { label: '盔甲', value: '660', meta: '职业推进' },
  { label: '消耗', value: '308', meta: '药水弹药' },
  { label: '工具', value: '128', meta: '采集建造' },
]

const homeHeroAtlasShelves = [
  {
    label: '战斗资料架',
    meta: '武器、Boss、Buff、套装',
    roles: pickRoles(['items', 'boss', 'buff', 'armor'], 'craft'),
  },
  {
    label: '世界资料架',
    meta: '生态、NPC、事件、射弹',
    roles: pickRoles(['biome', 'npc', 'notification', 'projectile'], 'relic'),
  },
  {
    label: '制作资料架',
    meta: '材料、制作、分类、图鉴',
    roles: [
      roleEntry('material', { sheet: 'craft', visualRole: 'material' }),
      roleEntry('material', { sheet: 'craft', label: '制作', visualRole: 'crafting' }),
      roleEntry('category', { sheet: 'relic' }),
      roleEntry('codex', { sheet: 'manual' }),
    ],
  },
]

const homeHeroAtlasDrawers = [
  { label: '武器库', value: '458', meta: '近战 / 远程 / 魔法' },
  { label: '材料柜', value: '1,913', meta: '矿物 / 掉落 / 合成' },
  { label: '城镇档案', value: '762', meta: 'NPC / 敌怪 / 事件' },
  { label: '路线夹', value: '精选', meta: '阶段 / Boss / 配装' },
]

const homeHeroRouteLayers = [
  { label: '地表探索', meta: '基础装备 / NPC' },
  { label: '地下材料', meta: '矿物 / 工作站' },
  { label: '事件节点', meta: 'Boss / 日食' },
]

const homeHeroRouteBrief = [
  { label: '当前路线', value: '近战后期' },
  { label: '关键节点', value: '4 步' },
  { label: '关联资料', value: '18 条' },
  { label: '建议入口', value: '泰拉刃' },
]

const homeHeroRouteChecklist = [
  { label: '材料齐套', meta: '永夜刃 / 断钢剑' },
  { label: '事件确认', meta: '日食掉落英雄断剑' },
  { label: '工作站', meta: '秘银砧或山铜砧' },
  { label: '下一页', meta: '进入泰拉刃条目' },
]

const homeHeroRouteLoadout = [
  roleEntry('items', { sheet: 'relic', label: '武器' }),
  roleEntry('armor', { sheet: 'craft', label: '护甲' }),
  roleEntry('buff', { sheet: 'craft', label: '药水' }),
  roleEntry('favorites', { sheet: 'manual', label: '记录' }),
]

const heroDensityOptions = [
  {
    id: 'density-command-center',
    label: 'A',
    name: '指挥台首页',
    intent: '圆形指挥盘 + 大搜索 + 紧凑索引，把入口围绕中心物品组织，解决 A 版低利用率。',
    fit: '适合默认方案，视觉锚点最强，仍然保留当前首页的美术气质。',
  },
  {
    id: 'density-atlas-wall',
    label: 'B',
    name: '资料墙首页',
    intent: '图鉴墙 + 书脊索引，把 Wiki 的资料密度做成可记住的书架形态。',
    fit: '适合强调资料库属性，信息密度最高，辨识度来自成排的图鉴墙。',
  },
  {
    id: 'density-route-console',
    label: 'C',
    name: '路线控制台首页',
    intent: '路线地图 + 装备负载，把阶段推进做成一张可走的地图。',
    fit: '适合攻略导向首页，路径感最强，但落地时需要真实路线数据支撑。',
  },
]
</script>

<template>
  <section class="screen home-options-screen active">
    <svg
      class="svg-icon-defs"
      :data-symbol-count="homeRoleSvgSymbols.length"
      aria-hidden="true"
      focusable="false"
    >
      <symbol id="home-role-search" viewBox="0 0 24 24">
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="m15 15 4.5 4.5" />
      </symbol>
      <symbol id="home-role-item" viewBox="0 0 24 24">
        <path d="m5 19 11.5-11.5" />
        <path d="m14 5 5 5" />
        <path d="m4 20 4-1 11-11-3-3L5 16z" />
      </symbol>
      <symbol id="home-role-category" viewBox="0 0 24 24">
        <path d="M5 6h5v5H5zM14 6h5v5h-5zM5 15h5v3H5zM14 15h5v3h-5z" />
      </symbol>
      <symbol id="home-role-biome" viewBox="0 0 24 24">
        <path d="M4 18h16" />
        <path d="m5 17 4-7 3 5 2-3 5 6" />
        <path d="M15 8h3M16.5 6.5v3" />
      </symbol>
      <symbol id="home-role-boss" viewBox="0 0 24 24">
        <path d="M6 9 4 5l4 2 4-3 4 3 4-2-2 4" />
        <path d="M6 10h12v7l-3 3H9l-3-3z" />
        <path d="M9 14h.1M15 14h.1M10 18h4" />
      </symbol>
      <symbol id="home-role-buff" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
      </symbol>
      <symbol id="home-role-armor" viewBox="0 0 24 24">
        <path d="M12 3 5 6v5c0 4.5 2.6 7.8 7 10 4.4-2.2 7-5.5 7-10V6z" />
        <path d="M12 7v10M8.5 10h7" />
      </symbol>
      <symbol id="home-role-projectile" viewBox="0 0 24 24">
        <path d="M4 12h12" />
        <path d="m13 6 7 6-7 6" />
        <path d="M5 8h3M5 16h5" />
      </symbol>
      <symbol id="home-role-npc" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c1.2-4 3.6-6 7-6s5.8 2 7 6" />
      </symbol>
      <symbol id="home-role-user" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M6 19c1.1-3.2 3.1-4.8 6-4.8s4.9 1.6 6 4.8" />
        <path d="M18 7h3M19.5 5.5v3" />
      </symbol>
      <symbol id="home-role-article" viewBox="0 0 24 24">
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v5h4M9.5 12h5M9.5 15.5h5M9.5 19h3" />
      </symbol>
      <symbol id="home-role-material" viewBox="0 0 24 24">
        <path d="M12 3 4 8l8 13 8-13z" />
        <path d="M4 8h16M9 8l3 13 3-13" />
      </symbol>
      <symbol id="home-role-crafting" viewBox="0 0 24 24">
        <path d="m5 19 6-6" />
        <path d="m13 5 6 6" />
        <path d="m14 4 6 6-2 2-6-6z" />
        <path d="M7 17h10" />
      </symbol>
      <symbol id="home-role-edit" viewBox="0 0 24 24">
        <path d="M5 19h4l10-10-4-4L5 15z" />
        <path d="m13.5 6.5 4 4M4 21h16" />
      </symbol>
      <symbol id="home-role-favorite" viewBox="0 0 24 24">
        <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" />
      </symbol>
      <symbol id="home-role-settings" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M19.8 7.5 17.2 9M6.8 15l-2.6 1.5" />
      </symbol>
      <symbol id="home-role-codex" viewBox="0 0 24 24">
        <path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4z" />
        <path d="M5 4v12M9 8h5M9 11h6" />
      </symbol>
      <symbol id="home-role-notice" viewBox="0 0 24 24">
        <path d="M7 17h10l-1.2-2.2V10a3.8 3.8 0 0 0-7.6 0v4.8z" />
        <path d="M10 19a2 2 0 0 0 4 0M12 3v2" />
      </symbol>
    </svg>
    <TerraNav />
    <TerraBreadcrumb />

    <header class="home-options-head">
      <span class="eyebrow">HOME HERO DENSITY LAB</span>
      <h1>首页高密度 Hero 三种方向</h1>
      <p>三版都保留 TerraPedia 现有的暗绿、金色、清晰 SVG 符号和资料感，只改变首屏的信息组织方式，方便比较“更密”但不牺牲美观的路线。</p>
    </header>

    <section class="home-hifi-gallery" aria-label="首页高保真三套方案">
      <article
        v-for="option in homeHeroHifiOptions"
        :key="option.label"
        class="home-hifi-card"
      >
        <header>
          <span>{{ option.label }}</span>
          <div>
            <b>{{ option.title }}</b>
            <em>{{ option.meta }}</em>
          </div>
          <p>{{ option.summary }}</p>
        </header>
        <div
          class="home-hifi-frame home-hifi-live-stage"
          :class="option.className"
          role="img"
          :aria-label="`${option.label} 版首页高保真 SVG 预览：${option.title}`"
        >
          <div class="home-hifi-topbar">
            <div>
              <b>TerraPedia</b>
              <em>中文资料库</em>
            </div>
            <nav aria-hidden="true">
              <span>首页</span>
              <span>物品</span>
              <span>NPC</span>
              <span>Boss</span>
              <span>文章</span>
            </nav>
          </div>

          <section v-if="option.label === 'A'" class="hifi-home-command-shell hifi-public-world-layout hifi-public-cover-layout">
            <div class="hifi-command-hero hifi-public-world-hero hifi-world-cover">
              <div class="hifi-world-cover-copy">
                <span class="density-kicker">PUBLIC WORLD</span>
                <h2>从泰拉刃进入整个世界</h2>
                <p>首屏先给玩家一个可记住的世界封面：搜索在最前，地图承担视觉识别，分类和更新嵌在下方入口里。</p>
                <div class="hifi-search-shell">
                  <RoleSvgIcon :role="roleEntry('search')" class="home-hifi-svg-focus" />
                  <b>泰拉刃、Boss 前准备、NPC 入住、材料来源...</b>
                  <span>搜索</span>
                </div>
              </div>

              <div class="hifi-world-map-panel hifi-world-cover-map">
                <div class="hifi-world-map-core">
                  <RoleSvgIcon :role="roleEntry('items')" class="home-hifi-svg-focus" />
                  <b>泰拉刃</b>
                  <em>当前探索目标</em>
                </div>
                <article
                  v-for="(tile, tileIndex) in homeHeroWorldTiles"
                  :key="`hifi-world-${tile.label}`"
                  class="hifi-world-map-tile"
                  :style="`--world-tile-index:${tileIndex}`"
                >
                  <RoleSvgIcon :role="tile.role" class="hifi-mini-token" />
                  <span>
                    <b>{{ tile.label }}</b>
                    <em>{{ tile.meta }}</em>
                  </span>
                </article>
              </div>

              <nav class="hifi-world-category-list hifi-world-cover-rail" aria-label="A 版首页分类入口">
                <a
                  v-for="entry in homeHeroDensityEntries.slice(0, 6)"
                  :key="`hifi-world-entry-${entry.key}-${entry.visualRole}`"
                >
                  <RoleSvgIcon :role="entry" class="hifi-mini-token" />
                  <span>
                    <b>{{ entry.label }}</b>
                    <em>{{ entry.meta }}</em>
                  </span>
                  <strong>{{ entry.weight }}</strong>
                </a>
              </nav>
            </div>

            <aside class="hifi-command-side hifi-public-world-side hifi-world-reading-side">
              <div class="hifi-command-focusline">
                <RoleSvgIcon :role="roleEntry('items')" class="hifi-card-token" />
                <span>
                  <b>今日入口：泰拉刃</b>
                  <em>合成路线、材料来源、阶段推进同屏串联</em>
                </span>
              </div>
              <div class="hifi-reader-link-list">
                <article
                  v-for="link in homeHeroReaderLinks"
                  :key="`hifi-reader-${link.label}`"
                >
                  <RoleSvgIcon :role="link.role" class="hifi-mini-token" />
                  <span>
                    <b>{{ link.label }}</b>
                    <em>{{ link.meta }}</em>
                  </span>
                </article>
              </div>
              <div class="hifi-world-update-ribbon">
                <a
                  v-for="update in homeHeroRecentUpdates"
                  :key="`hifi-world-update-${update.title}`"
                  :href="update.href"
                >
                  <span>{{ update.type }}</span>
                  <b>{{ update.title }}</b>
                </a>
              </div>
            </aside>
          </section>

          <section v-else-if="option.label === 'B'" class="hifi-category-wall-layout hifi-codex-wall-layout hifi-codex-home-layout">
            <div class="hifi-category-head hifi-codex-lead hifi-codex-cover">
              <span class="density-kicker">CODEX GALLERY</span>
              <h2>像逛资料书廊一样进入百科</h2>
              <p>这一版把“分类墙”包装成公开资料馆：首页先展示书廊气质，再用书脊、书签和热点条目承载密集入口。</p>
              <div class="hifi-search-shell">
                <RoleSvgIcon :role="roleEntry('codex')" class="home-hifi-svg-focus" />
                <b>物品、材料、Boss、NPC、生态、Buff、路线专题...</b>
                <span>翻阅</span>
              </div>
            </div>

            <nav class="hifi-category-tile-grid hifi-codex-shelf-grid hifi-codex-library-wall" aria-label="B 版图鉴分类墙入口">
              <article
                v-for="(entry, entryIndex) in homeHeroDensityEntries"
                :key="`hifi-b-tile-${entry.key}-${entry.visualRole}`"
                :class="`tone-${entry.tone}`"
                :style="`--codex-index:${entryIndex}`"
              >
                <RoleSvgIcon :role="entry" class="hifi-card-token" />
                <span>
                  <b>{{ entry.label }}</b>
                  <em>{{ entry.meta }}</em>
                </span>
                <strong>{{ entry.weight }}</strong>
                <small class="hifi-entry-tags">
                  <i
                    v-for="tag in entry.tags"
                    :key="`hifi-b-${entry.key}-${tag}`"
                  >
                    {{ tag }}
                  </i>
                </small>
              </article>
            </nav>

            <aside class="hifi-category-side hifi-codex-side hifi-codex-reading-side">
              <div class="hifi-category-spotlight">
                <RoleSvgIcon :role="roleEntry('items')" class="home-hifi-svg-focus" />
                <span>
                  <b>焦点条目：泰拉刃</b>
                  <em>从书廊进入条目、合成、掉落和路线专题</em>
                </span>
              </div>
              <div class="hifi-category-feature-strip">
                <article
                  v-for="shelf in homeHeroAtlasShelves"
                  :key="`hifi-b-feature-${shelf.label}`"
                >
                  <span>
                    <RoleSvgIcon
                      v-for="role in shelf.roles.slice(0, 3)"
                      :key="`hifi-b-feature-${shelf.label}-${role.key}-${role.visualRole}`"
                      :role="role"
                      class="hifi-mini-token"
                    />
                  </span>
                  <b>{{ shelf.label }}</b>
                  <em>{{ shelf.meta }}</em>
                </article>
              </div>
              <div class="hifi-category-hot-grid">
                <span
                  v-for="group in homeHeroWallGroups"
                  :key="`hifi-b-group-${group.label}`"
                >
                  <b>{{ group.label }}</b>
                  <strong>{{ group.value }}</strong>
                  <em>{{ group.meta }}</em>
                </span>
              </div>
              <section class="hifi-drawer-stack" aria-label="B 版分类抽屉">
                <span
                  v-for="drawer in homeHeroAtlasDrawers"
                  :key="`hifi-b-drawer-${drawer.label}`"
                >
                  <b>{{ drawer.label }}</b>
                  <strong>{{ drawer.value }}</strong>
                  <em>{{ drawer.meta }}</em>
                </span>
              </section>
            </aside>
          </section>

          <section v-else class="hifi-route-explorer-layout hifi-adventure-route-layout hifi-adventure-home-layout">
            <div class="hifi-route-intro hifi-adventure-lead hifi-adventure-cover">
              <span class="density-kicker">ADVENTURE MANUAL</span>
              <h2>把攻略路线做成玩家手册</h2>
              <p>这一版适合把首页做成“现在该做什么”的公开导览：阶段、路线、材料和下一页建议都在，但不再像筛选面板。</p>
              <div class="hifi-route-stage-strip">
                <span
                  v-for="stage in homeHeroDensityStages"
                  :key="`hifi-c-${stage.label}`"
                  :class="{ active: stage.active }"
                >
                  <b>{{ stage.label }}</b>
                  <em>{{ stage.meta }}</em>
                </span>
              </div>
            </div>

            <div class="hifi-route-map-panel hifi-adventure-map-panel hifi-adventure-map-scroll">
              <div class="hifi-route-map-layers hifi-adventure-chapter-strip" aria-label="C 版路线地图层级">
                <span
                  v-for="layer in homeHeroRouteLayers"
                  :key="`hifi-c-layer-${layer.label}`"
                >
                  <b>{{ layer.label }}</b>
                  <em>{{ layer.meta }}</em>
                </span>
              </div>
              <div class="hifi-route-ladder">
                <article
                  v-for="(step, stepIndex) in homeHeroRouteSteps"
                  :key="`hifi-c-${step.title}`"
                  :style="`--route-step-index:${stepIndex}`"
                >
                  <span>{{ step.index }}</span>
                  <RoleSvgIcon :role="step.role" class="hifi-card-token" />
                  <b>{{ step.title }}</b>
                  <small>{{ step.tag }}</small>
                  <em>{{ step.meta }}</em>
                </article>
              </div>
            </div>

            <aside class="hifi-route-suggestion-grid hifi-adventure-guide hifi-adventure-journal">
              <RoleSvgIcon :role="roleEntry('items')" class="home-hifi-svg-focus" />
              <b>手册下一页</b>
              <em>进入泰拉刃条目，查看合成材料、事件掉落和后续路线。</em>
              <div class="hifi-route-brief-grid">
                <span
                  v-for="brief in homeHeroRouteBrief"
                  :key="`hifi-c-brief-${brief.label}`"
                >
                  <em>{{ brief.label }}</em>
                  <b>{{ brief.value }}</b>
                </span>
              </div>
              <section class="hifi-checklist" aria-label="C 版路线检查清单">
                <span
                  v-for="item in homeHeroRouteChecklist"
                  :key="`hifi-c-check-${item.label}`"
                >
                  <b>{{ item.label }}</b>
                  <em>{{ item.meta }}</em>
                </span>
              </section>
              <div class="hifi-route-loadout-strip">
                <span
                  v-for="entry in homeHeroRouteLoadout"
                  :key="`hifi-c-loadout-${entry.label}`"
                >
                  <RoleSvgIcon :role="entry" class="hifi-mini-token" />
                  <b>{{ entry.label }}</b>
                </span>
              </div>
              <div class="hifi-route-actions">
                <span>详情</span>
                <span>合成</span>
                <span>收藏</span>
              </div>
            </aside>
          </section>
        </div>
      </article>
    </section>

    <header class="home-options-head compact home-options-archive-head" hidden>
      <span class="eyebrow">LIVE CSS PROTOTYPES</span>
      <h2>下方保留可落地结构原型</h2>
      <p>上面的三张图用于定方向；下面是之前放在页面里的可滚动结构实验，方便继续拆解具体区块。</p>
    </header>

    <section class="home-density-option-board home-options-archive-board" aria-label="首页高密度 hero 三套方案" hidden>
      <article
        v-for="option in heroDensityOptions"
        :key="option.id"
        class="home-density-option-card"
      >
        <header class="density-option-head">
          <span>{{ option.label }}</span>
          <div>
            <b>{{ option.name }}</b>
            <em>{{ option.intent }}</em>
          </div>
          <p>{{ option.fit }}</p>
        </header>

        <section
          v-if="option.id === 'density-command-center'"
          class="density-preview-stage density-command-center"
          aria-label="指挥台首页预览"
        >
          <div class="density-command-copy">
            <span class="density-kicker">公开图鉴 · 世界路线</span>
            <h2>从泰拉刃进入整个世界</h2>
            <p>中心是泰拉刃，周围是资料入口；搜索、阶段、更新和统计都围绕同一个视觉锚点排布。</p>
            <form class="density-search-shell" role="search">
              <span class="density-search-mark" aria-hidden="true"></span>
              <label class="visually-hidden" for="density-command-search">搜索资料</label>
              <input id="density-command-search" type="search" placeholder="物品、Boss、NPC、路线..." />
              <button type="button">检索</button>
            </form>
            <div class="density-command-dock">
              <span
                v-for="stage in homeHeroDensityStages"
                :key="`command-${stage.label}`"
                :class="{ active: stage.active }"
              >
                <b>{{ stage.label }}</b>
                <em>{{ stage.meta }}</em>
              </span>
            </div>
            <div class="density-command-signal-grid">
              <span
                v-for="signal in homeHeroCommandSignals"
                :key="`signal-${signal.label}`"
              >
                <em>{{ signal.label }}</em>
                <b>{{ signal.value }}</b>
                <small>{{ signal.meta }}</small>
              </span>
            </div>
          </div>

          <nav class="density-entry-matrix density-command-radial" aria-label="圆形指挥盘">
            <div class="density-command-sigil" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div class="density-command-core">
              <span class="density-core-ring" aria-hidden="true"></span>
              <RoleSvgIcon :role="roleEntry('items')" class="density-core-token" />
              <b>泰拉刃</b>
              <em>当前焦点</em>
            </div>
            <a
              v-for="(entry, entryIndex) in homeHeroDensityEntries"
              :key="`command-${entry.label}`"
              href="/home-hero-options"
              class="density-command-orbit"
              :style="`--orbit-index:${entryIndex}`"
            >
              <RoleSvgIcon :role="entry" class="density-entry-token" />
              <span>
                <b>{{ entry.label }}</b>
                <em>{{ entry.weight }}</em>
              </span>
            </a>
            <div class="density-command-rune-rail" aria-label="指挥盘快速符文">
              <span
                v-for="rune in homeHeroCommandRunes"
                :key="`rune-${rune.label}`"
              >
                <RoleSvgIcon :role="rune" class="density-atlas-token" />
                <b>{{ rune.label }}</b>
              </span>
            </div>
          </nav>

          <aside class="density-side-index">
            <div class="density-index-title">
              <span>TERRAPEDIA INDEX</span>
              <b>公共资料索引</b>
            </div>
            <div class="density-metric-grid">
              <span
                v-for="metric in homeHeroDensityMetrics"
                :key="`command-${metric.label}`"
              >
                <b>{{ metric.value }}</b>
                <em>{{ metric.label }}</em>
              </span>
            </div>
            <div class="density-update-list">
              <a
                v-for="update in homeHeroRecentUpdates"
                :key="`command-${update.title}`"
                :href="update.href"
              >
                <span>{{ update.type }}</span>
                <b>{{ update.title }}</b>
                <em>{{ update.meta }}</em>
              </a>
            </div>
          </aside>
        </section>

        <section
          v-else-if="option.id === 'density-atlas-wall'"
          class="density-preview-stage density-atlas-wall"
          aria-label="资料墙首页预览"
        >
          <div class="density-wall-lead">
            <div class="density-atlas-cabinet">
              <div>
                <span class="density-kicker">TERRAPEDIA ATLAS</span>
                <h2>图鉴墙</h2>
                <p>把首页做成一面有层级的资料墙：左侧是书脊索引，中间是分类架，右侧是当前焦点。</p>
              </div>
              <div class="density-atlas-catalog">
                <article
                  v-for="shelf in homeHeroAtlasShelves"
                  :key="shelf.label"
                >
                  <div>
                    <b>{{ shelf.label }}</b>
                    <em>{{ shelf.meta }}</em>
                  </div>
                  <span>
                    <RoleSvgIcon
                      v-for="role in shelf.roles"
                      :key="`${shelf.label}-${role.key}-${role.visualRole}`"
                      :role="role"
                      class="density-atlas-token"
                    />
                  </span>
                </article>
              </div>
            </div>
            <div class="density-atlas-drawer-stack">
              <span
                v-for="drawer in homeHeroAtlasDrawers"
                :key="`cabinet-${drawer.label}`"
              >
                <b>{{ drawer.label }}</b>
                <strong>{{ drawer.value }}</strong>
                <em>{{ drawer.meta }}</em>
              </span>
            </div>
            <div class="density-atlas-mini-grid" aria-label="图鉴墙密集索引">
              <span
                v-for="entry in homeHeroDensityEntries"
                :key="`mini-atlas-${entry.label}`"
              >
                <RoleSvgIcon :role="entry" class="density-atlas-token" />
                <b>{{ entry.label }}</b>
              </span>
            </div>
          </div>

          <aside class="density-atlas-spine" aria-label="图鉴书脊索引">
            <span
              v-for="metric in homeHeroDensityMetrics"
              :key="`spine-${metric.label}`"
            >
              <b>{{ metric.value }}</b>
              <em>{{ metric.label }}</em>
            </span>
          </aside>

          <div class="density-wall-metrics density-atlas-feature">
            <article
              v-for="item in homeHeroSpotlightItems"
              :key="`feature-${item.label}`"
            >
              <RoleSvgIcon :role="item.role" class="density-entry-token" />
              <b>{{ item.label }}</b>
              <em>{{ item.meta }}</em>
            </article>
          </div>

          <nav class="density-wall-groups density-atlas-shelves" aria-label="资料墙分类入口">
            <a
              v-for="group in homeHeroWallGroups"
              :key="group.label"
              href="/home-hero-options"
            >
              <b>{{ group.label }}</b>
              <strong>{{ group.value }}</strong>
              <em>{{ group.meta }}</em>
            </a>
          </nav>

          <div class="density-atlas-drawer" aria-label="图鉴抽屉索引">
            <span
              v-for="entry in homeHeroDensityEntries"
              :key="`drawer-${entry.label}`"
            >
              <RoleSvgIcon :role="entry" class="density-atlas-token" />
              <b>{{ entry.label }}</b>
              <em>{{ entry.weight }}</em>
            </span>
          </div>

          <div class="density-wall-bottom">
            <form class="density-search-shell compact" role="search">
              <label class="visually-hidden" for="density-wall-search">搜索资料</label>
              <input id="density-wall-search" type="search" placeholder="输入关键词快速进入资料..." />
              <button type="button">搜索</button>
            </form>
            <div class="density-update-list">
              <a
                v-for="update in homeHeroRecentUpdates"
                :key="`wall-${update.title}`"
                :href="update.href"
              >
                <span>{{ update.type }}</span>
                <b>{{ update.title }}</b>
                <em>{{ update.meta }}</em>
              </a>
            </div>
          </div>
        </section>

        <section
          v-else
          class="density-preview-stage density-route-console"
          aria-label="路线控制台首页预览"
        >
          <div class="density-route-copy">
            <span class="density-kicker">PROGRESSION ROUTE</span>
            <h2>按当前进度进入资料</h2>
            <p>路线地图把阶段、节点、装备负载和搜索放到同一张图里，适合攻略导向首页。</p>
            <div class="density-route-tabs">
              <button
                v-for="stage in homeHeroDensityStages"
                :key="`route-tab-${stage.label}`"
                type="button"
                :class="{ active: stage.active }"
              >
                {{ stage.label }}
              </button>
            </div>
            <div class="density-route-brief">
              <span
                v-for="brief in homeHeroRouteBrief"
                :key="`route-brief-${brief.label}`"
              >
                <em>{{ brief.label }}</em>
                <b>{{ brief.value }}</b>
              </span>
            </div>
          </div>

          <div class="density-route-world density-route-map">
            <div class="density-route-compass" aria-hidden="true">
              <span>N</span>
              <span>E</span>
              <span>S</span>
              <span>W</span>
            </div>
            <span
              v-for="layer in homeHeroRouteLayers"
              :key="layer.label"
              class="density-route-layer"
            >
              <b>{{ layer.label }}</b>
              <em>{{ layer.meta }}</em>
            </span>
            <div class="density-route-timeline">
              <article
              v-for="step in homeHeroRouteSteps"
              :key="step.index"
              class="density-route-stage-card"
            >
              <span>{{ step.index }}</span>
                <i>
                  <RoleSvgIcon :role="step.role" class="density-route-token" />
                </i>
                <b>{{ step.title }}</b>
                <em>{{ step.meta }}</em>
              </article>
            </div>
          </div>

          <aside class="density-route-panel density-route-loadout">
            <b>下一步建议</b>
            <p>先核对材料，再进入合成链路和 Boss 前置。</p>
            <div class="density-route-checklist">
              <span
                v-for="item in homeHeroRouteChecklist"
                :key="`route-check-${item.label}`"
              >
                <b>{{ item.label }}</b>
                <em>{{ item.meta }}</em>
              </span>
            </div>
            <div class="density-route-loadout-grid" aria-label="路线装备格">
              <span
                v-for="entry in homeHeroRouteLoadout"
                :key="`loadout-${entry.label}`"
              >
                <RoleSvgIcon :role="entry" class="density-atlas-token" />
                <b>{{ entry.label }}</b>
              </span>
            </div>
            <nav aria-label="路线辅助入口">
              <a
                v-for="entry in homeHeroDensityEntries.slice(0, 6)"
                :key="`route-entry-${entry.label}`"
                href="/home-hero-options"
              >
                {{ entry.label }}
              </a>
            </nav>
            <form class="density-search-shell compact" role="search">
              <label class="visually-hidden" for="density-route-search">搜索路线资料</label>
              <input id="density-route-search" type="search" placeholder="搜索路线节点..." />
              <button type="button">进入</button>
            </form>
          </aside>
        </section>
      </article>
    </section>

    <header class="home-options-head compact home-options-archive-head" hidden>
      <span class="eyebrow">ICON AND ITEM PAGE LAB</span>
      <h2>下方改用 SVG 图标与物品页实验</h2>
      <p>这些内容用于比较 SVG 符号、图鉴墙、合成树和手册页风格，不影响上面的首页 hero 三套方案。</p>
    </header>

    <section class="hero-icon-option-board home-options-archive-board" aria-label="三套 hero icon 方案" hidden>
      <article
        v-for="direction in heroIconDirections"
        :key="direction.id"
        class="hero-icon-option-card"
        :class="direction.id"
      >
        <div class="hero-svg-icon-preview" aria-hidden="true">
          <RoleSvgIcon
            v-for="role in direction.roles"
            :key="`${direction.id}-${role.key}-${role.visualRole}`"
            :role="role"
            class="hero-token"
          />
        </div>

        <div class="hero-icon-option-copy">
          <span>{{ direction.label }} / {{ direction.target }}</span>
          <h2>{{ direction.name }}</h2>
          <p>{{ direction.summary }}</p>
          <ul>
            <li
              v-for="note in direction.notes"
              :key="note"
            >
              {{ note }}
            </li>
          </ul>
        </div>
      </article>
    </section>

    <section class="hero-svg-library home-options-archive-board" aria-label="抽象 SVG 符号库" hidden>
      <RoleSvgIcon
        v-for="role in previewSvgIcons"
        :key="`library-${role.key}`"
        :role="role"
        class="library-token"
      />
    </section>

    <section class="icon-combo-board home-options-archive-board" aria-label="SVG 图标组合对比" hidden>
      <article
        v-for="combo in iconComboSets"
        :key="combo.label"
        class="icon-combo-card"
        :class="`tone-${combo.tone}`"
      >
        <div class="combo-role-strip">
          <RoleSvgIcon
            v-for="role in combo.roles"
            :key="`${combo.label}-${role.key}-${role.visualRole}`"
            :role="role"
            class="combo-token"
          />
        </div>
        <span>
          <b>{{ combo.label }}</b>
          <em>{{ combo.meta }}</em>
        </span>
      </article>
    </section>

    <section class="item-layout-board home-options-archive-board" aria-label="物品页三种新方向" hidden>
      <article
        v-for="option in itemLayoutOptions"
        :key="option.id"
        class="option-item-lab-card"
        :class="option.className"
      >
        <div class="option-lab-meta">
          <span>{{ option.label }}</span>
          <div>
            <b>{{ option.name }}</b>
            <em>{{ option.cnName }}</em>
          </div>
          <p>{{ option.summary }}</p>
        </div>

        <section
          v-if="option.id === 'pixel-gallery'"
          class="option-direction-stage pixel-gallery-stage"
          aria-label="SVG 图鉴墙方案"
        >
          <div class="pixel-gallery-toolbar">
            <div>
              <span>ITEM WALL</span>
              <h2>所有物品先出现</h2>
            </div>
            <nav aria-label="图鉴墙筛选">
              <button type="button" class="active">全部</button>
              <button type="button">武器</button>
              <button type="button">材料</button>
              <button type="button">药水</button>
            </nav>
          </div>

          <div class="pixel-abstract-route-strip" aria-label="抽象 SVG 入口图标示例">
            <button
              v-for="entry in abstractSvgEntries"
              :key="entry.label"
              type="button"
              class="pixel-abstract-route"
            >
              <RoleSvgIcon :role="entry" class="route-token abstract-route-icon" />
              <span>
                <b>{{ entry.label }}</b>
                <em>{{ entry.meta }}</em>
              </span>
            </button>
          </div>

          <div class="svg-category-mosaic" aria-label="SVG 分类矩阵">
            <span
              v-for="cell in svgCategoryMosaic"
              :key="cell.label"
              class="svg-mosaic-cell"
              :class="`is-${cell.weight}`"
            >
              <RoleSvgIcon :role="cell" class="mosaic-token" />
              <span>
                <b>{{ cell.label }}</b>
                <em>{{ cell.meta }}</em>
              </span>
            </span>
          </div>

          <div class="svg-icon-wall" aria-label="抽象 SVG 符号角色墙">
            <span
              v-for="role in svgIconWall"
              :key="`svg-wall-icon-${role.key}`"
              class="svg-icon-token wall-token"
              :class="`role-${role.visualRole}`"
              >
                <svg class="role-svg-icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <use :href="roleIconHref(role)" />
                </svg>
              <span>
                <b>{{ role.label }}</b>
                <em>{{ role.alias ? `同源 ${role.alias}` : role.meta }}</em>
              </span>
            </span>
          </div>

          <div class="svg-tile-wall" aria-label="SVG 分类密集墙">
            <span
              v-for="(tile, tileIndex) in svgTileWall"
              :key="`svg-tile-${tileIndex}-${tile.key}-${tile.visualRole}`"
              class="svg-tile-cell"
              :class="`tone-${tileIndex % 5}`"
            >
              <RoleSvgIcon :role="tile" class="svg-tile-token" />
            </span>
          </div>

          <aside class="floating-item-card">
            <span
              class="concrete-image-slot floating-item-slot"
              aria-hidden="true"
            >
              <span>真实图像</span>
            </span>
            <div>
              <span>当前焦点</span>
              <h3>泰拉刃</h3>
              <p>从图标墙进入详情，用户先看到物品密度，再看到当前选中项的核心信息。</p>
            </div>
            <nav aria-label="当前物品动作">
              <a href="/items/terra-blade">详情</a>
              <a href="/crafting">合成</a>
            </nav>
          </aside>
        </section>

        <section
          v-else-if="option.id === 'craft-tree'"
          class="option-direction-stage craft-tree-stage"
          aria-label="合成树工作台方案"
        >
          <div class="craft-tree-head">
            <span>CRAFT ROUTE</span>
            <h3>把泰拉刃拆成一条路线</h3>
            <p>列表不再抢首屏，材料节点、事件节点和结果节点构成主要路径。</p>
          </div>

          <div class="craft-abstract-rail" aria-label="抽象路线层级图标示例">
            <article
              v-for="stage in craftRouteStages"
              :key="stage.name"
              class="craft-abstract-stage"
            >
              <RoleSvgIcon :role="stage" class="craft-token abstract-craft-icon" />
              <span>
                <b>{{ stage.name }}</b>
                <em>{{ stage.meta }}</em>
              </span>
            </article>
          </div>

          <div class="craft-route-board" aria-label="路线辅助分组图标">
            <article
              v-for="entry in craftRouteBoard"
              :key="entry.label"
            >
              <RoleSvgIcon :role="entry" class="board-token" />
              <b>{{ entry.label }}</b>
              <em>{{ entry.meta }}</em>
            </article>
          </div>

          <div class="craft-combo-lane" aria-label="合成路线图标组合">
            <article
              v-for="combo in craftComboLane"
              :key="combo.label"
            >
              <div>
                <RoleSvgIcon
                  v-for="role in combo.roles"
                  :key="`${combo.label}-${role.key}-${role.visualRole}`"
                  :role="role"
                  class="combo-token"
                />
              </div>
              <b>{{ combo.label }}</b>
            </article>
          </div>

          <div class="craft-node-grid">
            <article
              v-for="(node, index) in craftNodes"
              :key="node.name"
              class="craft-node"
              :class="`lane-${node.lane}`"
            >
              <span class="craft-step-dot" aria-hidden="true">{{ index + 1 }}</span>
              <b>{{ node.name }}</b>
              <em>{{ node.meta }}</em>
            </article>
          </div>

          <aside class="craft-result-panel">
            <span
              class="concrete-image-slot craft-result-slot"
              aria-hidden="true"
            >
              <span>真实图像</span>
            </span>
            <h3>泰拉刃</h3>
            <p>右侧只承担结果解释和下一步入口，合成关系在中间一眼读完。</p>
            <div>
              <b>6</b><span>关键节点</span>
              <b>2</b><span>合成阶段</span>
            </div>
          </aside>
        </section>

        <section
          v-else
          class="option-direction-stage manual-book-stage"
          aria-label="游戏内百科方案"
        >
          <aside class="manual-index-rail">
            <span>INDEX</span>
            <button
              v-for="entry in manualIndex"
              :key="entry.label"
              type="button"
              :class="{ active: entry.label === '武器' }"
            >
              <RoleSvgIcon :role="entry" class="manual-nav-token abstract-manual-icon" />
              <span>{{ entry.label }}</span>
            </button>
          </aside>

          <main class="manual-page-panel">
            <div class="manual-page-head">
              <span class="manual-title-mark" aria-hidden="true">TB</span>
              <div>
                <small>TERRAPEDIA MANUAL</small>
                <h3>泰拉刃</h3>
                <p>一本可翻阅的游戏内百科页，信息像条目说明而不是后台面板。</p>
              </div>
            </div>

            <div class="manual-stat-ledger">
              <span
                v-for="row in manualRows"
                :key="row.label"
              >
                <b>{{ row.value }}</b>
                <em>{{ row.label }}</em>
              </span>
            </div>

            <div class="manual-chapter-grid" aria-label="手册章节 SVG 图标">
              <article
                v-for="chapter in manualChapterGrid"
                :key="chapter.label"
              >
                <RoleSvgIcon :role="chapter" class="chapter-token" />
                <b>{{ chapter.label }}</b>
                <em>{{ chapter.meta }}</em>
              </article>
            </div>

            <div class="manual-icon-shelf" aria-label="手册图标组合书架">
              <article
                v-for="shelf in manualIconShelf"
                :key="shelf.label"
              >
                <div>
                  <RoleSvgIcon
                    v-for="role in shelf.roles"
                    :key="`${shelf.label}-${role.key}-${role.visualRole}`"
                    :role="role"
                    class="combo-token"
                  />
                </div>
                <b>{{ shelf.label }}</b>
              </article>
            </div>

            <div class="manual-paragraphs">
              <p>用于困难模式后期的近战武器，发射绿色剑气。页面重点是读感和资料索引，而不是控件堆叠。</p>
              <p>适合希望 TerraPedia 更像游戏百科、少一点 SaaS 工具感的方向。</p>
            </div>
          </main>
        </section>
      </article>
    </section>

    <TerraFooter />
  </section>
</template>
