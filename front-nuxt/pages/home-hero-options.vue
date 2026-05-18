<script setup lang="ts">
import '../assets/css/home-hero-options.css'

type LinkItem = {
  label: string
  desc: string
  icon: string
  href: string
}

const primaryLinks: LinkItem[] = [
  { label: '物品', desc: '装备材料掉落', icon: 'icon-items', href: '/items' },
  { label: 'Boss', desc: '阶段战斗路线', icon: 'icon-boss', href: '/bosses' },
  { label: 'NPC', desc: '城镇敌怪图鉴', icon: 'icon-npc', href: '/npcs' },
  { label: '攻略', desc: '专题机制路线', icon: 'icon-article', href: '/articles' },
]

const auxiliaryLinks = [
  { label: '搜索', icon: 'icon-search', href: '/search' },
  { label: '分类', icon: 'icon-category', href: '/categories' },
  { label: '生态', icon: 'icon-biome', href: '/biomes' },
  { label: 'Buff', icon: 'icon-buff', href: '/buffs' },
  { label: '套装', icon: 'icon-armor', href: '/armor-sets' },
  { label: '射弹', icon: 'icon-projectile', href: '/projectiles' },
]

const signalRows = [
  { index: '01', name: '物品图鉴', meta: '6,214' },
  { index: '02', name: '合成链路', meta: '14,746' },
  { index: '03', name: 'Boss 进度', meta: '路线化' },
  { index: '04', name: '攻略专题', meta: '精选' },
]

const options = [
  {
    id: 'a1',
    label: 'A1',
    title: '克制标题 + 细线入口',
    desc: '保留第一版的叙事标题，把入口压成低亮细线导航。右侧有差异，但不抢左侧装置。',
    panel: 'fine-nav',
  },
  {
    id: 'a2',
    label: 'A2',
    title: '标题 + 主检索轨道',
    desc: '标题继续保留，视觉焦点收敛到一条检索轨道。入口藏在轨道下面，整体更稳。',
    panel: 'search-track',
  },
  {
    id: 'a3',
    label: 'A3',
    title: '标题 + 隐式索引结构',
    desc: '不堆卡片，使用淡编号、索引点和短文本形成秩序。差异化来自排版结构。',
    panel: 'implicit-index',
  },
]

const variants = options.flatMap((option) => [
  { ...option, key: `${option.id}-normal`, reversed: false, note: '常规位置' },
  { ...option, key: `${option.id}-reversed`, reversed: true, note: '左右互换' },
])
</script>

<template>
  <section class="screen home-options-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <header class="home-options-head">
      <span class="eyebrow">HOME HERO OPTIONS</span>
      <h2>首页首屏右侧高保真方案</h2>
      <p>A1 / A2 / A3 都基于第一版方向细化，每个方案提供常规位置和左右互换位置，便于判断视觉重心是否改善。</p>
    </header>

    <section
      v-for="variant in variants"
      :key="variant.key"
      class="hero-option-card"
      :class="[`option-${variant.id}`, { 'option-reversed-card': variant.reversed }]"
      :aria-label="`${variant.label} ${variant.title} ${variant.note}`"
    >
      <div class="hero-option-label">
        <b>{{ variant.label }}</b>
        <span>{{ variant.title }}</span>
        <em>{{ variant.note }} · {{ variant.desc }}</em>
      </div>

      <div class="hero-option-grid" :class="{ 'is-reversed': variant.reversed }">
        <aside class="option-left-stage" aria-hidden="true">
          <div class="option-index-device">
            <div class="option-index-head">
              <div><span>TERRAPEDIA INDEX</span><strong>公共资料索引</strong></div>
              <div><b>6,214</b><span>条目</span></div>
            </div>
            <div class="option-focus-card">
              <span class="sprite-icon card-icon icon-items" aria-hidden="true"></span>
              <div><span>当前焦点</span><b>泰拉刃</b></div>
              <em>详情</em>
            </div>
            <div class="option-metrics">
              <div><b>物品</b><span>装备 / 材料 / 掉落</span></div>
              <div><b>NPC</b><span>城镇 / 敌怪</span></div>
              <div><b>Boss</b><span>阶段 / 战利品</span></div>
              <div><b>攻略</b><span>路线 / 事件</span></div>
            </div>
            <div class="option-index-table">
              <div v-for="row in signalRows" :key="row.index">
                <span>{{ row.index }}</span>
                <b>{{ row.name }}</b>
                <em>{{ row.meta }}</em>
              </div>
            </div>
          </div>
        </aside>

        <section
          class="option-right-panel"
          :class="{
            'option-fine-nav': variant.panel === 'fine-nav',
            'option-search-track': variant.panel === 'search-track',
            'option-implicit-index': variant.panel === 'implicit-index',
          }"
        >
          <div class="option-copy-block">
            <span class="option-route-kicker">公开图鉴 · 世界路线</span>
            <h3>从泰拉刃进入整个世界</h3>
            <p>它不是博客首页，而是资料入口。右侧只负责建立进入方式，左侧继续承担第一眼的资料装置感。</p>
          </div>

          <template v-if="variant.panel === 'fine-nav'">
            <div class="option-action-deck fine-nav-deck">
              <div class="deck-head">
                <span>入口层</span>
                <em>低亮细线导航</em>
              </div>
              <div class="fine-nav-search">
                <span class="search-glyph" aria-hidden="true"></span>
                <strong>搜索物品、Boss、NPC、路线...</strong>
                <a href="/search">检索</a>
              </div>
              <div class="fine-nav-lines">
                <a v-for="(link, index) in primaryLinks" :key="link.href" :href="link.href">
                  <span>{{ String(index + 1).padStart(2, '0') }}</span>
                  <b>{{ link.label }}</b>
                  <em>{{ link.desc }}</em>
                </a>
              </div>
            </div>
          </template>

          <template v-else-if="variant.panel === 'search-track'">
            <div class="option-action-deck search-track-deck">
              <div class="deck-head">
                <span>主操作</span>
                <em>检索轨道优先</em>
              </div>
              <div class="search-track-bar">
                <span class="search-glyph" aria-hidden="true"></span>
                <div><b>资料检索轨道</b><em>物品 / Boss / NPC / 路线</em></div>
                <a href="/search">开始</a>
              </div>
              <div class="search-track-steps">
                <a v-for="link in primaryLinks" :key="link.href" :href="link.href">
                  <span class="sprite-icon compact" :class="link.icon" aria-hidden="true"></span>
                  <b>{{ link.label }}</b>
                </a>
              </div>
              <div class="search-track-chips">
                <a v-for="link in auxiliaryLinks" :key="link.href" :href="link.href">{{ link.label }}</a>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="option-action-deck implicit-index-deck">
              <div class="deck-head">
                <span>索引层</span>
                <em>编号关系优先</em>
              </div>
              <div class="implicit-index-map">
                <a v-for="(link, index) in primaryLinks" :key="link.href" :href="link.href">
                  <span>{{ String(index + 1).padStart(2, '0') }}</span>
                  <div>
                    <b>{{ link.label }}</b>
                    <em>{{ link.desc }}</em>
                  </div>
                </a>
              </div>
              <div class="implicit-index-foot">
                <span>资料入口以低亮编号组织，避免右侧形成第二组重卡片。</span>
                <a href="/items">进入图鉴</a>
              </div>
            </div>
          </template>
        </section>
      </div>
    </section>

    <TerraFooter />
  </section>
</template>
