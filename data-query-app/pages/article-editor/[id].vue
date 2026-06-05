<template>
  <div class="article-editor-route">
    <ClientOnly>
      <ArticleEditorWorkspace :article-id="articleId" />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  title: '文章编辑',
  navSection: '/articles',
})

const route = useRoute()
const articleId = computed(() => {
  const value = Number(route.params.id)
  return Number.isFinite(value) && value > 0 ? value : null
})
</script>
