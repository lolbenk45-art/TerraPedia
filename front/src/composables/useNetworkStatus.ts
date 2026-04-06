import { ref, onMounted, onUnmounted } from 'vue'

export function useNetworkStatus() {
  const isOnline = ref(navigator.onLine)
  const lastOnlineTime = ref<Date | null>(null)

  const handleOnline = () => {
    isOnline.value = true
    lastOnlineTime.value = new Date()
  }

  const handleOffline = () => {
    isOnline.value = false
  }

  onMounted(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  })

  onUnmounted(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  })

  return {
    isOnline,
    lastOnlineTime
  }
}
