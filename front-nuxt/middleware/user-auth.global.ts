import { buildUserRedirectTarget } from '~/composables/useUserApi'

export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/user')) return

  const authStore = useUserAuthStore()
  if (!authStore.initialized) {
    await authStore.init()
  }

  const meta = to.meta as Record<string, unknown>
  if (meta.requiresUserAuth && !authStore.isAuthenticated) {
    return navigateTo({
      path: '/user/login',
      query: { redirect: to.fullPath },
    })
  }

  if (meta.guestOnly && authStore.isAuthenticated) {
    return navigateTo(buildUserRedirectTarget(to.query.redirect, '/user'))
  }
})
