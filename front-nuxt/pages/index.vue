<script setup lang="ts">
type HomeStats = {
  totalItems?: number | null
  totalCategories?: number | null
}

const fallbackHomeStats: HomeStats = {
  totalItems: 6131,
  totalCategories: 0,
}

const fetchHomeStats = async (): Promise<HomeStats> => {
  try {
    const response = await usePublicApiFetch<HomeStats>('/statistics/overview')
    return unwrapApiResponse(response) ?? fallbackHomeStats
  } catch {
    return fallbackHomeStats
  }
}

const { data: homeStats } = await useAsyncData(
  'home-public-stats',
  fetchHomeStats,
  {
    default: () => fallbackHomeStats,
  },
)

const homeSearchQuery = ref('')

const formatCount = (value: number | null | undefined, fallback: string) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue.toLocaleString('zh-CN')
    : fallback
}

const itemTotalLabel = computed(() => formatCount(homeStats.value?.totalItems, '6,131'))
const categoryTotalLabel = computed(() => formatCount(homeStats.value?.totalCategories, '分类'))

const primaryHeroEntries = computed(() => [
  { label: '物品', href: '/items', icon: 'icon-items', desc: '装备材料掉落', count: itemTotalLabel.value, hex: '255,215,101' },
  { label: 'Boss', href: '/bosses', icon: 'icon-boss', desc: '阶段战斗路线', count: '路线化', hex: '224,126,85' },
  { label: 'NPC', href: '/npcs', icon: 'icon-npc', desc: '城镇敌怪图鉴', count: '762', hex: '126,178,120' },
  { label: '攻略', href: '/articles', icon: 'icon-article', desc: '专题和机制', count: '精选', hex: '217,185,91' },
])

const homePrimaryStats = computed(() => [
  { value: itemTotalLabel.value, label: '物品条目', href: '/items' },
  { value: categoryTotalLabel.value, label: '分类总览', href: '/categories' },
])

const secondaryHeroLinks = [
  { label: '分类', href: '/categories', icon: 'icon-category', desc: '类型索引' },
  { label: '制作', href: '/crafting', icon: 'icon-crafting', desc: '合成路线' },
  { label: '生态', href: '/biomes', icon: 'icon-biome', desc: '群落资源' },
  { label: 'Buff', href: '/buffs', icon: 'icon-buff', desc: '状态效果' },
  { label: '套装', href: '/armor-sets', icon: 'icon-armor', desc: '防具推进' },
  { label: '射弹', href: '/projectiles', icon: 'icon-projectile', desc: '弹道行为' },
]

const explorationMapNodes = [
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
]

const featuredRoute = {
  href: '/articles/melee-progression',
  image: '/preview-assets/terrapedia-images/items/2026/04/08/a192da2a6a2d415ca9c5a09782113e3d.png',
  title: '从机械 Boss 到月亮领主：近战装备推进路线',
  desc: '以泰拉刃、甲虫套和关键饰品为主线，整理困难模式后期的材料、事件和 Boss 顺序，并标注每一步对应的图鉴入口。',
}

const codexActionLinks = [
  { label: '攻略', href: '/articles?type=guide' },
  { label: '专题', href: '/articles?type=topic' },
  { label: '机制', href: '/articles?type=mechanic' },
]

const submitHomeSearch = () => {
  const keyword = homeSearchQuery.value.trim()

  if (!keyword) {
    return navigateTo('/search')
  }

  return navigateTo(`/search?keyword=${encodeURIComponent(keyword)}`)
}
</script>

<template>
<section class="screen home-screen active">
    <TerraNav />

          <section class="hero">
            <div class="hero-grid">
              <section class="hero-j1-panel" aria-label="首页核心入口">
                <div class="hero-j1-copy">
                  <span class="hero-kicker">公开图鉴 · 世界路线</span>
                  <h1 class="hero-j1-title">从泰拉刃<br>进入整个世界</h1>
                  <p class="hero-j1-lede">
                    围绕物品、Boss、NPC 和攻略路线组织资料，第一屏直接给出可进入的资料中枢。
                  </p>
                </div>

                <nav class="hero-j1-grid" aria-label="核心资料入口">
                  <a
                    v-for="entry in primaryHeroEntries"
                    :key="entry.href"
                    class="hero-j1-cell"
                    :href="entry.href"
                    :style="`--entry-accent: ${entry.hex}`"
                  >
                    <span class="sprite-icon hero-j1-icon" :class="entry.icon" aria-hidden="true"></span>
                    <span class="hero-j1-cell-copy">
                      <b>{{ entry.label }}</b>
                      <em>{{ entry.desc }}</em>
                    </span>
                    <span class="hero-j1-count">{{ entry.count }}</span>
                  </a>
                </nav>

                <form class="hero-j1-search" role="search" aria-label="首页资料检索" @submit.prevent="submitHomeSearch">
                  <span class="search-glyph" aria-hidden="true"></span>
                  <label class="visually-hidden" for="home-hero-search">搜索物品、Boss、NPC 或路线</label>
                  <input
                    id="home-hero-search"
                    v-model="homeSearchQuery"
                    type="search"
                    name="keyword"
                    autocomplete="off"
                    placeholder="物品、Boss、NPC、路线..."
                  />
                  <button type="submit" class="hero-j1-search-btn">检索</button>
                </form>

                <nav class="hero-j1-paths" aria-label="辅助资料快捷路径">
                  <a
                    v-for="link in secondaryHeroLinks"
                    :key="link.href"
                    :href="link.href"
                    class="hero-j1-path-link"
                  >
                    <span class="sprite-icon mini" :class="link.icon" aria-hidden="true"></span>
                    <b>{{ link.label }}</b>
                    <em>{{ link.desc }}</em>
                  </a>
                </nav>
              </section>

              <aside class="hero-left" aria-label="公共资料索引概览">
                <div class="atlas-index">
                  <div class="index-head">
                    <div><span>TERRAPEDIA INDEX</span><strong>公共资料索引</strong></div>
                    <div class="index-total"><b>{{ itemTotalLabel }}</b><span>条目</span></div>
                  </div>
                  <div class="index-focus">
                    <span class="sprite-icon index-focus-icon icon-items" aria-hidden="true"></span>
                    <div><span>当前焦点</span><b>泰拉刃</b></div>
                    <a class="index-focus-action" href="/items/757">详情</a>
                  </div>
                  <div class="index-metrics">
                    <a href="/items"><b>物品</b><span>装备 / 材料 / 掉落</span></a>
                    <a href="/npcs"><b>NPC</b><span>城镇 / 敌怪</span></a>
                    <a href="/bosses"><b>Boss</b><span>阶段 / 战利品</span></a>
                    <a href="/articles"><b>攻略</b><span>路线 / 事件</span></a>
                  </div>
                  <div class="index-table">
                    <a class="index-row" href="/items"><span>01</span><b>物品图鉴</b><em>{{ itemTotalLabel }}</em></a>
                    <a class="index-row" href="/crafting"><span>02</span><b>合成链路</b><em>14,746</em></a>
                    <a class="index-row" href="/bosses"><span>03</span><b>Boss 进度</b><em>路线化</em></a>
                    <a class="index-row" href="/articles"><span>04</span><b>攻略专题</b><em>精选</em></a>
                  </div>
                </div>
              </aside>
            </div>
            <div class="hero-stats">
              <a
                v-for="stat in homePrimaryStats"
                :key="stat.href"
                class="hero-stat-card home-primary-stat"
                :href="stat.href"
              >
                <b>{{ stat.value }}</b><span>{{ stat.label }}</span>
              </a>
            </div>
          </section>

          <section class="home-lower">
            <div class="home-lower-inner">
              <section class="exploration-map home-section-band">
                <div class="map-head">
                  <span class="eyebrow">探索地图</span>
                  <h2>世界不是一张列表，而是一张可走的图</h2>
                  <p>把生态、装备、事件和资料入口放在同一张地图里，首页才会像资料中枢，而不是一页普通的产品列表。</p>
                </div>
                <div class="map-path"></div>
                <a
                  v-for="node in explorationMapNodes"
                  :key="node.href"
                  class="map-node-link"
                  :class="['map-node', node.className, { featured: node.featured }]"
                  :href="node.href"
                >
                  <i><span class="item-art" :style="`background-image:url('${node.image}')`"></span></i>
                  <b>{{ node.title }}</b>
                  <span>{{ node.desc }}</span>
                </a>
              </section>

              <section class="paper-stage">
                <div class="section-head">
                  <span class="eyebrow">精选路线</span>
                  <h2>从路线开始探索资料</h2>
                  <p>首页下半部分承接首屏入口，重点给出路线、事件和专题，而不是继续重复统计数字。</p>
                </div>

                <div class="stage-grid">
                  <article class="featured-route">
                    <div class="route-art">
                      <span class="item-art" :style="`background-image:url('${featuredRoute.image}')`"></span>
                    </div>
                    <h3>{{ featuredRoute.title }}</h3>
                    <p>{{ featuredRoute.desc }}</p>
                    <div class="tag-row">
                      <span class="tag moss">开荒</span>
                      <span class="tag gold">Boss 前</span>
                      <span class="tag paper">困难模式</span>
                      <span class="tag paper">月前装备</span>
                    </div>
                    <a class="featured-route-cta" :href="featuredRoute.href">查看完整路线</a>
                  </article>

                  <div class="route-list">
                    <div class="route-list-row">
                      <span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/cd8d30c0359b4fbda34ffcfba4745145.png')"></span>
                      <div>
                        <b>真永夜刃</b>
                        <span>合成材料 · 路线主轴</span>
                      </div>
                      <strong>合成</strong>
                    </div>
                    <div class="route-list-row">
                      <span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/5495725121204ede9da25ddf678ca246.png')"></span>
                      <div>
                        <b>真断钢剑</b>
                        <span>合成材料 · 战前推进</span>
                      </div>
                      <strong>合成</strong>
                    </div>
                    <div class="route-list-row">
                      <span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/77203300926f489fb82ae1072a8623d4.png')"></span>
                      <div>
                        <b>英雄断剑</b>
                        <span>掉落来源 · 日食事件</span>
                      </div>
                      <strong>来源</strong>
                    </div>
                  </div>
                </div>
              </section>

              <article class="boss-strip">
                <div class="boss-medallion" aria-hidden="true">
                  <span class="boss-orbit one"></span>
                  <span class="boss-orbit two"></span>
                  <span class="boss-sigil">BS</span>
                </div>
                <div class="boss-copy">
                  <span class="eyebrow">Boss 事件条</span>
                  <h2>将战斗、掉落和推进节奏摆在同一条线上</h2>
                  <p>战前准备、击败后的掉落与下一阶段入口放成连续信息，不让 Boss 区像普通卡片列表。</p>
                  <div class="boss-route">
                    <span><b>01</b>战前准备</span>
                    <span><b>02</b>事件触发</span>
                    <span><b>03</b>关键掉落</span>
                    <span><b>04</b>下一阶段</span>
                  </div>
                </div>
                <div class="loot-grid" aria-hidden="true">
                  <span><span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/6ef1b719169348b595c93654cbf60c1c.png')"></span></span>
                  <span><span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/6b53bc835cd742dba96053653aac8f4f.png')"></span></span>
                  <span><span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/c626dfb6e7bc4139b099b81ffc4680d1.png')"></span></span>
                  <span><span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/034a248ac37a42049c5ef882098a4eb8.png')"></span></span>
                  <span><span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/572d02498c01441e86ce0e55aa946f5b.png')"></span></span>
                  <span><span class="item-art" style="background-image:url('/preview-assets/terrapedia-images/items/2026/04/08/1c9f832ea4a6424c8bdae1bc843ec02f.png')"></span></span>
                </div>
              </article>

              <div class="codex-band">
                <article class="codex-scroll">
                  <div class="codex-feature">
                    <span class="eyebrow">资料手札</span>
                    <h2>文章区不是博客堆叠，而是专题导航</h2>
                    <p>按游玩阶段、装备目标和机制解释组织内容，和图鉴数据互相跳转，保持站点整体的路线感。</p>
                    <div class="codex-actions">
                      <a
                        v-for="action in codexActionLinks"
                        :key="action.href"
                        :href="action.href"
                      >
                        {{ action.label }}
                      </a>
                    </div>
                  </div>
                  <div class="codex-route-list">
                    <div><span>01</span><p><b>阶段专题</b><em>开荒 / 困难模式 / 月后整理</em></p></div>
                    <div><span>02</span><p><b>装备目标</b><em>近战、射手、法师和召唤路线</em></p></div>
                    <div><span>03</span><p><b>机制解释</b><em>事件、生态、掉落与刷新规则</em></p></div>
                  </div>
                </article>

                <aside class="codex-notes">
                  <div class="codex-note">
                    <i aria-hidden="true">A</i>
                    <div><b>专题索引</b><span>按阶段、职业和事件组织入口</span></div>
                  </div>
                  <div class="codex-note">
                    <i aria-hidden="true">B</i>
                    <div><b>路线信号</b><span>把装备和事件拆成可走的流程</span></div>
                  </div>
                  <div class="codex-note">
                    <i aria-hidden="true">C</i>
                    <div><b>阅读手札</b><span>文章卡片以专题化摘要呈现</span></div>
                  </div>
                </aside>
              </div>

            </div>

            <TerraFooter :item-total-label="itemTotalLabel" />
          </section>
        </section>
</template>
