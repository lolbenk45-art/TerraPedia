export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()
  authStore.pruneExpiredSession()

  if (to.path === '/login') {
    if (authStore.isAuthenticated) {
      return navigateTo('/')
    }
    return
  }

  if (!authStore.isAuthenticated) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath }
    })
  }

  if (!authStore.user) {
    const user = await authStore.fetchMe(true)
    if (!user) {
      return navigateTo({
        path: '/login',
        query: { redirect: to.fullPath }
      })
    }
  }
})
