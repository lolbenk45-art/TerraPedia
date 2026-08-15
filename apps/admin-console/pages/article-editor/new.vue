<template>
  <div class="page-wrap page-workspace article-editor-route">
    <ClientOnly>
      <ArticleEditorWorkspace />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  title: '文章编辑',
  navSection: '/articles',
})
</script>
