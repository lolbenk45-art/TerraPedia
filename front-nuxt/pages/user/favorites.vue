<script setup lang="ts">
import type { UserFavorite, UserFavoriteTypeFilter } from '~/types/public-api'
import { formatDisplayDateTime } from '~/lib/displayDateTime.mjs'

definePageMeta({ requiresUserAuth: true })

const favoritesStore = useUserFavoritesStore()
const preferencesStore = useUserPreferencesStore()
const loadError = ref('')

const tabs: Array<{ value: UserFavoriteTypeFilter, label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'items', label: '物品' },
  { value: 'articles', label: '文章' },
]

const totalPages = computed(() => Math.max(1, Math.ceil(Number(favoritesStore.pagination.total || 0) / Math.max(1, Number(favoritesStore.pagination.limit || 20)))))
const currentPage = computed(() => Number(favoritesStore.pagination.page || 1))
const canGoPrevious = computed(() => currentPage.value > 1 && !favoritesStore.loading)
const canGoNext = computed(() => currentPage.value < totalPages.value && !favoritesStore.loading)

const loadFavorites = async (type: UserFavoriteTypeFilter = favoritesStore.filter, page = 1) => {
  loadError.value = ''
  try {
    await favoritesStore.loadList(type, page, favoritesStore.pagination.limit)
  } catch (exception: unknown) {
    loadError.value = exception instanceof Error ? exception.message : '收藏列表加载失败。'
  }
}

const favoriteTypeLabel = (favorite: UserFavorite) => favorite.targetType === 'ARTICLE' ? '文章' : '物品'

const removeFavorite = async (favorite: UserFavorite) => {
  loadError.value = ''
  try {
    await favoritesStore.removeFavorite(favorite)
    if (!favoritesStore.items.length && currentPage.value > 1) {
      await loadFavorites(favoritesStore.filter, currentPage.value - 1)
    }
  } catch (exception: unknown) {
    loadError.value = exception instanceof Error ? exception.message : '移除收藏失败。'
  }
}

const previousPage = () => {
  if (!canGoPrevious.value) return
  void loadFavorites(favoritesStore.filter, currentPage.value - 1)
}

const nextPage = () => {
  if (!canGoNext.value) return
  void loadFavorites(favoritesStore.filter, currentPage.value + 1)
}

await preferencesStore.load().catch(() => undefined)
await loadFavorites(preferencesStore.preferences.defaultFavoritesFilter)
</script>

<template>
  <section class="screen entity-screen active">
    <TerraNav />
    <TerraBreadcrumb />

    <div class="page-head entity-head">
      <div class="page-head-inner">
        <div>
          <span class="eyebrow">/user/favorites · saved entries</span>
          <h1>收藏夹</h1>
          <p>这里集中显示当前账号保存的物品和文章；移除操作会立即同步到收藏状态。</p>
        </div>
        <a class="secondary-button" href="/user">返回用户中心</a>
      </div>
    </div>

    <main class="user-layout">
      <section class="support-panel favorite-toolbar" aria-label="收藏筛选">
        <div class="favorite-tabs" role="tablist" aria-label="收藏类型">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            class="favorite-tab"
            :class="{ active: favoritesStore.filter === tab.value }"
            type="button"
            role="tab"
            :aria-selected="favoritesStore.filter === tab.value"
            :disabled="favoritesStore.loading"
            @click="loadFavorites(tab.value)"
          >
            {{ tab.label }}
          </button>
        </div>
        <span class="favorite-count">{{ favoritesStore.pagination.total }} 个收藏</span>
      </section>

      <section v-if="favoritesStore.loading" class="favorite-board" aria-busy="true">
        <article v-for="index in 4" :key="index" class="favorite-card support-panel favorite-card-loading">
          <b>收藏加载中</b>
          <span>正在读取当前账号收藏</span>
          <em>...</em>
        </article>
      </section>

      <section v-else-if="loadError || favoritesStore.error" class="support-panel user-empty-state">
        <b>收藏列表暂时无法加载</b>
        <span>{{ loadError || favoritesStore.error }}</span>
        <button class="secondary-button" type="button" @click="loadFavorites(favoritesStore.filter)">重试</button>
      </section>

      <section v-else-if="!favoritesStore.items.length" class="support-panel user-empty-state">
        <b>还没有收藏</b>
        <span>在物品详情页点击收藏后，会出现在这里。</span>
        <a href="/items">浏览物品图鉴</a>
      </section>

      <section v-else class="favorite-board">
        <article
          v-for="favorite in favoritesStore.items"
          :key="`${favorite.targetType}:${favorite.targetId}`"
          class="favorite-card support-panel"
        >
          <a class="favorite-card-link" :href="favorite.url">
            <span v-if="favorite.imageUrl" class="favorite-card-image">
              <img :src="favorite.imageUrl" :alt="favorite.title" />
            </span>
            <span v-else class="sprite-icon card-icon" :class="favorite.targetType === 'ARTICLE' ? 'icon-article' : 'icon-items'" aria-hidden="true"></span>
            <b>{{ favorite.title || `收藏 ${favorite.targetId}` }}</b>
            <span>{{ favorite.createdAt ? `收藏于 ${formatDisplayDateTime(favorite.createdAt)}` : '已加入当前账号收藏' }}</span>
            <em>{{ favoriteTypeLabel(favorite) }}</em>
          </a>
          <button class="favorite-remove-button" type="button" :disabled="favoritesStore.mutating" @click="removeFavorite(favorite)">
            移除
          </button>
        </article>
      </section>

      <nav v-if="favoritesStore.pagination.total > favoritesStore.pagination.limit" class="support-panel favorite-pagination" aria-label="收藏分页">
        <button class="favorite-page-button" type="button" :disabled="!canGoPrevious" @click="previousPage">
          上一页
        </button>
        <span>{{ currentPage }} / {{ totalPages }}</span>
        <button class="favorite-page-button" type="button" :disabled="!canGoNext" @click="nextPage">
          下一页
        </button>
      </nav>
    </main>

    <TerraFooter />
  </section>
</template>

<style scoped>
.favorite-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.favorite-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.favorite-tab,
.favorite-remove-button,
.favorite-page-button {
  border: 1px solid var(--index-line);
  border-radius: 999px;
  background: var(--index-surface);
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
}

.favorite-tab {
  min-height: 34px;
  padding: 0 14px;
}

.favorite-tab.active {
  border-color: color-mix(in srgb, var(--accent-gold) 48%, var(--index-line));
  color: var(--text-strong);
}

.favorite-count {
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}

.favorite-card {
  position: relative;
  gap: 8px;
}

.favorite-card-link {
  display: grid;
  gap: 8px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.favorite-card-image {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  overflow: hidden;
  border: 1px solid var(--index-line);
  border-radius: 8px;
  background: var(--index-surface);
}

.favorite-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.favorite-remove-button {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 7px 10px;
}

.favorite-pagination {
  display: flex;
  justify-content: center;
  gap: 12px;
  align-items: center;
  color: var(--text-subtle);
  font-size: 12px;
  font-weight: 900;
}

.favorite-page-button {
  min-height: 34px;
  padding: 0 14px;
}

.favorite-page-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.favorite-card-loading {
  opacity: 0.72;
}

@media (max-width: 640px) {
  .favorite-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .favorite-count {
    white-space: normal;
  }
}
</style>
