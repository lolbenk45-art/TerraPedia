<script setup lang="ts">
type TerraError = {
  statusCode?: number | string
}

const props = defineProps<{
  error: TerraError
}>()

const statusCode = computed(() => Number(props.error?.statusCode || 500))
const isNotFound = computed(() => statusCode.value === 404)

const pageTitle = computed(() => isNotFound.value ? '这条资料路线还没开放' : '资料路线暂时中断')
const pageCopy = computed(() => (
  isNotFound.value
    ? '当前地址没有对应的 TerraPedia 页面。可以回到资料中枢，或从图鉴与搜索重新进入。'
    : '页面加载时遇到异常。先回到稳定入口继续浏览，稍后再尝试当前地址。'
))

const recoveryLinks = [
  { label: '返回首页', href: '/', desc: '回到 TerraPedia 资料中枢' },
  { label: '物品图鉴', href: '/items', desc: '从物品墙重新查找资料' },
  { label: '搜索资料', href: '/search', desc: '搜索物品、NPC、Boss 和攻略' },
]

const goHome = () => clearError({ redirect: '/' })
</script>

<template>
  <section class="screen error-screen active">
    <TerraNav />

    <main class="error-layout">
      <section class="error-hero" aria-labelledby="error-page-title">
        <div class="error-status-card" aria-hidden="true">
          <span class="error-status-code">{{ statusCode }}</span>
          <span class="error-map-mark"></span>
        </div>

        <div class="error-copy">
          <span class="eyebrow">TERRAPEDIA ROUTE CHECK</span>
          <h1 id="error-page-title">{{ pageTitle }}</h1>
          <p>{{ pageCopy }}</p>
          <div class="error-actions">
            <button type="button" @click="goHome">返回首页</button>
            <a href="/search">搜索资料</a>
          </div>
        </div>
      </section>

      <section class="error-route-grid" aria-label="可继续浏览的入口">
        <a
          v-for="link in recoveryLinks"
          :key="link.href"
          class="error-route-card"
          :href="link.href"
        >
          <b>{{ link.label }}</b>
          <span>{{ link.desc }}</span>
        </a>
      </section>
    </main>

    <TerraFooter />
  </section>
</template>
