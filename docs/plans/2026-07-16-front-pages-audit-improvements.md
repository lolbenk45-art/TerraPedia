# 前台页面评分审查改进方案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 `reports/front-pages-audit/REVIEW.md`(2026-07-16 前台评分审查,综合 6.1/10)确认的问题:先修 7 项用户可感知的硬 bug(P0),再做 4 项结构性改进(P1),P2 设计系统偿债单列路线图不在本计划内逐任务展开。

**Architecture:** 全部改动限于 `front-nuxt/`。P0 是点状修复(模板/一行参数/CSS 避让);P1 引入两个共享 composable(`useVisualLoading`、`useCatalogRouteSync`)收敛 9 处复制粘贴,并把详情页数据获取从 `server: false` 切到 SSR(`usePublicApi.ts` 的 `apiServerBase` 通道已存在,首页与 search.vue 已验证可行)。

**Tech Stack:** Nuxt 4 / Vue 3 `<script setup>` / 现有检查基建(`pnpm run check` 内含 17 个 contract 检查 + `nuxt typecheck`)。不新增依赖(P1-6 DOMPurify 除外,见该任务)。

**审查证据:** `reports/front-pages-audit/REVIEW.md`;截图 `front-nuxt/tmp/visual-audit-shots/`(27 路由 × 桌面/移动 + 4 张亮色主题)。

**验证基线:** 每个任务后运行 `cd front-nuxt && pnpm run check`;涉及页面行为的任务补充针对性人工/脚本验证(任务内注明)。本地栈:`bash scripts/dev/start-local-stack.sh --reuse-existing`(front 端口以 `reports/local-start/run-manifest.json` 为准,本轮为 15177)。

---

## Phase P0 — 用户可感知的硬 bug(约 3 天)

### Task 1: 修复 buffs 详情关联条目硬编码 `/items` 断链

**Files:**
- Modify: `front-nuxt/pages/buffs/[id].vue`

**背景:** `buffs/[id].vue:199` 所有关联条目写死 `href="/items"`。数据源(`/api/public/buffs/{id}`)实际返回三组:`sourceItems`(物品,`id` 为物品 id,已实测 id=288 可跳 `/items/288`)、`inflictingNpcs` 与 `immuneNpcs`(NPC,`id` 为 NPC id)。

- [ ] **Step 1:** `relationItems(items, detailBase)` 增加第二参数,生成 `href`:

```ts
const relationItems = (items: PublicBuffFactSummary[], detailBase: '/items' | '/npcs') => items.slice(0, 8).map((fact, index) => ({
  id: firstText(fact.id, fact.sourceId, fact.internalName, index),
  href: /^\d+$/.test(String(fact.id ?? '')) ? `${detailBase}/${fact.id}` : detailBase,
  // ...其余字段不变
}))
```

`buffRelationSections`(`buffs/[id].vue:80`)三个 section 分别传 `'/items'`(sources)、`'/npcs'`(inflicters)、`'/npcs'`(immuneTargets)。

- [ ] **Step 2:** 模板(`buffs/[id].vue:199`)`<a ... href="/items">` 改为 `<NuxtLink :to="item.href">`(保留 class)。
- [ ] **Step 3:** 人工验证:打开 `/buffs/1`,"来源"条目应跳对应物品详情;找一个有施加者的 debuff(如 `/buffs` 列表里的"中毒",来源计数 11)验证 NPC 跳转。
- [ ] **Step 4:** `cd front-nuxt && pnpm run check`;commit `fix(buffs): route buff relation entries to their own detail pages`

### Task 2: items 页兼容 `search` 查询参数

**Files:**
- Modify: `front-nuxt/pages/items/index.vue`

**背景:** `search.vue:30`、`categories/[id].vue:29`、`search-tool.vue:26-28` 生成 `/items?search=xxx`,而 `hydrateCatalogStateFromRoute`(`items/index.vue:435`)只读 `q`,关键词静默丢失。npcs 页的写法(`route.query.search ?? route.query.q`)是现成范本。

- [ ] **Step 1:** `items/index.vue:435` 改为 `const search = String(firstQueryValue(route.query.q ?? route.query.search) ?? '')`。
- [ ] **Step 2:** 人工验证:访问 `/items?search=铁`,搜索框应带入"铁"且结果过滤生效。
- [ ] **Step 3:** `pnpm run check`;commit `fix(items): accept legacy search query param from cross-page links`

### Task 3: 图鉴列表→详情改用 NuxtLink

**Files:**
- Modify: `front-nuxt/pages/items/index.vue`(:697-707)
- Modify: `front-nuxt/pages/bosses/index.vue`(:264-271)
- Modify: `front-nuxt/pages/npcs/index.vue`(:507-516)
- Modify: `front-nuxt/pages/biomes/index.vue`(:291-296, 332-338)
- Modify: `front-nuxt/pages/buffs/index.vue`(:223-229)

**背景:** 五个列表页用原生 `<a :href>` 进详情,每次整页刷新。armor-sets/index.vue:313 的 NuxtLink 用法是范本。

- [ ] **Step 1:** 逐页把卡片链接 `<a :href="x.detailPath">` 换成 `<NuxtLink :to="x.detailPath">`,class 与内部结构不动。注意:items 墙格若有 `@mouseenter` 聚焦逻辑保持在同一元素上。
- [ ] **Step 2:** 人工验证:五个列表点卡片进详情应为 SPA 切换(无整页白屏),浏览器回退能恢复列表滚动位置。
- [ ] **Step 3:** `pnpm run check`(其中 `check:public-pages`、`check:nav-layout` 会扫模板结构,若 contract 断言 `<a` 需同步更新对应 check 脚本断言);commit `fix(catalog): use NuxtLink for list-to-detail navigation`

### Task 4: 悬浮分页坞遮挡避让

**Files:**
- Modify: `front-nuxt/assets/css/catalog-image-fixes.css`(:831 `.catalog-page-dock`)

**背景:** dock 为 `position: sticky; bottom: 0; z-index: 30`,背景半透明(rgba(7,12,9,0.88)+blur),滚动中持续压在最后一行卡片上(bosses/npcs/buffs/projectiles 桌面截图均可见)。

- [ ] **Step 1:** 给使用 dock 的列表容器加滚动余量,让最后一行能滚出 dock 覆盖区。推荐在 dock 自身规则旁新增兄弟规则(避免逐页改):

```css
.catalog-page-dock { /* 现有规则不动 */ }
/* dock 前面的网格留出 dock 高度的余量 */
:where(.item-grid, .boss-strip, .npc-result-list, .buff-card-grid, .projectile-card-grid):has(+ .catalog-page-dock),
*:has(> .catalog-page-dock) > :nth-last-child(2) {
  scroll-margin-bottom: 72px;
}
```

  实施时先核对各列表页 dock 的实际兄弟元素类名(以 `grep -rn 'PaginationDock' front-nuxt/pages` 定位模板),用最贴近的选择器;若 `:has` 覆盖不稳,退化方案是给 `.catalog-page-dock` 加 `margin-top: 16px` 并把背景不透明度提到 0.96,至少消除"文字透底"的阅读干扰。
- [ ] **Step 2:** 人工验证:四个列表页滚动到中部,dock 不应压住卡片文字;滚到底最后一行完整可见。
- [ ] **Step 3:** `pnpm run check`;commit `fix(catalog): keep sticky pagination dock from covering list content`

### Task 5: Boss 卡枚举文案中文化

**Files:**
- Modify: `front-nuxt/pages/bosses/index.vue`

**背景:** 卡片直接渲染 `boss.bossType` 原始枚举(`PRE_HARDMODE`),而中文映射 `bossTypeLabel()` 已存在于同文件 :40(注意映射表 key 是小写 `pre_hardmode`,API 返回大写,需归一化)。

- [ ] **Step 1:** 卡片模板中 `{{ boss.bossType }}` 处改为 `{{ bossTypeLabel(String(boss.bossType ?? '').toLowerCase()) }}`;`bossTypeLabel` 的 fallback 保持 `'Boss'`。
- [ ] **Step 2:** 人工验证 `/bosses`:卡片显示"困难模式前/困难模式/事件 Boss/小 Boss"。
- [ ] **Step 3:** `pnpm run check`;commit `fix(bosses): render boss type with zh label instead of raw enum`

### Task 6: 详情未找到态排版修复(404 状态码留待 P1-1)

**Files:**
- Modify: `front-nuxt/pages/items/[id].vue`(:876-889 未找到卡片)
- Modify: 其余五个 `[id].vue` 的同构未找到块(bosses/npcs/biomes/buffs/armor-sets)

**背景:** `/items/99999999` 截图显示 eyebrow"物品 #… · 未找到"与标题"没有找到这个物品"折行粘连("未找到**没**/有找到…")。真正的 HTTP 404 需要 SSR 取数(P1-1)后才能 `createError`,本任务只修排版并统一文案结构。

- [ ] **Step 1:** 检查未找到块的 DOM:eyebrow 与 `<h1>`/`<b>` 是否在同一行盒;为标题元素加 `display: block`(或调整包裹结构),六个详情页统一。
- [ ] **Step 2:** 人工验证 `/items/99999999`、`/bosses/99999`:标题独立成行、无粘连。
- [ ] **Step 3:** `pnpm run check`(`check:detail-layout` 涉及详情布局 contract,若断言结构需同步);commit `fix(detail): unclamp not-found headline layout`

### Task 7: categories 假占位页下线入口 — **已取消(2026-07-16 核查)**

> **SUPERSEDED:** `codex/continue-dev-20260715` 分支已实现 categories 真实导航(`feat(categories): connect public navigation pages` 等 8 个提交:categories/index.vue +93、categories/[id].vue +115 slug 化 fail-closed 导航、usePublicCategoryNavigation composable、contract 检查与单测)。本任务的"止血下线"不再需要,等该分支合入 main 即可。注意其 items/index.vue 改动(+119)与 Task 2/3 存在合并交叠,先合入者无碍,后合入者解决冲突时以两者语义并存为准(q/search 兼容 + categoryPath 处理互不排斥)。

<details><summary>原任务内容(已作废,存档)</summary>

**Files:**
- Modify: `front-nuxt/components/TerraNav.vue`(:25 resourceLinks 的"分类索引")
- Modify: `front-nuxt/pages/categories/index.vue`(:32-40 硬编码计数)

**背景:** `categories/index.vue` 硬编码假计数(932/684/1186/1408/318),`categories/[id].vue` 忽略路由参数——任何 id 同一内容,内链还是失效的 `?search=` 形式。真实分类树接口已存在(`/categories/items`,items/index.vue:162 在用),但接真数据是 P1 之后的独立需求;短期先止血。

- [ ] **Step 1:** TerraNav resourceLinks 移除"分类索引"项(或 desc 追加"(建设中)"并在 categories/index 页头加建设中横幅——二选一,倾向直接移除,`/categories` 直链仍可达)。
- [ ] **Step 2:** `categories/index.vue` 删除假计数展示,分类卡片链接改为可用的 `/items?filter=` 形式(quickFilters key 见 items/index.vue:45-121,如 `?filter=weapon`、`?filter=material`)。
- [ ] **Step 3:** 首页/页脚若有 categories 入口一并排查(`grep -rn '"/categories"' front-nuxt/pages front-nuxt/components front-nuxt/composables`)。
- [ ] **Step 4:** `pnpm run check`(`check:nav-layout` contract 可能断言资料菜单项数,需同步);commit `fix(categories): retire placeholder pages from nav and drop fake counts`

</details>

---

## Phase P1 — 结构性改进(1–2 个迭代)

### Task 8: 详情页 SSR 取数 + 真实 404 + 动态 SEO 落地

**Files:**
- Modify: `front-nuxt/composables/usePublicItemDetail.ts`(:108)、`usePublicBossDetail.ts`(:56)、`usePublicBiomeDetail.ts`(:76)、`usePublicBuffDetail.ts`(:77)、`usePublicArmorSetDetail.ts`(:50)及 npcs 对应 composable
- Modify: 六个 `[id].vue` 详情页

**背景:** 全部 detail composable `server: false`,SSR HTML 只有骨架;`useSeoMeta` 动态 title 对爬虫永远是兜底模板;无 404 状态码。`usePublicApi.ts:17` 的 `apiServerBase` 服务端直连通道已就绪(首页 `useHomeData.ts:94-108` 与 `search.vue:46` 已验证)。

- [ ] **Step 1(试点 items):** `usePublicItemDetail.ts` 去掉 `server: false`;确认 fetcher 在服务端走 `apiServerBase`、客户端走 `/api` 代理(对齐 `useHomeData` 的写法);确认 payload 序列化无 ref/函数。
- [ ] **Step 2:** `items/[id].vue` 在 setup 顶层:数据解析后若确认未找到(fetch 完成且无 detail),`throw createError({ statusCode: 404, statusMessage: 'Item not found' })`;保留现有未找到卡片作为 `error.vue` 之外的兜底不再需要时移除。
- [ ] **Step 3:** 验证试点:`curl -s http://localhost:<front>/items/1 | grep 铁镐` 应在 SSR HTML 里出现真实内容;`curl -o /dev/null -w '%{http_code}' http://localhost:<front>/items/99999999` 应为 404;view-source 的 `<title>` 应含物品名。**同时确认页面加载不再出现全屏骨架闪烁(visual loading 逻辑对 SSR 数据应短路)。**
- [ ] **Step 4:** 复制到 bosses/npcs/biomes/buffs/armor-sets 五个详情;`pnpm run check && pnpm run test:unit`。
- [ ] **Step 5:** 详情页补 `ogImage`(实体 imageUrl)与 canonical;commit 按实体拆分或一次 `feat(detail): server-render entity detail pages with real 404`

### Task 9: 抽取 useVisualLoading / useCatalogRouteSync,打通错误通道

**Files:**
- Create: `front-nuxt/composables/useVisualLoading.ts`
- Create: `front-nuxt/composables/useCatalogRouteSync.ts`
- Modify: 9 个复制粘贴宿主(items/bosses/npcs/biomes/buffs/armor-sets/projectiles 的 index + bosses/biomes 的 [id])
- Modify: `front-nuxt/composables/usePublicRecipeTree.ts`(:37-40)等吞错 fetcher

- [ ] **Step 1:** `useVisualLoading(minimumMs)` 封装"最小时长骨架"三件套(timer/startedAt/sync),行为与现实现逐字一致(items 180ms、bosses 320ms 等以参数传入);先迁移 items + bosses 两页验证,再批量迁移其余 7 处。
- [ ] **Step 2:** `useCatalogRouteSync` 封装 query 读写 + 防抖(300ms)+ **统一防回环 guard**(bosses 的 `syncingRouteQuery` 模式),迁移后 items/npcs 自动获得 guard,修复输入竞态(REVIEW §3.1-A);同步修复:bosses 双参数冗余(只写 `type`)、biomes 列表补 URL 同步。
- [ ] **Step 3:** 错误通道:fetcher 改为返回 `{ data, error, source }` 结构(不再静默吞错),页面已写好的"载入异常/重试"分支(crafting/index.vue:346 等)接上真实 error;同步删除永不可达的 `fallbackCatalogItems` 假数据分支(usePublicItems.ts:131-150、items/index.vue:251-291、npcs 同款)。
- [ ] **Step 4:** 每步 `pnpm run check`;分三个 commit(`refactor(catalog): extract useVisualLoading`、`refactor(catalog): extract useCatalogRouteSync`、`fix(catalog): surface fetch errors to retry branches`)

### Task 10: 移动导航菜单

**Files:**
- Modify: `front-nuxt/components/TerraNav.vue`
- Modify: `front-nuxt/assets/css/hifi-preview.css`(:4582-4740 移动断点区)

**背景:** ≤860px 主链接行是隐藏滚动条的横滚,"资料/账号"下拉是 hover 优先;无汉堡菜单(REVIEW §2.2-8)。

- [ ] **Step 1:** ≤860px 显示汉堡按钮(`aria-expanded`/`aria-controls`),展开全屏抽屉:主链接 + 资料资源链接 + 账号快捷入口 + 主题切换,复用现有 resourceLinks/accountMenu 数据。
- [ ] **Step 2:** 触屏交互:抽屉内取消 hover 逻辑,全部点击展开;Esc/遮罩点击关闭;打开时锁 body 滚动。
- [ ] **Step 3:** 375px 截图回归(复用 `front-nuxt/tmp/visual-audit-capture.mjs` 脚本);`pnpm run check`(`check:nav-layout` contract 需同步扩展);commit `feat(nav): mobile drawer navigation`

### Task 11: 编辑器数据保护 + 净化器替换

**Files:**
- Modify: `front-nuxt/pages/user/articles/new.vue`、`front-nuxt/pages/user/articles/[id].vue`
- Modify: `front-nuxt/pages/articles/[slug].vue`(:406-520 手写 sanitizer)
- Modify: `front-nuxt/package.json`(新增 `dompurify` + `@types/dompurify`)

- [ ] **Step 1:** 编辑器:localStorage 草稿自动保存(内容变更防抖 3s,key 含文章 id/new);进入时检测未提交草稿提示恢复;`onBeforeRouteLeave` + `beforeunload` 有未保存变更时确认。
- [ ] **Step 2:** 净化器:`sanitizeArticleHtml` 改为 DOMPurify 白名单配置(ALLOWED_TAGS 沿用现集合,`tp-content-ref`/`tp-recipe-tree` 的 data 属性经 hook 保留);**客户端渲染路径用 DOMPurify,SSR 路径(若 Task 8 之后文章页也 SSR)用 isomorphic-dompurify 或保留现正则实现作为服务端降级**——实施前确认文章详情是否走 SSR。
- [ ] **Step 3:** 现有 `check:article-comments-runtime`、`check:user-article-editor*`、`check:article-content-references` 全绿;人工回归:引用 chip 悬浮预览、合成树嵌入、TOC 锚点。
- [ ] **Step 4:** commit ×2(`feat(editor): draft autosave and leave guard`、`refactor(article): replace regex sanitizer with DOMPurify`)

---

## Phase P2 — 设计系统偿债路线图(单列,不在本计划展开)

1. **CSS 分层重构**:消化四个 "fixes" 补丁文件(catalog-image-fixes 1,866 行、light-theme-contrast-fixes 910、mobile-typography-fixes 616、discovery-page-fixes 482)回并源头;hifi-preview.css(10,083 行、54 处 `!important`)按域拆分。
2. **断点收敛**:15 种断点 → 520/720/1024/1180 四档。
3. **令牌落地**:页面样式只准引用 `--tp-*` 语义层。
4. **数据缺口降噪**:projectiles"未标记"chip 有值才显示;buffs 空图标走 PreviewImage fallback;items 详情 0 条模块折叠为摘要行。
5. **移动长页治理**:crafting 树移动端默认折叠(当前 12,486px)、biomes 详情掉落分组分页(7,450px)、首页页脚移动端折叠(8,042px)。
6. 小项:密码可见性切换、skip-link、`:focus-visible` 全局基线、9–11px 字号提升。

---

## 执行顺序与依赖

- Task 1–7(P0)相互独立,可并行;每任务独立 commit。
- Task 8 依赖无,但**必须先于**"详情页 404 状态码"生效(Task 6 只修排版即因此)。
- Task 9 建议在 Task 8 之后(SSR 改造会触碰同一批 composable,避免双向冲突)。
- Task 10、11 独立。
- 全部完成后跑一次完整门禁:`cd front-nuxt && pnpm run test`(check + build + unit),再用 `tmp/visual-audit-capture.mjs` 重拍 54 张截图对比回归。
