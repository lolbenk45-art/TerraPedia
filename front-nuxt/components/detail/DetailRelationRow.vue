<script setup lang="ts">
// 详情页共享掉落/关系行(WP-5 自 npcs 三份、bosses 两份逐字复制的行结构收敛)。
// variant='relation':npcs 掉落行(44px 图标框 + copy + strong 徽标);
// variant='loot':bosses 掉落行(直出图片 + copy + 证据行 + em 概率徽标)。
// 行样式仍由调用页 scoped CSS(经 :deep)与 detail-layout.css 提供;
// 根元素 class(source-row detail-relation-row / loot-row detail-loot-row 等)由调用方传入。
type Props = {
  variant?: 'relation' | 'loot'
  image?: string
  title: string
  fallbackIcon?: string
  href?: string
  meta?: string
  evidence?: string
  badge?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'relation',
  image: '',
  fallbackIcon: 'icon-items',
  href: '',
  meta: '',
  evidence: '',
  badge: '',
})

const fallbackGlyph = computed(() => Array.from(props.title.trim())[0] ?? '?')
</script>

<template>
  <div v-if="variant === 'loot'">
    <CommonPreviewImage
      :src="image"
      :alt="title"
      :fallback="fallbackGlyph"
      :fallback-icon="fallbackIcon"
      width="44"
      height="44"
    />
    <div class="detail-loot-copy">
      <NuxtLink v-if="href" :to="href" class="detail-loot-link">
        <b>{{ title }}</b>
      </NuxtLink>
      <b v-else>{{ title }}</b>
      <span>{{ meta }}</span>
      <span class="detail-loot-evidence">{{ evidence }}</span>
    </div>
    <em>{{ badge }}</em>
  </div>
  <div v-else>
    <span class="sprite-frame detail-relation-icon">
      <CommonPreviewImage :src="image" :alt="title" :fallback="fallbackGlyph" :fallback-icon="fallbackIcon" />
    </span>
    <div class="detail-relation-copy">
      <NuxtLink v-if="href" :to="href" class="detail-relation-link"><b>{{ title }}</b></NuxtLink>
      <b v-else>{{ title }}</b>
      <span>{{ meta }}</span>
    </div>
    <strong class="detail-relation-meta">{{ badge }}</strong>
  </div>
</template>

<style scoped>
/* variant=relation 行内样式(自 npcs/[id].vue scoped 原样迁入):
   组件级 scope 精确复刻原页面 scope 的命中范围(不深入 CommonPreviewImage 内部)。
   variant=loot 的行内样式仍由调用页(bosses/[id].vue)经 :deep 提供。 */
.detail-relation-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  overflow: hidden;
}

.detail-relation-copy {
  min-width: 0;
}

.detail-relation-copy b,
.detail-relation-copy span,
.detail-relation-meta {
  overflow-wrap: anywhere;
}

.detail-relation-copy span {
  display: block;
  line-height: 1.5;
}

.detail-relation-meta {
  align-self: center;
  border: 1px solid var(--index-line);
  border-radius: 999px;
  padding: 4px 8px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.detail-relation-link {
  color: var(--text-strong);
  font-weight: 900;
  text-decoration: none;
}

.detail-relation-link:hover {
  color: var(--gold);
}

@media (max-width: 720px) {
  .detail-relation-meta {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
