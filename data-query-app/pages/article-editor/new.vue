<template>
  <ClientOnly>
    <ArticleEditorWorkspace />
  </ClientOnly>
</template>

<script setup lang="ts">
definePageMeta({
  title: '文章编辑',
  navSection: '/articles',
})
</script>
