<script setup lang="ts">
import '../assets/css/home-hero-options.css'

type SpriteRole = {
  key: string
  label: string
  meta: string
  visualRole: string
  sheet?: PixelSheetKey
  col: number
  row: number
  alias: string
  weight?: string
  name?: string
}

const pixelSheets = {
  relic: '/ui/home-hero-pixel/relic-sheet.png',
  craft: '/ui/home-hero-pixel/craft-sheet.png',
  manual: '/ui/home-hero-pixel/manual-sheet.png',
} as const

type PixelSheetKey = keyof typeof pixelSheets

const pixelRoleCatalog = [
  { key: 'search', label: '搜索', meta: '全站检索', visualRole: 'search', col: 0, row: 0, alias: '' },
  { key: 'items', label: '物品', meta: '图鉴主体', visualRole: 'item', col: 1, row: 0, alias: '' },
  { key: 'category', label: '分类', meta: '抽象分组', visualRole: 'category', col: 2, row: 0, alias: '' },
  { key: 'biome', label: '生态', meta: '世界区域', visualRole: 'biome', col: 3, row: 0, alias: '' },
  { key: 'boss', label: 'Boss', meta: '事件节点', visualRole: 'boss', col: 0, row: 1, alias: '' },
  { key: 'buff', label: 'Buff', meta: '状态效果', visualRole: 'buff', col: 1, row: 1, alias: '' },
  { key: 'armor', label: '套装', meta: '职业路线', visualRole: 'armor', col: 2, row: 1, alias: '' },
  { key: 'projectile', label: '射弹', meta: '弹道行为', visualRole: 'projectile', col: 3, row: 1, alias: '' },
  { key: 'npc', label: 'NPC', meta: '关系索引', visualRole: 'npc', col: 0, row: 2, alias: '用户同格' },
  { key: 'article', label: '攻略', meta: '专题资料', visualRole: 'article', col: 1, row: 2, alias: '' },
  { key: 'material', label: '材料 / 制作', meta: '配方链路', visualRole: 'material', col: 2, row: 2, alias: '制作同格' },
  { key: 'edit', label: '编辑', meta: '投稿动作', visualRole: 'edit', col: 3, row: 2, alias: '' },
  { key: 'favorites', label: '收藏', meta: '个人书签', visualRole: 'favorite', col: 0, row: 3, alias: '' },
  { key: 'settings', label: '设置', meta: '偏好控制', visualRole: 'settings', col: 1, row: 3, alias: '' },
  { key: 'codex', label: '图鉴', meta: '资料库', visualRole: 'codex', col: 2, row: 3, alias: '' },
  { key: 'notification', label: '通知', meta: '状态提醒', visualRole: 'notice', col: 3, row: 3, alias: '' },
] as const satisfies readonly SpriteRole[]

type SpriteRoleKey = typeof pixelRoleCatalog[number]['key']

const pixelRoleMap = Object.fromEntries(
  pixelRoleCatalog.map((role) => [role.key, role]),
) as Record<SpriteRoleKey, SpriteRole>

const roleEntry = (key: SpriteRoleKey, extra: Partial<SpriteRole> = {}): SpriteRole => ({
  ...pixelRoleMap[key],
  ...extra,
}) as SpriteRole

const pickRoles = (keys: SpriteRoleKey[], sheet: PixelSheetKey = 'relic'): SpriteRole[] => keys.map((key) => roleEntry(key, { sheet }))

const pixelIconStyle = (role: SpriteRole): Record<string, string> => ({
  '--pixel-icon-sheet': `url("${pixelSheets[role.sheet ?? 'relic']}")`,
  '--pixel-icon-x': `${role.col * 33.333333}%`,
  '--pixel-icon-y': `${role.row * 33.333333}%`,
})

const abstractPixelEntries = [
  roleEntry('category', { label: '分类入口', meta: '武器 / 材料 / 工具' }),
  roleEntry('projectile', { label: '射弹行为', meta: '弹道 / 来源 / 命中' }),
  roleEntry('npc', { label: 'NPC 关系', meta: '入住 / 事件 / 掉落' }),
  roleEntry('biome', { label: '生态索引', meta: '地形 / 资源 / 生成' }),
]

const simplePixelGlyphs: SpriteRole[] = [
  ...pickRoles(['search', 'category', 'biome', 'projectile', 'npc', 'material', 'favorites', 'codex'], 'relic'),
  ...pickRoles(['boss', 'buff', 'armor', 'items'], 'craft'),
  ...pickRoles(['article', 'edit', 'settings', 'notification'], 'manual'),
]

const pixelCategoryMosaic = [
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

const pixelIconWall: SpriteRole[] = pickRoles(pixelRoleCatalog.map((role) => role.key))

const pixelWallItems = Array.from({ length: 48 }, (_, index) => ({
  id: `wall-${index + 1}`,
  tone: index % 5,
}))

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

const previewIcons: SpriteRole[] = simplePixelGlyphs

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
    name: '林地符号像素入口',
    target: 'Pixel Gallery',
    roles: pickRoles(['search', 'items', 'category', 'biome', 'npc', 'projectile', 'favorites', 'codex'], 'relic'),
    summary: '低色数抽象像素符号，专门给分类、射弹、NPC、生态入口做差异。',
    notes: ['抽象像素符号', '低色数', '不替代物品图'],
  },
  {
    id: 'craft-tree-icons',
    label: 'B',
    name: '工匠符号路线',
    target: 'Craft Tree',
    roles: [roleEntry('material', { sheet: 'craft', visualRole: 'material' }), roleEntry('boss', { sheet: 'craft' }), roleEntry('buff', { sheet: 'craft' }), roleEntry('armor', { sheet: 'craft' }), roleEntry('material', { sheet: 'craft', label: '制作', visualRole: 'crafting' }), roleEntry('projectile', { sheet: 'craft' }), roleEntry('items', { sheet: 'craft' }), roleEntry('notification', { sheet: 'craft' })],
    summary: '把合成、材料、事件、结果压成安静的路线符号，避免技能框。',
    notes: ['路线符号', '克制轮廓', '区别于掉落图'],
  },
  {
    id: 'manual-icons',
    label: 'C',
    name: '手册章节符号',
    target: 'In-game Manual',
    roles: [roleEntry('items', { sheet: 'manual' }), roleEntry('category', { sheet: 'manual' }), roleEntry('material', { sheet: 'manual', visualRole: 'material' }), roleEntry('boss', { sheet: 'manual' }), roleEntry('article', { sheet: 'manual' }), roleEntry('settings', { sheet: 'manual' }), roleEntry('codex', { sheet: 'manual' }), roleEntry('search', { sheet: 'manual' })],
    summary: '更像游戏手册里的章节索引符号，用于资料操作，避免实体插图。',
    notes: ['章节符号', '墨色剪影', '避免实体插图'],
  },
]

const itemLayoutOptions = [
  {
    id: 'pixel-gallery',
    className: 'layout-pixel-gallery',
    label: 'A',
    name: 'Pixel Gallery',
    cnName: '像素物品墙',
    summary: '像素图标只承担分类和入口差异，具体物品墙保留真实资源占位。',
  },
  {
    id: 'craft-tree',
    className: 'layout-craft-tree',
    label: 'B',
    name: 'Craft Tree',
    cnName: '合成树工作台',
    summary: '把新生成的低像素物件放到路线层级上，具体材料、事件、成品节点只展示结构和文字。',
  },
  {
    id: 'in-game-manual',
    className: 'layout-in-game-manual',
    label: 'C',
    name: 'In-game Manual',
    cnName: '游戏内百科',
    summary: '像素图标只放在手册章节索引，泰拉刃正文区域不使用插图替代真实物品图。',
  },
]
</script>

<template>
  <section class="screen home-options-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <header class="home-options-head">
      <span class="eyebrow">ITEM PAGE LAYOUT LAB</span>
      <h1>物品页三种新方向</h1>
      <p>三版分别围绕图标墙、合成树、游戏内百科建立完全不同的第一屏。</p>
    </header>

    <section class="hero-icon-option-board" aria-label="三套 hero icon 方案">
      <article
        v-for="direction in heroIconDirections"
        :key="direction.id"
        class="hero-icon-option-card"
        :class="direction.id"
      >
        <div class="hero-icon-pixel-preview" aria-hidden="true">
          <span
            v-for="role in direction.roles"
            :key="`${direction.id}-${role.key}-${role.visualRole}`"
            class="pixel-icon-token hero-token"
            :class="`role-${role.visualRole}`"
          >
            <span
              class="generated-pixel-icon card-icon"
              :style="pixelIconStyle(role)"
            ></span>
          </span>
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

    <section class="hero-pixel-library" aria-label="抽象像素符号库">
      <span
        v-for="role in previewIcons"
        :key="`library-${role.key}`"
        class="pixel-icon-token library-token"
        :class="`role-${role.visualRole}`"
      >
        <span
          class="generated-pixel-icon"
          :style="pixelIconStyle(role)"
          aria-hidden="true"
        ></span>
      </span>
    </section>

    <section class="icon-combo-board" aria-label="像素图标组合对比">
      <article
        v-for="combo in iconComboSets"
        :key="combo.label"
        class="icon-combo-card"
        :class="`tone-${combo.tone}`"
      >
        <div class="combo-role-strip">
          <span
            v-for="role in combo.roles"
            :key="`${combo.label}-${role.key}-${role.visualRole}`"
            class="pixel-icon-token combo-token"
            :class="`role-${role.visualRole}`"
          >
            <span
              class="generated-pixel-icon"
              :style="pixelIconStyle(role)"
              aria-hidden="true"
            ></span>
          </span>
        </div>
        <span>
          <b>{{ combo.label }}</b>
          <em>{{ combo.meta }}</em>
        </span>
      </article>
    </section>

    <section class="item-layout-board" aria-label="物品页三种新方向">
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
          aria-label="像素物品墙方案"
        >
          <div class="pixel-gallery-toolbar">
            <div>
              <span>ITEM WALL</span>
              <h2>所有物品先出现</h2>
            </div>
            <nav aria-label="物品墙筛选">
              <button type="button" class="active">全部</button>
              <button type="button">武器</button>
              <button type="button">材料</button>
              <button type="button">药水</button>
            </nav>
          </div>

          <div class="pixel-abstract-route-strip" aria-label="抽象入口图标示例">
            <button
              v-for="entry in abstractPixelEntries"
              :key="entry.label"
              type="button"
              class="pixel-abstract-route"
            >
              <span
                class="pixel-icon-token route-token"
                :class="`role-${entry.visualRole}`"
              >
                <span
                  class="generated-pixel-icon abstract-route-icon"
                  :style="pixelIconStyle(entry)"
                  aria-hidden="true"
                ></span>
              </span>
              <span>
                <b>{{ entry.label }}</b>
                <em>{{ entry.meta }}</em>
              </span>
            </button>
          </div>

          <div class="pixel-category-mosaic" aria-label="像素分类矩阵">
            <span
              v-for="cell in pixelCategoryMosaic"
              :key="cell.label"
              class="pixel-mosaic-cell"
              :class="`is-${cell.weight}`"
            >
              <span
                class="pixel-icon-token mosaic-token"
                :class="`role-${cell.visualRole}`"
              >
                <span class="generated-pixel-icon" :style="pixelIconStyle(cell)" aria-hidden="true"></span>
              </span>
              <span>
                <b>{{ cell.label }}</b>
                <em>{{ cell.meta }}</em>
              </span>
            </span>
          </div>

          <div class="pixel-icon-wall" aria-label="抽象符号角色墙">
            <span
              v-for="role in pixelIconWall"
              :key="`pixel-wall-icon-${role.key}`"
              class="pixel-icon-token wall-token"
              :class="`role-${role.visualRole}`"
              >
                <span class="generated-pixel-icon" :style="pixelIconStyle(role)" aria-hidden="true"></span>
              <span>
                <b>{{ role.label }}</b>
                <em>{{ role.alias ? `同源 ${role.alias}` : role.meta }}</em>
              </span>
            </span>
          </div>

          <div class="pixel-wall-grid" aria-hidden="true">
            <span
              v-for="item in pixelWallItems"
              :key="item.id"
              class="pixel-wall-cell"
              :class="`tone-${item.tone}`"
            >
              <i class="pixel-slot-pip"></i>
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
              <span
                class="pixel-icon-token craft-token"
                :class="`role-${stage.visualRole}`"
              >
                <span
                  class="generated-pixel-icon abstract-craft-icon"
                  :style="pixelIconStyle(stage)"
                  aria-hidden="true"
                ></span>
              </span>
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
              <span
                class="pixel-icon-token board-token"
                :class="`role-${entry.visualRole}`"
              >
                <span class="generated-pixel-icon" :style="pixelIconStyle(entry)" aria-hidden="true"></span>
              </span>
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
                <span
                  v-for="role in combo.roles"
                  :key="`${combo.label}-${role.key}-${role.visualRole}`"
                  class="pixel-icon-token combo-token"
                  :class="`role-${role.visualRole}`"
                >
                  <span
                    class="generated-pixel-icon"
                    :style="pixelIconStyle(role)"
                    aria-hidden="true"
                  ></span>
                </span>
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
              <span
                class="pixel-icon-token manual-nav-token"
                :class="`role-${entry.visualRole}`"
              >
                <span
                  class="generated-pixel-icon abstract-manual-icon"
                  :style="pixelIconStyle(entry)"
                  aria-hidden="true"
                ></span>
              </span>
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

            <div class="manual-chapter-grid" aria-label="手册章节像素图标">
              <article
                v-for="chapter in manualChapterGrid"
                :key="chapter.label"
              >
                <span
                  class="pixel-icon-token chapter-token"
                  :class="`role-${chapter.visualRole}`"
                >
                  <span class="generated-pixel-icon" :style="pixelIconStyle(chapter)" aria-hidden="true"></span>
                </span>
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
                  <span
                    v-for="role in shelf.roles"
                    :key="`${shelf.label}-${role.key}-${role.visualRole}`"
                    class="pixel-icon-token combo-token"
                    :class="`role-${role.visualRole}`"
                  >
                    <span
                      class="generated-pixel-icon"
                      :style="pixelIconStyle(role)"
                      aria-hidden="true"
                    ></span>
                  </span>
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
