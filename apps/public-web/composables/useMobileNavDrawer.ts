// 移动导航抽屉的开合状态与 DOM 副作用(body 滚动锁、全局 Esc 监听、路由变更自动关闭)。
// 副作用集中在这里,TerraNav 组件本身不直接访问 document。
export const useMobileNavDrawer = () => {
  const route = useRoute()
  const mobileNavOpen = ref(false)

  const toggleMobileNav = () => {
    mobileNavOpen.value = !mobileNavOpen.value
  }

  const closeMobileNav = () => {
    mobileNavOpen.value = false
  }

  const syncScrollLock = (open: boolean) => {
    if (!import.meta.client) return
    document.body.style.overflow = open ? 'hidden' : ''
  }

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeMobileNav()
    }
  }

  watch(mobileNavOpen, (open) => {
    syncScrollLock(open)
    if (!import.meta.client) return
    // Esc 需要全局监听:打开抽屉后焦点仍在汉堡按钮上,不会经过抽屉内元素。
    if (open) {
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  })

  watch(() => route.fullPath, closeMobileNav)

  onBeforeUnmount(() => {
    syncScrollLock(false)
    if (import.meta.client) {
      document.removeEventListener('keydown', onKeydown)
    }
  })

  return { mobileNavOpen, toggleMobileNav, closeMobileNav }
}
