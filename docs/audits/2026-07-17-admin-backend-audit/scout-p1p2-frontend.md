# P1 快修 + P2 前端收编 — 事实侦察报告

仓库: `/home/lolben/TerraPedia/data-query-app`（前端），`/home/lolben/TerraPedia/back`（后端）。
所有行号均为 2026-07-17 当前工作区实测。

---

## 1. classification-audit.vue

### 1.1 不存在的 CSS 令牌（共 7 处，审计说 6 处，实测多 1 处）

文件: `pages/operations/classification-audit.vue`（scoped style 段）

| 行号 | 现状 | 正确令牌（variables.css 实名） |
|---|---|---|
| L336 | `color: var(--text-muted);` | `var(--color-text-muted)`（variables.css L46） |
| L342 | `color: var(--text);` | `var(--color-text)`（L44） |
| L355 | `color: var(--text);` | `var(--color-text)` |
| L367 | `border: 1px solid var(--border);` | `var(--color-border)`（L52） |
| L369 | `background: var(--surface-muted);` | `var(--color-surface-muted)`（L31） |
| L384 | `color: var(--text-muted);` | `var(--color-text-muted)` |
| L407 | `color: var(--text);` | `var(--color-text)` |

这些 `--text/--border/--surface-muted` 在 `assets/css/variables.css` 和 `main.css` 中均无定义，当前实际渲染为浏览器继承值/透明（即"审计页文字全黑、无边框"的根因）。

### 1.2 分页：展示但无控件；后端支持 page 参数

- 前端分页 state：**没有独立分页 state**。页面只在 L94-96（`.audit-section__foot`）展示 `section.pagination.page / size|limit / total`，数据来自后端响应透传（接口类型 `AuditPagination` 定义于 L117-123）。
- 请求处 L219：`get<ClassificationAuditResponse>('/admin/operations/classification-audit')` — **不传任何 page/limit 参数**，永远拿第 1 页。
- 后端 `back/src/main/java/com/terraria/skills/controller/AdminClassificationAuditController.java` **确认支持翻页**：
  - L33-37：`@GetMapping getClassificationAudit(@RequestParam page, @RequestParam limit, @RequestParam size)` 三个可选参数。
  - L38-40：`PaginationParams.resolvePage/resolveLimit`（默认 20，上限 100），计算 offset。
  - 每个 section 的 rows SQL 都带 `LIMIT ? OFFSET ?`（L52、L67、L88、L134、L159）。
  - 注意：**page/limit 是全局共享的**（5 个 section 用同一组参数，L54-56 等），前端加翻页控件时 5 个分组会一起翻页；若要每组独立翻页需改后端。
- 快修方案：加 `const auditPage = ref(1)`，`loadAudit` 时 `get(url, { page: auditPage.value, limit: 20 })`，在 `.audit-section__foot`（L93-97）或页面级 hero 加上一页/下一页按钮（用 `pagination.totalPages` 判断边界，后端 `Pagination` 已返回该字段）。

### 1.3 rowTitle 7 字段链式猜测

- `rowTitle`：**L238-249**，链式 `row.nameZh ?? row.name ?? row.itemName ?? row.npcName ?? row.displayName ?? row.title ?? row.id ?? index+1`（7 个字段 + index 兜底）。
- 同类猜测还有 `rowSubtitle` L251-261（6 字段链）、`rowKey` L234-236（4 字段链）。
- 对照后端 SQL 实际返回字段：uncategorizedItems 返回 `id/name/nameZh/internalName/categoryId`（Controller L48）；uncategorizedNpcs 多 `gameId`（L63）；unknownDropSourceKinds 返回 `id/npcId/itemId/dropSourceKind`（L83）；missingReferences 返回 `referenceType/ownerId/referenceId`（L118-128）；itemCategoryConflicts 返回 `itemId/categoryId/relationCategoryId`（L152）。即 `itemName/npcName/displayName/title` 四个候选**后端从不返回**，可按 section 精确映射替代链式猜测。

---

## 2. audio-assets.vue

### 2.1 matchStatuses 子串嗅探（实际在 L588-593，非 L590 单行）

`pages/operations/audio-assets.vue` L588-593:

```ts
function matchStatusTone(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('matched') && !normalized.includes('unmatched')) return 'success'
  if (normalized.includes('unmatched')) return 'warning'
  return 'muted'
}
```

配套的 `matchStatusLabel` L603-608 同样用 `.includes('unmatched')/.includes('matched')` 嗅探。`row.matchStatuses` 是 string 类型（L324 接口定义），模板消费处 L125、L234、L249。

### 2.2 useApi.ts TOKEN_COOKIE_KEY 当前**未导出**

`composables/useApi.ts` L5:

```ts
const TOKEN_COOKIE_KEY = 'tp_admin_token'
```

纯模块级 `const`，无 `export`。同文件 L6-7 的 `USER_COOKIE_KEY`/`EXPIRES_AT_COOKIE_KEY` 也未导出。已导出的相关能力：`getAdminBearerHeaders()` L78-81（返回 `{ Authorization: Bearer ... }`）、`resolveApiUrl()` L83-87、`handleApiError` L43。

### 2.3 audio-assets 硬编码 cookie 名 — L348

```ts
const token = useCookie<string | null>('tp_admin_token')   // L348
```

消费处：L464（判空）、L472（手写 `Authorization: Bearer ${token.value}` 传给原生 fetch）。
注：这里用原生 `fetch` 下载音频 blob（L468-474），无法直接换 `get()`，但 header 可换成已导出的 `getAdminBearerHeaders()`，或导出 `TOKEN_COOKIE_KEY` 后引用。

### 2.4 joinApiUrl 重复实现 — L509-513

```ts
function joinApiUrl(baseUrl: string | undefined, path: string) {   // L509
  const safeBase = (baseUrl || '').replace(/\/+$/, '')             // L510
  const safePath = path.startsWith('/') ? path : `/${path}`        // L511
  return `${safeBase}${safePath}`                                  // L512
}                                                                  // L513
```

调用处 L505-507 `getAudioStreamUrl`：`joinApiUrl(runtimeConfig.public.apiBase, ...)`。与 `useApi.ts` 的 `resolveApiUrl`（L83-87，`normalizeUrl` L64-67 + `getBaseURL` L69-76）语义几乎相同——但 `resolveApiUrl` 在 SSR 下会走 `backendOrigin`，audio-assets 只在客户端点播使用，替换安全。

---

## 3. 视觉缺陷定位

### 3.a 操作列竖排折行

根因模式一致：`.row-actions { display:flex; flex-wrap:wrap; }` + 操作列 td 无 `white-space:nowrap`/最小宽度，容器挤压时按钮逐个换行成竖排。

| 文件 | 关键行 | 现状 | 建议 |
|---|---|---|---|
| `pages/entities/[type].vue` | L5016 `.row-actions { display:flex; gap:8px 10px; flex-wrap:wrap; ...}`；L4998 td 通用样式无 nowrap；L4997 表格 `min-width:980px` | condition-terms 等列少的实体表列宽被 `width:100%` 均分拉伸，操作列仍可能被长文本列挤压 | 加 `.data-table td:last-child { white-space:nowrap; width:1%; }` 或 `.row-actions { flex-wrap:nowrap; }` |
| `pages/items.vue` | L786 `.row-actions`（同款 flex-wrap:wrap）；L772 td 无 nowrap；L771 `min-width:1080px` | 5 个按钮（L144-148：查看/配方/配方树/编辑/删除）最易折成 2-3 行 | 同上；items 操作多，建议 `td:last-child { min-width:220px; white-space:nowrap }` |
| `pages/users.vue` | L228 `.row-actions`（同款）；**L224 已有 `.data-table td:last-child { min-width:210px; }`** 但无 nowrap；L221 td `vertical-align:top` | 2 个按钮（停用/启用+重置密码），210px 通常够，但缩窄时仍 wrap | 补 `white-space:nowrap`（users.vue 是唯一给操作列设了 min-width 的页面，可作为其余页面的参考模板） |
| condition-terms（entities/[type].vue 内路由，config L2191-2205） | 同 [type].vue 的 L5016/L4998 | 无专属样式，复用上表 | 同 [type].vue |

注：main.css L698-700 `:where(.data-table th, .data-table td) { vertical-align: top }` 是全局低优先级默认，各页 `vertical-align: middle`（[type].vue L4998、items.vue L772）会覆盖它。

### 3.b 右缘裁切

**query.vue 结果表（created_at 列被裁）**
- 容器 L107 用的类是 `data-table-wrap`——**该类在整个仓库无任何 CSS 定义**（grep 全仓库只有这一处使用）。没有 `overflow-x:auto`，而父级 `.section-card`（main.css L119）是 `overflow:hidden`，表格 `.query-table { min-width:640px }`（query.vue L501-503）超宽时直接被 section-card 裁掉右缘，末列 created_at 消失。
- 修法：把 L107 的 `data-table-wrap` 改成全局已有的 `table-wrap` 语义，或在 scoped 里补 `.data-table-wrap { overflow-x:auto; max-width:100%; }`。

**article-comments.vue "搜索文章"按钮溢出**
- L4 命令栏 `article-list-command-bar`，其 CSS L801-804：`grid-template-columns: minmax(280px, .9fr) minmax(420px, 1.2fr)`。
- 工具栏本体 L818-820 `.article-list-toolbar { grid-template-columns: minmax(220px,1fr) 150px 130px 100px max-content max-content; }` —— 固定列合计 380px + 两个 `max-content` 按钮 + gap，**最小内容宽度 > 命令栏给的 1.2fr 槽位**时，`max-content` 列（"搜索文章"L33-35、"重置"L36-38）撑破格子；父 `.section-card` overflow:hidden（main.css L119）裁掉右缘。
- 断点只在 L1563-1565（760px）折为单列，中等宽度（~760-1100px）正是溢出区间。
- 修法：给 `.article-list-toolbar` 增加中断点（如 1100px 时改为两行 grid），或将按钮列从 `max-content` 改为 `minmax(max-content, auto)` 并允许 toolbar `flex-wrap`；也可把命令栏第二列改 `minmax(0, 1.2fr)` + toolbar 内部允许换行。

**condition-terms 操作列被裁**
- 同 3.a：`pages/entities/[type].vue` L4996 `.table-wrap { overflow-x:auto }` 本身没问题，但 L4997 `min-width:980px` 使窄容器下出现横向滚动，操作列在最右、初始视口外，观感即"被裁"；加 `td:last-child` nowrap + 考虑给操作列 `position: sticky; right: 0`（配不透明背景）可解。

### 3.c login.vue Logo 豆腐块

- `pages/login.vue` **L8**：`<span class="login-card__logo">📦</span>` —— 是 **U+1F4E6 emoji 字符**，不是图标字体。
- 样式 L153-164：56×56 渐变圆角块，`font-size:1.75rem; color:white`。
- 豆腐块根因：字体栈 `--font-sans`（variables.css L4）为 `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`，**无任何 emoji 回退字体**（`Noto Color Emoji`/`Apple Color Emoji`/`Segoe UI Emoji` 均缺失）。截图环境是 Linux（服务器/CI 无 emoji 字体），📦 无字形可渲染 → 方框。
- 修法二选一：① 换成 lucide 图标（项目已用 `lucide-vue-next`，login 页可 `import { Package }`）；② 字体栈补 emoji 回退（见 §5）。

### 3.d categories.vue 树图标豆腐块

- 图标在子组件 `components/CategoryTreeNode.vue` **L14**：`<span class="tree-node__icon">{{ hasChildren ? '📁' : '📄' }}</span>` —— 同样是**裸 emoji 字符**（U+1F4C1 / U+1F4C4），无图标字体方案。
- 展开/折叠钮 L11 用的是文本 `−`/`+`，不受影响。
- 根因与修法同 3.c：无 emoji 回退字体。建议换 lucide 的 `Folder`/`FileText`（categories.vue L183 已 import `Search` from lucide-vue-next，模式现成）。

---

## 4. 硬编码 hex

### 4.1 login.vue 全部硬编码颜色

hex 共 **11 行**（另有 12 处 rgba 硬编码；审计的"30+"应是 hex+rgba 合计 23 处 + 渐变内多值）：

| 行号 | 值 | 建议令牌（variables.css） |
|---|---|---|
| L108 | `#f4fbfa / #eef7f6 / #f8fbff`（背景渐变 3 值） | 可整段换 `var(--color-bg)` L17 / `--color-bg-shell` L18，或保留装饰渐变但基于 `color-mix(var(--color-primary)...)` |
| L162 | `#0f766e → #0e7490`（logo 渐变） | `var(--color-primary-dark)` L9 → `var(--color-info)` L41（0e7490 无精确令牌，最近是 info #0284c7；或统一 `--color-primary-dark → --color-primary`） |
| L172 | `#0f766e` | `var(--color-primary-dark)` |
| L179 | `#0f172a` | `var(--color-text)` L44（#1c1917，色相不同但语义一致） |
| L185 | `#475569` | `var(--color-text-secondary)` L45 |
| L198 | `#334155` | `var(--color-text-secondary)` |
| L207 | `#0f172a` | `var(--color-text)` |
| L214 | `#0f766e` | `var(--color-primary-dark)`（focus 边框建议直接 `--color-primary`） |
| L221 | `#b91c1c` | `var(--color-danger)` L38 |
| L233 | `#0f766e → #0e7490`（提交按钮渐变） | 同 L162 |
| L253 | `#64748b` | `var(--color-text-muted)` L46 或 `--color-secondary` L13 |

rgba 硬编码行（次要，顺手可换）：L106-107、L123、L131、L140-142、L163、L205-206、L215、L234。多数可映射 `--color-primary-muted`(L11)/`--color-surface-1`(L29)/`--color-border-strong`(L54)/`--shadow-focus`(L64)。
注意 login.vue 用的是石板灰系（slate #0f172a/#475569），令牌是暖灰系（stone #1c1917/#57534e）——这正是"login 页与主题不搭"的根因，换令牌即统一。

### 4.2 index.vue tag 颜色类内联 hex

- `.tag--*` 系列：**L987-997**（11 行，每行 background+color 两个 hex，共 22 个值）：info/slate/emerald/sky/violet/amber/fuchsia/rose/orange/cyan/red。
- 另有 KPI 卡渐变 hex 在 script 内（非 CSS）：**L324、L332、L340、L348**（`kpiStats` computed，L318-351）；以及 L521 `color:#fff`。
- 映射建议：语义可映射的四个——`tag--emerald → --color-success(-muted)`(L34-35)、`tag--amber → --color-warning(-muted)`(L36-37)、`tag--red → --color-danger(-muted)`(L38-39)、`tag--info/sky → --color-info(-muted)`(L41-42)、`tag--slate → --color-secondary`+`--color-surface-muted`。violet/fuchsia/rose/orange/cyan 无现成令牌，P2 若要收编需在 variables.css 新增 palette 令牌（如 `--palette-violet` 等），或接受这批装饰色保留 hex 但集中到一处共享文件。

### 4.3 categories.vue 重定义 .btn/.input 的确切范围

**L600-651**（与审计一致）：
- `.input` L600-607、`.input--search` L609-611、`.input:focus` L613-616、`.input--textarea` L618-621
- `.btn` L624-631、`.btn-primary` L633-636、`:hover` L638-640、`:disabled` L642-645、`.btn-secondary` L647-651

内部已用令牌（`--color-border/--color-primary` 等），问题是**与全局 main.css 的 .btn/.input 重复定义**导致该页按钮/输入框观感与其它页漂移；修法是整段删除，回归全局类（唯一自定义 `.input--search { padding-left:44px }` L609 可保留，全局版是 40px，见 [type].vue L4994）。

---

## 5. --font-sans CJK

`assets/css/variables.css` **L4-5** 当前值：

```css
--font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-display: 'Plus Jakarta Sans', var(--font-sans);
```

问题：① 无中文字体声明，CJK 落到 `sans-serif` 兜底，Linux 上常命中无字重、渲染差的默认宋体/文泉驿；② 无 emoji 回退（§3.c/3.d 豆腐块根因）。Google Fonts 只拉了 Plus Jakarta Sans 400-700（nuxt.config.ts L87），不含 CJK。

建议新值：

```css
--font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI',
  'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC',
  'WenQuanYi Micro Hei', sans-serif,
  'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji';
--font-display: 'Plus Jakarta Sans', var(--font-sans);
```

（macOS→PingFang SC，Windows→YaHei，Linux→Noto Sans CJK SC/文泉驿；末尾 emoji 族同时消掉 §3 两处豆腐块——若采纳则 login/categories 的 emoji 可不换图标，但换 lucide 仍是更稳做法。）

---

## 6. P2 前端收编事实

### 6.a 工具函数重复清单

**formatNumber — 11 处定义，3 种空值语义（审计属实："--" vs "0" 相反）**

| 位置 | 空值/NaN 返回 | 实现 |
|---|---|---|
| `composables/useTownNpcMaintenance.ts:173`（唯一已导出版） | `'0'` | `Number(value||0)` + toLocaleString |
| `pages/recipes/wiki-zh-import.vue:413` | `'0'` | 同上 |
| `pages/operations/crawler-monitor.vue:3880` | `'0'` | 同上 |
| `pages/operations/crawler-monitor-test.vue:2016` | `'0'` | 同上 |
| `pages/operations/classification-audit.vue:229` | `'0'` | `Number(value??0)` |
| `pages/operations/armor-attributes.vue:425` | `'--'` | 仅接受 typeof number |
| `pages/operations/audio-assets.vue:610` | `'--'` | 仅接受 typeof number |
| `pages/operations/domain-acceptance.vue:586` | `'--'` | Intl.NumberFormat |
| `pages/operations/data-source-acceptance.vue:421` | `'--'` | Intl.NumberFormat（与上行逐字相同） |
| `pages/index.vue:427` | `String(value??'--')` | 混合语义 |
| `components/ItemDetail.vue:226` | `'--'` | 不做千分位，纯 String() |

收编时必须拆成两个 API（如 `formatCount`→'0' 与 `formatMetric`→'--'）或带 fallback 参数，不能直接合一。

**statusTone — 5 处定义（+1 处同名 computed 不算）**

| 位置 | 语义差异 |
|---|---|
| `pages/operations/domain-acceptance.vue:442` | success 集含 `ready`；warning 集含 `needs_confirmation` |
| `pages/operations/data-source-acceptance.vue:302` | 同上但**无** ready/needs_confirmation |
| `pages/operations/audio-assets.vue:580` | 完全不同：`active/downloaded→success, missing→danger, 其它非空→warning` |
| `pages/operations/crawler-monitor.vue:3507` | 最复杂：7 个 tone（含 info/ready/cancelled），词表完全不同 |
| `pages/operations/crawler-monitor-test.vue:1941` | crawler-monitor 的近似拷贝 |
| （`components/article/ArticleEditorWorkspace.vue:699` 是 `statusToneClass` computed，非同一函数） |

domain-acceptance 与 data-source-acceptance 可直接合并；audio-assets/crawler-monitor 语义域不同，收编需按域拆分词表参数，不宜硬合。

**formatDateTime — 9 处定义**

| 位置 | 语义 |
|---|---|
| `pages/users.vue:195`、`pages/articles.vue:280`、`pages/article-comments.vue:536`、`pages/recipes/tree.vue:192`、`pages/entities/[type].vue:3079`、`pages/item-rarities.vue:283`、`components/article/ArticleReviewWorkspace.vue:236` | 全部同款：空→`'--'`，无效→原值，否则 `toLocaleString('zh-CN')`（7 处可无脑合并） |
| `pages/items.vue:415` | 单行版 + 显式 format options（year/month/day/hour/minute 2-digit），输出格式略不同 |
| `pages/operations/audio-assets.vue:621` | **完全不同实现**：`value.replace('T',' ').replace('Z','')` 字符串裁剪，不走 Date |

### 6.b 制作站返回上下文 10 字段协议重复块

10 字段 = `from, stationId, stationItemId, stationInternalName, stationSearch, stationUsageFilter, stationPage, stationUsagePage, bindingItemId, stationFocus`。

| 文件 | 读取(route.query→context) | hasStationReturnContext | sanitize | buildStationWorkspaceQuery | buildRecipeRouteQuery |
|---|---|---|---|---|---|
| `pages/recipes/index.vue` | L270-281 | L282-286 | L416-418 | L420-434 | L436-456（+goBackToStations L458-461） |
| `pages/recipes/tree.vue` | L151-162 | L163-167 | L219-221 | L223-237 | L239-259（+goBackToStations L296-298） |
| `pages/recipes/stations.vue` | （写方，无 context 读取块；从本页 state 组装） | — | L729（`sanitizeRouteQuery`） | L748-762（字段名用短名 search/page/usagePage…） | L776-791（在此把短名映射回 stationSearch/stationPage… 10 字段） |

index.vue 与 tree.vue 的读取块+build 函数**逐字相同**（仅函数名 sanitizeQuery 一致），是纯拷贝；stations.vue 是协议另一端（编码方），三页对 10 个字段名各自硬编码。收编建议：抽 `composables/useStationReturnContext.ts`（字段名常量 + parse + build 两个方向）。

**toRecipeDrafts mapper 重复块**

- `pages/recipes/index.vue` **L496-549**（含 `isDesktopRecipe` 前置于 L~490）
- `pages/recipes/stations.vue` **L798-857**
- 两版语义 99% 相同，仅两处漂移：stations 版全部用 `Array.isArray(x) ? x.map : []` 防御（index 版用 `(x||[])`）；`sourceProvider` 兜底 index 版为 `'manual_admin'`、stations 版为 `''`。收编时需确认哪个兜底是对的（index 版语义更像业务意图）。

### 6.c coin-chip / price-pill 样式四处拷贝

逻辑（`buildPriceVisual`/`formatDisplayPrice`）已在 `composables/useTownNpcMaintenance.ts` L199/L230 收编，**只有 CSS 是四份拷贝**：

| 文件 | 样式块范围 | 备注 |
|---|---|---|
| `pages/entities/town-npcs/index.vue` | L633-668（.coin-chip→.price-pill 结束） | 无 --soft 变体；≈36 行 |
| `pages/entities/town-npcs/[id]/index.vue` | L537-576 | 无 --soft；≈40 行 |
| `pages/entities/town-npcs/[id]/edit.vue` | L379-427 | 含 `--soft` 变体（L391、L410、L427）；≈49 行 |
| `components/TownNpcWorkbenchModal.vue` | L1435-1484 | 含 `--soft`（L1446、L1464、L1482-1484）；≈50 行 |

实测每份 36-50 行、合计 ≈175 行（审计"~160 行"指四份合计，非每份 160 行）。内部还嵌硬编码渐变 `#b45309→#f59e0b`（金币）与 `#0f766e→#14b8a6`（soft）。收编落点：town-npc 页面均已 import `useTownNpcMaintenance`，样式可提为全局片段（main.css 追加或独立 `assets/css/town-npc-price.css`），以 --soft 全集版（Modal 版 L1435-1484）为基准。

### 6.d articles 评论数 N+1 补偿

前端：
- 补偿函数 `refreshArticleCommentCounts`：`stores/articles.ts` **L456-509**（每篇文章打一个 `GET /admin/articles/{id}/comments?page=1&limit=1` 取 total，即 N+1；单篇取数在 `fetchArticleCommentTotal` L448-454）。导出于 L614。
- 11 候选 key 提取器 `extractArticleCommentCount`：`stores/articles.ts` **L187-199**（`commentCount/comment_count/commentsCount/comments_count/stats.commentCount/stats.comment_count/commentStats.total/commentStats.commentCount/commentStats.comment_count/metrics.commentCount/metrics.comment_count`，恰 11 个）。消费于 `normalizeArticle` L212。
- 调用方：`pages/article-comments.vue` L650-651（`refreshVisibleArticleCommentCounts`），触发点 L656/L665/L670/L782。**pages/articles.vue 不调用它**（grep 无命中）——N+1 只发生在文章评论管理页。

后端可行点（关键发现）：
- `AdminArticleController.java` L44-60 列表接口 → `ArticleServiceImpl.getAdminArticles` L52-62 → **`ArticleMapper.xml` 的 `selectAdminArticlesPage`（L5-71）已经有 commentCount 子查询**（XML L40-45：`COALESCE((SELECT COUNT(*) FROM article_comments ac WHERE ac.article_id=a.id AND ac.parent_id IS NULL),0) AS commentCount`），且 `ArticleDTO` L31 已有 `private Long commentCount` 字段，还支持按 commentCount 排序（XML L59、ServiceImpl L791-796）。
- **即后端早已返回 commentCount，无需任何后端改动**。前端 N+1 之所以存在，可能因该子查询统计口径是"根评论数（parent_id IS NULL，不过滤 deleted/status）"而 `fetchArticleCommentTotal` 走 `/admin/articles/{id}/comments` 的 total（全量评论口径）。收编前需确认产品想要哪个口径：若接受"根评论数"，直接删 N+1 用列表返回值；若要全量含回复数，改 XML L40-45 的子查询（去掉 `parent_id IS NULL`）即可，仍无需新增查询/mapper。
- 注意对照 `selectPublishedArticlesPage`（XML L73 起）的前台口径：多了 `ac.deleted=0 AND ac.status='PUBLISHED'`（XML L108-110）——admin 版子查询连 `deleted=0` 都没过滤，收编时建议顺手补上。

### 6.e useApi.ts 结构与插入点

- 导出方式：全部为**具名 const 箭头函数导出**——`handleApiError` L43、`getAdminBearerHeaders` L78、`resolveApiUrl` L83、`get` L110、`post` L116、`put` L122、`patch` L128、`del` L134、`useApiFetch` L139。非导出内部件：`TOKEN_COOKIE_KEY` L5、`USER_COOKIE_KEY` L6、`EXPIRES_AT_COOKIE_KEY` L7、`clearAuthCookies` L9、`requestInterceptor` L15、`request` L98。
- 加导出 `TOKEN_COOKIE_KEY` 的插入点：**直接把 L5 的 `const` 改为 `export const`** 即可（L6-7 两个兄弟常量按需同改；`stores/auth.ts` 等处若也硬编码了 'tp_admin_user' 可一并收）。无循环依赖风险——audio-assets.vue L106 已 `import { get } from '~/composables/useApi'` 同款路径。

---

## 附：核查中发现的额外事实（计划外但相关）

1. classification-audit 的失效令牌是 **7 处非 6 处**（L342 常被漏数）。
2. `data-table-wrap`（query.vue L107）是无 CSS 定义的孤儿类——右缘裁切的直接根因，一行即修。
3. 后端 admin 文章列表**已返回 commentCount**（ArticleMapper.xml L40-45），6.d 的"可行点"实为"删前端 N+1 + 对齐口径"，工作量比审计预估小。
4. classification-audit 后端翻页参数是 5 个 section 全局共享，前端加翻页控件时注意交互表达。
5. login.vue 用 slate 灰系、令牌是 stone 暖灰系，色相替换属预期内的主题统一，不是等值替换。
