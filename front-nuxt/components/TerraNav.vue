<script setup lang="ts">
import { useThemeStore } from '../stores/theme'
import type { SiteTheme } from '../stores/theme'

const route = useRoute()
const themeStore = useThemeStore()
const themeOptions = themeStore.themeOptions
const authStore = useUserAuthStore()
const notificationsStore = useUserNotificationsStore()
const preferencesStore = useUserPreferencesStore()

type ActiveMenu = 'resources' | 'account' | null

const primaryLinks = [
  { label: '首页', href: '/' },
  { label: '物品', href: '/items' },
  { label: 'NPC', href: '/npcs' },
  { label: 'Boss', href: '/bosses' },
  { label: '文章', href: '/articles' },
]

const resourceLinks = [
  { label: '制作路线', href: '/crafting', desc: '合成树、材料、制作站', icon: 'icon-crafting' },
  { label: '分类索引', href: '/categories', desc: '物品分类、阶段分类', icon: 'icon-category' },
  { label: '生态索引', href: '/biomes', desc: '区域、资源、敌怪', icon: 'icon-biome' },
  { label: 'Buff 图鉴', href: '/buffs', desc: '增益、减益、战前组合', icon: 'icon-buff' },
  { label: '套装路线', href: '/armor-sets', desc: '防具、职业、阶段', icon: 'icon-armor' },
  { label: '射弹行为', href: '/projectiles', desc: '弹道、碰撞、来源', icon: 'icon-projectile' },
  { label: '项目说明', href: '/about', desc: '数据来源、边界、说明', icon: 'icon-codex' },
]

const isActive = (href: string) => {
  if (href === '/') {
    return route.path === '/'
  }
  return route.path === href || route.path.startsWith(`${href}/`)
}

const activeMenu = ref<ActiveMenu>(null)
let closeTimer: ReturnType<typeof setTimeout> | undefined

const menuLinkTabIndex = (menu: Exclude<ActiveMenu, null>) => activeMenu.value === menu ? 0 : -1

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

const accountInitials = computed(() => {
  const source = authStore.displayName || authStore.user?.email || 'TP'
  return Array.from(source.trim()).slice(0, 2).join('').toUpperCase() || 'TP'
})

const unreadNotificationCount = computed(() => Number(notificationsStore.unreadCount || 0))
const navNotificationLabel = computed(() => unreadNotificationCount.value > 0 ? '新回复' : '消息')

const logout = async () => {
  await authStore.logout()
  closeMenu()
  if (route.path.startsWith('/user') && route.meta.requiresUserAuth) {
    await navigateTo('/user/login')
  }
}

const selectThemePreference = async (nextTheme: SiteTheme) => {
  themeStore.setTheme(nextTheme)

  if (!authStore.isAuthenticated) {
    return
  }

  try {
    await preferencesStore.save({
      themePreference: nextTheme,
    })
  } catch {
    // Keep the immediate local theme switch; the preferences store exposes the save error.
  }
}

onMounted(() => {
  void authStore.init().then(() => {
    if (authStore.isAuthenticated) {
      void preferencesStore.load()
      void notificationsStore.loadUnreadCount()
    }
  })
})

onBeforeUnmount(closeMenu)
</script>

<template>
  <header class="site-nav">
    <a class="site-logo" href="/" aria-label="TerraPedia 首页">
      <span class="logo-gem" aria-hidden="true">
        <img class="brand-logo-image" src="/brand/terrapedia-emblem-centered.png" alt="" />
      </span>
      <span class="site-logo-copy">
        <strong>TerraPedia</strong>
        <small>中文资料库</small>
      </span>
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
      <a class="icon-button search-action" href="/search" aria-label="搜索">
        <span class="sprite-icon icon-search compact" aria-hidden="true"></span>
      </a>

      <a
        class="nav-notification-link"
        :class="{ active: isActive('/user/notifications'), 'has-unread': unreadNotificationCount > 0 }"
        href="/user/notifications"
        :aria-label="unreadNotificationCount > 0 ? `通知中心，${unreadNotificationCount} 条未读消息` : '通知中心'"
      >
        <span class="sprite-icon icon-notification compact" aria-hidden="true"></span>
        <b>{{ navNotificationLabel }}</b>
        <em v-if="unreadNotificationCount" class="nav-notification-count">{{ unreadNotificationCount }}</em>
      </a>

      <a
        class="nav-user-article-link"
        :class="{ active: isActive('/user/articles') }"
        href="/user/articles"
        aria-label="我的文章"
      >
        <span class="sprite-icon icon-article compact" aria-hidden="true"></span>
        <b>我的文章</b>
      </a>

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
          aria-label="打开资料菜单"
          aria-haspopup="true"
          :aria-expanded="activeMenu === 'resources'"
          :class="{ active: resourceLinks.some((link) => isActive(link.href)) || activeMenu === 'resources' }"
          @click.stop="openMenu('resources')"
        >
          <span class="sprite-icon icon-codex mini" aria-hidden="true"></span>
          <span class="nav-menu-label">资料</span>
          <span class="nav-menu-caret" aria-hidden="true">▾</span>
        </button>
        <div class="nav-menu-hover-bridge" aria-hidden="true"></div>
        <div
          class="nav-menu-panel"
          :class="{ 'is-open': activeMenu === 'resources' }"
          :aria-hidden="activeMenu !== 'resources'"
        >
          <a class="nav-search-link" href="/search" :tabindex="activeMenu === 'resources' ? 0 : -1" @click="closeMenu">
            <span class="sprite-icon icon-search nav-card-icon" aria-hidden="true"></span>
            <span class="nav-card-copy">
              <b>全站检索</b>
              <span>搜索物品、NPC、Boss、攻略</span>
            </span>
          </a>
          <div class="nav-resource-grid">
            <a
              v-for="link in resourceLinks"
              :key="link.href"
              class="nav-resource-link"
              :class="{ active: isActive(link.href) }"
              :href="link.href"
              :tabindex="menuLinkTabIndex('resources')"
              @click="closeMenu"
            >
              <span class="sprite-icon nav-card-icon" :class="link.icon" aria-hidden="true"></span>
              <span class="nav-card-copy">
                <b>{{ link.label }}</b>
                <span>{{ link.desc }}</span>
              </span>
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
          :class="{
            active: isActive('/user') || activeMenu === 'account',
            'has-user-avatar': Boolean(authStore.user?.avatarUrl),
          }"
          href="/user"
          aria-label="TP 用户中心"
          aria-haspopup="true"
          :aria-expanded="activeMenu === 'account'"
        >
          <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" :alt="`${authStore.displayName} 的头像`" />
          <span v-else>{{ accountInitials }}</span>
          <em v-if="notificationsStore.unreadCount" class="account-unread-badge">{{ notificationsStore.unreadCount }}</em>
        </a>
        <div class="account-menu-hover-bridge" aria-hidden="true"></div>
        <div
          class="account-menu-panel"
          :class="{ 'is-open': activeMenu === 'account' }"
          :aria-hidden="activeMenu !== 'account'"
        >
          <div
            class="account-menu-head"
            :class="{
              'account-state-loading': authStore.loading,
              'account-state-authenticated': authStore.isAuthenticated,
              'account-state-guest': !authStore.loading && !authStore.isAuthenticated,
            }"
          >
            <span class="account-menu-avatar">
              <img v-if="authStore.user?.avatarUrl" :src="authStore.user.avatarUrl" :alt="`${authStore.displayName} 的头像`" />
              <span v-else class="sprite-icon icon-user compact" aria-hidden="true"></span>
            </span>
            <div>
              <b>{{ authStore.loading ? '正在检查登录状态' : authStore.displayName }}</b>
              <em>{{ authStore.isAuthenticated ? authStore.user?.email : '访客账号' }}</em>
            </div>
          </div>
          <div class="account-menu-grid" aria-label="用户快捷入口">
            <a href="/user" :tabindex="menuLinkTabIndex('account')" aria-label="用户中心" @click="closeMenu">
              <span class="sprite-icon icon-user menu-icon" aria-hidden="true"></span><b>用户中心</b>
            </a>
            <a href="/user/favorites" :tabindex="menuLinkTabIndex('account')" aria-label="收藏夹" @click="closeMenu">
              <span class="sprite-icon icon-favorites menu-icon" aria-hidden="true"></span><b>收藏夹</b>
            </a>
            <a href="/user/routes" :tabindex="menuLinkTabIndex('account')" aria-label="保存路线" @click="closeMenu">
              <span class="sprite-icon icon-crafting menu-icon" aria-hidden="true"></span><b>保存路线</b>
            </a>
            <a href="/user/notifications" :tabindex="menuLinkTabIndex('account')" aria-label="通知中心" @click="closeMenu">
              <span class="sprite-icon icon-notification menu-icon" aria-hidden="true"></span>
              <b>通知中心</b>
              <em v-if="notificationsStore.unreadCount">{{ notificationsStore.unreadCount }}</em>
            </a>
            <a href="/user/articles" :tabindex="menuLinkTabIndex('account')" aria-label="我的文章" @click="closeMenu">
              <span class="sprite-icon icon-article menu-icon" aria-hidden="true"></span><b>我的文章</b>
            </a>
            <a href="/user/settings" :tabindex="menuLinkTabIndex('account')" aria-label="账号设置" @click="closeMenu">
              <span class="sprite-icon icon-settings menu-icon" aria-hidden="true"></span><b>账号设置</b>
            </a>
          </div>
          <div class="account-theme-switcher">
            <span>主题</span>
            <div
              class="theme-toggle theme-selector account-theme-toggle"
              :class="{ 'is-switching': themeStore.isSwitching }"
              role="radiogroup"
              aria-label="主题"
            >
              <button
                v-for="option in themeOptions"
                :key="option.value"
                class="theme-choice"
                :class="[`theme-choice-${option.value}`, { active: themeStore.theme === option.value }]"
                type="button"
                role="radio"
                :aria-checked="themeStore.theme === option.value"
                :aria-label="`切换到${option.label}主题`"
                :disabled="preferencesStore.mutating"
                @click="selectThemePreference(option.value)"
              >
                <span aria-hidden="true"></span>
                <b>{{ option.shortLabel }}</b>
              </button>
            </div>
          </div>
          <a
            v-if="authStore.isAuthenticated"
            class="account-menu-logout"
            href="/user/login"
            :tabindex="menuLinkTabIndex('account')"
            @click.prevent="logout"
          >
            <span class="sprite-icon icon-close menu-icon" aria-hidden="true"></span><b>退出登录</b>
          </a>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.account-avatar-link {
  position: relative;
  overflow: hidden;
}

.account-unread-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  display: grid;
  min-width: 18px;
  height: 18px;
  place-items: center;
  border: 1px solid var(--index-line);
  border-radius: 999px;
  background: var(--accent-gold);
  color: #201607;
  font-size: 10px;
  font-style: normal;
  font-weight: 900;
  line-height: 1;
}

.account-avatar-link img,
.account-menu-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-avatar-link span {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
}

.account-menu-avatar {
  overflow: hidden;
}
</style>
