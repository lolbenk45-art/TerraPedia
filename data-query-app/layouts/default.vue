<template>
  <div class="admin-layout" :class="{ 'admin-layout--mobile-nav-open': isMobileNavOpen }">
    <Transition name="sidebar-scrim">
      <button
        v-if="isMobile && isMobileNavOpen"
        type="button"
        class="overlay"
        aria-label="关闭导航菜单"
        @click="isMobileNavOpen = false"
      />
    </Transition>

    <aside
      class="sidebar"
      :class="{
        'sidebar--collapsed': desktopCollapsed,
        'sidebar--mobile': isMobile,
        'sidebar--open': isMobileNavOpen,
      }"
    >
      <div class="sidebar__head">
        <NuxtLink to="/" class="sidebar__brand" @click="handleNavClick">
          <span class="sidebar__brand-icon">
            <LibraryBig :size="20" />
          </span>
          <span v-if="!desktopCollapsed" class="sidebar__brand-copy">
            <strong>数据管理</strong>
            <small>TerraPedia Admin</small>
          </span>
        </NuxtLink>

        <button
          v-if="!isMobile"
          type="button"
          class="sidebar__toggle"
          :aria-label="sidebarToggleLabel"
          :title="sidebarToggleLabel"
          @click="toggleDesktopCollapse"
        >
          <component :is="desktopCollapsed ? PanelLeftOpen : PanelLeftClose" :size="18" />
        </button>
      </div>

      <div v-if="!desktopCollapsed" class="sidebar__summary">
        <span class="sidebar__summary-label">Workspace</span>
        <strong>{{ authStore.displayName }}</strong>
        <small>统一管理词条、配方与内容发布。</small>
      </div>

      <nav class="sidebar__nav" aria-label="后台导航">
        <section v-for="section in menuSections" :key="section.label" class="sidebar__section">
          <p v-if="!desktopCollapsed" class="sidebar__section-label">{{ section.label }}</p>

          <NuxtLink
            v-for="item in section.items"
            :key="item.path"
            :to="item.path"
            class="sidebar__link"
            :class="{ 'sidebar__link--active': isActive(item.path) }"
            :aria-current="isActive(item.path) ? 'page' : undefined"
            @click="handleNavClick"
          >
            <span class="sidebar__link-icon">
              <component :is="item.icon" :size="18" />
            </span>

            <span v-if="!desktopCollapsed" class="sidebar__link-copy">
              <span class="sidebar__link-text">{{ item.name }}</span>
              <small class="sidebar__link-hint">{{ item.hint }}</small>
            </span>

            <ChevronRight v-if="!desktopCollapsed" class="sidebar__link-chevron" :size="16" />

            <span v-if="desktopCollapsed" class="sidebar__link-tooltip">{{ item.name }}</span>
          </NuxtLink>
        </section>
      </nav>

      <div class="sidebar__foot">
        <div class="sidebar__status">
          <span class="sidebar__status-dot" />
          <div v-if="!desktopCollapsed" class="sidebar__status-copy">
            <strong>Admin Workspace</strong>
            <span>v1.0.0</span>
          </div>
        </div>
      </div>
    </aside>

    <div class="main" :class="{ 'main--narrow': desktopCollapsed }">
      <header class="header" :class="{ 'header--compact': headerVariant === 'compact' }">
        <div class="header__main">
          <div class="header__topline">
            <button
              v-if="isMobile"
              type="button"
              class="header__menu"
              aria-label="打开导航菜单"
              @click="isMobileNavOpen = true"
            >
              <Menu :size="18" />
            </button>

            <nav class="breadcrumb" aria-label="面包屑导航">
              <template v-for="(item, index) in breadcrumbItems" :key="`${item.label}-${item.to ?? index}`">
                <NuxtLink v-if="item.to && !item.current" :to="item.to" class="breadcrumb__link">
                  {{ item.label }}
                </NuxtLink>
                <span v-else class="breadcrumb__current">{{ item.label }}</span>
                <ChevronRight v-if="index < breadcrumbItems.length - 1" class="breadcrumb__separator" :size="14" />
              </template>
            </nav>
          </div>

          <h1 class="header__title">{{ currentPageTitle }}</h1>
        </div>

        <div class="header__actions">
          <ThemeSwitcher />

          <div ref="userMenuRef" class="header__user-wrap">
            <button
              type="button"
              class="header__user"
              aria-haspopup="menu"
              :aria-expanded="userOpen"
              @click="userOpen = !userOpen"
            >
              <span class="header__user-avatar">
                <UserRound :size="18" />
              </span>
              <span class="header__user-copy">
                <strong>{{ authStore.displayName }}</strong>
                <small>管理员</small>
              </span>
              <ChevronDown class="header__user-arrow" :class="{ 'header__user-arrow--open': userOpen }" :size="16" />
            </button>

            <Transition name="dropdown-fade">
              <div v-if="userOpen" class="header__dropdown" role="menu">
                <button type="button" class="header__dropdown-item" role="menuitem">
                  <Settings2 :size="16" />
                  <span>个人设置</span>
                </button>
                <button
                  type="button"
                  class="header__dropdown-item header__dropdown-item--danger"
                  role="menuitem"
                  @click="handleLogout"
                >
                  <LogOut :size="16" />
                  <span>退出登录</span>
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </header>

      <main class="content content-area">
        <slot />
      </main>
    </div>

    <AppToast />
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import {
  Activity,
  Beaker,
  ChevronDown,
  ChevronRight,
  Crown,
  Crosshair,
  Factory,
  FileSearch,
  FolderTree,
  FlaskConical,
  Globe2,
  Hammer,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  Newspaper,
  Palette,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ListChecks,
  Settings2,
  ShieldCheck,
  Sparkles,
  Shield,
  Shapes,
  Trees,
  UserRound,
  Users,
} from 'lucide-vue-next'

const SIDEBAR_STORAGE_KEY = 'terrapedia-admin-sidebar-collapsed'
const MOBILE_BREAKPOINT = 980

const route = useRoute()
const authStore = useAuthStore()

const isDesktopCollapsed = ref(false)
const isMobile = ref(false)
const isMobileNavOpen = ref(false)
const userOpen = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)

type BreadcrumbItem = {
  label: string
  to?: string
  current?: boolean
}

type MenuItem = {
  name: string
  path: string
  hint: string
  icon: Component
}

type MenuSection = {
  label: string
  items: MenuItem[]
}

type HeaderVariant = 'default' | 'compact'

const menuSections: MenuSection[] = [
  {
    label: 'Catalog',
    items: [
      { name: '仪表盘', path: '/', hint: '概览与快捷入口', icon: LayoutDashboard },
      { name: '物品管理', path: '/items', hint: '维护物品主数据', icon: Package },
      { name: '分类管理', path: '/categories', hint: '管理树状分类结构', icon: FolderTree },
      { name: 'Armor Set 管理', path: '/entities/armor-sets', hint: '套装与穿戴关系', icon: Shield },
      { name: '品质管理', path: '/item-rarities', hint: '稀有度与展示层级', icon: Palette },
    ],
  },
  {
    label: 'Crafting',
    items: [
      { name: '配方管理', path: '/recipes', hint: '编辑制作流程', icon: Hammer },
      { name: '制作站管理', path: '/recipes/stations', hint: '管理工作台与站点', icon: Factory },
      { name: '任意物品组', path: '/item-groups', hint: '维护 Any 类型来源组', icon: Shapes },
      { name: '中文配方导入', path: '/recipes/wiki-zh-import', hint: '查看 wiki_zh 导入状态', icon: Globe2 },
      { name: 'Shimmer Data', path: '/recipes/shimmer', hint: '管理微光转化与拆解规则', icon: Sparkles },
    ],
  },
  {
    label: 'Entities',
    items: [
      { name: '城镇 NPC 维护', path: '/entities/town-npcs', hint: '聚焦时期、功能与商店维护', icon: Users },
      { name: 'NPC 管理', path: '/entities/npcs', hint: '角色档案与分类', icon: Users },
      { name: 'Boss 管理', path: '/entities/bosses', hint: 'Boss 归组与阶段', icon: Crown },
      { name: 'Buff 管理', path: '/entities/buffs', hint: '效果与条件筛选', icon: FlaskConical },
      { name: 'Projectile 管理', path: '/entities/projectiles', hint: '射弹数据与行为', icon: Crosshair },
    ],
  },
  {
    label: 'World',
    items: [
      { name: '群系管理', path: '/entities/biomes', hint: '环境与区域信息', icon: Trees },
      { name: '世界条件', path: '/entities/world-contexts', hint: '时间与环境上下文', icon: Globe2 },
      { name: '条件词汇', path: '/entities/condition-terms', hint: '本地逻辑条件', icon: ListChecks },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: '爬取监控', path: '/operations/crawler-monitor', hint: '查看刷新进度与运行日志', icon: Activity },
      { name: '数据源验收', path: '/operations/data-source-acceptance', hint: '查看数据源替换准入状态', icon: ShieldCheck },
      { name: '盔甲属性表', path: '/operations/armor-attributes', hint: '核验单件装备字段', icon: FileSearch },
      { name: 'B 档域验收', path: '/operations/domain-acceptance', hint: '查看 B 档域自动维护证据', icon: ShieldCheck },
      { name: '监控测试页', path: '/operations/crawler-monitor-test', hint: '手动观察测试状态', icon: Beaker },
      { name: '用户管理', path: '/users', hint: '账号与权限', icon: UserRound },
      { name: '文章管理', path: '/articles', hint: '内容工作台', icon: Newspaper },
      { name: '数据查询', path: '/query', hint: '调试与只读查询', icon: FileSearch },
    ],
  },
]

const flatMenuItems = menuSections.flatMap((section) => section.items)

const desktopCollapsed = computed(() => !isMobile.value && isDesktopCollapsed.value)
const headerVariant = computed<HeaderVariant>(() => (route.meta.headerVariant === 'compact' ? 'compact' : 'default'))
const sidebarToggleLabel = computed(() => (desktopCollapsed.value ? '展开侧栏' : '折叠侧栏'))

const currentPageTitle = computed(() => {
  if (typeof route.meta.title === 'string' && route.meta.title.trim()) {
    return route.meta.title
  }

  const item = flatMenuItems.find((entry) => entry.path === route.path)
  return item?.name ?? '后台管理'
})

const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
  const items: BreadcrumbItem[] = []

  const pushItem = (item: BreadcrumbItem) => {
    const last = items[items.length - 1]
    if (last?.label === item.label && last?.to === item.to) return
    items.push(item)
  }

  pushItem({ label: '仪表盘', to: route.path === '/' ? undefined : '/' })

  const sectionPath = typeof route.meta.navSection === 'string' && route.meta.navSection.trim()
    ? route.meta.navSection.trim()
    : ''

  if (sectionPath && sectionPath !== '/') {
    const sectionItem = flatMenuItems.find((item) => item.path === sectionPath)
    pushItem({
      label: sectionItem?.name ?? sectionPath,
      to: route.path === sectionPath ? undefined : sectionPath,
    })
  }

  const currentPathItem = flatMenuItems.find((item) => item.path === route.path)
  if (currentPathItem && currentPathItem.path !== '/' && currentPathItem.path !== sectionPath) {
    pushItem({ label: currentPathItem.name })
  }

  const pageTitle = currentPageTitle.value.trim()
  if (pageTitle && pageTitle !== items[items.length - 1]?.label) {
    pushItem({ label: pageTitle })
  }

  return items.map((item, index) => ({
    ...item,
    current: index === items.length - 1,
    to: index === items.length - 1 ? undefined : item.to,
  }))
})

function isActive(path: string) {
  if (route.meta.navSection === path) return true
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function readDesktopCollapsePreference() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
}

function writeDesktopCollapsePreference(nextValue: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, nextValue ? '1' : '0')
}

function syncViewportState() {
  if (typeof window === 'undefined') return

  const nextIsMobile = window.innerWidth <= MOBILE_BREAKPOINT
  isMobile.value = nextIsMobile

  if (!nextIsMobile) {
    isMobileNavOpen.value = false
  }
}

function toggleDesktopCollapse() {
  const nextValue = !isDesktopCollapsed.value
  isDesktopCollapsed.value = nextValue
  writeDesktopCollapsePreference(nextValue)
  userOpen.value = false
}

function handleNavClick() {
  userOpen.value = false
  if (isMobile.value) {
    isMobileNavOpen.value = false
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (!target || !userMenuRef.value?.contains(target)) {
    userOpen.value = false
  }
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    userOpen.value = false
    isMobileNavOpen.value = false
  }
}

async function handleLogout() {
  userOpen.value = false
  await authStore.logout('/login')
}

watch(
  () => route.fullPath,
  () => {
    userOpen.value = false
    if (isMobile.value) {
      isMobileNavOpen.value = false
    }
  },
)

onMounted(() => {
  isDesktopCollapsed.value = readDesktopCollapsePreference()
  syncViewportState()

  window.addEventListener('resize', syncViewportState)
  window.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('keydown', handleWindowKeydown)
})

onUnmounted(() => {
  window.removeEventListener('resize', syncViewportState)
  window.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<style scoped>
.admin-layout {
  min-height: 100vh;
  display: flex;
}

.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 120;
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 32%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-sidebar) 98%, #000), var(--color-bg-sidebar));
  border-right: 1px solid rgba(255, 255, 255, 0.04);
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.02);
  transition:
    width var(--transition-base) var(--ease-standard),
    transform var(--transition-base) var(--ease-emphasis);
}

.sidebar--collapsed {
  width: var(--sidebar-collapsed-width);
}

.sidebar__head {
  min-height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 14px;
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  text-decoration: none;
}

.sidebar__brand-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 15px;
  color: var(--color-text-inverse);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
  box-shadow: 0 18px 28px -20px color-mix(in srgb, var(--color-primary) 48%, transparent);
}

.sidebar__brand-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.sidebar__brand-copy strong {
  color: var(--color-text-inverse);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.1;
}

.sidebar__brand-copy small {
  color: var(--color-text-sidebar-muted);
  font-size: 0.76rem;
  line-height: 1.2;
}

.sidebar__toggle,
.header__menu {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: color-mix(in srgb, var(--color-bg-sidebar-hover) 88%, transparent);
  color: var(--color-text-sidebar);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    transform var(--transition-fast) var(--ease-standard),
    background-color var(--transition-fast) var(--ease-standard),
    border-color var(--transition-fast) var(--ease-standard),
    color var(--transition-fast) var(--ease-standard);
}

.sidebar__toggle:hover,
.header__menu:hover {
  transform: translateY(-1px);
  border-color: rgba(95, 242, 223, 0.24);
  color: var(--color-text-inverse);
}

.sidebar__summary {
  margin: 0 14px 8px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.02);
  display: grid;
  gap: 4px;
}

.sidebar__summary-label {
  color: var(--color-text-sidebar-muted);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 800;
}

.sidebar__summary strong {
  color: var(--color-text-inverse);
  font-size: 0.96rem;
  line-height: 1.2;
}

.sidebar__summary small {
  color: var(--color-text-sidebar-muted);
  font-size: 0.78rem;
  line-height: 1.45;
}

.sidebar__nav {
  flex: 1;
  padding: 14px 12px 18px;
  overflow-y: auto;
  display: grid;
  gap: 16px;
}

.sidebar__section {
  display: grid;
  gap: 6px;
}

.sidebar__section-label {
  margin: 0;
  padding: 0 12px;
  color: var(--color-text-sidebar-muted);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 800;
}

.sidebar__link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  text-decoration: none;
  color: var(--color-text-sidebar);
  overflow: visible;
  transition:
    transform var(--transition-fast) var(--ease-standard),
    color var(--transition-fast) var(--ease-standard),
    background-color var(--transition-fast) var(--ease-standard),
    box-shadow var(--transition-fast) var(--ease-standard);
}

.sidebar__link::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: transparent;
  transition: background-color var(--transition-fast) var(--ease-standard);
}

.sidebar__link:hover::before {
  background: color-mix(in srgb, var(--color-bg-sidebar-hover) 78%, transparent);
}

.sidebar__link:hover {
  transform: translateX(2px);
  color: var(--color-text-inverse);
}

.sidebar__link--active {
  color: var(--color-text-inverse);
}

.sidebar__link--active::before {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 12%, transparent), transparent 78%),
    var(--color-bg-sidebar-track);
  box-shadow: inset 0 0 0 1px rgba(95, 242, 223, 0.08);
}

.sidebar__link-icon {
  position: relative;
  z-index: 1;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.sidebar__link--active .sidebar__link-icon {
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 20%, transparent), rgba(255, 255, 255, 0.02));
  border-color: rgba(95, 242, 223, 0.16);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.sidebar__link-copy {
  position: relative;
  z-index: 1;
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 2px;
}

.sidebar__link-text {
  color: currentColor;
  font-size: 0.93rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__link-hint {
  color: var(--color-text-sidebar-muted);
  font-size: 0.76rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar__link-chevron {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  color: var(--color-text-sidebar-muted);
  transition: transform var(--transition-fast) var(--ease-standard), color var(--transition-fast) var(--ease-standard);
}

.sidebar__link:hover .sidebar__link-chevron,
.sidebar__link--active .sidebar__link-chevron {
  transform: translateX(2px);
  color: var(--color-text-sidebar-active);
}

.sidebar__link-tooltip {
  position: absolute;
  left: calc(100% + 14px);
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  padding: 8px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-bg-sidebar) 92%, #000);
  color: var(--color-text-inverse);
  font-size: 0.82rem;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  box-shadow: var(--shadow-lg);
  transition: opacity var(--transition-fast) var(--ease-standard), transform var(--transition-fast) var(--ease-standard);
}

.sidebar--collapsed .sidebar__head {
  padding-inline: 12px;
  justify-content: center;
}

.sidebar--collapsed .sidebar__brand {
  justify-content: center;
}

.sidebar--collapsed .sidebar__nav {
  padding-inline: 10px;
}

.sidebar--collapsed .sidebar__link {
  justify-content: center;
  padding-inline: 0;
}

.sidebar--collapsed .sidebar__link:hover .sidebar__link-tooltip {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

.sidebar__foot {
  padding: 12px;
}

.sidebar__status {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: rgba(255, 255, 255, 0.015);
}

.sidebar__status-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-primary) 14%, transparent);
}

.sidebar__status-copy {
  display: grid;
  gap: 2px;
}

.sidebar__status-copy strong {
  color: var(--color-text-inverse);
  font-size: 0.84rem;
  line-height: 1.1;
}

.sidebar__status-copy span {
  color: var(--color-text-sidebar-muted);
  font-size: 0.76rem;
  line-height: 1.2;
}

.main {
  flex: none;
  width: calc(100% - var(--sidebar-width));
  min-height: 100vh;
  margin-left: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  transition:
    margin-left var(--transition-base) var(--ease-standard),
    width var(--transition-base) var(--ease-standard);
}

.main--narrow {
  width: calc(100% - var(--sidebar-collapsed-width));
  margin-left: var(--sidebar-collapsed-width);
}

.header {
  position: sticky;
  top: 0;
  z-index: 90;
  min-height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 28px;
  background: color-mix(in srgb, var(--color-surface-1) 92%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent);
  backdrop-filter: blur(12px);
}

.header--compact {
  gap: 14px;
  padding-block: 10px;
}

.header__main {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.header--compact .header__main {
  gap: 4px;
}

.header__topline {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header__menu {
  border-color: color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent);
  color: var(--color-text);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.breadcrumb__link,
.breadcrumb__current {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
  line-height: 1.2;
}

.breadcrumb__link {
  color: var(--color-text-secondary);
  text-decoration: none;
}

.breadcrumb__link:hover {
  color: var(--color-primary);
}

.breadcrumb__current {
  color: var(--color-primary);
  font-weight: 700;
}

.breadcrumb__separator {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.header__title {
  margin: 0;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: clamp(1.3rem, 1.18rem + 0.46vw, 1.9rem);
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.1;
}

.header--compact .header__title {
  color: var(--color-text-secondary);
  font-size: clamp(1.02rem, 0.98rem + 0.22vw, 1.18rem);
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.16;
}

.header__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}

.header__user-wrap {
  position: relative;
}

.header__user {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 6px 6px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-surface-1) 96%, transparent);
  color: var(--color-text);
  box-shadow: none;
  cursor: pointer;
  transition:
    transform var(--transition-fast) var(--ease-standard),
    border-color var(--transition-fast) var(--ease-standard),
    box-shadow var(--transition-fast) var(--ease-standard),
    background-color var(--transition-fast) var(--ease-standard);
}

.header__user:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--color-primary) 18%, var(--color-border));
  box-shadow: var(--shadow-surface-1);
}

.header__user-avatar {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 14%, transparent), var(--color-bg-tertiary));
  color: var(--color-primary);
}

.header__user-copy {
  display: grid;
  gap: 1px;
  text-align: left;
}

.header__user-copy strong {
  font-size: 0.86rem;
  line-height: 1.15;
}

.header__user-copy small {
  color: var(--color-text-secondary);
  font-size: 0.74rem;
  line-height: 1.2;
}

.header__user-arrow {
  color: var(--color-text-muted);
  transition: transform var(--transition-fast) var(--ease-standard), color var(--transition-fast) var(--ease-standard);
}

.header__user-arrow--open {
  transform: rotate(180deg);
  color: var(--color-primary);
}

.header__dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 184px;
  padding: 6px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--color-border) 92%, transparent);
  background: color-mix(in srgb, var(--color-surface-1) 96%, transparent);
  box-shadow: var(--shadow-floating);
  backdrop-filter: blur(12px);
}

.header__dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: background-color var(--transition-fast) var(--ease-standard), color var(--transition-fast) var(--ease-standard);
}

.header__dropdown-item:hover {
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-secondary));
  color: var(--color-primary);
}

.header__dropdown-item--danger:hover {
  background: color-mix(in srgb, var(--color-danger) 10%, var(--color-bg-secondary));
  color: var(--color-danger);
}

.content {
  flex: 1;
  padding: var(--content-gutter);
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 110;
  border: 0;
  background: var(--color-bg-sidebar-scrim);
  cursor: pointer;
}

@media (max-width: 980px) {
  .sidebar {
    transform: translateX(-100%);
    width: min(84vw, 320px);
    box-shadow: var(--shadow-xl);
  }

  .sidebar--open {
    transform: translateX(0);
  }

  .sidebar__toggle {
    display: none;
  }

  .main,
  .main--narrow {
    width: 100%;
    margin-left: 0;
  }

  .header {
    padding-inline: 18px;
  }

  .header__user-copy {
    display: none;
  }
}

@media (max-width: 640px) {
  .header {
    padding-inline: 14px;
  }

  .content {
    padding-inline: 12px;
  }

  .breadcrumb__link,
  .breadcrumb__current {
    max-width: 140px;
  }
}
</style>
