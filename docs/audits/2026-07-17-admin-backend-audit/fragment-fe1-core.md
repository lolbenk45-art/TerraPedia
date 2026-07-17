# 核心管理页面组

评审范围：`data-query-app/pages/` 下 8 个核心页面。基线共享设施：`composables/useApi.ts`（请求封装+401 统一跳转）、`composables/usePagedCollectionSync.ts`（分页列表增删改同步）、`components/AdminDataTable.vue` + `AdminTableShell.vue`（声明式表格与 loading/error/empty 壳）、`layouts/default.vue`（侧栏/面包屑/头部）、`assets/css/variables.css`（完整设计令牌）与 `main.css` 的 `workspace-shell--unified` 体系。

**评审前提说明**：`shots/login.png` 实际截到的是已登录重定向后的仪表盘（截图流程未清 cookie），login.vue 的视觉分基于代码推断并已注明。其余截图 CJK 字形缺失（截图环境无中文字体），但布局、密度、配色可正常评估。

## 汇总表

| 页面 | 视觉 | 结构 | 架构 | 耦合度 | 维护难度 | 均分 |
|---|---|---|---|---|---|---|
| pages/index.vue | 8 | 7 | 7 | 6 | 6 | 6.8 |
| pages/login.vue | 7* | 9 | 8 | 6 | 8 | 7.6 |
| pages/items.vue | 7 | 5 | 7 | 6 | 5 | 6.0 |
| pages/item-groups.vue | 7 | 6 | 7 | 6 | 6 | 6.4 |
| pages/item-rarities.vue | 8 | 7 | 6 | 6 | 7 | 6.8 |
| pages/categories.vue | 7 | 8 | 7 | 6 | 6 | 6.8 |
| pages/query.vue | 7 | 7 | 6 | 6 | 6 | 6.4 |
| pages/users.vue | 6 | 8 | 7 | 7 | 8 | 7.2 |

\* login 视觉分基于代码推断（截图为重定向后的仪表盘）。

---

## pages/index.vue（1035 行，仪表盘）

- **视觉 8/10** — 信息层次是 8 页里最完整的：hero 概览带 → KPI 四卡 → 数据全景分组瓦片 → 分类分布条形 → 快捷入口 → 最近动态，暖色浅底与深色侧栏对比得当。两处扣分：hero 的 eyebrow「概览」是块级 `p` 带背景（`items-hero__eyebrow`），渲染成横贯 hero 的整条浅青长条而非小徽标；同屏数字重复严重——6,159 在 hero 统计、KPI 卡、全景瓦片出现三次，2,492 出现两次。优化：给 eyebrow 加 `width: fit-content`（或改用 main.css 里 `workspace-shell--unified` 的标准 eyebrow 类）；hero 三个 `hero-stat`（index.vue:26-38）与 KPI 卡二选一，hero 改放「今日新增/待审核」等非重复指标。
- **结构 7/10** — 模板用注释分节，KPI/全景/快捷入口全部由配置数组（`kpiStats`、`entityPanorama`、`quickActions`、`opsLinks`）驱动 v-for，是好范式。但单文件 1035 行里约 580 行是 scoped CSS，`kpi-card`/`panorama-tile`/`quick-action`/`ops-card` 四种卡片样式结构高度相似。优化：抽 `DashboardLinkCard.vue`（icon+title+desc+arrow 的三种尺寸变体），index.vue:735-872 三大段 CSS 可合并为一份。
- **架构 7/10** — 正确复用 4 个 pinia store 且 `Promise.allSettled` 并发拉取（index.vue:444-452）。问题：为了「最近物品」直接调 `itemsStore.fetchItems(1, 5)`，把全局 items store 的列表和分页状态改写成 5 条——用户从仪表盘进 /items 时 store 里是被仪表盘污染过的状态；`articlesStore.sortBy = 'updatedAt'`（index.vue:445）同样直接改写共享 store 的查询状态。优化：statistics store 增加 `fetchRecentItems/fetchRecentArticles`（独立 state，不动 items/articles 的列表状态），或页面内用 `useApiFetch` 局部拉取。
- **耦合度 6/10** — `articleStatusTag`、`formatNumber`、`formatDate` 与 items.vue/articles 页的同名逻辑重复实现；`tag--emerald` 等 11 个 tag 颜色类在本页 scoped CSS 里硬编码 hex（index.vue:987-997），不走 variables.css 令牌，主题切换会失效；`selectedItem` 是 `any`。优化：状态→标签映射与 tag 调色板上移到 `utils/`（参照已有 `utils/rarity.ts` 的 `getRarityPresentation` 模式）+ main.css 全局 tag 类；`selectedItem` 用 `Item` 类型。
- **维护难度 6/10** — 1035 行是 8 页中第二大，无任何针对仪表盘的测试（tests/ 下无 dashboard/index 相关文件）；圈复杂度低（几乎全是展示逻辑），主要负担在 CSS 体量和三处数字来源（overview vs itemsStore.totalItems vs categoryOptions.length 的 fallback 链，index.vue:306-307）。优化：卡片组件化后 CSS 减半；给 `distribution` 的 percent 计算（index.vue:385-397）补一个纯函数单测。

## pages/login.vue（266 行）

- **视觉 7/10（基于代码推断）** — 居中玻璃卡 + 双 radial 光斑 + 渐变按钮，作为独立登录页完成度不错，层次清晰。两处问题：logo 是 emoji「📦」，与侧栏的 lucide `LibraryBig` 品牌图标不一致；整页颜色全部硬编码 hex（`#0f766e`、`#0e7490`、`rgba(255,255,255,.82)` 等，login.vue:98-254），完全绕过 variables.css，一旦启用暗色主题此页不会跟随。优化：颜色替换为 `var(--color-primary-dark)`/`var(--color-surface-1)` 等令牌；logo 改用 `<LibraryBig />` 复用 layouts/default.vue:23-25 的品牌样式。**另须修截图流程**：登录页截图前应清 `tp_admin_token` cookie，否则永远截到重定向后的仪表盘。
- **结构 9/10** — 66 行模板 + 37 行脚本，品牌区/表单/页脚三段清楚，BEM 命名统一。唯一可挑剔的是错误文案写死在两处字符串。优化：无必要动作；若做 i18n 再提取。
- **架构 8/10** — 走 `authStore.login`，redirect 参数校验了 `startsWith('/')` 防开放重定向（login.vue:74-77），与 useApi.ts:54-57 的 401 跳转闭环一致。扣分：`username: 'admin'` 预填在 reactive 初始值里（login.vue:68），生产环境等于泄露默认管理员名。优化：去掉预填，或用 `import.meta.dev ? 'admin' : ''`。
- **耦合度 6/10** — 逻辑耦合很低，但样式层与设计系统零耦合（见视觉条），是「负耦合」问题——该复用的没复用。错误提示把「凭证错误」与「接口不可用」合并成一句（login.vue:89），对排障不友好。优化：`authStore.login` 返回错误类型区分 401 与网络错误，分别提示。
- **维护难度 8/10** — 266 行、单一职责、无分支复杂度；无测试但风险面小。优化：给 `redirectTarget` 的安全校验补一个单测防回归（这是安全相关逻辑）。

## pages/items.vue（821 行）

- **视觉 7/10** — hero 统计（总数/可见/已选）与筛选区一体化，表格 sticky 表头、缩略图 + 中英文双行名称单元格，信息密度拿捏得当；批量操作按钮随选择态出现，危险操作红色区分。扣分：筛选表单占据近整屏高度（关键词/品质/时期/分类/操作五行堆叠），首屏几乎看不到表格；表格区标题写着「收藏」（items.vue:78）——语义不明的文案，应为「物品列表」。优化：`.items-toolbar`（items.vue:765）改 `repeat(4, minmax(0,1fr))` 单行排布 + 分类选择器收窄，把表格提回首屏；改掉「收藏」标题。
- **结构 5/10** — 335 行模板塞了四个职责：筛选工作台、批量操作表格、详情 modal、以及一个 20+ 字段的编辑器 modal（含实时预览 pane，items.vue:179-333 共 155 行）。编辑器和预览面板是完整独立的 UI 单元却内联在页面里；表格没有用 AdminDataTable/AdminTableShell，loading/empty 分支手写。优化：抽 `ItemEditorModal.vue`（表单+预览+recipeDrafts 一起搬走，可减 ~300 行）；列表区换 `AdminTableShell` 包裹（title/loading/empty props 全部现成）。
- **架构 7/10** — 是共享设施利用最好的页面之一：itemsStore（内部用 usePagedCollectionSync 同步增删改）、categoriesStore、supportDomainsStore 分工正确；URL query 双向同步（搜索条件 + itemId/view 深链，items.vue:422-431、702-717）做得完整。扣分：`toRecipeDrafts` 60 行 API 形状归一化函数（items.vue:618-676）放在页面里，它属于 store/util 层。优化：把 `toRecipeDrafts` 移入 `stores/items.ts`，让 `fetchItemRecipes` 直接返回 draft 形状。
- **耦合度 6/10** — `handleEdit` 用 `Object.assign(form, {...item})`（items.vue:514）把 Item 上所有字段（含 categoryPaths、updatedAt 等只读字段）拷进提交 payload，页面与 API 响应形状隐式耦合，后端加字段就会被原样回传；`onTableClick` 事件委托靠 `dataset.id` + `closest('button,input,label')` 字符串选择器（items.vue:583-589）。优化：resetForm 的字段清单已是 payload 白名单，handleEdit 按该清单显式 pick；行点击改为 `<tr @click="viewItem(row)">` + 按钮 `@click.stop`（已有 .stop，直接删事件委托）。
- **维护难度 5/10** — 821 行、密集单行函数风格（items.vue:403-415 一行一个箭头函数）读起来费力；批量操作/深链/图片上传/配方草稿多路状态交织。测试只有 `tests/items-progress-column.test.mjs`（regex 匹配 .vue 源码的 contract 测试，按既往结论这类测试对重构极脆）。优化：拆出 ItemEditorModal 后，对 `toRecipeDrafts` 与批量操作的 failedIds 回填逻辑（items.vue:591-616）写行为级单测。

## pages/item-groups.vue（849 行）

- **视觉 7/10** — 左列表右编辑器的 master-detail 布局正确，组卡片上 domain pill、来源状态 pill、未解析警告的分级用色（warn 橙）清晰；编辑器顶部 summary-strip 五格速览是好设计。扣分：hero 区五个统计卡里「当前域：全部」把文本塞进数字样式的大字号卡片，视觉权重错位；hero 右侧大片空白（截图中 hero 高约 480px 只有左半有内容）。优化：hero 统计缩到 3 个关键数字（组数/来源缺口/未解析），当前域信息已在下方 view-switch 高亮，删掉冗余；`workspace-summary-grid` 改 `--workspace-hero-summary-min` 收窄。
- **结构 6/10** — 模板分区（侧栏搜索列表 / 编辑器 / 来源追溯 / 成员面板）语义清楚，但 254 行模板 + 310 行脚本 + 280 行 CSS 单文件到顶了。成员卡（item-groups.vue:218-235）和来源表单是可独立复用的单元。优化：抽 `ItemGroupMemberCard.vue` 与 `ItemGroupSourceForm.vue`；`group-row` 列表项抽出后侧栏可直接虚拟滚动。
- **架构 7/10** — CRUD 全走 itemGroupsStore（含形状归一化），draft/activeGroup 克隆 + `isDirty` 脏检查 + 切换确认的编辑流完整；domain 与 route query 双向同步。扣分：`isDirty` 用 `JSON.stringify` 全量对比（item-groups.vue:295），成员多时每次渲染都序列化两棵树；`domainText/aliasText/sourceUrlsText` 三对 text↔array 手工同步函数是样板。优化：isDirty 改为 watch draft { deep } 置脏标志；三对同步收敛成一个 `useListTextField(listRef, separator)` 小 composable。
- **耦合度 6/10** — `canDeleteActiveGroup` 硬编码后端文件路径 `'data/generated/item-group-overrides.json'`（item-groups.vue:296），后端目录重构会静默让删除按钮永远消失；`pill--warn` 等用 `var(--color-warning, #f59e0b)` 带 fallback hex——variables.css 里明明有 `--color-warning`，fallback 是无效防御。优化：后端在 group 响应里返回 `deletable: boolean` 能力字段（与通用续传协议 Task 5 核查确立的 capability-based 原则一致）；删掉 CSS fallback。
- **维护难度 6/10** — 849 行是 8 页最大；有 `tests/item-groups-page-contract.test.mjs` 但为 regex-against-source 风格。脏检查/克隆/文本同步三套机制交织，改字段要动 cloneGroup、syncTextFieldsFromDraft、saveGroup 三处。优化：cloneGroup 的字段清单与 store 的 normalize 合并成单一 schema 定义，消除「加一个字段改三处」。

## pages/item-rarities.vue（315 行）

- **视觉 8/10** — hero+工具栏+表格的标准三段式，与 items 页同一代视觉语言，一致性好；表格「中文名+code 双行主单元格」（cell-primary）、状态 chip、引用计数列都得体，密度合适。扣分：hero 第三个统计「状态：浏览/筛选中」是凑数指标；负数 ID（-13 Master）直接裸展示，对不熟悉 Terraria 稀有度体系的维护者无解释。优化：第三格换成「已禁用数」；ID 列加 `title` 提示或在副标题里说明负 ID 为特殊难度品质。
- **结构 7/10** — 单文件 315 行，模板简洁分区明确。表格与 loading/empty 分支又是一套手写（items/users/index 同款），`.data-table` 40 行 CSS 第 N 次复制（item-rarities.vue:299-303 与 items.vue:770-774 逐字符相同）。优化：这是最适合首个迁移到 `AdminDataTable` + `AdminTableShell` 的页面——纯字典表、9 列、无复杂单元格，columns 配置 + 两个 cell slot（状态、操作）即可，可当作迁移样板。
- **架构 6/10** — 8 页中唯一完全绕开 pinia 的数据页：`get/post/put/del` 直接在页面里调（item-rarities.vue:218-280），rows 为本地 ref，筛选纯客户端。对 16 行的字典表这样做能跑，但与全站「store 承载数据访问」的架构不一致，且其他页面（items 的稀有度下拉）用的是 `utils/rarity.ts` 静态清单，两处数据源不同步——这里改了品质，items 筛选下拉不会变。优化：建 `stores/itemRarities.ts`（照 users store 的 133 行模式），并让 `RARITY_FILTER_OPTIONS` 从该 store 派生。
- **耦合度 6/10** — 每个 handler 重复 `error?.data?.message || error?.message || '...'` 三段式取错误文案（出现 3 次）；响应形状 `{success, data}` 内联解构。优化：useApi.ts 已有统一 `handleApiError`，再补一个 `getApiErrorMessage(error)` util 全站复用；响应解包进 store 后页面不再见 API 形状。
- **维护难度 7/10** — 315 行、逻辑直白、单测缺失但风险面小。主要维护负担是上述与 rarity utils 的双数据源漂移。优化：迁 store 后给「删除被引用品质应被后端拒绝」补一条行为测试（这是唯一有业务约束的路径，item-rarities.vue:272-281 现在只透传后端错误）。

## pages/categories.vue（674 行）

- **视觉 7/10** — hero+快速定位 chips+匹配结果+树的分层导航思路好，树节点行内 code 标签与操作链接排布清楚。扣分：快速定位 chips 把所有根分类平铺，截图里近半数是「0」计数（装备图纸 0、任务物品 0…），噪音多；chips 区、匹配结果区、树三层卡片嵌套（section-card 里套 subtle-surface）视觉层级偏深。优化：`rootQuickLinks` 过滤 `count > 0`（categories.vue:225-229 加一行 filter），或零计数 chips 降灰折叠进「更多」。
- **结构 8/10** — 8 页中组件化最好的：树递归交给 `CategoryTreeNode.vue`，页面只管筛选与表单，模板 180 行干净。扣分：modal 表单仍内联（可接受），`expandSignal++/collapseSignal++` 信号计数器穿透 props 是隐式事件总线。优化：展开状态提升为 `provide/inject` 的 Set<id>，CategoryTreeNode 直接读写，去掉两个 signal props。
- **架构 7/10** — categoriesStore 承载树与 CRUD，页面持有纯展示筛选（filterTree 保留父链路的算法正确）。扣分：`focusCategory` 直接 `document.getElementById('category-node-'+id)`（categories.vue:379-381），页面与子组件的 DOM id 约定字符串耦合；`handleSubmit` 成功后 `dialogVisible=false; handleAdd(null); dialogVisible=false`（categories.vue:361-363）——handleAdd 内部会把 dialogVisible 置 true 再被第二行压回 false，是靠副作用顺序凑出来的重置 hack。优化：把「重置表单」从 handleAdd 里拆出独立 `resetForm()`，submit 成功只调 resetForm；focus 改由 CategoryTreeNode 暴露的 scrollTo 事件或 template ref 完成。
- **耦合度 6/10** — 最大问题：categories.vue:600-651 在页面 scoped CSS 里重新定义了 `.btn/.btn-primary/.btn-secondary/.input` 全套基础控件样式，与 main.css 全局版本并存——全局按钮样式升级时此页会漂移（这正是 crawler-monitor 重构时确认过的「页面私有重定义」反模式）。优化：删除 categories.vue:600-651 整段，缺什么补页面级修饰类，基础控件一律吃全局。
- **维护难度 6/10** — 674 行、递归 filter/count/collectDescendantIds 三个树遍历函数集中且可测但无测试；私有 .btn 样式和 signal 机制是两处隐性维护税。优化：filterTree/collectDescendantIds 是纯函数，抽到 `utils/categoryTree.ts` 并补单测（树保父链逻辑最容易在改动中回归）。

## pages/query.vue（616 行）

- **视觉 7/10** — 左表清单右编辑器+双结果面板的工作台布局合理，SQL 区 monospace、暗底示例数据块的代码感对味。扣分：页头是旧式 `page-head` 裸标题，没有 workspace-shell hero，与 items/categories 的新视觉不同代；空态图标用 emoji（🗂️🧪📐，query.vue:38/123/148）而全站是 lucide；结果表格与结构预览左右并排在窄屏前就开始互相挤压。优化：页头套 `workspace-shell--unified`（参照 item-rarities.vue:3-44 的最小实现）；AppEmptyState 的 icon 改传字母缩写或 lucide 名，与其他页统一。
- **结构 7/10** — 数据表侧栏/编辑器/结果/结构四卡分区清楚，预设 chips 数据驱动。结果表格又是一套手写 data-table。优化：结果表是 `AdminDataTable` 的天然客户——columns 就是 `result.columns.map(c => ({key:c,label:c}))`，一行接入。
- **架构 6/10** — 明确是 mock 工作台（页面 notice 也写了），绕过 useApi 直接 `$fetch` 本地 `/local-query/*`（query.vue:212-214）。问题在于假装的层次：`loadItemsStructure` 硬编码只给 items 表造结构，类型靠 `field.endsWith('_id') ? 'int' : 'varchar'` 猜（query.vue:272-275）；`timeoutSeconds` 传给了 mock 但无实际约束。优化：要么接真只读接口（后端加 `/admin/query` 只读白名单），要么把 mock 数据整体挪进 `server/api/local-query/`，页面按真实协议写，去掉页面内的猜测逻辑。
- **耦合度 6/10** — 预设 SQL、默认表名 'items'、mock 端点路径、默认 SQL 字符串在页面里出现 4 处（query.vue:191/203-206/221/295）；错误处理三段式取 message 重复。优化：presets 与 DEFAULT_SQL 常量化到文件顶部单一来源；复用统一的 getApiErrorMessage。
- **维护难度 6/10** — 616 行自包含、无测试；作为 mock 页维护成本低，但也意味着它是「看起来能用实际不连库」的潜在误导源——notice 文案是唯一防线。优化：若短期不接真接口，考虑把入口从侧栏「资产工具」降级或加 Beaker 图标标注实验性（layouts/default.vue:326 目前用 FileSearch，与正式功能无区分）。

## pages/users.vue（242 行）

- **视觉 6/10** — 8 页中最素：旧式 page-head、无 hero 统计、工具栏三控件裸排。表格本身干净（状态 pill、时间列、操作链接），但与 items/categories/item-rarities 的 workspace 视觉明显是两代产品；工具栏输入框只有 placeholder 没有 label（items 页都有 `field__label`），可访问性与一致性双输。优化：套用 item-rarities.vue 的 hero+toolbar 结构（总用户/已启用/本月新增三个统计现成可算）；输入框补 label。
- **结构 8/10** — 242 行小而清晰，toolbar/table/modal 三段无赘肉。表格手写（同款 .data-table CSS 第 N 份拷贝）。优化：与 item-rarities 一起作为 AdminTableShell + AdminDataTable 的首批迁移对象，两页加起来能删 ~80 行重复 CSS。
- **架构 7/10** — usersStore 承载列表/分页/筛选，`storeToRefs` 把 keyword/status 直接 v-model 到 store（筛选状态天然持久于路由往返），分页走 store。扣分：重置密码用 `window.prompt` 收集新密码（users.vue:163），明文出现在浏览器原生框且无长度校验前置；临时密码用 toast 展示（users.vue:167），停留几秒即消失且可能被旁观截屏。优化：重置密码改 AppModal + password input + 前端校验（复用创建表单的规则文案）；结果改为「复制到剪贴板」按钮而非 toast 明文。
- **耦合度 7/10** — 页面对 API 形状零感知（normalize 全在 store，users store 的 normalizeUsers 是 8 页配套 store 里防御性最好的）；v-model 直连 store ref 意味着输入未提交就已污染全局筛选状态，从别页返回时输入框内容「还魂」，是低风险但真实的行为耦合。优化：keyword 在页面持本地 ref，submit 时写回 store（与 items.vue 的 searchForm 模式对齐）。
- **维护难度 8/10** — 242 行、逻辑线性、store 已隔离形状；无测试但面小。优化：给 normalizeUsers 的容错分支（data/list/裸数组三形状，stores/users.ts:34-45）补一个纯函数测试即可锁住最大风险点。

---

## 跨页系统性发现

1. **AdminDataTable/AdminTableShell 采用率为 0/8**：这两个共享组件质量不错（点号路径取值、slot 定制单元格、loading/error/empty 全套），但 8 个核心页全部手写 table——`.data-table` 那 5 行 CSS 在 index/items/item-rarities/users 至少四份逐字符拷贝，loading/empty 分支手写 8 遍。建议以 item-rarities、users 两个纯字典页为迁移样板，再推 items。
2. **视觉两代并存**：items/categories/item-rarities/item-groups/index 用 `workspace-shell--unified` 新体系，users/query 还是裸 `page-head`，login 整页硬编码 hex 不吃 variables.css 令牌（暗色主题会破）。
3. **原生对话框当交互层**：`window.confirm` 出现在 items（3 处）/categories/item-groups（3 处），`window.prompt` 在 users 收密码——项目里 AppModal 现成，密码场景尤其不该走 prompt。
4. **测试缺口**：8 页仅 items（progress column）与 item-groups 有 contract 测试，且均为 regex-against-.vue 源码风格（与既定「行为测试优先」的方向相悖）；仪表盘、categories 树过滤、users 归一化等纯函数逻辑零覆盖。
5. **截图流程缺陷**：login.png 截到的是登录态重定向后的仪表盘，登录页从未被真正截到；后续视觉回归需在截图脚本里对 /login 清 cookie。
