<script setup lang="ts">
import '../assets/css/home-hero-options.css'

const iconSet = [
  'icon-items',
  'icon-boss',
  'icon-npc',
  'icon-article',
  'icon-category',
  'icon-crafting',
  'icon-biome',
  'icon-buff',
  'icon-armor',
  'icon-projectile',
]

const pixelWallItems = Array.from({ length: 48 }, (_, index) => ({
  id: `wall-${index + 1}`,
  icon: iconSet[index % iconSet.length] ?? 'icon-items',
  tone: index % 5,
  label: ['泰拉刃', '神圣锭', '铁皮药水', '星怒', '村正'][index % 5] ?? '物品',
}))

const craftNodes = [
  { name: '永夜刃', meta: '材料', icon: 'icon-items', lane: 'left' },
  { name: '断钢剑', meta: '材料', icon: 'icon-items', lane: 'left' },
  { name: '英雄断剑', meta: '日食', icon: 'icon-boss', lane: 'center' },
  { name: '真永夜刃', meta: '合成', icon: 'icon-crafting', lane: 'right' },
  { name: '真断钢剑', meta: '合成', icon: 'icon-crafting', lane: 'right' },
  { name: '泰拉刃', meta: '成品', icon: 'icon-items', lane: 'result' },
]

const manualRows = [
  { label: '伤害', value: '115' },
  { label: '使用时间', value: '14' },
  { label: '击退', value: '6.5' },
  { label: '稀有度', value: '黄色' },
]

const manualIndex = ['武器', '材料', '合成', '来源', '路线']

const itemLayoutOptions = [
  {
    id: 'pixel-gallery',
    className: 'layout-pixel-gallery',
    label: 'A',
    name: 'Pixel Gallery',
    cnName: '像素图鉴墙',
    summary: '把大面积物品图标墙放到第一视觉层，当前物品以悬浮卡片压在墙上。',
  },
  {
    id: 'craft-tree',
    className: 'layout-craft-tree',
    label: 'B',
    name: 'Craft Tree',
    cnName: '合成树工作台',
    summary: '让泰拉刃合成链成为页面主结构，列表和筛选退到辅助位置。',
  },
  {
    id: 'in-game-manual',
    className: 'layout-in-game-manual',
    label: 'C',
    name: 'In-game Manual',
    cnName: '游戏内百科',
    summary: '接近游戏内手册和纸质百科，少后台感，强调翻页、索引和物品说明。',
  },
]
</script>

<template>
  <section class="screen home-options-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <header class="home-options-head">
      <span class="eyebrow">ITEM PAGE LAYOUT LAB</span>
      <h2>物品页三种新方向</h2>
      <p>这次不做后台式三栏微调，三版分别围绕图标墙、合成树、游戏内百科建立完全不同的第一屏。</p>
    </header>

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
          aria-label="像素图鉴墙方案"
        >
          <div class="pixel-gallery-toolbar">
            <div>
              <span>ITEM WALL</span>
              <h3>所有物品先出现</h3>
            </div>
            <nav aria-label="图鉴墙筛选">
              <button type="button" class="active">全部</button>
              <button type="button">武器</button>
              <button type="button">材料</button>
              <button type="button">药水</button>
            </nav>
          </div>

          <div class="pixel-wall-grid" aria-hidden="true">
            <span
              v-for="item in pixelWallItems"
              :key="item.id"
              class="pixel-wall-cell"
              :class="`tone-${item.tone}`"
            >
              <i class="sprite-icon" :class="item.icon"></i>
            </span>
          </div>

          <aside class="floating-item-card">
            <span class="sprite-icon floating-item-icon icon-items" aria-hidden="true"></span>
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

          <div class="craft-node-grid">
            <article
              v-for="node in craftNodes"
              :key="node.name"
              class="craft-node"
              :class="`lane-${node.lane}`"
            >
              <span class="sprite-icon" :class="node.icon" aria-hidden="true"></span>
              <b>{{ node.name }}</b>
              <em>{{ node.meta }}</em>
            </article>
          </div>

          <aside class="craft-result-panel">
            <span class="sprite-icon icon-items" aria-hidden="true"></span>
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
              :key="entry"
              type="button"
              :class="{ active: entry === '武器' }"
            >
              {{ entry }}
            </button>
          </aside>

          <main class="manual-page-panel">
            <div class="manual-page-head">
              <span class="sprite-icon icon-items" aria-hidden="true"></span>
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
