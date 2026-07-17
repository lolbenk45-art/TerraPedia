# 配方域页面组

评审对象：TerraPedia 管理端（Nuxt 4.4.2 / Vue 3.5.30 / Pinia 2.3.1），配方域 6 个页面 + 3 个关联组件。评分 10 分制，5 维度：视觉 / 结构 / 架构（数据流·复用共享设施）/ 耦合度 / 维护难度（行数·重复·测试覆盖）。

共享设施基线：`composables/useApi.ts`(get/post/put/del)、`composables/usePagedCollectionSync.ts`、`composables/useToast.ts`、`components/AdminDataTable.vue`、Pinia `itemsStore`（fetchItemById / fetchItemRecipes / fetchItemRecipeTree / fetchCraftingStations / updateItemRecipes …）。

## 汇总表

| 页面 | 视觉 | 结构 | 架构 | 耦合度 | 维护难度 | 均分 |
|---|---|---|---|---|---|---|
| recipes/index.vue (1027 行) | 8 | 6 | 5 | 5 | 4 | 5.6 |
| recipes/groups.vue (已删除，截图 500) | — | — | — | — | — | 故障态，见根因节 |
| recipes/shimmer.vue (934 行) | 7 | 7 | 6 | 6 | 5 | 6.2 |
| recipes/stations.vue (2090 行) | 7 | 4 | 4 | 3 | 2 | 4.0 |
| recipes/tree.vue (528 行) | 7.5 | 7 | 6 | 5 | 6 | 6.3 |
| recipes/wiki-zh-import.vue (553 行) | 7 | 8 | 7 | 8 | 7 | 7.4 |

> 配方域五页（index / shimmer / stations / tree / wiki-zh-import）均分区间 4.0–7.4；stations.vue 为域内最低分（God-page + 死代码 + 手写路由同步），wiki-zh-import.vue 为最高分（只读单接口、类型化、职责单一）。

---

## recipes/index.vue（配方编辑）— 均分 5.6

**视觉 8**：编辑/合成路径（editor/flow）双模式切换清晰，recipeHeroStats 顶部指标卡信息密度合理，桌面/移动 variant 选择做了适配。扣分项来自全局共性问题：截图顶部 "请注意 · 预览配方关系差异 · 执行失败" toast 遮挡了面包屑（全局 toast 定位/泄漏）。优化：toast 容器加 `top` 偏移避开 header，或对该 warning 类做去重与自动消散。

**结构 6**：`toRecipeDrafts`（约 50 行字段归一化）、`buildStationWorkspaceQuery` / `buildRecipeRouteQuery` / `buildTreeRouteQuery` 三个 query builder、以及 `stationReturnContext`（10 字段 route.query 手工展开）全部内联在页面里，模板与逻辑耦合。优化：把 draft mapper 抽到 `utils/recipeDraft.ts`，query builder 抽到 `useStationWorkspaceContext` composable。

**架构 5**：数据流走 itemsStore（fetchItemRecipes / updateItemRecipes）尚可，但**完全未用** `usePagedCollectionSync` 与 `AdminDataTable`，脏数据判定用 `JSON.stringify(a) === JSON.stringify(b)` 全量对比、`window.confirm` 守卫散落 6 处。优化：脏检查改用结构化 diff 或 `useLeaveGuard`（编辑器域已有 leave guard 可复用），confirm 守卫收敛到一个导航拦截器。

**耦合度 5**：与 tree.vue / stations.vue 共享的 10 字段「制作站返回上下文」查询协议（from / stationId / stationItemId / stationInternalName / stationSearch / stationUsageFilter / stationPage / stationUsagePage / bindingItemId / stationFocus）在三页手工复制，任一字段增改需三处同步。优化：抽 `useStationWorkspaceContext()` 统一 parse/serialize。

**维护难度 4**：1027 行单文件、约 340 行 scoped CSS、`tests/` 零覆盖（35 个测试文件中 `recipe|shimmer|station|tree|wiki|item-lookup` 零命中）。优化：拆分子组件（hero / editor / flow-preview），补 draft mapper 与 query 协议的单测。

---

## recipes/groups.vue（截图 h1 = "500"）— 500 错误根因分析

截图捕获时该页 h1 显示 "500 / undefined / obj.hasOwnProperty is not a function"，右下角浮层 "Page not found: /recipes/groups"。经实测排查（前端 13004 / 后端 18191，admin token 打后端接口全部健康：`/api/admin/*` 返回 200，后端**无 500**），确认这是**纯前端故障**，由三层原因叠加而成：

**第一层 — 直接原因：路由已不存在。** `pages/recipes/groups.vue` 已在 commit `9762905`（2026-07-16）删除（原为 30 行 redirect shell，onMounted → navigateTo `/item-groups?domain=recipe`）。Vue Router 对 `/recipes/groups` 无匹配 → 触发 Nuxt SSR 404（dev log：`[Vue Router warn]: No match found for location with path "/recipes/groups"` → `/__nuxt_error?...statusCode=404`）。

**第二层 — 兜底失效：301 routeRule 未在运行中的 dev server 生效。** 同一 commit `9762905` 在 `nuxt.config.ts:62` 加了 `'/recipes/groups': { redirect: { to: '/item-groups?domain=recipe', statusCode: 301 } }`。但截图时运行的 dev server（PID 125117，17:26 启动）启动自 branch `review/admin-backend-audit`(518d9a0)，该分支**不含** `9762905`（`git merge-base --is-ancestor` 验证 + `git show 518d9a0:nuxt.config.ts | grep recipes/groups` = 0）。`.nuxt/dev/index.mjs` 内 routeRules 仅有 `/__nuxt_error` 与 `/_nuxt/builds`，无 recipes 规则。故 301 兜底从未加载，404 未被拦截。**当前工作区 nuxt.config.ts 已含该规则（第 62 行，已核对），重启 dev server 即恢复 301 跳转。**

**第三层 — 404 被放大成 500：Pinia 2.3.1 shouldHydrate 的 null-proto bug。** SSR 渲染错误页、序列化 payload 时，`@pinia/nuxt` payload-plugin 对每个 payload 值调用 `shouldHydrate`。pinia 2.3.1 `pinia.mjs:1212`：`return !isPlainObject(obj) || !obj.hasOwnProperty(skipHydrateSymbol);` —— 直接在对象上调 `.hasOwnProperty`。而 404 error 的 query/data 对象来自 ufo `parseQuery`（`Object.create(null)`，null 原型，无 `hasOwnProperty` 方法），于是抛 `TypeError: obj.hasOwnProperty is not a function`，devalue stringify 中断，错误页渲染失败 → 500。对照实验：`/recipes/definitely-not-a-page`、`/totally-missing` 同样 500，证明这是**全站任何 404 → 500** 的通用缺陷，非 groups 独有。修复方向：升级 pinia（新版已改用 `Object.prototype.hasOwnProperty.call(obj, …)`）或本地 patch `pinia.mjs:1212`。

**一句话结论**：groups 页已按设计删除并改为 301 重定向到 `/item-groups?domain=recipe`；截图 500 是「运行中的 dev server 早于该重构 → 无 routeRule 兜底 → 命中 404，而 404 又被 pinia 2.3.1 null-proto bug 放大成 500」三因叠加。修复：① 重启 dev server 恢复 301；② 升级/patch pinia 消除全站 404→500。

---

## recipes/shimmer.vue（微光数据）— 均分 6.2

**视觉 7**：配置驱动的 4 数据集面板 + 顶部指标卡（物品转换 279 / 拆解规则 248 / 实体转换 121 / NPC 转换 29 / 未解析 0 / 状态 parsed）信息组织清晰。扣分：截图中 hero 下方出现一行未样式化裸文本 "配方编辑合成路径制作站管理任意物品组中文配方导入微光数据"——view-switch 视图切换导航塌成纯文本（样式/组件未加载或类名丢失）；以及全局 warning toast 遮挡面包屑。优化：修复 view-switch 组件的样式绑定（疑似 scoped 类名或 nav 组件渲染缺失）。

**结构 7**：`datasetConfigs` 配置驱动 4 个数据集的 CRUD（`/admin/shimmer/datasets/*`、`/admin/shimmer/overview`、`/admin/shimmer/context`），配置化是本页亮点。扣分：`getEntityColumnRole` 按列名前缀（input/output/npc/variantImageUrl）做**字符串嗅探**判定列角色，脆弱。优化：把列角色写进 `datasetConfigs` 的列定义（显式 `role` 字段），弃用前缀嗅探。

**架构 6**：直接用 `useApi` 的 get/post/put/del，数据流清晰；但**手写 data-table + 本地 pagination**，未用 `usePagedCollectionSync` / `AdminDataTable`。`form` 为 `reactive<Record<string, any>>` 弱类型。优化：迁移到 AdminDataTable + usePagedCollectionSync，form 按 dataset 定义类型。

**耦合度 6**：数据集之间通过 datasetConfigs 解耦得不错，主要耦合点是上述列名前缀嗅探把「列命名约定」和「渲染逻辑」隐式绑死。

**维护难度 5**：934 行、零测试覆盖。配置驱动降低了单元维护成本，但缺测试。优化：对 datasetConfigs 驱动的 CRUD 流补集成测试。

---

## recipes/stations.vue（制作站管理）— 均分 4.0（域内最低）

**视觉 7**：三合一工作区（表单 CRUD + 绑定工作区 + 站点列表）视觉尚可，但信息密度过高、单页职责过载。全局 toast 遮挡面包屑同上。

**结构 4**：典型 God-page，一页扛三套工作区。存在明确**死代码**：line 409 `v-if="false && bindingTargetItem && showBindingEditor && showInlineBindingEditor"` 包裹 `ItemRecipeEditor`（组件仍 import 但永不渲染），`showDeprecatedFlowPreview = false` / `showInlineBindingEditor = false` 常量封死的模板块。`handleUsageChipClick` 疑似无引用、`handleStationUsageChipClick` 忽略 station 参数。优化：删死代码与未用 import，把三工作区拆成三个子页面/子组件。

**架构 4**：**手写路由同步**——`hydrateStationWorkspaceFromRoute` + `syncStationWorkspaceRoute` + `isHydratingRoute` / `isSyncingRoute` 标志 + `loadSerial` 竞态守卫，deep watch `route.query` 全量 re-hydrate。`fetchCraftingStations(1, 500)` 一次拉全量做绑定选项（无分页）。未用任何共享分页/表格设施。优化：路由同步逻辑抽 `useStationWorkspaceContext` composable（与 index/tree 共享），绑定选项改按需搜索分页。

**耦合度 3**：承载 10 字段跨页查询协议的「主端」，且与 index / tree 手工复制该协议；`isCurrentStationBound` 按 stationId → itemId → internalName → nameEn → nameZh **五级回退**匹配站点身份，极脆弱（任一命名变动即误判）。`toRecipeDrafts` 与 index.vue 重复。优化：站点身份用稳定唯一 id 单一判定；draft mapper 与 query 协议共享化。

**维护难度 2**：2090 行（域内最大）+ 死代码块 + 手写路由同步 + 零测试。优化：这是最应优先拆分/加测的文件；拆分后每子组件补路由同步与身份匹配的单测。

---

## recipes/tree.vue（合成路径树）— 均分 6.3

**视觉 7.5**：树形合成路径展示清晰，`:global(.dark)` 覆盖处理了暗色模式，桌面 variant 选择逻辑到位。全局 toast 遮挡面包屑同上。

**结构 7**：职责相对单一（树可视化 + depth 控制）。扣分：`stationReturnContext` 与三个 query builder（约 80 行）**近乎逐字复制自 index.vue**；`visibleVariants` 桌面 variant 选择逻辑三页重复。优化：抽共享 composable。

**架构 6**：走 itemsStore `fetchItemRecipeTree`，数据流清晰。`watch(route.query)` 中 depth 变更 early-return 后 **itemId 变更不再处理**的小怪癖（切 depth 时若同时换 item 会漏更新）。优化：watch 拆成 depth watch 与 itemId watch 两个独立 watcher，避免 early-return 吞掉后续分支。

**耦合度 5**：同样手工复制 10 字段 query 协议（约 80 行）。优化：共享化。

**维护难度 6**：528 行（域内较小）、零测试。相对可控。优化：补树渲染与 depth/route 同步的单测。

---

## recipes/wiki-zh-import.vue（中文配方导入验收）— 均分 7.4（域内最高）

**视觉 7**：只读验收面板布局清晰。**主要扣分：样式硬编码亮色**（`rgba(255,255,255,.94)`、`#172230`、`#617287` 等）未用 `~/assets/css/variables.css` 令牌，暗色模式下会破。截图中同样有 view-switch 塌行与 toast 遮挡。优化：全部色值改用 variables.css CSS 变量。

**结构 8**：单一职责——只读展示 wiki_zh 导入状态，逻辑最简洁。

**架构 7**：单一 `GET /admin/recipe-imports/wiki-zh`，经 `~/types/recipeImport` 类型化，数据流最干净。优化：仅剩样式令牌化。

**耦合度 8**：域内最低耦合，不参与 10 字段 query 协议、不依赖 itemsStore 写路径。

**维护难度 7**：553 行但多为只读展示模板，逻辑简单；零测试是唯一硬伤。优化：补一个响应快照/渲染测试即可。

---

## 关联组件（未逐行细读，按行数与引用面记录）

- `ItemRecipeEditor.vue`（1029 行）：被 index / stations 引用；stations 中被 `v-if="false"` 封死仍保留 import（死引用）。体量偏大，建议后续单独评审拆分。
- `AdminRecipeTreeBranch.vue`（930 行）：tree.vue 的递归分支渲染核心，体量大，递归组件建议补边界（深度/循环引用）测试。
- `AdminItemLookupInput.vue`（470 行）：物品查找输入，跨多页复用，是本域少数被良好复用的共享组件。

---

## 跨页共性问题清单

1. **全局 warning toast 遮挡面包屑**（6 张截图共性）：toast 容器定位需避开 header 或该 warning 类需去重/自动消散。
2. **view-switch 导航塌成裸文本**（shimmer / wiki-zh-import 截图可见 "配方编辑合成路径制作站管理任意物品组中文配方导入微光数据"）：视图切换组件样式/渲染缺失。
3. **10 字段制作站上下文 query 协议在 index/tree/stations 三页手工复制** + `toRecipeDrafts` 重复：应抽 `useStationWorkspaceContext()` + 共享 draft mapper。
4. **配方域零测试覆盖**：35 个测试文件无一命中 recipe/shimmer/station/tree/wiki/item-lookup。
5. **全站 404 → 500**（pinia 2.3.1 shouldHydrate null-proto bug）：升级或 patch pinia。
