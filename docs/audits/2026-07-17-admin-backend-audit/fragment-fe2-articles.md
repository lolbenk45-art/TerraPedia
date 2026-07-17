# 文章域页面组

## 汇总表

| 页面 | 视觉 | 结构 | 架构 | 耦合度 | 维护难度 | 均分 |
|---|---|---|---|---|---|---|
| pages/articles.vue | 7.5 | 7 | 7.5 | 7 | 6 | **7.0** |
| pages/article-comments.vue | 7.5 | 6 | 7 | 6.5 | 5.5 | **6.5** |
| article-editor 整体 | 8 | 6 | 6.5 | 6.5 | 5.5 | **6.5** |
| article-editor-design.vue | — | — | — | — | — | 已删除（9762905），见末节残余问题 |

---

## pages/articles.vue（919 行）→ shots/articles.png

### 视觉 — 7.5/10

截图显示整体是干净的管理端表格页：命令栏（标题+计数徽章+搜索/筛选/主按钮）、封面缩略图列、双徽章状态堆叠（文章状态+审核状态）、三段式时间线列，信息密度与层级都不错，hover 行高亮与主按钮渐变符合主题。问题：操作列三组按钮纵向堆叠导致行高被撑得很高（截图中单行近 160px）；"待审核文章请进入审核工作台处理" 这类长句被渲染成按钮样式，视觉上像可点击操作实际只是跳转编辑，语义混乱；徽章配色（`#dcfce7/#fee2e2/#fef3c7` 等）全部硬编码浅色 hex，而侧栏/编辑器已走 `--color-*` 令牌，暗色主题下这些徽章会刺眼断层（contract 测试甚至专门约束编辑器必须用令牌，本页却漏网）。

**优化方案**：1) 徽章色改为 `color-mix(in srgb, var(--color-success/warning/danger) N%, transparent)` 令牌方案，与编辑器同一约束；2) 操作列改为"主操作按钮 + ⋯ 下拉菜单"收纳工作流操作，压回单行高度；3) 把"待审核请进工作台"从按钮降级为带图标的提示文本或直接合并进主按钮 label（已有 `editorActionLabel` 会显示"审核文章"，此按钮信息重复）。

### 结构 — 7/10

模板 244 行组织清晰：命令栏、表格、两个 AppModal（正文预览/审核记录）边界分明，helper 函数（状态 label 映射、can* 谓词、runArticleAction 包装）短小职责单一。问题：项目里已有 `AdminDataTable.vue`（列配置+slot 单元格+点路径取值）作为共享表格基线，本页仍手写 `<table>` 全套 markup 与 `.data-table` 样式；审核记录 modal 内又手写第二张表；`.reject-modal` 相关 CSS（约 10 行）是死代码——驳回弹窗已按 contract 要求移除但样式残留。

**优化方案**：1) 表格迁移到 `AdminDataTable` + `cell:*` slot，删掉本页 ~60 行表格 CSS；2) 删除 `.reject-modal__*` 死样式与 `.title-cell small, .reject-modal__title` 联合选择器里的残留引用；3) 审核记录 modal（表格+分页+加载态，约 90 行模板+逻辑）可抽成 `ArticleReviewLogsModal.vue`，article-editor 的审核工作台也拉取 review logs，可复用。

### 架构 — 7.5/10

数据流是标准的 Pinia store 驱动：列表/分页/筛选词全在 `stores/articles.ts`，页面经 `storeToRefs` 消费，动作全部委托 store 方法，store 内 `syncArticle` 保证单条更新回写列表，这条链路干净。问题：错误处理分层不一致——`fetchArticles` 在 store 内 catch+toast，而 `submitReview/publish/offline` 在 store 内 toast 成功、抛出失败让页面 `runArticleAction` 再 toast，成功/失败提示分居两层，改文案要跨两个文件；store 的 `sortBy` 默认 `'commentCount'` 但本页无任何排序 UI，用户看到的排序规则不可见也不可控；筛选状态（keyword/status）放 store 意味着跨页残留（从 article-comments 回来时筛选还在，可能是预期也可能是坑）。

**优化方案**：1) 统一错误策略：store 动作全部只抛不 toast，页面层统一 `runArticleAction` 处理成功+失败提示；2) 在命令栏暴露排序控件（评论数/更新时间/ID），或把默认排序改回 `updatedAt` 并注释说明；3) 若筛选残留非预期，在 `onUnmounted` 或路由离开时重置，或改为 URL query 同步（项目已有 `usePagedCollectionSync` 可借用）。

### 代码耦合度 — 7/10

页面对后端形状的耦合被 store 很好地隔离：`normalizeArticles` 兜 6 种列表包裹形状、`toPagination` 兜 4 层分页字段、`extractArticleCommentCount` 尝试 11 个候选 key——页面只见 `AdminArticle` 类型。但这本身是个信号：兜形状的广度说明后端契约不稳，且这些兜底无一有测试锁定具体走哪个分支（行为测试只覆盖 2 种）。`sanitizeArticleHtml` 从 `utils/articleEditor` 导入、页面纯调用不改动，符合"contract 逐字提取执行须自包含"的约束，无违规。`contentPreviewHtml` 里 `article.contentHtml || article.contentMarkdown` 把 Markdown 当 HTML 喂给净化器再 v-html，若后端真返回纯 Markdown 会渲染成无格式文本——是对"contentMarkdown 实际存的是 HTML"这一隐式后端约定的暗耦合。

**优化方案**：1) 与后端确认 `contentMarkdown` 语义：若确为历史 HTML 字段，在 `AdminArticle` 类型上注释并改名映射（如 `legacyContentHtml`）；若真是 Markdown，接 marked/markdown-it 再净化；2) 给 `normalizeArticles/toPagination` 补形状快照测试（现有 vm+transpile 测试基建已能跑 store），砍掉实际后端从不返回的兜底分支；3) `extractArticleCommentCount` 的 11 个 key 应收敛到后端实际返回的 1-2 个，其余分支删除。

### 维护难度 — 6/10

919 行中约 500 行是 scoped CSS，脚本仅 ~175 行，实际逻辑负担不大。真正的维护税在测试：`admin-articles-page-contract.test.mjs`（315 行）是纯 regex-against-.vue 源码匹配——断言到 `width: 1.875em` 这种 CSS 字面量和 `class="articles-command-bar"` 这类 class 名，任何无害重构（改个 class 名、调整 CSS 值）都会红，且它锁不住任何运行时行为（按钮点了是否真的调 store 它不知道）。对比之下 `articles-comment-count-refresh-behavior.test.mjs` 是正确范式：vm+ts.transpile 加载 store、mock get、断言状态变迁。另外 badge/action-link/data-table 样式在 articles.vue 与 article-comments.vue 间重复。

**优化方案**：1) 逐步把 contract 测试中"业务规则类"断言（如"待审核不得绕过工作台"）迁移为组件挂载测试（@vue/test-utils + happy-dom，断言按钮存在性与 store 调用），纯 CSS/class 断言直接删除；2) 抽 `assets/css/admin-table.css` 或提升到 `AdminDataTable` 承载共享表格/徽章样式，消除双页重复；3) 保留 contract 测试仅用于"禁止性"断言（doesNotMatch 乱码/危险属性）这类低成本高价值项。

**单页均分：7.0**

---

## pages/article-comments.vue（1585 行）→ shots/article-comments.png

### 视觉 — 7.5/10

截图展示的是文章入口列表视图：卡片式行（封面缩略图 + 编号/标题/摘要 + 状态双徽章 + 作者/评论数/浏览数信号胶囊 + 更新时间 + "管理评论"主操作），信息组织比 articles.vue 的表格更松弛易扫，命令栏把搜索/状态/排序/排序方向压成一行也够紧凑。hover 高亮（primary 混色边框）反馈得体。问题：状态徽章依然是 `#dcfce7/#fee2e2/#fef3c7` 硬编码浅色系（1018-1030、1195-1206 两组重复定义），暗色主题必断层；信号胶囊全部同一灰度样式，评论数（本页核心指标）与浏览数没有视觉权重差；单文章工作区（截图未展示）里"评论列表 → 详情视图"是整块切换而非抽屉/分栏保留上下文，处理完一条要"返回评论列表"再找下一条，分诊流有割裂感——这与 crawler-monitor 分诊 UX 重做里确认的"工作台+抽屉"方向相悖。

**优化方案**：1) 徽章/按钮语义色统一走 `--color-success/warning/danger` 令牌 + color-mix；2) 评论数胶囊在"校准失败/校准中"之外给正常态也加 primary 着色，突出排序主键；3) 详情视图改为右侧抽屉（Drawer）叠在列表上，保留列表滚动位置与选中态，对齐 crawler-monitor 分诊工作台的成熟交互模式。

### 结构 — 6/10

1585 行单文件承载了三个完整视图：文章入口列表（~110 行模板）、评论密集表格+速览侧栏（~140 行）、评论全屏详情+管理操作面板（~150 行），外加 ~790 行 CSS。模板内边界靠两层 `<template v-if>` + `v-else` 切换，`activeCommentView` 再切第三层，嵌套深、缩进已出现漂移（145 行起的 section 缩进与外层不齐）。script 里 30+ 个顶层函数/ref 平铺，列表选择、详情回复链、moderation 三块状态互相穿插。这是全 admin 里除 layout 外最大的页面之一，但拆分为 0 个子组件。

**优化方案**：1) 至少拆三个组件：`ArticleCommentEntryList.vue`（文章入口）、`CommentModerationTable.vue`（密集表+速览侧栏）、`CommentDetailPanel.vue`（详情+操作），各带自己的 scoped 样式，主页面剩视图路由逻辑 <200 行；2) moderation 相关状态（target/reason/preset/submitting）收进一个 `useCommentModeration` composable，和视图切换状态分离；3) 修复模板缩进漂移，`<template v-else>` 块内的 section 统一缩进层级。

### 架构 — 7/10

双 store 协作是本页亮点也是隐患：文章列表复用 `articlesStore`（含筛选/分页/排序全套 store 态），评论区用独立 `articleCommentsStore`（currentArticle + filters + 评论分页），`setCurrentArticle` 重置 filters 的收敛做得对，`requireCurrentArticle` 守护也到位。问题一：`refreshArticleCommentCounts` 的实现是对每篇文章发一个 `limit=1` 的评论列表请求取 pagination.total——一页 10 篇文章就是 10 个并发请求，纯粹为了拿计数，这是后端缺 `commentCount` 聚合字段的前端补偿，成本高且每次搜索/翻页/重置都全量重放。问题二：`submitStatusChange`（733-772 行，40 行）在状态更新后做了四层嵌套的选中态恢复逻辑（refreshedComment → refreshedSelected → 回复链查找 → 兜底），可读性差且暗含时序假设。问题三：本页 `onMounted` 直接改写 `articlesStore.keyword/status/sortBy` 全局态，会把用户在 /articles 页设置的筛选悄悄清掉——两页共享一个 store 的筛选态但语义不同。

**优化方案**：1) 推动后端在 `/admin/articles` 列表响应中带 `commentCount`（store 已有 11-key 兜底提取器等着它），砍掉 N+1 计数请求；短期至少给 `refreshArticleCommentCounts` 加并发上限与去重；2) `submitStatusChange` 的选中态恢复抽成纯函数 `resolveNextSelection(comments, replies, targetId, prevSelectedId)` 并配单测（现有 vm 测试基建可直接用）；3) 文章筛选态从共享 `articlesStore` 剥离：本页用局部 ref 或独立轻量 store，停止两页互踩。

### 代码耦合度 — 6.5/10

后端形状隔离整体尚可：`articleComments.ts` 的 normalize 同时兜 camelCase/snake_case 双形状，页面只消费类型化对象。但耦合点不少：1) 页面直接 `storeToRefs` 拿出 `keyword/status/sortBy/sortOrder` 并写入——页面与 `articlesStore` 的可变全局态强耦合（上述互踩问题的根源）；2) `openArticleCommentWorkspace` 手工把 `AdminArticle` 的 8 个字段逐一映射进 `ManagedArticleSummary`，两个类型形状漂移时这里静默丢字段；3) `commentFilters.value.keyword = ''` 等三行直接改另一 store 的 filters 内部字段，绕过了 `setCurrentArticle` 已有的重置逻辑（重复且可能不同步）；4) 记忆中确认的坑在此可见：文章状态筛选的 `status` 参数过滤的是发布态而非审核态，后端无 reviewStatus 过滤，本页状态下拉与 articles.vue 复用同一语义，尚一致，无违规。sanitize 约束不适用本页（无 v-html）。

**优化方案**：1) 提供 `toManagedArticleSummary(article: AdminArticle)` 转换函数放在 `stores/articleComments.ts` 内，替代页面手工字段映射；2) 删除页面里对 `commentFilters` 的直接清空（`setCurrentArticle` 已做）；3) 文章列表筛选态解耦（同架构条第 3 点）。

### 维护难度 — 5.5/10

1585 行是全文章域最重的页面文件，CSS 占 ~790 行且与 articles.vue 存在成块重复（page-btn 系列、status-badge 配色、empty-state、pagination-wrap、data-table 基础样式），页内自身还有两组重复的徽章配色定义（1018 与 1195 两处）。测试面：`admin-global-comment-management-contract.test.mjs`（228 行）again 是 regex-against-.vue 反模式，断言细到 `grid-template-columns:\s*minmax\(0,\s*1fr\)\s*320px` 这种布局字面量——改一个侧栏宽度都会红；而真正复杂、最值得测的 `submitStatusChange` 选中态恢复逻辑（四层分支）却零行为测试覆盖。唯一的行为测试（comment-count refresh）测的是 store 不是本页逻辑。

**优化方案**：1) 组件拆分（结构条方案）自然把 CSS 分摊，同时把 page-btn/status-badge/empty-state 提到共享样式层；2) 为 `submitStatusChange` 的选中恢复、`canHide/canDelete/canRestore` 谓词、`commentRelationLine` 写纯函数级行为测试；3) contract 测试保留端点白名单类断言（"只用 article-scoped 端点"那条有真实价值，防止调用不存在的全局评论 API），删除布局字面量断言。

**单页均分：6.5**

---

## article-editor 整体（new.vue 14 行 + [id].vue 83 行 + useArticleEditor.ts 1621 行 + ArticleEditorWorkspace.vue 1897 行 + ArticleReviewWorkspace.vue 757 行 + AdminArticleRuntimePreview.vue 243 行）→ shots/article-editor-new.png

### 视觉 — 8/10

截图显示的是全文章域里最成熟的界面：顶部工作栏（身份+字数/图片/小标题指标胶囊+保存草稿/提交审核动作区）、居中"纸张"式写作台（标题输入 + 双排工具栏 + 大面积写作区）、右侧 340px 检查器（发布准备 1/5 进度、摘要、slug、封面上传/裁剪、质检清单），文档优先（document-first）的信息层级与主题令牌化配色（contract 测试锁定 `--editor-paper: var(--color-surface-2)` 等全部走令牌）在暗色下也能保持一致。小瑕疵：工具栏拆成两条浮动分组，中间留白使按钮归属感偏弱；文字色板选项硬编码 `#111827` 等 6 个 hex，暗色主题下"默认色"实际不是主题默认。

**优化方案**：1) 工具栏两排合并为一条自适应换行的 band，分组间用细分隔线而非独立浮岛；2) `textColorOptions` 的"默认色"改为写入时移除 color 样式（继承主题），而非硬编码 `#111827`。

### 结构 — 6/10

路由壳（new.vue 14 行 / [id].vue 83 行）做得很薄，`[id].vue` 按 reviewStatus 分流 ReviewWorkspace / EditorWorkspace 的决策放在路由层，干净；`AdminArticleRuntimePreview` 被编辑/审核两个工作台共享（有行为测试锁定"单一运行时预览组件"），是正确的抽取。但两个巨石依旧：`ArticleEditorWorkspace.vue` 1897 行（其中 CSS 约 1185 行、模板 671 行、script 仅 37 行——所有逻辑都在 composable），`useArticleEditor.ts` 1621 行返回约 90 个 key 的"上帝 composable"，selection 管理、execCommand 工具栏、封面裁剪状态机、本地草稿、引用搜索、图片上传全部平铺在一个函数作用域里。

**优化方案**：1) 按内聚域把 useArticleEditor 拆为 5 个子 composable：`useEditorSelection`（save/restore/toolbarState 同步）、`useCoverCrop`（20+ 个 crop ref 是明显的独立状态机）、`useLocalDraft`（快照/恢复/beforeunload）、`useContentReferences`（搜索+插入）、`useEditorImages`（paste/drop/upload-on-save），主 composable 只做编排；2) 模板同步拆 `EditorToolbar.vue`、`EditorInspector.vue`、`CoverCropModal.vue`，把 1185 行 CSS 分摊；3) 拆分时同步瘦身 contract 测试中锁定内部 class 名的断言（先删测试断言再动结构，避免假红）。

### 架构 — 6.5/10

亮点密度高：本地草稿自动保存（debounce 800ms）+ 恢复横幅 + beforeunload + `onBeforeRouteLeave` 双守护的脏数据保护闭环完整；引用搜索用 sequence 计数防竞态；"正文图片先以 data/blob URL 本地预览、保存时统一上传替换 src"的延迟上传策略避免了编辑期的孤儿文件。硬伤：1) 整个富文本编辑建立在已废弃的 `document.execCommand` 之上（styleWithCSS/fontSize hack、`font[size="7"]` 再归一化为 px 这类补丁就是其代价），浏览器随时可能进一步劣化其行为；2) `writeLocalDraft` 里 `localStorage.setItem` 无 try/catch——正文含几张 base64 大图（单张上限 5MB）时必然打爆 ~5MB 配额，QuotaExceededError 在 debounce 回调里未捕获，自动保存静默死亡且状态仍显示"本地草稿已更新"；3) 保存流程（sanitize → 封面上传 → 内嵌图上传 → create/update → 路由 replace）串行分支多但无中间态可恢复，第 3 步失败后已上传的封面成为孤儿。

**优化方案**：1) 中期迁移到 Tiptap/ProseMirror（保留现有 sanitizer 作为出口净化），短期至少把 execCommand 调用集中到单一 adapter 模块便于替换；2) `writeLocalDraft` 包 try/catch，quota 失败时降级为仅保存 title/summary/slug 元数据并在状态栏提示"正文过大，本地备份不可用"；3) 保存失败时记录已上传资源 URL，下次保存复用（`uploadedUrlMap` 提升到 composable 级别缓存）。

### 代码耦合度 — 6.5/10

sanitize 约束遵守良好：`sanitizeArticleHtml` 在 `utils/articleEditor.ts` 内完全自包含（模块内 helper、`typeof DOMParser` 守护、无 DOM 环境时降级为 `escapeHtml(stripTags())` 惰性文本），composable 只 import 调用不复制逻辑，`admin-article-runtime-preview.test.mjs` 还真实执行了它（happy-dom + 无 DOMParser 两条路径），合规。真正的耦合债：1) `buildContentReferenceHtml`（composable 内）产出的 HTML 必须与 sanitizer 的 `tp-content-ref` 属性白名单（utils 内）逐属性对齐——加一个 data 属性要同时改两个文件外加两处 contract 断言，这个"生成器-净化器"契约没有共享常量；2) 前台 `front-nuxt` 的净化已切 DOMPurify（faacf89 只改了 front-nuxt），管理端仍是手写白名单——同一份文章内容此后经过两套语义不完全一致的净化器，白名单漂移只能靠人肉同步；3) `isSafeDataImage` 允许 `svg+xml` data URL 粘贴插入，但 sanitizer 的 `isSafeUrl` 不含 svg——用户粘贴 SVG 能预览、保存时被静默剥除，无提示；4) 编辑器加载沿用 `contentHtml ?? contentMarkdown` 暗契约。

**优化方案**：1) 把 `tp-content-ref` / `tp-recipe-tree` 的合法属性表提为 `utils/articleEditor.ts` 导出的共享常量，builder 与 sanitizer 同源消费（保持在同一文件内不破坏自包含约束）；2) 管理端与前台净化器统一：或管理端也切 isomorphic-dompurify + 同一份 hook 策略，或在 shared/ 提取共享白名单配置；3) `isSafeDataImage` 移除 `svg+xml` 或在插入时 toast 告知保存会丢弃 SVG。

### 维护难度 — 5.5/10

3500+ 行核心代码（composable+workspace）集中在两个文件，任何工具栏小改动都要在 1621 行里定位。测试是冰火两重天：`admin-article-runtime-preview.test.mjs` 是全域最佳实践（happy-dom 真执行 sanitizer/渲染器/请求队列，甚至校验后端 DTO 字段对齐）；但 `admin-articles-page-contract.test.mjs` 里约 130 行 regex 断言直接锁死 EditorWorkspace 的 class 名、CSS 变量赋值、甚至 `grid-template-columns: minmax(0, 1fr) 340px` 字面量——结构条建议的任何拆分都会连带改 30+ 条断言，重构税极高。编辑器最复杂的纯逻辑（快照序列化/草稿恢复判定、`canSubmitReview` 状态机、`collectSelectedBlocks`）零行为测试。

**优化方案**：1) 优先为 `normalizeSnapshot/serializeSnapshot/resolveRecoveryDraft` 判定逻辑和 `normalizeArticleContentReference` 写纯函数测试（无需 DOM，成本最低收益最高）；2) contract 测试按"安全断言（doesNotMatch 危险属性/乱码）保留、行为断言迁移 happy-dom、样式字面量断言删除"三分处理；3) 拆分计划（结构条）执行时以"测试先行改写"为第一步。

**整体均分：6.5**

---

## pages/article-editor-design.vue（设计预览路由）

**结论：该文件已不存在——它在 2026-07-16 的提交 `9762905`（"chore(admin): remove unused article-editor-design and recipes/groups pages"）中被删除（原 1012 行的静态设计 mockup，无任何运行时引用），相关 contract 断言也已同步清理。删除决策正确：设计稿不应占据生产 pages/ 路由。** 不再给五维评分，但留下三个残余问题：

1. **构建产物残留**：`.output/` 下仍存在 `article-editor-design.DgsLL1jq.css`、`article-editor-design-CButR56c.mjs` 等已删除页面的 chunk——当前部署产物是删除前构建的，若直接以此 .output 上线，死路由仍可访问。执行一次全量重建并确认 `.output` 中无 `article-editor-design*` 残留。
2. **同类反模式仍在生产**：`server/routes/design/crawler-monitor-formal-v4.get.ts` 依然把 `.superpowers/brainstorm/12379-.../crawler-monitor-b-formal-v4.html`（头脑风暴产物目录）作为生产 server route 对外服务，且 `design-preview-route-contract.test.mjs` 反而用断言锁定它必须存在。设计预览应放 Storybook/独立静态站或至少加环境开关（`if (!import.meta.dev) throw 404`），并解除 contract 测试对 brainstorm 目录的构建期依赖。
3. **建议补一条"负向 contract"**：现有测试模式擅长 doesNotMatch，可加一条断言 `pages/` 下不存在任何 `*-design.vue` / `*-mock*.vue`，把"设计稿不进生产路由"从一次性清理固化为规则。
