# 前台页面整改 P0-P2 工期计划 v2(基于 2026-07-17 第二轮评分审查)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 R2 审查报告(`docs/audits/2026-07-17-front-pages-audit-r2.md`)分三档消化前台债务:P0 确定性小修(≈4 个工作日)、P1 结构性拆解(≈3.5 周)、P2 设计系统偿债(≈3 周),综合分预期 6.9 → 8.0+。

**Architecture:** P0 在单一分支一次性完成合回;P1 每个工作包独立分支、独立可合;P2 高 churn 项(变量迁移/主题选择器清理/文件搬迁)排在两个巨石文件拆解**之后**,避免 CSS 迁移与巨石 style 段搬迁对撞。每个 P1/P2 工作包执行前需按本计划的边界声明出各自的详细实现计划(本文档只锁定范围、验收与工期)。

**Tech Stack:** Nuxt 3 / Vue 3 / Pinia / pnpm;合同校验链 `pnpm run check`(~18 个 contract 脚本 + typecheck);单测栈为 **node:test**(`pnpm run test:unit` = `node --test tests/unit/*.test.mjs`,项目无 Vitest);截图回归用审计截图脚本(P0-10 入库)。

**基线:** 分支自 `review/front-pages-audit-r2`(bc7c8bc)或最新 main 拉出。审查证据与行号均以该基线为准。

---

## v2 修订记录(2026-07-17 计划审查后)

v1 经独立审查发现 2 致命 + 8 重要问题,v2 已全部吸收:

| 级别 | 问题 | v2 处置 |
|---|---|---|
| 致命 F1 | WP-11.2 layouts 化与 `check-public-pages.mjs:1151-1186` 的逐页 `<TerraNav/TerraFooter>` 断言正面相撞,首页还有 `:1505` 的 prop marker | WP-11.2 增加合同同步子任务与 itemTotalLabel 通道改造,工期 1d→2d |
| 致命 F2 | "sed 删 816 处 `[data-theme="light"]` -800 行"失实:多数是 `:where()` 三元组合选择器成员(删枚举不删行),且 4 个合同脚本硬编码该字面、`check-light-theme-typography.mjs` 主动设 `data-theme='light'` 跑断言 | WP-11.3 重定义为"选择器成员移除 + 4 合同同步 + light 轴工具退役",收益预期下调,工期 1d→2d(前提本身成立:`stores/theme.ts:17-22` 归一化后 runtime 确无 light 值) |
| 重要 I1 | 棘轮脚本 `split('\n').length` 比 wc -l 多 1,上线即全红 | 计数改 `length - 1` |
| 重要 I2 | P0-3 判定在首帧/SSR 恒真(default 即 missing、初始 status 为 idle),错误块闪现+水合风险 | 判定补 `status === 'success'` |
| 重要 I3 | WP-6 根因定位错误:拼接 hack 躲的是 `check-public-pages.mjs:260-264` 的 forbiddenPublicTerms **禁词表**,不是文章提取器 | WP-6 重写为禁词策略决策 |
| 重要 I4 | P0-2 验收不可达:`TerraNav.vue:108` 的 onMounted 也调 `authStore.init()`,访客在任何页都会发那两个请求 | 验收改为"中间件不阻塞导航";TerraNav init 收敛列入 WP-14 |
| 重要 I5 | P0-8 样例签名错误:`useCatalogRouteSync` 的 `search.page` 必填而 biomes 无分页;分组 sentinel 是中文 `'全部'` 非 `'all'`;biomes 现状无 debounced ref | 样例重写,不传 `search` 选项 |
| 重要 I6 | WP-1 写 Vitest 但项目测试栈是 node:test | 改 node:test |
| 重要 I7 | WP-3 漏列 `check-front-layout-layering-contract.mjs:211-215`(锁编辑器 main/form 结构) | 补入同步清单;P0-7 同脚本 `:185-209` 锁列表页表格骨架,已加提醒 |
| 重要 I8 | WP-11.1 单 `:root` 别名会压平主题:`--index-line` 在 hifi 四个主题块各定义一次值不同(`hifi-preview.css:40,131,197,298`),tokens.css 晚于 app.css 加载靠源顺序胜出 | 别名须按主题四份或确认 `--tp-*` 已有主题变体 |
| 建议 | shoot.mjs 在 tmp/ 被 gitignore,验收基线换机即失 | 新增 P0-10 入库任务 |
| 建议 | P0-1 直读 `process.env` 破坏 `resolveFrontRuntimeConfig` 约定;P0-8 顺删的 `biomeHeroPrimary` 实证被 `check-public-pages.mjs:2608` 锁定;P0-4 的 legacy alias 需覆盖手工预水合副本;P0-7 需连 scoped 样式一起抄;WP-2 实际被 **5** 个合同脚本读取、`shared/article-runtime` 真身被 data-query-app 共用须只读;WP-14 的 Footer 统计**非**跨边界(后端 `/statistics/overview` 已存在) | 均已写入对应任务 |

---

## 0. 合并冲突策略(前置约束)

当前**所有未合分支的 front-nuxt 改动为零**(2026-07-17 逐分支 diff 实测),冲突风险全部来自计划执行期间的并行工作。约束:

1. **顺序铁律**:CSS 棘轮(P0-9)→ P0 其余 → P1 巨石拆解(WP-1/WP-2)→ P2 高 churn 项(WP-11/13/14)。P2 的变量迁移/主题选择器清理**禁止**与 WP-1/WP-2 并行,因为二者都要动 `armor-sets/[id].vue` 与 `articles/[slug].vue` 的 style 段。
2. **别名法代替 sed**:私有变量换令牌用别名重定义(按主题分块,见 WP-11.1),不做全量文本替换。
3. **短命分支**:P2 每个 churn 步骤(选择器清理、文件升格、layouts 化)单独分支,当天完成当天合回,不过夜;WP-11.2(layouts)必须选并行前端分支清空的窗口。
4. **contract 同步提交**:凡删除/移动被 contract 锁定的代码,对应 `scripts/check-*.mjs` 的修改必须在**同一提交**内,保证任意 commit 上 `pnpm run check` 全绿。

## 1. 工期总览

| 阶段 | 内容 | 工期(1 人) | 日历锚点 | 里程碑验收 |
|---|---|---|---|---|
| **P0** | 10 项确定性小修(含 CSS 棘轮、截图脚本入库) | 4 个工作日 | D1–D4(7/20–7/23) | `pnpm run check` 绿;og:image 输出绝对 URL;/users/* 导航不被中间件阻塞;crafting 失败态有可达重试;`docs/audits` 追加验收记录 |
| **P1-a** | WP-1 armor-sets 拆解 + WP-2 articles 治理(可双人并行) | 4d + 5d,串行 9d / 并行 5d | W2–W3 初 | 两文件 <800 / <2200 行;解析引擎有 node:test 单测;文章正文进 SSR HTML;文章 404 探针返回 404 |
| **P1-b** | WP-3 编辑器去重 + WP-4 深链双请求 + WP-5 详情共享层 | 2d + 1d + 1.5d | W3 | new/[id] 各 <400 行;5 列表页深链单请求(Network 面板证据) |
| **P1-c** | WP-6 禁词策略决策 + WP-7 PasswordInput + WP-8 projectiles 动线 + WP-9 模板去重 | 1d + 0.5d + 2d + 1d | W4 | 拼接 hack 清零;5 处密码框有 toggle;projectiles 卡片可点 |
| **P1-x** | WP-10 armor-sets 聚合端点(**需后端排期,跨边界**) | 前端 0.5d + 后端 1–2d | 与 P1-b 并行提需求 | 详情页请求数 ≤3 |
| **P2** | WP-11 CSS 分层迁移四步 + WP-12 断点收敛 + WP-13 长页治理 + WP-14 小项打包 | 6d + 1.5d + 3d + 3d | W5–W8(≈13.5d) | 页面层 tp 令牌占比 ≥60%;断点四档;biomes 移动 <9000px;补丁层行数较基线下降 |
| **合计** | | **≈36 个工作日**(双人 P1-a 并行则 ≈32d) | 7/20 – 9/8 前后 | 复审(R3)综合分 ≥8.0 |

缓冲:每周预留 0.5d 处理 check 链/截图回归的意外失败,已含在上表。

---

## 2. P0 明细(单分支 `fix/front-audit-r2-p0`,10 项,D1–D4)

### Task P0-1: og:image 绝对 URL + canonical(0.5d)

**Files:**
- Modify: `front-nuxt/nuxt.config.ts:53-56`(public 块加 siteUrl)
- Create: `front-nuxt/composables/useAbsoluteSeo.ts`
- Modify: `front-nuxt/pages/items/[id].vue:128-132`、`npcs/[id].vue`、`bosses/[id].vue`、`buffs/[id].vue`、`biomes/[id].vue`、`armor-sets/[id].vue`、`pages/index.vue` 的 `useSeoMeta` 调用点(各文件搜 `ogImage`)

- [ ] **Step 1**: nuxt.config public 块加 `siteUrl: ''`。**不读 `process.env`**——Nuxt 会把 `NUXT_PUBLIC_SITE_URL` 环境变量自动注入 `public.siteUrl`;若项目要走 `resolveFrontRuntimeConfig` 约定则在 `utils/runtimeConfig.mjs` 增加 `TERRAPEDIA_SITE_URL` resolver(二选一,开工时按约定定)。
- [ ] **Step 2**: 新建 composable(siteUrl 为空时回退当前请求 origin,dev 下免配置):

```ts
// front-nuxt/composables/useAbsoluteSeo.ts
export const useAbsoluteSiteUrl = () => {
  const { public: { siteUrl } } = useRuntimeConfig()
  const requestOrigin = useRequestURL().origin
  return (path: string | null | undefined) => {
    const value = String(path ?? '').trim()
    if (!value) return undefined
    if (/^https?:\/\//i.test(value)) return value
    const base = (siteUrl || requestOrigin).replace(/\/$/, '')
    return `${base}${value.startsWith('/') ? value : `/${value}`}`
  }
}
```

- [ ] **Step 3**: 七个调用点改 `ogImage: () => toAbsolute(itemImage.value)`,并在各详情页 `useHead` 补 `link: [{ rel: 'canonical', href: toAbsolute(route.path) }]`
- [ ] **Step 4**: 验证:`curl -s localhost:15177/items/1 | grep -o 'og:image[^>]*'` 输出含 `http://localhost:15177`(经 requestOrigin 回退);`pnpm run check` 绿(runtimeConfig 形状无合同风险,`check-public-pages.mjs:861-867` 只断言既有 marker,加 siteUrl 是纯增量)
- [ ] **Step 5**: Commit `fix(front): absolute og:image + canonical across detail pages`

### Task P0-2: auth 中间件误伤 /users/*(0.5h)

**Files:** Modify: `front-nuxt/middleware/user-auth.global.ts:4`

- [ ] **Step 1**: 改判定(`pages/` 下 `/user*` 命名空间实测仅 `/user/*` 与 `/users/[id]`,无其他前缀路由):

```ts
if (!(to.path === '/user' || to.path.startsWith('/user/'))) {
  return
}
```

- [ ] **Step 2**: 验证:**中间件不再对 `/users/1` 执行 `await authStore.init()`(导航不被认证请求阻塞)**;`/user/favorites` 未登录仍跳 login。注意:`TerraNav.vue:108` 的 `onMounted` 也调 `authStore.init()`,访客在任何页面仍会发 current-user/refresh 各一次——那不是本任务范围,收敛已列入 WP-14。
- [ ] **Step 3**: Commit

### Task P0-3: crafting 重试块激活(1h)

**Files:** Modify: `front-nuxt/pages/crafting/index.vue:48-51,346`

- [ ] **Step 1**: useAsyncData 解构补 `status: recipeStatus`(`crafting/index.vue:48-51`),加 computed。**必须带 status 守护**——default 值的 source 就是 `'missing'`(`usePublicRecipeTree.ts:52`)且 `server:false` 下初始 status 为 `idle`,只判 source 会导致 SSR/首帧闪现错误块+水合不匹配:

```ts
const recipeMissing = computed(() =>
  recipeStatus.value === 'success' && recipeBundle.value?.source === 'missing',
)
```

- [ ] **Step 2**: `:346` 的 `v-if="recipeError"` → `v-if="recipeMissing"`(fetcher 吞错永不 reject,`recipeError` 恒 null,引用一并删除)
- [ ] **Step 3**: 验证:正常打开 `/crafting` 首帧无错误块闪现;后端停掉后出现「重新加载」且点击真实重发;后端恢复后点击可恢复渲染
- [ ] **Step 4**: Commit

### Task P0-4: items 三对同义筛选项(0.5d)

**Files:** Modify: `front-nuxt/pages/items/index.vue:62-100`(filters 定义)、route-sync hydrate(`:431-446`)**与手工预水合副本(`:139-155`)两处**

- [ ] **Step 1**: **先查后端**:`curl localhost:18191/api/public/items?category=...` 确认是否存在更细分 code(平台/电路/宝藏袋专属)。有 → 改指向;无 → 执行 Step 2 删重复
- [ ] **Step 2**: 删 `wiring`(保留 mechanism)、`platform`(保留 block)、explore 组 `treasure`(保留武器组 boss-drop)。合同 `check-public-pages.mjs:2950` 要求的四个标签(武器/照明/机关/Boss 掉落)均不在删除项,安全
- [ ] **Step 3**: legacy 兼容映射**两处 hydrate 都加**(route-sync hydrate 与 `:139-155` 的手工预水合副本各自独立解析 filter;副本要到 WP-4 才删):

```ts
const LEGACY_FILTER_ALIASES: Record<string, string> = { wiring: 'mechanism', platform: 'block', treasure: 'boss-drop' }
// 两处 hydrate 内:filterKey = LEGACY_FILTER_ALIASES[filterKey] ?? filterKey
```

- [ ] **Step 4**: 验证:`/items?filter=wiring` 直开与站内导航两条路径都落到机关筛选;`pnpm run check` 绿
- [ ] **Step 5**: Commit

### Task P0-5: npcs reset 补清分类(0.5h)

**Files:** Modify: `front-nuxt/pages/npcs/index.vue:206-211`

- [ ] **Step 1**: `resetNpcFilters` 内补 `selectedNpcCategoryId.value = null`(`:16` 定义初值 null;该 ref 在 route-sync watchSources 中(`:259`),赋值后 URL 清参自动成立)
- [ ] **Step 2**: 验证:带 `?categoryId=` 深链进入 → 点重置 → 列表回全量、URL 清参
- [ ] **Step 3**: Commit

### Task P0-6: 文章 404 真状态码(0.5h)

**Files:** Modify: `front-nuxt/pages/articles/[slug].vue`(notFoundState 定义 `:1978` 与分支 `:2299`)

- [ ] **Step 1**: 对齐 `categories/[id].vue:15-23` 模式:文章取数是 server 端 `useAsyncData`(`:76-80`,无 server:false),SSR 解析后无文章即 `throw createError({ statusCode: 404, statusMessage: '文章不存在' })`;客户端导航用 `watch(notFoundState, v => { if (v) showError({ statusCode: 404 }) })`
- [ ] **Step 2**: 验证:`curl -s -o /dev/null -w '%{http_code}' localhost:15177/articles/no-such-slug` → `404`;正常文章仍 200
- [ ] **Step 3**: `pnpm run check` 绿。注意 [slug].vue 被 **5 个**合同脚本读取(check-public-pages / check-user-module-contract / check-front-layout-layering-contract / check-article-comments-runtime / check-article-content-references),本任务只加 throw 不动提取目标,预期无冲突,红了先看是哪个脚本 → Commit

### Task P0-7: 我的文章接入分页(0.5d)

**Files:** Modify: `front-nuxt/pages/user/articles/index.vue:112` 及模板;参照 `front-nuxt/pages/user/favorites.vue:136-142`(分页 nav)与 `:37-39`(末页删空回退)——已实证存在可照抄

- [ ] **Step 1**: 页面加 `currentPage` ref,`fetchUserArticles(currentPage.value, 10)`,watch 翻页重拉;末页删空回退照抄 favorites `:37-39`
- [ ] **Step 2**: 模板加 favorites 同款分页 nav,**连 `<style scoped>` 里的分页样式一起抄**(favorites 的 `.favorite-pagination` 系列样式在其 scoped 段 `:151,167-248`,全局 CSS 无该类定义——routes/notifications 的"裸类名借用"是已知反面教材,不要再犯)
- [ ] **Step 3**: **合同预警**:`check-front-layout-layering-contract.mjs:185-209` 锁本页表格骨架结构,改模板时保住既有 marker
- [ ] **Step 4**: 验证:测试账号造 11+ 篇 → 第 2 页可达;删除末页最后一篇回退前页;`pnpm run check` 绿
- [ ] **Step 5**: Commit

### Task P0-8: biomes 接 URL 同步(0.5d)

**Files:** Modify: `front-nuxt/pages/biomes/index.vue`(搜索/分组 ref 定义后,现状 `:9-10,45`:搜索 ref 为 `biomeSearchQuery` **无 debounced 副本**,分组 sentinel 是中文 `biomeAllGroupLabel = '全部'`)

- [ ] **Step 1**: 接 `useCatalogRouteSync`。**不传 `search` 选项**(其 `page: Ref<number>` 字段必填而 biomes 无分页,传残缺对象 typecheck 红):

```ts
useCatalogRouteSync({
  serialize: () => ({
    q: biomeSearchQuery.value.trim() || undefined,
    group: activeBiomeGroup.value !== biomeAllGroupLabel ? activeBiomeGroup.value : undefined,
  }),
  hydrate: (query) => {
    biomeSearchQuery.value = String(firstQueryValue(query.q) ?? '')
    const group = String(firstQueryValue(query.group) ?? '')
    activeBiomeGroup.value = biomeGroupOptions.includes(group) ? group : biomeAllGroupLabel
  },
  watchSources: [biomeSearchQuery, activeBiomeGroup],
})
```

(`biomeGroupOptions` 为文件内实际分组清单变量名,以实际为准;group 白名单校验,非法值回落 `'全部'`。搜索防抖本页现状就没有,不在本任务加)
- [ ] **Step 2**: 验证:搜索+切分组 → URL 带参 → 刷新状态保留;`nuxt typecheck` 绿
- [ ] **Step 3**: ~~顺手删 `biomeHeroPrimary` 死分支~~ **跳过**:实证被 `check-public-pages.mjs:2608` 列为 biomes 必需 marker,锁定中,本次不动(留给 P2 时随合同重构处理)
- [ ] **Step 4**: Commit

### Task P0-9: CSS 行数棘轮断言(0.5d,提前自 P2)

**Files:**
- Create: `front-nuxt/scripts/check-css-ratchet.mjs`
- Modify: `front-nuxt/package.json`(scripts 加条目 + check 链追加)

- [ ] **Step 1**: 新建脚本(**计数用换行数,与 `wc -l` 对齐**——五个文件均以换行结尾,`split('\n').length` 会多 1 导致上线即红):

```js
// front-nuxt/scripts/check-css-ratchet.mjs — CSS 补丁层行数只减不增
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// 基线 = 2026-07-17 wc -l 实测;文件减肥后请把预算同步下调
const BUDGETS = {
  'assets/css/hifi-preview.css': 10282,
  'assets/css/catalog-image-fixes.css': 1878,
  'assets/css/light-theme-contrast-fixes.css': 910,
  'assets/css/mobile-typography-fixes.css': 616,
  'assets/css/discovery-page-fixes.css': 482,
}
let failed = false
for (const [file, budget] of Object.entries(BUDGETS)) {
  const content = readFileSync(join(root, file), 'utf8')
  const lines = content.split('\n').length - 1 // 尾换行文件下与 wc -l 一致
  if (lines > budget) {
    console.error(`[css-ratchet] ${file}: ${lines} 行 > 预算 ${budget}。新样式请写入 domains/ 层,或先偿还等量旧行。`)
    failed = true
  } else if (lines < budget) {
    console.log(`[css-ratchet] ${file}: ${lines}/${budget} — 可下调预算`)
  }
}
if (failed) process.exit(1)
```

- [ ] **Step 2**: `package.json` 按项目模式加 `"check:css-ratchet": "node scripts/check-css-ratchet.mjs"` script 条目,再在 `check` 链追加 `pnpm run check:css-ratchet`(不要裸 `node scripts/...` 破坏 `check:*` 命名模式)
- [ ] **Step 3**: 验证:`pnpm run check` 绿;向 hifi 手动加一行 → check 红 → 撤销
- [ ] **Step 4**: Commit `chore(front): css patch-layer line-count ratchet`

### Task P0-10: 审计截图脚本入库(0.5h,新增)

**Files:** Create: `front-nuxt/scripts/audit-shoot.mjs`(自 `tmp/audit-r2/shoot.mjs` 迁入,tmp 被 gitignore,换机/新 worktree 即失去回归基线)

- [ ] **Step 1**: 复制脚本入 `scripts/`,BASE 改为 `process.env.AUDIT_BASE || 'http://localhost:15177'`,输出目录参数化为 `process.env.AUDIT_OUT || 'tmp/audit-shots'`
- [ ] **Step 2**: 验证跑通一轮 26 路由;Commit `chore(front): commit audit screenshot harness`

**P0 收尾**:全量截图回归(audit-shoot.mjs 26 路由)对比 `tmp/audit-r2/shots/` 无非预期视觉差异 → 合回 main。

---

## 3. P1 工作包(每包独立分支,执行前出详细实现计划)

> P1/P2 各包在此只锁定**范围边界、交付物、验收、工期**。逐步骤实现计划在开工时按包产出(存 `docs/plans/`),原因:巨石拆解的具体切线依赖开工时的最新代码状态,现在写死行号会漂移。

### WP-1: armor-sets/[id] 三刀拆解(4d)

- **范围内**:① `utils/armorEffectParsing.ts`(~450 行解析引擎迁出 + **node:test 单测**(`tests/unit/*.test.mjs` 模式,项目栈无 Vitest,不引入新测试框架),用现网 benefit 文案样本做快照)② `composables/useArmorSetBuilds.ts`(~500 行)③ `components/detail/ArmorBuildMatrix.vue` + `ArmorRecipeTable.vue` ④ 骨架 markup 抽 `DetailArmorSetSkeleton`。页面落到 <800 行。
- **范围外**:解析引擎后移数据管线(长期项,另立项);视觉改版;N+1 修复(归 WP-10)。
- **验收**:行为不变(拆解前后同一套装页面截图 diff 为零);单测覆盖 12 项词条映射;`pnpm run check` 绿。
- **风险**:style 1961 行按组件归属切分,是 P2 CSS 迁移的前置;拆出的 style 进组件 scoped,不进棘轮监控文件(棘轮只盯 5 个补丁 CSS,无冲突)。

### WP-2: articles/[slug] 治理(5d)

- **范围内**:① 删 `:858-1327` 死代码簇,`check-article-content-references.mjs:298-345` 对应提取行改测 `shared/article-runtime/recipeHierarchyGraphRenderer.ts` 真身(**同一提交**;真身在仓库根 `shared/`,经 `#article-runtime` alias 引用)② 抽 `useArticleComments()` + `ArticleComments.vue`(消双份回复表单)③ 去 `articleClientReady` 对正文分支的门控,正文真 SSR,hydration 敏感的引用增强包 `<ClientOnly>`。
- **范围外**:评论功能增强;DOMPurify 策略变更;style 段令牌迁移(归 P2);**`shared/article-runtime/` 真身文件只读不改**——该目录被 data-query-app(admin)共用,改动即跨前台边界。
- **合同口径**:[slug].vue 被 **5 个**脚本读取(check-public-pages / check-user-module-contract / check-front-layout-layering-contract / check-article-comments-runtime / check-article-content-references),合同重写工作量按 5 个口径评估——这是工期 4d→5d 的原因。
- **验收**:`curl localhost:15177/articles/guide-true-nights-edge-demo` HTML 含正文段落文本;404 探针 404(P0-6 已保);文件 <2200 行;check 绿。
- **风险**:正文 SSR 是行为变更,需在 dev 双主题+双视口过一遍水合告警(参考 TerraNav 水合竞态前科)。

### WP-3: 编辑器双胞胎去重(2d)

- **范围内**:`useArticleDraftGuard({ storageKey, form, serialize })` + `UserArticleEditorLayout.vue`;new/[id] 退化为薄页面;`beforeunload` handler 内补 `persistArticleDraft()` flush;`formatReviewStatus` 三份复制收 `lib/userArticleStatus.ts`。
- **合同同步清单(两个)**:`check-user-module-contract.mjs`(锁 40+ 字面量,迁移时逐字保留文案)+ **`check-front-layout-layering-contract.mjs:211-215`**(逐页锁 `<main class="tp-page-shell user-article-editor-page">` 与 `form id="(new|edit)-user-article-form"`——抽 Layout 组件后这些结构从页面文件消失,合同须改锁组件文件或改断言口径,同一提交)。
- **范围外**:编辑器功能新增(预览、图片上传等)。
- **验收**:new/[id] 各 <400 行;3s 窗口内关页不丢输入(手测);草稿恢复横幅行为与现状一致;check 绿。

### WP-4: 深链双请求根治(1d)

- **范围内**:`useCatalogRouteSync` 增加前置水合入口(取数 watch 建立前先 hydrate);5 个后置页接入;删 items 页手工预水合副本(`items/index.vue:139-155`,P0-4 在该副本加的 legacy alias 随之并入 route-sync hydrate 单点)。
- **验收**:带 query 深链打开 items/npcs/bosses/buffs/armor-sets,Network 面板每页仅 1 次列表请求。

### WP-5: 详情页共享层沉淀(1.5d)

- **范围内**:`DetailRelationRow.vue`(六页 relation-row 统一)、`utils/terrariaMoney.ts`(npcs/bosses 钱币三件套)、`utils/publicCopy.ts`(三份 rawPublicCopyPattern 正则)。
- **范围外**:六页视觉统一改版(只做等价替换)。
- **验收**:替换前后截图 diff 为零;三份复制清零(grep 证据)。

### WP-6: forbiddenPublicTerms 禁词策略决策(1d)

- **根因更正(v2)**:npcs/[id].vue:488 与 usePublicBuffDetail.ts:28-30 的 `'source' + 'Items'` 拼接 hack,规避的是 `check-public-pages.mjs:260-264` 定义、`:1145-1149` 对全部 scanFiles 执行的**全文件禁词表**(`sourceItems`/`inflictingNpcs`/`immuneNpcs`),不是文章 contract 提取器。修提取器修不掉这两处。
- **范围内**:**已拍板(2026-07-17,用户选 ①)**:禁词表改为只扫模板段(script 里消费后端字段名属正常代码)。落地后删除两处拼接 hack。
- **验收**:hack 清零且 check 绿;决策记录写入 `docs/contracts/`(该目录存合同说明)。

### WP-7: PasswordInput.vue(0.5d)

- **范围内**:带可见性 toggle(`aria-pressed`)、autocomplete 透传;替换 login/register/forgot/settings 共 5 处;顺带 register/forgot 验证码补 `autocomplete="one-time-code"`。
- **验收**:5 处可切换明文;表单提交行为不变。

### WP-8: projectiles 动线(2d)

- **范围内**:动线决策(开工时先做 0.5d 调研:后端是否有 projectile 详情端点)→ 有则补 `[id].vue`+detailPath;无则卡片按关联 itemId 跳武器详情,均需空态兜底。「未标记」chip 改有值才显示(`projectiles/index.vue:301-303`)。
- **范围外**:射弹数据补全(数据管线职责)。
- **验收**:卡片可点且落点有意义;缺数据卡片 meta 行不再显示「未标记」字样。

### WP-9: 模板去重两处(1d)

- **范围内**:`CatalogCategoryDrawer.vue`(items 双份 ~90 行)、`ArmorSetCard.vue`(armor-sets 双份 ~65 行,含同帧双 `.filter()` 修复)。
- **验收**:截图 diff 为零;双份清零。

### WP-10: armor-sets 聚合端点(跨边界,需后端)(前端 0.5d + 后端 1–2d)

- **范围内(前端)**:详情页改消费 `?include=piece-effects,recipes` 聚合响应,保留旧路径兜底开关。
- **边界声明**:后端端点设计与实现**不在本计划内**,本周提需求单排期;后端未就绪不阻塞其余 P1(兜底开关保证可独立合并)。
- **验收**:后端就绪后详情页请求数 ≤3(现 20+)。

---

## 4. P2 工作包(W5–W8)

### WP-11: CSS 分层迁移四步(6d,顺序执行,每步一分支当天合)

1. **令牌别名**(1d):`tokens.css` 内把 `--index-line`、`--accent-gold` 等 6 个高频私有变量重定义为 `var(--tp-*)` 别名。**别名须按主题分块写**——`--index-line` 在 hifi 四个主题块各定义一次且值不同(`hifi-preview.css:40,131,197,298`),CSS 加载序 app.css(含 hifi)→ tokens.css,同特异性靠源顺序,单 `:root` 别名会把四个主题值压成一个;正确做法是逐主题写别名或先确认对应 `--tp-*` 已有主题变体。验收:双主题截图 diff 为零。
2. **layouts/default.vue**(2d):34 页删手抄 `TerraNav/TerraFooter` 外壳。**合同同步子任务(v2 新增,与页面改动同一提交)**:`check-public-pages.mjs:1151-1152`(逐页 `<TerraFooter` 断言)与 `:1185-1186`(`<TerraNav`)改锁 `layouts/default.vue`;`:1505` 要求首页逐字含 `<TerraFooter :item-total-label="itemTotalLabel">`——首页对 Footer 的 prop 通道(`pages/index.vue:36`)改 `useState`/provide-inject 并同步该 marker。冲突提示:此步与任何在飞的页面分支必冲,合并窗口选并行分支清空时。验收:26 路由截图 diff 为零;check 绿。
3. **主题选择器清理**(2d):**v2 重定义**——不是"删 816 处规则",而是从 `:where([data-theme="light"], [data-theme="morning-paper"], [data-theme="warm-slate"])` 组合选择器中**移除 light 成员**(实测分布 hifi 495 / contrast-fixes 229 / catalog 63 / discovery 19 / primitives 10,绝大多数是组合选择器成员,删枚举不删行,行数收益趋零,价值是语义清理与选择器瘦身)。前提已验证成立:`stores/theme.ts:17-22` 归一化后 runtime 永不出现 `data-theme="light"`。**必须同一提交改写 4 个硬编码该字面的合同**:`check-public-pages.mjs:3609`、`:1110`、`:3497-3503`,`check-visual-system-contract.mjs:311`,`check-nav-layout-contract.mjs:174`;并退役/改造 `check-light-theme-typography.mjs` 的 light 轴(`:5,:468`——它会主动把 DOM 设成 `data-theme="light"` 跑对比度断言,选择器删成员后该轴全废)。验收:双主题截图 diff 为零;check 绿。
4. **catalog-image-fixes 升格**(1.5d):1878 行整体迁 `domains/catalog.css` 并按选择器域归类,棘轮预算下调至剩余补丁层。验收:7 列表页截图 diff 为零。

### WP-12: 断点收敛(1.5d)

- **范围内**:17 种断点收敛至 430/720/860/1180 四档令牌,合同脚本加白名单断言(新断点即红)。
- **范围外**:借机调整响应式视觉(等价替换,±1px 内归档)。
- **验收**:grep 断点清单只余四档;375/768/1440 三视口截图无布局破坏。

### WP-13: 长页治理(3d)

- **范围内**:biomes 列表分组分页(25493px→目标 <9000px)、biomes 详情掉落区 `<details>` 分组折叠、crafting 移动端树默认折叠层级、首页页脚移动端折叠。
- **验收**:audit-shoot.mjs 重跑,四页移动高度达标且无水平溢出。

### WP-14: 小项打包(3d)

skip-link;9–11px 字号 121 处提升至 ≥12px(mobile-typography-fixes 逐条处理并下调棘轮);面包屑清假数据字典+NuxtLink 化;biomes 详情 `<a>` 换 NuxtLink;Footer 统计接 `/statistics/overview` 真值(**纯前端**,后端端点已存在且 `useHomeData.ts:77` 已消费——v2 更正,非跨边界;须保住 `check-public-pages.mjs:1505` 首页 prop marker,若 WP-11.2 已改通道则以新口径为准);search-tool **保留并接真实统计**(已拍板 2026-07-17:复用 useHomeData stats 消灭假计数,页面顶部加「对照原型」标注);改密成功跳登录页;settings/编辑器补 `aria-live`;categories 数字 id 301;**TerraNav onMounted 的访客 init 双失败请求收敛**(P0-2 遗留,`TerraNav.vue:108`,如加"未登录短路/一次性静默"逻辑);V55 种子迁移补文件(**跨边界:落 `back/db/migration/V55__seed_ac_home_original_articles.sql`,V55 号实测未占用,按后端迁移规范提交;`check-home-j1-index.mjs` 不在主 check 链不构成门禁**);search 页文案统一中文+状态合并。

- **验收**:逐项 grep/截图/curl 证据归档 `docs/audits/` 追加记录。

---

## 5. 总验收(R3 复审)

全部合回后重跑本次审查同规格证据链(26 路由双视口截图 + SSR/404 探针 + check 链),出 `docs/audits/2026-08-xx-front-pages-audit-r3.md`,目标综合 ≥8.0,其中 armor-sets/[id] 维护分 ≥6、articles/[slug] 耦合分 ≥6、CSS 架构 ≥6。
