<template>
  <div class="min-h-screen flex items-center justify-center" :style="{ backgroundColor: 'var(--bg-primary)' }">
    <div class="text-center">
      <!-- Loading Animation -->
      <div class="relative w-24 h-24 mx-auto mb-6">
        <!-- Outer Ring -->
        <div class="absolute inset-0 rounded-full border-4" :style="{ borderColor: 'var(--bg-tertiary)' }"></div>
        <div class="absolute inset-0 rounded-full border-4 border-t-transparent animate-spin" 
             :style="{ borderTopColor: 'var(--accent-primary)', borderRightColor: 'var(--accent-secondary)' }">
        </div>
        
        <!-- Inner Pulse -->
        <div class="absolute inset-4 rounded-full animate-pulse" 
             :style="{ backgroundColor: 'rgba(var(--accent-primary-rgb), 0.2)' }">
        </div>
        
        <!-- Center Icon -->
        <div class="absolute inset-0 flex items-center justify-center">
          <svg class="w-8 h-8 animate-bounce" :style="{ color: 'var(--accent-primary)' }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      </div>
      
      <!-- Loading Text -->
      <h2 class="text-xl font-semibold mb-2" :style="{ color: 'var(--text-primary)' }">
        {{ message }}
      </h2>
      
      <!-- Subtitle -->
      <p v-if="subtitle" class="text-sm" :style="{ color: 'var(--text-secondary)' }">
        {{ subtitle }}
      </p>
      
      <!-- Progress Bar (optional) -->
      <div v-if="showProgress" class="mt-6 w-48 h-1 mx-auto rounded-full overflow-hidden" :style="{ backgroundColor: 'var(--bg-tertiary)' }">
        <div class="h-full rounded-full transition-all duration-300"
             :style="{ 
               width: `${progress}%`,
               background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))'
             }">
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  message?: string
  subtitle?: string
  showProgress?: boolean
  progress?: number
}>()

withDefaults(defineProps<{
  message: string
  subtitle?: string
  showProgress?: boolean
  progress?: number
}>(), {
  message: '加载中...',
  subtitle: '',
  showProgress: false,
  progress: 0
})
</script>

<style scoped>
@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(0.95);
  }
}
</style>
