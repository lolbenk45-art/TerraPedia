<script setup lang="ts">
definePageMeta({ publicScreenClass: 'entity-screen' })

import { isUnknownCategorySlug } from '~/utils/publicCategoryNavigation'

const route = useRoute()
const slug = computed(() => String(route.params.id ?? '').trim().toLowerCase())
const { data: categoryNavigation, pending, error, refresh } = await usePublicCategoryNavigation()

const numericCategoryId = computed(() => {
  const raw = String(route.params.id ?? '').trim()
  if (!/^\d+$/.test(raw)) return null
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
})

const redirectTargetSlug = computed(() => {
  if (!numericCategoryId.value || !categoryNavigation.value) return null
  const match = categoryNavigation.value.find((entry) => {
    if (Number((entry as { id?: number }).id) === numericCategoryId.value) return true
    const ids = Array.isArray((entry as { categoryIds?: number[] }).categoryIds)
      ? (entry as { categoryIds?: number[] }).categoryIds!
      : []
    return ids.some((value) => Number(value) === numericCategoryId.value)
  })
  return match?.slug ?? null
})

if (redirectTargetSlug.value) {
  if (import.meta.server) {
    const event = useRequestEvent()
    if (event) setResponseStatus(event, 301)
  }
  await navigateTo(`/categories/${redirectTargetSlug.value}`, { redirectCode: 301 })
}

const category = computed(() => categoryNavigation.value?.find((entry) => entry.slug === slug.value))
const unknownCategory = computed(() => isUnknownCategorySlug(
  categoryNavigation.value ?? [],
  slug.value,
  pending.value,
  Boolean(error.value),
))

if (unknownCategory.value) {
  throw createError({ statusCode: 404, statusMessage: 'Category not found' })
}

watch(unknownCategory, (isUnknown) => {
  if (isUnknown) {
    showError(createError({ statusCode: 404, statusMessage: 'Category not found' }))
  }
})

watch(redirectTargetSlug, (nextSlug) => {
  if (nextSlug) {
    void navigateTo(`/categories/${nextSlug}`, { redirectCode: 301 })
  }
})

useSeoMeta({
  title: () => category.value ? `TerraPedia · ${category.value.name}` : 'TerraPedia · 分类资料',
  description: () => category.value?.description || '按真实分类范围浏览 Terraria 物品资料。',
})
</script>

<template>
    <TerraBreadcrumb />

    <main class="support-layout detail-support-layout">
      <section v-if="pending" class="category-detail-hero support-panel" aria-busy="true">
        <div>
          <span class="eyebrow">Category</span>
          <h2>正在载入分类</h2>
          <p>正在解析真实分类范围、直属分类和物品总数。</p>
        </div>
      </section>

      <section v-else-if="error" class="category-detail-hero support-panel" role="alert">
        <div>
          <span class="eyebrow">Category unavailable</span>
          <h2>分类资料暂不可用</h2>
          <p>页面不会跳到未筛选的物品列表，请重新请求分类资料。</p>
          <button class="primary-button" type="button" @click="refresh()">重新加载</button>
        </div>
      </section>

      <template v-else-if="category">
        <section class="category-detail-hero support-panel">
          <div>
            <span class="eyebrow">Category · {{ category.slug }}</span>
            <h1>{{ category.name }}</h1>
            <p>{{ category.description || `当前分类包含 ${category.itemCount.toLocaleString('zh-CN')} 个物品。` }}</p>
            <div class="tag-row">
              <span class="tag gold">{{ category.itemCount.toLocaleString('zh-CN') }} 个物品</span>
              <span class="tag moss">{{ category.children.length }} 个直属分类</span>
              <span class="tag paper">真实分类范围</span>
            </div>
            <a class="primary-button" :href="category.itemPath">查看{{ category.name }}物品</a>
          </div>
          <div class="category-orbit">
            <span><span class="sprite-icon icon-category card-icon" aria-hidden="true"></span></span>
            <span><span class="sprite-icon icon-items card-icon" aria-hidden="true"></span></span>
            <span><span class="sprite-icon icon-search card-icon" aria-hidden="true"></span></span>
          </div>
        </section>

        <section v-if="category.children.length" class="category-detail-grid">
          <a
            v-for="child in category.children"
            :key="child.id"
            class="support-panel category-branch category-branch-card category-child-link"
            :href="child.itemPath"
          >
            <CommonPreviewImage
              class="category-child-image"
              :src="child.image"
              :alt="`${child.name}分类代表物品`"
              :fallback="child.name"
              fallback-icon="icon-category"
              width="72"
              height="72"
            />
            <span class="category-child-copy">
              <b>{{ child.name }}</b>
              <span>{{ child.code }}</span>
              <small>{{ child.itemCount.toLocaleString('zh-CN') }} 个物品</small>
            </span>
            <strong class="category-child-action">查看图鉴 <span aria-hidden="true">→</span></strong>
          </a>
        </section>

        <section v-else class="search-suggestion-band support-panel">
          <div><b>暂无直属分类</b><span>仍可进入完整的{{ category.name }}物品结果。</span></div>
        </section>
      </template>

      <section class="search-suggestion-band support-panel">
        <a href="/bosses"><b>按 Boss 推进</b><span>把分类放入战斗路线</span></a>
        <a href="/armor-sets"><b>按套装推进</b><span>职业套装与物品互相筛选</span></a>
        <a href="/buffs"><b>按 Buff 推进</b><span>战前组合和药水入口</span></a>
        <a href="/articles"><b>按攻略推进</b><span>阶段专题承接分类结果</span></a>
      </section>
    </main>
</template>
