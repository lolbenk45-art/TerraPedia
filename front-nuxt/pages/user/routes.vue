<script setup lang="ts">
import type { UserSavedRoute } from '~/types/public-api'
import { formatDisplayDateTime } from '~/lib/displayDateTime.mjs'

definePageMeta({ requiresUserAuth: true })

const routesStore = useUserSavedRoutesStore()
const loadError = ref('')

const currentPage = computed(() => Number(routesStore.pagination.page || 1))
const totalPages = computed(() => Math.max(1, Math.ceil(Number(routesStore.pagination.total || 0) / Math.max(1, Number(routesStore.pagination.limit || 20)))))
const canGoPrevious = computed(() => currentPage.value > 1 && !routesStore.loading)
const canGoNext = computed(() => currentPage.value < totalPages.value && !routesStore.loading)

const loadRoutes = async (page = 1) => {
  loadError.value = ''
  try {
    await routesStore.loadList(page, routesStore.pagination.limit)
  } catch (exception: unknown) {
    loadError.value = exception instanceof Error ? exception.message : '路线列表加载失败。'
  }
}

const removeRoute = async (route: UserSavedRoute) => {
  loadError.value = ''
  try {
    await routesStore.remove(route)
    if (!routesStore.items.length && currentPage.value > 1) {
      await loadRoutes(currentPage.value - 1)
    }
  } catch (exception: unknown) {
    loadError.value = exception instanceof Error ? exception.message : '路线移除失败。'
  }
}

await loadRoutes()
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/routes · saved crafting</span>
          <h1>保存路线</h1>
          <p>这里显示当前账号保存过的制作路线，打开后会回到对应制作树。</p>
        </div>
        <a class="secondary-button" href="/user">返回用户中心</a>
      </div>
    </div>

    <main class="user-layout">
      <section v-if="routesStore.loading" class="favorite-board" aria-busy="true">
        <article v-for="index in 4" :key="index" class="favorite-card support-panel favorite-card-loading">
          <b>路线加载中</b>
          <span>正在读取当前账号路线</span>
          <em>...</em>
        </article>
      </section>

      <section v-else-if="loadError || routesStore.error" class="support-panel user-empty-state">
        <b>路线列表暂时无法加载</b>
        <span>{{ loadError || routesStore.error }}</span>
        <button class="secondary-button" type="button" @click="loadRoutes(currentPage)">重试</button>
      </section>

      <section v-else-if="!routesStore.items.length" class="support-panel user-empty-state">
        <b>还没有保存路线</b>
        <span>打开制作路线并保存后，会出现在这里。</span>
        <a href="/crafting">打开制作路线</a>
      </section>

      <section v-else class="favorite-board">
        <article v-for="route in routesStore.items" :key="String(route.id)" class="favorite-card support-panel route-card">
          <a class="favorite-card-link" :href="route.url">
            <span v-if="route.imageUrl" class="favorite-card-image">
              <img :src="route.imageUrl" :alt="route.title" />
            </span>
            <span v-else class="sprite-icon card-icon icon-crafting" aria-hidden="true"></span>
            <b>{{ route.title || `路线 ${route.targetId}` }}</b>
            <span>{{ route.updatedAt ? `更新于 ${formatDisplayDateTime(route.updatedAt)}` : '已保存制作路线' }}</span>
            <em>制作</em>
          </a>
          <button class="favorite-remove-button" type="button" :disabled="routesStore.mutating" @click="removeRoute(route)">
            移除
          </button>
        </article>
      </section>

      <nav v-if="routesStore.pagination.total > routesStore.pagination.limit" class="support-panel favorite-pagination" aria-label="路线分页">
        <button class="favorite-page-button" type="button" :disabled="!canGoPrevious" @click="loadRoutes(currentPage - 1)">上一页</button>
        <span>{{ currentPage }} / {{ totalPages }}</span>
        <button class="favorite-page-button" type="button" :disabled="!canGoNext" @click="loadRoutes(currentPage + 1)">下一页</button>
      </nav>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.route-card {
  position: relative;
}
</style>
