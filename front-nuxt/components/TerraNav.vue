<script setup lang="ts">
const route = useRoute()
const themeStore = useThemeStore()

type ActiveMenu = 'resources' | 'account' | null

const primaryLinks = [
  { label: '首页', href: '/' },
  { label: '物品', href: '/items' },
  { label: 'NPC', href: '/npcs' },
  { label: 'Boss', href: '/bosses' },
  { label: '文章', href: '/articles' },
]

const resourceLinks = [
  { label: '制作路线', href: '/crafting', desc: '合成树、材料、制作站' },
  { label: '分类索引', href: '/categories', desc: '物品分类、阶段分类' },
  { label: '生态索引', href: '/biomes', desc: '区域、资源、敌怪' },
  { label: 'Buff 图鉴', href: '/buffs', desc: '增益、减益、战前组合' },
  { label: '套装路线', href: '/armor-sets', desc: '防具、职业、阶段' },
  { label: '射弹行为', href: '/projectiles', desc: '弹道、碰撞、来源' },
]

const isActive = (href: string) => {
  if (href === '/') {
    return route.path === '/'
  }
  return route.path === href || route.path.startsWith(`${href}/`)
}

const activeMenu = ref<ActiveMenu>(null)
let closeTimer: ReturnType<typeof setTimeout> | undefined

const clearCloseTimer = () => {
  if (!closeTimer) {
    return
  }

  clearTimeout(closeTimer)
  closeTimer = undefined
}

const openMenu = (menu: Exclude<ActiveMenu, null>) => {
  clearCloseTimer()
  activeMenu.value = menu
}

const scheduleCloseMenu = (menu: Exclude<ActiveMenu, null>) => {
  clearCloseTimer()
  closeTimer = setTimeout(() => {
    if (activeMenu.value === menu) {
      activeMenu.value = null
    }
    closeTimer = undefined
  }, 140)
}

const closeMenu = () => {
  clearCloseTimer()
  activeMenu.value = null
}

onBeforeUnmount(closeMenu)
</script>

<template>
  <header class="site-nav">
    <a class="site-logo" href="/">
      <span class="logo-gem" aria-hidden="true"></span>
      <span><strong>TerraPedia</strong><small>泰拉瑞亚中文资料库</small></span>
    </a>

    <nav class="site-links" aria-label="主导航">
      <a
        v-for="link in primaryLinks"
        :key="link.href"
        class="site-link"
        :class="{ active: isActive(link.href) }"
        :href="link.href"
      >{{ link.label }}</a>
    </nav>

    <div class="site-actions">
      <a class="icon-button search-action" href="/search" aria-label="搜索">⌕</a>

      <button
        class="theme-toggle"
        type="button"
        :aria-label="themeStore.theme === 'dark' ? '切换浅色风格' : '切换深色风格'"
        :aria-pressed="themeStore.isLight"
        @click="themeStore.toggleTheme"
      >
        <span aria-hidden="true"></span>
        <b>{{ themeStore.theme === 'dark' ? '浅' : '深' }}</b>
      </button>

      <div
        class="nav-menu"
        @mouseenter="openMenu('resources')"
        @mouseleave="scheduleCloseMenu('resources')"
        @focusin="openMenu('resources')"
        @focusout="scheduleCloseMenu('resources')"
        @keydown.esc="closeMenu"
      >
        <button
          class="nav-menu-text-trigger"
          type="button"
          aria-haspopup="true"
          :aria-expanded="activeMenu === 'resources'"
          :class="{ active: resourceLinks.some((link) => isActive(link.href)) || activeMenu === 'resources' }"
        >
          资料 <span aria-hidden="true">▾</span>
        </button>
        <div class="nav-menu-hover-bridge" aria-hidden="true"></div>
        <div
          class="nav-menu-panel"
          :class="{ 'is-open': activeMenu === 'resources' }"
        >
          <a class="nav-search-link" href="/search" @click="closeMenu">
            <b>全站检索</b>
            <span>搜索物品、NPC、Boss、攻略</span>
          </a>
          <div class="nav-resource-grid">
            <a
              v-for="link in resourceLinks"
              :key="link.href"
              class="nav-resource-link"
              :class="{ active: isActive(link.href) }"
              :href="link.href"
              @click="closeMenu"
            >
              <b>{{ link.label }}</b>
              <span>{{ link.desc }}</span>
            </a>
          </div>
        </div>
      </div>

      <div
        class="account-menu"
        @mouseenter="openMenu('account')"
        @mouseleave="scheduleCloseMenu('account')"
        @focusin="openMenu('account')"
        @focusout="scheduleCloseMenu('account')"
        @keydown.esc="closeMenu"
      >
        <a
          class="account-avatar-link"
          :class="{ active: isActive('/user') || activeMenu === 'account' }"
          href="/user"
          aria-label="用户中心"
          aria-haspopup="true"
          :aria-expanded="activeMenu === 'account'"
        >TP</a>
        <div class="account-menu-hover-bridge" aria-hidden="true"></div>
        <div
          class="account-menu-panel"
          :class="{ 'is-open': activeMenu === 'account' }"
        >
          <div class="account-menu-head">
            <span>TP</span>
            <div><b>访客用户</b><em>Preview account</em></div>
          </div>
          <a href="/user" @click="closeMenu"><b>用户中心</b><span>收藏、投稿、设置入口</span></a>
          <a href="/user/favorites" @click="closeMenu"><b>收藏夹</b><span>保存物品和路线</span></a>
          <a href="/user/articles" @click="closeMenu"><b>我的文章</b><span>草稿和投稿状态</span></a>
          <a href="/user/settings" @click="closeMenu"><b>账号设置</b><span>显示偏好和公开资料</span></a>
        </div>
      </div>
    </div>
  </header>
</template>
