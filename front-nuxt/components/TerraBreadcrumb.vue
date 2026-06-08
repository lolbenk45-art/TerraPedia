<script setup lang="ts">
const route = useRoute()

type Crumb = {
  label: string
  href?: string
}

const props = withDefaults(defineProps<{
  items?: Crumb[]
  mode?: 'trail' | 'back'
  backHref?: string
  backLabel?: string
  ariaLabel?: string
}>(), {
  mode: 'trail',
  ariaLabel: '当前位置',
})

const routeLabels: Record<string, string> = {
  '/': '首页',
  '/home-hero-options': '首页首屏',
  '/search': '全站检索',
  '/items': '物品图鉴',
  '/items/terra-blade': '泰拉刃',
  '/crafting': '制作路线',
  '/categories': '分类索引',
  '/categories/weapons': '武器分类',
  '/categories/armor': '防具分类',
  '/categories/materials': '材料分类',
  '/categories/furniture': '家具分类',
  '/categories/potions': '药水分类',
  '/categories/tools': '工具分类',
  '/biomes': '生态索引',
  '/biomes/jungle': '丛林',
  '/articles': '资料手札',
  '/articles/melee-progression': '近战装备推进路线',
  '/articles/eye-prep': '克苏鲁之眼准备',
  '/articles/jungle-route': '丛林探索路线',
  '/npcs': 'NPC 图鉴',
  '/npcs/guide': '向导',
  '/bosses': 'Boss 路线',
  '/bosses/eye-of-cthulhu': '克苏鲁之眼',
  '/bosses/moon-lord': '月亮领主',
  '/buffs': 'Buff 图鉴',
  '/buffs/ironskin': '铁皮',
  '/projectiles': '射弹行为',
  '/armor-sets': '套装路线',
  '/about': '项目说明',
  '/user': '用户中心',
  '/user/login': '登录',
  '/user/register': '注册',
  '/user/forgot-password': '找回密码',
  '/user/articles': '我的文章',
  '/user/articles/new': '新建文章',
  '/user/favorites': '收藏夹',
  '/user/routes': '保存路线',
  '/user/notifications': '通知中心',
  '/user/settings': '账号设置',
}

const segmentLabels: Record<string, string> = {
  search: '全站检索',
  'home-hero-options': '首页首屏',
  items: '物品图鉴',
  crafting: '制作路线',
  categories: '分类索引',
  biomes: '生态索引',
  articles: '资料手札',
  npcs: 'NPC 图鉴',
  bosses: 'Boss 路线',
  buffs: 'Buff 图鉴',
  projectiles: '射弹行为',
  'armor-sets': '套装路线',
  about: '项目说明',
  users: '用户主页',
  user: '用户中心',
  login: '登录',
  register: '注册',
  'forgot-password': '找回密码',
  favorites: '收藏夹',
  routes: '保存路线',
  notifications: '通知中心',
  settings: '账号设置',
  new: '新建文章',
}

const hiddenTrailRoutes = new Set([
  '/',
  '/home-hero-options',
  '/about',
  '/search',
  '/crafting',
  '/items',
  '/articles',
  '/categories',
  '/biomes',
  '/bosses',
  '/buffs',
  '/npcs',
  '/projectiles',
  '/armor-sets',
  '/user',
  '/user/login',
  '/user/register',
  '/user/forgot-password',
  '/user/articles',
  '/user/favorites',
  '/user/routes',
  '/user/notifications',
  '/user/settings',
  '/user/article-editor-designs',
  '/user/article-list-designs',
  '/user/page-head-designs',
])

const unavailableAccountRoutes = [
  '/user',
  '/user/login',
  '/user/register',
  '/user/forgot-password',
  '/user/articles',
  '/user/articles/new',
  '/user/favorites',
  '/user/routes',
  '/user/notifications',
  '/user/settings',
]

const isUnavailableAccountRoute = (path: string) => unavailableAccountRoutes.includes(path)

const formatSegment = (segment: string) => {
  return segmentLabels[segment] ?? segment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const normalizePath = (path: string) => path.replace(/\/+$/, '') || '/'

const routeCrumbs = computed<Crumb[]>(() => {
  const path = normalizePath(route.path)

  if (path === '/') {
    return [{ label: '首页' }]
  }

  const items: Crumb[] = [{ label: '首页', href: '/' }]
  const segments = path.split('/').filter(Boolean)
  let currentPath = ''

  for (const segment of segments) {
    currentPath += `/${segment}`
    const label = routeLabels[currentPath] ?? formatSegment(segment)
    items.push({
      label,
      href: currentPath === path || isUnavailableAccountRoute(currentPath) ? undefined : currentPath,
    })
  }

  return items
})

const compactCrumbs = computed<Crumb[]>(() => {
  return props.items?.length ? props.items : routeCrumbs.value
})

const shouldHideRouteTrail = computed(() => {
  if (props.items?.length || props.mode === 'back') {
    return false
  }

  return hiddenTrailRoutes.has(normalizePath(route.path))
})

const shouldRenderTrail = computed(() => {
  if (shouldHideRouteTrail.value) {
    return false
  }

  if (props.mode === 'back') {
    return Boolean(props.backHref)
  }

  return compactCrumbs.value.length > 1
})
</script>

<template>
  <nav
    v-if="shouldRenderTrail"
    class="page-trail"
    :aria-label="ariaLabel"
    data-page-trail-role="shell"
  >
    <a
      v-if="mode === 'back' && backHref"
      class="page-trail-back"
      :href="backHref"
      data-page-trail-role="link"
    >
      {{ backLabel || '返回上级' }}
    </a>

    <ol v-else class="page-trail-list" data-page-trail-role="list">
      <li
        v-for="(crumb, index) in compactCrumbs"
        :key="`${crumb.label}-${index}`"
        class="page-trail-item"
      >
        <a
          v-if="crumb.href"
          class="page-trail-link"
          :href="crumb.href"
          data-page-trail-role="link"
        >
          {{ crumb.label }}
        </a>
        <span v-else class="page-trail-current" data-page-trail-role="current">{{ crumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>
