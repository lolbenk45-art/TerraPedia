<script setup lang="ts">
const route = useRoute()

type Crumb = {
  label: string
  href?: string
}

const routeLabels: Record<string, string> = {
  '/': '首页',
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
  '/user/articles': '我的文章',
  '/user/articles/new': '新建文章',
  '/user/favorites': '收藏夹',
  '/user/settings': '账号设置',
}

const segmentLabels: Record<string, string> = {
  search: '全站检索',
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
  user: '用户中心',
  login: '登录',
  register: '注册',
  favorites: '收藏夹',
  settings: '账号设置',
  new: '新建文章',
}

const formatSegment = (segment: string) => {
  return segmentLabels[segment] ?? segment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const crumbs = computed<Crumb[]>(() => {
  const path = route.path.replace(/\/+$/, '') || '/'

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
      href: currentPath === path ? undefined : currentPath,
    })
  }

  return items
})
</script>

<template>
  <nav class="breadcrumb-shell" aria-label="当前位置">
    <ol class="breadcrumb-list">
      <li v-for="(crumb, index) in crumbs" :key="`${crumb.label}-${index}`">
        <a v-if="crumb.href" class="breadcrumb-link" :href="crumb.href">{{ crumb.label }}</a>
        <span v-else class="breadcrumb-current">{{ crumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>
