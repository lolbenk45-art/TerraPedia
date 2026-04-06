<template>
  <div class="app-shell">
    <Navbar />
    <main class="app-main">
      <router-view />
    </main>
    <AppFooter />
    <Transition name="pwa-banner">
      <div v-if="bannerState" class="pwa-banner">
        <div class="pwa-banner__content panel">
          <div class="pwa-banner__copy">
            <div class="pwa-banner__title">{{ bannerTitle }}</div>
            <div class="pwa-banner__text">{{ bannerText }}</div>
          </div>
          <div class="pwa-banner__actions">
            <button type="button" class="pwa-banner__btn pwa-banner__btn--ghost" @click="handleDismiss">
              稍后
            </button>
            <button
              v-if="bannerState === 'refresh'"
              type="button"
              class="pwa-banner__btn pwa-banner__btn--primary"
              @click="refreshApp"
            >
              立即更新
            </button>
            <button
              v-else-if="bannerState === 'install'"
              type="button"
              class="pwa-banner__btn pwa-banner__btn--primary"
              @click="installApp"
            >
              安装应用
            </button>
            <button
              v-else
              type="button"
              class="pwa-banner__btn pwa-banner__btn--primary"
              @click="dismissOfflineReady"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppFooter from './components/AppFooter.vue'
import Navbar from './components/Navbar.vue'
import { usePwa } from './composables/usePwa'

const {
  canInstall,
  dismissInstallPrompt,
  dismissOfflineReady,
  dismissRefreshPrompt,
  installApp,
  offlineReady,
  refreshApp,
  needRefresh,
} = usePwa()

const bannerState = computed<'refresh' | 'install' | 'offline' | null>(() => {
  if (needRefresh.value) return 'refresh'
  if (canInstall.value) return 'install'
  if (offlineReady.value) return 'offline'
  return null
})

const bannerTitle = computed(() => {
  if (bannerState.value === 'refresh') return '发现新版本'
  if (bannerState.value === 'install') return '支持安装到桌面'
  return '离线缓存已就绪'
})

const bannerText = computed(() => {
  if (bannerState.value === 'refresh') {
    return '刷新后会切换到最新缓存与最新页面资源。'
  }
  if (bannerState.value === 'install') {
    return '安装后可以像本地应用一样打开 TerraPedia，并获得更稳定的离线访问能力。'
  }
  return '常用页面和最近访问的数据已经可以在断网时继续浏览。'
})

const handleDismiss = () => {
  if (bannerState.value === 'refresh') {
    dismissRefreshPrompt()
    return
  }
  if (bannerState.value === 'install') {
    dismissInstallPrompt()
    return
  }
  dismissOfflineReady()
}
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: transparent;
  overflow-x: clip;
}

.app-main {
  position: relative;
  z-index: 1;
}

.pwa-banner-enter-active,
.pwa-banner-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.pwa-banner-enter-from,
.pwa-banner-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.pwa-banner {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 90;
  width: min(28rem, calc(100vw - 2rem));
}

.pwa-banner__content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.pwa-banner__copy {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.pwa-banner__title {
  font-weight: 700;
  color: var(--text-primary);
}

.pwa-banner__text {
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.pwa-banner__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.pwa-banner__btn {
  border: 1px solid transparent;
  border-radius: 0.85rem;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.pwa-banner__btn--ghost {
  border-color: var(--border-color);
  background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
  color: var(--text-primary);
}

.pwa-banner__btn--primary {
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  box-shadow: 0 14px 24px color-mix(in srgb, var(--accent-primary) 20%, transparent);
  color: #f8f2e8;
}

@media (max-width: 640px) {
  .pwa-banner {
    right: 0.75rem;
    left: 0.75rem;
    width: auto;
  }

  .pwa-banner__actions {
    flex-direction: column-reverse;
  }

  .pwa-banner__btn {
    width: 100%;
  }
}
</style>
