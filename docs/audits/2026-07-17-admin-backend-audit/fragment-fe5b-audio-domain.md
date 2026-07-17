# 运维域子片段：audio-assets 与 domain-acceptance（子 agent 原始评审备份）

## pages/operations/audio-assets.vue — 音频资产

**视觉 7.5/10** 截图信息层级清晰:eyebrow → 标题 → 摘要四卡 → 筛选工作台 → 预听面板 → 数据表,"未匹配链接 230"用 warning 色调卡(`summary-mini--warning`,L656)正确引导审计注意力。配色纪律很好——整个 739 行 style 块**零硬编码 hex**,全部通过 `var(--color-*)` + `color-mix()` 派生(如 L1241 `color-mix(in srgb, var(--color-success) 11%, var(--color-surface-2))`),与 variables.css 令牌完全对齐。扣分点:分页信息在 hero 右上(L23-25 "428 条 / 第 1/22 页")和表头 meta(L187-189 "20/428 条")重复出现;表格 9 列且 `min-width: 1320px`(L1063),"资产"列内已嵌入 shard/kind/status 徽章(L230-235),紧接着"分片/类型"列(L239-242)又原样重复两枚徽章,横向密度浪费。建议:删掉 shard-cell 列、hero 与表头二选一保留分页 meta,可把表压回 ~1100px。

**结构 5/10** 1380 行单文件,配比 template 276 / script 361 / style 739——**样式占 53%** 是主要臃肿源,其中 `.data-table`、`.status-badge`、`.filter-chip`、`.state-panel` 等(L1033-1103、L1286-1296)是典型跨页通用模式,应下沉到 main.css 或抽 `AdminStatusBadge`/`FilterChipBar` 组件(项目 components/ 下已有 `AdminTableShell.vue`、`AppPagination.vue` 却未复用,L269-273 分页是手写的)。预听面板(L97-177)是完整独立单元,抽成 `AudioProfilePanel.vue` 可直接砍掉约 400 行(模板 80 + 样式 320)。script 内 computed/方法分区尚可,但 `resetFilters`/`removeFilterChip`(L419-445)是两段镜像 if 链,可合并为按 key 清空。

**架构 7/10** 数据获取走 `get()`(useApi 封装的 `$fetch`)+ `onMounted(refreshAll)`(L632),纯客户端渲染,未用 `useAsyncData`;运维只读页可接受,但筛选/页码没有同步到路由 query(全文无 `useRoute`),刷新即丢状态,对"审计到第 15 页发现问题想分享链接"的场景是硬伤。亮点是音频加载链路(L455-553):AbortController per-row + `audioRequestGeneration` 世代计数 + blob URL 主动 revoke + `onBeforeUnmount` 清理,竞态防护是两页中最扎实的代码。不足:blob 方案要**整文件下载完才能播**(L483),对 BGM 大文件应改用带 Range 的流式 URL 或临时签名 URL;`fetch` 直连绕过了 useApi 拦截器,只手工补了 401(L477-479)。summary/list 双错误态分离(L31/L192)处理得当。无需进 store,合理。

**耦合度 5/10** `ApiResponse`/`Pagination` 接口在页内本地定义(L283-297),grep 确认 armor-attributes、classification-audit 等页各自重复声明同款——应提到 `types/` 共享(对比页 B 已有 `types/domainAcceptance.ts`)。最脆的点是 `matchStatuses` 按**子串嗅探**:L590 `normalized.includes('matched') && !normalized.includes('unmatched')`——因为 `'unmatched'.includes('matched') === true` 被迫写出这种负向补丁,后端一旦加新枚举(如 `rematched`)立即误判,应改为 split 后精确比较。另外两处越权复制:L348 硬编码 cookie 名 `'tp_admin_token'`(useApi.ts L5 已有 `TOKEN_COOKIE_KEY`,未导出就该导出)、L509-513 `joinApiUrl` 手写重复了 useApi.ts 的 `resolveApiUrl`。正面:模板字段都过了 `statusLabel`/`formatBytes` 等映射层,没有裸铺后端字段。

**维护难度 6.5/10** 可读性好:命名一致、TS 类型全、a11y 认真(`aria-busy` L219、`aria-live` L22、`role="alert"`)。死代码:`.pill`/`.pill--muted`(L1087-1103)模板零引用;`.audio-asset-table th` 的 sticky 声明(L1066-1071)与 `.data-table th`(L1048-1052)完全重复。魔法值:`formatDateTime`(L621-624)只是 `replace('T',' ')` 裸剥 ISO 字符串,不做时区换算,"校验时间"列显示的是 UTC 却无标注;`statusTone` 对任何未知状态兜底返回 `'warning'`(L584)语义存疑。`formatNumber`/`statusTone` 等工具函数与另外 5+ 个页面重复,该进 `utils/`。

**均分: 6.2**

## pages/operations/domain-acceptance.vue — 域验收

**视觉 5.5/10** 截图暴露三个问题:① eyebrow 和 h1 文案完全相同("B 档域验收",L6-7),层级失效;② 摘要 4 卡在 hero 里折成 3+1,第 4 张"缺失 0"孤行悬挂,右侧大片空白(hero 只有一个刷新按钮撑场);③ 主体是 `rawSummaryRows`/`panelMetricRows` 把后端 JSON 键值**原样倾倒**成 dl 列表(L272-277、L323-328,截图可见 "items · sourceReadiness ready / stale / manual / plan-only" 裸英文键),是调试面板而非设计过的信息层级。配色基本守令牌,但 L675-690 四条渐变终点色硬编码 `#0f9f6e`/`#b7791f`/`#b91c1c`/`#64748b`——其中 `#64748b` 是冷灰蓝 slate,在暖石色+teal 主题里明显跑偏(这正是本项目 crawler-monitor 重构时确认过的"冷色不配主题"问题),应改用 `color-mix(in srgb, var(--color-success) 80%, black)` 一类派生。建议:摘要卡改 `repeat(auto-fit, minmax(150px,1fr))` 收进两行、eyebrow 换成域范围描述、rawSummary 默认折叠进 `<details>`。

**结构 5/10** 1123 行,配比 template 349 / script 240 / style 530。模板重复度是两页之最:`<span><small>标签</small><strong>值</strong></span>` 指标格模式出现 ~15 次(L84-87、L154-187、L226-255),`path-block`(span+code)出现 8 次——一个 `MetricCell` + 一个 `LabeledCode` 组件能砍掉模板近半;`domain-panel` 区块(L215-343,129 行)嵌套在 v-for 内三层深,是最优先的抽取对象 `DomainPanelCard.vue`。样式端 L895-909 一条规则挂 11 个选择器,改任何一块都可能误伤其余十处。script 本身短小、纯函数分区清晰,是加分项。

**架构 6.5/10** 单次 `get('/admin/domain-acceptance/overview')` + `onMounted`(L421-440),`hasLoaded`/`isInitialLoading`(L391)区分首载与刷新,失败时 toast + 常驻 alert 双通道(L112-115 处理"已有数据但刷新失败"),错误态设计比页 A 细。但注意 L429 的 `get` **没有显式 import**(import 块 L352-366 只有类型和图标),依赖 Nuxt 目录自动导入——与页 A 的显式 `import { get } from '~/composables/useApi'` 风格分裂,建议统一显式。验收证据页无轮询、无"数据生成于何时"的顶层时间戳,只能手动刷新且不知道看的是不是旧账;overview 一次性全量返回,域多了以后应考虑 `useAsyncData` + 按域懒展开。不需要 store,判断正确。

**耦合度 6.5/10** 两页中唯一有独立类型层的:`types/domainAcceptance.ts`(143 行)集中声明,`unwrapOverviewResponse`(L485-487)专门吸收后端 `success` 无 `data` 的 quirk,这是正确的防腐姿势。扣分:`statusTone`/`statusLabel`(L442-466)用松散字符串数组匹配,里面混着 `'read error'`(带空格,L445)这种一次性魔法串,且 `statusLabel` 把 `ready`/`needs_confirmation`(刷新计划动作态)和 `pass`/`blocked`(验收态)两套语义域塞进同一个函数;`publicGateLabel`(L476-483)硬编码 4 个后端枚举字面量,`types` 里的 `DomainAcceptancePublicGateStatus` 联合类型末尾 `| string` 逃逸,类型约束形同虚设。`rawSummary`/`metrics` 直接 `Object.entries` 铺屏(L526-544)意味着后端加任何字段都会未经翻译直出 UI——若是有意的证据透传应加注释声明契约。

**维护难度 6/10** 纯函数风格好读,但有几处实际语义坑:`formatNumber`(L586-590)把 `null ?? 0` 强转成 `0`,导致"缺失/未返回"和"真实为 0"在**验收审计页**上不可区分(页 A 同名函数返回 `'--'`,两页行为还不一致);`acceptedWarningForPanel(panel, domain)` 在模板里同一 panel 连调 3 次(L293、L301、L302),应在 v-for 里用中间变量或 computed map;L433 遗留 `console.error`。四个硬编码渐变 hex 前文已述。与页 A 共享的 `statusTone`/`formatNumber`/`formatStepIds` 家族在 6+ 页重复,亟需 `utils/adminFormat.ts` 收编。

**均分: 5.9**

---

补充(两页共性):① `formatNumber` 空值语义两页相反(`'--'` vs `'0'`),建议以页 A 语义统一;② 两页均未复用 `AppPagination.vue`/`AdminTableShell.vue` 等既有组件;③ `ApiResponse` 信封类型至少在 3 个 operations 页重复声明,应上提至 `types/admin-table.ts` 或新建共享类型;④ 筛选状态不进路由 query 是 operations 目录的普遍缺陷,值得做一个 `useRouteSyncedFilters` composable 一次性解决。
