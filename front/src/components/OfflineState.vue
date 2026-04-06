<template>
  <div class="min-h-screen flex items-center justify-center px-4" :style="{ backgroundColor: 'var(--bg-primary)' }">
    <div class="max-w-lg w-full text-center">
      <!-- Offline Icon -->
      <div class="mb-8 relative">
        <div class="offline-icon-container">
          <svg class="offline-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 12.55C5.92 11.63 7.21 11.05 8.63 11.05C9.18 11.05 9.71 11.14 10.21 11.31" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M13.79 11.31C14.29 11.14 14.82 11.05 15.37 11.05C16.79 11.05 18.08 11.63 19 12.55" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M2 2L22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M6.5 6.5C7.5 6 8.5 6 9.5 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M14.5 6.5C15.5 6 16.5 6 17.5 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
      </div>

      <!-- Title -->
      <h1 class="text-3xl font-bold mb-3" :style="{ color: 'var(--text-primary)' }">
        离线模式
      </h1>

      <!-- Message -->
      <p class="text-base mb-6 leading-relaxed" :style="{ color: 'var(--text-secondary)' }">
        当前处于离线状态，正在展示缓存内容
      </p>

      <!-- Status Info -->
      <div class="mb-8 p-4 rounded-xl" :style="{ backgroundColor: 'var(--bg-secondary)' }">
        <div class="flex items-center justify-center gap-2 mb-2">
          <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <span class="text-sm font-medium" :style="{ color: 'var(--text-primary)' }">缓存数据可用</span>
        </div>
        <p class="text-xs" :style="{ color: 'var(--text-muted)' }">
          您可以浏览已缓存的物品数据和页面内容
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          @click="onRetry"
          class="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
          :style="{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          重新连接
        </button>
        
        <button
          @click="onViewCached"
          class="px-6 py-3 rounded-xl font-semibold border-2 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
          :style="{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          查看缓存
        </button>
      </div>

      <!-- Tips -->
      <div class="mt-8 p-4 rounded-xl" :style="{ backgroundColor: 'var(--bg-secondary)' }">
        <h3 class="text-sm font-semibold mb-2" :style="{ color: 'var(--text-primary)' }">
          💡 温馨提示
        </h3>
        <ul class="text-xs space-y-1 text-left" :style="{ color: 'var(--text-muted)' }">
          <li class="flex items-start gap-2">
            <span class="text-blue-500 mt-0.5">•</span>
            <span>部分最新数据可能无法实时更新</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-blue-500 mt-0.5">•</span>
            <span>恢复网络连接后将自动同步数据</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-blue-500 mt-0.5">•</span>
            <span>建议定期访问以更新缓存内容</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'viewCached'): void
}>()

const router = useRouter()

const onRetry = () => {
  emit('retry')
}

const onViewCached = () => {
  emit('viewCached')
  router.push('/')
}
</script>

<style scoped>
.offline-icon-container {
  width: 120px;
  height: 120px;
  margin: 0 auto;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.05));
  animation: pulse 2s ease-in-out infinite;
}

.offline-icon {
  width: 64px;
  height: 64px;
  color: #3b82f6;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.05);
    opacity: 0.8;
  }
}
</style>
