import { buildUserPostAuthRedirectTarget, buildUserRedirectTarget } from '~/composables/useUserApi'

export default defineNuxtRouteMiddleware(async (to) => {
  // 仅 /user 命名空间需要认证初始化;精确匹配 + 前缀,避免误伤 /users/* 公开作者页
  if (!(to.path === '/user' || to.path.startsWith('/user/'))) {
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
