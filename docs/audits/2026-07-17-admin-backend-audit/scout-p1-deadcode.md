# P1 死代码清扫 — 事实核查报告

仓库: `/home/lolben/TerraPedia/data-query-app`，核查日期 2026-07-17。
行号均以当前工作区文件为准。

---

## 1. crawler-monitor.vue（4445 行；template L1-241 / script L243-3956 / style L3958-4445）

### 1a. 审计点名的六个符号 — 逐个确认

模板段（L1-241）对下列所有符号 **零引用**（含 kebab-case 形式也查过，无）。外部文件（components/composables/utils/server）也零引用。

| 符号 | 定义行 | script 内消费者 | 结论 |
|---|---|---|---|
| `activeMonitorPanel` | L346 | 仅被死链内部读写：L950(activeMonitorPanelMeta)、L958-959(setActiveMonitorPanel)、L1236(onMounted hash 初始化) | 死 |
| `crawlerHealthCards` | L566-625 | **无任何消费者**（定义后再未出现） | 死 |
| `v4StatusStrip` | L833-861 | **无任何消费者** | 死 |
| `v4MetricCards` | L862-907 | **无任何消费者** | 死 |
| `monitorPanels` | L908-949 | 仅 L950 的 `activeMonitorPanelMeta` | 死 |
| `activeMonitorPanelMeta` | L950 | **无任何消费者** | 死 |
| `setActiveMonitorPanel` | L957-969（实际到 969，不止审计说的 958-959） | 仅 L1843/L1848，两处都在 `selectBlockedDomainFocus()`（L1838-1850）内部；而 `selectBlockedDomainFocus` 本身模板零引用、script 零调用 → 整链死 | 死 |

**⚠️ 修正审计的一处**：`setActiveMonitorPanel` 不是"入口被模板引用"——模板没有引用它。它唯一的调用方 `selectBlockedDomainFocus` 自己也是死函数。审计给的行号 L958-959 只是函数前两行，完整函数体是 L957-969。

### 1b. 完整"可安全删除"清单（已核实每个符号的全部消费者都在本清单内）

**核心死链（审计点名的）：**

| # | 符号 | 行范围 | 行数 |
|---|---|---|---|
| 1 | `MONITOR_PANEL_KEYS` 常量 | L330 | 1 |
| 2 | `type MonitorPanelKey` | L331 | 1 |
| 3 | `type MonitorPanelMeta` | L332-339 | 8 |
| 4 | `activeMonitorPanel` ref | L346 | 1 |
| 5 | `panelSwitching` ref | L347（仅被 setActiveMonitorPanel 写，模板零引用） | 1 |
| 6 | `panelSwitchTimer` let | L383（消费者仅 L961-964 死函数内 + L1259-1262 onUnmounted 清理块） | 1 |
| 7 | `crawlerHealthCards` | L566-625 | 60 |
| 8 | `v4StatusStrip` | L833-861 | 29 |
| 9 | `v4MetricCards` | L862-907 | 46 |
| 10 | `monitorPanels` | L908-949 | 42 |
| 11 | `activeMonitorPanelMeta` | L950 | 1 |
| 12 | `normalizeMonitorPanelKey` | L952-955（消费者仅 L1234 onMounted 死初始化） | 4 |
| 13 | `setActiveMonitorPanel` | L957-969 | 13 |
| 14 | onMounted 内 hash 初始化块 | L1234-1237（`const hashPanel...` 到 `}`） | 4 |
| 15 | onUnmounted 内 panelSwitchTimer 清理 | L1259-1262 | 4 |
| 16 | `selectBlockedDomainFocus` | L1838-1850 | 13 |
| 17 | `blockedDomainFocus` computed | L1067-1096（唯一消费者是 #16） | 30 |

**连带死链（本次追踪新发现，审计未列全）——同样模板零引用、唯一消费者在上表内：**

| # | 符号 | 行范围 | 唯一消费者 | 行数 |
|---|---|---|---|---|
| 18 | `isRiskHealthTone` | L562-564 | crawlerHealthCards (L582) | 3 |
| 19 | `failedDomainRows` computed | L827 | v4StatusStrip/v4MetricCards | 1 |
| 20 | `runningDomainRows` computed | L828-831 | 同上 | 4 |
| 21 | `highestRiskDomainRow` computed | L832 | 同上 | 1 |
| 22 | `dataQualityAttentionCount` computed | L634-635 | monitorPanels (L946-947) | 2 |
| 23 | `dispatchQueueRows` computed | L526 | crawlerHealthCards(L572)+v4StatusStrip(L847)+v4MetricCards(L864-865) | 1 |
| 24 | `activeExecutionOverviewRows` | L493 | monitorPanels (L922) | 1 |
| 25 | `historicalExecutionOverviewRows` | L494 | monitorPanels (L922) | 1 |
| 26 | `activeProgressRows` | L524 | monitorPanels (L930) | 1 |
| 27 | `historicalProgressRows` | L525 | monitorPanels (L930) | 1 |
| 28 | `isCurrentProgressRow` | L3483-3486 | #26 | 4 |
| 29 | `isHistoricalProgressRow` | L3488-3490 | #27 | 3 |
| 30 | `isCurrentExecutionOverviewRow` | L3492-3495 | #24 | 4 |
| 31 | `isHistoricalExecutionOverviewRow` | L3497-3499 | #30 链 | 3 |
| 32 | `selectQueueItemDomain` | L2488-2491 | selectBlockedDomainFocus (L1847)（`queueItemDomain` 本身另有活消费者 L2135/L2502，保留） | 4 |

**注意保留（同名/近名易误删）：**
- `crawlerHealthCards` 内的局部变量 `failedDomainRows`/`runningDomainRows`（L569-570）与 computed 同名，一起随块删。
- `staleHeartbeatRows`(L629)、`recentReportRows`(L631)、`dataQualitySignals`(L633)、`healthSignals`(L533-561)、`runtimeStateCards`(L528)、`runtimeDialogSummaryCards`(L660-685) 有活消费者（模板 L96/L102/L103 或 healthSignals 链），**不可删**——但注：`healthSignals` 本身模板零引用，其状态待另查（它可能是下一轮候选，本次不动）。
- `progressDetailRowsByPriority`、`executionOverviewRows`、`activeDispatchQueueRows` 有活消费者（L812-826 triageWorkbench/activityDrawerRows 链），保留。
- `hasAutoSelectedDomain`、`selectDomainTableRow`、`queueItemBlockerLabel` 有其他活消费者，保留。

**总计约 293 行**（#1-32 相加 ≈ 293）。审计估的 800-1000 行偏高——v4/panel 时代的**模板**已在分诊重构时删掉，剩的只有 script 死链。若把连带可再追一层的（`runtimeDialogSummaryCards`→`wikiAutoDispatchLabel`/`savedAutoDispatchLabel`/`historyRows`/`autoDispatchSweepSummary`/`wikiPendingApprovalCount`、`domainRuntimeSummaryRows`+helpers L3325-3354、`imageNormalizationRows`+helper L3313-3323、`dispatchPlanRows` L636、`executionOverviewStatusLabel` L495 等，全部模板零引用）也纳入，可再加 ~100 行，但其中 `runtimeDialogSummaryCards` 等需先确认是否喂给了子组件 props——本次已确认模板 L96-103 只传 `activityDrawerRows`/`runtimeStateCards`/`dataQualitySignals`，故这批也是死的，但建议放第二批删，第一批只动 #1-32 无争议链。

样式段（L3958-4445）无 panel/module-tabs/v4-*/health-card 类残留，CSS 无需改。

### 1c. 测试改动（tests/crawler-monitor-page-contract.test.mjs，626 行）

引用死符号的断言：
- **L33-36**：`assert.doesNotMatch(page, /v-show="activeMonitorPanel === '...'"/)` ×4 —— 负向断言，删符号后仍通过。**可保留也可删**；建议保留（防回归）。
- **L625**：`assert.match(page, /monitorPanels\.value\[0\]/)` —— **正向锁定，必须删**，否则删掉 L950 后测试失败。它所在的 test 块（L617-626 'does not use fake numeric fallback data'）其余断言（L618-624）与死代码无关，保留。
- L618 `doesNotMatch(/FALLBACK_MONITOR_PANEL/)`、L620 `doesNotMatch(/count:\s*0,\s*\n\s*}/)` 为负向，删代码后仍通过，保留。

即测试侧唯一必改动作：**删 L625 一行**。

---

## 2. stations.vue 死块（2090 行；template L1-515 / script L517-1447 / style L1449-2090）

### 死块行范围
**L409-411**（仅 3 行，不是大块）：
```
409  <div v-if="false && bindingTargetItem && showBindingEditor && showInlineBindingEditor" class="binding-editor">
410    <ItemRecipeEditor v-model="bindingRecipes" :crafting-stations="bindingStationOptions" />
411  </div>
```
注意条件写法是 `v-if="false && ..."`（提示词里的 `v-if="false" && ...` 是笔误）。

### 删除后连带变死的符号
- **`showInlineBindingEditor`**（L620，`const ... = false`）：唯一消费者就是 L409。**连带删**。同段 L619 的 `showDeprecatedFlowPreview = false` 是另一个 `v-if` 开关（L311 消费，也是永假路径），属于同类候选但不在本块范围，本次不动。
- **`showBindingEditor`**（L584 ref）：除 L409 外还有 L691（clearBindingContext 置 false）、L1220（新增草稿时置 true）两处**纯写入、零读取**。删 L409 后无任何读者 → ref 及两处写入语句**连带删**（L691 一行、L1220 一行）。
- **`bindingRecipes`**（L573）：有大量活消费者（模板 L287/L291/L355-357，script L609/L1158/L1190/L1203/L1228 等），**保留**。
- **`bindingStationOptions`**（L585）+ `loadBindingStationOptions`（L1248-1253）：除 L410 外无其他读取 `bindingStationOptions.value` 的地方，但 `loadBindingStationOptions` 在 L1037/L1150/L1241/L1306/L1333 被调用且维护 `bindingStationOptionsLoaded` 状态。删 L410 后 `bindingStationOptions` 数据无人展示 → 理论上整个 options 加载链（L585-586、L1248-1253、5 处调用、L1304-1306/L1331-1333 失效块）也可删，**但这是行为改动**（少发一个 `fetchCraftingStations(1,500)` 请求），建议单独提交或保守保留。
- **`ItemRecipeEditor` import**（L520）：唯一使用在 L410。**连带删 import**。（组件本身被 pages/items.vue L296、pages/recipes/index.vue L81 使用，组件文件不动。）

### scoped CSS
`.binding-editor`（**L1902-1905**）唯一消费者是 L409 的 class → **孤立，连带删 4 行**。

### 测试
tests/ 中无 `showInlineBindingEditor`/`showBindingEditor` 引用，无需改测试。

---

## 3. town-npcs 僵尸页

### 3a. 入口 grep（全仓 pages/components/composables/layouts/utils/stores/middleware/plugins/server/nuxt.config）
- 指向 `/entities/town-npcs`（列表页）的入口：`pages/index.vue:403`、`layouts/default.vue:286` —— **列表页是活的**。
- 指向 `[id]` 详情/编辑两个路由的引用**只有两页互指**：
  - `[id]/index.vue:28` → `` `/entities/town-npcs/${selectedRow.id}/edit` ``
  - `[id]/edit.vue:164` → `` `/entities/town-npcs/${npcId.value}` ``（detailPath，L6/L14/L244 消费）
- 列表页 `town-npcs/index.vue` **没有任何**指向 `[id]` 子路由的 router-link/navigateTo/href（其详情交互走 `TownNpcWorkbenchModal` 弹窗，见 index.vue L177）。`components/TownNpcWorkbenchModal.vue` 也不含该路由跳转（仅 L77 外链 sourcePageUrl）。
- `.output/` 构建产物中出现 `town-npcs-id`/`town-npcs-id-edit` 只是路由表自动注册，非入口。
- **结论：两页互为孤岛，无外部入口，确系僵尸页。** 直接输 URL 仍可达（Nuxt 文件路由），删除即 404 —— 若有运营人员收藏过 URL 属行为改动，需在 PR 说明。

### 3b. 行数
- `[id]/index.vue`：**601 行**
- `[id]/edit.vue`：**445 行**（合计 1046 行）

### 3c. tests/ 引用 — **有，必须同步改**
`tests/npc-projection-json-visibility.test.mjs`：
- **L11-12**：`fs.readFileSync` 直接读两文件 —— 删页后测试**在 import 阶段就崩**。
- 引用 `townNpcDetail` 的断言：L40（循环含 townNpcDetail/townNpcEdit）、L66-73（'town NPC detail portrait...' 整个 test 块）、L199-207（Chinese-first copy 循环里的 townNpcDetail/townNpcEdit 两行 + L209 循环成员）。
- 改法：删 L11-12 两个 readFileSync、删 L66-73 test 块、L40 循环收窄为 `[townNpcWorkbench, townNpcIndex]`、L199-209 循环删 townNpcDetail/townNpcEdit 两个 entry 及成员。

### 3d. useTownNpcMaintenance.ts 独占导出
逐导出核对消费者后，**只被这两页使用**的导出：
- `buildWikiTagLine`（L152-157）：仅 `[id]/index.vue`（L64、L182）。**独占，可删**——但该测试文件不校验它，删纯赚。
- `formatSecondaryPrice`、`wikiAssetCards`、`formatMoveInConditions`、`formatUnmatchedItems`、`fetchTownNpcEditorDetail`、`saveTownNpcMaintenance`、`formatShopMutationSummary`、`resolveNpcStat`、`resolveKnockBackResist`、`buildFallback`、`buildItemFallback`、`resolveTownNpcMainImage` 等均同时被 `TownNpcWorkbenchModal.vue` 或列表页使用，**不可删**。
- ⚠️ 但 `wikiAssetCards` 被 tests L64（`wikiAssetCards[\s\S]*?normalizeTownNpcImageUrl` 断言在 composable 上）锁定，且 Workbench 也用，无关。
- **结论：composable 里独占导出只有 `buildWikiTagLine` 一个（6 行）**。审计若期望大块 composable 瘦身，不成立——Workbench 弹窗复用了绝大多数导出。

---

## 4. audio-assets.vue 死 CSS（实际路径 pages/operations/audio-assets.vue，1380 行）

### .pill / .pill--muted
- 定义：`.pill` **L1087-1099**、`.pill--muted` **L1100-1103**（审计说的 L1087-1103 精确命中，共 17 行）。
- 模板（L1-276）零引用：模板里只有 `preview-pill`/`preview-pill--accent`（L121-125、L171-172），是**不同的类**（其样式在 L913/L929，活）。script 段（L278-639）无动态 `'pill'` 字符串拼接。tests/audio-assets-page-contract.test.mjs 无 `.pill` 断言。
- **结论：L1087-1103 可安全整段删。**

### sticky th 重复段
- `.data-table th`（**L1048-1056**）：`position: sticky; top: 0; z-index: 1; white-space: nowrap` + 配色。
- `.audio-asset-table th`（**L1066-1071**）：`position: sticky; top: 0; z-index: 1; white-space: nowrap` —— 四条声明与 `.data-table th` **完全重复**（表格元素 L196 同时挂两个类 `data-table audio-asset-table`，级联本就命中前者）。**L1066-1071 整段可删**，无视觉变化。
- 保留 `.audio-asset-table`(L1062-1064, min-width:1320px)、`.audio-asset-table td`(L1073-1075)、`td small`(L1077-1080) —— 有差异化声明。

---

## 5. items.vue 编辑器 modal（821 行；template L1-335 / script L336-731 / style L732-821）

- **modal 模板行范围**：`AppModal v-model="formVisible"` 块 **L179-333**（L172-177 是另一个详情 modal `detailVisible`，勿混）。内含表单 L186-294、`<ItemRecipeEditor v-model="recipeDrafts" />` L296、预览面板 L298-328、footer L329-332。
- **script 侧相关块**：
  - 状态：`formVisible` L365、`isEdit` L366、`editingId` L367、`recipeDrafts` L370、`form` reactive **L371**（单行大对象）。
  - 预览 computed 链：L378-396（previewImageUrl/Title/Subtitle/Status/Stats/Narratives）。
  - `resetForm()` **L503-507**；其中 `Object.assign(form, {...})` 白名单在 **L504**，字段 25 个：`name, nameZh, internalName, categoryId, relatedCategoryIds, rarity, status, gamePeriodId, gameModelId, isStackable, stackSize, damage, defense, knockback, useTime, width, height, buy, sell, description, descriptionZh, tooltip, tooltipZh, imageUrl`（与 L371 初始化完全一致，24 个数据字段 + relatedCategoryIds）。
  - `handleAdd` L509；`handleEdit` **L510-522**，其中 `Object.assign(form, { ...item, ... })` 在 **L514-519**——⚠️ 这是**展开整个 item**（含 id 等非表单字段进 form），非白名单式，与 resetForm 的收敛写法不对称；`handleFormSubmit` L524-544 用 `{ ...form }` 提交，意味着编辑提交体会带上 item 的所有字段。这是重构此 modal 时的已知风险点。
  - `toRecipeDrafts()` **L618-676**。
  - 相关 handler：`handleImageSelected` L546-559、`handleRowImageError` L560 起。
- **tests/**：`tests/items-progress-column.test.mjs`（40 行）是唯一引用 items.vue 的测试；断言只锁进度列 (L12-13)、gameModelId 文案 (L17)、中文文案 (L21-39)。**无任何 modal/form/handleEdit/toRecipeDrafts 断言**。只要重构后保留中文标签文案（"品质/时期/分类"等出现在 modal 表单里，L215 等），测试不受影响；若把 modal 抽成子组件，需确认"品质""分类"等词在 items.vue 本体仍出现（筛选栏 L27-71 已含大部分）。

---

## 结论摘要

| 项 | 结论 | 备注 |
|---|---|---|
| 1. crawler-monitor 死链 | **可执行** | 但规模是 ~293 行（+第二批 ~100 行），不是 800-1000；setActiveMonitorPanel 无模板引用（审计此处存疑点已排除）；测试只需删 contract L625 一行，L33-36 负向断言保留 |
| 2. stations.vue 死块 | **可执行** | 死块本体仅 L409-411 共 3 行；连带删 showInlineBindingEditor(L620)、showBindingEditor(L584/691/1220)、ItemRecipeEditor import(L520)、.binding-editor CSS(L1902-1905)；bindingStationOptions 加载链建议第二批 |
| 3. town-npcs 僵尸页 | **可执行，有一个硬前置** | 无外部入口确认；**必须同步改 tests/npc-projection-json-visibility.test.mjs**（L11-12 readFileSync 会直接崩）；composable 只有 buildWikiTagLine 独占可删 |
| 4. audio-assets 死 CSS | **可执行** | .pill/.pill--muted L1087-1103 零引用；.audio-asset-table th L1066-1071 与 .data-table th 全重复可删 |
| 5. items.vue modal | **事实已核清（此项是重构不是删除）** | modal L179-333；handleEdit L514 的 `{...item}` 全量展开 vs resetForm L504 白名单不对称是风险点；测试无 modal 锁定，但中文文案断言要求重构后相关词仍在本文件 |
