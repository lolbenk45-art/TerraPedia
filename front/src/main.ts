import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { initPwa } from './composables/usePwa'
import { useAppStore } from './stores'
import { router, setupRouterGuards } from './router'

import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
useAppStore(pinia).initTheme()
setupRouterGuards(pinia)
app.use(router)

initPwa()

router.isReady().finally(() => {
  app.mount('#app')
})
