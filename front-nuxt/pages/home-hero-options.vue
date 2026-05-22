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

const playerHeroDirections = [
  {
    id: 'world-cover',
    label: 'A',
    name: 'World Cover',
    cnName: '世界封面',
    className: 'player-world-scene',
    mood: '日落、地图、当前目标',
    summary: '搜索、世界区域和热门资料围绕一张 Terraria 世界封面展开，首屏先像游戏入口，再承接资料浏览。',
  },
  {
    id: 'codex-gallery',
    label: 'B',
    name: 'Codex Gallery',
    cnName: '图鉴长廊',
    className: 'player-codex-gallery',
    mood: '书架、展签、专题卷',
    summary: '用书架、书签和横向陈列组织分类，让玩家像逛百科馆一样进入资料。',
  },
  {
    id: 'adventure-manual',
    label: 'C',
    name: 'Adventure Manual',
    cnName: '冒险手册',
    className: 'player-adventure-manual',
    mood: '章节、路线、下一页',
    summary: '阶段、路线和下一页建议以手册章节展开，适合攻略导向首页，同时保留公共站的阅读感。',
  },
]

const playerHeroStats = [
  { value: '6,159', label: '物品', note: '装备、材料、掉落' },
  { value: '106', label: '分类', note: '类型、阶段、用途' },
  { value: '14,746', label: '合成', note: '材料和工作站' },
  { value: '762', label: 'NPC', note: '入住、敌怪、事件' },
]

const playerCatalogEntries = [
  roleEntry('items', { sheet: 'relic', label: '物品', meta: '装备 / 材料 / 掉落', weight: '6,159', tone: 'gold', tags: ['武器', '饰品', '工具'] }),
  roleEntry('boss', { sheet: 'craft', label: 'Boss', meta: '召唤 / 阶段 / 战利品', weight: '路线', tone: 'ember', tags: ['召唤', '掉落', '前置'] }),
  roleEntry('npc', { sheet: 'relic', label: 'NPC', meta: '城镇 / 敌怪 / 事件', weight: '762', tone: 'sage', tags: ['入住', '喜好', '事件'] }),
  roleEntry('material', { sheet: 'craft', label: '制作', meta: '材料 / 配方 / 工作站', weight: '14,746', visualRole: 'crafting', tone: 'moss', tags: ['材料', '配方', '链路'] }),
  roleEntry('biome', { sheet: 'relic', label: '生态', meta: '地表 / 洞穴 / 地狱', weight: '地图', tone: 'aqua', tags: ['资源', '生成', '事件'] }),
  roleEntry('article', { sheet: 'manual', label: '攻略', meta: '阶段 / 配装 / 专题', weight: '精选', tone: 'paper', tags: ['开荒', '困难', '月后'] }),
]

const playerWorldTiles = [
  { label: '森林', meta: '开荒、NPC、木材', role: roleEntry('biome', { sheet: 'relic' }) },
  { label: '洞穴', meta: '矿物、宝箱、生命水晶', role: roleEntry('material', { sheet: 'craft', visualRole: 'material' }) },
  { label: '猩红', meta: 'Boss、组织样本、事件', role: roleEntry('boss', { sheet: 'craft' }) },
  { label: '神圣', meta: '困难模式、灵液、独角兽', role: roleEntry('buff', { sheet: 'craft' }) },
  { label: '天空', meta: '岛屿、饰品、鱼龙', role: roleEntry('items', { sheet: 'relic' }) },
  { label: '地狱', meta: '熔岩、狱石、血肉墙', role: roleEntry('article', { sheet: 'manual' }) },
]

const playerEntryPaths = [
  { label: '泰拉刃路线', meta: '从材料到成品', role: roleEntry('items', { sheet: 'relic' }) },
  { label: 'Boss 前准备', meta: '召唤物、药水、防具', role: roleEntry('boss', { sheet: 'craft' }) },
  { label: '材料速查', meta: '矿物、掉落、合成', role: roleEntry('material', { sheet: 'craft', visualRole: 'material' }) },
  { label: 'NPC 入住', meta: '房屋条件和喜好', role: roleEntry('npc', { sheet: 'relic' }) },
]

const playerCodexShelves = [
  {
    label: '战斗卷',
    meta: '武器、Boss、Buff、套装',
    roles: pickRoles(['items', 'boss', 'buff', 'armor'], 'craft'),
  },
  {
    label: '世界卷',
    meta: '生态、NPC、事件、射弹',
    roles: pickRoles(['biome', 'npc', 'notification', 'projectile'], 'relic'),
  },
  {
    label: '制作卷',
    meta: '材料、制作、分类、图鉴',
    roles: [
      roleEntry('material', { sheet: 'craft', visualRole: 'material' }),
      roleEntry('material', { sheet: 'craft', label: '制作', visualRole: 'crafting' }),
      roleEntry('category', { sheet: 'relic' }),
      roleEntry('codex', { sheet: 'manual' }),
    ],
  },
]

const playerCodexBookmarks = [
  { label: '战斗', value: '458', meta: '武器条目' },
  { label: '家具', value: '2,671', meta: '建筑装饰' },
  { label: '材料', value: '1,913', meta: '制作核心' },
  { label: '盔甲', value: '660', meta: '职业推进' },
  { label: '消耗', value: '308', meta: '药水弹药' },
  { label: '工具', value: '128', meta: '采集建造' },
]

const playerManualChapters = [
  { label: '开荒', meta: '基础装备、火把、工作台', active: true },
  { label: 'Boss 前', meta: '召唤物、药水、防具', active: false },
  { label: '困难模式', meta: '机械 Boss、神圣锭', active: false },
  { label: '月后整理', meta: '最终武器、收藏补全', active: false },
]

const playerManualRoute = [
  { index: '01', title: '真永夜刃', meta: '材料主轴', tag: '材料', role: roleEntry('material', { sheet: 'craft', visualRole: 'material' }) },
  { index: '02', title: '真断钢剑', meta: '合成分支', tag: '制作', role: roleEntry('material', { sheet: 'craft', visualRole: 'crafting' }) },
  { index: '03', title: '英雄断剑', meta: '日食事件', tag: '事件', role: roleEntry('boss', { sheet: 'craft' }) },
  { index: '04', title: '泰拉刃', meta: '路线终点', tag: '条目', role: roleEntry('items', { sheet: 'relic' }) },
]

const playerManualNotes = [
  { label: '当前路线', value: '近战后期' },
  { label: '关键节点', value: '4 步' },
  { label: '关联资料', value: '18 条' },
  { label: '下一页', value: '泰拉刃' },
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
      <span class="eyebrow">TERRAPEDIA HOME</span>
      <h1>从泰拉刃进入整个世界</h1>
      <p>世界封面、图鉴长廊、冒险手册。</p>
    </header>

    <section class="player-hero-gallery" aria-label="公开首页三种玩家入口">
      <article
        v-for="option in playerHeroDirections"
        :key="option.id"
        class="player-hero-card"
        :data-scene="option.id"
      >
        <header class="player-card-head">
          <span class="player-card-letter">{{ option.label }}</span>
          <div>
            <b>{{ option.cnName }}</b>
            <em>{{ option.name }}</em>
          </div>
          <p>{{ option.mood }}</p>
        </header>
        <div class="player-hero-stage" role="img" :aria-label="`${option.name} 公开首页`">
          <div class="player-site-topbar">
            <div class="player-brand-lockup">
              <img src="/brand/terrapedia-emblem-centered.png" alt="" />
              <span>
                <b>TerraPedia</b>
                <em>中文 Terraria 百科</em>
              </span>
            </div>
            <nav aria-hidden="true">
              <span>首页</span>
              <span>物品</span>
              <span>NPC</span>
              <span>Boss</span>
              <span>文章</span>
            </nav>
          </div>

          <section v-if="option.id === 'world-cover'" class="player-world-scene">
            <div class="player-world-hero">
              <div class="player-world-copy">
                <span class="player-kicker">World Cover</span>
                <h2>从泰拉刃进入整个世界</h2>
                <p>先落到一个具体目标，再顺着地图去找材料、Boss、NPC 和生态。</p>
                <div class="player-search-shell">
                  <RoleSvgIcon :role="roleEntry('search')" class="player-focus-token" />
                  <b>泰拉刃、Boss 前准备、NPC 入住、材料来源...</b>
                  <span>搜索</span>
                </div>
                <nav class="player-quick-trails" aria-label="World Cover 热门路径">
                  <a
                    v-for="link in playerEntryPaths"
                    :key="`player-cover-trail-${link.label}`"
                  >
                    {{ link.label }}
                  </a>
                </nav>
              </div>

              <div class="player-world-map">
                <div class="player-map-sun" aria-hidden="true"></div>
                <div class="player-map-core">
                  <RoleSvgIcon :role="roleEntry('items')" class="player-focus-token" />
                  <b>泰拉刃</b>
                  <em>探索目标</em>
                </div>
                <article
                  v-for="tile in playerWorldTiles"
                  :key="`player-world-${tile.label}`"
                  class="player-world-tile"
                >
                  <RoleSvgIcon :role="tile.role" class="player-small-token" />
                  <span>
                    <b>{{ tile.label }}</b>
                    <em>{{ tile.meta }}</em>
                  </span>
                </article>
              </div>

              <nav class="player-entry-paths" aria-label="World Cover 常用入口">
                <a
                  v-for="entry in playerCatalogEntries"
                  :key="`player-world-entry-${entry.key}-${entry.visualRole}`"
                >
                  <RoleSvgIcon :role="entry" class="player-small-token" />
                  <span>
                    <b>{{ entry.label }}</b>
                    <em>{{ entry.meta }}</em>
                  </span>
                  <strong>{{ entry.weight }}</strong>
                </a>
              </nav>
            </div>

            <aside class="player-world-side">
              <div class="player-feature-link">
                <RoleSvgIcon :role="roleEntry('items')" class="player-card-token" />
                <span>
                  <b>今日入口：泰拉刃</b>
                  <em>合成路线、材料来源、阶段推进同屏串联</em>
                </span>
              </div>
              <div class="player-path-list">
                <article
                  v-for="link in playerEntryPaths"
                  :key="`player-reader-${link.label}`"
                >
                  <RoleSvgIcon :role="link.role" class="player-small-token" />
                  <span>
                    <b>{{ link.label }}</b>
                    <em>{{ link.meta }}</em>
                  </span>
                </article>
              </div>
              <div class="player-stat-strip">
                <span v-for="stat in playerHeroStats" :key="`world-stat-${stat.label}`">
                  <b>{{ stat.value }}</b>
                  <em>{{ stat.label }}</em>
                </span>
              </div>
            </aside>
          </section>

          <section v-else-if="option.id === 'codex-gallery'" class="player-codex-gallery">
            <div class="player-codex-lead">
              <span class="player-kicker">Codex Gallery</span>
              <h2>像逛资料书廊一样进入百科</h2>
              <p>分类变成可翻阅的书脊、展签和专题卷，资料入口藏在场景里。</p>
              <div class="player-search-shell">
                <RoleSvgIcon :role="roleEntry('codex')" class="player-focus-token" />
                <b>物品、材料、Boss、NPC、生态、Buff、路线专题...</b>
                <span>翻阅</span>
              </div>
              <nav class="player-quick-trails" aria-label="Codex Gallery 快速书签">
                <a
                  v-for="bookmark in playerCodexBookmarks.slice(0, 4)"
                  :key="`player-codex-trail-${bookmark.label}`"
                >
                  {{ bookmark.label }}
                </a>
              </nav>
            </div>

            <nav class="player-codex-shelves" aria-label="Codex Gallery 图鉴长廊">
              <article
                v-for="(entry, entryIndex) in playerCatalogEntries"
                :key="`player-codex-tile-${entry.key}-${entry.visualRole}`"
                :class="`tone-${entry.tone}`"
                :style="`--player-book-index:${entryIndex}`"
              >
                <RoleSvgIcon :role="entry" class="player-card-token" />
                <span>
                  <b>{{ entry.label }}</b>
                  <em>{{ entry.meta }}</em>
                </span>
                <strong>{{ entry.weight }}</strong>
                <small class="player-entry-tags">
                  <i
                    v-for="tag in entry.tags"
                    :key="`player-codex-${entry.key}-${tag}`"
                  >
                    {{ tag }}
                  </i>
                </small>
              </article>
            </nav>

            <aside class="player-codex-side">
              <div class="player-feature-link">
                <RoleSvgIcon :role="roleEntry('items')" class="player-card-token" />
                <span>
                  <b>焦点条目：泰拉刃</b>
                  <em>从书廊进入条目、合成、掉落和路线专题</em>
                </span>
              </div>
              <div class="player-shelf-roll">
                <article
                  v-for="shelf in playerCodexShelves"
                  :key="`player-shelf-${shelf.label}`"
                >
                  <span>
                    <RoleSvgIcon
                      v-for="role in shelf.roles.slice(0, 3)"
                      :key="`player-shelf-${shelf.label}-${role.key}-${role.visualRole}`"
                      :role="role"
                      class="player-small-token"
                    />
                  </span>
                  <b>{{ shelf.label }}</b>
                  <em>{{ shelf.meta }}</em>
                </article>
              </div>
              <div class="player-bookmark-grid">
                <span
                  v-for="group in playerCodexBookmarks"
                  :key="`player-bookmark-${group.label}`"
                >
                  <b>{{ group.label }}</b>
                  <strong>{{ group.value }}</strong>
                  <em>{{ group.meta }}</em>
                </span>
              </div>
            </aside>
          </section>

          <section v-else class="player-adventure-manual">
            <div class="player-manual-cover">
              <span class="player-kicker">Adventure Manual</span>
              <h2>把攻略路线做成玩家手册</h2>
              <p>打开首页先看到章节和路径，资料站像一本可以继续翻下去的游戏手册。</p>
              <div class="player-search-shell">
                <RoleSvgIcon :role="roleEntry('search')" class="player-focus-token" />
                <b>输入目标，直接翻到对应章节、材料和路线。</b>
                <span>查找</span>
              </div>
              <div class="player-manual-chapters">
                <span
                  v-for="stage in playerManualChapters"
                  :key="`manual-chapter-${stage.label}`"
                  :class="{ active: stage.active }"
                >
                  <b>{{ stage.label }}</b>
                  <em>{{ stage.meta }}</em>
                </span>
              </div>
            </div>

            <div class="player-manual-route">
              <div class="player-manual-map" aria-label="Adventure Manual 章节地图">
                <span
                  v-for="chapter in playerManualChapters.slice(0, 3)"
                  :key="`manual-map-${chapter.label}`"
                >
                  <b>{{ chapter.label }}</b>
                  <em>{{ chapter.meta }}</em>
                </span>
              </div>
              <div class="player-route-trail">
                <article
                  v-for="step in playerManualRoute"
                  :key="`player-route-${step.title}`"
                >
                  <span>{{ step.index }}</span>
                  <RoleSvgIcon :role="step.role" class="player-card-token" />
                  <b>{{ step.title }}</b>
                  <small>{{ step.tag }}</small>
                  <em>{{ step.meta }}</em>
                </article>
              </div>
            </div>

            <aside class="player-manual-journal">
              <RoleSvgIcon :role="roleEntry('items')" class="player-focus-token" />
              <b>手册下一页</b>
              <em>进入泰拉刃条目，查看合成材料、事件掉落和后续路线。</em>
              <div class="player-manual-notes">
                <span
                  v-for="brief in playerManualNotes"
                  :key="`manual-note-${brief.label}`"
                >
                  <em>{{ brief.label }}</em>
                  <b>{{ brief.value }}</b>
                </span>
              </div>
            </aside>
          </section>
        </div>
      </article>
    </section>

    <header class="home-options-head compact home-options-archive-head" hidden>
      <span class="eyebrow">ICON AND ITEM PAGE ARCHIVE</span>
      <h2>下方保留 SVG 图标与物品页记录</h2>
      <p>这些内容用于保留 SVG 符号、图鉴墙、合成树和手册页风格记录，不影响上面的首页 hero。</p>
    </header>

    <section class="hero-icon-option-board home-options-archive-board" aria-label="三套 hero icon 记录" hidden>
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
          aria-label="SVG 图鉴墙记录"
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
              <p>从图标墙进入详情，用户先看到物品数量，再看到当前选中项的核心信息。</p>
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
          aria-label="合成树工作台记录"
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
          aria-label="游戏内百科记录"
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
                <p>一本可翻阅的游戏内百科页，信息像条目说明和手册摘录。</p>
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
              <p>用于困难模式后期的近战武器，发射绿色剑气。页面重点是读感和资料索引。</p>
              <p>适合希望 TerraPedia 更像游戏百科、少一点 SaaS 工具感的方向。</p>
            </div>
          </main>
        </section>
      </article>
    </section>

    <TerraFooter />
  </section>
</template>
