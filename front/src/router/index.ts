import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'
import { useUserAuthStore } from '@/stores/userAuth'

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

export const setupRouterGuards = (pinia: Pinia, appRouter: Router = router) => {
  const userAuthStore = useUserAuthStore(pinia)

  appRouter.beforeEach(async (to) => {
    if (!userAuthStore.initialized) {
      await userAuthStore.init()
    }

    const meta = to.meta as Record<string, unknown>

    if (meta.requiresAuth && !userAuthStore.isAuthenticated) {
      return {
        path: '/login',
        query: { redirect: to.fullPath },
      }
    }

    if (meta.guestOnly && userAuthStore.isAuthenticated) {
      return { path: '/' }
    }

    return true
  })
}
