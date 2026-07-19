<script setup lang="ts">
definePageMeta({ publicScreenClass: 'entity-screen' })

const { data: categoryNavigation, pending, error, refresh } = await usePublicCategoryNavigation()

const navigationEntries = computed(() => categoryNavigation.value ?? [])
const weaponEntry = computed(() => navigationEntries.value.find((entry) => entry.filterKey === 'weapon'))
const categoryGroups = computed(() => [
  { key: 'combat', label: '战斗', caption: '武器 / 防具 / 药水', entries: navigationEntries.value.slice(0, 3) },
  { key: 'craft-build', label: '制作与建造', caption: '材料 / 家具 / 工具', entries: navigationEntries.value.slice(3, 6) },
])

const iconClassBySlug: Record<string, string> = {
  weapons: 'sprite-icon icon-items card-icon',
  armor: 'sprite-icon icon-armor card-icon',
  potions: 'sprite-icon icon-buff card-icon',
  materials: 'sprite-icon icon-material card-icon',
  furniture: 'sprite-icon icon-category card-icon',
  tools: 'sprite-icon icon-crafting card-icon',
}

const categoryIconClass = (slug: string) => iconClassBySlug[slug] ?? 'sprite-icon icon-category card-icon'

useSeoMeta({
  title: 'TerraPedia · 分类索引',
  description: '从真实 Terraria 分类资料进入武器、防具、药水、材料、家具与工具图鉴。',
})
</script>

<template>
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/categories · real item taxonomy</span>
          <h1>分类索引</h1>
          <p>把玩家最常用的真实图鉴分类组织成可扫描的资料地图。</p>
        </div>
        <a v-if="weaponEntry" class="primary-button" :href="weaponEntry.categoryPath">查看{{ weaponEntry.name }}分类</a>
      </div>
    </div>

    <main class="support-layout discovery-categories-page">
      <section v-if="pending" class="category-map category-atlas support-panel" aria-busy="true">
        <div class="category-axis category-atlas-axis">
          <span>图鉴结构</span>
          <h2>正在载入真实分类</h2>
          <p>正在从资料库解析分类范围与物品总数。</p>
        </div>
      </section>

      <section v-else-if="error" class="category-map category-atlas support-panel" role="alert">
        <div class="category-axis category-atlas-axis">
          <span>分类资料暂不可用</span>
          <h2>无法载入真实分类</h2>
          <p>页面不会显示静态总数或示例分类，请重新请求资料。</p>
          <button class="primary-button" type="button" @click="refresh()">重新加载</button>
        </div>
      </section>

      <section v-else class="category-map category-atlas support-panel">
        <div class="category-axis category-atlas-axis">
          <span>图鉴结构</span>
          <h2>从大类到路线入口</h2>
          <p>从战斗、制作与建造大类进入当前资料库的物品分类。</p>
          <div class="category-axis-branches">
            <template v-for="(group, index) in categoryGroups" :key="group.key">
              <a
                v-if="group.entries[0]"
                :class="{ active: index === 0 }"
                :href="group.entries[0].categoryPath"
              >
                <b>{{ group.label }}轴</b>
                <span>{{ group.caption }}</span>
              </a>
            </template>
          </div>
        </div>

        <div class="category-column-grid category-branch-grid">
          <div v-for="group in categoryGroups" :key="group.key" class="category-branch-cluster">
            <span class="category-cluster-label">{{ group.label }}</span>
            <a
              v-for="(entry, index) in group.entries"
              :key="entry.slug"
              class="category-node category-branch-card"
              :class="{ active: group.key === 'combat' && index === 0 }"
              :href="entry.categoryPath"
            >
              <span :class="categoryIconClass(entry.slug)" aria-hidden="true"></span>
              <b>{{ entry.name }}</b>
              <span>{{ entry.description || `${entry.children.length} 个直属分类` }}</span>
              <em>{{ entry.itemCount.toLocaleString('zh-CN') }}</em>
            </a>
          </div>
        </div>
      </section>

      <section class="taxonomy-band category-entry-band">
        <article class="support-panel category-entry-card">
          <span class="eyebrow">推荐入口</span>
          <h3>按阶段看</h3>
          <p>开荒、Boss 前、困难模式、月亮领主前，每个阶段都有不同的分类优先级。</p>
          <b>4 组路线</b>
        </article>
        <article class="support-panel category-entry-card">
          <span class="eyebrow">推荐入口</span>
          <h3>按职业看</h3>
          <p>近战、射手、法师、召唤的装备路线需要跨分类浏览。</p>
          <b>4 个职业</b>
        </article>
        <article class="support-panel category-entry-card">
          <span class="eyebrow">推荐入口</span>
          <h3>按用途看</h3>
          <p>战斗、建造、探索、事件准备，适合从分类直接跳到专题。</p>
          <b>6 类用途</b>
        </article>
      </section>
    </main>
</template>
