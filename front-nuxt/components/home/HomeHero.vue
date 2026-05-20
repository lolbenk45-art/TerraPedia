<script setup lang="ts">
type HeroEntry = {
  label: string
  href: string
  icon: string
  desc: string
  count: string
  hex: string
}

type StageChip = {
  label: string
  href: string
  tone: string
}

type SecondaryLink = {
  label: string
  href: string
  icon: string
  desc: string
}

type PrimaryStat = {
  value: string
  label: string
  href: string
}

type AtlasOverview = {
  totalLabel: string
  focus: {
    label: string
    title: string
    href: string
  }
  metrics: Array<{
    label: string
    href: string
    desc: string
  }>
  rows: Array<{
    index: string
    label: string
    href: string
    value: string
  }>
}

const props = defineProps<{
  kicker: string
  title: string
  lede: string
  primaryEntries: HeroEntry[]
  progressionStages: StageChip[]
  secondaryLinks: SecondaryLink[]
  primaryStats: PrimaryStat[]
  trustSignals: Array<{ label: string }>
  atlas: AtlasOverview
}>()

const homeSearchQuery = ref('')
const titleLines = computed(() => props.title.split('\n'))

const submitHomeSearch = () => {
  const keyword = homeSearchQuery.value.trim()

  if (!keyword) {
    return navigateTo('/search')
  }

  return navigateTo(`/search?keyword=${encodeURIComponent(keyword)}`)
}
</script>

<template>
  <section class="hero" aria-label="首页核心入口">
    <div class="hero-grid">
      <section class="hero-j1-panel" aria-label="首页核心入口">
        <div class="hero-j1-copy">
          <span class="hero-kicker">{{ kicker }}</span>
          <h1 class="hero-j1-title">
            <template v-for="(line, index) in titleLines" :key="line">
              <br v-if="index > 0" />
              {{ line }}
            </template>
          </h1>
          <p class="hero-j1-lede">
            {{ lede }}
          </p>
        </div>

        <div class="tag-row hero-trust-band hero-trust-band-mobile" aria-label="站点维护状态">
          <span
            v-for="signal in trustSignals"
            :key="signal.label"
            class="tag moss hero-trust-item"
          >
            {{ signal.label }}
          </span>
        </div>

        <nav class="hero-j1-grid" aria-label="核心资料入口">
          <a
            v-for="entry in primaryEntries"
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

        <nav class="tag-row hero-stage-chips" aria-label="按游玩阶段浏览">
          <a
            v-for="stage in progressionStages"
            :key="stage.href"
            class="tag hero-stage-chip"
            :class="stage.tone"
            :href="stage.href"
          >
            {{ stage.label }}
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
          <button type="submit" class="hero-j1-search-btn">
            检索
          </button>
        </form>

        <nav class="hero-j1-paths" aria-label="辅助资料快捷路径">
          <a
            v-for="link in secondaryLinks"
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
            <div>
              <span>TERRAPEDIA INDEX</span>
              <strong>公共资料索引</strong>
            </div>
            <div class="index-total">
              <b>{{ atlas.totalLabel }}</b><span>条目</span>
            </div>
          </div>
          <div class="index-focus">
            <span class="sprite-icon index-focus-icon icon-items" aria-hidden="true"></span>
            <div>
              <span>{{ atlas.focus.label }}</span>
              <b>{{ atlas.focus.title }}</b>
            </div>
            <a class="index-focus-action" :href="atlas.focus.href">详情</a>
          </div>
          <div class="index-metrics">
            <a v-for="metric in atlas.metrics" :key="metric.href" :href="metric.href">
              <b>{{ metric.label }}</b><span>{{ metric.desc }}</span>
            </a>
          </div>
          <div class="index-table">
            <a v-for="row in atlas.rows" :key="row.href" class="index-row" :href="row.href">
              <span>{{ row.index }}</span><b>{{ row.label }}</b><em>{{ row.value }}</em>
            </a>
          </div>
        </div>
      </aside>
    </div>
    <div class="hero-stats">
      <a
        v-for="stat in primaryStats"
        :key="stat.href"
        class="hero-stat-card home-primary-stat"
        :href="stat.href"
      >
        <b>{{ stat.value }}</b><span>{{ stat.label }}</span>
      </a>
    </div>
    <div class="tag-row hero-trust-band hero-trust-band-desktop" aria-label="站点维护状态">
      <span
        v-for="signal in trustSignals"
        :key="signal.label"
        class="tag moss hero-trust-item"
      >
        {{ signal.label }}
      </span>
    </div>
  </section>
</template>
