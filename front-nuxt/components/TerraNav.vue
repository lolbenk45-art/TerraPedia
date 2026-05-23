<script setup lang="ts">
import { useThemeStore } from '../stores/theme'

const route = useRoute()
const themeStore = useThemeStore()
const themeOptions = themeStore.themeOptions

type ActiveMenu = 'resources' | null

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

      <div
        class="theme-toggle theme-selector"
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
          @click="themeStore.setTheme(option.value)"
          @dblclick="themeStore.cycleTheme"
        >
          <span aria-hidden="true"></span>
          <b>{{ option.shortLabel }}</b>
        </button>
      </div>

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
          <span class="sprite-icon icon-codex mini" aria-hidden="true"></span>
          资料 <span aria-hidden="true">▾</span>
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
    </div>
  </header>
</template>
