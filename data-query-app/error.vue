<script setup lang="ts">
type AdminError = {
  statusCode?: number | string
  message?: string
}

const props = defineProps<{
  error: AdminError
}>()

const statusCode = computed(() => Number(props.error?.statusCode || 500))
const isNotFound = computed(() => statusCode.value === 404)

const pageTitle = computed(() => (isNotFound.value ? '页面不存在' : '页面加载出错'))
const pageCopy = computed(() => (
  isNotFound.value
    ? '当前地址没有对应的管理页面。请检查链接，或回到仪表盘继续操作。'
    : '页面渲染时遇到异常。可以先回到仪表盘；若持续出现，请查看控制台错误并反馈。'
))

const goDashboard = () => clearError({ redirect: '/' })
</script>

<template>
  <main class="admin-error" role="alert">
    <div class="admin-error__card">
      <span class="admin-error__code">{{ statusCode }}</span>
      <h1>{{ pageTitle }}</h1>
      <p>{{ pageCopy }}</p>
      <p v-if="!isNotFound && props.error?.message" class="admin-error__detail">{{ props.error.message }}</p>
      <button type="button" class="admin-error__action" @click="goDashboard">返回仪表盘</button>
    </div>
  </main>
</template>

<style scoped>
.admin-error {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--color-bg, #f6f3ec);
  color: var(--color-text, #1c1917);
}

.admin-error__card {
  max-width: 460px;
  width: 100%;
  padding: 40px 36px;
  border: 1px solid var(--color-border, #e5e0d5);
  border-radius: var(--radius-lg, 14px);
  background: var(--color-bg-secondary, #fff);
  box-shadow: var(--shadow-xl, 0 24px 48px -24px rgba(0, 0, 0, 0.18));
  text-align: center;
}

.admin-error__code {
  display: inline-block;
  font-size: 44px;
  font-weight: 800;
  line-height: 1;
  color: var(--color-primary, #0d9488);
  margin-bottom: 12px;
}

.admin-error__card h1 {
  margin: 0 0 10px;
  font-size: 1.2rem;
}

.admin-error__card p {
  margin: 0 0 8px;
  color: var(--color-text-secondary, #57534e);
  line-height: 1.6;
}

.admin-error__detail {
  font-size: 12px;
  word-break: break-all;
  opacity: 0.75;
}

.admin-error__action {
  margin-top: 18px;
  padding: 10px 22px;
  border: none;
  border-radius: var(--radius-md, 10px);
  background: var(--color-primary, #0d9488);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.admin-error__action:hover {
  background: var(--color-primary-hover, #0e857b);
}
</style>
