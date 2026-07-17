# 实体域页面组

## 汇总表

| 页面 | 视觉 | 结构 | 架构 | 耦合度 | 维护难度 | 均分 |
|---|---|---|---|---|---|---|
| pages/entities/[type].vue（8 实体动态页，5603 行） | 7.5 | 3 | 4 | 3 | 2.5 | **4.0** |
| town-npcs 工作台（index + [id] 两页 + composable + WorkbenchModal） | 8 | 6 | 6.5 | 5.5 | 6 | **6.4** |

评分口径：10 分制，分数越高越好（"维护难度"维度高分 = 易维护）。

---

## entities/[type].vue（5603 行）

结构地图：template 1698 行（其中 494–1683 是**单个 AppModal 内 7 路互斥 `v-else-if` 详情巨型分支，约 1190 行，占 template 70%**）+ script 3089 行 + style 816 行（按实体纵切命名空间，boss 系一家约 490 行）。全文件 **159 处 `entityType ===/!==` 比较，0 个 switch，0 个策略注册表**。

### 视觉 7.5/10

八张截图整体统一度高：hero 头卡 + 三统计卡 + 筛选区 + 数据表的骨架在 8 种实体间一致，teal 主色、filter-chip、徽章、缩略图风格都在同一体系内；bosses 有专属图谱画廊、biomes/world-contexts 有场景缩略图，信息密度贴合各实体特征。扣分点：(1) 顶部"开发中"警告横幅悬浮遮挡面包屑与主内容衔接区，且在所有页面常驻；(2) condition-terms 表格右缘"操作"列被裁切出视口（截图可见列头"操"字被截半），最小宽度与容器约束没对齐；(3) 行内 `internalName: … · 来源 ID: …` 的代码字体次级信息在 NPC/Buff/Projectile 三页样式不完全一致（有无背景色、换行策略不同）。

**优化**：警告横幅改为可折叠贴顶条；给 condition-terms 的列配置补 `minWidth` 或砍冗余列；把"次级代码信息行"抽成统一的 cell 子组件。

### 结构 3/10

单文件塞下 8 个实体的列表、筛选、表单、详情、样式。详情 Modal 是结构灾难核心：armor-sets 199 行、npcs 269 行、bosses 182 行……7 段同构 hero 骨架（media→pills→标题→preview-stats）逐段复制，其中"中文名/英文名/internalName"三卡 lang-grid **逐字重复 5 次**（L895、1167、1345、1419、1562），掉落卡片 markup **4 份近乎逐字复制**（L844、962、1001、1039），filter-chip 筛选块 3 份复制（L59、100、144）。script 侧 3224–4483 行是约 1260 行的"实体专属 computed 海洋"，`detailStats`（L3328）与 `previewStats`（L4372）两个 7 路分支函数同构双写。style 816 行也按实体纵切——增删实体必须同步动样式段。

**优化**：见架构维度的拆分路线图；结构问题与架构问题同源，拆分即解。

### 架构 4/10

不是全黑：`configs` 配置对象（L1915–2231）驱动列表列、表单字段、endpoint、搜索占位，**列表 + 新增/编辑表单基本纯配置驱动**——condition-terms 作为唯一"纯配置"实体，接入只花了约 40 行，证明骨架本身可扩展。但配置只覆盖了约 1/3 的实体差异：筛选器、详情渲染、统计卡、路由 query 同步、图片解析全是散装硬编码 if。共享设施使用分裂：useApi 真复用；**AdminDataTable 被绕开手写并行表格**（L251–323，自带 `formatCell` 与共享组件行为不一致——boolean 一边显示 `true/false` 一边显示 `是/否`）；usePagedCollectionSync 被绕开改为提交后整页 refetch；`normalizeManagedImagePath` 与 stores/items.ts、useTownNpcMaintenance.ts 存在**三份并行实现**，且 biome contract 测试恰好断言了重复的存在——测试在主动阻止去重。148 处 `Record<string, any>` + 14 处显式 `any`，3000 行 script 对后端契约零编译期保障。

**优化（可落地拆分路线图）**：

- **阶段 0 — 测试解锁（前置，约 2–3 天，不动产品代码）**
  为 8 实体各补一条最小行为测试（可注入 fetch 的挂载测试或 E2E 冒烟：列表渲染、筛选生效、详情打开、表单提交 payload 正确），沿用通知中心 store 那套 offline 测试基建。旧的 6 个 regex contract 测试标记为"拆分后逐个退役"。
  *风险*：无——纯增量。这是唯一能让后续阶段安全的前提，因为现有 contract 测试锁定了文件路径、`v-else-if` 排列顺序、甚至函数体内 `indexOf` 先后与"不得出现 `??`"这类写法细节，任何拆分都会让它们大面积假红。
- **阶段 1 — 抽详情组件（收益最大，约 1690 行离场）**
  把 7 段详情分支逐个抽成 `components/entity-detail/ArmorSetDetail.vue`、`BossDetail.vue`……各自带走对应的专属 computed（约 1260 行 script）与实体样式段（约 490 行 style）；同时抽 `EntityDetailHero.vue`（消灭 5 份 lang-grid）与 `LootEntryCard.vue`（消灭 4 份掉落卡）。宿主里 7 路 `v-else-if` 变成 `<component :is="detailComponentMap[entityType]">`。每抽一个实体：迁移→跑行为测试→删除对应 regex 断言，一个实体一个 PR。
  *风险*：中——专属 computed 与宿主状态（detailRow、items store、lightbox）有引用纠缠，需定义清晰的 props/emits 契约；buffs 详情走 `/public/buffs/:id` 特殊 endpoint（L2849）要随组件带走而非留在宿主。
- **阶段 2 — 配置外置 + 筛选器插件化（约 1 周）**
  `configs` + 筛选 options 常量 + 150 行 biome 中文映射字典迁到 `config/entity-registry/*.ts`，每实体一个文件；`EntityConfig` 类型扩充 `filters: FilterDescriptor[]`、`detailComponent`、`fetchParams(state)`、`parseQuery/buildQuery`，让 `hasActiveFilters`/`fetchRows`/`syncRouteQuery`/`handleReset`/大 watch 这**五处各自维护筛选清单的散装 if**（已经不同步：watch 顶部重置块漏掉 `selectedBiomeGroup` 两个 ref）统一改为遍历 descriptor。工具栏 3 份 filter-chip 复制收敛为一个 `EntityFilterBar.vue`。
  *风险*：中高——路由 query 同步是隐性契约（书签、外链、浏览器回退），必须在阶段 0 测试里覆盖 query 还原路径；bosses 的客户端分页/客户端筛选特例（L2791、2662）需要 descriptor 支持 `clientSide: true` 标志而非特判。
- **阶段 3 — 表格与类型收口（约 3–4 天）**
  手写表格迁移到 AdminDataTable（slot 承接徽章/缩略图单元格），统一 `formatCell` 语义；为 8 实体行数据建 `types/entities/*.ts`，消灭 148 处 `Record<string, any>`；魔法字符串枚举（armor 组合三写、boss 类型四写）收敛为 const 联合类型单一出处。
  *风险*：低——表格是纯展示层替换，行为测试可直接兜底。
- **阶段 4 —（可选）路由拆分**
  registry 就位后，`[type].vue` 剩下的宿主约 800–1000 行；若还要拆成 `entities/npcs.vue` 等真实路由，只是薄壳套 registry，成本已趋近于零。可以不做——此时单文件已不是问题。

### 代码耦合度 3/10

八实体在同一 script 作用域共享 `rows/detailRow/form` 等无类型状态，任何实体的改动都在其他七个实体的爆炸半径内。魔法字符串多点复写（armor 组合枚举在类型 L1749、归一化 L2408、watch 解析 L4516 三写；boss 类型四写），改一处漏三处无编译期报警。状态重置逻辑三写且已实际失同步（潜伏债）。更糟的是**测试把耦合钉死了**：contract 测试用 `entityType === 'biomes'[\s\S]*?entityType === 'projectiles'` 切片，详情分支的排列顺序本身成了被测对象，连调换两个 `v-else-if` 都会红。

**优化**：随阶段 2/3 落地——枚举单一出处 + FilterDescriptor 消灭三写重置 + 退役顺序敏感的 regex 断言。

### 维护难度 2.5/10

加一个完整实体（world-contexts 级，带筛选 + 详情）需触碰**约 20–28 个分散位置**：config、联合类型、options 常量、工具栏模板、hasActiveFilters、fetchRows、syncRouteQuery、handleReset、change 处理器、大 watch、L315 详情按钮 `||` 白名单、详情分支、detailStats/previewStats 双份、专属 computed 群、样式段……无任何机制保证改齐——漏掉 L315 就静默没有详情按钮，漏掉 watch 就丢 URL 状态还原。相关的 6 个测试全部是 `readFileSync + regex`，重构时 80% 以上断言会失败且失败不代表行为回归，是负资产型保护。零星启发式陷阱如 `key.toLowerCase().includes('at')` 判断时间列（L3110）。

**优化**：路线图完成后，加实体收敛为"registry 里加一个文件 + 一个 detail 组件 + 一条行为测试"3 个内聚触点。

---

## town-npcs 工作台

组成：index.vue（692 行）+ [id]/index.vue（601 行）+ [id]/edit.vue（445 行）+ useTownNpcMaintenance.ts（254 行）+ TownNpcWorkbenchModal.vue（1647 行）。

### 视觉 8/10

本组最佳截图：七枚统计卡（总数/缺口/在售/未匹配等）直接把维护 KPI 摆在首屏；"维护工作台"筛选带（搜索 + 时期 + 排序 + 状态 chip）+ NPC 卡片网格（肖像、编号、ATK/HP/DEF/KB 属性 pill、Wiki 条目徽章、描述摘要、查看/编辑双按钮）信息密度和业务贴合度明显高于 [type].vue 的通用表格。扣分点：卡片右上"编辑"按钮的浅青底与卡片底色对比度偏低；统计卡"0 未匹配 NPC"与"582 shop 条目"之间视觉权重无差异，异常态（缺口/未匹配>0）没有告警色强调，弱化了工作台的"分诊"属性。

**优化**：给异常统计卡加语义色（缺口>0 用 warn 色调）；卡片操作按钮提对比度。

### 结构 6/10

页面本体逻辑极薄（三页 script 均 ≤130 行），"页面 = 入口壳，composable = 数据投影，modal = 工作区"的分层意图正确。两处结构性失分：(1) **[id]/index.vue 与 edit.vue 是重构后未删除的僵尸页面**——列表页副标题明说"详情与编辑统一在工作台内完成"，全仓除两页互链外零入口，约 1050 行无入口代码继续被维护还被 contract 测试锚定；(2) WorkbenchModal 1647 行正在长成下一个纵向巨石：详情 tab + 编辑主列 + 三面板侧栏 + 草稿状态机 + 682 行 CSS（占文件 41%）全部堆在一个文件。

**优化**：删除（或 301 到列表页锚点）两个僵尸页面并同步退役其 regex 断言；模态按 `useShopEntryDrafts()` composable（约 260 行零 DOM 纯逻辑，可单测）→ `ShopEntryCard` → `ItemSearchPanel` / `SuggestionPanel` 顺序拆四刀。

### 架构 6.5/10

useApi 真复用（token/401/SSR baseURL 全继承）；类型统一收口在 `types/npcDomain.ts`，四个消费文件同源导入，无各写各的；composable 实为无状态纯函数模块——易测、SSR 安全，是健康形态。失分：(1) **零 SSR**——三处全是 onMounted 客户端瀑布，与项目详情页已做 SSR（detail-ssr Task 8）反差；(2) 详情/编辑页看单个 NPC 却要拉**全量 overview** 再 `find(...)`，无单条投影接口；(3) 模态的替换/Wiki 绑定/新增三态状态机全靠函数副作用维护（`applyManualSelection` L808 嵌三层模式分支），无显式模式枚举；(4) 通用能力（金币四段分解 `buildPriceVisual`、formatPercent、时间格式化）被锁死在 town-npc 专属模块，[type].vue 已在别处重写同类逻辑。

**优化**：列表页改 `useApiFetch` 走 SSR；后端补单条维护投影接口；状态机改显式 `mode: 'append'|'replace'|'bind'` 枚举；`utils/format.ts` + `utils/coinPrice.ts` 从 composable 中拆出上浮。

### 代码耦合度 5.5/10

与 [type].vue 之间零共享零污染（平行宇宙），但存在"平行重造"：NPC 关联物品图片信任链两套独立实现。组内实锤复制：**coin-chip + price-pill CSS 四连拷**（index L633、detail L537、edit L379、modal L1435，约 160 行几乎逐字相同）；info-chip/stat-pill 三份变体；"售卖物卡片"模板在四个文件各一份，是呼之欲出没抽的 `ShopItemPriceCard`。最危险的耦合是**双保存路径行为漂移**：edit.vue L239 提交 `behaviorNotes: ''` 而 modal L931 提交 `null`，同字段两条路径语义已分叉；edit 页的建议导入还会丢 `sourceItemId`，产出无法通过模态校验的脏条目。

**优化**：删僵尸页即消灭双路径；抽 `ShopItemPriceCard.vue` + chip/coin 样式上浮 main.css，一次收掉约 25% 的组内代码量。

### 维护难度 6/10

局部改动不波及其他实体（对比 [type].vue 的核心优势），类型共享让数据形状变更有编译期反馈。失分：(1) **真 bug**——模态 L310 对搜索结果调 `buildPriceVisual`，但 `/items/suggestions` 返回字段是 `buy/sell` 而函数只读 `buyPrice/sellPrice`，搜索面板金币 chip 是永不渲染的死代码；(2) 物品搜索无竞态守卫（L881 无取消/序号），慢请求可覆盖新结果；(3) 保存校验按全量草稿报"第 N 条"，开筛选时序号对不上屏幕；(4) 复杂度最高的草稿状态机**零行为测试**，仅有的两个相关测试全是 `readFileSync + regex`（锁变量名和实现细节，恰好测不出上述真 bug）。

**优化**：修 buyPrice/buy 字段错位（一行归一化）+ 搜索加请求序号守卫；为 `useShopEntryDrafts` 纯逻辑与 `buildPriceVisual` 补直接 import 的单测——这是全组 ROI 最高的测试投资。

---

## 两种组织方式的结论

town-npcs 路线（专属页面 + composable + 组件）以 6.4 : 4.0 胜出，证明了纵向拆分的真实收益：页面薄、类型收口、业务逻辑（issueScore 分诊排序、mutation 摘要 toast、图片信任链）有清晰归属。但它也预演了 [type].vue 拆分的两个陷阱：**拆完不删旧路径就制造双实现漂移；逻辑瘦身若不配套共享展示组件，代码量会转移进四份复制的 scoped CSS**。[type].vue 的拆分路线图（阶段 1 抽详情组件、阶段 2 registry 化）应直接吸取这两条教训：每迁一块立刻删源 + 同步退役 regex 断言，并优先沉淀 EntityDetailHero/LootEntryCard 级别的共享组件。
