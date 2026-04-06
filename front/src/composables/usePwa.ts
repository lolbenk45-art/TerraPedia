import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const canInstall = ref(false)
const offlineReady = ref(false)
const needRefresh = ref(false)

let initialized = false
let deferredPrompt: BeforeInstallPromptEvent | null = null
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null

export const initPwa = () => {
  if (initialized || typeof window === 'undefined') {
    return
  }

  initialized = true

  updateServiceWorker = registerSW({
    immediate: true,
    onOfflineReady() {
      offlineReady.value = true
    },
    onNeedRefresh() {
      needRefresh.value = true
    },
  })

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    canInstall.value = true
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    canInstall.value = false
  })
}

export const usePwa = () => {
  const installApp = async () => {
    if (!deferredPrompt) {
      return
    }

    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome !== 'accepted') {
      return
    }

    deferredPrompt = null
    canInstall.value = false
  }

  const refreshApp = async () => {
    if (!updateServiceWorker) {
      needRefresh.value = false
      return
    }

    await updateServiceWorker(true)
    needRefresh.value = false
  }

  const dismissOfflineReady = () => {
    offlineReady.value = false
  }

  const dismissRefreshPrompt = () => {
    needRefresh.value = false
  }

  const dismissInstallPrompt = () => {
    canInstall.value = false
  }

  return {
    canInstall,
    offlineReady,
    needRefresh,
    installApp,
    refreshApp,
    dismissOfflineReady,
    dismissRefreshPrompt,
    dismissInstallPrompt,
  }
}
