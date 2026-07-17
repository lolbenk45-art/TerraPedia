<template>
  <div class="error-page">
    <section class="error-card">
      <p class="error-card__code">{{ error?.statusCode ?? 500 }}</p>
      <h1 class="error-card__title">{{ isNotFound ? '页面不存在' : '页面出错了' }}</h1>
      <p class="error-card__message">
        {{ isNotFound ? '你访问的路径没有匹配的后台页面。' : (error?.statusMessage || '发生未预期的错误，请重试或返回首页。') }}
      </p>
      <button type="button" class="error-card__action" @click="handleClear">返回仪表盘</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const isNotFound = computed(() => props.error?.statusCode === 404)
const handleClear = () => clearError({ redirect: '/' })
</script>

<style scoped>
.error-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-1, #f7f6f3);
}
.error-card {
  text-align: center;
  padding: 3rem 3.5rem;
  border-radius: 16px;
  background: var(--color-surface-2, #fff);
  box-shadow: 0 8px 30px rgb(0 0 0 / 8%);
}
.error-card__code {
  font-size: 3rem;
  font-weight: 700;
  color: var(--color-primary, #0f766e);
  margin: 0;
}
.error-card__title {
  margin: 0.5rem 0 0.25rem;
}
.error-card__message {
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 1.5rem;
}
.error-card__action {
  padding: 0.6rem 1.4rem;
  border: none;
  border-radius: 999px;
  background: var(--color-primary, #0f766e);
  color: #fff;
  cursor: pointer;
}
</style>
