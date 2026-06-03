import { buildUserPostAuthRedirectTarget, buildUserRedirectTarget } from '~/composables/useUserApi'

export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/user')) {
    return
  }

  const authStore = useUserAuthStore()
  await authStore.init()

  if (to.meta.requiresUserAuth && !authStore.isAuthenticated) {
    const redirect = encodeURIComponent(buildUserRedirectTarget(to.fullPath, '/user'))
    return navigateTo(`/user/login?redirect=${redirect}`)
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return navigateTo(buildUserPostAuthRedirectTarget(to.query.redirect, '/user'))
  }
})
