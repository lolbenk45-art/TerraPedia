<template>
  <div class="min-h-screen flex items-center justify-center px-4" :style="{ backgroundColor: 'var(--bg-primary)' }">
    <div class="max-w-md w-full text-center">
      <!-- Error Icon with Animation -->
      <div class="mb-8 relative">
        <div class="error-icon-container">
          <svg class="error-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <path d="M12 7V13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <circle cx="12" cy="16" r="1" fill="currentColor"/>
          </svg>
        </div>
      </div>

      <!-- Error Title -->
      <h1 class="text-3xl font-bold mb-3" :style="{ color: 'var(--text-primary)' }">
        {{ title }}
      </h1>

      <!-- Error Message -->
      <p class="text-base mb-6 leading-relaxed" :style="{ color: 'var(--text-secondary)' }">
        {{ message }}
      </p>

      <!-- Error Details (if available) -->
      <div v-if="details" class="mb-6 p-4 rounded-lg text-left text-sm" :style="{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }">
        <p class="font-mono text-xs break-all">{{ details }}</p>
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
          重试
        </button>
        
        <button
          @click="onGoHome"
          class="px-6 py-3 rounded-xl font-semibold border-2 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
          :style="{ borderColor: 'var(--border-color)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          返回首页
        </button>
      </div>

      <!-- Help Tips -->
      <div class="mt-8 p-4 rounded-xl" :style="{ backgroundColor: 'var(--bg-secondary)' }">
        <h3 class="text-sm font-semibold mb-2" :style="{ color: 'var(--text-primary)' }">
          💡 可能的原因
        </h3>
        <ul class="text-xs space-y-1 text-left" :style="{ color: 'var(--text-muted)' }">
          <li class="flex items-start gap-2">
            <span class="text-red-500 mt-0.5">•</span>
            <span>网络连接不稳定或已断开</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-red-500 mt-0.5">•</span>
            <span>后端服务器未启动或响应超时</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-red-500 mt-0.5">•</span>
            <span>API 接口暂时不可用</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps<{
  error?: string | null
  title?: string
  message?: string
  details?: string
}>()

const emit = defineEmits<{
  (e: 'retry'): void
}>()

const router = useRouter()

const title = computed(() => {
  return props.title || '加载失败'
})

const message = computed(() => {
  if (props.message) {
    return props.message
  }
  
  if (!props.error) {
    return '未知错误，请稍后重试'
  }
  
  // 根据错误类型提供更友好的提示
  if (props.error.includes('网络')) {
    return props.error
  }
  
  if (props.error.includes('超时')) {
    return '请求超时，请检查网络连接后重试'
  }
  
  if (props.error.includes('404')) {
    return '请求的资源不存在'
  }
  
  if (props.error.includes('500')) {
    return '服务器内部错误，请稍后重试'
  }
  
  return props.error
})

const onRetry = () => {
  emit('retry')
}

const onGoHome = () => {
  router.push('/')
}
</script>

<style scoped>
.error-icon-container {
  width: 120px;
  height: 120px;
  margin: 0 auto;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05));
  animation: pulse 2s ease-in-out infinite;
}

.error-icon {
  width: 64px;
  height: 64px;
  color: #ef4444;
  animation: shake 0.5s ease-in-out;
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

@keyframes shake {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-5px);
  }
  75% {
    transform: translateX(5px);
  }
}
</style>
